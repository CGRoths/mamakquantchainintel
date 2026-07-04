"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  approveBatchResultAction,
  commitBatchResultAction,
  createBatchResultAction,
  failBatchResultAction,
  supersedeBatchResultAction,
  type BatchMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isCandidateSourceVerificationSatisfied, type CandidateSourceVerificationStatus } from "@/lib/mqchain/candidate-detail";

type BatchAction = (previousState: BatchMutationState, formData: FormData) => Promise<BatchMutationState>;

type BatchCandidateOption = {
  id: number;
  normalizedAddress: string;
  chainCode: string | null;
  confidenceScore: number | null;
  qualityTier: number | null;
  evidenceCount: number | null;
  sourceVerificationStatus: CandidateSourceVerificationStatus | null;
  sourceVerificationMessage: string | null;
  entityName: string | null;
  roleCode: string | null;
  sourceType: string | null;
};

type BatchFormShellProps = {
  action: BatchAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  submitVariant?: "default" | "outline" | "destructive";
  className?: string;
  disabled?: boolean;
  navigateOnSuccess?: boolean;
};

const initialState: BatchMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function BatchFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  submitVariant = "outline",
  className = "grid gap-3",
  disabled = false,
  navigateOnSuccess = false,
}: BatchFormShellProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!state?.ok) {
      return;
    }

    if (navigateOnSuccess) {
      router.push(`/mqchain/batches/${state.data.batchId}`);
    } else {
      router.refresh();
    }
  }, [navigateOnSuccess, router, state]);

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
          <AlertTitle>Batch action saved</AlertTitle>
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

export function CreateBatchForm({ approvedCandidates }: { approvedCandidates: BatchCandidateOption[] }) {
  return (
    <BatchFormShell
      action={createBatchResultAction}
      failureTitle="Batch creation failed"
      pendingLabel="Creating..."
      submitLabel="Create"
      className="grid gap-4"
      navigateOnSuccess
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-2">
              <Label>Additional candidate IDs</Label>
              <Input name="candidateIds" placeholder="Optional: 1, 2, 3" />
              <FieldError error={fieldError("candidateIds")} />
            </div>
            <div className="grid gap-2">
              <Label>Batch name</Label>
              <Input name="sourceName" placeholder="Binance BTC reserve review" />
              <FieldError error={fieldError("sourceName")} />
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Select</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Source verification</TableHead>
                  <TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedCandidates.map((candidate) => {
                  const evidenceReady = (candidate.evidenceCount ?? 0) > 0;
                  const sourceReady = isCandidateSourceVerificationSatisfied(candidate.sourceVerificationStatus);
                  const isBatchReady = evidenceReady && sourceReady;

                  return (
                    <TableRow key={candidate.id}>
                      <TableCell>
                        <input
                          className="h-4 w-4 accent-primary disabled:opacity-40"
                          type="checkbox"
                          name="candidateId"
                          value={candidate.id}
                          defaultChecked={isBatchReady}
                          disabled={!isBatchReady}
                        />
                      </TableCell>
                      <TableCell className="font-mono">{candidate.id}</TableCell>
                      <TableCell className="max-w-96 truncate font-mono text-xs">
                        <a className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>{candidate.normalizedAddress}</a>
                        <span className="block text-muted-foreground">{candidate.chainCode ?? "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block">{candidate.entityName ?? "-"}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{candidate.roleCode ?? "-"}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="block">{candidate.sourceType ?? "-"}</span>
                        <span className={evidenceReady ? "font-mono text-muted-foreground" : "font-mono text-destructive"}>
                          {candidate.evidenceCount ?? 0} rows
                        </span>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        <span className={sourceReady ? "font-mono text-emerald-400" : "font-mono text-destructive"}>
                          {candidate.sourceVerificationStatus?.replace(/_/g, " ") ?? "source verification missing"}
                        </span>
                        <span className="block text-muted-foreground">{candidate.sourceVerificationMessage ?? "-"}</span>
                      </TableCell>
                      <TableCell className="font-mono">{candidate.confidenceScore ?? 0} / Q{candidate.qualityTier ?? 0}</TableCell>
                    </TableRow>
                  );
                })}
                {!approvedCandidates.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No approved candidates match the picker filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </BatchFormShell>
  );
}

export function BatchPrimaryActions({
  batchId,
  canApprove,
  canCommit,
}: {
  batchId: number;
  canApprove: boolean;
  canCommit: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <BatchFormShell
        action={approveBatchResultAction}
        failureTitle="Batch approval failed"
        pendingLabel="Approving..."
        submitLabel="Approve batch"
        className="grid gap-2"
        disabled={!canApprove}
      >
        {() => <input type="hidden" name="batchId" value={batchId} />}
      </BatchFormShell>
      <BatchFormShell
        action={commitBatchResultAction}
        failureTitle="Batch commit failed"
        pendingLabel="Committing..."
        submitLabel="Commit to registry"
        submitVariant="default"
        className="grid gap-2"
        disabled={!canCommit}
      >
        {() => <input type="hidden" name="batchId" value={batchId} />}
      </BatchFormShell>
    </div>
  );
}

export function BatchLifecycleForms({
  batchId,
  canFail,
  canSupersede,
}: {
  batchId: number;
  canFail: boolean;
  canSupersede: boolean;
}) {
  return (
    <div className="grid gap-4">
      <BatchFormShell
        action={failBatchResultAction}
        failureTitle="Batch failure update failed"
        pendingLabel="Saving..."
        submitLabel="Fail batch"
        submitVariant="destructive"
        className="grid gap-2"
        disabled={!canFail}
      >
        {({ fieldError }) => (
          <>
            <input type="hidden" name="batchId" value={batchId} />
            <Textarea name="reason" rows={3} placeholder="Failure reason" />
            <FieldError error={fieldError("reason")} />
          </>
        )}
      </BatchFormShell>
      <BatchFormShell
        action={supersedeBatchResultAction}
        failureTitle="Batch supersede update failed"
        pendingLabel="Saving..."
        submitLabel="Mark superseded"
        className="grid gap-2"
        disabled={!canSupersede}
      >
        {({ fieldError }) => (
          <>
            <input type="hidden" name="batchId" value={batchId} />
            <Textarea name="reason" rows={3} placeholder="Supersede reason" />
            <FieldError error={fieldError("reason")} />
          </>
        )}
      </BatchFormShell>
    </div>
  );
}
