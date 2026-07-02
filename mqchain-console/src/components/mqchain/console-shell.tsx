"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  Boxes,
  Database,
  FileSearch,
  Gauge,
  GitBranch,
  Home,
  Layers3,
  ListChecks,
  Search,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/mqchain", label: "Dashboard", icon: Home },
  { href: "/mqchain/intake/new", label: "Intake", icon: Upload },
  { href: "/mqchain/source-jobs", label: "Source Jobs", icon: FileSearch },
  { href: "/mqchain/candidates", label: "Candidates", icon: ListChecks },
  { href: "/mqchain/review", label: "Review", icon: ShieldCheck },
  { href: "/mqchain/batches", label: "Batches", icon: Boxes },
  { href: "/mqchain/registry", label: "Registry", icon: Database },
  { href: "/mqchain/dictionaries", label: "Dictionaries", icon: Archive },
  { href: "/mqchain/metric-groups", label: "Metric Groups", icon: Gauge },
  { href: "/mqchain/discovery/jobs", label: "Discovery", icon: GitBranch },
  { href: "/mqchain/kv-builds", label: "KV Builds", icon: Layers3 },
  { href: "/mqchain/resolver", label: "Resolver", icon: Search },
  { href: "/mqchain/audit-log", label: "Audit Log", icon: Activity },
  { href: "/mqchain/settings", label: "Settings", icon: Settings },
];

export function ConsoleShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email?: string | null; role?: string | null };
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card/60 lg:block">
        <div className="flex h-16 items-center px-5">
          <div>
            <div className="font-mono text-sm font-semibold text-primary">MQCHAIN</div>
            <div className="text-xs text-muted-foreground">MamakQuant intelligence</div>
          </div>
        </div>
        <Separator />
        <nav className="grid gap-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/mqchain" && pathname.startsWith(item.href));
            return (
              <Button key={item.href} asChild variant="ghost" className={cn("justify-start gap-2", active && "bg-accent text-accent-foreground")}>
                <Link href={item.href}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <div>
            <div className="text-sm font-medium">Address intelligence control plane</div>
            <div className="font-mono text-xs text-muted-foreground">{user.email} / {user.role}</div>
          </div>
          <SignOutButton />
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
