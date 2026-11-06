import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BookingConfirmedEvent,
  eventSignature,
  notifyAssistant,
} from "./events";

const EVENT: BookingConfirmedEvent = {
  type: "booking.confirmed",
  booking_id: "b1",
  business_slug: "demo",
  customer_ref: "telegram:abcdefghijklmnopqrstuvwxyz",
  service_name: "Saç Kesimi",
  local_label: "Cumartesi 17 Ekim 15:30",
};

describe("eventSignature", () => {
  it("is the one the assistant checks", () => {
    // rezerve-assistant's tests/unit/test_event_signature.py pins the same
    // value: a change on one side fails both suites, not production.
    const body = JSON.stringify({
      type: "booking.confirmed",
      booking_id: "b1",
    });
    expect(eventSignature("event-secret", "1767225600", body)).toBe(
      "sha256=c8ecbff0f5205233624b744225a4aa6d3f3c9a1dc7dda4377ab39c8ffe48de47"
    );
  });
});

describe("notifyAssistant", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock
      .mockReset()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ASSISTANT_URL", "https://assistant.example");
    vi.stubEnv("ASSISTANT_EVENT_SECRET", "event-secret");
    vi.useFakeTimers({
      now: new Date("2026-01-01T00:00:00Z"),
      toFake: ["Date"],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("posts the event, signed over its timestamp and body", async () => {
    await notifyAssistant(EVENT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://assistant.example/events/rezerve");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-rezerve-timestamp")).toBe("1767225600");
    expect(headers.get("x-rezerve-signature")).toBe(
      eventSignature("event-secret", "1767225600", String(init.body))
    );
    expect(JSON.parse(String(init.body))).toEqual(EVENT);
  });

  it.each([["ASSISTANT_URL"], ["ASSISTANT_EVENT_SECRET"]])(
    "sends nothing without %s",
    async (name) => {
      vi.stubEnv(name, "");
      await notifyAssistant(EVENT);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("logs a refusal and carries on", async () => {
    // Best effort, like the assistant's side: the confirmation page and email
    // have told the customer already.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(notifyAssistant(EVENT)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "Assistant event booking.confirmed for booking b1: HTTP 401"
    );
  });

  it("logs an assistant that cannot be reached and carries on", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(notifyAssistant(EVENT)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
