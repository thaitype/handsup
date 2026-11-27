import { Link, useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Better Auth sends sign-in failures here (spec 7.0 errorURL, 7.2). */
export function AuthErrorPage() {
  const [params] = useSearchParams();
  const notLinked = params.get("error") === "account_not_linked";
  return (
    <div className="grid gap-4">
      <Alert variant="destructive">
        <AlertTitle>{notLinked ? "This email already has an account" : "Sign-in did not work"}</AlertTitle>
        <AlertDescription>
          {notLinked ? (
            <p data-testid="account-not-linked">
              Each email can sign in only the way its account was first created. If you made the
              account with a password, sign in with your email and password. If you first used
              Google, use “Continue with Google”. Ask your instructor if you are not sure.
            </p>
          ) : (
            <p data-testid="generic-error">Something went wrong while signing in. Please try again.</p>
          )}
        </AlertDescription>
      </Alert>
      <Link to="/sign-in" className="underline">
        Back to sign in
      </Link>
    </div>
  );
}
