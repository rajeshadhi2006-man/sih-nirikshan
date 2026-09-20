# ==============================================================================
# Production Dockerfile for SIH 2026 National Command Center Backend
# Runtime: Python 3.11-slim with FastAPI, YOLO11 (Ultralytics), and ONNX Runtime
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV HOST=0.0.0.0

WORKDIR /app

# Install minimal OS runtime dependencies for OpenCV and network tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements (pre-install CPU-only PyTorch for fast cloud builds)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy backend application source code, weights, and schemas
COPY backend /app/backend

# Ensure Python path includes /app so `backend.app.main:app` resolves properly
ENV PYTHONPATH=/app

# Expose standard container port
EXPOSE 8000

# Run FastAPI via Uvicorn with dynamic $PORT binding for Cloud Run, VPS, or Docker hosts
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
