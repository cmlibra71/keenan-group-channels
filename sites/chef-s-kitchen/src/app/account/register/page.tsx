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
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-[center_top_30%]"
        style={{ backgroundImage: "url('https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/site-assets/membership-register.png')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-zinc-900/50 to-zinc-900/30" />
      <div className="relative z-10 container-page py-20 sm:py-28">
        <div className="backdrop-blur-xl bg-white/30 border border-white/25 rounded-[28px] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.15)] max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70 mb-3">JOIN US</p>
          <h1 className="text-3xl heading-serif text-white mb-8">Create Membership Account</h1>
          <RegisterForm />
        </div>
      </div>
    </section>
  );
}
