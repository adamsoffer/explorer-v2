import { Activity, History, Landmark, PieChart, Server } from "lucide-react";

export const NAV = [
  { href: "/", label: "Portfolio", icon: PieChart },
  { href: "/orchestrators", label: "Orchestrators", icon: Server },
  { href: "/network", label: "Network", icon: Activity },
  { href: "/governance", label: "Governance", icon: Landmark },
  { href: "/activity", label: "Activity", icon: History },
] as const;
