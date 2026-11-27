import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BODY_MAX_CHARS, type QuestionView, type RemoveResult, type UpsertResult, type Visibility } from "../../shared/protocol.ts";
import { api, ApiError } from "../api.ts";
import type { RoomState } from "../room/connection.ts";
import { useRoom } from "../room/use-room.ts";
import { useSession } from "../session.tsx";

const FIELD = "border-input bg-background w-full rounded-md border px-3 py-2 text-sm";

const failureText = (error: unknown) => {
  if (error instanceof ApiError && error.status === 429) return "Too many posts. Wait a minute and try again.";
  if (error instanceof ApiError && error.code === "room_full") return "This room is full.";
  return "That did not work. Try again.";
};

/** Runs one write and shows its result, or why it failed. */
function useWrite(applyWrite: (result: UpsertResult | RemoveResult) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (write: () => Promise<UpsertResult | RemoveResult>) => {
    setBusy(true);
    try {
      applyWrite(await write());
      setError(null);
      return true;
    } catch (caught) {
      setError(failureText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy };
}

/**
 * A text box that posts. The same request id is reused until the post succeeds, so trying
 * again after a lost response does not post twice (spec 8.3).
 */
function Composer({
  label,
  submitLabel,
  post,
  applyWrite,
  children,
}: {
  label: string;
  submitLabel: string;
  post: (body: string, clientRequestId: string) => Promise<UpsertResult>;
  applyWrite: (result: UpsertResult) => void;
  children?: React.ReactNode;
}) {
  const [body, setBody] = useState("");
  const requestId = useRef<string | null>(null);
  const { run, error, busy } = useWrite((result) => applyWrite(result as UpsertResult));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) return;
    requestId.current ??= crypto.randomUUID();
    const id = requestId.current;
    if (await run(() => post(body, id))) {
      requestId.current = null;
      setBody("");
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-2">
      <textarea
        aria-label={label}
        placeholder={label}
        className={FIELD}
        rows={2}
        maxLength={BODY_MAX_CHARS * 2}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          requestId.current = null;
        }}
        required
      />
      {children}
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}

function Ask({ roomId, applyWrite }: { roomId: string; applyWrite: (result: UpsertResult) => void }) {
  const [visibility, setVisibility] = useState<Visibility>("public");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask a question</CardTitle>
      </CardHeader>
      <CardContent>
        <Composer
          label="Your question"
          submitLabel="Ask"
          applyWrite={applyWrite}
          post={(body, id) => api.ask(roomId, body, visibility, id)}
        >
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Who can see it</legend>
            {(
              [
                ["public", "ถามแบบ public"],
                ["private", "ถามส่วนตัว (ผู้สอนเห็นชื่อคุณ)"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                />
                {text}
              </label>
            ))}
          </fieldset>
        </Composer>
      </CardContent>
    </Card>
  );
}

function Question({
  roomId,
  question,
  isInstructor,
  applyWrite,
}: {
  roomId: string;
  question: QuestionView;
  isInstructor: boolean;
  applyWrite: (result: UpsertResult | RemoveResult) => void;
}) {
  const { run, error, busy } = useWrite(applyWrite);
  const isPrivate = question.visibility === "private";
  const resolved = question.resolvedAt !== null;
  return (
    <li
      data-testid="question"
      data-visibility={question.visibility}
      className={cn("grid gap-3 rounded-lg border p-4", isPrivate && "border-dashed border-amber-500 bg-amber-500/10")}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium" data-testid="asker">
          {question.authorName ?? "คุณ"}
        </span>
        {isPrivate && <span className="rounded-full border border-amber-500 px-2 text-xs">คำถามส่วนตัว</span>}
        {resolved && (
          <span className="rounded-full border px-2 text-xs" data-testid="resolved">
            Resolved
          </span>
        )}
      </div>
      <p className="break-words whitespace-pre-wrap" data-testid="question-body">
        {question.body}
      </p>
      {question.answers.length > 0 && (
        <ul className="grid gap-2 border-l-2 pl-3">
          {question.answers.map((answer) => (
            <li key={answer.id} data-testid="answer" className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{answer.authorName}</span>
                {isInstructor && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run(() => api.deleteAnswer(roomId, question.id, answer.id))}
                  >
                    Delete answer
                  </Button>
                )}
              </div>
              <p className="break-words whitespace-pre-wrap">{answer.body}</p>
            </li>
          ))}
        </ul>
      )}
      {isInstructor && (
        <Composer
          label="Your answer"
          submitLabel="Answer"
          applyWrite={applyWrite}
          post={(body, id) => api.answer(roomId, question.id, body, id)}
        />
      )}
      {(isInstructor || question.isMine) && (
        <div className="flex gap-2">
          {isInstructor && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => api.setResolved(roomId, question.id, !resolved))}
            >
              {resolved ? "Mark unresolved" : "Mark resolved"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => api.deleteQuestion(roomId, question.id))}
          >
            Delete question
          </Button>
        </div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </li>
  );
}

/** Spec 8.6: nothing while the socket is live. */
function ConnectionStatus({ status, updatedAt }: Pick<RoomState, "status" | "updatedAt">) {
  if (status === "live" || status === "connecting") return null;
  return (
    <Alert data-testid="connection" data-status={status}>
      <AlertDescription>
        {status === "fallback"
          ? "โหมดสำรอง: อัปเดตประมาณทุก 30 วินาที รีเฟรชเพื่อดูทันที"
          : "เชื่อมต่อไม่ได้ กำลังลองใหม่"}
        {updatedAt !== null && (
          <span data-testid="updated-at"> · อัปเดตล่าสุด {new Date(updatedAt).toLocaleTimeString()}</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Room({ roomId }: { roomId: string }) {
  const { me, refresh } = useSession();
  const { room, questions, status, updatedAt, ended, applyWrite } = useRoom(roomId);
  const isInstructor = me?.role === "instructor";

  // The server says this session is over: ask who is signed in, which leads to sign-in.
  useEffect(() => {
    if (ended === "signed-out") void refresh();
  }, [ended, refresh]);

  if (ended === "forbidden") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          You do not have access to this room. <Link to="/">Back to your rooms</Link>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold" data-testid="room-name">
          {room?.name ?? "Room"}
        </h1>
      </div>
      <ConnectionStatus status={status} updatedAt={updatedAt} />
      {!room ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          {!isInstructor && <Ask roomId={roomId} applyWrite={applyWrite} />}
          {questions.length === 0 && <p className="text-muted-foreground">No questions yet.</p>}
          <ul className="grid gap-3" data-testid="questions">
            {questions.map((question) => (
              <Question
                key={question.id}
                roomId={roomId}
                question={question}
                isInstructor={isInstructor}
                applyWrite={applyWrite}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function RoomPage() {
  const { me } = useSession();
  const { id } = useParams();
  if (!me) return <Navigate to="/sign-in" replace />;
  // A new person or a new room starts from nothing.
  return <Room key={`${me.id}:${id}`} roomId={id ?? ""} />;
}
