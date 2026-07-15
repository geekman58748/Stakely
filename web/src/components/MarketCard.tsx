import {
  Box,
  CheckCircle2,
  CirclePlus,
  ExternalLink,
  Gamepad2,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { AvatarStack } from "./FeaturedMarket";

export function DiscoverMarketGrid() {
  return (
    <section className="market-grid" aria-label="Prediction markets and challenges">
      <article className="market-card winner-card">
        <CardLabel tone="gold" icon={<Trophy size={13} />} label="Featured" />
        <div className="winner-orbit" aria-hidden="true"><span /></div>
        <h3>World Cup Winner</h3>
        <p>Who will win the World Cup?</p>
        <div className="option-list">
          <MarketOption flag="🇧🇷" label="Brazil" value="28%" tone="green" />
          <MarketOption flag="🇫🇷" label="France" value="18%" tone="blue" />
          <MarketOption flag="🇦🇷" label="Argentina" value="14%" tone="blue" />
          <MarketOption flag="🇪🇸" label="Spain" value="10%" tone="gold" />
          <button className="all-outcomes" type="button">View all 32 outcomes <span>›</span></button>
        </div>
        <CardFooter stat="2.4K" volume="$1.02M Vol." />
      </article>

      <MatchCard
        leftFlag="🇧🇷"
        left="BRA"
        rightFlag="🇫🇷"
        right="FRA"
        title="Brazil vs France"
        oddsLeft="1.62"
        oddsRight="2.63"
        time="2d 14h"
        stat="1.2K"
        volume="$248K Vol."
        greenLeft
      />

      <MatchCard
        leftFlag="🇦🇷"
        left="ARG"
        rightFlag="🇪🇸"
        right="ESP"
        title="Argentina vs Spain"
        oddsLeft="1.71"
        oddsRight="2.45"
        time="3d 09h"
        stat="890"
        volume="$186K Vol."
      />

      <article className="market-card challenge-card">
        <CardLabel tone="purple" icon={<Gamepad2 size={13} />} label="Challenge" />
        <h3>Open Friend Challenge</h3>
        <p>Create your own market</p>
        <div className="challenge-icon">
          <UsersRound size={42} />
          <span><CirclePlus size={21} /></span>
        </div>
        <p className="challenge-copy">Challenge friends with any<br />World Cup prediction</p>
        <button className="primary-action full" type="button">Create Challenge</button>
        <CardFooter stat="312" volume="Open" />
      </article>

      <article className="market-card settlement-card">
        <span className="settlement-corner"><Box size={24} /></span>
        <CardLabel tone="green" icon={<CheckCircle2 size={13} />} label="Settled" />
        <h3>Portugal to Win</h3>
        <p>Group Stage&nbsp; · &nbsp;Jun 22, 2026</p>
        <div className="scoreline">
          <span>POR <b>🇵🇹</b></span>
          <strong>3 - 0</strong>
          <span><b>🇲🇦</b> MAR</span>
        </div>
        <div className="market-settled-label">Market Settled</div>
        <div className="settlement-row">
          <span><small>Winner</small><i className="winner-avatar">A</i> @AlexPro</span>
          <strong>+$1,250</strong>
        </div>
        <a className="receipt-link" href="#receipts">View Receipt <ExternalLink size={15} /></a>
      </article>
    </section>
  );
}

type MatchProps = {
  leftFlag: string;
  left: string;
  rightFlag: string;
  right: string;
  title: string;
  oddsLeft: string;
  oddsRight: string;
  time: string;
  stat: string;
  volume: string;
  greenLeft?: boolean;
};

function MatchCard(props: MatchProps) {
  return (
    <article className="market-card match-card">
      <CardLabel tone="neutral" icon={<Gamepad2 size={13} />} label="Match" />
      <time>{props.time}</time>
      <h3>{props.title}</h3>
      <p>Quarter Final</p>
      <div className="team-pair">
        <span>{props.left}<b>{props.leftFlag}</b></span>
        <i>VS</i>
        <span><b>{props.rightFlag}</b>{props.right}</span>
      </div>
      <div className="market-question">Who will win?</div>
      <div className="mini-odds">
        <button className={props.greenLeft ? "green" : "blue"} type="button"><span>{props.title.split(" vs ")[0]}</span><strong>{props.oddsLeft}</strong></button>
        <button className="blue" type="button"><span>{props.title.split(" vs ")[1]}</span><strong>{props.oddsRight}</strong></button>
      </div>
      <CardFooter stat={props.stat} volume={props.volume} />
    </article>
  );
}

function MarketOption({ flag, label, value, tone }: { flag: string; label: string; value: string; tone: string }) {
  return <button type="button"><span><b>{flag}</b>{label}</span><strong className={`${tone}-text`}>{value}</strong></button>;
}

function CardLabel({ label, tone, icon }: { label: string; tone: string; icon: React.ReactNode }) {
  return <span className={`card-label ${tone}`}>{icon}{label}</span>;
}

function CardFooter({ stat, volume }: { stat: string; volume: string }) {
  return (
    <footer className="card-footer">
      <AvatarStack tiny />
      <span>{stat}</span>
      <span className="divider" />
      <span>{volume}</span>
    </footer>
  );
}
