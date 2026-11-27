import { instructorEmails } from "./config.ts";

export type Role = "instructor" | "learner";

/** Spec 7.3: the role is derived from the email list on every call and never stored. */
export function roleOf(env: Env, email: string): Role {
  return instructorEmails(env).has(email.trim().toLowerCase()) ? "instructor" : "learner";
}
