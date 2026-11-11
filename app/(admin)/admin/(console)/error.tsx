"use client";

import ErrorPanel from "@/components/admin/ErrorPanel";

/**
 * A console page failed to render (for example the catalog could not be read). Shown inside the
 * shell, so the sidebar stays usable. `unstable_retry` is Next 16's "try again": it re-fetches the
 * segment from the server and resets the boundary, where `reset` alone would only re-render.
 */
export default function ConsoleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="adm-error">
      <ErrorPanel error={error} onRetry={unstable_retry} />
    </div>
  );
}
