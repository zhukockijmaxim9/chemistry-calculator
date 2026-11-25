const chartColors = [
  "#116e76", "#a4421a", "#284e96", "#9c286a", "#4d6927", "#ab282e",
  "#5b4293", "#91620f", "#007eac", "#405d7b", "#925c6d",
];

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

function drawLineChart(canvas, times, values, indices) {
  const { context, width, height } = canvasContext(canvas);
  const left = 40;
  const top = 12;
  const right = width - 20;
  const bottom = height - 35;
  const x = (time) => left + time * (right - left);
  const y = (value) => bottom - value * (bottom - top);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

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
}

function drawRadarChart(canvas, values) {
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
}
