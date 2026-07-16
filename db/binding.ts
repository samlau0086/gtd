import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalDb = globalThis as unknown as { gtdPool?: Pool };

export const pool =
  globalDb.gtdPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalDb.gtdPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
