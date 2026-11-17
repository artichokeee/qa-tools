# Draws sql/schema.svg – the diagram of the demo shop database: one box per table, PK and FK marked,
# an arrow from every foreign key to the table it points at. Positions are fixed by hand so the lines
# never cross a box. Run after changing the tables in scripts/gen-shop.mjs:  python3 scripts/gen-schema.py
from pathlib import Path
from html import escape

W, HEAD, ROW, PAD = 260, 32, 22, 8
X = [20, 330, 640]
TOP, BOTTOM = 24, 270

# table: (column, type, key) – key is "PK", "FK" or ""
TABLES = {
    "categories": (X[0], TOP, [("id", "INTEGER", "PK"), ("name", "VARCHAR(100)", ""), ("parent_id", "INTEGER", "FK")]),
    "products": (X[1], TOP, [("id", "INTEGER", "PK"), ("category_id", "INTEGER", "FK"), ("name", "VARCHAR(200)", ""),
                             ("price", "DECIMAL(10,2)", ""), ("stock", "INTEGER", ""), ("is_active", "INTEGER", "")]),
    "order_items": (X[2], TOP, [("id", "INTEGER", "PK"), ("order_id", "INTEGER", "FK"), ("product_id", "INTEGER", "FK"),
                                ("quantity", "INTEGER", ""), ("price", "DECIMAL(10,2)", "")]),
    "reviews": (X[0], BOTTOM, [("id", "INTEGER", "PK"), ("product_id", "INTEGER", "FK"), ("customer_id", "INTEGER", "FK"),
                               ("rating", "INTEGER", ""), ("body", "TEXT", ""), ("created_at", "DATE", "")]),
    "customers": (X[1], BOTTOM, [("id", "INTEGER", "PK"), ("email", "VARCHAR(200)", ""), ("full_name", "VARCHAR(200)", ""),
                                 ("city", "VARCHAR(100)", ""), ("phone", "VARCHAR(30)", ""), ("created_at", "DATE", "")]),
    "orders": (X[2], BOTTOM, [("id", "INTEGER", "PK"), ("customer_id", "INTEGER", "FK"), ("created_at", "DATETIME", ""),
                              ("status", "VARCHAR(20)", ""), ("total", "DECIMAL(10,2)", "")]),
}

def row_y(table, col):
    x, y, cols = TABLES[table]
    i = [c[0] for c in cols].index(col)
    return y + HEAD + i * ROW + ROW // 2 + 4

def bottom(table):
    x, y, cols = TABLES[table]
    return y + HEAD + len(cols) * ROW + PAD

# (path, title) – every path ends at the referenced table, the marker draws the arrow there
L, R = lambda t: TABLES[t][0], lambda t: TABLES[t][0] + W
LINKS = [
    (f"M{L('products')} {row_y('products','category_id')} H305 V{row_y('categories','id')} H{R('categories')}", "products.category_id → categories.id"),
    (f"M{L('categories')} {row_y('categories','parent_id')} H8 V{row_y('categories','id')} H{L('categories')}", "categories.parent_id → categories.id"),
    (f"M{L('order_items')} {row_y('order_items','product_id')} H615 V{row_y('products','id')} H{R('products')}", "order_items.product_id → products.id"),
    (f"M{R('order_items')} {row_y('order_items','order_id')} H915 V{row_y('orders','id')} H{R('orders')}", "order_items.order_id → orders.id"),
    (f"M{L('orders')} {row_y('orders','customer_id')} H615 V{row_y('customers','id')} H{R('customers')}", "orders.customer_id → customers.id"),
    (f"M{R('reviews')} {row_y('reviews','customer_id')} H305 V{row_y('customers','id')} H{L('customers')}", "reviews.customer_id → customers.id"),
    (f"M{L('reviews')} {row_y('reviews','product_id')} H8 V{BOTTOM - 34} H460 V{bottom('products')}", "reviews.product_id → products.id"),
]

INK, INK3, LINE, RAISED, TOPC, TOPINK, ACCENT, GOLD = "#241a10", "#6a5740", "#b9a988", "#faf5ea", "#171326", "#ece2ce", "#7f520c", "#d9ad33"
HEIGHT = max(bottom(t) for t in TABLES) + 16

out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 930 {HEIGHT}" width="930" height="{HEIGHT}" role="img" '
       f'aria-labelledby="t d" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13">',
       '<title id="t">Схема учебной базы интернет-магазина</title>',
       '<desc id="d">' + escape("; ".join(t for _, t in LINKS)) + '</desc>',
       f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
       f'<path d="M0 0 L10 5 L0 10 z" fill="{ACCENT}"/></marker></defs>']
for d, title in LINKS:
    out.append(f'<path d="{d}" fill="none" stroke="{ACCENT}" stroke-width="1.6" marker-end="url(#a)"><title>{escape(title)}</title></path>')
for name, (x, y, cols) in TABLES.items():
    h = HEAD + len(cols) * ROW + PAD
    out.append(f'<g><rect x="{x}" y="{y}" width="{W}" height="{h}" rx="10" fill="{RAISED}" stroke="{LINE}"/>')
    out.append(f'<path d="M{x} {y + 10} a10 10 0 0 1 10 -10 H{x + W - 10} a10 10 0 0 1 10 10 V{y + HEAD} H{x} z" fill="{TOPC}"/>')
    out.append(f'<text x="{x + 12}" y="{y + 21}" fill="{TOPINK}" font-weight="700" font-size="14">{name}</text>')
    for i, (col, typ, key) in enumerate(cols):
        ty = y + HEAD + i * ROW + ROW // 2 + 8
        weight = ' font-weight="700"' if key == "PK" else ""
        out.append(f'<text x="{x + 12}" y="{ty}" fill="{INK}"{weight}>{col}</text>')
        out.append(f'<text x="{x + 150}" y="{ty}" fill="{INK3}" font-size="11.5">{typ}</text>')
        if key:
            out.append(f'<text x="{x + W - 12}" y="{ty}" fill="{ACCENT if key == "FK" else GOLD}" font-weight="700" font-size="11" text-anchor="end">{key}</text>')
    out.append('</g>')
out.append('</svg>\n')
Path(__file__).resolve().parent.parent.joinpath("sql", "schema.svg").write_text("\n".join(out), encoding="utf-8")
print("sql/schema.svg", HEIGHT)
