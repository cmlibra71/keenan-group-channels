import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset password",
};

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { token } = await params;
  // ?welcome=1 marks an ACTIVATION link (a contact setting their first password —
  // see requestPasswordReset). Cosmetic only; the server action validates the
  // token type regardless of what the URL claims.
  const { welcome } = await searchParams;
  const activating = welcome === "1";

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">
        {activating ? "Set your password" : "Set a new password"}
      </h1>
      <ResetPasswordForm token={token} />
    </div>
  );
}
