// Кроссворд: словарь годен для сетки, доска читается (слова не касаются боками, связна), зерно повторяемо.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCrossword, cellsOf, CW_GRID, CW_WORDS } from "../crossword/crossword.js";
import { rngOf, dayWindow } from "../crossword/rng.js";

const glossary = JSON.parse(readFileSync(new URL("../data/glossary.json", import.meta.url), "utf8"));
const norm = (s) => s.toUpperCase().replace(/Ё/g, "Е");

test("словарь: 70–90 слов, 4–9 букв А-Я, без повторов, определение без основы слова", () => {
  assert.ok(glossary.length >= 70 && glossary.length <= 90, `слов: ${glossary.length}`);
  const seen = new Set();
  for (const { word, clue } of glossary) {
    assert.match(word, /^[А-ЯЁ]{4,9}$/u, word);
    assert.ok(!word.includes("Ё"), `${word}: Ё вместо Е`);
    assert.ok(!seen.has(word), `повтор ${word}`);
    seen.add(word);
    assert.ok(clue.length > 0 && clue.length <= 90, `${word}: длина определения ${clue.length}`);
    assert.ok(!norm(clue).includes(word.slice(0, 4)), `${word}: основа в определении "${clue}"`);
    assert.ok(!/[ёЁ—«»]/.test(clue), `${word}: ё, длинное тире или елочки`);
  }
  const page = readFileSync(new URL("../crossword/index.html", import.meta.url), "utf8");
  assert.ok(page.includes(`В словаре ${glossary.length} терминов`), "число терминов на странице устарело");
});

/** Все клетки доски, с проверкой, что пересечения согласованы по буквам. */
function grid(set) {
  const cells = new Map();
  for (const w of set.words) {
    cellsOf(w).forEach((k, i) => {
      if (cells.has(k)) assert.equal(cells.get(k), w.word[i], `разные буквы в ${k}`);
      cells.set(k, w.word[i]);
    });
  }
  return cells;
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i);
const boards = SEEDS.map((i) => buildCrossword(glossary, rngOf(`test:${i}`), i * 7));

test("каждая доска собрана, влезает в сетку и почти всегда полная", () => {
  let full = 0;
  for (const b of boards) {
    assert.ok(b, "доска не собралась");
    assert.ok(b.w <= CW_GRID && b.h <= CW_GRID, `размер ${b.w}x${b.h}`);
    assert.ok(b.words.length >= 6, `слов ${b.words.length}`);
    if (b.words.length === CW_WORDS) full++;
    for (const w of b.words) assert.ok(w.clue, `нет определения у ${w.word}`);
  }
  assert.ok(full >= boards.length * 0.8, `полных досок ${full} из ${boards.length}`);
});

test("слова не касаются боками: любая цепочка из 2+ букв – это поставленное слово", () => {
  for (const b of boards) {
    const cells = grid(b);
    const words = new Set(b.words.map((w) => `${w.dir}:${w.x},${w.y}:${w.word}`));
    for (const dir of ["across", "down"]) {
      const [dx, dy] = dir === "across" ? [1, 0] : [0, 1];
      for (const k of cells.keys()) {
        const [x, y] = k.split(",").map(Number);
        if (cells.has(`${x - dx},${y - dy}`)) continue; // не начало цепочки
        let run = "";
        for (let i = 0; cells.has(`${x + dx * i},${y + dy * i}`); i++) run += cells.get(`${x + dx * i},${y + dy * i}`);
        if (run.length >= 2) assert.ok(words.has(`${dir}:${x},${y}:${run}`), `лишняя цепочка ${run} (${dir}) на ${k}`);
      }
    }
  }
});

test("доска связна: каждое слово пересекает другое, все слова в одном куске", () => {
  for (const b of boards) {
    const sets = b.words.map((w) => new Set(cellsOf(w)));
    const linked = (i, j) => [...sets[i]].some((k) => sets[j].has(k));
    for (let i = 0; i < sets.length; i++) assert.ok(sets.some((_, j) => j !== i && linked(i, j)), `${b.words[i].word} висит отдельно`);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const i = queue.shift();
      for (let j = 0; j < sets.length; j++) if (!seen.has(j) && linked(i, j)) (seen.add(j), queue.push(j));
    }
    assert.equal(seen.size, sets.length, "доска из нескольких кусков");
  }
});

test("номера: общий номер у общего начала, нумерация сверху вниз и слева направо", () => {
  for (const b of boards) {
    const byStart = new Map();
    for (const w of b.words) {
      const k = `${w.x},${w.y}`;
      if (byStart.has(k)) assert.equal(byStart.get(k), w.no);
      byStart.set(k, w.no);
    }
    const order = [...byStart.entries()].sort(([a], [c]) => {
      const [ax, ay] = a.split(",").map(Number);
      const [cx, cy] = c.split(",").map(Number);
      return ay - cy || ax - cx;
    });
    assert.deepEqual(order.map(([, no]) => no), order.map((_, i) => i + 1));
  }
});

test("одно зерно – один кроссворд, разные зерна – разные", () => {
  const a = buildCrossword(glossary, rngOf("crossword:2026-11-17"), 20409);
  const b = buildCrossword(glossary, rngOf("crossword:2026-11-17"), 20409);
  const c = buildCrossword(glossary, rngOf("crossword:2026-11-18"), 20410);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("окно дня: соседние дни не делят слова", () => {
  for (let day = 0; day < 30; day++) {
    const today = new Set(dayWindow(glossary, 27, day, "terms").map((t) => t.word));
    const next = dayWindow(glossary, 27, day + 1, "terms");
    assert.ok(next.every((t) => !today.has(t.word)), `день ${day} и ${day + 1}`);
  }
});
