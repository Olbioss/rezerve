import { describe, expect, it } from "vitest";
import {
  customerRescheduledIntro,
  customerRescheduledOwnerIntro,
  reminderIntro,
  reminderKaporaNote,
} from "./copy";

const PREVIOUS = "15 Ekim 2026 Perşembe 10:00";

describe("a booking the customer moved", () => {
  it("tells the customer they moved it — not that the business did", () => {
    expect(
      customerRescheduledIntro({ customerName: "Ali", previousText: PREVIOUS })
    ).toBe(
      `Merhaba Ali, randevunuzu yeni bir saate taşıdınız. Önceki saat: ${PREVIOUS}.`
    );
  });

  it("tells the business who moved it, and that the old time is free", () => {
    expect(
      customerRescheduledOwnerIntro({
        customerName: "Ali",
        previousText: PREVIOUS,
      })
    ).toBe(
      `Ali randevusunu yeni bir saate taşıdı; önceki saat (${PREVIOUS}) yeniden müsait.`
    );
  });
});

describe("the day-before reminder", () => {
  it("asks a customer who cannot come to cancel, and gives the number", () => {
    expect(
      reminderIntro({
        customerName: "Elif",
        businessName: "Demo Salon",
        businessPhone: "0532 123 45 67",
      })
    ).toBe(
      "Merhaba Elif, yarınki randevunuzu hatırlatmak istedik. Gelemeyecekseniz lütfen randevunuzu iptal edin ya da Demo Salon ile 0532 123 45 67 numarasından iletişime geçin; böylece saat başka birine açılır."
    );
  });

  it("asks only for the cancellation when the business gave no number", () => {
    expect(
      reminderIntro({
        customerName: "Elif",
        businessName: "Demo Salon",
        businessPhone: null,
      })
    ).toBe(
      "Merhaba Elif, yarınki randevunuzu hatırlatmak istedik. Gelemeyecekseniz lütfen randevunuzu iptal edin; böylece saat başka birine açılır."
    );
  });

  it("states the refund deadline while it is still ahead", () => {
    expect(
      reminderKaporaNote({ deadlineText: PREVIOUS, refundable: true })
    ).toBe(
      `Randevudan 24 saat öncesine kadar (${PREVIOUS}) iptal ederseniz kaporanız iade edilir; daha sonra iptal ederseniz kapora işletmede kalır.`
    );
  });

  it("promises no refund once the deadline has passed", () => {
    // Sent at 09:00, a reminder for an 08:00 appointment is already inside
    // the day.
    expect(
      reminderKaporaNote({ deadlineText: PREVIOUS, refundable: false })
    ).toBe(
      "Randevuya 24 saatten az kaldığı için iptal ederseniz kapora işletmede kalır."
    );
  });
});
