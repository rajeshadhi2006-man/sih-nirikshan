import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Camera,
  Video,
  Radio,
  RotateCw,
  Zap,
  ZapOff,
  LocateFixed,
  Shield,
  Activity,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Settings,
  Battery,
  Maximize2
} from 'lucide-react';
import {
  uploadCCTVFrame,
  CCTVFrameData,
  startCCTVSession,
  stopCCTVSession,
  CCTVSessionStartResponse,
  getCCTVWebSocketUrl
} from '../api/cctv';
import { apiSendTelemetry } from '../lib/api';

export const CCTVBroadcaster: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramCameraId = searchParams.get('cam') || 'CAM-OFFICER-01';
  const initialOfficer = searchParams.get('officer') || 'Officer Vikramaditya Rao';

  const [activeCameraId, setActiveCameraId] = useState(paramCameraId);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [resolution, setResolution] = useState<'720p' | '480p' | '360p'>('720p');
  const [targetFps, setTargetFps] = useState<number>(30);
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [officerName, setOfficerName] = useState(initialOfficer);
  const [officerId, setOfficerId] = useState('OFF-101');
  const [framesSent, setFramesSent] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Physical Phone Camera Ready — Tap START to stream live feed');

  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const timerRef = useRef<any>(null);
  const geoWatchIdRef = useRef<number | null>(null);
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

  // Broadcast channel for same-browser testing
  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel('cctv_phone_stream');
    } catch {
      // Ignored if unsupported
    }
    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // Setup WebSocket connection
  const setupWebSocket = (camId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const wsUrl = getCCTVWebSocketUrl(camId);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatusText(`Connected to National Command Server (${camId})`);
      };

      ws.onerror = () => {
        setStatusText('Live streaming active via secure HTTP API fallback');
      };

      ws.onclose = () => {
        if (isStreaming) {
          setTimeout(() => setupWebSocket(camId), 2000);
        }
      };
    } catch (e) {
      console.warn('WS Init Error:', e);
    }
  };

  // Start Camera MediaStream
  const startCamera = async () => {
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

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
      setHasTorch(!!capabilities.torch);

      setStatusText('Physical camera active. Tap START BROADCASTING to stream.');
      return true;
    } catch (err: any) {
      setErrorMsg(`Camera Access Denied: ${err.message || 'Please grant camera permissions in your mobile browser.'}`);
      return false;
    }
  };

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      const next = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch (e) {
      console.warn('Torch not supported on this track', e);
    }
  };

  // Flip Camera (Front / Back)
  const flipCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isStreaming) {
      await startCamera();
    }
  };

  // Start streaming loop with authenticated session
  const handleStartStream = async () => {
    const ready = await startCamera();
    if (!ready) return;

    setStatusText('Creating authenticated camera session on Command Center...');
    const sessionRes = await startCCTVSession({
      officer_id: officerId,
      officer_name: officerName,
      device_model: 'Physical Android Phone Camera',
      resolution: resolution,
      fps: targetFps,
    });

    const targetCamId = sessionRes?.camera_id || activeCameraId;
    if (sessionRes?.camera_id) {
      setActiveCameraId(sessionRes.camera_id);
    }
    if (sessionRes?.session_id) {
      setActiveSessionId(sessionRes.session_id);
    }

    setupWebSocket(targetCamId);

    // Start GPS Tracking in background
    if (navigator.geolocation) {
      geoWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy || 5),
          });
          // Also report GPS telemetry to main backend
          apiSendTelemetry({
            user_id: officerId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 5,
            speed: pos.coords.speed || 0,
            heading: pos.coords.heading || 0,
            full_name: `${officerName} (${targetCamId})`,
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }

    setIsStreaming(true);
    setStatusText(`🔴 LIVE: Streaming physical phone camera (${targetCamId}) to Command Center`);

    // Frame capture loop at target FPS
    const intervalMs = Math.round(1000 / targetFps);
    timerRef.current = setInterval(() => {
      captureAndSendFrame(targetCamId);
    }, intervalMs);
  };

  const captureAndSendFrame = (camIdToUse?: string) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== 4) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress to JPEG Base64
    const quality = resolution === '720p' ? 0.65 : 0.55;
    const base64Image = canvas.toDataURL('image/jpeg', quality);
    const now = new Date().toISOString();
    const currentCamId = camIdToUse || activeCameraId;

    const payload: CCTVFrameData = {
      camera_id: currentCamId,
      image: base64Image,
      fps: targetFps,
      resolution: `${canvas.width}x${canvas.height}`,
      officer_name: officerName,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      battery: batteryLevel || undefined,
      timestamp: now,
    };

    // 1. Send via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'CCTV_FRAME',
          data: payload,
        })
      );
    } else {
      // Fallback: Send via REST
      uploadCCTVFrame(payload);
    }

    // 2. Send via BroadcastChannel for same-device preview
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'CCTV_FRAME',
        camera_id: currentCamId,
        ...payload,
      });
    }

    setFramesSent((c) => c + 1);

    // Calculate real FPS
    fpsCounterRef.current.frames += 1;
    const nowTime = performance.now();
    if (nowTime - fpsCounterRef.current.lastTime >= 1000) {
      setCurrentFps(fpsCounterRef.current.frames);
      fpsCounterRef.current.frames = 0;
      fpsCounterRef.current.lastTime = nowTime;
    }
  };

  const handleStopStream = () => {
    if (activeCameraId) {
      stopCCTVSession(activeCameraId, activeSessionId || undefined);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsStreaming(false);
    setCurrentFps(0);
    setTorchOn(false);
    setStatusText('Stream Stopped. Press Start to resume.');
  };

  useEffect(() => {
    // Initial camera startup
    startCamera();

    return () => {
      handleStopStream();
    };
  }, [facingMode, resolution]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-3 sm:p-6 select-none">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Mobile Tactical Bar */}
      <div className="w-full max-w-lg flex items-center justify-between py-2 px-3 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl">
        <button
          onClick={() => navigate('/cctv')}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition flex items-center gap-1.5 text-xs font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Surveillance View</span>
        </button>

        <div className="flex items-center space-x-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider flex items-center gap-1.5 border ${
              isStreaming
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/40 animate-pulse'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-rose-500' : 'bg-slate-500'}`} />
            <span>{isStreaming ? `LIVE (${currentFps || targetFps} FPS)` : 'STANDBY'}</span>
          </span>

          {batteryLevel !== null && (
            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>{batteryLevel}%</span>
            </span>
          )}
        </div>
      </div>

      {/* Center: Live Camera Viewfinder Card */}
      <div className="w-full max-w-lg my-3 relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex flex-col aspect-[4/3] sm:aspect-video items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* HUD Crosshairs & Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start text-[10px] font-mono font-bold text-white/80 bg-black/40 backdrop-blur-sm p-2 rounded-lg border border-white/10">
            <div>
              <span className="text-cyan-400 block">CAM ID: {cameraId}</span>
              <span className="text-slate-300">{officerName}</span>
            </div>
            <div className="text-right">
              <span className="text-emerald-400 block">{resolution.toUpperCase()} HD</span>
              <span>{coords ? `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°` : 'GPS ACQUIRING...'}</span>
            </div>
          </div>

          {/* Center Target Box */}
          <div className="self-center my-auto w-32 h-32 border border-cyan-500/30 rounded-xl relative flex items-center justify-center">
            <div className="w-2 h-2 bg-cyan-400/50 rounded-full" />
            <span className="absolute top-1 left-1.5 text-[8px] font-mono text-cyan-400">DOSJE-AI</span>
          </div>

          <div className="flex justify-between items-end text-[10px] font-mono text-white/70 bg-black/40 backdrop-blur-sm p-1.5 rounded-lg border border-white/10">
            <span>PACKETS: {framesSent}</span>
            <span className="text-rose-400 font-bold">{isStreaming ? 'REC ● SECURE STREAM' : 'READY'}</span>
          </div>
        </div>
      </div>

      {/* Controls & Streaming HUD */}
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        {/* Officer & Quality Settings */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Officer Name</label>
            <input
              type="text"
              value={officerName}
              onChange={(e) => setOfficerName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-medium text-xs focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Quality / FPS</label>
            <div className="flex gap-1.5">
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as any)}
                className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-white text-xs"
              >
                <option value="720p">720p HD</option>
                <option value="480p">480p SD</option>
                <option value="360p">360p Lite</option>
              </select>

              <select
                value={targetFps}
                onChange={(e) => setTargetFps(Number(e.target.value))}
                className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-white text-xs font-mono"
              >
                <option value={15}>15 FPS</option>
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Hardware Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={flipCamera}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <RotateCw className="w-4 h-4 text-cyan-400" />
            <span>Flip ({facingMode === 'environment' ? 'Rear Cam' : 'Front Cam'})</span>
          </button>

          <button
            onClick={toggleTorch}
            disabled={!hasTorch}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              !hasTorch
                ? 'bg-slate-950 text-slate-600 border border-slate-800'
                : torchOn
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4 text-amber-400" />}
            <span>Torch {torchOn ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Error / Status Info */}
        {errorMsg ? (
          <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 text-center font-mono py-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
            {statusText}
          </div>
        )}

        {/* Main Master Streaming Button */}
        <button
          onClick={isStreaming ? handleStopStream : handleStartStream}
          className={`w-full py-4 px-4 rounded-xl text-sm font-black uppercase tracking-wider transition shadow-2xl flex items-center justify-center gap-2.5 ${
            isStreaming
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50 ring-4 ring-rose-500/20'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50 ring-4 ring-indigo-500/20'
          }`}
        >
          {isStreaming ? (
            <>
              <Radio className="w-5 h-5 animate-pulse" />
              <span>STOP LIVE BROADCAST</span>
            </>
          ) : (
            <>
              <Video className="w-5 h-5" />
              <span>START BROADCASTING PHONE CAMERA</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
