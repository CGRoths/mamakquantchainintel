"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { archiveSourceJobResultAction, recordSourceVerificationResultAction, type SourceJobMutationState } from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: SourceJobMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

export function ArchiveSourceJobForm({
  archiveStorageUri,
  disabled,
  sourceJobId,
}: {
  archiveStorageUri?: string | null;
  disabled?: boolean;
  sourceJobId: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(archiveSourceJobResultAction, initialState);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      {state?.ok === false ? (
        <Alert variant="destructive" className="md:col-span-full">
          <AlertCircle />
          <AlertTitle>Archive failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert className="md:col-span-full">
          <CheckCircle2 />
          <AlertTitle>Source job archived</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="sourceJobId" value={sourceJobId} />
      <div className="grid gap-2">
        <Label>Archive storage URI</Label>
        <Input name="archiveStorageUri" placeholder="s3://mqchain/sources/job-123" defaultValue={archiveStorageUri ?? ""} />
        <FieldError error={fieldError("archiveStorageUri")} />
      </div>
      <div className="grid gap-2">
        <Label>Reason</Label>
        <Textarea name="reason" rows={2} placeholder="Raw source reviewed and archived" />
        <FieldError error={fieldError("reason")} />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="outline" disabled={disabled || pending}>
          {pending ? "Archiving..." : "Mark archived"}
        </Button>
      </div>
      <FieldError error={fieldError("sourceJobId")} />
    </form>
  );
}

export function SourceVerificationForm({
  defaultSourceUrl,
  sourceJobId,
}: {
  defaultSourceUrl?: string | null;
  sourceJobId: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(recordSourceVerificationResultAction, initialState);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  return (
    <form action={formAction} className="grid gap-3 xl:grid-cols-6">
      {state?.ok === false ? (
        <Alert variant="destructive" className="xl:col-span-full">
          <AlertCircle />
          <AlertTitle>Verification failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert className="xl:col-span-full">
          <CheckCircle2 />
          <AlertTitle>Source verification recorded</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="sourceJobId" value={sourceJobId} />
      <div className="grid gap-2">
        <Label>Scope</Label>
        <select
          name="verificationScope"
          defaultValue="source_job"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="source_job">Source job</option>
          <option value="source_document">Source document</option>
          <option value="source_sheet">Source sheet</option>
          <option value="source_url">Source URL</option>
        </select>
        <FieldError error={fieldError("verificationScope")} />
      </div>
      <div className="grid gap-2">
        <Label>Trust</Label>
        <select
          name="sourceTrust"
          defaultValue="official"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="official">Official</option>
          <option value="verified_third_party">Verified third party</option>
          <option value="inferred">Inferred</option>
          <option value="weak">Weak</option>
          <option value="conflict">Conflict</option>
        </select>
        <FieldError error={fieldError("sourceTrust")} />
      </div>
      <div className="grid gap-2">
        <Label>Status</Label>
        <select
          name="status"
          defaultValue="verified"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="revoked">Revoked</option>
        </select>
        <FieldError error={fieldError("status")} />
      </div>
      <div className="grid gap-2">
        <Label>Document ID</Label>
        <Input name="sourceDocumentId" inputMode="numeric" placeholder="Optional" />
        <FieldError error={fieldError("sourceDocumentId")} />
      </div>
      <div className="grid gap-2">
        <Label>Candidate ID</Label>
        <Input name="candidateId" inputMode="numeric" placeholder="Optional" />
        <FieldError error={fieldError("candidateId")} />
      </div>
      <div className="grid gap-2">
        <Label>Sheet / tab</Label>
        <Input name="sourceSheet" placeholder="Optional" />
        <FieldError error={fieldError("sourceSheet")} />
      </div>
      <div className="grid gap-2 xl:col-span-3">
        <Label>Source URL</Label>
        <Input name="sourceUrl" placeholder="https://example.com/source" defaultValue={defaultSourceUrl ?? ""} />
        <FieldError error={fieldError("sourceUrl")} />
      </div>
      <div className="grid gap-2 xl:col-span-3">
        <Label>Notes</Label>
        <Input name="notes" placeholder="What was checked, by whom, and why this scope applies" />
        <FieldError error={fieldError("notes")} />
      </div>
      <div className="grid gap-2 xl:col-span-full">
        <Label>Verification evidence JSON</Label>
        <Textarea
          name="verificationEvidenceJson"
          rows={4}
          placeholder='{"checked_url":"https://example.com/source","method":"official page reviewed"}'
        />
        <FieldError error={fieldError("verificationEvidenceJson")} />
      </div>
      <div className="xl:col-span-full">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Recording..." : "Record verification"}
        </Button>
      </div>
    </form>
  );
}
