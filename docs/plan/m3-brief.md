# M3 brief (builder)

Director: engineer-director, 2026-11-27. Supersedes the Round 9 draft at `~/.typ-crews/freya/locker/note/2026-11-27_handsup-m3-brief.md`. Changes from that draft are listed at the end.

**Ask (Mild):** a realtime forum where "ทุกคนที่เกี่ยวข้องเห็นการเปลี่ยนแปลงทันทีโดยไม่ต้อง refresh", private questions that "นักเรียนคนอื่น ในห้อง ไม่เห็น" while the instructor sees the name (DEC-1), and a fallback when WebSocket fails: "polling ประมาณ 30 sec ... ถ้าใครอยากเห็นเร็ว ก็ refresh เองได้". G0 covers M0 to M5 up to G1.

**M3: RoomDO, the realtime protocol, the single visibility filter, presenter mode, the HTTP snapshot and the polling fallback.**

## Where and how

- Repo `~/gits/handsup`, branch `feat/v1`, head at start `5113e4f` plus any director docs commit after it. Check `pwd`, branch and `git status` before every git operation.
- Local commits only, under the existing repo-local identity. One commit per tested increment; each message names its ACs. No history rewrite.
- Work folders and `TMPDIR` under a folder in `/home`, never `/tmp` (small shared tmpfs). Delete only what you created. Stop any server you start.

## Increment 0: done and director-verified (review Round 10)

Write gate test (`0ff4a4a`), build guard plus baked-var bundle rule (`b395cfc`), `Cache-Control: no-store` on `/api/*` (`3ea7174`), sign-out clears the waiting join code (`5113e4f`). Do not redo.

## Read first

Spec 4 (principles 2 to 4), 5 (RoomDO SQLite), 6.1, 6.2, 7.6, 8.1 to 8.6, 14, N5, AC7 (WS clause), AC8 to AC14, AC16, AC17, AC21, AC27 to AC30. Plan row M3. Review Rounds 6 to 10.

## Increments, in this order (risk first)

1. **Data and the one filter, over HTTP.** RoomDO SQLite schema with migrations in the constructor under `blockConcurrencyWhile`; random UUIDs; `author_name` on every row; deleting a question deletes its answers in one `transactionSync`. `canSee`, `project` → `QuestionView` (no `authorId`; `isMine`; `authorName` per DEC-1), one `snapshotFor(viewer)`. DO RPC returns only views. HTTP writes per 8.5 with `clientRequestId` (questions: learner members; answers, resolved, delete: instructor; owner may delete) and `GET /api/rooms/:id/snapshot` (no ETag, no CORS). Missing room and non-member: the same `404`. Instructor-only actions: `403` from the role before any lookup. N5 write rules here: body 1 to 4,000 characters, 10 posts per minute per user, 1,000 questions per room with an error that does not reveal the count. **The leak canary (AC9) starts in this increment** on the two HTTP channels (snapshot and write responses), each phase with its public-marker control. AC10, AC11, AC12 rows for question and answer actions, AC13 (HTTP half).
2. **WebSocket.** `GET /api/rooms/:id/ws`: session, membership and role checked; internal headers stripped before the verified identity is forwarded. Accept, query and send the snapshot in one synchronous block. Tags and attachment per 8.1; ping auto-response; close codes 4001/4003/4400; `validUntil` checked before every send. One `emit()` for every broadcast. AC9 and AC10 extended to the WS channel in every phase, AC7 WS clause, AC14, AC13 (WS half), the M3 parts of AC16 (a revoked session cannot reconnect, gets `401` on the next snapshot, an expired socket gets no event, with the controls written in AC16) and AC17 (WS upgrade Origin; snapshot without CORS headers, with `nosniff` and `no-store`).
3. **Client room page.** Full snapshot replace, merge by id, reconnect with backoff and jitter, logout closes the socket in every tab (`BroadcastChannel`, part of AC16). AC8 in the browser.
4. **Polling fallback** exactly per 8.6, including the Round 7 entry rule (any close or error before the first snapshot, except `4003`); about 30 s plus 0 to 5 s jitter (Mild); pause while hidden; discard a snapshot that started before the tab's latest successful write. AC27 to AC30. AC27 to AC29 live in a separate slow Playwright project, not in `pnpm test`. AC27 must be shown red with polling turned off.
5. **Presenter mode** (N6) and AC21.
6. **Numbers and the gate script.** §14: DO SQLite rows read and written per post, answer, resolve, delete and snapshot, and CPU per snapshot, recorded in the spec as measured locally. One gate script that runs typecheck, `pnpm test`, build, `check:bundle`, the spikes, the app suite and the slow suite, and exits non-zero if any fails (R26).

## Acceptance

- Every AC above, each refusal with an allowed control in the same test, each "receives nothing" paired with "receives this" on the same channel in the same phase.
- Show each new check red by breaking the rule it guards, then revert. List each break and the test that went red.
- Fresh-clone run (`pnpm install --frozen-lockfile`, no `.dev.vars`, no Cloudflare login) of the gate script, with the test count per project.

## Boundaries

- No push, merge, PR, deploy, `wrangler login` or Cloudflare account action.
- Do not edit `docs/plan/` or `docs/spec/realtime-forum-spec.original.md`. Spec changes go to Clara as proposals; the director rules on them.
- No test switch in production code: no WS kill switch, no shortened poll interval, no test-only route.
- Password hashing and the auth configuration: untouched.
- Any new decision (protocol shape beyond 8.2, new limits, a change to an AC) comes back to the director before you build it.

## Report

For each AC: verified or not, the command and key output, the break that turned it red. What was not established. Head SHA and the list of commits.

## Changes from the Round 9 draft

- Increment 0 marked verified.
- Increments ordered so the leak canary runs on the HTTP channels from the first increment, before any WS or UI code.
- N5 write rules (length, post rate, room cap) assigned to M3; nothing else owned them.
- The M3 parts of AC16 and AC17 spelled out.
- The gate script must exit non-zero on any failure.
