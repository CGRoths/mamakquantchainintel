import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildRegistryExportApiResponse, buildRegistryExportCsv } from "@/lib/mqchain/registry-api";
import { listRegistry } from "@/lib/mqchain/origin-client/client";
import { registryExportApiFormatSchema } from "@/lib/mqchain/validators/registry";

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
    const format = registryExportApiFormatSchema.parse(query.format ?? "json");
    delete query.format;

    const result = await listRegistry(query);
    const payload = {
      query: {
        page: result.page,
        pageSize: result.pageSize,
        filters: result.filters,
      },
      rows: result.rows,
      total: result.total,
      totalPages: result.totalPages,
    };

    if (format === "csv") {
      return new NextResponse(buildRegistryExportCsv(payload), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="mqchain-registry-page-${result.page}.csv"`,
        },
      });
    }

    return NextResponse.json(buildRegistryExportApiResponse(payload));
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Registry export request failed.", 500);
  }
}
