import {
  Apple,
  CupSoda,
  Sparkles,
  Home,
  Pill,
  Smartphone,
  Shirt,
  Package,
  type LucideIcon,
} from "lucide-react";

export type CategoryKey =
  | "Alimentari"
  | "Bevande"
  | "Cura persona"
  | "Casa"
  | "Farmacia"
  | "Elettronica"
  | "Abbigliamento"
  | "Altro";

export const CATEGORIES: CategoryKey[] = [
  "Alimentari",
  "Bevande",
  "Cura persona",
  "Casa",
  "Farmacia",
  "Elettronica",
  "Abbigliamento",
  "Altro",
];

export const UNITS = ["pz", "kg", "g", "l", "ml"] as const;

type Meta = { icon: LucideIcon; className: string };

const META: Record<string, Meta> = {
  Alimentari: { icon: Apple, className: "bg-emerald-500/15 text-emerald-500" },
  Bevande: { icon: CupSoda, className: "bg-sky-500/15 text-sky-500" },
  "Cura persona": { icon: Sparkles, className: "bg-pink-500/15 text-pink-500" },
  Casa: { icon: Home, className: "bg-amber-500/15 text-amber-500" },
  Farmacia: { icon: Pill, className: "bg-red-500/15 text-red-500" },
  Elettronica: { icon: Smartphone, className: "bg-slate-500/15 text-slate-400" },
  Abbigliamento: { icon: Shirt, className: "bg-violet-500/15 text-violet-500" },
  Altro: { icon: Package, className: "bg-muted text-muted-foreground" },
};

export function categoryMeta(category: string | null | undefined): Meta {
  if (!category) return META.Altro;
  return META[category] ?? META.Altro;
}

// Distinct chart colors for per-store lines
export const STORE_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
];