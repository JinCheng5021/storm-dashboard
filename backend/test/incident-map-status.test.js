import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRouteKey,
  deriveIncidentMapFeatures,
  edgeStatusFromIncident,
  edgeStatusBeforeTyphoonFromLevel,
  nodeStatusFromCause,
  nodeStatusFromIncident,
  summarizeActiveStormImpact
} from "../../src/incidentMapStatus.js";

test("quy trạng thái sự cố đang xử lý về màu đỏ", () => {
  assert.equal(edgeStatusFromIncident("⛔ Chưa tiếp cận"), "incident_external");
  assert.equal(edgeStatusFromIncident("⏳ Đang xử lí"), "incident_external");
  assert.equal(edgeStatusFromIncident("✅ Hoàn thành"), "resolved");
  assert.equal(edgeStatusFromIncident(""), null);
});

test("chỉ cộng POP và KHG FTI của tuyến đang màu đỏ", () => {
  const summary = summarizeActiveStormImpact({
    affectedRoutes: [
      { route: "A - B", impact: "Trực tiếp", pops: "3", ftiCustomers: "2" },
      { route: "C - D", impact: "Gián tiếp", pops: "4", ftiCustomers: "5" },
      { route: "E - F", impact: "Trực tiếp", pops: "8", ftiCustomers: "9" }
    ],
    cableIncidents: [
      { target: "B - A 48FO", status: "Chưa tiếp cận" },
      { target: "D - C", status: "Đang xử lý" },
      { target: "A - B", status: "Chưa tiếp cận" },
      { target: "E - F", status: "Hoàn thành" }
    ]
  });

  assert.deepEqual(summary, {
    popCount: 7,
    directPopCount: 3,
    indirectPopCount: 4,
    ftiCustomerCount: 7
  });
  assert.deepEqual(summarizeActiveStormImpact({
    affectedRoutes: [{ route: "A - B", impact: "Trực tiếp", pops: "3", ftiCustomers: "2" }],
    cableIncidents: [{ target: "A - B", status: "Hoàn thành" }]
  }), {
    popCount: 0,
    directPopCount: 0,
    indirectPopCount: 0,
    ftiCustomerCount: 0
  });
});

test("ghép tuyến hai chiều và bỏ hậu tố dung lượng FO", () => {
  assert.equal(
    canonicalRouteKey("Tuyến KEP - LSN"),
    canonicalRouteKey("LSN - KEP 48FO")
  );
});

test("ánh xạ mức độ trước bão sang đúng ba trạng thái màu tuyến", () => {
  assert.equal(edgeStatusBeforeTyphoonFromLevel("An toàn"), "safe");
  assert.equal(edgeStatusBeforeTyphoonFromLevel("Có nguy cơ"), "risky");
  assert.equal(edgeStatusBeforeTyphoonFromLevel("Mất an toàn"), "unsafe");
  assert.equal(edgeStatusBeforeTyphoonFromLevel(""), null);
});

