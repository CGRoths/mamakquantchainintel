"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  addRegistryEvidenceResultAction,
  addRegistrySecondaryRoleResultAction,
  createRegistryDiscoveryJobResultAction,
  deactivateRegistryLabelResultAction,
  markRegistryHistoricalResultAction,
  supersedeRegistryLabelResultAction,
  updateRegistryLabelResultAction,
  type RegistryMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { QUALITY_TIER_MAX } from "@/lib/mqchain/constants";
import { FlagBadges } from "./flag-badges";
import { StatusBadge } from "./status-badge";

type RegistryAction = (previousState: RegistryMutationState, formData: FormData) => Promise<RegistryMutationState>;

type RegistryFormShellProps = {
  action: RegistryAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  submitVariant?: "default" | "outline" | "destructive";
  className?: string;
  disabled?: boolean;
};

type RegistryDetailFormsProps = {
  registry: {
    id: number;
    chainCode: string;
    rawAddress: string | null;
    normalizedAddress: string;
    entityId: number | null;
    protocolId: number | null;
    roleId: number | null;
    confidenceScore: number;
    qualityTier: number;
    labelStatus: number;
    flags: number;
    metricUsage: string | null;
    validFromBlock: number | null;
    validToBlock: number | null;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
    notes: string | null;
    isActive: boolean;
  };
  dictionaries: {
    entities: Array<{ id: number; entityName: string }>;
    protocols: Array<{ id: number; protocolName: string }>;
    roles: Array<{ roleId: number; roleCode: string }>;
  };
  secondaryRoles: Array<{
    roleId: number;
    roleCode: string;
    roleName?: string | null;
    reason?: string | null;
    addedBy?: string | null;
    addedAt?: string | null;
  }>;
  relatedRegistryRows: Array<{
    registry: {
      id: number;
      isActive: boolean;
      roleId: number | null;
      validFromBlock: number | null;
      validToBlock: number | null;
    };
    roleCode: string | null;
    entityName: string | null;
  }>;
  discoveryConfig: string;
  isHistorical: boolean;
  canEditRegistry: boolean;
  canCreateDiscovery: boolean;
};

