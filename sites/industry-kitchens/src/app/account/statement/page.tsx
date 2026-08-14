import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { getContactPermissions, getContactRoleOnAccount } from "@/lib/role-permissions";
import { getAccountStatement } from "@/lib/store";
import { resolveStatementAccess, statementRefusalMessage } from "@/lib/account/statement-access";
import { AccountShell } from "@/components/account/AccountShell";
import { Price } from "@/components/ui/Price";

/**
 * The customer's own STATEMENT (card k6pHXQBf).
 *
 * Tim, 2026-08-10: "Customers should be able to see the total outstanding, but also should be able
 * to see a full history of everything that is owing." This is that page — the same document staff
 * read in the portal and can email, built by the same module, so the two can never disagree.
 *
 * WHO SEES IT: the account's Manager and Billing contacts only, decided by
 * `resolveStatementAccess` and re-asked HERE, not just in the menu (`sf-checkout`'s standing rule:
 * a gate rendered in one place and not re-checked where the data is read is not a gate). It fails
 * closed.
 *
 * WHICH BUSINESS: `getAccountStatement` binds this storefront's own channel, so a Chefs Depot
 * customer cannot be shown an Industry Kitchens invoice by any route through this page.
 */
export const metadata = { title: "Statement" };

const PERIODS: { key: string; label: string; days: number | null }[] = [
  { key: "90", label: "Last 3 months", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
  { key: "all", label: "All history", days: null },
];

const AGE_COLUMNS = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90_plus", label: "90+ days" },
] as const;

/** Melbourne calendar date, `YYYY-MM-DD` — the business's own day, whatever the server runs on. */
function melbourneToday(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readableDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function Refused({ message }: { message: string }) {
  return (
    <AccountShell>
      <p className="eyebrow mb-3">STATEMENT</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-6">Account Statement</h1>
      <p className="text-text-secondary">{message}</p>
      <Link href="/account/orders" className="mt-6 inline-block btn-primary">
        View your orders
      </Link>
    </AccountShell>
  );
}

export default async function AccountStatementPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/statement"));

  const perms = await getContactPermissions(session.contactId);
  // `getContactPermissions` fails OPEN by design (a hiccup must never brick checkout), so the ROLE
  // is re-read with the gate's own fail-closed lookup before anything is shown.
  const roleLookup = perms.accountId
    ? await getContactRoleOnAccount(session.contactId, perms.accountId)
    : { roleName: null, isMember: false, failed: false };
  const access = resolveStatementAccess({
    isB2B: perms.isB2B && !perms.failedOpen,
    accountId: perms.accountId,
    roleName: roleLookup.roleName,
    lookupFailed: roleLookup.failed,
  });
  if (!access.visible) return <Refused message={statementRefusalMessage(access.reason)} />;

  const sp = (await searchParams) ?? {};
  const wanted = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period = PERIODS.find((p) => p.key === wanted) ?? PERIODS[2];
  const today = melbourneToday();
  const from = (() => {
    if (period.days == null) return null;
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - period.days + 1)).toISOString().slice(0, 10);
  })();

  const statement = await getAccountStatement(access.accountId, { from, to: today }).catch(
    () => null
  );
  if (!statement) return <Refused message={statementRefusalMessage("unavailable")} />;

  const { aging, history, outstanding } = statement;

  return (
    <AccountShell>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-3">STATEMENT</p>
          <h1 className="text-3xl heading-serif text-text-primary">Account Statement</h1>
          <p className="mt-1 text-sm text-text-secondary">
            As at {readableDate(today)}. All amounts include GST.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/account/statement?period=${p.key}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${
                p.key === period.key
                  ? "border-accent bg-accent-subtle text-text-primary"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Total outstanding + ageing */}
      <section className="card-padded mb-8">
        <p className="text-sm text-text-secondary">Total outstanding</p>
        <Price amount={aging.total} className="text-3xl font-semibold text-text-primary" />
        <p className="mt-1 text-sm text-text-secondary">
          {aging.order_count === 0
            ? "Nothing outstanding — thank you."
            : `${aging.order_count} unpaid ${aging.order_count === 1 ? "invoice" : "invoices"}.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {AGE_COLUMNS.map((c) => (
            <div key={c.key}>
              <div className="text-xs uppercase tracking-wide text-text-muted">{c.label}</div>
              <Price amount={aging[c.key]} className="text-sm font-medium text-text-primary" />
            </div>
          ))}
        </div>
      </section>

      {/* Unpaid invoices */}
      {outstanding.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg heading-serif text-text-primary mb-3">Outstanding invoices</h2>
          <div className="space-y-3">
            {outstanding.map((r) => (
              <div key={r.order_id} className="card-padded flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-text-primary">
                    {r.order_number ?? `Order ${r.order_id}`}
                  </div>
                  <div className="text-sm text-text-secondary">
                    {readableDate(r.date)} · due {readableDate(r.due_date)}
                    {r.days_overdue > 0 ? ` · ${r.days_overdue} days overdue` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <Price amount={r.owing} className="text-lg font-semibold text-text-primary" />
                  <div className="text-xs text-text-secondary">
                    of <Price amount={r.total} className="text-xs" /> invoiced
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full history */}
      <section>
        <h2 className="text-lg heading-serif text-text-primary mb-3">
          Invoices, payments and credits
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Document</th>
                <th className="py-2 pr-4 text-right font-medium">Charge</th>
                <th className="py-2 pr-4 text-right font-medium">Credit</th>
                <th className="py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border text-text-secondary">
                <td className="py-2 pr-4" colSpan={4}>
                  Balance brought forward
                </td>
                <td className="py-2 text-right">
                  <Price amount={history.opening_balance} />
                </td>
              </tr>
              {history.entries.map((e, i) => (
                <tr key={`${e.order_id}-${e.kind}-${i}`} className="border-b border-border">
                  <td className="py-2 pr-4 whitespace-nowrap text-text-secondary">
                    {readableDate(e.date)}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="text-text-primary">{e.reference}</span>
                    <span className="block text-xs text-text-muted">{e.description}</span>
                  </td>
                  <td className="py-2 pr-4 text-right text-text-primary">
                    {parseFloat(e.charge) ? <Price amount={e.charge} /> : ""}
                  </td>
                  <td className="py-2 pr-4 text-right text-text-primary">
                    {parseFloat(e.credit) ? <Price amount={e.credit} /> : ""}
                  </td>
                  <td className="py-2 text-right text-text-primary">
                    <Price amount={e.balance} />
                  </td>
                </tr>
              ))}
              {history.entries.length === 0 && (
                <tr>
                  <td className="py-4 text-text-secondary" colSpan={5}>
                    Nothing invoiced, paid or credited in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          If anything here does not look right, contact us and we will sort it out.
        </p>
      </section>
    </AccountShell>
  );
}
