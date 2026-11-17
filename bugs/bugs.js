/**
 * Заложенные баги страницы "Мой магазин": ключ – data-spot элемента в index.html, текст – что не
 * так. Порядок не важен: номер бага – порядок, в котором его нашли.
 *
 * Ответы лежат открыто: это учебная страница, проверка идет в браузере.
 */
export const BUGS = {
  title: "Заголовок страницы прижат влево, а не стоит по центру.",
  "p1-buy": "Кнопка у товара 1 черная, у остальных – зеленая.",
  "p2-name": "Название товара 2 прижато влево, у остальных – по центру.",
  "p3-buy": "На кнопке товара 3 написано \"BUY\" вместо \"Купить\".",
  "p4-name": "Название товара 4 на английском: \"Product 4\".",
  "p4-buy": "Кнопка у товара 4 опущена ниже, чем у соседей: лишний отступ.",
  "p5-buy2": "У товара 5 кнопка \"Купить\" повторяется два раза.",
  "p6-img": "У товара 6 нет изображения – стоит заглушка.",
  "p6-buy": "Кнопка у товара 6 неактивна, хотя ничего не говорит, что товара нет.",
  footer: "В подвале устаревший год 2024, и сам подвал съехал за край страницы.",
};

export const TOTAL = Object.keys(BUGS).length;

/** Отметить элемент: вернуть новое состояние и что произошло. Состояние не мутируется. */
export function mark(state, spot) {
  if (state.revealed) return { state, result: "locked" };
  if (!(spot in BUGS)) return { state, result: "miss" };
  if (state.found.includes(spot)) return { state, result: "again" };
  return { state: { ...state, found: [...state.found, spot] }, result: "hit" };
}

export const emptyState = () => ({ found: [], revealed: false });

/** Состояние из localStorage: чужие и устаревшие ключи отбрасываются. */
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    const found = Array.isArray(s?.found) ? [...new Set(s.found.filter((k) => k in BUGS))] : [];
    return { found, revealed: s?.revealed === true };
  } catch {
    return emptyState();
  }
}
