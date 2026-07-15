import { headers } from "next/headers";
export function auditDb() {
  const value = (globalThis as typeof globalThis & { __SITES_DB?: D1Database })
    .__SITES_DB;
  if (!value) throw new Error("Database unavailable");
  return value;
}
export async function actorEmail() {
  const h = await headers();
  return h.get("x-genfrona-email") || "unknown";
}
export async function ensureAudit() {
  await auditDb()
    .prepare(
      "CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_code TEXT, description TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'site', created_at TEXT NOT NULL)",
    )
    .run();
}
export async function logAudit(
  actor: string,
  action: string,
  entityType: string,
  entityCode: string | null,
  description: string,
  source = "site",
) {
  await ensureAudit();
  await auditDb()
    .prepare(
      "INSERT INTO audit_log (actor_email,action,entity_type,entity_code,description,source,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      actor,
      action,
      entityType,
      entityCode,
      description,
      source,
      new Date().toISOString(),
    )
    .run();
}
