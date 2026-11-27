import { Link, Navigate, Route, Routes, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { api } from "./api.ts";
import { pendingJoin } from "./pending-join.ts";
import { AuthErrorPage } from "./pages/auth-error.tsx";
import { JoinPage } from "./pages/join.tsx";
import { RoomsPage } from "./pages/rooms.tsx";
import { SignInPage, SignUpPage } from "./pages/sign-in.tsx";
import { useSession } from "./session.tsx";

export function App() {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const signOut = async () => {
    await api.signOut();
    // A code waiting for this person must not carry over to whoever signs in next.
    pendingJoin.clear();
    await refresh();
    navigate("/sign-in");
  };

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold">
          handsup
        </Link>
        {me && (
          <div className="flex items-center gap-3 text-sm">
            <span data-testid="who">
              {me.name} ({me.role})
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        )}
      </header>
      <main>
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <Routes>
            <Route path="/" element={me ? <RoomsPage /> : <Navigate to="/sign-in" replace />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/auth/error" element={<AuthErrorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
