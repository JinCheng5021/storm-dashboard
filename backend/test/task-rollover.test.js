import test from "node:test";
import assert from "node:assert/strict";
import { numberedTaskName, tasksForDate } from "../../src/taskUtils.js";

test("chuyển công việc chưa thực hiện sang ngày kế tiếp", () => {
  const tasks = [
    { id: "1", date: "15/07/2026", name: "1. Kiểm tra tuyến cáp", status: "Chưa thực hiện" },
    { id: "2", date: "15/07/2026", name: "2. Đo kiểm tín hiệu", status: "Hoàn thành" },
    { id: "3", date: "16/07/2026", name: "3. Tuần tra tuyến", status: "Đang thực hiện" }
  ];

  const result = tasksForDate(tasks, "16/07/2026");

  assert.deepEqual(result.map((task) => task.name), ["3. Tuần tra tuyến", "1. Kiểm tra tuyến cáp"]);
  assert.equal(result[1].carriedOver, true);
  assert.equal(result[1].originalDate, "15/07/2026");
});

test("tiếp tục giữ công việc tồn đọng cho đến khi trạng thái được cập nhật", () => {
  const unfinished = [{ id: "1", date: "15/07/2026", name: "1. Kiểm tra tuyến cáp", status: "Chưa thực hiện" }];
  assert.equal(tasksForDate(unfinished, "17/07/2026").length, 1);

  const completedLater = [
    ...unfinished,
    { id: "2", date: "16/07/2026", name: "Kiểm tra tuyến cáp", status: "Hoàn thành" }
  ];
  assert.equal(tasksForDate(completedLater, "17/07/2026").length, 0);
});

test("không nhân đôi công việc khi đã được nhập lại trong ngày mới", () => {
  const tasks = [
    { id: "1", date: "15/07/2026", name: "1. Kiểm tra tuyến cáp", status: "Chưa thực hiện" },
    { id: "2", date: "16/07/2026", name: "2. Kiểm tra tuyến cáp", status: "Chưa thực hiện" }
  ];

  const result = tasksForDate(tasks, "16/07/2026");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "2");
  assert.equal(result[0].carriedOver, true);
  assert.equal(result[0].originalDate, "15/07/2026");
});

test("vẫn ghi chú công việc tồn khi ngày mới đã đổi sang đang thực hiện", () => {
  const tasks = [
    { id: "1", date: "14/07/2026", name: "3. Xử lý sự cố cùng đối tác", status: "Chưa thực hiện" },
    { id: "2", date: "15/07/2026", name: "1. Xử lý sự cố cùng đối tác", status: "Đang thực hiện" }
  ];

  const result = tasksForDate(tasks, "15/07/2026");

  assert.equal(result.length, 1);
  assert.equal(result[0].status, "Đang thực hiện");
  assert.equal(result[0].carriedOver, true);
  assert.equal(result[0].originalDate, "14/07/2026");
});

test("đánh lại số thứ tự liên tục cho cả công việc hiện tại và công việc tồn", () => {
  assert.equal(numberedTaskName("1. Đo kiểm tuyến TYN - TNN", 4), "4. Đo kiểm tuyến TYN - TNN");
  assert.equal(numberedTaskName("Tuần tra tuyến", 5), "5. Tuần tra tuyến");
});
