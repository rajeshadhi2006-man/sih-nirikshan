// ========================================================================
// REAL-TIME GPS & SMOOTH MULTI-USER HOOK
// ========================================================================
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { UserLocation, CircularGeofence, TrackingStats, ConnectionState, LocationBreadcrumb } from '../types/location';
import { apiGetUsersLocations, apiGetGeofences } from '../services/api';
import { realtimeWebSocket } from '../services/websocket';
import { locationService } from '../services/locationService';

export function useLiveLocations() {
  // Map of users: keyed by user_id
  const [usersMap, setUsersMap] = useState<Map<string, UserLocation>>(new Map());
  
  // Interpolated animated coordinates for smooth Uber/Rapido style movement
  const [animatedCoords, setAnimatedCoords] = useState<Record<string, { lat: number; lng: number; heading: number }>>({});
  
  // Breadcrumb route history per user
  const [historyMap, setHistoryMap] = useState<Map<string, LocationBreadcrumb[]>>(new Map());

  // Geofences
  const [geofences, setGeofences] = useState<CircularGeofence[]>([]);

  // Selection & Live Tracking (Auto-follow mode)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);
  const [showRoute, setShowRoute] = useState<boolean>(true);

  // Connection status & synchronization
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [connectionDetail, setConnectionDetail] = useState<string>('');
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [syncSecondsAgo, setSyncSecondsAgo] = useState<number>(0);

  // Native Browser GPS and Simulator states
  const [isBrowserGpsActive, setIsBrowserGpsActive] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);

  // Animation frame references for smooth marker movement
  const animationFramesRef = useRef<Record<string, number>>({});
  const previousCoordsRef = useRef<Record<string, { lat: number; lng: number; heading: number }>>({});

  // Smoothly interpolate marker movement between (lat1, lng1) and (lat2, lng2) over durationMs
  const animateMarker = useCallback((userId: string, targetLat: number, targetLng: number, targetHeading: number, durationMs = 2500) => {
    const prev = previousCoordsRef.current[userId] || { lat: targetLat, lng: targetLng, heading: targetHeading };
    const startLat = prev.lat;
    const startLng = prev.lng;
    const startHeading = prev.heading;
    const startTime = performance.now();

    // Cancel existing running animation for this user
    if (animationFramesRef.current[userId]) {
      cancelAnimationFrame(animationFramesRef.current[userId]);
    }

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      
      // Smooth cubic ease-out curve
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;
      
      // Shortest angle rotation
      let diffHeading = (targetHeading - startHeading) % 360;
      if (diffHeading > 180) diffHeading -= 360;
      if (diffHeading < -180) diffHeading += 360;
      const currentHeading = startHeading + diffHeading * ease;

      setAnimatedCoords((prevAnim) => ({
        ...prevAnim,
        [userId]: {
          lat: currentLat,
          lng: currentLng,
          heading: (currentHeading + 360) % 360,
        },
      }));

      if (progress < 1.0) {
        animationFramesRef.current[userId] = requestAnimationFrame(step);
      } else {
        previousCoordsRef.current[userId] = { lat: targetLat, lng: targetLng, heading: targetHeading };
      }
    };

    animationFramesRef.current[userId] = requestAnimationFrame(step);
  }, []);

  // Update a single user location inside state without touching other users
  const handleLocationUpdate = useCallback((newLoc: UserLocation) => {
    const uId = newLoc.user_id;

    // Trigger smooth interpolation
    animateMarker(uId, newLoc.latitude, newLoc.longitude, newLoc.heading || 0);

    // Update users map
    setUsersMap((prevMap) => {
      const nextMap = new Map(prevMap);
      const existing = nextMap.get(uId);

      const computedStatus =
        newLoc.accuracy > 50
          ? 'GPS ERROR'
          : (newLoc.status === 'offline' ? 'OFFLINE' : 'LIVE');

      const merged: UserLocation = {
        ...(existing || {}),
        ...newLoc,
        computed_status: computedStatus,
        last_seen_seconds_ago: 0,
      };

      nextMap.set(uId, merged);
      return nextMap;
    });

    // Update breadcrumb history
    setHistoryMap((prevHist) => {
      const nextHist = new Map(prevHist);
      const userHist = nextHist.get(uId) || [];
      const newPoint: LocationBreadcrumb = {
        latitude: newLoc.latitude,
        longitude: newLoc.longitude,
        accuracy: newLoc.accuracy,
        speed: newLoc.speed,
        heading: newLoc.heading,
        timestamp: newLoc.timestamp,
      };
      // Keep last 40 points
      nextHist.set(uId, [...userHist.slice(-39), newPoint]);
      return nextHist;
    });

    setLastSyncTime(new Date());
  }, [animateMarker]);

  // Real-time synchronization with FastAPI backend
  const refreshLocations = useCallback(async () => {
    try {
      const [usersData, geoData] = await Promise.all([
        apiGetUsersLocations(true, 40),
        apiGetGeofences(),
      ]);

      const map = new Map<string, UserLocation>();
      const hMap = new Map<string, LocationBreadcrumb[]>();
      const initialAnim: Record<string, { lat: number; lng: number; heading: number }> = {};

      usersData.forEach((u) => {
        if (u && u.user_id) {
          map.set(u.user_id, u);
          initialAnim[u.user_id] = { lat: u.latitude, lng: u.longitude, heading: u.heading || 0 };
          previousCoordsRef.current[u.user_id] = { lat: u.latitude, lng: u.longitude, heading: u.heading || 0 };
          if (u.history && u.history.length > 0) {
            hMap.set(u.user_id, u.history);
          }
        }
      });

      setUsersMap(map);
      setHistoryMap(hMap);
      setAnimatedCoords(initialAnim);
      setGeofences(geoData);
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn('[useLiveLocations] Real-time sync warning:', err);
    }
  }, []);

  // Initial fetch of data from Python backend
  useEffect(() => {
    refreshLocations();
  }, [refreshLocations]);

  // Subscribe to real-time WebSocket events
  useEffect(() => {
    const unsubStatus = realtimeWebSocket.onStatusChange((status, detail) => {
      setConnectionState(status);
      setConnectionDetail(detail || '');
    });

    const unsubMsg = realtimeWebSocket.onMessage((msg: any) => {
      const eventType = msg.event || msg.type;

      if (eventType === 'LOCATION_UPDATE' || eventType === 'TELEMETRY_UPDATE') {
        const loc = msg.data || msg;
        if (loc && (loc.user_id || loc.id) && loc.latitude !== undefined && loc.longitude !== undefined) {
          handleLocationUpdate({
            ...loc,
            user_id: loc.user_id || loc.id,
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            accuracy: Number(loc.accuracy || 5.0),
            speed: Number(loc.speed || 0.0),
            heading: Number(loc.heading || 0.0),
          });
        }
      } else if (eventType === 'INITIAL_SNAPSHOT') {
        if (msg.data && msg.data.locations) {
          msg.data.locations.forEach((loc: UserLocation) => handleLocationUpdate(loc));
        }
        if (msg.data && msg.data.geofences) {
          setGeofences(msg.data.geofences);
        }
      } else if (eventType === 'PERSON_ENROLLED' || eventType === 'USER_ENROLLED') {
        // Immediate real-time sync when a person is enrolled anywhere
        refreshLocations();
      } else if (eventType === 'PERSON_DELETED' || eventType === 'USER_DELETED') {
        const delId = msg.data?.person_id || msg.data?.id || msg.data?.user_id;
        if (delId) {
          setUsersMap((prev) => {
            const next = new Map(prev);
            next.delete(delId);
            return next;
          });
          setHistoryMap((prev) => {
            const next = new Map(prev);
            next.delete(delId);
            return next;
          });
          setAnimatedCoords((prev) => {
            const next = { ...prev };
            delete next[delId];
            return next;
          });
          setGeofences((prev) => prev.filter((g) => g.person_id !== delId && g.id !== `geo-${delId.toLowerCase()}`));
          setSelectedUserId((curr) => (curr === delId ? null : curr));
        }
        refreshLocations();
      } else if (eventType === 'USER_DISCONNECTED') {
        const discUserId = msg.data?.user_id;
        if (discUserId) {
          setUsersMap((prev) => {
            const next = new Map(prev);
            const user = next.get(discUserId);
            if (user) {
              next.set(discUserId, { ...user, status: 'offline', computed_status: 'OFFLINE' });
            }
            return next;
          });
        }
      } else if (eventType === 'GEOFENCE_CREATED') {
        setGeofences((prev) => {
          if (prev.some((g) => g.id === msg.data.id)) return prev;
          return [msg.data, ...prev];
        });
      } else if (eventType === 'GEOFENCE_DELETED') {
        setGeofences((prev) => prev.filter((g) => g.id !== msg.data.id));
      }
    });

    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [handleLocationUpdate, refreshLocations]);

  // Sync time clock ticker (updates every second)
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      setSyncSecondsAgo(Math.max(0, diff));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // Compute operational overview stats
  const stats = useMemo<TrackingStats>(() => {
    let live = 0;
    let offline = 0;
    let error = 0;

    usersMap.forEach((u) => {
      const status = u.computed_status || (u.accuracy > 50 ? 'GPS ERROR' : u.status === 'offline' ? 'OFFLINE' : 'LIVE');
      if (status === 'LIVE' || status === 'RECENT') live++;
      else if (status === 'GPS ERROR') error++;
      else offline++;
    });

    return {
      totalUsers: usersMap.size,
      liveCount: live,
      offlineCount: offline,
      gpsErrorCount: error,
    };
  }, [usersMap]);

  // Actions
  const selectUser = useCallback((userId: string | null, enableTracking = true) => {
    setSelectedUserId(userId);
    if (userId && enableTracking) {
      setIsLiveTracking(true);
    }
  }, []);

  const stopFollowing = useCallback(() => {
    setIsLiveTracking(false);
  }, []);

  const toggleBrowserGps = useCallback((userId = 'BROWSER_DEVICE_01') => {
    if (isBrowserGpsActive) {
      locationService.stopBrowserTracking();
      setIsBrowserGpsActive(false);
      setGpsErrorMessage(null);
    } else {
      setGpsErrorMessage(null);
      locationService.startBrowserTracking(
        userId,
        (loc) => {
          setIsBrowserGpsActive(true);
          handleLocationUpdate(loc);
        },
        (err) => {
          setGpsErrorMessage(err);
          setIsBrowserGpsActive(false);
        }
      );
    }
  }, [isBrowserGpsActive, handleLocationUpdate]);

  const toggleSimulation = useCallback((userId = 'USER001') => {
    if (isSimulating) {
      locationService.stopSimulation();
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      locationService.startSimulation(userId, 3000, (loc) => {
        handleLocationUpdate(loc);
      });
    }
  }, [isSimulating, handleLocationUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      locationService.stopBrowserTracking();
      locationService.stopSimulation();
      Object.values(animationFramesRef.current).forEach((frameId) => cancelAnimationFrame(frameId));
    };
  }, []);

  return {
    usersMap,
    usersList: Array.from(usersMap.values()),
    animatedCoords,
    historyMap,
    geofences,
    selectedUserId,
    selectedUser: selectedUserId ? usersMap.get(selectedUserId) || null : null,
    isLiveTracking,
    showRoute,
    setShowRoute,
    connectionState,
    connectionDetail,
    syncSecondsAgo,
    stats,
    isBrowserGpsActive,
    isSimulating,
    gpsErrorMessage,
    selectUser,
    stopFollowing,
    toggleBrowserGps,
    toggleSimulation,
    refreshLocations,
  };
}
