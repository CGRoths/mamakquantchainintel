import { NetworkProposalForm, NetworkProposalReviewForm } from "@/components/mqchain/network-proposal-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { getNetworkCatalogDrift, listNetworkSupportMatrix } from "@/lib/mqchain/origin-client/client";

function readinessTone(value: string) {
  if (value === "production_ready") return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
  if (value === "test_ready") return "border-sky-500/40 text-sky-700 dark:text-sky-300";
  if (value === "prepared") return "border-amber-500/40 text-amber-700 dark:text-amber-300";
  return "text-muted-foreground";
}

export default async function NetworkSupportPage() {
  const [matrix, drift, user] = await Promise.all([listNetworkSupportMatrix(), getNetworkCatalogDrift(), getCurrentUser()]);
  const canPropose = roleCan(user?.role, "network:propose");
  const canReview = roleCan(user?.role, "network:review");
  const summary = [["Networks", matrix.summary.total], ["Tier 1", matrix.summary.tier1], ["Tier 2", matrix.summary.tier2], ["Label ready", matrix.summary.labelReady], ["Runtime ready", matrix.summary.runtimeReady]] as const;
  return <>
    <div><h1 className="text-2xl font-semibold">Network support matrix</h1><p className="text-sm text-muted-foreground">Catalog presence, label readiness, and runtime readiness are independent governed states.</p></div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{summary.map(([label, value]) => <div key={label} className="border-b pb-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold">{value}</div></div>)}</section>
    <Card className="rounded-lg"><CardHeader><CardTitle>Capability states</CardTitle><CardDescription>{drift.summary.total} catalog/database drift items</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Network</TableHead><TableHead>Tier</TableHead><TableHead>Catalog</TableHead><TableHead>Labels</TableHead><TableHead>Runtime</TableHead><TableHead>Normalizer</TableHead><TableHead>MQNODE</TableHead><TableHead>Metric</TableHead><TableHead>Namespaces</TableHead></TableRow></TableHeader><TableBody>{matrix.rows.map(row => <TableRow key={row.network.id}><TableCell className="font-mono">{row.network.id}</TableCell><TableCell><div>{row.network.networkName}</div><div className="font-mono text-xs text-muted-foreground">{row.network.networkCode}</div></TableCell><TableCell>{row.capability?.supportTier ?? "-"}</TableCell>{[row.capability?.catalogState, row.capability?.labelReadiness, row.capability?.runtimeReadiness, row.capability?.normalizerStatus, row.capability?.mqnodeParserStatus, row.capability?.metricStatus].map((value, index) => <TableCell key={index}><Badge variant="outline" className={readinessTone(value ?? "not_ready")}>{value ?? "missing"}</Badge></TableCell>)}<TableCell>{row.namespaceCount}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card className="rounded-lg"><CardHeader><CardTitle>Manual change proposal</CardTitle><CardDescription>New networks are allocated inactive. Activation requires a separately approved proposal.</CardDescription></CardHeader><CardContent><NetworkProposalForm disabled={!canPropose} /></CardContent></Card>
    <Card className="rounded-lg"><CardHeader><CardTitle>Proposal queue</CardTitle><CardDescription>{matrix.summary.pendingProposals} pending</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Change</TableHead><TableHead>Network</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>Review</TableHead></TableRow></TableHeader><TableBody>{matrix.proposals.map(proposal => <TableRow key={proposal.id}><TableCell className="font-mono">{proposal.id}</TableCell><TableCell>{proposal.changeType}</TableCell><TableCell>{proposal.networkId ?? "allocate on apply"}</TableCell><TableCell><Badge variant="outline">{proposal.status}</Badge></TableCell><TableCell className="max-w-96 text-sm">{proposal.reason}</TableCell><TableCell><NetworkProposalReviewForm proposalId={proposal.id} status={proposal.status} disabled={!canReview} /></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </>;
}
