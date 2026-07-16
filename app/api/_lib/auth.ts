export type AuthUser = { id: string; email: string };

export async function requireUser(request: Request): Promise<AuthUser> {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) throw new Response("Unauthorized", { status: 401 });
  const response = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
  if (!response.ok) throw new Response("Unauthorized", { status: 401 });
  const user = await response.json() as { id?: string; email?: string };
  if (!user.id || !user.email) throw new Response("Unauthorized", { status: 401 });
  return { id: user.id, email: user.email };
}

export function authError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
}
