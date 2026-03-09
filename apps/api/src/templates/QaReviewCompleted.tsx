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

interface QaReviewCompletedProps {
  caseId: string;
  agentName: string;
  score: number;
  coachingNotes?: string;
}

export const QaReviewCompleted = ({
  caseId = 'CASE-123',
  agentName = 'Agent',
  score = 85,
  coachingNotes = 'Great job handling the customer query!',
}: QaReviewCompletedProps) => (
  <Html>
    <Head />
    <Preview>QA Review Completed: {caseId}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[580px]">
          <Heading className="text-2xl font-bold text-indigo-600 mb-4">
            QA Review Result
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {agentName},
          </Text>
          <Text className="text-gray-700">
            A QA analyst has completed the review for case <strong>{caseId}</strong>.
          </Text>
          <Section className="bg-indigo-50 p-4 rounded-lg my-6">
            <Text className="text-indigo-900 m-0 text-xl">
              <strong>Score:</strong> {score}%
            </Text>
            {coachingNotes && (
              <Text className="text-indigo-800 mt-4 mb-0 italic">
                "{coachingNotes}"
              </Text>
            )}
          </Section>
          <Section className="text-center mt-8">
            <Link
              href={`${process.env.APP_URL}/qa/reviews`}
              className="bg-indigo-600 text-white px-6 py-3 rounded font-bold no-underline inline-block"
            >
              View Full Review
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4">
            CCMP Quality Assurance Team.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default QaReviewCompleted;
