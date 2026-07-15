import { actorEmail, logAudit } from "../../../audit";
function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Inventory database is unavailable");
  return value;
}
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await actorEmail();
  const { delta } = (await req.json()) as { delta: number };
  if (![-1, 1].includes(delta))
    return Response.json({ error: "Invalid stock change" }, { status: 400 });
  const item = await db()
    .prepare(
      "SELECT code,name,quantity,selling_price as sellingPrice FROM inventory WHERE id=?",
    )
    .bind(Number(id))
    .first<{
      code: string;
      name: string;
      quantity: number;
      sellingPrice: number;
    }>();
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  const balance = Math.max(0, item.quantity + delta);
  const actual = balance - item.quantity;
  if (!actual) return Response.json({ ok: true });
  const now = new Date().toISOString();
  const statements = [
    db()
      .prepare("UPDATE inventory SET quantity=? WHERE id=?")
      .bind(balance, Number(id)),
    db()
      .prepare(
        "INSERT INTO stock_activity (item_id,item_code,item_name,type,change,balance,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        Number(id),
        item.code,
        item.name,
        actual < 0 ? "Sale" : "Restock",
        actual,
        balance,
        now,
      ),
  ];
  if (actual < 0) {
    await db()
      .prepare(
        "CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, total_amount REAL NOT NULL, created_at TEXT NOT NULL)",
      )
      .run();
    statements.push(
      db()
        .prepare(
          "INSERT INTO sales (item_id,item_code,item_name,quantity,unit_price,total_amount,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          Number(id),
          item.code,
          item.name,
          Math.abs(actual),
          item.sellingPrice,
          Math.abs(actual) * item.sellingPrice,
          now,
        ),
    );
  }
  await db().batch(statements);
  await logAudit(
    actor,
    actual < 0 ? "Sale recorded" : "Stock restocked",
    actual < 0 ? "sale" : "stock",
    item.code,
    actual < 0
      ? `${Math.abs(actual)} unit sold for ₦${item.sellingPrice}`
      : `${actual} unit added; new balance ${balance}`,
  );
  return Response.json({ ok: true });
}
