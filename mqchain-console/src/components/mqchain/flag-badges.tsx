import { Badge } from "@/components/ui/badge";
import { activeFlagDefinitions } from "@/lib/mqchain/flags";
import { cn } from "@/lib/utils";

const toneClass = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  neutral: "border-border bg-secondary text-secondary-foreground",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

type FlagBadgesProps = {
  flags: number | null | undefined;
  showEmpty?: boolean;
  showValue?: boolean;
  compact?: boolean;
};

export function FlagBadges({ flags, showEmpty = true, showValue = true, compact = false }: FlagBadgesProps) {
  const value = Number(flags ?? 0);
  const activeFlags = activeFlagDefinitions(value);

  if (!activeFlags.length && !showEmpty && !showValue) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      {showValue ? (
        <Badge variant="outline" className="font-mono">
          flags:{value}
        </Badge>
      ) : null}
      {activeFlags.map((flag) => (
        <Badge key={flag.key} variant="outline" className={cn("font-mono", toneClass[flag.tone])} title={`bit ${flag.bit}: ${flag.description}`}>
          {flag.label}
        </Badge>
      ))}
      {!activeFlags.length && showEmpty ? (
        <Badge variant="outline" className="font-mono text-muted-foreground">
          no flags
        </Badge>
      ) : null}
    </div>
  );
}
