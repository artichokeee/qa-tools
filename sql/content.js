/**
 * Примеры запросов и таблица различий движков. Все запросы написаны под учебную базу
 * sql/shop.sql и прогоняются тестом tests/data.test.mjs: пример, который падает с ошибкой,
 * не должен доехать до страницы.
 */

/** group: "basics" – основы SQL, "bugs" – поиск багов в данных. */
export const EXAMPLES = [
  {
    group: "basics",
    title: "Первые заказы",
    note: "SELECT, ORDER BY и LIMIT: десять самых ранних заказов.",
    sql: "SELECT id, customer_id, created_at, status, total\nFROM orders\nORDER BY created_at\nLIMIT 10;",
  },
  {
    group: "basics",
    title: "WHERE: дорогие товары в наличии",
    note: "Два условия через AND.",
    sql: "SELECT name, price, stock\nFROM products\nWHERE price > 5000 AND stock > 0\nORDER BY price DESC;",
  },
  {
    group: "basics",
    title: "JOIN: заказы с покупателем",
    note: "Соединение по ключу: к заказу добавляются имя и город покупателя.",
    sql: "SELECT o.id, c.full_name, c.city, o.status, o.total\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nORDER BY o.id\nLIMIT 20;",
  },
  {
    group: "basics",
    title: "GROUP BY: выручка по категориям",
    note: "Три таблицы, SUM и COUNT(DISTINCT).",
    sql: "SELECT cat.name AS category,\n       SUM(oi.quantity * oi.price) AS revenue,\n       COUNT(DISTINCT oi.order_id) AS orders_count\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nJOIN categories cat ON cat.id = p.category_id\nGROUP BY cat.name\nORDER BY revenue DESC;",
  },
  {
    group: "basics",
    title: "HAVING: постоянные покупатели",
    note: "Условие на агрегат пишется в HAVING, а не в WHERE.",
    sql: "SELECT c.id, c.full_name, COUNT(*) AS orders_count\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.full_name\nHAVING COUNT(*) >= 3\nORDER BY orders_count DESC, c.id;",
  },
  {
    group: "basics",
    title: "Подзапрос: товары без продаж",
    note: "NOT EXISTS: товары, которых нет ни в одной позиции заказа.",
    sql: "SELECT p.id, p.name, p.stock\nFROM products p\nWHERE NOT EXISTS (\n  SELECT 1 FROM order_items oi WHERE oi.product_id = p.id\n)\nORDER BY p.id;",
  },
  {
    group: "basics",
    title: "WITH RECURSIVE: дерево категорий",
    note: "Рекурсивный запрос проходит по parent_id сверху вниз.",
    sql: "WITH RECURSIVE tree(id, name, level, path) AS (\n  SELECT id, name, 0, name FROM categories WHERE parent_id IS NULL\n  UNION ALL\n  SELECT c.id, c.name, t.level + 1, t.path || ' / ' || c.name\n  FROM categories c\n  JOIN tree t ON c.parent_id = t.id\n)\nSELECT id, level, path FROM tree ORDER BY path;",
  },
  {
    group: "bugs",
    title: "Дубли email",
    note: "Email должен быть уникальным. GROUP BY с HAVING показывает повторы.",
    sql: "SELECT email, COUNT(*) AS times\nFROM customers\nGROUP BY email\nHAVING COUNT(*) > 1;",
  },
  {
    group: "bugs",
    title: "Пустые обязательные поля",
    note: "NULL ищется через IS NULL: условие = NULL не находит ничего.",
    sql: "SELECT id, full_name, email\nFROM customers\nWHERE email IS NULL OR TRIM(email) = '';",
  },
  {
    group: "bugs",
    title: "Цена не больше нуля",
    note: "Граничное значение: и ноль, и отрицательная цена – баг.",
    sql: "SELECT id, name, price\nFROM products\nWHERE price <= 0;",
  },
  {
    group: "bugs",
    title: "Заказы без позиций",
    note: "LEFT JOIN и IS NULL справа: строки, которым не нашлось пары.",
    sql: "SELECT o.id, o.status, o.total\nFROM orders o\nLEFT JOIN order_items oi ON oi.order_id = o.id\nWHERE oi.id IS NULL;",
  },
  {
    group: "bugs",
    title: "Позиции-сироты",
    note: "Ссылка на товар, которого нет. То же покажет PRAGMA foreign_key_check;",
    sql: "SELECT oi.id, oi.order_id, oi.product_id\nFROM order_items oi\nLEFT JOIN products p ON p.id = oi.product_id\nWHERE p.id IS NULL;",
  },
];

/**
 * Где MySQL, SQLite и PostgreSQL отвечают на один запрос по-разному.
 *
 * Колонка SQLite – прогон этих запросов здесь, на sql.js 1.14.2 (SQLite 3.49.1) с переводом из
 * sql-shared.js. MySQL 8.0 и PostgreSQL – по их документации и поведению по умолчанию
 * (MySQL: сравнение utf8mb4_0900_ai_ci, режим ONLY_FULL_GROUP_BY).
 */
