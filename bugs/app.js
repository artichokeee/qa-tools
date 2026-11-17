/** Страница "Найди баги": клик по элементу макета -> проверка по BUGS -> счетчик и список. Без сети. */
import { BUGS, TOTAL, mark, emptyState, restore } from "./bugs.js";

const KEY = "qa-tools:bugs";
const $ = (id) => document.getElementById(id);
const mock = $("mock");
const countEl = $("bg-count");
const barEl = $("bg-bar");
const listEl = $("bg-list");
const statusEl = $("bg-status");
const doneEl = $("bg-done");
const revealBtn = $("bg-reveal");
const resetBtn = $("bg-reset");
const spots = [...mock.querySelectorAll("[data-spot]")];

let state = restore(localStorage.getItem(KEY));

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* приватный режим – прогресс просто не сохранится */
  }
}

function li(no, text, cls) {
  const item = document.createElement("li");
  if (cls) item.className = cls;
  const n = document.createElement("span");
  n.className = "bg-no";
  n.textContent = no;
  const t = document.createElement("span");
  t.textContent = text;
  item.append(n, t);
  return item;
}

function render() {
  const found = state.found;
  countEl.textContent = `Найдено ${found.length} из ${TOTAL}`;
  barEl.style.width = `${(found.length / TOTAL) * 100}%`;
  barEl.parentElement.setAttribute("aria-valuenow", String(found.length));

  for (const el of spots) {
    const i = found.indexOf(el.dataset.spot);
    el.classList.toggle("found", i !== -1);
    el.classList.toggle("missed", state.revealed && i === -1 && el.dataset.spot in BUGS);
    if (i !== -1) el.dataset.order = String(i + 1);
    else delete el.dataset.order;
  }

  listEl.replaceChildren();
  found.forEach((spot, i) => listEl.append(li(i + 1, BUGS[spot])));
  if (state.revealed) {
    for (const spot of Object.keys(BUGS)) if (!found.includes(spot)) listEl.append(li("?", BUGS[spot], "missed"));
  }
  if (!listEl.children.length) {
    const empty = document.createElement("li");
    empty.className = "bg-empty";
    empty.textContent = "Пока ничего не найдено. Нажимайте на элементы страницы слева, которые выглядят неправильно.";
    listEl.append(empty);
  }

  const all = found.length === TOTAL;
  doneEl.hidden = !all;
  revealBtn.hidden = all || state.revealed;
  mock.classList.toggle("revealed", state.revealed);
}

function onPick(el) {
  const { state: next, result } = mark(state, el.dataset.spot);
  state = next;
  if (result === "hit") statusEl.textContent = `Баг ${state.found.length}: ${BUGS[el.dataset.spot]}`;
  else if (result === "again") statusEl.textContent = "Этот баг уже найден.";
  else if (result === "miss") {
    statusEl.textContent = "Здесь бага нет.";
    el.classList.remove("miss");
    void el.offsetWidth;
    el.classList.add("miss");
  } else statusEl.textContent = "Ответы уже показаны. Чтобы искать снова, нажмите \"Начать заново\".";
  save();
  render();
}

for (const el of spots) {
  if (el.tagName !== "BUTTON") {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
  }
  el.addEventListener("click", (e) => {
    e.preventDefault();
    onPick(el);
  });
  el.addEventListener("keydown", (e) => {
    if (el.tagName !== "BUTTON" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onPick(el);
    }
  });
}

revealBtn.addEventListener("click", () => {
  state = { ...state, revealed: true };
  statusEl.textContent = `Ответы показаны: пунктиром отмечены ненайденные баги.`;
  save();
  render();
});

resetBtn.addEventListener("click", () => {
  state = emptyState();
  statusEl.textContent = "Поиск начат заново.";
  save();
  render();
});

render();
