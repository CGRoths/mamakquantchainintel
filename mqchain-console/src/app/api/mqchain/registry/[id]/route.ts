import { NextRequest, NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildRegistryDetailExportApiResponse } from "@/lib/mqchain/registry-api";
import { getRegistryDetail } from "@/lib/mqchain/origin-client/client";

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
  const registryId = Number(id);

  if (!Number.isInteger(registryId) || registryId <= 0) {
    return errorResponse("Registry id must be a positive integer.", 400);
  }

  try {
    const detail = await getRegistryDetail(registryId);
    if (!detail) {
      return errorResponse("Registry row not found.", 404);
    }

    return NextResponse.json(buildRegistryDetailExportApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Registry detail export request failed.", 500);
  }
}
