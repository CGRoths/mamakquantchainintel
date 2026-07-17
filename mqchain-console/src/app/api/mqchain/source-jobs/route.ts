import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { buildSourceJobIntakeApiResponse, buildSourceJobListApiResponse } from "@/lib/mqchain/source-job-api";
import {
  createAiCleanedCsvIntake,
  createCsvIntake,
  createDeploymentSourceIntake,
  createJsonEvidenceIntake,
  createManualIntake,
  createUrlIntake,
} from "@/lib/mqchain/origin-client/client";
import { listSourceJobs } from "@/lib/mqchain/origin-client/client";
import {
  SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES,
  sourceJobIntakeApiRequestSchema,
} from "@/lib/mqchain/validators/intake";

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

async function createIntakeFromApiRequest(input: ReturnType<typeof sourceJobIntakeApiRequestSchema.parse>) {
  if (input.intakeType === "manual") return createManualIntake(input.payload);
  if (input.intakeType === "csv") return createCsvIntake(input.payload);
  if (input.intakeType === "ai_cleaned_csv") return createAiCleanedCsvIntake(input.payload);
  if (input.intakeType === "url") return createUrlIntake(input.payload);
  if (input.intakeType === "json_evidence") return createJsonEvidenceIntake(input.payload);
  return createDeploymentSourceIntake(input.payload);
}

function revalidateSourceJobIntakePaths(sourceJobId: number) {
  revalidatePath("/mqchain");
  revalidatePath("/mqchain/intake");
  revalidatePath("/mqchain/source-jobs");
  revalidatePath(`/mqchain/source-jobs/${sourceJobId}`);
  revalidatePath("/mqchain/candidates");
  revalidatePath("/mqchain/review");
}

export async function GET(request: NextRequest) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const result = await listSourceJobs(Object.fromEntries(request.nextUrl.searchParams.entries()));

    return NextResponse.json(
      buildSourceJobListApiResponse({
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

    return errorResponse(error instanceof Error ? error.message : "Source job list request failed.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertPermission("intake:create");
  } catch {
    return errorResponse("Intake permission required.", 403);
  }

  try {
    const parsed = sourceJobIntakeApiRequestSchema.parse(await readBoundedJsonBody(request, SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES));
    const summary = await createIntakeFromApiRequest(parsed);
    revalidateSourceJobIntakePaths(summary.sourceJobId);

    return NextResponse.json(buildSourceJobIntakeApiResponse({ intakeType: parsed.intakeType, summary }), { status: 201 });
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

    return errorResponse(error instanceof Error ? error.message : "Source job intake request failed.", 500);
  }
}
