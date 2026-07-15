import { headers } from "next/headers";
export async function GET(){const h=await headers();return Response.json({email:h.get("x-genfrona-email"),role:h.get("x-genfrona-role")})}
