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
import { getReviewWorkspace } from "@/lib/mqchain/services/review-service";

export default async function ReviewPage() {
  try {
    const workspace = await getReviewWorkspace();

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
        <section className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Candidate groups</CardTitle>
              <CardDescription>Entity, chain, and role clusters.</CardDescription>
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
                  {workspace.groups.slice(0, 10).map((group) => (
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
              <CardDescription>Suggested labels stay staged until batch commit.</CardDescription>
            </CardHeader>
            <CardContent>
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
                  {workspace.pendingRows.map(({ candidate, entityName, roleCode, sourceType, latestEvidence }) => {
                    const canQuickApprove = Boolean(candidate.suggestedEntityId && candidate.suggestedRoleId);
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
                        </TableCell>
                        <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <ReviewQuickActionForm
                              action={reviewQuickActions.approve}
                              candidateId={candidate.id}
                              disabled={!canQuickApprove}
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
            <CardDescription>Approved candidates ready for label batch creation.</CardDescription>
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
