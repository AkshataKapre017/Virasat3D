"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { LogOut, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useLive } from "@/components/providers";
import { api, unwrap } from "@/lib/api/client";
import { keys } from "@/lib/api/queries";
import { ROLE_LABELS, useAuth } from "@/lib/auth";
import { NAV, SEARCH_HREF } from "@/lib/nav";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  return <NavList className={className} pathname={pathname} permissions={user?.permissions ?? []} />;
}

/** Rendered in the static shell while the pathname is not yet known. */
export function NavList({
  className,
  pathname,
  permissions,
}: {
  className?: string;
  pathname?: string;
  permissions?: readonly string[];
}) {
  return (
    <ul className={clsx("flex items-center gap-1", className)}>
      {NAV.filter((item) => item.header && (!("permission" in item) || permissions?.includes(item.permission))).map(({ href, label }) => {
        const active = pathname !== undefined && isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
              )}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AccountLinks({ className }: { className?: string }) {
  const { user, isPending } = useAuth();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/auth/logout")),
    onSuccess: () => {
      queryClient.setQueryData(keys.authMe(), null);
    },
  });

  if (isPending) {
    return <span className={clsx("inline-block h-8 w-20 animate-pulse rounded-full bg-white/10", className)} aria-hidden />;
  }

  if (!user) {
    return (
      <div className={clsx("flex items-center gap-1.5 text-sm font-semibold", className)}>
        <Link
          href="/login"
          className="rounded-full px-2.5 py-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="hidden rounded-full bg-white/15 px-2.5 py-1.5 text-white transition-colors hover:bg-white/25 sm:inline-block"
        >
          Join
        </Link>
      </div>
    );
  }

  return (
    <div className={clsx("flex items-center gap-1.5 text-sm font-semibold text-white/80", className)}>
      <span className="hidden items-center gap-1.5 md:flex" title={user.email}>
        <UserRound aria-hidden className="size-4" />
        {ROLE_LABELS[user.role]}
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
      >
        <LogOut aria-hidden className="size-4" />
        <span className="hidden sm:inline">{logout.isPending ? "Signing out…" : "Sign out"}</span>
        <span className="sr-only sm:hidden">Sign out</span>
      </button>
    </div>
  );
}


const LIVE_LABEL = {
  open: "Live updates on",
  connecting: "Connecting to live updates",
  reconnecting: "Reconnecting to live updates",
  idle: "Live updates paused",
  unsupported: "Live updates unavailable in this browser",
} as const;

export function LiveIndicator() {
  const { status } = useLive();
  const label = LIVE_LABEL[status];
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80" title={label}>
      <span
        aria-hidden
        className={clsx(
          "size-2 rounded-full",
          status === "open" ? "animate-pulse-dot bg-emerald-400" : status === "idle" ? "bg-white/40" : "bg-amber-300",
        )}
      />
      <span className="sr-only sm:not-sr-only">{status === "open" ? "Live" : "Offline"}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const SEARCH_HINTS = ["Adalaj Stepwell", "Taj Mahal", "Champaner-Pavagadh"];

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query) router.push(`${SEARCH_HREF}?q=${encodeURIComponent(query)}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative hidden md:block">
      <label htmlFor="header-search" className="sr-only">
        Search the archive
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/60" />
      <input
        id="header-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-64 rounded-full border border-white/20 bg-white/10 py-1.5 pr-3 pl-9 text-sm text-white focus:bg-white/15 lg:w-72"
      />
      {!q && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-9 right-3 h-6 -translate-y-1/2 overflow-hidden text-sm text-white/50"
        >
          <div className="flex animate-placeholder-scroll flex-col">
            {[...SEARCH_HINTS, SEARCH_HINTS[0]].map((hint, i) => (
              <span key={i} className="h-6 leading-6 whitespace-nowrap">
                {hint}
              </span>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
