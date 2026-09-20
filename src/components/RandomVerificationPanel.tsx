// ============================================================
// AI RANDOM VERIFICATION PANEL
// Government Web Dashboard — Control Center
// ============================================================
// Architecture:
//   Gov Web (this panel) → POST /api/random-verification/initiate
//   FastAPI             → Telephony + WS to Flutter App
//   Flutter App         → POST /api/random-verification/{id}/submit
//   WS Events           → Auto-update this panel in real-time
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Mic,
  Camera,
  MapPin,
  ShieldCheck,
  ShieldX,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Radio,
  Wifi,
  WifiOff,
  Clock,
  User,
  ChevronDown,
} from 'lucide-react';
import { randomVerificationApi, RandomVerificationSession } from '../api/randomVerification';
import { personsApi } from '../api/persons';
import { realtimeWS } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// ============================================================
// Status Badge Component
// ============================================================

type StatusKey =
  | 'PENDING'
  | 'INITIATED'
  | 'CALLING'
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'FAILED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'MISMATCH'
  | 'NOT_ENABLED'
  | 'INSIDE'
  | 'OUTSIDE'
  | 'NO_FENCE'
  | 'APP_NOTIFIED'
  | 'COMPLETED'
  | 'TIMED_OUT';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode; pulse?: boolean }
