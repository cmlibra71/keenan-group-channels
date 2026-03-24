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
    <div className="mx-auto max-w-lg px-6 lg:px-8 py-20 sm:py-24">
      <p className="heading-sans text-teal tracking-widest mb-3">JOIN US</p>
      <h1 className="text-3xl heading-serif text-navy mb-8">Create Account</h1>
      <RegisterForm />
    </div>
  );
}
