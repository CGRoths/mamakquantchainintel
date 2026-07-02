"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  addCandidateEvidenceResultAction,
  approveCandidateResultAction,
  markCandidateConflictResultAction,
  markCandidateDuplicateResultAction,
  markCandidateHistoricalOnlyResultAction,
  markCandidateMetricIneligibleResultAction,
  markCandidateNeedsMoreEvidenceResultAction,
  markCandidateSupersedesRegistryResultAction,
  rejectCandidateResultAction,
  type CandidateMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FlagBadges } from "./flag-badges";

type CandidateAction = (previousState: CandidateMutationState, formData: FormData) => Promise<CandidateMutationState>;

type CandidateFormShellProps = {
  action: CandidateAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  submitVariant?: "default" | "outline" | "destructive";
  className?: string;
  disabled?: boolean;
};

type CandidateReviewFormsProps = {
  candidate: {
    id: number;
    suggestedEntityId: number | null;
    suggestedProtocolId: number | null;
    suggestedRoleId: number | null;
    confidenceScore: number;
    qualityTier: number;
    firstSeenBlock: number | null;
    lastSeenBlock: number | null;
  };
  dictionaries: {
    entities: Array<{ id: number; entityName: string }>;
    protocols: Array<{ id: number; protocolName: string }>;
    roles: Array<{ roleId: number; roleCode: string }>;
  };
  registryMatches: Array<{
    id: number;
    roleCode: string | null;
    confidenceScore: number;
  }>;
  defaultApprovalFlags: number;
  defaultMetricEligible: boolean;
};

