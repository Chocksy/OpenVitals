import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  conditionIncludes,
  docxText,
  docxXmlToText,
  documentLines,
  LR_FOR_STATUS,
  matchCondition,
  toItems,
  type DocumentExtract,
} from "./documents";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "evals", "fixtures", "documents", name));

const doc = (patch: Partial<DocumentExtract> = {}): DocumentExtract => ({
  docType: "discharge",
  date: "2025-03-07",
  institution: "Spitalul Clinic Judetean",
  specialty: "internal medicine",
  findings: [],
  measurements: [],
  diagnoses: [],
  medications: [],
  recommendations: [],
  events: [],
  ...patch,
});

describe("docxText", () => {
  it("reads word/document.xml out of a real .docx with no dependency", () => {
    const text = docxText(fixture("echo_report.docx"));
    expect(text).toContain("Cardiology");
    expect(text).toContain("Left ventricular ejection fraction 58 %.");
    expect(text).toContain("Conclusion: preserved systolic function.");
  });

  it("turns paragraphs into lines and unescapes entities", () => {
    expect(
      docxXmlToText(
        "<w:p><w:r><w:t>a &amp; b</w:t></w:r></w:p><w:p><w:r><w:t>c</w:t></w:r></w:p>",
      ),
    ).toBe("a & b\nc");
  });

  it("refuses a file that is not a zip", () => {
    expect(() => docxText(Buffer.from("plain text, not a zip"))).toThrow();
  });
});

describe("toItems", () => {
  const known = new Set(["alt", "hba1c"]);

  it("keeps a measurement whose metricCodeGuess is not in the catalog, with no code", () => {
    const [item] = toItems(
      doc({
        measurements: [
          {
            name: "Ejection fraction",
            value: 58,
            unit: "%",
            excerpt: "LVEF 58 %.",
            metricCodeGuess: "ejection_fraction",
          },
        ],
      }),
      known,
    );
    expect(item!.kind).toBe("measurement");
    expect(item!.payload.code).toBeNull();
    expect(item!.payload.metricCodeGuess).toBe("ejection_fraction");
    expect(item!.excerpt).toBe("LVEF 58 %.");
  });

  it("keeps the code when the catalog knows it", () => {
    const [item] = toItems(
      doc({
        measurements: [
          {
            name: "ALT",
            value: 61,
            unit: "U/L",
            excerpt: "ALT 61 U/L.",
            metricCodeGuess: "ALT",
          },
        ],
      }),
      known,
    );
    expect(item!.payload.code).toBe("alt");
  });

  it("carries every kind through with its excerpt", () => {
    const items = toItems(
      doc({
        findings: [
          {
            text: "Hepatic steatosis grade 2",
            excerpt: "hepatic steatosis, grade 2",
            polarity: "abnormal",
            confidence: 0.9,
          },
        ],
        diagnoses: [
          {
            text: "Cholelithiasis",
            status: "ruled_out",
            excerpt: "no stones on ultrasound",
          },
        ],
        medications: [
          { name: "Perindopril", dose: "5 mg", excerpt: "Perindopril 5 mg" },
        ],
        recommendations: [
          {
            text: "Repeat ALT in six months",
            excerpt: "Repeat ... ALT in six months",
          },
        ],
        events: [
          {
            text: "Appendicectomy",
            date: "2011",
            excerpt: "Appendicectomy in 2011",
          },
        ],
      }),
      known,
    );
    expect(items.map((i) => i.kind)).toEqual([
      "finding",
      "diagnosis",
      "medication",
      "recommendation",
      "event",
    ]);
    expect(items.every((i) => i.excerpt.length > 0)).toBe(true);
  });
});

describe("what a diagnosis is worth", () => {
  it("gives a ruled-out diagnosis an LR of 0.1", () => {
    expect(LR_FOR_STATUS.ruled_out).toBe(0.1);
  });

  it("gives confirmed 20 and suspected 3", () => {
    expect(LR_FOR_STATUS.confirmed).toBe(20);
    expect(LR_FOR_STATUS.suspected).toBe(3);
  });
});

const conditions = [
  { id: "nafld", name: "NAFLD (fatty liver)", mondoId: "MONDO:0013209" },
  { id: "hypertension", name: "Hypertension", mondoId: "MONDO:0005044" },
];

describe("conditionIncludes", () => {
  it("keeps the punctuation, because the fact text keeps it too", () => {
    expect(conditionIncludes("Non-alcoholic fatty liver disease")).toBe(
      "non-alcoholic fatty liver disease",
    );
    expect(
      "Non-alcoholic fatty liver disease"
        .toLowerCase()
        .includes(conditionIncludes("Non-alcoholic fatty liver disease")),
    ).toBe(true);
  });
});

describe("matchCondition", () => {
  it("matches on the MONDO id first", () => {
    expect(
      matchCondition(
        { text: "raised blood pressure", mondoGuess: "MONDO:0005044" },
        conditions,
      ),
    ).toBe("hypertension");
  });

  it("matches on the name when there is no MONDO id", () => {
    expect(matchCondition({ text: "Essential hypertension" }, conditions)).toBe(
      "hypertension",
    );
  });

  it("returns null for a diagnosis the catalog does not carry", () => {
    expect(
      matchCondition({ text: "Plantar fasciitis" }, conditions),
    ).toBeNull();
  });
});

describe("documentLines", () => {
  it("says so when nothing has been uploaded", () => {
    expect(documentLines([])).toBe("- no documents uploaded");
  });

  it("prints the date, the type, the accepted diagnoses and the abnormal findings", () => {
    expect(
      documentLines([
        {
          date: "2025-03-07",
          docType: "discharge",
          fileName: "note.txt",
          diagnoses: ["NAFLD (confirmed)"],
          findings: ["Hepatic steatosis grade 2"],
        },
      ]),
    ).toBe(
      "- 2025-03-07 discharge: dx: NAFLD (confirmed); abnormal: Hepatic steatosis grade 2",
    );
  });
});
