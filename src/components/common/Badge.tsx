import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Radio,
  Shield,
} from 'lucide-react';
import { VerificationState, GeofenceStatus, UserStatus, AlertSeverity } from '../../types';

interface StatusBadgeProps {
  status: UserStatus | GeofenceStatus | VerificationState | AlertSeverity | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const isSmall = size === 'sm';
  const sizeClasses = isSmall ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  switch (status) {
    case 'ACTIVE':
    case 'PRESENT':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
          ACTIVE
        </span>
      );

    case 'INSIDE':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}
        >
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
          INSIDE
        </span>
      );

    case 'OUTSIDE':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/40 animate-pulse ${sizeClasses}`}
        >
          <AlertCircle className="w-3 h-3 mr-1 text-rose-400" />
          OUTSIDE
        </span>
      );

    case 'GPS_UNAVAILABLE':
    case 'GPS UNAVAILABLE':
    case 'UNKNOWN':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 ${sizeClasses}`}
        >
          <AlertCircle className="w-3 h-3 mr-1 text-amber-400" />
          GPS UNAVAILABLE
        </span>
      );

    case 'FACE_MATCH':
    case 'FACE MATCH':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}
        >
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
          FACE MATCH
        </span>
      );

    case 'FACE_MISMATCH':
    case 'FACE MISMATCH':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/40 ${sizeClasses}`}
        >
          <XCircle className="w-3 h-3 mr-1 text-rose-400" />
          FACE MISMATCH
        </span>
      );

    case 'EXITED':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 ${sizeClasses}`}
        >
          <Clock className="w-3 h-3 mr-1 text-amber-400" />
          EXITED
        </span>
      );

    case 'VERIFIED':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ${sizeClasses}`}
        >
          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
          VERIFIED
        </span>
      );

    case 'FAILED':
    case 'ABSENT':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 ${sizeClasses}`}
        >
          <XCircle className="w-3 h-3 mr-1" />
          FAILED
        </span>
      );

    case 'REVIEW_REQUIRED':
    case 'REVIEW':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 ${sizeClasses}`}
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          REVIEW REQUIRED
        </span>
      );

    case 'PENDING':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/30 ${sizeClasses}`}
        >
          <Clock className="w-3 h-3 mr-1" />
          PENDING
        </span>
      );

    case 'STALE':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 ${sizeClasses}`}
        >
          <Radio className="w-3 h-3 mr-1" />
          STALE LOCATION
        </span>
      );

    case 'OFFLINE':
    case 'SUSPENDED':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5" />
          OFFLINE
        </span>
      );

    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50 ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-ping" />
          CRITICAL
        </span>
      );

    case 'WARNING':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 ${sizeClasses}`}
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          WARNING
        </span>
      );

    case 'INFO':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 ${sizeClasses}`}
        >
          <Shield className="w-3 h-3 mr-1" />
          INFO
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700 ${sizeClasses}`}
        >
          {status}
        </span>
      );
  }
};
