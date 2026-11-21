import { Check, CreditCard, Sparkles } from 'lucide-react';

interface BillingViewProps {
  availableCreditsMinutes: number;
  totalProjectsCount: number;
  totalClipsCount: number;
  onNavigateCreate: () => void;
}

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    period: 'month',
    active: true,
    summary: 'Browser-local clipping workspace with included AI credit allowance.',
    features: [
      '180 AI analysis minutes allowance',
      'All 10 customizable caption templates',
      'Browser FFmpeg.wasm MP4 export',
      'Local IndexedDB project persistence',
    ],
  },
  {
    name: 'Creator Pro',
    price: '$29',
    period: 'month',
    active: false,
    summary: 'Expanded monthly AI minutes for daily channels and podcasts.',
    features: [
      '600 AI analysis minutes / month',
      'Priority 1080p export presets',
      'Multi-language English, Hindi & Hinglish captions',
      'Custom font & reaction presets',
    ],
  },
  {
    name: 'Studio Team',
    price: '$79',
    period: 'month',
    active: false,
    summary: 'Built for production teams running multiple creator channels.',
    features: [
      '2,000 AI analysis minutes / month',
      'Shared brand caption templates',
      'Live Clipper & archive workflows',
      'Dedicated studio onboarding',
    ],
  },
];

export function BillingView({
  availableCreditsMinutes,
  totalProjectsCount,
  totalClipsCount,
  onNavigateCreate,
}: BillingViewProps) {
  const maxAllowance = 180;
  const usedMinutes = Math.max(0, maxAllowance - availableCreditsMinutes);
  const pctRemaining = Math.min(100, Math.round((availableCreditsMinutes / maxAllowance) * 100));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="pb-5 border-b border-[#E5E5E5]">
        <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#171717]">
          Billing &amp; AI Credits
        </h1>
        <p className="text-sm text-[#737373] mt-1">
          Monitor your local AI analysis balance, review studio plans, and track workspace usage.
        </p>
      </div>

      {/* Credits Summary Card */}
      <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#DC2626]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Active Workspace Allowance</span>
            </div>
            <h2 className="font-display text-2xl font-bold tabular-nums text-[#171717]">
              {availableCreditsMinutes} minutes remaining
            </h2>
            <p className="text-xs text-[#737373]">
              {usedMinutes} min used across {totalProjectsCount}{' '}
              {totalProjectsCount === 1 ? 'project' : 'projects'} and {totalClipsCount}{' '}
              {totalClipsCount === 1 ? 'clip' : 'clips'}.
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateCreate}
            className="px-4 py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            Use Credits in Studio
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-[#F5F5F5] border border-[#E5E5E5] overflow-hidden">
            <div
              className="h-full bg-[#DC2626] rounded-full transition-[width] duration-300"
              style={{ width: `${pctRemaining}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#737373]">
            <span>0 min</span>
            <span>{maxAllowance} min allowance</span>
          </div>
        </div>
      </section>

      {/* Subscription Plan Tiers */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-[#171717]">Studio Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-5 border flex flex-col justify-between gap-5 ${
                plan.active
                  ? 'bg-[#FFFFFF] border-[#DC2626]'
                  : 'bg-[#FFFFFF] border-[#E5E5E5]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold text-[#171717]">
                    {plan.name}
                  </h3>
                  {plan.active && (
                    <span className="text-[11px] font-semibold text-[#DC2626]">Current Plan</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-2xl font-bold tabular-nums text-[#171717]">
                    {plan.price}
                  </span>
                  <span className="text-xs text-[#737373]">/ {plan.period}</span>
                </div>
                <p className="text-xs text-[#737373] leading-relaxed">{plan.summary}</p>
                <ul className="space-y-2 pt-2 border-t border-[#E5E5E5]">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs text-[#171717]">
                      <Check className="h-3.5 w-3.5 text-[#DC2626] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={plan.active}
                onClick={onNavigateCreate}
                className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors ${
                  plan.active
                    ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] cursor-default'
                    : 'bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717]'
                }`}
              >
                {plan.active ? 'Active Workspace Tier' : 'Preview Plan in Studio'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Honest Billing History Section */}
      <section className="rounded-2xl bg-[#FFFFFF] border border-[#E5E5E5] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[#737373]" />
          <h2 className="font-display text-base font-semibold text-[#171717]">Billing History</h2>
        </div>
        <p className="text-xs text-[#737373] leading-relaxed">
          No paid invoices yet. Your workspace is currently running on the Starter browser-local
          studio tier with no card on file.
        </p>
      </section>
    </div>
  );
}
