import { Badge } from "@/components/ui/badge";

const toneByStatus: Record<string, string> = {
  pending_review: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  needs_more_evidence: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  compiled: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  rejected: "border-red-400/30 bg-red-400/10 text-red-200",
  conflict_pending: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  duplicate: "border-zinc-400/30 bg-zinc-400/10 text-zinc-200",
  committed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  superseded: "border-zinc-400/30 bg-zinc-400/10 text-zinc-200",
  failed: "border-red-400/30 bg-red-400/10 text-red-200",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "unknown";
  return (
    <Badge variant="outline" className={toneByStatus[value] ?? "border-border bg-muted text-muted-foreground"}>
      {value.replace(/_/g, " ")}
    </Badge>
  );
}
