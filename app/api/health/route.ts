import { query } from "../../../db/binding";

export async function GET() {
  try {
    await query("SELECT 1");
    return Response.json({ ok: true, database: "postgresql" });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
