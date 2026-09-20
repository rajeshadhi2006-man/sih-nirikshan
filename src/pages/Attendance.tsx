// ========================================================================
// AUTOMATIC GEO-FENCING ATTENDANCE CONSOLE (100% PURE REAL-TIME)
// ========================================================================
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users,
  CheckCircle2,
  LogOut,
  AlertTriangle,
  Radio,
  UserPlus,
  Download,
  Printer,
  Search,
  RefreshCw,
  Clock,
  Compass,
  MapPin,
  Shield,
  Layers,
  History,
  Activity,
  Bell,
  Navigation,
  Crosshair,
  Signal,
  Smartphone,
  Check,
  Trash2,
} from 'lucide-react';
import {
  apiGetLiveAttendance,
  apiGetAttendanceHistory,
  apiGetEnrolledAttendanceUsers,
  apiEnrollAttendanceUser,
  apiUpdateLocation,
  apiDeleteEnrolledAttendanceUser,
  apiDeleteAttendanceHistory,
  apiClearAttendanceHistory,
} from '../services/api';
import { realtimeWebSocket } from '../services/websocket';
import { LiveAttendanceRecord, LiveAttendanceStats, AttendanceSession, EnrolledAttendanceUser } from '../types/location';
import { AttendanceMap } from '../components/AttendanceMap';
import { EnrollmentModal } from '../components/EnrollmentModal';
import { exportToCSV, printReport } from '../lib/exportUtils';

