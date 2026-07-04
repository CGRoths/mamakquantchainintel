import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildMetricGroupMembershipApiResponse, buildMetricGroupMembershipCsv } from "@/lib/mqchain/metric-group-api";
import { previewMetricGroupMembersByCode } from "@/lib/mqchain/services/metric-group-service";
import { metricGroupCodeParamSchema, metricGroupMembershipApiQuerySchema } from "@/lib/mqchain/validators/resolver-api";

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

function csvDownloadFilename(metricGroupCode: string, page: number) {
  const safeCode = metricGroupCode.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "metric-group";
  return `${safeCode}-members-page-${page}.csv`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const { code } = await params;
    const metricGroupCode = metricGroupCodeParamSchema.parse(decodeURIComponent(code));
    const query = metricGroupMembershipApiQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const preview = await previewMetricGroupMembersByCode(metricGroupCode);

    if (!preview) {
      return errorResponse("Metric group not found.", 404);
    }

    const payload = {
      query: {
        metricGroupCode,
        page: query.page,
        pageSize: query.pageSize,
      },
      group: preview.group,
      members: preview.members,
      diagnostics: preview.diagnostics,
      manifest: preview.manifest,
      kvManifest: preview.kvManifest,
    };

    if (query.format === "csv") {
      return new NextResponse(buildMetricGroupMembershipCsv(payload), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${csvDownloadFilename(metricGroupCode, query.page)}"`,
        },
      });
    }

    return NextResponse.json(buildMetricGroupMembershipApiResponse(payload));
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Metric group membership request failed.", 500);
  }
}