test("giữ màu tuyến theo phạm vi bão và đặt biểu tượng theo SC ngoại vi", () => {
  const edges = [
    { id: "edge_ab", name: "Tuyến A - B", status: "normal", statusBeforeTyphoon: "safe" },
    { id: "edge_cd", name: "Tuyến C - D", status: "normal", statusBeforeTyphoon: "risky" },
    { id: "edge_ef", name: "Tuyến E - F", status: "normal", statusBeforeTyphoon: "unsafe" },
    { id: "edge_gh", name: "Tuyến G - H", status: "resolved", statusBeforeTyphoon: "safe" }
  ];
  const nodes = [
    { id: "node_CGT", name: "CGT", status: "active" },
    { id: "node_TGO", name: "TGO", status: "active" },
    { id: "node_HNI", name: "HNI", status: "power_out" },
    { id: "node_NBH", name: "NBH", status: "isolated" }
  ];

  const result = deriveIncidentMapFeatures({
    mode: "trong_bao",
    edges,
    nodes,
    cableIncidents: [
      { target: "B - A 48FO", status: "✅ Hoàn thành" },
      { target: "A - B", status: "⛔ Chưa tiếp cận" },
      { target: "D - C", status: "⏳ Đang xử lý" },
      { target: "E - F", status: "✅ Hoàn thành" }
    ],
    affectedRoutes: [
      { route: 'A - B' },
      { route: 'C - D' },
      { route: 'E - F' },
      { route: 'G - H' }
    ],
    stationIncidents: [
      { target: "CGT", cause: "Mất điện AC", status: "Hoàn thành" },
      { target: "TGO", cause: "Trạm bị cô lập do ngập", status: "Đang xử lý" },
      { target: "HNI", cause: "Mất điện AC", status: "Chưa tiếp cận" }
    ]
  });

  assert.deepEqual(result.edges.map((edge) => edge.status), [
    "normal",
    "normal",
    "normal",
    "resolved"
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.cableIncidentStatus), [
    "incident_external",
    "incident_external",
    "resolved",
    null
  ]);
  assert.deepEqual(result.nodes.map((node) => node.status), [
    "active",
    "isolated",
    "power_out",
    "active"
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.statusBeforeTyphoon), [
    "safe",
    "risky",
    "unsafe",
    "safe"
  ]);
  assert.equal(nodeStatusFromCause("Mất điện AC"), "power_out");
  assert.equal(nodeStatusFromCause("Bị cô lập"), "isolated");
  assert.equal(nodeStatusFromCause("SC accu"), "active");
  assert.equal(nodeStatusFromIncident("Mất điện AC", "Hoàn thành"), "active");
  assert.equal(nodeStatusFromIncident("Mất điện AC", "Đang xử lý"), "power_out");
  assert.equal(nodeStatusFromIncident("Bị cô lập", "Chưa tiếp cận"), "isolated");
});

test("giữ trạng thái phạm vi bão đã tính sẵn khi ở chế độ trước bão", () => {
  const edges = [
    { id: "edge_ab", name: "Tuyến A - B", status: "normal", statusBeforeTyphoon: "unsafe" },
    { id: "edge_cd", name: "Tuyến C - D", status: "normal", statusBeforeTyphoon: "safe" },
    { id: "edge_ef", name: "Tuyến E - F", status: "normal", statusBeforeTyphoon: "safe" },
    { id: "edge_gh", name: "Tuyến G - H", status: "normal", statusBeforeTyphoon: "unsafe" }
  ];
  const nodes = [
    { id: "node_CGT", name: "CGT", status: "power_out" },
    { id: "node_TGO", name: "TGO", status: "isolated" }
  ];

  const result = deriveIncidentMapFeatures({
    mode: "truoc_bao",
    edges,
    nodes,
    cableIncidents: [{ target: "A - B", status: "Chưa tiếp cận" }],
    stationIncidents: [
      { target: "CGT", cause: "mat dien AC", status: "dang xu ly" },
      { target: "TGO", cause: "bi co lap", status: "chua tiep can" }
    ],
    affectedRoutes: [
      { route: "B - A 48FO", riskLevel: "An toàn" },
      { route: "C - D", riskLevel: "Có nguy cơ" },
      { route: "E - F", riskLevel: "Mất an toàn" }
    ]
  });

  assert.deepEqual(result.edges.map((edge) => edge.statusBeforeTyphoon), [
    "unsafe",
    "safe",
    "safe",
    "unsafe"
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.status), [
    "normal",
    "normal",
    "normal",
    "normal"
  ]);
  assert.deepEqual(result.edges.map((edge) => edge.cableIncidentStatus), [null, null, null, null]);
  assert.deepEqual(result.nodes.map((node) => node.status), ["active", "active"]);
  assert.deepEqual(nodes.map((node) => node.status), ["power_out", "isolated"]);
});
