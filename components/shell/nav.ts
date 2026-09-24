import { History, Landmark, PieChart, Server, Waves } from "lucide-react";

export const NAV = [
  { href: "/", label: "Portfolio", icon: PieChart },
  { href: "/orchestrators", label: "Orchestrators", icon: Server },
  { href: "/network", label: "Network", icon: Waves },
  { href: "/governance", label: "Governance", icon: Landmark },
  { href: "/activity", label: "Activity", icon: History },
] as const;
