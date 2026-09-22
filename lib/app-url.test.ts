/**
 * Origin normalisation.
 *
 * Both deployment failures so far were the shape of a value, not its absence:
 * an empty dashboard field, then a hostname copied without its scheme. Each
 * one reached `new URL()` and took the whole build down during "Collecting
 * page data", naming neither the variable nor the file.
 */
import { describe, expect, it } from "vitest";
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
