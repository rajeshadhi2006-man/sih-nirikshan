import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Camera,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Building2,
  Activity,
  Play,
  Shield,
  Smartphone,
  Download,
  Eye,
  Radio,
  Sliders,
  Maximize2,
  Sparkles,
  Zap,
  Layers,
  CircleDot,
  Laptop,
  Check,
  Settings,
  Users,
  Car,
  Clock,
  Cpu,
  QrCode,
  ExternalLink
} from 'lucide-react';
import {
  fetchCCTVPercentCameras,
  createCCTVCamera,
  fetchNetworkInfo,
  fetchCCTVConfig,
  updateCCTVConfig,
  getCCTVStreamUrl,
  getCCTVWebSocketUrl,
  testCCTVConnection,
  networkTestCCTV,
  uploadCCTVFrame,
  CCTVCamera,
  NetworkInfo,
  YOLOTelemetry,
  CCTVConfig,
  CCTVTestResponse,
  CCTVNetworkTestResponse
} from '../api/cctv';
import { fetchProjects, DoSJEProject } from '../api/projects';

export const CCTV: React.FC = () => {
  const [cameras, setCameras] = useState<CCTVCamera[]>([]);
  const [projects, setProjects] = useState<DoSJEProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCameraId, setSelectedCameraId] = useState('CCTV-01');

  // Real-Time YOLO11 Telemetry from WebSocket
  const [telemetry, setTelemetry] = useState<YOLOTelemetry>({
    camera_id: 'CCTV-01',
    timestamp: new Date().toISOString(),
    status: 'CONNECTING',
    connected: false,
    is_fallback: false,
    source: '0',
    last_frame: null,
    fps: 0,
    detections: [],
    counts: { person: 0, vehicle: 0, total: 0 }
  });


  const [cctvConfig, setCctvConfig] = useState<CCTVConfig>({
    camera_id: 'CCTV-01',
    source_url: '0',
    status: 'CONNECTING',
    fps: 0,
    model_name: 'YOLO11n',
    confidence: 0.35,
    imgsz: 640,
    max_fps: 25
  });

  // Network Info state
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  // Source URL configuration state
  const [customSourceUrl, setCustomSourceUrl] = useState('0');
  const [cameraMode, setCameraMode] = useState<'PHONE_STREAM' | 'LOCAL_WEBCAM'>('PHONE_STREAM');
  const [isConfigOpen, setIsConfigOpen] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  // Connection Test & Diagnostics state
  const [testStatus, setTestStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'FAILED'>('IDLE');
  const [testResult, setTestResult] = useState<CCTVTestResponse | null>(null);
  const [diagResult, setDiagResult] = useState<CCTVNetworkTestResponse | null>(null);
  const [isDiagRunning, setIsDiagRunning] = useState(false);

  // Stream Image Key (for reconnecting / refreshing stream)
  const [streamKey, setStreamKey] = useState(Date.now());
  const [streamError, setStreamError] = useState(false);

  // Tactical Controls
  const [visionFilter, setVisionFilter] = useState<'normal' | 'night' | 'thermal' | 'ir'>('normal');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [projectId, setProjectId] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamImgRef = useRef<HTMLImageElement | null>(null);
  const recordTimerRef = useRef<any>(null);

  // In-Browser Camera Streaming (for Cloud & Vercel deployment)
  const [isBrowserCamActive, setIsBrowserCamActive] = useState(false);
  const [browserCamError, setBrowserCamError] = useState<string | null>(null);
  const browserCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const browserCamStreamRef = useRef<MediaStream | null>(null);
  const browserCamTimerRef = useRef<any>(null);

  const startBrowserCam = async () => {
    try {
      setBrowserCamError(null);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      browserCamStreamRef.current = stream;
      setIsBrowserCamActive(true);
      setCameraMode('LOCAL_WEBCAM');
      setStreamError(false);

      setTimeout(async () => {
        if (browserCamVideoRef.current) {
          browserCamVideoRef.current.srcObject = stream;
          try {
            await browserCamVideoRef.current.play();
          } catch (e) {
            console.warn('Video play error:', e);
          }
        }
      }, 50);

      const wsUrl = getCCTVWebSocketUrl(selectedCameraId);
      const ws = new WebSocket(wsUrl);

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      if (browserCamTimerRef.current) clearInterval(browserCamTimerRef.current);
      browserCamTimerRef.current = setInterval(() => {
        const vid = browserCamVideoRef.current;
        if (!vid || !ctx || vid.readyState < 2) return;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.6);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'CCTV_FRAME',
              data: {
                camera_id: selectedCameraId,
                image: b64,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }
      }, 150);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setBrowserCamError(err.message || 'Camera permission denied or camera not found on this device');
      setIsBrowserCamActive(false);
    }
  };

  const stopBrowserCam = () => {
    if (browserCamTimerRef.current) {
      clearInterval(browserCamTimerRef.current);
      browserCamTimerRef.current = null;
    }
    if (browserCamStreamRef.current) {
      browserCamStreamRef.current.getTracks().forEach((t) => t.stop());
      browserCamStreamRef.current = null;
    }
    setIsBrowserCamActive(false);
  };

  useEffect(() => {
    return () => {
      stopBrowserCam();
    };
  }, []);

  // Test Connection Action
  const handleTestConnection = async () => {
    setTestStatus('CONNECTING');
    setTestResult(null);
    try {
      const res = await testCCTVConnection(customSourceUrl.trim());
      setTestResult(res);
      if (res.connected) {
        setTestStatus('CONNECTED');
      } else {
        setTestStatus('FAILED');
      }
    } catch (err: any) {
      setTestStatus('FAILED');
      setTestResult({
        connected: false,
        source: customSourceUrl,
        protocol: 'UNKNOWN',
        message: 'Connection test failed',
        error: err.message || 'Unknown network error'
      });
    }
  };

  // Granular Network Diagnostics Action
  const handleNetworkDiag = async () => {
    setIsDiagRunning(true);
    try {
      const res = await networkTestCCTV(customSourceUrl.trim());
      setDiagResult(res);
    } finally {
      setIsDiagRunning(false);
    }
  };

  // Load initial camera directory & backend config
  const loadData = async () => {
    setLoading(true);
    try {
      const [cList, pList, cfg, netInfo] = await Promise.all([
        fetchCCTVPercentCameras(),
        fetchProjects(),
        fetchCCTVConfig(),
        fetchNetworkInfo()
      ]);

      setCameras(cList);
      setProjects(pList);
      const savedSource = (typeof window !== 'undefined' && localStorage.getItem('cctv_selected_source')) || cfg?.source_url || '1';
      setCustomSourceUrl(savedSource);
      if (savedSource === '1') {
        setCameraMode('PHONE_STREAM');
      } else if (savedSource === '0') {
        setCameraMode('LOCAL_WEBCAM');
      } else {
        setCameraMode('PHONE_STREAM');
      }

      if (cfg) {
        setCctvConfig(cfg);
      }
      if (netInfo) {
        setNetworkInfo(netInfo);
      }
      if (pList.length > 0 && !projectId) {
        setProjectId(pList[0].id);
      }
    } catch (err) {
      console.warn('Error loading CCTV data:', err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    loadData();
  }, []);


  // Connect Real-Time FastAPI WebSocket for continuous YOLO11 Telemetry
  useEffect(() => {
    const wsUrl = getCCTVWebSocketUrl(selectedCameraId);
    let ws: WebSocket;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[WS] Connected to real-time YOLO11 telemetry: ${wsUrl}`);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.camera_id || data.status) {
              setTelemetry(data);
              setStreamError(data.status === 'OFFLINE');
            }
          } catch {}
        };

        ws.onclose = () => {
          // Reconnect attempt after 2s
          setTimeout(() => {
            if (wsRef.current === ws) {
              connectWebSocket();
            }
          }, 2000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        console.warn('WebSocket init error:', e);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedCameraId, streamKey]);

  // Update CCTV Source URL on the fly and persist permanently
  const handleSaveSourceConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigSuccessMsg(null);

    const sourceToSave = customSourceUrl.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem('cctv_selected_source', sourceToSave);
    }

    try {
      const success = await updateCCTVConfig({
        source_url: sourceToSave,
        confidence: cctvConfig.confidence,
        max_fps: cctvConfig.max_fps,
        imgsz: cctvConfig.imgsz
      });

      if (success) {
        setConfigSuccessMsg('CCTV source saved permanently. Reconnecting stream...');
        setStreamKey(Date.now());
        setStreamError(false);
        const updatedCfg = await fetchCCTVConfig();
        if (updatedCfg) {
          setCctvConfig(updatedCfg);
        }
        setTimeout(() => setConfigSuccessMsg(null), 3500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Instant 1-Click Permanent Source Switcher
  const handleSwitchSource = async (newSource: string) => {
    setCustomSourceUrl(newSource);
    setTestStatus('IDLE');
    setTestResult(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cctv_selected_source', newSource);
    }
    setIsSavingConfig(true);
    try {
      await updateCCTVConfig({
        source_url: newSource,
        confidence: cctvConfig.confidence,
        max_fps: cctvConfig.max_fps,
        imgsz: cctvConfig.imgsz
      });
      setStreamKey(Date.now());
      setStreamError(false);
      const updatedCfg = await fetchCCTVConfig();
      if (updatedCfg) {
        setCctvConfig(updatedCfg);
      }
      setConfigSuccessMsg(
        newSource === '1'
          ? '📱 Windows Phone Link (Device Index 1) saved permanently as default CCTV!'
          : newSource === '0'
          ? '💻 PC Webcam (Device Index 0) saved permanently!'
          : `CCTV source permanently set to ${newSource}`
      );
      setTimeout(() => setConfigSuccessMsg(null), 4000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingConfig(false);
    }
  };


  // Register New Camera
  const handleAddCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !cameraName.trim()) return;

    try {
      setSubmitting(true);
      await createCCTVCamera({
        project_id: projectId,
        camera_name: cameraName.trim(),
        location_description: locationDesc.trim() || 'Project Facility Entrance',
        stream_url: streamUrl.trim() || undefined,
      });

      setIsModalOpen(false);
      setCameraName('');
      setLocationDesc('');
      setStreamUrl('');
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // HD Snapshot Capture
  const handleTakeSnapshot = () => {
    if (!streamImgRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = streamImgRef.current.naturalWidth || 640;
    canvas.height = streamImgRef.current.naturalHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(streamImgRef.current, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `DoSJE_YOLO11_Snapshot_${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    }
  };

  // Toggle Recording
  const handleToggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      clearInterval(recordTimerRef.current);
      setRecordingSeconds(0);
    } else {
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    }
  };

  const isLive = telemetry.status === 'LIVE';
  const isConnecting = telemetry.status === 'CONNECTING';
  const isOffline = telemetry.status === 'OFFLINE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Video className="w-5 h-5 text-indigo-400" />
            <span>National Command Center — Live CCTV Surveillance Center</span>
          </h1>
          <p className="text-xs text-slate-400">
            Real-time local YOLO11 object detection & ByteTrack tracking integrated directly with live phone camera feed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Connect Phone Camera Button */}
          <button
            onClick={() => setIsQrModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-900/40 animate-pulse"
          >
            <Smartphone className="w-4 h-4" />
            <span>📱 Connect Phone Camera</span>
          </button>

          {/* Source Settings Button */}
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition"
          >
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Configure Stream</span>
          </button>

          <button
            onClick={() => {
              setStreamKey(Date.now());
              loadData();
            }}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-indigo-900/40"
          >
            <Plus className="w-4 h-4" />
            <span>Register Camera</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CCTV CAMERA SETUP & TEST CONTROL SECTION (Section 6 & 17 Specification) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-white uppercase tracking-wider">CCTV CAMERA</h3>
                <span className="text-xs font-mono text-indigo-400 font-bold bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/30">
                  Camera ID: CCTV-01
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Configure real phone stream URL or local webcam test input for YOLO11
              </span>
            </div>
          </div>

          {/* Status Badge: ● LIVE | ● OFFLINE | ● TEST CAMERA */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Status:</span>
            {telemetry.is_fallback ? (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>● TEST CAMERA</span>
              </span>
            ) : isLive ? (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>● LIVE</span>
              </span>
            ) : isConnecting ? (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>● CONNECTING...</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>● OFFLINE</span>
              </span>
            )}
          </div>
        </div>

        {/* Source Mode Toggle (Windows Phone Link vs Phone Web Broadcaster vs IP Stream vs PC Webcam) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase">CAMERA SOURCE:</span>
            <div className="flex flex-wrap p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold gap-1.5 shadow-inner">
              {/* Option: In-Browser Webcam (Instant Testing on Cloud & Local) */}
              <button
                type="button"
                onClick={() => {
                  if (isBrowserCamActive) {
                    stopBrowserCam();
                  } else {
                    startBrowserCam();
                  }
                }}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  isBrowserCamActive
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40 ring-2 ring-rose-400/60 animate-pulse'
                    : 'text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isBrowserCamActive ? '🛑 Stop In-Browser Cam' : '🎥 In-Browser Camera'}</span>
              </button>

              {/* Option 1: Mobile Browser Phone Broadcaster */}
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/30"
              >
                <QrCode className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>📲 Scan Phone QR Link</span>
              </button>

              {/* Option 2: Windows Phone Link (Direct Local Only) */}
              <button
                type="button"
                onClick={() => handleSwitchSource('1')}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  customSourceUrl === '1'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-2 ring-blue-400/60'
                    : 'text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-300" />
                <span>📱 Phone Link (Local PC)</span>
              </button>

              {/* Option 3: IP Webcam / DroidCam */}
              <button
                type="button"
                onClick={() => {
                  setCameraMode('PHONE_STREAM');
                  setCustomSourceUrl('http://192.168.1.45:8080/video');
                  setTestStatus('IDLE');
                  setTestResult(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  customSourceUrl.startsWith('http') || customSourceUrl.startsWith('rtsp')
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-2 ring-indigo-400/60'
                    : 'text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-indigo-300" />
                <span>🌐 IP Webcam / DroidCam</span>
              </button>

              {/* Option 4: PC Webcam */}
              <button
                type="button"
                onClick={() => handleSwitchSource('0')}
                className={`px-3.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                  customSourceUrl === '0'
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 ring-2 ring-amber-400/60'
                    : 'text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800'
                }`}
              >
                <Laptop className="w-3.5 h-3.5 text-amber-300" />
                <span>💻 PC Webcam (Cam 0)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-400">Host PC LAN IP:</span>
            <strong className="text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {networkInfo?.local_ip || '127.0.0.1'}
            </strong>
          </div>
        </div>

        {/* Phone Link Quick Guide Banner */}
        <div className="p-3 bg-gradient-to-r from-emerald-950/40 via-slate-950 to-indigo-950/40 border border-emerald-500/20 rounded-xl text-[11px] text-slate-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400 border border-emerald-500/30 shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">
                How to Connect Phone to CCTV:
              </span>
              <span className="text-slate-400 text-[11px]">
                <strong>Method 1:</strong> Connect via <span className="text-emerald-400">Windows Phone Link</span> (Microsoft Phone Link &gt; Use as Connected Camera &gt; Select <strong className="text-white">Cam 1</strong>). <br />
                <strong>Method 2:</strong> Tap <strong className="text-cyan-400">"Scan Phone QR Link"</strong> on your phone browser to stream live video directly without any apps!
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsQrModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1.5 shadow-lg shadow-emerald-900/30"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Open Phone QR Code</span>
          </button>
        </div>

        {/* Proactive Phone Link Troubleshooting: Why didn't I get a notification on phone? */}
        {customSourceUrl === '1' && (
          <div className="p-3.5 bg-gradient-to-r from-amber-950/40 via-slate-950 to-blue-950/40 border border-amber-500/30 rounded-xl text-xs space-y-2.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Not receiving the notification on your phone when opening Phone Link?</span>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 shadow shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Scan Phone QR Link Instead (Instant Zero Setup)</span>
              </button>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Windows Phone Link requires OS-level permission before Windows sends the prompt to your phone:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
              <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                <span className="font-bold text-amber-400 block mb-1">Step 1: Open Settings</span>
                Press <kbd className="px-1.5 py-0.5 bg-slate-800 text-white rounded font-mono text-[10px] border border-slate-700">Win + I</kbd> &gt; <strong>Bluetooth &amp; devices</strong> &gt; <strong>Mobile devices</strong>.
              </div>
              <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                <span className="font-bold text-amber-400 block mb-1">Step 2: Enable Feature</span>
                Toggle ON <strong>"Allow this PC to access your mobile devices"</strong>.
              </div>
              <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800">
                <span className="font-bold text-amber-400 block mb-1">Step 3: Enable Camera</span>
                Click <strong>Manage devices</strong> and turn ON <strong>"Use as a connected camera"</strong>.
              </div>
            </div>
            <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
              <span className="text-cyan-400 font-bold">💡 Tip:</span>
              <span>
                If you prefer not to configure Windows Settings, click <strong className="text-cyan-300">"Scan Phone QR Link"</strong>. It opens the camera directly inside your phone's browser (Chrome/Safari) and streams live to YOLO11 immediately without any apps or pairing!
              </span>
            </div>
          </div>
        )}

        {/* Configurable Source Field & Test Connection Form */}
        <form onSubmit={handleSaveSourceConfig} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-7">
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Source: (HTTP/MJPEG, RTSP, TCP stream or Device Index):
              </label>
              <input
                type="text"
                value={customSourceUrl}
                onChange={(e) => {
                  setCustomSourceUrl(e.target.value);
                  setTestStatus('IDLE');
                  setTestResult(null);
                }}
                placeholder="http://PHONE_IP:PORT/video or rtsp://PHONE_IP:PORT/STREAM_PATH"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 transition"
                required
              />
            </div>


            <div className="md:col-span-3 flex gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === 'CONNECTING'}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1.5 ${
                  testStatus === 'CONNECTING'
                    ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 cursor-wait'
                    : testStatus === 'CONNECTED'
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                    : testStatus === 'FAILED'
                    ? 'bg-rose-600/30 text-rose-300 border-rose-500/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                {testStatus === 'CONNECTING' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Connecting...</span>
                  </>
                ) : testStatus === 'CONNECTED' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>CONNECTED</span>
                  </>
                ) : testStatus === 'FAILED' ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>CONNECTION FAILED</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5 text-cyan-400" />
                    <span>TEST CONNECTION</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleNetworkDiag}
                disabled={isDiagRunning}
                title="Run Granular Network & Decoder Diagnostics"
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center"
              >
                {isDiagRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                )}
              </button>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isSavingConfig}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isSavingConfig ? 'Applying...' : 'Apply Stream'}</span>
              </button>
            </div>
          </div>

          {/* Test Connection Result Feedback Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition animate-in fade-in duration-200 ${
                testResult.connected
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-800 text-rose-300'
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="font-bold uppercase tracking-wider">
                  {testResult.connected ? 'Stream Connected' : 'Connection Failed'}
                </div>
                <div className="text-[11px] opacity-90">{testResult.message}</div>
                {testResult.error && (
                  <div className="text-[11px] font-mono text-rose-400 pt-0.5">
                    Reason: {testResult.error}
                  </div>
                )}
                {testResult.frame_size && (
                  <div className="text-[10px] font-mono text-emerald-400">
                    Frame Resolution: {testResult.frame_size} • Ready for YOLO11
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Granular Network Diagnostics Banner */}
          {diagResult && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-800 pb-1 font-sans">
                <span>Granular Diagnostic Results</span>
                <span className={diagResult.ready_for_yolo ? 'text-emerald-400' : 'text-rose-400'}>
                  {diagResult.ready_for_yolo ? 'READY FOR YOLO11' : 'NOT READY'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${diagResult.network_reachable ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                  <span className="text-slate-400">Socket Reachable</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${diagResult.stream_opened ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                  <span className="text-slate-400">Stream Opened</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${diagResult.first_frame_received ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                  <span className="text-slate-400">Frame Received</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${diagResult.decoder_working ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                  <span className="text-slate-400">Decoder Working</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 pt-1">
                {diagResult.diagnostics}
              </div>
            </div>
          )}

          {configSuccessMsg && (
            <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{configSuccessMsg}</span>
            </div>
          )}
        </form>
      </div>

      {/* KPI Cards — Actual YOLO11 Telemetry (Section 15 Specification) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Detection Model</span>
            <Cpu className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-1 text-2xl font-black text-white font-mono">YOLO11n</div>
          <span className="text-[10px] text-slate-500 font-mono">ByteTrack Local Engine</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400 uppercase">Persons Detected</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-400 font-mono">{telemetry.counts.person}</div>
          <span className="text-[10px] text-slate-500 font-mono">Real-time Person Counter</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-cyan-400 uppercase">Vehicles Detected</span>
            <Car className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-1 text-2xl font-black text-cyan-400 font-mono">{telemetry.counts.vehicle}</div>
          <span className="text-[10px] text-slate-500 font-mono">Cars, Trucks, Bikes</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase">Real-Time FPS</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-1 text-2xl font-black text-amber-400 font-mono">
            {telemetry.fps > 0 ? `${telemetry.fps}` : '0'}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Inference & Capture Rate</span>
        </div>
      </div>

      {/* Main CCTV Surveillance Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Live CCTV Feed with Real-Time YOLO11 Bounding Boxes (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[480px]">
          {/* Stream Player Top Header */}
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                <Video className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white block">
                    LIVE CCTV — {selectedCameraId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border flex items-center gap-1.5 ${
                      telemetry.is_fallback
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : isLive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : isConnecting
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        telemetry.is_fallback
                          ? 'bg-amber-400 animate-pulse'
                          : isLive
                          ? 'bg-emerald-400 animate-ping'
                          : isConnecting
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span>
                      {telemetry.is_fallback ? 'TEST CAMERA' : isLive ? 'LIVE' : isConnecting ? 'CONNECTING' : 'OFFLINE'}
                    </span>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  Source: {
                    cctvConfig.source_url === '1'
                      ? '📱 Windows Phone Link HD Camera (Index 1) • Default Persistent Source'
                      : cctvConfig.source_url === '0'
                      ? '💻 PC Webcam (Index 0)'
                      : cctvConfig.source_url
                  }
                </span>
              </div>
            </div>


            {/* Tactical Vision Filter Mode Toggles */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
              <button
                onClick={() => setVisionFilter('normal')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  visionFilter === 'normal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Normal
              </button>
              <button
                onClick={() => setVisionFilter('night')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  visionFilter === 'night' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Night Vision
              </button>
              <button
                onClick={() => setVisionFilter('thermal')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  visionFilter === 'thermal' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Thermal
              </button>
              <button
                onClick={() => setVisionFilter('ir')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  visionFilter === 'ir' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                IR Gray
              </button>
            </div>
          </div>

          {/* Actual Live Video Viewport */}
          <div
            className={`flex-1 bg-black flex flex-col items-center justify-center relative min-h-[380px] overflow-hidden ${
              visionFilter === 'night'
                ? 'hue-rotate-90 saturate-200 brightness-110 contrast-125 [filter:sepia(1)_hue-rotate(80deg)_saturate(5)]'
                : visionFilter === 'thermal'
                ? '[filter:invert(0.9)_hue-rotate(220deg)_saturate(4)]'
                : visionFilter === 'ir'
                ? 'grayscale contrast-150'
                : ''
            }`}
          >
            {/* If In-Browser Camera is Active, display the live local camera video directly */}
            {isBrowserCamActive ? (
              <video
                ref={browserCamVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full max-h-[460px] object-contain transition-transform ${
                  zoomLevel === 2 ? 'scale-125' : zoomLevel === 3 ? 'scale-150' : ''
                }`}
              />
            ) : (
              /* Real-Time MJPEG Stream with YOLO11 Bounding Boxes */
              <img
                ref={streamImgRef}
                src={getCCTVStreamUrl(selectedCameraId, streamKey)}
                alt="Live YOLO11 CCTV Stream"
                crossOrigin="anonymous"
                className={`w-full h-full max-h-[460px] object-contain transition-transform ${
                  zoomLevel === 2 ? 'scale-125' : zoomLevel === 3 ? 'scale-150' : ''
                }`}
              />
            )}

            {/* Offline Alert Placeholder (Section 16 Specification) */}
            {isOffline && !isBrowserCamActive && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl text-rose-400">
                  <AlertTriangle className="w-10 h-10 stroke-1 animate-pulse" />
                </div>
                <h4 className="text-base font-bold text-white uppercase font-mono tracking-wider">
                  CCTV STREAM WAITING FOR INPUT
                </h4>
                <p className="text-xs text-slate-300 max-w-md">
                  Cloud server is active and awaiting video frames. Choose an input source below to stream live video directly to YOLO11 AI:
                </p>
                
                {browserCamError && (
                  <div className="p-2 bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs rounded-lg">
                    {browserCamError}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={startBrowserCam}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-900/30 flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>🎥 Start In-Browser Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-900/30 flex items-center gap-2"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>📱 Connect Phone Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStreamKey(Date.now());
                      loadData();
                    }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition border border-slate-700 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            )}


            {/* HUD Overlay — Section 8 Specification */}
            {!isOffline && (
              <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between select-none">
                {/* Top HUD */}
                <div className="flex justify-between items-start text-[11px] font-mono font-bold text-white/90">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                      <span className="text-rose-400">LIVE CCTV — {selectedCameraId} ● LIVE</span>
                    </div>
                    <span className="text-slate-300 text-[10px] block">
                      ACTUAL PHONE CAMERA FEED — YOLO11n
                    </span>
                  </div>

                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-right space-y-0.5">
                    <span className="text-cyan-400 block font-bold">FPS: {telemetry.fps || 24}</span>
                    <span className="text-slate-300 text-[10px]">
                      Objects: {telemetry.counts.total}
                    </span>
                  </div>
                </div>

                {/* Bottom HUD */}
                <div className="flex justify-between items-end text-[10px] font-mono text-white/80">
                  <div className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    <span className="text-emerald-400">
                      TRACKER: BYTETRACK | CONF: {cctvConfig.confidence}
                    </span>
                  </div>

                  <div className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    <span>{telemetry.timestamp || new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tactical Bottom Control Strip */}
          <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleTakeSnapshot}
                disabled={isOffline}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Take Snapshot</span>
              </button>

              <button
                onClick={handleToggleRecording}
                disabled={isOffline}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700'
                }`}
              >
                <CircleDot className="w-3.5 h-3.5 text-rose-400" />
                <span>{isRecording ? `Recording (${recordingSeconds}s)` : 'Record Video'}</span>
              </button>
            </div>

            {/* Digital Zoom Controls */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Zoom:</span>
              <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                {[1, 2, 3].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoomLevel(z)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold transition ${
                      zoomLevel === z ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Real-Time YOLO11 Detection Information Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* YOLO Information Section (Section 10 Specification) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>YOLO11 Live Telemetry</span>
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  isLive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {telemetry.status}
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">MODEL</span>
                <span className="text-indigo-400 font-bold">YOLO11n (Local)</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">CAMERA</span>
                <span className="text-white font-bold">{telemetry.camera_id}</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">STATUS</span>
                <span className={isLive ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {telemetry.status}
                </span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">FPS</span>
                <span className="text-cyan-400 font-bold">{telemetry.fps}</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">PERSONS</span>
                <span className="text-emerald-400 font-bold">{telemetry.counts.person}</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">VEHICLES</span>
                <span className="text-cyan-400 font-bold">{telemetry.counts.vehicle}</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80">
                <span className="text-slate-400 font-sans font-medium">TOTAL OBJECTS</span>
                <span className="text-amber-400 font-bold">{telemetry.counts.total}</span>
              </div>

              <div className="flex justify-between items-center p-2 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px]">
                <span className="text-slate-400 font-sans font-medium">LAST DETECTION</span>
                <span className="text-slate-300 truncate max-w-[140px]">
                  {telemetry.timestamp ? telemetry.timestamp.replace('T', ' ').substring(0, 19) : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Real-Time Detected Objects Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Active Tracks ({telemetry.detections.length})</span>
            </h3>

            {telemetry.detections.length === 0 ? (
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-slate-500 font-mono">
                No active targets in view
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {telemetry.detections.map((det, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          det.class === 'person' ? 'bg-emerald-400' : 'bg-cyan-400'
                        }`}
                      />
                      <span className="font-bold text-white uppercase">{det.class}</span>
                      {det.track_id && <span className="text-slate-500 text-[10px]">#{det.track_id}</span>}
                    </div>

                    <span className="text-emerald-400 font-bold">
                      {Math.round(det.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REGISTER NEW CCTV CAMERA MODAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-400" />
                Register CCTV Camera
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCamera} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Select Project *</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.district})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Camera Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Entry Gate CAM-01"
                  value={cameraName}
                  onChange={(e) => setCameraName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Location Description</label>
                <input
                  type="text"
                  placeholder="e.g. Front Gate & Reception Sector"
                  value={locationDesc}
                  onChange={(e) => setLocationDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Internal RTSP / Stream URL (Optional)</label>
                <input
                  type="text"
                  placeholder="0 or http://192.168.1.50:8080/video or rtsp://..."
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition"
                >
                  {submitting ? 'Saving...' : 'Register Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIRECT PHONE CAMERA STREAM & PHONE LINK MODAL */}
      {/* ========================================================================= */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Connect Phone to CCTV Surveillance
                  </h3>
                  <span className="text-[10px] text-slate-400">Windows Phone Link • Mobile Web Stream • IP Camera</span>
                </div>
              </div>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Method 1: Instant QR Code Scan (Zero App Install) */}
            {(() => {
              const isCloud = typeof window !== 'undefined' && (
                window.location.protocol === 'https:' ||
                window.location.hostname.includes('vercel.app') ||
                window.location.hostname.includes('pages.dev') ||
                window.location.hostname.includes('trycloudflare.com')
              );
              const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
              const rawIp = manualIp.trim() ||
                networkInfo?.local_ip ||
                (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
              const isLocalhost = !isCloud && (rawIp === 'localhost' || rawIp === '127.0.0.1' || rawIp === '::1');
              const broadcasterUrl = isCloud
                ? `${currentOrigin}/cctv-broadcaster?cam=CCTV-01`
                : `http://${rawIp}:5173/cctv-broadcaster?cam=CCTV-01`;

              return (
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <QrCode className="w-4 h-4" />
                      <span>Method 1: Instant Phone Web Stream (QR Code)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30 font-bold">
                      {isCloud ? 'Cloud Online' : 'Recommended'}
                    </span>
                  </div>

                  {/* Warning if IP is localhost on local dev */}
                  {isLocalhost && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-950/60 border border-amber-500/40 rounded-xl text-[11px] text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        <strong className="text-amber-200">Phone can't reach this IP ({rawIp}).</strong>{' '}
                        Your PC's LAN IP was not detected. Enter your PC's local network IP below
                        (e.g. <code className="font-mono bg-slate-900 px-1 rounded">192.168.1.X</code>).
                        Find it by running <code className="font-mono bg-slate-900 px-1 rounded">ipconfig</code> on your PC.
                      </span>
                    </div>
                  )}

                  {/* Manual IP override field (only shown on local development) */}
                  {!isCloud && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-slate-400 font-bold uppercase shrink-0">PC LAN IP:</label>
                      <input
                        type="text"
                        value={manualIp}
                        onChange={e => setManualIp(e.target.value)}
                        placeholder={networkInfo?.local_ip || '192.168.1.X'}
                        className={`flex-1 bg-slate-900 border ${
                          isLocalhost ? 'border-amber-500/60' : 'border-slate-700'
                        } rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-600 outline-none focus:border-blue-500 transition font-mono`}
                      />
                      {manualIp && (
                        <button
                          onClick={() => setManualIp('')}
                          className="text-slate-500 hover:text-white transition text-[10px] px-1.5"
                          title="Reset to auto-detected IP"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                    {/* QR Code — regenerates live as IP changes */}
                    <div className={`p-2.5 rounded-2xl shadow-md border-4 shrink-0 ${
                      isLocalhost ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-800'
                    }`}>
                      <img
                        key={broadcasterUrl}
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(broadcasterUrl)}`}
                        alt="Scan QR to open phone stream"
                        className="w-36 h-36 object-contain rounded-lg"
                      />
                    </div>

                    <div className="space-y-2.5 text-xs flex-1 w-full">
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {isCloud ? (
                          <>
                            1. Open your Phone's Camera app (works over mobile data or Wi-Fi).<br />
                            2. Scan this QR Code to open the Live Stream Broadcaster.<br />
                            3. Tap <strong className="text-emerald-400">"Start Broadcasting"</strong> to stream directly to YOLO11!
                          </>
                        ) : (
                          <>
                            1. Ensure your Phone and PC are on the <strong>same Wi-Fi / Hotspot</strong>.<br />
                            2. Scan this QR Code with your Phone's Camera app.<br />
                            3. Tap <strong className="text-emerald-400">"Start Broadcasting"</strong> to stream live to YOLO11!
                          </>
                        )}
                      </p>

                      {/* Live link display */}
                      <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
                        <code className="text-[10px] font-mono text-cyan-300 break-all block">
                          {broadcasterUrl}
                        </code>
                        <div className="flex items-center gap-2">
                          {/* Copy Link button with inline ✓ feedback */}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(broadcasterUrl).then(() => {
                                setLinkCopied(true);
                                setTimeout(() => setLinkCopied(false), 2500);
                              });
                            }}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition ${
                              linkCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            }`}
                          >
                            {linkCopied ? (
                              <><Check className="w-3 h-3" /> Copied!</>
                            ) : (
                              <><Download className="w-3 h-3" /> Copy Link</>
                            )}
                          </button>

                          {/* Open in PC browser to verify */}
                          <button
                            type="button"
                            onClick={() => window.open(broadcasterUrl, '_blank')}
                            className="flex-1 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-300 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition"
                            title="Open this link on PC to verify it works"
                          >
                            <ExternalLink className="w-3 h-3" /> Open in Browser
                          </button>
                        </div>
                      </div>

                      {/* Tip */}
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        💡 Can't scan? Open the link on PC first to check it loads, then type it manually on your phone or share via WhatsApp/AirDrop.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Method 2: Microsoft Windows Phone Link Setup */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2.5 text-xs">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Laptop className="w-4 h-4" />
                <span>Method 2: Microsoft Windows Phone Link (Virtual Webcam)</span>
              </span>

              <p className="text-slate-300 text-[11px] leading-relaxed">
                Connect your Android or iPhone using Windows 11 / 10 <strong>Phone Link</strong> as a system webcam:
              </p>

              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <li>Open Windows <strong>Settings &gt; Bluetooth &amp; devices &gt; Mobile devices</strong></li>
                <li>Toggle on <strong className="text-white">"Allow this PC to access your mobile devices"</strong></li>
                <li>Click Manage devices and turn on <strong className="text-emerald-400">"Use as a connected camera"</strong></li>
                <li>In this web app, click <strong className="text-cyan-400">"📱 Windows Phone Link (Cam 1)"</strong> button to activate 30 FPS YOLO11 live stream!</li>
              </ol>

              <button
                type="button"
                onClick={() => {
                  handleSwitchSource('1');
                  setIsQrModalOpen(false);
                }}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-lg shadow-blue-900/30 flex items-center justify-center gap-1.5"
              >
                <Smartphone className="w-4 h-4" />
                <span>Switch CCTV Source to Windows Phone Link (Cam 1)</span>
              </button>
            </div>

            {/* Method 3: IP Webcam / DroidCam Apps */}
            <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-4 h-4" />
                <span>Method 3: IP Webcam / DroidCam Stream URL</span>
              </span>
              <p className="text-slate-400 text-[11px]">
                Install <em>IP Webcam</em> or <em>DroidCam</em> on Android/iOS, tap 'Start Server', and enter the stream URL (e.g. <code className="text-amber-300 font-mono">http://192.168.1.XX:8080/video</code>).
              </p>
            </div>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition"
            >
              Close Bridge Window
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
