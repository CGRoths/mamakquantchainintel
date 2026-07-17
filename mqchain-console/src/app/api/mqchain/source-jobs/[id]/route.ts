import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildSourceJobExportApiResponse } from "@/lib/mqchain/source-job-api";
import { getSourceJob } from "@/lib/mqchain/origin-client/client";

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
  const sourceJobId = Number(id);

  if (!Number.isInteger(sourceJobId) || sourceJobId <= 0) {
    return errorResponse("Source job id must be a positive integer.", 400);
  }

  try {
    const detail = await getSourceJob(sourceJobId);
    if (!detail) {
      return errorResponse("Source job not found.", 404);
    }

    return NextResponse.json(buildSourceJobExportApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Source job export request failed.", 500);
  }
}
