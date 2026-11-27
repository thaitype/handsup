/** The reset link as an instructor gets it and a learner uses it, through the real routes. */
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { Browser } from "./http.ts";

export const createLink = (instructor: Browser, userId: string) =>
  instructor.fetch(`/api/admin/users/${userId}/reset-link`, {});

export async function tokenFrom(response: Response) {
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const { link } = JSON.parse(text) as { link: string };
  const url = new URL(link);
  expect([url.origin, url.pathname, url.search]).toEqual(["http://localhost:5173", "/reset", ""]);
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  expect(token).toBeTruthy();
  return token!;
}

export const redeem = (token: string, newPassword: string) =>
  new Browser().fetch("/api/auth/reset-password", { token, newPassword });

export async function userId(email: string) {
  const row = await env.DB.prepare('select id from "user" where email = ?').bind(email).first<{ id: string }>();
  return row!.id;
}
