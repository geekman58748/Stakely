import { lazy, Suspense, useEffect, useState } from "react";
import { DiscoverPage } from "./pages/DiscoverPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";

const MatchesPage = lazy(() => import("./pages/MatchesPage").then((module) => ({ default: module.MatchesPage })));
const MatchDetailPage = lazy(() => import("./pages/MatchDetailPage").then((module) => ({ default: module.MatchDetailPage })));

export type AppPage = "discover" | "matches" | "my-bets" | "leaderboard" | "receipts";

type AppRoute = {
  page: AppPage | "match";
  matchId?: string;
};

function readRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [page, id] = hash.split("/");
  if (page === "match" && id) return { page: "match", matchId: decodeURIComponent(id) };
  if (["discover", "matches", "my-bets", "leaderboard", "receipts"].includes(page)) {
    return { page: page as AppPage };
  }
  return { page: "discover" };
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.page === "leaderboard") return <LeaderboardPage />;
  if (route.page === "matches") return <Suspense fallback={<RouteLoading />}><MatchesPage /></Suspense>;
  if (route.page === "match" && route.matchId) return <Suspense fallback={<RouteLoading />}><MatchDetailPage matchId={route.matchId} /></Suspense>;
  return <DiscoverPage />;
}

function RouteLoading() {
  return <div className="route-loading" role="status">Loading Stakely</div>;
}
