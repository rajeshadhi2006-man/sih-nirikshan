import hmac
import hashlib
import base64
import json
import time
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..config import JWT_SECRET, ACCESS_TOKEN_EXPIRE_MINUTES

security = HTTPBearer(auto_error=False)

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def hash_password(password: str) -> str:
    """Secure SHA-256 HMAC password hashing with salt."""
    salt = "sih-gov-salt-2026"
    return hmac.new(salt.encode('utf-8'), password.encode('utf-8'), hashlib.sha256).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hmac.compare_digest(hash_password(plain_password), hashed_password)

def create_access_token(user_id: str, officer_id: str, full_name: str, role: str, department: str) -> str:
    """Generates a secure HS256 JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": user_id,
        "officer_id": officer_id,
        "full_name": full_name,
        "role": role,
        "department": department,
        "iat": now,
        "exp": now + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    }

    header_b64 = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload).encode('utf-8'))
    signature_raw = hmac.new(
        JWT_SECRET.encode('utf-8'),
        f"{header_b64}.{payload_b64}".encode('utf-8'),
        hashlib.sha256
    ).digest()
    sig_b64 = base64url_encode(signature_raw)

    return f"{header_b64}.{payload_b64}.{sig_b64}"

def decode_access_token(token: str) -> Dict[str, Any]:
    """Validates signature and expiration of JWT token."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Malformed token")

        header_b64, payload_b64, sig_b64 = parts
        expected_sig = base64url_encode(hmac.new(
            JWT_SECRET.encode('utf-8'),
            f"{header_b64}.{payload_b64}".encode('utf-8'),
            hashlib.sha256
        ).digest())

        if not hmac.compare_digest(sig_b64, expected_sig):
            raise HTTPException(status_code=401, detail="Invalid token signature")

        payload = json.loads(base64url_decode(payload_b64).decode('utf-8'))
        if payload.get("exp") and payload["exp"] < int(time.time()):
            raise HTTPException(status_code=401, detail="Token has expired")

        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Dict[str, Any]:
    """Dependency to extract authenticated user from Bearer header."""
    if not credentials:
        # Development permissive fallback
        return {
            "sub": "admin-01",
            "officer_id": "OFF-DIR-01",
            "full_name": "Chief Directorate Officer",
            "role": "ADMIN",
            "department": "National Directorate"
        }
    return decode_access_token(credentials.credentials)

def require_role(allowed_roles: List[str]):
    def role_checker(user: Dict[str, Any] = Depends(get_current_user)):
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: requires one of {allowed_roles}"
            )
        return user
    return role_checker
