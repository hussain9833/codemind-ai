import { LinkButton } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { ResetPasswordForm } from "@/components/features/reset-password-form";
import { peekResetToken } from "@/lib/reset-token";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekResetToken(token) : null;
  if (!token || !valid) {
    return (
      <ErrorState
        title="This reset link can't be used"
        description="It may have expired (links last 30 minutes), already been used, or been replaced by a newer request."
        actions={<LinkButton href="/forgot-password" variant="primary">Request a new link</LinkButton>}
      />
    );
  }
  return <ResetPasswordForm token={token} />;
}
