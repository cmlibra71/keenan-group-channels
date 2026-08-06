import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { contactService } from "@/lib/store";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { ChangeEmailForm } from "@/components/account/ChangeEmailForm";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = {
  title: "Security",
};

export default async function SecurityPage() {
  const session = await getSession();
  if (!session) redirect("/account");

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

      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Change email</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Current email: <span className="font-medium text-zinc-700">{customer?.email}</span>
        </p>
        <ChangeEmailForm />
      </section>

      <p className="mt-8 text-center text-sm text-zinc-500">
        <Link href="/account" className="text-zinc-900 font-medium hover:underline">
          Back to my account
        </Link>
      </p>
    </AccountShell>
  );
}
