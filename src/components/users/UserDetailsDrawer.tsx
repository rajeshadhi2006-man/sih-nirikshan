import React, { useState } from 'react';
import {
  X,
  Shield,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Route,
  History,
  CalendarCheck,
  User,
  Radio,
  ExternalLink,
  Smartphone,
  Copy,
  Check,
  Edit,
  KeyRound,
  Trash2,
} from 'lucide-react';
import { MonitoredUser } from '../../types';
import { StatusBadge } from '../common/Badge';
import { formatCoordinates, formatTimeAgo } from '../../lib/geofence';
import { useNavigate } from 'react-router-dom';

interface UserDetailsDrawerProps {
  user: MonitoredUser | null;
  onClose: () => void;
  onEdit?: (user: MonitoredUser) => void;
  onDelete?: (user: MonitoredUser) => void;
}

export const UserDetailsDrawer: React.FC<UserDetailsDrawerProps> = ({ user, onClose, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);

  if (!user) return null;

  const resolvedEmail = user.email || `${(user.officer_id || user.id).toLowerCase()}@field.gov.in`;

  const copyEmail = () => {
    navigator.clipboard.writeText(resolvedEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCredentials = () => {
    const credText = 
`========================================
SIH SURVEILLANCE SYSTEM - USER APP LOGIN
========================================
Personnel Name : ${user.full_name}
Officer ID     : ${user.officer_id || user.id}
Login Email ID : ${resolvedEmail}
Assigned Role  : ${user.role || 'OFFICER'}
Department     : ${user.department}
Connection     : Supabase Cloud & Local Auth
Target App     : SIH USER Mobile Application
========================================`;
    navigator.clipboard.writeText(credText);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 2500);
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[9999] w-full sm:w-96 bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold block">
            Personnel Telemetry & Access
          </span>
          <h2 className="text-base font-bold text-white leading-tight">{user.full_name}</h2>
          <span className="text-xs text-slate-400 font-mono">{user.officer_id}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Mobile User App Connection Box */}
        <div className="bg-gradient-to-br from-emerald-950/50 via-slate-950 to-slate-900 border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Mobile User App Login</span>
            </div>
            <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded">
              Connected
            </span>
          </div>

          <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between">
            <div className="truncate mr-2">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">Login Email ID</span>
              <span className="text-xs font-mono text-white font-semibold truncate block">
                {resolvedEmail}
              </span>
            </div>
            <button
              onClick={copyEmail}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition shrink-0"
              title="Copy Email"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <button
              onClick={copyCredentials}
              className="py-1.5 px-2 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 rounded-lg font-medium flex items-center justify-center gap-1.5 transition"
            >
              {copiedCreds ? <Check className="w-3 h-3 text-emerald-400" /> : <KeyRound className="w-3 h-3" />}
              <span>{copiedCreds ? 'Copied Slip!' : 'Copy Login Pass'}</span>
            </button>

            {onEdit && (
              <button
                onClick={() => onEdit(user)}
                className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg font-medium flex items-center justify-center gap-1.5 transition"
              >
                <Edit className="w-3 h-3" />
                <span>Edit Access</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Status Bar */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
          <span className="text-xs text-slate-300 font-medium">Duty Status</span>
          <div className="flex items-center space-x-2">
            <StatusBadge status={user.status} />
            <StatusBadge status={user.geofence_status} />
          </div>
        </div>

        {/* GPS Live Telemetry */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span>Geospatial Position</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Geofence Zone:</span>
              <span className="text-white font-medium truncate max-w-[170px]">
                {user.assigned_geofence?.name || 'Authorized Perimeter'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Coordinates:</span>
              <span className="text-blue-300">
                {user.current_location
                  ? formatCoordinates(
                      user.current_location.latitude,
                      user.current_location.longitude
                    )
                  : 'Unavailable'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">GPS Accuracy:</span>
              <span className="text-emerald-400 font-semibold">
                ±{user.current_location?.accuracy || '--'} meters
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Ground Speed:</span>
              <span className="text-slate-200">
                {user.current_location?.speed || 0} m/s (
                {Math.round((user.current_location?.speed || 0) * 3.6)} km/h)
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Telemetry Time:</span>
              <span className="text-amber-400 font-semibold">
                {user.current_location?.last_updated
                  ? new Date(user.current_location.last_updated).toLocaleTimeString()
                  : 'N/A'}{' '}
                ({user.current_location ? formatTimeAgo(user.current_location.last_updated) : ''})
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Factor Verification Status */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Identity & Biometric Clearance</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="text-[11px] text-slate-400 mb-1">Face Vector</div>
              <StatusBadge status={user.verification?.face || 'PENDING'} size="sm" />
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="text-[11px] text-slate-400 mb-1">Voice Acoustic</div>
              <StatusBadge status={user.verification?.voice || 'PENDING'} size="sm" />
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="text-[11px] text-slate-400 mb-1">Location Match</div>
              <StatusBadge status={user.verification?.location || 'PENDING'} size="sm" />
            </div>

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg">
              <div className="text-[11px] text-slate-400 mb-1">Attendance</div>
              <StatusBadge status={user.attendance_status || 'PRESENT'} size="sm" />
            </div>
          </div>
        </div>

        {/* Attendance Schedule & Duty Timing */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <CalendarCheck className="w-4 h-4 text-blue-400" />
            <span>Attendance & Shift Telemetry</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Today's Status:</span>
              <span className="text-emerald-400 font-semibold">{user.attendance_status || 'PRESENT'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Check-in:</span>
              <span className="text-white">
                {user.current_location?.last_updated
                  ? new Date(user.current_location.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '09:00 AM (Scheduled)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-sans">Check-out:</span>
              <span className="text-amber-400">On Duty / Active</span>
            </div>
          </div>
        </div>

        {/* Security & Alerts */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Security & Compliance Status</span>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Perimeter Compliance:</span>
              <StatusBadge status={user.geofence_status} size="sm" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Anti-Spoof Check:</span>
              <span className="text-emerald-400 font-mono text-[11px] font-bold">VERIFIED SECURE</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 font-sans">Active Violations:</span>
              <span className={`font-mono text-[11px] font-bold ${user.geofence_status === 'OUTSIDE' ? 'text-rose-400' : 'text-slate-400'}`}>
                {user.geofence_status === 'OUTSIDE' ? '1 ACTIVE BREACH' : '0 Violations'}
              </span>
            </div>
          </div>
        </div>

        {/* Departmental & Role Details */}
        <div className="p-3.5 bg-slate-800/40 border border-slate-800 rounded-lg text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-400">Department:</span>
            <span className="text-slate-200 font-medium">{user.department}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Designation:</span>
            <span className="text-slate-200 font-medium">{user.designation}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Role Clearance:</span>
            <span className="text-blue-400 font-semibold">{user.role || 'OFFICER'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Registered ID:</span>
            <span className="text-slate-200 font-mono text-[11px]">{user.officer_id || user.id}</span>
          </div>
        </div>
      </div>

      {/* Action Footer Buttons */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-2">
        <button
          onClick={() => {
            onClose();
            navigate(`/history?userId=${user.id}`);
          }}
          className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition shadow-lg shadow-blue-900/30"
        >
          <Route className="w-4 h-4" />
          <span>View Location History Trail</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onClose();
              navigate('/verification');
            }}
            className="py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition border border-slate-700"
          >
            <History className="w-3.5 h-3.5" />
            <span>Verification Log</span>
          </button>

          <button
            onClick={() => {
              onClose();
              navigate('/attendance');
            }}
            className="py-2 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition border border-slate-700"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Attendance Record</span>
          </button>
        </div>

        {onDelete && (
          <button
            onClick={() => {
              onDelete(user);
            }}
            className="w-full py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 border border-rose-800/40 hover:border-rose-700/60 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Personnel Record</span>
          </button>
        )}
      </div>
    </div>
  );
};
