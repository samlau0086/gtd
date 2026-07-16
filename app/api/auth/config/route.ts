import { query } from "../../../../db/binding";

export async function GET() {
  const configured = await query("SELECT 1 FROM smtp_configs WHERE id=1");
  return Response.json(
    { mode: "self-hosted", setupRequired: configured.rowCount === 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
