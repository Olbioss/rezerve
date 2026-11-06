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
  ANSWER_WAIT_MS,
  type ChatAction,
  type ChatMessage,
  type ChatPage,
  type Draft,
  fetchMessages,
  mergeMessages,
  nextPoll,
  OWNER_WAIT_MS,
  sendMessage,
  unconfirmedDrafts,
  visitorId,
} from "@/lib/assistant/chat-client";
import { cn } from "@/lib/utils";

/**
 * The chat assistant on a business's booking page (spec §6.4). Closed, it is
 * one button and has sent nothing anywhere; opened, it is a conversation with
 * rezerve-assistant, polled while an answer is on its way, and slowly while
 * the business owner holds the conversation (nextPoll).
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
  const visitor = useRef<string | null>(null);
  const lastSeq = useRef(0);
  // What the last poll said, and until when each kind of news is looked for.
  const last = useRef<Pick<ChatPage, "pending" | "with_owner">>({
    pending: false,
  });
  const answerUntil = useRef(0);
  const ownerUntil = useRef(0);
  // Open: the owner's reply is looked for only while someone can see it.
  const shown = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Each poll() begins a generation. A look still on its way when a newer one
  // begins, or when the widget goes, changes nothing and schedules nothing.
  const generation = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const logEnd = useRef<HTMLLIElement>(null);

  /** One poll: fold in what is new, and keep what it says is coming. */
  const refresh = useCallback(
    async (begun: number) => {
      const id = visitor.current;
      if (!id) return;
      const page = await fetchMessages(assistantUrl, slug, id, lastSeq.current);
      if (begun !== generation.current) return;
      if (page.messages.length > 0) {
        lastSeq.current = page.messages[page.messages.length - 1].seq;
        setMessages((shown) => mergeMessages(shown, page.messages));
        setDrafts((sent) => unconfirmedDrafts(sent, page.messages));
        ownerUntil.current = Date.now() + OWNER_WAIT_MS;
      }
      last.current = page;
    },
    [assistantUrl, slug]
  );

  /** Poll now, then as long as nextPoll says. */
  const poll = useCallback(() => {
    clearTimeout(timer.current);
    const begun = ++generation.current;
    const tick = async () => {
      try {
        await refresh(begun);
      } catch {
        // A dropped poll: decide on what the last one said.
      }
      if (begun !== generation.current) return;
      const step = nextPoll(last.current, Date.now(), {
        answer: answerUntil.current,
        owner: ownerUntil.current,
      });
      setWaiting(step?.waiting ?? false);
      const seen = shown.current && document.visibilityState === "visible";
      if (step && (step.waiting || seen)) {
        timer.current = setTimeout(tick, step.afterMs);
      }
    };
    void tick();
  }, [refresh]);

  /** Look from now: for an answer for a minute, the owner's for half an hour. */
  const lookAgain = useCallback(() => {
    const now = Date.now();
    answerUntil.current = now + ANSWER_WAIT_MS;
    ownerUntil.current = now + OWNER_WAIT_MS;
    poll();
  }, [poll]);

  useEffect(
    () => () => {
      generation.current += 1;
      clearTimeout(timer.current);
    },
    []
  );

  // Back on the page, say from paying the kapora in another tab: what came
  // meanwhile, and the owner looked for again.
  useEffect(() => {
    const returned = () => {
      if (document.visibilityState === "visible" && shown.current) {
        if (visitor.current) lookAgain();
      }
    };
    document.addEventListener("visibilitychange", returned);
    return () => document.removeEventListener("visibilitychange", returned);
  }, [lookAgain]);

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
    shown.current = true;
    if (!visitor.current) {
      let storage: Storage | null = null;
      try {
        storage = window.localStorage;
      } catch {
        // Storage refused: the conversation lasts as long as the page.
      }
      const { id, returning } = visitorId(storage);
      visitor.current = id;
      // A new visitor has no conversation to fetch yet.
      if (!returning) return;
    }
    // The conversation the service keeps, with whatever came while closed.
    lookAgain();
  }

  function closeChat() {
    setOpen(false);
    shown.current = false;
    requestAnimationFrame(() => launcher.current?.focus());
  }

  const undelivered = drafts.some((draft) => draft.failed);

  function markFailed(clientMessageId: string, failed: boolean) {
    setDrafts((sent) =>
      sent.map((d) =>
        d.clientMessageId === clientMessageId ? { ...d, failed } : d
      )
    );
  }

  /**
   * Send a draft, or send it again as itself: the same id, so if an earlier
   * try reached the assistant after all, it is still one message (§7.2).
   */
  async function deliver(draft: Draft) {
    const id = visitor.current;
    if (!id) return;
    markFailed(draft.clientMessageId, false);
    try {
      await sendMessage(assistantUrl, slug, {
        visitor_id: id,
        client_message_id: draft.clientMessageId,
        text: draft.text,
      });
    } catch {
      markFailed(draft.clientMessageId, true);
      return;
    }
    // Its answer is coming: the next message waits for it.
    last.current = { ...last.current, pending: true };
    setWaiting(true);
    lookAgain();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    // One message at a time: a second one sent while an answer is on its way
    // could answer a confirmation the visitor has not seen yet, and one sent
    // past an undelivered message would arrive before it.
    if (!body || !visitor.current || waiting || undelivered) return;
    const draft = { clientMessageId: crypto.randomUUID(), text: body };
    setDrafts((sent) => [...sent, draft]);
    setText("");
    await deliver(draft);
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
                failed={draft.failed}
                onRetry={() => deliver(draft)}
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
              disabled={!text.trim() || waiting || undelivered}
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
  failed = false,
  onRetry,
}: {
  mine: boolean;
  text: string;
  actions: ChatAction[];
  /** A draft whose send did not go through, offered again as itself. */
  failed?: boolean;
  onRetry?: () => void;
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
      {failed && (
        <p
          role="alert"
          className="flex items-center gap-2 text-destructive text-xs"
        >
          Gönderilemedi.
          <Button type="button" variant="link" size="xs" onClick={onRetry}>
            Tekrar gönder
          </Button>
        </p>
      )}
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
