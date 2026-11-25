const form = document.querySelector("#scenario-form");
const presetOptions = document.querySelector("#preset-options");
const calculateButton = document.querySelector("#calculate");
const statusMessage = document.querySelector("#status");
const results = document.querySelector("#results");
const stateFilter = document.querySelector("#state-filter");
const factorFilter = document.querySelector("#factor-filter");
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const preciseDecimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
let model;
let result;
let inputsChanged = false;
let requestVersion = 0;

function formatNumber(value) {
  return decimal.format(value);
}

function formatValue(value) {
  return preciseDecimal.format(value);
}

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function numberInput(name, maximum = 1) {
  const input = element("input");
  input.type = "number";
  input.name = name;
  input.min = "0";
  input.max = String(maximum);
  input.step = "any";
  input.required = true;
  return input;
}

function addInputs() {
  const initial = document.querySelector("#initial-fields");
  model.states.forEach((title, index) => {
    const label = element("label", undefined, "field-row");
    label.append(
      element("span", `X${index + 1} · ${title}`, "field-label"),
      numberInput(`state-${index}`),
    );
    initial.append(label);
  });

  const factors = document.querySelector("#factor-fields");
  model.factors.forEach((title, index) => {
    const group = element("fieldset", undefined, "factor-field");
    const start = element("label", "Начало");
    const end = element("label", "Конец");
    start.append(numberInput(`factor-${index}-0`));
    end.append(numberInput(`factor-${index}-1`));
    group.append(element("legend", `F${index + 1} · ${title}`), start, end);
    factors.append(group);
  });

  const coefficients = document.querySelector("#coefficient-fields");
  model.terms.forEach(({ id, expression }, index) => {
    const label = element("label", undefined, "field-row");
    const name = element("span", id, "field-label");
    name.append(element("span", expression, "term-expression"));
    label.append(name, numberInput(`coefficient-${index}`, 2));
    coefficients.append(label);
  });
}

function setOptions(select, titles, prefix, allLabel) {
  select.append(new Option(allLabel, "all"));
  titles.forEach((title, index) => {
    select.append(new Option(`${prefix}${index + 1} · ${title}`, index));
  });
}

function applyPreset() {
  const { initial, factors } = model.presets[form.elements.preset.value];
  initial.forEach((value, index) => {
    form.elements[`state-${index}`].value = value;
  });
  factors.forEach(([start, end], index) => {
    form.elements[`factor-${index}-0`].value = start;
    form.elements[`factor-${index}-1`].value = end;
  });
  model.terms.forEach(({ value }, index) => {
    form.elements[`coefficient-${index}`].value = value;
  });
}

function scenarioData() {
  const number = (name) => form.elements[name].valueAsNumber;
  return {
    initial: model.states.map((_, index) => number(`state-${index}`)),
    factors: model.factors.map((_, index) => [
      number(`factor-${index}-0`),
      number(`factor-${index}-1`),
    ]),
    coefficients: model.terms.map((_, index) => number(`coefficient-${index}`)),
  };
}

function setStatus(message, error = false) {
  statusMessage.textContent = message;
  statusMessage.toggleAttribute("data-error", error);
}

function renderLineChart(values, titles, prefix, filter, chartId, legendId) {
  const labels = titles.map((title, index) => `${prefix}${index + 1} · ${title}`);
  const indices = filter.value === "all"
    ? titles.map((_, index) => index)
    : [Number(filter.value)];
  drawLineChart(document.querySelector(chartId), result.times, values, indices, labels);
  const legend = document.querySelector(legendId);
  legend.replaceChildren(...indices.map((index) => {
    const item = element("li");
    const swatch = element("span", undefined, "swatch");
    swatch.style.backgroundColor = chartColors[index];
    item.append(swatch, labels[index]);
    return item;
  }));
}

function renderCharts() {
  if (!result) return;
  renderLineChart(result.states, model.states, "X", stateFilter, "#state-chart", "#state-legend");
  renderLineChart(result.factors, model.factors, "F", factorFilter, "#factor-chart", "#factor-legend");
  document.querySelectorAll("#quarters canvas").forEach((canvas, index) => {
    const { time, values } = result.quarters[index];
    drawRadarChart(canvas, values, time, model.states);
  });
}

function renderResults() {
  const last = result.quarters.at(-1).values;
  document.querySelector("#metrics").replaceChildren(...[2, 5, 6].map((index) => {
    const metric = element("div", undefined, "metric");
    metric.append(element("strong", formatValue(last[index])), element("span", model.states[index]));
    return metric;
  }));

  document.querySelector("#quarters").replaceChildren(...result.quarters.map(({ time }, index) => {
    const name = `${index + 1}-я четверть · t = ${formatNumber(time)}`;
    const figure = element("figure", undefined, "quarter");
    const plot = element("div", undefined, "plot");
    const canvas = element("canvas");
    canvas.setAttribute("role", "img");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", `Лепестковая диаграмма. ${name}`);
    canvas.setAttribute("aria-describedby", "radar-keys");
    plot.append(canvas);
    figure.append(element("figcaption", name), plot);
    return figure;
  }));

  const table = element("table");
  const header = table.createTHead().insertRow();
  for (const title of ["Показатель", ...result.quarters.map(({ time }) => formatNumber(time))]) {
    const cell = element("th", title);
    cell.scope = "col";
    header.append(cell);
  }
  const body = table.createTBody();
  model.states.forEach((title, index) => {
    const row = body.insertRow();
    const label = element("th", `X${index + 1} · ${title}`);
    label.scope = "row";
    row.append(label);
    result.quarters.forEach(({ values }) => {
      row.insertCell().textContent = formatValue(values[index]);
    });
  });
  document.querySelector("#quarter-table").replaceChildren(table);

  results.hidden = false;
  document.querySelector("#result-nav").hidden = false;
  renderCharts();
}

async function calculate(event) {
  event?.preventDefault();
  if (!model || !form.reportValidity()) return;

  const version = ++requestVersion;
  calculateButton.disabled = true;
  inputsChanged = false;
  setStatus("Считаем…");
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioData()),
    });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(data.error || "Сервер отклонил расчёт.");
    result = data;
    renderResults();
    setStatus(inputsChanged ? "Параметры изменились. Рассчитайте заново." : "Расчёт готов.");
  } catch (error) {
    if (version !== requestVersion) return;
    const message = error instanceof TypeError
      ? "Проверьте, запущен ли Python-сервер, и повторите расчёт."
      : error.message;
    setStatus(`Ошибка расчёта. ${message}`, true);
  } finally {
    if (version === requestVersion) calculateButton.disabled = false;
  }
}

async function start() {
  try {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error();
    model = await response.json();
    addInputs();
    setOptions(stateFilter, model.states, "X", "Все показатели");
    setOptions(factorFilter, model.factors, "F", "Все факторы");
    applyPreset();
    presetOptions.disabled = false;
    await calculate();
  } catch {
    setStatus("Не удалось загрузить модель. Проверьте запуск сервера и обновите страницу.", true);
  }
}

form.addEventListener("submit", calculate);
form.addEventListener("input", (event) => {
  if (event.target.type === "number") {
    inputsChanged = true;
    if (!calculateButton.disabled) setStatus("Параметры изменились. Рассчитайте заново.");
  }
});
presetOptions.addEventListener("change", () => {
  applyPreset();
  calculate();
});
stateFilter.addEventListener("change", renderCharts);
factorFilter.addEventListener("change", renderCharts);
window.addEventListener("resize", renderCharts);
start();
