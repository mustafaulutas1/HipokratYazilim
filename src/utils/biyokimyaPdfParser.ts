// Parses "AHENK LABORATUVARI" biyokimya/lab-report PDFs into structured test results.
// The report is a fixed table format (Test | Sonuç | Birim | Referans Aralığı | Yöntem | Önceki Sonuçlar)
// repeated across up to 5 panels: Biyokimya, Hormon, Hematoloji, İdrar, Elektroforez.
//
// This module has no pdf.js dependency on purpose — it operates on plain row strings
// (already reconstructed from a PDF's text layer) so the parsing logic can be unit
// tested without a browser/worker context. See biyokimyaPdfExtract.ts for the pdf.js
// text-extraction step that produces those row strings.

export type LabFlag = 'normal' | 'high' | 'low' | 'critical_high' | 'critical_low';

export interface LabTestResult {
  section: string;
  testName: string;
  rawValue: string;
  numericValue: number | null;
  unit: string;
  referenceRange: string;
  // Firestore rejects `undefined` field values, so this is always a string (possibly empty) rather than optional.
  method: string;
  flag: LabFlag;
}

export type LabParseResult =
  | { valid: true; reportDate: string; tests: LabTestResult[] }
  | { valid: false; error: string };

const SECTION_KEYWORDS: Array<{ match: string; label: string }> = [
  { match: 'biyokim', label: 'Biyokimya' },
  { match: 'hormon', label: 'Hormon' },
  { match: 'hematoloji', label: 'Hematoloji' },
  { match: 'drar', label: 'İdrar' }, // covers "İdrar" regardless of İ/I encoding quirks
  { match: 'elektroforez', label: 'Elektroforez' },
];

const HEADER_NOISE_SUBSTRINGS = [
  'AHENK LABORATUVAR', 'Tıbbi Laboratuvar Tetkik', 'Laboratuvar Ruhsat',
  'Adı Soyadı', 'Doğum Tarihi', 'Rapor Numarası', 'Numune Kabul Tarihi',
  'Protokol No', 'Barkod No', 'Kimlik No', 'Numune Alma Tarihi',
  'Tetkik İstem Tarihi', 'Numune Türü', 'Kurum', 'Doktor',
  'Uzman Onay Tarihi', 'Rapor Baskı Tarihi', 'Bu raporun tamamı',
  'Merkez:', 'Şube:', 'Şişli', 'Avcılar', 'Kadıköy', 'www.', '@',
  'İşaretli Testler', 'Bu rapordaki klinik', 'Elektronik veya',
  'Doç. Dr.', 'Diploma No', 'Uzmanı', 'Sayfa:',
  'Yüksek Düşük Kritik', 'LB-F56', 'TÜRKAK', '444 89 88', '0212 230',
  'Sonuç', 'Birim', 'Referans Aralığı', 'Yöntem', 'Önceki Sonuçlar',
  'CKD-EPI', 'Sigara iç',
];

const METHOD_CODES = new Set([
  'ENZ', 'COL', 'KIN', 'ISE', 'HES', 'SP', 'FOT', 'TURB', 'ECLIA', 'CLIA', 'CC', 'FC',
]);

const STATUS_WORD_PREFIXES = [
  'Negatif', 'Pozitif', 'Normal', 'Görülmedi', 'Sonuçlanmadı', 'Bkz', 'Açık', 'Var', 'Yok',
];

const VALUE_NUMERIC = /^[↑↓]{0,2}-?\d+([.,]\d+)?$/;
const UNIT_LIKE = /^[A-Za-zµ%°²/.,]+$/;

const isNoiseLine = (line: string): boolean =>
  HEADER_NOISE_SUBSTRINGS.some((s) => line.includes(s));

const matchSection = (line: string): string | null => {
  const lower = line.toLowerCase();
  const found = SECTION_KEYWORDS.find((s) => lower.includes(s.match));
  return found ? found.label : null;
};

const isValueToken = (tok: string): boolean =>
  VALUE_NUMERIC.test(tok) || STATUS_WORD_PREFIXES.some((w) => tok.startsWith(w));

const stripComma = (tok: string): string => tok.replace(/,$/, '');

const parseReportDate = (fullText: string): string | null => {
  const m = fullText.match(/Numune Alma Tarihi\s*:?\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
};

const inferFlagFromRange = (numericValue: number, referenceRange: string): LabFlag => {
  const between = referenceRange.match(/(-?[\d.,]+)\s*-\s*(-?[\d.,]+)/);
  if (between) {
    const low = parseFloat(between[1].replace(',', '.'));
    const high = parseFloat(between[2].replace(',', '.'));
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
      if (numericValue < low) return 'low';
      if (numericValue > high) return 'high';
      return 'normal';
    }
  }
  const upper = referenceRange.match(/^<\s*(-?[\d.,]+)/);
  if (upper) {
    const bound = parseFloat(upper[1].replace(',', '.'));
    if (!Number.isNaN(bound) && numericValue >= bound) return 'high';
  }
  const lower = referenceRange.match(/^>\s*(-?[\d.,]+)/);
  if (lower) {
    const bound = parseFloat(lower[1].replace(',', '.'));
    if (!Number.isNaN(bound) && numericValue <= bound) return 'low';
  }
  return 'normal';
};

