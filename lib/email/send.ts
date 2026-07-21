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

export type SendEmailProps = {
  to: string | string[];
  subject: string;
  body: React.ReactElement;
  from?: string;
};

export async function sendEmail({ to, subject, body, from }: SendEmailProps) {
  const emailHtml = await render(body);
  const info = await transporter.sendMail({
    from: from ?? `"Slotly" <${process.env.BREVO_SENDER_EMAIL}>`,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html: emailHtml,
  });
  return { messageId: info.messageId };
}

/** Fire-and-forget wrapper: an email failure must never fail a booking. */
export async function sendEmailSafe(props: SendEmailProps) {
  try {
    return await sendEmail(props);
  } catch (err) {
    console.error(`Failed to send email "${props.subject}":`, err);
    return null;
  }
}
