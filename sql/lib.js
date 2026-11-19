/**
 * Чистые функции песочницы: подсветка, ссылка с запросом, перевод ошибок SQLite на русский.
 * Без DOM, поэтому их проверяют тесты в Node (tests/lib.test.mjs).
 */

const KEYWORDS = new Set(
  `select from where group by having order limit offset join inner left right full outer cross on as and or not in is null like between exists union all distinct insert into values update set delete create table drop alter add primary key foreign references default case when then else end asc desc count sum avg min max coalesce ifnull cast with recursive begin commit rollback transaction pragma index view trim lower upper length round date strftime`.split(
    /\s+/,
  ),
);

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Разметить запрос для слоя подсветки под прозрачным полем ввода.
 *
 * Экранирование обязательно: запрос может прийти чужой ссылкой (?q=), а результат уходит в
 * innerHTML. Имена таблиц и колонок базы (`names`, в нижнем регистре) красятся отдельно –
 * опечатка в имени остается серой и видна до запуска.
 */
export function highlightSql(code, names = new Set()) {
  const re = /('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let out = "";
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const [raw, str1, str2, comment, num, word] = m;
    if (str1 || str2) out += `<span class="sql-str">${escapeHtml(raw)}</span>`;
    else if (comment) out += `<span class="sql-note">${escapeHtml(raw)}</span>`;
    else if (num) out += `<span class="sql-num">${escapeHtml(raw)}</span>`;
    else if (word) {
      const lower = word.toLowerCase();
      const cls = KEYWORDS.has(lower) ? "sql-key" : names.has(lower) ? "sql-name" : "";
      out += cls ? `<span class="${cls}">${escapeHtml(raw)}</span>` : escapeHtml(raw);
    } else out += escapeHtml(raw);
  }
  return out;
}

/** Имена таблиц и колонок в нижнем регистре – для подсветки. */
export function sqlNames(tables = []) {
  const set = new Set();
  for (const t of tables) {
    set.add(t.name.toLowerCase());
    for (const c of t.columns) set.add((c.name ?? c).toLowerCase());
  }
  return set;
}

/** Потолок длины запроса в ссылке: ссылка не должна превращаться в способ передать мегабайт. */
export const MAX_LINK_SQL = 5000;

/**
 * Ссылка на эту же страницу с запросом в `?q=`. Хэш и прочие параметры отбрасываются.
 * Запасной вид ссылки: для браузеров без CompressionStream и для старых ссылок, которые уже разошлись.
 */
export function shareUrl(pageUrl, sql) {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = "";
  const text = String(sql).trim();
  if (text) url.searchParams.set("q", text.slice(0, MAX_LINK_SQL));
  return url.toString();
}

/*
 * КОРОТКАЯ ССЫЛКА – ЗАПРОС СЖАТ В ХЭШ (19.11.2026, совет читателя статьи на Хабре: в `?q=` каждый пробел,
 * скобка и перевод строки становятся %20, %28, %0A, и ссылка выглядит как мусор). Текст сжимается
 * deflate-raw встроенным CompressionStream и кладется в `#s=` в base64url. Библиотека не нужна, сервер
 * тоже: страница статическая, а хэш даже не уходит в журнал GitHub Pages.
 */
const toB64url = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // Распаковка чужой ссылки: маленький хэш может развернуться в гигабайт – обрываем на потолке.
    if (size > limit) { await reader.cancel(); break; }
    parts.push(value);
  }
  const out = new Uint8Array(Math.min(size, limit));
  let at = 0;
  for (const p of parts) { const n = Math.min(p.length, out.length - at); out.set(p.subarray(0, n), at); at += n; }
  return out;
}

export const canCompress = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/** Короткая ссылка: запрос сжат в `#s=`. Без CompressionStream – прежняя ссылка с `?q=`. */
export async function shareLink(pageUrl, sql) {
  const text = String(sql).trim().slice(0, MAX_LINK_SQL);
  if (!text || !canCompress()) return shareUrl(pageUrl, text);
  const url = new URL(pageUrl);
  url.search = "";
  const packed = await pipe(new TextEncoder().encode(text), new CompressionStream("deflate-raw"), Infinity);
  url.hash = "s=" + toB64url(packed);
  return url.toString();
}

