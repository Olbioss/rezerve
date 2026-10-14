import { describe, expect, it, vi } from "vitest";
import { runTool } from "./call-tool-result";

describe("runTool", () => {
  it("answers a success with its data, structured and as text", async () => {
    const result = await runTool("demo", async () => ({
      ok: true,
      data: { n: 1 },
    }));

    expect(result).toEqual({
      content: [{ type: "text", text: '{"n":1}' }],
      structuredContent: { n: 1 },
    });
  });

  it("answers a refusal as a tool error carrying its code", async () => {
    const result = await runTool("demo", async () => ({
      ok: false,
      error: { code: "slot_taken", message: "Bu saat az önce doldu." },
    }));

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "slot_taken",
      message: "Bu saat az önce doldu.",
    });
  });

  it("never lets what a tool throws reach the model", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runTool("create_booking", async () => {
      throw new Error(
        'Failed query: insert into "bookings" … params: Ali Yılmaz,0532 111 22 33'
      );
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "internal" });
    expect(JSON.stringify(result)).not.toMatch(/Failed query|0532/);
    // Logged on the server instead, where it can be looked into.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
