import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Database,
  Gauge,
  GitBranch,
  Layers3,
  ListChecks,
  Radar,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

import { DbError } from "@/components/mqchain/db-error";
import { MetricCard } from "@/components/mqchain/metric-card";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DistributionRow } from "@/lib/mqchain/batch-detail";
import { getDashboardOverview } from "@/lib/mqchain/services/dashboard-service";

function DistributionTable({ rows, emptyLabel = "No rows." }: { rows: DistributionRow[]; emptyLabel?: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-mono text-xs">{row.label}</TableCell>
            <TableCell className="text-right font-mono">{row.count}</TableCell>
          </TableRow>
        )) : (
          <TableRow>
            <TableCell colSpan={2} className="text-sm text-muted-foreground">{emptyLabel}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export default async function DashboardPage() {
  try {
    const overview = await getDashboardOverview();
    const { stats } = overview;

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">MQCHAIN Console</h1>
          <p className="text-sm text-muted-foreground">Candidate staging, evidence-backed approval, registry truth, and metric-ready label compilation.</p>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Pending candidates" value={stats.pendingCandidates} icon={ListChecks} />
          <MetricCard title="Needs review" value={stats.needsReview} icon={ShieldCheck} />
          <MetricCard title="Active labels" value={stats.activeLabels} icon={Database} />
          <MetricCard title="Metric eligible" value={stats.metricEligibleCount} icon={Gauge} />
          <MetricCard title="Approved today" value={stats.approvedToday} icon={Upload} />
          <MetricCard title="Rejected today" value={stats.rejectedToday} icon={AlertTriangle} />
          <MetricCard title="Committed batches" value={stats.committedBatches} icon={Boxes} />
          <MetricCard title="Active protocols" value={stats.activeProtocols} icon={GitBranch} />
          <MetricCard title="Conflicts" value={stats.unresolvedConflicts} icon={AlertTriangle} />
          <MetricCard title="Active entities" value={stats.activeEntities} icon={Users} />
          <MetricCard title="Metric groups" value={stats.activeMetricGroups} icon={Layers3} />
          <MetricCard title="Discovery states" value={overview.discoveryStatus.length} icon={Radar} />
        </section>
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Latest committed batch</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.latestBatch ? (
                <div className="space-y-3 text-sm">
                  <Link className="font-mono text-primary hover:underline" href={`/mqchain/batches/${overview.latestBatch.id}`}>
                    batch #{overview.latestBatch.id}
                  </Link>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Accepted</span><div className="font-mono">{overview.latestBatch.acceptedCount}</div></div>
                    <div><span className="text-muted-foreground">Conflicts</span><div className="font-mono">{overview.latestBatch.conflictCount}</div></div>
                    <div><span className="text-muted-foreground">Source</span><div className="font-mono">{overview.latestBatch.sourceType ?? "-"}</div></div>
                    <div><span className="text-muted-foreground">Committed</span><div className="font-mono text-xs">{overview.latestBatch.committedAt?.toISOString() ?? "-"}</div></div>
                  </div>
                </div>
              ) : <div className="text-sm text-muted-foreground">No committed batch yet.</div>}
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Latest KV manifest</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.latestKvBuild ? (
                <div className="space-y-3 text-sm">
                  <Link className="font-mono text-primary hover:underline" href={`/mqchain/kv-builds/${overview.latestKvBuild.id}`}>
                    {overview.latestKvBuild.buildHash.slice(0, 18)}...
                  </Link>
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={overview.latestKvBuild.status} /></div></div>
                    <div><span className="text-muted-foreground">Rows</span><div className="font-mono">{overview.latestKvBuild.rowCount}</div></div>
                    <div><span className="text-muted-foreground">Dictionary</span><div className="truncate font-mono text-xs">{overview.latestKvBuild.dictionaryVersion ?? "-"}</div></div>
                    <div><span className="text-muted-foreground">Created</span><div className="font-mono text-xs">{overview.latestKvBuild.createdAt.toISOString()}</div></div>
                  </div>
                </div>
              ) : <div className="text-sm text-muted-foreground">No KV build manifest yet.</div>}
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Discovery jobs status</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionTable rows={overview.discoveryStatus} emptyLabel="No discovery jobs yet." />
            </CardContent>
          </Card>
        </section>
        <section className="grid gap-4 xl:grid-cols-4">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Candidates by source type</CardTitle></CardHeader>
            <CardContent><DistributionTable rows={overview.sourceTypes} emptyLabel="No source jobs yet." /></CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Labels by quality tier</CardTitle></CardHeader>
            <CardContent><DistributionTable rows={overview.qualityTiers} emptyLabel="No labels yet." /></CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Confidence distribution</CardTitle></CardHeader>
            <CardContent><DistributionTable rows={overview.confidenceDistribution} emptyLabel="No labels yet." /></CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Labels by entity</CardTitle></CardHeader>
            <CardContent><DistributionTable rows={overview.labelsByEntity} emptyLabel="No labels yet." /></CardContent>
          </Card>
        </section>
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Recent approval events</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recentApprovalEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.action.replace(/_/g, " ")}</TableCell>
                      <TableCell className="font-mono text-xs">{event.candidateId ?? event.batchId ?? event.registryId ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{event.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  ))}
                  {!overview.recentApprovalEvents.length ? (
                    <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">No approval events yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Recent source jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recentSourceJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/mqchain/source-jobs/${job.id}`}>{job.sourceType}</Link></TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{job.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  ))}
                  {!overview.recentSourceJobs.length ? (
                    <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">No source jobs yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Recent discovery jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Candidates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recentDiscoveryJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell><Link className="font-mono text-xs text-primary hover:underline" href={`/mqchain/discovery/jobs/${job.id}`}>{job.discoveryType}</Link></TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono">{job.candidatesCreated}</TableCell>
                    </TableRow>
                  ))}
                  {!overview.recentDiscoveryJobs.length ? (
                    <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">No discovery jobs yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
