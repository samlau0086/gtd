import { env } from "cloudflare:workers";

export const DB = (env as unknown as { DB: D1Database }).DB;
