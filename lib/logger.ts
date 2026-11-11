/** Structured error log. Cloud Run / App Hosting parse JSON lines with a `severity` field. */
export function logError(context: string, error: unknown, details: Record<string, unknown> = {}): void {
  const described =
    error instanceof Error
      ? { errorName: error.name, errorMessage: error.message, stack: error.stack }
      : { errorMessage: String(error) };
  console.error(JSON.stringify({ severity: "ERROR", context, ...described, ...details }));
}
