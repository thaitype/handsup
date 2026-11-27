import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import { roleOf } from "./role.ts";

export { RoomDO } from "./room-do.ts";

const app = new Hono<{ Bindings: Env }>();

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/api/me", async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthenticated" }, 401);
  const { id, name, email } = session.user;
  return c.json({ id, name, email, role: roleOf(c.env, email) });
});

export default app;
