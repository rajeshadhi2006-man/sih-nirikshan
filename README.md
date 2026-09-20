# National Command Directorate — Real-Time GPS Tracking & Geofencing System
### Smart India Hackathon (SIH) — Production-Grade Geospatial Command Architecture

This repository delivers a **Rapido / Uber-style real-time live location tracking and circular geofencing dashboard** tailored for government command centers, tactical perimeter monitoring, and automated muster roll verification.

---

## 🚀 Key Highlights & Architecture

- **Zero Paid Maps / Zero Vendor Lock-in**: Powered exclusively by **Leaflet.js** and **OpenStreetMap** (OSM) standard tiles and CartoDB Tactical Dark tiles. No Google Maps API keys or Mapbox billing required.
- **Native Device Geolocation**: Ingests high-precision GNSS telemetry (`navigator.geolocation.watchPosition` with `enableHighAccuracy: true` for browser/laptops, and native Flutter location plugins for mobile phones).
- **Sub-Second Real-Time Telemetry**: Real-time bi-directional WebSockets between field units and the FastAPI Python server (`/ws/live` and `/ws/location/{user_id}`).
- **Smooth Uber/Rapido Marker Interpolation**: Position updates glide smoothly using cubic ease-out coordinate interpolation instead of jarring marker teleportation.
- **Dynamic Circular Geofencing**: Server-side Haversine geodesic boundary computation detecting `INSIDE` vs `OUTSIDE` states and triggering critical security breach alerts.
- **Live Follow Mode**: Administrators can click any field unit to activate `LIVE TRACKING` auto-follow mode, smoothly panning the map with the moving asset.
- **Multi-Factor Verification Integration**: Modular hooks for GPS verification, circular geofence boundary checks, and 3D facial liveness / voice acoustic biometric authentication.

---

## 🏗️ System Architecture

```
Flutter Mobile User App / Browser Geolocation
                  ↓
          Device Native GPS
                  ↓
  Latitude, Longitude, Accuracy, Speed, Heading
                  ↓
      FastAPI WebSocket Engine (:8000)
                  ↓
     Real-Time Location Manager (Python)
                  ↓
       Government React Command Dashboard (:5173)
                  ↓
          Leaflet.js + OpenStreetMap
                  ↓
   Smooth Animated Live Moving User Marker
```

---

## 📂 Project Structure

```
├── backend/
│   ├── database.py              # SQLite / PostgreSQL schema (users, locations, location_history, geofences, attendance_events)
│   ├── geofence_engine.py       # Haversine distance, boundary violation detector, biometric liveness evaluation
│   ├── main.py                  # FastAPI REST APIs & WebSocket broadcast hub
│   └── requirements.txt         # Python dependencies (FastAPI, Uvicorn, WebSockets, Pydantic)
│
├── src/
│   ├── types/
│   │   └── location.ts          # TypeScript types for LocationObject, UserLocation, CircularGeofence, MarkerStatus
│   ├── services/
│   │   ├── api.ts               # REST API service client (POST /api/location/update, GET /api/users/locations)
│   │   ├── websocket.ts         # Resilient WebSocket client with exponential backoff & status events
│   │   └── locationService.ts   # Native browser GPS watcher & realistic waypoint simulation runner
│   ├── hooks/
│   │   └── useLiveLocations.ts  # Multi-user Map state, smooth coordinate interpolation, and live tracking
│   ├── components/
│   │   ├── LiveMap.tsx          # Fullscreen Leaflet map, OSM tiles, accuracy circles, route polylines
│   │   ├── UserMarker.tsx       # Custom directional marker with heading rotation & status visual states
│   │   ├── UserSidebar.tsx      # Government directory sidebar with search, filter, and auto-follow
│   │   ├── TrackingPanel.tsx    # Command HUD with connection status, SHOW ROUTE, and simulation controls
│   │   ├── Geofence.tsx         # Circular geofence boundary renderer
│   │   └── StatusCards.tsx      # Operational metrics (Total Users, Live, Offline, GPS Error)
│   └── pages/
│       ├── Dashboard.tsx        # Integrated command center console
│       └── MobileTransmitter.tsx # Field transmitter page for mobile phone testing
│
├── .env.example                 # Environment configuration template
└── README.md                    # System documentation
```

---

## ⚡ Quick Start Guide

### 1. Start the Python Backend
Ensure Python 3.9+ is installed:

