// ========================================================================
// LOCATION SERVICE (NATIVE BROWSER GEOLOCATION & REALISTIC SIMULATOR)
// ========================================================================
import { LocationObject } from '../types/location';
import { apiUpdateLocation } from './api';

export type GeolocationCallback = (loc: LocationObject) => void;
export type GeolocationErrorCallback = (errorMsg: string) => void;

class LocationService {
  private watchId: number | null = null;
  private simulationTimer: any = null;
  private simulationIndex = 0;
  private isSimulating = false;

  // Realistic simulation trajectory waypoints (Coimbatore Smart City Corridor)
  private simulationWaypoints = [
    { lat: 11.0168, lng: 76.9558, speed: 12.5, accuracy: 4.8 },
    { lat: 11.0170, lng: 76.9560, speed: 18.2, accuracy: 4.5 },
    { lat: 11.0174, lng: 76.9567, speed: 22.0, accuracy: 4.2 },
    { lat: 11.0179, lng: 76.9574, speed: 26.5, accuracy: 3.9 },
    { lat: 11.0186, lng: 76.9583, speed: 29.0, accuracy: 4.1 },
    { lat: 11.0194, lng: 76.9592, speed: 31.4, accuracy: 4.0 },
    { lat: 11.0203, lng: 76.9602, speed: 28.0, accuracy: 4.6 },
    { lat: 11.0211, lng: 76.9613, speed: 24.5, accuracy: 5.0 },
    { lat: 11.0220, lng: 76.9624, speed: 20.0, accuracy: 5.2 },
    { lat: 11.0215, lng: 76.9635, speed: 16.0, accuracy: 4.9 },
    { lat: 11.0205, lng: 76.9644, speed: 19.5, accuracy: 4.3 },
    { lat: 11.0192, lng: 76.9638, speed: 25.0, accuracy: 4.0 },
    { lat: 11.0181, lng: 76.9626, speed: 22.0, accuracy: 4.4 },
    { lat: 11.0172, lng: 76.9610, speed: 15.0, accuracy: 4.7 },
  ];

  /**
   * Start tracking browser's native GPS hardware using high accuracy watchPosition.
   */
  public startBrowserTracking(
    userId: string,
    onSuccess: GeolocationCallback,
    onError: GeolocationErrorCallback
  ) {
    if (!('geolocation' in navigator)) {
      onError('Geolocation API is not supported by this browser.');
      return;
    }

    this.stopBrowserTracking();

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    };

    this.watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const speedKmh = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6 * 10) / 10 : 0;
        const headingDeg = pos.coords.heading !== null && !isNaN(pos.coords.heading) ? pos.coords.heading : 0;

        const locPayload: LocationObject = {
          user_id: userId,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
          accuracy: parseFloat(pos.coords.accuracy.toFixed(1)),
          speed: speedKmh,
          heading: Math.round(headingDeg),
          timestamp: new Date(pos.timestamp).toISOString(),
          status: 'online',
        };

        try {
          // Push directly to FastAPI backend
          await apiUpdateLocation(locPayload);
          onSuccess(locPayload);
        } catch (err: any) {
          console.warn('[LocationService] Failed to send browser GPS to backend:', err);
          onSuccess(locPayload); // Still provide local feedback
        }
      },
      (err) => {
        let message = 'An unknown GPS error occurred.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            message = 'GPS permission denied. Please allow location access in your browser.';
            break;
          case err.POSITION_UNAVAILABLE:
            message = 'GPS signal unavailable. Ensure device location services are enabled.';
            break;
          case err.TIMEOUT:
            message = 'GPS acquisition timed out. Re-acquiring satellite fix...';
            break;
        }
        onError(message);
      },
      options
    );
  }

  /**
   * Stop browser geolocation watcher.
   */
  public stopBrowserTracking() {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Calculate forward azimuth heading in degrees between two points.
   */
  private calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return Math.round((brng + 360) % 360);
  }

  /**
   * Start live simulated moving user (e.g. USER001 moving in real time).
   */
  public startSimulation(
    userId = 'USER001',
    intervalMs = 3000,
    onStep: (loc: LocationObject) => void
  ) {
    this.stopSimulation();
    this.isSimulating = true;
    this.simulationIndex = 0;

    const step = async () => {
      if (!this.isSimulating) return;

      const curr = this.simulationWaypoints[this.simulationIndex];
      const nextIndex = (this.simulationIndex + 1) % this.simulationWaypoints.length;
      const next = this.simulationWaypoints[nextIndex];

      const heading = this.calculateHeading(curr.lat, curr.lng, next.lat, next.lng);

      const locPayload: LocationObject = {
        user_id: userId,
        latitude: curr.lat,
        longitude: curr.lng,
        accuracy: curr.accuracy,
        speed: curr.speed,
        heading: heading,
        timestamp: new Date().toISOString(),
        status: 'online',
      };

      try {
        await apiUpdateLocation(locPayload);
        onStep(locPayload);
      } catch (e) {
        console.warn('[LocationService Simulator] Step failed:', e);
        onStep(locPayload);
      }

      this.simulationIndex = nextIndex;
      this.simulationTimer = setTimeout(step, intervalMs);
    };

    step();
  }

  /**
   * Stop active simulation.
   */
  public stopSimulation() {
    this.isSimulating = false;
    if (this.simulationTimer) {
      clearTimeout(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  public isSimRunning(): boolean {
    return this.isSimulating;
  }

  public isBrowserTrackingActive(): boolean {
    return this.watchId !== null;
  }
}

export const locationService = new LocationService();
