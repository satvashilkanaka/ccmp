'use client';

import { Grid, Card, Title, Text, Metric, Badge, Button, Flex } from '@tremor/react';
import { useQuery } from '@tanstack/react-query';

export default function SystemHealthPage() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/health');
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const getStatusColor = (status: string) => (status === 'UP' ? 'emerald' : 'rose');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title className="text-slate-100 pb-1">System Health</Title>
          <Text className="text-slate-400">Real-time status of core services and system resources.</Text>
        </div>
        <Button size="sm" variant="secondary" color="slate" onClick={() => refetch()} loading={isLoading}>
          Refresh Now
        </Button>
      </div>

      <Grid numItemsLg={3} className="gap-6">
        <Card className="bg-slate-800 border-none ring-0">
          <Flex alignItems="start">
            <div>
              <Text className="text-slate-400">Database</Text>
              <Metric className="text-slate-100 mt-2">{health?.database || '...'}</Metric>
            </div>
            <Badge color={getStatusColor(health?.database)}>{health?.database === 'UP' ? 'Healthy' : 'Error'}</Badge>
          </Flex>
          <Text className="text-slate-500 mt-4 text-xs font-mono">CCMP_PRIMARY_DB</Text>
        </Card>

        <Card className="bg-slate-800 border-none ring-0">
          <Flex alignItems="start">
            <div>
              <Text className="text-slate-400">Redis Cache</Text>
              <Metric className="text-slate-100 mt-2">{health?.redis || '...'}</Metric>
            </div>
            <Badge color={getStatusColor(health?.redis)}>{health?.redis === 'UP' ? 'Healthy' : 'Error'}</Badge>
          </Flex>
          <Text className="text-slate-500 mt-4 text-xs font-mono">REDIS_CLUSTER_1</Text>
        </Card>

        <Card className="bg-slate-800 border-none ring-0">
          <Flex alignItems="start">
            <div>
              <Text className="text-slate-400">Object Storage</Text>
              <Metric className="text-slate-100 mt-2">{health?.storage || '...'}</Metric>
            </div>
            <Badge color={getStatusColor(health?.storage)}>{health?.storage === 'UP' ? 'Healthy' : 'Error'}</Badge>
          </Flex>
          <Text className="text-slate-500 mt-4 text-xs font-mono">MINIO_S3_LOCAL</Text>
        </Card>
      </Grid>

      <Card className="bg-slate-800 border-none ring-0 mt-6">
        <Title className="text-slate-200">System Metrics</Title>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-6">
          <div>
            <Text className="text-slate-400">Uptime</Text>
            <Text className="text-xl font-semibold text-slate-100">
              {health ? Math.floor(health.uptimeSeconds / 3600) : '--'} hours
            </Text>
          </div>
          <div>
            <Text className="text-slate-400">Avg Latency</Text>
            <Text className="text-xl font-semibold text-slate-100">
              {health?.latencyMs || '--'} ms
            </Text>
          </div>
          <div>
            <Text className="text-slate-400">Last Checked</Text>
            <Text className="text-xl font-semibold text-slate-100">
              {health ? new Date(health.timestamp).toLocaleTimeString() : '--'}
            </Text>
          </div>
          <div>
            <Text className="text-slate-400">Version</Text>
            <Text className="text-xl font-semibold text-slate-100">v1.24.0-phase5</Text>
          </div>
        </div>
      </Card>
    </div>
  );
}
