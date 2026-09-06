import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { BookingEmail } from "./templates/booking-email";

const NIGHT = "#0c1210";
const CARD = "#131b18";
const IVORY = "#f3eee4";

async function html() {
  return await render(
    BookingEmail({
      heading: "Randevunuz alındı.",
      preview: "Randevunuz alındı",
      intro: "Onay e-postası gönderildi.",
      businessName: "Günnur Estetik",
      serviceName: "Cilt Bakımı",
      whenText: "9 Eylül Salı, 11:00",
      customerName: "Elif Yıldırım",
      customerEmail: "elif@ornek.com",
      depositLine: "₺300 ödendi",
    })
  );
}

describe("BookingEmail", () => {
  it("declares a dark colour scheme so clients don't invert it", async () => {
    const out = await html();
    expect(out).toContain('name="color-scheme"');
    expect(out).toContain('name="supported-color-schemes"');
    expect(out).toMatch(/content="dark"/);
  });

  it("paints the night ground and card explicitly", async () => {
    const out = await html();
    expect(out.toLowerCase()).toContain(NIGHT);
    expect(out.toLowerCase()).toContain(CARD);
    expect(out.toLowerCase()).toContain(IVORY);
  });

  it("leaves no ivory-era light colours behind", async () => {
    const out = await html().then((s) => s.toLowerCase());
    // The old palette: ivory ground, warm card, dark ink text.
    expect(out).not.toContain("#fbf8f1");
    expect(out).not.toContain("#e2d8c4");
    expect(out).not.toContain("#7a5a1e");
  });

  it("sets a background-color on every element that has a colour", async () => {
    // Clients that force dark mode mangle inherited or transparent grounds.
    const out = await html();
    const withBg = out.match(/background-color/g) ?? [];
    expect(withBg.length).toBeGreaterThanOrEqual(3);
  });

  it("declares Turkish, matching the content", async () => {
    expect(await html()).toContain('lang="tr"');
  });

  it("leaves no stray light grey in the rules", async () => {
    // Hr's default border-top shorthand ships #eaeaea unless replaced.
    expect((await html()).toLowerCase()).not.toContain("#eaeaea");
  });

  it("carries the booking details", async () => {
    const out = await html();
    for (const text of [
      "Günnur Estetik",
      "Cilt Bakımı",
      "9 Eylül Salı, 11:00",
      "Elif Yıldırım",
      "₺300 ödendi",
    ]) {
      expect(out).toContain(text);
    }
  });
});
