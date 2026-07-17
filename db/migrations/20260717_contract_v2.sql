-- Stakely escrow v2 database contract.
-- Apply this before deploying the v2 API capability flag.

alter table matches
  add column if not exists participant1_is_home boolean not null default true;

alter table bets
  add column if not exists refund_after timestamptz,
  add column if not exists txline_seq bigint,
  add column if not exists daily_scores_root text,
  add column if not exists settlement_error text,
  add column if not exists settlement_attempted_at timestamptz;
