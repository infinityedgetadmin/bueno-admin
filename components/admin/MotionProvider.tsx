"use client";

import { MotionConfig } from "framer-motion";

/**
 * Wraps the back office so every framer-motion component (ConfirmDialog's AnimatePresence
 * included) respects the visitor's OS-level prefers-reduced-motion setting.
 *
 * MotionConfig's `reducedMotion` defaults to "never" (does not check prefers-reduced-motion at
 * all); "user" is what makes it check the OS setting, disabling transform/layout animations
 * while still allowing opacity/color transitions. Confirmed against the current docs
 * (https://motion.dev/docs/react-motion-config, https://motion.dev/docs/react-accessibility) via
 * Context7 before writing this.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
