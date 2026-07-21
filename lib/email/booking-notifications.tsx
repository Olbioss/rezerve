import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, organization, user } from "@/lib/db/schema/auth-schema";
import type { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import { formatMoney } from "@/lib/format";
import { sendEmailSafe } from "./send";
import { BookingEmail } from "./templates/booking-email";

type Booking = typeof bookings.$inferSelect;

/** Load everything the emails need for a booking's organization. */
async function loadContext(booking: Booking) {
  const [org, profile, service, owner] = await Promise.all([
    db.query.organization.findFirst({
      where: eq(organization.id, booking.organizationId),
    }),
    db.query.businessProfiles.findFirst({
      where: eq(businessProfiles.organizationId, booking.organizationId),
    }),
    db.query.services.findFirst({ where: eq(services.id, booking.serviceId) }),
    db.query.member
      .findFirst({ where: eq(member.organizationId, booking.organizationId) })
      .then((m) =>
        m ? db.query.user.findFirst({ where: eq(user.id, m.userId) }) : null
      ),
  ]);
  if (!org || !profile || !service) return null;

  const whenText = booking.startsAt.toLocaleString("en-US", {
    timeZone: profile.timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const depositLine =
    booking.depositCents != null
      ? `${formatMoney(booking.depositCents, profile.currency)} paid`
      : undefined;
  const ownerEmail = profile.contactEmail ?? owner?.email ?? null;

  return { org, profile, service, whenText, depositLine, ownerEmail };
}

export async function sendBookingConfirmedEmails(booking: Booking) {
  const ctx = await loadContext(booking);
  if (!ctx) return;
  const shared = {
    businessName: ctx.org.name,
    serviceName: ctx.service.name,
    whenText: ctx.whenText,
    customerName: booking.customerName,
    depositLine: ctx.depositLine,
  };

  await Promise.all([
    sendEmailSafe({
      to: booking.customerEmail,
      subject: `Booking confirmed — ${ctx.service.name} at ${ctx.org.name}`,
      body: (
        <BookingEmail
          heading="You're booked!"
          preview={`${ctx.service.name} on ${ctx.whenText}`}
          intro={`Hi ${booking.customerName}, your appointment is confirmed.`}
          {...shared}
        />
      ),
    }),
    ctx.ownerEmail &&
      sendEmailSafe({
        to: ctx.ownerEmail,
        subject: `New booking — ${ctx.service.name} on ${ctx.whenText}`,
        body: (
          <BookingEmail
            heading="New booking"
            preview={`${booking.customerName} booked ${ctx.service.name}`}
            intro="You have a new confirmed booking."
            customerEmail={booking.customerEmail}
            {...shared}
          />
        ),
      }),
  ]);
}

export async function sendBookingCancelledEmails(booking: Booking) {
  const ctx = await loadContext(booking);
  if (!ctx) return;
  const shared = {
    businessName: ctx.org.name,
    serviceName: ctx.service.name,
    whenText: ctx.whenText,
    customerName: booking.customerName,
  };

  await Promise.all([
    sendEmailSafe({
      to: booking.customerEmail,
      subject: `Booking cancelled — ${ctx.service.name} at ${ctx.org.name}`,
      body: (
        <BookingEmail
          heading="Booking cancelled"
          preview={`Your ${ctx.service.name} appointment was cancelled`}
          intro={`Hi ${booking.customerName}, your appointment has been cancelled. If this is unexpected, please contact ${ctx.org.name} directly.`}
          {...shared}
        />
      ),
    }),
    ctx.ownerEmail &&
      sendEmailSafe({
        to: ctx.ownerEmail,
        subject: `Booking cancelled — ${ctx.service.name} on ${ctx.whenText}`,
        body: (
          <BookingEmail
            heading="Booking cancelled"
            preview={`${booking.customerName}'s booking was cancelled`}
            intro="A booking has been cancelled."
            customerEmail={booking.customerEmail}
            {...shared}
          />
        ),
      }),
  ]);
}
