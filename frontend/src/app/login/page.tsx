import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Virasat3D with your email and password.",
};

export default function LoginPage() {
  return <LoginForm />;
}
