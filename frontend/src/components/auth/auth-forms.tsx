"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { api, unwrap } from "@/lib/api/client";
import { keys } from "@/lib/api/queries";
import type { AuthUser, UserRole } from "@/lib/api/types";
import { AUTH_COPY, ROLE_OPTIONS } from "@/lib/auth";

function AuthShell({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <p className="eyebrow mb-1">{eyebrow}</p>
      <h1 className="mb-2 text-4xl font-semibold">{title}</h1>
      <p className="mb-6 text-ink-soft">{intro}</p>
      <div className="card p-5 sm:p-6">{children}</div>
    </div>
  );
}

function FormError({ error }: { error: Error | string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
      {typeof error === "string" ? error : error.message}
    </p>
  );
}

function EmailField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{AUTH_COPY.emailLabel}</span>
      <input
        type="email"
        name="email"
        autoComplete="email"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field"
        placeholder="you@example.org"
      />
    </label>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  value,
  onChange,
  hint,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <input
        type="password"
        name={name}
        autoComplete={autoComplete}
        required
        minLength={8}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field"
        aria-describedby={hint ? id : undefined}
      />
      {hint && (
        <span id={id} className="mt-1 block text-xs text-muted">
          {hint}
        </span>
      )}
    </label>
  );
}

export function SignupForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("researcher");
  const [formError, setFormError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/auth/signup", {
          body: {
            email: email.trim(),
            password,
            confirm_password: confirmPassword,
            role,
          },
        }),
      ),
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(keys.authMe(), user);
      router.push("/");
      router.refresh();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setFormError("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("The two passwords do not match.");
      return;
    }
    setFormError(null);
    request.mutate();
  };

  return (
    <AuthShell eyebrow="Account" title={AUTH_COPY.signupTitle} intro={AUTH_COPY.signupIntro}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <EmailField value={email} onChange={setEmail} />
        <PasswordField
          label={AUTH_COPY.passwordLabel}
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint={AUTH_COPY.passwordHint}
        />
        <PasswordField
          label={AUTH_COPY.confirmPasswordLabel}
          name="confirm_password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">{AUTH_COPY.roleLabel}</legend>
          <p className="mb-3 text-xs text-muted">{AUTH_COPY.roleHint}</p>
          <div className="space-y-2">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer gap-3 rounded-lg border border-sandstone bg-sand/40 p-3 has-[:checked]:border-terracotta has-[:checked]:bg-terracotta-soft"
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="mt-1 accent-terracotta"
                />
                <span>
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <FormError error={formError ?? request.error} />
        <button type="submit" className="btn btn-primary w-full" disabled={request.isPending}>
          {request.isPending ? "Creating account…" : AUTH_COPY.createAccount}
          {!request.isPending && <ArrowRight aria-hidden className="size-4" />}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-terracotta underline-offset-2 hover:underline">
          Sign in
        </Link>
        .
      </p>
    </AuthShell>
  );
}

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const request = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/api/v1/auth/login", { body: { email: email.trim(), password } })),
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(keys.authMe(), user);
      router.push("/");
      router.refresh();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate();
  };

  return (
    <AuthShell eyebrow="Account" title={AUTH_COPY.loginTitle} intro={AUTH_COPY.loginIntro}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <EmailField value={email} onChange={setEmail} />
        <PasswordField
          label={AUTH_COPY.passwordLabel}
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <FormError error={request.error} />
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={request.isPending || !email.trim() || !password}
        >
          {request.isPending ? "Signing in…" : AUTH_COPY.signIn}
          {!request.isPending && <ArrowRight aria-hidden className="size-4" />}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-terracotta underline-offset-2 hover:underline">
          Create an account
        </Link>
        .
      </p>
    </AuthShell>
  );
}
