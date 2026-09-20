import { MonitoredUser, Alert, Geofence } from '../types';
import { isInsideGeofence, calculateBearing } from './geofence';

type LocationUpdateListener = (updatedUsers: MonitoredUser[]) => void;
type AlertListener = (newAlert: Alert) => void;

class DemoSimulationEngine {
  private users: MonitoredUser[] = [];
  private geofences: Geofence[] = [];
  private updateListeners: Set<LocationUpdateListener> = new Set();
  private alertListeners: Set<AlertListener> = new Set();
  private intervalTimer: any = null;
  private isRunning: boolean = false;
  private isInitialized: boolean = false;

  // Track waypoint direction for each user to simulate natural patrol walking/driving
  private userDirections: Record<string, { latStep: number; lngStep: number; stepsRemaining: number }> = {};

  public initialize(initialUsers: MonitoredUser[], initialGeofences: Geofence[]) {
    if (this.isInitialized && this.users.length > 0) return;
    this.users = JSON.parse(JSON.stringify(initialUsers));
    this.geofences = JSON.parse(JSON.stringify(initialGeofences));
    this.isInitialized = true;

    // Initialize random walk vectors
    this.users.forEach((u) => {
      this.resetUserStepVector(u.id);
    });
  }

  private resetUserStepVector(userId: string) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = 0.00008 + Math.random() * 0.0001; // ~8m - 12m per tick
    this.userDirections[userId] = {
      latStep: Math.sin(angle) * speed,
      lngStep: Math.cos(angle) * speed,
      stepsRemaining: 15 + Math.floor(Math.random() * 20),
    };
  }

  public subscribeLocation(listener: LocationUpdateListener): () => void {
    this.updateListeners.add(listener);
    if (this.users.length > 0) {
      listener(this.users);
    }
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  public subscribeAlerts(listener: AlertListener): () => void {
    this.alertListeners.add(listener);
    return () => {
      this.alertListeners.delete(listener);
    };
  }

  public start(tickMs: number = 1800) {
    if (this.isRunning) return;
    this.isRunning = true;

    // Real-time continuous telemetry tick (1.8 seconds)
    this.intervalTimer = setInterval(() => {
      this.tick();
    }, tickMs);
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
  }

  public getIsRunning() {
    return this.isRunning;
  }

  /**
   * Directly inject a real-time GPS coordinate update (e.g. from device GPS or Supabase)
   */
  public pushLiveLocation(
    userId: string,
    lat: number,
    lng: number,
    accuracy: number = 6.0,
    speed: number = 1.2,
    heading: number = 0
  ) {
    // Validate coordinate boundaries (-90 to 90 lat, -180 to 180 lng)
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      console.warn(`[Telemetry Engine] Discarded invalid GPS packet: lat=${lat}, lng=${lng}`);
      return;
    }

    const userIndex = this.users.findIndex((u) => u.id === userId || u.officer_id === userId);
    if (userIndex === -1) return;

    const user = this.users[userIndex];
    let geofenceStatus = user.geofence_status;

    if (user.assigned_geofence) {
      const check = isInsideGeofence(
        lat,
        lng,
        user.assigned_geofence.center_latitude,
        user.assigned_geofence.center_longitude,
        user.assigned_geofence.radius_meters
      );
      geofenceStatus = check.isInside ? 'INSIDE' : 'OUTSIDE';

      // If breach just occurred, send alert
      if (!check.isInside && user.geofence_status === 'INSIDE') {
        const breachAlert: Alert = {
          id: `alt-breach-live-${Date.now()}`,
          user_id: user.id,
          user_name: user.full_name,
          officer_id: user.officer_id,
          severity: 'CRITICAL',
          alert_type: 'GEOFENCE_BREACH',
          title: '🚨 LIVE PERIMETER BREACH DETECTED',
          description: `Officer ${user.full_name} (${user.officer_id}) has exited authorized perimeter by ${Math.abs(check.deltaMeters)} meters.`,
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        };
        this.alertListeners.forEach((l) => l(breachAlert));
      }
    }

    const updatedUser: MonitoredUser = {
      ...user,
      status: 'ACTIVE',
      geofence_status: geofenceStatus,
      current_location: {
        latitude: lat,
        longitude: lng,
        accuracy,
        speed,
        heading,
        last_updated: new Date().toISOString(),
      },
    };

    this.users[userIndex] = updatedUser;
    this.updateListeners.forEach((listener) => listener([...this.users]));
  }

  private tick() {
    let hasChanges = false;

    this.users = this.users.map((user) => {
      // Only active users naturally drift along patrol routes
      if (user.status !== 'ACTIVE' || !user.current_location) {
        return user;
      }

      // If outside geofence in simulation breach mode, keep moving outward or slowly wander
      let vector = this.userDirections[user.id];
      if (!vector || vector.stepsRemaining <= 0) {
        this.resetUserStepVector(user.id);
        vector = this.userDirections[user.id];
      }
      vector.stepsRemaining -= 1;

      const oldLat = user.current_location.latitude;
      const oldLng = user.current_location.longitude;

      let newLat = Number((oldLat + vector.latStep).toFixed(6));
      let newLng = Number((oldLng + vector.lngStep).toFixed(6));

      // Calculate geofence status
      let geofenceStatus = user.geofence_status;
      if (user.assigned_geofence && user.geofence_status !== 'OUTSIDE') {
        const check = isInsideGeofence(
          newLat,
          newLng,
          user.assigned_geofence.center_latitude,
          user.assigned_geofence.center_longitude,
          user.assigned_geofence.radius_meters - 10
        );

        // If approaching perimeter wall, reflect direction back inward to keep normal patrol safe
        if (!check.isInside) {
          vector.latStep = -vector.latStep;
          vector.lngStep = -vector.lngStep;
          newLat = Number((oldLat + vector.latStep).toFixed(6));
          newLng = Number((oldLng + vector.lngStep).toFixed(6));
        }
      }

      const newHeading = Math.round(calculateBearing(oldLat, oldLng, newLat, newLng));
      const newSpeed = Number((1.1 + Math.random() * 1.8).toFixed(1));
      const newAccuracy = Number((5.2 + Math.random() * 2.8).toFixed(1));

      hasChanges = true;

      return {
        ...user,
        current_location: {
          latitude: newLat,
          longitude: newLng,
          accuracy: newAccuracy,
          speed: newSpeed,
          heading: newHeading,
          last_updated: new Date().toISOString(),
        },
      };
    });

    if (hasChanges) {
      this.updateListeners.forEach((listener) => listener([...this.users]));
    }
  }

  /**
   * Triggers a live geofence violation simulation for presentation demo
   */
  public triggerGeofenceViolation(targetUserId: string = 'usr-1024'): {
    user: MonitoredUser;
    alert: Alert;
  } {
    const userIndex = this.users.findIndex((u) => u.id === targetUserId);
    if (userIndex === -1) throw new Error('User not found in simulation');

    const user = this.users[userIndex];
    const geofence = user.assigned_geofence || this.geofences[0];

    // Position outside geofence boundary (+ 0.0095 deg ~ 1000m outward)
    const outsideLat = Number((geofence.center_latitude + 0.0095).toFixed(6));
    const outsideLng = Number((geofence.center_longitude + 0.0095).toFixed(6));

    const updatedUser: MonitoredUser = {
      ...user,
      status: 'ACTIVE',
      geofence_status: 'OUTSIDE',
      current_location: {
        latitude: outsideLat,
        longitude: outsideLng,
        accuracy: 16.5,
        speed: 4.8,
        heading: 42,
        last_updated: new Date().toISOString(),
      },
    };

    this.users[userIndex] = updatedUser;

    const breachAlert: Alert = {
      id: `alt-breach-${Date.now()}`,
      user_id: user.id,
      user_name: user.full_name,
      officer_id: user.officer_id,
      severity: 'CRITICAL',
      alert_type: 'GEOFENCE_BREACH',
      title: '🚨 CRITICAL: Unauthorized Geofence Breach',
      description: `Officer ${user.full_name} (${user.officer_id}) has crossed perimeter boundary of ${geofence.name}. Current delta: +412m outside perimeter.`,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    this.updateListeners.forEach((l) => l([...this.users]));
    this.alertListeners.forEach((l) => l(breachAlert));

    return { user: updatedUser, alert: breachAlert };
  }

  /**
   * Resets a user back into safe geofence status
   */
  public restoreSafeGeofence(targetUserId: string = 'usr-1024') {
    const userIndex = this.users.findIndex((u) => u.id === targetUserId);
    if (userIndex === -1) return;

    const user = this.users[userIndex];
    const geofence = user.assigned_geofence || this.geofences[0];

    const safeLat = Number((geofence.center_latitude + 0.0005).toFixed(6));
    const safeLng = Number((geofence.center_longitude + 0.0005).toFixed(6));

    const updatedUser: MonitoredUser = {
      ...user,
      geofence_status: 'INSIDE',
      current_location: {
        latitude: safeLat,
        longitude: safeLng,
        accuracy: 6.8,
        speed: 1.1,
        heading: 180,
        last_updated: new Date().toISOString(),
      },
    };

    this.users[userIndex] = updatedUser;
    this.resetUserStepVector(targetUserId);
    this.updateListeners.forEach((l) => l([...this.users]));
  }
}

export const demoEngine = new DemoSimulationEngine();
