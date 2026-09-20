import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Filter,
  Eye,
  MapPin,
  Check,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { Alert, AlertSeverity } from '../types';
import { StatusBadge } from '../components/common/Badge';
import { useNavigate } from 'react-router-dom';

export const Alerts: React.FC = () => {
  const navigate = useNavigate();
  const { alerts, acknowledgeAlert, resolveAlert, clearAllAlerts, deleteAllAlerts, deleteAlert } =
    useNotifications();
  const { user } = useAuth();

  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>(
    'ALL'
  );

  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const handleConfirmDeleteAll = async () => {
    try {
      setIsDeleting(true);
      await deleteAllAlerts('ALL');
      setNotification({
        type: 'success',
        message: 'All incident alerts have been permanently deleted from the database.',
      });
      setIsDeleteAllModalOpen(false);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to delete all alerts.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (alertId: string) => {
    try {
      await deleteAlert(alertId);
      setNotification({
        type: 'success',
        message: 'Incident alert deleted successfully.',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to delete alert.',
      });
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;
    const matchesStatus = statusFilter === 'ALL' || alert.status === statusFilter;
    return matchesSeverity && matchesStatus;
  });

  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE')
    .length;
  const warningCount = alerts.filter((a) => a.severity === 'WARNING' && a.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            Operational Incident & Alert Dispatch Center
          </h1>
          <p className="text-xs text-slate-400">
            Automated perimeter violations, acoustic/facial biometric flags, and device telemetry
            anomalies.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsDeleteAllModalOpen(true)}
            disabled={alerts.length === 0}
            className="px-3.5 py-1.5 bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 hover:text-white rounded-lg text-xs font-semibold transition border border-rose-800/60 flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none hover:scale-[1.02]"
            title="Permanently delete all incident alerts"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Delete All</span>
          </button>

          <button
            onClick={clearAllAlerts}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700"
          >
            Mark All as Resolved
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
          } animate-in fade-in duration-200 shadow-lg`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Alert Severity Quick Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
              Critical Breaches
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">{criticalCount}</div>
            <span className="text-[10px] text-rose-300/80">Immediate Command Action Required</span>
          </div>
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Warnings / Signals
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">{warningCount}</div>
            <span className="text-[10px] text-amber-300/80">
              Degraded GNSS / Signal Heartbeats
            </span>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Incident Ledger
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">{alerts.length}</div>
            <span className="text-[10px] text-slate-400">Includes Cleared Audit Entries</span>
          </div>
          <div className="p-3 bg-slate-800 text-blue-400 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
        <div className="flex items-center space-x-2">
          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                severityFilter === sev
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
            <option value="RESOLVED">RESOLVED</option>
          </select>
        </div>
      </div>

      {/* Alerts Stream List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl text-slate-500 text-xs">
            No incident triggers matching the selected filters.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                alert.status === 'RESOLVED'
                  ? 'bg-slate-900/40 border-slate-800 opacity-60'
                  : alert.severity === 'CRITICAL'
                  ? 'bg-rose-950/40 border-rose-700/80 shadow-lg shadow-rose-950/20'
                  : alert.severity === 'WARNING'
                  ? 'bg-amber-950/40 border-amber-700/80 shadow-lg shadow-amber-950/20'
                  : 'bg-blue-950/40 border-blue-700/80'
              }`}
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={alert.severity} size="sm" />
                  <span className="text-xs font-mono bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                    {alert.alert_type}
                  </span>
                  <span className="text-xs font-bold text-white">{alert.title}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(alert.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{alert.description}</p>

                <div className="flex items-center space-x-4 text-[11px] text-slate-400 pt-1">
                  {alert.user_name && (
                    <span>
                      Officer: <strong className="text-white">{alert.user_name}</strong> (
                      {alert.officer_id})
                    </span>
                  )}
                  {alert.acknowledged_by && (
                    <span className="text-emerald-400">
                      Acknowledged by: {alert.acknowledged_by}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0">
                {alert.user_id && (
                  <button
                    onClick={() => navigate(`/monitor?user=${alert.user_id}`)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition shadow"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>View Map</span>
                  </button>
                )}

                {alert.status === 'ACTIVE' && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id, user?.full_name)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition border border-slate-700"
                  >
                    Acknowledge
                  </button>
                )}

                {alert.status !== 'RESOLVED' && (
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-800 rounded-lg text-xs font-semibold transition"
                  >
                    Resolve
                  </button>
                )}

                {/* Delete Alert Button */}
                <button
                  onClick={() => handleDeleteSingle(alert.id)}
                  className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-400 rounded-lg transition border border-transparent hover:border-rose-500/40"
                  title="Delete this incident alert"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete All Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete All Incident Alerts</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Are you sure you want to permanently delete all{' '}
                  <strong className="text-white">{alerts.length} incident alert(s)</strong> from the
                  Command Center database?
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1.5">
              <p className="font-semibold text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Irreversible Operation:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                <li>Permanently wipes incident breach history from database</li>
                <li>Synchronizes real-time purge across all connected dispatch screens</li>
                <li>Records an authoritative audit log entry in the security ledger</li>
              </ul>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-900/40 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
