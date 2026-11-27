import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type AdminUser } from "../api.ts";
import { useSession } from "../session.tsx";

const REFUSALS = {
  instructor_account: "Instructor account: no reset link.",
  google_account: "Signs in with Google: no reset link.",
} as const;

function UserRow({ user }: { user: AdminUser }) {
  const [link, setLink] = useState<{ link: string; expiresInSeconds: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const create = async () => {
    setFailed(false);
    try {
      setLink(await api.resetLink(user.id));
    } catch {
      setFailed(true);
    }
  };
  return (
    <li className="grid gap-2 rounded-lg border p-4" data-testid="admin-user">
      <div className="font-medium">{user.name}</div>
      <div className="text-muted-foreground text-sm break-all">{user.email}</div>
      {user.resetRefusal ? (
        <p className="text-muted-foreground text-sm">{REFUSALS[user.resetRefusal]}</p>
      ) : (
        <div>
          <Button size="sm" onClick={create}>
            Create reset link
          </Button>
        </div>
      )}
      {link && (
        <div className="grid gap-2 text-sm">
          <p>
            Send this to {user.name}. It works once, for {Math.round(link.expiresInSeconds / 3600)} hours, and replaces
            any earlier link. It is not shown again.
          </p>
          <div className="font-mono break-all" data-testid="reset-link">
            {link.link}
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link.link)}>
              Copy link
            </Button>
          </div>
        </div>
      )}
      {failed && <p className="text-destructive text-sm">Could not create the link.</p>}
    </li>
  );
}

export function AdminPage() {
  const { me } = useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  if (me?.role !== "instructor") return <Navigate to="/" replace />;
  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") ?? "");
    setFailed(false);
    try {
      setUsers(await api.searchUsers(query));
    } catch {
      setFailed(true);
    }
  };
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Reset a password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={search} className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="user-search">Name or email</Label>
              <Input id="user-search" name="q" maxLength={200} required />
            </div>
            <Button type="submit">Search</Button>
          </form>
          {failed && <p className="text-destructive mt-2 text-sm">Search failed.</p>}
        </CardContent>
      </Card>
      {users?.length === 0 && <p className="text-muted-foreground">No user found.</p>}
      <ul className="grid gap-3">
        {users?.map((user) => <UserRow key={user.id} user={user} />)}
      </ul>
    </div>
  );
}
