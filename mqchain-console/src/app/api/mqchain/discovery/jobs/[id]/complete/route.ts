import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { buildDiscoveryCompletionApiResponse } from "@/lib/mqchain/discovery-api";
import { DiscoveryJobNotCompletableError } from "@/lib/mqchain/discovery-lifecycle";
import { completeDiscoveryJob } from "@/lib/mqchain/services/discovery-service";
import { DISCOVERY_RESULTS_API_MAX_BODY_BYTES, discoveryResultsApiRequestSchema } from "@/lib/mqchain/validators/discovery";

export const dynamic = "force-dynamic";

const discoveryJobIdParamSchema = z.coerce.number().int().positive();

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function validationError(error: ZodError) {
  return errorResponse("Validation failed.", 400, error.flatten());
}

async function assertAuthenticated() {
  try {
    await assertPermission("discovery:create");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Discovery permission required.", 401);
  }

  try {
    const { id } = await params;
    const jobId = discoveryJobIdParamSchema.parse(id);
    const parsed = discoveryResultsApiRequestSchema.parse(await readBoundedJsonBody(request, DISCOVERY_RESULTS_API_MAX_BODY_BYTES));
    const result = await completeDiscoveryJob({
      jobId,
      resultsJson: parsed.resultsJson ?? JSON.stringify(parsed.results),
    });

    return NextResponse.json(
      buildDiscoveryCompletionApiResponse({
        query: { jobId },
        result,
      }),
    );
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

    if (error instanceof DiscoveryJobNotCompletableError) {
      return errorResponse(error.message, 409);
    }

    return errorResponse(error instanceof Error ? error.message : "Discovery completion request failed.", 500);
  }
}
