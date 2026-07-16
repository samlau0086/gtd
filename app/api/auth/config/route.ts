export async function GET() {
  return Response.json(
    { mode: "self-hosted" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
