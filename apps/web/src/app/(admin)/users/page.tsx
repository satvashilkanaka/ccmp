'use client';

import { Card, Title, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge, Button, Select, SelectItem } from '@tremor/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function UserManagementPage() {
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/users');
      if (!res.ok) return { items: [] };
      return res.json();
    },
    initialData: { items: [] },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/v1/admin/users/${userId}`, { method: 'DELETE' });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title className="text-slate-100 pb-1">User Management</Title>
          <Text className="text-slate-400">Manage platform users, roles, and account statuses.</Text>
        </div>
        <Button size="sm" color="indigo">Invite User</Button>
      </div>

      <Card className="bg-slate-800 border-none ring-0 shadow-xl">
        <Table>
          <TableHead>
            <TableRow className="border-slate-700">
              <TableHeaderCell className="text-slate-300">Name</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Email</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Role</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">Status</TableHeaderCell>
              <TableHeaderCell className="text-right text-slate-300">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.items.map((user: any) => (
              <TableRow key={user.id} className="border-slate-700 hover:bg-slate-700/50 transition-colors">
                <TableCell className="text-slate-100 font-medium">
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell className="text-slate-400">{user.email}</TableCell>
                <TableCell>
                  <Select value={user.role} onValueChange={() => {}} className="max-w-[150px] bg-slate-900 border-slate-700 text-slate-200">
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge color={user.isActive ? 'emerald' : 'rose'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    size="xs" 
                    variant="secondary" 
                    color="rose"
                    onClick={() => deactivateMutation.mutate(user.id)}
                    disabled={!user.isActive}
                  >
                    Deactivate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
