const chartColors = [
  "#08796e", "#b04b21", "#315dc6", "#ad3e79", "#548135", "#c83c46",
  "#7851ad", "#9a6917", "#007fa7", "#4c6382", "#8d5465",
];
const chartInspections = new WeakMap();
let dismissActiveInspection;

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") dismissActiveInspection?.();
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".plot")) dismissActiveInspection?.();
});

function enableChartInspection(canvas, interactions) {
  const previous = chartInspections.get(canvas);
  if (previous) {
    previous(interactions);
    return;
  }

  const plot = canvas.parentElement;
  const tooltip = element("div", undefined, "plot-tooltip");
  const time = element("span", undefined, "tooltip-time");
  const rows = element("div", undefined, "tooltip-rows");
  const markers = element("div", undefined, "plot-markers");
  const guide = element("span", undefined, "plot-guide");
  const announcement = element("span", undefined, "sr-only");
  tooltip.append(time, rows);
  tooltip.setAttribute("aria-hidden", "true");
  markers.setAttribute("aria-hidden", "true");
  guide.setAttribute("aria-hidden", "true");
  announcement.setAttribute("role", "status");
  plot.append(guide, markers, tooltip, announcement);

  let selection;

  function hide() {
    if (dismissActiveInspection === hide) dismissActiveInspection = undefined;
    selection = undefined;
    tooltip.hidden = true;
    markers.hidden = true;
    guide.hidden = true;
    announcement.textContent = "";
  }

  function show(next, announce = false) {
    if (!next) {
      hide();
      return;
    }
    if (!announce && selection?.series === next.series && selection?.sample === next.sample) return;
    if (dismissActiveInspection !== hide) dismissActiveInspection?.();
    dismissActiveInspection = hide;
    selection = next;

    const point = interactions.point(selection);
    const values = point.rows || [point];
    time.textContent = `t = ${formatNumber(point.time)}`;
    rows.replaceChildren(...values.map(({ color, label, value }) => {
      const row = element("div", undefined, "tooltip-row");
      const swatch = element("span", undefined, "tooltip-swatch");
      swatch.style.background = color;
      row.append(swatch, element("span", label), element("strong", formatValue(value)));
      return row;
    }));
    markers.replaceChildren(...values.map((entry) => {
      const marker = element("span", undefined, "plot-marker");
      marker.style.left = `${point.x}px`;
      marker.style.top = `${entry.y}px`;
      marker.style.backgroundColor = entry.color;
      return marker;
    }));
    tooltip.hidden = false;
    markers.hidden = false;

    const gap = 12;
    const edge = 6;
    const maxLeft = plot.clientWidth - tooltip.offsetWidth - edge;
    const rightOfPoint = point.x + gap;
    const left = rightOfPoint <= maxLeft ? rightOfPoint : point.x - tooltip.offsetWidth - gap;
    tooltip.style.left = `${Math.max(edge, Math.min(maxLeft, left))}px`;
    tooltip.style.top = `${Math.max(edge, Math.min(plot.clientHeight - tooltip.offsetHeight - edge, point.y - 16))}px`;

    guide.hidden = !point.guide;
    if (point.guide) {
      guide.style.left = `${point.x}px`;
      guide.style.top = `${point.guide.top}px`;
      guide.style.height = `${point.guide.height}px`;
    }
    if (announce) {
      announcement.textContent = `Момент ${formatNumber(point.time)}. ${point.label}. Значение ${formatValue(point.value)}.`;
    }
  }

  function pointFromEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    return interactions.pointer(event.clientX - bounds.left, event.clientY - bounds.top);
  }

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") show(pointFromEvent(event));
  });
  canvas.addEventListener("pointerdown", (event) => show(pointFromEvent(event)));
  plot.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") hide();
  });
  canvas.addEventListener("focus", () => {
    if (canvas.matches(":focus-visible")) show(interactions.keyboard("Home", selection), true);
  });
  canvas.addEventListener("blur", hide);
  plot.addEventListener("keydown", (event) => {
    if (event.target === canvas && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      show(interactions.keyboard(event.key, selection), true);
    }
  });

  chartInspections.set(canvas, (updated) => {
    interactions = updated;
    hide();
  });
  hide();
}

function canvasContext(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const density = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const context = canvas.getContext("2d");
  context.scale(density, density);
  context.font = "12px system-ui, sans-serif";
  return { context, width, height };
}

