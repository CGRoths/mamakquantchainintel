"use client";

import { useActionState } from "react";
import { createNetworkProposalResultAction, reviewNetworkProposalResultAction, type NetworkProposalMutationState } from "@/app/mqchain/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: NetworkProposalMutationState = null;

function Result({ state }: { state: NetworkProposalMutationState }) {
  if (!state) return null;
  return <Alert variant={state.ok ? "default" : "destructive"}><AlertDescription>{state.ok ? state.data.message : state.error}</AlertDescription></Alert>;
}

export function NetworkProposalForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(createNetworkProposalResultAction, initialState);
  return <form action={action} className="grid gap-3 md:grid-cols-2">
    <div className="grid gap-1.5"><Label htmlFor="changeType">Change</Label><select id="changeType" name="changeType" className="h-9 rounded-md border bg-transparent px-3 text-sm" defaultValue="capability_update" disabled={disabled}><option value="create">Create inactive network</option><option value="update">Update metadata</option><option value="activate">Activate</option><option value="deactivate">Deactivate</option><option value="capability_update">Update capability</option></select></div>
    <div className="grid gap-1.5"><Label htmlFor="networkId">Network ID</Label><Input id="networkId" name="networkId" inputMode="numeric" placeholder="Required except create" disabled={disabled} /></div>
    <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="proposedValues">Proposed values (JSON)</Label><Textarea id="proposedValues" name="proposedValues" className="min-h-28 font-mono text-xs" defaultValue="{}" disabled={disabled} /></div>
    <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="reason">Reason and evidence</Label><Textarea id="reason" name="reason" minLength={10} required disabled={disabled} /></div>
    <div className="md:col-span-2"><Result state={state} /></div>
    <div className="flex justify-end md:col-span-2"><Button type="submit" disabled={disabled || pending}>{pending ? "Submitting..." : "Submit proposal"}</Button></div>
  </form>;
}

export function NetworkProposalReviewForm({ proposalId, status, disabled = false }: { proposalId: number; status: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(reviewNetworkProposalResultAction, initialState);
  const actions = status === "pending" ? ["approve", "reject"] : status === "approved" ? ["apply"] : [];
  if (!actions.length || disabled) return null;
  return <form action={action} className="grid min-w-72 gap-2">
    <input type="hidden" name="proposalId" value={proposalId} />
    <Input name="reviewNotes" aria-label={`Review notes for proposal ${proposalId}`} placeholder="Review note" />
    <div className="flex gap-2">{actions.map(item => <Button key={item} name="action" value={item} type="submit" variant={item === "reject" ? "outline" : "default"} size="sm" disabled={pending}>{item}</Button>)}</div>
    <Result state={state} />
  </form>;
}
