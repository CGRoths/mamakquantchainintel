import { describe, expect, it, vi } from "vitest";

import { assertFetchableSourceUrl, fetchSourceText, githubBlobToRawUrl } from "@/lib/mqchain/source-url";

describe("source URL guardrails", () => {
  it("rewrites GitHub blob URLs to raw URLs", () => {
    expect(githubBlobToRawUrl("https://github.com/org/repo/blob/main/deployments.json")).toBe(
      "https://raw.githubusercontent.com/org/repo/main/deployments.json",
    );
  });

  it("blocks non-http, credentialed, localhost, and private literal URLs", () => {
    expect(() => assertFetchableSourceUrl("ftp://example.com/file.csv")).toThrow("HTTP or HTTPS");
    expect(() => assertFetchableSourceUrl("https://user:pass@example.com/file.csv")).toThrow("embedded credentials");
    expect(() => assertFetchableSourceUrl("http://localhost:3000/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://192.168.1.10/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://169.254.169.254/latest/meta-data")).toThrow("private network");
  });

  it("follows only bounded validated redirects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://docs.example.test/deployments" },
        }),
      )
      .mockResolvedValueOnce(new Response("0x0000000000000000000000000000000000000001", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSourceText("https://example.test/start")).resolves.toMatchObject({
      rawText: "0x0000000000000000000000000000000000000001",
      fetchedUrl: "",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it("blocks redirects to private network addresses before the second fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1:3000/internal" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSourceText("https://example.test/start")).rejects.toThrow("private network");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("rejects oversized source responses using content length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("too large", {
          status: 200,
          headers: { "content-length": "1000001" },
        }),
      ),
    );

    await expect(fetchSourceText("https://example.test/large")).rejects.toThrow("exceeds");

    vi.unstubAllGlobals();
  });
});
