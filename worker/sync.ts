import { MAX_PULL, MAX_PUSH, SYNC_KINDS, type SyncChange, type SyncRequest, type SyncResponse } from '../src/shared/sync'

/** The slice of D1's API we use, so tests can run it on node:sqlite. */
export interface Stmt {
  bind(...values: unknown[]): Stmt
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}
export interface Db {
  prepare(sql: string): Stmt
  batch(stmts: Stmt[]): Promise<{ meta: { changes: number } }[]>
}

export class BadRequest extends Error {}

const ID = /^[A-Za-z0-9-]{8,64}$/

export function validate(body: unknown): SyncRequest {
  const b = body as SyncRequest
  if (!b || typeof b !== 'object' || !Number.isInteger(b.cursor) || b.cursor < 0 || !Array.isArray(b.changes)) throw new BadRequest('Expected {cursor, changes[]}')
  if (b.changes.length > MAX_PUSH) throw new BadRequest(`At most ${MAX_PUSH} changes per request`)
  for (const c of b.changes) {
    if (!SYNC_KINDS.includes(c.kind)) throw new BadRequest(`Unknown kind ${c.kind}`)
    if (typeof c.id !== 'string' || !ID.test(c.id)) throw new BadRequest('Bad id')
    if (!Number.isFinite(c.updatedAt)) throw new BadRequest('Bad updatedAt')
    if (!c.deleted && (typeof c.data !== 'object' || c.data === null)) throw new BadRequest('Missing data')
  }
  return b
}

/**
 * Applies pushed changes (last write wins on updatedAt) and returns everything newer than the cursor.
 * Each accepted write gets the next revision number; the batch runs as one transaction, so revisions
 * are gap-free and ordered even if two devices sync at the same time.
 */
export async function sync(db: Db, req: SyncRequest): Promise<SyncResponse> {
  let accepted = 0
  if (req.changes.length) {
    const upsert = `INSERT INTO records (kind, id, data, updated_at, deleted, rev)
      VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(rev), 0) + 1 FROM records))
      ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, rev = excluded.rev
      WHERE excluded.updated_at > records.updated_at`
    const results = await db.batch(
      req.changes.map((c) => db.prepare(upsert).bind(c.kind, c.id, c.deleted ? null : JSON.stringify(c.data), Math.trunc(c.updatedAt), c.deleted ? 1 : 0)),
    )
    accepted = results.reduce((n, r) => n + (r.meta.changes > 0 ? 1 : 0), 0)
  }
  const { results } = await db
    .prepare('SELECT kind, id, data, updated_at, deleted, rev FROM records WHERE rev > ?1 ORDER BY rev LIMIT ?2')
    .bind(req.cursor, MAX_PULL + 1)
    .all<{ kind: SyncChange['kind']; id: string; data: string | null; updated_at: number; deleted: number; rev: number }>()
  const more = results.length > MAX_PULL
  const page = results.slice(0, MAX_PULL)
  return {
    cursor: page.length ? page[page.length - 1].rev : req.cursor,
    more,
    accepted,
    changes: page.map((r) => ({ kind: r.kind, id: r.id, updatedAt: r.updated_at, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : null })),
  }
}
