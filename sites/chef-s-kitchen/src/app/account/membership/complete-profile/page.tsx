import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CHANNEL_ID, subscriptionService, getCheckoutSettings } from "@/lib/store";
import { getMembershipProfile } from "@/lib/membership";
import { CompleteProfileForm } from "./CompleteProfileForm";

export const metadata = {
  title: "Complete your membership details",
};

export default async function CompleteProfilePage() {
  const session = await getSession();
  if (!session) redirect("/account");

  // Must have a subscription (active or pending) to be here.
  const subs = await subscriptionService.listForContact(session.contactId, CHANNEL_ID);
  const sub = subs.find((s) => s.status === "active" || s.status === "pending");
  if (!sub) redirect("/membership");

  const { customer, complete } = await getMembershipProfile(session.contactId);
  if (complete) redirect("/membership/welcome");

  const checkoutSettings = await getCheckoutSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="page-title mb-2">Almost there — complete your details</h1>
      <p className="text-text-secondary mb-8">
        Thanks for joining! Add your business and billing details to finish
        setting up your membership.
      </p>

      <div className="border border-border rounded-card bg-white p-6 shadow-sm">
        <CompleteProfileForm
          defaultCompany={(customer?.company as string) || ""}
          defaultPhone={(customer?.phone as string) || ""}
          googlePlacesEnabled={checkoutSettings.googlePlacesEnabled}
        />
      </div>
    </div>
  );
}
