"use client";

import { MqchainRouteError } from "@/components/mqchain/route-state";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <MqchainRouteError error={error} reset={reset} />;
}
