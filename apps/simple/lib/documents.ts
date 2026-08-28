/**
 * Any medical document that is not a lab sheet: an imaging report, a discharge
 * letter, a specialist note, a DEXA, an ECG, a sleep study, a stool test.
 *
 * One `generateObject` call with a strict schema turns the text into items,
 * every item carries the excerpt it came from and lands `proposed`. Nothing
 * enters inference until the user accepts it, and accepting is the only place
 * that writes a reading, a fact, an evidence row or a life event.
 *
 * `docxText`, `toItems` and `documentLines` are pure. The rest read or write.
 */
import { inflateRawSync } from "node:zlib";
import { generateObject } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  documentItems,
  getDb,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  lifeEvents,
  metrics,
  profileFacts,
  readings,
  uploads,
  type DocMeta,
  type DocumentItem,
} from "@/db";
import { localDay } from "./daily";
import { model } from "./extract";
import { extractTextFromPdf } from "./pdf";
import { convert } from "./units";

/* ── the text ─────────────────────────────────────────────────────────── */

const OCR_MODEL = process.env.AI_OCR_MODEL ?? "google/gemini-2.5-flash";

/** Below this many characters a PDF is a scan and the text layer is noise. */
const MIN_TEXT_LENGTH = 50;

const u32 = (b: Buffer, at: number) => b.readUInt32LE(at);
const u16 = (b: Buffer, at: number) => b.readUInt16LE(at);

/**
 * `word/document.xml` out of a .docx, with no dependency: a docx is a zip, a
 * zip is a central directory of entries, and the only two storage methods Word
 * emits are stored (0) and deflate (8), which `node:zlib` already inflates.
 */
