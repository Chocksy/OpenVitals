interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Extract text from a PDF buffer, preserving tabular layout. Returns the page
 * count too, because the uploads list shows it.
 *
 * pdfjs gives us individual text items with x/y coordinates. We sort them
 * into rows (by Y position) and columns (by X position), inserting tab
 * characters between columns so the AI can correctly associate values
 * with their column headers in table-based documents like lab trend reports.
 */
export async function extractTextFromPdf(
  buffer: Buffer,
): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // ponytail: hand pdf.js the worker module instead of a path to it. In Node
  // pdf.js runs the worker on the main thread and takes it from
  // `globalThis.pdfjsWorker` when it is there. Resolving a *path* breaks inside
  // the Next server bundle, where `import.meta.url` is "[project]/...", and the
  // upload then falls through to OCR.
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as TextItem[];

    if (items.length === 0) {
      text += "\n";
      continue;
    }

    // Group items into rows by Y coordinate (transform[5]).
    // Items within a small vertical threshold are on the same row.
    const ROW_THRESHOLD = 3; // points
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];

    for (const item of items) {
      if (!item.str.trim() && !item.str.includes(" ")) continue;
      const x = item.transform[4]!;
      const y = item.transform[5]!;

      let row = rows.find((r) => Math.abs(r.y - y) < ROW_THRESHOLD);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str: item.str });
    }

    // Sort rows top-to-bottom (higher Y = higher on page in PDF coords)
    rows.sort((a, b) => b.y - a.y);

    for (const row of rows) {
      // Sort items left-to-right within each row
      row.items.sort((a, b) => a.x - b.x);

      // Insert tab separators when there's a significant horizontal gap
      let line = "";
      let prevEnd = -Infinity;
      for (const item of row.items) {
        const gap = item.x - prevEnd;
        if (prevEnd > -Infinity && gap > 15) {
          line += "\t";
        } else if (prevEnd > -Infinity && gap > 2) {
          line += " ";
        }
        line += item.str;
        // Estimate end position: x + approximate character width
        prevEnd = item.x + item.str.length * 5;
      }
      text += line + "\n";
    }

    text += "\n";
  }

  const pages = doc.numPages;
  doc.destroy();
  return { text, pages };
}
