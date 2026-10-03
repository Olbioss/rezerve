import { describe, expect, it } from "vitest";
import { withVerifiedTls } from "./connection-string";

describe("withVerifiedTls", () => {
  it("turns Neon's sslmode=require into verify-full, keeping the rest", () => {
    const out = new URL(
      withVerifiedTls(
        "postgresql://owner:s3cret@ep-quiet-sea-123-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
      )
    );
    expect(out.searchParams.get("sslmode")).toBe("verify-full");
    expect(out.searchParams.get("channel_binding")).toBe("require");
    expect(out.hostname).toBe(
      "ep-quiet-sea-123-pooler.c-2.eu-central-1.aws.neon.tech"
    );
    expect(out.username).toBe("owner");
    expect(out.password).toBe("s3cret");
    expect(out.pathname).toBe("/neondb");
  });

  it("leaves a string that already verifies exactly as it was", () => {
    const url =
      "postgresql://owner:s3cret@ep-quiet-sea-123.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require";
    expect(withVerifiedTls(url)).toBe(url);
  });

  it("leaves a local database without TLS settings alone", () => {
    const url = "postgresql://olbios@localhost:5432/rezerve_ci_check";
    expect(withVerifiedTls(url)).toBe(url);
  });
});
