import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Browser } from "./support/http.ts";

describe("GET /api/version (spec 8.5, AC23)", () => {
  it("answers anyone with the commit the Worker was built from", async () => {
    const response = await new Browser().fetch("/api/version");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { commit: string; dirty: boolean };
    expect(Object.keys(body).sort()).toEqual(["commit", "dirty"]);
    expect(body.commit).toMatch(/^[0-9a-f]{40}$/);
    // Read by the test config with git itself, not through the build's own helper.
    expect(body.commit).toBe(env.TEST_GIT_HEAD);
    expect(typeof body.dirty).toBe("boolean");
  });

  it("answers GET only; a write to it is refused (control: GET above)", async () => {
    const response = await exports.default.fetch(
      new Request("http://localhost:5173/api/version", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:5173" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(404);
  });
});
