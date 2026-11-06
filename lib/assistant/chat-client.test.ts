import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ChatMessage,
  fetchMessages,
  mergeMessages,
  nextPoll,
  unconfirmedDrafts,
  VISITOR_KEY,
  visitorId,
} from "./chat-client";

const ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const NEW_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

const message = (seq: number, overrides: Partial<ChatMessage> = {}) => ({
  seq,
  direction: "out" as const,
  text: `mesaj ${seq}`,
  actions: [],
  client_message_id: null,
  ...overrides,
});

describe("visitorId", () => {
  it("returns the id this browser already has", () => {
    const storage = memoryStorage({ [VISITOR_KEY]: ID });
    expect(visitorId(storage, () => NEW_ID)).toEqual({
      id: ID,
      returning: true,
    });
  });

  it("creates and keeps one on a first visit", () => {
    const storage = memoryStorage();
    expect(visitorId(storage, () => NEW_ID)).toEqual({
      id: NEW_ID,
      returning: false,
    });
    expect(storage.items.get(VISITOR_KEY)).toBe(NEW_ID);
  });

  it("replaces a stored value that is not an id", () => {
    const storage = memoryStorage({ [VISITOR_KEY]: "bozuk" });
    expect(visitorId(storage, () => NEW_ID).id).toBe(NEW_ID);
  });

  it("still works where storage refuses, for as long as the page lives", () => {
    const refusing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(visitorId(refusing, () => NEW_ID)).toEqual({
      id: NEW_ID,
      returning: false,
    });
    expect(visitorId(null, () => NEW_ID).id).toBe(NEW_ID);
  });
});

describe("mergeMessages", () => {
  it("keeps each message once, in the order the service stored them", () => {
    const merged = mergeMessages(
      [message(1), message(2)],
      [message(2), message(4), message(3)]
    );
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe("unconfirmedDrafts", () => {
  it("drops a draft once the service echoes it back", () => {
    const drafts = [
      { clientMessageId: "a", text: "merhaba" },
      { clientMessageId: "b", text: "yer var mı?" },
    ];
    const stored = [message(1, { direction: "in", client_message_id: "a" })];
    expect(unconfirmedDrafts(drafts, stored)).toEqual([drafts[1]]);
  });
});

describe("fetchMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carries the visitor id in a header, never in the URL", async () => {
    // The id is the conversation's only credential, and URLs end up in logs.
    const fetch = vi.fn(async () =>
      Response.json({ messages: [], pending: false })
    );
    vi.stubGlobal("fetch", fetch);

    await fetchMessages("https://assistant.example/", "demo", ID, 7);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://assistant.example/web/demo/messages?after=7");
    expect(new Headers(init.headers).get("X-Visitor-Id")).toBe(ID);
  });
});

describe("nextPoll", () => {
  const NOW = 1_000_000;
  const until = { answer: NOW + 30_000, owner: NOW + 600_000 };

  it("asks every second while an answer is coming, holding the next message", () => {
    expect(nextPoll({ pending: true, with_owner: false }, NOW, until)).toEqual({
      afterMs: 1_000,
      waiting: true,
    });
  });

  it("gives up on an answer a minute after the message", () => {
    expect(
      nextPoll({ pending: true, with_owner: false }, until.answer, until)
    ).toBeNull();
  });

  it("looks every ten seconds while the owner holds the conversation, the visitor free to write", () => {
    // The owner answers when they can (spec §7.6), long after a minute.
    expect(nextPoll({ pending: false, with_owner: true }, NOW, until)).toEqual({
      afterMs: 10_000,
      waiting: false,
    });
  });

  it("still looks for the owner once a message's minute is up", () => {
    expect(
      nextPoll({ pending: true, with_owner: true }, until.answer, until)
    ).toEqual({ afterMs: 10_000, waiting: false });
  });

  it("stops looking for the owner half an hour after the last news", () => {
    expect(
      nextPoll({ pending: false, with_owner: true }, until.owner, until)
    ).toBeNull();
  });

  it("stops once nothing is coming", () => {
    expect(
      nextPoll({ pending: false, with_owner: false }, NOW, until)
    ).toBeNull();
  });

  it("reads an assistant from before with_owner as no owner", () => {
    expect(nextPoll({ pending: false }, NOW, until)).toBeNull();
  });
});