const initialState: CandidateMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function CandidateFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  submitVariant = "outline",
  className = "grid gap-3",
  disabled = false,
}: CandidateFormShellProps) {
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
          <AlertTitle>Review action saved</AlertTitle>
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

export function CandidateReviewForms({
  candidate,
  dictionaries,
  registryMatches,
  defaultApprovalFlags,
  defaultMetricEligible,
}: CandidateReviewFormsProps) {
  return (
    <div className="grid gap-4">
      <Card className="rounded-lg">
        <CardHeader><CardTitle>Add evidence</CardTitle></CardHeader>
        <CardContent>
          <CandidateFormShell
            action={addCandidateEvidenceResultAction}
            failureTitle="Evidence attachment failed"
            pendingLabel="Attaching..."
            submitLabel="Attach evidence"
          >
            {({ fieldError }) => (
              <>
                <input type="hidden" name="candidateId" value={candidate.id} />
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
          </CandidateFormShell>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>Approve with edits</CardTitle></CardHeader>
        <CardContent>
          <CandidateFormShell
            action={approveCandidateResultAction}
            failureTitle="Approval failed"
            pendingLabel="Approving..."
            submitLabel="Approve candidate"
            submitVariant="default"
          >
            {({ fieldError }) => (
              <>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <div className="grid gap-2">
                  <Label>Entity</Label>
                  <select name="entityId" defaultValue={candidate.suggestedEntityId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                    <option value="">Select entity</option>
                    {dictionaries.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.entityName}</option>)}
                  </select>
                  <FieldError error={fieldError("entityId")} />
                </div>
                <div className="grid gap-2">
                  <Label>Protocol</Label>
                  <select name="protocolId" defaultValue={candidate.suggestedProtocolId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm">
                    <option value="">No protocol</option>
                    {dictionaries.protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.protocolName}</option>)}
                  </select>
                  <FieldError error={fieldError("protocolId")} />
                </div>
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <select name="roleId" defaultValue={candidate.suggestedRoleId ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm" required>
                    <option value="">Select role</option>
                    {dictionaries.roles.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleCode}</option>)}
                  </select>
                  <FieldError error={fieldError("roleId")} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Confidence</Label>
                    <Input name="confidenceScore" type="number" min="0" max="100" defaultValue={candidate.confidenceScore} />
                    <FieldError error={fieldError("confidenceScore")} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Quality</Label>
                    <Input name="qualityTier" type="number" min="0" max="5" defaultValue={candidate.qualityTier} />
                    <FieldError error={fieldError("qualityTier")} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Flags</Label>
                    <Input name="flags" type="number" min="0" defaultValue={defaultApprovalFlags} />
                    <FieldError error={fieldError("flags")} />
                  </div>
                </div>
                <FlagBadges flags={defaultApprovalFlags} />
                <div className="grid gap-2">
                  <Label>Metric eligibility</Label>
                  <select name="metricEligible" defaultValue={defaultMetricEligible ? "true" : "false"} className="h-10 rounded-md border bg-background px-3 text-sm">
                    <option value="true">Eligible for metric groups</option>
                    <option value="false">Not metric eligible</option>
                  </select>
                  <FieldError error={fieldError("metricEligible")} />
                </div>
                <input type="hidden" name="labelStatus" value="1" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input name="validFromBlock" placeholder="valid from block" />
                  <Input name="validToBlock" placeholder="valid to block" />
                  <Input name="firstSeenBlock" placeholder="first seen block" defaultValue={candidate.firstSeenBlock ?? ""} />
                  <Input name="lastSeenBlock" placeholder="last seen block" defaultValue={candidate.lastSeenBlock ?? ""} />
                </div>
                <FieldError error={fieldError("validFromBlock") ?? fieldError("validToBlock") ?? fieldError("firstSeenBlock") ?? fieldError("lastSeenBlock")} />
                <Textarea name="notes" placeholder="Approval notes" rows={3} />
                <FieldError error={fieldError("notes")} />
              </>
            )}
          </CandidateFormShell>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>Review actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <CandidateFormShell
              action={markCandidateNeedsMoreEvidenceResultAction}
              failureTitle="Needs-evidence update failed"
              pendingLabel="Saving..."
              submitLabel="Needs more evidence"
              className="grid gap-2"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Textarea name="reason" placeholder="Needs more evidence reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
            <CandidateFormShell
              action={markCandidateConflictResultAction}
              failureTitle="Conflict update failed"
              pendingLabel="Saving..."
              submitLabel="Mark conflict"
              className="grid gap-2"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Textarea name="reason" placeholder="Conflict reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
            <CandidateFormShell
              action={markCandidateDuplicateResultAction}
              failureTitle="Duplicate merge failed"
              pendingLabel="Saving..."
              submitLabel="Merge duplicate"
              className="grid gap-2"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Input name="duplicateOfCandidateId" type="number" min="1" placeholder="Duplicate of candidate ID" required />
                  <FieldError error={fieldError("duplicateOfCandidateId")} />
                  <Textarea name="reason" placeholder="Duplicate reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
            <CandidateFormShell
              action={markCandidateMetricIneligibleResultAction}
              failureTitle="Metric eligibility update failed"
              pendingLabel="Saving..."
              submitLabel="Mark metric ineligible"
              className="grid gap-2"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Textarea name="reason" placeholder="Metric-ineligible reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
            <CandidateFormShell
              action={markCandidateSupersedesRegistryResultAction}
              failureTitle="Supersession update failed"
              pendingLabel="Saving..."
              submitLabel="Supersede old label"
              className="grid gap-2 rounded-md border p-3"
              disabled={!registryMatches.length}
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Label>Supersede registry row</Label>
                  <select
                    name="supersedesRegistryId"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    required
                    disabled={!registryMatches.length}
                  >
                    <option value="">Select current registry match</option>
                    {registryMatches.map((match) => (
                      <option key={match.id} value={match.id}>
                        #{match.id} / {match.roleCode ?? "unknown role"} / confidence {match.confidenceScore}
                      </option>
                    ))}
                  </select>
                  <FieldError error={fieldError("supersedesRegistryId")} />
                  <Input name="validFromBlock" placeholder="new label valid from block" />
                  <FieldError error={fieldError("validFromBlock")} />
                  <Textarea name="reason" placeholder="Supersession reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
            <CandidateFormShell
              action={markCandidateHistoricalOnlyResultAction}
              failureTitle="Historical-only update failed"
              pendingLabel="Saving..."
              submitLabel="Mark historical only"
              className="grid gap-2 rounded-md border p-3"
            >
              {({ fieldError }) => (
                <>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <Label>Historical-only approval</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input name="validFromBlock" placeholder="valid from block" defaultValue={candidate.firstSeenBlock ?? ""} />
                    <Input name="validToBlock" placeholder="valid to block" defaultValue={candidate.lastSeenBlock ?? ""} />
                  </div>
                  <FieldError error={fieldError("validFromBlock") ?? fieldError("validToBlock")} />
                  <Textarea name="reason" placeholder="Historical-only reason" rows={2} />
                  <FieldError error={fieldError("reason")} />
                </>
              )}
            </CandidateFormShell>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>Reject</CardTitle></CardHeader>
        <CardContent>
          <CandidateFormShell
            action={rejectCandidateResultAction}
            failureTitle="Rejection failed"
            pendingLabel="Rejecting..."
            submitLabel="Reject candidate"
            submitVariant="destructive"
          >
            {({ fieldError }) => (
              <>
                <input type="hidden" name="candidateId" value={candidate.id} />
                <Textarea name="reason" placeholder="Reason" rows={3} required />
                <FieldError error={fieldError("reason")} />
              </>
            )}
          </CandidateFormShell>
        </CardContent>
      </Card>
    </div>
  );
}
