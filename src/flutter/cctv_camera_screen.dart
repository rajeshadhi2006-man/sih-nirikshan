import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';

/// Data model representing an active authenticated CCTV Camera Session.
class CCTVSession {
  final String cameraId;
  final String sessionId;
  final String status;
  final String wsUrl;
  final String uploadUrl;
  final String streamUrl;

  CCTVSession({
    required this.cameraId,
    required this.sessionId,
    required this.status,
    required this.wsUrl,
    required this.uploadUrl,
    required this.streamUrl,
  });

  factory CCTVSession.fromJson(Map<String, dynamic> json) {
    return CCTVSession(
      cameraId: json['camera_id'] ?? 'CAM-001',
      sessionId: json['session_id'] ?? '',
      status: json['status'] ?? 'READY',
      wsUrl: json['ws_url'] ?? '',
      uploadUrl: json['upload_url'] ?? '',
      streamUrl: json['stream_url'] ?? '',
    );
  }
}

/// Real-time CCTV Physical Camera Broadcaster Screen for Government Android App.
/// Connects physical Android phone camera directly to FastAPI backend and Government Web Dashboard.
class CCTVCameraScreen extends StatefulWidget {
  final String officerId;
  final String officerName;
  final String hostIp; // e.g. "192.168.1.X" or "10.0.2.2" (for emulator)
  final int port;

  const CCTVCameraScreen({
    Key? key,
    this.officerId = 'OFF-101',
    this.officerName = 'Officer Vikramaditya Rao',
    this.hostIp = '192.168.1.45', // Set to your Command PC LAN IP
    this.port = 8000,
  }) : super(key: key);

  @override
  State<CCTVCameraScreen> createState() => _CCTVCameraScreenState();
}

class _CCTVCameraScreenState extends State<CCTVCameraScreen> with WidgetsBindingObserver {
  List<CameraDescription> _cameras = [];
  CameraController? _cameraController;
  bool _isCameraInitialized = false;
  int _selectedCameraIndex = 0;

  // Streaming & Session State
  bool _isStreaming = false;
  CCTVSession? _activeSession;
  WebSocketChannel? _wsChannel;
  Timer? _frameTimer;
  bool _isProcessingFrame = false;

  // Real-time Telemetry
  int _framesSent = 0;
  int _currentFps = 0;
  int _targetFps = 30;
  int _fpsFrameCount = 0;
  DateTime _fpsLastCheck = DateTime.now();
  String _resolution = '1280x720';
  String _networkStatus = 'Checking LAN...';
  String _statusMessage = 'Camera Offline — Tap START CAMERA to begin broadcast';

