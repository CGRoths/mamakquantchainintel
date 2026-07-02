import Link from "next/link";

import {
  approveCandidateAsSuggestedAction,
  createReviewBatchFromSelectionAction,
  reviewMarkCandidateConflictAction,
  reviewMarkCandidateMetricIneligibleAction,
  reviewMarkCandidateNeedsMoreEvidenceAction,
  reviewRejectCandidateAction,
} from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReviewGroupDetail } from "@/lib/mqchain/services/review-service";

export default async function ReviewGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const returnTo = `/mqchain/review/groups/${id}`;

  try {
    const detail = await getReviewGroupDetail(id);
    const rollupCards = [
      { title: "Statuses", rows: detail.rollups.statuses },
      { title: "Sources", rows: detail.rollups.sources },
      { title: "Evidence types", rows: detail.rollups.evidenceTypes },
      { title: "Trust tiers", rows: detail.rollups.trustTiers },
    ];

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{detail.group?.entity ?? "Review group"}</h1>
            <p className="font-mono text-sm text-muted-foreground">{detail.group ? `${detail.group.chain} / ${detail.group.role}` : id}</p>
          </div>
          <Button asChild variant="outline"><Link href="/mqchain/review/groups">All groups</Link></Button>
        </div>
        {detail.group ? (
          <section className="grid gap-4 sm:grid-cols-4">
            <Card className="rounded-lg"><CardHeader><CardTitle>Pending rows</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{detail.rows.length}</CardContent></Card>
            <Card className="rounded-lg"><CardHeader><CardTitle>Approved rows</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{detail.approvedRows.length}</CardContent></Card>
            <Card className="rounded-lg"><CardHeader><CardTitle>Avg confidence</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{detail.group.averageConfidence}</CardContent></Card>
            <Card className="rounded-lg"><CardHeader><CardTitle>Evidence rows</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{detail.group.evidenceCount}</CardContent></Card>
          </section>
        ) : null}
        <section className="grid gap-4 lg:grid-cols-4">
          {rollupCards.map(({ title, rows }) => (
            <Card key={title} className="rounded-lg">
              <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                    <StatusBadge status={row.label} />
                    <span className="font-mono">{row.count}</span>
                  </div>
                ))}
                {!rows.length ? <p className="text-sm text-muted-foreground">No rows.</p> : null}
              </CardContent>
            </Card>
          ))}
        </section>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Pending candidates</CardTitle>
            <CardDescription>Open a row for full edit approval when quick approval is not available.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.rows.map(({ candidate, sourceType, latestEvidence }) => {
                  const canQuickApprove = Boolean(candidate.suggestedEntityId && candidate.suggestedRoleId);
                  return (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-mono">{candidate.id}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">
                        <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.normalizedAddress}</Link>
                      </TableCell>
                      <TableCell className="max-w-96">
                        <span className="block"><StatusBadge status={sourceType ?? candidate.discoveredBy} /></span>
                        <span className="block truncate text-xs text-muted-foreground">{latestEvidence?.summary ?? "-"}</span>
                      </TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                      <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <form action={approveCandidateAsSuggestedAction}>
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="reason" value="Approved as suggested from review group." />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Button type="submit" size="sm" disabled={!canQuickApprove}>Approve</Button>
                          </form>
                          <form action={reviewRejectCandidateAction}>
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="reason" value="Rejected from review group." />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Button type="submit" size="sm" variant="outline">Reject</Button>
                          </form>
                          <form action={reviewMarkCandidateNeedsMoreEvidenceAction}>
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="reason" value="Needs more evidence from review group." />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Button type="submit" size="sm" variant="outline">Evidence</Button>
                          </form>
                          <form action={reviewMarkCandidateConflictAction}>
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="reason" value="Conflict marked from review group." />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Button type="submit" size="sm" variant="outline">Conflict</Button>
                          </form>
                          <form action={reviewMarkCandidateMetricIneligibleAction}>
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="reason" value="Metric-ineligible from review group." />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <Button type="submit" size="sm" variant="ghost">Metric off</Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!detail.rows.length ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No pending candidates for this group.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create batch from approved group rows</CardTitle>
            <CardDescription>Only approved candidates can cross into a label batch; pending rows remain staged.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createReviewBatchFromSelectionAction} className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Batch source name</p>
                  <Input
                    className="mt-2 min-w-72"
                    name="sourceName"
                    defaultValue={detail.group ? `${detail.group.entity} ${detail.group.chain} ${detail.group.role} review batch` : "Review group batch"}
                  />
                </div>
                <Button type="submit" disabled={!detail.approvedRows.length}>Create batch</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Select</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.approvedRows.map(({ candidate, latestEvidence }) => (
                    <TableRow key={candidate.id}>
                      <TableCell><input className="h-4 w-4 accent-primary" type="checkbox" name="candidateId" value={candidate.id} defaultChecked /></TableCell>
                      <TableCell className="font-mono">{candidate.id}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">{candidate.normalizedAddress}</TableCell>
                      <TableCell className="max-w-96 truncate text-xs text-muted-foreground">{latestEvidence?.summary ?? "-"}</TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.approvedRows.length ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No approved candidates in this group yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </form>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
