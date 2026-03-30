from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.models import ClientOrg, Invoice, Transaction
from database.onec_models import OneCConnection, OneCImportJob, OneCRecord


class SqliteOneCTestHarness:
    def __init__(self) -> None:
        self._tmp = TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.storage_root = self.root / "onec-storage"
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "onec-test.db"
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        ClientOrg.__table__.create(bind=self.engine, checkfirst=True)
        Transaction.__table__.create(bind=self.engine, checkfirst=True)
        Invoice.__table__.create(bind=self.engine, checkfirst=True)
        OneCConnection.__table__.create(bind=self.engine, checkfirst=True)
        OneCImportJob.__table__.create(bind=self.engine, checkfirst=True)
        OneCRecord.__table__.create(bind=self.engine, checkfirst=True)

        with self.SessionLocal() as db:
            db.add(
                ClientOrg(
                    id=1,
                    name="Test Company",
                    slug="test-company",
                    owner_name="Test Owner",
                    owner_email="owner@test-company.local",
                    country="Uzbekistan",
                )
            )
            db.commit()

    def close(self) -> None:
        self.engine.dispose()
        self._tmp.cleanup()

    def get_db(self):
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()


def fake_account(company_id: int = 1, user_id: str = "test-user"):
    return SimpleNamespace(client_org_id=company_id, user_id=user_id)
