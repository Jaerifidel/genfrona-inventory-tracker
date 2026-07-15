import { headers } from "next/headers";
import { logAudit } from "../../audit";
function db() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Database unavailable");
  return value;
}
async function identity() {
  const h = await headers();
  return {
    email: h.get("x-genfrona-email") || "",
    role: h.get("x-genfrona-role") || "",
  };
}
export async function GET() {
  const me = await identity();
  if (me.role !== "admin")
    return Response.json({ error: "Admin access required" }, { status: 403 });
  const { results } = await db()
    .prepare(
      "SELECT id,email,role,status,invited_by as invitedBy,created_at as createdAt FROM app_users ORDER BY id",
    )
    .all();
  return Response.json({ users: results, me });
}
export async function POST(req: Request) {
  const me = await identity();
  if (me.role !== "admin")
    return Response.json({ error: "Admin access required" }, { status: 403 });
  const x = (await req.json()) as { email?: string; role?: string };
  const email = x.email?.trim().toLowerCase();
  const role = x.role === "admin" ? "admin" : "staff";
  if (!email || !email.includes("@"))
    return Response.json(
      { error: "Enter a valid email address" },
      { status: 400 },
    );
  await db()
    .prepare(
      "INSERT INTO app_users (email,role,status,invited_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,status='active'",
    )
    .bind(email, role, "active", me.email, new Date().toISOString())
    .run();
  await logAudit(
    me.email,
    "User invited",
    "user",
    email,
    `${email} granted ${role} access`,
  );
  return Response.json({ success: true });
}
export async function PATCH(req: Request) {
  const me = await identity();
  if (me.role !== "admin")
    return Response.json({ error: "Admin access required" }, { status: 403 });
  const x = (await req.json()) as {
    id?: number;
    role?: string;
    status?: string;
  };
  const target = await db()
    .prepare("SELECT email FROM app_users WHERE id=?")
    .bind(Number(x.id))
    .first<{ email: string }>();
  if (!target)
    return Response.json({ error: "User not found" }, { status: 404 });
  if (
    target.email.toLowerCase() === me.email.toLowerCase() &&
    x.status === "disabled"
  )
    return Response.json(
      { error: "You cannot disable your own account" },
      { status: 400 },
    );
  await db()
    .prepare("UPDATE app_users SET role=?,status=? WHERE id=?")
    .bind(
      x.role === "admin" ? "admin" : "staff",
      x.status === "disabled" ? "disabled" : "active",
      Number(x.id),
    )
    .run();
  await logAudit(
    me.email,
    "User access changed",
    "user",
    target.email,
    `${target.email} set to ${x.role === "admin" ? "admin" : "staff"} and ${x.status === "disabled" ? "disabled" : "active"}`,
  );
  return Response.json({ success: true });
}
