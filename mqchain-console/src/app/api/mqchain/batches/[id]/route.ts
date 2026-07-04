import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildBatchExportApiResponse } from "@/lib/mqchain/batch-api";
import { getBatchDetail } from "@/lib/mqchain/services/batch-service";

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
  const batchId = Number(id);

  if (!Number.isInteger(batchId) || batchId <= 0) {
    return errorResponse("Batch id must be a positive integer.", 400);
  }

  try {
    const detail = await getBatchDetail(batchId);
    if (!detail) {
      return errorResponse("Batch not found.", 404);
    }

    return NextResponse.json(buildBatchExportApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Batch export request failed.", 500);
  }
}
