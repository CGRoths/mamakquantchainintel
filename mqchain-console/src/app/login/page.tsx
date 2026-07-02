import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { authOptions } from "@/lib/auth/options";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/mqchain");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
