// Учебная база: файл совпадает с генератором, примеры выполняются, заложенные баги на месте.
// Один подъем WASM на весь файл – отдельная база на каждый запрос дешевая (271 строка).
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { shopSql } from "../scripts/gen-shop.mjs";
import { EXAMPLES, ENGINE_DIFFS } from "../sql/content.js";

const require = createRequire(import.meta.url);
const { runAll, schemaOf } = require("../sql/sql-shared.js");
const initSqlJs = require("../vendor/sql.js/sql-wasm.js");
const SHOP = readFileSync(new URL("../sql/shop.sql", import.meta.url), "utf8");

let SQL;
before(async () => {
  SQL = await initSqlJs({ locateFile: (f) => new URL(`../vendor/sql.js/${f}`, import.meta.url).pathname });
});

const fresh = () => {
  const db = new SQL.Database();
  db.run(SHOP);
  return db;
};
const rows = (sql) => runAll(fresh(), sql).last.rows;

test("shop.sql собран генератором и руками не правился", () => {
  assert.equal(SHOP, shopSql());
});

test("6 таблиц и 271 строка, как написано на странице", () => {
  const db = fresh();
  const tables = schemaOf(db).map((t) => t.name);
  assert.deepEqual(tables, ["categories", "products", "customers", "orders", "order_items", "reviews"]);
  const total = tables.reduce((s, t) => s + Number(db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]), 0);
  assert.equal(total, 271);
  assert.match(readFileSync(new URL("../sql/index.html", import.meta.url), "utf8"), /6 таблиц, 271 строка/);
});

test("каждый пример выполняется и что-то возвращает", () => {
  for (const x of EXAMPLES) {
    const out = runAll(fresh(), x.sql);
    assert.ok(out.last && out.last.rows.length > 0, x.title);
  }
});

test("запросы из таблицы различий: SQLite отвечает так, как написано", () => {
  const ok = ENGINE_DIFFS.filter((d) => d.topic !== "Имя текущей базы" && d.topic !== "Текст ошибки");
  for (const d of ok) assert.doesNotThrow(() => runAll(fresh(), d.query), d.topic);
  assert.throws(() => runAll(fresh(), "SELECT DATABASE();"), /no such function/);
  assert.throws(() => runAll(fresh(), "SELECT nickname FROM customers;"), /no such column: nickname/);
  const q = (topic) => ENGINE_DIFFS.find((d) => d.topic === topic).query;
  assert.equal(rows(q("Регистр букв в сравнении")).length, 1);
  assert.equal(rows(q("LIKE и русские буквы")).length, 0);
  assert.equal(rows(q("FULL OUTER JOIN")).length, 61);
  assert.deepEqual(rows(q("TRUNCATE внутри транзакции")), [["24"]]);
  assert.deepEqual(rows(q("Вид среднего")), [["1.8547008547008548"]]);
  assert.deepEqual(rows(q("Приведение к целому")), [["3", "2"]]);
});

// Ответы из README (под спойлером). Если генератор поменяется, тест скажет, что README устарел.
test("заложенные баги находятся ровно там, где обещано в README", () => {
  const ids = (sql) => rows(sql).map((r) => r[0]).join(",");
  assert.equal(ids("SELECT MIN(id) || '+' || MAX(id) FROM customers GROUP BY email HAVING COUNT(*) > 1"), "12+31");
  assert.equal(ids("SELECT id FROM customers WHERE email IS NULL"), "24");
  assert.equal(ids("SELECT id FROM products WHERE price <= 0"), "17");
  assert.equal(ids("SELECT o.id FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE oi.id IS NULL"), "38");
  assert.equal(ids("SELECT oi.id FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE p.id IS NULL"), "117");
  assert.equal(ids("SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE date(o.created_at) < c.created_at"), "21");
  assert.equal(ids("SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id HAVING o.total <> SUM(oi.quantity * oi.price)"), "9");
  assert.equal(ids("SELECT id FROM orders WHERE status NOT IN ('new', 'paid', 'shipped', 'delivered', 'cancelled')"), "14");
  assert.equal(ids("SELECT id FROM reviews WHERE rating NOT BETWEEN 1 AND 5"), "9");
});
