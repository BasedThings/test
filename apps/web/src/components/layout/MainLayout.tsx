import { Outlet } from 'react-router-dom';

import Header from './Header';
import Sidebar from './Sidebar';
import { useUIStore } from '../../store';

export default function MainLayout() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main
          className={`flex-1 p-6 transition-all duration-200 ${
            sidebarOpen ? 'ml-64' : 'ml-16'
          }`}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
