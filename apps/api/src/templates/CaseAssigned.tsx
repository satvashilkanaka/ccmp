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

interface CaseAssignedProps {
  caseId: string;
  subject: string;
  agentName: string;
}

export const CaseAssigned = ({
  caseId = 'CASE-123',
  subject = 'Problem with my order',
  agentName = 'Agent',
}: CaseAssignedProps) => (
  <Html>
    <Head />
    <Preview>New Case Assigned: {caseId}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[580px]">
          <Heading className="text-2xl font-bold text-blue-600 mb-4">
            New Case Assigned
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {agentName},
          </Text>
          <Text className="text-gray-700">
            A new case has been assigned to you.
          </Text>
          <Section className="bg-gray-50 p-4 rounded-lg my-6 border border-gray-100">
            <Text className="text-gray-900 m-0">
              <strong>ID:</strong> {caseId}
            </Text>
            <Text className="text-gray-700 mt-2 mb-0">
              <strong>Subject:</strong> {subject}
            </Text>
          </Section>
          <Section className="text-center mt-8">
            <Link
              href={`${process.env.APP_URL}/cases/${caseId}`}
              className="bg-blue-600 text-white px-6 py-3 rounded font-bold no-underline inline-block"
            >
              Open Case
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4">
            CCMP Notification Service.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default CaseAssigned;
