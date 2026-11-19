import { CODE_RE, UUID_RE, cleanName, db, readJsonBody } from "@/lib/server/db";

/** Postgres / PostgREST codes for "this column does not exist" (migration not run yet). */
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  const matchCode = typeof body?.matchCode === "string" && CODE_RE.test(body.matchCode) ? body.matchCode : null;
  const team = body?.team === "a" || body?.team === "b" ? body.team : null;
  if (!matchCode || !team) return Response.json({ error: "Lien d'équipe invalide" }, { status: 400 });
  const sessionId = typeof body?.sessionId === "string" && UUID_RE.test(body.sessionId) ? body.sessionId : null;
  const sb = db();
  if (!sb) return Response.json({ error: "Base non configurée" }, { status: 503 });
  const { data: match } = await sb.from("matches").select("code").eq("code", matchCode).maybeSingle();
  if (!match) return Response.json({ error: "Match introuvable" }, { status: 404 });
  const row = { match_code: matchCode, team, first_name: cleanName(body?.firstName), voix: 0 };
  // session_id lets "Supprimer toutes mes informations" find this row. If the migration that adds the
  // column has not been run yet, save the row without it rather than break team mode.
  let { data, error } = await sb.from("match_players").insert({ ...row, session_id: sessionId }).select("id").single();
  if (error && MISSING_COLUMN.has(error.code)) {
    ({ data, error } = await sb.from("match_players").insert(row).select("id").single());
  }
  if (error || !data) return Response.json({ error: "Impossible de rejoindre" }, { status: 500 });
  return Response.json({ pid: data.id });
}
