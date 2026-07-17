import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildReviewWorkspaceApiResponse } from "@/lib/mqchain/review-api";
import { getReviewWorkspace } from "@/lib/mqchain/origin-client/client";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function validationError(error: ZodError) {
  return errorResponse("Validation failed.", 400, error.flatten());
}

async function assertAuthenticated() {
  try {
    await assertPermission("view");
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const workspace = await getReviewWorkspace(Object.fromEntries(request.nextUrl.searchParams.entries()));

    return NextResponse.json(
      buildReviewWorkspaceApiResponse({
        query: {
          page: workspace.pending.page,
          approvedPage: workspace.approved.page,
          pageSize: workspace.filters.pageSize,
          filters: workspace.filters,
        },
        counts: workspace.counts,
        pending: workspace.pending,
        pendingRows: workspace.pendingRows,
        approved: workspace.approved,
        approvedRows: workspace.approvedRows,
        groups: workspace.groups,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Review workspace request failed.", 500);
  }
}
