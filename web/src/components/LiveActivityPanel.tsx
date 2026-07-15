import { Box, Check, ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";

export function LiveActivityPanel() {
  return (
    <aside className="activity-panel" aria-label="Live activity">
      <div className="panel-header">
        <h2>Live Activity</h2>
        <span className="live-dot">Live</span>
      </div>

      <div className="activity-list">
        <article className="activity-item activity-score">
          <span className="activity-label blue">LIVE</span>
          <div className="activity-body">
            <h3><span>⚽</span> Brazil 2 - 1 Colombia</h3>
            <p>Final Score · Group D</p>
            <div className="activity-scoreline">
              <span className="flag-mini">🇧🇷</span><strong>2&nbsp; - &nbsp;1</strong><span className="flag-mini">🇨🇴</span>
            </div>
          </div>
          <time>2m ago</time>
        </article>

        <article className="activity-item">
          <span className="activity-label green">SETTLED</span>
          <Check className="activity-type-icon green-text" size={17} />
          <div className="activity-body">
            <h3>Portugal to Win</h3>
            <p>User @AlexPro won <b className="green-text">$1,250</b></p>
          </div>
          <time>15m ago</time>
        </article>

        <article className="activity-item">
          <span className="activity-label blue">LIVE</span>
          <span className="activity-type-icon">⚽</span>
          <div className="activity-body">
            <h3>Argentina vs Spain</h3>
            <p>Prediction market is now live</p>
          </div>
          <time>28m ago</time>
        </article>

        <article className="activity-item activity-proof">
          <span className="activity-label green">PROOF</span>
          <Box className="activity-type-icon green-text" size={18} />
          <div className="activity-body">
            <h3>Market Settled</h3>
            <p>TxLINE proof on devnet</p>
            <a href="#receipts">View Receipt <ExternalLink size={13} /></a>
          </div>
          <time>32m ago</time>
        </article>
      </div>

      <button className="ghost-button" type="button">
        View all activity <ChevronRight size={15} />
      </button>
      <span className="activity-verification" aria-hidden="true"><ShieldCheck size={18} /></span>
    </aside>
  );
}
