-- Phase 2 (plan v2): "Supprimer toutes mes informations".
-- Links each team-match player to the phone's random id, so the delete button can find the row.
-- Run once in Supabase: Project > SQL Editor > New query > paste > Run. Safe to run twice.
alter table match_players add column if not exists session_id text;
create index if not exists match_players_session_idx on match_players (session_id);

-- The delete button looks rows up by session_id in these tables too.
create index if not exists challenges_session_idx on challenges (session_id);
create index if not exists predictions_session_idx on predictions (session_id);
create index if not exists emails_session_idx on emails (session_id);
create index if not exists accounts_session_idx on accounts (session_id);
