# GanttViewer

A way to view Gantt charts on the web. Define your Gantt chart in a JSON structure and upload!

## Project structure

```
GanttViewer/
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── main.js
├── data/
│   ├── lunabotics-2026-chart.json
│   └── xhab-2026-chart.json
├── index.html
└── README.md
```

Open `index.html` in a browser to view the chart. The default data set loads from `data/lunabotics-2026-chart.json`, and you can switch data sets by uploading a compatible JSON file with the file picker in the header.
