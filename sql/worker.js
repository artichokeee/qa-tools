/**
 * Воркер песочницы: SQLite (sql.js, WASM) и учебная база живут здесь, а не в потоке страницы.
 *
 * Зачем отдельный поток. SQLite в WASM синхронен и изнутри не прерывается: запрос
 * `WITH RECURSIVE x AS (SELECT 1 UNION ALL SELECT 1 FROM x) SELECT * FROM x` крутится вечно.
 * В потоке страницы это повесило бы вкладку; здесь страница просто убивает воркер по таймеру
 * (sql/app.js) и поднимает новый с чистой базой.
 *
 * База живет между запросами: после INSERT следующий SELECT видит вставленную строку.
 * Сбрасывает ее кнопка "Вернуть базу к исходной" или таймаут.
 *
 * Пути относительные – страница работает и из корня, и из подпапки GitHub Pages (/qa-tools/).
 */
/* global importScripts, initSqlJs, sqlShared */

importScripts("../vendor/sql.js/sql-wasm.js", "sql-shared.js");

let SQL = null;
let db = null;
let initSql = "";

function fresh() {
  if (db) db.close();
  db = new SQL.Database();
  db.run(initSql);
}

const version = () => String(db.exec("SELECT sqlite_version()")[0].values[0][0]);

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      SQL = await initSqlJs({ locateFile: (f) => `../vendor/sql.js/${f}` });
      initSql = msg.initSql;
      fresh();
      self.postMessage({ type: "ready", schema: sqlShared.schemaOf(db), version: version() });
    } else if (msg.type === "reset") {
      fresh();
      self.postMessage({ type: "ready", schema: sqlShared.schemaOf(db), version: version() });
    } else if (msg.type === "run") {
      const started = performance.now();
      const out = sqlShared.runAll(db, msg.sql);
      const ms = Math.round(performance.now() - started);
      self.postMessage({ type: "done", ms, schema: sqlShared.schemaOf(db), ...out });
    }
  } catch (err) {
    // Схема могла поменяться и до ошибки: второй оператор упал, а первый CREATE TABLE прошел.
    let schema = null;
    try {
      schema = db ? sqlShared.schemaOf(db) : null;
    } catch {
      // база не поднялась – схемы нет
    }
    self.postMessage({ type: "error", error: String((err && err.message) || err), schema });
  }
};
