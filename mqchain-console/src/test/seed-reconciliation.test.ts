import { describe, expect, it } from "vitest";

import { planStableDictionaryIds } from "@/lib/mqchain/seed-reconciliation";

describe("seed dictionary reconciliation", () => {
  it("preserves existing IDs by stable code", () => {
    expect(
      planStableDictionaryIds(
        [
          { preferredId: 100, code: "cex" },
          { preferredId: 200, code: "defi" },
        ],
        [
          { id: 1, code: "cex" },
          { id: 5, code: "defi" },
        ],
      ),
    ).toEqual([
      { id: 1, code: "cex", exists: true },
      { id: 5, code: "defi", exists: true },
    ]);
  });

  it("uses preferred IDs for new codes and collision-free fallbacks when occupied", () => {
    expect(
      planStableDictionaryIds(
        [
          { preferredId: 100, code: "cex" },
          { preferredId: 200, code: "defi" },
          { preferredId: 300, code: "bridge" },
        ],
        [{ id: 200, code: "legacy" }],
      ),
    ).toEqual([
      { id: 100, code: "cex", exists: false },
      { id: 301, code: "defi", exists: false },
      { id: 300, code: "bridge", exists: false },
    ]);
  });
});
