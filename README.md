# handsup

Realtime learner forum on Cloudflare Workers. The spec is `docs/spec/spec-proposal.md`.

Everything below runs on your own machine. You do not need a Cloudflare account, `wrangler login`
or `CLOUDFLARE_API_TOKEN`: Wrangler and Vite run the Worker, D1 and Durable Objects locally.

## What you need

- Node.js 22.12 or newer, and pnpm 11 (`corepack enable` gives you the version pinned in
  `package.json`)
- git: a build reads the commit it is made from (see `/api/version` below)
- For Google sign-in only: a Google Cloud project where you can create an OAuth client

## 1. Install and run the tests

```sh
git clone <repository> handsup
cd handsup
pnpm install
pnpm test
```

`pnpm test` uses its own test values and never reads `.dev.vars`.

## 2. Create `.dev.vars`

The app reads its settings from `.dev.vars` in the project folder. It is ignored by git:
never commit it.

```sh
cp .dev.vars.example .dev.vars
```

Then fill in each line:

| Name | What to put there |
| --- | --- |
| `BETTER_AUTH_SECRET` | At least 32 characters, random. Make one with `openssl rand -base64 32`. The app refuses to start with a shorter one. |
| `BETTER_AUTH_URL` | `http://localhost:5173` (already filled in) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From the Google OAuth client below. If you are not trying Google sign-in, any non-empty text works; only the Google button will then fail. |
| `INSTRUCTOR_EMAILS` | The email addresses that are instructors, separated by commas, for example `you@example.com,colleague@example.com`. Capitals and spaces around commas do not matter. Leave it empty (`INSTRUCTOR_EMAILS=`) for no instructors, but keep the line: without it the app does not start. One malformed address makes the whole list invalid. |

### Google OAuth client (optional)

1. In the Google Cloud console, open **APIs & Services → OAuth consent screen** and set it up.
2. Open **Credentials → Create credentials → OAuth client ID** and choose **Web application**.
3. Under **Authorized redirect URIs** add exactly
   `http://localhost:5173/api/auth/callback/google`.
4. Copy the client ID and client secret into `.dev.vars`.

Google sign-in works only at `localhost`, not from another device by IP address.

## 3. Create the local database and start the app

```sh
pnpm db:migrate:local
pnpm dev
```

Open exactly <http://localhost:5173>, the address in `BETTER_AUTH_URL`. From any other address,
`127.0.0.1` included, the app refuses sign-up, sign-in and every other write, because each write
must come from that origin. A script or `curl` call that writes to the API has to send the header
`Origin: http://localhost:5173`, or it gets `403 forbidden_origin`.

Sign up with an address from `INSTRUCTOR_EMAILS` to be an
instructor, or with any other address to be a learner. The local database lives in
`.wrangler/state` and survives restarts of `pnpm dev`. Run `pnpm db:migrate:local` again after
pulling new migrations.

## Resetting a password

Sign in as an instructor and open **Reset passwords** in the header. Search by name or email and
press **Create reset link**, then give the link to that person. It opens the `/reset` page, works
once, lasts 24 hours and replaces any earlier link. It is shown only once. Instructor accounts and
accounts that only use Google cannot get one. Setting a new password ends that account's sessions.
A room page that is already open can keep receiving updates for up to 15 minutes afterwards.

## Checks

```sh
pnpm typecheck
pnpm test                          # Vitest on workerd
pnpm build && pnpm check:bundle    # native scrypt, no baked vars, /reset header, build commit
pnpm gate                          # all of the above and every browser suite, in order
```

Browser tests (Playwright). The first time on a machine, install the browser:

```sh
pnpm exec playwright install chromium
pnpm test:e2e:app                  # the app under `vite dev` with test values, port 5199
pnpm test:e2e:slow                 # polling fallback in real time (several minutes)
pnpm test:e2e:spikes               # M0 WebSocket blocking spikes
```

The browser tests ignore `.dev.vars`: they generate their own config and a fresh local database
under `node_modules/.cache/handsup-e2e`. Only one `pnpm test:e2e:app` can run at a time on a
machine, because it uses port 5199.

## Watching the polling fallback (local acceptance step 12)

With `pnpm dev` running, open a browser window in which the room WebSocket is blocked:

```sh
pnpm exec playwright test -c playwright.headed.config.ts
```

A Chromium window opens on <http://localhost:5173>. Sign in, open a room and wait: the notice
"โหมดสำรอง" appears and new public questions arrive within about 30 seconds without a refresh.
Ask from another browser to see it. Close the window to finish. Options:

- `HANDSUP_WS_BLOCK=silent` makes the socket open but never receive anything, instead of
  failing to connect.
- `HANDSUP_URL=http://localhost:5173/rooms/<id>` opens a given page.

Nothing in the app is switched off: the blocking happens inside that browser window only.

## Which build is running

`GET /api/version` answers `{"commit": "<git commit>", "dirty": <true|false>}`. `dirty` is true
when tracked files differed from that commit at build time. `pnpm build` fails if git cannot read
the commit; under `pnpm dev` without git the commit is `"unknown"`.

## Known issues

### A reset link made before an email joins `INSTRUCTOR_EMAILS` still works afterwards

- **When it happens:** an instructor creates a reset link for a learner, and that learner's
  email is added to `INSTRUCTOR_EMAILS` (a new deploy) while the link is still valid (up to
  24 hours). The instructor refusal is checked only when a link is created, not when it is used.
- **What goes wrong if it does:** whoever holds the link can set the new instructor's password
  and sign in as them, which takes over the instructor account and shows every private question
  and asker name in every room.
- **Status:** accepted as a known issue by Mild (2026-11-27): "อ้อ เคส นี้ ไม่เกิดครับ
  เดี๋ยวเขียนว่าเป็น known issue โอกาสเกิดยาก". Not fixed in code.
- **Precaution:** before adding an email to `INSTRUCTOR_EMAILS`, make sure that user has no
  pending reset link: wait 24 hours after the last link was made for them, or have the operator
  delete their tokens. The command below has **never been run** against a real account:

  ```sh
  wrangler d1 execute <database> --remote --command \
    "DELETE FROM verification WHERE identifier LIKE 'reset-password:%' AND value = (SELECT id FROM \"user\" WHERE email = '<email in lower case>')"
  ```
