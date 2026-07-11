"use client";

import {
  CalendarDays,
  CandlestickChart,
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Settings,
  StickyNote,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type NavKey =
  | "mail"
  | "contacts"
  | "calendar"
  | "todos"
  | "notes"
  | "trades"
  | "expenses"
  | "settings"
  | "admin";

interface WebmailShellProps {
  email: string;
  active: NavKey;
  children: ReactNode;
  sidebarExtra?: ReactNode;
  sidebarCta?: ReactNode;
  /** Optional hint; shell also checks /api/auth/me */
  isAdmin?: boolean;
}

export function WebmailShell({
  email,
  active,
  children,
  sidebarExtra,
  sidebarCta,
  isAdmin: isAdminProp = false,
}: WebmailShellProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(isAdminProp);

  useEffect(() => {
    if (isAdminProp) {
      setIsAdmin(true);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setIsAdmin(Boolean(data.isAdmin));
      } catch {
        /* ignore */
      }
    })();
  }, [isAdminProp]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links: {
    key: NavKey;
    href: string;
    label: string;
    icon: typeof Mail;
  }[] = [
    { key: "mail", href: "/mail", label: "Mail", icon: Mail },
    { key: "contacts", href: "/contacts", label: "Contacts", icon: Users },
    {
      key: "calendar",
      href: "/calendar",
      label: "Calendar",
      icon: CalendarDays,
    },
    { key: "todos", href: "/todos", label: "To-do", icon: CheckSquare },
    { key: "notes", href: "/notes", label: "Notes", icon: StickyNote },
    {
      key: "trades",
      href: "/trades",
      label: "Trading Journal",
      icon: CandlestickChart,
    },
    { key: "expenses", href: "/expenses", label: "Expenses", icon: Wallet },
    { key: "settings", href: "/settings", label: "Settings", icon: Settings },
  ];

  if (isAdmin) {
    links.push({
      key: "admin",
      href: "/admin",
      label: "Admin",
      icon: LayoutDashboard,
    });
  }

  return (
    <div className={cn("mail-shell", active !== "mail" && "mail-shell-wide")}>
      <aside className="mail-sidebar flex">
        <div className="flex items-center justify-between gap-2 px-1 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm">
              <Mail className="h-4.5 w-4.5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[var(--foreground)]">
                RamerLabs
              </p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Webmail
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="icon-btn"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>

        {sidebarCta}

        <nav className="mb-3 flex flex-col gap-0.5">
          {links.map(({ key, href, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <Link
                key={key}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : "text-[var(--muted-strong)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </Link>
            );
          })}
        </nav>

        {sidebarExtra}

        <div className="mt-auto shrink-0 border-t border-[var(--border)] pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted-strong)]">
              <span className="text-xs font-semibold uppercase">
                {(email.split("@")[0] || "?").slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {email.split("@")[0]}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">{email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {children}
    </div>
  );
}
