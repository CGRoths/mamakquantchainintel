import { describe, expect, it } from "vitest";
import { z } from "zod";

import { runAction } from "@/lib/mqchain/services/service-utils";

describe("server action result helpers", () => {
  it("returns structured success data", async () => {
    await expect(runAction(() => ({ sourceJobId: 42 }))).resolves.toEqual({
      ok: true,
      data: { sourceJobId: 42 },
    });
  });

  it("returns field errors for Zod validation failures", async () => {
    const result = await runAction(() => z.object({ sourceUrl: z.string().url() }).parse({ sourceUrl: "not-a-url" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Validation failed.");
      expect(result.fieldErrors?.sourceUrl?.[0]).toBeTruthy();
    }
  });

  it("returns operator-safe error messages for thrown errors", async () => {
    await expect(runAction(() => {
      throw new Error("Source URL cannot resolve to a private network address.");
    })).resolves.toEqual({
      ok: false,
      error: "Source URL cannot resolve to a private network address.",
    });
  });

  it("rethrows Next control-flow errors", async () => {
    const redirectError = { digest: "NEXT_REDIRECT;push;/mqchain/source-jobs/1;307;" };

    await expect(runAction(() => {
      throw redirectError;
    })).rejects.toBe(redirectError);
  });
});
