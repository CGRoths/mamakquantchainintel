import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { buildDictionarySnapshotApiResponse } from "@/lib/mqchain/dictionary-api";
import { listDictionaries, listDictionaryVersions } from "@/lib/mqchain/services/dictionary-service";
import { dictionarySnapshotScopeSchema } from "@/lib/mqchain/validators/dictionary";

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
    const scope = dictionarySnapshotScopeSchema.parse(request.nextUrl.searchParams.get("scope") ?? "active");
    const [dictionaries, versions] = await Promise.all([listDictionaries(), listDictionaryVersions(1)]);

    return NextResponse.json(
      buildDictionarySnapshotApiResponse({
        scope,
        dictionaries,
        latestVersion: versions[0] ?? null,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Dictionary snapshot request failed.", 500);
  }
}
