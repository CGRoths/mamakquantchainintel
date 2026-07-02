import { describe, expect, it } from "vitest";

import { extractAddressRowsFromText, extractDeploymentRowsFromText, parseJsonEvidenceRows, stripHtmlToText } from "@/lib/mqchain/intake-extraction";

describe("intake extraction helpers", () => {
  it("strips HTML and extracts EVM addresses", () => {
    const text = stripHtmlToText("<html><body><p>Vault 0x000000000000000000000000000000000000dEaD</p></body></html>");
    const rows = extractAddressRowsFromText(text, {
      entityHint: "example",
      protocolHint: "example_v1",
      roleHint: "protocol_vault",
      sourceUrl: "https://example.test/docs",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        address: "0x000000000000000000000000000000000000dEaD",
        chain: "ethereum",
        entity: "example",
        protocol: "example_v1",
        role: "protocol_vault",
      }),
    ]);
  });

  it("extracts JSON evidence rows with flexible field names", () => {
    const rows = parseJsonEvidenceRows(
      JSON.stringify({
        candidates: [
          {
            contractAddress: "0x0000000000000000000000000000000000000001",
            network: "ethereum",
            source_role_label: "protocol_factory",
            confidence_score: 91,
            summary: "Official deployment table",
          },
        ],
      }),
      { sourceName: "Official docs" },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        address: "0x0000000000000000000000000000000000000001",
        chain: "ethereum",
        role: "protocol_factory",
        confidence: 91,
        notes: "Official deployment table",
        source_name: "Official docs",
      }),
    ]);
  });

  it("extracts deployment context from Solidity constants", () => {
    const rows = extractDeploymentRowsFromText(
      "pragma solidity ^0.8.0;\naddress public constant PoolAddressesProvider = 0x0000000000000000000000000000000000000001;",
      {
        sourceType: "github",
        sourceUrl: "https://github.com/aave/protocol/blob/main/Deployments.sol",
        entityHint: "aave",
        protocolHint: "aave_v3",
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        address: "0x0000000000000000000000000000000000000001",
        chain: "ethereum",
        entity: "aave",
        protocol: "aave_v3",
        role: "protocol_registry",
        evidence_type: "github_deployment",
        trust_tier: "official",
        source_input_type: "github_solidity_address_book",
        contract_name: "PoolAddressesProvider",
        raw_reference: expect.objectContaining({
          contract_name: "PoolAddressesProvider",
          line_number: 2,
        }),
      }),
    ]);
  });

  it("extracts deployment rows from markdown tables", () => {
    const rows = extractDeploymentRowsFromText(
      "| Chain | Contract | Address |\n| --- | --- | --- |\n| Base | Vault | 0x0000000000000000000000000000000000000002 |",
      { sourceType: "official_url", sourceUrl: "https://docs.example.test/deployments" },
    );

    expect(rows[0]).toMatchObject({
      address: "0x0000000000000000000000000000000000000002",
      chain: "base",
      role: "protocol_vault",
      contract_name: "Vault",
      evidence_type: "official_page",
    });
  });

  it("preserves nested JSON deployment paths as raw references", () => {
    const rows = parseJsonEvidenceRows(
      JSON.stringify({
        deployments: {
          ethereum: {
            Router: "0x0000000000000000000000000000000000000003",
          },
        },
      }),
      { sourceName: "Deployment JSON", sourceUrl: "https://docs.example.test/deployments.json" },
    );

    expect(rows[0]).toMatchObject({
      address: "0x0000000000000000000000000000000000000003",
      chain: "ethereum",
      role: "protocol_router",
      contract_name: "Router",
      raw_reference: expect.objectContaining({
        json_path: "deployments.ethereum.Router",
        contract_name: "Router",
      }),
    });
  });

  it("rejects invalid JSON evidence", () => {
    expect(() => parseJsonEvidenceRows("{nope")).toThrow("valid JSON");
  });
});
