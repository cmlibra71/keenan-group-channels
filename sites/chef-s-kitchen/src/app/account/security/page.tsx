import { redirect } from "next/navigation";
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

  const customer = (await contactService.getById(session.contactId).catch(() => null)) as {
    email: string;
  } | null;

  return (
    <AccountShell>
      {/* Single-column forms: capped so the password fields stay a readable
          width beside the nav rather than stretching the whole content area. */}
      <div className="max-w-xl">
        <h1 className="page-title mb-8">Security</h1>

        <section className="mb-10">
          <h2 className="section-title mb-4">Change password</h2>
          <ChangePasswordForm />
        </section>

        <section>
          <h2 className="section-title mb-1">Change email</h2>
          <p className="text-sm text-text-secondary mb-4">
            Current email: <span className="font-medium text-text-primary">{customer?.email}</span>
          </p>
          <ChangeEmailForm />
        </section>
      </div>
    </AccountShell>
  );
}
