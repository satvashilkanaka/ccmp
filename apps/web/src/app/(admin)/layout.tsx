import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const navItems = [
    { name: 'Routing Rules', href: '/routing-rules' },
    { name: 'SLA Policies', href: '/sla-policies' },
    { name: 'User Management', href: '/users' },
    { name: 'System Health', href: '/system' },
  ];

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 p-6 flex flex-col">
        <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-8">
          Admin Console
        </div>
        <nav className="space-y-2 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="pt-6 border-t border-slate-800">
          <Link href="/" className="text-slate-400 hover:text-white transition-colors">
            ← Back to Agent View
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
