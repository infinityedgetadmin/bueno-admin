import AdminShell from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/lib/admin/session";

/**
 * Authenticated area. Each page ALSO calls requireAdminPage() (layouts are not re-run on
 * every navigation); the call is React-cached per request, so there is no extra cost.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPage();
  return <AdminShell actor={{ email: actor.email, role: actor.role }}>{children}</AdminShell>;
}
