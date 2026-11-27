/** Calls to the app's own API. Every write is JSON, which the server's write gate requires. */
export type Me = { id: string; name: string; email: string; role: "instructor" | "learner" };
export type RoomSummary = { id: string; name: string; createdAt: number; inviteCode?: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
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

export const api = {
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
