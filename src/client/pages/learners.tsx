import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LearnersPage as Result } from "../../shared/learners.ts";
import { api, type RoomSummary } from "../api.ts";
import { useSession } from "../session.tsx";

const joined = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function Learners() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  // What the list is asking for. A new search or room starts at the first page.
  const [query, setQuery] = useState({ search: "", roomId: "", page: 1 });
  // The answer together with the question it answers, so an old one is never shown as new.
  const [answer, setAnswer] = useState<{ query: typeof query; result: Result | null } | null>(null);
  const [roomsFailed, setRoomsFailed] = useState(false);

  useEffect(() => {
    api.rooms().then(setRooms, () => setRoomsFailed(true));
  }, []);
  useEffect(() => {
    let current = true;
    api.learners(query).then(
      (result) => current && setAnswer({ query, result }),
      () => current && setAnswer({ query, result: null }),
    );
    return () => {
      current = false;
    };
  }, [query]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    setQuery({ ...query, search: text, page: 1 });
  };
  const loading = answer?.query !== query;
  const result = loading ? null : answer.result;
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const turn = (page: number) => setQuery({ ...query, page });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Learners</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="learner-room">Room</Label>
            <select
              id="learner-room"
              className="border-input bg-background h-9 w-full min-w-0 rounded-md border px-3 text-base md:text-sm"
              value={query.roomId}
              onChange={(event) => setQuery({ ...query, roomId: event.target.value, page: 1 })}
            >
              <option value="">All learners</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {roomsFailed && <p className="text-destructive text-sm">Could not load the rooms.</p>}
          </div>
          <form onSubmit={search} className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="learner-search">Name or email</Label>
              <Input id="learner-search" name="q" type="search" maxLength={200} />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {!loading && !result && (
        <div className="flex items-center gap-3">
          <p className="text-destructive text-sm">Could not load the learners.</p>
          <Button size="sm" variant="outline" onClick={() => setQuery({ ...query })}>
            Try again
          </Button>
        </div>
      )}
      {result && (
        <>
          <p className="text-muted-foreground text-sm" data-testid="learner-total">
            {result.total === 0 ? "No learner found." : `${result.total} learner${result.total === 1 ? "" : "s"}`}
          </p>
          <ul className="grid gap-3">
            {result.learners.map((learner) => (
              <li key={learner.id} className="grid gap-1 rounded-lg border p-4" data-testid="learner">
                <div className="font-medium break-words">{learner.name}</div>
                <div className="text-muted-foreground text-sm break-all">{learner.email}</div>
                <div className="text-sm break-words" data-testid="learner-rooms">
                  {learner.rooms.length === 0
                    ? "Not in any room"
                    : `Rooms: ${learner.rooms.map((room) => room.name).join(", ")}`}
                </div>
                <div className="text-muted-foreground text-sm">Signed up {joined.format(learner.createdAt)}</div>
              </li>
            ))}
          </ul>
          {(pages > 1 || result.page > 1) && (
            <nav className="flex items-center justify-between gap-2" aria-label="Pages">
              <Button variant="outline" size="sm" disabled={result.page <= 1} onClick={() => turn(result.page - 1)}>
                Previous
              </Button>
              <span className="text-sm">
                Page {result.page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={result.page >= pages} onClick={() => turn(result.page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/** Spec 7.7. The server decides who may see this; the redirect only saves a useless page. */
export function LearnersPage() {
  const { me } = useSession();
  return me?.role === "instructor" ? <Learners /> : <Navigate to="/" replace />;
}
