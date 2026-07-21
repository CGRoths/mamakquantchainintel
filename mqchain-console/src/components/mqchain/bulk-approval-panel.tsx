"use client";

import { AlertCircle, CheckCircle2, ListChecks } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  executeBulkCandidateApprovalResultAction,
  previewBulkCandidateApprovalResultAction,
  type BulkApprovalPreviewState,
  type BulkApprovalResultState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BulkApprovalRow = {
  candidateId: number;
  normalizedAddress: string;
  chainCode: string | null;
  entityLabel: string;
  roleLabel: string;
  componentHint: string | null;
  resolvedComponentId: number | null;
  proposedComponentCode: string | null;
  confidenceScore: number;
  qualityTier: number;
  quickApprovable: boolean;
};

type BulkApprovalMode = "strict" | "eligible_only";

const previewInitialState: BulkApprovalPreviewState = null;
const executeInitialState: BulkApprovalResultState = null;

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

export function BulkApprovalPanel({ rows }: { rows: BulkApprovalRow[] }) {
  const router = useRouter();
  const [rawSelected, setRawSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<BulkApprovalMode>("eligible_only");
  const [reason, setReason] = useState("");
  // The confirmation is armed for one exact selection+mode; any change to
  // either makes the key differ and disarms it without an effect.
  const [armedKey, setArmedKey] = useState<string | null>(null);

  const [previewState, previewAction, previewPending] = useActionState(
    previewBulkCandidateApprovalResultAction,
    previewInitialState,
  );
  const [executeState, executeAction, executePending] = useActionState(
    executeBulkCandidateApprovalResultAction,
    executeInitialState,
  );

  const preview = previewState?.ok ? previewState.data : null;
  const result = executeState?.ok ? executeState.data : null;

  // Approved rows drop out of the selection; blocked rows stay selected and
  // visible. Derived rather than stored so no effect has to reconcile it.
  const approvedIds = useMemo(() => new Set(result?.approvedCandidateIds ?? []), [result]);
  const selected = useMemo(
    () => rawSelected.filter((candidateId) => !approvedIds.has(candidateId)),
    [rawSelected, approvedIds],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectionKey = useMemo(
    () => `${mode}:${[...selected].sort((left, right) => left - right).join(",")}`,
    [mode, selected],
  );
  const confirming = armedKey === selectionKey;

  // Refreshing the server-rendered queue is an external-system sync, which is
  // what an effect is for.
  useEffect(() => {
    if (result) router.refresh();
  }, [result, router]);

  // A preview is only valid for the exact selection and mode it was taken for.
  const previewMatchesSelection = useMemo(() => {
    if (!preview) return false;
    if (preview.mode !== mode) return false;
    const sortedSelection = [...selected].sort((left, right) => left - right);
    return (
      preview.candidateIds.length === sortedSelection.length &&
      preview.candidateIds.every((value, index) => value === sortedSelection[index])
    );
  }, [preview, selected, mode]);

  function toggleRow(candidateId: number) {
    setRawSelected((current) =>
      current.includes(candidateId) ? current.filter((value) => value !== candidateId) : [...current, candidateId],
    );
  }

  const allPageIds = rows.map((row) => row.candidateId);
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedSet.has(id));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          Bulk approve as suggested
        </CardTitle>
        <CardDescription>
          Approves candidates exactly as already resolved. Candidates needing edits to entity, role, component,
          category, confidence, timeline or flags stay individually reviewable. This never creates a label batch,
          registry row, or KV build.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRawSelected(allPageSelected ? [] : allPageIds)}
            disabled={!rows.length}
          >
            {allPageSelected ? "Clear current page" : "Select current page"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRawSelected([])} disabled={!selected.length}>
            Clear selection
          </Button>
          <span className="font-mono text-sm">Selected: {formatCount(selected.length)}</span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Select</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Suggested label</TableHead>
              <TableHead>Component</TableHead>
              <TableHead>Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.candidateId}>
                <TableCell>
                  <input
                    aria-label={`Select candidate ${row.candidateId}`}
                    className="h-4 w-4 accent-primary"
                    type="checkbox"
                    checked={selectedSet.has(row.candidateId)}
                    onChange={() => toggleRow(row.candidateId)}
                  />
                </TableCell>
                <TableCell className="font-mono">{row.candidateId}</TableCell>
                <TableCell className="max-w-72 truncate font-mono text-xs">
                  {row.normalizedAddress}
                  <span className="block text-muted-foreground">{row.chainCode ?? "-"}</span>
                </TableCell>
                <TableCell>
                  <span className="block">{row.entityLabel}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{row.roleLabel}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="block text-muted-foreground">Hint: {row.componentHint ?? "-"}</span>
                  <span className="block">Resolved: {row.resolvedComponentId ?? "-"}</span>
                  <span className="block text-amber-400">Proposed: {row.proposedComponentCode ?? "-"}</span>
                </TableCell>
                <TableCell className="font-mono">
                  {row.confidenceScore} / Q{row.qualityTier}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No pending candidates.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <fieldset className="grid gap-3 md:grid-cols-2">
          <legend className="text-sm font-medium">Mode</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="bulkApprovalMode"
              className="mt-1 accent-primary"
              checked={mode === "strict"}
              onChange={() => setMode("strict")}
            />
            <span>
              <span className="block font-medium">Approve all selected atomically</span>
              <span className="block text-xs text-muted-foreground">
                If any selected candidate is blocked, nothing is approved.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="bulkApprovalMode"
              className="mt-1 accent-primary"
              checked={mode === "eligible_only"}
              onChange={() => setMode("eligible_only")}
            />
            <span>
              <span className="block font-medium">Approve eligible candidates only</span>
              <span className="block text-xs text-muted-foreground">
                Blocked candidates stay pending and are reported back.
              </span>
            </span>
          </label>
        </fieldset>

        <form action={previewAction} className="flex items-end gap-3">
          {selected.map((candidateId) => (
            <input key={candidateId} type="hidden" name="candidateId" value={candidateId} />
          ))}
          <input type="hidden" name="mode" value={mode} />
          <Button type="submit" variant="outline" disabled={!selected.length || previewPending}>
            {previewPending ? "Previewing..." : "Preview"}
          </Button>
        </form>

        {previewState?.ok === false ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Preview failed</AlertTitle>
            <AlertDescription>{previewState.error}</AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-1 font-mono text-sm">
              <span>Selected: {formatCount(preview.selectedCount)}</span>
              <span>Eligible: {formatCount(preview.eligibleCount)}</span>
              <span>Blocked: {formatCount(preview.blockedCount)}</span>
            </div>

            {preview.blockerSummary.length ? (
              <div className="text-sm">
                <p className="font-medium">Blockers:</p>
                <ul className="mt-1 grid gap-0.5 font-mono text-xs text-amber-400">
                  {preview.blockerSummary.map((row) => (
                    <li key={row.blocker}>
                      {formatCount(row.count)} {row.label.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.blockedCandidates.length ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Show {formatCount(preview.blockedCandidates.length)} blocked candidates
                </summary>
                <ul className="mt-2 grid max-h-56 gap-0.5 overflow-y-auto font-mono">
                  {preview.blockedCandidates.map((row) => (
                    <li key={row.candidateId}>
                      #{row.candidateId}: {row.blockers.join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <p className="font-mono text-xs text-muted-foreground">
              dictionaryVersion {preview.dictionaryVersion.slice(0, 16)}… / previewHash {preview.previewHash.slice(0, 16)}…
            </p>

            {!previewMatchesSelection ? (
              <Alert>
                <AlertCircle />
                <AlertTitle>Preview is stale</AlertTitle>
                <AlertDescription>The selection or mode changed. Run preview again before approving.</AlertDescription>
              </Alert>
            ) : (
              <form action={executeAction} className="space-y-3">
                {preview.candidateIds.map((candidateId) => (
                  <input key={candidateId} type="hidden" name="candidateId" value={candidateId} />
                ))}
                <input type="hidden" name="mode" value={preview.mode} />
                <input type="hidden" name="expectedDictionaryVersion" value={preview.dictionaryVersion} />
                <input type="hidden" name="expectedPreviewHash" value={preview.previewHash} />
                <div className="grid gap-2">
                  <Label htmlFor="bulk-approval-reason">Reason</Label>
                  <Input
                    id="bulk-approval-reason"
                    name="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Approved official Kraken PoR source"
                    required
                  />
                </div>
                {confirming ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={executePending || !reason.trim()}>
                      {executePending
                        ? "Approving..."
                        : preview.mode === "strict"
                          ? `Confirm: approve all ${formatCount(preview.selectedCount)} atomically`
                          : `Confirm: approve ${formatCount(preview.eligibleCount)} eligible candidates`}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setArmedKey(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => setArmedKey(selectionKey)}
                    disabled={!reason.trim() || (preview.mode === "eligible_only" && preview.eligibleCount === 0)}
                  >
                    {preview.mode === "strict"
                      ? `Approve all ${formatCount(preview.selectedCount)} atomically`
                      : `Approve ${formatCount(preview.eligibleCount)} eligible candidates`}
                  </Button>
                )}
              </form>
            )}
          </div>
        ) : null}

        {executeState?.ok === false ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Bulk approval failed</AlertTitle>
            <AlertDescription>{executeState.error}</AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Bulk approval complete</AlertTitle>
            <AlertDescription>
              <span className="block font-mono text-xs">Operation {result.bulkOperationId}</span>
              <span className="block">
                Approved {formatCount(result.approvedCount)} of {formatCount(result.selectedCount)} selected;{" "}
                {formatCount(result.blockedCount)} blocked and left pending. No label batch was created.
              </span>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
