import { requestOrigin } from "../../src/lib/mqchain/origin-client/client";
import { argument } from "./arguments";

function requiredActorValue(flag: string, environmentName: string) {
  const value = argument(flag) ?? process.env[environmentName];
  if (!value?.trim()) throw new Error(`${flag} or ${environmentName} is required`);
  return value.trim();
}

export function compilerActor() {
  return {
    id: requiredActorValue("--actor-id", "MQCHAIN_COMPILER_ACTOR_ID"),
    email: requiredActorValue("--actor-email", "MQCHAIN_COMPILER_ACTOR_EMAIL"),
  };
}

export function postSignedOrigin<T>(path: string, body: unknown) {
  return requestOrigin<T>(path, { method: "POST", body, actor: compilerActor(), timeoutMs: 120_000 });
}
