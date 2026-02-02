export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function formatSpread(spread: number): string {
  return `${(spread * 100).toFixed(2)}%`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatConfidence(score: number): string {
  return `${(score * 100).toFixed(0)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatDataAge(ageMs: number): string {
  if (ageMs < 1000) return `${ageMs}ms`;
  if (ageMs < 60000) return `${(ageMs / 1000).toFixed(1)}s`;
  return `${(ageMs / 60000).toFixed(1)}m`;
}

export function getConfidenceClass(score: number): string {
  if (score >= 0.8) return 'confidence-high';
  if (score >= 0.5) return 'confidence-medium';
  return 'confidence-low';
}

export function getPlatformClass(platform: string): string {
  return platform === 'POLYMARKET' ? 'badge-polymarket' : 'badge-kalshi';
}
