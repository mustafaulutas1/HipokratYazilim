// pdf.js-based text extraction for biyokimya lab report PDFs. Kept separate from
// biyokimyaPdfParser.ts so the row-parsing logic can be unit tested without pdf.js.
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parseRowsIntoLabResult, type LabParseResult } from './biyokimyaPdfParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/** Extract text items from every page, clustered into visual rows (pdf.js gives item positions, not rows). */
async function extractRows(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const rows: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number };
    const items: Item[] = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.trim().length > 0)
      .map((it) => ({ str: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number }));

    // Cluster by y-coordinate (within a small tolerance) to reconstruct table rows.
    const Y_TOLERANCE = 3;
    const lines: Item[][] = [];
    items
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .forEach((item) => {
        const line = lines.find((l) => Math.abs(l[0].y - item.y) <= Y_TOLERANCE);
        if (line) line.push(item);
        else lines.push([item]);
      });

    lines.forEach((line) => {
      const rowText = line
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (rowText) rows.push(rowText);
    });
  }

  return rows;
}

export async function parseLabReportPdf(file: File): Promise<LabParseResult> {
  let rows: string[];
  try {
    rows = await extractRows(file);
  } catch {
    return { valid: false, error: 'PDF dosyası okunamadı. Lütfen dosyanın bozuk olmadığından emin olun.' };
  }
  return parseRowsIntoLabResult(rows);
}
