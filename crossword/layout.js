/**
 * Раскладка слов по клеткам.
 *
 * Главное правило – слова не касаются боками. Два слова, поставленные вплотную параллельно, дают
 * поперек себя цепочки букв, которых нет ни в одном определении, и доска читается как сломанная.
 * Пересечения разрешены, касания – нет.
 *
 * Board: { w, h, placed: [{ word, x, y, dir: "across" | "down" }] }, x и y – левый верхний угол слова.
 */

const key = (x, y) => `${x},${y}`;

/** Сколько пересечений даст слово в этом месте, или null, если ставить нельзя. */
function fits(cells, word, x, y, dir) {
  const dx = dir === "across" ? 1 : 0;
  const dy = dir === "down" ? 1 : 0;

  // Клетка перед началом и после конца пуста: иначе слово слипается с соседним в одну строку.
  if (cells.has(key(x - dx, y - dy))) return null;
  if (cells.has(key(x + dx * word.length, y + dy * word.length))) return null;

  let crosses = 0;
  for (let i = 0; i < word.length; i++) {
    const cx = x + dx * i;
    const cy = y + dy * i;
    const there = cells.get(key(cx, cy));
    if (there) {
      if (there !== word[i]) return null;
      crosses++;
      continue;
    }
    // Своя клетка пуста – значит и соседи поперек пусты.
    if (cells.has(key(cx + dy, cy + dx))) return null;
    if (cells.has(key(cx - dy, cy - dx))) return null;
  }
  return crosses;
}

/**
 * Разложить слова. Слово без честного пересечения отбрасывается, а не ставится отдельно: доска из
 * двух несвязанных кусков читается как поломка. `max` – наибольшая сторона сетки.
 */
export function layout(words, rnd, max = 13) {
  const list = [...words].sort((a, b) => b.length - a.length);
  if (!list.length) return { w: 0, h: 0, placed: [] };

  const cells = new Map();
  const placed = [];

  const put = (word, x, y, dir) => {
    const dx = dir === "across" ? 1 : 0;
    const dy = dir === "down" ? 1 : 0;
    for (let i = 0; i < word.length; i++) cells.set(key(x + dx * i, y + dy * i), word[i]);
    placed.push({ word, x, y, dir });
  };

  put(list[0], 0, 0, "across");

  for (const word of list.slice(1)) {
    let best = null;

    for (const p of placed) {
      const dir = p.dir === "across" ? "down" : "across";
      const pdx = p.dir === "across" ? 1 : 0;
      const pdy = p.dir === "down" ? 1 : 0;

      for (let i = 0; i < p.word.length; i++) {
        const ch = p.word[i];
        for (let j = 0; j < word.length; j++) {
          if (word[j] !== ch) continue;
          const cx = p.x + pdx * i;
          const cy = p.y + pdy * i;
          const x = dir === "across" ? cx - j : cx;
          const y = dir === "down" ? cy - j : cy;
          const crosses = fits(cells, word, x, y, dir);
          if (crosses === null) continue;

          const xs = [...placed.flatMap((q) => [q.x, q.x + (q.dir === "across" ? q.word.length - 1 : 0)]), x, x + (dir === "across" ? word.length - 1 : 0)];
          const ys = [...placed.flatMap((q) => [q.y, q.y + (q.dir === "down" ? q.word.length - 1 : 0)]), y, y + (dir === "down" ? word.length - 1 : 0)];
          if (Math.max(...xs) - Math.min(...xs) + 1 > max) continue;
          if (Math.max(...ys) - Math.min(...ys) + 1 > max) continue;

          // Плотное лучше первого попавшегося: пересечение ценится, разброс наказывается. Второе
          // пересечение дороже любой экономии места, а малая случайная добавка не дает одинаковым
          // по счету местам выигрывать всегда.
          const spread = Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys));
          const score = crosses * 30 - spread + rnd();
          if (!best || score > best.score) best = { x, y, dir, score };
        }
      }
    }

    if (best) put(word, best.x, best.y, best.dir);
  }

  return normalize(placed);
}

/** Сдвинуть слова к началу координат и посчитать размер доски. */
function normalize(placed) {
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const shifted = placed.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY }));
  const w = Math.max(...shifted.map((p) => p.x + (p.dir === "across" ? p.word.length : 1)));
  const h = Math.max(...shifted.map((p) => p.y + (p.dir === "down" ? p.word.length : 1)));
  return { w, h, placed: shifted };
}

function usage(board) {
  const used = new Map();
  for (const p of board.placed) {
    const dx = p.dir === "across" ? 1 : 0;
    const dy = p.dir === "down" ? 1 : 0;
    for (let i = 0; i < p.word.length; i++) {
      const k = key(p.x + dx * i, p.y + dy * i);
      used.set(k, (used.get(k) ?? 0) + 1);
    }
  }
  return used;
}

/** Сколько клеток принадлежат сразу двум словам – мера "кроссвордности" доски. */
export function crossingsOf(board) {
  return [...usage(board).values()].filter((n) => n > 1).length;
}

/** Сколько слов зацеплены за два и более соседа: слово на одном пересечении отгадывается отдельно от доски. */
export function tiedWords(board) {
  const used = usage(board);
  let tied = 0;
  for (const p of board.placed) {
    const dx = p.dir === "across" ? 1 : 0;
    const dy = p.dir === "down" ? 1 : 0;
    let n = 0;
    for (let i = 0; i < p.word.length; i++) if ((used.get(key(p.x + dx * i, p.y + dy * i)) ?? 0) > 1) n++;
    if (n >= 2) tied++;
  }
  return tied;
}

/**
 * Оставить первые n слов. Префикс всегда связен: каждое слово ставилось пересечением с уже
 * стоящим, поэтому хвост обрезать безопасно, а пересобирать урезанный список – нет.
 */
export function trim(board, n) {
  return normalize(board.placed.slice(0, Math.max(1, n)));
}

/** Номера как в бумажном кроссворде: сверху вниз, слева направо, общий номер у общего начала. */
export function numbered(board) {
  const starts = [...board.placed].sort((a, b) => a.y - b.y || a.x - b.x);
  const nums = new Map();
  let next = 1;
  const out = [];
  for (const p of starts) {
    const k = key(p.x, p.y);
    if (!nums.has(k)) nums.set(k, next++);
    out.push({ ...p, no: nums.get(k) });
  }
  return out;
}
