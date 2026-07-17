import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildEvidenceLedgerApiResponse } from "@/lib/mqchain/evidence-api";
import { listEvidenceLedger } from "@/lib/mqchain/origin-client/client";

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
    const result = await listEvidenceLedger(Object.fromEntries(request.nextUrl.searchParams.entries()));

    return NextResponse.json(
      buildEvidenceLedgerApiResponse({
        query: {
          page: result.page,
          pageSize: result.pageSize,
          filters: result.filters,
        },
        evidenceRows: result.evidenceRows,
        evidenceTotal: result.evidenceTotal,
        evidenceTotalPages: result.evidenceTotalPages,
        sourceVerificationRows: result.sourceVerificationRows,
        sourceVerificationTotal: result.sourceVerificationTotal,
        sourceVerificationTotalPages: result.sourceVerificationTotalPages,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Evidence ledger request failed.", 500);
  }
}
