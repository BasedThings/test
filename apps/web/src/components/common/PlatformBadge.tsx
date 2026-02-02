import type { Platform } from '@arbitrage/shared-types';

interface PlatformBadgeProps {
  platform: Platform;
}

export default function PlatformBadge({ platform }: PlatformBadgeProps) {
  const isPolymarket = platform === 'POLYMARKET';

  return (
    <span
      className={`badge ${
        isPolymarket ? 'badge-polymarket' : 'badge-kalshi'
      }`}
    >
      {isPolymarket ? 'Polymarket' : 'Kalshi'}
    </span>
  );
}
