import { NextResponse } from "next/server";

import { assertPermission } from "@/lib/auth/permissions";
import { buildKvServingManifestApiResponse } from "@/lib/mqchain/kv-serving-api";
import { getActiveKvBuildDetail } from "@/lib/mqchain/origin-client/client";

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

export async function GET() {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const detail = await getActiveKvBuildDetail();

    if (!detail) {
      return errorResponse("No active KV build manifest found.", 404);
    }

    return NextResponse.json(buildKvServingManifestApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Active KV serving manifest request failed.", 500);
  }
}
