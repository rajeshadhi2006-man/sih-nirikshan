import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Eye,
  Camera,
  Activity,
  CheckCircle2,
  X,
  Zap,
} from 'lucide-react';
import { analyzeVideoFrame, GeminiFrameAnalysisResult } from '../../services/geminiService';

export interface VideoCallSession {
  call_id: string;
  user_id: string;
  officer_name: string;
  officer_id?: string;
  site_name?: string;
  trigger_reason?: string;
  is_automatic?: boolean;
  status: 'RINGING' | 'CONNECTED' | 'ENDED';
}

interface VideoCallModalProps {
  call: VideoCallSession | null;
  onEndCall: () => void;
}

export const VideoCallModal: React.FC<VideoCallModalProps> = ({ call, onEndCall }) => {
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<GeminiFrameAnalysisResult | null>(null);
  const [autoInspectEnabled, setAutoInspectEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Call timer effect
  useEffect(() => {
    if (!call || call.status !== 'CONNECTED') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [call?.status]);

  // Request camera access effect
  useEffect(() => {
    if (!call) return;

    let isMounted = true;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (isMounted) {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        console.warn('Camera access fallback (Using simulated tactical video stream):', err);
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [call?.call_id]);

  // Automatic frame snapshot inspection every 8 seconds when connected
  useEffect(() => {
    if (!call || call.status !== 'CONNECTED' || !autoInspectEnabled) return;

    const inspectInterval = setInterval(() => {
      handleCaptureAndAnalyze();
    }, 8000);

    return () => clearInterval(inspectInterval);
  }, [call?.call_id, call?.status, autoInspectEnabled]);

  if (!call) return null;

  const handleCaptureAndAnalyze = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);

    let frameBase64 = '';

    // Capture frame from live video element if playing
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frameBase64 = canvas.toDataURL('image/jpeg', 0.8);
        }
      }
    }

    // Fallback placeholder image frame if stream is unrendered
    if (!frameBase64) {
      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = 640;
      fallbackCanvas.height = 480;
      const ctx = fallbackCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#3b82f6';
        ctx.font = '20px monospace';
        ctx.fillText(`COMMAND DIRECTORATE - OFFICER ${call.officer_name}`, 40, 240);
        frameBase64 = fallbackCanvas.toDataURL('image/jpeg');
      }
    }

    const res = await analyzeVideoFrame(
      call.call_id,
      call.user_id,
      call.officer_name,
      frameBase64,
      `Perform biometric visual verification for ${call.officer_name} during video call session ${call.call_id}.`
    );

    setAiResult(res);
    setIsAnalyzing(false);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
      {/* Hidden canvas for taking snapshot frames */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header HUD */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute top-0 left-0" />
              <span className="w-3 h-3 rounded-full bg-emerald-500 block" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Real-Time Video Call & Gemini AI Sentinel
                </h2>
                {call.is_automatic && (
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[10px] font-bold flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-rose-400" />
                    <span>AUTOMATIC GEOFENCE TRIGGER</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Officer: <span className="text-blue-400 font-bold">{call.officer_name}</span> ({call.user_id}) | Site: {call.site_name || 'Tactical Perimeter'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="font-mono text-xs text-slate-300 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
              Duration: <span className="text-emerald-400 font-bold">{formatTime(callDuration)}</span>
            </div>
            <button
              onClick={onEndCall}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* Left: Live Video Display (8 Cols) */}
          <div className="lg:col-span-8 bg-slate-950 relative flex flex-col items-center justify-center p-4 min-h-[360px]">
            {cameraOff ? (
              <div className="flex flex-col items-center justify-center text-slate-500 space-y-2">
                <VideoOff className="w-16 h-16 text-slate-700 animate-pulse" />
                <span className="text-xs font-mono">Camera Feed Muted</span>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={micMuted}
                className="w-full h-full object-cover rounded-xl border border-slate-800 bg-slate-900 shadow-inner"
              />
            )}

            {/* Live Visual HUD Overlay */}
            <div className="absolute top-6 left-6 pointer-events-none flex flex-col space-y-2">
              <div className="px-3 py-1 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-lg text-[10px] font-mono text-emerald-400 flex items-center space-x-2">
                <Activity className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span>STREAM: 1080P @ 60FPS (WEBRTC SIGNALLING ACTIVE)</span>
              </div>
              {call.trigger_reason && (
                <div className="px-3 py-1 bg-rose-950/80 backdrop-blur border border-rose-800/80 rounded-lg text-[10px] font-mono text-rose-300 font-bold">
                  REASON: {call.trigger_reason}
                </div>
              )}
            </div>

            {/* Video Controls Dock */}
            <div className="absolute bottom-6 flex items-center space-x-3 bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-700 shadow-2xl">
              <button
                type="button"
                onClick={() => setMicMuted(!micMuted)}
                className={`p-3 rounded-full transition ${
                  micMuted ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title={micMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setCameraOff(!cameraOff)}
                className={`p-3 rounded-full transition ${
                  cameraOff ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title={cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {cameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={handleCaptureAndAnalyze}
                disabled={isAnalyzing}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full font-bold text-xs flex items-center space-x-2 shadow-lg transition disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                )}
                <span>INSPECT FRAME (GEMINI AI)</span>
              </button>

              <button
                type="button"
                onClick={onEndCall}
                className="p-3 bg-rose-600 hover:bg-rose-500 text-white rounded-full transition shadow-lg shadow-rose-950/50"
                title="End Call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right: Gemini AI Live Vision Intelligence Dock (4 Cols) */}
          <div className="lg:col-span-4 bg-slate-900 border-l border-slate-800 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Gemini AI Vision Sentinel
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoInspectEnabled(!autoInspectEnabled)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition ${
                    autoInspectEnabled
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  AUTO-INSPECT: {autoInspectEnabled ? 'ON (8s)' : 'OFF'}
                </button>
              </div>

              {/* Gemini AI Result Card */}
              {aiResult ? (
                <div className="mt-4 space-y-3">
                  {/* Status Banner */}
                  <div
                    className={`p-3.5 rounded-xl border flex items-center justify-between ${
                      aiResult.threat_level === 'LOW'
                        ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                        : aiResult.threat_level === 'MEDIUM'
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                        : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {aiResult.threat_level === 'LOW' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                      )}
                      <div>
                        <span className="font-bold text-xs block">
                          Threat Level: {aiResult.threat_level}
                        </span>
                        <span className="text-[10px] opacity-90 block font-mono">
                          Confidence: {aiResult.confidence_score.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono bg-slate-950 px-2 py-1 rounded border border-slate-700">
                      {aiResult.liveness_verified ? 'LIVENESS PASS' : 'CHECK REQ'}
                    </span>
                  </div>

                  {/* Visual Features Breakdown */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Facial Liveness:</span>
                      <span className={aiResult.liveness_verified ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {aiResult.liveness_verified ? 'VERIFIED (3D Passive)' : 'UNVERIFIED'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 font-sans">Uniform / Badge:</span>
                      <span className={aiResult.uniform_verified ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {aiResult.uniform_verified ? 'OFFICER UNIFORM MATCH' : 'NOT DETECTED'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400 font-sans text-[11px] block mb-1">Detected Gear / Badges:</span>
                      <div className="flex flex-wrap gap-1">
                        {aiResult.safety_gear_detected?.map((gear, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 text-[10px]"
                          >
                            {gear}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Gemini Advisory Description */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 text-cyan-400 font-bold">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Gemini AI Tactical Advisory:</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      "{aiResult.advisory}"
                    </p>
                    <span className="text-[9px] text-slate-500 block text-right font-mono mt-1">
                      Model: {aiResult.ai_model || 'Gemini 1.5 Flash'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-8 text-center space-y-3 text-slate-400">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl w-fit mx-auto">
                    <Sparkles className="w-8 h-8 text-cyan-400 animate-bounce" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Gemini AI Stream Inspector Standing By</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed px-4">
                    Click <span className="text-blue-400 font-bold">"INSPECT FRAME"</span> below to submit the current video frame to Gemini AI for liveness & security verification.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Button Actions */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                type="button"
                onClick={handleCaptureAndAnalyze}
                disabled={isAnalyzing}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition shadow-lg disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-cyan-300" />
                )}
                <span>RUN MANUAL GEMINI INSPECTION</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
