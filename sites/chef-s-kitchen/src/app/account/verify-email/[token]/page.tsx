import { VerifyEmailConfirm } from "@/components/account/VerifyEmailConfirm";

export const metadata = {
  title: "Confirm email change",
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="page-title mb-8">Confirm your new email</h1>
      <VerifyEmailConfirm token={token} />
    </div>
  );
}
