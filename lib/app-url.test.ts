/**
 * Origin normalisation.
 *
 * Both deployment failures so far were the shape of a value, not its absence:
 * an empty dashboard field, then a hostname copied without its scheme. Each
 * one reached `new URL()` and took the whole build down during "Collecting
 * page data", naming neither the variable nor the file.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { originOr } from "./app-url";

const FALLBACK = "https://fallback.example";

describe("originOr", () => {
  it("adds a scheme to a bare hostname, as copied from a dashboard", () => {
    expect(originOr("rezerve-iota.vercel.app", FALLBACK)).toBe(
      "https://rezerve-iota.vercel.app"
    );
  });

  it("leaves an absolute URL alone", () => {
    expect(originOr("https://rezerve.app", FALLBACK)).toBe(
      "https://rezerve.app"
    );
    expect(originOr("http://localhost:3000", FALLBACK)).toBe(
      "http://localhost:3000"
    );
  });

  it("normalises to an origin, so callers can concatenate safely", () => {
    expect(originOr("https://rezerve.app/", FALLBACK)).toBe(
      "https://rezerve.app"
    );
    expect(originOr("https://rezerve.app/panel?x=1", FALLBACK)).toBe(
      "https://rezerve.app"
    );
  });

  it("treats an empty or missing value as not configured", () => {
    expect(originOr("", FALLBACK)).toBe(FALLBACK);
    expect(originOr(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back rather than throwing on something unparseable", () => {
    // Module scope: throwing here takes every page down with it.
    expect(originOr("http://", FALLBACK)).toBe(FALLBACK);
    expect(originOr("https://", FALLBACK)).toBe(FALLBACK);
  });

  it("keeps a port and a subdomain", () => {
    expect(originOr("preview.rezerve.app:8443", FALLBACK)).toBe(
      "https://preview.rezerve.app:8443"
    );
  });
});

/**
 * APP_URL is resolved once at module scope, so each case re-imports the
 * module with a different environment.
 */
async function resolveAppUrl(env: {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_URL?: string;
}) {
  vi.resetModules();
  // "" and unset are the same thing to this module, so stubbing empty is a
  // faithful stand-in for absent.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL ?? "");
  vi.stubEnv("VERCEL_URL", env.VERCEL_URL ?? "");
  return (await import("./app-url")).APP_URL;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("APP_URL precedence", () => {
  it("prefers the configured origin over the deployment's own", async () => {
    expect(
      await resolveAppUrl({
        NEXT_PUBLIC_APP_URL: "https://chosen.example",
        VERCEL_URL: "deployment.vercel.app",
      })
    ).toBe("https://chosen.example");
  });

  it("falls back to the deployment's own origin", async () => {
    expect(await resolveAppUrl({ VERCEL_URL: "deployment.vercel.app" })).toBe(
      "https://deployment.vercel.app"
    );
  });

  it("falls back to localhost when nothing is configured", async () => {
    expect(await resolveAppUrl({})).toBe("http://localhost:3000");
  });

  it("does not let an unparseable value shadow a usable one", async () => {
    expect(
      await resolveAppUrl({
        NEXT_PUBLIC_APP_URL: "http://",
        VERCEL_URL: "deployment.vercel.app",
      })
    ).toBe("https://deployment.vercel.app");
  });
});
