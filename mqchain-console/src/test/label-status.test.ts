import { describe, expect, it } from "vitest";

import { LABEL_STATUS, LABEL_STATUS_MAX, LABEL_STATUS_MIN } from "@/lib/mqchain/constants";
import { approvalEditSchema } from "@/lib/mqchain/validators/approval";
import { registryEditSchema } from "@/lib/mqchain/validators/registry";

const baseApprovalInput = {
  candidateId: "1",
  entityId: "2",
  roleId: "1000",
  confidenceScore: "85",
  qualityTier: "1",
};

const baseRegistryInput = {
  registryId: "1",
  entityId: "2",
  roleId: "1000",
  confidenceScore: "85",
  qualityTier: "1",
};

describe("label status contract", () => {
  it("matches the required 0 through 9 status range", () => {
    expect(LABEL_STATUS_MIN).toBe(LABEL_STATUS.unknown);
    expect(LABEL_STATUS_MAX).toBe(LABEL_STATUS.sanctionedHistorical);
  });

  it("defaults operator mutations to active current labels", () => {
    expect(approvalEditSchema.parse(baseApprovalInput).labelStatus).toBe(LABEL_STATUS.activeCurrent);
    expect(registryEditSchema.parse(baseRegistryInput).labelStatus).toBe(LABEL_STATUS.activeCurrent);
  });

  it("accepts sanctioned historical status 9 in operator mutation validators", () => {
    expect(approvalEditSchema.parse({ ...baseApprovalInput, labelStatus: "9" }).labelStatus).toBe(9);
    expect(registryEditSchema.parse({ ...baseRegistryInput, labelStatus: "9" }).labelStatus).toBe(9);
  });

  it("rejects label statuses outside the required range", () => {
    expect(() => approvalEditSchema.parse({ ...baseApprovalInput, labelStatus: "-1" })).toThrow();
    expect(() => registryEditSchema.parse({ ...baseRegistryInput, labelStatus: "10" })).toThrow();
  });
});
