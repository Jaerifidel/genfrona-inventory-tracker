import { actorEmail, logAudit } from "../../../../audit";
function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Inventory database is unavailable");
  return value;
}
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await actorEmail();
  const before = await db()
    .prepare(
      "SELECT code,name,selling_price as sellingPrice,quantity FROM inventory WHERE id=?",
    )
    .bind(Number(id))
    .first<{
      code: string;
      name: string;
      sellingPrice: number;
      quantity: number;
    }>();
  const x = (await req.json()) as Record<string, unknown>;
  if (!x.name || !x.brand || !x.category || !Number(x.sellingPrice))
    return Response.json(
      { error: "Name, brand, category and selling price are required" },
      { status: 400 },
    );
  const result = await db()
    .prepare(
      "UPDATE inventory SET name=?,brand=?,category=?,color=?,quantity=?,cost_price=?,selling_price=?,reorder_level=? WHERE id=? RETURNING id,code,name,brand,category,color,quantity,cost_price as costPrice,selling_price as sellingPrice,reorder_level as reorderLevel,created_at as createdAt",
    )
    .bind(
      String(x.name),
      String(x.brand),
      String(x.category),
      String(x.color || ""),
      Math.max(0, Number(x.quantity) || 0),
      Math.max(0, Number(x.costPrice) || 0),
      Math.max(0, Number(x.sellingPrice) || 0),
      Math.max(0, Number(x.reorderLevel) || 0),
      Number(id),
    )
    .first();
  if (before)
    await logAudit(
      actor,
      "Product edited",
      "inventory",
      before.code,
      `${before.name} updated; selling price ₦${before.sellingPrice} → ₦${Number(x.sellingPrice)}, quantity ${before.quantity} → ${Number(x.quantity)}`,
    );
  return Response.json({ item: result });
}
