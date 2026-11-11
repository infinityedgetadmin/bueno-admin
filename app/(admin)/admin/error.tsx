"use client";

import ErrorPanel from "@/components/admin/ErrorPanel";

/**
 * An error.tsx never wraps the layout of its own segment, so the (console) boundary cannot catch a
 * failure in the (console) layout's session check (e.g. the data folder is unreadable). This one can.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="adm-login">
      <ErrorPanel error={error} onRetry={unstable_retry} />
    </main>
  );
}
