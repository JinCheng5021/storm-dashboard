import { SheetSchemaError } from "../errors/sheet-schema.error.js";

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);

  console.error(`[${new Date().toISOString()}]`, error);

  if (error instanceof SheetSchemaError) {
    return response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        sheet: error.sheet,
        missingColumns: error.missingColumns,
        detectedColumns: error.detectedColumns,
        suggestions: error.suggestions
      }
    });
  }

  return response.status(502).json({
    success: false,
    error: {
      code: "GOOGLE_SHEET_FETCH_FAILED",
      message: error.message || "Không tải được dữ liệu Google Sheet"
    }
  });
}
