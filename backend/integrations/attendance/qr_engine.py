from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.orm import Session

from database.attendance_models import QRToken

QR_SECRET_KEY = (os.environ.get("ATTENDANCE_QR_SECRET") or os.environ.get("SUPABASE_JWT_SECRET") or "dev-attendance-secret").strip()
QR_EXPIRY_SECONDS = max(30, int(os.environ.get("ATTENDANCE_QR_EXPIRY_SECONDS", "60")))
QR_ALGORITHM = "HS256"
PUBLIC_APP_ORIGIN = (os.environ.get("PUBLIC_APP_ORIGIN") or ("https://benela.dev" if os.environ.get("APP_ENV", "development").lower() in {"prod", "production"} else "http://localhost:3000")).rstrip("/")


@dataclass(slots=True)
class GeneratedQRToken:
    token: str
    token_hash: str
    expires_at: datetime
    scan_url: str
    seconds_remaining: int


@dataclass(slots=True)
class GeneratedAttendanceAccessToken:
    token: str
    expires_at: datetime
    seconds_remaining: int


class ExpiredTokenError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


class ReplayAttackError(Exception):
    pass


class InvalidAttendanceAccessError(Exception):
    pass


class QRTokenEngine:
    def __init__(self, expiry_seconds: int = QR_EXPIRY_SECONDS):
        self.expiry_seconds = expiry_seconds

    @staticmethod
    def _utcnow() -> datetime:
        return datetime.now(UTC).replace(tzinfo=None)

    def generate_token(self, db: Session, company_id: int, location_id: int) -> GeneratedQRToken:
        nonce = secrets.token_urlsafe(16)
        now = self._utcnow()
        expires_at = now + timedelta(seconds=self.expiry_seconds)
        payload = {
            "company_id": company_id,
            "location_id": location_id,
            "nonce": nonce,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "v": 1,
        }
        token = jwt.encode(payload, QR_SECRET_KEY, algorithm=QR_ALGORITHM)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        row = QRToken(
            company_id=company_id,
            location_id=location_id,
            token=token,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(row)
        db.commit()
        scan_url = f"{PUBLIC_APP_ORIGIN}/hr/scan?t={token}"
        return GeneratedQRToken(
            token=token,
            token_hash=token_hash,
            expires_at=expires_at,
            scan_url=scan_url,
            seconds_remaining=self.expiry_seconds,
        )

    def get_or_generate_token(
        self,
        db: Session,
        *,
        company_id: int,
        location_id: int,
        rotation_seconds: int,
    ) -> GeneratedQRToken:
        latest = (
            db.query(QRToken)
            .filter_by(company_id=company_id, location_id=location_id)
            .order_by(QRToken.created_at.desc())
            .first()
        )
        now = self._utcnow()
        should_rotate = True
        if latest and latest.expires_at > now:
            age = (now - latest.created_at).total_seconds() if latest.created_at else rotation_seconds
            should_rotate = age >= max(15, int(rotation_seconds or 30))
        if not latest or should_rotate or latest.expires_at <= now:
            return self.generate_token(db, company_id, location_id)
        return GeneratedQRToken(
            token=latest.token,
            token_hash=latest.token_hash,
            expires_at=latest.expires_at,
            scan_url=f"{PUBLIC_APP_ORIGIN}/hr/scan?t={latest.token}",
            seconds_remaining=max(0, int((latest.expires_at - now).total_seconds())),
        )

    def validate_token(self, db: Session, token: str, company_id: int | None = None) -> dict:
        try:
            payload = jwt.decode(token, QR_SECRET_KEY, algorithms=[QR_ALGORITHM], options={"verify_exp": True})
        except jwt.ExpiredSignatureError as exc:
            raise ExpiredTokenError("QR code has expired. Please scan the current code.") from exc
        except jwt.InvalidTokenError as exc:
            raise InvalidTokenError("Invalid QR code.") from exc

        if company_id is not None and int(payload.get("company_id") or 0) != int(company_id):
            raise InvalidTokenError("QR code does not belong to your company.")

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        row = (
            db.query(QRToken)
            .filter(QRToken.token_hash == token_hash, QRToken.company_id == int(payload.get("company_id") or 0))
            .order_by(QRToken.id.desc())
            .first()
        )
        if not row:
            raise InvalidTokenError("QR code is not recognized.")
        if row.expires_at <= self._utcnow():
            raise ExpiredTokenError("QR code has expired. Please scan the current code.")

        payload["token_hash"] = token_hash
        return payload

    def mark_token_used(self, db: Session, token_hash: str) -> None:
        row = db.query(QRToken).filter(QRToken.token_hash == token_hash).first()
        if not row:
            return
        row.is_used = True
        db.commit()

    def generate_attendance_access_token(
        self,
        *,
        employee_id: int,
        company_id: int,
        location_id: int,
        qr_token_hash: str,
        expires_at: datetime,
    ) -> GeneratedAttendanceAccessToken:
        now = self._utcnow()
        payload = {
            "employee_id": int(employee_id),
            "company_id": int(company_id),
            "location_id": int(location_id),
            "qrh": str(qr_token_hash),
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
            "v": 1,
            "purpose": "attendance_access",
        }
        token = jwt.encode(payload, QR_SECRET_KEY, algorithm=QR_ALGORITHM)
        return GeneratedAttendanceAccessToken(
            token=token,
            expires_at=expires_at,
            seconds_remaining=max(0, int((expires_at - now).total_seconds())),
        )

    def validate_attendance_access_token(
        self,
        token: str,
        *,
        company_id: int,
        location_id: int,
        qr_token_hash: str,
    ) -> dict:
        try:
            payload = jwt.decode(token, QR_SECRET_KEY, algorithms=[QR_ALGORITHM], options={"verify_exp": True})
        except jwt.ExpiredSignatureError as exc:
            raise ExpiredTokenError("Attendance access link has expired. Request a new link from Telegram.") from exc
        except jwt.InvalidTokenError as exc:
            raise InvalidAttendanceAccessError("Attendance access link is invalid.") from exc

        if payload.get("purpose") != "attendance_access":
            raise InvalidAttendanceAccessError("Attendance access link is invalid.")
        if int(payload.get("company_id") or 0) != int(company_id):
            raise InvalidAttendanceAccessError("Attendance access link does not match this company.")
        if int(payload.get("location_id") or 0) != int(location_id):
            raise InvalidAttendanceAccessError("Attendance access link does not match this office location.")
        if str(payload.get("qrh") or "") != str(qr_token_hash):
            raise InvalidAttendanceAccessError("Attendance access link does not match the current attendance QR.")
        return payload


qr_token_engine = QRTokenEngine()
