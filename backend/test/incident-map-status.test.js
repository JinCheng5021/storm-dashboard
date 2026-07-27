import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRouteKey,
  deriveIncidentMapFeatures,
  edgeStatusFromIncident,
  nodeStatusFromCause
} from "../../src/incidentMapStatus.js";

test("ánh xạ tình trạng sự cố ngoại vi sang đúng bốn trạng thái tuyến trong bão", () => {
  assert.equal(edgeStatusFromIncident("⛔ Chưa tiếp cận"), "incident_external");
  assert.equal(edgeStatusFromIncident("⏳ Đang xử lí"), "danger_zone");
  assert.equal(edgeStatusFromIncident("✅ Hoàn thành"), "resolved");
  assert.equal(edgeStatusFromIncident(""), null);
});

test("ghép tuyến hai chiều và bỏ hậu tố dung lượng FO", () => {
  assert.equal(
    canonicalRouteKey("Tuyến KEP - LSN"),
    canonicalRouteKey("LSN - KEP 48FO")
  );
});

test("tự động áp dụng sự cố tuyến và nguyên nhân đài trạm trong bão", () => {
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
    stationIncidents: [
      { target: "CGT", cause: "Mất điện AC" },
      { target: "TGO", cause: "Trạm bị cô lập do ngập" },
      { target: "HNI", cause: "SC accu" }
    ]
  });

  assert.deepEqual(result.edges.map((edge) => edge.status), [
    "incident_external",
    "danger_zone",
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

test("không thay đổi trạng thái bản đồ khi đang ở chế độ trước bão", () => {
  const edges = [{ id: "edge_ab", name: "Tuyến A - B", status: "normal", statusBeforeTyphoon: "unsafe" }];
  const nodes = [{ id: "node_CGT", name: "CGT", status: "active" }];

  const result = deriveIncidentMapFeatures({
    mode: "truoc_bao",
    edges,
    nodes,
    cableIncidents: [{ target: "A - B", status: "Chưa tiếp cận" }],
    stationIncidents: [{ target: "CGT", cause: "Mất điện AC" }]
  });

  assert.strictEqual(result.edges, edges);
  assert.strictEqual(result.nodes, nodes);
  assert.equal(result.edges[0].statusBeforeTyphoon, "unsafe");
  assert.equal(result.nodes[0].status, "active");
});
