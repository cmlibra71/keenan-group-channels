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
    <div className="mx-auto max-w-lg px-6 lg:px-8 section-padding">
      <p className="eyebrow mb-3">JOIN US</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-8">Create Account</h1>
      <RegisterForm />
    </div>
  );
}
