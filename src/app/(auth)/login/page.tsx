import { AuthForm } from "@/components/features/auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return <AuthForm mode="login" next={next} notice={reset === "1" ? "Password updated. Sign in with your new password." : undefined} />;
}
