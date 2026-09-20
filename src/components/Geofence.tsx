// ========================================================================
// GEOFENCE VISUALIZATION COMPONENT
// ========================================================================
import React from 'react';
import { Circle, Popup } from 'react-leaflet';
import { CircularGeofence } from '../types/location';
import { ShieldCheck } from 'lucide-react';

interface GeofenceProps {
  geofence: CircularGeofence;
}

export const GeofenceOverlay: React.FC<GeofenceProps> = ({ geofence }) => {
  return (
    <Circle
      center={[geofence.center_latitude, geofence.center_longitude]}
      radius={geofence.radius_meters}
      pathOptions={{
        color: '#3b82f6',        // Blue border
        fillColor: '#2563eb',    // Blue fill
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6',
      }}
    >
      <Popup className="custom-leaflet-popup">
        <div className="p-1 min-w-[200px] text-slate-100 font-sans text-xs">
          <div className="flex items-center space-x-2 border-b border-slate-700/80 pb-1.5 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-white text-xs">{geofence.name}</span>
          </div>

          <div className="space-y-1 text-[11px] text-slate-300">
            <div>
              <span className="text-slate-400">Department:</span> {geofence.department || 'Command Center'}
            </div>
            <div>
              <span className="text-slate-400">Radius:</span>{' '}
              <span className="font-mono font-bold text-blue-400">{geofence.radius_meters} meters</span>
            </div>
            {geofence.description && (
              <p className="text-[10px] text-slate-400 mt-1 italic">{geofence.description}</p>
            )}
          </div>
        </div>
      </Popup>
    </Circle>
  );
};
