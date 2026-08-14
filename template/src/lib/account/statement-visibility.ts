import { cache } from "react";
import { getSession } from "@/lib/auth";
import { getContactPermissions, getContactRoleOnAccount } from "@/lib/role-permissions";
import { resolveStatementAccess, type StatementAccess } from "./statement-access";

/**
 * May the person browsing right now see their account's statement (card k6pHXQBf)?
 *
 * Read once per request (`cache()`), because the account menu, the account dashboard's card grid
 * and the statement page itself all ask the same question — and they must all get the same answer,
 * or a customer meets a menu item that refuses them.
 *
 * The DECISION is the pure `resolveStatementAccess`; this only fetches what it needs. Anything
 * that goes wrong resolves to "not visible": no link, no card, and the page says so in words.
 */
export const readStatementAccess = cache(async (): Promise<StatementAccess> => {
  try {
    const session = await getSession();
    if (!session) return { visible: false, reason: "no-account" };
    const perms = await getContactPermissions(session.contactId);
    if (!perms.accountId) return { visible: false, reason: "no-account" };
    const role = await getContactRoleOnAccount(session.contactId, perms.accountId);
    return resolveStatementAccess({
      // `getContactPermissions` fails OPEN; a failed-open context must not mint account access.
      isB2B: perms.isB2B && !perms.failedOpen,
      accountId: perms.accountId,
      roleName: role.roleName,
      lookupFailed: role.failed,
    });
  } catch {
    return { visible: false, reason: "unavailable" };
  }
});
