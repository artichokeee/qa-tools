/**
 * Страница кроссворда: сетка из полей ввода (по одному на клетку – так на телефоне открывается
 * обычная клавиатура), стрелки, Backspace, автопереход, проверка и подсказка буквы.
 *
 * Кроссворд дня собирается из даты, "Новый" – из случайного зерна. Из зерна доска собирается
 * заново при каждой загрузке, поэтому в localStorage лежат только зерно и вписанные буквы.
 */
import { buildCrossword, cellsOf } from "./crossword.js";
import { rngOf } from "./rng.js";

const STORE = "qa-tools:crossword";
const KEEP_BOARDS = 6;
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
// Английская раскладка -> русская: чтобы печатать, не переключая язык.
const LAT = Object.fromEntries([..."qwertyuiop[]asdfghjkl;'zxcvbnm,.`"].map((c, i) => [c, "ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЕ"[i]]));

const $ = (id) => document.getElementById(id);
const boardEl = $("cw-board");
const titleEl = $("cw-title");
const currentEl = $("cw-current");
const statusEl = $("cw-status");
const acrossEl = $("cw-across");
const downEl = $("cw-down");
const checkBtn = $("cw-check");
const hintBtn = $("cw-hint");
const newBtn = $("cw-new");
const dailyBtn = $("cw-daily");

let terms = [];
let meta = null; // { key, day, daily, date }
let puzzle = null;
let cells = new Map(); // "x,y" -> { ch, no, across, down, input, el }
let entries = {};
let hinted = new Set();
let wrong = new Set();
let hints = 0;
let cur = null;
let dir = "across";
let solved = false;

/* ── Зерно и хранение ── */

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { key: `crossword:${iso}`, day: Math.floor(Date.UTC(y, m, day) / 86400000), daily: true, date: iso };
}

function random() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return { key: `crossword:r:${a[0].toString(36)}${a[1].toString(36)}`, day: a[0] % 10000, daily: false };
}

function readStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    return s && typeof s === "object" && s.boards ? s : { current: null, boards: {} };
  } catch {
    return { current: null, boards: {} };
  }
}

function fingerprint() {
  return puzzle.words.map((w) => `${w.no}${w.dir[0]}${w.word}`).join(",");
}

function save() {
  const s = readStore();
  s.current = meta;
  s.boards[meta.key] = { fp: fingerprint(), entries, hinted: [...hinted], hints, solved, at: Date.now() };
  const keys = Object.keys(s.boards).sort((a, b) => s.boards[b].at - s.boards[a].at);
  for (const k of keys.slice(KEEP_BOARDS)) delete s.boards[k];
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* приватный режим – партия просто не сохранится */
  }
}

/* ── Сборка и отрисовка ── */

function open(m) {
  meta = m;
  puzzle = buildCrossword(terms, rngOf(m.key), m.day);
  if (!puzzle) {
    statusEl.textContent = "Не получилось собрать кроссворд. Нажмите \"Новый кроссворд\".";
    return;
  }
  const saved = readStore().boards[m.key];
  const ok = Boolean(saved && saved.fp === fingerprint());
  entries = ok && saved.entries && typeof saved.entries === "object" ? saved.entries : {};
  hinted = new Set(ok && Array.isArray(saved.hinted) ? saved.hinted : []);
  hints = ok && Number.isInteger(saved.hints) ? saved.hints : 0;
  solved = ok && saved.solved === true;
  wrong = new Set();
  cur = null;
  dir = "across";
  build();
  renderClues();
  if (m.daily) {
    const [, mm, dd] = m.date.split("-").map(Number);
    titleEl.textContent = `Кроссворд дня, ${dd} ${MONTHS[mm - 1]}`;
  } else titleEl.textContent = "Случайный кроссворд";
  dailyBtn.hidden = m.daily && m.date === today().date;
  statusEl.textContent = solved ? "Кроссворд решен." : "";
  refresh();
  const first = puzzle.words.slice().sort((a, b) => a.no - b.no)[0];
  select(cellsOf(first)[0], first.dir, false);
  save();
}

