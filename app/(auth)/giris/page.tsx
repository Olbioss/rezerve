import { Suspense } from "react";
import { SignedInRedirect } from "../signed-in-redirect";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
    </>
  );
}
