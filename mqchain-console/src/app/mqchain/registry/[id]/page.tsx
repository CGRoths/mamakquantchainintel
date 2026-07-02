import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addRegistryEvidenceAction,
  addRegistrySecondaryRoleAction,
  createRegistryDiscoveryJobAction,
  deactivateRegistryLabelAction,
  markRegistryHistoricalAction,
  supersedeRegistryLabelAction,
  updateRegistryLabelAction,
} from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDiscoveryConfigTemplate } from "@/lib/mqchain/discovery-templates";
import { FLAG_BITS, hasFlag } from "@/lib/mqchain/flags";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";
import { getRegistryDetail } from "@/lib/mqchain/services/registry-service";

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
    const [detail, dictionaries] = await Promise.all([getRegistryDetail(Number(id)), listDictionaries()]);
    if (!detail) {
      notFound();
    }
    const discoveryConfig = registryTxGraphConfig(detail);
    const isHistorical = hasFlag(detail.registry.flags, FLAG_BITS.historicalOnly);

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
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Edit label</CardTitle></CardHeader>
            <CardContent>
              <form action={updateRegistryLabelAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <div className="grid gap-2">
                  <Label>Entity</Label>
                  <select name="entityId" defaultValue={detail.registry.entityId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                    {dictionaries.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityName}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Protocol</Label>
                  <select name="protocolId" defaultValue={detail.registry.protocolId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                    <option value="">No protocol</option>
                    {dictionaries.protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.protocolName}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <select name="roleId" defaultValue={detail.registry.roleId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                    {dictionaries.roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2"><Label>Confidence</Label><Input name="confidenceScore" type="number" min="0" max="100" defaultValue={detail.registry.confidenceScore} /></div>
                  <div className="grid gap-2"><Label>Quality</Label><Input name="qualityTier" type="number" min="0" max="5" defaultValue={detail.registry.qualityTier} /></div>
                  <div className="grid gap-2"><Label>Flags</Label><Input name="flags" type="number" min="0" defaultValue={detail.registry.flags} /></div>
                </div>
                <FlagBadges flags={detail.registry.flags} />
                <input type="hidden" name="labelStatus" value={detail.registry.labelStatus} />
                <Input name="metricUsage" placeholder="metric usage" defaultValue={detail.registry.metricUsage ?? ""} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input name="validFromBlock" placeholder="valid from block" defaultValue={detail.registry.validFromBlock ?? ""} />
                  <Input name="validToBlock" placeholder="valid to block" defaultValue={detail.registry.validToBlock ?? ""} />
                  <Input name="firstSeenBlock" placeholder="first seen block" defaultValue={detail.registry.firstSeenBlock ?? ""} />
                  <Input name="lastSeenBlock" placeholder="last seen block" defaultValue={detail.registry.lastSeenBlock ?? ""} />
                </div>
                <Textarea name="notes" rows={3} defaultValue={detail.registry.notes ?? ""} />
                <Button type="submit">Save registry label</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Secondary roles</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Added by</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.secondaryRoles.map((role) => (
                    <TableRow key={role.roleId}>
                      <TableCell>
                        <div className="font-mono text-xs">{role.roleCode}</div>
                        <div className="text-xs text-muted-foreground">{role.roleName}</div>
                      </TableCell>
                      <TableCell>{role.reason ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{role.addedBy ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{role.addedAt}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.secondaryRoles.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No secondary roles are attached to this registry label.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <form action={addRegistrySecondaryRoleAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <select name="roleId" className="h-10 rounded-md border bg-background px-3 text-sm" required>
                    {dictionaries.roles
                      .filter((role) => role.roleId !== detail.registry.roleId && !detail.secondaryRoles.some((secondary) => secondary.roleId === role.roleId))
                      .map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                  </select>
                </div>
                <Textarea name="reason" rows={3} placeholder="Why this approved label also carries this role" />
                <Button type="submit" variant="outline">Add secondary role</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Supersede label</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Timeline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.relatedRegistryRows.map((row) => (
                    <TableRow key={row.registry.id}>
                      <TableCell className="font-mono">
                        <Link className="text-primary hover:underline" href={`/mqchain/registry/${row.registry.id}`}>{row.registry.id}</Link>
                      </TableCell>
                      <TableCell><StatusBadge status={row.registry.isActive ? "approved" : "superseded"} /></TableCell>
                      <TableCell className="font-mono text-xs">{row.roleCode ?? row.registry.roleId}</TableCell>
                      <TableCell>{row.entityName ?? "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.registry.validFromBlock ?? "*"} - {row.registry.validToBlock ?? "*"}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.relatedRegistryRows.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No sibling registry rows exist for this exact chain/address yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <form action={supersedeRegistryLabelAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <div className="grid gap-2">
                  <Label>Replacement registry row</Label>
                  <select name="replacementRegistryId" className="h-10 rounded-md border bg-background px-3 text-sm" required disabled={!detail.registry.isActive}>
                    {detail.relatedRegistryRows
                      .filter((row) => row.registry.isActive)
                      .map((row) => (
                        <option key={row.registry.id} value={row.registry.id}>
                          #{row.registry.id} {row.roleCode ?? `role ${row.registry.roleId}`} {row.entityName ? `- ${row.entityName}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
                <Input name="validToBlock" type="number" min="1" placeholder="valid to block (optional)" disabled={!detail.registry.isActive} />
                <Textarea name="reason" rows={3} placeholder="Reason this registry row is superseded" disabled={!detail.registry.isActive} />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={!detail.registry.isActive || !detail.relatedRegistryRows.some((row) => row.registry.isActive)}
                >
                  Supersede with replacement
                </Button>
              </form>
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
            <CardHeader><CardTitle>Add registry evidence</CardTitle></CardHeader>
            <CardContent>
              <form action={addRegistryEvidenceAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
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
                <Button type="submit" variant="outline">Attach registry evidence</Button>
              </form>
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
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Discovery loop</CardTitle></CardHeader>
            <CardContent>
              <form action={createRegistryDiscoveryJobAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <input type="hidden" name="discoveryType" value="tx_graph_scanner" />
                <div className="grid gap-2">
                  <Label>Seed</Label>
                  <Input value={`${detail.registry.chainCode}:${detail.registry.rawAddress || detail.registry.normalizedAddress}`} readOnly />
                </div>
                <div className="grid gap-2">
                  <Label>Scanner</Label>
                  <Input value="tx_graph_scanner" readOnly />
                </div>
                <div className="grid gap-2">
                  <Label>Config JSON</Label>
                  <Textarea name="configJson" rows={8} defaultValue={discoveryConfig} />
                </div>
                <Button type="submit">Create discovery job</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Deactivate label</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4">
              <form action={markRegistryHistoricalAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <Textarea name="reason" rows={3} placeholder="Reason for historical-only label" />
                <Button type="submit" variant="outline" disabled={!detail.registry.isActive || isHistorical}>Mark historical</Button>
              </form>
              <form action={deactivateRegistryLabelAction} className="grid gap-3">
                <input type="hidden" name="registryId" value={detail.registry.id} />
                <Textarea name="reason" rows={3} placeholder="Reason for deactivation" />
                <Button type="submit" variant="destructive" disabled={!detail.registry.isActive}>Deactivate</Button>
              </form>
              </div>
            </CardContent>
          </Card>
        </section>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
