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

interface CsatSurveyProps {
  caseId: string;
  customerName: string;
  surveyUrl: string;
}

export const CsatSurvey = ({
  caseId = 'CASE-123',
  customerName = 'Customer',
  surveyUrl = 'https://ccmp.com/survey/token',
}: CsatSurveyProps) => (
  <Html>
    <Head />
    <Preview>We value your feedback - Case {caseId}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[580px]">
          <Heading className="text-2xl font-bold text-teal-600 mb-4">
            How did we do?
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {customerName},
          </Text>
          <Text className="text-gray-700">
            Internal records show that your case <strong>{caseId}</strong> was recently resolved. We would love to hear about your experience with CCMP.
          </Text>
          <Text className="text-gray-700">
            It takes less than a minute to share your thoughts.
          </Text>
          <Section className="text-center mt-8">
            <Link
              href={surveyUrl}
              className="bg-teal-600 text-white px-8 py-4 rounded font-bold no-underline inline-block text-lg"
            >
              Take the Survey
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4">
            Thank you for choosing CCMP Support.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default CsatSurvey;
