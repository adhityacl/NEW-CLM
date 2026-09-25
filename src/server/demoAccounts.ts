import type { Database } from "better-sqlite3";
import { buildDemoDataset } from "../data/demoDataset";

/** Login accounts shipped with the demo dataset — all on the reserved example.com domain. */
export const DEMO_ACCOUNT_EMAILS = new Set(buildDemoDataset().allowedUsers.map((u) => String(u.email).toLowerCase()));

export const isDemoAccountEmail = (email: unknown) => DEMO_ACCOUNT_EMAILS.has(String(email ?? "").trim().toLowerCase());

/**
 * Deletes the demo-dataset login accounts (user, credentials, sessions, memberships) and returns
 * the app user list without them. Both must go: every boot recreates a login, with the
 * DEMO_ADMIN_PASSWORD, for each entry left in the app user list.
 */
export function removeDemoAccounts<T extends { id?: unknown; email?: unknown }>(auth: Database, allowedUsers: T[], keepUserId?: string) {
  const doomed = (auth.prepare(`SELECT id, email FROM "user"`).all() as Array<{ id: string; email: string }>).filter(
    (u) => isDemoAccountEmail(u.email) && u.id !== keepUserId,
  );
  auth.transaction(() => {
    for (const { id } of doomed) {
      for (const table of ["session", "account", "member", "teamMember"]) {
        auth.prepare(`DELETE FROM "${table}" WHERE userId = ?`).run(id);
      }
      auth.prepare(`DELETE FROM "user" WHERE id = ?`).run(id);
    }
  })();
  return {
    allowedUsers: allowedUsers.filter((u) => !isDemoAccountEmail(u.email) || u.id === keepUserId),
    removed: doomed.length,
  };
}
