"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createSettingsUserResultAction,
  updateSettingsUserAccessResultAction,
  type SettingsMutationState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsAction = (previousState: SettingsMutationState, formData: FormData) => Promise<SettingsMutationState>;

type SettingsFormShellProps = {
  action: SettingsAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
  successTitle: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
};

type RoleOption = string;

const initialState: SettingsMutationState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function SettingsFormShell({
  action,
  children,
  failureTitle,
  pendingLabel,
  submitLabel,
  successTitle,
  className = "grid gap-3",
  compact = false,
  disabled = false,
}: SettingsFormShellProps) {
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
        {state?.ok === false ? <p className="max-w-64 text-right text-xs text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="max-w-64 text-right text-xs text-muted-foreground">{state.data.message}</p> : null}
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

export function CreateSettingsUserForm({ roles }: { roles: RoleOption[] }) {
  return (
    <SettingsFormShell
      action={createSettingsUserResultAction}
      failureTitle="User creation failed"
      pendingLabel="Creating..."
      submitLabel="Create user"
      successTitle="User created"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="operator@mamakquant.local" required />
            <FieldError error={fieldError("email")} />
          </div>
          <div className="grid gap-2">
            <Label>Display name</Label>
            <Input name="displayName" placeholder="Operator name" />
            <FieldError error={fieldError("displayName")} />
          </div>
          <div className="grid gap-2">
            <Label>Role</Label>
            <select name="role" defaultValue="analyst" className="h-10 rounded-md border bg-background px-3 text-sm">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <FieldError error={fieldError("role")} />
          </div>
          <div className="grid gap-2">
            <Label>Password</Label>
            <Input name="password" type="password" minLength={12} required />
            <FieldError error={fieldError("password")} />
          </div>
        </>
      )}
    </SettingsFormShell>
  );
}

export function UpdateSettingsUserAccessForm({
  disabled,
  isActive,
  role,
  roles,
  userId,
}: {
  disabled?: boolean;
  isActive: boolean;
  role: string;
  roles: RoleOption[];
  userId: string;
}) {
  return (
    <SettingsFormShell
      action={updateSettingsUserAccessResultAction}
      failureTitle="Access update failed"
      pendingLabel="Saving..."
      submitLabel="Update"
      successTitle="Access updated"
      compact
      disabled={disabled}
    >
      {({ fieldError }) => (
        <>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <input type="hidden" name="userId" value={userId} />
            <div className="grid gap-1 text-left">
              <Label className="text-xs">Role</Label>
              <select name="role" defaultValue={role} className="h-9 rounded-md border bg-background px-2 text-sm">
                {roles.map((roleOption) => (
                  <option key={roleOption} value={roleOption}>
                    {roleOption}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={isActive} />
              Active
            </label>
          </div>
          <div className="grid justify-items-end gap-1">
            <FieldError error={fieldError("userId")} />
            <FieldError error={fieldError("role")} />
            <FieldError error={fieldError("isActive")} />
          </div>
        </>
      )}
    </SettingsFormShell>
  );
}
