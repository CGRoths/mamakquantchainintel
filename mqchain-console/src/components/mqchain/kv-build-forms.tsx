"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  activateKvBuildManifestResultAction,
  createKvBuildManifestResultAction,
  type KvBuildMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type KvBuildAction = (previousState: KvBuildMutationState, formData: FormData) => Promise<KvBuildMutationState>;

type KvBuildFormShellProps = {
  action: KvBuildAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  successTitle: string;
  className?: string;
  disabled?: boolean;
  navigateOnSuccess?: boolean;
};

const initialState: KvBuildMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function KvBuildFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  successTitle,
  className = "grid gap-3",
  disabled = false,
  navigateOnSuccess = false,
}: KvBuildFormShellProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!state?.ok) {
      return;
    }

    if (navigateOnSuccess) {
      router.push(`/mqchain/kv-builds/${state.data.buildId}`);
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
          <AlertTitle>{successTitle}</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      {children({ fieldError })}
      <Button type="submit" className="w-fit" disabled={disabled || pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

export function CreateKvBuildManifestForm() {
  return (
    <KvBuildFormShell
      action={createKvBuildManifestResultAction}
      failureTitle="KV manifest registration failed"
      pendingLabel="Creating..."
      submitLabel="Create manifest"
      successTitle="KV manifest registered"
      navigateOnSuccess
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Build hash</Label>
              <Input name="buildHash" placeholder="optional sha256" />
              <FieldError error={fieldError("buildHash")} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <select name="status" defaultValue="compiled" className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                <option value="compiled">compiled</option>
                <option value="pending">pending</option>
                <option value="failed">failed</option>
              </select>
              <FieldError error={fieldError("status")} />
            </div>
            <div className="grid gap-2">
              <Label>Rows</Label>
              <Input name="rowCount" type="number" min="0" defaultValue="0" />
              <FieldError error={fieldError("rowCount")} />
            </div>
            <div className="grid gap-2">
              <Label>Dictionary version</Label>
              <Input name="dictionaryVersion" placeholder="version hash" />
              <FieldError error={fieldError("dictionaryVersion")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Storage URI</Label>
            <Input name="storageUri" placeholder="s3://bucket/mqchain-kv/buildHash or D:/mqchain-artifacts/kv/buildHash" />
            <FieldError error={fieldError("storageUri")} />
          </div>
          <div className="grid gap-2">
            <Label>Manifest JSON</Label>
            <Textarea
              name="manifestJson"
              rows={8}
              defaultValue={'{"artifactType":"rocksdb","source":"external-worker","notes":"ready for activation after artifact verification"}'}
            />
            <FieldError error={fieldError("manifestJson")} />
          </div>
        </>
      )}
    </KvBuildFormShell>
  );
}

export function ActivateKvBuildManifestForm({
  buildId,
  canActivate,
}: {
  buildId: number;
  canActivate: boolean;
}) {
  return (
    <KvBuildFormShell
      action={activateKvBuildManifestResultAction}
      failureTitle="KV manifest activation failed"
      pendingLabel="Activating..."
      submitLabel="Activate compiled manifest"
      successTitle="KV manifest activated"
      className="grid gap-3"
      disabled={!canActivate}
    >
      {() => <input type="hidden" name="buildId" value={buildId} />}
    </KvBuildFormShell>
  );
}
