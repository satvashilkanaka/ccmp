'use client';

import { useState } from 'react';
import { Card, Title, Text, Switch, Flex, Button, Callout } from '@tremor/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellIcon, CheckCircleIcon, ExclamationIcon } from '@heroicons/react/outline';

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState(false);

  // Fetch Preferences
  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: async () => {
      const res = await fetch('/api/v1/notifications/preferences', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      return res.json();
    }
  });

  // Update Preferences
  const mutation = useMutation({
    mutationFn: async (newPrefs: any) => {
      const res = await fetch('/api/v1/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newPrefs)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications', 'preferences']);
      setSuccessMessage(true);
      setTimeout(() => setSuccessMessage(false), 3000);
    }
  });

  if (isLoading) return <div className="p-10 text-gray-400">Loading settings...</div>;

  const handleToggle = (key: string, value: boolean) => {
    mutation.mutate({ [key]: value });
  };

  const preferenceItems = [
    { key: 'emailOnAssign', label: 'Case Assignment', desc: 'Notify me when a new case is assigned to me.' },
    { key: 'emailOnSlaWarning', label: 'SLA Warning', desc: 'Alert me when a case is approaching its SLA threshold.' },
    { key: 'emailOnSlaBreach', label: 'SLA Breach', desc: 'Notify me (or my supervisor) if a case breaches its SLA.' },
    { key: 'emailOnQaReview', label: 'QA Review', desc: 'Alert me when a QA analyst completes a review of my work.' },
    { key: 'emailDailySummary', label: 'Daily Summary', desc: 'Send a morning briefing of my performance and queue status.' },
  ];

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Title className="text-white mb-2 flex items-center gap-2">
        <BellIcon className="w-6 h-6 text-indigo-400" />
        Notification Preferences
      </Title>
      <Text className="text-gray-400 mb-8">Manage how and when CCMP contacts you via email.</Text>

      {successMessage && (
        <Callout
          className="mb-6 h-12"
          title="Settings saved successfully"
          icon={CheckCircleIcon}
          color="teal"
        />
      )}

      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-md">
        <div className="space-y-8">
          {preferenceItems.map((item) => (
            <Flex key={item.key} justifyContent="between" alignItems="center">
              <div>
                <Text className="text-white font-medium">{item.label}</Text>
                <Text className="text-slate-500 text-sm mt-1">{item.desc}</Text>
              </div>
              <Switch
                id={item.key}
                name={item.key}
                checked={prefs?.[item.key] ?? false}
                onChange={(checked) => handleToggle(item.key, checked)}
                color="indigo"
              />
            </Flex>
          ))}
        </div>
      </Card>

      <div className="mt-8 p-4 bg-indigo-900/10 border border-indigo-900/20 rounded-lg">
        <Flex alignItems="center" gap="3">
          <ExclamationIcon className="w-5 h-5 text-indigo-400 shrink-0" />
          <Text className="text-indigo-300 text-sm leading-relaxed">
            Note: Critical system alerts and manual supervisor escalations will always bypass these preferences.
          </Text>
        </Flex>
      </div>
    </div>
  );
}
