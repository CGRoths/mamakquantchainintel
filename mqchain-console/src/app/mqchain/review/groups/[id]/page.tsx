import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { ReviewBatchSelectionForm, ReviewQuickActionForm, reviewQuickActions } from "@/components/mqchain/review-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildReviewReadiness } from "@/lib/mqchain/review";
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
                  const readiness = buildReviewReadiness(candidate);
                  return (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-mono">{candidate.id}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">
                        <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.normalizedAddress}</Link>
                      </TableCell>
                      <TableCell className="max-w-96">
                        <span className="block"><StatusBadge status={sourceType ?? candidate.discoveredBy} /></span>
                        <span className="block truncate text-xs text-muted-foreground">{latestEvidence?.summary ?? "-"}</span>
                        {!readiness.canQuickApprove ? (
                          <span className="mt-1 block font-mono text-xs text-amber-400">{readiness.blockers.join(", ")}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                      <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <ReviewQuickActionForm
                            action={reviewQuickActions.approve}
                            candidateId={candidate.id}
                            disabled={!readiness.canQuickApprove}
                            reason="Approved as suggested from review group."
                            returnTo={returnTo}
                            variant="default"
                          >
                            Approve
                          </ReviewQuickActionForm>
                          <ReviewQuickActionForm action={reviewQuickActions.reject} candidateId={candidate.id} reason="Rejected from review group." returnTo={returnTo}>
                            Reject
                          </ReviewQuickActionForm>
                          <ReviewQuickActionForm
                            action={reviewQuickActions.evidence}
                            candidateId={candidate.id}
                            reason="Needs more evidence from review group."
                            returnTo={returnTo}
                          >
                            Evidence
                          </ReviewQuickActionForm>
                          <ReviewQuickActionForm
                            action={reviewQuickActions.conflict}
                            candidateId={candidate.id}
                            reason="Conflict marked from review group."
                            returnTo={returnTo}
                          >
                            Conflict
                          </ReviewQuickActionForm>
                          <ReviewQuickActionForm
                            action={reviewQuickActions.metricOff}
                            candidateId={candidate.id}
                            reason="Metric-ineligible from review group."
                            returnTo={returnTo}
                            variant="ghost"
                          >
                            Metric off
                          </ReviewQuickActionForm>
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
            <ReviewBatchSelectionForm disabled={!detail.approvedRows.length}>
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
            </ReviewBatchSelectionForm>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
