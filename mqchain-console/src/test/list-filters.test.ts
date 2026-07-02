import { describe, expect, it } from "vitest";

import { parseCandidateListFilters, parseRegistryListFilters } from "@/lib/mqchain/list-filters";

describe("operator list filters", () => {
  it("normalizes candidate list filters from query strings", () => {
    const filters = parseCandidateListFilters({
      q: " 0xabc ",
      chain: "",
      minConfidence: "70",
      page: "2",
      pageSize: "100",
      sort: "confidence",
      conflicts: "true",
    });

    expect(filters.q).toBe("0xabc");
    expect(filters.chain).toBeUndefined();
    expect(filters.minConfidence).toBe(70);
    expect(filters.page).toBe(2);
    expect(filters.pageSize).toBe(100);
    expect(filters.sort).toBe("confidence");
    expect(filters.conflicts).toBe("true");
  });

  it("clamps invalid page sizes through validation", () => {
    expect(() => parseCandidateListFilters({ pageSize: "500" })).toThrow();
    expect(() => parseRegistryListFilters({ pageSize: "5" })).toThrow();
  });

  it("defaults registry filters to active newest rows", () => {
    const filters = parseRegistryListFilters({});

    expect(filters.active).toBe("active");
    expect(filters.sort).toBe("created_at");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(50);
  });
});
