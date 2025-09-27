// Constants and colors
const DEFAULT_DAY_WIDTH = 20; // Default width for day cells
let dayWidth = DEFAULT_DAY_WIDTH;
const typeColors = ["#fb6262", "#ff9900", "#dada8a", "#8e7cc3", "#3c78d8"];
let chartData = null;
let visibleStart, visibleEnd;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const META_COLUMNS = [
  { key: "task", label: "Tasks", width: 160 },
  { key: "start", label: "Start", width: 80 },
  { key: "end", label: "End", width: 80 },
  { key: "days", label: "Days", width: 60 },
];

const META_OFFSETS = META_COLUMNS.map((_, index) =>
  META_COLUMNS.slice(0, index).reduce((sum, col) => sum + col.width, 0)
);

META_COLUMNS.forEach((column) => {
  document.documentElement.style.setProperty(
    `--meta-${column.key}-width`,
    `${column.width}px`
  );
});

function getMetaOffset(index) {
  return META_OFFSETS[index] || 0;
}

function applyMetaColumnSizing(cell, columnIndex, isHeader = false) {
  const column = META_COLUMNS[columnIndex];
  cell.className = `fixed fixed--${column.key}`;
  cell.style.minWidth = `${column.width}px`;
  cell.style.width = `${column.width}px`;
  cell.style.left = `${getMetaOffset(columnIndex)}px`;
  if (isHeader) {
    cell.style.zIndex = "20";
  }
}

const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");
const downloadButton = document.getElementById("downloadPng");

