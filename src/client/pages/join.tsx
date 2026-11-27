import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "../api.ts";
import { pendingJoin } from "../pending-join.ts";
import { useSession } from "../session.tsx";

/** Reads `#code=` once, keeps it in sessionStorage and takes it out of the address bar. */
function takeCodeFromHash(): string | null {
  const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
  if (code) {
    pendingJoin.set(code);
    window.history.replaceState(null, "", window.location.pathname);
  }
  return pendingJoin.get();
}

/**
 * Spec 7.5: opening a direct link never joins. A signed-in person sees the code and joins
 * with a POST only when they press the button.
 */
export function JoinPage() {
  const { me } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState(takeCodeFromHash);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A second link opened in the same tab only changes the hash, which is not a new page.
  useEffect(() => {
    const onHashChange = () => {
      setCode(takeCodeFromHash());
      setError(null);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (!code) {
    return (
      <p>
        There is no invite code here. Ask your instructor for the link, or{" "}
        <Link to="/" className="underline">go to your rooms</Link>.
      </p>
    );
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.join(code);
      pendingJoin.clear();
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "invalid_code") {
        pendingJoin.clear();
        setError("This invite code does not work. It may have been changed; ask your instructor for a new link.");
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError("Too many tries. Wait a minute and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a room</CardTitle>
        <CardDescription>
          Invite code <span data-testid="pending-code" className="font-mono">{code}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {me ? (
          <Button onClick={join} disabled={busy}>
            Join room
          </Button>
        ) : (
          <div className="grid gap-2">
            <p>Sign in or create an account first. You will come back here to confirm.</p>
            <div className="flex gap-2">
              <Button asChild>
                <Link to="/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/sign-up">Create an account</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
