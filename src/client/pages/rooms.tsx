import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, type RoomSummary } from "../api.ts";
import { useSession } from "../session.tsx";

const directLink = (code: string) => `${window.location.origin}/join#code=${code}`;

function CreateRoom({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    try {
      await api.createRoom(name);
      form.reset();
      setError(null);
      onCreated();
    } catch {
      setError("Could not create the room. Use a name of 1 to 100 characters.");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a room</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="room-name">Room name</Label>
            <Input id="room-name" name="name" maxLength={100} required />
          </div>
          <Button type="submit">Create</Button>
        </form>
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}

function JoinWithCode({ onJoined }: { onJoined: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.join(String(new FormData(form).get("code") ?? ""));
      form.reset();
      setError(null);
      onJoined();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 429
          ? "Too many tries. Wait a minute and try again."
          : "This invite code does not work.",
      );
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Join with a code</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex items-end gap-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="code">Invite code</Label>
            <Input id="code" name="code" autoComplete="off" maxLength={64} required />
          </div>
          <Button type="submit">Join</Button>
        </form>
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function RoomsPage() {
  const { me } = useSession();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    api.rooms().then(setRooms, () => setError(true));
  }, []);
  useEffect(load, [load]);
  const instructor = me?.role === "instructor";

  const rotate = async (room: RoomSummary) => {
    await api.rotateCode(room.id);
    load();
  };

  return (
    <div className="grid gap-6">
      {instructor ? <CreateRoom onCreated={load} /> : <JoinWithCode onJoined={load} />}
      <section className="grid gap-3">
        <h1 className="text-xl font-semibold">{instructor ? "All rooms" : "Your rooms"}</h1>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Could not load rooms.</AlertDescription>
          </Alert>
        )}
        {rooms?.length === 0 && (
          <p className="text-muted-foreground">
            {instructor ? "No rooms yet." : "You have not joined a room yet. Open the link your instructor shared."}
          </p>
        )}
        <ul className="grid gap-3" data-testid="rooms">
          {rooms?.map((room) => (
            <li key={room.id} className="rounded-lg border p-4" data-testid="room">
              <div className="font-medium">{room.name}</div>
              {room.inviteCode && (
                <div className="mt-2 grid gap-2 text-sm">
                  <div>
                    Code <span className="font-mono" data-testid="invite-code">{room.inviteCode}</span>
                  </div>
                  <div className="text-muted-foreground font-mono break-all" data-testid="direct-link">
                    {directLink(room.inviteCode)}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(directLink(room.inviteCode!))}>
                      Copy link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rotate(room)}>
                      New code
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
