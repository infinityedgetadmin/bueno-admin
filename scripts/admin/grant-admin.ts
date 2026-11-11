/**
 * Gives someone access to the back office, or changes their role or password. Use it once per
 * install to create the first admin; after that, admins manage the team in the back office.
 *
 *   npm run admin:grant -- --email you@example.com [--role admin|editor|viewer] [--password <password>]
 *
 * Writes to the data folder (BUENO_DATA_DIR, default ./data/store). Runs with the react-server
 * condition (see package.json) so the server-only repositories load in Node.
 */
import { storeDir } from "@/lib/store/store-path";
import { GRANT_USAGE, parseGrantArgs } from "./grant-args";

async function main(): Promise<number> {
  const parsed = parseGrantArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(GRANT_USAGE);
    return 2;
  }
  const { email, role, password } = parsed.options;
  console.log(`Granting ${role} access to ${email} in ${storeDir()}…`);

  const { grantAccess } = await import("@/lib/admin/grant-access");
  const outcome = await grantAccess({ email, role, password }, new Date().toISOString());
  if (!outcome.ok) {
    console.error(outcome.message);
    return 1;
  }
  console.log(outcome.summary);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Operator-facing CLI: the underlying message (e.g. an unwritable folder) is what they need.
    console.error("Could not grant access:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
