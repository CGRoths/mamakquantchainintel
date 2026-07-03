"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  approveCandidateAsSuggestedResultAction,
  createReviewBatchFromSelectionResultAction,
  reviewMarkCandidateConflictResultAction,
  reviewMarkCandidateMetricIneligibleResultAction,
  reviewMarkCandidateNeedsMoreEvidenceResultAction,
  reviewRejectCandidateResultAction,
  type BatchMutationState,
  type CandidateMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CandidateReviewAction = (previousState: CandidateMutationState, formData: FormData) => Promise<CandidateMutationState>;

type ReviewQuickActionFormProps = {
  action: CandidateReviewAction;
  candidateId: number;
  children: ReactNode;
  disabled?: boolean;
  reason?: string;
  returnTo?: string;
  variant?: "default" | "outline" | "ghost";
};

type ReviewBatchSelectionFormProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

const candidateInitialState: CandidateMutationState = null;
const batchInitialState: BatchMutationState = null;

export const reviewQuickActions = {
  approve: approveCandidateAsSuggestedResultAction,
  reject: reviewRejectCandidateResultAction,
  evidence: reviewMarkCandidateNeedsMoreEvidenceResultAction,
  conflict: reviewMarkCandidateConflictResultAction,
  metricOff: reviewMarkCandidateMetricIneligibleResultAction,
} as const;

export function ReviewQuickActionForm({
  action,
  candidateId,
  children,
  disabled = false,
  reason,
  returnTo,
  variant = "outline",
}: ReviewQuickActionFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, candidateInitialState);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="candidateId" value={candidateId} />
      {reason ? <input type="hidden" name="reason" value={reason} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <Button type="submit" size="sm" variant={variant} disabled={disabled || pending}>
        {pending ? "Saving..." : children}
      </Button>
      {state?.ok === false ? <p className="max-w-56 text-right text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

export function ReviewBatchSelectionForm({ children, className = "space-y-4", disabled = false }: ReviewBatchSelectionFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createReviewBatchFromSelectionResultAction, batchInitialState);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/mqchain/batches/${state.data.batchId}`);
    }
  }, [router, state]);

  return (
    <form action={formAction} className={className}>
      {state?.ok === false ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Batch creation failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Batch created</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={disabled || pending} className="space-y-4 disabled:opacity-60">
        {children}
      </fieldset>
    </form>
  );
}
