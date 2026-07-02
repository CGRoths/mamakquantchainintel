"use client";

import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { DiscoveryMutationState } from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCOVERY_SCANNER_TEMPLATES,
  formatDiscoveryConfigTemplate,
  getDiscoveryTemplate,
} from "@/lib/mqchain/discovery-templates";

type DiscoveryJobFormProps = {
  action: (previousState: DiscoveryMutationState, formData: FormData) => Promise<DiscoveryMutationState>;
};

const initialState: DiscoveryMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

export function DiscoveryJobForm({ action }: DiscoveryJobFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);
  const [discoveryType, setDiscoveryType] = useState<string>(DISCOVERY_SCANNER_TEMPLATES[0].type);
  const [configJson, setConfigJson] = useState(formatDiscoveryConfigTemplate(DISCOVERY_SCANNER_TEMPLATES[0].type));
  const template = useMemo(() => getDiscoveryTemplate(discoveryType), [discoveryType]);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/mqchain/discovery/jobs/${state.data.jobId}`);
    }
  }, [router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  function updateDiscoveryType(nextType: string) {
    setDiscoveryType(nextType);
    setConfigJson(formatDiscoveryConfigTemplate(nextType));
  }

  return (
    <form action={formAction} className="grid gap-3">
      {state?.ok === false ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Discovery job creation failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Discovery job created</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="grid gap-2">
          <Label>Type</Label>
          <select
            name="discoveryType"
            value={discoveryType}
            onChange={(event) => updateDiscoveryType(event.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            {DISCOVERY_SCANNER_TEMPLATES.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
          <FieldError error={fieldError("discoveryType")} />
        </div>
        <div className="grid gap-2">
          <Label>Chain</Label>
          <Input name="chainCode" placeholder={template?.defaultChain ?? "ethereum"} />
          <FieldError error={fieldError("chainCode")} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>Seed address</Label>
          <Input name="seedAddress" placeholder="0x..." />
          <FieldError error={fieldError("seedAddress")} />
        </div>
      </div>
      {template ? (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Root</div>
            <div className="font-medium">{template.rootType}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Evidence</div>
            <div className="font-mono text-xs">{template.evidenceType}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Required config</div>
            <div className="font-mono text-xs">{template.requiredConfig.join(", ")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Outputs</div>
            <div className="font-mono text-xs">{template.outputFields.join(", ")}</div>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Config JSON</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfigJson(formatDiscoveryConfigTemplate(discoveryType))}>
            <RotateCcw />
            Reset
          </Button>
        </div>
        <Textarea name="configJson" rows={9} value={configJson} onChange={(event) => setConfigJson(event.target.value)} />
        <FieldError error={fieldError("configJson")} />
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creating..." : "Create job"}</Button>
    </form>
  );
}

export function DiscoveryCompletionForm({
  action,
  jobId,
}: {
  action: (previousState: DiscoveryMutationState, formData: FormData) => Promise<DiscoveryMutationState>;
  jobId: number;
}) {
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
    <form action={formAction} className="grid gap-3">
      {state?.ok === false ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Discovery completion failed</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Discovery results staged</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-2">
        <Label>Results JSON</Label>
        <Textarea
          name="resultsJson"
          rows={14}
          placeholder={'[{"address":"0x...","chain":"ethereum","entity":"uniswap","protocol":"uniswap_v3","role":"uniswap_v3_pool","evidence_type":"factory_event","confidence":65,"summary":"PoolCreated log","payload":{"tx_hash":"0x..."}}]'}
          required
        />
        <FieldError error={fieldError("resultsJson")} />
      </div>
      {state?.ok ? (
        <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div><span className="text-muted-foreground">Rows</span><div className="font-mono">{state.data.rows ?? "-"}</div></div>
          <div><span className="text-muted-foreground">Candidates</span><div className="font-mono">{state.data.candidatesCreated ?? "-"}</div></div>
          <div><span className="text-muted-foreground">Evidence</span><div className="font-mono">{state.data.evidenceCreated ?? "-"}</div></div>
          <div><span className="text-muted-foreground">Invalid / duplicate</span><div className="font-mono">{state.data.invalidRows ?? 0} / {state.data.duplicates ?? 0}</div></div>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? "Creating candidates..." : "Create candidates from results"}</Button>
    </form>
  );
}
