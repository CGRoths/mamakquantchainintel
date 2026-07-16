import { describe, expect, it } from "vitest";

import { networkChangeProposalSchema, networkChangeReviewSchema } from "@/lib/mqchain/validators/network-support";

describe("network support governance", () => {
  it("requires existing-network proposals to identify the stable network ID", () => {
    expect(() => networkChangeProposalSchema.parse({ changeType: "activate", proposedValues: {}, reason: "Activate after manual review." })).toThrow(/network ID/i);
    expect(networkChangeProposalSchema.parse({ changeType: "activate", networkId: 49, proposedValues: {}, reason: "Activate after manual review." }).networkId).toBe(49);
  });

  it("allocates create proposal IDs only at apply time", () => {
    expect(() => networkChangeProposalSchema.parse({ changeType: "create", networkId: 49, proposedValues: {}, reason: "Create from official evidence." })).toThrow(/allocate the next stable ID/i);
    expect(networkChangeProposalSchema.parse({ changeType: "create", proposedValues: { networkCode: "new_chain" }, reason: "Create from official evidence." }).networkId).toBeUndefined();
  });

  it("accepts only explicit review actions", () => {
    expect(networkChangeReviewSchema.parse({ proposalId: 1, action: "apply" }).action).toBe("apply");
    expect(() => networkChangeReviewSchema.parse({ proposalId: 1, action: "auto_activate" })).toThrow();
  });
});