export const Attendance: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'RADAR' | 'HISTORY' | 'DIRECTORY'>('RADAR');

  // Live attendance data from FastAPI backend
  const [records, setRecords] = useState<LiveAttendanceRecord[]>([]);
  const [stats, setStats] = useState<LiveAttendanceStats>({
    total_enrolled: 0,
    present_count: 0,
    leave_count: 0,
    gps_uncertain_count: 0,
    signal_lost_count: 0,
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // History data
  const [historySessions, setHistorySessions] = useState<AttendanceSession[]>([]);
  const [historyDate, setHistoryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [historyUserFilter, setHistoryUserFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  // Enrolled directory data
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledAttendanceUser[]>([]);

  // UI modal and map state
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);
  const [modalInitialCoords, setModalInitialCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; text: string; time: string; type: 'enter' | 'exit' | 'uncertain' }>>([]);

  // DELETION ACTION STATES
  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState<boolean>(false);

  // REAL-TIME NATIVE HARDWARE GPS BROADCASTING STATE
  const [isBroadcastingGps, setIsBroadcastingGps] = useState<boolean>(false);
  const [liveGpsCoords, setLiveGpsCoords] = useState<{ lat: number; lng: number; accuracy: number; speed: number; heading: number } | null>(null);
  const [broadcastUnitId, setBroadcastUnitId] = useState<string>('');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // INTERACTIVE GEOFENCE DRAWING ON MAP STATE
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [drawingGeofence, setDrawingGeofence] = useState<{ centerLat: number; centerLng: number; radius: number } | null>(null);
  const [drawUserId, setDrawUserId] = useState<string>('');
  const [drawName, setDrawName] = useState<string>('');
  const [drawLocation, setDrawLocation] = useState<string>('');
  const [isSavingDrawnGeofence, setIsSavingDrawnGeofence] = useState<boolean>(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  // Fetch live attendance data with pre-8 PM demo fallback
  const fetchLiveAttendance = useCallback(async () => {
    try {
      setIsLoadingLive(true);
      const data = await apiGetLiveAttendance();
      if (data && data.records && data.records.length > 0) {
        setRecords(data.records);
        setStats(data.stats);
        if (!selectedUserId && data.records.length > 0) {
          setSelectedUserId(data.records[0].user_id);
        }
      } else {
        setRecords([]);
        setStats({
          total_enrolled: 0,
          present_count: 0,
          leave_count: 0,
          gps_uncertain_count: 0,
          signal_lost_count: 0,
        });
      }
    } catch (err) {
      console.error('[Attendance] Error fetching live attendance:', err);
      setRecords([]);
      setStats({
        total_enrolled: 0,
        present_count: 0,
        leave_count: 0,
        gps_uncertain_count: 0,
        signal_lost_count: 0,
      });
    } finally {
      setIsLoadingLive(false);
    }
  }, [selectedUserId]);

  // Fetch history data with demo fallback
  const fetchHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const sessions = await apiGetAttendanceHistory({
        date: historyDate || undefined,
        user_id: historyUserFilter !== 'ALL' ? historyUserFilter : undefined,
        status: historyStatusFilter !== 'ALL' ? historyStatusFilter : undefined,
      });
      if (sessions && sessions.length > 0) {
        setHistorySessions(sessions);
      } else {
        setHistorySessions([]);
      }
    } catch (err) {
      console.error('[Attendance] Error fetching history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historyDate, historyUserFilter, historyStatusFilter]);

  // Fetch directory of enrolled users with demo fallback
  const fetchEnrolledDirectory = useCallback(async () => {
    try {
      const users = await apiGetEnrolledAttendanceUsers();
      if (users && users.length > 0) {
        setEnrolledUsers(users);
        setBroadcastUnitId((prev) => prev || users[0].user_id);
      } else {
        setEnrolledUsers([]);
      }
    } catch (err) {
      console.error('[Attendance] Error fetching enrolled directory:', err);
      setEnrolledUsers([]);
    }
  }, []);

  // Initial loads
  useEffect(() => {
    fetchLiveAttendance();
    fetchHistory();
    fetchEnrolledDirectory();
  }, [fetchLiveAttendance, fetchHistory, fetchEnrolledDirectory]);

  // Periodic refresh for duration calculation
  useEffect(() => {
    const timer = setInterval(() => {
      fetchLiveAttendance();
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchLiveAttendance]);

  // Real-time WebSocket event listener
  useEffect(() => {
    const unsub = realtimeWebSocket.onMessage((msg) => {
      if (msg.event === 'ATTENDANCE_STATE_CHANGE') {
        const payload = msg.data;
        const newNotif = {
          id: `notif-${Date.now()}-${Math.random()}`,
          text: payload.notification || `${payload.user_id} transitioned to ${payload.attendance_status}`,
          time: new Date().toLocaleTimeString(),
          type: (payload.action === 'GEOFENCE_ENTER' ? 'enter' : payload.action === 'GEOFENCE_EXIT' ? 'exit' : 'uncertain') as any,
        };
        setNotifications((prev) => [newNotif, ...prev.slice(0, 5)]);

        fetchLiveAttendance();
        fetchHistory();
      } else if (msg.event === 'ATTENDANCE_USER_ENROLLED' || msg.event === 'ATTENDANCE_USER_DELETED') {
        fetchLiveAttendance();
        fetchEnrolledDirectory();
      } else if (msg.event === 'ATTENDANCE_SESSION_DELETED' || msg.event === 'ATTENDANCE_HISTORY_CLEARED') {
        fetchHistory();
      } else if (msg.event === 'LOCATION_UPDATE') {
        const uLoc = msg.data;
        if (uLoc && uLoc.user_id) {
          setRecords((prev) =>
            prev.map((r) => {
              if (r.user_id === uLoc.user_id) {
                return {
                  ...r,
                  latitude: uLoc.latitude,
                  longitude: uLoc.longitude,
                  accuracy: uLoc.accuracy,
                };
              }
              return r;
            })
          );
        }
      }
    });

    return () => unsub();
  }, [fetchLiveAttendance, fetchHistory, fetchEnrolledDirectory]);

  // ACTION: Unenroll / Delete an enrolled attendance user
  const handleDeleteUser = async (userId: string, name?: string) => {
    const displayName = name ? `${name} (${userId})` : userId;
    if (!window.confirm(`Are you sure you want to unenroll and remove ${displayName} from attendance monitoring?`)) {
      return;
    }
    try {
      setIsDeletingUser(userId);
      await apiDeleteEnrolledAttendanceUser(userId);
      await fetchLiveAttendance();
      await fetchEnrolledDirectory();
      setNotifications((prev) => [
        {
          id: `del-${Date.now()}`,
          text: `Personnel ${displayName} was successfully unenrolled.`,
          time: new Date().toLocaleTimeString(),
          type: 'exit',
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err: any) {
      alert(`Failed to unenroll personnel: ${err.message || err}`);
    } finally {
      setIsDeletingUser(null);
    }
  };

  // ACTION: Delete a single attendance session record
  const handleDeleteSession = async (attendanceId: string) => {
    if (!window.confirm(`Delete attendance session '${attendanceId}' from ledger?`)) {
      return;
    }
    try {
      setIsDeletingSession(attendanceId);
      await apiDeleteAttendanceHistory(attendanceId);
      await fetchHistory();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message || err}`);
    } finally {
      setIsDeletingSession(null);
    }
  };

  // ACTION: Clear all attendance history or for selected date
  const handleClearHistory = async () => {
    const confirmText = historyDate
      ? `Clear all attendance sessions recorded on ${historyDate}?`
      : 'Clear all recorded attendance ledger history?';
    if (!window.confirm(confirmText)) return;

    try {
      setIsClearingHistory(true);
      await apiClearAttendanceHistory(historyDate || undefined);
      await fetchHistory();
    } catch (err: any) {
      alert(`Failed to clear history: ${err.message || err}`);
    } finally {
      setIsClearingHistory(false);
    }
  };

  // REAL HARDWARE GPS STREAMING ENGINE (Browser / Mobile Phone / Laptop)
  const toggleRealDeviceGpsBroadcast = useCallback(() => {
    if (isBroadcastingGps) {
      // Stop tracking
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsBroadcastingGps(false);
      setGpsError(null);
    } else {
      if (!('geolocation' in navigator)) {
        setGpsError('Geolocation is not supported by this device.');
        return;
      }

      setGpsError(null);

      const options: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      };

      const targetUnitId = broadcastUnitId || (enrolledUsers.length > 0 ? enrolledUsers[0].user_id : 'DEVICE-01');

      const wId = navigator.geolocation.watchPosition(
        async (pos) => {
          setIsBroadcastingGps(true);
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const acc = Math.round(pos.coords.accuracy * 10) / 10;
          const spd = pos.coords.speed ? Math.round(pos.coords.speed * 3.6 * 10) / 10 : 0.0;
          const hdg = pos.coords.heading ? Math.round(pos.coords.heading) : 0.0;

          setLiveGpsCoords({ lat, lng, accuracy: acc, speed: spd, heading: hdg });

          // Stream real location directly to backend kernel
          try {
            await apiUpdateLocation({
              user_id: targetUnitId,
              latitude: lat,
              longitude: lng,
              accuracy: acc,
              speed: spd,
              heading: hdg,
              timestamp: new Date(pos.timestamp).toISOString(),
              status: 'online',
            });
          } catch (err: any) {
            console.warn('[GPS Broadcast] Send error:', err);
          }
        },
        (err) => {
          setGpsError(`GPS Hardware Alert: ${err.message}`);
          setIsBroadcastingGps(false);
        },
        options
      );

      watchIdRef.current = wId;
    }
  }, [isBroadcastingGps, broadcastUnitId, enrolledUsers]);

  // Cleanup GPS watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Handler when user clicks anywhere on Leaflet Map
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setModalInitialCoords(coords);
    setIsEnrollModalOpen(true);
  };

  // Quick enroll at current live GPS position
  const handleEnrollAtCurrentGps = () => {
    if (liveGpsCoords) {
      setModalInitialCoords({ lat: liveGpsCoords.lat, lng: liveGpsCoords.lng });
    } else {
      setModalInitialCoords(null);
    }
    setIsEnrollModalOpen(true);
  };

  // Toggle Interactive Draw Geofence on Map
  const toggleDrawGeofenceMode = useCallback(() => {
    if (isDrawingMode) {
      setIsDrawingMode(false);
      setDrawingGeofence(null);
      setDrawError(null);
    } else {
      setIsDrawingMode(true);
      const centerLat = liveGpsCoords?.lat || (records.length > 0 && records[0].latitude ? records[0].latitude : (records.length > 0 && records[0].geofence_center_lat ? records[0].geofence_center_lat : 13.0827));
      const centerLng = liveGpsCoords?.lng || (records.length > 0 && records[0].longitude ? records[0].longitude : (records.length > 0 && records[0].geofence_center_lng ? records[0].geofence_center_lng : 80.2707));
      setDrawingGeofence({
        centerLat,
        centerLng,
        radius: 150,
      });

      if (!drawUserId && enrolledUsers.length > 0) {
        setDrawUserId(enrolledUsers[0].user_id);
        setDrawName(enrolledUsers[0].name);
        setDrawLocation(enrolledUsers[0].authorized_location);
      }
      setDrawError(null);
    }
  }, [isDrawingMode, liveGpsCoords, records, drawUserId, enrolledUsers]);

  // Confirm and persist drawn geofence
  const handleSaveDrawnGeofence = async () => {
    if (!drawingGeofence) return;
    setDrawError(null);

    const uId = drawUserId.trim().toUpperCase();
    const uName = drawName.trim();
    const uLoc = drawLocation.trim() || 'Assigned Zone';

    if (!uId || !uName) {
      setDrawError('Please specify both Personnel ID and Full Name before activating this geofence.');
      return;
    }

    try {
      setIsSavingDrawnGeofence(true);
      const res = await apiEnrollAttendanceUser({
        user_id: uId,
        name: uName,
        authorized_location: uLoc,
        geofence_center_lat: drawingGeofence.centerLat,
        geofence_center_lng: drawingGeofence.centerLng,
        geofence_radius: drawingGeofence.radius,
      });

      if (res && res.success) {
        setIsDrawingMode(false);
        setDrawingGeofence(null);
        await fetchLiveAttendance();
        await fetchEnrolledDirectory();

        const notif = {
          id: `notif-${Date.now()}`,
          text: `Geofence successfully drawn and enrolled for ${uId} (${drawingGeofence.radius}m boundary).`,
          time: new Date().toLocaleTimeString(),
          type: 'enter' as const,
        };
        setNotifications((prev) => [notif, ...prev.slice(0, 4)]);
      }
    } catch (err: any) {
      setDrawError(err.message || 'Error saving drawn geofence');
    } finally {
      setIsSavingDrawnGeofence(false);
    }
  };

  // Export history table to CSV
  const handleExportHistoryCSV = () => {
    const rows = historySessions.map((s) => ({
      'Attendance ID': s.attendance_id,
      'User ID': s.user_id,
      'Full Name': s.name || '',
      'Authorized Location': s.authorized_location || '',
      'Entry Time': s.entry_time,
      'Entry Latitude': s.entry_latitude,
      'Entry Longitude': s.entry_longitude,
      'Entry Accuracy (m)': s.entry_accuracy,
      'Exit Time': s.exit_time || '--',
      'Exit Latitude': s.exit_latitude || '--',
      'Exit Longitude': s.exit_longitude || '--',
      'Exit Accuracy (m)': s.exit_accuracy || '--',
      Status: s.status,
      Duration: s.duration_formatted,
      Date: s.date,
    }));
    exportToCSV(`REALTIME_ATTENDANCE_HISTORY_${historyDate}`, rows);
  };

  // Filtered history records
  const filteredHistorySessions = useMemo(() => {
    return historySessions.filter((s) => {
      const matchesSearch =
        s.user_id.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        (s.name && s.name.toLowerCase().includes(historySearchQuery.toLowerCase())) ||
        (s.authorized_location && s.authorized_location.toLowerCase().includes(historySearchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [historySessions, historySearchQuery]);

  return (
    <div className="flex flex-col space-y-4 min-h-screen pb-10">
      {/* Top Command Directorate Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Real-Time Geofence Kernel Active
            </span>
            <span className="text-xs text-slate-400 font-mono">Zero Predefined Data | 100% Real Telemetry</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Smart India Hackathon: Real-Time Geo-Fencing Attendance
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Autonomous muster roll verification powered by high-frequency device GPS telemetry, geodesic distance evaluation,
            noise filtering, and automated entry/exit state transitions.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Primary Real-Time Device GPS Toggle */}
          <button
            onClick={toggleRealDeviceGpsBroadcast}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg transition transform hover:-translate-y-0.5 ${
              isBroadcastingGps
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
            }`}
          >
            <Radio className={`w-4 h-4 ${isBroadcastingGps ? 'animate-spin' : ''}`} />
            <span>{isBroadcastingGps ? '⏹ Stop Live Device GPS' : '📡 Broadcast My Real Device GPS'}</span>
          </button>

          {/* DRAW GEOFENCE ON MAP Action Button */}
          <button
            onClick={toggleDrawGeofenceMode}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg transition transform hover:-translate-y-0.5 ${
              isDrawingMode
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 ring-2 ring-amber-400'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>{isDrawingMode ? '✕ Exit Draw Mode' : '✏️ Draw Geofence on Map'}</span>
          </button>

          <button
            onClick={handleEnrollAtCurrentGps}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-lg shadow-blue-600/30 transition transform hover:-translate-y-0.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Enroll Personnel</span>
          </button>

          <button
            onClick={handleExportHistoryCSV}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Real-Time Live Telemetry Telemetry Banner */}
      {isBroadcastingGps && liveGpsCoords && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40 animate-pulse">
              <Signal className="w-4 h-4" />
            </span>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span>Transmitting Real Device GPS Telemetry</span>
                <span className="font-mono text-emerald-400 text-[11px]">({broadcastUnitId})</span>
              </div>
              <div className="font-mono text-[11px] text-slate-300 mt-0.5 flex flex-wrap items-center gap-3">
                <span>Lat: {liveGpsCoords.lat.toFixed(6)}</span>
                <span>Lng: {liveGpsCoords.lng.toFixed(6)}</span>
                <span className="text-cyan-400">Accuracy: ±{liveGpsCoords.accuracy}m</span>
                <span>Speed: {liveGpsCoords.speed} km/h</span>
                <span>Heading: {liveGpsCoords.heading}°</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setModalInitialCoords({ lat: liveGpsCoords.lat, lng: liveGpsCoords.lng });
                setIsEnrollModalOpen(true);
              }}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs transition flex items-center gap-1 shadow"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Set Geofence Here</span>
            </button>
          </div>
        </div>
      )}

      {gpsError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* Top 4 Attendance Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* TOTAL ENROLLED */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              TOTAL ENROLLED
            </span>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              {stats.total_enrolled}
            </div>
            <div className="text-[11px] text-slate-400">Real Personnel Enrolled</div>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* PRESENT */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-800/40 rounded-2xl p-4 shadow-lg flex items-center justify-between relative overflow-hidden">
          <div className="space-y-1 relative z-10">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              PRESENT
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
              {stats.present_count}
            </div>
            <div className="text-[11px] text-emerald-300/80">Inside Authorized Geofence</div>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* LEAVE */}
        <div className="bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border border-amber-800/40 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              LEAVE
            </span>
            <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
              {stats.leave_count}
            </div>
            <div className="text-[11px] text-amber-300/80">Outside Authorized Geofence</div>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl">
            <LogOut className="w-6 h-6" />
          </div>
        </div>

        {/* GPS UNCERTAIN */}
        <div className="bg-gradient-to-br from-purple-950/30 via-slate-900 to-slate-900 border border-purple-800/40 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">
              GPS UNCERTAIN
            </span>
            <div className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">
              {stats.gps_uncertain_count}
            </div>
            <div className="text-[11px] text-purple-300/80">Accuracy &gt; 50m (State Preserved)</div>
          </div>
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-2xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Navigation Tab Strip */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('RADAR')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'RADAR'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Live Geofence Radar & Roster</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'HISTORY'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Attendance History Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('DIRECTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'DIRECTORY'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Enrolled Registry ({enrolledUsers.length})</span>
          </button>
        </div>

        <button
          onClick={() => {
            fetchLiveAttendance();
            fetchHistory();
          }}
          className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition hover:border-slate-700"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingLive || isLoadingHistory ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Real-time Notification Banner */}
      {notifications.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-md flex items-center justify-between space-x-3">
          <div className="flex items-center space-x-2 text-xs overflow-hidden">
            <span className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg shrink-0">
              <Bell className="w-3.5 h-3.5 animate-bounce" />
            </span>
            <span className="font-bold text-slate-200 shrink-0">Real-Time Event:</span>
            <span
              className={`font-semibold truncate ${
                notifications[0].type === 'enter'
                  ? 'text-emerald-400'
                  : notifications[0].type === 'exit'
                  ? 'text-amber-400'
                  : 'text-purple-400'
              }`}
            >
              {notifications[0].text}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 shrink-0">{notifications[0].time}</span>
        </div>
      )}

      {/* TAB 1: LIVE RADAR & ROSTER */}
      {activeTab === 'RADAR' && (
        <div className="space-y-4">
          {/* INTERACTIVE GEOFENCE DRAWING CONTROLS CARD */}
          {isDrawingMode && drawingGeofence && (
            <div className="bg-gradient-to-r from-blue-950/90 via-slate-900 to-slate-900 border-2 border-blue-500 rounded-2xl p-4 shadow-2xl space-y-4 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/30 animate-pulse">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <span>Drawing Geofence Boundary Directly on Map</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30">
                        Interactive Precision Mode
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Click the map to place center. Drag the blue center pin or amber perimeter handle to adjust boundary in real time.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawingMode(false);
                      setDrawingGeofence(null);
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDrawnGeofence}
                    disabled={isSavingDrawnGeofence}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingDrawnGeofence ? 'Activating Geofence...' : '✓ Confirm & Activate Geofence'}</span>
                  </button>
                </div>
              </div>

              {drawError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-medium">
                  {drawError}
                </div>
              )}

              {enrolledUsers.length > 0 && (
                <div className="flex items-center gap-2 text-xs bg-slate-950/80 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px] font-medium">Quick Assign to Enrolled Personnel:</span>
                  <select
                    value={drawUserId}
                    onChange={(e) => {
                      const u = enrolledUsers.find((x) => x.user_id === e.target.value);
                      if (u) {
                        setDrawUserId(u.user_id);
                        setDrawName(u.name);
                        setDrawLocation(u.authorized_location);
                      }
                    }}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Custom Personnel ID --</option>
                    {enrolledUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.user_id} - {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Form Input fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Personnel ID
                  </label>
                  <input
                    type="text"
                    value={drawUserId}
                    onChange={(e) => setDrawUserId(e.target.value)}
                    placeholder="e.g. EMP-101"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={drawName}
                    onChange={(e) => setDrawName(e.target.value)}
                    placeholder="e.g. Full Name"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Zone Location Name
                  </label>
                  <input
                    type="text"
                    value={drawLocation}
                    onChange={(e) => setDrawLocation(e.target.value)}
                    placeholder="e.g. Field Operations Center"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Center Coordinates
                  </label>
                  <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-cyan-300 text-xs truncate">
                    {drawingGeofence.centerLat.toFixed(5)}, {drawingGeofence.centerLng.toFixed(5)}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      Boundary Radius: <span className="text-amber-400 font-mono font-black">{drawingGeofence.radius}m</span>
                    </label>
                    <div className="flex items-center gap-1">
                      {[50, 100, 150, 200, 300, 500].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setDrawingGeofence({ ...drawingGeofence, radius: r })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                            drawingGeofence.radius === r
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {r}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="1000"
                    step="10"
                    value={drawingGeofence.radius}
                    onChange={(e) =>
                      setDrawingGeofence({
                        ...drawingGeofence,
                        radius: parseInt(e.target.value),
                      })
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main 2-Column Split: Table on Left / Interactive Leaflet Map on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Live Attendance Table */}
            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Live Enrolled User Table
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time autonomous attendance evaluated at backend from native GPS fixes
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono font-bold">
                  {records.length} Monitored Units
                </span>
              </div>

              {/* If no enrolled records yet, render informative real-time zero-predefined banner */}
              {records.length === 0 ? (
                <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                    <Radio className="w-6 h-6 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Pure Real-Time Mode Active</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    All predefined dummy records have been removed. Telemetry kernel is awaiting real device registration.
                    Click <strong className="text-emerald-400 font-bold">"Broadcast My Real Device GPS"</strong> or{' '}
                    <strong className="text-blue-400 font-bold">"+ Enroll Personnel"</strong> to track your actual live coordinates on the map.
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      onClick={toggleRealDeviceGpsBroadcast}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Start Broadcasting Real GPS</span>
                    </button>
                    <button
                      onClick={handleEnrollAtCurrentGps}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Enroll My Unit</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Enrolled User</th>
                        <th className="py-2.5 px-3">Attendance</th>
                        <th className="py-2.5 px-3">Entry</th>
                        <th className="py-2.5 px-3">Exit</th>
                        <th className="py-2.5 px-3">Duration</th>
                        <th className="py-2.5 px-3">GPS Telemetry</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {records.map((r) => {
                        const isSelected = r.user_id === selectedUserId;
                        const isPresent = r.status === 'PRESENT';
                        const isLeave = r.status === 'LEAVE';
                        const isUncertain = r.gps_status === 'GPS UNCERTAIN';
                        const isSignalLost = r.gps_status === 'LOCATION SIGNAL LOST';

                        return (
                          <tr
                            key={r.user_id}
                            onClick={() => setSelectedUserId(r.user_id)}
                            className={`cursor-pointer transition ${
                              isSelected
                                ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                                : 'hover:bg-slate-800/40'
                            }`}
                          >
                            {/* User ID & Name */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-white font-mono text-xs">{r.user_id}</div>
                              <div className="text-[11px] text-slate-300">{r.name}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                                {r.authorized_location}
                              </div>
                            </td>

                            {/* Attendance Status */}
                            <td className="py-3 px-3">
                              {isPresent ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  PRESENT
                                </span>
                              ) : isLeave ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                                  LEAVE
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                  OUTSIDE
                                </span>
                              )}
                            </td>

                            {/* Entry Time */}
                            <td className="py-3 px-3 font-mono text-emerald-400 font-semibold text-xs">
                              {r.entry_time || '--'}
                            </td>

                            {/* Exit Time */}
                            <td className="py-3 px-3 font-mono text-amber-400 font-semibold text-xs">
                              {r.exit_time || '--'}
                            </td>

                            {/* Duration */}
                            <td className="py-3 px-3 font-mono text-blue-300 font-bold text-xs">
                              {r.duration || '--'}
                            </td>

                            {/* GPS Telemetry */}
                            <td className="py-3 px-3">
                              {isUncertain ? (
                                <div className="text-[10px] font-bold text-purple-400 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  <span>UNCERTAIN ({Math.round(r.accuracy)}m)</span>
                                </div>
                              ) : isSignalLost ? (
                                <div className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                                  <Radio className="w-3 h-3 shrink-0 animate-pulse" />
                                  <span>SIGNAL LOST</span>
                                </div>
                              ) : (
                                <div className="text-[11px] font-mono text-slate-300">
                                  <span className="text-cyan-400">{Math.round(r.accuracy)}m</span> acc |{' '}
                                  <span className="text-slate-400">{Math.round(r.distance_to_geofence)}m dist</span>
                                </div>
                              )}
                            </td>

                            {/* Map & Delete Actions */}
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUserId(r.user_id);
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg text-[10px] font-semibold transition"
                                  title="Focus on Radar"
                                >
                                  Focus
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteUser(r.user_id, r.name);
                                  }}
                                  disabled={isDeletingUser === r.user_id}
                                  className="px-2 py-1 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-600 rounded-lg text-[10px] font-semibold transition flex items-center gap-1"
                                  title="Unenroll and Delete Personnel"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Leaflet Geofence Radar Map */}
            <div className="lg:col-span-5 h-[520px] lg:h-auto">
              <AttendanceMap
                records={records}
                selectedUserId={selectedUserId}
                onSelectUser={(uId) => setSelectedUserId(uId)}
                onMapClick={handleMapClick}
                liveDeviceCoords={liveGpsCoords}
                isDrawingMode={isDrawingMode}
                drawingGeofence={drawingGeofence}
                onDrawingChange={(geo) => setDrawingGeofence(geo)}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE HISTORY LEDGER */}
      {activeTab === 'HISTORY' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                Real-Time Attendance History Ledger
              </h3>
              <p className="text-xs text-slate-400">
                Verifiable audit trail of physical GPS entry timestamps, exit timestamps, duration, and coordinates.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleClearHistory}
                disabled={isClearingHistory || filteredHistorySessions.length === 0}
                className="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-40 shadow"
                title="Clear Attendance Sessions"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>

              <button
                onClick={handleExportHistoryCSV}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700 shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => printReport('Attendance Audit Sessions')}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition shadow"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Official Muster Roll</span>
              </button>
            </div>
          </div>

          {/* History Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filter by Date
              </label>
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filter by User
              </label>
              <select
                value={historyUserFilter}
                onChange={(e) => setHistoryUserFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-xs"
              >
                <option value="ALL">All Enrolled Personnel</option>
                {enrolledUsers.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.user_id} - {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filter by Status
              </label>
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="PRESENT">PRESENT</option>
                <option value="LEAVE">LEAVE</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Search User or Zone
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>
            </div>
          </div>

          {/* History Sessions Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Session ID</th>
                  <th className="py-2.5 px-3">Enrolled Officer</th>
                  <th className="py-2.5 px-3">Authorized Geofence</th>
                  <th className="py-2.5 px-3">Entry Timestamp</th>
                  <th className="py-2.5 px-3">Exit Timestamp</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Audit Details</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredHistorySessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      No attendance sessions recorded yet. Enrolled personnel will be recorded upon real geofence transit.
                    </td>
                  </tr>
                ) : (
                  filteredHistorySessions.map((s) => (
                    <tr key={s.attendance_id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3 font-mono text-slate-400 text-xs">{s.attendance_id}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-white text-xs">{s.user_id}</span>
                        {s.name && <div className="text-[11px] text-slate-300">{s.name}</div>}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {s.authorized_location || s.geofence_id || 'Authorized Perimeter'}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-400 font-medium">
                        {s.entry_time}
                      </td>
                      <td className="py-3 px-3 font-mono text-amber-400 font-medium">
                        {s.exit_time || '--'}
                      </td>
                      <td className="py-3 px-3">
                        {s.status === 'PRESENT' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            PRESENT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            LEAVE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-blue-300 font-bold">
                        {s.duration_formatted || '--'}
                      </td>
                      <td className="py-3 px-3 text-[10px] font-mono text-slate-500">
                        Entry: {s.entry_latitude?.toFixed(4)}, {s.entry_longitude?.toFixed(4)} ({Math.round(s.entry_accuracy)}m)
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDeleteSession(s.attendance_id)}
                          disabled={isDeletingSession === s.attendance_id}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                          title="Delete Session Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ENROLLED PERSONNEL DIRECTORY */}
      {activeTab === 'DIRECTORY' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Real Enrolled Personnel Directory
              </h3>
              <p className="text-xs text-slate-400">
                Only enrolled users participate in automatic geofence attendance.
              </p>
            </div>
            <button
              onClick={handleEnrollAtCurrentGps}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Enroll New User</span>
            </button>
          </div>

          {enrolledUsers.length === 0 ? (
            <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
              No personnel enrolled yet. Click "+ Enroll New User" to register a duty zone.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {enrolledUsers.map((user) => (
                <div
                  key={user.user_id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-blue-400">{user.user_id}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {user.enrollment_status}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteUser(user.user_id, user.name)}
                      disabled={isDeletingUser === user.user_id}
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-600 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                      title="Unenroll and Delete Personnel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-white text-sm">{user.name}</div>
                    <div className="text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{user.authorized_location}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800/80 space-y-1 text-[11px] font-mono text-slate-300">
                    <div>Center Lat: {user.geofence_center_lat}</div>
                    <div>Center Lng: {user.geofence_center_lng}</div>
                    <div>Radius: {user.geofence_radius} meters</div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">Current Attendance:</span>
                    <span
                      className={`font-black ${
                        user.current_attendance_status === 'PRESENT'
                          ? 'text-emerald-400'
                          : user.current_attendance_status === 'LEAVE'
                          ? 'text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {user.current_attendance_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enrollment Modal */}
      <EnrollmentModal
        isOpen={isEnrollModalOpen}
        onClose={() => {
          setIsEnrollModalOpen(false);
          setModalInitialCoords(null);
        }}
        onSuccess={() => {
          fetchLiveAttendance();
          fetchEnrolledDirectory();
        }}
        initialCoords={modalInitialCoords}
        onSwitchToDrawMode={() => {
          setIsEnrollModalOpen(false);
          toggleDrawGeofenceMode();
        }}
      />
    </div>
  );
};
