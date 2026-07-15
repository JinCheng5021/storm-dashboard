export const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1fTDLSaxfzLU4XZnPwVhLqIdFNX4-1SdSMpdvyO372nk";

export const SHEETS = [
  { name: "SC ngoại vi", gid: "2025084488" },
  { name: "SC đài trạm", gid: "2077199790" },
  { name: "Checklist update trạm", gid: "291687000" },
  { name: "Bảng TH Đài Trạm", gid: "1542087302" },
  { name: "DS tuyến, trạm ảnh hưởng", gid: "763532233" },
  { name: "Nhân sự", gid: "0" },
  { name: "Thời tiết", gid: "2045494709" },
  { name: "Công việc", gid: "1363793260" }
];

const column = (headers, options = {}) => ({ headers, ...options });

export const SHEET_SCHEMAS = {
  "SC ngoại vi": {
    fields: {
      stt: column(["STT", "TT"], { required: false, fallbackIndex: 0 }),
      date: column(["Ngày", "Ngày phát sinh"]),
      code: column(["Mã SC", "Mã sự cố"]),
      circuit: column(["Mạch/Trục", "Mạch", "Trục"]),
      target: column(["Tuyến", "Tuyến cáp"]),
      startedAt: column(["Thời gian phát sinh", "TG phát sinh"]),
      area: column(["Khu vực", "Chi nhánh"]),
      cause: column(["Nguyên nhân"]),
      status: column(["Tình trạng hiện tại", "Tình trạng", "Trạng thái"]),
      note: column(["Ghi chú", "Ghi chú sự cố"], { required: false }),
      location: column(["Vị trí", "Vị trí sự cố"], { required: false }),
      incidentCount: column(["Số vị trí sự cố"], { required: false }),
      processingTime: column(["Tổng thời gian xử lý (h)", "Tổng thời gian"], { required: false })
    }
  },
  "SC đài trạm": {
    fields: {
      stt: column(["STT", "TT"], { required: false, fallbackIndex: 0 }),
      date: column(["Ngày", "Ngày phát sinh"]),
      code: column(["Mã SC", "Mã sự cố"]),
      circuit: column(["Mạch/Trục", "Mạch", "Trục"]),
      target: column(["Trạm", "Tuyến/Trạm", "Tên trạm"]),
      startedAt: column(["Thời gian phát sinh", "TG phát sinh"]),
      area: column(["Chi nhánh", "Khu vực"]),
      cause: column(["Nguyên nhân"]),
      status: column(["Tình trạng hiện tại", "Tình trạng", "Trạng thái"]),
      note: column(["Ghi chú", "Ghi chú sự cố"], { required: false }),
      impact: column(["Ảnh hưởng", "Mức độ ảnh hưởng"], { required: false })
    }
  },
  "DS tuyến, trạm ảnh hưởng": {
    fields: {
      stationStt: column(["TT", "STT"]),
      station: column(["Trạm", "Tên trạm"]),
      coordinate: column(["Tọa độ", "Toạ độ"]),
      distance: column(["Khoảng cách VP-Trạm", "Khoảng cách"]),
      stationImpact: column(["Dự kiến vùng ảnh hưởng của bão", "Vùng ảnh hưởng"]),
      staffingPlan: column(["Kế hoạch nhân sự trực", "Kế hoạch nhân sự"]),
      staff: column(["Họ và tên nhân sự Chi nhánh", "Nhân sự chi nhánh"]),
      phone: column(["Số điện thoại", "Điện thoại"]),
      stationNote: column(["Ghi chú"], { required: false }),
      routeStt: column(["TT", "STT"], { occurrence: 2 }),
      circuit: column(["Mạch/Trục", "Mạch", "Trục"]),
      route: column(["Tuyến", "Tuyến cáp"]),
      length: column(["Chiều dài", "Chiều dài tuyến"]),
      routeImpact: column(["Ảnh hưởng tuyến cáp", "Ảnh hưởng"]),
      pops: column(["SL POP ảnh hưởng", "Số POP ảnh hưởng"], { required: false })
    }
  },
  "Nhân sự": {
    fields: {
      deploymentStt: column(["STT", "TT"]),
      location: column(["Đồn trú", "Điểm đồn trú", "Vị trí đồn trú"]),
      partner: column(["Đối tác", "Đơn vị đối tác"]),
      count: column(["SL nhân sự tại đồn trú", "Số lượng nhân sự", "SL nhân sự"]),
      operatorStt: column(["STT", "TT"], { occurrence: 2 }),
      name: column(["Họ và tên", "Tên nhân sự"]),
      phone: column(["Số điện thoại", "Điện thoại"]),
      email: column(["Email", "E-mail"]),
      role: column(["Chức vụ", "Vai trò"]),
      operatorLocation: column(["Vị trí lưu trú", "Nơi lưu trú"]),
      note: column(["Ghi chú"], { required: false })
    }
  },
  "Thời tiết": {
    fields: {
      stt: column(["STT", "TT"]),
      area: column(["Khu vực", "Địa phương"]),
      lat: column(["Lat", "Vĩ độ", "Latitude"]),
      long: column(["Long", "Kinh độ", "Longitude"]),
      weather: column(["Thời tiết", "Tình hình thời tiết"]),
      mobility: column(["Khả năng di chuyển", "Di chuyển", "Tình trạng di chuyển"])
    }
  },
  "Công việc": {
    allowPositionalFallback: true,
    minHeaderMatches: 2,
    fields: {
      id: column(["STT", "TT", "Mã công việc"], { fallbackIndex: 0 }),
      name: column(["Công việc", "Tên công việc", "Nội dung công việc"], { fallbackIndex: 1 }),
      marker: column(["Trạng thái", "Tình trạng", "Đánh dấu"], { required: false, fallbackIndex: 2 }),
      note: column(["Ghi chú", "Nội dung cập nhật"], { required: false, fallbackIndex: 3 })
    }
  }
};
