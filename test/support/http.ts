/** Drives the real Worker entry point the way a browser would. */
import { exports } from "cloudflare:workers";

export const ORIGIN = "http://localhost:5173";
export const PASSWORD = "correct-horse-battery-staple";

let nextClient = 0;
/** Every client gets its own address so tests do not share a rate limit bucket. */
const clientAddress = () => `198.51.100.${(nextClient++ % 250) + 1}`;

export class Browser {
  readonly #cookies = new Map<string, string>();
  /** The client address Cloudflare would report. Settable, for people behind one address. */
  address = clientAddress();

  constructor(private readonly send = (request: Request) => exports.default.fetch(request)) {}

  fetch(path: string, body?: unknown): Promise<Response> {
    return this.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });
  }

  /** Any request, sent with this browser's cookies, origin and address. */
  async request(path: string, init: RequestInit, origin: string | null = ORIGIN): Promise<Response> {
    const headers = new Headers(init.headers);
    if (origin !== null) headers.set("origin", origin);
    headers.set("cf-connecting-ip", this.address);
    if (this.#cookies.size > 0) {
      headers.set("cookie", [...this.#cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const response = await this.send(
      new Request(new URL(path, ORIGIN), { ...init, headers, redirect: "manual" }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value) this.#cookies.set(name, value);
      else this.#cookies.delete(name);
    }
    return response;
  }

  /** A second holder of the same cookies, as a copied cookie would be. */
  clone(): Browser {
    const copy = new Browser(this.send);
    for (const [name, value] of this.#cookies) copy.#cookies.set(name, value);
    return copy;
  }

  /** The `cookie` header this browser would send. */
  cookieHeader() {
    return [...this.#cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  signUp(email: string, name = "Test User", password = PASSWORD) {
    return this.fetch("/api/auth/sign-up/email", { name, email, password });
  }

  signIn(email: string, password = PASSWORD) {
    return this.fetch("/api/auth/sign-in/email", { email, password });
  }

  async me() {
    const response = await this.fetch("/api/me");
    const body = (await response.json()) as { email?: string; role?: string };
    return { status: response.status, ...body };
  }
}

export const uniqueEmail = (label: string) => `${label}-${crypto.randomUUID()}@example.test`;
