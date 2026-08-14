// ============================================================================
// "People on the account" — the customer-maintained list of who we should deal
// with at their business (card 8LfB0DZS + xqWftDcL).
//
// These people are CONTACT DETAILS, not logins (Chris, card xqWftDcL,
// 2026-08-11): saving one tells our team who they are and what they should be
// allowed to do; it never creates a sign-in and never grants access by itself.
// The people who DO have access are the account's real members
// (`account_memberships`), listed separately on the same screen.
//
// Storage: on the ACCOUNT (`accounts.metafields.account_contacts`) for a person
// who belongs to a business account, so everyone on that account — the manager
// included — sees the same list. Only an accountless (B2C) shopper keeps the
// list on their own contact record, where the old build put everybody's.
//
// Pure module: shapes, normalisation, validation and the added-people diff.
// Unit-tested in account-people.test.ts.
// ============================================================================

/** One person on the list, as stored and as posted by the form. */
export interface AccountPerson {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** `account_roles.id`, or null when the row predates the roles dropdown. */
  roleId: number | null;
  /** The role's name at the time of saving — kept so a legacy free-text role still reads. */
  roleName: string;
  /** Should we include them on the account's emails? (xqWftDcL) */
  receivesEmails: boolean;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Read one stored row, whatever shape it is in.
 *
 * The first build stored `{ name, email, phone, role }` with a FREE-TEXT role
 * ("Dishwasher" in Steve's screenshot). Those rows are read here rather than
 * dropped: the single name splits into first/last and an unrecognised role
 * becomes "no role yet", which the screen asks the customer to fix on the next
 * edit. Live rows carrying the old shape: 3, all test data.
 */
export function normalisePerson(
  raw: unknown,
  roles: Array<{ id: number; name: string }> = []
): AccountPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  let firstName = str(r.firstName ?? r.first_name);
  let lastName = str(r.lastName ?? r.last_name);
  if (!firstName && !lastName) {
    const whole = str(r.name);
    if (whole) {
      const parts = whole.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
  }

  const rawRoleName = str(r.roleName ?? r.role_name ?? r.role);
  const rawRoleId = r.roleId ?? r.role_id;
  const byId = typeof rawRoleId === "number" ? roles.find((x) => x.id === rawRoleId) : undefined;
  const byName = rawRoleName
    ? roles.find((x) => x.name.toLowerCase() === rawRoleName.toLowerCase())
    : undefined;
  const matched = byId ?? byName ?? null;

  const person: AccountPerson = {
    firstName,
    lastName,
    email: str(r.email),
    phone: str(r.phone),
    roleId: matched ? matched.id : null,
    // A legacy free-text role is kept visible ("Dishwasher") so nothing the
    // customer typed silently disappears; it just isn't a real role yet.
    roleName: matched ? matched.name : rawRoleName,
    receivesEmails: Boolean(r.receivesEmails ?? r.receives_emails ?? false),
  };

  if (!person.firstName && !person.lastName && !person.email && !person.phone && !person.roleName) {
    return null;
  }
  return person;
}

export function normalisePeople(
  raw: unknown,
  roles: Array<{ id: number; name: string }> = []
): AccountPerson[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => normalisePerson(row, roles))
    .filter((p): p is AccountPerson => p !== null);
}

/** First error found in a submitted list, or null. One sentence, naming the person. */
export function validatePeople(
  people: AccountPerson[],
  roles: Array<{ id: number; name: string }>
): string | null {
  for (const [i, p] of people.entries()) {
    const who = `${p.firstName} ${p.lastName}`.trim() || `Person ${i + 1}`;
    if (!p.firstName || !p.lastName) {
      return `Enter a first and last name for person ${i + 1}.`;
    }
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
      return `${who} needs a valid email address.`;
    }
    if (p.roleId === null || !roles.some((r) => r.id === p.roleId)) {
      return `Choose a role for ${who}.`;
    }
    if (p.receivesEmails && !p.email) {
      return `${who} needs an email address to receive the account's emails.`;
    }
  }
  return null;
}

/** Identity of a listed person, for telling a new one from an edited one. */
function personKey(p: AccountPerson): string {
  return p.email
    ? `e:${p.email.toLowerCase()}`
    : `n:${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`;
}

/**
 * Who is NEW in this save — the people the account manager gets told about
 * (Steve, card 8LfB0DZS: "Any additional person added needs to have an email
 * sent to the Account Manager"). Editing someone's phone number is not an
 * addition and must not send mail; changing their ROLE is a change of access,
 * so it counts.
 */
export function newlyAddedPeople(
  previous: AccountPerson[],
  next: AccountPerson[]
): AccountPerson[] {
  const before = new Map(previous.map((p) => [personKey(p), p]));
  return next.filter((p) => {
    const was = before.get(personKey(p));
    if (!was) return true;
    return (was.roleId ?? null) !== (p.roleId ?? null);
  });
}

/** "Jo Smith" / "Jo" / "" — never a bare "undefined". */
export function personName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}
