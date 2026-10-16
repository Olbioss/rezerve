import { expect, type Page, type Route, test } from "@playwright/test";

// playwright.config.ts gives the server this ASSISTANT_URL. Nothing listens
// there: each test answers for the assistant, the way rezerve-assistant does.
const ASSISTANT = "http://localhost:3999";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHECKOUT = "https://sandbox.example/odeme/1";
const REPLY = "Yarın 15:30 uygun. Kaporayı ödediğinizde randevunuz kesinleşir.";

type Posted = { visitor_id: string; client_message_id: string; text: string };

/**
 * A stand-in assistant: takes messages, and answers on the second poll. With
 * `failFirstPost`, its first POST answers 503, as an assistant briefly down.
 */
async function stubAssistant(page: Page, { failFirstPost = false } = {}) {
  const attempts: Posted[] = [];
  const posted: Posted[] = [];
  const polled: { url: URL; visitor: string | undefined }[] = [];
  let pollsSincePost = 0;
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": "content-type, x-visitor-id",
  };
  await page.route(`${ASSISTANT}/web/demo/messages**`, (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Posted;
      attempts.push(body);
      if (failFirstPost && attempts.length === 1) {
        return route.fulfill({ status: 503, headers: cors, body: "" });
      }
      posted.push(body);
      pollsSincePost = 0;
      return route.fulfill({
        status: 202,
        headers: cors,
        json: { status: "accepted" },
      });
    }
    polled.push({
      url: new URL(request.url()),
      visitor: request.headers()["x-visitor-id"],
    });
    pollsSincePost += 1;
    const messages = posted.flatMap((message, i) => [
      {
        seq: 2 * i + 1,
        direction: "in",
        text: message.text,
        actions: [],
        client_message_id: message.client_message_id,
      },
      {
        seq: 2 * i + 2,
        direction: "out",
        text: REPLY,
        actions: [{ type: "link", label: "Kaporayı öde", url: CHECKOUT }],
        client_message_id: null,
      },
    ]);
    // The first poll after a message finds it stored but not yet answered.
    const answered = pollsSincePost > 1;
    const after = Number(new URL(request.url()).searchParams.get("after"));
    const visible = (answered ? messages : messages.slice(0, -1)).filter(
      (m) => m.seq > after
    );
    return route.fulfill({
      headers: cors,
      json: { messages: visible, pending: !answered },
    });
  });
  return { attempts, posted, polled };
}

test("a visitor asks the assistant and gets a kapora button", async ({
  page,
}) => {
  const assistant = await stubAssistant(page);
  await page.goto("/r/demo");
  await page.getByRole("button", { name: "Asistana yazın" }).click();

  const chat = page.getByRole("region", { name: "Asistan" });
  await chat.getByLabel("Mesajınız").fill("yarın 15:30 cilt bakımı");
  await chat.getByRole("button", { name: "Gönder" }).click();

  // While an answer is on its way, a second message waits: it could answer a
  // confirmation the visitor has not seen yet.
  await chat.getByLabel("Mesajınız").fill("evet");
  await expect(chat.getByRole("button", { name: "Gönder" })).toBeDisabled();

  const log = chat.getByRole("log");
  await expect(log.getByText(REPLY)).toBeVisible();
  await expect(chat.getByRole("button", { name: "Gönder" })).toBeEnabled();
  // Drawn at once, swapped for the stored copy when it came back: one bubble.
  await expect(log.getByText("yarın 15:30 cilt bakımı")).toHaveCount(1);
  await expect(log.getByRole("link", { name: "Kaporayı öde" })).toHaveAttribute(
    "href",
    CHECKOUT
  );
  await expect(chat.getByRole("status")).toBeHidden();

  expect(assistant.posted).toHaveLength(1);
  expect(assistant.posted[0].visitor_id).toMatch(UUID);
  expect(assistant.posted[0].client_message_id).toMatch(UUID);
});

test("a returning visitor finds their conversation", async ({ page }) => {
  const assistant = await stubAssistant(page);
  await page.goto("/r/demo");
  await page.getByRole("button", { name: "Asistana yazın" }).click();
  const chat = page.getByRole("region", { name: "Asistan" });
  await chat.getByLabel("Mesajınız").fill("merhaba");
  await chat.getByRole("button", { name: "Gönder" }).click();
  await expect(chat.getByRole("log").getByText(REPLY)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Asistana yazın" }).click();
  await expect(
    page.getByRole("region", { name: "Asistan" }).getByText("merhaba")
  ).toBeVisible();

  // The same visitor, asking for the whole conversation again.
  const [first] = assistant.polled;
  const last = assistant.polled[assistant.polled.length - 1];
  expect(last.visitor).toMatch(UUID);
  expect(last.visitor).toBe(first.visitor);
  expect(last.url.searchParams.get("after")).toBe("0");
  // The id is the conversation's only credential: never in a URL, which
  // would put it in every access log the polling passes through.
  for (const poll of assistant.polled) {
    expect(poll.url.search).not.toContain("visitor");
  }
});

test("closed, the widget has sent nothing anywhere", async ({ page }) => {
  const assistant = await stubAssistant(page);
  await page.goto("/r/demo");
  await expect(
    page.getByRole("button", { name: "Asistana yazın" })
  ).toBeVisible();
  expect(assistant.posted).toHaveLength(0);
  expect(assistant.polled).toHaveLength(0);
});

test("a message that failed to send is retried as itself, and nothing typed meanwhile is lost", async ({
  page,
}) => {
  const assistant = await stubAssistant(page, { failFirstPost: true });
  await page.goto("/r/demo");
  await page.getByRole("button", { name: "Asistana yazın" }).click();
  const chat = page.getByRole("region", { name: "Asistan" });
  await chat.getByLabel("Mesajınız").fill("yarın 15:30 cilt bakımı");
  await chat.getByRole("button", { name: "Gönder" }).click();

  const retry = chat.getByRole("button", { name: "Tekrar gönder" });
  await expect(retry).toBeVisible();
  // The visitor keeps typing while the first message waits to go out.
  await chat.getByLabel("Mesajınız").fill("bir de manikür");
  await retry.click();

  await expect(chat.getByRole("log").getByText(REPLY)).toBeVisible();
  // The same message, by the same id: if the first try had reached the
  // assistant after all, it stores the message once (spec §7.2).
  expect(assistant.attempts).toHaveLength(2);
  expect(assistant.attempts[1]).toEqual(assistant.attempts[0]);
  await expect(chat.getByLabel("Mesajınız")).toHaveValue("bir de manikür");
});
