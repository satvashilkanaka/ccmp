'use client';

import { useEffect, useState } from 'react';
import { Card, Title, Text, Grid, Metric, Badge, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell } from '@tremor/react';
import { io, Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { fetchServer } from '@/lib/fetch';
import { SearchBar } from '@/components/SearchBar';
import { LogoutButton } from '@/components/LogoutButton';

interface QueueData {
  caseCountsByStatus: Record<string, number>;
  activeCalls: any[];
}

interface SlaData {
  caseId: string;
  status: string;
  pctRemaining: number;
  slaDueAt: string;
}

export default function SupervisorDashboard() {
  const [socket, setSocket] = useState<Socket | null>(null);

  const { data: queueData, refetch: refetchQueue } = useQuery<QueueData>({
    queryKey: ['liveQueue'],
    queryFn: () => fetchServer('/supervisor/queues'),
    refetchInterval: 5000, // Poll every 5s as a fallback for pure DB counts
  });

  const { data: slaData } = useQuery<SlaData[]>({
    queryKey: ['slaHeatmap'],
    queryFn: () => fetchServer('/supervisor/sla/heatmap'),
    refetchInterval: 10000,
  });

  useEffect(() => {
    // Socket.io for immediate real-time call center presence
    const newSocket = io(process.env.NEXT_PUBLIC_WSS_URL || 'ws://localhost:4000', {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('Supervisor WebRTC/Socket connected');
    });

    newSocket.on('queue:update', () => {
      refetchQueue();
    });

    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
    };
  }, [refetchQueue]);

  const stats = [
    { name: 'Unassigned Cases', value: queueData?.caseCountsByStatus?.['NEW'] || 0, color: 'blue' },
    { name: 'Agents Active (Calls)', value: queueData?.activeCalls?.length || 0, color: 'emerald' },
    { name: 'Escalated Cases', value: queueData?.caseCountsByStatus?.['ESCALATED'] || 0, color: 'rose' },
  ];

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <Title>Live Supervisor Dashboard</Title>
          <Text>Real-time overview of contact center queues, agent state, and SLA health.</Text>
        </div>
        <div className="flex items-center space-x-4">
          <div className="w-96">
            <SearchBar />
          </div>
          <LogoutButton />
        </div>
      </div>

      <Grid numItemsSm={2} numItemsLg={3} className="gap-6 mt-6">
        {stats.map((item) => (
          <Card key={item.name} decoration="top" decorationColor={item.color as any}>
            <Text>{item.name}</Text>
            <Metric>{item.value}</Metric>
          </Card>
        ))}
      </Grid>

      <div className="mt-8">
        <Title>SLA Heatmap Grid</Title>
        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mt-4">
          {slaData?.map((sla) => (
            <Card key={sla.caseId} className={`border-l-4 ${sla.pctRemaining < 20 ? 'border-red-500 bg-red-50' : sla.pctRemaining < 50 ? 'border-amber-500 bg-amber-50' : 'border-emerald-500 bg-emerald-50'}`}>
              <Text className="truncate">Case {sla.caseId}</Text>
              <Text className="mt-2 text-xs">Remaining</Text>
              <Metric className="truncate">{sla.pctRemaining.toFixed(1)}%</Metric>
              <Text className="mt-2 text-xs">Due: {new Date(sla.slaDueAt).toLocaleTimeString()}</Text>
            </Card>
          ))}
          {(!slaData || slaData.length === 0) && <Text className="mt-4 italic">No active SLAs to monitor.</Text>}
        </Grid>
      </div>

      <div className="mt-8">
        <Title>Active Call Queue (Redis)</Title>
        <Card className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>UUID</TableHeaderCell>
                <TableHeaderCell>Agent ID</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Duration</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queueData?.activeCalls?.map((call, idx) => {
                const elapsedMin = call.answeredAt ? Math.round((Date.now() - parseInt(call.answeredAt)) / 60000) : 0;
                return (
                <TableRow key={idx}>
                  <TableCell>{call.uuid}</TableCell>
                  <TableCell>{call.agentId || 'Routing...'}</TableCell>
                  <TableCell>
                    <Badge color={call.status === 'ANSWERED' ? 'emerald' : 'amber'}>{call.status}</Badge>
                  </TableCell>
                  <TableCell>{elapsedMin} mins</TableCell>
                </TableRow>
              )})}
              {(!queueData?.activeCalls || queueData.activeCalls.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">No active calls right now</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </main>
  );
}
