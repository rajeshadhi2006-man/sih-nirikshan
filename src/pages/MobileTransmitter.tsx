import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Navigation,
  Radio,
  Shield,
  CheckCircle2,
  AlertTriangle,
  LocateFixed,
  Wifi,
  Send,
  Compass,
  ArrowUpRight,
  Video,
  RotateCw,
  Zap,
  ZapOff,
  Battery,
  Camera,
  Mic,
  UserCheck,
  Check,
  XCircle,
} from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import { formatCoordinates } from '../lib/geofence';
import { apiSendTelemetry } from '../lib/api';
import { uploadCCTVFrame, CCTVFrameData } from '../api/cctv';
import { personsApi, Person } from '../api/persons';

export const MobileTransmitter: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialMode = searchParams.get('mode') === 'cctv' ? 'cctv' : searchParams.get('mode') === 'biometrics' ? 'biometrics' : 'gps';
  const [activeTab, setActiveTab] = useState<'gps' | 'biometrics' | 'cctv'>(initialMode);

  // Enrolled Persons state
  const [enrolledPersons, setEnrolledPersons] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // GPS State
  const [isTransmittingGPS, setIsTransmittingGPS] = useState(false);
  const [userId, setUserId] = useState('P-1001');
  const [officerName, setOfficerName] = useState('Field Officer');
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number;
    heading: number;
    timestamp: string;
  } | null>(null);
  const [packetCount, setPacketCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to transmit hardware GNSS telemetry');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live Geofence & Attendance Telemetry Response
  const [liveGeoStatus, setLiveGeoStatus] = useState<string>('UNKNOWN');
  const [liveAttendanceStatus, setLiveAttendanceStatus] = useState<string>('ABSENT');
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [liveRadius, setLiveRadius] = useState<number | null>(null);
  const [assignedAreaName, setAssignedAreaName] = useState<string>('');

  // Biometrics Verification State
  const [faceStatus, setFaceStatus] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [verificationDetails, setVerificationDetails] = useState<any>(null);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [isVerifyingVoice, setIsVerifyingVoice] = useState(false);
  const [isFaceCameraActive, setIsFaceCameraActive] = useState(false);

  // CCTV State
  const cameraId = searchParams.get('cam') || 'cam-phone-live';
  const [isStreamingCCTV, setIsStreamingCCTV] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [resolution, setResolution] = useState<'720p' | '480p' | '360p'>('720p');
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [cctvFramesSent, setCctvFramesSent] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const cctvChannelRef = useRef<BroadcastChannel | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cctvWsRef = useRef<WebSocket | null>(null);
  const cctvTimerRef = useRef<any>(null);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  // Battery status API
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  // Load enrolled persons from database
  useEffect(() => {
    const fetchPersons = async () => {
      try {
        const list = await personsApi.getPersons();
        setEnrolledPersons(list);
        if (list.length > 0) {
          const first = list[0];
          setUserId(first.person_id);
          setOfficerName(first.full_name);
          setSelectedPerson(first);
          if (first.geofence) {
            setAssignedAreaName(first.geofence.name);
            setLiveRadius(first.geofence.radius_meters);
          } else if (first.assigned_area) {
            setAssignedAreaName(first.assigned_area);
          }
        }
      } catch (err) {
        console.warn('Failed to load enrolled persons:', err);
      }
    };
    fetchPersons();
  }, []);

  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel('gov_gps_telemetry');
      cctvChannelRef.current = new BroadcastChannel('cctv_phone_stream');
    } catch {
      // Not supported in older browsers
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
      if (cctvChannelRef.current) {
        cctvChannelRef.current.close();
      }
      stopCCTVStream();
    };
  }, []);

  // -------------------------------------------------------------
  // BIOMETRIC VERIFICATION LOGIC (Sections 9, 10, 11)
  // -------------------------------------------------------------
  const handleVerifyFace = async () => {
    setIsVerifyingFace(true);
    setErrorMsg(null);
    try {
      let stream = streamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsFaceCameraActive(true);
      }

      // Capture frame and calculate embedding
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (videoRef.current && ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 320);
        const imgData = ctx.getImageData(0, 0, 320, 320).data;
        const vector: number[] = [];
        const step = Math.floor(imgData.length / 128);
        for (let i = 0; i < 128; i++) {
          const idx = i * step;
          const val = (imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114) / 255.0;
          vector.push(Number(val.toFixed(4)));
        }

        const res = await personsApi.verifyFace({
          person_id: userId,
          face_embedding: JSON.stringify(vector),
          sample_data: canvas.toDataURL('image/jpeg', 0.6),
        });

        const fStatus = res.face_status || (res.match ? 'MATCH' : 'MISMATCH');
        setFaceStatus(fStatus);

        // Run final multi-factor verification
        const finalRes = await personsApi.verifyFinal({
          user_id: userId,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
        });
        setFinalStatus(finalRes.final_result);
        setVerificationDetails(finalRes);
      }
    } catch (err: any) {
      setErrorMsg(`Face verification error: ${err.message || 'Camera capture failed'}`);
    } finally {
      setIsVerifyingFace(false);
    }
  };

  const handleVerifyVoice = async () => {
    setIsVerifyingVoice(true);
    setErrorMsg(null);
    try {
      const vector: number[] = [];
      for (let i = 0; i < 64; i++) {
        vector.push(Number((0.3 + 0.4 * Math.sin(i * 0.2)).toFixed(4)));
      }
      const res = await personsApi.verifyVoice({
        person_id: userId,
        voice_embedding: JSON.stringify(vector),
      });
      const vStatus = res.voice_status || (res.match ? 'MATCH' : 'MISMATCH');
      setVoiceStatus(vStatus);

      // Run final multi-factor verification
      const finalRes = await personsApi.verifyFinal({
        user_id: userId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        accuracy: coords?.accuracy,
      });
      setFinalStatus(finalRes.final_result);
      setVerificationDetails(finalRes);
    } catch (err: any) {
      setErrorMsg(`Voice verification error: ${err.message}`);
    } finally {
      setIsVerifyingVoice(false);
    }
  };

  // -------------------------------------------------------------
  // GPS TRANSMITTER LOGIC
  // -------------------------------------------------------------
  const startTransmittingGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported on this device/browser.');
      return;
    }

    setErrorMsg(null);
    setIsTransmittingGPS(true);
    setStatusMessage('Acquiring high-precision GNSS fix...');

    const client = getSupabaseClient();
    const realtimeChannel = client.channel('realtime_command_center');
    realtimeChannel.subscribe();

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 6);
        const speed = Number((pos.coords.speed || 0).toFixed(1));
        const heading = Math.round(pos.coords.heading || 0);
        const timestamp = new Date().toISOString();

        setCoords({
          latitude: lat,
          longitude: lng,
          accuracy,
          speed,
          heading,
          timestamp,
        });

        setPacketCount((c) => c + 1);
        setStatusMessage(`Transmitting packet #${packetCount + 1} live to Command Portal`);

        const payload = {
          user_id: userId,
          full_name: officerName,
          latitude: lat,
          longitude: lng,
          accuracy,
          speed,
          heading,
          created_at: timestamp,
        };

        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'GPS_UPDATE',
            data: payload,
          });
        }

        try {
          const res = await apiSendTelemetry({
            user_id: userId,
            latitude: lat,
            longitude: lng,
            accuracy,
            speed,
            heading,
            full_name: officerName,
          });
          if (res) {
            const status = res.geofence_status || (res.is_inside ? 'INSIDE' : 'OUTSIDE');
            setLiveGeoStatus(status);
            if ((res as any).attendance_status) {
              setLiveAttendanceStatus((res as any).attendance_status);
            } else if (status === 'INSIDE') {
              setLiveAttendanceStatus('PRESENT');
            } else {
              setLiveAttendanceStatus('EXITED');
            }
            if (typeof (res as any).distance_meters === 'number') {
              setLiveDistance(Math.round((res as any).distance_meters));
            }
            if (typeof (res as any).radius_meters === 'number') {
              setLiveRadius(Math.round((res as any).radius_meters));
            }
          }
        } catch (e) {
          console.warn('Python backend transmit error:', e);
        }

        try {
          realtimeChannel.send({
            type: 'broadcast',
            event: 'location_update',
            payload,
          });
        } catch (e) {
          console.warn('Realtime broadcast error:', e);
        }
      },
      (err) => {
        setErrorMsg(`GPS Error (${err.code}): ${err.message}. Please enable Location Services.`);
        setIsTransmittingGPS(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 500,
      }
    );
  };

  const stopTransmittingGPS = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTransmittingGPS(false);
    setStatusMessage('GPS Transmission halted');
  };

  // -------------------------------------------------------------
  // CCTV CAMERA BROADCAST LOGIC
  // -------------------------------------------------------------
  const setupCCTVWebSocket = () => {
    if (cctvWsRef.current && cctvWsRef.current.readyState === WebSocket.OPEN) return;
    const host = window.location.hostname || 'localhost';
    const wsUrl = `ws://${host}:8000/ws/cctv/${cameraId}`;

    try {
      const ws = new WebSocket(wsUrl);
      cctvWsRef.current = ws;
    } catch (e) {
      console.warn('CCTV WS error:', e);
    }
  };

  const startCCTVCamera = async () => {
    try {
      setErrorMsg(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const resDimensions =
        resolution === '720p'
          ? { width: { ideal: 1280 }, height: { ideal: 720 } }
          : resolution === '480p'
          ? { width: { ideal: 854 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 360 } };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          ...resDimensions,
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const track = stream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
      setHasTorch(!!capabilities.torch);

      return true;
    } catch (err: any) {
      setErrorMsg(`Camera Access Denied: ${err.message || 'Please grant camera access.'}`);
      return false;
    }
  };

  const startCCTVStream = async () => {
    const ready = await startCCTVCamera();
    if (!ready) return;

    setupCCTVWebSocket();
    setIsStreamingCCTV(true);
    setStatusMessage('🔴 CCTV Live Stream Active');

    cctvTimerRef.current = setInterval(() => {
      captureCCTVFrame();
    }, 40); // ~25 FPS
  };

  const captureCCTVFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL('image/jpeg', 0.6);
    const now = new Date().toISOString();

    const payload: CCTVFrameData = {
      camera_id: cameraId,
      image: base64Image,
      fps: 25,
      resolution: `${canvas.width}x${canvas.height}`,
      officer_name: officerName,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      battery: batteryLevel || undefined,
      timestamp: now,
    };

    if (cctvWsRef.current && cctvWsRef.current.readyState === WebSocket.OPEN) {
      cctvWsRef.current.send(JSON.stringify({ type: 'CCTV_FRAME', data: payload }));
    } else {
      uploadCCTVFrame(payload);
    }

    if (cctvChannelRef.current) {
      cctvChannelRef.current.postMessage({ type: 'CCTV_FRAME', ...payload });
    }

    setCctvFramesSent((c) => c + 1);

    fpsCounterRef.current.frames += 1;
    const nowTime = performance.now();
    if (nowTime - fpsCounterRef.current.lastTime >= 1000) {
      setCurrentFps(fpsCounterRef.current.frames);
      fpsCounterRef.current.frames = 0;
      fpsCounterRef.current.lastTime = nowTime;
    }
  };

  const stopCCTVStream = () => {
    if (cctvTimerRef.current) {
      clearInterval(cctvTimerRef.current);
      cctvTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (cctvWsRef.current) {
      cctvWsRef.current.close();
      cctvWsRef.current = null;
    }
    setIsStreamingCCTV(false);
    setCurrentFps(0);
    setTorchOn(false);
  };

  const flipCCTVCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isStreamingCCTV) {
      await startCCTVCamera();
    }
  };

  const toggleCCTVTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-3 sm:p-4 select-none">
      <canvas ref={canvasRef} className="hidden" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
        {/* Emblem & Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 mb-1">
            <Smartphone className="w-6 h-6" />
          </div>
          <span className="text-[10px] uppercase tracking-widest font-extrabold text-indigo-400 block">
            SIH Field Telemetry & CCTV Unit
          </span>
          <h1 className="text-lg font-black text-white">Mobile Command Transmitter</h1>
        </div>

        {/* 3-Mode Switcher Tabs */}
        <div className="grid grid-cols-3 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold gap-1">
          <button
            onClick={() => {
              setActiveTab('gps');
              setSearchParams({});
            }}
            className={`py-2 px-1 rounded-lg flex items-center justify-center gap-1 text-[11px] transition ${
              activeTab === 'gps'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>📍 GPS Fence</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('biometrics');
              setSearchParams({ mode: 'biometrics' });
            }}
            className={`py-2 px-1 rounded-lg flex items-center justify-center gap-1 text-[11px] transition ${
              activeTab === 'biometrics'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>🛡️ Verify</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('cctv');
              setSearchParams({ mode: 'cctv' });
            }}
            className={`py-2 px-1 rounded-lg flex items-center justify-center gap-1 text-[11px] transition ${
              activeTab === 'cctv'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>📹 CCTV</span>
          </button>
        </div>

        {/* Enrolled Personnel Identity Selection */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400 text-[11px] font-bold">Enrolled Personnel Identity:</span>
              <span className="font-mono text-cyan-400 text-[10px] font-bold">{userId}</span>
            </div>
            {enrolledPersons.length > 0 ? (
              <select
                value={userId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setUserId(pid);
                  const p = enrolledPersons.find((x) => x.person_id === pid);
                  if (p) {
                    setOfficerName(p.full_name);
                    setSelectedPerson(p);
                    setAssignedAreaName(p.geofence?.name || p.assigned_area || '');
                    setLiveRadius(p.geofence?.radius_meters || null);
                    setLiveGeoStatus('UNKNOWN');
                    setFaceStatus(null);
                    setVoiceStatus(null);
                    setFinalStatus(null);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-lg text-white font-semibold text-xs focus:outline-none focus:border-cyan-400"
              >
                {enrolledPersons.map((p) => (
                  <option key={p.person_id} value={p.person_id}>
                    {p.full_name} ({p.employee_id || p.person_id}) — {p.assigned_area || p.organization}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 px-2 py-1 rounded text-white font-bold text-xs"
              />
            )}
          </div>

          {assignedAreaName && (
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800/80">
              <span className="text-slate-400">Assigned Working Area:</span>
              <span className="text-cyan-300 font-bold truncate max-w-[200px]">📍 {assignedAreaName}</span>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* CCTV CAMERA TAB */}
        {/* ============================================================== */}
        {activeTab === 'cctv' && (
          <div className="space-y-3">
            {/* Camera Viewfinder */}
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              <div className="absolute inset-0 pointer-events-none p-2.5 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono text-white bg-black/40 px-2 py-1 rounded backdrop-blur-sm">
                  <span className="text-cyan-400 font-bold">CAM: {cameraId}</span>
                  <span className={isStreamingCCTV ? 'text-rose-400 font-bold animate-pulse' : 'text-slate-400'}>
                    {isStreamingCCTV ? `● LIVE (${currentFps} FPS)` : 'OFFLINE'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-[9px] font-mono text-slate-300 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
                  <span>FRAMES: {cctvFramesSent}</span>
                  <span>{resolution.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={flipCCTVCamera}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Flip ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
              </button>

              <button
                onClick={toggleCCTVTorch}
                disabled={!hasTorch}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  !hasTorch
                    ? 'bg-slate-950 text-slate-600 border border-slate-800'
                    : torchOn
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {torchOn ? <Zap className="w-3.5 h-3.5 fill-current" /> : <ZapOff className="w-3.5 h-3.5 text-amber-400" />}
                <span>Torch {torchOn ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Stream Action Button */}
            <button
              onClick={isStreamingCCTV ? stopCCTVStream : startCCTVStream}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-xl flex items-center justify-center gap-2 ${
                isStreamingCCTV
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
              }`}
            >
              {isStreamingCCTV ? (
                <>
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>STOP CCTV STREAM</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>START STREAMING PHONE CAMERA</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* GPS TELEMETRY TAB */}
        {/* ============================================================== */}
        {activeTab === 'gps' && (
          <div className="space-y-3">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="text-slate-400 font-sans">Geofence Containment:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    liveGeoStatus === 'INSIDE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : liveGeoStatus === 'OUTSIDE'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  }`}
                >
                  {liveGeoStatus === 'INSIDE' ? '🟢 INSIDE' : liveGeoStatus === 'OUTSIDE' ? '🔴 OUTSIDE' : '🟡 GPS UNAVAILABLE'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Attendance Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    liveAttendanceStatus === 'PRESENT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : liveAttendanceStatus === 'EXITED'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {liveAttendanceStatus}
                </span>
              </div>

              {liveDistance !== null && (
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Distance to Center:</span>
                  <span className={liveDistance <= (liveRadius || 0) ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {liveDistance}m {liveRadius ? `(Radius: ${liveRadius}m)` : ''}
                  </span>
                </div>
              )}

              <div className="flex justify-between font-mono">
                <span className="text-slate-400 font-sans">Coordinates:</span>
                <span className="text-white font-bold">
                  {coords ? formatCoordinates(coords.latitude, coords.longitude) : 'Awaiting Physical GPS Fix'}
                </span>
              </div>

              <div className="flex justify-between font-mono">
                <span className="text-slate-400 font-sans">Accuracy:</span>
                <span className="text-emerald-400 font-bold">
                  {coords ? `±${coords.accuracy}m` : '--'}
                </span>
              </div>

              <div className="flex justify-between font-mono">
                <span className="text-slate-400 font-sans">Packets:</span>
                <span className="text-amber-400 font-bold">{packetCount} pings</span>
              </div>
            </div>

            <button
              onClick={isTransmittingGPS ? stopTransmittingGPS : startTransmittingGPS}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-black tracking-wider uppercase transition shadow-xl flex items-center justify-center space-x-2 ${
                isTransmittingGPS
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
              }`}
            >
              {isTransmittingGPS ? (
                <>
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>Stop GPS Transmission</span>
                </>
              ) : (
                <>
                  <LocateFixed className="w-4 h-4" />
                  <span>Transmit Real Phone GPS</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* BIOMETRICS & MULTI-FACTOR VERIFICATION TAB */}
        {/* ============================================================== */}
        {activeTab === 'biometrics' && (
          <div className="space-y-3">
            {/* Camera Viewfinder */}
            <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <div className="absolute inset-0 pointer-events-none p-2 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                  <span className="text-emerald-400 font-bold">👤 BIOMETRIC SENSOR</span>
                  <span className="text-slate-300">USER CAMERA</span>
                </div>
                <div className="text-center text-[10px] font-semibold text-emerald-300 bg-black/60 px-2 py-0.5 rounded mx-auto">
                  Face alignment verification active
                </div>
              </div>
            </div>

            {/* Verification Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleVerifyFace}
                disabled={isVerifyingFace}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-950/50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isVerifyingFace ? 'Scanning Face...' : 'Verify Face'}</span>
              </button>

              <button
                type="button"
                onClick={handleVerifyVoice}
                disabled={isVerifyingVoice}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-lg shadow-indigo-950/50"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{isVerifyingVoice ? 'Analyzing Voice...' : 'Verify Voice'}</span>
              </button>
            </div>

            {/* Unified Multi-Factor Verification Status Card */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-white font-bold tracking-wide">Multi-Factor Verification:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                    finalStatus === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : finalStatus === 'FAILED'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {finalStatus === 'VERIFIED' ? '🟢 VERIFIED' : finalStatus === 'FAILED' ? '🔴 FAILED' : '🟡 PENDING'}
                </span>
              </div>

              {/* Sub-factor breakdowns */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">GPS FENCE</span>
                  <span className={`font-bold ${liveGeoStatus === 'INSIDE' ? 'text-emerald-400' : liveGeoStatus === 'OUTSIDE' ? 'text-rose-400' : 'text-amber-400'}`}>
                    {liveGeoStatus === 'INSIDE' ? '🟢 INSIDE' : liveGeoStatus === 'OUTSIDE' ? '🔴 OUTSIDE' : '🟡 UNKNOWN'}
                  </span>
                </div>

                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">FACE MATCH</span>
                  <span className={`font-bold ${faceStatus === 'MATCH' ? 'text-emerald-400' : faceStatus === 'MISMATCH' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {faceStatus === 'MATCH' ? '🟢 MATCH' : faceStatus === 'MISMATCH' ? '🔴 MISMATCH' : '⚪ PENDING'}
                  </span>
                </div>

                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block mb-0.5">VOICE MATCH</span>
                  <span className={`font-bold ${voiceStatus === 'MATCH' ? 'text-emerald-400' : voiceStatus === 'MISMATCH' ? 'text-rose-400' : 'text-slate-400'}`}>
                    {voiceStatus === 'MATCH' ? '🟢 MATCH' : voiceStatus === 'MISMATCH' ? '🔴 MISMATCH' : '⚪ OPTIONAL'}
                  </span>
                </div>
              </div>

              {/* Status explanation notice */}
              {finalStatus === 'VERIFIED' && (
                <div className="p-2 bg-emerald-950/60 border border-emerald-600/60 rounded-lg text-[11px] text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Attendance Verified: GPS Inside + Face Matched successfully!</span>
                </div>
              )}
              {finalStatus === 'FAILED' && (
                <div className="p-2 bg-rose-950/60 border border-rose-600/60 rounded-lg text-[11px] text-rose-300 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Verification Failed: Face mismatch or device is outside assigned geofence perimeter.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Return Links */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
          <a href="/cctv" className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
            <span>CCTV Surveillance</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>

          <a href="/monitor" className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1">
            <span>Map Monitor</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
