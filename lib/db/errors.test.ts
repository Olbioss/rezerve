import { describe, expect, it } from "vitest";
import { isExclusionConflict, pgErrorCode } from "./errors";

describe("isExclusionConflict", () => {
  it("recognises a plain exclusion violation", () => {
    expect(isExclusionConflict({ code: "23P01" })).toBe(true);
  });

  it("recognises the deadlock two conflicting inserts can end in", () => {
    // What the parallel double-submit test caught: drizzle's "Failed query"
    // wrapper, with node-postgres's 40P01 on `cause`.
    const wrapped = {
      message: 'Failed query: insert into "bookings" …',
      cause: { code: "40P01", message: "deadlock detected" },
    };
    expect(isExclusionConflict(wrapped)).toBe(true);
  });

  it("leaves every other error alone", () => {
    for (const err of [
      { code: "23505" },
      { code: "08006" },
      new Error("boom"),
      "not an object",
      null,
      undefined,
    ]) {
      expect(isExclusionConflict(err)).toBe(false);
    }
  });
});

describe("pgErrorCode", () => {
  it("reads the code from the error or from its cause", () => {
    expect(pgErrorCode({ code: "23P01" })).toBe("23P01");
    expect(pgErrorCode({ cause: { code: "23505" } })).toBe("23505");
    expect(pgErrorCode(new Error("x"))).toBeUndefined();
  });
});
