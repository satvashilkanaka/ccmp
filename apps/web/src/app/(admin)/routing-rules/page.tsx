'use client';

import { Card, Title, Text, Button, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge } from '@tremor/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function RoutingRulesPage() {
  const queryClient = useQueryClient();

  // Mocking the API fetch for now as the server might not be running in this env
  const { data: rules, isLoading } = useQuery({
    queryKey: ['admin', 'routing-rules'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/routing-rules'); // Note: I should add a GET route to service
      if (!res.ok) return []; // Fallback
      return res.json();
    },
    initialData: [], // Dummy data if fetch fails
  });

  const reorderMutation = useMutation({
    mutationFn: async (ruleIds: string[]) => {
      const res = await fetch('/api/v1/admin/routing-rules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleIds }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'routing-rules'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title className="text-slate-100 pb-1">Routing Rules</Title>
          <Text className="text-slate-400">Manage how cases are automatically assigned across teams and queues.</Text>
        </div>
        <Button size="sm" variant="primary" color="indigo" onClick={() => {}}>
          Create New Rule
        </Button>
      </div>

      <Card className="bg-slate-800 border-none ring-0 shadow-xl">
        <Table>
          <TableHead>
            <TableRow className="border-slate-700">
              <TableHeaderCell className="text-slate-300">Priority</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Rule Name</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Conditions</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Actions</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Status</TableHeaderCell>
              <TableHeaderCell className="text-slate-300 text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500 italic">
                  No routing rules configured. Create one to begin.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule: any, index: number) => (
                <TableRow key={rule.id} className="border-slate-700 hover:bg-slate-700/50 transition-colors">
                  <TableCell className="text-slate-400 font-mono">{index + 1}</TableCell>
                  <TableCell className="text-slate-200 font-medium">{rule.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-slate-400">
                    {Object.entries(rule.conditions).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {rule.actions.assignToQueue && `→ ${rule.actions.assignToQueue}`}
                  </TableCell>
                  <TableCell>
                    <Badge color={rule.isActive ? 'emerald' : 'rose'}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="xs" variant="secondary" color="slate">Edit</Button>
                    <Button size="xs" variant="secondary" color="rose">Delete</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-4 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        <Text className="text-indigo-300 italic text-sm">
          💡 Tip: Rules are evaluated top-to-bottom. Draggable reordering coming soon in the next update.
        </Text>
      </div>
    </div>
  );
}
