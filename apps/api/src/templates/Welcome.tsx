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

interface WelcomeProps {
  userName: string;
  role: string;
}

export const Welcome = ({
  userName = 'New User',
  role = 'Agent',
}: WelcomeProps) => (
  <Html>
    <Head />
    <Preview>Welcome to CCMP, {userName}!</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-8 pb-12 w-[580px] border border-gray-100 rounded-xl shadow-sm mt-10">
          <Heading className="text-2xl font-bold text-gray-900 mb-6">
            Welcome to the Platform
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {userName},
          </Text>
          <Text className="text-gray-700 leading-relaxed">
            Welcome to <strong>CCMP (Contact Center Management Platform)</strong>. Your account has been created with the role of <strong>{role}</strong>.
          </Text>
          <Section className="bg-blue-50 p-6 rounded-lg my-8">
            <Text className="text-blue-900 m-0 font-bold mb-2">Next Steps:</Text>
            <ul className="text-blue-800 m-0 pl-5">
              <li>Complete your profile in settings</li>
              <li>Enable notification preferences</li>
              <li>Explore your assigned queues</li>
            </ul>
          </Section>
          <Section className="text-center">
            <Link
              href={`${process.env.APP_URL}/login`}
              className="bg-blue-600 text-white px-10 py-4 rounded-lg font-bold no-underline inline-block text-lg shadow-lg shadow-blue-200"
            >
              Get Started
            </Link>
          </Section>
          <Text className="text-gray-400 text-xs mt-12 text-center">
            &copy; 2026 CCMP Support Technology. All rights reserved.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default Welcome;
