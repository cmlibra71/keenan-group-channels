import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { safeNextPath } from "@/lib/account-redirect";

export const metadata = {
  title: "Register",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  // Already signed in — honour the destination they were headed for, if any.
  const next = safeNextPath((await searchParams).next);
  if (session) redirect(next ?? "/account");

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Create Account</h1>
      <RegisterForm next={next} />
    </div>
  );
}
