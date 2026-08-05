import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRouteKey,
  deriveIncidentMapFeatures,
  edgeStatusFromIncident,
  edgeStatusBeforeTyphoonFromLevel,
  nodeStatusFromCause
} from "../../src/incidentMapStatus.js";

test("quy trạng thái sự cố đang xử lý về màu đỏ", () => {
  assert.equal(edgeStatusFromIncident("⛔ Chưa tiếp cận"), "incident_external");
  assert.equal(edgeStatusFromIncident("⏳ Đang xử lí"), "incident_external");
  assert.equal(edgeStatusFromIncident("✅ Hoàn thành"), "resolved");
  assert.equal(edgeStatusFromIncident(""), null);
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

test("tô đỏ tuyến sự cố, xanh tuyến có dữ liệu và giữ xanh dương tuyến không có dữ liệu", () => {
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
      { route: 'E - F' }
    ],
    stationIncidents: [
      { target: "CGT", cause: "Mất điện AC" },
      { target: "TGO", cause: "Trạm bị cô lập do ngập" },
      { target: "HNI", cause: "SC accu" }
    ]
  });

  assert.deepEqual(result.edges.map((edge) => edge.status), [
    "incident_external",
    "incident_external",
    "resolved",
    "normal"
  ]);
  assert.deepEqual(result.nodes.map((node) => node.status), [
    "power_out",
    "isolated",
    "active",
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
});

test("tự động áp dụng mức độ từ DS tuyến, trạm ảnh hưởng khi đang ở chế độ trước bão", () => {
  const edges = [
    { id: "edge_ab", name: "Tuyến A - B", status: "normal", statusBeforeTyphoon: "unsafe" },
    { id: "edge_cd", name: "Tuyến C - D", status: "normal", statusBeforeTyphoon: "safe" },
    { id: "edge_ef", name: "Tuyến E - F", status: "normal", statusBeforeTyphoon: "safe" },
    { id: "edge_gh", name: "Tuyến G - H", status: "normal", statusBeforeTyphoon: "unsafe" }
  ];
  const nodes = [{ id: "node_CGT", name: "CGT", status: "active" }];

  const result = deriveIncidentMapFeatures({
    mode: "truoc_bao",
    edges,
    nodes,
    cableIncidents: [{ target: "A - B", status: "Chưa tiếp cận" }],
    stationIncidents: [{ target: "CGT", cause: "Mất điện AC" }],
    affectedRoutes: [
      { route: "B - A 48FO", riskLevel: "An toàn" },
      { route: "C - D", riskLevel: "Có nguy cơ" },
      { route: "E - F", riskLevel: "Mất an toàn" }
    ]
  });

  assert.deepEqual(result.edges.map((edge) => edge.statusBeforeTyphoon), [
    "safe",
    "risky",
    "unsafe",
    "normal"
  ]);
  assert.strictEqual(result.nodes, nodes);
  assert.equal(result.nodes[0].status, "active");
});
