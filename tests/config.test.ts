import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configProblems, envFlag } from "@/lib/config-check";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ownsteps-config-"));
const check = (env: Record<string, string>) => configProblems({ NODE_ENV: "production", ...env }, { dataDir });

/** What a fresh copy of .env.example plus a real address amounts to. */
const TEMPLATE = {
  PUBLIC_URL: "https://trips.mine.org",
  TRUSTED_PROXIES: "1",
  MAP_STYLE: "hybrid",
  OIDC_ISSUER: "https://id.example.com",
  OIDC_BUTTON_LABEL: "Pocket ID",
  PASSWORD_LOGIN: "true",
  KEEP_ORIGINALS: "true",
};

describe("configuration check", () => {
  it("lets the template through without a word", () => {
    expect(check(TEMPLATE)).toEqual({ errors: [], warnings: [] });
  });

  it("stops on typos in switches and numbers", () => {
    const { errors } = check({
      ...TEMPLATE,
      PASSWORD_LOGIN: "flase",
      TRUSTED_PROXIES: "one",
      APP_STORE_ID: "id123",
      GEOCODING: "maybe",
    });
    expect(errors.join("\n")).toMatch(/PASSWORD_LOGIN="flase"/);
    expect(errors.join("\n")).toMatch(/TRUSTED_PROXIES/);
    expect(errors.join("\n")).toMatch(/APP_STORE_ID/);
    expect(errors.join("\n")).toMatch(/GEOCODING/);
  });

  it("stops on a half OIDC setup, and on password sign-in off without it", () => {
    expect(check({ ...TEMPLATE, OIDC_CLIENT_ID: "abc" }).errors[0]).toMatch(/OIDC_CLIENT_SECRET missing/);
    expect(check({ ...TEMPLATE, OIDC_CLIENT_ID: "abc", OIDC_CLIENT_SECRET: "def" }).errors[0]).toMatch(
      /still the example/,
    );
    expect(check({ ...TEMPLATE, PASSWORD_LOGIN: "false" }).errors[0]).toMatch(/nobody could sign in/);
    expect(
      check({
        ...TEMPLATE,
        PASSWORD_LOGIN: "false",
        OIDC_ISSUER: "https://id.mine.org",
        OIDC_CLIENT_ID: "abc",
        OIDC_CLIENT_SECRET: "def",
      }).errors,
    ).toEqual([]);
  });

  it("stops on a bad public address, a weak secret and a broken first account", () => {
    const { errors } = check({
      ...TEMPLATE,
      PUBLIC_URL: "trips.mine.org/ownsteps",
      APP_SECRET: "change-me",
      ADMIN_EMAIL: "me@mine.org",
    });
    expect(errors).toHaveLength(3);
    expect(check({ ...TEMPLATE, PUBLIC_URL: "https://mine.org/ownsteps" }).errors[0]).toMatch(/has a path/);
    expect(check({ ...TEMPLATE, ADMIN_EMAIL: "me@mine.org", ADMIN_PASSWORD: "short" }).errors[0]).toMatch(
      /too short/,
    );
  });

  it("warns about leftovers from the template and maps that need a key", () => {
    const { errors, warnings } = check({ ...TEMPLATE, PUBLIC_URL: "https://trips.example.com", MAP_STYLE: "outdoor-v2" });
    expect(errors).toEqual([]);
    expect(warnings.join("\n")).toMatch(/still the example/);
    expect(warnings.join("\n")).toMatch(/MAP_STYLE=outdoor-v2 needs a MapTiler key/);
  });

  it("stops when the data directory can't be written", () => {
    const file = path.join(dataDir, "not-a-dir");
    fs.writeFileSync(file, "");
    expect(configProblems({ ...TEMPLATE }, { dataDir: path.join(file, "sub") }).errors[0]).toMatch(/isn't writable/);
  });

  it("reads switches the way the check accepts them", () => {
    expect(envFlag("no", true)).toBe(false);
    expect(envFlag(" YES ", false)).toBe(true);
    expect(envFlag(undefined, true)).toBe(true);
  });
});
