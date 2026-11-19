/**
 * Страница SQL-песочницы: поле с подсветкой, запуск в воркере, таблица результата, схема,
 * примеры, ссылка с запросом и таблица различий движков.
 *
 * Зависший запрос (бесконечный WITH RECURSIVE, огромное соединение) не вешает вкладку: воркер
 * убивается по таймеру и поднимается заново с исходной базой.
 */
import { highlightSql, sqlNames, shareLink, queryFromUrl, ruError } from "./lib.js";
import { EXAMPLES, ENGINE_DIFFS, AUTO_TRANSLATED } from "./content.js";

const TIMEOUT_MS = 3000;

const $ = (id) => document.getElementById(id);
const editor = $("sql");
const layer = $("hl");
const runBtn = $("run");
const resetBtn = $("reset");
const shareBtn = $("share");
const shareOut = $("share-out");
const hint = $("hint");
const statusEl = $("status");
const noticeEl = $("notice");
const translatedEl = $("translated");
const errorEl = $("error");
const resultEl = $("result");
const picker = $("example");
const exampleNote = $("example-note");

let worker = null;
let timer = null;
let state = "boot";
let initSql = null;
let pending = null;
let schema = [];
let baseTables = null;
let names = new Set();

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KBD = isMac ? "Cmd+Enter – выполнить" : "Ctrl+Enter – выполнить";

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ── Поле ввода ── */

/** Подсветка лежит слоем под прозрачным полем; поле растет по содержимому, поэтому слои не разъезжаются. */
function paint() {
  layer.innerHTML = highlightSql(editor.value, names) + "\n ";
  editor.style.height = "auto";
  editor.style.height = `${editor.scrollHeight}px`;
}

function setQuery(text) {
  editor.value = text;
  paint();
}

/** Вставка имени таблицы или колонки в место каретки. */
function insert(text) {
  if (editor.disabled) return;
  const from = editor.selectionStart ?? editor.value.length;
  const to = editor.selectionEnd ?? from;
  const before = editor.value.slice(0, from);
  const chunk = (before && !/[\s.(,]$/.test(before) ? " " : "") + text;
  editor.value = before + chunk + editor.value.slice(to);
  paint();
  editor.focus();
  const pos = from + chunk.length;
  editor.setSelectionRange(pos, pos);
}

editor.addEventListener("input", paint);
editor.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  }
});

/* ── Состояние и вывод ── */

function setState(next) {
  state = next;
  runBtn.disabled = next !== "ready";
  resetBtn.disabled = next === "boot";
  runBtn.setAttribute("aria-busy", String(next === "running"));
  runBtn.textContent = next === "running" ? "Выполняется…" : "Выполнить";
  hint.textContent = next === "boot" ? "База загружается…" : KBD;
}

function showNotice(text) {
  noticeEl.hidden = !text;
  noticeEl.textContent = text || "";
}

function clearOutput() {
  statusEl.textContent = "";
  translatedEl.hidden = true;
  errorEl.hidden = true;
  errorEl.replaceChildren();
  resultEl.replaceChildren();
}

function showError(raw, friendly) {
  errorEl.replaceChildren(el("span", {}, friendly || ruError(raw)));
  if (raw) errorEl.append(el("code", {}, `SQLite: ${raw}`));
  // Удаленная исходная таблица: голое "no such table" читается как поломка песочницы.
  const missing = raw && raw.match(/no such table: (?:main\.)?(\w+)/i)?.[1];
  if (missing && baseTables?.has(missing.toLowerCase())) {
    errorEl.append(el("span", { style: "display:block;margin-top:4px;color:var(--ink-2)" }, `Таблица ${missing} есть в исходной базе – похоже, ее удалили здесь. Кнопка "Вернуть базу к исходной" вернет все как было.`));
  }
  errorEl.hidden = false;
}

