import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { previewBulkCandidateApproval } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { BULK_APPROVAL_MAX_CANDIDATES } from "@/lib/mqchain/validators/bulk-approval";

export const dynamic = "force-dynamic";

/** Enough for 10,000 candidate IDs plus mode. */
const MAX_BODY_BYTES = 512 * 1024;

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function assertAuthenticated() {
  try {
    await assertPermission("view");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    await assertPermission("candidate:review");
  } catch {
    return errorResponse("You do not have permission to preview bulk candidate approval.", 403);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return errorResponse(`Request body is too large; select at most ${BULK_APPROVAL_MAX_CANDIDATES} candidates.`, 413);
  }

  let body: unknown;
  try {
    body = rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    return errorResponse("Request body must be a JSON object.", 400);
  }

  try {
    return NextResponse.json(await previewBulkCandidateApproval(body));
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse("Validation failed.", 400, error.flatten());
    }
    if (error instanceof OriginClientError) {
      return errorResponse(error.message, error.status, error.details);
    }

    // Never surface internal database or driver errors to the client.
    return errorResponse("Bulk approval preview failed.", 500);
  }
}
