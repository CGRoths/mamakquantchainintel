import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSourceJobDeletionPreview,
  SOURCE_JOB_DELETION_ORDER,
  type SourceJobDeletionSafetyCounts,
} from "@/lib/mqchain/source-job-deletion";
import { isSourceJobDeleteConfirmation, sourceJobDeleteConfirmation } from "@/lib/mqchain/validators/source-job";

const emptyCounts: SourceJobDeletionSafetyCounts = {
  sourceDocuments: 0,
  candidates: 0,
  approvedCandidates: 0,
  evidence: 0,
  verifications: 0,
  batches: 0,
  protectedBatches: 0,
  registryRows: 0,
  kvBuildReferences: 0,
  canonicalEvidence: 0,
  canonicalApprovalEvents: 0,
  externalCandidateReferences: 0,
  supersedingBatches: 0,
  externalEvidenceBatchLinks: 0,
  externalApprovalBatchLinks: 0,
  externalBatchEvidenceLinks: 0,
};

function preview(counts: Partial<SourceJobDeletionSafetyCounts> = {}, sourceStatus = "candidate_created") {
  return buildSourceJobDeletionPreview({
    sourceJobId: 1,
    sourceName: "Test upload",
    sourceStatus,
    counts: { ...emptyCounts, ...counts },
  });
}

describe("pending source-job deletion safety", () => {
  it.each(["draft", "normalized", "extracted", "candidate_created", "failed"])("allows unprotected %s jobs", sourceStatus => {
    expect(preview({ sourceDocuments: 1, candidates: 2, evidence: 2, verifications: 3 }, sourceStatus)).toMatchObject({
      deletable: true,
      blockers: [],
      counts: { sourceDocuments: 1, candidates: 2, evidence: 2, verifications: 3 },
    });
  });

  it("does not treat verified source-sheet records as canonical blockers", () => {
    expect(preview({ verifications: 4 }).deletable).toBe(true);
  });

  it.each([
    ["approved candidate", { approvedCandidates: 1 }],
    ["committed or protected batch", { protectedBatches: 1 }],
    ["registry row", { registryRows: 1 }],
    ["KV build reference", { kvBuildReferences: 1 }],
    ["canonical evidence", { canonicalEvidence: 1 }],
    ["canonical approval event", { canonicalApprovalEvents: 1 }],
    ["external candidate reference", { externalCandidateReferences: 1 }],
    ["superseding batch", { supersedingBatches: 1 }],
    ["external evidence batch", { externalEvidenceBatchLinks: 1 }],
    ["external approval batch", { externalApprovalBatchLinks: 1 }],
    ["external batch evidence", { externalBatchEvidenceLinks: 1 }],
  ])("blocks deletion for %s", (_label, counts) => {
    const result = preview(counts);
    expect(result.deletable).toBe(false);
    expect(result.blockers).toHaveLength(1);
  });

  it("blocks archived jobs", () => {
    expect(preview({}, "archived")).toMatchObject({ deletable: false, blockers: [expect.stringContaining("archived")] });
  });

  it("requires the exact confirmation", () => {
    expect(sourceJobDeleteConfirmation(12)).toBe("DELETE 12");
    expect(isSourceJobDeleteConfirmation(12, "DELETE 12")).toBe(true);
    expect(isSourceJobDeleteConfirmation(12, "delete 12")).toBe(false);
    expect(isSourceJobDeleteConfirmation(12, "DELETE 12 ")).toBe(false);
  });

  it("keeps the required foreign-key-safe dependency order", () => {
    expect(SOURCE_JOB_DELETION_ORDER).toEqual([
      "batchEvidence",
      "approvalEvents",
      "batchCandidates",
      "addressEvidence",
      "sourceVerifications",
      "labelBatches",
      "addressCandidates",
      "sourceDocuments",
      "sourceJob",
    ]);
  });
});

describe("source-job deletion implementation contracts", () => {
  const root = process.cwd();
  const service = readFileSync(join(root, "src/lib/mqchain/services/source-job-service.ts"), "utf8");
  const component = readFileSync(join(root, "src/components/mqchain/delete-source-job-dialog.tsx"), "utf8");

  it("performs preview, audit, and every delete inside one transaction", () => {
    const transaction = service.indexOf("return getDb().transaction(async tx =>", service.indexOf("export async function deletePendingSourceJob"));
    const previewLoad = service.indexOf("loadSourceJobDeletionPlan(tx", transaction);
    const audit = service.indexOf("tx.insert(mqAuditEvents)", previewLoad);
    const deletes = [
      "tx.delete(mqWorkflowLabelBatchEvidence)",
      "tx.delete(mqWorkflowApprovalEvents)",
      "tx.delete(mqWorkflowLabelBatchCandidates)",
      "tx.delete(mqWorkflowAddressEvidence)",
      "tx.delete(mqWorkflowSourceVerifications)",
      "tx.delete(mqWorkflowLabelBatches)",
      "tx.delete(mqWorkflowAddressCandidates)",
      "tx.delete(mqWorkflowSourceDocuments)",
      "tx.delete(mqWorkflowSourceJobs)",
    ].map(token => service.indexOf(token, audit));
    expect(transaction).toBeGreaterThan(0);
    expect(previewLoad).toBeGreaterThan(transaction);
    expect(audit).toBeGreaterThan(previewLoad);
    expect(deletes.every(index => index > audit)).toBe(true);
    expect(deletes).toEqual([...deletes].sort((left, right) => left - right));
    expect(service).not.toContain("tx.delete(mqAuditEvents)");
  });

  it("relies on database transaction rollback when any deletion step fails", () => {
    expect(service).toContain("return getDb().transaction(async tx =>");
    expect(service).not.toMatch(/catch[\s\S]{0,200}deletePendingSourceJob/);
    expect(service).toContain("Source job deletion did not remove exactly one row.");
  });

  it("renders all preview counts and keeps deletion disabled until exact confirmation", () => {
    for (const key of Object.keys(emptyCounts).slice(0, 9)) expect(component).toContain(`["${key}"`);
    expect(component).toContain("confirmation !== requiredConfirmation");
    expect(component).toContain("Permanently delete job ${sourceJobId}");
    expect(component).toContain("router.push(\"/mqchain/source-jobs\")");
  });
});
