import { describe, expect, it } from "vitest";
import { checkCronAuth } from "./cron-auth";

const SECRET = "s3cret-token";

describe("checkCronAuth", () => {
  it("accepts the configured bearer token", () => {
    expect(checkCronAuth(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  it("rejects a wrong, empty or malformed token", () => {
    expect(checkCronAuth("Bearer nope", SECRET)).toBe("unauthorized");
    expect(checkCronAuth(SECRET, SECRET)).toBe("unauthorized");
    expect(checkCronAuth("Bearer ", SECRET)).toBe("unauthorized");
    expect(checkCronAuth(null, SECRET)).toBe("unauthorized");
  });

  it("rejects a prefix of the real token", () => {
    expect(checkCronAuth(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(
      "unauthorized"
    );
  });

  it("fails closed when the secret is unset", () => {
    // The dangerous reading — "no secret, so allow everyone" — must not exist.
    for (const header of [null, "Bearer anything", "Bearer "]) {
      expect(checkCronAuth(header, undefined)).toBe("misconfigured");
      expect(checkCronAuth(header, "")).toBe("misconfigured");
    }
  });
});
