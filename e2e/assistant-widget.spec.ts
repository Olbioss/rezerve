import { expect, type Page, type Route, test } from "@playwright/test";

// playwright.config.ts gives the server this ASSISTANT_URL. Nothing listens
// there: each test answers for the assistant, the way rezerve-assistant does.
const ASSISTANT = "http://localhost:3999";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHECKOUT = "https://sandbox.example/odeme/1";
const REPLY = "Yarın 15:30 uygun. Kaporayı ödediğinizde randevunuz kesinleşir.";

type Posted = { visitor_id: string; client_message_id: string; text: string };

/** A stand-in assistant: takes messages, and answers on the second poll. */
async function stubAssistant(page: Page) {
  const posted: Posted[] = [];
  const polled: URL[] = [];
  let pollsSincePost = 0;
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": "content-type",
  };
  await page.route(`${ASSISTANT}/web/demo/messages**`, (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (request.method() === "POST") {
      posted.push(request.postDataJSON() as Posted);
      pollsSincePost = 0;
      return route.fulfill({
        status: 202,
        headers: cors,
        json: { status: "accepted" },
      });
    }
    polled.push(new URL(request.url()));
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
  return { posted, polled };
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
  expect(last.searchParams.get("visitor_id")).toBe(
    first.searchParams.get("visitor_id")
  );
  expect(last.searchParams.get("after")).toBe("0");
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
