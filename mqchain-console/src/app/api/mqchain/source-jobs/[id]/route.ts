import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission, requireSignedIn } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { buildSourceJobExportApiResponse } from "@/lib/mqchain/source-job-api";
import { deleteSourceJob, getSourceJob } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { sourceJobDeletionSchema } from "@/lib/mqchain/validators/source-job";

export const dynamic = "force-dynamic";
export const SOURCE_JOB_DELETE_API_MAX_BODY_BYTES = 64 * 1024;

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
  const sourceJobId = Number(id);

  if (!Number.isInteger(sourceJobId) || sourceJobId <= 0) {
    return errorResponse("Source job id must be a positive integer.", 400);
  }

  try {
    const detail = await getSourceJob(sourceJobId);
    if (!detail) {
      return errorResponse("Source job not found.", 404);
    }

    return NextResponse.json(buildSourceJobExportApiResponse(detail));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Source job export request failed.", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSignedIn();
  } catch {
    return errorResponse("Authentication required.", 401);
  }

  try {
    await assertPermission("intake:delete");
  } catch {
    return errorResponse("Source job deletion permission required.", 403);
  }

  const { id } = await params;
  const sourceJobId = Number(id);
  if (!Number.isInteger(sourceJobId) || sourceJobId <= 0) return errorResponse("Source job id must be a positive integer.", 400);

  try {
    const body = await readBoundedJsonBody(request, SOURCE_JOB_DELETE_API_MAX_BODY_BYTES);
    const parsed = sourceJobDeletionSchema.parse({
      sourceJobId,
      confirmation: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).confirmation : undefined,
    });
    const result = await deleteSourceJob(sourceJobId, parsed.confirmation);
    revalidatePath("/mqchain");
    revalidatePath("/mqchain/source-jobs");
    revalidatePath(`/mqchain/source-jobs/${sourceJobId}`);
    revalidatePath("/mqchain/candidates");
    revalidatePath("/mqchain/review");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof SyntaxError) return errorResponse("Request body must be valid JSON.", 400);
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof OriginClientError) return errorResponse(error.message, error.status, error.details);
    return errorResponse(error instanceof Error ? error.message : "Source job deletion failed.", 500);
  }
}
