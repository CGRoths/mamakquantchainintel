import { AsyncLocalStorage } from "node:async_hooks";

import type { VerifiedOriginActor } from "@/lib/mqchain/contracts/origin";
import { ROLE_PERMISSIONS, type MqUserRole } from "@/lib/mqchain/constants";

const actorStorage = new AsyncLocalStorage<VerifiedOriginActor>();

export function runWithOriginActor<T>(actor: VerifiedOriginActor, callback: () => T): T {
  return actorStorage.run(actor, callback);
}

export async function assertPermission(permission: string): Promise<VerifiedOriginActor> {
  const actor = actorStorage.getStore();
  if (!actor || !(ROLE_PERMISSIONS[actor.role as MqUserRole] ?? []).includes(permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return actor;
}
