import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

const DEFAULT_URL = "file:data/app.db";
const MIGRATIONS = join(process.cwd(), "drizzle");

/**
 * DB를 열고 마이그레이션을 적용한다. 로컬 전용 앱이라 첫 요청 때 자동으로 스키마를 맞춘다.
 * 테스트는 url에 ":memory:"를 넘겨 매번 빈 DB를 만든다.
 */
export async function openDb(url = process.env.DATABASE_URL || DEFAULT_URL): Promise<Db> {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  const client: Client = createClient({ url });
  // SQLite는 연결마다 외래 키 설정이 따로다. libsql은 새 연결에서 기본으로 켜 두지만(ON DELETE CASCADE 동작),
  // 계정 삭제가 이 설정에 의존하므로 명시해 둔다.
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// 개발 서버의 핫 리로드에도 연결을 하나만 유지한다.
const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= openDb().catch((e) => {
    globalForDb.dbPromise = undefined;
    throw e;
  });
  return globalForDb.dbPromise;
}
