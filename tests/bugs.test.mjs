// "Найди баги": каждый баг из ответов стоит на странице, иначе счетчик не дойдет до M из M.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUGS, TOTAL, mark, emptyState, restore } from "../bugs/bugs.js";

const html = readFileSync(new URL("../bugs/index.html", import.meta.url), "utf8");
const spots = [...html.matchAll(/data-spot="([^"]+)"/g)].map((m) => m[1]);

test("каждый баг – ровно один элемент страницы, счетчик в разметке совпадает", () => {
  assert.equal(new Set(spots).size, spots.length, "data-spot не повторяются");
  for (const k of Object.keys(BUGS)) assert.ok(spots.includes(k), `нет элемента ${k}`);
  assert.equal(TOTAL, 10);
  assert.ok(html.includes(`Найдено 0 из ${TOTAL}`) && html.includes(`aria-valuemax="${TOTAL}"`));
});

test("отметка: попадание, повтор, промах, после ответов – замок", () => {
  let s = emptyState();
  let r = mark(s, "p3-buy");
  assert.equal(r.result, "hit");
  s = r.state;
  assert.equal(mark(s, "p3-buy").result, "again");
  assert.equal(mark(s, "p7-buy").result, "miss");
  assert.equal(mark({ ...s, revealed: true }, "title").result, "locked");
  for (const k of Object.keys(BUGS)) s = mark(s, k).state;
  assert.equal(s.found.length, TOTAL);
});

test("сохраненное состояние: мусор и чужие ключи отбрасываются", () => {
  assert.deepEqual(restore("not json"), emptyState());
  assert.deepEqual(restore(JSON.stringify({ found: ["title", "title", "p7-buy", 5], revealed: "yes" })), { found: ["title"], revealed: false });
});
