import { ProxyAgent } from "undici";
import { SHEET_ID } from "../config/sheets.config.js";
import { parseCsv } from "../lib/csv.js";

const timeoutMs = Number(process.env.GOOGLE_SHEET_TIMEOUT_MS || 20000);
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

export async function fetchSheet(sheet) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export`);
  url.searchParams.set("format", "csv");
  url.searchParams.set("gid", sheet.gid);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      ...(proxyAgent ? { dispatcher: proxyAgent } : {})
    });
    if (!response.ok) throw new Error(`Google Sheet trả mã HTTP ${response.status}`);
    return parseCsv(await response.text());
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? `Quá thời gian tải Google Sheet (${timeoutMs}ms)`
      : error.message;
    throw new Error(`Không tải được tab ${sheet.name}: ${message}`, { cause: error });
  }
}
