/**
 * Выполнение запроса и перевод MySQL -> SQLite. Общий файл для воркера браузера (importScripts)
 * и для тестов в Node, поэтому форма старомодная: обычный скрипт, а не модуль.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.sqlShared = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  /** Сколько строк результата хранить и показывать. Остальные только считаются. */
  const MAX_ROWS = 500;

  /**
   * MySQL -> SQLite. Учебники и задания чаще пишут под MySQL, а здесь SQLite. Переписываются
   * четыре конструкции, остальное выполняется как написано:
   *  - START TRANSACTION -> BEGIN;
   *  - TRUNCATE [TABLE] x -> DELETE FROM x: по смыслу это очистка таблицы;
   *  - AUTO_INCREMENT убирается: ключ INTEGER PRIMARY KEY в SQLite нумеруется сам;
   *  - CAST(x AS SIGNED) -> CAST(ROUND(x) AS INTEGER): MySQL округляет, а тип SIGNED SQLite не знает.
   */
  function toSqlite(sql) {
    const out = String(sql == null ? "" : sql)
      .replace(/\bSTART\s+TRANSACTION\b/gi, "BEGIN")
      .replace(/\bTRUNCATE\s+(?:TABLE\s+)?/gi, "DELETE FROM ")
      .replace(/\s+AUTO_INCREMENT\b/gi, "");
    let res = "";
    let i = 0;
    const upper = out.toUpperCase();
    while (i < out.length) {
      const at = upper.indexOf("CAST(", i);
      if (at === -1) {
        res += out.slice(i);
        break;
      }
      res += out.slice(i, at);
      // Ищем парную скобку: внутри CAST могут быть свои скобки, например CAST(SUM(x) / 2 AS SIGNED).
      let depth = 0;
      let j = at + 4;
      for (; j < out.length; j++) {
        if (out[j] === "(") depth++;
        else if (out[j] === ")" && --depth === 0) break;
      }
      const m = out.slice(at + 5, j).match(/^([\s\S]*)\s+AS\s+SIGNED\s*$/i);
      res += m ? "CAST(ROUND(" + m[1] + ") AS INTEGER)" : out.slice(at, j + 1);
      i = j + 1;
    }
    return res;
  }

  /** Значение ячейки -> строка или null. BLOB показываем размером, а не байтами. */
  function cell(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Uint8Array) return "blob:" + v.length;
    return String(v);
  }

  /**
   * Выполнить все операторы по очереди и вернуть ПОСЛЕДНЮЮ выборку.
   *
   * По одному оператору, а не db.exec: exec не отдает выборку без строк, и пустой последний SELECT
   * молча подменялся бы предыдущим. Выборка – оператор с колонками, даже если строк ноль.
   * Правки считаются разницей total_changes(): у BEGIN и ROLLBACK getRowsModified повторяет
   * число от предыдущей правки.
   */
  function runAll(db, sql) {
    const translated = toSqlite(sql);
    const changes = () => Number(db.exec("SELECT total_changes()")[0].values[0][0]);
    const before = changes();
    let last = null;
    let statements = 0;
    for (const stmt of db.iterateStatements(translated)) {
      try {
        statements++;
        const columns = stmt.getColumnNames();
        const rows = [];
        let total = 0;
        while (stmt.step()) {
          total++;
          if (rows.length < MAX_ROWS) rows.push(stmt.get().map(cell));
        }
        if (columns.length) last = { columns, rows, total };
      } finally {
        stmt.free();
      }
    }
    return { last, statements, changed: changes() - before, translated: translated !== sql ? translated : null };
  }

  /** Таблицы и колонки базы – для панели схемы и подсветки имен. */
  function schemaOf(db) {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
    const names = res.length ? res[0].values.map((r) => String(r[0])) : [];
    return names.map((name) => {
      const info = db.exec("SELECT name, type FROM pragma_table_info(?)", [name]);
      const columns = info.length ? info[0].values.map((r) => ({ name: String(r[0]), type: String(r[1] || "") })) : [];
      return { name, columns };
    });
  }

  return { MAX_ROWS, toSqlite, cell, runAll, schemaOf };
});
