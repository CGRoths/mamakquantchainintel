import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { buildKvBuildListApiResponse, buildKvBuildRegistrationApiResponse } from "@/lib/mqchain/kv-serving-api";
import { createKvBuildManifest, listKvBuilds } from "@/lib/mqchain/origin-client/client";
import {
  KV_BUILD_REGISTRATION_API_MAX_BODY_BYTES,
  kvBuildRegistrationApiRequestSchema,
} from "@/lib/mqchain/validators/kv-manifest";

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
    const result = await listKvBuilds(Object.fromEntries(request.nextUrl.searchParams.entries()));

    return NextResponse.json(
      buildKvBuildListApiResponse({
        query: {
          page: result.page,
          pageSize: result.pageSize,
          filters: result.filters,
        },
        rows: result.rows,
        total: result.total,
        totalPages: result.totalPages,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "KV build list request failed.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertPermission("batch:commit");
  } catch {
    return errorResponse("Batch commit permission required.", 403);
  }

  try {
    const parsed = kvBuildRegistrationApiRequestSchema.parse(await readBoundedJsonBody(request, KV_BUILD_REGISTRATION_API_MAX_BODY_BYTES));
    const build = await createKvBuildManifest(parsed);

    return NextResponse.json(buildKvBuildRegistrationApiResponse({ build }), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    if (error instanceof SyntaxError) {
      return errorResponse("Request body must be valid JSON.", 400);
    }

    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(error.message, 413);
    }

    return errorResponse(error instanceof Error ? error.message : "KV build registration request failed.", 500);
  }
}
