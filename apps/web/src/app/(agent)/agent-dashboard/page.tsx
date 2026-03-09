import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AgentDashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'AGENT') {
    redirect('/');
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1 flex flex-col p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Agent Dashboard</h1>
          <LogoutButton />
        </div>
        <p className="mt-2 text-gray-600">
          Welcome back, {session.user.id}. Here are your assigned cases.
        </p>
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">Active Cases</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">12</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">SLA Warnings</h3>
            <p className="text-3xl font-bold text-yellow-600 mt-2">2</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-500">CSAT Score</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">4.8</p>
          </div>
        </div>
      </div>
    </div>
  );
}