export function docxText(buffer: Buffer): string {
  // The end-of-central-directory record is the last 22+ bytes; the comment
  // field is almost always empty, so scan back from the end for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 65558; i--)
    if (u32(buffer, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd === -1) throw new Error("not a zip file");

  const count = u16(buffer, eocd + 10);
  let at = u32(buffer, eocd + 16);
  for (let i = 0; i < count; i++) {
    if (u32(buffer, at) !== 0x02014b50) throw new Error("bad zip directory");
    const method = u16(buffer, at + 10);
    const compressed = u32(buffer, at + 20);
    const nameLen = u16(buffer, at + 28);
    const extraLen = u16(buffer, at + 30);
    const commentLen = u16(buffer, at + 32);
    const localAt = u32(buffer, at + 42);
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (name !== "word/document.xml") continue;

    // The local header repeats the name and extra fields with its own lengths.
    const dataAt =
      localAt + 30 + u16(buffer, localAt + 26) + u16(buffer, localAt + 28);
    const raw = buffer.subarray(dataAt, dataAt + compressed);
    const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
    return docxXmlToText(xml);
  }
  throw new Error("no word/document.xml in this file");
}

/** WordprocessingML into plain text: paragraphs are lines, tabs are tabs. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isImage = (name: string) => /\.(jpe?g|png|webp|gif|heic)$/i.test(name);

/** One OCR call: transcribe, do not interpret. */
async function ocr(buffer: Buffer, fileName: string): Promise<string> {
  const mime = isImage(fileName)
    ? `image/${fileName.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}`
    : "application/pdf";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${buffer.toString("base64")}`,
              },
            },
            {
              type: "text",
              text: "Transcribe this medical document verbatim as plain text. Keep every heading, date, number and unit. Do not summarise and do not interpret.",
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`ocr_failed: ${data.error.message ?? ""}`);
  return data.choices[0].message.content as string;
}

/** Whatever this file is, as text, plus the page count when there is one. */
export async function readDocumentText(
  buffer: Buffer,
  fileName: string,
): Promise<{ text: string; pages: number | null }> {
  if (/\.docx$/i.test(fileName)) return { text: docxText(buffer), pages: null };
  if (isImage(fileName))
    return { text: await ocr(buffer, fileName), pages: null };
  if (/\.pdf$/i.test(fileName)) {
    const { text, pages } = await extractTextFromPdf(buffer);
    if (text.trim().length >= MIN_TEXT_LENGTH) return { text, pages };
    return { text: await ocr(buffer, fileName), pages };
  }
  return { text: buffer.toString("utf8"), pages: null };
}

/* ── the extraction ───────────────────────────────────────────────────── */

export const DOC_TYPES = [
  "imaging",
  "discharge",
  "specialist_note",
  "dexa",
  "ecg",
  "sleep_study",
  "stool_test",
  "pathology",
  "prescription",
  "other",
] as const;

const excerpt = z
  .string()
  .describe("the verbatim sentence from the document this came from");

export const documentSchema = z.object({
  docType: z.enum(DOC_TYPES),
  date: z.string().optional(),
  institution: z.string().optional(),
  specialty: z.string().optional(),
  findings: z.array(
    z.object({
      text: z.string(),
      excerpt,
      polarity: z.enum(["abnormal", "normal", "unclear"]),
      bodySystem: z.string().optional(),
      confidence: z.number(),
    }),
  ),
  measurements: z.array(
    z.object({
      name: z.string(),
      value: z.number(),
      unit: z.string().optional(),
      refLow: z.number().optional(),
      refHigh: z.number().optional(),
      excerpt,
      metricCodeGuess: z.string().optional(),
    }),
  ),
  diagnoses: z.array(
    z.object({
      text: z.string(),
      icd10: z.string().optional(),
      mondoGuess: z
        .string()
        .optional()
        .describe(
          "the MONDO id from the KNOWN CONDITIONS list when this diagnosis is one of them, copied exactly; omitted otherwise",
        ),
      status: z.enum(["confirmed", "suspected", "ruled_out", "history"]),
      excerpt,
    }),
  ),
  medications: z.array(
    z.object({
      name: z.string(),
      dose: z.string().optional(),
      schedule: z.string().optional(),
      excerpt,
    }),
  ),
  recommendations: z.array(z.object({ text: z.string(), excerpt })),
  events: z.array(
    z.object({ text: z.string(), date: z.string().optional(), excerpt }),
  ),
});

export type DocumentExtract = z.infer<typeof documentSchema>;

export const documentPrompt = `You are reading one medical document that is not a routine blood-test sheet.

RULES:
1. Every item you output must carry \`excerpt\`: the verbatim sentence or line from the document it came from. Never paraphrase the excerpt.
2. Output item text in standard English regardless of the document's language; keep the excerpt in the original language.
3. Extract only what the document says. Never infer a diagnosis the document does not state, and never add a normal finding the document does not mention.
4. \`measurements\` are numbers with units the document reports (ejection fraction, T-score, AHI, plaque thickness, prostate volume). Set \`metricCodeGuess\` to a lower_snake_case guess of the standard metric code, or leave it out.
5. \`diagnoses.status\`: confirmed when the document asserts it, suspected when it is queried or "probable", ruled_out when the document excludes it, history when it is listed as past. Always set \`mondoGuess\` to the MONDO id of the disease when you know it (for example MONDO:0013209 for fatty liver disease, MONDO:0005044 for essential hypertension, MONDO:0005148 for type 2 diabetes); leave it out only when you do not.
6. \`events\` are surgeries, hospitalisations, procedures and major illnesses with a date when one is given.
7. \`findings.polarity\`: abnormal when the document calls it abnormal, normal when it is explicitly normal, unclear otherwise. \`confidence\` is 0..1, how sure you are of your reading of the text.
8. Do not repeat the same fact as a finding and a diagnosis. Prefer the diagnosis.`;

/**
 * The catalog conditions, so a stated diagnosis can name one. Same trick as
 * `metricCatalogPrompt` in lib/extract.ts: the join happens in the model, and
 * `matchCondition` only has to check the answer.
 */
export function conditionCatalogPrompt(
  conditions: { name: string; mondoId: string | null }[],
): string {
  const list = conditions
    .filter((c) => c.mondoId)
    .map((c) => `${c.mondoId} | ${c.name}`)
    .join("\n");
  return `\n\nKNOWN CONDITIONS (MONDO id | name):\n${list}\n\nWhen a diagnosis in the document is one of these, set \`mondoGuess\` to its MONDO id exactly as written above. When it is not, leave \`mondoGuess\` out.`;
}

/** One model call. The only non-pure part of the document path. */
export async function extractDocument(
  text: string,
  conditions: { name: string; mondoId: string | null }[] = [],
): Promise<DocumentExtract> {
  const { object } = await generateObject({
    model: model(),
    schema: documentSchema,
    // A long discharge letter with every excerpt quoted runs past the default
    // output budget, and a truncated object is a failed extraction.
    maxOutputTokens: 16000,
    system:
      documentPrompt +
      (conditions.length ? conditionCatalogPrompt(conditions) : ""),
    prompt: text.slice(0, 30000),
  });
  return object;
}

/* ── the items ────────────────────────────────────────────────────────── */

export interface NewItem {
  kind:
    | "finding"
    | "measurement"
    | "diagnosis"
    | "medication"
    | "recommendation"
    | "event";
  payload: Record<string, unknown>;
  excerpt: string;
}

/**
 * The extraction into rows. The only judgement here: a `metricCodeGuess` the
 * catalog has never heard of is dropped, so the item is still proposed but
 * carries no code and can never mint a metric behind the user's back.
 */
export function toItems(
  doc: DocumentExtract,
  knownCodes: Set<string>,
): NewItem[] {
  const out: NewItem[] = [];
  for (const f of doc.findings)
    out.push({ kind: "finding", payload: { ...f }, excerpt: f.excerpt });
  for (const m of doc.measurements) {
    const guess = m.metricCodeGuess?.trim().toLowerCase();
    out.push({
      kind: "measurement",
      payload: {
        ...m,
        metricCodeGuess: guess ?? null,
        code: guess && knownCodes.has(guess) ? guess : null,
      },
      excerpt: m.excerpt,
    });
  }
  for (const d of doc.diagnoses)
    out.push({ kind: "diagnosis", payload: { ...d }, excerpt: d.excerpt });
  for (const m of doc.medications)
    out.push({ kind: "medication", payload: { ...m }, excerpt: m.excerpt });
  for (const r of doc.recommendations)
    out.push({ kind: "recommendation", payload: { ...r }, excerpt: r.excerpt });
  for (const e of doc.events)
    out.push({ kind: "event", payload: { ...e }, excerpt: e.excerpt });
  return out;
}

export const docMetaOf = (doc: DocumentExtract): DocMeta => ({
  docType: doc.docType,
  date: doc.date,
  institution: doc.institution,
  specialty: doc.specialty,
});

/** Parse, store, and leave everything `proposed`. */
export async function saveDocument(
  userId: string,
  uploadId: string,
  text: string,
): Promise<{ items: number; doc: DocumentExtract }> {
  const db = getDb();
  const conditions = await db
    .select({ name: hkbConditions.name, mondoId: hkbConditions.mondoId })
    .from(hkbConditions);
  const doc = await extractDocument(text, conditions);
  const known = new Set(
    (await db.select({ code: metrics.code }).from(metrics)).map((m) => m.code),
  );
  const items = toItems(doc, known);
  if (items.length)
    await db
      .insert(documentItems)
      .values(items.map((i) => ({ ...i, userId, uploadId })));
  await db
    .update(uploads)
    .set({ docMeta: docMetaOf(doc) })
    .where(eq(uploads.id, uploadId));
  return { items: items.length, doc };
}

/* ── accepting ────────────────────────────────────────────────────────── */

/**
 * What a stated diagnosis is worth as evidence. A ruled-out diagnosis is the
 * strongest thing a document can say, which is why it is an LR below 1 rather
 * than a missing row.
 */
export const LR_FOR_STATUS: Record<string, number> = {
  confirmed: 20,
  history: 20,
  suspected: 3,
  ruled_out: 0.1,
};

/**
 * What the evidence rule matches on. `holds` lowercases the fact text and asks
 * for a substring, so the needle has to be the diagnosis exactly as it was
 * written into the `conditions` fact: lowercased and nothing else. Stripping
 * the hyphen out of "non-alcoholic" here would stop the rule ever firing.
 */
export const conditionIncludes = (text: string) => text.trim().toLowerCase();

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The catalog condition a diagnosis names, by MONDO id or by name. */
export function matchCondition(
  payload: { text?: string; mondoGuess?: string },
  conditions: { id: string; name: string; mondoId: string | null }[],
): string | null {
  const mondo = payload.mondoGuess?.trim().toUpperCase();
  if (mondo) {
    const hit = conditions.find((c) => c.mondoId?.toUpperCase() === mondo);
    if (hit) return hit.id;
  }
  const text = norm(payload.text ?? "");
  if (!text) return null;
  const byName = conditions.find(
    (c) => norm(c.name) === text || text.includes(norm(c.name)),
  );
  return byName?.id ?? null;
}

/** Append one value to a list fact without losing what is already there. */
async function appendListFact(userId: string, key: string, value: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(profileFacts)
    .where(and(eq(profileFacts.userId, userId), eq(profileFacts.key, key)))
    .limit(1);
  const current = Array.isArray(row?.value)
    ? (row!.value as string[])
    : row?.value
      ? [String(row.value)]
      : [];
  if (current.some((v) => norm(v) === norm(value))) return;
  const next = [...current, value];
  await db
    .insert(profileFacts)
    .values({ userId, key, value: next, source: "document" })
    .onConflictDoUpdate({
      target: [profileFacts.userId, profileFacts.key],
      set: { value: next, source: "document", answeredAt: new Date() },
    });
}

export interface AcceptResult {
  accepted: number;
  readings: number;
  facts: number;
  evidence: string[];
  events: number;
}

/**
 * Accept items. A measurement with a catalog code becomes a reading, a
 * diagnosis becomes a `conditions` fact plus a fixed evidence row, a
 * medication becomes a `medications` fact, an event becomes a life event, and
 * a finding or a recommendation is text the context pack reads. Everything
 * else about the item is left alone, so the audit trail survives.
 */
export async function acceptItems(
  userId: string,
  rows: DocumentItem[],
  source: string,
  meta: DocMeta | null,
): Promise<AcceptResult> {
  const db = getDb();
  const out: AcceptResult = {
    accepted: 0,
    readings: 0,
    facts: 0,
    evidence: [],
    events: 0,
  };
  if (!rows.length) return out;

  const conditions = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      mondoId: hkbConditions.mondoId,
    })
    .from(hkbConditions);
  const known = await db.select().from(metrics);

  for (const item of rows) {
    const p = item.payload as Record<string, any>;
    if (item.kind === "measurement" && p.code) {
      const metric = known.find((m) => m.code === p.code);
      const value =
        metric?.unit && p.unit
          ? (convert(p.value, p.unit, metric.unit, p.code) ?? p.value)
          : p.value;
      await db.insert(readings).values({
        userId,
        uploadId: item.uploadId,
        metricCode: p.code,
        value,
        valueText: String(p.value),
        unit: metric?.unit ?? p.unit ?? null,
        refLow: p.refLow ?? null,
        refHigh: p.refHigh ?? null,
        observedAt: p.date ?? meta?.date ?? localDay(),
        flags: ["from_document"],
      });
      out.readings++;
    }

    if (item.kind === "diagnosis") {
      const label = `${p.text}${p.status && p.status !== "confirmed" ? ` (${p.status})` : ""}`;
      await appendListFact(userId, "conditions", label);
      out.facts++;
      const conditionId = matchCondition(p, conditions);
      const lr = LR_FOR_STATUS[p.status ?? "confirmed"];
      if (conditionId && lr != null) {
        // The rule reads the `conditions` fact, so the feature has to exist.
        await db
          .insert(hkbFeatures)
          .values({
            id: "fact:conditions",
            kind: "fact",
            name: "Conditions",
            unit: null,
            howTo: "What have you been diagnosed with?",
          })
          .onConflictDoNothing();
        const id = `doc:${conditionId}`;
        await db
          .insert(hkbEvidence)
          .values({
            id,
            conditionId,
            featureId: "fact:conditions",
            conditionOn: { includes: conditionIncludes(String(p.text)) },
            lrPos: lr,
            lrNeg: null,
            grade: "B",
            source: `Stated in an uploaded document: ${source}${meta?.date ? `, ${meta.date}` : ""}. "${item.excerpt ?? p.text}"`,
            population: null,
            confoundedBy: null,
            status: "accepted",
          })
          .onConflictDoUpdate({
            target: hkbEvidence.id,
            set: {
              conditionOn: { includes: conditionIncludes(String(p.text)) },
              lrPos: lr,
              status: "accepted",
            },
          });
        out.evidence.push(id);
      }
    }

    if (item.kind === "medication") {
      await appendListFact(
        userId,
        "medications",
        [p.name, p.dose, p.schedule].filter(Boolean).join(" "),
      );
      out.facts++;
    }

    if (item.kind === "event") {
      await db.insert(lifeEvents).values({
        userId,
        kind: "document",
        text: String(p.text),
        startedAt: p.date ?? meta?.date ?? null,
        endedAt: null,
        source,
        uploadId: item.uploadId,
      });
      out.events++;
    }

    out.accepted++;
  }

  await db
    .update(documentItems)
    .set({ status: "accepted" })
    .where(
      inArray(
        documentItems.id,
        rows.map((r) => r.id),
      ),
    );
  return out;
}

