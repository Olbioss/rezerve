import { expect, test } from "@playwright/test";

test("every response refuses framing and carries the security headers", async ({
  request,
}) => {
  for (const path of ["/", "/giris", "/r/demo"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["content-security-policy"], path).toBe(
      "frame-ancestors 'none'"
    );
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers["permissions-policy"], path).toContain("camera=()");
  }
});
