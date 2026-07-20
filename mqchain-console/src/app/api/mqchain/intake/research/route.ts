import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission, requireSignedIn } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { createResearchIntake } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES, researchCsvCreateSchema } from "@/lib/mqchain/validators/intake";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function POST(request: NextRequest) {
  try { await requireSignedIn(); }
  catch { return errorResponse("Authentication required.", 401); }
  try { await assertPermission("intake:create"); }
  catch { return errorResponse("Intake permission required.", 403); }

  try {
    const body = researchCsvCreateSchema.parse(await readBoundedJsonBody(request, SOURCE_JOB_INTAKE_API_MAX_BODY_BYTES));
    const result = await createResearchIntake(body);
    for (const path of ["/mqchain", "/mqchain/intake", "/mqchain/source-jobs", `/mqchain/source-jobs/${result.sourceJobId}`, "/mqchain/candidates", "/mqchain/review"]) revalidatePath(path);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof SyntaxError) return errorResponse("Request body must be valid JSON.", 400);
    if (error instanceof OriginClientError) return errorResponse(error.message, error.status, error.details);
    return errorResponse(error instanceof Error ? error.message : "Research intake failed.", 500);
  }
}
