import { Suspense } from "react";
import { SignedInRedirect } from "../signed-in-redirect";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <>
      <SignupForm />
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
    </>
  );
}
