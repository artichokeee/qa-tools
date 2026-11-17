/**
 * Сборка кроссворда из словаря терминов. Ответы проверяются в браузере, поэтому кроссворд целиком,
 * вместе с буквами, живет на странице.
 */
import { crossingsOf, layout, numbered, tiedWords, trim } from "./layout.js";
import { dayWindow, shuffled } from "./rng.js";
import { byStem } from "./rules.js";

/** Сколько слов ставим и какой длины они годятся. */
export const CW_WORDS = 9;
export const CW_MIN = 4;
export const CW_MAX = 9;
/** Сторона сетки: доска должна влезать в экран целиком. */
export const CW_GRID = 11;
/** Сколько раскладок перебираем, прежде чем выбрать лучшую. */
const TRIES = 40;

/**
 * Насколько доска похожа на кроссворд, а не на гребенку. Порядок важности: число слов, потом
 * связность, потом плотность – пустая доска из четырех слов не обгоняет полную из девяти.
 */
function rate(board) {
  const area = Math.max(1, board.w * board.h);
  const filled = board.placed.reduce((n, p) => n + p.word.length, 0) - crossingsOf(board);
  return board.placed.length * 1000 + tiedWords(board) * 60 + crossingsOf(board) * 20 + (filled / area) * 30;
}

/**
 * terms: [{ word, clue }]. Возвращает { w, h, words: [{ no, dir, x, y, word, clue }] } или null.
 *
 * Слов берется втрое больше нужного: слову без честного пересечения раскладка отказывает, и при
 * ровно девяти доска часто выходила бы из пяти. Раскладка жадная и зависит от порядка слов, поэтому
 * перебираются сорок порядков и берется лучшая доска после обрезки до CW_WORDS.
 */
export function buildCrossword(terms, rnd, day = 0) {
  const pool = terms.filter((t) => t.word.length >= CW_MIN && t.word.length <= CW_MAX);
  if (pool.length < 4) return null;

  const picked = byStem(dayWindow(pool, Math.min(pool.length, CW_WORDS * 3), day, "terms"), (t) => t.word);
  const byWord = new Map(picked.map((t) => [t.word, t]));
  const list = [...byWord.keys()];

  let final = null;
  let best = -Infinity;
  for (let i = 0; i < TRIES; i++) {
    const board = layout(shuffled(list, rnd), rnd, CW_GRID);
    if (board.placed.length < 4) continue;
    const cut = trim(board, CW_WORDS);
    const score = rate(cut);
    if (score > best) {
      best = score;
      final = cut;
    }
  }
  if (!final) return null;
  const words = numbered(final).map((p) => ({
    no: p.no,
    dir: p.dir,
    x: p.x,
    y: p.y,
    word: p.word,
    clue: byWord.get(p.word)?.clue ?? "",
  }));
  return { w: final.w, h: final.h, words };
}

/** Клетки слова ("x,y") – для подсказки и проверки. */
export function cellsOf(w) {
  const dx = w.dir === "across" ? 1 : 0;
  const dy = w.dir === "down" ? 1 : 0;
  return Array.from({ length: w.word.length }, (_, i) => `${w.x + dx * i},${w.y + dy * i}`);
}
