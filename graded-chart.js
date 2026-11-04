// Graded price graph behind a "Cardmarket avg | Graded" switch above each of
// Cardmarket's Chart.js graphs. Additive only: the sole change to their nodes
// is hiding their canvas in Graded mode (restored exactly in Cardmarket mode).

const GS_SVG_NS = "http://www.w3.org/2000/svg";
const gsSavedCanvasDisplay = new Map(); // their canvas -> style.display before we hid it
let gsChart = null; // { record, series, language, visible:Set, mode }
let gsChartGeneration = 0;

function gsChartContainers() {
    return Array.from(document.querySelectorAll(".chart-container"))
        .map(container => ({ container, canvas: container.querySelector("canvas.chartjs-render-monitor") }))
        .filter(x => x.canvas);
}

function gsRestoreCanvases() {
    for (const [canvas, display] of gsSavedCanvasDisplay) canvas.style.display = display;
    gsSavedCanvasDisplay.clear();
}

function gsSvg(tag, attrs) {
    const el = document.createElementNS(GS_SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
}

function injectGradedChart(record) {
    const generation = ++gsChartGeneration;
    document.querySelectorAll(".gs-chart-switch, .gs-graded-chart").forEach(n => n.remove());
    gsRestoreCanvases();
    gsChart = null;
    if (!record || !record.listings || !Object.keys(record.listings).length) return;
    if (!gsChartContainers().length) return;

    chrome.storage.local.get({ chartMode: "cm" }, res => {
        if (generation !== gsChartGeneration) return;
        const languages = languagesInRecord(record).map(l => l.language);
        const filter = languageFilterFromSearch(location.search);
        const preferred = filter && filter.find(code => languages.includes(code));
        gsChart = { record, mode: res.chartMode === "graded" ? "graded" : "cm" };
        gsSetLanguage(preferred || languages[0]);
        for (const { container } of gsChartContainers()) container.before(gsBuildSwitch());
        gsApplyMode();
    });
}

function gsSetLanguage(language) {
    gsChart.language = language;
    gsChart.series = dailySeries(gsChart.record, { language, endDate: localDate(), days: 30 });
    gsChart.visible = new Set();
    const graders = new Set();
    for (const s of gsChart.series) {
        if (graders.has(s.grader)) continue;
        graders.add(s.grader);
        gsChart.visible.add(s.gradeText);
    }
}

function gsBuildSwitch() {
    const group = document.createElement("div");
    group.className = "gs-chart-switch btn-group btn-group-sm";
    group.setAttribute("role", "group");
    group.style.cssText = "margin-bottom: 6px;";
    for (const [mode, label] of [["cm", "Cardmarket avg"], ["graded", "Graded"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-outline-secondary";
        b.dataset.gsMode = mode;
        b.textContent = label;
        b.addEventListener("click", () => {
            if (!gsChart || gsChart.mode === mode) return;
            gsChart.mode = mode;
            chrome.storage.local.set({ chartMode: mode });
            gsApplyMode();
        });
        group.appendChild(b);
    }
    return group;
}

function gsApplyMode() {
    document.querySelectorAll(".gs-chart-switch button").forEach(b => {
        const active = b.dataset.gsMode === gsChart.mode;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll(".gs-graded-chart").forEach(n => n.remove());
    if (gsChart.mode !== "graded") {
        gsRestoreCanvases();
        return;
    }
    for (const { container, canvas } of gsChartContainers()) {
        // Measure before hiding: hidden tabs report 0×0.
        const w = container.clientWidth, h = container.clientHeight;
        const size = w > 0 && h > 0 ? { w, h } : { w: 450, h: 250 };
        if (!gsSavedCanvasDisplay.has(canvas)) {
            gsSavedCanvasDisplay.set(canvas, canvas.style.display);
            canvas.style.display = "none";
        }
        const div = document.createElement("div");
        div.className = "gs-graded-chart";
        div.dataset.gsWidth = size.w;
        div.dataset.gsHeight = size.h;
        div.style.cssText = "position: relative; width: 100%; font-size: 12px;";
        container.appendChild(div);
        gsRenderChart(div);
    }
}

function gsRenderAll() {
    document.querySelectorAll(".gs-graded-chart").forEach(gsRenderChart);
}

function gsRenderChart(div) {
    div.replaceChildren();
    const colors = seriesColors(gsChart.series, getComputedStyle(document.body).backgroundColor);
    const visible = gsChart.series.filter(s => gsChart.visible.has(s.gradeText));

    const header = document.createElement("div");
    header.style.cssText = "display: flex; justify-content: flex-end; margin-bottom: 4px;";
    const select = document.createElement("select");
    select.className = "form-select form-select-sm";
    select.style.cssText = "width: auto;";
    select.title = "Language";
    for (const { language, count } of languagesInRecord(gsChart.record)) {
        const o = document.createElement("option");
        o.value = language;
        o.textContent = language.toUpperCase() + " (" + count + ")";
        o.selected = language === gsChart.language;
        select.appendChild(o);
    }
    select.addEventListener("change", () => {
        gsSetLanguage(select.value);
        gsRenderAll();
    });
    header.appendChild(select);
    div.appendChild(header);

    if (visible.length) {
        div.appendChild(gsBuildSvg(div, visible, colors));
    } else {
        const empty = document.createElement("div");
        empty.className = "text-muted small";
        empty.style.cssText = "padding: 24px 0; text-align: center;";
        empty.textContent = "No graded sightings yet for this language";
        div.appendChild(empty);
    }
    div.appendChild(gsBuildLegend(colors));
}

function gsBuildSvg(div, visible, colors) {
    // The container has a fixed height (h-100): leave room for the header and legend rows.
    const counts = new Map();
    for (const s of gsChart.series) counts.set(s.grader, (counts.get(s.grader) || 0) + 1);
    const legendRows = Math.max(0, ...counts.values());
    const W = Number(div.dataset.gsWidth);
    const H = Math.max(140, Number(div.dataset.gsHeight) - 40 - 20 * legendRows);
    const pad = { left: 78, right: 12, top: 10, bottom: 24 };
    const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
    const n = gsChart.series[0].days.length;
    const max = Math.max(...visible.flatMap(s => s.days.map(d => d.price || 0)));
    const ticks = yAxisTicks(max);
    const top = ticks[ticks.length - 1];
    const x = i => pad.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
    const y = v => pad.top + plotH - (v / top) * plotH;

    const svg = gsSvg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Graded price history" });
    svg.style.cssText = "display: block; width: 100%; height: auto; color: inherit; overflow: visible;";

    for (const t of ticks) {
        svg.appendChild(gsSvg("line", { x1: pad.left, x2: W - pad.right, y1: y(t), y2: y(t), stroke: "var(--bs-border-color)", "stroke-width": 1 }));
        const label = gsSvg("text", { x: pad.left - 6, y: y(t) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--bs-secondary-color)" });
        label.textContent = formatPrice(t);
        svg.appendChild(label);
    }
    const days = gsChart.series[0].days;
    days.forEach((d, i) => {
        if ((n - 1 - i) % 5) return;
        const label = gsSvg("text", { x: x(i), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: "var(--bs-secondary-color)" });
        label.textContent = d.date.slice(8, 10) + "." + d.date.slice(5, 7) + ".";
        svg.appendChild(label);
    });

    for (const s of visible) {
        const color = colors.get(s.gradeText);
        let path = "", prev = null;
        s.days.forEach((d, i) => {
            if (d.price === null) { prev = null; return; }
            path += prev === null ? `M${x(i)} ${y(d.price)}` : `H${x(i)} V${y(d.price)}`;
            prev = d.price;
        });
        svg.appendChild(gsSvg("path", { d: path, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
        s.days.forEach((d, i) => {
            if (d.seen) svg.appendChild(gsSvg("circle", { cx: x(i), cy: y(d.price), r: 2.5, fill: color }));
        });
    }

    const tooltip = document.createElement("div");
    tooltip.style.cssText = "position: absolute; display: none; pointer-events: none; z-index: 5; padding: 4px 8px; border-radius: 4px; " +
        "border: 1px solid var(--bs-border-color); background: var(--bs-body-bg); color: var(--bs-body-color); white-space: nowrap; font-size: 12px;";
    div.appendChild(tooltip);
    const cursor = gsSvg("line", { y1: pad.top, y2: pad.top + plotH, stroke: "var(--bs-secondary-color)", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
    svg.appendChild(cursor);
    const overlay = gsSvg("rect", { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: "transparent" });
    overlay.addEventListener("mousemove", e => {
        const box = svg.getBoundingClientRect();
        const vx = ((e.clientX - box.left) / box.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((vx - pad.left) / plotW) * (n - 1))));
        const lines = visible.filter(s => s.days[i].price !== null)
            .map(s => `${formatDate(days[i].date, false)} · ${s.gradeText} · ${formatPrice(s.days[i].price)}`);
        cursor.setAttribute("x1", x(i));
        cursor.setAttribute("x2", x(i));
        cursor.setAttribute("visibility", "visible");
        if (!lines.length) { tooltip.style.display = "none"; return; }
        tooltip.replaceChildren(...lines.map(t => Object.assign(document.createElement("div"), { textContent: t })));
        tooltip.style.display = "block";
        const divBox = div.getBoundingClientRect();
        const left = (x(i) / W) * box.width + box.left - divBox.left;
        const flip = left > divBox.width / 2;
        tooltip.style.left = flip ? "" : left + 10 + "px";
        tooltip.style.right = flip ? divBox.width - left + 10 + "px" : "";
        tooltip.style.top = e.clientY - divBox.top + 10 + "px";
    });
    overlay.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
        cursor.setAttribute("visibility", "hidden");
    });
    svg.appendChild(overlay);
    return svg;
}

function gsBuildLegend(colors) {
    const lastSeen = lastSeenByGrade(gsChart.record, [gsChart.language]);
    const byGrader = new Map();
    for (const s of gsChart.series) {
        if (!byGrader.has(s.grader)) byGrader.set(s.grader, []);
        byGrader.get(s.grader).push(s);
    }
    const legend = document.createElement("div");
    legend.style.cssText = `display: grid; grid-template-columns: repeat(${byGrader.size}, minmax(0, max-content)); column-gap: 16px; margin-top: 6px;`;
    for (const list of byGrader.values()) {
        const col = document.createElement("div");
        col.style.cssText = "display: flex; flex-direction: column; align-items: flex-start; gap: 2px;";
        for (const s of list) col.appendChild(gsLegendEntry(s, colors.get(s.gradeText), lastSeen.get(s.gradeText)));
        legend.appendChild(col);
    }
    return legend;
}

function gsLegendEntry(s, color, last) {
    const shown = gsChart.visible.has(s.gradeText);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", String(shown));
    b.style.cssText = "display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; white-space: nowrap;" +
        (shown ? "" : " text-decoration: line-through; opacity: .6;");
    const swatch = document.createElement("span");
    swatch.style.cssText = `display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${color};`;
    const label = document.createElement("span");
    const current = s.days[s.days.length - 1].price;
    if (current !== null || !last) {
        const lastValue = [...s.days].reverse().find(d => d.price !== null).price;
        label.textContent = `${s.gradeText} (${formatPrice(lastValue)})`;
    } else {
        label.textContent = `${s.gradeText} (${formatPrice(last.price)} · ${formatDate(last.date, false)})`;
        label.style.color = "var(--bs-secondary-color)";
        b.title = "Last seen " + formatDate(last.date, true);
    }
    b.append(swatch, label);
    b.addEventListener("click", () => {
        if (gsChart.visible.has(s.gradeText)) gsChart.visible.delete(s.gradeText);
        else gsChart.visible.add(s.gradeText);
        gsRenderAll();
    });
    return b;
}
