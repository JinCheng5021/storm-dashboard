export class SheetSchemaError extends Error {
  constructor({ sheet, missingColumns, detectedColumns, suggestions = [] }) {
    super(`Tab ${sheet} thiếu cột bắt buộc: ${missingColumns.join(", ")}`);
    this.name = "SheetSchemaError";
    this.code = "SHEET_SCHEMA_INVALID";
    this.statusCode = 422;
    this.sheet = sheet;
    this.missingColumns = missingColumns;
    this.detectedColumns = detectedColumns;
    this.suggestions = suggestions;
  }
}
