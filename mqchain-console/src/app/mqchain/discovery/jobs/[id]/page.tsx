import Link from "next/link";
import { notFound } from "next/navigation";

import { completeDiscoveryJobResultAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { DiscoveryCompletionForm } from "@/components/mqchain/discovery-job-form";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DistributionRow } from "@/lib/mqchain/batch-detail";
import { buildDiscoveryRunnerTask, discoveryResultSchemaSummary, discoveryTemplateSummary } from "@/lib/mqchain/discovery-config";
import { getDiscoveryJobDetail } from "@/lib/mqchain/services/discovery-service";

function DistributionTable({ rows, emptyLabel }: { rows: DistributionRow[]; emptyLabel: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Label</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-mono text-xs">{row.label}</TableCell>
            <TableCell className="text-right font-mono">{row.count}</TableCell>
          </TableRow>
        ))}
        {!rows.length ? (
          <TableRow><TableCell colSpan={2} className="text-sm text-muted-foreground">{emptyLabel}</TableCell></TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

export default async function DiscoveryJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getDiscoveryJobDetail(Number(id));
    if (!detail) notFound();

    const { job } = detail;
    const template = discoveryTemplateSummary(job.discoveryType);
    const jobConfig = job.config ?? {};
    const runnerTask =
      typeof jobConfig.runner_task === "object" && jobConfig.runner_task !== null
        ? jobConfig.runner_task
        : buildDiscoveryRunnerTask({
            discoveryType: job.discoveryType,
            chainCode: job.chainCode,
            seedAddress: job.seedAddress,
            config: jobConfig,
          });
    const operatorConfig = { ...jobConfig };
    delete operatorConfig.runner_task;
    const resultSchema = discoveryResultSchemaSummary(job.discoveryType);
    const pendingReviewHref = `/mqchain/candidates?discoveryType=${encodeURIComponent(job.discoveryType)}&status=pending_review&sort=evidence_count`;

    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{job.discoveryType}</h1>
            <p className="font-mono text-sm text-muted-foreground">{job.seedAddress ?? "no seed"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline"><Link href={pendingReviewHref}>Send result group to review</Link></Button>
            <StatusBadge status={job.status} />
          </div>
        </div>
        <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["Rows", detail.completion.rows ?? "-"],
            ["Candidates", job.candidatesCreated],
            ["Evidence", job.evidenceCreated],
            ["Invalid", detail.completion.invalid],
            ["Duplicates", detail.completion.duplicates],
            ["Pending", detail.candidateRollup.pendingCount],
            ["Approved", detail.candidateRollup.approvedCount],
            ["Conflicts", detail.candidateRollup.conflictCount],
          ].map(([label, value]) => (
            <Card key={label} className="rounded-lg">
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
              <CardContent className="font-mono text-2xl">{value}</CardContent>
            </Card>
          ))}
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Scanner interface</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-4">
            <div><span className="text-muted-foreground">Root</span><div className="font-medium">{template.rootType}</div></div>
            <div><span className="text-muted-foreground">Evidence</span><div className="font-mono text-xs">{template.evidenceType}</div></div>
            <div><span className="text-muted-foreground">Required config</span><div className="font-mono text-xs">{template.requiredConfig.join(", ") || "-"}</div></div>
            <div><span className="text-muted-foreground">Output fields</span><div className="font-mono text-xs">{template.outputFields.join(", ") || "-"}</div></div>
          </CardContent>
        </Card>
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Operator config</CardTitle></CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(operatorConfig, null, 2)}</pre>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>External runner task</CardTitle></CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(runnerTask, null, 2)}</pre>
            </CardContent>
          </Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Result contract</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-muted-foreground">Required</div>
              <div className="font-mono text-xs">{resultSchema.required.join(", ")}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Optional</div>
              <div className="font-mono text-xs">{resultSchema.optional.join(", ")}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Worker completion API</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <code className="rounded-md bg-muted px-2 py-1 text-xs">POST /api/mqchain/discovery/jobs/{job.id}/complete</code>
              <p className="mt-2 text-muted-foreground">
                Authenticated scanners can submit result JSON here. Completion stages source documents, candidates, and evidence only; registry and KV writes remain blocked.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/api/mqchain/discovery/jobs/${job.id}/complete`}>Endpoint</Link>
            </Button>
          </CardContent>
        </Card>
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg"><CardHeader><CardTitle>Status distribution</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.candidateRollup.statusDistribution} emptyLabel="No candidates." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Evidence distribution</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.evidenceRollup.typeDistribution} emptyLabel="No evidence." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Log distribution</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.logDistribution} emptyLabel="No logs." /></CardContent></Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Discovery logs</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-4 text-xs">{(job.logs ?? []).join("\n") || "No logs recorded."}</pre>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Archived result source</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Storage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.sourceJobs.map((sourceJob) => {
                  const document = detail.documents.find((row) => row.sourceJobId === sourceJob.id);
                  return (
                    <TableRow key={sourceJob.id}>
                      <TableCell className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${sourceJob.id}`}>{sourceJob.id}</Link></TableCell>
                      <TableCell><StatusBadge status={sourceJob.status} /></TableCell>
                      <TableCell>{document?.originalName ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{document?.contentHash ?? "-"}</TableCell>
                      <TableCell className="max-w-80 truncate font-mono text-xs">{document?.storageUri ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {!detail.sourceJobs.length ? (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No result source job has been created yet.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Discovered candidates</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role hint</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-mono"><Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.id}</Link></TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{candidate.normalizedAddress}</TableCell>
                    <TableCell>{candidate.chainCode}</TableCell>
                    <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                    <TableCell className="font-mono text-xs">{candidate.roleHint ?? "-"}</TableCell>
                    <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                  </TableRow>
                ))}
                {!detail.candidates.length ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No candidates have been staged from this job.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Complete with discovered candidates</CardTitle></CardHeader>
          <CardContent>
            <DiscoveryCompletionForm action={completeDiscoveryJobResultAction} jobId={job.id} />
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
