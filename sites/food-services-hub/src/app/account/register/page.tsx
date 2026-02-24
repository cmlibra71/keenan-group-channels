import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata = {
  title: "Register",
};

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/account");

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Create Account</h1>
      <RegisterForm />
    </div>
  );
}
