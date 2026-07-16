import { describe, expect, it, vi } from "vitest";

import { POST as completeDiscoveryJob } from "@/app/api/mqchain/discovery/jobs/[id]/complete/route";
import { POST as registerKvBuild } from "@/app/api/mqchain/kv-builds/route";
import { PATCH as reviewNetworkProposal, POST as createNetworkProposal } from "@/app/api/mqchain/network-support/route";
import { POST as classifyResolverFlow } from "@/app/api/mqchain/resolver/route";
import { POST as createSourceJob } from "@/app/api/mqchain/source-jobs/route";
import { DISCOVERY_RESULTS_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/discovery";
import { KV_BUILD_REGISTRATION_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/kv-manifest";
import { NETWORK_PROPOSAL_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/network-support";
import { RESOLVER_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/resolver-api";
import { SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/intake";

vi.mock("@/lib/auth/permissions", () => ({
  assertPermission: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000001",
    email: "owner@mamakquant.local",
    role: "owner",
  })),
}));

type JsonPostCase = {
  name: string;
  maxBytes: number;
  post: (request: Request) => Promise<Response>;
};

function requestWithBody(body: string) {
  return new Request("https://mamakquant.local/api/mqchain/test", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

const jsonPostCases: JsonPostCase[] = [
  {
    name: "source job intake",
    maxBytes: SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES,
    post: (request) => createSourceJob(request as never),
  },
  {
    name: "KV build registration",
    maxBytes: KV_BUILD_REGISTRATION_API_MAX_BODY_BYTES,
    post: (request) => registerKvBuild(request as never),
  },
  {
    name: "resolver CEX flow",
    maxBytes: RESOLVER_API_MAX_BODY_BYTES,
    post: (request) => classifyResolverFlow(request as never),
  },
  {
    name: "discovery completion",
    maxBytes: DISCOVERY_RESULTS_API_MAX_BODY_BYTES,
    post: (request) => completeDiscoveryJob(request as never, { params: Promise.resolve({ id: "1" }) }),
  },
  {
    name: "network change proposal",
    maxBytes: NETWORK_PROPOSAL_API_MAX_BODY_BYTES,
    post: (request) => createNetworkProposal(request as never),
  },
  {
    name: "network proposal review",
    maxBytes: NETWORK_PROPOSAL_API_MAX_BODY_BYTES,
    post: (request) => reviewNetworkProposal(request as never),
  },
];

describe("MQCHAIN JSON API route body handling", () => {
  it.each(jsonPostCases)("returns 400 for malformed JSON in $name", async ({ post }) => {
    const response = await post(requestWithBody("{bad json"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "Request body must be valid JSON." });
  });

  it.each(jsonPostCases)("returns 413 for oversized JSON bodies in $name", async ({ maxBytes, post }) => {
    const response = await post(requestWithBody(" ".repeat(maxBytes + 1)));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toContain(`Request body exceeds ${maxBytes} bytes.`);
  });
});
