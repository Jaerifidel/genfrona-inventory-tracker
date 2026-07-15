function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Inventory database is unavailable");
  return value;
}
export async function GET() {
  await db()
    .prepare(
      "CREATE TABLE IF NOT EXISTS stock_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, type TEXT NOT NULL, change INTEGER NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL)",
    )
    .run();
  const { results } = await db()
    .prepare(
      "SELECT id,item_code as itemCode,item_name as itemName,type,change,balance,created_at as createdAt FROM stock_activity ORDER BY id DESC LIMIT 100",
    )
    .all();
  return Response.json({ activities: results });
}
