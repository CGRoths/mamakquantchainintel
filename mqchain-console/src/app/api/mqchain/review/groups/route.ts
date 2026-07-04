import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildReviewGroupListApiResponse } from "@/lib/mqchain/review-api";
import { getReviewGroupsWorkspace } from "@/lib/mqchain/services/review-service";

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
    const workspace = await getReviewGroupsWorkspace(Object.fromEntries(request.nextUrl.searchParams.entries()));

    return NextResponse.json(
      buildReviewGroupListApiResponse({
        query: {
          page: workspace.page,
          pageSize: workspace.pageSize,
          filters: workspace.filters,
        },
        totalPendingCandidates: workspace.rows.length,
        totalGroupsBeforeFilters: workspace.allGroups.length,
        total: workspace.total,
        totalPages: workspace.totalPages,
        rows: workspace.groups,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Review group list request failed.", 500);
  }
}
