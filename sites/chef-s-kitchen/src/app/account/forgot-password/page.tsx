import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="page-title mb-8">Reset your password</h1>
      <ForgotPasswordForm />
    </div>
  );
}
