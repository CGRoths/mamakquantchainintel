import { describe, expect, it } from "vitest";

import {
  BATCH_LABEL_ACTIONS,
  BATCH_STATUSES,
  CANDIDATE_STATUSES,
  DISCOVERY_JOB_STATUSES,
  KV_ARTIFACT_STATUSES,
  KV_BUILD_REGISTRATION_STATUSES,
  SOURCE_JOB_STATUSES,
  SOURCE_TYPES,
  SOURCE_VERIFICATION_SCOPES,
  SOURCE_VERIFICATION_STATUSES,
} from "@/lib/mqchain/constants";
import { createKvBuildManifestSchema, kvBuildRegistrationApiRequestSchema } from "@/lib/mqchain/validators/kv-manifest";
import { sourceVerificationSchema } from "@/lib/mqchain/validators/source-job";

describe("MQCHAIN lifecycle contracts", () => {
  it("keeps source, candidate, batch, discovery, and KV statuses explicit", () => {
    expect(SOURCE_TYPES).toEqual([
      "csv_upload",
      "manual_input",
      "official_url",
      "pdf",
      "github",
      "explorer",
      "arkham_reference",
      "llm_cleaned_csv",
      "json_evidence",
      "ml_discovery",
      "onchain_discovery",
    ]);
    expect(SOURCE_JOB_STATUSES).toEqual(["draft", "normalized", "extracted", "candidate_created", "failed", "archived"]);
    expect(CANDIDATE_STATUSES).toEqual([
      "pending_review",
      "needs_more_evidence",
      "approved",
      "rejected",
      "conflict_pending",
      "duplicate",
      "superseded",
    ]);
    expect(BATCH_STATUSES).toEqual(["draft", "pending_approval", "approved", "writing", "committed", "failed", "superseded"]);
    expect(BATCH_LABEL_ACTIONS).toEqual(["create", "update", "supersede", "deactivate", "mark_historical"]);
    expect(DISCOVERY_JOB_STATUSES).toEqual(["draft", "running", "completed", "failed"]);
    expect(KV_ARTIFACT_STATUSES).toEqual(["pending", "compiled", "active", "failed", "superseded"]);
  });

  it("keeps source verification scopes and statuses shared by validation", () => {
    expect(SOURCE_VERIFICATION_SCOPES).toEqual(["source_job", "source_document", "source_sheet", "source_url"]);
    expect(SOURCE_VERIFICATION_STATUSES).toEqual(["verified", "rejected", "revoked"]);
    expect(
      sourceVerificationSchema.parse({
        sourceJobId: 1,
        verificationScope: "source_sheet",
        sourceSheet: "BTC",
        status: "revoked",
      }).status,
    ).toBe("revoked");
    expect(() => sourceVerificationSchema.parse({ sourceJobId: 1, verificationScope: "global_source" })).toThrow();
  });

  it("allows registration only for pre-activation KV build states", () => {
    expect(KV_BUILD_REGISTRATION_STATUSES).toEqual(["pending", "compiled", "failed"]);
    expect(createKvBuildManifestSchema.parse({ manifestJson: "{}" }).status).toBe("compiled");
    expect(kvBuildRegistrationApiRequestSchema.parse({ status: "pending", manifest: {} }).status).toBe("pending");
    expect(() => kvBuildRegistrationApiRequestSchema.parse({ status: "active", manifest: {} })).toThrow();
    expect(() => createKvBuildManifestSchema.parse({ status: "superseded", manifestJson: "{}" })).toThrow();
  });
});
