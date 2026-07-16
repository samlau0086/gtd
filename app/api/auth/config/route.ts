export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Response.json(url && key ? { url, key } : null, { headers: { "Cache-Control": "no-store" } });
}
