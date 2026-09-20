"""
Telephony Service — AI Random Verification Call
================================================
Abstraction layer for phone-call initiation during AI Random Verification.
Supports: Twilio, Exotel (India), MSG91 Voice (India)
Gracefully returns NOT_CONFIGURED when no provider is set up.

Environment Variables Required:
  Twilio:
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_FROM, TWILIO_TWIML_URL
  Exotel:
    EXOTEL_SID, EXOTEL_TOKEN, EXOTEL_CALLER_ID, EXOTEL_APP_ID (optional)
"""

import os
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("telephony")


def _get_twilio_config() -> Optional[Dict[str, str]]:
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_num = os.getenv("TWILIO_PHONE_FROM", "").strip()
    twiml_url = os.getenv("TWILIO_TWIML_URL", "").strip()
    if sid and token and from_num:
        return {"sid": sid, "token": token, "from": from_num, "twiml_url": twiml_url}
    return None


def _get_exotel_config() -> Optional[Dict[str, str]]:
    sid = os.getenv("EXOTEL_SID", "").strip()
    token = os.getenv("EXOTEL_TOKEN", "").strip()
    caller_id = os.getenv("EXOTEL_CALLER_ID", "").strip()
    app_id = os.getenv("EXOTEL_APP_ID", "").strip()
    if sid and token and caller_id:
        return {"sid": sid, "token": token, "caller_id": caller_id, "app_id": app_id}
    return None


def place_verification_call(
    to_phone: str,
    person_name: str,
    verification_id: str,
    callback_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Attempts to place a real AI verification phone call to the given number.

    Returns:
        {
            "status": "CALLING" | "NOT_CONFIGURED" | "FAILED",
            "provider": "twilio" | "exotel" | "none",
            "call_sid": str | None,
            "message": str
        }
    """

    if not to_phone or not to_phone.strip():
        return {
            "status": "FAILED",
            "provider": "none",
            "call_sid": None,
            "message": "No phone number available for this person."
        }

    # ----------------------------------------------------------------
    # Try Twilio
    # ----------------------------------------------------------------
    twilio_cfg = _get_twilio_config()
    if twilio_cfg:
        try:
            import requests as req
            from requests.auth import HTTPBasicAuth

            # Default TwiML: speak a government verification message
            twiml_url = twilio_cfg.get("twiml_url") or (
                f"http://twimlets.com/message?Message%5B0%5D="
                f"Government+verification+call+for+{person_name.replace(' ', '+')}."
                f"+Verification+ID+{verification_id}."
                f"+Please+state+your+name+clearly."
            )

            response = req.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{twilio_cfg['sid']}/Calls.json",
                auth=HTTPBasicAuth(twilio_cfg["sid"], twilio_cfg["token"]),
                data={
                    "To": to_phone,
                    "From": twilio_cfg["from"],
                    "Url": twiml_url,
                    **({"StatusCallback": callback_url} if callback_url else {}),
                },
                timeout=10
            )

            if response.status_code in (200, 201):
                data = response.json()
                call_sid = data.get("sid", "")
                logger.info(f"[Twilio] Call placed to {to_phone}. SID={call_sid}")
                return {
                    "status": "CALLING",
                    "provider": "twilio",
                    "call_sid": call_sid,
                    "message": f"Twilio call placed to {to_phone}. SID: {call_sid}"
                }
            else:
                logger.warning(f"[Twilio] Failed: {response.status_code} {response.text}")
                return {
                    "status": "FAILED",
                    "provider": "twilio",
                    "call_sid": None,
                    "message": f"Twilio API error ({response.status_code}): {response.text[:200]}"
                }

        except Exception as e:
            logger.error(f"[Twilio] Exception: {e}")
            return {
                "status": "FAILED",
                "provider": "twilio",
                "call_sid": None,
                "message": f"Twilio call error: {str(e)}"
            }

    # ----------------------------------------------------------------
    # Try Exotel (India)
    # ----------------------------------------------------------------
    exotel_cfg = _get_exotel_config()
    if exotel_cfg:
        try:
            import requests as req
            from requests.auth import HTTPBasicAuth

            payload = {
                "From": to_phone,
                "CallerId": exotel_cfg["caller_id"],
            }
            if exotel_cfg.get("app_id"):
                payload["Url"] = f"http://my.exotel.com/{exotel_cfg['sid']}/exoml/start_voice/{exotel_cfg['app_id']}"

            response = req.post(
                f"https://api.exotel.com/v1/Accounts/{exotel_cfg['sid']}/Calls/connect.json",
                auth=HTTPBasicAuth(exotel_cfg["sid"], exotel_cfg["token"]),
                data=payload,
                timeout=10
            )

            if response.status_code in (200, 201):
                data = response.json()
                call_sid = data.get("Call", {}).get("Sid", "")
                logger.info(f"[Exotel] Call placed to {to_phone}. SID={call_sid}")
                return {
                    "status": "CALLING",
                    "provider": "exotel",
                    "call_sid": call_sid,
                    "message": f"Exotel call placed to {to_phone}. SID: {call_sid}"
                }
            else:
                logger.warning(f"[Exotel] Failed: {response.status_code} {response.text}")
                return {
                    "status": "FAILED",
                    "provider": "exotel",
                    "call_sid": None,
                    "message": f"Exotel API error ({response.status_code}): {response.text[:200]}"
                }

        except Exception as e:
            logger.error(f"[Exotel] Exception: {e}")
            return {
                "status": "FAILED",
                "provider": "exotel",
                "call_sid": None,
                "message": f"Exotel call error: {str(e)}"
            }

    # ----------------------------------------------------------------
    # No provider configured
    # ----------------------------------------------------------------
    logger.warning(
        "[Telephony] No provider configured. Set TWILIO_* or EXOTEL_* env vars to enable real calls."
    )
    return {
        "status": "NOT_CONFIGURED",
        "provider": "none",
        "call_sid": None,
        "message": (
            "TELEPHONY SERVICE NOT CONFIGURED. "
            "Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_FROM "
            "or EXOTEL_SID/EXOTEL_TOKEN/EXOTEL_CALLER_ID in your .env file to enable phone calls."
        )
    }