function build() {
  cells = new Map();
  puzzle.words.forEach((w, idx) => {
    cellsOf(w).forEach((k, i) => {
      const c = cells.get(k) ?? { ch: w.word[i], no: null, across: -1, down: -1 };
      c[w.dir] = idx;
      if (i === 0) c.no = c.no ? Math.min(c.no, w.no) : w.no;
      cells.set(k, c);
    });
  });

  boardEl.style.setProperty("--w", puzzle.w);
  boardEl.replaceChildren();
  for (let y = 0; y < puzzle.h; y++) {
    for (let x = 0; x < puzzle.w; x++) {
      const k = `${x},${y}`;
      const c = cells.get(k);
      const div = document.createElement("div");
      if (!c) {
        div.className = "cw-void";
        boardEl.append(div);
        continue;
      }
      div.className = "cw-cell";
      div.dataset.k = k;
      if (c.no) {
        const no = document.createElement("span");
        no.className = "cw-no";
        no.textContent = c.no;
        div.append(no);
      }
      const input = document.createElement("input");
      input.className = "cw-in";
      input.type = "text";
      input.dataset.k = k;
      for (const [a, v] of Object.entries({ inputmode: "text", autocapitalize: "characters", autocomplete: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" })) input.setAttribute(a, v);
      input.setAttribute("aria-label", cellLabel(c, k));
      div.append(input);
      c.input = input;
      c.el = div;
      boardEl.append(div);
    }
  }
}

function cellLabel(c, k) {
  const parts = [];
  for (const d of ["across", "down"]) {
    if (c[d] === -1) continue;
    const w = puzzle.words[c[d]];
    parts.push(`${w.no} ${d === "across" ? "по горизонтали" : "по вертикали"}, буква ${cellsOf(w).indexOf(k) + 1} из ${w.word.length}`);
  }
  return parts.join("; ");
}

function renderClues() {
  for (const [d, list] of [["across", acrossEl], ["down", downEl]]) {
    list.replaceChildren();
    puzzle.words
      .map((w, idx) => ({ w, idx }))
      .filter(({ w }) => w.dir === d)
      .sort((a, b) => a.w.no - b.w.no)
      .forEach(({ w, idx }) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cw-clue";
        btn.dataset.idx = idx;
        const no = document.createElement("b");
        no.textContent = w.no;
        const len = document.createElement("span");
        len.className = "cw-len";
        len.textContent = ` (${w.word.length})`;
        btn.append(no, ` ${w.clue}`, len);
        btn.addEventListener("click", () => {
          const ks = cellsOf(w);
          select(ks.find((k) => !entries[k]) ?? ks[0], w.dir);
        });
        li.append(btn);
        list.append(li);
      });
  }
}

/** Буквы, отметки ошибок и подсказок, заполненные определения. */
function refresh() {
  for (const [k, c] of cells) {
    c.input.value = entries[k] ?? "";
    c.el.classList.toggle("wrong", wrong.has(k));
    c.el.classList.toggle("hinted", hinted.has(k));
  }
  boardEl.classList.toggle("solved", solved);
  for (const btn of document.querySelectorAll(".cw-clue")) {
    const w = puzzle.words[Number(btn.dataset.idx)];
    btn.classList.toggle("filled", cellsOf(w).every((k) => entries[k]));
  }
  hintBtn.disabled = solved;
}

function paint() {
  const word = wordIdx(cur, dir);
  const inWord = new Set(word === -1 ? [] : cellsOf(puzzle.words[word]));
  for (const [k, c] of cells) {
    c.el.classList.toggle("in-word", inWord.has(k));
    c.el.classList.toggle("active", k === cur);
  }
  for (const btn of document.querySelectorAll(".cw-clue")) btn.classList.toggle("active", Number(btn.dataset.idx) === word);
  if (word !== -1) {
    const w = puzzle.words[word];
    currentEl.replaceChildren();
    const b = document.createElement("b");
    b.textContent = `${w.no} ${w.dir === "across" ? "по горизонтали" : "по вертикали"}`;
    currentEl.append(b, ` – ${w.clue} (${w.word.length})`);
  }
}

/* ── Движение по сетке ── */

const wordIdx = (k, d) => (k && cells.has(k) ? cells.get(k)[d] : -1);

function select(k, d, focus = true) {
  if (!cells.has(k)) return;
  cur = k;
  if (d && wordIdx(k, d) !== -1) dir = d;
  else if (wordIdx(k, dir) === -1) dir = dir === "across" ? "down" : "across";
  paint();
  const input = cells.get(k).input;
  if (focus && document.activeElement !== input) input.focus({ preventScroll: false });
  if (document.activeElement === input) input.select();
}

function step(delta) {
  const word = wordIdx(cur, dir);
  if (word === -1) return;
  const ks = cellsOf(puzzle.words[word]);
  const next = ks[ks.indexOf(cur) + delta];
  if (next) select(next, dir);
}

function arrow(dx, dy) {
  const axis = dx ? "across" : "down";
  if (dir !== axis && wordIdx(cur, axis) !== -1) {
    dir = axis;
    paint();
    return;
  }
  let [x, y] = cur.split(",").map(Number);
  for (;;) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= puzzle.w || y >= puzzle.h) return;
    if (cells.has(`${x},${y}`)) return select(`${x},${y}`, axis);
  }
}

function nextWord(delta) {
  const order = puzzle.words.map((w, idx) => ({ w, idx })).sort((a, b) => (a.w.dir === b.w.dir ? a.w.no - b.w.no : a.w.dir === "across" ? -1 : 1));
  const at = order.findIndex((o) => o.idx === wordIdx(cur, dir));
  const { w } = order[(at + delta + order.length) % order.length];
  select(cellsOf(w)[0], w.dir);
}

/* ── Ввод ── */

function toLetter(ch) {
  if (!ch) return null;
  let c = ch.toUpperCase();
  if (LAT[ch.toLowerCase()]) c = LAT[ch.toLowerCase()];
  if (c === "Ё") c = "Е";
  return /^[А-Я]$/.test(c) ? c : null;
}

