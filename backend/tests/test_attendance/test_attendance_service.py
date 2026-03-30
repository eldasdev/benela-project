from __future__ import annotations

import unittest
from datetime import UTC, date, datetime, time
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zoneinfo import ZoneInfo

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.models import ClientOrg, Employee, EmployeeStatus
from database.attendance_models import AttendanceRecord, OfficeLocation, LeaveRequest, PayrollRecord, QRToken, UzbekHoliday, AttendanceStatus
from integrations.attendance.attendance_service import attendance_service
from integrations.attendance.payroll_engine import payroll_engine

TASHKENT = ZoneInfo("Asia/Tashkent")


class AttendanceHarness:
    def __init__(self) -> None:
        self._tmp = TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{self._tmp.name}/attendance-test.db", connect_args={"check_same_thread": False})
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        ClientOrg.__table__.create(bind=self.engine, checkfirst=True)
        Employee.__table__.create(bind=self.engine, checkfirst=True)
        OfficeLocation.__table__.create(bind=self.engine, checkfirst=True)
        AttendanceRecord.__table__.create(bind=self.engine, checkfirst=True)
        LeaveRequest.__table__.create(bind=self.engine, checkfirst=True)
        PayrollRecord.__table__.create(bind=self.engine, checkfirst=True)
        QRToken.__table__.create(bind=self.engine, checkfirst=True)
        UzbekHoliday.__table__.create(bind=self.engine, checkfirst=True)

        with self.SessionLocal() as db:
            db.add(
                ClientOrg(
                    id=1,
                    name="Test Company",
                    slug="test-company",
                    owner_name="Owner",
                    owner_email="owner@test-company.local",
                    country="Uzbekistan",
                )
            )
            db.add(
                Employee(
                    id=1,
                    company_id=1,
                    full_name="Jasur Karimov",
                    email="jasur@test-company.local",
                    department="Engineering",
                    role="Senior Developer",
                    salary=4_400_000,
                    shift_start=time(9, 0),
                    shift_end=time(18, 0),
                    late_grace_minutes=15,
                    contract_type="monthly",
                    work_days=[1, 2, 3, 4, 5],
                    status=EmployeeStatus.active,
                )
            )
            db.add(
                OfficeLocation(
                    id=1,
                    company_id=1,
                    name="Main Office",
                    geofence_radius_meters=300,
                    qr_rotation_seconds=30,
                    require_pin=False,
                    allow_remote_flag=True,
                    is_active=True,
                )
            )
            db.commit()

    def close(self) -> None:
        self.engine.dispose()
        self._tmp.cleanup()


class AttendanceServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = AttendanceHarness()

    def tearDown(self) -> None:
        self.harness.close()

    def test_process_scan_creates_clock_in_then_clock_out(self):
        with self.harness.SessionLocal() as db:
            employee = db.query(Employee).filter(Employee.id == 1).first()
            location = db.query(OfficeLocation).filter(OfficeLocation.id == 1).first()
            self.assertIsNotNone(employee)
            self.assertIsNotNone(location)

            morning_local = datetime(2026, 3, 16, 9, 5, tzinfo=TASHKENT)
            evening_local = datetime(2026, 3, 16, 18, 30, tzinfo=TASHKENT)

            with patch.object(attendance_service, "local_now", return_value=morning_local):
                clock_in = attendance_service.process_scan(
                    db,
                    employee=employee,
                    location=location,
                    client_ip="192.168.1.20",
                    device_fingerprint="device-a",
                )
            self.assertEqual(clock_in.action, "clock_in")
            self.assertEqual(clock_in.status, AttendanceStatus.on_time)
            self.assertEqual(clock_in.late_minutes, 0)

            with patch.object(attendance_service, "local_now", return_value=evening_local):
                clock_out = attendance_service.process_scan(
                    db,
                    employee=employee,
                    location=location,
                    client_ip="192.168.1.20",
                    device_fingerprint="device-a",
                )
            self.assertEqual(clock_out.action, "clock_out")
            self.assertEqual(clock_out.status, AttendanceStatus.overtime)
            self.assertGreater(clock_out.hours_worked or 0, 9.0)
            self.assertGreater(clock_out.overtime_hours or 0, 1.0)

            record = db.query(AttendanceRecord).filter(AttendanceRecord.employee_id == 1, AttendanceRecord.work_date == date(2026, 3, 16)).first()
            self.assertIsNotNone(record)
            self.assertEqual(record.status, AttendanceStatus.overtime)
            self.assertIsNotNone(record.clock_in)
            self.assertIsNotNone(record.clock_out)

    def test_payroll_calculation_applies_overtime_and_deductions(self):
        with self.harness.SessionLocal() as db:
            working_days = payroll_engine.get_working_days_in_month(db, 1, 3, 2026)
            for day in range(2, 7):
                db.add(
                    AttendanceRecord(
                        employee_id=1,
                        company_id=1,
                        location_id=1,
                        work_date=date(2026, 3, day),
                        clock_in=datetime(2026, 3, day, 4, 0),
                        clock_out=datetime(2026, 3, day, 14, 0),
                        hours_worked=9.0,
                        overtime_hours=1.0,
                        late_minutes=0,
                        early_leave_minutes=0,
                        status=AttendanceStatus.overtime,
                        source="manual",
                        location_verified=True,
                        is_remote_flag=False,
                    )
                )
            db.commit()

            record = payroll_engine.calculate_monthly_payroll(1, 3, 2026, db)
            hourly_equivalent = 4_400_000 / working_days / 8
            expected_prorated = 4_400_000 * (5 / working_days)
            expected_overtime = 5 * hourly_equivalent * 1.5
            expected_gross = round(expected_prorated + expected_overtime, 2)
            expected_inps = round(expected_gross * 0.04, 2)
            expected_tax = round((expected_gross - expected_inps) * 0.12, 2)
            expected_net = round(expected_gross - expected_inps - expected_tax, 2)

            self.assertEqual(record.days_worked, 5)
            self.assertEqual(record.days_absent, max(0, working_days - 5))
            self.assertAlmostEqual(record.prorated_salary, round(expected_prorated, 2), places=2)
            self.assertAlmostEqual(record.overtime_pay, round(expected_overtime, 2), places=2)
            self.assertAlmostEqual(record.gross_salary, expected_gross, places=2)
            self.assertAlmostEqual(record.inps_employee, expected_inps, places=2)
            self.assertAlmostEqual(record.jshdssh, expected_tax, places=2)
            self.assertAlmostEqual(record.net_salary, expected_net, places=2)


if __name__ == "__main__":
    unittest.main()
