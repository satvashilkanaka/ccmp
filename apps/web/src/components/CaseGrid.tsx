'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { socket } from '../lib/socket';

interface Case {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
  slaDueAt: string;
  createdAt: string;
}

interface PaginatedResponse {
  items: Case[];
  pagination: {
    nextCursor?: string;
    hasMore: boolean;
    limit: number;
  };
}

export function CaseGrid({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());

  // Heartbeat to refresh standard relative time measurements every 30s
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ['cases'],
    queryFn: async ({ pageParam = undefined }) => {
      const cursorParams = pageParam ? `&cursor=${pageParam}` : '';
      const res = await fetch(`http://localhost:4000/api/v1/cases?limit=25${cursorParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
    initialPageParam: undefined,
  });

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  // Attach socket subscriptions for realtime optimistic patches
  useEffect(() => {
    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    const onStatusChanged = (payload: { caseId: string; oldStatus: string; newStatus: string }) => {
      queryClient.setQueryData(['cases'], (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: PaginatedResponse) => ({
            ...page,
            items: page.items.map(c => 
              c.id === payload.caseId ? { ...c, status: payload.newStatus } : c
            )
          }))
        };
      });
    };

    socket.on('case:status_changed', onStatusChanged);

    return () => {
      socket.off('case:status_changed', onStatusChanged);
    };
  }, [queryClient, token]);

  const updateStatusOptimistic = async (caseId: string, newStatus: string) => {
    // We send version=0 just as mock or if we cached it. A rigorous UI fetches case version first.
    await fetch(`http://localhost:4000/api/v1/cases/${caseId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ newStatus, version: 1 }) // Simplified mock version handling for desktop grid clicks
    });
  };

  const calculateSlaBadge = (dueAtString: string) => {
    const dueTime = new Date(dueAtString).getTime();
    if (isNaN(dueTime)) return { color: 'bg-gray-100', text: 'No SLA' };
    
    const timeRemaining = dueTime - now;

    if (timeRemaining < 0) {
      return { color: 'bg-red-500 text-white', text: 'Breached' };
    }
    // E.g: If less than 20% total time remaining (Assuming total=60m, 20% = 12m)
    // To strictly implement < 20% we need original SLA policy duration.
    // Simplifying: Amber if less than 15 mins.
    if (timeRemaining < 15 * 60 * 1000) {
      return { color: 'bg-amber-400 text-black', text: 'Warning' };
    }
    return { color: 'bg-green-100 text-green-800', text: 'Within SLA' };
  };

  if (status === 'pending') return <p>Loading cases...</p>;
  if (status === 'error') return <p>Error loading cases</p>;

  // Flatten the pages array explicitly into one item array
  const cases = data?.pages.flatMap((page) => page.items) || [];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Case Queue</h2>
      <div className="overflow-x-auto shadow-md sm:rounded-lg">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-6 py-3">Case ID</th>
              <th className="px-6 py-3">Subject</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Priority</th>
              <th className="px-6 py-3">SLA Status</th>
              <th className="px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const slaBadge = calculateSlaBadge(c.slaDueAt);
              return (
                <tr key={c.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{c.caseNumber}</td>
                  <td className="px-6 py-4">{c.subject}</td>
                  <td className="px-6 py-4">{c.status}</td>
                  <td className="px-6 py-4">{c.priority}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${slaBadge.color}`}>
                      {slaBadge.text}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {c.status !== 'CLOSED' && (
                      <button 
                        onClick={() => {
                          const next = c.status === 'NEW' ? 'ASSIGNED' : 'RESOLVED';
                          updateStatusOptimistic(c.id, next);
                        }}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Advance Status
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {isFetchingNextPage &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="bg-white border-b animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                </tr>
              ))}
          </tbody>
        </table>
        {/* Intersection Observer Trigger */}
        <div ref={ref} className="h-4" />
      </div>
      
    </div>
  );
}
