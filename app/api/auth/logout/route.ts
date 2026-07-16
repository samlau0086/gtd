import { authError, hashToken, requireUser } from "../../_lib/auth";
import { query } from "../../../../db/binding";

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const token = request.headers.get("authorization")?.slice(7).trim() || "";
    await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    return Response.json({ ok: true });
  } catch (error) {
    return authError(error);
  }
}
