import { UUID_RE, db, readJsonBody } from "@/lib/server/db";

/** Postgres / PostgREST codes for "this column does not exist" (migration not run yet). */
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);
/** match_players.id is a uuid column: anything else would make Postgres reject the whole delete. */
const STRICT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Supprimer toutes mes informations": erases every row linked to this phone.
 * Body: { sessionId, pids? }. sessionId is the random id stored on the phone (it acts as the key:
 * nobody else knows it). pids are the team-match player ids kept on the phone, which also cover rows
 * written before match_players had a session_id column.
 * Rows are only ever matched by this session id or these player ids, never by email alone,
 * so nobody can erase someone else's data by typing their email.
 * Anonymous feed reactions have no identifier at all, so they cannot be found or erased.
 */
export async function DELETE(req: Request) {
  const body = await readJsonBody(req, 4000);
  const sessionId = typeof body?.sessionId === "string" && UUID_RE.test(body.sessionId) ? body.sessionId : null;
  if (!sessionId) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  const pids = Array.isArray(body?.pids)
    ? (body!.pids as unknown[]).filter((p): p is string => typeof p === "string" && STRICT_UUID.test(p)).slice(0, 200)
    : [];

  const sb = db();
  if (!sb) return Response.json({ ok: true, stored: false, deleted: {} });

  const deleted: Record<string, number> = {};
  for (const table of ["events", "challenges", "predictions", "emails", "accounts"]) {
    const { error, count } = await sb.from(table).delete({ count: "exact" }).eq("session_id", sessionId);
    if (error) return Response.json({ ok: false, failedOn: table }, { status: 500 });
    deleted[table] = count ?? 0;
  }

  deleted.match_players = 0;
  const bySession = await sb.from("match_players").delete({ count: "exact" }).eq("session_id", sessionId);
  if (bySession.error && !MISSING_COLUMN.has(bySession.error.code)) {
    return Response.json({ ok: false, failedOn: "match_players" }, { status: 500 });
  }
  deleted.match_players += bySession.count ?? 0;
  if (pids.length) {
    const byPid = await sb.from("match_players").delete({ count: "exact" }).in("id", pids);
    if (byPid.error) return Response.json({ ok: false, failedOn: "match_players" }, { status: 500 });
    deleted.match_players += byPid.count ?? 0;
  }

  return Response.json({ ok: true, stored: true, deleted });
}
