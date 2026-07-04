import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildAuditTimelineExportApiResponse } from "@/lib/mqchain/audit-api";
import { listAuditTimeline } from "@/lib/mqchain/services/audit-service";

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
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    const timeline = await listAuditTimeline(query);

    return NextResponse.json(
      buildAuditTimelineExportApiResponse({
        query: {
          page: timeline.page,
          pageSize: timeline.pageSize,
          filters: timeline.filters,
        },
        rows: timeline.rows,
        approvalEvents: timeline.approvalEvents,
        auditRows: timeline.auditRows,
        total: timeline.total,
        approvalTotal: timeline.approvalTotal,
        systemTotal: timeline.systemTotal,
        totalPages: timeline.totalPages,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Audit timeline export request failed.", 500);
  }
}