```bash
# Navigate to project root
cd "d:\ALL PROJECT\SIH WEB"

# Install dependencies
pip install -r backend/requirements.txt

# Run FastAPI server on port 8000
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
- API Documentation: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/api/health`

### 2. Start the React Dashboard
Ensure Node.js 18+ is installed:

```bash
# Install frontend packages (if not already installed)
npm install

# Start Vite dev server
npm run dev -- --host
```
- Dashboard: `http://localhost:5173/dashboard`
- Mobile Transmitter: `http://localhost:5173/transmitter`

---

## 📱 How to Connect Devices & Transmit Live GPS

### Method A: Native Browser GPS Test
1. Open `http://localhost:5173/dashboard` on your laptop or phone.
2. In the top HUD tracking panel, click **`USE BROWSER GPS`**.
3. When prompted by the browser, click **Allow Location Access**.
4. The system activates `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`.
5. Your exact device coordinates, heading, and accuracy circle will immediately appear and update on the command center map.

### Method B: Simulated Live Moving Vehicle
1. On the dashboard HUD, click **`SIMULATE LIVE LOCATION`**.
2. The system streams waypoint coordinates along the Coimbatore Smart Corridor at 3-second intervals.
3. Observe the marker glide smoothly between coordinates with heading rotation and dynamic speed.
4. Click **`USER001`** in the sidebar to activate **Live Follow Mode**—the map automatically pans with the moving vehicle.

### Method C: Connecting a Flutter Mobile App
In your Flutter field application, capture device coordinates using `geolocator`:

#### 1. WebSocket Streaming (Recommended)
Connect directly to the user WebSocket channel:

```dart
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:geolocator/geolocator.dart';

final channel = WebSocketChannel.connect(
  Uri.parse('ws://YOUR_SERVER_IP:8000/ws/location/USER001'),
);

Geolocator.getPositionStream(
  locationSettings: LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: 2, // meters
  ),
).listen((Position position) {
  final payload = {
    "latitude": position.latitude,
    "longitude": position.longitude,
    "accuracy": position.accuracy,
    "speed": position.speed * 3.6, // km/h
    "heading": position.heading,
    "timestamp": DateTime.now().toUtc().toIso8601String(),
    "status": "online"
  };

  channel.sink.add(jsonEncode(payload));
});
```

#### 2. REST HTTP Ingestion
Alternatively, send POST requests to `/api/location/update`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<void> sendLocationUpdate(Position pos) async {
  final url = Uri.parse('http://YOUR_SERVER_IP:8000/api/location/update');
  await http.post(
    url,
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      "user_id": "OFFICER_104",
      "latitude": pos.latitude,
      "longitude": pos.longitude,
      "accuracy": pos.accuracy,
      "speed": pos.speed * 3.6,
      "heading": pos.heading,
      "timestamp": DateTime.now().toUtc().toIso8601String(),
      "status": "online"
    }),
  );
}
```

---

## 🛡️ REST & WebSocket API Reference

| Method | Endpoint | Description |
|---|---|---|
| `WS` | `/ws/live` | Real-time broadcast hub for the Command Dashboard |
| `WS` | `/ws/location/{user_id}` | Direct bi-directional channel for mobile GPS field units |
| `POST` | `/api/location/update` | Ingests GPS coordinate object from any external device |
| `GET` | `/api/users/locations` | Returns current coordinates, status, and breadcrumbs of all users |
| `GET` | `/api/users/{user_id}/location` | Returns location object and route history for a single user |
| `POST` | `/api/attendance/verify` | Multi-factor verification (GPS + Geofence + Biometrics) |
| `GET` | `/api/geofences` | Lists active circular geofences |
| `POST` | `/api/geofences` | Creates a new circular geofence boundary |
| `GET` | `/api/health` | Telemetry kernel status, active WebSockets, and DB counts |

---

## 🧪 Testing Multiple Live Users Concurrently

You can test multiple moving officers simultaneously:
1. Open multiple browser tabs (or test from a smartphone on the same local Wi-Fi network at `http://YOUR_IP:5173/transmitter`).
2. Transmit coordinates using different user IDs (e.g. `USER001`, `USER002`, `OFFICER_CHENNAI_12`).
3. The dashboard maintains a non-destructive `Map<user_id, marker>` state, rendering distinct custom markers and accuracy circles for each officer in real-time.
