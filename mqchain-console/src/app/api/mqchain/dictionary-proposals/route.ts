import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission, requireSignedIn } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { createDictionaryProposal, listDictionaryProposals } from "@/lib/mqchain/origin-client/client";
import { OriginClientError } from "@/lib/mqchain/origin-client/errors";
import { dictionaryProposalCreateSchema } from "@/lib/mqchain/validators/dictionary-proposal";

const MAX_BODY_BYTES = 64 * 1024;
const errorResponse = (error: string, status: number, details?: unknown) => NextResponse.json({ error, details }, { status });

export async function GET() {
  try { await requireSignedIn(); }
  catch { return errorResponse("Authentication required.", 401); }
  try { await assertPermission("view"); return NextResponse.json(await listDictionaryProposals()); }
  catch (error) { return error instanceof OriginClientError ? errorResponse(error.message, error.status, error.details) : errorResponse(error instanceof Error ? error.message : "Proposal list failed.", 500); }
}

export async function POST(request: NextRequest) {
  try { await requireSignedIn(); }
  catch { return errorResponse("Authentication required.", 401); }
  try { await assertPermission("intake:create"); }
  catch { return errorResponse("Intake permission required.", 403); }
  try {
    const input = dictionaryProposalCreateSchema.parse(await readBoundedJsonBody(request, MAX_BODY_BYTES));
    return NextResponse.json(await createDictionaryProposal(input), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return errorResponse("Validation failed.", 400, error.flatten());
    if (error instanceof RequestBodyTooLargeError) return errorResponse(error.message, 413);
    if (error instanceof OriginClientError) return errorResponse(error.message, error.status, error.details);
    return errorResponse(error instanceof Error ? error.message : "Proposal creation failed.", 500);
  }
}
