import { formatConfidence, getConfidenceClass } from '../../utils/formatters';

interface ConfidenceBadgeProps {
  score: number;
  showLabel?: boolean;
}

export default function ConfidenceBadge({ score, showLabel = true }: ConfidenceBadgeProps) {
  const confidenceClass = getConfidenceClass(score);

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            score >= 0.8
              ? 'bg-profit-500'
              : score >= 0.5
                ? 'bg-yellow-500'
                : 'bg-loss-500'
          }`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-sm font-medium ${confidenceClass}`}>
          {formatConfidence(score)}
        </span>
      )}
    </div>
  );
}
