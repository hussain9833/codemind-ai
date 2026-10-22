import { ForgotForm } from "@/components/features/forgot-form";
import { emailResetAvailable } from "@/lib/mail";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return <ForgotForm emailAvailable={emailResetAvailable()} />;
}
