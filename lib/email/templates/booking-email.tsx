import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { telHref } from "@/lib/phone";

export type BookingEmailProps = {
  heading: string;
  preview: string;
  intro: string;
  businessName: string;
  /** For the customer's copy: how to reach the business. */
  businessPhone?: string | null;
  businessAddress?: string | null;
  serviceName: string;
  whenText: string;
  customerName: string;
  customerEmail?: string;
  /** For the owner's copy, when the customer gave one. */
  customerPhone?: string | null;
  depositLine?: string;
};

// Gece palette, night ground — the email should feel like the page the
// booking was made on. Email clients have no web fonts, so the display face
// falls back to Georgia, the closest widely installed high-contrast serif.
//
// Every container carries an explicit background-color and the hairline is a
// solid hex rather than an alpha blend: clients that run their own dark-mode
// transform (Gmail on Android, Outlook.com) mangle transparency and inherited
// grounds, and would otherwise leave ivory text on a bleached card.
const NIGHT = "#0c1210";
const CARD = "#131b18";
const IVORY = "#f3eee4";
const BRAND = "#d4b070";
const MUTED = "#97a698";
const HAIR = "#494531";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const row = { color: IVORY, fontSize: 15, margin: "6px 0" } as const;
const rowLabel = {
  color: MUTED,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
} as const;

export function BookingEmail({
  heading,
  preview,
  intro,
  businessName,
  businessPhone,
  businessAddress,
  serviceName,
  whenText,
  customerName,
  customerEmail,
  customerPhone,
  depositLine,
}: BookingEmailProps) {
  return (
    <Html dir="ltr" lang="tr">
      <Head>
        <meta content="dark" name="color-scheme" />
        <meta content="dark" name="supported-color-schemes" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: NIGHT,
          color: IVORY,
          fontFamily: SANS,
          margin: 0,
          padding: "40px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: CARD,
            border: `1px solid ${HAIR}`,
            borderRadius: 16,
            margin: "0 auto",
            maxWidth: 480,
            padding: "36px 32px",
          }}
        >
          <Text
            style={{
              color: BRAND,
              fontFamily: SERIF,
              fontSize: 20,
              margin: "0 0 24px",
            }}
          >
            Rezer<em>ve</em>
          </Text>
          <Heading
            as="h2"
            style={{
              color: IVORY,
              fontFamily: SERIF,
              fontSize: 30,
              fontWeight: 400,
              lineHeight: 1.15,
              margin: "0 0 12px",
            }}
          >
            {heading}
          </Heading>
          <Text style={{ color: MUTED, fontSize: 15, margin: 0 }}>{intro}</Text>
          <Hr style={{ borderTop: `1px solid ${HAIR}`, margin: "24px 0" }} />
          <Section style={{ backgroundColor: CARD }}>
            <Text style={row}>
              <span style={rowLabel}>İşletme</span>
              <br />
              {businessName}
              {businessAddress && (
                <>
                  <br />
                  <span style={{ color: MUTED, fontSize: 13 }}>
                    {businessAddress}
                  </span>
                </>
              )}
              {businessPhone && (
                <>
                  <br />
                  <a
                    href={telHref(businessPhone)}
                    style={{ color: BRAND, textDecoration: "none" }}
                  >
                    {businessPhone}
                  </a>
                </>
              )}
            </Text>
            <Text style={row}>
              <span style={rowLabel}>Hizmet</span>
              <br />
              {serviceName}
            </Text>
            <Text style={row}>
              <span style={rowLabel}>Tarih</span>
              <br />
              <span style={{ fontFamily: SERIF, fontSize: 18 }}>
                {whenText}
              </span>
            </Text>
            <Text style={row}>
              <span style={rowLabel}>Müşteri</span>
              <br />
              {customerName}
              {customerEmail ? ` (${customerEmail})` : ""}
              {customerPhone ? ` · ${customerPhone}` : ""}
            </Text>
            {depositLine && (
              <Text style={row}>
                <span style={rowLabel}>Kapora</span>
                <br />
                <span style={{ color: BRAND }}>{depositLine}</span>
              </Text>
            )}
          </Section>
          <Hr style={{ borderTop: `1px solid ${HAIR}`, margin: "24px 0" }} />
          <Text style={{ color: MUTED, fontSize: 12, margin: 0 }}>
            {businessName} adına Rezerve tarafından gönderilmiştir.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
