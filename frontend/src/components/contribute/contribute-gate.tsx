"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/primitives";
import { ROLE_LABELS, hasPermission, useAuth } from "@/lib/auth";

/** Contribute is the only write surface in the UI; the API enforces the same permission. */
export function ContributeGate({ children }: { children: ReactNode }) {
  const { user, isPending } = useAuth();

  if (isPending) return <Skeleton className="h-96" />;

  if (!user) {
    return (
      <section className="card max-w-xl p-6">
        <LockKeyhole aria-hidden className="mb-3 size-6 text-terracotta" />
        <h2 className="mb-2 text-2xl font-semibold">Sign in to contribute</h2>
        <p className="mb-4 text-ink-soft">
          Contributing needs an account so the archive can credit the right person and track review decisions.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-secondary">
            Create an account
          </Link>
        </div>
      </section>
    );
  }

  if (!hasPermission(user, "contribute")) {
    return (
      <section className="card max-w-xl p-6">
        <LockKeyhole aria-hidden className="mb-3 size-6 text-terracotta" />
        <h2 className="mb-2 text-2xl font-semibold">Contribution is not available for this role</h2>
        <p className="text-ink-soft">
          You are signed in as <strong>{ROLE_LABELS[user.role]}</strong>, which can read and search the archive but
          cannot add or reprocess material. A digital archivist account is needed to contribute.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
