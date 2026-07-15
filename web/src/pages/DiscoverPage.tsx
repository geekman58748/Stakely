import { AppShell } from "../components/AppShell";
import { CategoryTabs } from "../components/CategoryTabs";
import { FeaturedMarket } from "../components/FeaturedMarket";
import { LiveActivityPanel } from "../components/LiveActivityPanel";
import { DiscoverMarketGrid } from "../components/MarketCard";

export function DiscoverPage() {
  return (
    <AppShell activePage="discover">
      <div className="discover-page">
        <section className="discover-top">
          <div className="discover-primary">
            <h1>Discover</h1>
            <CategoryTabs />
            <FeaturedMarket />
          </div>
          <LiveActivityPanel />
        </section>
        <DiscoverMarketGrid />
      </div>
    </AppShell>
  );
}