/* ── the context pack ─────────────────────────────────────────────────── */

export interface DocumentSummary {
  date: string | null;
  docType: string;
  fileName: string | null;
  diagnoses: string[];
  findings: string[];
}

/** The last five documents, with what the user accepted out of each. */
export async function documentSummaries(
  userId: string,
  limit = 5,
): Promise<DocumentSummary[]> {
  const db = getDb();
  const docs = await db
    .select({
      id: uploads.id,
      fileName: uploads.fileName,
      createdAt: uploads.createdAt,
      docMeta: uploads.docMeta,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        eq(uploads.kind, "document"),
        eq(uploads.status, "done"),
      ),
    )
    .orderBy(desc(uploads.createdAt))
    .limit(limit);
  if (!docs.length) return [];

  const items = await db
    .select()
    .from(documentItems)
    .where(
      and(
        eq(documentItems.userId, userId),
        eq(documentItems.status, "accepted"),
        inArray(
          documentItems.uploadId,
          docs.map((d) => d.id),
        ),
      ),
    );

  return docs.map((d) => {
    const mine = items.filter((i) => i.uploadId === d.id);
    return {
      date: d.docMeta?.date ?? d.createdAt?.toISOString().slice(0, 10) ?? null,
      docType: d.docMeta?.docType ?? "other",
      fileName: d.fileName,
      diagnoses: mine
        .filter((i) => i.kind === "diagnosis")
        .map((i) => {
          const p = i.payload as Record<string, any>;
          return `${p.text} (${p.status})`;
        }),
      findings: mine
        .filter(
          (i) =>
            i.kind === "finding" &&
            (i.payload as Record<string, any>).polarity === "abnormal",
        )
        .map((i) => String((i.payload as Record<string, any>).text)),
    };
  });
}

/** The DOCUMENTS section of the context pack. Short on purpose. */
export function documentLines(docs: DocumentSummary[]): string {
  if (!docs.length) return "- no documents uploaded";
  return docs
    .map((d) => {
      const bits = [
        ...d.diagnoses.map((x) => `dx: ${x}`),
        ...d.findings.slice(0, 3).map((x) => `abnormal: ${x}`),
      ];
      return `- ${d.date ?? "undated"} ${d.docType}: ${bits.join("; ") || "nothing accepted yet"}`;
    })
    .join("\n");
}
