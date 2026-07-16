import { query } from "../../../db/binding";

export async function GET() {
  try {
    const result = await query<{ vector: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS vector",
    );
    const vector = Boolean(result.rows[0]?.vector);
    return Response.json(
      { ok: vector, database: "postgresql", vector },
      { status: vector ? 200 : 503 },
    );
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
