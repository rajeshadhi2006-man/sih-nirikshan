import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from '../types';
import { apiFetchAlerts, apiAcknowledgeAlert, realtimeWS } from '../lib/api';
import { alertsApi } from '../api/alerts';
import { INITIAL_ALERTS } from '../lib/demoData';

interface NotificationContextType {
  alerts: Alert[];
  unreadCount: number;
  activeCount: number;
  criticalCount: number;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  acknowledgeAlert: (alertId: string, officerName?: string) => void;
  resolveAlert: (alertId: string) => void;
  addAlert: (alert: Alert) => void;
  clearAllAlerts: () => void;
  deleteAllAlerts: (status?: string) => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const unreadCount = alerts.filter((a) => a.status === 'ACTIVE').length;
  const criticalCount = alerts.filter(
    (a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE'
  ).length;

  const playAlertSound = (severity: 'CRITICAL' | 'WARNING' | 'INFO') => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

      if (severity === 'CRITICAL') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc1.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.18);
        osc1.frequency.linearRampToValueAtTime(750, audioCtx.currentTime + 0.38);
        osc2.frequency.setValueAtTime(440, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.start();
        osc2.start();
        osc1.stop(audioCtx.currentTime + 0.4);
        osc2.stop(audioCtx.currentTime + 0.4);
      } else if (severity === 'WARNING') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(620, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(520, audioCtx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  // Fetch initial alerts from Python backend & subscribe to real-time WebSocket
  useEffect(() => {
    apiFetchAlerts()
      .then((data) => {
        if (Array.isArray(data)) setAlerts(data);
        else setAlerts([]);
      })
      .catch(() => {
        setAlerts([]);
      });

    const unsubscribe = realtimeWS.subscribe((eventData) => {
      const { event, data } = eventData;

      if (event === 'INITIAL_SNAPSHOT') {
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      } else if (event === 'ALERT_NEW') {
        setAlerts((prev) => {
          if (prev.some((a) => a.id === data.id)) return prev;
          return [data, ...prev];
        });
        playAlertSound(data.severity);
      } else if (event === 'ALERT_ACKNOWLEDGED') {
        setAlerts((prev) =>
          prev.map((a) => (a.id === data.id ? { ...a, status: 'ACKNOWLEDGED' } : a))
        );
      } else if (event === 'ALERTS_CLEARED') {
        const clearedStatus = data?.status;
        if (!clearedStatus || clearedStatus === 'ALL') {
          setAlerts([]);
        } else {
          setAlerts((prev) => prev.filter((a) => a.status !== clearedStatus));
        }
      } else if (event === 'ALERT_DELETED') {
        setAlerts((prev) => prev.filter((a) => a.id !== data?.alert_id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const addAlert = (newAlert: Alert) => {
    setAlerts((prev) => {
      const exists = prev.find(
        (a) =>
          a.user_id === newAlert.user_id &&
          a.alert_type === newAlert.alert_type &&
          Date.now() - new Date(a.created_at).getTime() < 30000
      );
      if (exists) return prev;
      return [newAlert, ...prev];
    });
    playAlertSound(newAlert.severity);
  };

  const acknowledgeAlert = (alertId: string, officerName?: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'ACKNOWLEDGED',
              acknowledged_by: officerName || 'Command Officer',
              acknowledged_at: new Date().toISOString(),
            }
          : a
      )
    );
    apiAcknowledgeAlert(alertId).catch(() => {});
  };

  const resolveAlert = (alertId: string) => {
    // Optimistic local update
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === alertId
          ? {
              ...a,
              status: 'RESOLVED',
            }
          : a
      )
    );
    // Persist to backend: PUT /api/alerts/{id}/resolve
    alertsApi.resolveAlert(alertId).catch(() => {
      // Silently handle — optimistic update already applied
    });
  };

  const deleteAlert = async (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await alertsApi.deleteAlert(alertId);
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const deleteAllAlerts = async (status?: string) => {
    if (!status || status === 'ALL') {
      setAlerts([]);
    } else {
      setAlerts((prev) => prev.filter((a) => a.status !== status));
    }
    try {
      await alertsApi.deleteAllAlerts(status);
    } catch (err) {
      console.error('Failed to delete all alerts:', err);
    }
  };

  const clearAllAlerts = () => {
    deleteAllAlerts('ALL');
  };

  return (
    <NotificationContext.Provider
      value={{
        alerts,
        unreadCount,
        activeCount: unreadCount,
        criticalCount,
        soundEnabled,
        setSoundEnabled,
        acknowledgeAlert,
        resolveAlert,
        addAlert,
        clearAllAlerts,
        deleteAllAlerts,
        deleteAlert,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
