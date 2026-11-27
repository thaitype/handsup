/** Spec 8.5, AC23: which commit this Worker was built from. Open to everyone (spec 6.1). */
import { Hono } from "hono";
import type { AppEnv } from "./http.ts";

/** Replaced at build time by Vite `define` (scripts/build-info.mjs). */
declare const __HANDSUP_BUILD__: { commit: string; dirty: boolean };

export const version = new Hono<AppEnv>();

version.get("/api/version", (c) => c.json(__HANDSUP_BUILD__));