> = {
  PENDING:        { label: 'PENDING',        color: 'text-slate-400 bg-slate-800 border-slate-700',  icon: <Clock className="w-3 h-3" /> },
  INITIATED:      { label: 'INITIATED',      color: 'text-blue-400 bg-blue-950 border-blue-800',    icon: <Radio className="w-3 h-3" />, pulse: true },
  CALLING:        { label: 'CALLING...',     color: 'text-yellow-400 bg-yellow-950 border-yellow-800', icon: <PhoneCall className="w-3 h-3" />, pulse: true },
  CONNECTED:      { label: 'CONNECTED',      color: 'text-emerald-400 bg-emerald-950 border-emerald-800', icon: <PhoneCall className="w-3 h-3" /> },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED', color: 'text-orange-400 bg-orange-950 border-orange-800', icon: <WifiOff className="w-3 h-3" /> },
  FAILED:         { label: 'FAILED',         color: 'text-rose-400 bg-rose-950 border-rose-800',    icon: <PhoneOff className="w-3 h-3" /> },
  VERIFYING:      { label: 'VERIFYING...',   color: 'text-cyan-400 bg-cyan-950 border-cyan-800',    icon: <Loader2 className="w-3 h-3 animate-spin" />, pulse: true },
  VERIFIED:       { label: 'VERIFIED ✓',     color: 'text-emerald-400 bg-emerald-950 border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
  MATCH:          { label: 'VERIFIED ✓',     color: 'text-emerald-400 bg-emerald-950 border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
  MISMATCH:       { label: 'MISMATCH ✗',     color: 'text-rose-400 bg-rose-950 border-rose-800',    icon: <XCircle className="w-3 h-3" /> },
  NOT_ENABLED:    { label: 'NOT ENROLLED',   color: 'text-slate-400 bg-slate-800 border-slate-700',  icon: <Mic className="w-3 h-3" /> },
  INSIDE:         { label: 'INSIDE ✓',       color: 'text-emerald-400 bg-emerald-950 border-emerald-800', icon: <MapPin className="w-3 h-3" /> },
  OUTSIDE:        { label: 'OUTSIDE ✗',      color: 'text-rose-400 bg-rose-950 border-rose-800',    icon: <MapPin className="w-3 h-3" /> },
  NO_FENCE:       { label: 'NO PERIMETER',   color: 'text-orange-400 bg-orange-950 border-orange-800', icon: <MapPin className="w-3 h-3" /> },
  APP_NOTIFIED:   { label: 'REQUEST SENT',   color: 'text-blue-400 bg-blue-950 border-blue-800',    icon: <Wifi className="w-3 h-3" />, pulse: true },
  COMPLETED:      { label: 'COMPLETED',      color: 'text-slate-300 bg-slate-800 border-slate-600',  icon: <CheckCircle2 className="w-3 h-3" /> },
  TIMED_OUT:      { label: 'TIMED OUT',      color: 'text-orange-400 bg-orange-950 border-orange-800', icon: <AlertTriangle className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status?.toUpperCase()] || STATUS_CONFIG.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wide font-mono ${cfg.color} ${
        cfg.pulse ? 'animate-pulse' : ''
      }`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ============================================================
// Status Row
// ============================================================

function StatusRow({
  icon,
  label,
  status,
  score,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  score?: number | null;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800/70 last:border-0">
      <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
        <span className="text-slate-500">{icon}</span>
        {label}
      </div>
      <div className="flex items-center gap-2">
        {score != null && score > 0 && (
          <span className="text-[10px] text-slate-500 font-mono">{score.toFixed(1)}%</span>
        )}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

// ============================================================
// History Row
// ============================================================

function HistoryRow({ session }: { session: RandomVerificationSession }) {
  const isVerified = session.final_result === 'VERIFIED';
  const ts = session.created_at ? new Date(session.created_at).toLocaleTimeString('en-IN') : '—';

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors text-xs">
      <td className="py-2 px-3 font-mono text-slate-400 text-[10px]">
        {session.verification_id}
      </td>
      <td className="py-2 px-3 text-slate-200 font-medium">
        {session.person_name || session.person_id}
      </td>
      <td className="py-2 px-3">
        <StatusBadge status={session.call_status} />
      </td>
      <td className="py-2 px-3">
        <StatusBadge status={session.face_status} />
      </td>
      <td className="py-2 px-3">
        <StatusBadge status={session.geofence_status} />
      </td>
      <td className="py-2 px-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
            isVerified
              ? 'text-emerald-400 bg-emerald-950 border border-emerald-800'
              : session.final_result === 'PENDING'
              ? 'text-slate-400 bg-slate-800 border border-slate-700'
              : 'text-rose-400 bg-rose-950 border border-rose-800'
          }`}
        >
          {isVerified ? <CheckCircle2 className="w-3 h-3" /> : session.final_result === 'PENDING' ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {session.final_result}
        </span>
      </td>
      <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">{ts}</td>
    </tr>
  );
}

// ============================================================
// Main Panel
// ============================================================

export const RandomVerificationPanel: React.FC = () => {
  const { user } = useAuth();
  const [persons, setPersons] = useState<any[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active session state
  const [activeSession, setActiveSession] = useState<RandomVerificationSession | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);

  // History
  const [sessions, setSessions] = useState<RandomVerificationSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Load persons on mount ----
  useEffect(() => {
    personsApi
      .getPersons()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as any)?.persons || [];
        setPersons(list);
      })
      .catch(() => setPersons([]));

    randomVerificationApi
      .listSessions(10)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  // ---- WebSocket listener for real-time updates ----
  useEffect(() => {
    const unsub = realtimeWS.subscribe((eventData: any) => {
      const { event, type, data } = eventData;
      const evtType = event || type;

      if (evtType === 'RANDOM_VERIFICATION_STARTED') {
        // New session appeared — refresh history
        randomVerificationApi.listSessions(10).then(setSessions).catch(() => {});
      }

      if (
        evtType === 'RANDOM_VERIFICATION_UPDATE' ||
        evtType === 'RANDOM_VERIFICATION_COMPLETE'
      ) {
        const session: RandomVerificationSession | null =
          data?.session || null;

        if (session) {
          // Update active panel if this is our current session
          if (session.verification_id === verificationId) {
            setActiveSession(session);
          }

          // Update history list
          setSessions((prev) => {
            const exists = prev.find((s) => s.verification_id === session.verification_id);
            if (exists) {
              return prev.map((s) =>
                s.verification_id === session.verification_id ? session : s
              );
            }
            return [session, ...prev].slice(0, 10);
          });
        }
      }
    });

    return () => unsub();
  }, [verificationId]);

  // ---- Poll active session every 3s until completed ----
  const startPolling = useCallback((verId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const session = await randomVerificationApi.getSession(verId);
        setActiveSession(session);

        if (
          session.final_result !== 'PENDING' ||
          session.status === 'COMPLETED' ||
          session.status === 'TIMED_OUT'
        ) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          // Refresh history
          randomVerificationApi.listSessions(10).then(setSessions).catch(() => {});
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ---- Initiate Verification ----
  const handleStartVerification = async () => {
    if (!selectedPersonId) {
      setError('Please select a person to verify.');
      return;
    }

    setError(null);
    setIsLoading(true);
    setActiveSession(null);

    try {
      const resp = await randomVerificationApi.initiate({
        person_id: selectedPersonId,
        initiated_by: user?.officer_id || 'COMMAND-OFFICER',
        initiated_by_name: user?.full_name || 'Command Officer',
      });

      setVerificationId(resp.verification_id);

      // Initial session state
      setActiveSession({
        verification_id: resp.verification_id,
        person_id: resp.person_id,
        person_name: resp.person_name,
        status: resp.status,
        call_status: 'PENDING',
        voice_status: 'PENDING',
        face_status: 'PENDING',
        location_status: 'PENDING',
        geofence_status: 'PENDING',
        final_result: 'PENDING',
        face_score: null,
        voice_score: null,
        latitude: null,
        longitude: null,
        telephony_provider: null,
        created_at: resp.timestamp,
        updated_at: resp.timestamp,
        completed_at: null,
      });

      startPolling(resp.verification_id);
    } catch (err: any) {
      setError(err?.message || 'Failed to initiate verification. Check backend connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---- Derived state ----
  const selectedPerson = persons.find(
    (p) => p.person_id === selectedPersonId || p.employee_id === selectedPersonId
  );

  const isActive =
    activeSession &&
    activeSession.final_result === 'PENDING' &&
    activeSession.status !== 'TIMED_OUT';

  const isFinalVerified = activeSession?.final_result === 'VERIFIED';
  const isFinalFailed =
    activeSession?.final_result === 'FAILED' || activeSession?.status === 'TIMED_OUT';

  // ---- App status derived from session state ----
  const getAppStatus = (): string => {
    if (!activeSession) return 'PENDING';
    const { status, face_status } = activeSession;
    if (status === 'INITIATED') return 'INITIATED';
    if (status === 'APP_NOTIFIED' && face_status === 'PENDING') return 'APP_NOTIFIED';
    if (face_status === 'VERIFYING' || activeSession.location_status === 'PENDING') return 'VERIFYING';
    if (face_status !== 'PENDING') return 'COMPLETED';
    return status;
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-900 via-blue-950/30 to-slate-900 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-blue-500/20 bg-slate-950/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/15 rounded-xl border border-blue-500/30">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white tracking-wide flex items-center gap-2">
              AI RANDOM VERIFICATION
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
                REAL-TIME
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Government-initiated multi-factor identity verification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold font-mono bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>
          )}
          <button
            onClick={() => randomVerificationApi.listSessions(10).then(setSessions).catch(() => {})}
            className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Refresh history"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* ---- Initiation Controls ---- */}
        <div className="flex items-end gap-3 flex-wrap">
          {/* Person Selector */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Select Person to Verify
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <select
                value={selectedPersonId}
                onChange={(e) => {
                  setSelectedPersonId(e.target.value);
                  setError(null);
                  setActiveSession(null);
                  setVerificationId(null);
                }}
                className="w-full pl-8 pr-8 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 transition appearance-none cursor-pointer"
                disabled={isLoading || !!isActive}
              >
                <option value="">— Choose person —</option>
                {persons.map((p) => (
                  <option key={p.person_id || p.employee_id} value={p.person_id || p.employee_id}>
                    {p.person_id || p.employee_id} — {p.full_name}
                    {p.role ? ` (${p.role})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Person Info Badge */}
          {selectedPerson && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/60 rounded-xl border border-slate-700 text-xs text-slate-300">
              {selectedPerson.profile_photo_url ? (
                <img
                  src={selectedPerson.profile_photo_url}
                  alt=""
                  className="w-7 h-7 rounded-lg object-cover border border-slate-600"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-600/40 flex items-center justify-center text-blue-300 font-bold text-xs">
                  {(selectedPerson.full_name || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-semibold text-white">{selectedPerson.full_name}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {selectedPerson.mobile || 'No phone enrolled'}
                </div>
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartVerification}
            disabled={isLoading || !selectedPersonId || !!isActive}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-lg ${
              isLoading || !selectedPersonId || isActive
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white border border-blue-400/30 shadow-blue-500/20'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {isLoading ? 'INITIATING...' : isActive ? 'IN PROGRESS' : 'START VERIFICATION'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-400 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ---- Active Session Status Panel ---- */}
        {activeSession && (
          <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 overflow-hidden">
            {/* Session Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/70 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500">SESSION</span>
                <span className="text-[11px] font-mono text-blue-400 font-bold">
                  {activeSession.verification_id}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500">Person:</span>
                <span className="text-white font-semibold">
                  {activeSession.person_name || activeSession.person_id}
                </span>
              </div>
            </div>

            {/* Status Grid */}
            <div className="p-4 space-y-0.5">
              <StatusRow
                icon={<PhoneCall className="w-3.5 h-3.5" />}
                label="CALL"
                status={activeSession.call_status || 'PENDING'}
              />
              <StatusRow
                icon={<Mic className="w-3.5 h-3.5" />}
                label="VOICE"
                status={activeSession.voice_status || 'PENDING'}
                score={activeSession.voice_score}
              />
              <StatusRow
                icon={<Radio className="w-3.5 h-3.5" />}
                label="APP"
                status={getAppStatus()}
              />
              <StatusRow
                icon={<Camera className="w-3.5 h-3.5" />}
                label="FACE"
                status={activeSession.face_status || 'PENDING'}
                score={activeSession.face_score}
              />
              <StatusRow
                icon={<MapPin className="w-3.5 h-3.5" />}
                label="LOCATION"
                status={activeSession.location_status || 'PENDING'}
              />
              <StatusRow
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                label="GEO-FENCE"
                status={activeSession.geofence_status || 'PENDING'}
              />
            </div>

            {/* Final Result Banner */}
            <div
              className={`px-4 py-3 border-t border-slate-800 flex items-center justify-between ${
                isFinalVerified
                  ? 'bg-emerald-950/40'
                  : isFinalFailed
                  ? 'bg-rose-950/40'
                  : 'bg-slate-900/40'
              }`}
            >
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                FINAL RESULT
              </span>
              {isFinalVerified ? (
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>✓ VERIFIED</span>
                </div>
              ) : isFinalFailed ? (
                <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
                  <ShieldX className="w-5 h-5" />
                  <span>⚠ VERIFICATION FAILED</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-sm font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  VERIFICATION IN PROGRESS
                </div>
              )}
            </div>

            {/* Telephony Not Configured Notice */}
            {activeSession.call_status === 'NOT_CONFIGURED' && (
              <div className="mx-4 mb-4 p-2.5 bg-orange-950/40 border border-orange-800/50 rounded-lg text-[11px] text-orange-300 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>TELEPHONY SERVICE NOT CONFIGURED</strong> — No phone call was placed.
                  Set{' '}
                  <code className="font-mono bg-slate-900 px-1 rounded">TWILIO_ACCOUNT_SID</code> or{' '}
                  <code className="font-mono bg-slate-900 px-1 rounded">EXOTEL_SID</code> in{' '}
                  <code className="font-mono bg-slate-900 px-1 rounded">.env</code> to enable real
                  calls. Face + location verification via the Flutter app is still active.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ---- History Table ---- */}
        <div className="rounded-xl border border-slate-700/60 overflow-hidden">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/60 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition border-b border-slate-700/60"
          >
            <span className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              RECENT SESSIONS ({sessions.length})
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </button>

          {showHistory && (
            <div className="overflow-x-auto">
              {sessions.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">
                  No verification sessions yet. Start your first verification above.
                </div>
              ) : (
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-900/40">
                      {['ID', 'Person', 'Call', 'Face', 'Geo-Fence', 'Result', 'Time'].map(
                        (h) => (
                          <th
                            key={h}
                            className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <HistoryRow key={s.verification_id} session={s} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
