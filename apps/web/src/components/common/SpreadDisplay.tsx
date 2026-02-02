import { formatSpread, formatCurrency } from '../../utils/formatters';

interface SpreadDisplayProps {
  netSpread: number;
  grossSpread?: number;
  showGross?: boolean;
}

export default function SpreadDisplay({
  netSpread,
  grossSpread,
  showGross = false,
}: SpreadDisplayProps) {
  const isPositive = netSpread > 0;

  return (
    <div className="flex flex-col">
      <span
        className={`text-lg font-semibold font-mono-nums ${
          isPositive ? 'price-positive' : 'price-negative'
        }`}
      >
        {formatSpread(netSpread)}
      </span>
      {showGross && grossSpread !== undefined && (
        <span className="text-xs text-gray-500">
          Gross: {formatCurrency(grossSpread)}
        </span>
      )}
    </div>
  );
}
