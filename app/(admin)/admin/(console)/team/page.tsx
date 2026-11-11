import type { Metadata } from "next";
import TeamManager from "@/components/admin/team/TeamManager";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { formatTimestamp } from "@/lib/admin/format";
import { can } from "@/lib/admin/permissions";
import { requireAdminPage } from "@/lib/admin/session";
import { listAdminUsers } from "@/lib/admin/users-repo";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requireAdminPage();
  if (!can(actor.role, "team.manage")) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Team" />
        <Notice tone="info">Only admins can manage who has access to the back office.</Notice>
      </>
    );
  }
  const members = await listAdminUsers();
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description="People who can sign in to the back office, and what they can do. Admins manage everything; editors manage pricing; viewers can only look."
      />
      <TeamManager
        currentEmail={actor.email}
        members={members.map((member) => ({
          email: member.email,
          role: member.role,
          active: member.active,
          lastSignIn: formatTimestamp(member.lastSignInAt),
        }))}
      />
    </>
  );
}
