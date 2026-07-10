import { notFound } from "next/navigation";

import { DbError } from "@/components/mqchain/db-error";
import { ActivateKvBuildManifestForm } from "@/components/mqchain/kv-build-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import {
  buildKvManifestActivationPreflight,
  summarizeKvManifestIndexes,
  summarizePersistedKvIndexRecords,
} from "@/lib/mqchain/kv-manifest";
import { getKvBuildDetail } from "@/lib/mqchain/services/kv-manifest-service";

export default async function KvBuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [detail, currentUser] = await Promise.all([getKvBuildDetail(Number(id)), getCurrentUser()]);
    if (!detail) notFound();
    const canCommit = roleCan(currentUser?.role, "batch:commit");
    const { build, indexManifests, indexShards, membershipSnapshots, membershipRows } = detail;
    const preflight = buildKvManifestActivationPreflight(build);
    const indexSummary = summarizeKvManifestIndexes(build.manifest);
    const persistedIndexSummary = summarizePersistedKvIndexRecords(indexManifests, indexShards);
    const displayedMembershipRows = membershipRows.slice(0, 50);
    return (
      <>
        <div><h1 className="text-2xl font-semibold">KV build {build.id}</h1><p className="font-mono text-sm text-muted-foreground">{build.buildHash}</p></div>
        <section className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-lg"><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><StatusBadge status={build.status} /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Rows</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{build.rowCount}</CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Dictionary</CardTitle></CardHeader><CardContent className="truncate font-mono text-sm">{build.dictionaryVersion ?? "-"}</CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Activated</CardTitle></CardHeader><CardContent className="font-mono text-xs">{build.activatedAt?.toISOString() ?? "-"}</CardContent></Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Activation</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Activation marks this manifest as the serving artifact for downstream MQCHAIN workers. The binary build itself remains external to Vercel.</p>
            {canCommit ? (
              <ActivateKvBuildManifestForm buildId={build.id} canActivate={preflight.canActivate} />
            ) : (
              <p className="rounded-md border bg-muted/40 p-3">Activation requires batch commit permission. This view is read-only for your role.</p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Activation preflight</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Check</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {preflight.checks.map((check) => (
                  <TableRow key={check.key}>
                    <TableCell className="font-medium">{check.label}</TableCell>
                    <TableCell>
                      <Badge variant={check.status === "fail" ? "destructive" : check.status === "warn" ? "outline" : "secondary"}>{check.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{check.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Serving indexes</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-3 text-sm md:grid-cols-4">
              <div><span className="text-muted-foreground">Declared</span><div>{String(indexSummary.hasIndexes)}</div></div>
              <div><span className="text-muted-foreground">Required present</span><div className="font-mono">{indexSummary.rows.filter((row) => row.present).length} / {indexSummary.rows.length}</div></div>
              <div><span className="text-muted-foreground">Index rows</span><div className="font-mono">{indexSummary.totalRowCount ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Missing row counts</span><div className="font-mono">{indexSummary.rowCountMissing.length}</div></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Index</TableHead><TableHead>Declared name</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Hash</TableHead><TableHead>Path</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {indexSummary.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="font-mono text-xs">{row.indexName}</TableCell>
                    <TableCell><Badge variant={row.present ? "secondary" : "destructive"}>{row.present ? "present" : "missing"}</Badge></TableCell>
                    <TableCell className="font-mono">{row.rowCount ?? "-"}</TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{row.hash ?? "-"}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{row.path ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Persisted serving indexes</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-3 text-sm md:grid-cols-5">
              <div><span className="text-muted-foreground">Index records</span><div className="font-mono">{persistedIndexSummary.indexCount}</div></div>
              <div><span className="text-muted-foreground">Required missing</span><div className="font-mono">{persistedIndexSummary.missingRequired.length}</div></div>
              <div><span className="text-muted-foreground">Persisted rows</span><div className="font-mono">{persistedIndexSummary.totalRowCount}</div></div>
              <div><span className="text-muted-foreground">Shard records</span><div className="font-mono">{persistedIndexSummary.shardCount}</div></div>
              <div><span className="text-muted-foreground">Statuses</span><div className="font-mono">{Object.entries(persistedIndexSummary.statusCounts).map(([status, count]) => `${status}:${count}`).join(" ") || "-"}</div></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Index</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Shards</TableHead><TableHead>Dictionary</TableHead><TableHead>Batch</TableHead><TableHead>Hash</TableHead><TableHead>Storage URI</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {persistedIndexSummary.rows.length ? (
                  persistedIndexSummary.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.requiredLabel ?? row.indexName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.indexName}</div>
                      </TableCell>
                      <TableCell><Badge variant={row.status === "active" || row.status === "compiled" ? "secondary" : "outline"}>{row.status}</Badge></TableCell>
                      <TableCell className="font-mono">{row.rowCount}</TableCell>
                      <TableCell className="font-mono">{row.shardCount}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">{row.dictionaryVersion ?? "-"}</TableCell>
                      <TableCell className="font-mono">{row.lastCommittedBatchId ?? "-"}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">{row.manifestHash ?? "-"}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">{row.storageUri ?? "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={8} className="text-muted-foreground">No persisted index manifest rows have been recorded for this build.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {persistedIndexSummary.missingRequired.length ? (
              <p className="mt-3 text-sm text-destructive">Missing persisted required indexes: {persistedIndexSummary.missingRequired.join(", ")}.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Persisted index shards</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Index</TableHead><TableHead>Shard</TableHead><TableHead>Key</TableHead><TableHead>Rows</TableHead><TableHead>Hash</TableHead><TableHead>Storage URI</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {persistedIndexSummary.rows.some((row) => row.shards.length) ? (
                  persistedIndexSummary.rows.flatMap((row) =>
                    row.shards.map((shard) => (
                      <TableRow key={`${row.id}-${shard.shardId}`}>
                        <TableCell className="font-mono text-xs">{row.indexName}</TableCell>
                        <TableCell className="font-mono text-xs">{shard.shardId}</TableCell>
                        <TableCell className="font-mono text-xs">{shard.shardKey}</TableCell>
                        <TableCell className="font-mono">{shard.rowCount}</TableCell>
                        <TableCell className="max-w-48 truncate font-mono text-xs">{shard.shardHash ?? "-"}</TableCell>
                        <TableCell className="max-w-96 truncate font-mono text-xs">{shard.storageUri ?? "-"}</TableCell>
                      </TableRow>
                    )),
                  )
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground">No persisted shard rows have been recorded for this build.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Metric membership snapshots</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-3 text-sm md:grid-cols-4">
              <div><span className="text-muted-foreground">Snapshots</span><div className="font-mono">{membershipSnapshots.length}</div></div>
              <div><span className="text-muted-foreground">Persisted members</span><div className="font-mono">{membershipRows.length}</div></div>
              <div><span className="text-muted-foreground">Manifest members</span><div className="font-mono">{membershipSnapshots.reduce((total, snapshot) => total + snapshot.memberCount, 0)}</div></div>
              <div><span className="text-muted-foreground">Shown rows</span><div className="font-mono">{displayedMembershipRows.length}</div></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Metric group</TableHead><TableHead>Status</TableHead><TableHead>Members</TableHead><TableHead>Dictionary</TableHead><TableHead>Hash</TableHead><TableHead>Activated</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {membershipSnapshots.length ? (
                  membershipSnapshots.map((snapshot) => (
                    <TableRow key={snapshot.id}>
                      <TableCell>
                        <div className="font-mono">{snapshot.metricGroupCode}</div>
                        <div className="text-xs text-muted-foreground">snapshot #{snapshot.id}</div>
                      </TableCell>
                      <TableCell><Badge variant={snapshot.status === "active" ? "secondary" : snapshot.status === "superseded" ? "outline" : "default"}>{snapshot.status}</Badge></TableCell>
                      <TableCell className="font-mono">{snapshot.memberCount}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">{snapshot.dictionaryVersion ?? "-"}</TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">{snapshot.manifestHash ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{snapshot.activatedAt?.toISOString() ?? "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground">No metric membership snapshots are linked to this build.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {displayedMembershipRows.length ? (
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium">Persisted member rows</div>
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Snapshot</TableHead><TableHead>Address</TableHead><TableHead>Chain</TableHead><TableHead>Entity</TableHead><TableHead>Role</TableHead><TableHead>Confidence</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedMembershipRows.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-mono text-xs">#{member.snapshotId}</TableCell>
                        <TableCell className="max-w-96 truncate font-mono text-xs">{member.normalizedAddress}</TableCell>
                        <TableCell className="font-mono">{member.chainCode}</TableCell>
                        <TableCell className="font-mono">{member.entityId ?? "-"}</TableCell>
                        <TableCell className="font-mono">{member.roleId ?? "-"}</TableCell>
                        <TableCell className="font-mono">{member.confidenceScore}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {membershipRows.length > displayedMembershipRows.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Showing first {displayedMembershipRows.length} of {membershipRows.length} persisted member rows.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card className="rounded-lg"><CardHeader><CardTitle>Artifact</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div><span className="text-muted-foreground">Storage URI</span><div className="font-mono">{build.storageUri ?? "-"}</div></div><div><span className="text-muted-foreground">Created</span><div className="font-mono">{build.createdAt.toISOString()}</div></div></CardContent></Card>
        <Card className="rounded-lg"><CardHeader><CardTitle>Manifest</CardTitle></CardHeader><CardContent><pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(build.manifest, null, 2)}</pre></CardContent></Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
