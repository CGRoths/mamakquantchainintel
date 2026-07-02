import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addCandidateEvidenceAction,
  approveCandidateAction,
  markCandidateConflictAction,
  markCandidateDuplicateAction,
  markCandidateHistoricalOnlyAction,
  markCandidateMetricIneligibleAction,
  markCandidateNeedsMoreEvidenceAction,
  markCandidateSupersedesRegistryAction,
  rejectCandidateAction,
} from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCandidateTraceWarnings } from "@/lib/mqchain/candidate-detail";
import { FLAG_BITS, hasFlag } from "@/lib/mqchain/flags";
import { getCandidateDetail } from "@/lib/mqchain/services/candidate-service";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getCandidateDetail(Number(id));
    if (!detail) {
      notFound();
    }

    const { candidate, dictionaries } = detail;
    const selectedEntity = dictionaries.entities.find((entity) => entity.id === candidate.suggestedEntityId);
    const selectedProtocol = dictionaries.protocols.find((protocol) => protocol.id === candidate.suggestedProtocolId);
    const selectedRole = dictionaries.roles.find((role) => role.roleId === candidate.suggestedRoleId);
    const candidateMetadata = candidate.metadata ?? {};
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
                <div><span className="text-muted-foreground">Evidence count</span><div className="font-mono">{candidate.evidenceCount}</div></div>
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
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Add evidence</CardTitle></CardHeader>
              <CardContent>
                <form action={addCandidateEvidenceAction} className="grid gap-3">
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Evidence type</Label>
                      <Input name="evidenceType" placeholder="official_page" required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Trust tier</Label>
                      <select name="trustTier" defaultValue="weak" className="h-10 rounded-md border bg-background px-3 text-sm">
                        <option value="official">official</option>
                        <option value="verified_third_party">verified third party</option>
                        <option value="inferred">inferred</option>
                        <option value="weak">weak</option>
                        <option value="conflict">conflict</option>
                      </select>
                    </div>
                  </div>
                  <Input name="sourceUrl" placeholder="https://source.example/evidence" />
                  <Input name="confidenceDelta" type="number" min="-100" max="100" defaultValue="0" />
                  <Textarea name="summary" placeholder="Evidence summary" rows={2} required />
                  <Textarea name="payloadJson" placeholder='{"source_role_label":"cold wallet","block_height":123}' rows={5} />
                  <Button type="submit" variant="outline">Attach evidence</Button>
                </form>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Approve with edits</CardTitle></CardHeader>
              <CardContent>
                <form action={approveCandidateAction} className="grid gap-3">
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <div className="grid gap-2">
                    <Label>Entity</Label>
                    <select name="entityId" defaultValue={candidate.suggestedEntityId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                      <option value="">Select entity</option>
                      {dictionaries.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityName}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Protocol</Label>
                    <select name="protocolId" defaultValue={candidate.suggestedProtocolId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="">No protocol</option>
                      {dictionaries.protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.protocolName}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <select name="roleId" defaultValue={candidate.suggestedRoleId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                      <option value="">Select role</option>
                      {dictionaries.roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Confidence</Label>
                      <Input name="confidenceScore" type="number" min="0" max="100" defaultValue={candidate.confidenceScore} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Quality</Label>
                      <Input name="qualityTier" type="number" min="0" max="5" defaultValue={candidate.qualityTier} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Flags</Label>
                      <Input name="flags" type="number" min="0" defaultValue={defaultApprovalFlags} />
                    </div>
                  </div>
                  <FlagBadges flags={defaultApprovalFlags} />
                  <div className="grid gap-2">
                    <Label>Metric eligibility</Label>
                    <select name="metricEligible" defaultValue={defaultMetricEligible ? "true" : "false"} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="true">Eligible for metric groups</option>
                      <option value="false">Not metric eligible</option>
                    </select>
                  </div>
                  <input type="hidden" name="labelStatus" value="1" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input name="validFromBlock" placeholder="valid from block" />
                    <Input name="validToBlock" placeholder="valid to block" />
                    <Input name="firstSeenBlock" placeholder="first seen block" defaultValue={candidate.firstSeenBlock ?? ""} />
                    <Input name="lastSeenBlock" placeholder="last seen block" defaultValue={candidate.lastSeenBlock ?? ""} />
                  </div>
                  <Textarea name="notes" placeholder="Approval notes" rows={3} />
                  <Button type="submit">Approve candidate</Button>
                </form>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Review actions</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  <form action={markCandidateNeedsMoreEvidenceAction} className="grid gap-2">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Textarea name="reason" placeholder="Needs more evidence reason" rows={2} />
                    <Button type="submit" variant="outline">Needs more evidence</Button>
                  </form>
                  <form action={markCandidateConflictAction} className="grid gap-2">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Textarea name="reason" placeholder="Conflict reason" rows={2} />
                    <Button type="submit" variant="outline">Mark conflict</Button>
                  </form>
                  <form action={markCandidateDuplicateAction} className="grid gap-2">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Input name="duplicateOfCandidateId" type="number" min="1" placeholder="Duplicate of candidate ID" required />
                    <Textarea name="reason" placeholder="Duplicate reason" rows={2} />
                    <Button type="submit" variant="outline">Merge duplicate</Button>
                  </form>
                  <form action={markCandidateMetricIneligibleAction} className="grid gap-2">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Textarea name="reason" placeholder="Metric-ineligible reason" rows={2} />
                    <Button type="submit" variant="outline">Mark metric ineligible</Button>
                  </form>
                  <form action={markCandidateSupersedesRegistryAction} className="grid gap-2 rounded-md border p-3">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Label>Supersede registry row</Label>
                    <select
                      name="supersedesRegistryId"
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      required
                      disabled={!detail.registryMatches.length}
                    >
                      <option value="">Select current registry match</option>
                      {detail.registryMatches.map((match) => (
                        <option key={match.registry.id} value={match.registry.id}>
                          #{match.registry.id} / {match.role?.roleCode ?? "unknown role"} / confidence {match.registry.confidenceScore}
                        </option>
                      ))}
                    </select>
                    <Input name="validFromBlock" placeholder="new label valid from block" />
                    <Textarea name="reason" placeholder="Supersession reason" rows={2} />
                    <Button type="submit" variant="outline" disabled={!detail.registryMatches.length}>Supersede old label</Button>
                  </form>
                  <form action={markCandidateHistoricalOnlyAction} className="grid gap-2 rounded-md border p-3">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <Label>Historical-only approval</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input name="validFromBlock" placeholder="valid from block" defaultValue={candidate.firstSeenBlock ?? ""} />
                      <Input name="validToBlock" placeholder="valid to block" defaultValue={candidate.lastSeenBlock ?? ""} />
                    </div>
                    <Textarea name="reason" placeholder="Historical-only reason" rows={2} />
                    <Button type="submit" variant="outline">Mark historical only</Button>
                  </form>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-lg">
              <CardHeader><CardTitle>Reject</CardTitle></CardHeader>
              <CardContent>
                <form action={rejectCandidateAction} className="grid gap-3">
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Textarea name="reason" placeholder="Reason" rows={3} required />
                  <Button type="submit" variant="destructive">Reject candidate</Button>
                </form>
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
