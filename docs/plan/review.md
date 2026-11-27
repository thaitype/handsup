# Review: spec-proposal.md against realtime-forum-spec.original.md

- Reviewer: engineer-director
- Date: 2026-11-27
- Inputs: `docs/spec/realtime-forum-spec.original.md` (Mild's draft, Decided items treated as fixed), `docs/spec/spec-proposal.md` (builder)
- Round 1 verdict: REVISE (R1 to R14 below).
- Round 2 verdict (spec revision 1): ACCEPT pending two small edits (R15, R16).
- Round 3 verdict: PASS (R1 to R16 applied).
- Round 4 verdict: PASS, publishable; R17 to R20 required before G0; DEC-4 open.
- Round 5 verdict: PASS (Workers Paid, R17 to R20).
- **Round 6 verdict (polling fallback, 2026-11-27): PASS.** R21 to R23 are applied. The polling fallback is sound and proportionate. One doc edit blocks publishing (R27: two header lines). R24 to R26 are small and do not block. R28 (frontend stack text) must be in the spec before M1. See "Round 6" at the end.

## Required changes, by severity

### High

**R1. The leak canary (AC9) passes if learner B's socket is dead.**
AC9 checks that B received *nothing* about A's anonymous question. A broken WebSocket, a B that never joined, or a reconnect that never happened all produce "nothing" and pass. The positive controls the proposal names (A and the instructor see the marker) prove the question exists. They do not prove B was listening.
Required change: B must be connected *before* A posts. After every phase (post, answer, resolve, delete, reconnect, fresh connect, after `evictDurableObject`), A posts a **public** marker, and the test asserts that B receives it on the same socket within the timeout. The anonymous assertion counts only for phases where B's public control arrived. Make this rule apply to the whole suite: every "receives nothing" assertion is paired with a "receives this" assertion on the same channel in the same phase.

**R2. Showing the instructor view on a projector leaks anonymous questions to other learners, against Decided DC6.**
In a realtime classroom forum, the instructor showing their screen to the room is the main use case, not an edge case. The proposal lists it under "not prevented" in 6.3 and offers a "hide anonymous" button as an optional extra. DC6 says other learners do not see these questions. On a shared screen they do.
Required change: move it into v1 scope as a **presenter mode** in the instructor UI: a single toggle that removes anonymous questions from the rendered list. A client-side filter is enough because it only affects the instructor's own screen. Anonymous items must also look clearly different in normal instructor view. Add one acceptance check: with presenter mode on, the anonymous marker is not in the DOM. This is a default Mild can override, not a decision he must make.

**R3. Password hashing is a feasibility risk on memory as well as CPU, and Workers Paid fixes only the CPU part.**
Verified: `@better-auth/utils@0.5.1` `password.node.mjs` resolves under the `workerd` condition to `node:crypto` `scrypt` with N=16384, r=16, p=1, which is 128·N·r = 32 MiB per hash. The Workers limits page says 128 MB is "per-isolate, not per-invocation" and "A single isolate can handle many concurrent requests". A class signing in at once could put 4 or more concurrent hashes in one isolate. The proposal's N3 answers only CPU (Free 10 ms). Two facts are still unknown: (a) Cloudflare's `node:crypto` page does not mention `scrypt` at all, as supported or unsupported, so workerd support is unverified; (b) whether workerd's native scrypt allocation counts toward the 128 MB, which the page defines as JS heap plus Wasm.
Required change:
- M0 exit gate: build the real bundle and show it imports `node:crypto` scrypt (not a pure-JS fallback). Run sign-up and sign-in under `workerd` locally and record wall time per hash.
- Own `emailAndPassword.password.{hash,verify}` (verified hook, `create-context.mjs:183`) from M1, with a scheme+params prefix on stored hashes so the scheme can change without breaking existing accounts.
- Fallback decided before M1. My round-1 suggestion was PBKDF2. **The builder rejected it and I agree** (verified, round 2): workerd `limit-enforcer.h` caps PBKDF2 at `DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000`, one sixth of OWASP's 600,000 for SHA-256. The fallback is now native scrypt N=16384, r=8, p=5 (16 MiB), then N=8192, r=8, p=10 (8 MiB). Both are OWASP parameter sets, both sit under workerd's scrypt cost cap `N*r*p <= 2^20` (655,360), and each costs about 2.5x the CPU of the default (262,144). If native scrypt fails entirely, or exceeds CPU, stop and return it as a decision.
- Deploy-stage post-check: a burst of 30 concurrent sign-ups, and separately 30 concurrent sign-ins, with zero exceeded-memory or exceeded-CPU errors in Workers logs. Record p99 CPU ms and p99 wall time per request.

**R4. Other gates that pass with the feature absent.**
| AC | Hole | Required control |
| --- | --- | --- |
| AC11 | An endpoint that returns 404 for everything passes | Same test: the owner's delete of that id succeeds, and the comparison against a non-existent id is byte-equal (status + body + relevant headers) |
| AC12 | "Every denied cell is denied" passes if every endpoint is a 4xx stub | The table holds the allowed cell for each action row too, run in the same table. Count both kinds |
| AC14 | Passes if `evictDurableObject` did nothing | Prove the eviction happened (an in-memory instance marker changes, or the constructor ran twice) and that the socket survived as hibernated (default `webSockets` option, verified in test-APIs docs) |
| AC16 | "Socket gets no data after logout" passes if it never got data | The same socket received an event before logout. A second session of the same user still receives after it |
| AC17 | Better Auth skips its own origin check when `NODE_ENV=test` (verified `create-context.mjs:211`), so a test of `/api/auth/*` could be testing nothing, or could test the library check instead of ours | The app-level Origin middleware covers `/api/auth/*` as well as writes and WS upgrades. Set `advanced.disableOriginCheck: false` explicitly. Control: the same request with the correct Origin succeeds |
| AC18 | Better Auth falls back to a fixed localhost IP in test/dev when the header is absent (verified `ip.mjs:231`), so the test passes even if `ipAddressHeaders` is misconfigured | Send `cf-connecting-ip` with two distinct values and show two separate buckets. One value alone must hit 429 at limit+1 |
| AC4 | Passes if every instructor API returns 403 | Control: the same seeded user with `emailVerified=true` and a Google account gets 200 |
| AC20 | "No Cloudflare account" passes on a machine that is logged in | Run it from a fresh clone with `wrangler whoami` showing not authenticated |

The text "in CI" in section 12 has no referent: the repo has no CI. Say "in `pnpm test`", or add CI as named scope.

### Medium

**R5. Library defaults keyed on `NODE_ENV` behave differently on Workers.**
Verified in better-auth 1.7.28: `rateLimit.enabled ?? isProduction`, the default-secret check (`isProduction` only), `skipOriginCheck` in test, the error page, and secure-cookie naming all read `NODE_ENV`. On Workers, `NODE_ENV` is whatever we set, possibly nothing.
Required change: add a spec rule that `createAuth(env)` sets every one of these explicitly: `rateLimit.enabled`, `advanced.disableOriginCheck`, `advanced.useSecureCookies` (derived from the `BETTER_AUTH_URL` scheme), and the builder's fail-fast on a missing secret. Add a unit test that asserts the resolved options in both the test env and a production-like env.

**R6. Reset-link mechanics need two rules written down.**
Verified: `requestPasswordReset` passes the token to `sendResetPassword` through `runInBackgroundOrAwait`, which awaits **unless** `advanced.backgroundTasks.handler` is set. If someone sets it later (it is a common Workers `waitUntil` pattern), token capture races the response. Verified: tokens are stored as `verification.identifier = "reset-password:<token>"`, `value = userId`, and the library has no "delete tokens for user" call.
Required change: (a) spec rule: never set `backgroundTasks.handler`, guarded by a test that the link returned by the admin API resets the password; (b) invalidate older links with an explicit D1 statement on `verification` (identifier prefix plus value), done before creating the new token; (c) configuring `sendResetPassword` makes the public `/request-password-reset` live inside the library, so the allowlist test must enumerate it and also `GET /reset-password/:token`.

**R7. Q1 needs to be decided by Mild, and the anonymous row should not store the name.** (Superseded in round 4 by DEC-1 and R17.)
The builder recommends hiding the asker from the instructor and is honest that the promise is incomplete (`author_id` in the DB, reset-link impersonation). One fact sharpens the decision: Mild is likely both the instructor and the Cloudflare account owner, so "hidden from the instructor" is enforced by his own restraint. The code cost is close for both options (round 2: "show" adds a `participant` table). The real difference is what the UI promises. Sent to Mild as DEC-1.
Required change, whichever way it goes: the anonymous `question` row stores `author_id` only, and `author_name` is NULL by construction. Then a projection bug cannot leak a name that is not there. If Q1 = show name, the name is joined at projection time for instructors only.

**R8. The handoff to the platform operator (section 11) is under-specified.**
It omits the target environment (e2e, not production), the Google redirect URI for the deployed origin (Mild must add it), how the e2e suite gets an instructor session on a real deploy (no seeding backdoor), a version endpoint to prove what is running, the rollback limits (`wrangler rollback` does not revert D1 or DO migrations), and test-data cleanup.
Required change: the builder delivers `GET /api/version` returning the build commit SHA, plus a Playwright suite that takes the base URL and an instructor `storageState` file as inputs. The rest is in `plan.md` M6.

### Low

**R9. Logout socket fan-out (8.4) costs more than it returns in v1.** For an instructor it is one DO call per room. (Corrected in round 4: the original line said these calls count against Free's 50 subrequests per invocation. The limits page does not say whether DO calls count against that limit or against the 1,000 internal-services limit, so that premise was unverified. The recommendation stands on simplicity alone.) Recommendation: keep the server-side kill only for password reset (user tag, the account-recovery case). On logout, the client closes its own socket and `validUntil` is capped at 15 minutes. AC16 becomes "a revoked session cannot reconnect, and an open socket past `validUntil` gets no event". This is the builder's call. Either design is acceptable if AC16 carries the R4 control.

**R10. `reset_audit` has no named reader.** Name one: an operator query in the runbook (`docs/runbook`) to answer "who reset whom". Otherwise drop the table.

**R11. The source scan for a single `ws.send` tests implementation, not behaviour.** Keep it as a lint if cheap. The leak canary (with R1) is the gate.

**R12. Timebox the AC5 mock OAuth provider in M0** (half a day). Fallback: assert the resolved account-linking config (no `trustedProviders`, `requireLocalEmailVerified` not false) plus the manual check in Mild's local acceptance.

**R13. Scope added beyond the draft. Accept as defaults, listed so Mild can see them:** invite-code rotate, admin user search (implied by the reset link), post rate limit 10/min, 1,000-question cap, comma list of instructors, `reset_audit`, close codes, presenter mode (R2). Not in v1 either way: change-password for learners (the draft does not ask for it).

**R14. Library note, accept.** `@better-auth/utils` `verifyPassword` compares hex strings with `===` (not constant time). It is upstream behaviour, low risk behind rate limiting. Record it and do not patch.

## Builder judgment calls I agree with (no change)

U1 to U5, Q2 to Q5, N1, N2, N4 and N5 as proposed. The single projection point (`canSee` / `project` / `QuestionView` without `authorId`), random IDs, writes only over HTTP, snapshot on reconnect with no sequence numbers, the Better Auth path allowlist, the three-condition `isInstructor`, and the reset-target restrictions (no instructor targets, no Google-only targets) are all correct and proportionate for v1.

## Premises: checked by me vs taken from the builder

Checked against primary sources (2026-11-27):
- npm: `better-auth` 1.7.28 latest; `wrangler` 4.168.0 needs Node >=22.12.0; `@cloudflare/vitest-pool-workers` 0.23.0 peer `vitest ^4.1.0`; `@cloudflare/vite-plugin` 1.70.2.
- better-auth source (unpacked tarballs): scrypt params and `workerd` → `node:crypto`; `requireLocalEmailVerified ?? true` → "account not linked" (`oauth2/link-account.mjs:171-175`); `revokeSessionsOnPasswordReset` opt-in; reset creates a credential account if missing; reset TTL 3600 s; special rate rule 3 per 10 s on `/sign-in*` and `/sign-up*`; IP header default `x-forwarded-for`; D1 dialect auto-detected (`kysely-adapter index.mjs:104`).
- Cloudflare docs: Workers CPU Free 10 ms, Paid 30 s default and 5 min max; 128 MB per isolate shared across concurrent requests; `node:crypto` page silent on scrypt; DO `serializeAttachment` 16,384 bytes; a forced code update disconnects WebSockets, while hibernated ones survive adopting new code; `evictDurableObject` exists and hibernates WebSockets by default; DO WebSockets are unsupported with per-file storage isolation, workaround `--max-workers=1 --no-isolate`; D1 Free 50 queries per invocation, Time Travel 7 days Free and 30 days Paid.
- Google: apps requesting only basic identity scopes do not need the test-user list, and their consent does not expire after 7 days (the builder was right).

Taken from the builder, not checked by me: Workers Paid $5 per month; DO pricing and SQLite PITR; Google allowing http for the localhost redirect; local hibernation since wrangler 3.13.2; the 10 s hibernation idle figure (not on the WebSockets page I read); the tag limits; mounting Better Auth in Hono; `new_sqlite_classes`; local dev with no account (gated by AC20); "deprecated" status of `requireLocalEmailVerified`.

---

## Round 2: spec revision 1 (2026-11-27)

### Status of R1 to R14

| R | Status | How I checked |
| --- | --- | --- |
| R1 | Applied | AC9 (B connects first, public control after every phase, a phase whose control never arrives counts as a fail) plus suite rule 1 |
| R2 | Applied | N6, 6.2 row, AC21 (DOM check incl. after reload, control: public marker present, anonymous back when toggled off) |
| R3 | Applied, fallback changed, change accepted | See below |
| R4 | Applied | AC4, AC11, AC12, AC14, AC16, AC17, AC18, AC20 each now carry the control I asked for. Suite rules 1 to 3 |
| R5 | Applied | 7.0 table + AC22. Running AC22 in a separate process is correct: `isProduction` is read once at import (`env-impl.mjs`) |
| R6 | Applied | 7.4 steps 3 and 4, allowlist test enumerates every `auth.api` endpoint. I also verified the new `verification.storeIdentifier: "plain"` row: the default is already plain when unset (`verification-token-storage.mjs:9`), and pinning it keeps the `LIKE 'reset-password:%'` delete valid if a future default changes to hashed |
| R7 | Applied | `author_name` NULL on anonymous rows by a CHECK constraint. Q1's "show" alternative adds a `participant` table joined inside the DO (a D1 read would break the synchronous snapshot block). `instructor_sees_author` per row makes a later policy change non-retroactive. Proportionate |
| R8 | Applied | Section 11 handoff table, `/api/version`, AC23 |
| R9 | Applied (logout is client-only, reset still kills server-side) | 8.4, AC16. The accepted residual (a stolen-cookie socket gets at most 15 minutes of events and cannot reconnect) is stated |
| R10 to R14 | Applied | 5 (`reset_audit` reader), 6.2 (lint is not a gate), AC5 timebox + honest note that the fallback proves config only, 2.4 scope table, 7.1 `timingSafeEqual` note |

### R3: the builder's dispute, checked myself

Read from `cloudflare/workerd` main at `9eeb52b` (same commit the builder used), not run:
- `src/workerd/io/limit-enforcer.h:28-29,85-104`: `DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000`, `DEFAULT_MAX_SCRYPT_COST = 1u << 20` checked against `N*r*p`. The function is virtual, so production may enforce something different. That is unconfirmed both ways, and the builder says so.
- `src/node/internal/crypto_scrypt.ts:176-178`: the callback `scrypt` calls `cryptoImpl.getScrypt(...)` synchronously inside the Promise executor. **Verified as code.** The consequence is inferred: hashes in one isolate run one after another, so 32 MiB buffers should not stack. The cost of that is latency: a burst of sign-ins queues behind each hash on the isolate thread. Whether native allocations count toward the 128 MB limit is still unknown.
- Verdict: **accept** the scrypt-only fallback and the "stop and decide" rule. PBKDF2 at 100k would be a security downgrade that the platform imposes, and choosing it quietly would be a decision made inside implementation. The load check stays as the deciding evidence, and now records wall time as well as CPU.

### New required changes

**R15 (Medium, applied in round 3). Time-dependent ACs need an injectable clock or TTL, not fake timers.** AC15 (reset-link expiry) and AC16 (`validUntil` 15 min) say "Auto (shift time in test)". Inside `vitest-pool-workers` the DO and the Worker run in workerd, so whether `vi.useFakeTimers` reaches `Date.now()` inside the DO is unproven. Required: read the reset TTL (`resetPasswordTokenExpiresIn`) and the socket validity cap from config that `createAuth(env)` / RoomDO take, so a test sets them to a few seconds and waits for real. Production values stay as specified, and AC22 asserts them. If the builder proves fake timers reach the DO in M0, either approach is acceptable.

**R16 (Low, doc only, applied in round 3). Rename the decision labels.** "Decision D1/D2/D3" collides with Cloudflare D1 throughout the spec. The plan now uses **DEC-1 (Q1), DEC-2 (U4), DEC-3 (N3)**. Update spec lines 6, 54, 66 and 104 to match.

### Plan corrections the builder raised: all eight accepted

(1) PBKDF2 removed from plan defaults; R3 rewritten. (2) AC22 is in M1, AC21 in M3, AC23 in M5; AC16 now means a revoked session cannot reconnect and an expired socket gets nothing; there is no server action on logout. (3) DEC-1 cost corrected: "show name" adds the `participant` table. (4) G2 lists the `BETTER_AUTH_URL` var. (5) The instructor `storageState` path for the deployed site is now proven in M5 against local, including the copy-cookie-from-a-normal-browser fallback, so it is not first tried on the real deploy. (6) The remote post-check drops the eviction phase and the expiry checks; both stay proven locally only, and the report says so. (7) Remotely, the rate-limit check confirms the stored `rateLimit` key is the caller's real IP. The two-bucket proof stays local (AC18). (8) The load check runs in its own rate-limit window: sign-ups and sign-ins are separate bursts at least 61 s apart, and at least 61 s after the e2e suite. Otherwise 30 + 30 from one IP lands exactly on the 60/60 s limit. The plan also now says nothing is implemented until Mild authorizes it (gate G0).

---

## Round 3: R15 and R16 (2026-11-27)

| R | Status | How I checked |
| --- | --- | --- |
| R15 | Applied, pass | Spec 7.0 table (`resetPasswordTokenExpiresIn` from `RESET_LINK_TTL_SECONDS`, default 86400) and the time-config table after it (`SOCKET_MAX_LIFETIME_SECONDS`, default 900). Both are plain vars, read from `env` by `createAuth(env)` and RoomDO. AC15 and AC16 now set a few seconds and wait in real time, each with a control under the same config (a link used before expiry succeeds; a socket gets events before expiry and a fresh socket in the same run gets the event the expired one does not). AC22 asserts both defaults, that a set value takes effect, and that a malformed or out-of-range value fails fast. The e2e row says the deployed env uses the defaults and expiry is proven only locally, which matches plan 4.3 |
| R16 | Applied, pass | Spec lines 6, 54, 66 and 104 read DEC-1, DEC-2, DEC-3. `grep "Decision D[123]"` on the spec finds nothing |

**The builder's extra: `SOCKET_MAX_LIFETIME_SECONDS` accepts only 1 to 900.** I did not ask for it. **Accepted.** The spec's stated residual risk (a socket left open after logout or a failed reset kill gets at most 15 minutes of events, spec 8.4 and risk table) is only true if config cannot widen it. The bound is what turns that sentence into a mechanism, and AC22 tests it. `RESET_LINK_TTL_SECONDS` has no upper bound. That is acceptable, since a link is single-use and dies when a new one is generated. Capping it at 86400 is optional and not required.

**Still open, owned by M0:** how a test gets short values while the rest of the suite runs with defaults (a separate Vitest project, or per-test bindings). The builder flags this as unconfirmed. It is M0 acceptance item (5) in `plan.md`, so it does not block anything before G0.

---

## Round 4: after Mild's decisions (2026-11-27)

Mild decided DEC-1 (the instructor sees the asker's name; peers do not see the question; the feature is called "คำถามส่วนตัว"), DEC-2 (no Google lock for instructors; role from the env email list only), DEC-3 (Workers Free first, stop and ask if it is not enough) and N7 (register instructor accounts before sharing the URL, with a post-check). G0 has not been given. I read §0, §1, §1.1, §2 (U4, Q1, N1 to N7), §5, §6, §7.0 to 7.4, §8.1, §8.4, §9 (AC1 to AC5, AC10, AC21 to AC25), §10.2, §10.3, §11 and §14 myself.

### Verdict

**PASS, publishable.** The spec states Mild's decisions accurately with his words, keeps the leak protection for peers intact, and is honest that Free will very likely not fit password hashing. R17 to R20 below are corrections and simplifications. None makes the published text misleading for Mild, so none blocks publishing. All four must be applied before G0.

### Premises checked

| Premise | Result | How |
| --- | --- | --- |
| Mild's "email ซ้ำไม่ได้อยู่แล้ว" (DEC-2) | **True** | better-auth 1.7.28: sign-up validates with `z.email()` and stores `email.toLowerCase()` (`api/routes/sign-up.mjs:151,158`); sign-in and lookup lowercase (`sign-in.mjs:320`, `internal-adapter.mjs:652-700`); Google-created users are lowercased (`internal-adapter.mjs:174`); the schema marks `user.email` `unique: true` (`core db/get-tables.mjs:160-163`). So `Mild@x` and `mild@x` cannot be two accounts. The residual risk is only who registers first, which N7 covers |
| scrypt does not fit Free's 10 ms | **Reproduced, platform result not checked** | I re-ran the builder's measurement on the same machine (Node `scryptSync`, i5-7400T): N=16384 r=16 p=1 median 104.4 ms CPU, N=16384 r=8 p=5 215.1 ms. Cloudflare's hardware would need to be about 10x faster to fit, which is implausible. Not measured in workerd or on Cloudflare. That is what M0 and the probe are for |
| Free CPU "flexibility" | **Checked, accept the builder's caution** | The Workers limits page says isolates have "some built-in flexibility" for workers that "infrequently" run over, and that consistent overruns are terminated with Error 1102. It gives no number. So a few successful logins prove nothing, as §14 says |
| DO CPU on Free | **Ambiguous, as the builder says** | The DO limits page lists 30 s default without a plan split and its FAQ says DOs "have the same per invocation CPU limits as any Workers do". Moving hashing into a DO is therefore unproven on Free |
| 50-subrequest premise (8.4, §14, my R9) | **Unverified, corrected** | The limits page gives Free 50 subrequests per invocation and 1,000 "to internal services". It defines subrequests to include D1, KV and R2, and does not say where DO calls count. The spec should quote this instead of asserting 50 for DO fan-out (R20) |

### Challenges

**R7 participant join.** R7 existed so that, if the instructor could not see the name, no name existed to leak. DEC-1 removed that premise. Under the new design, B never receives a private question at all (`canSee`). The name could reach B only if `canSee` failed, and then the body leaks too. The separate `participant` table, its write on every post, the CHECK constraint and the instructor-only join add a second source of truth for names in exchange for very little. See R17.

**The instructor reset-link refusal.** I accept keeping it as the default. Without it, a squatter who briefly held instructor rights (an N7 slip) could reset the real instructor's password and keep an instructor account after being removed from the env. With it, a password instructor who forgets their password has only the operator path, which writes a `verification` row directly. That path is consistent with what I verified (`identifier = "reset-password:<token>"`, `value = userId`, stored plain), but nobody has run it. See R18.

**Empty `INSTRUCTOR_EMAILS`.** I accept "missing fails, empty means no instructor". It fails closed, and AC22 and AC4 cover it. Whether Wrangler can set a secret to an empty string is unverified (the builder lists it). See R19.

**AC25 threshold.** I accept it. "Any `exceededCpu`/`1102`, or p99 CPU over 10 ms even if requests succeed" is the right bar, because the only leniency is undocumented and a failed login is user-visible. 120 hashing requests in four bursts at least 61 s apart stay inside the 60-per-60-s rate limit. Given the measurement, AC25 will very likely fail, and finding that out at M6 wastes M1 to M5 on an unvalidated platform assumption. The builder's early-probe proposal is the right lever. It is now DEC-4 in `plan.md`, recommended (A).

### New required changes (none blocks publishing; all before G0)

**R17 (Medium). Drop the `participant` table; R7 is superseded by DEC-1.** Store `author_name` on every question row. `project()` stays the single gate: public gives the name to all viewers, private gives it to the instructor only, and the owner gets `isMine`. Remove the CHECK on `author_name`. AC10 then asserts the instructor frame carries the right name and that B receives nothing while still receiving the public control. Drop the "DB `author_name` NULL" clause. If the builder can name a failure the join prevents that AC9 and AC10 would not catch, keep the table and state that failure in §5.

**R18 (Medium). Prove the instructor password recovery path before G1.** The runbook step (operator inserts a reset token into `verification`, the owner sets a password through `/reset-password`) is the only way back for a password instructor. Make it a checked item in M5: run it against local D1 with `wrangler d1 execute --local`, then the old password fails, the new one works, and the token is single-use. List it in §9 as part of AC24 or as AC26.

**R19 (Low). Settle how `INSTRUCTOR_EMAILS` is set to empty.** Prove in M5 that the chosen mechanism (a Wrangler secret set to `""`, or a plain `vars` entry, since the value is not really secret) gives an empty string and not a missing binding. Also validate each list entry with the same email rule Better Auth uses and reject the whole list on a malformed entry, so a typo fails startup instead of silently granting nothing or the wrong thing.

**R20 (Low). Quote the subrequest limits instead of interpreting them.** In §14 and 8.4, replace "50 external, 1,000 internal" and "may hit Free's per-invocation limit" with what the limits page says and the fact that it does not say where DO calls count. The 8.4 design does not depend on it.

### Accepted from the builder (not checked by me)

The Free daily quota figures for DO and D1 (§14 table, the DO limits page I read does not list them); the quota estimates (labelled unmeasured); the Google page on automation-controlled browsers (now moot, since the e2e instructor uses password); that the builder's measurement used 20 runs per set.

---

## Round 5: Workers Paid and R17 to R20 (2026-11-27)

Mild: "ได้ครับ ไปตัว paid ได้คับ". DEC-3 is now Workers Paid and DEC-4 is closed. This is a plan decision, not an approval to enable billing or touch the account, and not G0. I read spec header lines 1 to 8, §1.1, N3, §5 (RoomDO), §7.1 hashing, §7.3, §7.4 recovery paragraph, AC10, AC22, AC25, AC26, §11 handoff table, §12 risk rows, §13 unverified list and §14 myself.

### R17 to R20

| R | Status | How I checked |
| --- | --- | --- |
| R17 | Applied, pass | `question.author_name` NOT NULL on every row, the CHECK constraint and the `participant` table are gone, `project()` is the single gate (§5). AC10 asserts the instructor gets the right name without `authorId`, the owner gets `isMine` with `authorName` null, and B gets nothing while still receiving the public control |
| R18 | Applied, pass | §7.4 recovery paragraph states the exact row shape (`identifier = "reset-password:<token>"`, `value = userId`, plain, with expiry, secure random token), matching what I verified in better-auth. AC26 runs it against local D1 before G1, with a control (old password works before recovery) and single-use and still-instructor checks |
| R19 | Applied, pass | §7.3: plain var, not committed, `--var` on every deploy, `keep_vars` off, whole-list rejection on any malformed entry (AC22 with a valid-list control). I read wrangler 4.168.0 `cli.js`: `collectKeyValues` splits on the first `:` and rejoins the rest, so `--var "INSTRUCTOR_EMAILS:"` yields `""` and commas are kept; the deploy path copies every CLI var into a `plain_text` binding with no empty-value filter (`cli.js:70268-70273`). Not checked: what the Cloudflare API and runtime do with an empty plain-text binding, and `--var` against the config the Vite plugin generates. Both are listed as unverified in §13 |
| R20 | Applied, pass | §14 quotes the limits page row names and the subrequest definition, and says the page does not place DO calls. 8.4 no longer rests on it |

### Paid changes

- **N3 and §14:** correct and proportionate. CPU per request (default 30 s) covers about 105 ms per hash; memory stays 128 MB per isolate, so the load check stays. The CPU quota arithmetic is right (30M CPU ms / 105 ms is about 285,000 hashes a month). The included-usage and overage figures match what I know of Cloudflare's Paid pricing, but I did not re-read the pricing pages this round: accepted from the builder.
- **Probe and Free stop rule removed:** correct, since DEC-4 is closed.
- **Memory fallback "tell Mild first":** accepted. It is a security-strength change, so it is his.
- **AC25 as a load check:** fails on any non-success, `429`, `exceededCpu`, `1102` or exceeded memory, and checks the stored hash prefix. It can fail. See R21 for wall time.

### New items

**R21 (Low, does not block). Give wall time a reporting threshold.** §14 itself infers that 30 concurrent sign-ins in one isolate could queue for seconds, because native scrypt runs synchronously. AC25 records p99 wall time but nothing acts on it. Add: p99 wall time above 5 s is reported to Mild as a finding (not a stop). `plan.md` 4.3 item 8 already says this.

**R22 (Low, does not block). Get local evidence for `--var` with the Vite plugin build before G1.** In M5, run `wrangler deploy --dry-run --var "INSTRUCTOR_EMAILS:"` against the Vite plugin's build output and confirm the binding appears. This retires half of the "Vite plugin config" unknown without touching the account. The empty-binding behaviour on Cloudflare stays a post-check item (plan 4.3 item 1).

**R23 (doc, blocks publishing). Update the spec status line.** Line 5 says the changes have not been checked by the director. After this round it should say review round 5 passed. Publishing it unchanged would tell Mild the spec is unreviewed when it has been reviewed.

### Verified versus accepted this round

Verified: the spec text listed above; wrangler 4.168.0 `--var` parsing and binding construction (source read, not run); that the plan's Paid changes match the spec. Accepted from the builder: Paid quota and overage prices, the DO Paid limits row, and the Node scrypt numbers (which I reproduced in round 4).

---

## Round 6: polling fallback (2026-11-27)

Mild: "ถ้า websocket สามารถ ใช้งานได่มั้ย ถ้าไม่ได้ น่าจะมี fallback ให้ใช้งานได้ตามปกตินะ" and "คับ polling ประมาณ 30 sec ได้มั้ย ไม่ต้องถี่มาก ถ้าใครอยากเห็นเร็ว ก็ refresh เองได้". Then G0: "ได้คับ ผมโอเค เริ่มทำหลังจาก spec พร้อมได้เลย", accepting Tailwind CSS + shadcn/ui, React Router and React state only. I read spec lines 1 to 8, §1.1, §3, §4 principle 2, 6.1 snapshot row, 6.2, 7.6, 8.2, 8.3, 8.5, 8.6, AC9, AC10, AC13, AC16, AC17, AC25, AC27 to AC30, §9 test note, §11, §12 row, §13 and the §14 polling estimate.

### Verdict: PASS

Mild's ask is met with the least machinery that keeps the private-question guarantee: one snapshot endpoint built on the same `snapshotFor(viewer)` as the WS connect path, so the filter is still single and the leak canary covers all three exits. AC9 extends the canary to the HTTP path with a public control per phase, which is the right shape. Writes were already HTTP, so "use it normally" holds by construction. The cost estimate is in the right units and well inside Paid's included usage.

### R21 to R23

| R | Status | How I checked |
| --- | --- | --- |
| R21 | Applied | AC25 reports p99 wall above 5 s to Mild as a finding, not a fail (spec line 502) |
| R22 | Applied | M5 includes `wrangler deploy --dry-run --var "INSTRUCTOR_EMAILS:"` against the Vite plugin build (§11 item 6) |
| R23 | Applied, now stale again | Line 5 was updated for round 5 but says the polling additions are unreviewed. See R27 |

### The builder's defaults, challenged

| Default | Verdict | Reason |
| --- | --- | --- |
| Enter fallback on WS error, no WS snapshot within 3 s, or missing `pong` (ping every 30 s, 10 s timeout) | **Accept** | The 3 s rule catches an upgrade that opens but stays silent (a common proxy failure). Ping/pong is justified even without the fallback: today a dead socket would show stale data with no sign. Incoming WS messages are billed 20:1 and auto-response does not wake the DO, so the cost is negligible |
| Pause polling while the tab is hidden, fetch at once on return | **Accept** | Halves worst-case cost for no user-visible loss |
| Per-user cap 30/min/room in DO memory | **Recommend dropping (R24)** | See R24 |
| Non-member and nonexistent room both `404` | **Accept** | Same rule as the WS upgrade, so room existence does not leak through either path |
| Snapshot `GET` without an `Origin` check, relying on no CORS headers | **Accept with one header (R25)** | Session cookies are `SameSite=Lax`, so cross-site `fetch`, `<script>` and `<img>` requests carry no cookie, and without `Access-Control-Allow-Origin` a cross-site page cannot read the response anyway. A top-level navigation carries the cookie but only shows the JSON to the user themselves |
| Discard a snapshot that started before the tab's latest successful write | **Accept** | Needed for correctness: without it a slow poll briefly undoes the user's own post. AC28 tests it with a deliberately delayed response |

### New items

**R24 (Low, over-engineering, does not block). Drop the per-user snapshot cap.** A capped request has already cost a Worker request, a DO request and the D1 session and membership queries; the cap saves only the snapshot row reads, which cost $0.001 per million on Paid. The client failure it guards against (a polling loop) is already prevented structurally by "one request in flight, next cycle after the response", and AC27 counts requests in a 90 s window (2 to 4), which would catch a loop. Keep the first half of AC30 (50 users from one `cf-connecting-ip` all get `200`), which is the requirement that matters for a classroom behind one NAT. If the builder keeps the cap, state in §7.6 the failure it prevents that the in-flight rule and AC27 do not.

**R25 (Low, does not block). Send `X-Content-Type-Options: nosniff` and `Content-Type: application/json` on all `/api/*` responses.** Cheap insurance for the no-`Origin` GET, and AC17's snapshot row can assert both headers.

**R26 (Low, does not block). Run AC27 to AC29 as a separate slow Playwright project.** They wait in real time for 30 s cycles and add minutes. Keep `pnpm test` fast for every increment and run the slow project at milestone gates and before G1. Do not add a production switch or a shortened interval to speed them up.

**R27 (doc, blocks publishing). Update spec header lines 4 and 5.** Replace line 4 with:

```
> **G0 ได้รับแล้ว (2026-11-27) ขอบเขต M0 ถึง M5 จนถึง G1 เท่านั้น ยังไม่มีการอนุมัติ push, deploy หรือ action ใดบน Cloudflare account**
```

and line 5 with:

```
> Review: `docs/plan/review.md` **รอบ 6 ให้ PASS** รวม polling สำรอง (ส่วน 8.6, AC27 ถึง AC30) และ R21 ถึง R23 ข้อแนะนำ R24 ถึง R26 ไม่ขวางการเผยแพร่
```

**R28 (must be in the spec before M1). Frontend stack.** At the time of this review the spec does not yet contain Mild's accepted stack (Tailwind CSS + shadcn/ui, React Router, React state only). When the builder adds it, I check one thing: React Router is used in library (declarative or data) mode inside the Vite SPA, not framework mode, so N4 (one Vite SPA plus the Worker API on one origin through `@cloudflare/vite-plugin`) stays as specified. shadcn/ui components are copied into the repo, so their dependencies are pinned like everything else. "React state only" means no store or query library; the room state is one snapshot replaced in full, which fits.

### Verified versus accepted this round

Verified: the spec text listed above against Mild's two quotes; that all three exits use one filter (§4 principle 2, 6.2); the arithmetic of the polling estimate (50 users x up to 120 polls/hour x 2 hours = 12,000 polls per class). Accepted from the builder: that Playwright `routeWebSocket` can block both failure shapes (unproven in this project; M0 item 7 proves it), the DO duration and row figures in §14, and that auto-responded pings are billed as stated (the builder marks this unconfirmed).

## Round 7: M0 verification and the builder's proposals (2026-11-27)

Director (stand-in session for Clara's director) re-ran M0 from a fresh local clone of `feat/v1` at `079a0dc` (`pnpm install --frozen-lockfile`, no `.dev.vars`, no Cloudflare login).

### Verdict: M0 PASS

| Item | Result | Evidence |
| --- | --- | --- |
| (1) native scrypt in the real bundle, sign-up/sign-in in workerd, wall time | PASS | `pnpm build && pnpm check:bundle`: "OK: native node:crypto scrypt only"; check goes red (4 FAIL lines) when Vite aliases the pure JS module. The built `dist/handsup` served by `vite preview` (workerd): sign-up 200, `/api/me` role instructor, wrong password 401, right password 200. Tests: median 72 to 78 ms per hash; forcing pure JS in the test times out at 60 s |
| (2) accounts through the real sign-up API, no seeded session | PASS | `test/accounts.test.ts` drives `exports.default.fetch`; breaking the sign-up path turns 5 tests red (404) |
| (3) eviction really happens, same socket still receives | PASS | Removing `evictDurableObject` turns the marker assertion red; replacing `ctx.acceptWebSocket` with `server.accept()` turns both room tests red |
| (4) mock OAuth for AC5 | PASS, with a finding | Real redirect flow with only Google's token endpoint replaced. Red when linking is fully enabled (`trustedProviders` + `requireLocalEmailVerified: false`); **stays green with `trustedProviders` alone**, so the refusal rests on the `requireLocalEmailVerified` default and `emailVerified=false` (matches §7.2 N1). Deferral added in plan §5 |
| (5) short time limits for some tests, defaults for others | PASS | Separate `short-ttl` Vitest project; each of socket TTL ignored, reset TTL ignored, and a short default turns the matching test red |
| (6) §14 numbers | PASS for hash and D1; DO rows moved to M3 (accepted) | `MEASURE` output recorded in §14 "วัดใน M0" |
| (7) Playwright blocks WS both ways with a control | PASS (against a stand-in server, not the app) | 3 spikes pass; letting either blocked page connect turns its test red |

Also: `pnpm typecheck` exit 0; `pnpm test` 30/30 across 6 files.

### Rulings on the builder's proposals

| Proposal | Ruling | Reason |
| --- | --- | --- |
| `@cloudflare/vitest-plugin` instead of `vitest-pool-workers` | Accept | npm marks the old package deprecated: "renamed to @cloudflare/vitest-plugin"; code already uses 1.9.2 |
| `advanced.database.validateSchema: false` + drift test, in AC22 | Accept | Measured: removes about 8 queries and about 60 row reads from every auth request; the drift test already exists and goes red when the migration lacks a column |
| §8.6 enter fallback on any close or error before the first snapshot | Accept, modified | The spike showed a blocked socket closes with no `error` event; exclude `4003`, which has its own row |
| §14 add workerd hash time and D1 table | Accept | Added, labelled as local wall time on this machine, not CPU |
| DO row counts to M3 | Accept | RoomDO holds no data in M0; M3 row now names the operations to measure |
| R24 drop per-user snapshot cap | Accept | §7.6 and AC30 edited |
| R25 JSON content type only on JSON responses | Accept | `nosniff` stays on every `/api/*` response; a JSON content type on `101`/`204`/redirects would be wrong |
| R26 slow Playwright project + one gate script | Accept | Keeps `pnpm test` fast; the gate script is also the one command for milestone checks |

## Round 8: M1 verification and the builder's judgment calls (2026-11-27)

Director re-ran M1 from a fresh local clone of `feat/v1` at `8fefb4a` (`pnpm install --frozen-lockfile`, no `.dev.vars`, no Cloudflare login).

### Verdict: M1 PASS

- `pnpm typecheck` exit 0; `pnpm test` **75 passed** (12 files; default 65, short-ttl 2, production 8); `pnpm build && pnpm check:bundle` "OK: native node:crypto scrypt only".
- 18 deliberate breaks, each red and reverted: hash made with r=8 under the r16 label, prefix dropped, verify accepting a bare hash, wrapper unwired, `update-user` added to the allowlist, lowercase route matching, allowlist removed, production project with `NODE_ENV=development`, `disableOriginCheck` removed (red in both projects), cookie cache on, 16-character secret accepted, schema check on, `nosniff` removed, JSON type kept on redirects, loose email check, list not checked in `createAuth`, role ignoring the list, errorURL left at the library default.
- Built bundle under `vite preview` (workerd): sign-up `TEACH@example.test` 200 → `/api/me` instructor; wrong password 401; `POST /update-user` 404 `{"error":"not_found"}` with `nosniff`; bad-state Google callback 302 to `/auth/error?error=state_mismatch` with no content type; `HEAD get-session` and `HEAD update-user` 404; stored hash `scrypt-n16384-r16-p1$<32 hex>:<128 hex>` (length 182).
- **Hash:** only the prefix changed. The wrapper calls `@better-auth/utils/password` unchanged; a test recomputes the key with `node:crypto` scrypt N=16384 r=16 p=1 and fails when the real parameters differ from the label. Nothing for Mild beyond the prefix he approved.
- **AC22 "separate process":** acceptable as is. What the spec needs is a fresh import with `NODE_ENV` fixed, not an OS process. Each project asserts the `isProduction` the library sees (false in default, true in production), and that assertion goes red if the production project's env is changed. Three distinct workerd processes ran concurrently during the run. The spec text is updated. Gap: no `NODE_ENV=test` mode, where the library's defaults are weakest; the option-level assertions already catch a missing `disableOriginCheck`, so it moves to M2.

### Rulings

| Item | Ruling | Reason |
| --- | --- | --- |
| errorURL `<BETTER_AUTH_URL>/auth/error`, SPA page explains `account_not_linked` | Accept | Named in 7.0; the page is frontend work in the first UI milestone |
| Unknown hash prefix → verify throws → 500 | Accept | A stored hash we cannot read is a server fault; a 401 would hide it as a wrong password |
| Spaces-only `INSTRUCTOR_EMAILS` is invalid | Accept | Only `""` means empty; anything else that is not a list of emails fails loudly |
| zod 4.6.7 direct and pinned | Accept, with a deferral | Lockfile shows `better-auth` resolves the same 4.6.7; re-check on every `better-auth` bump |
| Malformed list → every auth request and `/api/me` 500 | Accept | Fail closed and visible, per 7.3 |
| Default project runs with `NODE_ENV` unset | Accept | That is the deploy condition; add a `test` mode in M2 |
| Move the instructor-API half of AC4 to M2 | Accept | No instructor API exists before `POST /api/rooms` |
| `BETTER_AUTH_SECRETS` note | Accept, strengthened | Source: `options.secrets ?? parseSecretsEnv(env.BETTER_AUTH_SECRETS)` replaces our checked `secret`. A note is a promise; the app must refuse to start when the binding exists (M2) |
| HEAD near-miss dropped | Accept for M1, add in M2 | Measured: HEAD on listed and unlisted paths both get 404, which fails closed; add a test so it stays that way |

## Round 9: M2 verification (2026-11-27)

Director re-ran M2 from a fresh local clone of `feat/v1` at `1c577ea` (`pnpm install --frozen-lockfile`, no `.dev.vars`, no Cloudflare login).

### Verdict: M2 PASS on behaviour; two test fixes are required as the first M3 increment

- `pnpm typecheck` exit 0; `pnpm test` **120 passed** in 16 files (default 100, short-ttl 2, production 9, node-env-test 9); `pnpm build && pnpm check:bundle` OK; spikes 3 passed; `pnpm test:e2e:app` 5 passed. COUNT AC12 room rows `{"actions":5,"allowed":7,"refused":12}`.
- Breaks that went red (each reverted): create without the role check, rotate without the role check, learner list returning the real invite code, learner list showing every room, no `O→0`, no whitespace stripping, unknown code answered 404 instead of the uniform 400, limit disabled, limit shared across users, instructor join writing a member row, non-strict join schema, write gate disabled, `BETTER_AUTH_SECRETS` guard without the `process.env` check, and without the binding check, SPA joining automatically once signed in, SPA keeping the code in `sessionStorage` after joining, SPA leaving the hash in the address bar.
- **Fix 1 (test):** moving the write gate off `/api/auth/*` leaves the gate test green, because Better Auth answers `415` itself for `text/plain` on `sign-out`. A probe shows the gate does cover auth routes (body `{"error":"unsupported_media_type"}`), and that without it Better Auth **accepts `application/x-www-form-urlencoded` on `sign-in/email`**. The test must assert our body and include that case.
- **Fix 2 (config):** `HANDSUP_E2E_DIR=… pnpm build` exits 0 and writes the e2e `BETTER_AUTH_SECRET`, `GOOGLE_*` and `INSTRUCTOR_EMAILS` into `dist/handsup/wrangler.json` as plain vars; a normal build has `vars: {}`. `vite build` must refuse the variable.
- SPA read: no HTML injection (`dangerouslySetInnerHTML` absent, error page shows fixed text only), no join without a click, code cleared after success and after `invalid_code`, Google `callbackURL` is a fixed relative path. Gap: sign-out does not clear a waiting code (moved to M3).

### Rulings

| Item | Ruling | Reason |
| --- | --- | --- |
| `POST /api/rooms` answers 200, not 201 | Accept | Consistent with the other writes; nothing depends on 201 |
| Wrong code `400 invalid_code`, schema failure `400 invalid_request` | Accept | "Same error for every wrong code" holds between malformed and unknown codes (verified); a bad body is a client bug, not a guess |
| Join limit counts every well-formed attempt, in table `join_attempt` | Accept | Simpler and stricter; one atomic upsert per attempt; spec 5 and 7.5 updated |
| Instructor join → 200, no member row | Accept | Instructors already see every room |
| Room names trimmed, 1 to 100 | Accept | Recorded in 7.5 |
| Learner list hides the code, instructor list shows it | Accept | Matches the 6.1 row "see / rotate invite code"; verified red when leaked |
| Write gate requires a JSON content type | Accept | It blocks form posts that Better Auth would otherwise accept; named in 7.6 as the site of M4's Origin check |
| shadcn components hand-written, `lucide-react` dropped, exact pins | Accept | shadcn components are copied code anyway; fewer dependencies |
| `HANDSUP_E2E_DIR` env hook in `vite.config.ts` | Accept only with a guard | Verified hazard above; dev-only, `vite build` must throw |
| `Cache-Control: no-store` on `/api/*` (6.2) | M3, first increment | `/api/rooms` already returns invite codes to instructors |
