/**
 * Основа слова: без двух последних букв, короткое слово остается как есть. Формы одного слова
 * ("ТРЕБОВАНИЕ" и "ТРЕБОВАНИЯ") в одной партии не встречаются – иначе одно отгадывают дважды.
 */
export function stemOf(word) {
  return word.length > 5 ? word.slice(0, -2) : word;
}

/** Оставить по одному слову на основу, сохраняя порядок. */
export function byStem(items, word) {
  const seen = new Set();
  return items.filter((item) => {
    const key = stemOf(word(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
