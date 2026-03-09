'use client';

import { Card, Title, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge, Button } from '@tremor/react';
import { useQuery } from '@tanstack/react-query';

export default function SlaPoliciesPage() {
  const { data: policies, isLoading } = useQuery({
    queryKey: ['admin', 'sla-policies'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/sla-policies');
      if (!res.ok) return [];
      return res.json();
    },
    initialData: [],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title className="text-slate-100 pb-1">SLA Policies</Title>
          <Text className="text-slate-400">Define response and resolution targets based on case priority and channel.</Text>
        </div>
        <Button size="sm" color="indigo">Add Policy</Button>
      </div>

      <Card className="bg-slate-800 border-none ring-0 shadow-xl">
        <Table>
          <TableHead>
            <TableRow className="border-slate-700">
              <TableHeaderCell className="text-slate-300">Policy Name</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Priority</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Channel</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Response (min)</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Resolution (min)</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Status</TableHeaderCell>
              <TableHeaderCell className="text-right text-slate-300">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {policies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500 italic">
                  No SLA policies found.
                </TableCell>
              </TableRow>
            ) : (
              policies.map((policy: any) => (
                <TableRow key={policy.id} className="border-slate-700 hover:bg-slate-700/50 transition-colors">
                  <TableCell className="text-slate-200 font-medium">{policy.name}</TableCell>
                  <TableCell>
                    <Badge color={policy.priority === 'CRITICAL' ? 'rose' : 'blue'}>
                      {policy.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-400 font-mono">{policy.channel}</TableCell>
                  <TableCell className="text-slate-300">{policy.responseTimeMinutes}</TableCell>
                  <TableCell className="text-slate-300">{policy.resolutionTimeMinutes}</TableCell>
                  <TableCell>
                    <Badge color={policy.isActive ? 'emerald' : 'rose'} variant="soft">
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="xs" variant="secondary" color="slate">Edit</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
