import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConsoleShell } from "@/components/mqchain/console-shell";
import { authOptions } from "@/lib/auth/options";

export const dynamic = "force-dynamic";

export default async function MqchainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return <ConsoleShell user={session.user}>{children}</ConsoleShell>;
}
