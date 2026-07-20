"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SourceJobDeletionPreview } from "@/lib/mqchain/source-job-deletion";
import { sourceJobDeleteConfirmation } from "@/lib/mqchain/validators/source-job";

const countLabels: Array<[keyof SourceJobDeletionPreview["counts"], string]> = [
  ["sourceDocuments", "Source documents"],
  ["candidates", "Candidates"],
  ["approvedCandidates", "Approved candidates"],
  ["evidence", "Evidence"],
  ["verifications", "Verifications"],
  ["batches", "Batches"],
  ["protectedBatches", "Protected batches"],
  ["registryRows", "Registry rows"],
  ["kvBuildReferences", "KV build references"],
];

function responseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

export function DeleteSourceJobDialog({ sourceJobId, sourceName }: { sourceJobId: number; sourceName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SourceJobDeletionPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiredConfirmation = sourceJobDeleteConfirmation(sourceJobId);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mqchain/source-jobs/${sourceJobId}/delete-preview`, { cache: "no-store" });
      const payload = await response.json() as unknown;
      if (!response.ok) throw new Error(responseError(payload, "Deletion preview failed."));
      setPreview(payload as SourceJobDeletionPreview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Deletion preview failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (deleting) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setConfirmation("");
      void loadPreview();
    }
  }

  async function permanentlyDelete() {
    if (deleting || !preview?.deletable || confirmation !== requiredConfirmation) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/mqchain/source-jobs/${sourceJobId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) throw new Error(responseError(payload, "Source job deletion failed."));
      setOpen(false);
      router.push("/mqchain/source-jobs");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Source job deletion failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm"><Trash2 />Delete source job</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete source job</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently remove pending records for {sourceName ?? `source job ${sourceJobId}`} (ID {sourceJobId}). Canonical and committed dependencies block deletion.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading ? <p className="text-sm text-muted-foreground">Loading deletion preview...</p> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Deletion failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preview ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {countLabels.map(([key, label]) => (
                <div key={key} className="border-l-2 pl-2">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-mono font-medium">{preview.counts[key]}</div>
                </div>
              ))}
            </div>
            {preview.blockers.length ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Deletion blocked</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">{preview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor={`delete-source-job-${sourceJobId}`}>Type <span className="font-mono">{requiredConfirmation}</span> to continue</Label>
                <Input
                  id={`delete-source-job-${sourceJobId}`}
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={loading || deleting || !preview?.deletable || confirmation !== requiredConfirmation}
            onClick={() => void permanentlyDelete()}
          >
            {deleting ? "Deleting..." : `Permanently delete job ${sourceJobId}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
