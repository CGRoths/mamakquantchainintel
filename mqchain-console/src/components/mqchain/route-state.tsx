"use client";

import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MqchainRouteLoading() {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-primary">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-mono uppercase">MQCHAIN</span>
        </div>
        <Skeleton className="h-8 w-full max-w-sm" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-4 rounded-sm" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="rounded-lg">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}

export function MqchainRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid gap-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Console route failed</AlertTitle>
        <AlertDescription>{error.message || "Unexpected route error."}</AlertDescription>
      </Alert>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Recovery</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <div>
            <div>Digest</div>
            <div className="font-mono text-xs">{error.digest ?? "-"}</div>
          </div>
          <Button type="button" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
