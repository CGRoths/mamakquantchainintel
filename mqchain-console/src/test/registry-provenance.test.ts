import { describe, expect, it } from "vitest";

import {
  buildRegistryCommitMetadata,
  projectCandidateRegistryProvenance,
  registrySourceRoleReference,
} from "@/lib/mqchain/registry-provenance";

describe("registry provenance", () => {
  it("projects exact source metadata into canonical snake-case keys", () => {
    expect(
      projectCandidateRegistryProvenance({
        sourceInputType: "deployment_json",
        contractName: "PoolProxy",
        roleSource: "PoolAddressesProvider proxy",
        source_role_label: "PoolProxy",
        source_role_labels: ["PoolProxy", "PoolAddressesProvider proxy"],
        sourceSheet: "Ethereum Mainnet",
        sourceUrl: "https://example.org/deployments.json",
        rawReference: "deployments.PoolProxy",
        source_type_overridden_by_file_extension: "xlsx",
        manual_policy_override: "official low-confidence reserve/core candidate",
        notes: "must remain staged",
        approvalDraft: { flags: 257 },
      }),
    ).toEqual({
      source_input_type: "deployment_json",
      contract_name: "PoolProxy",
      role_source: "PoolAddressesProvider proxy",
      source_role_label: "PoolProxy",
      source_role_labels: ["PoolProxy", "PoolAddressesProvider proxy"],
      source_sheet: "Ethereum Mainnet",
      source_url: "https://example.org/deployments.json",
      raw_reference: "deployments.PoolProxy",
      source_type_overridden_by_file_extension: "xlsx",
      manual_policy_override: "official low-confidence reserve/core candidate",
    });
  });

  it("does not normalize, deduplicate, or invent exact source-role labels", () => {
    expect(
      registrySourceRoleReference({
        source_role_label: " PoolProxy ",
        source_role_labels: ["PoolProxy", "PoolProxy", "pool_proxy", 7],
      }),
    ).toEqual({
      source_role_label: " PoolProxy ",
      source_role_labels: ["PoolProxy", "PoolProxy", "pool_proxy"],
    });

    expect(registrySourceRoleReference({ roleSource: "fallback must not become a source role label" })).toEqual({
      source_role_label: null,
      source_role_labels: [],
    });
  });

  it("builds the canonical metadata object written by batch commit", () => {
    expect(
      buildRegistryCommitMetadata({
        candidateMetadata: {
          source_role_label: "PoolProxy",
          source_role_labels: ["PoolProxy", "pool_proxy"],
          approvalDraft: { notes: "not canonical provenance" },
        },
        candidateId: 31,
        committedBy: "owner@example.org",
        labelAction: "supersede",
        supersedesRegistryId: 17,
        historicalOnly: false,
      }),
    ).toEqual({
      source_role_label: "PoolProxy",
      source_role_labels: ["PoolProxy", "pool_proxy"],
      candidateId: 31,
      committedBy: "owner@example.org",
      labelAction: "supersede",
      supersedesRegistryId: 17,
      historicalOnly: false,
    });
  });
});
