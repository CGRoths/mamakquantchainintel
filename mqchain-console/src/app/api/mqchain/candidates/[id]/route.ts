import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildCandidateDetailExportApiResponse } from "@/lib/mqchain/candidate-api";
import { getCandidateDetail } from "@/lib/mqchain/origin-client/client";

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
  const candidateId = Number(id);

  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return errorResponse("Candidate id must be a positive integer.", 400);
  }

  try {
    const detail = await getCandidateDetail(candidateId);
    if (!detail) {
      return errorResponse("Candidate not found.", 404);
    }

    return NextResponse.json(buildCandidateDetailExportApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Candidate detail export request failed.", 500);
  }
}
