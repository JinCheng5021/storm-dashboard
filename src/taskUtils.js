export function normalizeSheetDate(value) {
  const raw = String(value || "").trim();
  const dayFirst = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirst) return `${dayFirst[1].padStart(2, "0")}/${dayFirst[2].padStart(2, "0")}/${dayFirst[3]}`;

  const yearFirst = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (yearFirst) return `${yearFirst[3].padStart(2, "0")}/${yearFirst[2].padStart(2, "0")}/${yearFirst[1]}`;
  return raw;
}

function dateValue(value) {
  const normalized = normalizeSheetDate(value);
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function taskKey(task) {
  return String(task.name || "")
    .normalize("NFKC")
    .toLocaleLowerCase("vi-VN")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNotStarted(task) {
  return String(task.status || task.marker || "")
    .toLocaleLowerCase("vi-VN")
    .includes("chưa thực hiện");
}

export function tasksForDate(tasks, today) {
  const todayValue = dateValue(today);
  if (!Number.isFinite(todayValue)) return [];

  const eligible = tasks
    .map((task, index) => ({ task, index, date: normalizeSheetDate(task.date), dateValue: dateValue(task.date) }))
    .filter((entry) => Number.isFinite(entry.dateValue) && entry.dateValue <= todayValue)
    .sort((left, right) => left.dateValue - right.dateValue || left.index - right.index);

  const latestByTask = new Map();
  const historyByTask = new Map();
  eligible.forEach((entry) => {
    const key = taskKey(entry.task);
    if (!key) return;
    latestByTask.set(key, entry);
    const history = historyByTask.get(key) || [];
    history.push(entry);
    historyByTask.set(key, history);
  });

  const todayTasks = eligible
    .filter((entry) => entry.dateValue === todayValue)
    .map((entry) => {
      const history = historyByTask.get(taskKey(entry.task)) || [];
      const previousEntry = history.filter((item) => item.dateValue < todayValue).at(-1);
      if (!previousEntry || !isNotStarted(previousEntry.task)) return entry.task;
      return {
        ...entry.task,
        carriedOver: true,
        originalDate: previousEntry.date
      };
    });
  const todayKeys = new Set(todayTasks.map(taskKey));

  const carriedTasks = [...latestByTask.entries()]
    .filter(([key, entry]) => !todayKeys.has(key) && entry.dateValue < todayValue && isNotStarted(entry.task))
    .map(([, entry]) => ({
      ...entry.task,
      carriedOver: true,
      originalDate: entry.date
    }));

  return [...todayTasks, ...carriedTasks];
}

export function numberedTaskName(name, position) {
  const content = String(name || "").replace(/^\s*\d+[.)]\s*/, "").trim();
  return `${position}. ${content || "-"}`;
}
