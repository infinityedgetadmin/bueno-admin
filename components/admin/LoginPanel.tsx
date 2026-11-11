"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { Field } from "@/components/admin/ui/Field";
import { Notice } from "@/components/admin/ui/Notice";
import { LOGIN_ERROR_MESSAGES, loginErrorFromResponse, type LoginError } from "@/lib/admin/login-errors";

function defaultNavigate(url: string): void {
  window.location.assign(url);
}

function errorCodeOf(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return null;
}

export default function LoginPanel({
  next,
  initialError,
  navigate = defaultNavigate,
}: {
  next: string;
  initialError: LoginError | null;
  navigate?: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<LoginError | null>(initialError);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/admin/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      if (response.ok) {
        navigate(next);
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      setError(loginErrorFromResponse(response.status, errorCodeOf(body)));
    } catch (caught) {
      console.error("Back-office sign-in failed", caught);
      setError("sign_in_failed");
    }
    setPassword("");
    setPending(false);
  }

  return (
    <main className="adm-login">
      <motion.section
        className="adm-login-card"
        aria-labelledby="adm-login-title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
      >
        <Image src="/images/logo-gold.svg" alt="Bueno Leisure" width={112} height={112} priority />
        <p className="adm-login-tagline">Back Office</p>
        <h1 className="adm-login-title" id="adm-login-title">
          Welcome back
        </h1>
        <p className="adm-login-copy">Sign in with your back-office email and password to manage prices, seasons and promotions.</p>
        {error !== null && <Notice tone="error">{LOGIN_ERROR_MESSAGES[error]}</Notice>}
        <form className="adm-stack adm-login-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <Field id="login-email" label="Email">
            <input
              id="login-email"
              className="adm-input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field id="login-password" label="Password">
            <input
              id="login-password"
              className="adm-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" className="adm-login-button" loading={pending}>
            Sign in
          </Button>
        </form>
        <p className="adm-login-foot">Only people an admin has added can sign in.</p>
      </motion.section>
    </main>
  );
}
