import { cn } from "@/lib/utils";

const COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function FamilyAvatar({
  name,
  userId,
  size = "sm",
  className,
  title,
}: {
  name: string;
  userId: string;
  size?: "xs" | "sm" | "md";
  className?: string;
  title?: string;
}) {
  const color = COLORS[hash(userId) % COLORS.length];
  const sizes = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
  } as const;
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full font-semibold text-white shrink-0",
        color,
        sizes[size],
        className,
      )}
      title={title ?? name}
      aria-label={name}
    >
      {initials(name || "?")}
    </span>
  );
}