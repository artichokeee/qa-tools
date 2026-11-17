/**
 * Случайность с зерном: из одной строки всегда получается один и тот же кроссворд. На этом держится
 * кроссворд дня (одинаковый у всех в этот день) и восстановление партии после перезагрузки.
 */

/** Зерно из строки: FNV-1a. Нужен разброс, а не криптостойкость. */
export function seedOf(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: быстрый равномерный генератор, числа в [0, 1). */
export function rngOf(key) {
  let a = seedOf(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Взять n штук без повторов. */
export function take(list, n, rnd) {
  return shuffled(list, rnd).slice(0, n);
}

/**
 * Окно на день: словарь проходится по кругу, каждый круг перемешан заново.
 *
 * Случайная выборка каждый день повторяла бы вчерашние слова. Здесь круг делится на целые окна,
 * соседние дни внутри круга не пересекаются, а на стыке кругов слова, стоявшие в последнем окне
 * прошлого круга, меняются местами с более дальними – вчерашнее в сегодняшнее не попадает.
 */
export function dayWindow(list, n, day, key, shift = 0) {
  const len = list.length;
  if (!len) return [];
  const want = Math.min(n, len);

  const slots = Math.max(1, Math.floor(len / want));
  const shifted = day + (want ? Math.floor(shift / want) : 0);
  const round = Math.floor(shifted / slots);
  const slot = ((shifted % slots) + slots) % slots;

  const orderOf = (r) => shuffled(list, rngOf(`${key}:${r}`));
  const order = orderOf(round);

  if (round > 0 && slots >= 2) {
    const before = new Set(orderOf(round - 1).slice((slots - 1) * want, slots * want));
    let spare = want;
    for (let i = 0; i < want; i++) {
      if (!before.has(order[i])) continue;
      while (spare < len && before.has(order[spare])) spare++;
      if (spare >= len) break;
      [order[i], order[spare]] = [order[spare], order[i]];
      spare++;
    }
  }

  return order.slice(slot * want, slot * want + want);
}

/** Номер дня – сутки от начала эпохи. */
export function dayNumber(date) {
  return Math.floor(date.getTime() / 86400000);
}