function drawLineChart(canvas, times, values, indices, labels) {
  const { context, width, height } = canvasContext(canvas);
  const left = 40;
  const top = 12;
  const right = width - 20;
  const bottom = height - 35;
  const x = (time) => left + time * (right - left);
  const y = (value) => bottom - value * (bottom - top);
  const ticks = width >= 520
    ? [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
    : [0, 0.25, 0.5, 0.75, 1];

  context.strokeStyle = "#dce5ed";
  context.fillStyle = "#506275";
  for (const tick of ticks) {
    context.beginPath();
    context.moveTo(left, y(tick));
    context.lineTo(right, y(tick));
    context.moveTo(x(tick), top);
    context.lineTo(x(tick), bottom);
    context.stroke();
    context.textAlign = "right";
    context.textBaseline = "middle";
    context.fillText(formatNumber(tick), left - 7, y(tick));
    context.textAlign = "center";
    context.fillText(formatNumber(tick), x(tick), bottom + 12);
  }
  context.fillText("Время", width / 2, height - 6);

  for (const index of indices) {
    context.strokeStyle = chartColors[index];
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x(times[0]), y(values[index][0]));
    for (let point = 1; point < times.length; point++) {
      context.lineTo(x(times[point]), y(values[index][point]));
    }
    context.stroke();
  }

  enableChartInspection(canvas, {
    pointer(mouseX, mouseY) {
      if (mouseX < left || mouseX > right || mouseY < top || mouseY > bottom) return;
      const sample = Math.round((mouseX - left) / (right - left) * (times.length - 1));
      const distance = (series) => Math.abs(y(values[series][sample]) - mouseY);
      const series = indices.reduce((nearest, index) => distance(index) < distance(nearest) ? index : nearest);
      return { series, sample };
    },
    keyboard(key, selection = { series: indices[0], sample: 0 }) {
      let { series, sample } = selection;
      const slot = indices.indexOf(series);
      if (key === "ArrowLeft") sample = Math.max(0, sample - 1);
      if (key === "ArrowRight") sample = Math.min(times.length - 1, sample + 1);
      if (key === "ArrowUp") series = indices[(slot + indices.length - 1) % indices.length];
      if (key === "ArrowDown") series = indices[(slot + 1) % indices.length];
      if (key === "Home") sample = 0;
      if (key === "End") sample = times.length - 1;
      return { series, sample };
    },
    point({ series, sample }) {
      return {
        x: x(times[sample]),
        y: y(values[series][sample]),
        label: labels[series],
        value: values[series][sample],
        time: times[sample],
        color: chartColors[series],
        guide: { top, height: bottom - top },
        rows: indices.length > 1 ? indices.map((index) => ({
          y: y(values[index][sample]),
          label: labels[index].split(" · ", 1)[0],
          value: values[index][sample],
          color: chartColors[index],
        })) : undefined,
      };
    },
  });
}

function drawRadarChart(canvas, values, time, labels) {
  const { context, width, height } = canvasContext(canvas);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(1, Math.min(centerX, centerY) - 24);

  function point(index, level) {
    const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2;
    return [
      centerX + Math.cos(angle) * radius * level,
      centerY + Math.sin(angle) * radius * level,
    ];
  }

  function polygon(levels) {
    context.beginPath();
    context.moveTo(...point(0, levels[0]));
    for (let index = 1; index < levels.length; index++) {
      context.lineTo(...point(index, levels[index]));
    }
    context.closePath();
  }

  context.strokeStyle = "#cedce6";
  for (const level of [0.25, 0.5, 0.75, 1]) {
    polygon(values.map(() => level));
    context.stroke();
  }
  context.fillStyle = "#506275";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelLevel = (radius + 13) / radius;
  values.forEach((_, index) => {
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(...point(index, 1));
    context.stroke();
    context.fillText(`X${index + 1}`, ...point(index, labelLevel));
  });

  polygon(values);
  context.fillStyle = "rgba(21, 93, 101, 0.22)";
  context.fill();
  context.strokeStyle = "#155d65";
  context.lineWidth = 2;
  context.stroke();

  enableChartInspection(canvas, {
    pointer(mouseX, mouseY) {
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance < 8 || distance > radius + 20) return;
      const turn = 2 * Math.PI;
      const angle = (Math.atan2(dy, dx) + Math.PI / 2 + turn) % turn;
      const series = Math.round(angle / turn * values.length) % values.length;
      return { series };
    },
    keyboard(key, selection = { series: 0 }) {
      let { series } = selection;
      if (key === "ArrowLeft" || key === "ArrowUp") series = (series + values.length - 1) % values.length;
      if (key === "ArrowRight" || key === "ArrowDown") series = (series + 1) % values.length;
      if (key === "Home") series = 0;
      if (key === "End") series = values.length - 1;
      return { series };
    },
    point({ series }) {
      const [x, y] = point(series, values[series]);
      return {
        x,
        y,
        label: `X${series + 1} · ${labels[series]}`,
        value: values[series],
        time,
        color: "#155d65",
      };
    },
  });
}
