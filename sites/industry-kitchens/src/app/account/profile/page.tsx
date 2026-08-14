import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { contactService, customerAddressService, getCheckoutSettings } from "@/lib/store";
import { ProfileEditForm } from "@/components/account/ProfileEditForm";
import { AddressBook, type Address } from "@/components/account/AddressBook";
import { AccountPeople } from "@/components/account/AccountPeople";
import { loadAccountPeople } from "@/lib/account/account-people-data";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = { title: "Account details" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/profile"));

  const [contact, addressRows, checkoutSettings, peopleView] = await Promise.all([
    contactService.getById(session.contactId).catch(() => null),
    customerAddressService.listForContact(session.contactId).catch(() => [] as Record<string, unknown>[]),
    getCheckoutSettings(),
    loadAccountPeople(session.contactId),
  ]);
  // Contacts have no company column (identity unification) — company lives
  // under attributes.company; materialise it so the form reads stay simple.
  const customer: Record<string, unknown> | null = contact
    ? {
        ...(contact as Record<string, unknown>),
        company:
          (((contact as Record<string, unknown>).attributes as Record<string, unknown> | null)
            ?.company as string | undefined) ?? "",
      }
    : null;

  const addresses: Address[] = (addressRows ?? []).map(
    (a) => ({
      id: a.id as number,
      firstName: (a.first_name as string) || "",
      lastName: (a.last_name as string) || "",
      company: (a.company as string) || "",
      phone: (a.phone as string) || "",
      address1: (a.address1 as string) || "",
      address2: (a.address2 as string) || "",
      city: (a.city as string) || "",
      state: (a.state_or_province as string) || "",
      postalCode: (a.postal_code as string) || "",
      isDefaultBilling: Boolean(a.is_default_billing),
      isDefaultShipping: Boolean(a.is_default_shipping),
    })
  );

  return (
    <AccountShell>
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to account
      </Link>
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Account details</h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Profile</h2>
        <div className="border border-zinc-200 rounded-lg bg-white p-6 shadow-sm">
          <ProfileEditForm
            firstName={(customer?.first_name as string) || ""}
            lastName={(customer?.last_name as string) || ""}
            email={(customer?.email as string) || ""}
            company={(customer?.company as string) || ""}
            phone={(customer?.phone as string) || ""}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Addresses</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Manage your delivery and billing addresses. You can keep a billing
          address separate from your company/shipping address.
        </p>
        <AddressBook addresses={addresses} googlePlacesEnabled={checkoutSettings.googlePlacesEnabled} />
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
