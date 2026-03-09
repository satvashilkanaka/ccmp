'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-lg">
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">CCMP</h2>
          <p className="text-sm text-gray-600 font-medium">Contact Center Management Platform</p>
        </div>
        <div className="mt-8">
          <button
            onClick={() => signIn('keycloak', { callbackUrl: '/' })}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all shadow-md"
          >
            Sign in with Keycloak
          </button>
        </div>
      </div>
    </div>
  );
}
