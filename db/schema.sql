-- Stakely Supabase Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  wallet_address  text unique not null,          -- Solana pubkey
  telegram_id     bigint unique,                 -- Telegram chat ID (nullable until linked)
  telegram_handle text,                          -- @username
  display_name    text,
  streak          int not null default 0,        -- current win streak
  total_wins      int not null default 0,
  total_losses    int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- MATCHES  (cached from TxLINE, updated via SSE)
-- ─────────────────────────────────────────────
create table if not exists matches (
  id              text primary key,              -- TxLINE fixture ID
  home_team       text not null,
  away_team       text not null,
  home_team_code  text,                          -- e.g. "BRA"
  away_team_code  text,
  kickoff_at      timestamptz not null,
  status          text not null default 'scheduled',
  -- scheduled | live | halftime | finished | postponed
  home_score      int not null default 0,
  away_score      int not null default 0,
  result          text,                          -- 'home' | 'away' | 'draw' | null if not settled
  home_odds       numeric(8,4),                 -- latest StablePrice odds
  away_odds       numeric(8,4),
  draw_odds       numeric(8,4),
  merkle_proof    jsonb,                         -- TxLINE cryptographic settlement proof
  merkle_stored_at timestamptz,
  raw_txline      jsonb,                         -- full raw payload for debugging
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- BETS
-- ─────────────────────────────────────────────
create type bet_side as enum ('home', 'away', 'draw');
create type bet_status as enum (
  'challenged',   -- creator sent, waiting for counterparty
  'countered',    -- counterparty proposed different terms
  'locked',       -- both deposited, funds in escrow
  'live',         -- match kicked off
  'settled',      -- oracle resolved, payout sent
  'cancelled',    -- expired or rejected
  'disputed'      -- edge case handler
);

create table if not exists bets (
  id              uuid primary key default uuid_generate_v4(),
  match_id        text not null references matches(id),
  creator_id      uuid not null references users(id),
  counterparty_id uuid references users(id),    -- null until accepted
  creator_side    bet_side not null,
  amount_usdc     numeric(18,6) not null,        -- in USDC (6 decimals)
  status          bet_status not null default 'challenged',
  escrow_pda      text,                          -- Solana PDA address holding funds
  create_tx       text,                          -- on-chain create transaction sig
  accept_tx       text,                          -- on-chain accept transaction sig
  settle_tx       text,                          -- on-chain settlement transaction sig
  winner_id       uuid references users(id),
  expires_at      timestamptz,                   -- auto-cancel if not accepted by kickoff
  settled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- BOT CONFIGS  (AI Agent settings per user)
-- ─────────────────────────────────────────────
create type bot_archetype as enum ('degenerate', 'professor', 'fanboy');

create table if not exists bot_configs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  archetype       bot_archetype not null default 'professor',
  risk_level      int not null default 5 check (risk_level between 1 and 10),
  -- data toggles stored as booleans
  use_head_to_head   boolean not null default true,
  use_form_table     boolean not null default true,
  use_odds_movement  boolean not null default true,
  use_sentiment      boolean not null default false,  -- Twitter/X scraping
  -- weights (must sum to 1.0, validated in app layer)
  weight_data     numeric(4,3) not null default 0.7,  -- math/data weight
  weight_hype     numeric(4,3) not null default 0.3,  -- social hype weight
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id)  -- one config per user (upsert)
);

-- ─────────────────────────────────────────────
-- AGENT PREDICTIONS
-- ─────────────────────────────────────────────
create table if not exists agent_predictions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id),
  match_id        text not null references matches(id),
  archetype       bot_archetype not null,
  prediction      bet_side not null,
  confidence      numeric(5,2) not null check (confidence between 0 and 100),
  analysis        text not null,                 -- LLM-generated analysis text
  disclaimer      text,                          -- persona NFA disclaimer
  bet_id          uuid references bets(id),      -- if user approved → auto-bet
  was_correct     boolean,                       -- filled after match settles
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- TELEGRAM LINK CODES  (one-time linking flow)
-- ─────────────────────────────────────────────
create table if not exists telegram_link_codes (
  code            text primary key,             -- 6-char alphanumeric
  wallet_address  text not null,
  expires_at      timestamptz not null default (now() + interval '10 minutes'),
  used_at         timestamptz
);

-- ─────────────────────────────────────────────
-- MATCH EVENTS  (goals, cards, etc. from SSE)
-- ─────────────────────────────────────────────
create table if not exists match_events (
  id              uuid primary key default uuid_generate_v4(),
  match_id        text not null references matches(id),
  event_type      text not null,                 -- 'goal' | 'red_card' | 'yellow_card' | 'kickoff' | 'fulltime'
  minute          int,
  team            text,
  player          text,
  description     text,
  raw_payload     jsonb,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
create index if not exists idx_bets_creator       on bets(creator_id);
create index if not exists idx_bets_counterparty  on bets(counterparty_id);
create index if not exists idx_bets_match         on bets(match_id);
create index if not exists idx_bets_status        on bets(status);
create index if not exists idx_predictions_user   on agent_predictions(user_id);
create index if not exists idx_predictions_match  on agent_predictions(match_id);
create index if not exists idx_events_match       on match_events(match_id);
create index if not exists idx_matches_kickoff    on matches(kickoff_at);
create index if not exists idx_users_telegram     on users(telegram_id);
create index if not exists idx_users_wallet       on users(wallet_address);

-- ─────────────────────────────────────────────
-- AUTO-UPDATE updated_at trigger
-- ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated    before update on users    for each row execute function update_updated_at();
create trigger trg_matches_updated  before update on matches  for each row execute function update_updated_at();
create trigger trg_bets_updated     before update on bets     for each row execute function update_updated_at();
create trigger trg_botcfg_updated   before update on bot_configs for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- LEADERBOARD VIEW  (top 50 by streak)
-- ─────────────────────────────────────────────
create or replace view leaderboard as
select
  u.id,
  u.display_name,
  u.telegram_handle,
  u.wallet_address,
  u.streak,
  u.total_wins,
  u.total_losses,
  round(
    case when (u.total_wins + u.total_losses) = 0 then 0
    else u.total_wins::numeric / (u.total_wins + u.total_losses) * 100
    end, 1
  ) as win_pct,
  rank() over (order by u.streak desc, u.total_wins desc) as rank
from users u
where u.total_wins + u.total_losses > 0
order by u.streak desc, u.total_wins desc
limit 50;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY  (Supabase best practice)
-- ─────────────────────────────────────────────
alter table users           enable row level security;
alter table bets            enable row level security;
alter table bot_configs     enable row level security;
alter table agent_predictions enable row level security;
alter table match_events    enable row level security;
alter table matches         enable row level security;
alter table telegram_link_codes enable row level security;

-- Public reads on matches and leaderboard (no auth needed)
create policy "public_read_matches"  on matches  for select using (true);
create policy "public_read_events"   on match_events for select using (true);

-- Bets: visible to creator, counterparty, or public (challenged bets are open)
create policy "read_bets" on bets for select using (
  status = 'challenged'
  or creator_id = (select id from users where wallet_address = auth.jwt()->>'wallet')
  or counterparty_id = (select id from users where wallet_address = auth.jwt()->>'wallet')
);

-- Service role bypass (your API server uses service role key — bypasses RLS)
-- All writes go through your Express API server with the service role key, not from the client directly.
