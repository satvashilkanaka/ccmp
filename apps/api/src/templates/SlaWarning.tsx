import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface SlaWarningProps {
  caseId: string;
  agentName: string;
  slaDueAt: string;
}

export const SlaWarning = ({
  caseId = 'CASE-123',
  agentName = 'Agent',
  slaDueAt = 'in 15 minutes',
}: SlaWarningProps) => (
  <Html>
    <Head />
    <Preview>SLA Warning: Case {caseId} is approaching breach</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[580px]">
          <Heading className="text-2xl font-bold text-orange-600 mb-4">
            SLA Warning Threshold Approaching
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {agentName},
          </Text>
          <Text className="text-gray-700">
            Case <strong>{caseId}</strong> is approaching its SLA threshold. Please take action immediately to avoid a breach.
          </Text>
          <Section className="bg-orange-50 p-4 rounded-lg my-6">
            <Text className="text-orange-900 m-0">
              <strong>SLA Due:</strong> {slaDueAt}
            </Text>
          </Section>
          <Section className="text-center mt-8">
            <Link
              href={`${process.env.APP_URL}/cases/${caseId}`}
              className="bg-orange-600 text-white px-6 py-3 rounded font-bold no-underline inline-block"
            >
              View Case Details
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4">
            This is an automated notification from CCMP.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default SlaWarning;
