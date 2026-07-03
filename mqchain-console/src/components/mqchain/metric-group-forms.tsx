"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createKvBuildManifestResultAction,
  type KvBuildMutationState,
  addMetricGroupRuleResultAction,
  createMetricGroupResultAction,
  deactivateMetricGroupResultAction,
  type MetricGroupMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MetricGroupAction = (previousState: MetricGroupMutationState, formData: FormData) => Promise<MetricGroupMutationState>;

type MetricGroupOption = {
  id: number;
  metricGroupCode: string;
};

type MetricGroupFormShellProps = {
  action: MetricGroupAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  successTitle: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  previewOnSuccess?: boolean;
};

const initialState: MetricGroupMutationState = null;
const kvInitialState: KvBuildMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function MetricGroupFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  successTitle,
  className = "grid gap-3",
  compact = false,
  disabled = false,
  previewOnSuccess = false,
}: MetricGroupFormShellProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!state?.ok) {
      return;
    }

    if (previewOnSuccess) {
      router.push(`/mqchain/metric-groups?preview=${state.data.groupId}`);
    } else {
      router.refresh();
    }
  }, [previewOnSuccess, router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  if (compact) {
    return (
      <form action={formAction} className="grid justify-items-end gap-1">
        {children({ fieldError })}
        <Button size="sm" variant="outline" type="submit" disabled={disabled || pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {state?.ok === false ? <p className="max-w-56 text-right text-xs text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="max-w-56 text-right text-xs text-muted-foreground">{state.data.message}</p> : null}
      </form>
    );
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
      <Button type="submit" disabled={disabled || pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

function MetricRuleSelectorFields({ fieldError, rows = 3 }: { fieldError: (name: string) => string | undefined; rows?: number }) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-2">
          <Label>Include roles</Label>
          <Textarea name="includeRoles" rows={rows} placeholder={"cex_hot_wallet\ncex_cold_wallet\ncex_por_cold_wallet"} />
          <FieldError error={fieldError("includeRoles")} />
        </div>
        <div className="grid gap-2">
          <Label>Include categories</Label>
          <Textarea name="includeCategories" rows={rows} placeholder="cex_hot_cold" />
          <FieldError error={fieldError("includeCategories")} />
        </div>
        <div className="grid gap-2">
          <Label>Include entities</Label>
          <Textarea name="includeEntities" rows={rows} placeholder="binance, coinbase, okx" />
          <FieldError error={fieldError("includeEntities")} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-2">
          <Label>Exclude roles</Label>
          <Textarea name="excludeRoles" rows={2} placeholder={"cex_gas_wallet\ncex_fee_wallet"} />
          <FieldError error={fieldError("excludeRoles")} />
        </div>
        <div className="grid gap-2">
          <Label>Exclude categories</Label>
          <Textarea name="excludeCategories" rows={2} placeholder="risk, mixer" />
          <FieldError error={fieldError("excludeCategories")} />
        </div>
        <div className="grid gap-2">
          <Label>Exclude entities</Label>
          <Textarea name="excludeEntities" rows={2} placeholder="sanctioned_entity" />
          <FieldError error={fieldError("excludeEntities")} />
        </div>
      </div>
    </>
  );
}

export function CreateMetricGroupForm() {
  return (
    <MetricGroupFormShell
      action={createMetricGroupResultAction}
      failureTitle="Metric group creation failed"
      pendingLabel="Creating..."
      submitLabel="Create metric group"
      successTitle="Metric group created"
      previewOnSuccess
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Code</Label>
              <Input name="metricGroupCode" placeholder="btc_cex_flow_boundary" required />
              <FieldError error={fieldError("metricGroupCode")} />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input name="metricGroupName" placeholder="BTC CEX Flow Boundary" required />
              <FieldError error={fieldError("metricGroupName")} />
            </div>
            <div className="grid gap-2">
              <Label>Chain</Label>
              <Input name="chainCode" placeholder="btc" />
              <FieldError error={fieldError("chainCode")} />
            </div>
            <div className="grid gap-2">
              <Label>Min confidence</Label>
              <Input name="minConfidence" type="number" min={0} max={100} defaultValue={70} />
              <FieldError error={fieldError("minConfidence")} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Require metric eligible</Label>
              <select
                name="requireMetricEligible"
                defaultValue="true"
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
              <FieldError error={fieldError("requireMetricEligible")} />
            </div>
            <div className="grid gap-2">
              <Label>Rule min confidence</Label>
              <Input name="ruleMinConfidence" type="number" min={0} max={100} placeholder="uses group default" />
              <FieldError error={fieldError("ruleMinConfidence")} />
            </div>
            <div className="grid gap-2">
              <Label>Rule metric eligible</Label>
              <select
                name="ruleRequireMetricEligible"
                defaultValue="true"
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="true">Required</option>
                <option value="false">Not required</option>
              </select>
              <FieldError error={fieldError("ruleRequireMetricEligible")} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input name="description" placeholder="Flow boundary for BTC exchange metrics" />
              <FieldError error={fieldError("description")} />
            </div>
          </div>
          <MetricRuleSelectorFields fieldError={fieldError} rows={4} />
        </>
      )}
    </MetricGroupFormShell>
  );
}

export function AddMetricGroupRuleForm({ groups }: { groups: MetricGroupOption[] }) {
  return (
    <MetricGroupFormShell
      action={addMetricGroupRuleResultAction}
      failureTitle="Metric group rule creation failed"
      pendingLabel="Adding..."
      submitLabel="Add rule"
      successTitle="Metric group rule added"
      previewOnSuccess
      disabled={!groups.length}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Metric group</Label>
              <select name="metricGroupId" className="h-10 rounded-md border bg-background px-3 text-sm" required>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.metricGroupCode}
                  </option>
                ))}
              </select>
              <FieldError error={fieldError("metricGroupId")} />
            </div>
            <div className="grid gap-2">
              <Label>Rule min confidence</Label>
              <Input name="ruleMinConfidence" type="number" min={0} max={100} placeholder="uses group default" />
              <FieldError error={fieldError("ruleMinConfidence")} />
            </div>
            <div className="grid gap-2">
              <Label>Rule metric eligible</Label>
              <select name="ruleRequireMetricEligible" defaultValue="true" className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="true">Required</option>
                <option value="false">Not required</option>
              </select>
              <FieldError error={fieldError("ruleRequireMetricEligible")} />
            </div>
          </div>
          <MetricRuleSelectorFields fieldError={fieldError} />
        </>
      )}
    </MetricGroupFormShell>
  );
}

export function DeactivateMetricGroupForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <MetricGroupFormShell
      action={deactivateMetricGroupResultAction}
      failureTitle="Metric group deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Metric group deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </MetricGroupFormShell>
  );
}

export function CreateMetricGroupKvManifestForm({
  manifestJson,
  rowCount,
}: {
  manifestJson: string;
  rowCount: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createKvBuildManifestResultAction, kvInitialState);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/mqchain/kv-builds/${state.data.buildId}`);
    }
  }, [router, state]);

  return (
    <form action={formAction} className="grid gap-2 sm:justify-items-end">
      <input type="hidden" name="status" value="pending" />
      <input type="hidden" name="rowCount" value={rowCount} />
      <input type="hidden" name="manifestJson" value={manifestJson} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Registering..." : "Register KV compile handoff"}
      </Button>
      {state?.ok === false ? <p className="max-w-xl text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="max-w-xl text-sm text-muted-foreground">{state.data.message}</p> : null}
    </form>
  );
}
