import { redirectIfSignedIn } from "@/lib/auth-guard";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  await redirectIfSignedIn();
  return <SignupForm />;
}
