import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Layers,
  Plus,
  Shield,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  Maximize2,
  Crosshair,
  Compass,
  Radio,
  Sliders,
  Target,
  Zap,
  Check,
  X,
  UserPlus,
  UserCheck,
  Search,
} from 'lucide-react';
import L from 'leaflet';
import { useMonitoring } from '../context/MonitoringContext';
import { useAuth } from '../context/AuthContext';
import { Geofence } from '../types';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { Modal } from '../components/common/Modal';
import { EnrollmentModal } from '../components/EnrollmentModal';
import { formatCoordinates } from '../lib/geofence';
import { isValidCoordinate } from '../components/map/LiveMap';
import { apiCheckGeofence } from '../lib/api';
import { personsApi, Person } from '../api/persons';

// =====================================================================
// MAP FLY-TO CONTROLLER (for place search)
// =====================================================================
function MapFlyToGeo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 16, { animate: true, duration: 1.2 });
  }, [target, map]);
  return null;
}

// =====================================================================
// NOMINATIM GEOCODER TYPE
// =====================================================================
interface NominatimHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
}

// =====================================================================
// GEO MAP SEARCH BAR (floating overlay)
// =====================================================================
function GeoMapSearchBar({ onSelect }: { onSelect: (lat: number, lng: number, name: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<NominatimHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selIdx, setSelIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setHits([]); setOpen(false); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=0`,
        { headers: { 'Accept-Language': 'en', 'User-Agent': 'SIH-Geofences/1.0' } }
      );
      const data: NominatimHit[] = await res.json();
      setHits(data);
      setOpen(data.length > 0);
      setSelIdx(-1);
      if (data.length === 0) setErr('No places found.');
    } catch { setErr('Search failed.'); setOpen(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setHits([]); setOpen(false); setErr(''); return; }
    timerRef.current = setTimeout(() => doSearch(q), 430);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q, doSearch]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setFocused(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function kbNav(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setSelIdx(i => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')  { e.preventDefault(); const i = selIdx >= 0 ? selIdx : 0; if (hits[i]) pick(hits[i]); }
    else if (e.key === 'Escape') setOpen(false);
  }

  function pick(r: NominatimHit) {
    const short = r.display_name.split(',').slice(0, 2).join(', ');
    setQ(short); setOpen(false);
    onSelect(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
  }

  function typeIcon(r: NominatimHit) {
    const t = (r.type || r.class || '').toLowerCase();
    if (t.includes('city') || t.includes('town'))   return '🏙️';
    if (t.includes('village'))                       return '🏘️';
    if (t.includes('state') || t.includes('region')) return '🗺️';
    if (t.includes('country'))                       return '🌏';
    if (t.includes('road') || t.includes('street'))  return '🛣️';
    if (t.includes('hospital'))                      return '🏥';
    if (t.includes('school') || t.includes('university')) return '🎓';
    if (t.includes('park') || t.includes('forest'))  return '🌿';
    if (t.includes('station'))                       return '🚉';
    if (t.includes('water') || t.includes('river'))  return '💧';
    return '📍';
  }

  return (
    <div
      ref={wrapRef}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-sm px-3"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Input */}
      <div className={`flex items-center gap-2 bg-slate-900/95 backdrop-blur-lg border ${
        focused ? 'border-blue-500 shadow-lg shadow-blue-900/30' : 'border-slate-700'
      } rounded-xl px-3 py-2 transition shadow-2xl`}>
        {loading
          ? <svg className="w-4 h-4 text-blue-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="15"/></svg>
          : <Search className="w-4 h-4 text-slate-400 shrink-0" />}
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { setFocused(true); if (hits.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={kbNav}
          placeholder="Search location on map..."
          className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none font-sans"
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button
            onClick={() => { setQ(''); setHits([]); setOpen(false); setErr(''); inputRef.current?.focus(); }}
            className="text-slate-500 hover:text-white transition p-0.5"
            tabIndex={-1}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && hits.length > 0 && (
        <div className="mt-1 bg-slate-900/98 backdrop-blur-xl border border-slate-700 rounded-xl overflow-hidden shadow-2xl divide-y divide-slate-800">
          {hits.map((r, i) => {
            const short = r.display_name.split(',').slice(0, 2).join(', ');
            const ctx   = r.display_name.split(',').slice(2, 4).join(', ');
            return (
              <button
                key={r.place_id}
                onClick={() => pick(r)}
                className={`w-full text-left px-3 py-2 flex items-start gap-2 transition ${
                  i === selIdx ? 'bg-blue-600/30 text-white' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <span className="text-sm shrink-0 mt-0.5">{typeIcon(r)}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{short}</div>
                  {ctx && <div className="text-[10px] text-slate-500 truncate">{ctx.trim()}</div>}
                </div>
                <span className="ml-auto shrink-0 text-[10px] font-mono text-slate-600">
                  {parseFloat(r.lat).toFixed(2)}, {parseFloat(r.lon).toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {!open && err && q.length >= 2 && !loading && (
        <div className="mt-1 bg-slate-900/95 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-slate-400 text-center shadow-xl">
          {err}
        </div>
      )}
    </div>
  );
}

// Interactive Pin Marker Icon
const createPinMarkerIcon = () =>
  L.divIcon({
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(6, 182, 212, 0.45); animation: pulse-ring 1.8s infinite;"></div>
        <div style="
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #0284c7;
          border: 2.5px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.7);
          color: white;
          cursor: grab;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="22" y1="12" x2="18" y2="12"></line>
            <line x1="6" y1="12" x2="2" y2="12"></line>
            <line x1="12" y1="6" x2="12" y2="2"></line>
            <line x1="12" y1="22" x2="12" y2="18"></line>
          </svg>
        </div>
      </div>
    `,
    className: 'custom-pin-marker',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });

// Map click event interceptor for click-to-pin
function MapPinClickHandler({
  isPinning,
  onMapClick,
}: {
  isPinning: boolean;
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (isPinning) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export const Geofences: React.FC = () => {
  const { geofences, addGeofence, deleteGeofence, users, refreshData } = useMonitoring();
  const { hasRole } = useAuth();
  const canModify = hasRole(['SUPER_ADMIN', 'ADMIN']);

  // ── Search & Filter state ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'all' | 'active' | 'breach' | 'unassigned'>('all');

  // ── Map place-search state ─────────────────────────────────
  const [mapSearchTarget, setMapSearchTarget] = useState<[number, number] | null>(null);
  const [mapSearchPin, setMapSearchPin] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const mapSearchPinIcon = L.divIcon({
    html: `<div style="background:linear-gradient(135deg,#6366f1,#2563eb);color:white;font-size:10px;font-weight:900;padding:3px 9px;border-radius:12px;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.5);text-align:center;letter-spacing:0.5px;white-space:nowrap;">📍 LOCATION</div>`,
    className: 'geo-search-pin',
    iconSize: [100, 24],
    iconAnchor: [50, 12],
    popupAnchor: [0, -16],
  });
  function handleMapPlaceSelect(lat: number, lng: number, name: string) {
    setMapSearchTarget([lat, lng]);
    setMapSearchPin({ lat, lng, name });
  }

  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [enrolledPersons, setEnrolledPersons] = useState<Person[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');

  const loadPersons = async () => {
    try {
      const data = await personsApi.getPersons();
      setEnrolledPersons(data);
      if (data.length > 0 && !selectedPersonId) {
        setSelectedPersonId(data[0].person_id);
      }
      if (data.length > 0 && !pinPersonId) {
        setPinPersonId(data[0].person_id);
      }
    } catch (err) {
      console.warn('Failed to load enrolled persons:', err);
    }
  };

  useEffect(() => {
    loadPersons();
  }, []);

  const handleEnrollSuccess = async (enrolled: any) => {
    if (refreshData) {
      await refreshData();
    }
    await loadPersons();
    setPinNotice(`🟢 Real-Time Officer "${enrolled?.name || 'Officer'}" & Geofence enrolled & active live on map!`);
    setTimeout(() => setPinNotice(null), 6000);
  };

  const handlePersonSelect = (personId: string) => {
    setSelectedPersonId(personId);
    const person = enrolledPersons.find((p) => p.person_id === personId);
    if (person) {
      if (person.assigned_area) {
        setName(person.assigned_area);
      } else {
        setName(`${person.full_name}'s Working Zone`);
      }
      if (person.organization) {
        setDepartment(person.organization);
      }
      if (person.current_location) {
        setCenterLat(person.current_location.latitude.toFixed(6));
        setCenterLng(person.current_location.longitude.toFixed(6));
      }
    }
  };

  const requestRealGpsForModal = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCenterLat(pos.coords.latitude.toFixed(6));
          setCenterLng(pos.coords.longitude.toFixed(6));
        },
        (err) => {
          alert(`GPS Permission / Fix Error: ${err.message}`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      alert('Device geolocation not supported.');
    }
  };

  const [department, setDepartment] = useState('Administration');
  const [description, setDescription] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [radiusMeters, setRadiusMeters] = useState('500');

  // Geofence Coordinate Verification Tester State
  const [testLat, setTestLat] = useState('');
  const [testLng, setTestLng] = useState('');
  const [testBuffer, setTestBuffer] = useState('25');
  const [testGeoId, setTestGeoId] = useState<string>('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Interactive Map Pinning & Real-Time Geofence Builder State
  const [isPinMode, setIsPinMode] = useState(false);
  const [pinnedCoord, setPinnedCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [pinRadius, setPinRadius] = useState<number>(500);
  const [pinName, setPinName] = useState<string>('');
  const [pinDept, setPinDept] = useState<string>('Field Operations');
  const [pinDesc, setPinDesc] = useState<string>('');
  const [pinPersonId, setPinPersonId] = useState<string>('');
  const [isActivatingPin, setIsActivatingPin] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);

  const handleMapPinClick = (lat: number, lng: number) => {
    setPinnedCoord({ lat, lng });
    if (!pinName) {
      setPinName(`Perimeter Zone ${geofences.length + 1}`);
    }
  };

  const handleActivatePinnedGeofence = async () => {
    if (!pinnedCoord) return;
    setIsActivatingPin(true);
    try {
      const targetPerson = enrolledPersons.find((p) => p.person_id === pinPersonId);
      await addGeofence({
        name: pinName.trim() || `${targetPerson?.full_name || 'Operational'} Perimeter`,
        person_id: pinPersonId || targetPerson?.person_id || undefined,
        area_name: pinName.trim() || `${targetPerson?.full_name || 'Operational'} Working Area`,
        department: pinDept,
        description:
          pinDesc.trim() ||
          `Interactive perimeter ${targetPerson?.full_name ? `for ${targetPerson.full_name} ` : ''}centered at ${pinnedCoord.lat.toFixed(5)}, ${pinnedCoord.lng.toFixed(5)} with ${pinRadius}m radius.`,
        center_latitude: parseFloat(pinnedCoord.lat.toFixed(6)),
        center_longitude: parseFloat(pinnedCoord.lng.toFixed(6)),
        radius_meters: pinRadius,
        is_active: true,
        user_count_inside: 0,
        user_count_outside: 0,
      });

      setPinNotice(`🟢 Geofence "${pinName || 'Operational Perimeter'}" (${pinRadius}m) activated live!`);
      setPinnedCoord(null);
      setIsPinMode(false);
      setPinName('');
      setPinDesc('');
      setTimeout(() => setPinNotice(null), 5000);
      await loadPersons();
      if (refreshData) await refreshData();
    } catch (err: any) {
      alert(`Error activating geofence: ${err.message}`);
    } finally {
      setIsActivatingPin(false);
    }
  };

  // Pre-fill live coordinates when modal opens
  const openModalWithLiveCoords = () => {
    requestRealGpsForModal();
    setIsCreateModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !centerLat || !centerLng || !radiusMeters) return;

    try {
      const targetPerson = enrolledPersons.find((p) => p.person_id === selectedPersonId);

      await addGeofence({
        name,
        person_id: selectedPersonId || undefined,
        area_name: name,
        department: department || 'Field Operations',
        description,
        center_latitude: parseFloat(centerLat),
        center_longitude: parseFloat(centerLng),
        radius_meters: parseFloat(radiusMeters),
        is_active: true,
        user_count_inside: 0,
        user_count_outside: 0,
      });

      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
      setSelectedPersonId('');
      await loadPersons();
      if (refreshData) await refreshData();
    } catch (err: any) {
      alert(`Error creating geofence: ${err.message}`);
    }
  };

  const handleRunGeofenceCheck = async () => {
    if (!testLat || !testLng) {
      setTestError('Please specify valid latitude and longitude coordinates.');
      return;
    }
    setTestLoading(true);
    setTestError(null);
    try {
      const res = await apiCheckGeofence({
        latitude: parseFloat(testLat),
        longitude: parseFloat(testLng),
        geofence_id: testGeoId ? testGeoId : undefined,
        buffer_meters: parseFloat(testBuffer) || 0,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestError(err.message || 'Failed to verify geofence coordinate.');
    } finally {
      setTestLoading(false);
    }
  };

  const loadLiveCoordinates = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setTestLat(pos.coords.latitude.toFixed(5));
          setTestLng(pos.coords.longitude.toFixed(5));
          setTestError(null);
        },
        (err) => {
          if (users[0]?.current_location) {
            setTestLat(users[0].current_location.latitude.toFixed(5));
            setTestLng(users[0].current_location.longitude.toFixed(5));
          } else {
            setTestError(`Geolocation: ${err.message}`);
          }
        }
      );
    } else if (users[0]?.current_location) {
      setTestLat(users[0].current_location.latitude.toFixed(5));
      setTestLng(users[0].current_location.longitude.toFixed(5));
    }
  };

  // ── Derived filtered list ──────────────────────────────────
  const filteredGeofences = geofences.filter((geo) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const nameMatch  = geo.name?.toLowerCase().includes(q);
      const deptMatch  = geo.department?.toLowerCase().includes(q);
      const personMatch =
        geo.person_name?.toLowerCase().includes(q) ||
        geo.employee_id?.toLowerCase().includes(q) ||
        geo.person_id?.toLowerCase().includes(q);
      const areaMatch  = geo.area_name?.toLowerCase().includes(q);
      if (!nameMatch && !deptMatch && !personMatch && !areaMatch) return false;
    }
    if (filterChip === 'active')     return geo.is_active !== false;
    if (filterChip === 'breach') {
      return users.some(
        (u) => u.assigned_geofence?.id === geo.id && u.geofence_status === 'OUTSIDE'
      );
    }
    if (filterChip === 'unassigned') return !geo.person_id && !geo.person_name;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">
            Operational Geofence Management
          </h1>
          <p className="text-xs text-slate-400">
            Define, calibrate, and monitor geographic containment zones with geodesic tolerance.
          </p>
        </div>

        {canModify && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsPinMode(true)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-cyan-900/40"
            >
              <MapPin className="w-4 h-4" />
              <span>📍 Pin Geofence on Map</span>
            </button>
            <button
              type="button"
              onClick={openModalWithLiveCoords}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition border border-slate-700 flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual Form</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Geofence Activation Banner */}
      {pinNotice && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-600/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between shadow-lg shadow-emerald-950/40 animate-in fade-in duration-200">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{pinNotice}</span>
          </div>
          <button
            onClick={() => setPinNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid: Left Column Cards List + Right Column Interactive Preview Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Geofences List (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">

          {/* ── Search & Filter Bar ───────────────────────── */}
          <div className="space-y-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, department, or person..."
                className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'all',        label: 'All',        color: 'slate'   },
                { key: 'active',     label: '✅ Active',  color: 'emerald' },
                { key: 'breach',     label: '🚨 Breach',  color: 'red'     },
                { key: 'unassigned', label: '⚠️ No Person', color: 'amber' },
              ] as const).map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setFilterChip(key)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                    filterChip === key
                      ? color === 'emerald'
                        ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                        : color === 'red'
                        ? 'bg-red-600/30 border-red-500 text-red-300'
                        : color === 'amber'
                        ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                        : 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
              {(searchQuery || filterChip !== 'all') && (
                <button
                  onClick={() => { setSearchQuery(''); setFilterChip('all'); }}
                  className="ml-auto text-[10px] text-slate-500 hover:text-white transition underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Count header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Configured Perimeters ({filteredGeofences.length}
              {filteredGeofences.length !== geofences.length && (
                <span className="text-slate-500 font-normal"> of {geofences.length}</span>
              )})
            </span>
            {filteredGeofences.length === 0 && (
              <span className="text-[11px] text-slate-500 italic">No results</span>
            )}
          </div>

          <div className="space-y-3">
            {filteredGeofences.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
                <Search className="w-8 h-8 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-400">No geofences found</p>
                <p className="text-xs text-slate-600 mt-1">
                  {searchQuery ? `No results for "${searchQuery}"` : 'Try a different filter'}
                </p>
                <button
                  onClick={() => { setSearchQuery(''); setFilterChip('all'); }}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <></>
            )}
            {filteredGeofences.map((geo) => {
              const usersInside = users.filter(
                (u) => u.assigned_geofence?.id === geo.id && u.geofence_status === 'INSIDE'
              ).length;
              const usersOutside = users.filter(
                (u) => u.assigned_geofence?.id === geo.id && u.geofence_status === 'OUTSIDE'
              ).length;

              return (
                <div
                  key={geo.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <h3 className="text-sm font-bold text-white leading-tight">{geo.name}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                        <span>{geo.department}</span>
                        {(geo.person_name || geo.person_id) && (
                          <span className="text-cyan-400 font-medium bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                            👤 {geo.person_name || 'Officer'} ({geo.employee_id || geo.person_id})
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ACTIVE
                    </span>
                  </div>

                  {geo.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {geo.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">Center:</span>
                      <span className="text-slate-300">
                        {geo.center_latitude.toFixed(4)}, {geo.center_longitude.toFixed(4)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 block font-sans">Radius:</span>
                      <span className="text-emerald-400 font-bold">{geo.radius_meters} meters</span>
                    </div>
                  </div>

                  {/* Personnel Inside / Outside stats */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <div className="flex items-center space-x-3">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        {usersInside} Inside
                      </span>
                      <span className="text-rose-400 font-semibold flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                        {usersOutside} Breach
                      </span>
                    </div>

                    {canModify && (
                      <button
                        onClick={() => deleteGeofence(geo.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                        title="Delete Geofence"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: OpenStreetMap Geofence Spatial Preview (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-[500px] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Geofence Boundary Map Overview</span>
            </span>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  const next = !isPinMode;
                  setIsPinMode(next);
                  if (!next) {
                    setPinnedCoord(null);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition border shadow ${
                  isPinMode
                    ? 'bg-rose-600/90 hover:bg-rose-600 text-white border-rose-500 shadow-rose-950/40'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500 shadow-blue-900/40'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{isPinMode ? 'Exit Pin Mode' : '📍 Click to Pin on Map'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Pinning Guidance Ribbon */}
          {isPinMode && (
            <div className="px-4 py-2.5 bg-gradient-to-r from-blue-950/90 via-slate-900 to-cyan-950/90 border-b border-blue-800/80 text-blue-200 text-xs flex items-center justify-between animate-in slide-in-from-top duration-150">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>
                  {pinnedCoord
                    ? 'Center pinned! Drag pin on map or adjust radius slider below to fine-tune.'
                    : 'Click anywhere on the map to drop the center point of your new Geofence.'}
                </span>
              </div>
              {pinnedCoord && (
                <span className="font-mono text-[11px] text-cyan-300 font-semibold">
                  {pinnedCoord.lat.toFixed(5)}°, {pinnedCoord.lng.toFixed(5)}°
                </span>
              )}
            </div>
          )}

          <div
            className={`flex-1 w-full min-h-[440px] relative z-0 ${
              isPinMode ? 'cursor-crosshair' : ''
            }`}
          >
            {/* Floating place-search bar */}
            <GeoMapSearchBar onSelect={handleMapPlaceSelect} />

            <MapContainer
              center={
                pinnedCoord
                  ? [pinnedCoord.lat, pinnedCoord.lng]
                  : geofences.length > 0 && isValidCoordinate(geofences[0].center_latitude, geofences[0].center_longitude)
                  ? [geofences[0].center_latitude, geofences[0].center_longitude]
                  : users[0]?.current_location && isValidCoordinate(users[0].current_location.latitude, users[0].current_location.longitude)
                  ? [users[0].current_location.latitude, users[0].current_location.longitude]
                  : [20.5937, 78.9629]
              }
              zoom={geofences.length > 0 || users[0]?.current_location || pinnedCoord ? 15 : 5}
              style={{ width: '100%', height: '100%' }}
              attributionControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Click-to-Pin event interceptor */}
              <MapPinClickHandler isPinning={isPinMode} onMapClick={handleMapPinClick} />

              {/* Fly to searched location */}
              <MapFlyToGeo target={mapSearchTarget} />

              {/* Search result pin marker */}
              {mapSearchPin && (
                <Marker
                  position={[mapSearchPin.lat, mapSearchPin.lng]}
                  icon={mapSearchPinIcon}
                >
                  <Popup>
                    <div className="min-w-[180px] text-xs p-1 space-y-1.5">
                      <div className="font-bold text-sm text-white flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        Location Found
                      </div>
                      <div className="text-slate-300 text-[11px] leading-relaxed">
                        {mapSearchPin.name.split(',').slice(0, 3).join(', ')}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                        {mapSearchPin.lat.toFixed(5)}°, {mapSearchPin.lng.toFixed(5)}°
                      </div>
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => {
                            setPinnedCoord({ lat: mapSearchPin.lat, lng: mapSearchPin.lng });
                            setPinName(mapSearchPin.name.split(',')[0]);
                            setIsPinMode(true);
                          }}
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1 px-2 rounded transition"
                        >
                          📍 Set as Geofence Center
                        </button>
                        <button
                          onClick={() => setMapSearchPin(null)}
                          className="text-slate-500 hover:text-red-400 text-[10px] px-1.5 rounded transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Existing active geofences */}
              {geofences.map((geo) => {
                const lat = geo.center_latitude ?? geo.latitude;
                const lng = geo.center_longitude ?? geo.longitude;
                const radius = geo.radius_meters ?? geo.radius ?? 150;
                if (!isValidCoordinate(lat, lng)) return null;

                return (
                  <Circle
                    key={geo.id}
                    center={[lat, lng]}
                    radius={radius}
                    pathOptions={{
                      color: '#3b82f6',
                      fillColor: '#3b82f6',
                      fillOpacity: 0.18,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <span className="font-bold text-white block">{geo.name || (geo as any).area_name || 'Operational Geofence'}</span>
                        {(geo.person_name || geo.person_id) && (
                          <span className="text-cyan-400 text-[11px] font-semibold block">
                            👤 Enrolled: {geo.person_name || 'Officer'} ({geo.employee_id || geo.person_id})
                          </span>
                        )}
                        <span className="text-slate-400 text-[11px] block">{geo.department}</span>
                        <span className="font-mono text-emerald-400 block pt-1">
                          Radius: {radius}m
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Center: {lat.toFixed(5)}°, {lng.toFixed(5)}°
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mt-1">
                          STATUS: ACTIVE
                        </span>
                      </div>
                    </Popup>
                  </Circle>
                );
              })}

              {/* Interactive Pinned Marker with live draggable support */}
              {pinnedCoord && (
                <>
                  <Marker
                    position={[pinnedCoord.lat, pinnedCoord.lng]}
                    icon={createPinMarkerIcon()}
                    draggable={true}
                    eventHandlers={{
                      dragend(e) {
                        const m = e.target;
                        const pos = m.getLatLng();
                        setPinnedCoord({ lat: pos.lat, lng: pos.lng });
                      },
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1 font-sans">
                        <strong className="text-cyan-400 block font-bold">🎯 Pinned Geofence Center</strong>
                        <span className="text-slate-300 font-mono text-[11px] block">
                          {pinnedCoord.lat.toFixed(5)}°, {pinnedCoord.lng.toFixed(5)}°
                        </span>
                        <span className="text-slate-400 text-[10px] block">
                          Radius: <strong className="text-cyan-300 font-mono">{pinRadius}m</strong>
                        </span>
                        <p className="text-[10px] text-slate-500 pt-0.5">Drag pin anywhere on map to adjust</p>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Real-time Dynamic Glowing Perimeter Preview Circle */}
                  <Circle
                    center={[pinnedCoord.lat, pinnedCoord.lng]}
                    radius={pinRadius}
                    pathOptions={{
                      color: '#06b6d4',
                      fillColor: '#0284c7',
                      fillOpacity: 0.22,
                      weight: 2.5,
                      dashArray: '6, 6',
                    }}
                  />
                </>
              )}
            </MapContainer>
          </div>

          {/* Real-Time Pinned Geofence Configurator & Radius Tuning Dock */}
          {pinnedCoord && (
            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-4 animate-in slide-in-from-bottom duration-200">
              {/* Header with Step Indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Interactive Geofence Creator
                  </h4>
                  <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/70">
                    Step-by-Step Calibration
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Center: <span className="text-cyan-300 font-semibold">{formatCoordinates(pinnedCoord.lat, pinnedCoord.lng)}</span>
                </div>
              </div>

              {/* STEP 1: Manual Location & Pin Adjustment */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">
                      1
                    </span>
                    <span>Pinned Center Location (Drag Pin or Enter Manually)</span>
                  </span>
                  {users[0]?.current_location && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedCoord({
                          lat: users[0].current_location!.latitude,
                          lng: users[0].current_location!.longitude,
                        });
                      }}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                    >
                      <Radio className="w-3 h-3" />
                      <span>Pin My Live GPS</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <label className="block text-slate-400 font-sans text-[10px] mb-1">
                      Latitude Coordinate
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={pinnedCoord.lat}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) setPinnedCoord({ ...pinnedCoord, lat: val });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-sans text-[10px] mb-1">
                      Longitude Coordinate
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={pinnedCoord.lng}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) setPinnedCoord({ ...pinnedCoord, lng: val });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* STEP 2: Radius of Geofence & Location Area Coverage */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-black">
                      2
                    </span>
                    <span>Geofence Radius & Area Coverage</span>
                  </span>
                  <div className="flex items-center space-x-1.5 font-mono">
                    <input
                      type="number"
                      min="20"
                      max="15000"
                      step="10"
                      value={pinRadius}
                      onChange={(e) => setPinRadius(Math.max(10, parseInt(e.target.value) || 50))}
                      className="w-24 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-cyan-400 font-bold text-right text-xs focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-slate-400 text-xs font-sans">meters</span>
                  </div>
                </div>

                {/* Range Slider for Interactive Sizing */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="50"
                    max="3000"
                    step="25"
                    value={pinRadius}
                    onChange={(e) => setPinRadius(parseInt(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>50m</span>
                    <span>750m</span>
                    <span>1,500m</span>
                    <span>2,250m</span>
                    <span>3,000m+</span>
                  </div>
                </div>

                {/* Quick Area Coverage Presets */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-medium">Quick Coverage Presets:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px] font-mono">
                    {[
                      { label: 'Building', meters: 100 },
                      { label: 'Compound', meters: 250 },
                      { label: 'Sector / Base', meters: 500 },
                      { label: 'District', meters: 1000 },
                      { label: 'Regional', meters: 2500 },
                    ].map((preset) => (
                      <button
                        key={preset.meters}
                        type="button"
                        onClick={() => setPinRadius(preset.meters)}
                        className={`p-1.5 rounded text-center transition border ${
                          pinRadius === preset.meters
                            ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-md shadow-cyan-950/50'
                            : 'bg-slate-950 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <span className="block font-bold">{preset.meters}m</span>
                        <span className="text-[9px] text-slate-400 font-sans block truncate">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Real-time Physical Ground Area Coverage Readout */}
                <div className="grid grid-cols-3 gap-2 p-2 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs font-mono">
                  <div>
                    <span className="text-[9px] text-slate-500 block font-sans">Coverage Diameter</span>
                    <span className="text-white font-bold">{pinRadius * 2} m</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block font-sans">Surface Area</span>
                    <span className="text-cyan-400 font-bold">
                      {Math.PI * pinRadius * pinRadius >= 1000000
                        ? `${((Math.PI * pinRadius * pinRadius) / 1000000).toFixed(2)} km²`
                        : `${Math.round(Math.PI * pinRadius * pinRadius).toLocaleString()} m²`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block font-sans">Boundary Perimeter</span>
                    <span className="text-slate-300 font-bold">
                      {Math.round(2 * Math.PI * pinRadius).toLocaleString()} m
                    </span>
                  </div>
                </div>
              </div>

              {/* STEP 3: Link Enrolled Person, Zone Name & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                    1. Link Enrolled Person (Optional)
                  </label>
                  <select
                    value={pinPersonId}
                    onChange={(e) => {
                      setPinPersonId(e.target.value);
                      const p = enrolledPersons.find((x) => x.person_id === e.target.value);
                      if (p) {
                        setPinName(p.assigned_area || `${p.full_name}'s Working Zone`);
                        if (p.organization) setPinDept(p.organization);
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-medium"
                  >
                    <option value="">-- General Operational Zone (Unassigned) --</option>
                    {enrolledPersons.map((p) => (
                      <option key={p.person_id} value={p.person_id}>
                        {p.full_name} ({p.employee_id || p.person_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                    2. Perimeter / Working Area Name
                  </label>
                  <input
                    type="text"
                    value={pinName}
                    onChange={(e) => setPinName(e.target.value)}
                    placeholder="e.g. Sector 7 Tactical Perimeter"
                    required
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[11px]">
                    3. Assigned Department
                  </label>
                  <select
                    value={pinDept}
                    onChange={(e) => setPinDept(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Field Operations">Field Operations</option>
                    <option value="Perimeter Defense">Perimeter Defense</option>
                    <option value="Special Task Force">Special Task Force</option>
                    <option value="Border Security">Border Security</option>
                    <option value="Administration">Administration</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setPinnedCoord(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 font-semibold transition"
                >
                  Clear Pin
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPinMode(false);
                      setPinnedCoord(null);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEnrollModalOpen(true)}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-blue-900/40"
                    title="Enroll officer with these pinned map coordinates"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-cyan-200" />
                    <span>Enroll with Pin</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleActivatePinnedGeofence}
                    disabled={isActivatingPin}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-lg shadow-cyan-900/40 disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isActivatingPin ? 'Activating Live...' : 'Activate Geofence in Real Time'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Geofence Verification & Distance Engine Test Bench */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Crosshair className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Real-Time Geofence Telemetry & Perimeter Verification Engine
              </h2>
              <p className="text-[11px] text-slate-400">
                Directly calls backend <code className="text-blue-300 font-mono">/api/geofence/check</code> to calculate great-circle distance, boundary delta, and azimuth bearing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadLiveCoordinates}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition border border-slate-700 w-fit"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Load Live Physical GPS</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1 text-[11px]">Latitude</label>
            <input
              type="number"
              step="any"
              value={testLat}
              onChange={(e) => setTestLat(e.target.value)}
              placeholder="e.g. 13.0827"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1 text-[11px]">Longitude</label>
            <input
              type="number"
              step="any"
              value={testLng}
              onChange={(e) => setTestLng(e.target.value)}
              placeholder="e.g. 80.2707"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1 text-[11px]">Target Perimeter</label>
            <select
              value={testGeoId}
              onChange={(e) => setTestGeoId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Auto (Default Primary Zone)</option>
              {geofences.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.radius_meters}m)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1 text-[11px]">Warning Buffer (Meters)</label>
            <input
              type="number"
              value={testBuffer}
              onChange={(e) => setTestBuffer(e.target.value)}
              placeholder="25"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleRunGeofenceCheck}
            disabled={testLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-blue-900/30 disabled:opacity-50"
          >
            <Crosshair className="w-4 h-4" />
            <span>{testLoading ? 'Evaluating Geodesic Geometry...' : 'Verify Coordinate Containment'}</span>
          </button>
          {testError && <span className="text-xs text-rose-400 font-medium">{testError}</span>}
        </div>

        {/* Verification Result Card */}
        {testResult && (
          <div className="mt-3 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white">Result for {testResult.geofence_name}:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${testResult.status === 'INSIDE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : testResult.status === 'BUFFER_WARNING'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                >
                  {testResult.status}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Lat: {parseFloat(testLat).toFixed(5)}° | Lng: {parseFloat(testLng).toFixed(5)}°
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Distance to Center</span>
                <span className="text-white font-bold text-sm">{testResult.distance_meters ?? '--'} m</span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Perimeter Delta</span>
                <span
                  className={`font-bold text-sm ${testResult.delta_meters <= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                >
                  {testResult.delta_meters > 0 ? `+${testResult.delta_meters}m (Breach)` : `${testResult.delta_meters}m (Safe)`}
                </span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Azimuth Bearing</span>
                <span className="text-blue-400 font-bold text-sm flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" />
                  {testResult.bearing_degrees ?? '--'}°
                </span>
              </div>
              <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Perimeter Radius</span>
                <span className="text-slate-300 font-bold text-sm">{testResult.radius_meters ?? '--'} m</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Geofence Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Register Operational Geofence Perimeter"
        subtitle="Specify geographic coordinates and radial containment buffer"
      >
        <div className="space-y-4 text-xs">
          {/* Switch to Interactive Map Banner */}
          <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs text-slate-300">
                Prefer to drop a pin directly on the interactive map?
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setIsPinMode(true);
              }}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow shrink-0"
            >
              📍 Pin on Map
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            {/* STEP 1: Select Enrolled Person */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  1. Select Enrolled Person (Required)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setIsEnrollModalOpen(true);
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>+ Enroll New Person</span>
                </button>
              </div>

              {enrolledPersons.length === 0 ? (
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-xs flex items-center justify-between">
                  <span>No enrolled persons found in database. Please enroll a person first.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setIsEnrollModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-xs"
                  >
                    Enroll Now
                  </button>
                </div>
              ) : (
                <select
                  value={selectedPersonId}
                  onChange={(e) => handlePersonSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400 font-medium"
                >
                  <option value="">-- General Operational Zone (Unassigned) --</option>
                  {enrolledPersons.map((p) => (
                    <option key={p.person_id} value={p.person_id}>
                      {p.full_name} — {p.employee_id || p.person_id} ({p.role} | {p.organization})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* STEP 2: Assigned Working Area & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
                  2. Assigned Working Area Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Sector 4 - Emergency Disaster Relief Zone"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
                  Department / Organization
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Field Operations"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* STEP 3: Real GPS Coordinates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  3. Real GPS Center Coordinates
                </span>
                <button
                  type="button"
                  onClick={requestRealGpsForModal}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded"
                >
                  <Radio className="w-3 h-3 text-emerald-400" />
                  <span>Request Browser / Device Physical GPS</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[10px]">
                    Latitude (Real Decimal Degrees)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={centerLat}
                    onChange={(e) => setCenterLat(e.target.value)}
                    placeholder="e.g. 13.0827"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1 text-[10px]">
                    Longitude (Real Decimal Degrees)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={centerLng}
                    onChange={(e) => setCenterLng(e.target.value)}
                    placeholder="e.g. 80.2707"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Real Value Verification Readout */}
              {centerLat && centerLng && (
                <div className="mt-2 p-2 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] font-mono flex items-center justify-between text-slate-400">
                  <span>
                    Latitude: <strong className="text-cyan-300">{centerLat}</strong>
                  </span>
                  <span>
                    Longitude: <strong className="text-cyan-300">{centerLng}</strong>
                  </span>
                  <span>
                    Radius: <strong className="text-emerald-400">{radiusMeters} meters</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Radius & Area Coverage Configuration */}
            <div className="space-y-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between">
                <label className="block text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                  Containment Radius (Meters)
                </label>
                <div className="flex items-center space-x-1 font-mono text-cyan-400 font-bold text-xs">
                  <span>{radiusMeters}m</span>
                </div>
              </div>

              <input
                type="number"
                min="30"
                max="20000"
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-400"
              />

              {/* Quick Presets */}
              <div className="flex items-center justify-between gap-1 pt-1">
                <span className="text-[10px] text-slate-500">Presets:</span>
                <div className="flex items-center space-x-1 text-[10px] font-mono">
                  {['100', '250', '500', '1000', '2500'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setRadiusMeters(p)}
                      className={`px-2 py-0.5 rounded transition border ${
                        radiusMeters === p
                          ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {p}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Area Readout */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono text-slate-400">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-500 block font-sans">Coverage Diameter</span>
                  <span className="text-white font-bold">{parseFloat(radiusMeters) * 2 || 0} meters</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-500 block font-sans">Ground Surface Area</span>
                  <span className="text-cyan-400 font-bold">
                    {Math.PI * (parseFloat(radiusMeters) || 0) ** 2 >= 1000000
                      ? `${((Math.PI * (parseFloat(radiusMeters) || 0) ** 2) / 1000000).toFixed(2)} km²`
                      : `${Math.round(Math.PI * (parseFloat(radiusMeters) || 0) ** 2).toLocaleString()} m²`}
                  </span>
                </div>
              </div>
            </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1 uppercase tracking-wider text-[11px]">
              Operational Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Operational instructions for field units..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition shadow-lg shadow-blue-900/30"
            >
              Activate Geofence
            </button>
          </div>
          </form>
        </div>
      </Modal>

      {/* Floating Bottom Bar: Enroll Officer & Real-Time Geofence */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 border border-blue-500/40 backdrop-blur-md px-6 py-3 rounded-full shadow-2xl flex items-center space-x-4 animate-in slide-in-from-bottom-5">
        <div className="flex items-center space-x-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white uppercase tracking-wider hidden sm:inline">
            Real-Time Geofence Engine
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsEnrollModalOpen(true)}
          className="px-5 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-black text-xs rounded-full shadow-lg shadow-blue-900/50 transition flex items-center space-x-2 hover:scale-105"
        >
          <UserPlus className="w-4 h-4 text-cyan-200" />
          <span>ENROLL OFFICER & REAL-TIME GEOFENCE</span>
        </button>
      </div>

      {/* Real-Time Enrollment Modal */}
      <EnrollmentModal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        onSuccess={handleEnrollSuccess}
        initialCoords={pinnedCoord}
        onSwitchToDrawMode={() => setIsPinMode(true)}
      />
    </div>
  );
};
