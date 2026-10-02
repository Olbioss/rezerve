import { render } from "@react-email/components";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_SERVER,
  port: Number(process.env.BREVO_SMTP_PORT) || 587,
  secure: false, // port 587 uses STARTTLS
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_PASSWORD,
  },
});

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
};

export type SendEmailProps = {
  to: string | string[];
  subject: string;
  body: React.ReactElement;
  from?: string;
  attachments?: EmailAttachment[];
};

export async function sendEmail({
  to,
  subject,
  body,
  from,
  attachments,
}: SendEmailProps) {
  const emailHtml = await render(body);
  const info = await transporter.sendMail({
    from: from ?? `"Rezerve" <${process.env.BREVO_SENDER_EMAIL}>`,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html: emailHtml,
    attachments,
  });
  return { messageId: info.messageId };
}

let warnedOff = false;

/** Fire-and-forget wrapper: an email failure must never fail a booking. */
export async function sendEmailSafe(props: SendEmailProps) {
  // CI and a bare checkout have no SMTP server; without this every send would
  // try localhost:587 and log a refusal. A local end-to-end run does have the
  // real Brevo settings, from .env, and sets EMAIL_DELIVERY=off so its test
  // bookings never reach an inbox.
  if (!process.env.BREVO_SMTP_SERVER || process.env.EMAIL_DELIVERY === "off") {
    if (!warnedOff) {
      console.warn("Email delivery is off — emails are not sent.");
      warnedOff = true;
    }
    return null;
  }
  try {
    return await sendEmail(props);
  } catch (err) {
    console.error(`Failed to send email "${props.subject}":`, err);
    return null;
  }
}