function setLetter(k, ch) {
  if (solved || hinted.has(k)) return;
  if (ch) entries[k] = ch;
  else delete entries[k];
  wrong.delete(k);
  if (ch && cells.size && [...cells].every(([key, c]) => entries[key] === c.ch)) finish();
  refresh();
  save();
}

function type(ch) {
  setLetter(cur, ch);
  step(1);
}

function erase() {
  if (entries[cur] && !hinted.has(cur)) return setLetter(cur, null);
  step(-1);
  setLetter(cur, null);
}

boardEl.addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("cw-in") || e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (map[e.key]) {
    e.preventDefault();
    arrow(...map[e.key]);
  } else if (e.key === "Backspace") {
    e.preventDefault();
    erase();
  } else if (e.key === "Delete") {
    e.preventDefault();
    setLetter(cur, null);
  } else if (e.key === "Tab") {
    e.preventDefault();
    nextWord(e.shiftKey ? -1 : 1);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggle();
  } else if (e.key.length === 1) {
    e.preventDefault();
    const ch = toLetter(e.key);
    if (ch) type(ch);
  }
});

// Телефонная клавиатура часто не сообщает клавишу в keydown – букву берем из события ввода.
boardEl.addEventListener("input", (e) => {
  const input = e.target;
  if (!input.classList.contains("cw-in")) return;
  const k = input.dataset.k;
  if (k !== cur) select(k, null, false);
  if (e.inputType && e.inputType.startsWith("delete")) {
    input.value = entries[k] ?? "";
    erase();
    return;
  }
  const ch = toLetter((e.data ?? input.value).slice(-1));
  input.value = entries[k] ?? "";
  if (ch) type(ch);
});

function toggle() {
  const other = dir === "across" ? "down" : "across";
  if (wordIdx(cur, other) !== -1) {
    dir = other;
    paint();
  }
}

let wasCurrent = false;
boardEl.addEventListener("pointerdown", (e) => {
  const k = e.target.closest(".cw-cell")?.dataset.k;
  wasCurrent = Boolean(k) && k === cur && document.activeElement === cells.get(k).input;
});
boardEl.addEventListener("click", (e) => {
  const k = e.target.closest(".cw-cell")?.dataset.k;
  if (!k) return;
  if (wasCurrent) toggle();
  else select(k);
  wasCurrent = false;
});
boardEl.addEventListener("focusin", (e) => {
  const k = e.target.dataset?.k;
  if (k && k !== cur) select(k, null, false);
  else if (k) e.target.select();
});

/* ── Кнопки ── */

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function finish() {
  solved = true;
  wrong = new Set();
  statusEl.textContent = hints
    ? `Кроссворд решен! ${hints} ${plural(hints, "подсказка", "подсказки", "подсказок")}.`
    : "Кроссворд решен без подсказок!";
}

checkBtn.addEventListener("click", () => {
  wrong = new Set();
  let empty = 0;
  for (const [k, c] of cells) {
    if (!entries[k]) empty++;
    else if (entries[k] !== c.ch) wrong.add(k);
  }
  if (!wrong.size && !empty) finish();
  else if (!wrong.size) statusEl.textContent = `Ошибок нет. Осталось заполнить ${empty} ${plural(empty, "клетку", "клетки", "клеток")}.`;
  else {
    statusEl.textContent = `${plural(wrong.size, "Неверна", "Неверны", "Неверно")} ${wrong.size} ${plural(wrong.size, "клетка", "клетки", "клеток")} – они отмечены красным.` + (empty ? ` Пустых: ${empty}.` : "");
  }
  refresh();
  save();
});

hintBtn.addEventListener("click", () => {
  const bad = (k) => entries[k] !== cells.get(k).ch;
  const word = wordIdx(cur, dir);
  const target = (cur && bad(cur) && cur) || (word !== -1 && cellsOf(puzzle.words[word]).find(bad)) || [...cells.keys()].find(bad);
  if (!target) return;
  entries[target] = cells.get(target).ch;
  hinted.add(target);
  wrong.delete(target);
  hints++;
  if ([...cells].every(([k, c]) => entries[k] === c.ch)) finish();
  else statusEl.textContent = `Открыта буква. ${plural(hints, "Подсказка", "Подсказки", "Подсказок")}: ${hints}.`;
  refresh();
  save();
  select(target, word !== -1 && cellsOf(puzzle.words[word]).includes(target) ? dir : null);
});

newBtn.addEventListener("click", () => open(random()));
dailyBtn.addEventListener("click", () => open(today()));

/* ── Старт ── */

fetch("../data/glossary.json")
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  })
  .then((list) => {
    terms = list;
    const saved = readStore().current;
    const now = today();
    const resume = saved && typeof saved.key === "string" && (!saved.daily || saved.date === now.date);
    open(resume ? saved : now);
  })
  .catch(() => {
    statusEl.textContent = "Не удалось загрузить словарь. Обновите страницу.";
  });
