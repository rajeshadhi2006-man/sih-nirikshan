import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { MonitoredUser, Geofence, Alert, AuditLog, BreadcrumbPoint, STATUS_THRESHOLDS } from '../types';
import { useNotifications } from './NotificationContext';
import { isValidCoordinate } from '../components/map/LiveMap';
import {
  apiFetchUsers,
  apiFetchGeofences,
  apiFetchAuditLogs,
  apiSendTelemetry,
  apiEnrollUser,
  apiCreateGeofence,
  apiDeleteGeofence,
  apiSimulateBreach,
  apiRestoreSafe,
  realtimeWS,
} from '../lib/api';
import { INITIAL_USERS, INITIAL_GEOFENCES, INITIAL_AUDIT_LOGS } from '../lib/demoData';
import { demoEngine } from '../lib/demoEngine';

export interface MonitoringStats {
  totalUsers: number;
  activeNow: number;
  presentToday: number;
  absentToday: number;
  verifiedToday: number;
  outsideGeofence: number;
  faceVerifiedPct: number;
  voiceVerifiedPct: number;
  locationAccuracyAvg: number;
  systemHealthPct: number;
  offlineUsers: number;
}

interface MonitoringContextType {
  users: MonitoredUser[];
  geofences: Geofence[];
  selectedUser: MonitoredUser | null;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  isLive: boolean;
  realtimeStatus: 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  lastHeartbeat: string;
  telemetryPacketCount: number;
  stats: MonitoringStats;
  isSimulationActive: boolean;
  toggleSimulation: () => void;
  isLiveDeviceGpsActive: boolean;
  toggleLiveDeviceGps: () => void;
  liveDeviceGpsError: string | null;
  routeHistory: Record<string, BreadcrumbPoint[]>;
  auditLogs: AuditLog[];
  addAuditLog: (action: string, target?: string, result?: 'SUCCESS' | 'DENIED' | 'FAILURE', details?: Record<string, any>) => void;
  enrollOfficer: (data: {
    officer_id: string;
    full_name: string;
    email: string;
    phone?: string;
    department: string;
    designation: string;
    role?: string;
  }) => Promise<boolean>;
  triggerDemoBreach: (userId?: string) => void;
  restoreSafeGeofence: (userId?: string) => void;
  broadcastLocationUpdate: (
    userId: string,
    lat: number,
    lng: number,
    accuracy?: number,
    speed?: number,
    heading?: number,
    name?: string
  ) => void;
  addGeofence: (newGeo: Omit<Geofence, 'id' | 'created_at'>) => void;
  deleteGeofence: (id: string) => void;
  refreshData: () => Promise<void>;
  activeCall: {
    call_id: string;
    user_id: string;
    officer_name: string;
    officer_id?: string;
    site_name?: string;
    trigger_reason?: string;
    is_automatic?: boolean;
    status: 'RINGING' | 'CONNECTED' | 'ENDED';
  } | null;
  initiateVideoCall: (userId: string, isAuto?: boolean, reason?: string) => void;
  endVideoCall: () => void;
}

const MonitoringContext = createContext<MonitoringContextType | undefined>(undefined);

