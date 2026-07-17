import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildKvBuildDetailApiResponse } from "@/lib/mqchain/kv-serving-api";
import { getKvBuildDetail } from "@/lib/mqchain/origin-client/client";

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
  const buildId = Number(id);

  if (!Number.isInteger(buildId) || buildId <= 0) {
    return errorResponse("KV build id must be a positive integer.", 400);
  }

  try {
    const detail = await getKvBuildDetail(buildId);

    if (!detail) {
      return errorResponse("KV build manifest not found.", 404);
    }

    return NextResponse.json(buildKvBuildDetailApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "KV build detail request failed.", 500);
  }
}
