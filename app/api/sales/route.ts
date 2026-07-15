function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Inventory database is unavailable");
  return value;
}
export async function GET() {
  await db()
    .prepare(
      "CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, total_amount REAL NOT NULL, created_at TEXT NOT NULL)",
    )
    .run();
  const { results } = await db()
    .prepare(
      "SELECT id,item_code as itemCode,item_name as itemName,quantity,unit_price as unitPrice,total_amount as totalAmount,created_at as createdAt FROM sales ORDER BY id DESC",
    )
    .all();
  return Response.json({ sales: results });
}
