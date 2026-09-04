import Link from "next/link";
import { redirect } from "next/navigation";
import { getFeatureFlag } from "@/lib/store";
import { readActivation } from "@/lib/membership/activation-server";
import { formatDateOfBirth } from "@/lib/membership/checkout-join";
import { ActivateMembershipForm } from "./ActivateForm";

export const metadata = {
  title: "Activate your membership",
};

/**
 * The activation page. Card pktBo874, Tim's screenshot "Membership activation page - prefilled
 * asking for new password".
 *
 * Reached from the emailed link a checkout join produced. Everything is PREFILLED from the order
 * the join rode in on, and the token is only spent when the customer presses Activate — never on
 * this page load, so an email link-scanner cannot burn it.
 */
export default async function ActivateMembershipPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/");

  const { token } = await params;
  const context = await readActivation(token);

  // One sentence for wrong / spent / expired alike: saying which is an oracle about other
  // people's links, and there is nothing useful a customer could do with the difference.
  if (!context) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 mb-3">This link has expired</h1>
        <p className="text-zinc-600">
          Activation links last 7 days. You can still join from the{" "}
          <Link href="/membership" className="font-medium text-zinc-900 underline hover:no-underline">
            membership page
          </Link>
          , or get in touch and we&apos;ll send a new one.
        </p>
      </div>
    );
  }

  if (context.alreadyMember) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 mb-3">You&apos;re already a member</h1>
        <p className="text-zinc-600">
          Nothing more to do — your membership is active.{" "}
          <Link
            href="/account/membership"
            className="font-medium text-zinc-900 underline hover:no-underline"
          >
            Manage your membership
          </Link>
          .
        </p>
      </div>
    );
  }

  // Somebody who already has a password signs in rather than setting a new one over the top of it.
  // A link minted from an address typed at a checkout must never become a second password-reset
  // channel — see the note on `validateAccountStep`.
  if (context.prefill.hasPassword) {
    const next = encodeURIComponent(
      context.planSlug ? `/account/membership/subscribe/${context.planSlug}` : "/membership"
    );
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 mb-3">Sign in to finish joining</h1>
        <p className="text-zinc-600 mb-6">
          You already have an account with <strong>{context.prefill.email}</strong>. Sign in and
          we&apos;ll take you straight to the last step.
        </p>
        <Link
          href={`/account?next=${next}`}
          className="inline-block rounded-lg bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-zinc-800"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Activate your account</h1>
      <p className="text-zinc-600 mb-8">
        {context.orderNumber
          ? `Set a password and check your details — then we'll start the membership you asked for with order ${context.orderNumber}.`
          : "Set a password and check your details, then we'll start your membership."}
      </p>

      <ActivateMembershipForm
        token={token}
        email={context.prefill.email}
        firstName={context.prefill.firstName}
        lastName={context.prefill.lastName}
        phone={context.prefill.phone}
        dateOfBirth={formatDateOfBirth(context.prefill.dateOfBirth)}
        address={context.prefill.address}
      />
    </div>
  );
}
