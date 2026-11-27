import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { domainBlocker, zoneServers } from "../../scripts/lib/domain.mjs";
import {
  checkInstructors,
  d1OnlyConfig,
  findDatabaseId,
  parseSecretsFile,
  redactor,
  withDatabaseId,
} from "../../scripts/lib/production.mjs";

const good = [
  "# comment",
  "BETTER_AUTH_SECRET=0123456789012345678901234567890123456789",
  'GOOGLE_CLIENT_ID="client-id"',
  "export GOOGLE_CLIENT_SECRET=client=secret",
  "HANDSUP_DOMAIN=forum.example.test",
  "",
].join("\n");
const ID = "11111111-2222-3333-4444-555555555555";

describe("secrets file", () => {
  it("reads the four keys", () => {
    expect(parseSecretsFile(good)).toMatchObject({
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client=secret",
      HANDSUP_DOMAIN: "forum.example.test",
    });
  });

  it.each([
    ["a missing key", good.replace(/^GOOGLE_CLIENT_ID.*$/m, "")],
    ["an unknown key", `${good}BETTER_AUTH_SECRETS=x`],
    ["a repeated key", `${good}HANDSUP_DOMAIN=other.example.test`],
    ["a short auth secret", good.replace(/^BETTER_AUTH_SECRET=.*$/m, "BETTER_AUTH_SECRET=short")],
    ["a URL as the domain", good.replace("=forum.example.test", "=https://forum.example.test")],
    ["a line that is not KEY=value", `${good}oops private-value`],
  ])("refuses %s without repeating a value", (_, text) => {
    let message = "";
    try {
      parseSecretsFile(text);
    } catch (error) {
      message = error.message;
    }
    expect(message).not.toBe("");
    expect(message).not.toMatch(/client=secret|0123456789|forum\.example|private-value/);
  });
});

describe("instructor list", () => {
  it("keeps empty as empty and normalises entries", () => {
    expect(checkInstructors("")).toBe("");
    expect(checkInstructors(" One@Example.test , two@example.test")).toBe("one@example.test,two@example.test");
  });
  it.each([" ", "one@example.test,", "one", "one@example.test;two@example.test"])("refuses %j", (raw) => {
    expect(() => checkInstructors(raw)).toThrow(/invalid/);
  });
});

describe("redaction", () => {
  it("removes known values and anything shaped like an address or an id", () => {
    const redact = redactor(["forum.example.test", "s3cret-value"]);
    const out = redact(
      `https://forum.example.test s3cret-value a@b.example ${ID} ${"a".repeat(32)} handsup.me.workers.dev`,
    );
    expect(out).toBe("https://<redacted> <redacted> <email> <id> <id> <workers.dev>");
  });
});

describe("database id and configs", () => {
  it("needs exactly one database with the name", () => {
    expect(findDatabaseId(JSON.stringify([{ name: "other", uuid: "x" }, { name: "handsup", uuid: ID }]), "handsup")).toBe(ID);
    expect(() => findDatabaseId("[]", "handsup")).toThrow(/found 0/);
  });
  it("puts the id into the built config and turns the other addresses off", () => {
    const built = { name: "handsup", d1_databases: [{ binding: "DB", database_id: "0" }] };
    expect(withDatabaseId(built, ID)).toMatchObject({
      workers_dev: false,
      preview_urls: false,
      d1_databases: [{ binding: "DB", database_id: ID }],
    });
    expect(() => withDatabaseId({ ...built, vars: { X: "1" } }, ID)).toThrow(/vars/);
  });
  it("builds a D1-only config from wrangler.jsonc, which holds no real id", () => {
    const text = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    expect(text).toContain('"database_id": "00000000-0000-0000-0000-000000000000"');
    expect(text).toMatch(/"workers_dev": false,\s*"preview_urls": false/);
    expect(d1OnlyConfig(text, ID, "/m").d1_databases).toEqual([
      { binding: "DB", database_name: "handsup", database_id: ID, migrations_dir: "/m" },
    ]);
  });
});

describe("domain guard", () => {
  const dns = (zones) => {
    const asked = [];
    const resolveNs = async (name) => {
      asked.push(name);
      if (zones[name]) return zones[name];
      throw Object.assign(new Error(), { code: "ENODATA" });
    };
    return { asked, resolveNs };
  };
  const cf = ["ada.ns.cloudflare.com"];

  it("finds the zone without asking about a name that may not exist yet", async () => {
    const sub = dns({ "example.test": cf });
    expect(await zoneServers("forum.example.test", sub)).toEqual(cf);
    expect(sub.asked).toEqual(["example.test"]);
    // A zone apex under a two-part suffix: the suffix's own servers are not the zone's.
    const apex = dns({ "co.test": ["ns.registry.test"], "school.co.test": cf });
    expect(await zoneServers("school.co.test", apex)).toEqual(cf);
    await expect(zoneServers("forum.other.test", dns({}))).rejects.toThrow(/no Cloudflare zone/);
  });

  const look = (records, handsup) => ({ records: async () => records, isHandsup: async () => handsup });
  it("allows a free name or one that already serves handsup, and nothing else", async () => {
    expect(await domainBlocker("f.example.test", look([], false))).toBeNull();
    expect(await domainBlocker("f.example.test", look(["192.0.2.1"], true))).toBeNull();
    expect(await domainBlocker("f.example.test", look(["192.0.2.1"], false))).toMatch(/already has/);
    const broken = { records: async () => Promise.reject(Object.assign(new Error(), { code: "ETIMEOUT" })) };
    expect(await domainBlocker("f.example.test", broken)).toMatch(/could not check/);
  });
});