function renderResult(msg) {
  const parts = [];
  if (msg.statements > 1) parts.push(`Выполнено операторов: ${msg.statements}.`);
  if (msg.changed > 0) parts.push(`Изменено строк: ${msg.changed}.`);
  parts.push(msg.last ? `Строк в выборке: ${msg.last.total}.` : "Выборки в запросе нет.");
  parts.push(`${msg.ms} мс`);
  statusEl.textContent = parts.join(" ");

  if (msg.translated) {
    translatedEl.replaceChildren("Запрос написан под MySQL, поэтому перед выполнением его переписали для SQLite:", el("code", {}, msg.translated));
    translatedEl.hidden = false;
  }

  const last = msg.last;
  if (!last || !last.columns.length) return;
  const box = el("div", { class: "result", tabindex: "0", role: "region", "aria-label": "Результат запроса" });
  const table = el("table");
  const head = el("tr");
  for (const c of last.columns) head.append(el("th", { scope: "col" }, c));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  const body = el("tbody");
  for (const row of last.rows) {
    const tr = el("tr");
    for (const v of row) {
      if (v === null) tr.append(el("td", { class: "null" }, "NULL"));
      else tr.append(el("td", {}, v));
    }
    body.append(tr);
  }
  table.append(body);
  box.append(table);
  if (!last.rows.length) box.append(el("p", { class: "empty" }, "Запрос не вернул ни одной строки."));
  if (last.total > last.rows.length) box.append(el("p", { class: "empty" }, `Показаны первые ${last.rows.length} строк из ${last.total}.`));
  resultEl.append(box);
}

/* ── Схема ── */

function renderSchema(next) {
  if (!next) return;
  schema = next;
  if (!baseTables) baseTables = new Set(next.map((t) => t.name.toLowerCase()));
  names = sqlNames(next);
  paint();
  for (const host of document.querySelectorAll("[data-schema]")) {
    const ul = el("ul");
    for (const t of next) {
      const li = el("li");
      const tb = el("button", { type: "button", class: "t", title: `Подставить ${t.name}` }, t.name);
      tb.addEventListener("click", () => insert(t.name));
      li.append(tb);
      if (!baseTables.has(t.name.toLowerCase())) li.append(el("span", { class: "mine" }, "создана вами"));
      const cols = el("div", { class: "cols" });
      t.columns.forEach((c, i) => {
        if (i) cols.append(el("span", { class: "sep" }, ", "));
        const b = el("button", { type: "button", title: c.type ? `${c.name} – ${c.type}` : c.name }, c.name);
        b.addEventListener("click", () => insert(c.name));
        cols.append(b);
      });
      li.append(cols);
      ul.append(li);
    }
    host.replaceChildren(ul);
  }
}

/* ── Воркер ── */

function boot() {
  if (worker) worker.terminate();
  worker = new Worker("worker.js");
  worker.onmessage = onMessage;
  worker.onerror = () => {
    clearTimeout(timer);
    setState("ready");
    showError("", "Движок базы не загрузился. Обновите страницу.");
  };
  setState("boot");
  worker.postMessage({ type: "init", initSql });
}

function onMessage(e) {
  const msg = e.data;
  clearTimeout(timer);
  if (msg.type === "ready") {
    renderSchema(msg.schema);
    $("engine").textContent = `SQLite ${msg.version} в браузере`;
    setState("ready");
    if (pending !== null) {
      const q = pending;
      pending = null;
      run(q);
    }
  } else if (msg.type === "done") {
    setState("ready");
    clearOutput();
    renderSchema(msg.schema);
    renderResult(msg);
  } else if (msg.type === "error") {
    setState("ready");
    clearOutput();
    renderSchema(msg.schema);
    showError(msg.error);
  }
}

function run(text) {
  const sql = text ?? editor.value;
  if (!sql.trim()) return;
  if (state === "boot") {
    pending = sql;
    return;
  }
  if (state !== "ready") return;
  setState("running");
  showNotice("");
  shareOut.hidden = true;
  worker.postMessage({ type: "run", sql });
  timer = setTimeout(() => {
    clearOutput();
    showNotice(`Запрос выполнялся дольше ${TIMEOUT_MS / 1000} секунд и был остановлен. База вернулась к исходному состоянию.`);
    boot();
  }, TIMEOUT_MS);
}

