import Link from "next/link";
import { notFound } from "next/navigation";

import { DbError } from "@/components/mqchain/db-error";
import { DeleteSourceJobDialog } from "@/components/mqchain/delete-source-job-dialog";
import { ArchiveSourceJobForm, SourceVerificationForm } from "@/components/mqchain/source-job-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import type { DistributionRow } from "@/lib/mqchain/batch-detail";
import { getSourceJob } from "@/lib/mqchain/origin-client/client";
import { buildSourceJobOperationalSummary } from "@/lib/mqchain/source-job";

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

function candidateAddressById(candidates: Array<{ id: number; normalizedAddress: string }>) {
  return new Map(candidates.map((candidate) => [candidate.id, candidate.normalizedAddress]));
}

function ChipList({ values, emptyLabel }: { values: string[]; emptyLabel: string }) {
  if (!values.length) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="rounded-md border px-2 py-1 font-mono text-xs">
          {value}
        </span>
      ))}
    </div>
  );
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

export default async function SourceJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [detail, currentUser] = await Promise.all([getSourceJob(Number(id)), getCurrentUser()]);
    if (!detail) {
      notFound();
    }

    const canArchive = roleCan(currentUser?.role, "intake:create");
    const canDelete = roleCan(currentUser?.role, "intake:delete");
    const canVerifySource = roleCan(currentUser?.role, "source:verify");
    const summary = detail.sourceJob.metadata as Record<string, unknown>;
    const operationalSummary = buildSourceJobOperationalSummary({
      status: detail.sourceJob.status,
      archiveStorageUri: detail.sourceJob.archiveStorageUri,
      chainScope: detail.sourceJob.chainScope,
      expectedRoles: detail.sourceJob.expectedRoles,
      metadata: summary,
    });
    const archived = operationalSummary.archived;
    const candidateAddresses = candidateAddressById(detail.candidates);

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">{detail.sourceJob.sourceName ?? `Source job ${detail.sourceJob.id}`}</h1>
          <p className="text-sm text-muted-foreground">{detail.sourceJob.sourceType} / parser {detail.sourceJob.parserVersion}</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Read-only provenance API</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/source-jobs/{detail.sourceJob.id}</code>
            <Button asChild variant="outline">
              <Link href={`/api/mqchain/source-jobs/${detail.sourceJob.id}`}>Open JSON</Link>
            </Button>
          </CardContent>
        </Card>
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
              <div className="md:col-span-2 xl:col-span-1">
                <span className="text-muted-foreground">Chain scope</span>
                <ChipList values={operationalSummary.chainScope} emptyLabel="No chain scope captured." />
              </div>
              <div className="md:col-span-2 xl:col-span-1">
                <span className="text-muted-foreground">Expected roles</span>
                <ChipList values={operationalSummary.expectedRoles} emptyLabel="No expected roles captured." />
              </div>
              <div><span className="text-muted-foreground">Local file</span><div className="truncate font-mono text-xs">{detail.sourceJob.localFileName ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Archive URI</span><div className="truncate font-mono text-xs">{operationalSummary.archiveStorageUri ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Archived by</span><div>{operationalSummary.archivedBy ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Archived at</span><div className="font-mono text-xs">{operationalSummary.archivedAt ?? "-"}</div></div>
              <div className="md:col-span-2 xl:col-span-1"><span className="text-muted-foreground">Archive reason</span><div>{operationalSummary.archiveReason ?? "-"}</div></div>
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
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Source verification</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div><span className="text-muted-foreground">Rows</span><div className="font-mono">{detail.verificationRollup.totalVerifications}</div></div>
                <div><span className="text-muted-foreground">Verified</span><div className="font-mono">{detail.verificationRollup.verifiedCount}</div></div>
                <div><span className="text-muted-foreground">Other</span><div className="font-mono">{detail.verificationRollup.nonVerifiedCount}</div></div>
              </div>
              <DistributionTable rows={detail.verificationRollup.trustDistribution} emptyLabel="No verification trust data." />
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Archive coverage</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div><span className="text-muted-foreground">Documents</span><div className="font-mono">{detail.documentRollup.totalDocuments}</div></div>
                <div><span className="text-muted-foreground">Stored</span><div className="font-mono">{detail.documentRollup.withStorageUri}</div></div>
                <div><span className="text-muted-foreground">Missing URI</span><div className="font-mono">{detail.documentRollup.missingStorageUri}</div></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><span className="text-muted-foreground">Has hash</span><div className="font-mono">{detail.documentRollup.withContentHash}</div></div>
                <div><span className="text-muted-foreground">Text snapshots</span><div className="font-mono">{detail.documentRollup.withExtractedText}</div></div>
                <div><span className="text-muted-foreground">Bytes</span><div className="font-mono">{formatBytes(detail.documentRollup.totalSizeBytes)}</div></div>
              </div>
              <DistributionTable rows={detail.documentRollup.typeDistribution} emptyLabel="No archived documents." />
            </CardContent>
          </Card>
          <Card className="rounded-lg xl:col-span-3">
            <CardHeader><CardTitle>Production handoff</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-5">
              <div><span className="text-muted-foreground">Batches</span><div className="font-mono">{detail.downstreamRollup.totalBatches}</div></div>
              <div><span className="text-muted-foreground">Committed</span><div className="font-mono">{detail.downstreamRollup.committedBatches}</div></div>
              <div><span className="text-muted-foreground">Registry rows</span><div className="font-mono">{detail.downstreamRollup.totalRegistryRows}</div></div>
              <div><span className="text-muted-foreground">Active labels</span><div className="font-mono">{detail.downstreamRollup.activeRegistryRows}</div></div>
              <div><span className="text-muted-foreground">Inactive labels</span><div className="font-mono">{detail.downstreamRollup.inactiveRegistryRows}</div></div>
            </CardContent>
          </Card>
        </section>
        {canArchive ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Archive source job</CardTitle></CardHeader>
            <CardContent>
              <ArchiveSourceJobForm
                archiveStorageUri={detail.sourceJob.archiveStorageUri}
                disabled={archived}
                sourceJobId={detail.sourceJob.id}
              />
            </CardContent>
          </Card>
        ) : null}
        {canDelete ? (
          <Card className="border-destructive/50 rounded-lg">
            <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">Permanently remove this source job only when no approved, committed, registry, or KV dependency exists.</p>
              <DeleteSourceJobDialog sourceJobId={detail.sourceJob.id} sourceName={detail.sourceJob.sourceName} />
            </CardContent>
          </Card>
        ) : null}
        {canVerifySource ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Record source verification</CardTitle></CardHeader>
            <CardContent>
              <SourceVerificationForm defaultSourceUrl={detail.sourceJob.sourceUrl} sourceJobId={detail.sourceJob.id} />
            </CardContent>
          </Card>
        ) : null}
        <section className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg"><CardHeader><CardTitle>Chains</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.candidateRollup.chainDistribution} emptyLabel="No chains." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Confidence</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.candidateRollup.confidenceDistribution} emptyLabel="No confidence data." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Trust tiers</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.evidenceRollup.trustDistribution} emptyLabel="No trust data." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Verification scopes</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.verificationRollup.scopeDistribution} emptyLabel="No source verifications." /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Verification status</CardTitle></CardHeader><CardContent><DistributionTable rows={detail.verificationRollup.statusDistribution} emptyLabel="No source verifications." /></CardContent></Card>
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
            <CardTitle>Source verification ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Verifier</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Evidence keys</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.verifications.map((row) => {
                  const verification = row.verification;
                  return (
                    <TableRow key={verification.id}>
                      <TableCell className="font-mono">{verification.id}</TableCell>
                      <TableCell>{verification.verificationScope}</TableCell>
                      <TableCell>{verification.sourceTrust}</TableCell>
                      <TableCell><StatusBadge status={verification.status} /></TableCell>
                      <TableCell className="font-mono text-xs">
                        {[
                          verification.sourceDocumentId ? `document:${verification.sourceDocumentId}` : null,
                          verification.candidateId ? `candidate:${verification.candidateId}` : null,
                          verification.sourceSheet ? `sheet:${verification.sourceSheet}` : null,
                          verification.sourceUrl ? `url:${verification.sourceUrl}` : null,
                        ].filter(Boolean).join(" / ") || `source_job:${detail.sourceJob.id}`}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs">{row.verifierName || row.verifierEmail || verification.verifiedBy || "system"}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs">{verification.notes ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{Object.keys(verification.verificationEvidence).sort().join(", ") || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{verification.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  );
                })}
                {!detail.verifications.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      No source verification records have been created for this source job yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
            <CardTitle>Evidence ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Delta</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.evidence.map((evidence) => (
                  <TableRow key={evidence.id}>
                    <TableCell className="font-mono">{evidence.id}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs">
                      {evidence.candidateId ? (
                        <Link className="text-primary hover:underline" href={`/mqchain/candidates/${evidence.candidateId}`}>
                          #{evidence.candidateId} {candidateAddresses.get(evidence.candidateId) ?? ""}
                        </Link>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{evidence.evidenceType}</TableCell>
                    <TableCell>{evidence.trustTier}</TableCell>
                    <TableCell className="font-mono">{evidence.confidenceDelta}</TableCell>
                    <TableCell className="max-w-96">{evidence.summary ?? "-"}</TableCell>
                    <TableCell className="max-w-64 break-all text-xs">
                      {evidence.sourceUrl ? (
                        <a className="text-primary hover:underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                          {evidence.sourceUrl}
                        </a>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{evidence.evidenceHash ?? "-"}</TableCell>
                    <TableCell>
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">JSON</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(evidence.payload, null, 2)}</pre>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
                {!detail.evidence.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-sm text-muted-foreground">
                      No evidence rows are linked to candidates from this source.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Downstream label batches</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Conflicts</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Committed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.downstreamBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-mono">
                      <Link className="text-primary hover:underline" href={`/mqchain/batches/${batch.id}`}>{batch.id}</Link>
                    </TableCell>
                    <TableCell><StatusBadge status={batch.status} /></TableCell>
                    <TableCell className="font-mono">{batch.acceptedCount}</TableCell>
                    <TableCell className="font-mono">{batch.conflictCount}</TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs">{batch.batchHash ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{batch.committedAt?.toISOString() ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {!detail.downstreamBatches.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No label batches have been created from this source job yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Registry labels from this source</CardTitle>
          </CardHeader>
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
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.downstreamRegistryRows.map(({ registry, entityName, protocolName, roleCode }) => (
                  <TableRow key={registry.id}>
                    <TableCell className="font-mono">
                      <Link className="text-primary hover:underline" href={`/mqchain/registry/${registry.id}`}>{registry.id}</Link>
                    </TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{registry.normalizedAddress}</TableCell>
                    <TableCell>{entityName ?? "-"}</TableCell>
                    <TableCell>{protocolName ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{roleCode ?? registry.roleId}</TableCell>
                    <TableCell className="font-mono">{registry.confidenceScore} / Q{registry.qualityTier}</TableCell>
                    <TableCell className="font-mono">
                      {registry.approvedBatchId ? (
                        <Link className="text-primary hover:underline" href={`/mqchain/batches/${registry.approvedBatchId}`}>
                          {registry.approvedBatchId}
                        </Link>
                      ) : "-"}
                    </TableCell>
                    <TableCell><StatusBadge status={registry.isActive ? "approved" : "superseded"} /></TableCell>
                  </TableRow>
                ))}
                {!detail.downstreamRegistryRows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      No approved registry labels point back to this source job yet.
                    </TableCell>
                  </TableRow>
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
                  <TableHead>Extracted text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>{document.documentType}</TableCell>
                    <TableCell>{document.originalName}</TableCell>
                    <TableCell className="font-mono text-xs">{document.contentHash}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{document.storageUri ?? "-"}</TableCell>
                    <TableCell className="font-mono">{document.sizeBytes ? formatBytes(document.sizeBytes) : "-"}</TableCell>
                    <TableCell className="font-mono">{document.extractedText ? `${document.extractedText.length} chars` : "-"}</TableCell>
                  </TableRow>
                ))}
                {!detail.documents.length ? (
                  <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No archived documents.</TableCell></TableRow>
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
