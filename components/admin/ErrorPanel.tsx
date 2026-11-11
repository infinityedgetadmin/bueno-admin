"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/admin/ui/Button";

/**
 * Branded fallback for a back-office page that failed to render. It only ever shows fixed,
 * friendly copy: never the error's message or digest, which can carry internal details.
 */
export default function ErrorPanel({ error, onRetry }: { error: Error & { digest?: string }; onRetry: () => void }) {
  useEffect(() => {
    console.error("Back-office page failed to render", error);
  }, [error]);

  return (
    <section className="adm-login-card" aria-labelledby="adm-error-title">
      <p className="adm-login-tagline">Back Office</p>
      <h1 className="adm-login-title" id="adm-error-title">
        Something went wrong
      </h1>
      <p className="adm-login-copy" role="alert">
        This page couldn&apos;t load. It&apos;s usually temporary, so please try again.
      </p>
      <Button className="adm-login-button" onClick={onRetry}>
        Try again
      </Button>
      <Link className="adm-btn adm-btn--secondary adm-login-button" href="/admin/login">
        Back to sign in
      </Link>
    </section>
  );
}
