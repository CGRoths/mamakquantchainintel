import { NextRequest, NextResponse } from "next/server";

import { assertPermission, requireSignedIn } from "@/lib/auth/permissions";
import { getSourceJobDeletionPreview } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSignedIn();
  } catch {
    return errorResponse("Authentication required.", 401);
  }

  try {
    await assertPermission("intake:delete");
  } catch {
    return errorResponse("Source job deletion permission required.", 403);
  }

  const { id } = await params;
  const sourceJobId = Number(id);
  if (!Number.isInteger(sourceJobId) || sourceJobId <= 0) return errorResponse("Source job id must be a positive integer.", 400);

  try {
    return NextResponse.json(await getSourceJobDeletionPreview(sourceJobId));
  } catch (error) {
    if (error instanceof OriginClientError) return errorResponse(error.message, error.status, error.details);
    return errorResponse(error instanceof Error ? error.message : "Source job deletion preview failed.", 500);
  }
}
