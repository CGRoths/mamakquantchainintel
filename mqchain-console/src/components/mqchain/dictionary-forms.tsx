"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createCategoryResultAction,
  createEntityResultAction,
  createKeyPrefixResultAction,
  createProtocolResultAction,
  createRoleResultAction,
  deactivateCategoryResultAction,
  deactivateEntityResultAction,
  deactivateKeyPrefixResultAction,
  deactivateProtocolResultAction,
  deactivateRoleResultAction,
  type DictionaryMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type DictionaryAction = (previousState: DictionaryMutationState, formData: FormData) => Promise<DictionaryMutationState>;

type CategoryOption = {
  categoryId: number;
  categoryCode: string;
};

type EntityOption = {
  id: number;
  entityName: string;
};

type DictionaryFormShellProps = {
  action: DictionaryAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  successTitle: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
};

const initialState: DictionaryMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function DictionaryFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  successTitle,
  className = "grid gap-3",
  compact = false,
  disabled = false,
}: DictionaryFormShellProps) {
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
        <Alert variant="destructive" className="md:col-span-full">
          <AlertCircle />
          <AlertTitle>{failureTitle}</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert className="md:col-span-full">
          <CheckCircle2 />
          <AlertTitle>{successTitle}</AlertTitle>
          <AlertDescription>{state.data.message}</AlertDescription>
        </Alert>
      ) : null}
      {children({ fieldError })}
      <Button type="submit" className="md:col-span-full" disabled={disabled || pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

export function CreateEntityForm({ categories }: { categories: CategoryOption[] }) {
  return (
    <DictionaryFormShell
      action={createEntityResultAction}
      failureTitle="Entity creation failed"
      pendingLabel="Creating..."
      submitLabel="Create entity"
      successTitle="Entity created"
      className="grid gap-3 md:grid-cols-3"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input name="entityCode" placeholder="binance" required />
            <FieldError error={fieldError("entityCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input name="entityName" placeholder="Binance" required />
            <FieldError error={fieldError("entityName")} />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Input name="entityType" placeholder="cex" />
            <FieldError error={fieldError("entityType")} />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <select name="categoryId" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.categoryCode}
                </option>
              ))}
            </select>
            <FieldError error={fieldError("categoryId")} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Website</Label>
            <Input name="websiteUrl" placeholder="https://..." />
            <FieldError error={fieldError("websiteUrl")} />
          </div>
          <div className="grid gap-2 md:col-span-3">
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
            <FieldError error={fieldError("description")} />
          </div>
        </>
      )}
    </DictionaryFormShell>
  );
}

export function CreateProtocolForm({ entities }: { entities: EntityOption[] }) {
  return (
    <DictionaryFormShell
      action={createProtocolResultAction}
      failureTitle="Protocol creation failed"
      pendingLabel="Creating..."
      submitLabel="Create protocol"
      successTitle="Protocol created"
      className="grid gap-3 md:grid-cols-3"
      disabled={!entities.length}
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>Entity</Label>
            <select name="entityId" className="h-10 rounded-md border bg-background px-3 text-sm" required>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.entityName}
                </option>
              ))}
            </select>
            <FieldError error={fieldError("entityId")} />
          </div>
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input name="protocolCode" placeholder="aave_v4" required />
            <FieldError error={fieldError("protocolCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input name="protocolName" placeholder="Aave V4" required />
            <FieldError error={fieldError("protocolName")} />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Input name="protocolType" placeholder="lending" />
            <FieldError error={fieldError("protocolType")} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Chains</Label>
            <Input name="chainScope" placeholder="ethereum, base" />
            <FieldError error={fieldError("chainScope")} />
          </div>
          <div className="grid gap-2 md:col-span-3">
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
            <FieldError error={fieldError("description")} />
          </div>
        </>
      )}
    </DictionaryFormShell>
  );
}