const parseRowIntoTest = (row: string, section: string, nameBuffer: string[]): LabTestResult | null => {
  const tokens = row.split(' ').filter(Boolean);
  // A bare number can be part of a test name (e.g. "CA 125"), so an arrow-flagged
  // token — an unambiguous signal for "this is the Sonuç column" — takes priority
  // over the first plain-numeric/status-word token when both are present.
  const arrowIdx = tokens.findIndex((t) => /^[↑↓]/.test(t));
  const valueIdx = arrowIdx !== -1 ? arrowIdx : tokens.findIndex((t) => isValueToken(t));
  if (valueIdx === -1) return null;

  const nameTokens = [...nameBuffer, ...tokens.slice(0, valueIdx)]
    .filter((t) => t !== '*' && !/^\(\d{2}\.\d{2}\.\d{4}\)$/.test(t));
  const testName = nameTokens.join(' ').trim();
  if (!testName) return null;

  const valueTokenRaw = tokens[valueIdx];
  const arrowMatch = valueTokenRaw.match(/^[↑↓]{1,2}/);
  const rawValue = valueTokenRaw.replace(/^[↑↓]{1,2}/, '');
  const isNumericValue = VALUE_NUMERIC.test(valueTokenRaw) && !STATUS_WORD_PREFIXES.some((w) => rawValue.startsWith(w));
  let cursor = valueIdx + 1;

  let unit = '';
  if (isNumericValue && tokens[cursor] && UNIT_LIKE.test(tokens[cursor]) && !METHOD_CODES.has(stripComma(tokens[cursor]))) {
    unit = tokens[cursor];
    cursor += 1;
  }

  const rangeTokens: string[] = [];
  let method = '';
  const methodTokens: string[] = [];
  while (cursor < tokens.length && rangeTokens.length < 5) {
    const tok = tokens[cursor];
    if (METHOD_CODES.has(stripComma(tok))) {
      methodTokens.push(tok);
      cursor += 1;
      // consume any trailing comma-joined method codes, e.g. "ENZ, COL"
      while (cursor < tokens.length && METHOD_CODES.has(stripComma(tokens[cursor]))) {
        methodTokens.push(tokens[cursor]);
        cursor += 1;
      }
      break;
    }
    rangeTokens.push(tok);
    cursor += 1;
  }
  if (methodTokens.length > 0) method = methodTokens.join(' ');
  const referenceRange = rangeTokens.join(' ').trim();

  const numericValue = isNumericValue ? parseFloat(rawValue.replace(',', '.')) : null;

  let flag: LabFlag = 'normal';
  if (arrowMatch) {
    flag = arrowMatch[0] === '↑↑' ? 'critical_high' : arrowMatch[0] === '↓↓' ? 'critical_low' : arrowMatch[0] === '↑' ? 'high' : 'low';
  } else if (numericValue !== null && referenceRange) {
    flag = inferFlagFromRange(numericValue, referenceRange);
  }

  return { section, testName, rawValue, numericValue, unit, referenceRange, method, flag };
};

/** Pure row-string → structured-result logic, testable with plain arrays of row strings. */
export function parseRowsIntoLabResult(rows: string[]): LabParseResult {
  const fullText = rows.join(' ');
  const looksLikeAhenkReport = fullText.includes('AHENK') && fullText.toUpperCase().includes('LABORATUVAR');
  if (!looksLikeAhenkReport) {
    return { valid: false, error: 'Bu dosya tanınan Ahenk Laboratuvarı biyokimya rapor formatına uymuyor. Lütfen orijinal PDF raporunu yükleyin.' };
  }

  const reportDate = parseReportDate(fullText);

  let currentSection = '';
  let nameBuffer: string[] = [];
  const tests: LabTestResult[] = [];

  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;

    const section = matchSection(trimmed);
    if (section) {
      currentSection = section;
      nameBuffer = [];
      continue;
    }

    if (isNoiseLine(trimmed)) {
      continue;
    }

    if (!currentSection) continue; // header/footer boilerplate above the first panel

    const parsed = parseRowIntoTest(trimmed, currentSection, nameBuffer);
    if (!parsed) {
      // No value found on this line yet — could be a wrapped test name; buffer it.
      nameBuffer = [
        ...nameBuffer,
        ...trimmed.split(' ').filter((t) => t !== '*' && !/^\(\d{2}\.\d{2}\.\d{4}\)$/.test(t)),
      ];
      // Safety cap so unrelated noise can't accumulate forever.
      if (nameBuffer.length > 12) nameBuffer = [];
      continue;
    }

    nameBuffer = [];
    if (parsed.rawValue.startsWith('Bkz')) continue; // "see below/report" markers aren't real results
    tests.push(parsed);
  }

  if (tests.length === 0) {
    return { valid: false, error: 'Dosyadan hiçbir test sonucu okunamadı. Lütfen dosyanın orijinal, sıkıştırılmamış rapor PDF\'i olduğundan emin olun.' };
  }

  return { valid: true, reportDate: reportDate || new Date().toISOString().slice(0, 10), tests };
}
