import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BriefcaseBusiness,
  CircleDollarSign,
  Flame,
  Gem,
  Globe2,
  Landmark,
  LineChart,
  MonitorPlay,
  Trophy,
} from "lucide-react";

export type Category = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
};

export type MarketCardData = {
  id: string;
  kind: "featured" | "match" | "challenge" | "settled";
  label: string;
  title: string;
  subtitle: string;
  teams?: {
    left: string;
    right: string;
    leftFlag: string;
    rightFlag: string;
  };
  options?: Array<{
    label: string;
    value: string;
    tone?: "green" | "blue" | "gold";
  }>;
  stat: string;
  volume: string;
};

export type ActivityItem = {
  label: string;
  title: string;
  detail: string;
  time: string;
  tone: "live" | "settled" | "proof";
};

export const categories: Category[] = [
  { label: "Trending", icon: LineChart },
  { label: "World Cup", icon: Trophy, active: true },
  { label: "Sports", icon: Globe2 },
  { label: "Politics", icon: Landmark },
  { label: "Crypto", icon: CircleDollarSign },
  { label: "Finance", icon: BriefcaseBusiness },
  { label: "Tech", icon: MonitorPlay },
  { label: "Entertainment", icon: Gem },
  { label: "More", icon: Flame },
];

export const activityItems: ActivityItem[] = [
  {
    label: "LIVE",
    title: "Brazil 2 - 1 Colombia",
    detail: "Final score · Group D",
    time: "2m ago",
    tone: "live",
  },
  {
    label: "SETTLED",
    title: "Portugal to Win",
    detail: "User @AlexPro won $1,250",
    time: "15m ago",
    tone: "settled",
  },
  {
    label: "LIVE",
    title: "Argentina vs Spain",
    detail: "Prediction market is now live",
    time: "28m ago",
    tone: "live",
  },
  {
    label: "PROOF",
    title: "Market Settled",
    detail: "TxLINE proof on devnet",
    time: "32m ago",
    tone: "proof",
  },
];

export const marketCards: MarketCardData[] = [
  {
    id: "world-cup-winner",
    kind: "featured",
    label: "Featured",
    title: "World Cup Winner",
    subtitle: "Who will win the World Cup?",
    options: [
      { label: "Brazil", value: "28%", tone: "green" },
      { label: "France", value: "18%", tone: "blue" },
      { label: "Argentina", value: "14%" },
      { label: "Spain", value: "10%", tone: "gold" },
    ],
    stat: "2.4K",
    volume: "$1.02M Vol.",
  },
  {
    id: "brazil-france",
    kind: "match",
    label: "Match",
    title: "Brazil vs France",
    subtitle: "Quarter Final",
    teams: {
      left: "BRA",
      right: "FRA",
      leftFlag: "🇧🇷",
      rightFlag: "🇫🇷",
    },
    options: [
      { label: "Brazil", value: "1.62", tone: "green" },
      { label: "France", value: "2.63", tone: "blue" },
    ],
    stat: "1.2K",
    volume: "$248K Vol.",
  },
  {
    id: "argentina-spain",
    kind: "match",
    label: "Match",
    title: "Argentina vs Spain",
    subtitle: "Quarter Final",
    teams: {
      left: "ARG",
      right: "ESP",
      leftFlag: "🇦🇷",
      rightFlag: "🇪🇸",
    },
    options: [
      { label: "Argentina", value: "1.71", tone: "blue" },
      { label: "Spain", value: "2.45", tone: "blue" },
    ],
    stat: "890",
    volume: "$186K Vol.",
  },
  {
    id: "open-challenge",
    kind: "challenge",
    label: "Challenge",
    title: "Open Friend Challenge",
    subtitle: "Create your own market",
    stat: "312",
    volume: "Open",
  },
];
