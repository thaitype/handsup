/**
 * The room data that crosses the wire (spec 8.2), shared by the Worker and the browser.
 * These are views: what one viewer may see. Database rows have their own types and never
 * leave the room object.
 */
export const PROTOCOL_VERSION = 1;

export type Visibility = "public" | "private";

/**
 * One message in the thread under a question: an instructor's answer or the asker's own
 * follow-up. Only those two may write there.
 */
export type AnswerView = {
  id: string;
  /** Null when it is the asker's message and this viewer may not see the asker's name. */
  authorName: string | null;
  fromInstructor: boolean;
  isMine: boolean;
  body: string;
  createdAt: number;
};

export type QuestionView = {
  id: string;
  visibility: Visibility;
  body: string;
  /** Null when this viewer may see the question but not who asked it. */
  authorName: string | null;
  isMine: boolean;
  createdAt: number;
  resolvedAt: number | null;
  answers: AnswerView[];
};

export type RoomInfo = { id: string; name: string };

export type SnapshotMessage = {
  v: typeof PROTOCOL_VERSION;
  type: "snapshot";
  room: RoomInfo;
  questions: QuestionView[];
};

export type ServerMessage =
  | SnapshotMessage
  | { v: typeof PROTOCOL_VERSION; type: "question.upsert"; question: QuestionView }
  | { v: typeof PROTOCOL_VERSION; type: "question.remove"; questionId: string };

/** A write answers with the caller's own view of what it changed. */
export type UpsertResult = { question: QuestionView };
export type RemoveResult = { questionId: string };

/** Close codes of spec 8.4. */
export const CLOSE_RECONNECT = 4001;
export const CLOSE_FORBIDDEN = 4003;
export const CLOSE_PROTOCOL = 4400;

/** Spec N5. */
export const BODY_MAX_CHARS = 4000;
export const ROOM_MAX_QUESTIONS = 1000;
export const POST_LIMIT = 10;
export const POST_WINDOW_MS = 60_000;