runBtn.addEventListener("click", () => run());

resetBtn.addEventListener("click", () => {
  if (state === "boot") return;
  if (state === "running") {
    // Долгий запрос не ждем: новый воркер с чистой базой.
    clearTimeout(timer);
    boot();
  } else {
    setState("boot");
    worker.postMessage({ type: "reset" });
  }
  clearOutput();
  showNotice("База вернулась к исходному состоянию: ваши правки и созданные таблицы удалены.");
});

/* ── Ссылка с запросом ── */

shareBtn.addEventListener("click", async () => {
  const url = await shareLink(location.href, editor.value);
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url);
    shareOut.hidden = true;
    showNotice("Ссылка на запрос скопирована. Кто ее откроет, увидит этот запрос и его результат.");
  } catch {
    // Буфер обмена недоступен (старый браузер, нет разрешения) – показываем ссылку для ручного копирования.
    shareOut.value = url;
    shareOut.hidden = false;
    shareOut.focus();
    shareOut.select();
    showNotice("Скопируйте ссылку из поля выше.");
  }
});

/* ── Примеры ── */

const GROUPS = { basics: "Основы SQL", bugs: "Ищем баги в данных" };
for (const [key, label] of Object.entries(GROUPS)) {
  const group = el("optgroup", { label });
  EXAMPLES.forEach((x, i) => {
    if (x.group === key) group.append(el("option", { value: String(i) }, x.title));
  });
  picker.append(group);
}
picker.addEventListener("change", () => {
  const x = EXAMPLES[Number(picker.value)];
  if (!picker.value || !x) {
    exampleNote.textContent = "";
    return;
  }
  exampleNote.textContent = x.note;
  setQuery(x.sql);
  run(x.sql);
});

/* ── Различия движков ── */

function scrollToEditor() {
  const top = editor.closest(".sql-box").getBoundingClientRect().top + window.scrollY - 16;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}

const diffs = $("diffs");
ENGINE_DIFFS.forEach((d, i) => {
  const details = el("details");
  if (i === 0) details.open = true;
  details.append(el("summary", {}, d.topic));
  const body = el("div", { class: "body" });
  body.append(el("pre", {}, d.query));
  const tryBtn = el("button", { type: "button", class: "btn-link" }, "Попробовать в песочнице");
  tryBtn.addEventListener("click", () => {
    picker.value = "";
    exampleNote.textContent = "";
    setQuery(d.query);
    scrollToEditor();
    run(d.query);
  });
  body.append(tryBtn);
  const dl = el("dl");
  for (const [k, v] of [["MySQL 8.0", d.mysql], ["SQLite – эта песочница", d.sqlite], ["PostgreSQL", d.postgres]]) {
    const cell = el("div");
    cell.append(el("dt", {}, k), el("dd", {}, v));
    dl.append(cell);
  }
  body.append(dl);
  details.append(body);
  const li = el("li");
  li.append(details);
  diffs.append(li);
});

const translations = $("translations");
for (const t of AUTO_TRANSLATED) {
  const li = el("li");
  li.append(el("code", {}, t.from), `→ ${t.to}`);
  translations.append(li);
}

/* ── Старт ── */

const linked = await queryFromUrl(location.href);
setQuery(linked ?? EXAMPLES[0].sql);
if (!linked) {
  picker.value = "0";
  exampleNote.textContent = EXAMPLES[0].note;
}
setState("boot");

fetch("shop.sql")
  .then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.text();
  })
  .then((text) => {
    initSql = text;
    // Первый запрос выполняется сам: со ссылки – присланный, иначе первый пример.
    pending = editor.value;
    boot();
  })
  .catch(() => showError("", "Не удалось загрузить учебную базу. Обновите страницу."));
