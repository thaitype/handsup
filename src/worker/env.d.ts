// Values that are not declared in wrangler.jsonc but must exist at runtime.
// Declared here so typechecking does not depend on a developer's .dev.vars.
interface AppVars {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  INSTRUCTOR_EMAILS: string;
  RESET_LINK_TTL_SECONDS?: string;
  SOCKET_MAX_LIFETIME_SECONDS?: string;
  /** Must never be set: Better Auth would use it instead of BETTER_AUTH_SECRET. */
  BETTER_AUTH_SECRETS?: string;
}
interface Env extends AppVars {}
declare namespace Cloudflare {
  interface Env extends AppVars {}
}
