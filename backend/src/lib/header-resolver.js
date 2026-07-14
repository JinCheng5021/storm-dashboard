import { SheetSchemaError } from "../errors/sheet-schema.error.js";

export function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi-VN");
}

function levenshtein(left, right) {
  const a = normalizeHeader(left);
  const b = normalizeHeader(right);
  const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);
  for (let column = 0; column <= a.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= b.length; row += 1) {
    for (let column = 1; column <= a.length; column += 1) {
      matrix[row][column] = b[row - 1] === a[column - 1]
        ? matrix[row - 1][column - 1]
        : Math.min(matrix[row - 1][column - 1], matrix[row][column - 1], matrix[row - 1][column]) + 1;
    }
  }
  return matrix[b.length][a.length];
}

function findSuggestion(expected, detectedColumns) {
  const candidates = detectedColumns
    .filter(Boolean)
    .map((column) => ({ column, distance: levenshtein(expected, column) }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (!best || best.distance > Math.max(2, Math.floor(normalizeHeader(expected).length * 0.3))) return null;
  return `Có phải bạn muốn dùng cột "${best.column}" thay cho "${expected}"?`;
}

function headerAliases(schema) {
  return new Set(Object.values(schema.fields).flatMap((field) => field.headers.map(normalizeHeader)));
}

function detectHeaderRow(rows, schema) {
  const aliases = headerAliases(schema);
  const scanLimit = Math.min(rows.length, schema.scanRows || 10);
  let best = { index: -1, score: 0 };

  for (let index = 0; index < scanLimit; index += 1) {
    const score = rows[index].reduce((total, cell) => total + (aliases.has(normalizeHeader(cell)) ? 1 : 0), 0);
    if (score > best.score) best = { index, score };
  }

  return best.score >= (schema.minHeaderMatches || 3) ? best.index : -1;
}

function buildFallbackResolver(sheet, rows, schema) {
  const indexes = {};
  const missingColumns = [];

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    if (Number.isInteger(field.fallbackIndex)) indexes[fieldName] = field.fallbackIndex;
    else if (field.required !== false) missingColumns.push(field.headers[0]);
  }

  if (missingColumns.length) {
    throw new SheetSchemaError({ sheet, missingColumns, detectedColumns: rows[0] || [] });
  }

  return {
    headerRowIndex: -1,
    dataStartIndex: 0,
    detectedColumns: [],
    warnings: [`Tab ${sheet} chưa có hàng tiêu đề hợp lệ; backend đang dùng vị trí cột cũ.`],
    get(row, fieldName) {
      const index = indexes[fieldName];
      return Number.isInteger(index) ? String(row[index] || "").trim() : "";
    }
  };
}

export function createHeaderResolver(sheet, rows, schema) {
  const headerRowIndex = detectHeaderRow(rows, schema);
  if (headerRowIndex < 0) {
    if (schema.allowPositionalFallback) return buildFallbackResolver(sheet, rows, schema);
    throw new SheetSchemaError({
      sheet,
      missingColumns: Object.values(schema.fields).filter((field) => field.required !== false).map((field) => field.headers[0]),
      detectedColumns: rows[0] || []
    });
  }

  const header = rows[headerRowIndex];
  const normalized = header.map(normalizeHeader);
  const indexes = {};
  const missingColumns = [];

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const aliases = new Set(field.headers.map(normalizeHeader));
    const matches = normalized
      .map((column, index) => (aliases.has(column) ? index : -1))
      .filter((index) => index >= 0);
    const index = matches[(field.occurrence || 1) - 1];

    if (Number.isInteger(index)) indexes[fieldName] = index;
    else if (field.required !== false) missingColumns.push(field.headers[0]);
  }

  const detectedColumns = header.filter((column) => String(column || "").trim());
  if (missingColumns.length) {
    throw new SheetSchemaError({
      sheet,
      missingColumns,
      detectedColumns,
      suggestions: missingColumns.map((column) => findSuggestion(column, detectedColumns)).filter(Boolean)
    });
  }

  return {
    headerRowIndex,
    dataStartIndex: headerRowIndex + 1,
    detectedColumns,
    warnings: [],
    get(row, fieldName) {
      const index = indexes[fieldName];
      return Number.isInteger(index) ? String(row[index] || "").trim() : "";
    }
  };
}
