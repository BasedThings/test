import { Activity, RefreshCw, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useHealth } from '../../hooks/useHealth';
import { useUIStore } from '../../store';

export default function Header() {
  const { data: health, isLoading } = useHealth();
  const pollingEnabled = useUIStore((state) => state.pollingEnabled);
  const setPollingEnabled = useUIStore((state) => state.setPollingEnabled);

  const isHealthy = health?.status === 'ok';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            <span className="text-lg font-semibold">Arbitrage Scanner</span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* System Status */}
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`w-2 h-2 rounded-full ${
                isLoading
                  ? 'bg-yellow-400 animate-pulse'
                  : isHealthy
                    ? 'bg-green-400'
                    : 'bg-red-400'
              }`}
            />
            <span className="text-gray-600">
              {isLoading ? 'Connecting...' : isHealthy ? 'Connected' : 'Degraded'}
            </span>
          </div>

          {/* Polling Toggle */}
          <button
            onClick={() => setPollingEnabled(!pollingEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              pollingEnabled
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${pollingEnabled ? 'animate-spin' : ''}`}
              style={{ animationDuration: '3s' }}
            />
            {pollingEnabled ? 'Live' : 'Paused'}
          </button>

          {/* Settings */}
          <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
