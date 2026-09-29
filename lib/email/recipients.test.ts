import { describe, expect, it } from "vitest";
import { DEMO_FREE, DEMO_PRO } from "@/lib/demo/credentials";
import { ownerNotificationAddress } from "./recipients";

describe("ownerNotificationAddress", () => {
  it("prefers the business's contact address", () => {
    expect(
      ownerNotificationAddress({
        organizationId: "org_real",
        contactEmail: "randevu@salon.com.tr",
        loginEmail: "owner@gmail.com",
      })
    ).toBe("randevu@salon.com.tr");
  });

  it("falls back to the owner's login", () => {
    expect(
      ownerNotificationAddress({
        organizationId: "org_real",
        contactEmail: null,
        loginEmail: "owner@gmail.com",
      })
    ).toBe("owner@gmail.com");
  });

  it("has nobody to tell when there is neither", () => {
    expect(
      ownerNotificationAddress({
        organizationId: "org_real",
        contactEmail: null,
        loginEmail: null,
      })
    ).toBeNull();
  });

  it("never mails the owner of a demo business", () => {
    // The demo logins are published, on a domain this project does not own:
    // a visitor's booking would otherwise mail a stranger's domain.
    for (const demo of [DEMO_PRO, DEMO_FREE]) {
      expect(
        ownerNotificationAddress({
          organizationId: demo.orgId,
          contactEmail: "someone@example.com",
          loginEmail: demo.email,
        })
      ).toBeNull();
    }
  });
});
