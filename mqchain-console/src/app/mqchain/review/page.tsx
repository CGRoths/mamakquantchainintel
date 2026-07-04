import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, CircleHelp, ListChecks } from "lucide-react";

import { DbError } from "@/components/mqchain/db-error";
import { MetricCard } from "@/components/mqchain/metric-card";
import { ReviewBatchSelectionForm, ReviewQuickActionForm, reviewQuickActions } from "@/components/mqchain/review-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildReviewReadiness } from "@/lib/mqchain/review";
import { getReviewWorkspace } from "@/lib/mqchain/services/review-service";

function pageHref(params: Record<string, string | undefined>, pageKey: "page" | "approvedPage", page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== pageKey) next.set(key, value);
  }
  if (page > 1) next.set(pageKey, String(page));
  const query = next.toString();
  return query ? `/mqchain/review?${query}` : "/mqchain/review";
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const workspace = await getReviewWorkspace(params);

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Review queue</h1>
            <p className="text-sm text-muted-foreground">Fast path for human review. Candidates stay staged until a batch commit writes registry truth.</p>
          </div>
          <Button asChild variant="outline"><Link href="/mqchain/review/groups">Review groups</Link></Button>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Pending review" value={workspace.counts.pending} icon={ListChecks} />
          <MetricCard title="Needs evidence" value={workspace.counts.needsMoreEvidence} icon={CircleHelp} />
          <MetricCard title="Conflicts" value={workspace.counts.conflicts} icon={AlertTriangle} />
          <MetricCard title="Approved for batch" value={workspace.counts.approvedReady} icon={CheckCircle2} />
        </section>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Narrow the review queue and approved-for-batch list without leaving the fast path.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="q" placeholder="Address, hint, entity" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="btc, ethereum..." defaultValue={params.chain ?? ""} />
              <Input name="entity" placeholder="Entity" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol" defaultValue={params.protocol ?? ""} />
              <Input name="role" placeholder="Role" defaultValue={params.role ?? ""} />
              <Input name="sourceType" placeholder="Source type" defaultValue={params.sourceType ?? ""} />
              <Input name="discoveryType" placeholder="Discovery type" defaultValue={params.discoveryType ?? ""} />
              <Input name="minConfidence" type="number" min="0" max="100" placeholder="Min confidence" defaultValue={params.minConfidence ?? ""} />
              <Input name="maxConfidence" type="number" min="0" max="100" placeholder="Max confidence" defaultValue={params.maxConfidence ?? ""} />
              <Input name="qualityTier" type="number" min="0" max="5" placeholder="Quality tier" defaultValue={params.qualityTier ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "confidence"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="confidence">Confidence</option>
                <option value="created_at">Newest</option>
                <option value="evidence_count">Evidence count</option>
              </select>
              <select
                name="pageSize"
                defaultValue={params.pageSize ?? "50"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
              <Button type="submit">Search</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/mqchain/review">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <section className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Candidate groups</CardTitle>
              <CardDescription>Entity, chain, and role clusters from this pending page.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.groups.map((group) => (
                    <TableRow key={group.slug}>
                      <TableCell>
                        <Link className="text-primary hover:underline" href={`/mqchain/review/groups/${group.slug}`}>
                          <span className="block truncate">{group.entity}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{group.chain} / {group.role}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">{group.count}</TableCell>
                    </TableRow>
                  ))}
                  {!workspace.groups.length ? (
                    <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">No pending groups.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Pending candidates</CardTitle>
              <CardDescription>{workspace.pending.total} pending candidates match these filters.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Page {workspace.pending.page} of {workspace.pending.totalPages}
                </span>
                <div className="flex gap-2">
                  {workspace.pending.page > 1 ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(params, "page", workspace.pending.page - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                  )}
                  {workspace.pending.page < workspace.pending.totalPages ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(params, "page", workspace.pending.page + 1)}>Next</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Next</Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Suggested label</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.pendingRows.map(({ candidate, entityName, roleCode, sourceType, latestEvidence, sourceVerificationContext }) => {
                    const readiness = buildReviewReadiness({
                      ...candidate,
                      sourceVerificationStatus: sourceVerificationContext.status,
                    });
                    return (
                      <TableRow key={candidate.id}>
                        <TableCell className="font-mono">{candidate.id}</TableCell>
                        <TableCell className="max-w-72 truncate font-mono text-xs">
                          <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.normalizedAddress}</Link>
                          <span className="block text-muted-foreground">{candidate.chainCode ?? "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block">{entityName ?? candidate.entityHint ?? "-"}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{roleCode ?? candidate.roleHint ?? "-"}</span>
                        </TableCell>
                        <TableCell className="max-w-80">
                          <span className="block"><StatusBadge status={sourceType ?? candidate.discoveredBy} /></span>
                          <span className="block truncate text-xs text-muted-foreground">{latestEvidence?.summary ?? "No evidence summary"}</span>
                          {!readiness.canQuickApprove ? (
                            <span className="mt-1 block font-mono text-xs text-amber-400">{readiness.blockers.join(", ")}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <ReviewQuickActionForm
                              action={reviewQuickActions.approve}
                              candidateId={candidate.id}
                              disabled={!readiness.canQuickApprove}
                              reason="Approved as suggested from review queue."
                              variant="default"
                            >
                              Approve
                            </ReviewQuickActionForm>
                            <ReviewQuickActionForm action={reviewQuickActions.reject} candidateId={candidate.id} reason="Rejected from review queue.">
                              Reject
                            </ReviewQuickActionForm>
                            <ReviewQuickActionForm action={reviewQuickActions.evidence} candidateId={candidate.id}>
                              Evidence
                            </ReviewQuickActionForm>
                            <ReviewQuickActionForm action={reviewQuickActions.conflict} candidateId={candidate.id}>
                              Conflict
                            </ReviewQuickActionForm>
                            <ReviewQuickActionForm action={reviewQuickActions.metricOff} candidateId={candidate.id} variant="ghost">
                              Metric off
                            </ReviewQuickActionForm>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!workspace.pendingRows.length ? (
                    <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No pending candidates.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" />Batch select</CardTitle>
            <CardDescription>{workspace.approved.total} approved candidates match these filters.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewBatchSelectionForm disabled={!workspace.approvedRows.length}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="grid gap-2">
                  <Label>Batch name</Label>
                  <Input name="sourceName" defaultValue={`Review queue ${new Date().toISOString().slice(0, 10)}`} />
                </div>
                <Button type="submit" className="self-end">Create batch</Button>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  Approved page {workspace.approved.page} of {workspace.approved.totalPages}
                </span>
                <div className="flex gap-2">
                  {workspace.approved.page > 1 ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(params, "approvedPage", workspace.approved.page - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                  )}
                  {workspace.approved.page < workspace.approved.totalPages ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(params, "approvedPage", workspace.approved.page + 1)}>Next</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>Next</Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Select</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.approvedRows.map(({ candidate, entityName, roleCode, latestEvidence }) => (
                    <TableRow key={candidate.id}>
                      <TableCell><input className="h-4 w-4 accent-primary" type="checkbox" name="candidateId" value={candidate.id} defaultChecked /></TableCell>
                      <TableCell className="font-mono">{candidate.id}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">{candidate.normalizedAddress}</TableCell>
                      <TableCell>{entityName ?? candidate.entityHint ?? "-"} <span className="font-mono text-xs text-muted-foreground">{roleCode ?? candidate.roleHint ?? "-"}</span></TableCell>
                      <TableCell className="max-w-96 truncate text-xs text-muted-foreground">{latestEvidence?.summary ?? "-"}</TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                    </TableRow>
                  ))}
                  {!workspace.approvedRows.length ? (
                    <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No approved candidates waiting for batch.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </ReviewBatchSelectionForm>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