/** Запрос из адреса: сначала короткая ссылка `#s=`, потом старая `?q=`. Битая ссылка – null. */
export async function queryFromUrl(href) {
  const url = new URL(href);
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(url.hash);
  if (m && canCompress()) {
    try {
      const bytes = await pipe(fromB64url(m[1]), new DecompressionStream("deflate-raw"), MAX_LINK_SQL * 4);
      const text = new TextDecoder().decode(bytes).trim().slice(0, MAX_LINK_SQL);
      if (text) return text;
    } catch {
      // Испорченная или обрезанная ссылка: показываем пример, а не ошибку.
    }
  }
  return queryFromSearch(url.search);
}

/** Запрос из адреса страницы (`location.search`) или null. */
export function queryFromSearch(search) {
  const q = new URLSearchParams(search).get("q");
  const text = q ? q.trim().slice(0, MAX_LINK_SQL) : "";
  return text || null;
}

/**
 * Ошибка SQLite -> понятная фраза по-русски. Исходный текст показывается рядом мелко: по нему
 * ищут в интернете, и он же нужен, если перевод не нашелся.
 */
const ERRORS = [
  [/^no such table: (?:main\.)?(.+)$/i, (m) => `Нет такой таблицы: ${m[1]}. Список таблиц – справа или над полем.`],
  [/^no such column: (.+)$/i, (m) => `Нет такой колонки: ${m[1]}. Проверьте имя и таблицу, из которой оно берется.`],
  [/^ambiguous column name: (.+)$/i, (m) => `Колонка ${m[1]} есть в нескольких таблицах запроса – укажите таблицу: t.${m[1].replace(/^.*\./, "")}.`],
  [/^near "(.+)": syntax error$/i, (m) => `Синтаксическая ошибка рядом с "${m[1]}".`],
  [/^incomplete input$/i, () => "Запрос оборван: не хватает закрывающей скобки, кавычки или конца оператора."],
  [/^unrecognized token: "?(.+?)"?$/i, (m) => `Непонятный символ или незакрытая кавычка: ${m[1]}.`],
  [/^no such function: (.+)$/i, (m) => `В SQLite нет функции ${m[1]}. Различия движков – в таблице ниже.`],
  [/^wrong number of arguments to function (.+)$/i, (m) => `Не то число аргументов у функции ${m[1]}.`],
  [/^misuse of aggregate(?: function)?:? ?(.*)$/i, (m) => `Агрегатная функция ${m[1]} стоит там, где ее нельзя использовать: условие на агрегат пишут в HAVING, а не в WHERE.`],
  [/^table (.+) already exists$/i, (m) => `Таблица ${m[1]} уже есть.`],
  [/^UNIQUE constraint failed: (.+)$/i, (m) => `Нарушена уникальность: такое значение в ${m[1]} уже есть.`],
  [/^NOT NULL constraint failed: (.+)$/i, (m) => `Пустое значение в обязательной колонке ${m[1]}.`],
  [/^FOREIGN KEY constraint failed$/i, () => "Нарушен внешний ключ: строка ссылается на то, чего нет."],
  [/^CHECK constraint failed: (.+)$/i, (m) => `Значение не прошло проверку CHECK: ${m[1]}.`],
  [/^table (.+) has (\d+) columns but (\d+) values were supplied$/i, (m) => `В таблице ${m[1]} колонок ${m[2]}, а значений передано ${m[3]}.`],
  [/^(\d+) values for (\d+) columns$/i, (m) => `Значений ${m[1]}, а колонок ${m[2]} – число должно совпадать.`],
  [/^cannot start a transaction within a transaction$/i, () => "Транзакция уже открыта: сначала COMMIT или ROLLBACK."],
  [/^cannot (?:commit|rollback) - no transaction is active$/i, () => "Нет открытой транзакции: начните ее с BEGIN."],
  [/^SELECTs to the left and right of (UNION(?: ALL)?|INTERSECT|EXCEPT) do not have the same number of result columns$/i, (m) => `У запросов слева и справа от ${m[1]} разное число колонок.`],
];

export function ruError(message) {
  const text = String(message ?? "").trim();
  for (const [re, say] of ERRORS) {
    const m = text.match(re);
    if (m) return say(m);
  }
  return "Запрос не выполнился.";
}
