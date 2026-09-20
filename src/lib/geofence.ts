// ========================================================================
// GEODESIC & GEOFENCE UTILITIES (Haversine Formula)
// ========================================================================

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula.
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Evaluates whether a coordinate point falls inside a circular geofence boundary.
 */
export function isInsideGeofence(
  userLat: number,
  userLng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  bufferMeters: number = 0
): { isInside: boolean; distanceMeters: number; deltaMeters: number } {
  const distance = calculateDistanceMeters(userLat, userLng, centerLat, centerLng);
  const effectiveRadius = radiusMeters + bufferMeters;
  const isInside = distance <= effectiveRadius;

  return {
    isInside,
    distanceMeters: Math.round(distance),
    deltaMeters: Math.round(distance - radiusMeters),
  };
}

/**
 * Calculates the forward azimuth / bearing between two points in degrees (0 - 360).
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (toDegrees(theta) + 360) % 360;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Formats decimal coordinates into official government standard notation.
 */
export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
}

/**
 * Formats relative time elapsed (e.g. '3 sec ago', '2 min ago')
 */
export function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
