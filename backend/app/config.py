import os
from typing import List
from dotenv import load_dotenv

# Load .env file from candidate directories (root or backend)
for env_candidate in [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
    os.path.join(os.getcwd(), ".env"),
]:
    if os.path.exists(env_candidate):
        load_dotenv(env_candidate, override=False)

# Server & Runtime Configuration
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")
DEBUG = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")

# Public Facing URLs (Cloudflare Pages Frontend & Public API Backend)
FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "").strip().rstrip("/")

# Database
DATABASE_MODE = os.getenv("DATABASE_MODE", "local").lower()  # 'supabase' | 'local'
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/sih_database.db")
DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "sih_database.db"))

# JWT & Authentication
JWT_SECRET = os.getenv("JWT_SECRET", "sih-national-command-secret-key-998877")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")) # 24 hours

# CORS - Secure Configuration for Cloudflare Pages and Local Development
# Default allowed origins for local dev and preview
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://0.0.0.0:5173",
]

# Parse CORS_ORIGINS from environment if provided
raw_cors_origins = os.getenv("CORS_ORIGINS", "")
parsed_origins = [
    origin.strip().rstrip("/")
    for origin in raw_cors_origins.split(",")
    if origin.strip() and origin.strip() != "*"
] if raw_cors_origins else []

# Combine defaults, parsed origins, and FRONTEND_URL
_all_origins = set(_default_origins + parsed_origins)
if FRONTEND_URL:
    _all_origins.add(FRONTEND_URL)
CORS_ORIGINS: List[str] = list(_all_origins)
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", r"https://.*(\.pages\.dev|\.vercel\.app)")

# Telemetry & Thresholds
OFFLINE_TIMEOUT_SECONDS = int(os.getenv("OFFLINE_TIMEOUT_SECONDS", "30"))
DEFAULT_FACE_THRESHOLD = float(os.getenv("DEFAULT_FACE_THRESHOLD", "85.0"))
DEFAULT_VOICE_THRESHOLD = float(os.getenv("DEFAULT_VOICE_THRESHOLD", "80.0"))
DEFAULT_GPS_TOLERANCE_METERS = float(os.getenv("DEFAULT_GPS_TOLERANCE_METERS", "30.0"))

# Supabase Shared Database Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", "https://ctmkpwwbdexwkakuqpat.supabase.co"))
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0bWtwd3diZGV4d2tha3VxcGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDk4MDAsImV4cCI6MjEwNDE4NTgwMH0.ilxOvgsxXQoD3Rh6pZgmfiEMET5u3RtS-B0W_kOEhLU"))
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Real-Time CCTV & YOLO11 Configuration
CCTV_SOURCE_URL = os.getenv("CCTV_SOURCE_URL", "0") # Default: 0 (local camera/webcam fallback or dynamic stream)

def _resolve_model_path() -> str:
    env_path = os.getenv("YOLO_MODEL_PATH", "yolo11n.pt")
    if os.path.isabs(env_path) and os.path.exists(env_path):
        return env_path
    candidates = [
        env_path,
        os.path.join(os.getcwd(), env_path),
        os.path.join(os.path.dirname(__file__), "..", "..", env_path),
        os.path.join(os.path.dirname(__file__), "..", env_path),
        os.path.join(os.path.dirname(__file__), env_path),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "yolo11n.pt"),
    ]
    for c in candidates:
        abs_c = os.path.abspath(c)
        if os.path.exists(abs_c):
            return abs_c
    return env_path

YOLO_MODEL_PATH = _resolve_model_path()
YOLO_CONFIDENCE = float(os.getenv("YOLO_CONFIDENCE", "0.25"))
YOLO_IMAGE_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "320"))
YOLO_IOU_THRESHOLD = float(os.getenv("YOLO_IOU_THRESHOLD", "0.45"))
CCTV_MAX_FPS = int(os.getenv("CCTV_MAX_FPS", "30"))
FRAME_SKIP = int(os.getenv("FRAME_SKIP", "0"))

# ArcFace MobileFaceNet ONNX Model Path
ARCFACE_MODEL_PATH = os.getenv("ARCFACE_MODEL_PATH", "")





