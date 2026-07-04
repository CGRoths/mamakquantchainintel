import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { assertPermission } from "@/lib/auth/permissions";
import { readBoundedJsonBody, RequestBodyTooLargeError } from "@/lib/mqchain/api-json";
import { buildCexFlowApiResponse, buildResolverApiResponse } from "@/lib/mqchain/resolver-api";
import { classifyCexTransactionFlow } from "@/lib/mqchain/services/cex-flow-service";
import { getAddressResolver } from "@/lib/mqchain/services/resolver-service";
import {
  cexFlowApiRequestSchema,
  RESOLVER_API_MAX_BODY_BYTES,
  resolverApiQuerySchema,
} from "@/lib/mqchain/validators/resolver-api";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      details,
    },
    { status },
  );
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
    const params = resolverApiQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    const blockNumber = typeof params.blockNumber === "number" ? params.blockNumber : null;
    const resolver = getAddressResolver();
    const result = params.metricGroupCode
      ? await resolver.checkMetricGroup(params.chainCode, params.address, params.metricGroupCode, blockNumber)
      : await resolver.resolveAt(params.chainCode, params.address, blockNumber);

    return NextResponse.json(
      buildResolverApiResponse({
        query: {
          chainCode: params.chainCode,
          address: params.address,
          blockNumber,
          metricGroupCode: params.metricGroupCode,
        },
        result,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return validationError(error);
    }

    return errorResponse(error instanceof Error ? error.message : "Resolver request failed.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await assertAuthenticated())) {
    return errorResponse("Authentication required.", 401);
  }

  try {
    const parsed = cexFlowApiRequestSchema.parse(await readBoundedJsonBody(request, RESOLVER_API_MAX_BODY_BYTES));
    const blockNumber = typeof parsed.blockNumber === "number" ? parsed.blockNumber : null;
    const result = await classifyCexTransactionFlow({
      chainCode: parsed.chainCode,
      inputAddresses: parsed.inputAddresses,
      outputAddresses: parsed.outputAddresses,
      blockNumber,
      metricGroupCode: parsed.metricGroupCode,
    });

    return NextResponse.json(
      buildCexFlowApiResponse({
        query: {
          chainCode: parsed.chainCode,
          blockNumber,
          metricGroupCode: parsed.metricGroupCode,
          inputAddressCount: parsed.inputAddresses.length,
          outputAddressCount: parsed.outputAddresses.length,
        },
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

    return errorResponse(error instanceof Error ? error.message : "CEX flow request failed.", 500);
  }
}
