/** Страница калькулятора: поля -> расчет из lib.js -> таблица значений и классов. Без сети. */
import { boundaries } from "./lib.js";

const $ = (id) => document.getElementById(id);
const form = $("bv-form");
const out = $("bv-out");

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function verdict(valid) {
  return el("span", valid ? "bv-tag ok" : "bv-tag no", valid ? "принять" : "отклонить");
}

function render() {
  const data = new FormData(form);
  const res = boundaries({
    min: data.get("min"),
    max: data.get("max"),
    step: data.get("step"),
    points: data.get("points") === "3" ? 3 : 2,
  });
  out.replaceChildren();
  if (!res.ok) {
    out.append(el("div", "error", res.error));
    return;
  }

  const head = el("p", "bv-step");
  head.append("Шаг: ", el("b", "", res.step));
  out.append(head);

  const values = el("div", "panel bv-block");
  values.append(el("h3", "", "Граничные значения"));
  const list = el("ul", "bv-values");
  for (const v of res.values) {
    const li = el("li");
    li.append(el("code", "bv-num", v.value), verdict(v.valid), el("span", "bv-note", v.note));
    list.append(li);
  }
  values.append(list);
  out.append(values);

  const classes = el("div", "panel bv-block");
  classes.append(el("h3", "", "Классы эквивалентности"));
  const cl = el("ul", "bv-values bv-classes");
  for (const c of res.classes) {
    const li = el("li");
    const name = el("span", "bv-cname");
    name.append(el("b", "", c.name), el("span", "bv-range", c.range));
    const ex = el("span", "bv-note");
    ex.append("пример: ", el("code", "", c.example));
    li.append(name, verdict(c.valid), ex);
    cl.append(li);
  }
  classes.append(cl);
  classes.append(el("p", "after", "Из каждого класса достаточно одного значения: программа обрабатывает их одинаково."));
  out.append(classes);

  for (const w of res.warnings) out.append(el("div", "notice", w));
  out.append(el("p", "muted bv-extra", "Еще проверьте пустое поле, буквы и пробелы, очень длинный ввод, точку и запятую как разделитель."));
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  render();
});
form.addEventListener("change", (e) => {
  if (e.target.name === "points") render();
});
render();
