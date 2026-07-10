import { describe, expect, it } from "vitest";

import {
  DiscoveryJobNotCompletableError,
  assertDiscoveryJobCompletable,
} from "@/lib/mqchain/discovery-lifecycle";

describe("discovery completion lifecycle", () => {
  it("allows draft and running scanner jobs to complete", () => {
    expect(() => assertDiscoveryJobCompletable("draft")).not.toThrow();
    expect(() => assertDiscoveryJobCompletable("running")).not.toThrow();
  });

  it("blocks replay after completion or failure", () => {
    expect(() => assertDiscoveryJobCompletable("completed")).toThrow(DiscoveryJobNotCompletableError);
    expect(() => assertDiscoveryJobCompletable("failed")).toThrow("Only draft or running jobs accept results");
  });
});
