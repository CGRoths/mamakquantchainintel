import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildReviewGroupDetailApiResponse } from "@/lib/mqchain/review-api";
import { getReviewGroupDetail } from "@/lib/mqchain/origin-client/client";

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
  const slug = decodeURIComponent(id).trim();

  if (!slug) {
    return errorResponse("Review group id is required.", 400);
  }

  try {
    const detail = await getReviewGroupDetail(slug);
    if (!detail.group) {
      return errorResponse("Review group not found.", 404);
    }

    return NextResponse.json(buildReviewGroupDetailApiResponse({ slug, ...detail }));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Review group detail request failed.", 500);
  }
}
