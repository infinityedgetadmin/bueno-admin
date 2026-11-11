"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { Field } from "@/components/admin/ui/Field";
import { Notice } from "@/components/admin/ui/Notice";
import { Switch } from "@/components/admin/ui/Switch";
import { resultErrorMessage } from "@/lib/admin/action-result";
import { addTeamMemberAction, updateTeamMemberAction } from "@/lib/admin/actions/team";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/admin/permissions";
import type { AdminRole } from "@/lib/admin/types";
import { useServerAction } from "@/lib/admin/use-server-action";
import type { FieldErrors } from "@/lib/pricing/types";

interface MemberRow {
  email: string;
  role: AdminRole;
  active: boolean;
  lastSignIn: string;
}

const ROLES: readonly AdminRole[] = ["admin", "editor", "viewer"];

function isRole(value: string): value is AdminRole {
  return (ROLES as readonly string[]).includes(value);
}

export default function TeamManager({ currentEmail, members }: { currentEmail: string; members: MemberRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("editor");
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const add = useServerAction(addTeamMemberAction);
  const update = useServerAction(updateTeamMemberAction);

  const addErrors: FieldErrors = add.result !== null && !add.result.ok && add.result.kind === "validation" ? add.result.fieldErrors : {};
  const addFailure =
    addErrors.email === undefined && addErrors.password === undefined ? resultErrorMessage(add.result) : null;
  const updateFailure = resultErrorMessage(update.result);

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const outcome = await add.run({ email, role, password });
    if (outcome.ok) {
      setNotice(outcome.message);
      setEmail("");
      setPassword("");
      router.refresh();
    }
  }

  async function change(member: MemberRow, next: { role: AdminRole; active: boolean }) {
    setNotice(null);
    const outcome = await update.run({ email: member.email, role: next.role, active: next.active });
    if (outcome.ok) {
      setNotice(outcome.message);
      setRemoving(null);
      router.refresh();
    }
  }

  return (
    <div className="adm-stack">
      {notice !== null && <Notice tone="success">{notice}</Notice>}
      {updateFailure !== null && removing === null && <Notice tone="error">{updateFailure}</Notice>}

      <Card
        title="Give someone access"
        description="They sign in with this email and the temporary password you set. Nothing is sent to them, so share both with them directly."
      >
        <form className="adm-stack" onSubmit={(event) => void submitAdd(event)} noValidate>
          <div className="adm-form-grid">
            <Field id="member-email" label="Email" error={addErrors.email}>
              <input
                id="member-email"
                className="adm-input"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (add.result !== null) add.clear();
                }}
              />
            </Field>
            <Field id="member-password" label="Temporary password" hint="At least 10 characters. They can keep using it; only an admin can change it." error={addErrors.password}>
              <input
                id="member-password"
                className="adm-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (add.result !== null) add.clear();
                }}
              />
            </Field>
            <Field id="member-role" label="Role" hint={ROLE_DESCRIPTIONS[role]}>
              <select
                id="member-role"
                className="adm-select"
                value={role}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isRole(value)) setRole(value);
                }}
              >
                {ROLES.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {addFailure !== null && <Notice tone="error">{addFailure}</Notice>}
          <div className="adm-dialog-actions">
            <Button type="submit" loading={add.isPending}>
              Give access
            </Button>
          </div>
        </form>
      </Card>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Access</th>
              <th scope="col">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.email === currentEmail.toLowerCase();
              return (
                <tr key={member.email}>
                  <td>
                    <span className="adm-cell-title">{member.email}</span>
                    {isSelf && <span className="adm-tag">You</span>}
                  </td>
                  <td>
                    <label className="adm-sr-only" htmlFor={`role-${member.email}`}>
                      Role for {member.email}
                    </label>
                    <select
                      id={`role-${member.email}`}
                      className="adm-select"
                      value={member.role}
                      disabled={isSelf || update.isPending}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (isRole(value)) void change(member, { role: value, active: member.active });
                      }}
                    >
                      {ROLES.map((option) => (
                        <option key={option} value={option}>
                          {ROLE_LABELS[option]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Switch
                      id={`access-${member.email}`}
                      checked={member.active}
                      label={`Access for ${member.email}`}
                      description={isSelf ? "You can't change your own access." : member.active ? "Can sign in" : "Removed"}
                      disabled={isSelf || update.isPending}
                      onChange={(active) => {
                        if (active) void change(member, { role: member.role, active: true });
                        else {
                          update.clear();
                          setRemoving(member);
                        }
                      }}
                    />
                  </td>
                  <td>
                    <span className="adm-cell-sub">{member.lastSignIn}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove access for ${removing?.email ?? ""}?`}
        confirmLabel="Remove access"
        tone="danger"
        busy={update.isPending}
        onConfirm={() => {
          if (removing !== null) void change(removing, { role: removing.role, active: false });
        }}
        onCancel={() => {
          setRemoving(null);
          update.clear();
        }}
      >
        <p>They&apos;ll be signed out on their next click and won&apos;t be able to sign in again until you restore access.</p>
        {updateFailure !== null && <Notice tone="error">{updateFailure}</Notice>}
      </ConfirmDialog>
    </div>
  );
}
