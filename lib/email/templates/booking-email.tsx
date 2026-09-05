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

export type BookingEmailProps = {
  heading: string;
  preview: string;
  intro: string;
  businessName: string;
  serviceName: string;
  whenText: string;
  customerName: string;
  customerEmail?: string;
  depositLine?: string;
};

// Gece palette. Email clients have no web fonts, so the display face falls
// back to Georgia — the closest widely installed high-contrast serif.
const INK = "#0c1210";
const IVORY = "#f3eee4";
const CARD = "#fbf8f1";
const BRAND = "#7a5a1e";
const MUTED = "#575f59";
const HAIR = "#e2d8c4";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const row = { color: INK, fontSize: 15, margin: "6px 0" } as const;
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
  serviceName,
  whenText,
  customerName,
  customerEmail,
  depositLine,
}: BookingEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: IVORY, fontFamily: SANS, margin: 0 }}>
        <Container
          style={{
            backgroundColor: CARD,
            border: `1px solid ${HAIR}`,
            borderRadius: 16,
            margin: "40px auto",
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
              color: INK,
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
          <Hr style={{ borderColor: HAIR, margin: "24px 0" }} />
          <Section>
            <Text style={row}>
              <span style={rowLabel}>İşletme</span>
              <br />
              {businessName}
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
            </Text>
            {depositLine && (
              <Text style={row}>
                <span style={rowLabel}>Kapora</span>
                <br />
                <span style={{ color: BRAND }}>{depositLine}</span>
              </Text>
            )}
          </Section>
          <Hr style={{ borderColor: HAIR, margin: "24px 0" }} />
          <Text style={{ color: MUTED, fontSize: 12, margin: 0 }}>
            {businessName} adına Rezerve tarafından gönderilmiştir.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
