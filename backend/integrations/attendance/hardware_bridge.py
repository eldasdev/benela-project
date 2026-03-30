from __future__ import annotations

from typing import List


class HardwareBridge:
    """
    Abstract bridge for biometric, face-recognition, RFID, and other attendance hardware.
    Phase 1 only ships the interface so hardware adapters can plug into the same attendance pipeline later.
    """

    async def push_attendance_event(self, raw_event: dict):
        raise NotImplementedError

    async def get_pending_events(self) -> List[dict]:
        raise NotImplementedError


class ZKTecoAdapter(HardwareBridge):
    pass


class HikvisionAdapter(HardwareBridge):
    pass


class DahuaAdapter(HardwareBridge):
    pass


class RFIDAdapter(HardwareBridge):
    pass
