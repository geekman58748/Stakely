import { Clock3, ShieldCheck, Trophy, UsersRound } from "lucide-react";

export function FeaturedMarket() {
  return (
    <section className="featured-market" aria-label="Brazil versus France World Cup market">
      <div className="hero-reference-art" aria-hidden="true" />
      <div className="hero-shade" aria-hidden="true" />

      <div className="featured-copy">
        <span className="gold-label">World Cup 2026</span>
        <h2>
          <span className="flag flag-brazil">🇧🇷</span>
          <strong>Brazil vs France</strong>
          <span className="flag flag-france">🇫🇷</span>
          <small>FRA</small>
        </h2>
        <p className="match-meta">Quarter Final&nbsp; · &nbsp;Jul 12, 2026&nbsp; · &nbsp;4:00 PM UTC</p>
        <p className="question">Who will win this match?</p>

        <div className="featured-options">
          <button className="outcome-card green" type="button">
            <span className="kit green-kit"><i /></span>
            <span className="outcome-copy">
              <small>Brazil</small>
              <strong>62%</strong>
              <em>▲ 1.62</em>
            </span>
          </button>
          <span className="versus-badge">VS</span>
          <button className="outcome-card blue" type="button">
            <span className="outcome-copy">
              <small>France</small>
              <strong>38%</strong>
              <em>▼ 2.63</em>
            </span>
            <span className="kit blue-kit"><i /></span>
          </button>
        </div>

        <div className="featured-footer">
          <AvatarStack />
          <span>1.2K</span>
          <span className="divider" />
          <span>$248,390 Vol.</span>
          <span className="spacer" />
          <Clock3 size={15} />
          <span>2d 14h 32m</span>
        </div>
      </div>

      <div className="featured-action">
        <button className="primary-action" type="button">
          <UsersRound size={19} fill="currentColor" />
          Create Challenge
        </button>
        <span>
          <ShieldCheck size={16} />
          TxLINE Verified
        </span>
      </div>

      <Trophy className="hero-trophy-fallback" size={170} strokeWidth={1.1} aria-hidden="true" />
    </section>
  );
}

export function AvatarStack({ tiny = false }: { tiny?: boolean }) {
  return (
    <span className={`avatar-stack ${tiny ? "tiny" : ""}`} aria-label="Participants">
      <i className="avatar-one">AO</i>
      <i className="avatar-two">MK</i>
      <i className="avatar-three">JR</i>
    </span>
  );
}
