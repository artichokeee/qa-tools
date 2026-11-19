// Перевод MySQL -> SQLite, ссылка с запросом, подсветка и перевод ошибок. Без сети и без WASM.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { highlightSql, sqlNames, shareUrl, queryFromSearch, shareLink, queryFromUrl, ruError, MAX_LINK_SQL } from "../sql/lib.js";

const { toSqlite } = createRequire(import.meta.url)("../sql/sql-shared.js");

test("toSqlite: транзакция, TRUNCATE и AUTO_INCREMENT", () => {
  assert.equal(toSqlite("start  transaction; TRUNCATE TABLE reviews; truncate orders;"), "BEGIN; DELETE FROM reviews; DELETE FROM orders;");
  assert.equal(toSqlite("CREATE TABLE t (id INTEGER PRIMARY KEY AUTO_INCREMENT, n TEXT)"), "CREATE TABLE t (id INTEGER PRIMARY KEY, n TEXT)");
});

test("toSqlite: CAST AS SIGNED округляет, вложенные скобки не ломают разбор", () => {
  assert.equal(toSqlite("SELECT CAST(2.6 AS SIGNED)"), "SELECT CAST(ROUND(2.6) AS INTEGER)");
  assert.equal(toSqlite("SELECT cast(SUM(price) / COUNT(*) as signed) FROM p"), "SELECT CAST(ROUND(SUM(price) / COUNT(*)) AS INTEGER) FROM p");
  // Другие CAST не трогаются.
  assert.equal(toSqlite("SELECT CAST(2.6 AS INTEGER), CAST(x AS TEXT)"), "SELECT CAST(2.6 AS INTEGER), CAST(x AS TEXT)");
});

test("toSqlite: обычный запрос не меняется", () => {
  const q = "SELECT id, status FROM orders WHERE status = 'paid' ORDER BY id;";
  assert.equal(toSqlite(q), q);
});

test("ссылка: запрос туда и обратно без потерь", () => {
  const q = "SELECT name, price\nFROM products\nWHERE name LIKE '%чай%' AND price > 1 + 1 -- #&?=";
  const url = shareUrl("https://artichokeee.github.io/qa-tools/sql/?q=old#engines", q);
  assert.ok(url.startsWith("https://artichokeee.github.io/qa-tools/sql/?q="));
  assert.ok(!url.includes("#engines"), "хэш отбрасывается");
  assert.equal(queryFromSearch(new URL(url).search), q);
});

test("ссылка: пустой запрос не дает ?q=, длинный обрезается", () => {
  assert.equal(shareUrl("https://x.test/sql/", "   "), "https://x.test/sql/");
  assert.equal(queryFromSearch(""), null);
  assert.equal(queryFromSearch("?q=%20%20"), null);
  assert.equal(queryFromSearch(`?q=${"a".repeat(MAX_LINK_SQL + 50)}`).length, MAX_LINK_SQL);
});

// Короткая ссылка (19.11.2026): запрос сжат в #s=. Старые ?q= ссылки уже разошлись и обязаны открываться.
const PAGE = "https://artichokeee.github.io/qa-tools/sql/";
const JOIN_Q = "SELECT c.id, c.full_name, COUNT(*) AS orders_count\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.full_name\nHAVING COUNT(*) >= 3\nORDER BY orders_count DESC, c.id;";

test("короткая ссылка: туда и обратно без потерь, короче ?q=", async () => {
  const q = JOIN_Q + "\n-- кириллица и знаки #&?=%";
  const url = await shareLink(PAGE + "?q=old#engines", q);
  assert.match(url, /^https:\/\/artichokeee\.github\.io\/qa-tools\/sql\/#s=[A-Za-z0-9_-]+$/);
  assert.equal(await queryFromUrl(url), q);
  assert.ok(url.length < shareUrl(PAGE, q).length, `${url.length} против ${shareUrl(PAGE, q).length}`);
});

test("короткая ссылка: старые ?q= открываются, битый хэш не ломает страницу", async () => {
  assert.equal(await queryFromUrl(shareUrl(PAGE, JOIN_Q)), JOIN_Q);
  assert.equal(await queryFromUrl(PAGE + "#s=не-base64!!"), null);
  assert.equal(await queryFromUrl(PAGE + "#s=AAAA"), null);
  assert.equal(await queryFromUrl(PAGE + "#engines"), null);
  assert.equal(await shareLink(PAGE, "  "), PAGE);
});

test("короткая ссылка: сжатый мегабайт обрезается на потолке", async () => {
  const bomb = await shareLink(PAGE, "a".repeat(MAX_LINK_SQL));
  const huge = new URL(bomb);
  // Сами собираем ссылку на 1 МБ одинаковых букв – распаковка обязана остановиться на потолке.
  const stream = new Blob([new TextEncoder().encode("b".repeat(1_000_000))]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  huge.hash = "s=" + Buffer.from(packed).toString("base64url");
  const got = await queryFromUrl(huge.toString());
  assert.equal(got.length, MAX_LINK_SQL);
});

// Запрос приходит чужой ссылкой и уходит в innerHTML – разметка обязана экранироваться.
test("подсветка экранирует разметку из запроса", () => {
  const out = highlightSql(`SELECT '<img src=x onerror=alert(1)>', "<b>" FROM t -- </pre><script>`);
  assert.ok(!/<img|<script|<b>|<\/pre>/.test(out));
  assert.ok(out.includes("&lt;img"));
});

test("подсветка: имена базы красятся, опечатка – нет", () => {
  const names = sqlNames([{ name: "orders", columns: [{ name: "customer_id" }] }]);
  assert.match(highlightSql("SELECT customer_id FROM orders", names), /<span class="sql-name">customer_id<\/span>/);
  assert.ok(!highlightSql("SELECT customerid FROM orders", names).includes('class="sql-name">customerid'));
});

test("ошибки SQLite переводятся, неизвестная не теряется", () => {
  assert.match(ruError("no such column: nickname"), /Нет такой колонки: nickname/);
  assert.match(ruError('near "FORM": syntax error'), /рядом с "FORM"/);
  assert.match(ruError("misuse of aggregate: COUNT()"), /HAVING/);
  assert.equal(ruError("something new"), "Запрос не выполнился.");
});
