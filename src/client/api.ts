/** Calls to the app's own API. Every write is JSON, which the server's write gate requires. */
import type { LearnersPage } from "../shared/learners.ts";
import type { RemoveResult, UpsertResult, Visibility } from "../shared/protocol.ts";

export type Me = { id: string; name: string; email: string; role: "instructor" | "learner" };
export type RoomSummary = { id: string; name: string; createdAt: number; inviteCode?: string };

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  resetRefusal: "instructor_account" | "google_account" | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PUT" | "DELETE" = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = String(data.code ?? data.error ?? "error");
    throw new ApiError(response.status, code, String(data.message ?? code));
  }
  return data as T;
}

const questions = (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}/questions`;
const oneQuestion = (roomId: string, questionId: string) =>
  `${questions(roomId)}/${encodeURIComponent(questionId)}`;

export const api = {
  learners: ({ search, roomId, page }: { search: string; roomId: string; page: number }) => {
    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set("q", search);
    if (roomId) query.set("room", roomId);
    return call<LearnersPage>(`/api/admin/learners?${query}`);
  },
  searchUsers: (query: string) =>
    call<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`).then((r) => r.users),
  resetLink: (userId: string) =>
    call<{ link: string; expiresInSeconds: number }>(
      `/api/admin/users/${encodeURIComponent(userId)}/reset-link`,
      {},
    ),
  resetPassword: (token: string, newPassword: string) =>
    call("/api/auth/reset-password", { token, newPassword }),
  ask: (roomId: string, body: string, visibility: Visibility, clientRequestId: string) =>
    call<UpsertResult>(questions(roomId), { body, visibility, clientRequestId }),
  answer: (roomId: string, questionId: string, body: string, clientRequestId: string) =>
    call<UpsertResult>(`${oneQuestion(roomId, questionId)}/answers`, { body, clientRequestId }),
  setResolved: (roomId: string, questionId: string, resolved: boolean) =>
    call<UpsertResult>(`${oneQuestion(roomId, questionId)}/resolved`, { resolved }, "PUT"),
  deleteQuestion: (roomId: string, questionId: string) =>
    call<RemoveResult>(oneQuestion(roomId, questionId), undefined, "DELETE"),
  deleteAnswer: (roomId: string, questionId: string, answerId: string) =>
    call<UpsertResult>(
      `${oneQuestion(roomId, questionId)}/answers/${encodeURIComponent(answerId)}`,
      undefined,
      "DELETE",
    ),
  me: async (): Promise<Me | null> => {
    try {
      return await call<Me>("/api/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  signUp: (name: string, email: string, password: string) =>
    call("/api/auth/sign-up/email", { name, email, password }),
  signIn: (email: string, password: string) => call("/api/auth/sign-in/email", { email, password }),
  signOut: () => call("/api/auth/sign-out", {}),
  /** Starts Google's redirect flow; the browser leaves the page. */
  signInWithGoogle: async (callbackURL: string) => {
    const { url } = await call<{ url: string }>("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL,
    });
    window.location.assign(url);
  },
  rooms: () => call<{ rooms: RoomSummary[] }>("/api/rooms").then((r) => r.rooms),
  createRoom: (name: string) => call<Required<RoomSummary>>("/api/rooms", { name }),
  rotateCode: (roomId: string) =>
    call<{ inviteCode: string }>(`/api/rooms/${encodeURIComponent(roomId)}/invite-code/rotate`, {}),
  join: (code: string) => call<{ room: { id: string; name: string } }>("/api/join", { code }),
};
