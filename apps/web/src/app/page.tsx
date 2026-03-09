import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const role = session.user?.role;

  switch (role) {
    case 'AGENT':
    case 'SENIOR_AGENT':
      redirect('/agent-dashboard');
    case 'SUPERVISOR':
    case 'OPERATIONS_MANAGER':
      redirect('/dashboard');
    case 'QA_ANALYST':
      redirect('/review');
    case 'ADMIN':
      redirect('/users');
    default:
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-900">
          <div className="max-w-xl text-center space-y-6 bg-white p-12 rounded-2xl shadow-xl">
            <h1 className="text-5xl font-extrabold tracking-tight">CCMP</h1>
            <p className="text-lg font-medium text-gray-500">
              You have successfully authenticated via Keycloak!
            </p>
            
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-6 mt-6">
              <p className="font-semibold text-lg">System Role Assigned:</p>
              <div className="text-2xl font-black mt-2 tracking-widest">{role || 'UNKNOWN'}</div>
            </div>

            <p className="text-sm text-gray-400 mt-8 break-all">
              Session ID: {session.user?.id}
            </p>
          </div>
        </div>
      );
  }
}

