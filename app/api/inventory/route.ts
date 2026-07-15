import { actorEmail, logAudit } from "../../audit";
const create = `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL, color TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0, cost_price REAL NOT NULL, selling_price REAL NOT NULL, reorder_level INTEGER NOT NULL DEFAULT 3, created_at TEXT NOT NULL)`;
function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Inventory database is unavailable");
  return value;
}
async function ready() {
  await db().batch([
    db().prepare(create),
    db().prepare(
      "CREATE TABLE IF NOT EXISTS stock_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, type TEXT NOT NULL, change INTEGER NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL)",
    ),
  ]);
}
export async function GET() {
  await ready();
  const { results } = await db()
    .prepare(
      "SELECT id, code, name, brand, category, color, quantity, cost_price as costPrice, selling_price as sellingPrice, reorder_level as reorderLevel, created_at as createdAt FROM inventory ORDER BY id DESC",
    )
    .all();
  return Response.json({ items: results });
}
export async function POST(req: Request) {
  await ready();
  const actor = await actorEmail();
  const x = (await req.json()) as Record<string, unknown>;
  if (!x.name || !x.brand || !x.category || !Number(x.sellingPrice))
    return Response.json(
      { error: "Name, brand, category and selling price are required" },
      { status: 400 },
    );
  const prefix =
    (
      { Budget: "B", Classic: "C", Premium: "P", Luxury: "L" } as Record<
        string,
        string
      >
    )[String(x.category)] || "E";
  const band = String(Math.round(Number(x.sellingPrice) / 1000)).padStart(
    4,
    "0",
  );
  const row = await db()
    .prepare("SELECT COUNT(*) as count FROM inventory WHERE code LIKE ?")
    .bind(`${prefix}${band}-%`)
    .first<{ count: number }>();
  const code = `${prefix}${band}-${String((row?.count || 0) + 1).padStart(2, "0")}`;
  const createdAt = new Date().toISOString();
  const qty = Math.max(0, Number(x.quantity) || 0);
  const result = await db()
    .prepare(
      "INSERT INTO inventory (code,name,brand,category,color,quantity,cost_price,selling_price,reorder_level,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id, code, name, brand, category, color, quantity, cost_price as costPrice, selling_price as sellingPrice, reorder_level as reorderLevel, created_at as createdAt",
    )
    .bind(
      code,
      String(x.name),
      String(x.brand),
      String(x.category),
      String(x.color || ""),
      qty,
      Math.max(0, Number(x.costPrice) || 0),
      Number(x.sellingPrice),
      Math.max(0, Number(x.reorderLevel) || 0),
      createdAt,
    )
    .first<{ id: number }>();
  if (result && qty)
    await db()
      .prepare(
        "INSERT INTO stock_activity (item_id,item_code,item_name,type,change,balance,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        result.id,
        code,
        String(x.name),
        "Opening stock",
        qty,
        qty,
        createdAt,
      )
      .run();
  await logAudit(
    actor,
    "Product added",
    "inventory",
    code,
    `${String(x.name)} added with ${qty} units`,
  );
  if (qty)
    await logAudit(
      actor,
      "Opening stock",
      "stock",
      code,
      `${qty} opening units recorded`,
    );
  return Response.json({ item: result }, { status: 201 });
}
