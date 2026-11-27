// Pure helpers for the production check and its cleanup.
export const TEST_DOMAIN = "handsup-prodcheck.invalid";
/** The only addresses the cleanup will ever touch. `.invalid` can belong to nobody. */
export const TEST_EMAIL = /^prodcheck-[0-9a-z]+-(a|b|load-\d{2})@handsup-prodcheck\.invalid$/;

/** Nearest-rank percentile. */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** What is wrong with the session cookie of an https site, from its Set-Cookie lines. */
export function cookieProblems(setCookies) {
  const session = setCookies.find((line) => /^[^=]*session_token=/.test(line));
  if (!session) return ["no session cookie was set"];
  const [pair, ...attributes] = session.split(";").map((part) => part.trim());
  const has = (name) => attributes.some((a) => a.toLowerCase() === name.toLowerCase());
  const problems = [];
  if (!pair.startsWith("__Secure-")) problems.push("name has no __Secure- prefix");
  if (!has("Secure")) problems.push("no Secure");
  if (!has("HttpOnly")) problems.push("no HttpOnly");
  if (!has("SameSite=Lax")) problems.push("no SameSite=Lax");
  return problems;
}

/** SQL for the test accounts. Refuses any address that is not one of ours. */
export function cleanupSql(emails) {
  if (emails.length === 0) throw new Error("no accounts listed");
  const foreign = emails.filter((email) => !TEST_EMAIL.test(email));
  if (foreign.length > 0) throw new Error(`${foreign.length} listed address(es) are not test accounts`);
  const list = emails.map((email) => `'${email}'`).join(", ");
  const ids = `(select id from "user" where email in (${list}))`;
  const owned = [
    ["verification", `"value" in ${ids}`],
    ["post_attempt", `user_id in ${ids}`],
    ["join_attempt", `user_id in ${ids}`],
    ["room_member", `user_id in ${ids}`],
    ["session", `"userId" in ${ids}`],
    ["account", `"userId" in ${ids}`],
    ["user", `email in (${list})`],
  ];
  const counts = [
    ...owned.map(([table, where]) => `(select count(*) from "${table}" where ${where}) as "${table}"`),
    `(select count(*) from room where created_by in ${ids}) as rooms_created`,
    `(select count(*) from "user" where email not in (${list})) as other_users`,
  ];
  return {
    count: `select ${counts.join(", ")}`,
    found: `select email from "user" where email in (${list}) order by email`,
    // The user rows go last: every other statement finds its rows through them.
    remove: owned.map(([table, where]) => `delete from "${table}" where ${where}`).join("; "),
  };
}
