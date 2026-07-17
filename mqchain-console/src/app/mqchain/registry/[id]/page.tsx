import Link from "next/link";
import { notFound } from "next/navigation";

import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { RegistryDetailForms } from "@/components/mqchain/registry-detail-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { formatDiscoveryConfigTemplate } from "@/lib/mqchain/discovery-templates";
import { isHistoricalLabel } from "@/lib/mqchain/flags";
import { buildRegistryResolverHref, pickRegistryResolverBlock } from "@/lib/mqchain/registry-detail";
import { listDictionaries } from "@/lib/mqchain/origin-client/client";
import { getRegistryDetail } from "@/lib/mqchain/origin-client/client";

function registryTxGraphConfig(detail: Awaited<ReturnType<typeof getRegistryDetail>>) {
  if (!detail) return formatDiscoveryConfigTemplate("tx_graph_scanner");
  const config = JSON.parse(formatDiscoveryConfigTemplate("tx_graph_scanner")) as Record<string, unknown>;
  return JSON.stringify(
    {
      ...config,
      from_block: detail.registry.firstSeenBlock ?? 0,
      to_block: detail.registry.lastSeenBlock ?? "",
      known_entity_id: detail.registry.entityId ?? "",
      seed_registry_id: detail.registry.id,
      seed_role_id: detail.registry.roleId,
    },
    null,
    2,
  );
}

