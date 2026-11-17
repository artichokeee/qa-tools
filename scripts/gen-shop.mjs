/**
 * Генератор учебной базы "интернет-магазин" для SQL-песочницы.
 *
 * Данные выдуманы и собираются детерминированно: один и тот же сид дает один и тот же файл, поэтому
 * номера строк с багами в README не уплывают. Пересобрать: `node scripts/gen-shop.mjs`.
 * Тест `tests/data.test.js` проверяет, что файл в репозитории совпадает с выводом генератора.
 *
 * Баги в данных заложены намеренно, ниже в `plantBugs()`. Их список с ответами – в README под спойлером.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = 20261117;

/** mulberry32: маленький ГПСЧ с сидом, чтобы файл не менялся от запуска к запуску. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  [1, "Электроника", null],
  [2, "Смартфоны", 1],
  [3, "Наушники и колонки", 1],
  [4, "Дом и кухня", null],
  [5, "Посуда", 4],
  [6, "Книги", null],
  [7, "Спорт и отдых", null],
  [8, "Канцелярия", null],
];

// [категория, название, цена]
const PRODUCTS = [
  [2, "Смартфон Лира 6, 128 ГБ", 24990],
  [2, "Смартфон Лира 6 Pro, 256 ГБ", 38990],
  [2, "Смартфон Нота S, 64 ГБ", 12490],
  [2, "Чехол-книжка для Лира 6", 990],
  [2, "Защитное стекло для Нота S", 490],
  [3, "Наушники беспроводные Тишина", 5990],
  [3, "Наушники проводные Базовые", 790],
  [3, "Колонка портативная Волна", 4490],
  [3, "Колонка умная Домовой", 8990],
  [1, "Пауэрбанк 10 000 мА·ч", 2190],
  [1, "Кабель USB-C, 1 м", 390],
  [1, "Зарядное устройство 30 Вт", 1490],
  [5, "Сковорода с антипригарным покрытием, 26 см", 2790],
  [5, "Кастрюля 3 л", 1990],
  [5, "Набор ножей, 5 предметов", 3490],
  [5, "Кружка керамическая 350 мл", 450],
  [5, "Чайник заварочный стеклянный", 1290],
  [4, "Чайник электрический", 2490],
  [4, "Блендер погружной", 3990],
  [4, "Плед флисовый 150x200", 1590],
  [4, "Лампа настольная светодиодная", 2290],
  [6, "Книга \"Тестирование без страха\"", 890],
  [6, "Книга \"SQL за выходные\"", 1150],
  [6, "Книга \"Баги, которые мы любим\"", 760],
  [6, "Книга \"Логика для всех\"", 640],
  [7, "Коврик для йоги", 1490],
  [7, "Бутылка для воды 0,7 л", 690],
  [7, "Гантели разборные 2x5 кг", 4290],
  [7, "Скакалка скоростная", 590],
  [8, "Блокнот в клетку A5", 290],
  [8, "Набор маркеров, 12 цветов", 540],
  [8, "Ручка гелевая, синяя", 90],
  [8, "Стикеры для заметок, 400 шт.", 210],
  [7, "Палатка туристическая двухместная", 7990],
  [4, "Увлажнитель воздуха", 4790],
  [1, "Веб-камера Full HD", 3290],
];

// [имя по-русски, латиница]
const MEN = [["Иван", "ivan"], ["Дмитрий", "dmitry"], ["Алексей", "alexey"], ["Сергей", "sergey"], ["Андрей", "andrey"], ["Максим", "maxim"], ["Никита", "nikita"], ["Олег", "oleg"], ["Павел", "pavel"], ["Роман", "roman"]];
const WOMEN = [["Анна", "anna"], ["Мария", "maria"], ["Елена", "elena"], ["Ольга", "olga"], ["Ирина", "irina"], ["Наталья", "natalia"], ["Светлана", "svetlana"], ["Дарья", "darya"], ["Юлия", "yulia"], ["Ксения", "ksenia"]];
// [мужская форма, женская форма, латиница]
const SURNAMES = [["Иванов", "Иванова", "ivanov"], ["Смирнов", "Смирнова", "smirnov"], ["Кузнецов", "Кузнецова", "kuznetsov"], ["Попов", "Попова", "popov"], ["Васильев", "Васильева", "vasiliev"], ["Соколов", "Соколова", "sokolov"], ["Михайлов", "Михайлова", "mikhailov"], ["Новиков", "Новикова", "novikov"], ["Морозов", "Морозова", "morozov"], ["Волков", "Волкова", "volkov"], ["Лебедев", "Лебедева", "lebedev"], ["Козлов", "Козлова", "kozlov"], ["Орлов", "Орлова", "orlov"], ["Зайцев", "Зайцева", "zaitsev"], ["Белов", "Белова", "belov"]];
const CITIES = ["Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург", "Минск", "Алматы", "Нижний Новгород", "Самара"];
const DOMAINS = ["mail.test", "post.test", "inbox.test"];
const STATUSES = ["new", "paid", "paid", "shipped", "delivered", "delivered", "delivered", "cancelled"];
const REVIEW_TEXTS = [
  [5, "Все как в описании, пришло быстро."],
  [5, "Пользуюсь месяц, нареканий нет."],
  [4, "Хорошо, но упаковка была помята."],
  [4, "За свои деньги отлично."],
  [3, "Нормально, ожидал большего."],
  [3, "Работает, но инструкция непонятная."],
  [2, "Через неделю появился брак."],
  [1, "Пришел не тот цвет, оформил возврат."],
  [5, "Беру второй раз, в подарок."],
  [4, "Удобно, рекомендую."],
];

const pad = (n) => String(n).padStart(2, "0");
const DAY = 86_400_000;
const date = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

export function buildShop() {
  const r = rng(SEED);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (xs) => xs[Math.floor(r() * xs.length)];

  const categories = CATEGORIES.map(([id, name, parent_id]) => ({ id, name, parent_id }));
  const products = PRODUCTS.map(([category_id, name, price], i) => ({
    id: i + 1,
    category_id,
    name,
    price,
    stock: int(0, 60),
    is_active: 1,
  }));

  const customers = [];
  const usedEmails = new Set();
  const start = Date.UTC(2025, 0, 5);
  for (let id = 1; id <= 36; id++) {
    const woman = r() < 0.5;
    const [first, firstLat] = pick(woman ? WOMEN : MEN);
    const [m, f, lastLat] = pick(SURNAMES);
    let email = `${firstLat}.${lastLat}${woman ? "a" : ""}@${pick(DOMAINS)}`;
    for (let n = 2; usedEmails.has(email); n++) email = email.replace(/(\d*)@/, `${n}@`);
    usedEmails.add(email);
    customers.push({
      id,
      email,
      full_name: `${first} ${woman ? f : m}`,
      city: pick(CITIES),
      phone: r() < 0.2 ? null : `+7 9${int(10, 99)} ${int(100, 999)}-${pad(int(0, 99))}-${pad(int(0, 99))}`,
      created_at: date(start + (id - 1) * 9 * DAY + int(0, 6) * DAY),
    });
  }

  // Продаются товары 1–32, кроме 17: 33–36 и 17 остаются без продаж (пример с подзапросом).
  const sellable = products.filter((p) => p.id <= 32 && p.id !== 17);
  const orders = [];
  const items = [];
  const limit = Date.UTC(2026, 9, 31);
  for (let id = 1; id <= 50; id++) {
    // Часть покупателей заказывает чаще: так у HAVING есть что найти.
    const c = r() < 0.35 ? customers[int(0, 5)] : pick(customers);
    const signup = Date.parse(`${c.created_at}T00:00:00Z`);
    const at = Math.min(signup + int(1, 300) * DAY, limit);
    orders.push({ id, customer_id: c.id, created_at: `${date(at)} ${pad(int(9, 22))}:${pad(int(0, 59))}`, status: pick(STATUSES), total: 0 });
  }
  for (const o of orders) {
    if (o.id === 38) continue; // баг: заказ без позиций
    const n = int(1, 4);
    const taken = new Set();
    for (let k = 0; k < n; k++) {
      const p = pick(sellable);
      if (taken.has(p.id)) continue;
      taken.add(p.id);
      const quantity = p.price < 1000 ? int(1, 4) : int(1, 2);
      items.push({ id: items.length + 1, order_id: o.id, product_id: p.id, quantity, price: p.price });
      o.total += quantity * p.price;
    }
  }

  const reviews = [];
  const delivered = orders.filter((o) => o.status === "delivered" && o.id !== 38);
  for (let id = 1; id <= 24; id++) {
    const o = delivered[(id * 7) % delivered.length];
    const its = items.filter((i) => i.order_id === o.id);
    const it = its[id % its.length];
    const [rating, body] = pick(REVIEW_TEXTS);
    const at = Date.parse(`${o.created_at.slice(0, 10)}T00:00:00Z`) + int(5, 20) * DAY;
    reviews.push({ id, product_id: it.product_id, customer_id: o.customer_id, rating, body, created_at: date(at) });
  }

  plantBugs({ customers, products, orders, items, reviews });
  return { categories, products, customers, orders, items, reviews };
}

/** Намеренные баги. Номера фиксированы – по ним сверяется README. */
function plantBugs({ customers, products, orders, items, reviews }) {
  // 1. Дубль email: человек зарегистрировался второй раз.
  customers[30].email = customers[11].email;
  // 2. Пустой обязательный email.
  customers[23].email = null;
  // 3. Отрицательная цена.
  products[16].price = -390;
  // 4. Заказ без позиций, но с суммой и статусом "оплачен".
  const o38 = orders[37];
  o38.status = "paid";
  o38.total = 2490;
  // 5. Заказ раньше регистрации покупателя.
  const o21 = orders[20];
  const c21 = customers.find((c) => c.id === o21.customer_id);
  o21.created_at = `${date(Date.parse(`${c21.created_at}T00:00:00Z`) - 30 * DAY)} 12:15`;
  // 6. Позиция заказа ссылается на несуществующий товар.
  items.push({ id: items.length + 1, order_id: 12, product_id: 99, quantity: 1, price: 1990 });
  orders[11].total += 1990;
  // 7. Оценка вне шкалы 1–5.
  reviews[8].rating = 6;
  // 8. Сумма заказа не сходится с позициями.
  orders[8].total += 1000;
  // 9. Статус не из справочника: регистр.
  orders[13].status = "Paid";
}

