import { actorEmail, logAudit } from "../../audit";

function config() {
  const g = globalThis as typeof globalThis & {
    __SITES_DB?: D1Database;
    __SHEETS_URL?: string;
    __SHEETS_KEY?: string;
  };
  if (!g.__SITES_DB || !g.__SHEETS_URL || !g.__SHEETS_KEY)
    throw new Error("Google Sheets sync is not configured");
  return { db: g.__SITES_DB, url: g.__SHEETS_URL, key: g.__SHEETS_KEY };
}
export async function POST(req: Request) {
  try {
    const { db, url, key } = config();
    const actor = await actorEmail();
    const body = (await req.json().catch(() => ({}))) as { direction?: string };
    const direction = body.direction || "push";
    await db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, total_amount REAL NOT NULL, created_at TEXT NOT NULL)",
      ),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS stock_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_code TEXT NOT NULL, item_name TEXT NOT NULL, type TEXT NOT NULL, change INTEGER NOT NULL, balance INTEGER NOT NULL, created_at TEXT NOT NULL)",
      ),
    ]);
    let pulled = 0;
    if (direction === "pull" || direction === "both") {
      const source = new URL(url);
      source.searchParams.set("key", key);
      const sheetResponse = await fetch(source.toString(), {
        redirect: "follow",
      });
      const sheetData = (await sheetResponse.json()) as {
        success?: boolean;
        error?: string;
        inventory?: Array<Record<string, unknown>>;
      };
      if (!sheetResponse.ok || !sheetData.success)
        throw new Error(sheetData.error || "Could not read Google Sheet");
      for (const row of sheetData.inventory || []) {
        const name = String(row.Style || "").trim(),
          brand = String(row.Brand || "").trim(),
          category = String(row.Category || "Budget").trim();
        const sellingPrice = Number(row["Selling Price"] || 0),
          costPrice = Number(row["Cost Price"] || 0),
          quantity = Math.max(0, Number(row.Quantity) || 0),
          reorderLevel = Math.max(0, Number(row["Reorder Level"]) || 3),
          color = String(row.Colour || "");
        if (!name || !brand || !sellingPrice) continue;
        let code = String(row.Code || "").trim();
        if (!code) {
          const prefix =
            (
              {
                Budget: "B",
                Classic: "C",
                Premium: "P",
                Luxury: "L",
              } as Record<string, string>
            )[category] || "E";
          const band = String(Math.round(sellingPrice / 1000)).padStart(4, "0");
          const count = await db
            .prepare(
              "SELECT COUNT(*) as count FROM inventory WHERE code LIKE ?",
            )
            .bind(`${prefix}${band}-%`)
            .first<{ count: number }>();
          code = `${prefix}${band}-${String((count?.count || 0) + 1).padStart(2, "0")}`;
        }
        const existing = await db
          .prepare(
            "SELECT name,brand,category,color,quantity,cost_price as costPrice,selling_price as sellingPrice,reorder_level as reorderLevel FROM inventory WHERE code=?",
          )
          .bind(code)
          .first<Record<string, unknown>>();
        const changed =
          !existing ||
          existing.name !== name ||
          existing.brand !== brand ||
          existing.category !== category ||
          existing.color !== color ||
          Number(existing.quantity) !== quantity ||
          Number(existing.costPrice) !== costPrice ||
          Number(existing.sellingPrice) !== sellingPrice ||
          Number(existing.reorderLevel) !== reorderLevel;
        if (!changed) continue;
        await db
          .prepare(
            "INSERT INTO inventory (code,name,brand,category,color,quantity,cost_price,selling_price,reorder_level,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,brand=excluded.brand,category=excluded.category,color=excluded.color,quantity=excluded.quantity,cost_price=excluded.cost_price,selling_price=excluded.selling_price,reorder_level=excluded.reorder_level",
          )
          .bind(
            code,
            name,
            brand,
            category,
            color,
            quantity,
            costPrice,
            sellingPrice,
            reorderLevel,
            String(row["Created At"] || new Date().toISOString()),
          )
          .run();
        await logAudit(
          actor,
          existing
            ? "Spreadsheet product updated"
            : "Spreadsheet product added",
          "inventory",
          code,
          `${name} ${existing ? "updated from" : "added from"} Google Sheet`,
          "google-sheet",
        );
        pulled++;
      }
      if (direction === "pull")
        return Response.json({
          success: true,
          pulled,
          message: `${pulled} spreadsheet changes imported`,
        });
    }
    const [inventory, sales, activity] = await Promise.all([
      db
        .prepare(
          "SELECT code,name,brand,category,color,quantity,cost_price as costPrice,selling_price as sellingPrice,reorder_level as reorderLevel,created_at as createdAt FROM inventory ORDER BY id",
        )
        .all(),
      db
        .prepare(
          "SELECT item_code as itemCode,item_name as itemName,quantity,unit_price as unitPrice,total_amount as totalAmount,created_at as createdAt FROM sales ORDER BY id",
        )
        .all(),
      db
        .prepare(
          "SELECT item_code as itemCode,item_name as itemName,type,change,balance,created_at as createdAt FROM stock_activity ORDER BY id",
        )
        .all(),
    ]);
    const result = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key,
        inventory: inventory.results,
        sales: sales.results,
        stockActivity: activity.results,
      }),
      redirect: "follow",
    });
    const data = (await result.json()) as {
      success?: boolean;
      error?: string;
      synchronizedAt?: string;
    };
    if (!result.ok || !data.success)
      return Response.json(
        {
          success: false,
          error: data.error || "Spreadsheet rejected the update",
        },
        { status: 502 },
      );
    if (pulled)
      await logAudit(
        actor,
        "Spreadsheet synchronized",
        "sync",
        null,
        `${pulled} changes pulled; current records pushed to Google Sheet`,
        "google-sheet",
      );
    return Response.json({ ...data, pulled });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Synchronization failed",
      },
      { status: 500 },
    );
  }
}
