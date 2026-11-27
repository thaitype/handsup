import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "../api.ts";
import { afterSignIn, pendingJoin } from "../pending-join.ts";
import { useSession } from "../session.tsx";

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  PASSWORD_TOO_SHORT: "The password needs at least 8 characters.",
  PASSWORD_TOO_LONG: "The password can have at most 128 characters.",
  INVALID_EMAIL: "That email address does not look right.",
};

const describe = (error: unknown) =>
  error instanceof ApiError
    ? (messages[error.code] ?? (error.status === 429 ? "Too many tries. Wait a minute." : error.message))
    : "Something went wrong. Please try again.";

function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signUp = mode === "sign-up";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    setBusy(true);
    setError(null);
    try {
      if (signUp) await api.signUp(field("name"), field("email"), field("password"));
      else await api.signIn(field("email"), field("password"));
      await refresh();
      navigate(afterSignIn(), { replace: true });
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      await api.signInWithGoogle(afterSignIn());
    } catch (caught) {
      setError(describe(caught));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{signUp ? "Create an account" : "Sign in"}</CardTitle>
        {pendingJoin.get() && (
          <CardDescription>You will be asked to confirm joining the room afterwards.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <form onSubmit={submit} className="grid gap-4">
          {signUp && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={signUp ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {signUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        <Button variant="outline" onClick={google}>
          Continue with Google
        </Button>
        <p className="text-muted-foreground text-sm">
          {signUp ? (
            <>
              Already have an account? <Link to="/sign-in" className="underline">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/sign-up" className="underline">Create an account</Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export const SignInPage = () => <AuthForm mode="sign-in" />;
export const SignUpPage = () => <AuthForm mode="sign-up" />;
