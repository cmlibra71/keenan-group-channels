import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { contactService } from "@/lib/store";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { ChangeEmailForm } from "@/components/account/ChangeEmailForm";

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
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back to account
      </Link>
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
  );
}
