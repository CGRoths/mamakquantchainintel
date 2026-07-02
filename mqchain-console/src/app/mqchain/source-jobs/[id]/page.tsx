import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveSourceJobAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { DistributionRow } from "@/lib/mqchain/batch-detail";
import { getSourceJob } from "@/lib/mqchain/services/source-job-service";

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

export default async function SourceJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getSourceJob(Number(id));
    if (!detail) {
      notFound();
    }

    const summary = detail.sourceJob.metadata as Record<string, unknown>;
    const archived = detail.sourceJob.status === "archived";

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">{detail.sourceJob.sourceName ?? `Source job ${detail.sourceJob.id}`}</h1>
          <p className="text-sm text-muted-foreground">{detail.sourceJob.sourceType} / parser {detail.sourceJob.parserVersion}</p>
        </div>
        <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
          {[
            "totalRows",
            "validAddresses",
            "invalidAddresses",
            "duplicates",
            "candidatesCreated",
            "candidatesUpdated",
            "evidenceCreated",
            "conflictsFound",
          ].map((key) => (
            <Card key={key} className="rounded-lg">
              <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{key}</CardTitle></CardHeader>
              <CardContent className="font-mono text-2xl">{String(summary[key] ?? 0)}</CardContent>
            </Card>
          ))}
        </section>
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Source metadata</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-1">
              <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={detail.sourceJob.status} /></div></div>
              <div><span className="text-muted-foreground">Source URL</span><div className="truncate">{detail.sourceJob.sourceUrl ? <a className="text-primary hover:underline" href={detail.sourceJob.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceJob.sourceUrl}</a> : "-"}</div></div>
              <div><span className="text-muted-foreground">Entity hint</span><div>{detail.sourceJob.entityHint ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Protocol hint</span><div>{detail.sourceJob.protocolHint ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Local file</span><div className="truncate font-mono text-xs">{detail.sourceJob.localFileName ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Archive URI</span><div className="truncate font-mono text-xs">{detail.sourceJob.archiveStorageUri ?? "-"}</div></div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Candidate rollup</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-4 gap-3">
                <div><span className="text-muted-foreground">Total</span><div className="font-mono">{detail.candidateRollup.totalCandidates}</div></div>
                <div><span className="text-muted-foreground">Pending</span><div className="font-mono">{detail.candidateRollup.pendingCount}</div></div>
                <div><span className="text-muted-foreground">Approved</span><div className="font-mono">{detail.candidateRollup.approvedCount}</div></div>
                <div><span className="text-muted-foreground">Conflicts</span><div className="font-mono">{detail.candidateRollup.conflictCount}</div></div>
              </div>
              <DistributionTable rows={detail.candidateRollup.statusDistribution} emptyLabel="No candidates." />
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Evidence rollup</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div><span className="text-muted-foreground">Evidence rows</span><div className="font-mono">{detail.evidenceRollup.totalEvidence}</div></div>
              <DistributionTable rows={detail.evidenceRollup.typeDistribution} emptyLabel="No evidence." />
            </CardContent>
          </Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Archive source job</CardTitle></CardHeader>
          <CardContent>
            <form action={archiveSourceJobAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="sourceJobId" value={detail.sourceJob.id} />
              <div className="grid gap-2">
                <Label>Archive storage URI</Label>
                <Input name="archiveStorageUri" placeholder="s3://mqchain/sources/job-123" defaultValue={detail.sourceJob.archiveStorageUri ?? ""} />
              </div>
              <div className="grid gap-2">
                <Label>Reason</Label>
                <Textarea name="reason" rows={2} placeholder="Raw source reviewed and archived" />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="outline" disabled={archived}>Mark archived</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg"><CardHeader><CardTitle>Chains</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.candidateRollup.chainDistribution} emptyLabel="No chains." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Confidence</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.candidateRollup.confidenceDistribution} emptyLabel="No confidence data." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Trust tiers</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.evidenceRollup.trustDistribution} emptyLabel="No trust data." /></CardContent></Card>
        </section>
        {Array.isArray(summary.errors) && summary.errors.length ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Import errors</CardTitle></CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-4 text-xs">{summary.errors.join("\n")}</pre>
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-mono">{candidate.id}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">
                      <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.normalizedAddress}</Link>
                    </TableCell>
                    <TableCell>{candidate.chainCode}</TableCell>
                    <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                    <TableCell className="font-mono">{candidate.evidenceCount}</TableCell>
                    <TableCell className="font-mono">{candidate.confidenceScore} / Q{candidate.qualityTier}</TableCell>
                  </TableRow>
                ))}
                {!detail.candidates.length ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No candidates created for this source.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Archived documents</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>{document.documentType}</TableCell>
                    <TableCell>{document.originalName}</TableCell>
                    <TableCell className="font-mono text-xs">{document.contentHash}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{document.storageUri ?? "-"}</TableCell>
                    <TableCell className="font-mono">{document.sizeBytes ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {!detail.documents.length ? (
                  <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No archived documents.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Raw summary metadata</CardTitle></CardHeader>
          <CardContent><pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(summary, null, 2)}</pre></CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
