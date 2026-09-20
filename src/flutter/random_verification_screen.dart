// ============================================================
// AI RANDOM VERIFICATION SCREEN — Flutter User App
// ============================================================
// Drop this file into your existing Flutter SIH User App project.
//
// Required pubspec.yaml dependencies:
//   camera: ^0.10.5
//   geolocator: ^10.1.0
//   http: ^1.1.0
//   web_socket_channel: ^2.4.0
//   permission_handler: ^11.0.1
//
// Usage: Navigate to this screen OR listen to WS events in your
// main app and push this screen when VERIFICATION_REQUEST arrives.
// ============================================================

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/io.dart';
import 'package:permission_handler/permission_handler.dart';

// ============================================================
// Data model for the verification session
// ============================================================

class RandomVerificationSession {
  final String verificationId;
  final String personId;
  final String personName;
  final String status;
  final String callStatus;
  final String voiceStatus;
  final String faceStatus;
  final String locationStatus;
  final String geofenceStatus;
  final String finalResult;
  final double? faceScore;
  final String createdAt;

  const RandomVerificationSession({
    required this.verificationId,
    required this.personId,
    required this.personName,
    required this.status,
    required this.callStatus,
    required this.voiceStatus,
    required this.faceStatus,
    required this.locationStatus,
    required this.geofenceStatus,
    required this.finalResult,
    this.faceScore,
    required this.createdAt,
  });

  factory RandomVerificationSession.fromJson(Map<String, dynamic> json) {
    return RandomVerificationSession(
      verificationId: json['verification_id'] ?? '',
      personId: json['person_id'] ?? '',
      personName: json['person_name'] ?? '',
      status: json['status'] ?? 'PENDING',
      callStatus: json['call_status'] ?? 'PENDING',
      voiceStatus: json['voice_status'] ?? 'PENDING',
      faceStatus: json['face_status'] ?? 'PENDING',
      locationStatus: json['location_status'] ?? 'PENDING',
      geofenceStatus: json['geofence_status'] ?? 'PENDING',
      finalResult: json['final_result'] ?? 'PENDING',
      faceScore: (json['face_score'] as num?)?.toDouble(),
      createdAt: json['created_at'] ?? '',
    );
  }
}

// ============================================================
// Random Verification Screen Widget
// ============================================================

class RandomVerificationScreen extends StatefulWidget {
  final String personId;
  final String personName;
  final String hostIp;
  final int port;
  final String? initialVerificationId; // If launched from WS notification

  const RandomVerificationScreen({
    Key? key,
    required this.personId,
    required this.personName,
    this.hostIp = '192.168.1.100',
    this.port = 8000,
    this.initialVerificationId,
  }) : super(key: key);

  @override
  State<RandomVerificationScreen> createState() => _RandomVerificationScreenState();
}

