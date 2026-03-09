'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ─── CSAT Line Chart ────────────────────────────────────────────────────────

export function CsatLineChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" domain={[0, 5]} />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', color: '#fff' }} />
        <Legend />
        <Line type="monotone" dataKey="averageScore" stroke="#3b82f6" strokeWidth={3} activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Channel Pie Chart ──────────────────────────────────────────────────────

export function ChannelPieChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="volume"
          nameKey="channel"
        >
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Priority Bar Chart ─────────────────────────────────────────────────────

export function PriorityBarChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis dataKey="priority" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} cursor={{ fill: '#334155' }} />
        <Bar dataKey="volume" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Resolution Time Distribution (horizontal) ──────────────────────────────

export function ResolutionBarChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" stroke="#94a3b8" />
        <YAxis dataKey="bucket" type="category" stroke="#94a3b8" width={80} />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} cursor={{ fill: '#334155' }} />
        <Bar dataKey="volume" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Agent Performance Stacked Bar ─────────────────────────────────────────

export function AgentPerformanceChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="agentName" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} cursor={{ fill: '#334155' }} />
        <Legend />
        <Bar dataKey="resolvedCases" stackId="a" fill="#3b82f6" name="Resolved" />
        <Bar dataKey="breachedCases" stackId="a" fill="#ef4444" name="Breached" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── SLA Breach Rate Line Chart ─────────────────────────────────────────────

export function SlaBreachLineChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="date" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" domain={[0, 100]} />
        <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
        <Legend />
        <Line type="monotone" dataKey="breachRatePct" stroke="#ef4444" strokeWidth={3} name="Breach %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