export const MonitoringProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<MonitoredUser[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [realtimeStatus, setRealtimeStatus] = useState<'LIVE' | 'RECONNECTING' | 'OFFLINE'>('LIVE');
  const [lastHeartbeat, setLastHeartbeat] = useState<string>(new Date().toISOString());
  const [telemetryPacketCount, setTelemetryPacketCount] = useState<number>(0);
  const [isSimulationActive, setIsSimulationActive] = useState<boolean>(false);
  const [routeHistory, setRouteHistory] = useState<Record<string, BreadcrumbPoint[]>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Real physical device hardware GNSS state
  const [isLiveDeviceGpsActive, setIsLiveDeviceGpsActive] = useState<boolean>(true);
  const [liveDeviceGpsError, setLiveDeviceGpsError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const { addAlert } = useNotifications();

  const addAuditLog = useCallback(
    (action: string, target?: string, result: 'SUCCESS' | 'DENIED' | 'FAILURE' = 'SUCCESS', details?: Record<string, any>) => {
      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          officer_name: 'Dr. Rajesh Sharma, IAS',
          action,
          target,
          result,
          details,
          ip_address: '127.0.0.1',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    []
  );

  // Fetch initial state from Python backend with robust fallback
  const refreshData = useCallback(async () => {
    try {
      const [userList, geoList, logs] = await Promise.all([
        apiFetchUsers().catch(() => []),
        apiFetchGeofences().catch(() => []),
        apiFetchAuditLogs().catch(() => []),
      ]);

      if (Array.isArray(userList) && userList.length > 0) {
        const normalized = userList.map((u) => ({
          ...u,
          verification: u.verification || {
            face: 'PENDING',
            voice: 'PENDING',
            location: 'PENDING',
            overall: 'PENDING',
          },
        }));
        setUsers(normalized);
        if (normalized.length > 0 && !selectedUserId) {
          setSelectedUserId(normalized[0].id);
        }
      } else {
        setUsers([]);
      }
      if (Array.isArray(geoList) && geoList.length > 0) {
        setGeofences(geoList);
      } else {
        setGeofences([]);
      }
      if (Array.isArray(logs) && logs.length > 0) {
        setAuditLogs(logs);
      } else {
        setAuditLogs([]);
      }
      setIsLive(true);
      setRealtimeStatus('LIVE');
    } catch {
      setUsers([]);
      setGeofences([]);
      setIsLive(true);
      setRealtimeStatus('LIVE');
    }
  }, [selectedUserId]);

  // Connect to Python Backend WebSocket
  useEffect(() => {
    refreshData();

    // Subscribe to Python WebSocket hub (ws://localhost:8000/ws/live)
    const unsubscribeWS = realtimeWS.subscribe((eventData) => {
      const { event, data } = eventData;

      if (event === 'INITIAL_SNAPSHOT') {
        if (data.users && Array.isArray(data.users)) {
          const normalized = data.users.map((u: any) => ({
            ...u,
            verification: u.verification || {
              face: 'PENDING',
              voice: 'PENDING',
              location: 'PENDING',
              overall: 'PENDING',
            },
          }));
          setUsers(normalized);
          if (normalized.length > 0 && !selectedUserId) {
            setSelectedUserId(normalized[0].id);
          }
        }
        if (data.geofences && Array.isArray(data.geofences)) {
          setGeofences(data.geofences);
        }
      } else if (event === 'TELEMETRY_UPDATE' || event === 'LOCATION_UPDATE') {
        const ping = data || eventData;
        setTelemetryPacketCount((c) => c + 1);
        setLastHeartbeat(new Date().toISOString());

        const uId = ping.user_id || ping.id;
        if (!uId || ping.latitude === undefined || ping.longitude === undefined) return;

        // Update user state dynamically
        setUsers((prevUsers) => {
          const idx = prevUsers.findIndex((u) => u.id === uId || u.officer_id === (ping.officer_id || uId));

          const updatedLocation = {
            latitude: Number(ping.latitude),
            longitude: Number(ping.longitude),
            accuracy: ping.accuracy || 5.0,
            speed: ping.speed || 0.0,
            heading: ping.heading || 0.0,
            last_updated: ping.last_updated || ping.timestamp || new Date().toISOString(),
          };

          const isInside = ping.geofence_status === 'INSIDE' || ping.is_inside_geofence === 1 || ping.status === 'inside';

          if (idx !== -1) {
            const copy = [...prevUsers];
            copy[idx] = {
              ...copy[idx],
              status: 'ACTIVE',
              geofence_status: isInside ? 'INSIDE' : 'OUTSIDE',
              current_location: updatedLocation,
            };
            return copy;
          } else {
            // New active unit received via telemetry
            const newUser: MonitoredUser = {
              id: uId,
              officer_id: ping.officer_id || `OFF-${uId.slice(0, 5).toUpperCase()}`,
              full_name: ping.full_name || `Officer ${uId.slice(0, 6)}`,
              department: ping.department || 'Field Surveillance Unit',
              designation: 'Live GPS Terminal',
              status: 'ACTIVE',
              geofence_status: isInside ? 'INSIDE' : 'OUTSIDE',
              current_location: updatedLocation,
              verification: {
                face: 'PENDING',
                voice: 'PENDING',
                location: 'PENDING',
                overall: 'PENDING',
              },
              attendance_status: 'PRESENT',
            };
            return [newUser, ...prevUsers];
          }
        });

        // Track route history for trajectory visualization
        setRouteHistory((prev) => {
          const userHistory = prev[uId] || [];
          const last = userHistory[userHistory.length - 1];
          if (!last || Math.abs(last.latitude - ping.latitude) > 0.00003 || Math.abs(last.longitude - ping.longitude) > 0.00003) {
            return {
              ...prev,
              [uId]: [
                ...userHistory.slice(-40),
                {
                  latitude: Number(ping.latitude),
                  longitude: Number(ping.longitude),
                  accuracy: ping.accuracy || 5.0,
                  speed: ping.speed || 0.0,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
              ],
            };
          }
          return prev;
        });
      } else if (event === 'ALERT_NEW') {
        addAlert(data);
      } else if (event === 'PERSON_ENROLLED' || event === 'USER_ENROLLED') {
        const p = data?.person || data;
        const geo = data?.geofence;
        if (p) {
          const pid = p.person_id || p.id || p.employee_id;
          const lat = geo ? (geo.center_latitude ?? geo.latitude) : undefined;
          const lng = geo ? (geo.center_longitude ?? geo.longitude) : undefined;
          setUsers((prev) => {
            if (prev.some((u) => u.id === pid)) return prev;
            const enrolled: MonitoredUser = {
              id: pid,
              officer_id: p.employee_id || pid,
              full_name: p.full_name,
              department: p.organization || p.department || 'Field Operations',
              designation: p.assigned_area || p.designation || 'Field Personnel',
              status: 'ACTIVE',
              geofence_status: 'INSIDE',
              current_location: lat && lng ? {
                latitude: Number(lat),
                longitude: Number(lng),
                accuracy: 10.0,
                speed: 0.0,
                heading: 0.0,
                last_updated: new Date().toISOString()
              } : undefined,
              verification: { face: 'PENDING', voice: 'PENDING', location: 'PENDING', overall: 'PENDING' },
              attendance_status: 'PRESENT',
            };
            return [enrolled, ...prev];
          });
          if (geo) {
            setGeofences((prev) => {
              if (prev.some((g) => g.id === geo.id)) return prev;
              return [geo, ...prev];
            });
          }
        }
      } else if (event === 'PERSON_DELETED' || event === 'USER_DELETED') {
        const delId = data?.person_id || data?.id || data?.user_id;
        if (delId) {
          setUsers((prev) => prev.filter((u) => u.id !== delId && u.officer_id !== delId));
          setGeofences((prev) => prev.filter((g) => g.person_id !== delId && g.id !== `geo-${delId.toLowerCase()}`));
          setRouteHistory((prev) => {
            const next = { ...prev };
            delete next[delId];
            return next;
          });
          if (selectedUserId === delId) {
            setSelectedUserId(null);
          }
        }
      } else if (event === 'GEOFENCE_CREATED') {
        setGeofences((prev) => {
          if (prev.some((g) => g.id === data.id)) return prev;
          return [data, ...prev];
        });
      } else if (event === 'GEOFENCE_DELETED') {
        setGeofences((prev) => prev.filter((g) => g.id !== data.id));
      } else if (event === 'ATTENDANCE_CHECKIN' || event === 'ATTENDANCE_UPDATED') {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.user_id ? { ...u, attendance_status: data.status || 'PRESENT' } : u))
        );
      } else if (event === 'VERIFICATION_UPDATE') {
        setUsers((prev) =>
          prev.map((u) => (u.id === data.user_id ? { ...u, verification: data.verification } : u))
        );
      }
    });

    return () => {
      unsubscribeWS();
    };
  }, [refreshData, selectedUserId, addAlert]);

  // Periodic ticker to transition stale users
  useEffect(() => {
    const timer = setInterval(() => {
      setUsers((prevUsers) => {
        let changed = false;
        const now = Date.now();
        const updated = prevUsers.map((u) => {
          if (!u.current_location?.last_updated) return u;
          const diffSec = (now - new Date(u.current_location.last_updated).getTime()) / 1000;
          let nextStatus: 'ACTIVE' | 'STALE' | 'OFFLINE' = 'ACTIVE';
          if (diffSec > STATUS_THRESHOLDS.STALE_SECONDS) {
            nextStatus = 'OFFLINE';
          } else if (diffSec > STATUS_THRESHOLDS.LIVE_SECONDS) {
            nextStatus = 'STALE';
          } else {
            nextStatus = 'ACTIVE';
          }

          if (u.status !== nextStatus) {
            changed = true;
            return { ...u, status: nextStatus };
          }
          return u;
        });

        return changed ? updated : prevUsers;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  // Listen on BroadcastChannel for inter-tab mobile transmitter telemetry
  useEffect(() => {

    // Listen on BroadcastChannel for inter-tab mobile transmitter telemetry
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('gov_gps_telemetry');
      bc.onmessage = async (event) => {
        if (event.data?.type === 'GPS_UPDATE') {
          const { user_id, full_name, latitude, longitude, accuracy, speed, heading } =
            event.data.data;
          try {
            await apiSendTelemetry({
              user_id: user_id || 'mobile-phone-unit',
              latitude,
              longitude,
              accuracy: accuracy || 5.0,
              speed: speed || 0.0,
              heading: heading || 0.0,
              full_name: full_name || 'Mobile Phone Unit',
              officer_id: 'MOB-01',
            });
          } catch {}
        }
      };
    } catch {}

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (bc) bc.close();
    };
  }, []);

  const toggleLiveDeviceGps = () => {
    if (isLiveDeviceGpsActive) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsLiveDeviceGpsActive(false);
    } else {
      setIsLiveDeviceGpsActive(true);
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            try {
              await apiSendTelemetry({
                user_id: 'device-live-primary',
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy || 6),
                speed: pos.coords.speed || 0,
                heading: pos.coords.heading || 0,
                full_name: 'Active Field Unit (This Device)',
                officer_id: 'USR-LIVE-01',
              });
            } catch {}
          },
          (err) => setLiveDeviceGpsError(err.message),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
        );
      }
    }
  };

  const toggleSimulation = () => {
    if (isSimulationActive) {
      demoEngine.stop();
      setIsSimulationActive(false);
    } else {
      demoEngine.initialize(users, geofences);
      demoEngine.start(2200);
      setIsSimulationActive(true);
    }
  };

  const enrollOfficer = async (data: {
    officer_id: string;
    full_name: string;
    email: string;
    phone?: string;
    department: string;
    designation: string;
    role?: string;
  }): Promise<boolean> => {
    try {
      const res = await apiEnrollUser(data);
      if (res.success) {
        await refreshData();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const broadcastLocationUpdate = async (
    userId: string,
    lat: number,
    lng: number,
    accuracy: number = 5.0,
    speed: number = 0,
    heading: number = 0,
    name?: string
  ) => {
    try {
      await apiSendTelemetry({
        user_id: userId,
        latitude: lat,
        longitude: lng,
        accuracy,
        speed,
        heading,
        full_name: name,
      });
    } catch {}
  };

  const triggerDemoBreach = async (userId?: string) => {
    const targetId = userId || selectedUserId || users[0]?.id;
    try {
      await apiSimulateBreach(targetId);
      addAuditLog('TRIGGER_BREACH_ACTION', targetId, 'SUCCESS');
    } catch (err) {
      console.warn('Simulate breach API error:', err);
    }
  };

  const restoreSafeGeofence = async (userId?: string) => {
    const targetId = userId || selectedUserId || users[0]?.id;
    try {
      await apiRestoreSafe(targetId);
      addAuditLog('RESTORE_SAFE_ACTION', targetId, 'SUCCESS');
    } catch (err) {
      console.warn('Restore safe API error:', err);
    }
  };

  const addGeofence = async (newGeo: Omit<Geofence, 'id' | 'created_at'>) => {
    try {
      await apiCreateGeofence({
        name: newGeo.name,
        person_id: newGeo.person_id,
        area_name: newGeo.area_name || newGeo.name,
        department: newGeo.department,
        description: newGeo.description,
        center_latitude: newGeo.center_latitude,
        center_longitude: newGeo.center_longitude,
        radius_meters: newGeo.radius_meters,
      });
      await refreshData();
    } catch (err: any) {
      console.error('addGeofence error:', err);
      throw err;
    }
  };

  const deleteGeofence = async (id: string) => {
    try {
      await apiDeleteGeofence(id);
      await refreshData();
    } catch {}
  };

  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0] || null;

  // Real-time computed statistics (100% computed from active live data)
  const totalUsers = users.length;
  const activeNow = users.filter((u) => u.status === 'ACTIVE').length;
  const offlineUsers = users.filter((u) => u.status === 'OFFLINE' || u.status === 'STALE').length;
  const presentToday = users.filter((u) => u.attendance_status === 'PRESENT').length;
  const absentToday = users.filter((u) => u.attendance_status === 'ABSENT').length;
  const outsideGeofence = users.filter((u) => u.geofence_status === 'OUTSIDE').length;
  const verifiedToday = users.filter((u) => u.verification?.overall === 'VERIFIED').length;
  const faceVerifiedCount = users.filter((u) => u.verification?.face === 'VERIFIED').length;
  const voiceVerifiedCount = users.filter((u) => u.verification?.voice === 'VERIFIED').length;

  const faceVerifiedPct = totalUsers ? Number(((faceVerifiedCount / totalUsers) * 100).toFixed(1)) : 0;
  const voiceVerifiedPct = totalUsers ? Number(((voiceVerifiedCount / totalUsers) * 100).toFixed(1)) : 0;

  const validAccuracies = users
    .map((u) => u.current_location?.accuracy)
    .filter((a): a is number => typeof a === 'number');
  const locationAccuracyAvg = validAccuracies.length
    ? Math.round(validAccuracies.reduce((a, b) => a + b, 0) / validAccuracies.length)
    : 0;

  const stats: MonitoringStats = {
    totalUsers,
    activeNow,
    presentToday,
    absentToday,
    verifiedToday,
    outsideGeofence,
    faceVerifiedPct,
    voiceVerifiedPct,
    locationAccuracyAvg,
    systemHealthPct: totalUsers > 0 && isLive ? 100 : 0,
    offlineUsers,
  };

  // Active WebRTC Video Call State
  const [activeCall, setActiveCall] = useState<{
    call_id: string;
    user_id: string;
    officer_name: string;
    officer_id?: string;
    site_name?: string;
    trigger_reason?: string;
    is_automatic?: boolean;
    status: 'RINGING' | 'CONNECTED' | 'ENDED';
  } | null>(null);

  const initiateVideoCall = useCallback(
    (userId: string, isAuto: boolean = false, reason: string = 'MANUAL_DISPATCH') => {
      const targetUser = users.find((u) => u.id === userId || u.officer_id === userId);
      const callId = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const newCall = {
        call_id: callId,
        user_id: userId,
        officer_name: targetUser?.full_name || `Officer ${userId}`,
        officer_id: targetUser?.officer_id || userId,
        site_name: targetUser?.department || 'Field Patrol Sector A',
        trigger_reason: isAuto ? reason : 'DIRECT_DISPATCH',
        is_automatic: isAuto,
        status: 'CONNECTED' as const,
      };

      setActiveCall(newCall);
      addAuditLog(
        isAuto ? 'AUTO_VIDEO_CALL_TRIGGERED' : 'VIDEO_CALL_INITIATED',
        userId,
        'SUCCESS',
        { call_id: callId, reason }
      );
    },
    [users, addAuditLog]
  );

  const endVideoCall = useCallback(() => {
    if (activeCall) {
      addAuditLog('VIDEO_CALL_ENDED', activeCall.user_id, 'SUCCESS', { call_id: activeCall.call_id });
    }
    setActiveCall(null);
  }, [activeCall, addAuditLog]);

  return (
    <MonitoringContext.Provider
      value={{
        users,
        geofences,
        selectedUser,
        selectedUserId,
        setSelectedUserId,
        isLive,
        realtimeStatus,
        lastHeartbeat,
        telemetryPacketCount,
        stats,
        isSimulationActive,
        toggleSimulation,
        isLiveDeviceGpsActive,
        toggleLiveDeviceGps,
        liveDeviceGpsError,
        routeHistory,
        auditLogs,
        addAuditLog,
        enrollOfficer,
        triggerDemoBreach,
        restoreSafeGeofence,
        broadcastLocationUpdate,
        addGeofence,
        deleteGeofence,
        refreshData,
        activeCall,
        initiateVideoCall,
        endVideoCall,
      }}
    >
      {children}
    </MonitoringContext.Provider>
  );
};

export const useMonitoring = () => {
  const context = useContext(MonitoringContext);
  if (!context) throw new Error('useMonitoring must be used within a MonitoringProvider');
  return context;
};
