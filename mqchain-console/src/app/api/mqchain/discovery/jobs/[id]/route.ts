import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildDiscoveryJobDetailApiResponse } from "@/lib/mqchain/discovery-api";
import { getDiscoveryJobDetail } from "@/lib/mqchain/origin-client/client";

export const dynamic = "force-dynamic";

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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  const { id } = await params;
  const jobId = Number(id);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return errorResponse("Discovery job id must be a positive integer.", 400);
  }

  try {
    const detail = await getDiscoveryJobDetail(jobId);

    if (!detail) {
      return errorResponse("Discovery job not found.", 404);
    }

    return NextResponse.json(buildDiscoveryJobDetailApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Discovery job detail request failed.", 500);
  }
}
