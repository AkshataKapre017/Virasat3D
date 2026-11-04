"use client";

/** Account copy, role labels and the single client-side permission check. */
import { useQuery } from "@tanstack/react-query";

import { authMeQuery } from "@/lib/api/queries";
import type { AuthUser, UserRole } from "@/lib/api/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  researcher: "Cultural researcher",
  academic: "Academic institution",
  tourism: "Heritage tourism",
  archivist: "Digital archivist",
};

export const ROLE_OPTIONS: readonly { value: UserRole; label: string; detail: string }[] = [
  {
    value: "researcher",
    label: ROLE_LABELS.researcher,
    detail: "Search the archive, follow citations and build reading lists for field research.",
  },
  {
    value: "academic",
    label: ROLE_LABELS.academic,
    detail: "Use the archive in teaching and research, with the same public reading access.",
  },
  {
    value: "tourism",
    label: ROLE_LABELS.tourism,
    detail: "Explore heritage sites, journeys and living culture for visits and interpretation.",
  },
  {
    value: "archivist",
    label: ROLE_LABELS.archivist,
    detail: "Contribute material, run the processing pipeline and review submissions.",
  },
];

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return user?.permissions.includes(permission) ?? false;
}

export function useAuth() {
  const query = useQuery(authMeQuery());
  return {
    user: query.data ?? null,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export const AUTH_COPY = {
  signupTitle: "Create an account",
  signupIntro: "Create your account with an email and a password, then choose the role that fits your work.",
  loginTitle: "Sign in",
  loginIntro: "Enter the email and password you used when you created your account.",
  roleLabel: "Choose one role",
  roleHint: "Your role decides which parts of the archive you can contribute to. It can never grant admin access.",
  emailLabel: "Email address",
  passwordLabel: "Password",
  confirmPasswordLabel: "Confirm password",
  passwordHint: "Use at least 8 characters.",
  createAccount: "Create account",
  signIn: "Sign in",
  signingOut: "Signing out…",
  signedOutTitle: "Sign in to continue",
  accountLabel: "Account",
} as const;
