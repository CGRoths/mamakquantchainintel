import { describe, expect, it } from "vitest";

import { buildSupersededRegistryMetadata, inferSupersededValidToBlock } from "@/lib/mqchain/registry-lifecycle";

describe("registry lifecycle helpers", () => {
  it("uses an explicit superseded valid-to block first", () => {
    expect(
      inferSupersededValidToBlock(
        { validToBlock: 100, lastSeenBlock: 90 },
        { validFromBlock: 200, firstSeenBlock: 150 },
        123,
      ),
    ).toBe(123);
  });

  it("infers the old label end from replacement start when no explicit block exists", () => {
    expect(
      inferSupersededValidToBlock(
        { lastSeenBlock: 90 },
        { validFromBlock: 200, firstSeenBlock: 150 },
      ),
    ).toBe(199);
  });

  it("falls back to last-seen block when the replacement has no start block", () => {
    expect(inferSupersededValidToBlock({ lastSeenBlock: 90 }, { firstSeenBlock: 150 })).toBe(90);
  });

  it("adds supersede audit metadata without dropping existing object metadata", () => {
    const metadata = buildSupersededRegistryMetadata(
      { sourceRoleLabel: "old hot wallet" },
      {
        replacementRegistryId: 77,
        actorEmail: "reviewer@example.com",
        nowIso: "2026-07-02T00:00:00.000Z",
        reason: "new role approved",
      },
    );

    expect(metadata).toMatchObject({
      sourceRoleLabel: "old hot wallet",
      supersededByRegistryId: 77,
      supersededBy: "reviewer@example.com",
      supersededAt: "2026-07-02T00:00:00.000Z",
      supersessionReason: "new role approved",
    });
  });
});
