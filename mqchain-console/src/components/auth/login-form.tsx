"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
      callbackUrl: searchParams.get("callbackUrl") ?? "/mqchain",
    });

    setPending(false);

    if (!result?.ok) {
      setError("Invalid credentials or inactive user.");
      return;
    }

    router.push(result.url ?? "/mqchain");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md rounded-lg">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md border bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <CardTitle>MQCHAIN Console</CardTitle>
        <CardDescription>Sign in to review, approve, and compile address intelligence.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="grid gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
