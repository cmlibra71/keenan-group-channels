import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { getCheckoutSettings } from "@/lib/store";
import { ProfileEditForm } from "@/components/account/ProfileEditForm";
import { AddressBook, type Address } from "@/components/account/AddressBook";
import { AccountPeople } from "@/components/account/AccountPeople";
import { loadAccountPeople } from "@/lib/account/account-people-data";
import { loadProfileContact, loadProfileAddresses } from "@/lib/account/profile-data";
import { getContactPermissions } from "@/lib/role-permissions";
import { mayManageAddressBook } from "@/lib/account/address-authority";
import {
  missingProfileDetails,
  profilePromptLines,
} from "@/lib/account/profile-completeness";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = { title: "Account details" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/profile"));

  // Both customer reads are PROJECTED in SQL (lib/account/profile-data.ts): this
  // page renders five contact fields, and reading the whole contact row would
  // serialise `password_hash`, staff notes and the net-terms entitlement into
  // the page payload in a dev build (card BIig1Zo1).
  const [contact, addressRows, checkoutSettings, peopleView, perms] = await Promise.all([
    loadProfileContact(session.contactId),
    loadProfileAddresses(session.contactId),
    getCheckoutSettings(),
    loadAccountPeople(session.contactId),
    getContactPermissions(session.contactId),
  ]);

  const addresses: Address[] = addressRows;

  // Card H5JdsMrC: only the account's manager may change the addresses the
  // account has saved. The controls are hidden for everyone else and the reason
  // is printed in their place — a control removed with no explanation is the
  // failure pattern the behaviour register names. The actions re-check this
  // themselves, so hiding is presentation, never the gate.
  const canManageAddresses = mayManageAddressBook(perms, "edit");
  const canAddAddress = mayManageAddressBook(perms, "add");
  const canRemoveAddress = mayManageAddressBook(perms, "remove");

  // What is still outstanding on this account (card xqWftDcL). It PROMPTS — it
  // never blocks: no order and no checkout reads this.
  const missing = missingProfileDetails({
    phone: contact?.phone ?? "",
    addresses,
  });
  const promptLines = profilePromptLines(missing);

  return (
    <AccountShell>
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to account
      </Link>
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Account details</h1>

      {promptLines.length > 0 && (
        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Finish setting up your details</p>
              <p className="mt-0.5 text-sm text-amber-800">
                You can still order without these — they just save you time at the checkout.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {promptLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Profile</h2>
        <div className="border border-zinc-200 rounded-lg bg-white p-6 shadow-sm">
          <ProfileEditForm
            firstName={contact?.firstName || ""}
            lastName={contact?.lastName || ""}
            email={contact?.email || ""}
            company={contact?.company || ""}
            phone={contact?.phone || ""}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Addresses</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Manage your delivery and billing addresses. You can keep a billing
          address separate from your company/shipping address.
        </p>
        <AddressBook
          addresses={addresses}
          canAdd={canAddAddress}
          canEdit={canManageAddresses}
          canRemove={canRemoveAddress}
          googlePlacesEnabled={checkoutSettings.googlePlacesEnabled}
          // The details from the Profile card above, so a new address does not
          // ask for the same name, business and phone a second time (xqWftDcL).
          prefill={{
            firstName: contact?.firstName || "",
            lastName: contact?.lastName || "",
            company: contact?.company || "",
            phone: contact?.phone || "",
          }}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">People on the account</h2>
        <p className="text-sm text-zinc-500 mb-4">
          {peopleView.accountId !== null
            ? `Who has access to ${peopleView.accountName || "the account"}, and who else we should contact.`
            : "Who we should contact at your business."}
        </p>
        <div className="border border-zinc-200 rounded-lg bg-white p-6 shadow-sm">
          <AccountPeople view={peopleView} />
        </div>
      </section>
    </AccountShell>
  );
}
