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
  Hr,
} from '@react-email/components';
import * as React from 'react';

interface DailySummaryProps {
  supervisorName: string;
  date: string;
  totalCases: number;
  avgResolutionTime: string;
  slaBreachRate: number;
  unassignedCount: number;
}

export const DailySummary = ({
  supervisorName = 'Supervisor',
  date = new Date().toLocaleDateString(),
  totalCases = 150,
  avgResolutionTime = '2.5 hours',
  slaBreachRate = 5.2,
  unassignedCount = 12,
}: DailySummaryProps) => (
  <Html>
    <Head />
    <Preview>Daily Summary for {date}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans">
        <Container className="mx-auto p-5 pb-12 w-[600px]">
          <Heading className="text-2xl font-bold text-gray-900 mb-4">
            Daily System Briefing
          </Heading>
          <Text className="text-gray-700 text-lg">
            Hi {supervisorName}, here is the summary for <strong>{date}</strong>.
          </Text>
          
          <Section className="my-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <Text className="text-blue-900 m-0 text-xs font-bold uppercase tracking-wider">Total Cases</Text>
                <Text className="text-blue-900 m-0 text-2xl font-bold">{totalCases}</Text>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <Text className="text-green-900 m-0 text-xs font-bold uppercase tracking-wider">Avg Res Time</Text>
                <Text className="text-green-900 m-0 text-2xl font-bold">{avgResolutionTime}</Text>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <Text className="text-red-900 m-0 text-xs font-bold uppercase tracking-wider">SLA Breach Rate</Text>
                <Text className="text-red-900 m-0 text-2xl font-bold">{slaBreachRate}%</Text>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <Text className="text-orange-900 m-0 text-xs font-bold uppercase tracking-wider">Unassigned</Text>
                <Text className="text-orange-900 m-0 text-2xl font-bold">{unassignedCount}</Text>
              </div>
            </div>
          </Section>

          <Hr className="border-gray-200 my-8" />

          <Section className="text-center">
            <Link
              href={`${process.env.APP_URL}/reports/dashboard`}
              className="bg-gray-900 text-white px-8 py-3 rounded font-bold no-underline inline-block"
            >
              Open Reports Dashboard
            </Link>
          </Section>
          <Text className="text-gray-500 text-sm mt-12 border-t pt-4 text-center">
            Sent via CCMP Scheduled Intelligence.
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default DailySummary;
