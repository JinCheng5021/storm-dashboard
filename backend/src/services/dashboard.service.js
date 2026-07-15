import { SHEETS, SHEET_SCHEMAS } from "../config/sheets.config.js";
import { fetchSheet } from "../adapters/google-sheets.adapter.js";
import { createHeaderResolver } from "../lib/header-resolver.js";

const numberValue = (raw) => Number(String(raw || "").replace(/[^\d.-]/g, "")) || 0;

function dateFromTime(text) {
  const raw = String(text || "").trim();
  const match = raw.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
  return match ? match[1] : "-";
}

function resolveSheet(sheets, sheetName) {
  const rows = sheets[sheetName] || [];
  const resolver = createHeaderResolver(sheetName, rows, SHEET_SCHEMAS[sheetName]);
  return { rows: rows.slice(resolver.dataStartIndex), resolver };
}

export function buildDashboardDataFromSheets(sheets) {
  const warnings = [];

  const cableSource = resolveSheet(sheets, "SC ngoại vi");
  warnings.push(...cableSource.resolver.warnings);
  const cableIncidents = cableSource.rows
    .filter((row) => cableSource.resolver.get(row, "code"))
    .map((row, index) => {
      const get = (field) => cableSource.resolver.get(row, field);
      return {
        stt: get("stt") || String(index + 1),
        date: get("date") || dateFromTime(get("startedAt")),
        type: "Ngoại vi",
        code: get("code"),
        circuit: get("circuit"),
        target: get("target"),
        startedAt: get("startedAt"),
        area: get("area"),
        status: get("status"),
        note: [get("cause"), get("note")].filter(Boolean).join(" | "),
        location: get("location"),
        incidentCount: get("incidentCount"),
        processingTime: get("processingTime")
      };
    });

  const stationSource = resolveSheet(sheets, "SC đài trạm");
  warnings.push(...stationSource.resolver.warnings);
  const stationIncidents = stationSource.rows
    .filter((row) => stationSource.resolver.get(row, "code"))
    .map((row, index) => {
      const get = (field) => stationSource.resolver.get(row, field);
      return {
        stt: get("stt") || String(index + 1),
        date: get("date") || dateFromTime(get("startedAt")),
        type: "Đài trạm",
        code: get("code"),
        circuit: get("circuit"),
        target: get("target"),
        startedAt: get("startedAt"),
        area: get("area"),
        status: get("status"),
        note: [get("cause"), get("note"), get("impact")].filter(Boolean).join(" | ")
      };
    });

  const affectedSource = resolveSheet(sheets, "DS tuyến, trạm ảnh hưởng");
  warnings.push(...affectedSource.resolver.warnings);
  const affectedStations = affectedSource.rows
    .filter((row) => affectedSource.resolver.get(row, "station"))
    .map((row) => {
      const get = (field) => affectedSource.resolver.get(row, field);
      return {
        stt: get("stationStt"),
        station: get("station"),
        coordinate: get("coordinate"),
        distance: get("distance"),
        impact: get("stationImpact"),
        staffingPlan: get("staffingPlan"),
        staff: get("staff"),
        branch: "",
        phone: get("phone"),
        note: get("stationNote")
      };
    });

  const affectedRoutes = affectedSource.rows
    .filter((row) => affectedSource.resolver.get(row, "route"))
    .map((row) => {
      const get = (field) => affectedSource.resolver.get(row, field);
      return {
        circuit: get("circuit"),
        route: get("route"),
        length: get("length"),
        impact: get("routeImpact"),
        pops: get("pops")
      };
    });

  const peopleSource = resolveSheet(sheets, "Nhân sự");
  warnings.push(...peopleSource.resolver.warnings);
  const deployments = peopleSource.rows
    .filter((row) => peopleSource.resolver.get(row, "location") && numberValue(peopleSource.resolver.get(row, "count")) > 0)
    .map((row, index) => {
      const get = (field) => peopleSource.resolver.get(row, field);
      return {
        stt: get("deploymentStt") || String(index + 1),
        location: get("location"),
        partner: get("partner"),
        count: numberValue(get("count"))
      };
    });

  const operators = peopleSource.rows
    .filter((row) => peopleSource.resolver.get(row, "name"))
    .map((row, index) => {
      const get = (field) => peopleSource.resolver.get(row, field);
      return {
        stt: get("operatorStt") || String(index + 1),
        name: get("name"),
        phone: get("phone"),
        email: get("email"),
        role: get("role"),
        location: get("operatorLocation"),
        note: get("note")
      };
    });

  const weatherSource = resolveSheet(sheets, "Thời tiết");
  warnings.push(...weatherSource.resolver.warnings);
  const weatherRows = weatherSource.rows
    .filter((row) => weatherSource.resolver.get(row, "area"))
    .map((row, index) => {
      const get = (field) => weatherSource.resolver.get(row, field);
      return {
        stt: get("stt") || String(index + 1),
        area: get("area"),
        lat: get("lat"),
        long: get("long"),
        weather: get("weather"),
        mobility: get("mobility")
      };
    });

  const taskSource = resolveSheet(sheets, "Công việc");
  warnings.push(...taskSource.resolver.warnings);
  const tasks = taskSource.rows
    .filter((row) => taskSource.resolver.get(row, "name"))
    .flatMap((row, index) => {
      const get = (field) => taskSource.resolver.get(row, field);
      const taskLines = get("name").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return taskLines.map((name, lineIndex) => ({
        id: get("id") || `${index + 1}-${lineIndex + 1}`,
        date: get("date"),
        name,
        marker: get("marker"),
        status: get("marker"),
        note: get("note")
      }));
    });

  return {
    data: {
      cableIncidents,
      stationIncidents,
      incidents: [...cableIncidents, ...stationIncidents],
      affectedStations,
      affectedRoutes,
      deployments,
      operators,
      weatherRows,
      tasks
    },
    warnings
  };
}

export async function getDashboardData() {
  const entries = await Promise.all(SHEETS.map(async (sheet) => [sheet.name, await fetchSheet(sheet)]));
  return buildDashboardDataFromSheets(Object.fromEntries(entries));
}