export default async function RegistryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [detail, dictionaries, currentUser] = await Promise.all([getRegistryDetail(Number(id)), listDictionaries(), getCurrentUser()]);
    if (!detail) {
      notFound();
    }
    const canEditRegistry = roleCan(currentUser?.role, "registry:edit");
    const canCreateDiscovery = roleCan(currentUser?.role, "discovery:create");
    const discoveryConfig = registryTxGraphConfig(detail);
    const isHistorical = isHistoricalLabel(detail.registry);
    const resolverHref = buildRegistryResolverHref({
      chainCode: detail.registry.chainCode,
      normalizedAddress: detail.registry.normalizedAddress,
      blockNumber: isHistorical ? pickRegistryResolverBlock(detail.registry) : null,
    });

    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Registry row {detail.registry.id}</h1>
            <p className="font-mono text-sm text-muted-foreground">{detail.registry.normalizedAddress}</p>
          </div>
          <StatusBadge status={isHistorical ? "historical" : detail.registry.isActive ? "approved" : "superseded"} />
        </div>
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Label</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Entity</span><div>{detail.entity?.entityName}</div></div>
              <div><span className="text-muted-foreground">Protocol</span><div>{detail.protocol?.protocolName ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Role</span><div>{detail.role?.roleCode}</div></div>
              <div><span className="text-muted-foreground">Category</span><div>{detail.category?.categoryCode}</div></div>
              <div><span className="text-muted-foreground">Confidence</span><div className="font-mono">{detail.registry.confidenceScore}</div></div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Flags</span><div className="mt-1"><FlagBadges flags={detail.registry.flags} /></div></div>
              <div><span className="text-muted-foreground">Valid from</span><div className="font-mono">{detail.registry.validFromBlock ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Valid to</span><div className="font-mono">{detail.registry.validToBlock ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Source batch</span><div className="font-mono">{detail.sourceBatch?.id ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Metric usage</span><div>{detail.registry.metricUsage ?? "-"}</div></div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Secondary roles</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {detail.secondaryRoles.map((role) => (
                    <span key={role.roleId} className="rounded-md border px-2 py-1 font-mono text-xs">{role.roleCode}</span>
                  ))}
                  {!detail.secondaryRoles.length ? <span>-</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Resolver preview</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Chain</span><div className="font-mono">{detail.resolverPreview.chainCode}</div></div>
              <div><span className="text-muted-foreground">Prefix</span><div className="font-mono">{detail.resolverPreview.prefixCode ?? "-"}</div></div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Payload</span><div className="truncate font-mono text-xs">{detail.resolverPreview.payloadHex ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Active label</span><div>{detail.resolverPreview.activeLabel ? "yes" : "no"}</div></div>
              <div><span className="text-muted-foreground">Timeline</span><div className="font-mono">{detail.resolverPreview.validFromBlock ?? "*"} - {detail.resolverPreview.validToBlock ?? "*"}</div></div>
              <div className="md:col-span-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={resolverHref}>Test in resolver</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Provenance</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Primary source job</span>
                <div className="font-mono">
                  {detail.primarySourceJob ? (
                    <Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${detail.primarySourceJob.id}`}>
                      {detail.primarySourceJob.id}
                    </Link>
                  ) : "-"}
                </div>
              </div>
              <div><span className="text-muted-foreground">Source type</span><div>{detail.primarySourceJob?.sourceType ?? detail.sourceBatch?.sourceType ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Source name</span><div>{detail.primarySourceJob?.sourceName ?? detail.sourceBatch?.sourceName ?? "-"}</div></div>
              <div className="break-all">
                <span className="text-muted-foreground">Source URL</span>
                <div>
                  {detail.primarySourceJob?.sourceUrl ?? detail.sourceBatch?.sourceUrl ? (
                    <a
                      className="text-primary hover:underline"
                      href={detail.primarySourceJob?.sourceUrl ?? detail.sourceBatch?.sourceUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {detail.primarySourceJob?.sourceUrl ?? detail.sourceBatch?.sourceUrl}
                    </a>
                  ) : "-"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Approved batch</span>
                <div className="font-mono">
                  {detail.sourceBatch ? (
                    <Link className="text-primary hover:underline" href={`/mqchain/batches/${detail.sourceBatch.id}`}>
                      {detail.sourceBatch.id}
                    </Link>
                  ) : "-"}
                </div>
              </div>
              <div><span className="text-muted-foreground">Batch status</span><div>{detail.sourceBatch?.status ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Batch hash</span><div className="truncate font-mono text-xs">{detail.sourceBatch?.batchHash ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Committed at</span><div className="font-mono text-xs">{detail.sourceBatch?.committedAt?.toISOString() ?? "-"}</div></div>
              <div>
                <span className="text-muted-foreground">Staged candidate</span>
                <div className="font-mono">
                  {detail.provenanceCandidateId ? (
                    <Link className="text-primary hover:underline" href={`/mqchain/candidates/${detail.provenanceCandidateId}`}>
                      {detail.provenanceCandidateId}
                    </Link>
                  ) : "-"}
                </div>
              </div>
              <div><span className="text-muted-foreground">Candidate status</span><div>{detail.provenanceCandidate?.candidateStatus ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Source document</span><div className="font-mono">{detail.primarySourceDocument?.id ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Document hash</span><div className="truncate font-mono text-xs">{detail.primarySourceDocument?.contentHash ?? "-"}</div></div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Metric groups</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Min confidence</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.metricGroupMatches.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="font-mono">{group.metricGroupCode}</TableCell>
                      <TableCell>{group.metricGroupName}</TableCell>
                      <TableCell className="font-mono">{group.minConfidence}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/mqchain/metric-groups?preview=${group.id}&registry=${detail.registry.id}`}>Preview membership</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!detail.metricGroupMatches.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        This row does not match an active metric group.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <RegistryDetailForms
            registry={detail.registry}
            dictionaries={dictionaries}
            secondaryRoles={detail.secondaryRoles}
            relatedRegistryRows={detail.relatedRegistryRows}
            discoveryConfig={discoveryConfig}
            isHistorical={isHistorical}
            canEditRegistry={canEditRegistry}
            canCreateDiscovery={canCreateDiscovery}
          />
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Trust</TableHead>
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
                      <TableCell>{evidence.summary ?? "-"}</TableCell>
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
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No evidence is linked to this registry row yet.
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
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.approvalEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.action.replace(/_/g, " ")}</TableCell>
                      <TableCell>{event.reason ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{event.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.approvalEvents.length ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No approval events are linked to this row yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Related candidates</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Source job</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.relatedCandidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-mono">
                        <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.id}</Link>
                      </TableCell>
                      <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore}</TableCell>
                      <TableCell className="font-mono">{candidate.sourceJobId ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.relatedCandidates.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No staged candidates share this chain/address.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Related discovery jobs</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Candidates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.relatedDiscoveryJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono">
                        <Link className="text-primary hover:underline" href={`/mqchain/discovery/jobs/${job.id}`}>{job.id}</Link>
                      </TableCell>
                      <TableCell>{job.discoveryType}</TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono">{job.candidatesCreated}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.relatedDiscoveryJobs.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No discovery jobs are linked to this label yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
