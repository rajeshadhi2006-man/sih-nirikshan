import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
  indicator?: 'pulse' | 'dot';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = 'blue',
  indicator,
}) => {
  const variantStyles = {
    blue: {
      border: 'border-blue-500/20 hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 text-blue-400',
      accent: 'text-blue-400',
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      accent: 'text-emerald-400',
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-400',
      accent: 'text-amber-400',
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-rose-500/10 text-rose-400',
      accent: 'text-rose-400',
    },
    slate: {
      border: 'border-slate-700/50 hover:border-slate-600',
      iconBg: 'bg-slate-800 text-slate-300',
      accent: 'text-slate-300',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className={`bg-slate-900/80 border ${style.border} rounded-xl p-4 transition-all duration-200 shadow-sm relative overflow-hidden group`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase block">
            {title}
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white tracking-tight font-mono">
              {value}
            </span>
            {indicator === 'pulse' && (
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-400 leading-tight">{subtitle}</p>}
        </div>

        <div className={`p-2.5 rounded-lg ${style.iconBg} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {trend && (
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center text-[11px]">
          <span
            className={`font-semibold ${
              trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {trend.value}
          </span>
          <span className="text-slate-500 ml-1.5">vs last inspection cycle</span>
        </div>
      )}
    </div>
  );
};
