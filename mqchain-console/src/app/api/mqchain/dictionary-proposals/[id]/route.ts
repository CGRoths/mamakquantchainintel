import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission, requireSignedIn } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { reviewDictionaryProposal } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { dictionaryProposalReviewSchema } from "@/lib/mqchain/validators/dictionary-proposal";

const MAX_BODY_BYTES = 64 * 1024;
const errorResponse = (error: string, status: number, details?: unknown) => NextResponse.json({ error, details }, { status });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireSignedIn(); }
  catch { return errorResponse("Authentication required.", 401); }
  try { await assertPermission("dictionary:edit"); }
  catch { return errorResponse("Dictionary edit permission required.", 403); }
  try {
    const { id } = await params;
    const input = dictionaryProposalReviewSchema.parse({ ...(await readBoundedJsonBody(request, MAX_BODY_BYTES) as Record<string, unknown>), proposalId: id });
    return NextResponse.json(await reviewDictionaryProposal(input));
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof OriginClientError) return errorResponse(error.message, error.status, error.details);
    return errorResponse(error instanceof Error ? error.message : "Proposal review failed.", 500);
  }
}
