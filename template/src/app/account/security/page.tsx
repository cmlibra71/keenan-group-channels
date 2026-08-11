import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { contactService } from "@/lib/store";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = {
  title: "Security",
};

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/security"));

  const customer = (await contactService.getById(session.contactId)) as {
    email: string;
  } | null;

  return (
    <AccountShell>
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Security</h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Change password</h2>
        <ChangePasswordForm />
      </section>

      {/* Read-only by design: customers cannot change their own email address.
          Staff update it on the contact record in the portal on request. */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Email</h2>
        <p className="text-sm text-zinc-500">
          Current email: <span className="font-medium text-zinc-700">{customer?.email}</span>
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          To change the email on your account, please{" "}
          <Link href="/pages/contact" className="text-zinc-900 font-medium hover:underline">
            contact us
          </Link>
          .
        </p>
      </section>

      <p className="mt-8 text-center text-sm text-zinc-500">
        <Link href="/account" className="text-zinc-900 font-medium hover:underline">
          Back to my account
        </Link>
      </p>
    </AccountShell>
  );
}