  late String _serverIp;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _serverIp = widget.hostIp;
    _initPhysicalCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopStreaming();
    _cameraController?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }
    if (state == AppLifecycleState.inactive) {
      _stopStreaming();
      _cameraController?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initPhysicalCamera();
    }
  }

  /// Initialize physical device camera using Flutter Camera plugin
  Future<void> _initPhysicalCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() {
          _statusMessage = 'No physical cameras detected on this device.';
        });
        return;
      }

      // Default to rear back camera for inspection
      _selectedCameraIndex = _cameras.indexWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
      );
      if (_selectedCameraIndex == -1) _selectedCameraIndex = 0;

      await _setupCameraController(_cameras[_selectedCameraIndex]);
    } catch (e) {
      setState(() {
        _statusMessage = 'Camera permission or hardware error: $e';
      });
    }
  }

  Future<void> _setupCameraController(CameraDescription cameraDescription) async {
    if (_cameraController != null) {
      await _cameraController!.dispose();
    }

    _cameraController = CameraController(
      cameraDescription,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    try {
      await _cameraController!.initialize();
      if (mounted) {
        setState(() {
          _isCameraInitialized = true;
          _resolution = '${_cameraController!.value.previewSize?.height.toInt() ?? 720}x${_cameraController!.value.previewSize?.width.toInt() ?? 1280}';
          _statusMessage = 'Physical Camera Ready (${_cameras[_selectedCameraIndex].lensDirection.name.toUpperCase()})';
          _networkStatus = 'LAN Ready: http://$_serverIp:${widget.port}';
        });
      }
    } catch (e) {
      setState(() {
        _statusMessage = 'Error initializing camera: $e';
      });
    }
  }

  /// Toggle between Front and Back camera sensors
  Future<void> _flipCamera() async {
    if (_cameras.length < 2) return;
    _selectedCameraIndex = (_selectedCameraIndex + 1) % _cameras.length;
    await _setupCameraController(_cameras[_selectedCameraIndex]);
  }

  /// START CAMERA: Authenticates, creates dynamic session, opens WebSocket & starts frame loop
  Future<void> _startStreaming() async {
    if (!_isCameraInitialized || _cameraController == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Camera not ready. Please wait.')),
      );
      return;
    }

    setState(() {
      _statusMessage = 'Creating authenticated camera session on Command Hub...';
    });

    try {
      // 1. Authenticate and create dynamic session with FastAPI backend
      final url = Uri.parse('http://$_serverIp:${widget.port}/api/cctv/sessions/start');
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'officer_id': widget.officerId,
          'officer_name': widget.officerName,
          'device_model': 'Android Phone Physical Camera',
          'resolution': _resolution,
          'fps': _targetFps,
        }),
      ).timeout(const Duration(seconds: 4));

      if (response.statusCode != 200) {
        throw Exception('Server rejected session (${response.statusCode}): ${response.body}');
      }

      final data = jsonDecode(response.body);
      final session = CCTVSession.fromJson(data);

      // 2. Establish persistent low-latency WebSocket connection
      final wsUri = Uri.parse('ws://$_serverIp:${widget.port}/ws/cctv/${session.cameraId}');
      final channel = IOWebSocketChannel.connect(wsUri);

      setState(() {
        _activeSession = session;
        _wsChannel = channel;
        _isStreaming = true;
        _framesSent = 0;
        _currentFps = 0;
        _statusMessage = 'Streaming live to Command Center (${session.cameraId})';
        _networkStatus = 'Connected: ws://$_serverIp:${widget.port}';
      });

      // 3. High-speed frame acquisition and transmission loop (30 FPS)
      final frameInterval = Duration(milliseconds: (1000 / _targetFps).round());
      _frameTimer = Timer.periodic(frameInterval, (timer) {
        _captureAndTransmitFrame();
      });

    } catch (e) {
      setState(() {
        _isStreaming = false;
        _statusMessage = 'Connection failed: Verify PC IP ($_serverIp:${widget.port}) and Wi-Fi';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: Colors.red.shade900,
          content: Text('Connection Error: $e'),
        ),
      );
    }
  }

  /// Captures JPEG frame from physical camera and transmits to FastAPI over WebSocket / HTTP
  Future<void> _captureAndTransmitFrame() async {
    if (!_isStreaming || _isProcessingFrame || _cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    _isProcessingFrame = true;
    try {
      final image = await _cameraController!.takePicture();
      final bytes = await image.readAsBytes();

      // Transmit raw binary JPEG bytes directly over WebSocket for minimum latency (<5ms)
      if (_wsChannel != null) {
        _wsChannel!.sink.add(bytes);
      } else if (_activeSession != null) {
        // Fallback: HTTP REST upload
        final b64 = base64Encode(bytes);
        http.post(
          Uri.parse('http://$_serverIp:${widget.port}/api/cctv/frame'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'camera_id': _activeSession!.cameraId,
            'image': b64,
          }),
        );
      }

      _framesSent++;
      _fpsFrameCount++;

      final now = DateTime.now();
      if (now.difference(_fpsLastCheck).inMilliseconds >= 1000) {
        if (mounted) {
          setState(() {
            _currentFps = _fpsFrameCount;
            _fpsFrameCount = 0;
            _fpsLastCheck = now;
          });
        }
      }
    } catch (_) {
      // Ignored for non-blocking stream
    } finally {
      _isProcessingFrame = false;
    }
  }

  /// STOP CAMERA: Gracefully terminates session and WebSocket
  Future<void> _stopStreaming() async {
    _frameTimer?.cancel();
    _frameTimer = null;

    if (_activeSession != null) {
      try {
        final url = Uri.parse('http://$_serverIp:${widget.port}/api/cctv/sessions/stop');
        await http.post(
          url,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'camera_id': _activeSession!.cameraId,
            'session_id': _activeSession!.sessionId,
            'officer_id': widget.officerId,
          }),
        );
      } catch (_) {}
    }

    try {
      _wsChannel?.sink.close();
    } catch (_) {}
    _wsChannel = null;

    if (mounted) {
      setState(() {
        _isStreaming = false;
        _activeSession = null;
        _currentFps = 0;
        _statusMessage = 'Camera Offline — Tap START CAMERA to begin broadcast';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLive = _isStreaming;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0F19), // Dark Command Center Slate
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: const Text(
          'LIVE CAMERA',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.2,
            color: Colors.white,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.flip_camera_ios, color: Colors.cyanAccent),
            tooltip: 'Flip Camera Sensor',
            onPressed: _flipCamera,
          ),
          IconButton(
            icon: const Icon(Icons.settings_ethernet, color: Colors.indigoAccent),
            tooltip: 'Configure Command IP',
            onPressed: _showIpConfigDialog,
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ==========================================
            // TOP STATUS & TELEMETRY HEADER
            // ==========================================
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: const Color(0xFF0F172A),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Status Indicator: ● CAMERA OFFLINE / ● LIVE
                  Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: isLive ? Colors.redAccent : Colors.grey,
                          shape: BoxShape.circle,
                          boxShadow: isLive
                              ? [
                                  BoxShadow(
                                    color: Colors.redAccent.withOpacity(0.8),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  )
                                ]
                              : [],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        isLive ? '● LIVE' : '● CAMERA OFFLINE',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isLive ? Colors.redAccent : Colors.grey.shade400,
                          letterSpacing: 1.0,
                        ),
                      ),
                    ],
                  ),

                  // Real-time FPS & Packet Counter
                  Text(
                    isLive ? 'FPS: $_currentFps | Packets: $_framesSent' : 'STANDBY',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      color: isLive ? Colors.cyanAccent : Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),

            // ==========================================
            // CENTER: CAMERA VIEW (Physical Android Camera)
            // ==========================================
            Expanded(
              child: Container(
                margin: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isLive ? Colors.redAccent.withOpacity(0.6) : Colors.white12,
                    width: isLive ? 2 : 1,
                  ),
                  boxShadow: isLive
                      ? [
                          BoxShadow(
                            color: Colors.redAccent.withOpacity(0.15),
                            blurRadius: 16,
                            spreadRadius: 2,
                          )
                        ]
                      : [],
                ),
                clipBehavior: Clip.antiAlias,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Physical Camera Preview
                    _isCameraInitialized && _cameraController != null
                        ? CameraPreview(_cameraController!)
                        : const Center(
                            child: CircularProgressIndicator(color: Colors.indigoAccent),
                          ),

                    // Tactical HUD Crosshair Overlay
                    Center(
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.cyanAccent.withOpacity(0.4), width: 1.5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Center(
                          child: Icon(Icons.center_focus_weak, color: Colors.cyanAccent, size: 28),
                        ),
                      ),
                    ),

                    // On-Screen HUD Metadata
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.6),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'CAM ID: ${_activeSession?.cameraId ?? 'CAM-STANDBY'}',
                              style: const TextStyle(
                                fontSize: 10,
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.bold,
                                color: Colors.cyanAccent,
                              ),
                            ),
                            Text(
                              'OFFICER: ${widget.officerName}',
                              style: const TextStyle(
                                fontSize: 9,
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    Positioned(
                      top: 12,
                      right: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.6),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white10),
                        ),
                        child: Text(
                          _resolution,
                          style: const TextStyle(
                            fontSize: 10,
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.bold,
                            color: Colors.emeraldAccent,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ==========================================
            // TELEMETRY & NETWORK INFO CARD
            // ==========================================
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF131C31),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white10),
              ),
              child: Column(
                children: [
                  _buildTelemetryRow('Camera ID:', _activeSession?.cameraId ?? 'Not Registered'),
                  const SizedBox(height: 4),
                  _buildTelemetryRow('Connection Status:', isLive ? 'STREAMING (30 FPS)' : 'OFFLINE'),
                  const SizedBox(height: 4),
                  _buildTelemetryRow('Resolution:', _resolution),
                  const SizedBox(height: 4),
                  _buildTelemetryRow('Network Status:', _networkStatus),
                  const Divider(color: Colors.white10, height: 16),
                  Text(
                    _statusMessage,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      color: isLive ? Colors.emeraldAccent : Colors.grey.shade400,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // ==========================================
            // MAIN ACTION BUTTON: [ START / STOP CAMERA ]
            // ==========================================
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isLive ? Colors.red.shade700 : Colors.indigo.shade600,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 8,
                    shadowColor: isLive ? Colors.red.withOpacity(0.5) : Colors.indigo.withOpacity(0.5),
                  ),
                  onPressed: isLive ? _stopStreaming : _startStreaming,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(isLive ? Icons.stop_circle : Icons.videocam, size: 24),
                      const SizedBox(width: 8),
                      Text(
                        isLive ? 'STOP CAMERA' : 'START CAMERA',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildTelemetryRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 11, color: Colors.grey.shade400, fontWeight: FontWeight.bold),
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 11, color: Colors.white, fontFamily: 'monospace', fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  /// IP Configuration Dialog for Localhost / LAN Testing
  void _showIpConfigDialog() {
    final controller = TextEditingController(text: _serverIp);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Command Server Host IP', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Enter your PC LAN IP address running the FastAPI Backend (e.g., 192.168.1.45 or 10.0.2.2 for Android Emulator):',
              style: TextStyle(fontSize: 12, color: Colors.white70),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
              decoration: const InputDecoration(
                labelText: 'Host IP Address',
                labelStyle: TextStyle(color: Colors.cyanAccent),
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.indigoAccent),
            onPressed: () {
              setState(() {
                _serverIp = controller.text.trim();
                _networkStatus = 'Host IP set to $_serverIp:${widget.port}';
              });
              Navigator.pop(ctx);
            },
            child: const Text('Save IP'),
          ),
        ],
      ),
    );
  }
}
