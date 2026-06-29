/**
 * Dependency-free CSV parser. More robust than a naive `split(',')`:
 *  - handles quoted fields containing commas, newlines, and escaped quotes ("")
 *  - trims a trailing newline and ignores fully-blank lines
 *  - returns headers + row records keyed by header
 */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** Raw cell matrix (header row excluded), useful for preview tables. */
  matrix: string[][];
}

/** Tokenize one CSV document into a matrix of rows × cells (RFC-4180-ish). */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\r') {
      // swallow; handle on \n
    } else if (ch === '\n') {
      pushRow();
    } else {
      field += ch;
    }
  }
  // flush trailing field/row if any content present
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export function parseCsv(text: string): ParsedCsv {
  const matrix = tokenize(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (matrix.length === 0) return { headers: [], rows: [], matrix: [] };
  const headers = matrix[0].map((h) => h.trim());
  const body = matrix.slice(1);
  const rows = body.map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? '').trim();
    });
    return rec;
  });
  return { headers, rows, matrix: body };
}
