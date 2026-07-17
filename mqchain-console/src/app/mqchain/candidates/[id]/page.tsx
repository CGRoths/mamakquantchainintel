import Link from "next/link";
import { notFound } from "next/navigation";

import { CandidateReviewForms } from "@/components/mqchain/candidate-review-forms";
import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { buildCandidateSourceVerificationContext, buildCandidateTraceWarnings } from "@/lib/mqchain/candidate-detail";
import { FLAG_BITS, hasFlag } from "@/lib/mqchain/flags";
import { buildEditedApprovalReadiness, buildReviewReadiness, REVIEW_READINESS_BLOCKER_LABELS } from "@/lib/mqchain/review";
import { getCandidateDetail } from "@/lib/mqchain/origin-client/client";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [detail, currentUser] = await Promise.all([getCandidateDetail(Number(id)), getCurrentUser()]);
    if (!detail) {
      notFound();
    }

    const { candidate, dictionaries } = detail;
    const selectedEntity = dictionaries.entities.find((entity) => entity.id === candidate.suggestedEntityId);
    const selectedProtocol = dictionaries.protocols.find((protocol) => protocol.id === candidate.suggestedProtocolId);
    const selectedRole = dictionaries.roles.find((role) => role.roleId === candidate.suggestedRoleId);
    const candidateMetadata = candidate.metadata ?? {};
    const attachedEvidenceCount = detail.evidence.length;
    const reviewReason = typeof candidateMetadata.reviewReason === "string" ? candidateMetadata.reviewReason : null;
    const duplicateReason = typeof candidateMetadata.duplicateReason === "string" ? candidateMetadata.duplicateReason : null;
    const approvalDraft = candidateMetadata.approvalDraft && typeof candidateMetadata.approvalDraft === "object" && !Array.isArray(candidateMetadata.approvalDraft)
      ? candidateMetadata.approvalDraft as Record<string, unknown>
      : {};
    const approvalDraftFlags = typeof approvalDraft.flags === "number" ? approvalDraft.flags : null;
    const defaultApprovalFlags = approvalDraftFlags ?? selectedRole?.defaultFlags ?? 0;
    const defaultMetricEligible =
      typeof approvalDraft.metricEligible === "boolean"
        ? approvalDraft.metricEligible
        : hasFlag(defaultApprovalFlags, FLAG_BITS.metricEligible);
    const traceWarnings = buildCandidateTraceWarnings({
      candidateStatus: candidate.candidateStatus,
      duplicateOfCandidateId: candidate.duplicateOfCandidateId,
      duplicateCandidateCount: detail.duplicateCandidates.length,
      registryMatchCount: detail.registryMatches.length,
    });
    const sourceVerificationContext = buildCandidateSourceVerificationContext({
      candidate: {
        id: candidate.id,
        sourceJobId: candidate.sourceJobId,
        sourceDocumentId: candidate.sourceDocumentId,
        metadata: candidateMetadata,
      },
      verifications: detail.sourceVerifications.map((row) => row.verification),
    });
    const reviewReadiness = buildReviewReadiness({
      chainCode: candidate.chainCode,
      normalizedAddress: candidate.normalizedAddress,
      suggestedEntityId: candidate.suggestedEntityId,
      suggestedRoleId: candidate.suggestedRoleId,
      evidenceCount: attachedEvidenceCount,
      sourceVerificationStatus: sourceVerificationContext.status,
    });
    const editedApprovalReadiness = buildEditedApprovalReadiness(reviewReadiness.blockers);

    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Candidate {candidate.id}</h1>
            <p className="font-mono text-sm text-muted-foreground">{candidate.normalizedAddress}</p>
          </div>
          <StatusBadge status={candidate.candidateStatus} />
        </div>
        <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <div className="grid gap-4">
            {traceWarnings.length ? (
              <Card className="rounded-lg">
                <CardHeader><CardTitle>Trace warnings</CardTitle></CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm">
                    {traceWarnings.map((warning) => (
                      <li
                        key={warning.message}
                        className={warning.tone === "warning" ? "rounded-md border border-destructive/30 bg-destructive/5 p-3" : "rounded-md border bg-muted/40 p-3 text-muted-foreground"}
                      >
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Address profile</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                <div><span className="text-muted-foreground">Raw</span><div className="font-mono break-all">{candidate.rawAddress}</div></div>
                <div><span className="text-muted-foreground">Normalized</span><div className="font-mono break-all">{candidate.normalizedAddress}</div></div>
                <div><span className="text-muted-foreground">Chain</span><div>{candidate.chainCode}</div></div>
                <div><span className="text-muted-foreground">Family</span><div>{candidate.addressFamily}</div></div>
                <div><span className="text-muted-foreground">Prefix</span><div className="font-mono">{candidate.prefixCode}</div></div>
                <div><span className="text-muted-foreground">Payload</span><div className="font-mono break-all">{candidate.payloadHex}</div></div>
                <div><span className="text-muted-foreground">Confidence</span><div className="font-mono">{candidate.confidenceScore}</div></div>
                <div><span className="text-muted-foreground">Quality tier</span><div className="font-mono">{candidate.qualityTier}</div></div>
                <div><span className="text-muted-foreground">Evidence count</span><div className="font-mono">{attachedEvidenceCount}</div></div>
                <div><span className="text-muted-foreground">Discovered by</span><div>{candidate.discoveredBy}</div></div>
                <div><span className="text-muted-foreground">Suggested entity</span><div>{selectedEntity?.entityName ?? candidate.entityHint ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Suggested protocol</span><div>{selectedProtocol?.protocolName ?? candidate.protocolHint ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Suggested role</span><div>{selectedRole?.roleCode ?? candidate.roleHint ?? "-"}</div></div>
                <div className="md:col-span-2"><span className="text-muted-foreground">Approval flags</span><div className="mt-1"><FlagBadges flags={defaultApprovalFlags} /></div></div>
                <div><span className="text-muted-foreground">First seen</span><div className="font-mono">{candidate.firstSeenBlock ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Last seen</span><div className="font-mono">{candidate.lastSeenBlock ?? "-"}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Source context</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Source job</span>
                  <div className="font-mono">
                    {detail.sourceJob ? (
                      <Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${detail.sourceJob.id}`}>{detail.sourceJob.id}</Link>
                    ) : "-"}
                  </div>
                </div>
                <div><span className="text-muted-foreground">Source status</span><div>{detail.sourceJob ? <StatusBadge status={detail.sourceJob.status} /> : "-"}</div></div>
                <div><span className="text-muted-foreground">Source name</span><div>{detail.sourceJob?.sourceName ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Source type</span><div>{detail.sourceJob?.sourceType ?? "-"}</div></div>
                <div>
                  <span className="text-muted-foreground">Source URL</span>
                  <div className="break-all">
                    {detail.sourceJob?.sourceUrl ? (
                      <a className="text-primary hover:underline" href={detail.sourceJob.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceJob.sourceUrl}</a>
                    ) : "-"}
                  </div>
                </div>
                <div><span className="text-muted-foreground">Parser</span><div className="font-mono">{detail.sourceJob?.parserVersion ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Source document</span><div className="font-mono">{detail.sourceDocument?.id ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Document type</span><div>{detail.sourceDocument?.documentType ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Original name</span><div>{detail.sourceDocument?.originalName ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Content hash</span><div className="break-all font-mono text-xs">{detail.sourceDocument?.contentHash ?? "-"}</div></div>
                <div>
                  <span className="text-muted-foreground">Discovery job</span>
                  <div className="font-mono">
                    {detail.discoveryJob ? (
                      <Link className="text-primary hover:underline" href={`/mqchain/discovery/jobs/${detail.discoveryJob.id}`}>{detail.discoveryJob.id}</Link>
                    ) : "-"}
                  </div>
                </div>
                <div><span className="text-muted-foreground">Discovery type</span><div>{detail.discoveryJob?.discoveryType ?? "-"}</div></div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Source verification context</CardTitle></CardHeader>
              <CardContent className="grid gap-4 text-sm">
                <div className="grid gap-3 md:grid-cols-4">
                  <div><span className="text-muted-foreground">Status</span><div><StatusBadge status={sourceVerificationContext.status} /></div></div>
                  <div><span className="text-muted-foreground">Matches</span><div className="font-mono">{sourceVerificationContext.matchingVerifiedCount}</div></div>
                  <div><span className="text-muted-foreground">Sheet scope</span><div>{sourceVerificationContext.sheetVerificationRequired ? "required" : "not detected"}</div></div>
                  <div><span className="text-muted-foreground">Sheets</span><div className="font-mono text-xs">{sourceVerificationContext.sheetNames.join(", ") || "-"}</div></div>
                </div>
                <div className={sourceVerificationContext.status.includes("missing") ? "rounded-md border border-destructive/30 bg-destructive/5 p-3" : "rounded-md border bg-muted/40 p-3"}>
                  {sourceVerificationContext.message}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Trust</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Verifier</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.sourceVerifications.map((row) => {
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
                            ].filter(Boolean).join(" / ") || `source_job:${candidate.sourceJobId ?? "-"}`}
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-xs">{row.verifierName || row.verifierEmail || verification.verifiedBy || "system"}</TableCell>
                          <TableCell className="font-mono text-xs">{verification.createdAt.toISOString()}</TableCell>
                        </TableRow>
                      );
                    })}
                    {!detail.sourceVerifications.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No source verification records are linked to this candidate context yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Current registry matches</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.registryMatches.map((match) => (
                      <TableRow key={match.registry.id}>
                        <TableCell className="font-mono">
                          <Link className="text-primary hover:underline" href={`/mqchain/registry/${match.registry.id}`}>{match.registry.id}</Link>
                        </TableCell>
                        <TableCell><StatusBadge status={match.registry.isActive ? "approved" : "superseded"} /></TableCell>
                        <TableCell>{match.entity?.entityName ?? "-"}</TableCell>
                        <TableCell>{match.protocol?.protocolName ?? "-"}</TableCell>
                        <TableCell>{match.role?.roleCode ?? "-"}</TableCell>
                        <TableCell className="font-mono">{match.registry.confidenceScore}</TableCell>
                        <TableCell className="min-w-48"><FlagBadges flags={match.registry.flags} showValue={false} showEmpty={false} compact /></TableCell>
                      </TableRow>
                    ))}
                    {!detail.registryMatches.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No registry row currently matches this chain/address.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell>{evidence.evidenceType}</TableCell>
                        <TableCell>{evidence.trustTier}</TableCell>
                        <TableCell className="font-mono">{evidence.confidenceDelta}</TableCell>
                        <TableCell>{evidence.summary}</TableCell>
                        <TableCell className="max-w-56 break-all text-xs">
                          {evidence.sourceUrl ? (
                            <a className="text-primary hover:underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.sourceUrl}</a>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{evidence.evidenceHash}</TableCell>
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
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No evidence is linked to this candidate yet.
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
                      <TableHead>Reason</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Registry</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.approvalEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{event.action.replace(/_/g, " ")}</TableCell>
                        <TableCell>{event.reason ?? "-"}</TableCell>
                        <TableCell className="font-mono">{event.batchId ?? "-"}</TableCell>
                        <TableCell className="font-mono">
                          {event.registryId ? (
                            <Link className="text-primary hover:underline" href={`/mqchain/registry/${event.registryId}`}>{event.registryId}</Link>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{event.createdAt.toISOString()}</TableCell>
                      </TableRow>
                    ))}
                    {!detail.approvalEvents.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No approval events are linked to this candidate yet.
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
              <CardHeader><CardTitle>Duplicate and conflict context</CardTitle></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div><span className="text-muted-foreground">Review reason</span><div>{reviewReason ?? "-"}</div></div>
                <div><span className="text-muted-foreground">Duplicate reason</span><div>{duplicateReason ?? "-"}</div></div>
                <div>
                  <span className="text-muted-foreground">Duplicate of</span>
                  <div className="font-mono">
                    {detail.duplicateOfCandidate ? (
                      <Link className="text-primary hover:underline" href={`/mqchain/candidates/${detail.duplicateOfCandidate.id}`}>
                        {detail.duplicateOfCandidate.id}
                      </Link>
                    ) : candidate.duplicateOfCandidateId ?? "-"}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Duplicates pointing here</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {detail.duplicateCandidates.map((duplicate) => (
                      <Link key={duplicate.id} className="rounded-md border px-2 py-1 font-mono text-xs text-primary hover:underline" href={`/mqchain/candidates/${duplicate.id}`}>
                        {duplicate.id}
                      </Link>
                    ))}
                    {!detail.duplicateCandidates.length ? <span>-</span> : null}
                  </div>
                </div>
              </CardContent>
            </Card>
            <CandidateReviewForms
              canAddEvidence={roleCan(currentUser?.role, "candidate:evidence")}
              canReview={roleCan(currentUser?.role, "candidate:review")}
              candidate={{
                id: candidate.id,
                suggestedEntityId: candidate.suggestedEntityId,
                suggestedProtocolId: candidate.suggestedProtocolId,
                suggestedRoleId: candidate.suggestedRoleId,
                confidenceScore: candidate.confidenceScore,
                qualityTier: candidate.qualityTier,
                firstSeenBlock: candidate.firstSeenBlock,
                lastSeenBlock: candidate.lastSeenBlock,
              }}
              dictionaries={{
                entities: dictionaries.entities.map((entity) => ({ id: entity.id, entityName: entity.entityName })),
                protocols: dictionaries.protocols.map((protocol) => ({ id: protocol.id, protocolName: protocol.protocolName })),
                roles: dictionaries.roles.map((role) => ({ roleId: role.roleId, roleCode: role.roleCode })),
              }}
              registryMatches={detail.registryMatches.map((match) => ({
                id: match.registry.id,
                roleCode: match.role?.roleCode ?? null,
                confidenceScore: match.registry.confidenceScore,
              }))}
              defaultApprovalFlags={defaultApprovalFlags}
              defaultMetricEligible={defaultMetricEligible}
              approvalReadiness={{
                canApproveWithEdits: editedApprovalReadiness.canApproveWithEdits,
                blockers: reviewReadiness.blockers.map((blocker) => ({
                  code: blocker,
                  label: REVIEW_READINESS_BLOCKER_LABELS[blocker],
                  hard: editedApprovalReadiness.hardBlockers.includes(blocker),
                })),
              }}
            />
          </div>
        </section>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
