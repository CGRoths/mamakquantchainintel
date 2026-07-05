import { describe, expect, it, vi } from "vitest";

import { assertFetchableSourceUrl, fetchSourceText, githubBlobToRawUrl, parseGithubTreeUrl } from "@/lib/mqchain/source-url";

describe("source URL guardrails", () => {
  it("rewrites GitHub blob URLs to raw URLs", () => {
    expect(githubBlobToRawUrl("https://github.com/org/repo/blob/main/deployments.json")).toBe(
      "https://raw.githubusercontent.com/org/repo/main/deployments.json",
    );
  });

  it("parses GitHub tree URLs for deployment directories", () => {
    expect(parseGithubTreeUrl("https://github.com/compound-finance/comet/tree/main/deployments/base/usdc")).toMatchObject({
      owner: "compound-finance",
      repo: "comet",
      ref: "main",
      path: "deployments/base/usdc",
    });
  });

  it("blocks non-http, credentialed, localhost, and private literal URLs", () => {
    expect(() => assertFetchableSourceUrl("ftp://example.com/file.csv")).toThrow("HTTP or HTTPS");
    expect(() => assertFetchableSourceUrl("https://user:pass@example.com/file.csv")).toThrow("embedded credentials");
    expect(() => assertFetchableSourceUrl("http://localhost:3000/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://192.168.1.10/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://100.64.0.10/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://198.18.0.1/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://224.0.0.1/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://169.254.169.254/latest/meta-data")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://[fc00::1]/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://[fd12::1]/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://[fe80::1]/admin")).toThrow("private network");
    expect(() => assertFetchableSourceUrl("http://[::ffff:127.0.0.1]/admin")).toThrow("private network");
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

  it("fetches supported files from GitHub tree URLs as a bounded deployment source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              type: "file",
              name: "configuration.json",
              path: "deployments/base/usdc/configuration.json",
              size: 64,
              download_url: "https://raw.githubusercontent.com/compound-finance/comet/main/deployments/base/usdc/configuration.json",
            },
            {
              type: "file",
              name: "logo.png",
              path: "deployments/base/usdc/logo.png",
              size: 12,
              download_url: "https://raw.githubusercontent.com/compound-finance/comet/main/deployments/base/usdc/logo.png",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response('{"comet":"0x0000000000000000000000000000000000000001"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSourceText("https://github.com/compound-finance/comet/tree/main/deployments/base/usdc")).resolves.toMatchObject({
      contentType: "text/x-mqchain-github-directory",
      fetchedUrl: "https://github.com/compound-finance/comet/tree/main/deployments/base/usdc",
      rawText: expect.stringContaining("MQCHAIN_GITHUB_FILE owner=compound-finance repo=comet ref=main path=deployments/base/usdc/configuration.json"),
      metadata: expect.objectContaining({
        githubDirectory: true,
        githubOwner: "compound-finance",
        githubRepo: "comet",
        githubDirectoryPath: "deployments/base/usdc",
        githubDirectoryWarnings: ["github_directory_unsupported_file_skipped"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
