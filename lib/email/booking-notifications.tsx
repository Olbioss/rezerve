import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, organization, user } from "@/lib/db/schema/auth-schema";
import type { bookings } from "@/lib/db/schema/booking-schema";
import { businessProfiles } from "@/lib/db/schema/business-schema";
import { services } from "@/lib/db/schema/service-schema";
import { formatMoney } from "@/lib/format";
import { cancelledIntro } from "./copy";
import { sendEmailSafe } from "./send";
import { BookingEmail } from "./templates/booking-email";

type Booking = typeof bookings.$inferSelect;

/** "28 Ekim 2026 Çarşamba 10:00", in the business's timezone. */
function formatWhen(instant: Date, timezone: string): string {
  return instant.toLocaleString("tr-TR", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

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

  const whenText = formatWhen(booking.startsAt, profile.timezone);
  const depositLine =
    booking.depositCents != null
      ? `${formatMoney(booking.depositCents, profile.currency)} ödendi`
      : undefined;
  const ownerEmail = profile.contactEmail ?? owner?.email ?? null;

  return { org, profile, service, whenText, depositLine, ownerEmail };
}

export async function sendBookingConfirmedEmails(
  booking: Booking,
  {
    /** False when the owner booked it themselves and needs no telling. */
    notifyOwner = true,
  }: { notifyOwner?: boolean } = {}
) {
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
    // An owner may book someone in without an email address.
    booking.customerEmail &&
      sendEmailSafe({
        to: booking.customerEmail,
        subject: `Randevunuz onaylandı — ${ctx.service.name}, ${ctx.org.name}`,
        body: (
          <BookingEmail
            heading="Randevunuz alındı!"
            preview={`${ctx.service.name} — ${ctx.whenText}`}
            intro={`Merhaba ${booking.customerName}, randevunuz onaylandı.`}
            businessPhone={ctx.profile.phone}
            businessAddress={ctx.profile.address}
            {...shared}
          />
        ),
      }),
    notifyOwner &&
      ctx.ownerEmail &&
      sendEmailSafe({
        to: ctx.ownerEmail,
        subject: `Yeni randevu — ${ctx.service.name}, ${ctx.whenText}`,
        body: (
          <BookingEmail
            heading="Yeni randevu"
            preview={`${booking.customerName} — ${ctx.service.name} randevusu aldı`}
            intro="Yeni bir onaylı randevunuz var."
            customerEmail={booking.customerEmail ?? undefined}
            customerPhone={booking.customerPhone}
            {...shared}
          />
        ),
      }),
  ]);
}

export async function sendBookingCancelledEmails(
  booking: Booking,
  /** True when the kapora was returned to the customer. */
  depositRefunded = false
) {
  const ctx = await loadContext(booking);
  if (!ctx) return;
  const shared = {
    businessName: ctx.org.name,
    serviceName: ctx.service.name,
    whenText: ctx.whenText,
    customerName: booking.customerName,
  };

  await Promise.all([
    booking.customerEmail &&
      sendEmailSafe({
        to: booking.customerEmail,
        subject: `Randevu iptal edildi — ${ctx.service.name}, ${ctx.org.name}`,
        body: (
          <BookingEmail
            heading="Randevu iptal edildi"
            preview={`${ctx.service.name} randevunuz iptal edildi`}
            intro={cancelledIntro({
              customerName: booking.customerName,
              businessName: ctx.org.name,
              businessPhone: ctx.profile.phone,
              depositRefunded,
            })}
            businessPhone={ctx.profile.phone}
            businessAddress={ctx.profile.address}
            {...(depositRefunded && booking.depositCents != null
              ? {
                  depositLine: `${formatMoney(booking.depositCents, ctx.profile.currency)} iade edildi`,
                }
              : {})}
            {...shared}
          />
        ),
      }),
    ctx.ownerEmail &&
      sendEmailSafe({
        to: ctx.ownerEmail,
        subject: `Randevu iptal edildi — ${ctx.service.name}, ${ctx.whenText}`,
        body: (
          <BookingEmail
            heading="Randevu iptal edildi"
            preview={`${booking.customerName} adlı müşterinin randevusu iptal edildi`}
            intro={`Bir randevu iptal edildi.${
              depositRefunded ? " Kapora müşteriye iade edildi." : ""
            }`}
            customerEmail={booking.customerEmail ?? undefined}
            customerPhone={booking.customerPhone}
            {...shared}
          />
        ),
      }),
  ]);
}

/**
 * The customer's copy when the owner moves their appointment. The owner did
 * the moving, so they get nothing; a customer with no email on file gets
 * nothing either, and hears about it however the owner reached them.
 */
export async function sendBookingRescheduledEmail(
  booking: Booking,
  previousStartsAt: Date
) {
  if (!booking.customerEmail) return;
  const ctx = await loadContext(booking);
  if (!ctx) return;
  const previousText = formatWhen(previousStartsAt, ctx.profile.timezone);

  await sendEmailSafe({
    to: booking.customerEmail,
    subject: `Randevunuzun saati değişti — ${ctx.service.name}, ${ctx.org.name}`,
    body: (
      <BookingEmail
        heading="Randevunuz taşındı"
        preview={`Yeni saat: ${ctx.whenText}`}
        intro={`Merhaba ${booking.customerName}, ${ctx.org.name} randevunuzu yeni bir saate taşıdı. Önceki saat: ${previousText}.${
          ctx.profile.phone
            ? ` Size uymuyorsa ${ctx.profile.phone} numarasından ulaşabilirsiniz.`
            : ""
        }`}
        businessName={ctx.org.name}
        businessPhone={ctx.profile.phone}
        businessAddress={ctx.profile.address}
        serviceName={ctx.service.name}
        whenText={ctx.whenText}
        customerName={booking.customerName}
        depositLine={ctx.depositLine}
      />
    ),
  });
}
