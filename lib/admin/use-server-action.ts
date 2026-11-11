"use client";

import { useCallback, useState, useTransition } from "react";
import { MESSAGES, fail, type ActionResult } from "./action-result";

export function useServerAction<Input, Data>(action: (input: Input) => Promise<ActionResult<Data>>) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<Data> | null>(null);

  const run = useCallback(
    (input: Input) =>
      new Promise<ActionResult<Data>>((resolve) => {
        startTransition(async () => {
          let next: ActionResult<Data>;
          try {
            next = await action(input);
          } catch (error) {
            console.error("Server action failed", error);
            next = fail("error", MESSAGES.generic);
          }
          setResult(next);
          resolve(next);
        });
      }),
    [action],
  );

  const clear = useCallback(() => setResult(null), []);

  return { run, isPending, result, clear };
}
