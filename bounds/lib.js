/**
 * Граничные значения и классы эквивалентности для числового диапазона [min, max] с шагом step.
 *
 * Считается в целых числах: все значения умножаются на 10^d, где d – наибольшее число знаков после
 * точки у min, max и step. Иначе 0.1 + 0.2 дает 0.30000000000000004, и граница "0.3" не совпадает
 * сама с собой.
 */

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)$/;
const MAX_DECIMALS = 10;

/** Строка поля -> { int, decimals } или null. Запятая считается десятичной точкой. */
export function parseNum(raw) {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!NUM.test(s)) return null;
  const dot = s.indexOf(".");
  const decimals = dot === -1 ? 0 : s.length - dot - 1;
  return { value: Number(s), decimals };
}

/** Целое в масштабе 10^d -> строка без хвостовых нулей. */
export function formatScaled(n, d, comma = false) {
  let s = (n / 10 ** d).toFixed(d);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return comma ? s.replace(".", ",") : s;
}

/**
 * @param {{min: string, max: string, step?: string, points?: 2 | 3}} input
 * @returns {{ok: false, error: string} | {ok: true, step: string, values: Array, classes: Array, warnings: string[]}}
 */
export function boundaries({ min, max, step = "", points = 2 }) {
  const lo = parseNum(min);
  const hi = parseNum(max);
  if (!lo || !hi) return { ok: false, error: "Введите обе границы числами, например 1 и 100 или 0,5 и 9,5." };

  const stepRaw = String(step ?? "").trim();
  let st = null;
  if (stepRaw) {
    st = parseNum(stepRaw);
    if (!st) return { ok: false, error: "Шаг должен быть числом, например 1 или 0,01." };
    if (!(st.value > 0)) return { ok: false, error: "Шаг должен быть больше нуля." };
  }

  const d = Math.max(lo.decimals, hi.decimals, st ? st.decimals : 0);
  if (d > MAX_DECIMALS) return { ok: false, error: `Слишком много знаков после запятой: не больше ${MAX_DECIMALS}.` };

  const k = 10 ** d;
  const a = Math.round(lo.value * k);
  const b = Math.round(hi.value * k);
  // Шаг не задан – берется точность границ, как в требовании "от 0.5 до 10": шаг 0.1.
  const s = st ? Math.round(st.value * k) : 10 ** (d - Math.max(lo.decimals, hi.decimals));
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a - s) || !Number.isSafeInteger(b + s)) {
    return { ok: false, error: "Слишком большие числа для точного расчета." };
  }
  if (a > b) return { ok: false, error: "Нижняя граница больше верхней. Поменяйте их местами." };

  const comma = [min, max, step].some((v) => String(v ?? "").includes(","));
  const f = (n) => formatScaled(n, d, comma);
  const single = a === b;

  const values = [];
  const add = (n, valid, note) => {
    if (values.some((v) => v.n === n)) return;
    values.push({ n, value: f(n), valid, note });
  };
  add(a - s, false, "на шаг ниже минимума – должно отклоняться");
  add(a, true, single ? "единственное допустимое значение – должно приниматься" : "минимум – должно приниматься");
  if (points === 3 && a + s <= b) add(a + s, true, "на шаг выше минимума – должно приниматься");
  if (points === 3 && b - s >= a) add(b - s, true, "на шаг ниже максимума – должно приниматься");
  if (!single) add(b, true, "максимум – должно приниматься");
  add(b + s, false, "на шаг выше максимума – должно отклоняться");
  values.sort((x, y) => x.n - y.n);

  const mid = a + Math.floor((b - a) / s / 2) * s;
  const classes = [
    { name: "Ниже диапазона", range: `меньше ${f(a)}`, example: f(a - 10 * s), valid: false },
    { name: "Внутри диапазона", range: single ? `ровно ${f(a)}` : `от ${f(a)} до ${f(b)} включительно`, example: f(mid), valid: true },
    { name: "Выше диапазона", range: `больше ${f(b)}`, example: f(b + 10 * s), valid: false },
  ];

  const warnings = [];
  if ((b - a) % s !== 0) {
    warnings.push(`Максимум не попадает в сетку шага ${f(s)} от минимума. Уточните требование: значения выше посчитаны от каждой границы отдельно.`);
  }
  if (a % s !== 0 && st && st.decimals < lo.decimals) {
    warnings.push("У границы больше знаков после запятой, чем у шага. Проверьте, какой шаг на самом деле принимает поле.");
  }

  return { ok: true, step: f(s), values: values.map(({ n, ...v }) => v), classes, warnings };
}
