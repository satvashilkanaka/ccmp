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

interface SlaBreachProps {
  caseId: string;
  agentName: string;
  supervisorName: string;
  breachedAt?: string;
}

export const SlaBreach = ({
  caseId = 'CASE-123',
  agentName = 'Agent',
  supervisorName = 'Supervisor',
  breachedAt = new Date().toLocaleString(),
}: SlaBreachProps) => (
  <Html>
    <Head />
    <Preview>CRITICAL: SLA Breach - Case {caseId}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[580px]">
          <Heading className="text-2xl font-bold text-red-600 mb-4">
            SLA Breach Escalation
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {supervisorName},
          </Text>
          <Text className="text-gray-700">
            Case <strong>{caseId}</strong> assigned to <strong>{agentName}</strong> has breached its SLA policy and has been escalated.
          </Text>
          <Section className="bg-red-50 p-4 rounded-lg my-6">
            <Text className="text-red-900 m-0">
              <strong>Breached At:</strong> {breachedAt}
            </Text>
          </Section>
          <Section className="text-center mt-8">
            <Link
              href={`${process.env.APP_URL}/cases/${caseId}`}
              className="bg-red-600 text-white px-6 py-3 rounded font-bold no-underline inline-block"
            >
              Review Escalated Case
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4">
            CCMP Automated Escalation Service.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default SlaBreach;
