import { Routes, Route } from 'react-router-dom';

import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import ArbitrageList from './pages/ArbitrageList';
import ArbitrageDetail from './pages/ArbitrageDetail';
import MarketsList from './pages/MarketsList';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="arbitrage" element={<ArbitrageList />} />
        <Route path="arbitrage/:id" element={<ArbitrageDetail />} />
        <Route path="markets" element={<MarketsList />} />
      </Route>
    </Routes>
  );
}

export default App;