export const ENGINE_DIFFS = [
  {
    topic: "Регистр букв в сравнении",
    query: "SELECT id, status FROM orders WHERE status = 'Paid';",
    mysql: "14 строк: 'Paid' и 'paid' для MySQL одно и то же",
    sqlite: "1 строка: регистр различается",
    postgres: "1 строка, как в SQLite",
  },
  {
    topic: "LIKE и русские буквы",
    query: "SELECT id, name FROM products WHERE name LIKE '%наушники%';",
    mysql: "Находит \"Наушники беспроводные Тишина\" и \"Наушники проводные Базовые\"",
    sqlite: "Пусто: без учета регистра SQLite сравнивает только латиницу",
    postgres: "Пусто: LIKE различает регистр, без него ищет ILIKE",
  },
  {
    topic: "Деление целых",
    query: "SELECT 7 / 2 AS half;",
    mysql: "3.5000",
    sqlite: "3: дробная часть отбрасывается",
    postgres: "3, как в SQLite",
  },
  {
    topic: "Вид среднего",
    query: "SELECT AVG(quantity) AS avg_quantity FROM order_items;",
    mysql: "Четыре знака после запятой",
    sqlite: "Число целиком: 1.8547008547008548",
    postgres: "numeric с длинной дробной частью",
  },
  {
    topic: "Склейка строк через ||",
    query: "SELECT 'a' || 'b' AS glued, CONCAT('a', 'b') AS same_everywhere;",
    mysql: "0: для MySQL || – логическое ИЛИ. CONCAT дает ab",
    sqlite: "ab и ab",
    postgres: "ab и ab",
  },
  {
    topic: "Колонка вне GROUP BY",
    query: "SELECT customer_id, status, COUNT(*) AS orders_count\nFROM orders\nGROUP BY customer_id;",
    mysql: "Ошибка 1055",
    sqlite: "Выполнит и возьмет status из любой строки группы",
    postgres: "Ошибка, как в MySQL",
  },
  {
    topic: "Порядок групп без ORDER BY",
    query: "SELECT status, COUNT(*) AS orders_count\nFROM orders\nGROUP BY status;",
    mysql: "Порядок не обещан",
    sqlite: "Обычно по возрастанию ключа группы, но и это не гарантия",
    postgres: "Порядок не обещан",
  },
  {
    topic: "FULL OUTER JOIN",
    query: "SELECT c.id AS customer_id, o.id AS order_id\nFROM customers c\nFULL OUTER JOIN orders o ON o.customer_id = c.id;",
    mysql: "Ошибка: полного соединения нет, его собирают из LEFT JOIN, UNION и RIGHT JOIN",
    sqlite: "61 строка (поддерживается с версии 3.39)",
    postgres: "61 строка",
  },
  {
    topic: "Приведение к целому",
    query: "SELECT CAST(2.6 AS SIGNED) AS signed_int, CAST(2.6 AS INTEGER) AS integer_int;",
    mysql: "AS SIGNED дает 3, а AS INTEGER – ошибку",
    sqlite: "3 и 2: AS SIGNED здесь переписывается в CAST(ROUND(x) AS INTEGER), а AS INTEGER отбрасывает дробь",
    postgres: "SIGNED не знает, AS INTEGER округляет до 3",
  },
  {
    topic: "TRUNCATE внутри транзакции",
    query: "START TRANSACTION;\nTRUNCATE TABLE reviews;\nROLLBACK;\nSELECT COUNT(*) AS reviews_left FROM reviews;",
    mysql: "0: TRUNCATE завершает транзакцию, ROLLBACK ничего не вернет",
    sqlite: "24: TRUNCATE выполняется как DELETE, и ROLLBACK его отменяет",
    postgres: "24: ROLLBACK вернет таблицу",
  },
  {
    topic: "Внешние ключи",
    query: "PRAGMA foreign_keys;",
    mysql: "InnoDB проверяет: строку со ссылкой в никуда не примет",
    sqlite: "Не проверяются (0). Включает PRAGMA foreign_keys = ON; поэтому в базе и нашлась позиция-сирота",
    postgres: "Проверяются",
  },
  {
    topic: "Длина VARCHAR(n)",
    query: "CREATE TABLE notes (title VARCHAR(5));\nINSERT INTO notes VALUES ('слишком длинно');\nSELECT title FROM notes;",
    mysql: "Ошибка 1406 в строгом режиме: строка длиннее n не поместится",
    sqlite: "Сохранит строку целиком: длину SQLite не проверяет",
    postgres: "Ошибка, как в MySQL",
  },
  {
    topic: "Год из даты",
    query: "SELECT strftime('%Y', created_at) AS year, COUNT(*) AS orders_count\nFROM orders\nGROUP BY year\nORDER BY year;",
    mysql: "strftime нет, пишут YEAR(created_at)",
    sqlite: "strftime('%Y', ...) – даты здесь хранятся текстом",
    postgres: "EXTRACT(YEAR FROM created_at)",
  },
  {
    topic: "Пустое значение",
    query: "SELECT IFNULL(NULL, 0) AS a, COALESCE(NULL, 0) AS b;",
    mysql: "Обе функции работают",
    sqlite: "Обе функции работают",
    postgres: "IFNULL нет, работает только COALESCE",
  },
  {
    topic: "Имя текущей базы",
    query: "SELECT DATABASE();",
    mysql: "Имя базы",
    sqlite: "Ошибка: база одна, функции нет",
    postgres: "Функции нет, вместо нее current_database()",
  },
  {
    topic: "Текст ошибки",
    query: "SELECT nickname FROM customers;",
    mysql: "Unknown column 'nickname' in 'field list'",
    sqlite: "no such column: nickname",
    postgres: "column \"nickname\" does not exist",
  },
];

/** Что песочница переписывает сама, чтобы запросы под MySQL выполнялись в SQLite. */
export const AUTO_TRANSLATED = [
  { from: "START TRANSACTION", to: "BEGIN" },
  { from: "TRUNCATE TABLE x", to: "DELETE FROM x" },
  { from: "AUTO_INCREMENT", to: "убирается: ключ INTEGER PRIMARY KEY нумеруется сам" },
  { from: "CAST(x AS SIGNED)", to: "CAST(ROUND(x) AS INTEGER)" },
];