class _RandomVerificationScreenState extends State<RandomVerificationScreen>
    with WidgetsBindingObserver {

  // ---- State ----
  String _phase = 'AWAITING_REQUEST'; // AWAITING_REQUEST | REQUEST_RECEIVED | CAPTURING | SUBMITTING | DONE
  String? _verificationId;
  RandomVerificationSession? _result;
  String? _errorMessage;

  // Camera
  List<CameraDescription> _cameras = [];
  CameraController? _cameraController;
  bool _isCameraReady = false;

  // GPS
  Position? _currentPosition;

  // WebSocket
  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSub;

  // ============================================================
  String get _baseUrl => 'http://${widget.hostIp}:${widget.port}';
  String get _wsUrl => 'ws://${widget.hostIp}:${widget.port}/ws/location/${widget.personId}';

  // ============================================================
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    if (widget.initialVerificationId != null) {
      // Launched from WS event — jump straight to verification
      _verificationId = widget.initialVerificationId;
      setState(() => _phase = 'REQUEST_RECEIVED');
    } else {
      // Connect WS and wait for VERIFICATION_REQUEST
      _connectWebSocket();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _wsSub?.cancel();
    _wsChannel?.sink.close();
    _cameraController?.dispose();
    super.dispose();
  }

  // ============================================================
  // WebSocket — listen for VERIFICATION_REQUEST from backend
  // ============================================================

  void _connectWebSocket() {
    try {
      _wsChannel = IOWebSocketChannel.connect(Uri.parse(_wsUrl));
      _wsSub = _wsChannel!.stream.listen(
        (data) {
          try {
            final msg = json.decode(data as String) as Map<String, dynamic>;
            final eventType = msg['type'] ?? msg['event'] ?? '';

            if (eventType == 'VERIFICATION_REQUEST') {
              final msgData = msg['data'] as Map<String, dynamic>? ?? {};
              final verId = msgData['verification_id'] as String? ?? '';
              // Ensure this request is for this person
              if (verId.isNotEmpty &&
                  (msgData['person_id'] == widget.personId ||
                      msgData['person_id'] == null)) {
                if (mounted) {
                  setState(() {
                    _verificationId = verId;
                    _phase = 'REQUEST_RECEIVED';
                  });
                }
              }
            }
          } catch (_) {}
        },
        onError: (_) {},
        cancelOnError: false,
      );
    } catch (e) {
      // WS connection failed — still show waiting screen
    }
  }

  // ============================================================
  // Request permissions
  // ============================================================

  Future<bool> _requestPermissions() async {
    final cameraStatus = await Permission.camera.request();
    final locationStatus = await Permission.locationWhenInUse.request();
    return cameraStatus.isGranted && locationStatus.isGranted;
  }

  // ============================================================
  // Initialize camera (front-facing, no gallery)
  // ============================================================

  Future<void> _initCamera() async {
    _cameras = await availableCameras();
    if (_cameras.isEmpty) {
      setState(() => _errorMessage = 'No camera found on this device.');
      return;
    }

    // Prefer front camera for face verification
    CameraDescription selectedCamera = _cameras.first;
    for (final cam in _cameras) {
      if (cam.lensDirection == CameraLensDirection.front) {
        selectedCamera = cam;
        break;
      }
    }

    _cameraController = CameraController(
      selectedCamera,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    await _cameraController!.initialize();
    if (mounted) {
      setState(() => _isCameraReady = true);
    }
  }

  // ============================================================
  // Get GPS location
  // ============================================================

  Future<Position?> _getLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() => _errorMessage = 'Location services are disabled.');
        return null;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          setState(() => _errorMessage = 'Location permission denied.');
          return null;
        }
      }

      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 12),
      );
    } catch (e) {
      setState(() => _errorMessage = 'GPS error: $e');
      return null;
    }
  }

  // ============================================================
  // Capture live photo & extract face embedding
  // ============================================================

  Future<String?> _captureFaceEmbedding() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return null;
    }

    final XFile photo = await _cameraController!.takePicture();
    final Uint8List bytes = await photo.readAsBytes();

    // Compute 128-d pixel-intensity embedding (same algorithm as EnrollmentModal.tsx)
    // This is a lightweight cosine-comparable face feature vector.
    final List<double> embedding = _computeEmbedding(bytes);
    return json.encode(embedding);
  }

  List<double> _computeEmbedding(Uint8List imageBytes) {
    // Simple luminance-based 128-d feature vector from JPEG byte distribution.
    // In production, replace with InsightFace/ArcFace model via a local HTTP inference
    // endpoint or via tflite_flutter + a MobileNet face model.
    //
    // This matches the algorithm used in EnrollmentModal.tsx capturePhoto() for
    // compatibility with the backend compare_embeddings() cosine similarity check.
    final List<double> vector = [];
    final int step = max(1, imageBytes.length ~/ 128);
    for (int i = 0; i < 128; i++) {
      final int idx = i * step;
      if (idx < imageBytes.length) {
        // Simulate luminance from single byte (JPEG encoded)
        final double val = (imageBytes[idx] & 0xFF) / 255.0;
        vector.add(double.parse(val.toStringAsFixed(4)));
      } else {
        vector.add(0.0);
      }
    }
    return vector;
  }

  // ============================================================
  // Submit verification result to FastAPI backend
  // ============================================================

  Future<RandomVerificationSession?> _submitVerification({
    required String verificationId,
    required String? faceEmbedding,
    required Position? position,
  }) async {
    final Map<String, dynamic> body = {
      'person_id': widget.personId,
      if (faceEmbedding != null) 'face_embedding': faceEmbedding,
      if (position != null) 'latitude': position.latitude,
      if (position != null) 'longitude': position.longitude,
      if (position != null) 'accuracy': position.accuracy,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    };

    final response = await http.post(
      Uri.parse('$_baseUrl/api/random-verification/$verificationId/submit'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(body),
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body) as Map<String, dynamic>;
      // Build a minimal session from the response
      return RandomVerificationSession(
        verificationId: data['verification_id'] ?? verificationId,
        personId: data['person_id'] ?? widget.personId,
        personName: widget.personName,
        status: 'COMPLETED',
        callStatus: 'COMPLETED',
        voiceStatus: data['voice_status'] ?? 'PENDING',
        faceStatus: data['face_status'] ?? 'PENDING',
        locationStatus: data['location_status'] ?? 'PENDING',
        geofenceStatus: data['geofence_status'] ?? 'PENDING',
        finalResult: data['final_result'] ?? 'PENDING',
        faceScore: (data['face_score'] as num?)?.toDouble(),
        createdAt: data['timestamp'] ?? DateTime.now().toIso8601String(),
      );
    } else {
      throw Exception('Submission failed (${response.statusCode}): ${response.body}');
    }
  }

  // ============================================================
  // Full verification flow
  // ============================================================

  Future<void> _startVerification() async {
    if (_verificationId == null) return;

    setState(() {
      _phase = 'CAPTURING';
      _errorMessage = null;
    });

    try {
      // 1. Request permissions
      final granted = await _requestPermissions();
      if (!granted) {
        setState(() => _errorMessage = 'Camera and location permissions are required.');
        return;
      }

      // 2. Initialize camera
      await _initCamera();

      // 3. Get GPS location in parallel with camera warmup
      final positionFuture = _getLocation();

      // Allow camera to settle (2 seconds)
      await Future.delayed(const Duration(seconds: 2));

      // 4. Capture face
      final faceEmbedding = await _captureFaceEmbedding();

      // 5. Wait for GPS
      final position = await positionFuture;
      setState(() => _currentPosition = position);

      // 6. Submit
      setState(() => _phase = 'SUBMITTING');

      final sessionResult = await _submitVerification(
        verificationId: _verificationId!,
        faceEmbedding: faceEmbedding,
        position: position,
      );

      if (mounted) {
        setState(() {
          _result = sessionResult;
          _phase = 'DONE';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _phase = 'REQUEST_RECEIVED'; // Allow retry
        });
      }
    } finally {
      // Cleanup camera
      await _cameraController?.dispose();
      _cameraController = null;
      _isCameraReady = false;
    }
  }

  // ============================================================
  // UI BUILD
  // ============================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0F1E),
      body: SafeArea(
        child: _buildPhaseUI(),
      ),
    );
  }

  Widget _buildPhaseUI() {
    switch (_phase) {
      case 'AWAITING_REQUEST':
        return _buildAwaitingUI();
      case 'REQUEST_RECEIVED':
        return _buildRequestReceivedUI();
      case 'CAPTURING':
        return _buildCapturingUI();
      case 'SUBMITTING':
        return _buildSubmittingUI();
      case 'DONE':
        return _buildResultUI();
      default:
        return _buildAwaitingUI();
    }
  }

  // ---- Awaiting WS Request ----
  Widget _buildAwaitingUI() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: const Icon(Icons.security, size: 64, color: Color(0xFF60A5FA)),
            ),
            const SizedBox(height: 24),
            const Text(
              'Awaiting Verification Request',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Connected to Government Command Center.\nYou will be notified when verification is required.',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            const SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF60A5FA),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- Request Received ----
  Widget _buildRequestReceivedUI() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Alert Icon
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF1E3A5F),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF2563EB), width: 2),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF2563EB).withOpacity(0.3),
                  blurRadius: 24,
                  spreadRadius: 4,
                ),
              ],
            ),
            child: const Icon(Icons.shield_outlined, size: 56, color: Color(0xFF60A5FA)),
          ),
          const SizedBox(height: 24),

          // Title
          const Text(
            '🔒 SECURITY VERIFICATION REQUEST',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),

          // Subtitle
          const Text(
            'Government verification is currently in progress.',
            style: TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),

          if (_verificationId != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF334155)),
              ),
              child: Text(
                'ID: $_verificationId',
                style: const TextStyle(
                  color: Color(0xFF60A5FA),
                  fontSize: 11,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          const SizedBox(height: 12),

          // Instructions
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF1E293B)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                _InstructionItem(icon: Icons.camera_alt, text: 'Live face scan will be performed'),
                SizedBox(height: 8),
                _InstructionItem(icon: Icons.location_on, text: 'Your current GPS location will be checked'),
                SizedBox(height: 8),
                _InstructionItem(icon: Icons.block, text: 'No photo uploads — live camera only'),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Error
          if (_errorMessage != null)
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF450A0A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF991B1B)),
              ),
              child: Text(
                _errorMessage!,
                style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ),

          // Start Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _startVerification,
              icon: const Icon(Icons.play_circle_filled, size: 22),
              label: const Text(
                'START VERIFICATION',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.5),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                elevation: 8,
                shadowColor: const Color(0xFF2563EB),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Capturing (Camera + GPS) ----
  Widget _buildCapturingUI() {
    return Column(
      children: [
        // Camera Preview
        Expanded(
          child: _isCameraReady && _cameraController != null
              ? Stack(
                  children: [
                    CameraPreview(_cameraController!),
                    // Oval face guide overlay
                    Center(
                      child: Container(
                        width: 220,
                        height: 280,
                        decoration: BoxDecoration(
                          border: Border.all(color: const Color(0xFF60A5FA), width: 3),
                          borderRadius: BorderRadius.circular(140),
                        ),
                      ),
                    ),
                    // Anti-spoofing label
                    Positioned(
                      top: 24,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            color: Colors.black87,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            '🔴 LIVE CAPTURE — No Static Images',
                            style: TextStyle(color: Color(0xFF60A5FA), fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    ),
                  ],
                )
              : const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(color: Color(0xFF60A5FA)),
                      SizedBox(height: 16),
                      Text(
                        'Initializing camera...',
                        style: TextStyle(color: Color(0xFF94A3B8)),
                      ),
                    ],
                  ),
                ),
        ),

        // Status Bar
        Container(
          padding: const EdgeInsets.all(20),
          color: const Color(0xFF0A0F1E),
          child: Column(
            children: [
              Row(
                children: [
                  _StatusChip(
                    icon: Icons.camera_alt,
                    label: _isCameraReady ? 'Camera Ready' : 'Camera Init...',
                    active: _isCameraReady,
                  ),
                  const SizedBox(width: 12),
                  _StatusChip(
                    icon: Icons.location_on,
                    label: _currentPosition != null ? 'GPS Acquired' : 'Getting GPS...',
                    active: _currentPosition != null,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Please hold still and look directly at the camera',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ---- Submitting ----
  Widget _buildSubmittingUI() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 64,
              height: 64,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: Color(0xFF60A5FA),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Submitting verification data...',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            const Text(
              'Sending face scan and GPS coordinates to Command Center',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ---- Result ----
  Widget _buildResultUI() {
    final session = _result;
    if (session == null) return _buildAwaitingUI();

    final isVerified = session.finalResult == 'VERIFIED';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const SizedBox(height: 16),
          // Result Icon
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: isVerified ? const Color(0xFF052E16) : const Color(0xFF450A0A),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: isVerified ? const Color(0xFF16A34A) : const Color(0xFF991B1B),
                width: 2,
              ),
            ),
            child: Icon(
              isVerified ? Icons.verified_user : Icons.gpp_bad,
              size: 64,
              color: isVerified ? const Color(0xFF4ADE80) : const Color(0xFFF87171),
            ),
          ),
          const SizedBox(height: 20),

          Text(
            isVerified ? '✓ VERIFIED' : '⚠ VERIFICATION FAILED',
            style: TextStyle(
              color: isVerified ? const Color(0xFF4ADE80) : const Color(0xFFF87171),
              fontSize: 22,
              fontWeight: FontWeight.w900,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Verification ID: ${session.verificationId}',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 11, fontFamily: 'monospace'),
          ),
          const SizedBox(height: 24),

          // Sub-results
          _ResultCard(
            items: [
              _ResultItem(
                icon: Icons.camera_alt,
                label: 'FACE',
                status: session.faceStatus,
                score: session.faceScore,
              ),
              _ResultItem(
                icon: Icons.mic,
                label: 'VOICE',
                status: session.voiceStatus,
              ),
              _ResultItem(
                icon: Icons.location_on,
                label: 'LOCATION',
                status: session.locationStatus,
              ),
              _ResultItem(
                icon: Icons.security,
                label: 'GEO-FENCE',
                status: session.geofenceStatus,
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Close
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.of(context).pop(),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF94A3B8),
                side: const BorderSide(color: Color(0xFF334155)),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('CLOSE'),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// Helper Widgets
// ============================================================

class _InstructionItem extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InstructionItem({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: const Color(0xFF60A5FA)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  const _StatusChip({required this.icon, required this.label, required this.active});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF052E16) : const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? const Color(0xFF16A34A) : const Color(0xFF334155),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: active ? const Color(0xFF4ADE80) : const Color(0xFF64748B)),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                style: TextStyle(
                  color: active ? const Color(0xFF4ADE80) : const Color(0xFF64748B),
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultItem {
  final IconData icon;
  final String label;
  final String status;
  final double? score;
  const _ResultItem({required this.icon, required this.label, required this.status, this.score});
}

class _ResultCard extends StatelessWidget {
  final List<_ResultItem> items;
  const _ResultCard({required this.items});

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'VERIFIED':
      case 'INSIDE':
      case 'MATCH':
        return const Color(0xFF4ADE80);
      case 'MISMATCH':
      case 'OUTSIDE':
      case 'FAILED':
        return const Color(0xFFF87171);
      case 'NOT_ENABLED':
      case 'NOT_ENROLLED':
        return const Color(0xFF94A3B8);
      default:
        return const Color(0xFFFACC15);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        children: items.asMap().entries.map((entry) {
          final item = entry.value;
          final isLast = entry.key == items.length - 1;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              border: isLast
                  ? null
                  : const Border(bottom: BorderSide(color: Color(0xFF1E293B))),
            ),
            child: Row(
              children: [
                Icon(item.icon, size: 18, color: const Color(0xFF475569)),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    item.label,
                    style: const TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                if (item.score != null && item.score! > 0)
                  Text(
                    '${item.score!.toStringAsFixed(1)}%  ',
                    style: const TextStyle(color: Color(0xFF475569), fontSize: 11),
                  ),
                Text(
                  item.status.isEmpty ? '—' : item.status,
                  style: TextStyle(
                    color: _statusColor(item.status),
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}
