import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Virasat3D account with your email, a password and a heritage role.",
};

export default function SignupPage() {
  return <SignupForm />;
}
