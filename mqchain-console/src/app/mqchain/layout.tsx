import { redirect } from "next/navigation";

import { ConsoleShell } from "@/components/mqchain/console-shell";
import { getCurrentUser } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function MqchainLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <ConsoleShell user={user}>{children}</ConsoleShell>;
}
