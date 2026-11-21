interface BrandMarkProps {
  compact?: boolean;
  size?: 'sm' | 'md';
}

export function BrandMark({ compact = false, size = 'md' }: BrandMarkProps) {
  const iconBox = size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-lg';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`relative flex ${iconBox} items-center justify-center bg-[#DC2626] shadow-xs shrink-0`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none">
          <path
            d="M5 6.5C5 5.67 5.67 5 6.5 5H10.5L12.5 8H17.5C18.33 8 19 8.67 19 9.5V17.5C19 18.33 18.33 19 17.5 19H6.5C5.67 19 5 18.33 5 17.5V6.5Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path d="M10.5 11L15 13.5L10.5 16V11Z" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-[15px] font-bold tracking-tight text-[#171717] whitespace-nowrap">
          ClipForge <span className="text-[#DC2626]">AI</span>
        </span>
      )}
    </span>
  );
}
