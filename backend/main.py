"""
Main application entrypoint for National Command Center Backend.
Exposes the modular FastAPI application from backend.app.main.
Supports execution styles:
  uvicorn backend.main:app --host 0.0.0.0 --port 8000
  python -m backend.main
  python backend/main.py
"""
import os
import sys

# Ensure backend directory is in sys.path when executed directly
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from .app.main import app
    from .app.config import PORT, HOST
except ImportError:
    from app.main import app
    from app.config import PORT, HOST

__all__ = ["app"]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
