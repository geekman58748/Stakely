/**
 * Telegram notification layer.
 * Sends messages via Bot API directly — no library needed, just fetch.
 * All messages are written to sound like a friend who watches too much football.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function send(chatId: number | string, text: string) {
  if (!BOT_TOKEN) return;
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => null);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Roast banks ────────────────────────────────────────────────────────────────

const CHALLENGE_SENT = (challenger: string, team: string, amount: number, opponent?: string) => {
  const base = opponent
    ? pick([
        `yo @${opponent} — ${challenger} just challenged u. ${amount} USDC on ${team}. u scared?`,
        `@${opponent} catch 👀 ${challenger} wants ur USDC. ${amount} on ${team}, u in or what`,
        `@${opponent} ${challenger} said u won't take this bet. ${amount} USDC on ${team}. prove em wrong`,
        `@${opponent} the audacity of ${challenger} betting ${amount} on ${team}. take the bag or fold`,
      ])
    : pick([
        `${challenger} just dropped a ${amount} USDC open challenge on ${team}. first one to grab it wins`,
        `open bet alert — ${challenger} put ${amount} USDC on ${team}. anyone got the stones to take it`,
        `${challenger} is feeling dangerous. ${amount} on ${team} sitting open. clock's ticking`,
      ]);
  return base;
};

const CHALLENGE_ACCEPTED = (acceptor: string, challenger: string, team: string, opposingTeam: string, amount: number) =>
  pick([
    `it's on. ${acceptor} just accepted ${challenger}'s ${amount} USDC bet. ${team} vs ${opposingTeam}. one of u is getting rinsed`,
    `locked in 🔒 ${acceptor} took the bet. ${amount} USDC on the line. ${challenger} riding ${team}, ${acceptor} riding ${opposingTeam}`,
    `${acceptor} said bet. ${amount} USDC locked. ${team} vs ${opposingTeam} — may the better wallet win`,
    `both of u committed now. ${amount} USDC locked in escrow. ${team} vs ${opposingTeam}. no turning back`,
  ]);

const GOAL_SCORED = (scorer: string, team: string, min: number, homeTeam: string, homeScore: number, awayTeam: string, awayScore: number) =>
  pick([
    `GOAL — ${scorer} for ${team} ${min}' | ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
    `${scorer} scored for ${team} (${min}') | ${homeTeam} ${homeScore}-${awayScore} ${awayTeam} rn`,
    `${team} just scored through ${scorer}. ${min} mins in. ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
  ]);

const MATCH_UPDATE = (homeTeam: string, homeScore: number, awayTeam: string, awayScore: number, minute: number) =>
  pick([
    `${homeTeam} ${homeScore}-${awayScore} ${awayTeam} | ${minute}'`,
    `score check: ${homeTeam} ${homeScore} ${awayTeam} ${awayScore} — ${minute} mins gone`,
    `${minute}' | ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
  ]);

const BET_WON = (winner: string, loser: string, amount: number, team: string) =>
  pick([
    `${winner} just robbed ${loser} of ${amount} USDC. ${team} delivered. check ur wallet`,
    `💰 ${winner} called it. ${team} came through. ${loser} is ${amount} USDC lighter. rip`,
    `${winner} said ${team} and ${winner} was right. ${loser} pay up. ${amount} USDC hitting escrow`,
    `${loser} let ${winner} cook. ${amount} USDC gone just like that. ${team} doesn't miss`,
    `${winner} takes the ${amount} USDC. ${loser} gone quiet. ${team} with the assist`,
  ]);

const BET_LOST = (loser: string, amount: number, team: string) =>
  pick([
    `${loser} thought ${team} was gonna do it 💀 ${amount} USDC gone. next time maybe`,
    `${loser} down ${amount} USDC. ${team} left u hanging. we don't talk about this`,
    `${amount} USDC to the void. ${loser} deserved better from ${team} tbh`,
    `${loser} said trust ${team}. ${team} said nah. ${amount} USDC gone`,
    `that's a rough one for ${loser}. ${team} didn't show up. ${amount} USDC transferred`,
  ]);

const MATCH_FINISHED = (homeTeam: string, homeScore: number, awayTeam: string, awayScore: number) => {
  const winner = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;
  return winner
    ? pick([
        `FT: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. ${winner} did the business`,
        `full time. ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. bets settling now`,
        `it's over. ${winner} wins ${homeScore}-${awayScore}. collecting receipts`,
      ])
    : pick([
        `FT: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. draw. everyone's mad`,
        `draw. ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. drama`,
      ]);
};

const LINK_SUCCESS = (displayName: string) =>
  pick([
    `linked ✅ ur wallet is connected. u'll get pinged here for bets, scores, and the usual chaos`,
    `connected. ${displayName} ur in. expect messages when ur opponents are being delusional`,
    `wallet linked. the roasts begin now ${displayName}`,
  ]);

// ── Public notification functions ──────────────────────────────────────────────

export async function notifyChallengeSent(
  tgId: number, challenger: string, team: string, amount: number, opponentHandle?: string
) {
  await send(tgId, CHALLENGE_SENT(challenger, team, amount, opponentHandle));
}

export async function notifyChallengeReceived(
  tgId: number, challenger: string, team: string, opposingTeam: string, amount: number, betId: string
) {
  const apiBase = process.env.FRONTEND_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN ?? "";
  const link = apiBase ? `\n\n${apiBase}/bet/${betId}` : "";
  await send(tgId,
    `${pick(["yo", "oi", "hey", "bruv"])} — ${challenger} just challenged u. ${amount} USDC, they're on ${team}. u take ${opposingTeam}.${link ? `\n\ntap to accept or leave it:${link}` : ""}`
  );
}

export async function notifyChallengeAccepted(
  creatorTgId: number, acceptor: string, challenger: string, team: string, opposingTeam: string, amount: number
) {
  await send(creatorTgId, CHALLENGE_ACCEPTED(acceptor, challenger, team, opposingTeam, amount));
}

export async function notifyGoal(
  tgIds: number[], scorer: string, team: string, min: number,
  homeTeam: string, homeScore: number, awayTeam: string, awayScore: number
) {
  const msg = GOAL_SCORED(scorer, team, min, homeTeam, homeScore, awayTeam, awayScore);
  await Promise.all(tgIds.map(id => send(id, msg)));
}

export async function notifyMatchUpdate(
  tgIds: number[], homeTeam: string, homeScore: number, awayTeam: string, awayScore: number, minute: number
) {
  const msg = MATCH_UPDATE(homeTeam, homeScore, awayTeam, awayScore, minute);
  await Promise.all(tgIds.map(id => send(id, msg)));
}

export async function notifySettlement(
  winnerTgId: number | null, loserTgId: number | null,
  winnerName: string, loserName: string, amount: number, team: string
) {
  if (winnerTgId) await send(winnerTgId, BET_WON(winnerName, loserName, amount, team));
  if (loserTgId)  await send(loserTgId,  BET_LOST(loserName, amount, team));
}

export async function notifyMatchFinished(
  tgIds: number[], homeTeam: string, homeScore: number, awayTeam: string, awayScore: number
) {
  const msg = MATCH_FINISHED(homeTeam, homeScore, awayTeam, awayScore);
  await Promise.all(tgIds.map(id => send(id, msg)));
}

export async function notifyLinkSuccess(tgId: number, displayName: string) {
  await send(tgId, LINK_SUCCESS(displayName));
}

// ── Webhook registration ───────────────────────────────────────────────────────
export async function registerWebhook(webhookUrl: string) {
  if (!BOT_TOKEN) { console.warn("[telegram] no BOT_TOKEN, skipping webhook registration"); return; }
  const res = await fetch(`${API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true }),
  });
  const data = await res.json() as any;
  console.log("[telegram] webhook:", data.ok ? "registered ✅" : data.description);
}

// ── Mid-game roast ─────────────────────────────────────────────────────────────
const LOSING_MIDGAME = (name: string, losingTeam: string, leadingTeam: string, loseScore: number, leadScore: number, min: number | null): string => {
  const t = min ? `(${min}')` : "rn";
  return pick([
    `${name} ur watching ${losingTeam} get cooked ${leadScore}-${loseScore} ${t}. ur USDC is already gone mentally`,
    `bro ${name} ${losingTeam} is down ${leadScore}-${loseScore} ${t}. hope ur ready to lose that bag`,
    `${name} ${leadingTeam} is up ${leadScore}-${loseScore} ${t}. ${losingTeam} is not doing u any favours rn`,
    `${name} checked the score yet? ${leadingTeam} ${leadScore}-${loseScore} ${losingTeam} ${t}. might wanna look away`,
    `${name} the math ain't mathing for ${losingTeam} ${t}. ${leadScore}-${loseScore} down. start grieving ur USDC`,
  ]);
};

export async function notifyLosing(
  tgId: number, name: string,
  losingTeam: string, leadingTeam: string,
  loseScore: number, leadScore: number,
  minute: number | null
) {
  await send(tgId, LOSING_MIDGAME(name, losingTeam, leadingTeam, loseScore, leadScore, minute));
}

// ── Match-soon hype ───────────────────────────────────────────────────────────
const MATCH_SOON = (homeTeam: string, awayTeam: string, mins: number): string => {
  const t = mins <= 5 ? "RIGHT NOW" : "in " + mins + " min";
  return pick([
    "yo " + homeTeam + " vs " + awayTeam + " kicks off " + t + " 🔥 wanna challenge a friend? open the app before it starts",
    homeTeam + " vs " + awayTeam + " " + t + ". last chance to lock in a bet before kick off ⏰",
    "heads up — " + homeTeam + " vs " + awayTeam + " " + t + ". got someone to bet against? move fast",
    homeTeam + " vs " + awayTeam + " about to go " + t + ". who u got? make it count",
    "it’s almost time. " + homeTeam + " vs " + awayTeam + " " + t + ". throw down a challenge while u can 🎯",
  ]);
};

export async function notifyMatchSoon(tgId: number, homeTeam: string, awayTeam: string, minsUntil: number) {
  await send(tgId, MATCH_SOON(homeTeam, awayTeam, minsUntil));
}
