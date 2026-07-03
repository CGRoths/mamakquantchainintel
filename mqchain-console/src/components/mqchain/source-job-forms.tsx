"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { archiveSourceJobResultAction, type SourceJobMutationState } from "@/app/mqchain/actions";
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