function updateZoomDisplay() {
  const percentage = Math.round((dayWidth / DEFAULT_DAY_WIDTH) * 100);
  if (zoomValue) {
    zoomValue.textContent = `${percentage}%`;
  }
  document.documentElement.style.setProperty("--day-width", `${dayWidth}px`);
}

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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
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
  const today = startOfToday();

  // Sort tasks by end date (soonest end date first)
  chartData.tasks.sort((a, b) => parseDate(a.end_date) - parseDate(b.end_date));

  // Build header
  const thead = document.getElementById("ganttThead");
  thead.innerHTML = "";

  // First header row: Week grouping.
  const trWeek = document.createElement("tr");
  trWeek.className = "weekGroup";

  // First fixed columns (blank)
  META_COLUMNS.forEach((_, index) => {
    const th = document.createElement("th");
    applyMetaColumnSizing(th, index, true);
    th.textContent = "";
    trWeek.appendChild(th);
  });

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
    th.style.minWidth = `${groupCount * dayWidth}px`;
    th.style.width = `${groupCount * dayWidth}px`;
    th.style.height = "34.67px";
    th.textContent = formatDate(monday);
    trWeek.appendChild(th);
    i += groupCount;
  }
  thead.appendChild(trWeek);

  // Second header row: one cell per visible day, preceded by metadata headers.
  const trDay = document.createElement("tr");
  trDay.className = "dayHeader";
  META_COLUMNS.forEach((column, index) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    applyMetaColumnSizing(th, index, true);
    trDay.appendChild(th);
  });

  // Create one header cell per visible day.
  visibleDays.forEach((dayStr, index) => {
    const th = document.createElement("th");
    th.className = "dayCell";
    th.style.minWidth = `${dayWidth}px`;
    th.style.width = `${dayWidth}px`;
    const cellDate = addDays(visibleStart, index);
    if (isBreakDay(cellDate)) th.classList.add("breakCell");
    if (isMajorDate(cellDate)) {
      th.classList.add("majorDateCell");
      th.style.zIndex = "10";
      th.textContent = getMajorDateTitle(cellDate);
    } else {
      th.textContent = "";
    }
    if (isSameDay(cellDate, today)) {
      th.classList.add("currentDateCell");
      th.style.zIndex = "12";
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
    applyMetaColumnSizing(tdName, 0);
    if (task.important) {
      tdName.classList.add("important");
    }
    tr.appendChild(tdName);

    const tdStart = document.createElement("td");
    tdStart.textContent = task.start_date;
    applyMetaColumnSizing(tdStart, 1);
    tr.appendChild(tdStart);

    const tdEnd = document.createElement("td");
    tdEnd.textContent = task.end_date;
    applyMetaColumnSizing(tdEnd, 2);
    tr.appendChild(tdEnd);

    const totalTaskDays = daysBetween(taskStart, taskEnd);
    const breakDays = calculateBreakOverlap(taskStart, taskEnd, chartData.breaks);
    const activeDays = totalTaskDays - breakDays;
    const dueDifference = Math.floor((taskEnd - today) / MS_PER_DAY);
    let dueStatusText = "Due today";
    if (dueDifference > 0) {
      dueStatusText = `${dueDifference} day${dueDifference === 1 ? "" : "s"} until due`;
    } else if (dueDifference < 0) {
      const overdue = Math.abs(dueDifference);
      dueStatusText = `${overdue} day${overdue === 1 ? "" : "s"} overdue`;
    }
    const tdDays = document.createElement("td");
    tdDays.textContent =
      totalTaskDays + (breakDays > 0 ? ` (${activeDays})` : "");
    applyMetaColumnSizing(tdDays, 3);
    tr.appendChild(tdDays);

    const activeStart = taskStart < visibleStart ? visibleStart : taskStart;
    const activeEnd = taskEnd > visibleEnd ? visibleEnd : taskEnd;
    const startIndex = daysBetween(visibleStart, activeStart) - 1;
    const duration = daysBetween(activeStart, activeEnd);

    // Add empty cells before the task.
    for (let i = 0; i < startIndex; i++) {
      const td = document.createElement("td");
      td.className = "dayCell";
      td.style.minWidth = `${dayWidth}px`;
      td.style.width = `${dayWidth}px`;
      const cellDate = addDays(visibleStart, i);
      if (isBreakDay(cellDate)) td.classList.add("breakCell");
      if (isMajorDate(cellDate)) td.classList.add("majorDateCell");
      if (isSameDay(cellDate, today)) td.classList.add("currentDateCell");
      tr.appendChild(td);
    }

    // Task cell spanning the active days.
    const tdTask = document.createElement("td");
    tdTask.className = "dayCell taskBar";
    tdTask.colSpan = duration;
    tdTask.style.minWidth = `${dayWidth * duration}px`;
    tdTask.style.width = `${dayWidth * duration}px`;
    const color = typeColors[task.type % typeColors.length];
      tdTask.style.background = color;
    tdTask.style.color = "#fff";
    tdTask.textContent = task.name;
    if (task.important) {
      tdTask.classList.add("important");
    }
    tdTask.addEventListener("mouseover", () => {
      const tooltip = document.getElementById("tooltip");
      tooltip.innerHTML = `<strong>${task.name}</strong><br>
                               Start: ${task.start_date}<br>
                               End: ${task.end_date}<br>
                               Type: ${chartData.types[task.type]}<br>
                               High Priority: ${task.important ? "Yes" : "No"}<br>
                               Days: ${totalTaskDays}${
                                 breakDays > 0 ? ` (${activeDays})` : ""
                               }<br>
                               ${dueStatusText}`;
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
      td.style.minWidth = `${dayWidth}px`;
      td.style.width = `${dayWidth}px`;
      const cellDate = addDays(visibleStart, i);
      if (isBreakDay(cellDate)) td.classList.add("breakCell");
      if (isMajorDate(cellDate)) td.classList.add("majorDateCell");
      if (isSameDay(cellDate, today)) td.classList.add("currentDateCell");
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
  updateStickyOffset();
  renderDateLines(visibleDays, today);
}

function createDateLine(className, left, top, height, tooltipContent) {
  const line = document.createElement("div");
  line.className = `dateLine ${className}`;
  line.style.left = `${left}px`;
  line.style.top = `${top}px`;
  line.style.height = `${height}px`;

  if (tooltipContent) {
    line.addEventListener("mouseover", () => {
      const tooltip = document.getElementById("tooltip");
      if (!tooltip) return;
      tooltip.innerHTML = tooltipContent;
      tooltip.style.opacity = 1;
    });
    line.addEventListener("mousemove", (e) => {
      const tooltip = document.getElementById("tooltip");
      if (!tooltip) return;
      tooltip.style.left = `${e.pageX + 10}px`;
      tooltip.style.top = `${e.pageY + 10}px`;
    });
    line.addEventListener("mouseout", () => {
      const tooltip = document.getElementById("tooltip");
      if (!tooltip) return;
      tooltip.style.opacity = 0;
    });
  }

  return line;
}

function updateStickyOffset() {
  const thead = document.getElementById("ganttThead");
  if (!thead) return;
  document.documentElement.style.setProperty("--sticky-body-offset", `${thead.offsetHeight}px`);
}

function renderDateLines(visibleDays, today) {
  const overlay = document.getElementById("dateLinesOverlay");
  const table = document.getElementById("ganttTable");
  if (!overlay || !table) return;

  overlay.innerHTML = "";
  overlay.style.width = `${table.scrollWidth}px`;
  overlay.style.top = "0px";
  const tableHeight = table.offsetHeight;
  overlay.style.height = `${tableHeight}px`;

  const dayHeaderCells = document.querySelectorAll("#ganttThead tr.dayHeader th.dayCell");
  const tableRect = table.getBoundingClientRect();

  dayHeaderCells.forEach((cell, index) => {
    const cellRect = cell.getBoundingClientRect();
    const cellLeft = cellRect.left - tableRect.left;
    const columnDate = addDays(visibleStart, index);

    if (isMajorDate(columnDate)) {
      const title = getMajorDateTitle(columnDate);
      const content = title
        ? `<strong>${title}</strong><br>${formatDate(columnDate)}`
        : formatDate(columnDate);
      overlay.appendChild(createDateLine("dateLine--major", cellLeft, 0, tableHeight, content));
    }

    if (isSameDay(columnDate, today)) {
      const content = `<strong>Today</strong><br>${formatDate(columnDate)}`;
      overlay.appendChild(createDateLine("dateLine--current", cellLeft, 0, tableHeight, content));
    }
  });
}

// File input: load JSON and initialize date range.
if (zoomSlider) {
  zoomSlider.value = `${DEFAULT_DAY_WIDTH}`;
  zoomSlider.addEventListener("input", (event) => {
    const newWidth = parseInt(event.target.value, 10);
    if (!Number.isNaN(newWidth)) {
      dayWidth = newWidth;
      updateZoomDisplay();
      if (chartData) {
        renderTable();
      }
    }
  });
}

updateZoomDisplay();

if (downloadButton) {
  downloadButton.addEventListener("click", () => {
    if (!chartData || typeof html2canvas !== "function") {
      alert("Please load chart data before downloading.");
      return;
    }

    const originalText = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = "Preparing...";

    const captureTarget = document.getElementById("tableInner");
    const overlay = document.getElementById("dateLinesOverlay");
    if (!captureTarget) {
      alert("Unable to locate chart for download.");
      downloadButton.disabled = false;
      downloadButton.textContent = originalText;
      return;
    }
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#ffffff";

    const currentLines = overlay
      ? Array.from(overlay.querySelectorAll(".dateLine--current"))
      : [];
    const previousDisplays = currentLines.map((line) => line.style.display);
    currentLines.forEach((line) => {
      line.style.display = "none";
    });

    html2canvas(captureTarget, {
      backgroundColor: "#ffffff",
      scale: 2,
      scrollX: 0,
      scrollY: -window.scrollY,
    })
      .then((canvas) => {
        const link = document.createElement("a");
        const defaultTitle = chartData && chartData.title ? chartData.title : "gantt-chart";
        const safeTitle = defaultTitle.replace(/[^a-z0-9-_]+/gi, "_");
        link.download = `${safeTitle || "gantt-chart"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      })
      .catch((error) => {
        console.error("Error generating PNG:", error);
        alert("Unable to generate PNG. Please try again.");
      })
      .finally(() => {
        document.body.style.backgroundColor = previousBackground;
        currentLines.forEach((line, index) => {
          line.style.display = previousDisplays[index];
        });
        downloadButton.disabled = false;
        downloadButton.textContent = originalText;
      });
  });
}

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
      if (downloadButton) {
        downloadButton.disabled = false;
      }
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
      if (downloadButton) {
        downloadButton.disabled = false;
      }
      renderTable();
    })
    .catch((error) => console.error("Error loading default JSON file:", error));
});