export function CreateCategoryForm() {
  return (
    <DictionaryFormShell
      action={createCategoryResultAction}
      failureTitle="Category creation failed"
      pendingLabel="Creating..."
      submitLabel="Create category"
      successTitle="Category created"
      className="grid gap-3 md:grid-cols-4"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>ID</Label>
            <Input name="categoryId" type="number" required />
            <FieldError error={fieldError("categoryId")} />
          </div>
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input name="categoryCode" placeholder="rwa" required />
            <FieldError error={fieldError("categoryCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input name="categoryName" placeholder="Real World Asset" required />
            <FieldError error={fieldError("categoryName")} />
          </div>
          <div className="grid gap-2">
            <Label>Parent</Label>
            <Input name="parentCategoryId" type="number" />
            <FieldError error={fieldError("parentCategoryId")} />
          </div>
          <div className="grid gap-2">
            <Label>Domain</Label>
            <Input name="domainCode" placeholder="defi" />
            <FieldError error={fieldError("domainCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Metric domain</Label>
            <Input name="metricDomain" placeholder="protocol_graph" />
            <FieldError error={fieldError("metricDomain")} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
            <FieldError error={fieldError("description")} />
          </div>
        </>
      )}
    </DictionaryFormShell>
  );
}

export function CreateRoleForm({ categories }: { categories: CategoryOption[] }) {
  return (
    <DictionaryFormShell
      action={createRoleResultAction}
      failureTitle="Role creation failed"
      pendingLabel="Creating..."
      submitLabel="Create role"
      successTitle="Role created"
      className="grid gap-3 md:grid-cols-4"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>ID</Label>
            <Input name="roleId" type="number" required />
            <FieldError error={fieldError("roleId")} />
          </div>
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input name="roleCode" placeholder="protocol_guardian" required />
            <FieldError error={fieldError("roleCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input name="roleName" placeholder="Protocol Guardian" required />
            <FieldError error={fieldError("roleName")} />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <select name="categoryId" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.categoryCode}
                </option>
              ))}
            </select>
            <FieldError error={fieldError("categoryId")} />
          </div>
          <div className="grid gap-2">
            <Label>Group</Label>
            <Input name="roleGroup" placeholder="protocol" />
            <FieldError error={fieldError("roleGroup")} />
          </div>
          <div className="grid gap-2">
            <Label>Metric usage</Label>
            <Input name="metricUsageDefault" placeholder="protocol_graph" />
            <FieldError error={fieldError("metricUsageDefault")} />
          </div>
          <div className="grid gap-2">
            <Label>Boundary</Label>
            <Input name="boundaryClass" placeholder="control_boundary" />
            <FieldError error={fieldError("boundaryClass")} />
          </div>
          <div className="grid gap-2">
            <Label>Quality</Label>
            <Input name="defaultQualityTier" type="number" min="0" max="5" defaultValue="1" />
            <FieldError error={fieldError("defaultQualityTier")} />
          </div>
          <div className="grid gap-2">
            <Label>Flags</Label>
            <Input name="defaultFlags" type="number" min="0" defaultValue="0" />
            <FieldError error={fieldError("defaultFlags")} />
          </div>
          <div className="grid gap-2 md:col-span-3">
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
            <FieldError error={fieldError("description")} />
          </div>
        </>
      )}
    </DictionaryFormShell>
  );
}

export function CreateKeyPrefixForm() {
  return (
    <DictionaryFormShell
      action={createKeyPrefixResultAction}
      failureTitle="Key prefix creation failed"
      pendingLabel="Creating..."
      submitLabel="Create prefix"
      successTitle="Key prefix created"
      className="grid gap-3 md:grid-cols-4"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>Prefix code</Label>
            <Input name="prefixCode" type="number" placeholder="257" required />
            <FieldError error={fieldError("prefixCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Chain code</Label>
            <Input name="chainCode" placeholder="ethereum" required />
            <FieldError error={fieldError("chainCode")} />
          </div>
          <div className="grid gap-2">
            <Label>Chain name</Label>
            <Input name="chainName" placeholder="Ethereum" />
            <FieldError error={fieldError("chainName")} />
          </div>
          <div className="grid gap-2">
            <Label>Chain family</Label>
            <Input name="chainFamily" placeholder="evm" required />
            <FieldError error={fieldError("chainFamily")} />
          </div>
          <div className="grid gap-2">
            <Label>Address family</Label>
            <Input name="addressFamily" placeholder="evm20" required />
            <FieldError error={fieldError("addressFamily")} />
          </div>
          <div className="grid gap-2">
            <Label>Codec</Label>
            <Input name="codec" placeholder="hex" required />
            <FieldError error={fieldError("codec")} />
          </div>
          <div className="grid gap-2">
            <Label>Payload length</Label>
            <Input name="payloadLen" type="number" placeholder="20" />
            <FieldError error={fieldError("payloadLen")} />
          </div>
          <div className="grid gap-2">
            <Label>EVM chain ID</Label>
            <Input name="evmChainId" type="number" placeholder="1" />
            <FieldError error={fieldError("evmChainId")} />
          </div>
          <div className="grid gap-2 md:col-span-4">
            <Label>Description</Label>
            <Textarea name="description" rows={2} />
            <FieldError error={fieldError("description")} />
          </div>
        </>
      )}
    </DictionaryFormShell>
  );
}

export function DeactivateEntityForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <DictionaryFormShell
      action={deactivateEntityResultAction}
      failureTitle="Entity deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Entity deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </DictionaryFormShell>
  );
}

export function DeactivateProtocolForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <DictionaryFormShell
      action={deactivateProtocolResultAction}
      failureTitle="Protocol deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Protocol deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </DictionaryFormShell>
  );
}

export function DeactivateCategoryForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <DictionaryFormShell
      action={deactivateCategoryResultAction}
      failureTitle="Category deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Category deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </DictionaryFormShell>
  );
}

export function DeactivateRoleForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <DictionaryFormShell
      action={deactivateRoleResultAction}
      failureTitle="Role deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Role deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </DictionaryFormShell>
  );
}

export function DeactivateKeyPrefixForm({ id, disabled }: { id: number; disabled?: boolean }) {
  return (
    <DictionaryFormShell
      action={deactivateKeyPrefixResultAction}
      failureTitle="Key prefix deactivation failed"
      pendingLabel="Saving..."
      submitLabel="Deactivate"
      successTitle="Key prefix deactivated"
      compact
      disabled={disabled}
    >
      {() => <input type="hidden" name="id" value={id} />}
    </DictionaryFormShell>
  );
}
