import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/permissions", () => ({
  assertPermission: vi.fn(),
}));

import { assertPermission } from "@/lib/auth/permissions";
import { POST } from "@/app/api/mqchain/kv-builds/route";
import type { NextRequest } from "next/server";

const mockedAssertPermission = vi.mocked(assertPermission);

function postRequest(body: unknown) {
  return new Request("http://localhost/api/mqchain/kv-builds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("KV build registration authorization", () => {
  beforeEach(() => {
    mockedAssertPermission.mockReset();
  });

  it("normalizes a forbidden mutation to HTTP 403 instead of 500", async () => {
    // A signed-in user without batch:commit: the shared guard throws before any DB work.
    mockedAssertPermission.mockRejectedValueOnce(new Error("You do not have permission to perform this action."));

    const response = await POST(postRequest({ rowCount: 1, manifestJson: { indexes: [] } }));

    expect(response.status).toBe(403);
    expect(mockedAssertPermission).toHaveBeenCalledWith("batch:commit");
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("permission") });
  });

  it("gates the KV build registration mutation on batch:commit before reading the body", async () => {
    mockedAssertPermission.mockRejectedValueOnce(new Error("forbidden"));

    // An intentionally unparseable body proves the permission gate runs first: a 400/500 body
    // error would mean the guard ran too late.
    const badBody = new Request("http://localhost/api/mqchain/kv-builds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }) as unknown as NextRequest;

    const response = await POST(badBody);

    expect(response.status).toBe(403);
  });
});
