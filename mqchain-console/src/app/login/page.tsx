import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/permissions";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/mqchain");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
