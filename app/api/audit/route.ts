import { auditDb, ensureAudit } from "../../audit";
export async function GET() {
  await ensureAudit();
  const { results } = await auditDb()
    .prepare(
      "SELECT id,actor_email as actorEmail,action,entity_type as entityType,entity_code as entityCode,description,source,created_at as createdAt FROM audit_log ORDER BY id DESC LIMIT 300",
    )
    .all();
  return Response.json({ entries: results });
}
