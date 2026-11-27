import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "../api.ts";
import { sessionChannel } from "../session-channel.ts";
import { useSession } from "../session.tsx";

/** Spec 7.4: set a new password with the link an instructor handed over. */
export function ResetPage() {
  const { refresh } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  // Held in memory only, and taken out of the address bar straight away.
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token"));
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (location.hash) navigate("/reset", { replace: true });
  }, [location.hash, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token!, password);
      setDone(true);
      // Every session of that account has just ended, possibly this browser's too.
      await refresh();
      sessionChannel.announce("signed-in");
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === "INVALID_TOKEN"
          ? "This link does not work any more. Ask your instructor for a new one."
          : "Could not set the password. Use 8 to 128 characters and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {done ? (
          <p data-testid="reset-done">
            Your password is changed. <Link to="/sign-in" className="underline">Sign in</Link>
          </p>
        ) : !token ? (
          <p>This page needs the link your instructor gave you.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
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
              Set password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
