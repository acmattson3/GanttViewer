// Constants and colors
const DAY_WIDTH = 20; // Uniform width for day cells
const META_WIDTH = 80;
const typeColors = ["#fb6262", "#ff9900", "#dada8a", "#6d9eeb"];
let chartData = null;
let visibleStart, visibleEnd;

// Utility functions
function parseDate(str) {
  const [year, month, day] = str.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(start, end) {
  return Math.floor((end - start) / (1000 * 3600 * 24)) + 1;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

// Overlap and break calculations
function getOverlapDays(start1, end1, start2, end2) {
  const start = start1 > start2 ? start1 : start2;
  const end = end1 < end2 ? end1 : end2;
  if (start > end) return 0;
  return daysBetween(start, end);
}

function unionIntervals(intervals) {
  if (!intervals.length) return [];
  intervals.sort((a, b) => a[0] - b[0]);
  const res = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = res[res.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      res.push(intervals[i]);
    }
  }
  return res;
}

function calculateBreakOverlap(taskStart, taskEnd, breaks) {
  let intervals = [];
  breaks.forEach((b) => {
    const bStart = parseDate(b.start_date);
    const bEnd = parseDate(b.end_date);
    const overlap = getOverlapDays(taskStart, taskEnd, bStart, bEnd);
    if (overlap > 0) {
      const start = Math.max(taskStart.getTime(), bStart.getTime());
      const end = Math.min(taskEnd.getTime(), bEnd.getTime());
      intervals.push([start, end]);
    }
  });
  intervals = unionIntervals(intervals);
  let total = 0;
  intervals.forEach((interval) => {
    total += Math.floor((interval[1] - interval[0]) / (1000 * 3600 * 24)) + 1;
  });
  return total;
}

// Check if a given date is within any break period.
function isBreakDay(date) {
  for (const b of chartData.breaks) {
    const bStart = parseDate(b.start_date);
    const bEnd = parseDate(b.end_date);
    if (date >= bStart && date <= bEnd) return true;
  }
  return false;
}

// Check if a given date matches a major date.
function isMajorDate(date) {
  for (const md of chartData.major_dates) {
    const mdDate = parseDate(md.date);
    if (
      date.getFullYear() === mdDate.getFullYear() &&
      date.getMonth() === mdDate.getMonth() &&
      date.getDate() === mdDate.getDate()
    ) {
      return true;
    }
  }
  return false;
}

// Return the major date's title (name) for the given date.
function getMajorDateTitle(date) {
  for (const md of chartData.major_dates) {
    const mdDate = parseDate(md.date);
    if (
      date.getFullYear() === mdDate.getFullYear() &&
      date.getMonth() === mdDate.getMonth() &&
      date.getDate() === mdDate.getDate()
    ) {
      return md.name;
    }
  }
  return "";
}

// Build an array of visible day strings from visibleStart to visibleEnd.
function buildVisibleDays() {
  const total = daysBetween(visibleStart, visibleEnd);
  const days = [];
  for (let i = 0; i < total; i++) {
    days.push(formatDate(addDays(visibleStart, i)));
  }
  return days;
}

// Render the unified table with sticky headers, fixed left columns, and uniform cell dimensions.
function renderTable() {
  if (!chartData) return;

  visibleStart = parseDate(document.getElementById("rangeStart").value);
  visibleEnd = parseDate(document.getElementById("rangeEnd").value);
  const visibleDays = buildVisibleDays();
  const totalDays = visibleDays.length;

  // Sort tasks by end date (soonest end date first)
  chartData.tasks.sort((a, b) => parseDate(a.end_date) - parseDate(b.end_date));

  // Build header
  const thead = document.getElementById("ganttThead");
  thead.innerHTML = "";

  // First header row: Week grouping.
  const trWeek = document.createElement("tr");
  trWeek.className = "weekGroup";

  // First 4 fixed columns (blank)
  for (let i = 0; i < 4; i++) {
    const th = document.createElement("th");
    th.className = "fixed";
    th.style.minWidth = `${META_WIDTH}px`;
    th.style.width = `${META_WIDTH}px`;
    th.textContent = "";
    trWeek.appendChild(th);
  }

  // Group visible days by week (each group shows the Monday date)
  let i = 0;
  while (i < totalDays) {
    const currentDay = parseDate(visibleDays[i]);
    const monday = getMonday(currentDay);
    let groupCount = 0;
    while (i + groupCount < totalDays) {
      const d = parseDate(visibleDays[i + groupCount]);
      if (getMonday(d).getTime() === monday.getTime()) {
        groupCount++;
      } else {
        break;
      }
    }
    const th = document.createElement("th");
    th.colSpan = groupCount;
    th.style.minWidth = `${groupCount * DAY_WIDTH}px`;
    th.style.width = `${groupCount * DAY_WIDTH}px`;
    th.style.height = "34.67px";
    th.textContent = formatDate(monday);
    trWeek.appendChild(th);
    i += groupCount;
  }
  thead.appendChild(trWeek);

  // Second header row: one cell per visible day, preceded by metadata headers.
  const trDay = document.createElement("tr");
  trDay.className = "dayHeader";
  const headers = ["Tasks", "Start", "End", "Days"];
  for (let j = 0; j < 4; j++) {
    const th = document.createElement("th");
    th.textContent = headers[j];
    th.className = "fixed";
    th.style.minWidth = `${META_WIDTH}px`;
    th.style.width = `${META_WIDTH}px`;
    if (j === 0) th.style.left = "0px";
    if (j === 1) th.style.left = `${META_WIDTH}px`;
    if (j === 2) th.style.left = `${META_WIDTH * 2}px`;
    if (j === 3) th.style.left = `${META_WIDTH * 3}px`;
    trDay.appendChild(th);
  }

  // Create one header cell per visible day.
  visibleDays.forEach((dayStr, index) => {
    const th = document.createElement("th");
    th.className = "dayCell";
    th.style.minWidth = `${DAY_WIDTH}px`;
    th.style.width = `${DAY_WIDTH}px`;
    const cellDate = addDays(visibleStart, index);
    if (isBreakDay(cellDate)) th.classList.add("breakCell");
    if (isMajorDate(cellDate)) {
      th.classList.add("majorDateCell");
      th.style.zIndex = "10";
      th.textContent = getMajorDateTitle(cellDate);
    } else {
      th.textContent = "";
    }
    trDay.appendChild(th);
  });
  thead.appendChild(trDay);

  // Build table body with one row per task.
  const tbody = document.getElementById("ganttTbody");
  tbody.innerHTML = "";
  chartData.tasks.forEach((task) => {
    const taskStart = parseDate(task.start_date);
    const taskEnd = parseDate(task.end_date);
    if (taskEnd < visibleStart || taskStart > visibleEnd) return;

    const tr = document.createElement("tr");

    // Fixed metadata cells (sticky left)
    const tdName = document.createElement("td");
    tdName.textContent = task.name;
    tdName.className = "fixed";
    tdName.style.minWidth = `${META_WIDTH}px`;
    tdName.style.width = `${META_WIDTH}px`;
    tdName.style.position = "sticky";
    tdName.style.left = "0px";
    if (task.important) {
      tdName.classList.add("important");
    }
    tr.appendChild(tdName);

    const tdStart = document.createElement("td");
    tdStart.textContent = task.start_date;
    tdStart.className = "fixed";
    tdStart.style.minWidth = `${META_WIDTH}px`;
    tdStart.style.width = `${META_WIDTH}px`;
    tdStart.style.position = "sticky";
    tdStart.style.left = `${META_WIDTH}px`;
    tr.appendChild(tdStart);

    const tdEnd = document.createElement("td");
    tdEnd.textContent = task.end_date;
    tdEnd.className = "fixed";
    tdEnd.style.minWidth = `${META_WIDTH}px`;
    tdEnd.style.width = `${META_WIDTH}px`;
    tdEnd.style.position = "sticky";
    tdEnd.style.left = `${META_WIDTH * 2}px`;
    tr.appendChild(tdEnd);

    const totalTaskDays = daysBetween(taskStart, taskEnd);
    const breakDays = calculateBreakOverlap(taskStart, taskEnd, chartData.breaks);
    const activeDays = totalTaskDays - breakDays;
    const tdDays = document.createElement("td");
    tdDays.textContent =
      totalTaskDays + (breakDays > 0 ? ` (${activeDays})` : "");
    tdDays.className = "fixed";
    tdDays.style.minWidth = `${META_WIDTH}px`;
    tdDays.style.width = `${META_WIDTH}px`;
    tdDays.style.position = "sticky";
    tdDays.style.left = `${META_WIDTH * 3}px`;
    tr.appendChild(tdDays);

    const activeStart = taskStart < visibleStart ? visibleStart : taskStart;
    const activeEnd = taskEnd > visibleEnd ? visibleEnd : taskEnd;
    const startIndex = daysBetween(visibleStart, activeStart) - 1;
    const duration = daysBetween(activeStart, activeEnd);

    // Add empty cells before the task.
    for (let i = 0; i < startIndex; i++) {
      const td = document.createElement("td");
      td.className = "dayCell";
      td.style.minWidth = `${DAY_WIDTH}px`;
      td.style.width = `${DAY_WIDTH}px`;
      const cellDate = addDays(visibleStart, i);
      if (isBreakDay(cellDate)) td.classList.add("breakCell");
      if (isMajorDate(cellDate)) td.classList.add("majorDateCell");
      tr.appendChild(td);
    }

    // Task cell spanning the active days.
    const tdTask = document.createElement("td");
    tdTask.className = "dayCell taskBar";
    tdTask.colSpan = duration;
    tdTask.style.minWidth = `${DAY_WIDTH * duration}px`;
    tdTask.style.width = `${DAY_WIDTH * duration}px`;
    const color = typeColors[task.type % typeColors.length];
    tdTask.style.background = color;
    tdTask.style.color = "#fff";
    tdTask.textContent = task.name;
    if (task.important) {
      tdTask.classList.add("important");
    }
    tdTask.addEventListener("mouseover", (e) => {
      const tooltip = document.getElementById("tooltip");
      tooltip.innerHTML = `<strong>${task.name}</strong><br>
                               Start: ${task.start_date}<br>
                               End: ${task.end_date}<br>
                               Type: ${chartData.types[task.type]}<br>
                               High Priority: ${task.important ? "Yes" : "No"}<br>
                               Days: ${totalTaskDays}${
                                 breakDays > 0 ? ` (${activeDays})` : ""
                               }`;
      tooltip.style.opacity = 1;
    });
    tdTask.addEventListener("mousemove", (e) => {
      const tooltip = document.getElementById("tooltip");
      tooltip.style.left = `${e.pageX + 10}px`;
      tooltip.style.top = `${e.pageY + 10}px`;
    });
    tdTask.addEventListener("mouseout", () => {
      const tooltip = document.getElementById("tooltip");
      tooltip.style.opacity = 0;
    });
    tr.appendChild(tdTask);

    // Add empty cells after the task.
    const added = startIndex + duration;
    for (let i = added; i < totalDays; i++) {
      const td = document.createElement("td");
      td.className = "dayCell";
      td.style.minWidth = `${DAY_WIDTH}px`;
      td.style.width = `${DAY_WIDTH}px`;
      const cellDate = addDays(visibleStart, i);
      if (isBreakDay(cellDate)) td.classList.add("breakCell");
      if (isMajorDate(cellDate)) td.classList.add("majorDateCell");
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

// File input: load JSON and initialize date range.
document.getElementById("fileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      chartData = JSON.parse(event.target.result);
      document.getElementById("chartTitle").textContent = chartData.title;
      document.getElementById("rangeStart").value = chartData.global_start_date;
      document.getElementById("rangeEnd").value = chartData.global_end_date;
      renderTable();
    } catch (error) {
      alert("Error parsing JSON: " + error);
    }
  };
  reader.readAsText(file);
});

document.getElementById("applyRange").addEventListener("click", () => {
  if (
    !document.getElementById("rangeStart").value ||
    !document.getElementById("rangeEnd").value
  ) {
    alert("Please select both start and end dates.");
    return;
  }
  renderTable();
});

window.addEventListener("load", () => {
  fetch("data/lunabotics-2026-chart.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      chartData = data;
      document.getElementById("chartTitle").textContent = chartData.title;
      document.getElementById("rangeStart").value = chartData.global_start_date;
      document.getElementById("rangeEnd").value = chartData.global_end_date;
      renderTable();
    })
    .catch((error) => console.error("Error loading default JSON file:", error));
});
