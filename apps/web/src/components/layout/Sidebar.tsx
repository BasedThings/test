import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useUIStore } from '../../store';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/arbitrage', icon: TrendingUp, label: 'Arbitrage' },
  { to: '/markets', icon: BarChart3, label: 'Markets' },
];

export default function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  return (
    <aside
      className={`fixed left-0 top-16 bottom-0 bg-white border-r border-gray-200 transition-all duration-200 z-40 ${
        sidebarOpen ? 'w-64' : 'w-16'
      }`}
    >
      <nav className="p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute bottom-4 right-0 translate-x-1/2 p-1.5 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50"
      >
        {sidebarOpen ? (
          <ChevronLeft className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>
    </aside>
  );
}