export function shopSql() {
  const db = buildShop();
  const ins = (table, cols, rows) =>
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` + rows.map((x) => `  (${cols.map((c) => q(x[c])).join(", ")})`).join(",\n") + ";\n";

  return `-- Учебная база "интернет-магазин" для SQL-песочницы qa-tools.
-- Данные выдуманы и собраны скриптом scripts/gen-shop.mjs. Не правьте этот файл руками.
--
-- Требования к данным (по ним и ищутся баги):
--   - email покупателя обязателен и уникален;
--   - цена товара больше нуля;
--   - в заказе есть хотя бы одна позиция, и каждая позиция ссылается на существующий товар;
--   - заказ оформлен не раньше регистрации покупателя;
--   - total заказа равен сумме quantity * price его позиций;
--   - status заказа – одно из: new, paid, shipped, delivered, cancelled;
--   - оценка в отзыве – от 1 до 5.

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name VARCHAR(200) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  email VARCHAR(200),
  full_name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  phone VARCHAR(30),
  created_at DATE NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  created_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL,
  total DECIMAL(10, 2) NOT NULL
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  rating INTEGER NOT NULL,
  body TEXT,
  created_at DATE NOT NULL
);

${ins("categories", ["id", "name", "parent_id"], db.categories)}
${ins("products", ["id", "category_id", "name", "price", "stock", "is_active"], db.products)}
${ins("customers", ["id", "email", "full_name", "city", "phone", "created_at"], db.customers)}
${ins("orders", ["id", "customer_id", "created_at", "status", "total"], db.orders)}
${ins("order_items", ["id", "order_id", "product_id", "quantity", "price"], db.items)}
${ins("reviews", ["id", "product_id", "customer_id", "rating", "body", "created_at"], db.reviews)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL("../sql/shop.sql", import.meta.url));
  writeFileSync(out, shopSql());
  const d = buildShop();
  const n = Object.values(d).reduce((s, t) => s + t.length, 0);
  console.log(`sql/shop.sql: ${n} строк в ${Object.keys(d).length} таблицах`);
}
