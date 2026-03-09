'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { notFound } from 'next/navigation';
import { Card, Title, Grid, Col, Text, Flex, Metric } from '@tremor/react';
import {
  ResponsiveContainer,
} from 'recharts';
import dynamic from 'next/dynamic';

const CsatLineChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.CsatLineChart), { ssr: false });
const ChannelPieChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.ChannelPieChart), { ssr: false });
const PriorityBarChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.PriorityBarChart), { ssr: false });
const ResolutionBarChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.ResolutionBarChart), { ssr: false });
const AgentPerformanceChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.AgentPerformanceChart), { ssr: false });
const SlaBreachLineChart = dynamic(() => import('../../../components/RechartsCharts').then(m => m.SlaBreachLineChart), { ssr: false });


type ReportData = {
  agentPerformance: any[];
  slaBreachRate: any[];
  volumeByChannel: any[];
  volumeByPriority: any[];
  resolutionTime: any[];
  csatScores: any[];
  queueBacklog: any[];
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ReportsDashboard() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Protect route
  if (status === 'loading') return <div className="p-8 text-white">Loading...</div>;
  if (!session?.user) return null;

  const role = session.user.role;
  if (role !== 'SUPERVISOR' && role !== 'OPERATIONS_MANAGER' && role !== 'ADMIN') {
    notFound();
  }

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        // Using Promise.all to fetch all 7 endpoints asynchronously
        const endpoints = [
          'agent_performance',
          'sla_breach_rate',
          'volume_by_channel',
          'volume_by_priority',
          'resolution_time',
          'csat_scores',
          'queue_backlog',
        ];

        const [
          agentPerformance,
          slaBreachRate,
          volumeByChannel,
          volumeByPriority,
          resolutionTime,
          csatScores,
          queueBacklog,
        ] = await Promise.all(
          endpoints.map((ep) =>
            fetch(`/api/v1/reports/${ep}`, {
              headers: { Authorization: `Bearer ${session.accessToken}` },
            }).then((res) => {
              if (!res.ok) throw new Error(`Failed to fetch ${ep}`);
              return res.json();
            })
          )
        );

        setData({
          agentPerformance,
          slaBreachRate,
          volumeByChannel,
          volumeByPriority,
          resolutionTime,
          csatScores,
          queueBacklog,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [session]);

  if (loading) return <div className="p-8 text-white">Loading metrics...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!data) return null;

  const totalBacklog = data.queueBacklog.reduce((acc, curr) => acc + curr.volume, 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <Flex alignItems="center" justifyContent="between">
        <div>
          <Title className="text-3xl text-white font-bold tracking-tight">Analytics Command Center</Title>
          <Text className="text-gray-400 mt-1">Real-time intelligence from read-replica aggregations</Text>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => window.open(`/api/v1/reports/export?type=sla_breach_rate&format=csv`, '_blank')}
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-md hover:bg-slate-700 transition"
          >
            Export SLA CSV
          </button>
          <button
            onClick={() => window.open(`/api/v1/reports/export?type=agent_performance&format=csv`, '_blank')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition"
          >
            Export Agents CSV
          </button>
        </div>
      </Flex>

      <Grid numItemsSm={1} numItemsLg={3} className="gap-6">
        <Col numColSpan={1} numColSpanLg={2}>
          <Card className="bg-slate-900 border-slate-800 h-96">
            <Title className="text-white mb-4">CSAT Scores Over Time</Title>
            <CsatLineChart data={data.csatScores} />
          </Card>
        </Col>

        <Card className="bg-slate-900 border-slate-800 flex flex-col justify-center items-center h-96">
          <Text className="text-gray-400">Total Global Backlog</Text>
          <Metric className="text-6xl text-white mt-4">{totalBacklog}</Metric>
          <Text className="text-gray-500 mt-4">Across {data.queueBacklog.length} queues</Text>
        </Card>

        {/* Channel Volume */}
        <Card className="bg-slate-900 border-slate-800 h-80">
          <Title className="text-white mb-4">Volume by Channel</Title>
          <ChannelPieChart data={data.volumeByChannel} />
        </Card>

        {/* Priority Volume */}
        <Card className="bg-slate-900 border-slate-800 h-80">
          <Title className="text-white mb-4">Volume by Priority</Title>
          <PriorityBarChart data={data.volumeByPriority} />
        </Card>

        {/* Resolution Time Buckets */}
        <Card className="bg-slate-900 border-slate-800 h-80">
          <Title className="text-white mb-4">Resolution Distribution</Title>
          <ResolutionBarChart data={data.resolutionTime} />
        </Card>

        <Col numColSpan={1} numColSpanLg={3}>
          <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
            {/* Agent Performance */}
            <Card className="bg-slate-900 border-slate-800 h-96">
              <Title className="text-white mb-4">Agent Performance</Title>
              <AgentPerformanceChart data={data.agentPerformance} />
            </Card>

            {/* SLA Breach Rate */}
            <Card className="bg-slate-900 border-slate-800 h-96">
              <Title className="text-white mb-4">SLA Breach Rate (%)</Title>
              <SlaBreachLineChart data={data.slaBreachRate} />
            </Card>
          </Grid>
        </Col>
      </Grid>
    </div>
  );
}
