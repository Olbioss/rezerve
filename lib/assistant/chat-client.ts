/**
 * The chat widget's half of its conversation with rezerve-assistant (spec
 * §6.4): the visitor id, the two requests, and folding polled messages into
 * what the widget shows. Plain functions, so they are tested without a page.
 */

export type ChatAction = { type: "link"; label: string; url: string };

export type ChatMessage = {
  seq: number;
  direction: "in" | "out";
  text: string;
  actions: ChatAction[];
  /** The widget's own id for a message it sent; null on the assistant's. */
  client_message_id: string | null;
};

export type ChatPage = { messages: ChatMessage[]; pending: boolean };

/**
 * A message the widget shows before the service has stored it. `failed` when
 * its last send did not go through: it is retried as itself, same id and all.
 */
export type Draft = { clientMessageId: string; text: string; failed?: boolean };

export const VISITOR_KEY = "rezerve-assistant:visitor";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VisitorStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * This browser's visitor id — an unguessable uuid, and the only credential
 * the conversation has — and whether it was there already, so a returning
 * visitor finds their conversation. Where storage is refused, as in some
 * private windows, the id lasts as long as the page.
 */
export function visitorId(
  storage: VisitorStorage | null,
  newId: () => string = () => crypto.randomUUID()
): { id: string; returning: boolean } {
  try {
    const stored = storage?.getItem(VISITOR_KEY);
    if (stored && UUID.test(stored)) return { id: stored, returning: true };
  } catch {
    // Refused: carry on without it.
  }
  const id = newId();
  try {
    storage?.setItem(VISITOR_KEY, id);
  } catch {
    // Refused: the id lives as long as the page.
  }
  return { id, returning: false };
}

/** What the widget shows after a poll: each message once, in stored order. */
export function mergeMessages(
  shown: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  const bySeq = new Map(shown.map((m) => [m.seq, m]));
  for (const m of incoming) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** The drafts the service has not echoed back yet. */
export function unconfirmedDrafts(
  drafts: Draft[],
  messages: ChatMessage[]
): Draft[] {
  const stored = new Set(messages.map((m) => m.client_message_id));
  return drafts.filter((draft) => !stored.has(draft.clientMessageId));
}

const endpoint = (baseUrl: string, slug: string) =>
  `${baseUrl.replace(/\/+$/, "")}/web/${encodeURIComponent(slug)}/messages`;

export async function sendMessage(
  baseUrl: string,
  slug: string,
  body: { visitor_id: string; client_message_id: string; text: string }
): Promise<void> {
  const response = await fetch(endpoint(baseUrl, slug), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status !== 202) {
    throw new Error(`The assistant answered ${response.status}`);
  }
}

export async function fetchMessages(
  baseUrl: string,
  slug: string,
  visitor: string,
  after: number
): Promise<ChatPage> {
  const query = new URLSearchParams({ after: String(after) });
  const response = await fetch(`${endpoint(baseUrl, slug)}?${query}`, {
    // The visitor id is the conversation's only credential: in a URL it would
    // be written into every access log this once-a-second poll passes.
    headers: { "X-Visitor-Id": visitor },
  });
  if (!response.ok) {
    throw new Error(`The assistant answered ${response.status}`);
  }
  return (await response.json()) as ChatPage;
}
