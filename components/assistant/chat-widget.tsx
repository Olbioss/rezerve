"use client";

import { MessageCircleIcon, SendIcon, XIcon } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ChatAction,
  type ChatMessage,
  type Draft,
  fetchMessages,
  mergeMessages,
  sendMessage,
  unconfirmedDrafts,
  visitorId,
} from "@/lib/assistant/chat-client";
import { cn } from "@/lib/utils";

/** How often to ask for the answer, and for how long before giving up. */
const POLL_EVERY_MS = 1_000;
const POLL_FOR_MS = 60_000;

/**
 * The chat assistant on a business's booking page (spec §6.4). Closed, it is
 * one button and has sent nothing anywhere; opened, it is a conversation with
 * rezerve-assistant, polled while an answer is on its way.
 */
export function ChatWidget({
  slug,
  assistantUrl,
  businessName,
}: {
  slug: string;
  assistantUrl: string;
  businessName: string;
}) {
  const panelId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const visitor = useRef<string | null>(null);
  const lastSeq = useRef(0);
  const pollUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLLIElement>(null);

  /** One poll: fold in what is new. True while an answer is still coming. */
  const refresh = useCallback(async (): Promise<boolean> => {
    const id = visitor.current;
    if (!id) return false;
    const page = await fetchMessages(assistantUrl, slug, id, lastSeq.current);
    if (page.messages.length > 0) {
      lastSeq.current = page.messages[page.messages.length - 1].seq;
      setMessages((shown) => mergeMessages(shown, page.messages));
      setDrafts((sent) => unconfirmedDrafts(sent, page.messages));
    }
    return page.pending;
  }, [assistantUrl, slug]);

  const poll = useCallback(() => {
    clearTimeout(timer.current);
    pollUntil.current = Date.now() + POLL_FOR_MS;
    setWaiting(true);
    const tick = async () => {
      let pending = true;
      try {
        pending = await refresh();
      } catch {
        // A dropped poll: the next one asks again.
      }
      if (pending && Date.now() < pollUntil.current) {
        timer.current = setTimeout(tick, POLL_EVERY_MS);
      } else {
        setWaiting(false);
      }
    };
    void tick();
  }, [refresh]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (messages.length + drafts.length > 0) {
      logEnd.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, drafts]);

  function openChat() {
    setOpen(true);
    if (visitor.current) return;
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Storage refused: the conversation lasts as long as the page.
    }
    const { id, returning } = visitorId(storage);
    visitor.current = id;
    // A returning visitor's conversation is kept by the service: show it.
    if (returning) poll();
  }

  function closeChat() {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    const id = visitor.current;
    if (!body || !id) return;
    const draft = { clientMessageId: crypto.randomUUID(), text: body };
    setDrafts((sent) => [...sent, draft]);
    setText("");
    setFailed(false);
    try {
      await sendMessage(assistantUrl, slug, {
        visitor_id: id,
        client_message_id: draft.clientMessageId,
        text: body,
      });
    } catch {
      setDrafts((sent) => sent.filter((d) => d !== draft));
      setText(body);
      setFailed(true);
      return;
    }
    poll();
  }

  return (
    <>
      <Button
        ref={launcher}
        type="button"
        variant="brand"
        size="lg"
        hidden={open}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openChat}
        className="fixed right-5 bottom-5 z-40 shadow-lg"
      >
        <MessageCircleIcon aria-hidden />
        Asistana yazın
      </Button>
      {open && (
        <section
          id={panelId}
          aria-label="Asistan"
          className="surface-ivory fixed inset-x-3 bottom-3 z-40 flex max-h-[min(36rem,calc(100svh-1.5rem))] flex-col rounded-2xl shadow-xl ring-1 ring-hair sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96"
        >
          <header className="flex items-center justify-between gap-3 border-hair border-b px-5 py-3">
            <div className="min-w-0">
              <p className="eyebrow text-brand-ink">Asistan</p>
              <p className="truncate font-display text-lg leading-tight">
                {businessName}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Kapat"
              onClick={closeChat}
            >
              <XIcon aria-hidden />
            </Button>
          </header>
          <ol
            role="log"
            aria-live="polite"
            aria-label="Mesajlar"
            className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
          >
            {messages.length + drafts.length === 0 && (
              <li className="text-muted-foreground text-sm">
                Merhaba! Randevu almak, değiştirmek ya da bir şey sormak için
                yazın.
              </li>
            )}
            {messages.map((message) => (
              <Bubble
                key={message.seq}
                mine={message.direction === "in"}
                text={message.text}
                actions={message.actions}
              />
            ))}
            {drafts.map((draft) => (
              <Bubble
                key={draft.clientMessageId}
                mine
                text={draft.text}
                actions={[]}
              />
            ))}
            <li ref={logEnd} aria-hidden className="h-px" />
          </ol>
          {waiting && (
            <p
              role="status"
              className="px-5 pb-2 text-muted-foreground text-sm"
            >
              Yazıyor…
            </p>
          )}
          {failed && (
            <p role="alert" className="px-5 pb-2 text-destructive text-sm">
              Mesaj gönderilemedi. Tekrar deneyin.
            </p>
          )}
          <form
            onSubmit={send}
            className="flex items-end gap-2 border-hair border-t px-4 py-3"
          >
            <label htmlFor={inputId} className="sr-only">
              Mesajınız
            </label>
            <Input
              ref={input}
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              autoComplete="off"
              placeholder="Mesajınızı yazın"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Gönder"
              disabled={!text.trim()}
            >
              <SendIcon aria-hidden />
            </Button>
          </form>
        </section>
      )}
    </>
  );
}

/** One message; a kapora link arrives as an action and shows as a button. */
function Bubble({
  mine,
  text,
  actions,
}: {
  mine: boolean;
  text: string;
  actions: ChatAction[];
}) {
  return (
    <li
      className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}
    >
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm leading-relaxed",
          mine ? "bg-brand text-brand-foreground" : "bg-card ring-1 ring-hair"
        )}
      >
        {text}
      </p>
      {actions.map((action) => (
        <a
          key={action.url}
          href={action.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "brand", size: "sm" })}
        >
          {action.label}
        </a>
      ))}
    </li>
  );
}
