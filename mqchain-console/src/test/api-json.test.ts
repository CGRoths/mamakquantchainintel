import { describe, expect, it } from "vitest";

import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";

function jsonRequest(body: string) {
  return new Request("https://mamakquant.local/api", {
    method: "POST",
    body,
  });
}

describe("bounded JSON request reader", () => {
  it("parses JSON bodies within the byte limit", async () => {
    await expect(readBoundedJsonBody(jsonRequest('{"ok":true}'), 20)).resolves.toEqual({ ok: true });
  });

  it("rejects bodies over the UTF-8 byte limit", async () => {
    const body = '{"symbol":"µ"}';
    const bytes = new TextEncoder().encode(body).byteLength;

    await expect(readBoundedJsonBody(jsonRequest(body), bytes - 1)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it("lets JSON syntax errors propagate for route-level 400 responses", async () => {
    await expect(readBoundedJsonBody(jsonRequest("{bad json"), 100)).rejects.toBeInstanceOf(SyntaxError);
  });
});
