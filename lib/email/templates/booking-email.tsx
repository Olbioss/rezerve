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
      <Body style={{ backgroundColor: "#f5f5f5", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            margin: "40px auto",
            maxWidth: 480,
            padding: "32px",
          }}
        >
          <Heading as="h2" style={{ marginTop: 0 }}>
            {heading}
          </Heading>
          <Text>{intro}</Text>
          <Hr />
          <Section>
            <Text style={{ margin: "4px 0" }}>
              <strong>Business:</strong> {businessName}
            </Text>
            <Text style={{ margin: "4px 0" }}>
              <strong>Service:</strong> {serviceName}
            </Text>
            <Text style={{ margin: "4px 0" }}>
              <strong>When:</strong> {whenText}
            </Text>
            <Text style={{ margin: "4px 0" }}>
              <strong>Customer:</strong> {customerName}
              {customerEmail ? ` (${customerEmail})` : ""}
            </Text>
            {depositLine && (
              <Text style={{ margin: "4px 0" }}>
                <strong>Deposit:</strong> {depositLine}
              </Text>
            )}
          </Section>
          <Hr />
          <Text style={{ color: "#888888", fontSize: 12 }}>
            Sent by Slotly on behalf of {businessName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
