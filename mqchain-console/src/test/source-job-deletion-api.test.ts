import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as deleteSourceJobRoute } from "@/app/api/mqchain/source-jobs/[id]/route";
import { GET as previewSourceJobDeletionRoute } from "@/app/api/mqchain/source-jobs/[id]/delete-preview/route";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";

const mocks = vi.hoisted(() => ({
  assertPermission: vi.fn(),
  requireSignedIn: vi.fn(),
  deleteSourceJob: vi.fn(),
  getSourceJobDeletionPreview: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  assertPermission: mocks.assertPermission,
  requireSignedIn: mocks.requireSignedIn,
}));
vi.mock("@/lib/mqchain/origin-client/client", () => ({
  deleteSourceJob: mocks.deleteSourceJob,
  getSourceJobDeletionPreview: mocks.getSourceJobDeletionPreview,
  getSourceJob: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const preview = {
  sourceJobId: 1,
  sourceName: "Test upload",
  sourceStatus: "candidate_created",
  deletable: true,
  blockers: [],
  counts: {
    sourceDocuments: 1,
    candidates: 2,
    approvedCandidates: 0,
    evidence: 2,
    verifications: 1,
    batches: 0,
    protectedBatches: 0,
    registryRows: 0,
    kvBuildReferences: 0,
  },
};

function request(method: "GET" | "DELETE", body?: unknown) {
  return new Request("https://mamakquant.local/api/mqchain/source-jobs/1", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("source-job deletion API boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPermission.mockResolvedValue({ id: "user-1", email: "owner@mamakquant.local", role: "owner" });
    mocks.requireSignedIn.mockResolvedValue({ id: "user-1", email: "owner@mamakquant.local", role: "owner" });
    mocks.getSourceJobDeletionPreview.mockResolvedValue(preview);
    mocks.deleteSourceJob.mockResolvedValue({ sourceJobId: 1, deletedCounts: preview.counts });
  });

  it("returns the typed preview through the signed Origin client", async () => {
    const response = await previewSourceJobDeletionRoute(request("GET") as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(preview);
    expect(mocks.assertPermission).toHaveBeenCalledWith("intake:delete");
    expect(mocks.getSourceJobDeletionPreview).toHaveBeenCalledWith(1);
  });

  it("keeps analysts and other unauthorized sessions out", async () => {
    mocks.assertPermission.mockRejectedValueOnce(new Error("permission denied"));
    const response = await deleteSourceJobRoute(request("DELETE", { confirmation: "DELETE 1" }) as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(403);
    expect(mocks.deleteSourceJob).not.toHaveBeenCalled();
  });

  it("maps missing jobs to 404", async () => {
    mocks.getSourceJobDeletionPreview.mockRejectedValueOnce(new OriginClientError("Source job not found.", 404, "source_job_not_found", "request-1"));
    const response = await previewSourceJobDeletionRoute(request("GET") as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(404);
  });

  it("maps incorrect confirmation to 400", async () => {
    mocks.deleteSourceJob.mockRejectedValueOnce(new OriginClientError("Confirmation must exactly equal DELETE 1.", 400, "invalid_confirmation", "request-2"));
    const response = await deleteSourceJobRoute(request("DELETE", { confirmation: "delete 1" }) as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("exactly equal DELETE 1");
  });

  it("maps protected dependencies to 409 with blockers", async () => {
    mocks.deleteSourceJob.mockRejectedValueOnce(new OriginClientError(
      "Source job has protected downstream dependencies.",
      409,
      "source_job_deletion_blocked",
      "request-3",
      { blockers: ["1 canonical registry row depends on this source job."] },
    ));
    const response = await deleteSourceJobRoute(request("DELETE", { confirmation: "DELETE 1" }) as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(409);
    expect((await response.json()).details.blockers).toHaveLength(1);
  });

  it("deletes once and revalidates source, candidate, and review views", async () => {
    const response = await deleteSourceJobRoute(request("DELETE", { confirmation: "DELETE 1" }) as never, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteSourceJob).toHaveBeenCalledOnce();
    expect(mocks.deleteSourceJob).toHaveBeenCalledWith(1, "DELETE 1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mqchain/source-jobs");
  });

  it("keeps Origin routes permissioned and Vercel database-free", () => {
    const root = process.cwd();
    const origin = readFileSync(join(root, "origin/app.ts"), "utf8");
    const api = readFileSync(join(root, "src/app/api/mqchain/source-jobs/[id]/route.ts"), "utf8");
    expect(origin).toContain("/^\\/v1\\/source-jobs\\/(\\d+)\\/delete-preview$/");
    expect(origin).toContain("authorized(actor, \"intake:delete\"");
    expect(origin).toContain("deletePendingSourceJob");
    expect(api).not.toContain("@/db/");
    expect(api).not.toContain("drizzle-orm");
  });
});
