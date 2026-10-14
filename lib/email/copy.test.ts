import { describe, expect, it } from "vitest";
import {
  customerRescheduledIntro,
  customerRescheduledOwnerIntro,
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
