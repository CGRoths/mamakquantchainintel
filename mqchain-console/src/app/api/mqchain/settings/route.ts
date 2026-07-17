import { NextResponse } from "next/server";

import { assertPermission, getCurrentUser } from "@/lib/auth/permissions";
import { buildSettingsAccessApiResponse } from "@/lib/mqchain/settings-api";
import { listSettingsUsers } from "@/lib/mqchain/origin-client/client";

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
    const [currentUser, users] = await Promise.all([getCurrentUser(), listSettingsUsers()]);

    return NextResponse.json(buildSettingsAccessApiResponse({ currentUser, users }));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Settings access request failed.", 500);
  }
}
