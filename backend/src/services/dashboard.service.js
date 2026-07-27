import { SHEETS, SHEET_SCHEMAS } from "../config/sheets.config.js";
import { fetchSheet } from "../adapters/google-sheets.adapter.js";
import { createHeaderResolver, normalizeHeader } from "../lib/header-resolver.js";

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

function metricValue(rows, labels) {
  const acceptedLabels = new Set(labels.map(normalizeHeader));
  for (const row of rows) {
    const labelIndex = row.findIndex((cell) => acceptedLabels.has(normalizeHeader(cell)));
    if (labelIndex >= 0) return numberValue(row[labelIndex + 1]);
  }
  return 0;
}

function isDashboardVisible(value) {
  const marker = normalizeHeader(value);
  return ["x", "✓", "✔", "true", "1", "có"].includes(marker);
}

function normalizeRouteKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^tuyến\s+/i, "")
    .split(/\s*[-–—]\s*/)
    .map((endpoint) => endpoint
      .replace(/\(\s*MPOP\s*\)/gi, "")
      .replace(/\b\d+\s*FO\b/gi, "")
      .replace(/\s+/g, "")
      .toLocaleUpperCase("vi-VN"))
    .filter(Boolean)
    .join("-");
}

function routeLookupKeys(value) {
  const key = normalizeRouteKey(value);
  const endpoints = key.split("-");
  return endpoints.length === 2
    ? [key, `${endpoints[1]}-${endpoints[0]}`]
    : [key];
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
        cause: get("cause"),
        processingTime: get("processingTime"),
        acBackup: get("acBackup"),
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
        pops: get("pops"),
        availability: get("availability"),
        incidentFrequency: get("incidentFrequency")
      };
    });

  const routeInformationSource = resolveSheet(sheets, "Thông tin tuyến");
  warnings.push(...routeInformationSource.resolver.warnings);
  const affectedRouteByKey = new Map();
  affectedRoutes.forEach((route) => {
    routeLookupKeys(route.route).forEach((key) => affectedRouteByKey.set(key, route));
  });

  const matchedAffectedRouteKeys = new Set();
  const routeInformation = routeInformationSource.rows
    .filter((row) => routeInformationSource.resolver.get(row, "route"))
    .map((row) => {
      const get = (field) => routeInformationSource.resolver.get(row, field);
      const route = get("route");
      const affectedRoute = affectedRouteByKey.get(normalizeRouteKey(route));
      if (affectedRoute) matchedAffectedRouteKeys.add(normalizeRouteKey(affectedRoute.route));

      return {
        route,
        length: affectedRoute?.length || "",
        pops: affectedRoute?.pops || "",
        availability: get("availability") || affectedRoute?.availability || "",
        incidentFrequency: get("incidentFrequency") || affectedRoute?.incidentFrequency || ""
      };
    });

  affectedRoutes.forEach((route) => {
    if (matchedAffectedRouteKeys.has(normalizeRouteKey(route.route))) return;
    routeInformation.push({
      route: route.route,
      length: route.length,
      pops: route.pops,
      availability: route.availability,
      incidentFrequency: route.incidentFrequency
    });
  });

  const peopleRows = sheets["Nhân sự"] || [];
  const peopleSource = resolveSheet(sheets, "Nhân sự");
  warnings.push(...peopleSource.resolver.warnings);
  const deployments = peopleSource.rows
    .filter((row) => peopleSource.resolver.get(row, "deploymentStt"))
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
    .filter((row) => peopleSource.resolver.get(row, "operatorStt"))
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

  const responseResources = {
    teams: metricValue(peopleRows, ["Số đội ứng cứu", "SL đội ứng cứu"]),
    pickupTrucks: metricValue(peopleRows, ["Xe bán tải", "Số xe bán tải"]),
    measuringDevices: metricValue(peopleRows, ["Máy đo", "Số máy đo"]),
    weldingMachines: metricValue(peopleRows, ["Máy hàn", "Số máy hàn"])
  };

  const weatherSource = resolveSheet(sheets, "Thời tiết");
  warnings.push(...weatherSource.resolver.warnings);
  const weatherRows = weatherSource.rows
    .filter((row) => weatherSource.resolver.get(row, "area") && isDashboardVisible(weatherSource.resolver.get(row, "visible")))
    .map((row, index) => {
      const get = (field) => weatherSource.resolver.get(row, field);
      return {
        stt: get("stt") || String(index + 1),
        area: get("area"),
        lat: get("lat"),
        long: get("long"),
        weather: get("weather"),
        mobility: get("mobility"),
        visible: get("visible")
      };
    });

  const taskSource = resolveSheet(sheets, "Công việc");
  warnings.push(...taskSource.resolver.warnings);
  const preStormTasks = taskSource.rows
    .filter((row) => taskSource.resolver.get(row, "preStormName"))
    .flatMap((row, index) => {
      const get = (field) => taskSource.resolver.get(row, field);
      const taskLines = get("preStormName").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return taskLines.map((name, lineIndex) => ({
        id: `pre-${get("preStormId") || index + 1}-${lineIndex + 1}`,
        name,
        marker: get("preStormMarker"),
        status: get("preStormMarker"),
        note: get("preStormNote"),
        mode: "truoc_bao"
      }));
    });

  const inStormTasks = taskSource.rows
    .filter((row) => taskSource.resolver.get(row, "inStormName"))
    .flatMap((row, index) => {
      const get = (field) => taskSource.resolver.get(row, field);
      const taskLines = get("inStormName").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return taskLines.map((name, lineIndex) => ({
        id: `in-${get("inStormDate") || "no-date"}-${index + 1}-${lineIndex + 1}`,
        date: get("inStormDate"),
        name,
        marker: get("inStormMarker"),
        status: get("inStormMarker"),
        note: get("inStormNote"),
        mode: "trong_bao"
      }));
    });

  return {
    data: {
      cableIncidents,
      stationIncidents,
      incidents: [...cableIncidents, ...stationIncidents],
      affectedStations,
      affectedRoutes,
      routeInformation,
      deployments,
      operators,
      responseResources,
      weatherRows,
      preStormTasks,
      inStormTasks,
      tasks: inStormTasks
    },
    warnings
  };
}

export async function getDashboardData() {
  const entries = await Promise.all(SHEETS.map(async (sheet) => [sheet.name, await fetchSheet(sheet)]));
  return buildDashboardDataFromSheets(Object.fromEntries(entries));
}
