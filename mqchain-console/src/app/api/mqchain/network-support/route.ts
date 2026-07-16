import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import {
  createNetworkChangeProposal,
  getNetworkCatalogDrift,
  listNetworkSupportMatrix,
  reviewNetworkChangeProposal,
} from "@/lib/mqchain/services/network-support-service";
import { NETWORK_PROPOSAL_API_MAX_BODY_BYTES } from "@/lib/mqchain/validators/network-support";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET() {
  try {
    await assertPermission("view");
  } catch {
    return errorResponse("Authentication required.", 401);
  }
  try {
    const [matrix, drift] = await Promise.all([listNetworkSupportMatrix(), getNetworkCatalogDrift()]);
    return NextResponse.json({ schemaVersion: "MQCHAIN-NETWORK-SUPPORT-1", matrix, drift });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Network support request failed.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertPermission("network:propose");
    const proposal = await createNetworkChangeProposal(await readBoundedJsonBody(request, NETWORK_PROPOSAL_API_MAX_BODY_BYTES));
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof SyntaxError) return errorResponse("Request body must be valid JSON.", 400);
    if (error instanceof Error && error.message.includes("permission")) return errorResponse("Network proposal permission required.", 403);
    return errorResponse(error instanceof Error ? error.message : "Network proposal failed.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await assertPermission("network:review");
    const proposal = await reviewNetworkChangeProposal(await readBoundedJsonBody(request, NETWORK_PROPOSAL_API_MAX_BODY_BYTES));
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof SyntaxError) return errorResponse("Request body must be valid JSON.", 400);
    if (error instanceof Error && error.message.includes("permission")) return errorResponse("Network review permission required.", 403);
    return errorResponse(error instanceof Error ? error.message : "Network proposal review failed.", 500);
  }
}
