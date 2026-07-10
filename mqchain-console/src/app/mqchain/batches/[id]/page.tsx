import Link from "next/link";
import { notFound } from "next/navigation";

import { BatchLifecycleForms, BatchPrimaryActions } from "@/components/mqchain/batch-forms";
import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { batchLifecyclePermissions } from "@/lib/mqchain/batch-detail";
import { isCandidateSourceVerificationSatisfied } from "@/lib/mqchain/candidate-detail";
import { getBatchDetail } from "@/lib/mqchain/services/batch-service";

type DistributionRow = {
  label: string;
  count: number;
};

function DistributionTable({ rows, emptyLabel }: { rows: DistributionRow[]; emptyLabel: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bucket</TableHead>
          <TableHead>Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="font-mono">{row.count}</TableCell>
          </TableRow>
        ))}
        {!rows.length ? (
          <TableRow>
            <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [detail, currentUser] = await Promise.all([getBatchDetail(Number(id)), getCurrentUser()]);
    if (!detail) {
      notFound();
    }

    const canReview = roleCan(currentUser?.role, "candidate:review");
    const canCommitBatch = roleCan(currentUser?.role, "batch:commit");
    const statusLifecycle = batchLifecyclePermissions(detail.batch.status);
    const lifecycle = {
      canApprove: statusLifecycle.canApprove && canReview,
      canCommit: statusLifecycle.canCommit && canCommitBatch,
      canFail: statusLifecycle.canFail && canReview,
      canSupersede: statusLifecycle.canSupersede && canReview,
    };
    const readinessByCandidateId = new Map(detail.candidateReadiness.map((row) => [row.id, row]));

    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{detail.batch.sourceName ?? `Batch ${detail.batch.id}`}</h1>
            <p className="font-mono text-sm text-muted-foreground">{detail.batch.batchHash}</p>
          </div>
          <StatusBadge status={detail.batch.status} />
        </div>
        <BatchPrimaryActions batchId={detail.batch.id} canApprove={lifecycle.canApprove} canCommit={lifecycle.canCommit} />
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Read-only batch provenance API</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/batches/{detail.batch.id}</code>
            <Button asChild variant="outline">
              <Link href={`/api/mqchain/batches/${detail.batch.id}`}>Open JSON</Link>
            </Button>
          </CardContent>
        </Card>
        <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <div className="grid gap-4">
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Batch overview</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-3">
                <div><span className="text-muted-foreground">Source job</span><div className="font-mono">{detail.sourceJob ? <Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${detail.sourceJob.id}`}>{detail.sourceJob.id}</Link> : "-"}</div></div>
                <div><span className="text-muted-foreground">Source document</span><div className="font-mono">{detail.sourceDocument?.id ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Source type</span><div>{detail.batch.sourceType ?? detail.sourceJob?.sourceType ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Default entity</span><div>{detail.entity?.entityName ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Default protocol</span><div>{detail.protocol?.protocolName ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Default role</span><div>{detail.role?.roleCode ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Imported</span><div className="font-mono">{detail.batch.importedCount}</div></div>
                <div><span className="text-muted-foreground">Accepted</span><div className="font-mono">{detail.batch.acceptedCount}</div></div>
                <div><span className="text-muted-foreground">Rejected</span><div className="font-mono">{detail.batch.rejectedCount}</div></div>
                <div><span className="text-muted-foreground">Conflicts</span><div className="font-mono">{detail.batch.conflictCount || detail.candidateRollup.conflictCount}</div></div>
                <div><span className="text-muted-foreground">Avg confidence</span><div className="font-mono">{detail.candidateRollup.averageConfidence}</div></div>
                <div><span className="text-muted-foreground">Default confidence</span><div className="font-mono">{detail.batch.confidenceDefault ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Default quality</span><div className="font-mono">{detail.batch.qualityTierDefault ?? "-"}</div></div>
                <div className="md:col-span-2"><span className="text-muted-foreground">Flags default</span><div className="mt-1"><FlagBadges flags={detail.batch.flagsDefault ?? 0} showEmpty={detail.batch.flagsDefault === null} /></div></div>
                <div><span className="text-muted-foreground">Status default</span><div className="font-mono">{detail.batch.statusDefault ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Effective from</span><div className="font-mono">{detail.batch.effectiveFromBlock ?? detail.candidateRollup.firstSeenBlock ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Effective to</span><div className="font-mono">{detail.batch.effectiveToBlock ?? detail.candidateRollup.lastSeenBlock ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Action</span><div>{detail.batch.labelAction}</div></div>
                <div><span className="text-muted-foreground">Approved at</span><div className="font-mono text-xs">{detail.batch.approvedAt?.toISOString() ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Committed at</span><div className="font-mono text-xs">{detail.batch.committedAt?.toISOString() ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Hash preview</span><div className="break-all font-mono text-xs">{detail.batch.batchHash ?? "-"}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Candidates in batch</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Source verification</TableHead>
                      <TableHead>Seen range</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.candidates.map((candidate) => {
                      const readiness = readinessByCandidateId.get(candidate.id);
                      const sourceReady = isCandidateSourceVerificationSatisfied(readiness?.sourceVerificationStatus);

                      return (
                        <TableRow key={candidate.id}>
                          <TableCell className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.id}</Link></TableCell>
                          <TableCell className="max-w-96 truncate font-mono text-xs">{candidate.normalizedAddress}</TableCell>
                          <TableCell>{candidate.chainCode}</TableCell>
                          <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                          <TableCell className="font-mono">{candidate.confidenceScore}</TableCell>
                          <TableCell className="font-mono">{candidate.qualityTier}</TableCell>
                          <TableCell className={(candidate.evidenceCount ?? 0) > 0 ? "font-mono" : "font-mono text-destructive"}>{candidate.evidenceCount}</TableCell>
                          <TableCell className={sourceReady ? "font-mono text-xs text-emerald-400" : "font-mono text-xs text-destructive"}>
                            {readiness?.sourceVerificationStatus?.replace(/_/g, " ") ?? "source verification missing"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{candidate.firstSeenBlock ?? "-"} / {candidate.lastSeenBlock ?? "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!detail.candidates.length ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                          No candidates are linked to this batch.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Candidate evidence</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Trust</TableHead>
                      <TableHead>Delta</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead>Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.candidateEvidence.map((evidence) => (
                      <TableRow key={evidence.id}>
                        <TableCell className="font-mono">{evidence.candidateId ? <Link className="text-primary hover:underline" href={`/mqchain/candidates/${evidence.candidateId}`}>{evidence.candidateId}</Link> : "-"}</TableCell>
                        <TableCell>{evidence.evidenceType}</TableCell>
                        <TableCell>{evidence.trustTier}</TableCell>
                        <TableCell className="font-mono">{evidence.confidenceDelta}</TableCell>
                        <TableCell>{evidence.summary ?? "-"}</TableCell>
                        <TableCell className="break-all font-mono text-xs">{evidence.evidenceHash ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                    {!detail.candidateEvidence.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No candidate evidence is linked to this batch.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Registry rows produced</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Timeline</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.registryRows.map(({ registry, entityName, protocolName, roleCode }) => (
                      <TableRow key={registry.id}>
                        <TableCell className="font-mono">
                          <Link className="text-primary hover:underline" href={`/mqchain/registry/${registry.id}`}>{registry.id}</Link>
                        </TableCell>
                        <TableCell className="max-w-96 truncate font-mono text-xs">{registry.normalizedAddress}</TableCell>
                        <TableCell>{entityName ?? "-"}</TableCell>
                        <TableCell>{protocolName ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{roleCode ?? registry.roleId}</TableCell>
                        <TableCell className="font-mono">{registry.confidenceScore} / Q{registry.qualityTier}</TableCell>
                        <TableCell className="font-mono text-xs">{registry.validFromBlock ?? "*"} / {registry.validToBlock ?? "*"}</TableCell>
                        <TableCell><StatusBadge status={registry.isActive ? "approved" : "superseded"} /></TableCell>
                      </TableRow>
                    ))}
                    {!detail.registryRows.length ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          Registry rows appear here after the batch is committed.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Committed batch evidence rows</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead>Hash</TableHead>
                      <TableHead>Payload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.batchEvidence.map((evidence) => (
                      <TableRow key={evidence.id}>
                        <TableCell className="font-mono">{evidence.evidenceId ?? "-"}</TableCell>
                        <TableCell>{evidence.summary ?? "-"}</TableCell>
                        <TableCell className="break-all font-mono text-xs">{evidence.evidenceHash ?? "-"}</TableCell>
                        <TableCell>
                          <details>
                            <summary className="cursor-pointer text-xs text-primary">JSON</summary>
                            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(evidence.payload, null, 2)}</pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!detail.batchEvidence.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          Batch evidence rows are created during commit.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Approval history</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Registry</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.approvalEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.action.replace(/_/g, " ")}</TableCell>
                        <TableCell className="font-mono">{event.candidateId ? <Link className="text-primary hover:underline" href={`/mqchain/candidates/${event.candidateId}`}>{event.candidateId}</Link> : "-"}</TableCell>
                        <TableCell className="font-mono">{event.registryId ? <Link className="text-primary hover:underline" href={`/mqchain/registry/${event.registryId}`}>{event.registryId}</Link> : "-"}</TableCell>
                        <TableCell>{event.reason ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{event.createdAt.toISOString()}</TableCell>
                      </TableRow>
                    ))}
                    {!detail.approvalEvents.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No approval events are linked to this batch yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4">
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Candidate distributions</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <div>
                  <h2 className="mb-2 text-sm font-medium">Status</h2>
                  <DistributionTable rows={detail.candidateRollup.statusDistribution} emptyLabel="No status data." />
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-medium">Quality tier</h2>
                  <DistributionTable rows={detail.candidateRollup.qualityDistribution} emptyLabel="No quality data." />
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-medium">Confidence</h2>
                  <DistributionTable rows={detail.candidateRollup.confidenceDistribution} emptyLabel="No confidence data." />
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Evidence summary</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><span className="text-muted-foreground">Evidence rows</span><div className="font-mono">{detail.evidenceRollup.totalEvidence}</div></div>
                  <div><span className="text-muted-foreground">Batch rows</span><div className="font-mono">{detail.batchEvidence.length}</div></div>
                  <div><span className="text-muted-foreground">Net delta</span><div className="font-mono">{detail.evidenceRollup.netConfidenceDelta}</div></div>
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-medium">Evidence type</h2>
                  <DistributionTable rows={detail.evidenceRollup.evidenceTypeDistribution} emptyLabel="No evidence type data." />
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-medium">Trust tier</h2>
                  <DistributionTable rows={detail.evidenceRollup.trustDistribution} emptyLabel="No trust data." />
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Registry output</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">Rows</span><div className="font-mono">{detail.registryRollup.totalRows}</div></div>
                <div><span className="text-muted-foreground">Active</span><div className="font-mono">{detail.registryRollup.activeRows}</div></div>
                <div><span className="text-muted-foreground">Inactive</span><div className="font-mono">{detail.registryRollup.inactiveRows}</div></div>
                <div><span className="text-muted-foreground">Metric eligible</span><div className="font-mono">{detail.registryRollup.metricEligibleRows}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>KV handoff</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Dictionary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.kvBuilds.map((build) => (
                      <TableRow key={build.id}>
                        <TableCell className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/kv-builds/${build.id}`}>{build.id}</Link></TableCell>
                        <TableCell><StatusBadge status={build.status} /></TableCell>
                        <TableCell className="font-mono">{build.rowCount}</TableCell>
                        <TableCell className="max-w-52 truncate font-mono text-xs">{build.dictionaryVersion ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                    {!detail.kvBuilds.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No KV manifest has been queued for this batch yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Lifecycle actions</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <BatchLifecycleForms batchId={detail.batch.id} canFail={lifecycle.canFail} canSupersede={lifecycle.canSupersede} />
              </CardContent>
            </Card>
          </div>
        </section>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
