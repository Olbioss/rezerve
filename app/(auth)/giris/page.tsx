import { redirectIfSignedIn } from "@/lib/auth-guard";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  await redirectIfSignedIn();
  return <LoginForm />;
}
