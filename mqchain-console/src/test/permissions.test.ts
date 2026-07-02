import { describe, expect, it } from "vitest";

import { ROLE_PERMISSIONS } from "@/lib/mqchain/constants";

describe("role permissions", () => {
  it("allows operators and analysts to create discovery jobs", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("discovery:create");
    expect(ROLE_PERMISSIONS.admin).toContain("discovery:create");
    expect(ROLE_PERMISSIONS.analyst).toContain("discovery:create");
  });

  it("keeps review-only and readonly roles out of discovery mutation paths", () => {
    expect(ROLE_PERMISSIONS.reviewer).not.toContain("discovery:create");
    expect(ROLE_PERMISSIONS.readonly).not.toContain("discovery:create");
  });
});