const initialState: RegistryMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function RegistryFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  submitVariant = "outline",
  className = "grid gap-3",
  disabled = false,
}: RegistryFormShellProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  return (
    <form action={formAction} className={className}>
      {state?.ok === false ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{failureTitle}</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Registry action saved</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      {children({ fieldError })}
      <Button type="submit" variant={submitVariant} disabled={disabled || pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

export function RegistryDetailForms({
  registry,
  dictionaries,
  secondaryRoles,
  relatedRegistryRows,
  discoveryConfig,
  isHistorical,
  canEditRegistry,
  canCreateDiscovery,
}: RegistryDetailFormsProps) {
  const availableSecondaryRoles = dictionaries.roles.filter(
    (role) => role.roleId !== registry.roleId && !secondaryRoles.some((secondary) => secondary.roleId === role.roleId),
  );
  const activeSiblingRows = relatedRegistryRows.filter((row) => row.registry.isActive);
  const seedAddress = `${registry.chainCode}:${registry.rawAddress || registry.normalizedAddress}`;

  return (
    <>
      {canEditRegistry ? (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Edit label</CardTitle></CardHeader>
          <CardContent>
            <RegistryFormShell
              action={updateRegistryLabelResultAction}
              failureTitle="Registry label update failed"
              pendingLabel="Saving..."
              submitLabel="Save registry label"
              submitVariant="default"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="registryId" value={registry.id} />
                  <div className="grid gap-2">
                    <Label>Entity</Label>
                    <select name="entityId" defaultValue={registry.entityId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                      <option value="">Select entity</option>
                      {dictionaries.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityName}</option>)}
                    </select>
                    <FieldError error={fieldError("entityId")} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Protocol</Label>
                    <select name="protocolId" defaultValue={registry.protocolId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="">No protocol</option>
                      {dictionaries.protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.protocolName}</option>)}
                    </select>
                    <FieldError error={fieldError("protocolId")} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <select name="roleId" defaultValue={registry.roleId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                      <option value="">Select role</option>
                      {dictionaries.roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                    </select>
                    <FieldError error={fieldError("roleId")} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Confidence</Label>
                      <Input name="confidenceScore" type="number" min="0" max="100" defaultValue={registry.confidenceScore} />
                      <FieldError error={fieldError("confidenceScore")} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Quality</Label>
                      <Input name="qualityTier" type="number" min="0" max={QUALITY_TIER_MAX} defaultValue={registry.qualityTier} />
                      <FieldError error={fieldError("qualityTier")} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Flags</Label>
                      <Input name="flags" type="number" min="0" defaultValue={registry.flags} />
                      <FieldError error={fieldError("flags")} />
                    </div>
                  </div>
                  <FlagBadges flags={registry.flags} />
                  <input type="hidden" name="labelStatus" value={registry.labelStatus} />
                  <Input name="metricUsage" placeholder="metric usage" defaultValue={registry.metricUsage ?? ""} />
                  <FieldError error={fieldError("metricUsage")} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input name="validFromBlock" placeholder="valid from block" defaultValue={registry.validFromBlock ?? ""} />
                    <Input name="validToBlock" placeholder="valid to block" defaultValue={registry.validToBlock ?? ""} />
                    <Input name="firstSeenBlock" placeholder="first seen block" defaultValue={registry.firstSeenBlock ?? ""} />
                    <Input name="lastSeenBlock" placeholder="last seen block" defaultValue={registry.lastSeenBlock ?? ""} />
                  </div>
                  <FieldError error={fieldError("validFromBlock") ?? fieldError("validToBlock") ?? fieldError("firstSeenBlock") ?? fieldError("lastSeenBlock")} />
                  <Textarea name="notes" rows={3} defaultValue={registry.notes ?? ""} />
                  <FieldError error={fieldError("notes")} />
                </>
              )}
            </RegistryFormShell>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Registry controls</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Canonical registry edits, supersession, and deactivation are limited to operators with registry edit access.
          </CardContent>
        </Card>
      )}
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
              {secondaryRoles.map((role) => (
                <TableRow key={role.roleId}>
                  <TableCell>
                    <div className="font-mono text-xs">{role.roleCode}</div>
                    <div className="text-xs text-muted-foreground">{role.roleName}</div>
                  </TableCell>
                  <TableCell>{role.reason ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{role.addedBy ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{role.addedAt ?? "-"}</TableCell>
                </TableRow>
              ))}
              {!secondaryRoles.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No secondary roles are attached to this registry label.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {canEditRegistry ? (
            <RegistryFormShell
              action={addRegistrySecondaryRoleResultAction}
              failureTitle="Secondary role attachment failed"
              pendingLabel="Adding..."
              submitLabel="Add secondary role"
              disabled={!availableSecondaryRoles.length}
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="registryId" value={registry.id} />
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <select
                      name="roleId"
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      required
                      disabled={!availableSecondaryRoles.length}
                    >
                      <option value="">Select secondary role</option>
                      {availableSecondaryRoles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                    </select>
                    <FieldError error={fieldError("roleId")} />
                  </div>
                  <Textarea name="reason" rows={3} placeholder="Why this approved label also carries this role" />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </RegistryFormShell>
          ) : null}
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
              {relatedRegistryRows.map((row) => (
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
              {!relatedRegistryRows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No sibling registry rows exist for this exact chain/address yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {canEditRegistry ? (
            <RegistryFormShell
              action={supersedeRegistryLabelResultAction}
              failureTitle="Registry supersession failed"
              pendingLabel="Superseding..."
              submitLabel="Supersede with replacement"
              disabled={!registry.isActive || !activeSiblingRows.length}
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="registryId" value={registry.id} />
                  <div className="grid gap-2">
                    <Label>Replacement registry row</Label>
                    <select
                      name="replacementRegistryId"
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                      required
                      disabled={!registry.isActive || !activeSiblingRows.length}
                    >
                      <option value="">Select active replacement</option>
                      {activeSiblingRows.map((row) => (
                        <option key={row.registry.id} value={row.registry.id}>
                          #{row.registry.id} {row.roleCode ?? `role ${row.registry.roleId}`} {row.entityName ? `- ${row.entityName}` : ""}
                        </option>
                      ))}
                    </select>
                    <FieldError error={fieldError("replacementRegistryId")} />
                  </div>
                  <Input name="validToBlock" type="number" min="1" placeholder="valid to block (optional)" disabled={!registry.isActive} />
                  <FieldError error={fieldError("validToBlock")} />
                  <Textarea name="reason" rows={3} placeholder="Reason this registry row is superseded" disabled={!registry.isActive} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </RegistryFormShell>
          ) : null}
        </CardContent>
      </Card>
      {canEditRegistry ? (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Add registry evidence</CardTitle></CardHeader>
          <CardContent>
            <RegistryFormShell
              action={addRegistryEvidenceResultAction}
              failureTitle="Registry evidence attachment failed"
              pendingLabel="Attaching..."
              submitLabel="Attach registry evidence"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="registryId" value={registry.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Evidence type</Label>
                      <Input name="evidenceType" placeholder="official_page" required />
                      <FieldError error={fieldError("evidenceType")} />
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
                      <FieldError error={fieldError("trustTier")} />
                    </div>
                  </div>
                  <Input name="sourceUrl" placeholder="https://source.example/evidence" />
                  <FieldError error={fieldError("sourceUrl")} />
                  <Input name="confidenceDelta" type="number" min="-100" max="100" defaultValue="0" />
                  <FieldError error={fieldError("confidenceDelta")} />
                  <Textarea name="summary" placeholder="Evidence summary" rows={2} required />
                  <FieldError error={fieldError("summary")} />
                  <Textarea name="payloadJson" placeholder='{"source_role_label":"cold wallet","block_height":123}' rows={5} />
                  <FieldError error={fieldError("payloadJson")} />
                </>
              )}
            </RegistryFormShell>
          </CardContent>
        </Card>
      ) : null}
      {canCreateDiscovery ? (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Discovery loop</CardTitle></CardHeader>
          <CardContent>
            <RegistryFormShell
              action={createRegistryDiscoveryJobResultAction}
              failureTitle="Discovery job creation failed"
              pendingLabel="Creating..."
              submitLabel="Create discovery job"
              submitVariant="default"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="registryId" value={registry.id} />
                  <input type="hidden" name="discoveryType" value="tx_graph_scanner" />
                  <div className="grid gap-2">
                    <Label>Seed</Label>
                    <Input value={seedAddress} readOnly />
                  </div>
                  <div className="grid gap-2">
                    <Label>Scanner</Label>
                    <Input value="tx_graph_scanner" readOnly />
                  </div>
                  <div className="grid gap-2">
                    <Label>Config JSON</Label>
                    <Textarea name="configJson" rows={8} defaultValue={discoveryConfig} />
                    <FieldError error={fieldError("configJson")} />
                  </div>
                </>
              )}
            </RegistryFormShell>
          </CardContent>
        </Card>
      ) : null}
      {canEditRegistry ? (
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Deactivate label</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <RegistryFormShell
                action={markRegistryHistoricalResultAction}
                failureTitle="Historical marking failed"
                pendingLabel="Marking..."
                submitLabel="Mark historical"
                disabled={!registry.isActive || isHistorical}
              >
                {({ fieldError }) => (
                  <>
                    <input type="hidden" name="registryId" value={registry.id} />
                    <Textarea name="reason" rows={3} placeholder="Reason for historical-only label" />
                    <FieldError error={fieldError("reason")} />
                  </>
                )}
              </RegistryFormShell>
              <RegistryFormShell
                action={deactivateRegistryLabelResultAction}
                failureTitle="Registry deactivation failed"
                pendingLabel="Deactivating..."
                submitLabel="Deactivate"
                submitVariant="destructive"
                disabled={!registry.isActive}
              >
                {({ fieldError }) => (
                  <>
                    <input type="hidden" name="registryId" value={registry.id} />
                    <Textarea name="reason" rows={3} placeholder="Reason for deactivation" />
                    <FieldError error={fieldError("reason")} />
                  </>
                )}
              </RegistryFormShell>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
