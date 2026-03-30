from __future__ import annotations

import unittest
from datetime import date

from integrations.onec.file_parser import OneCFileParser
from integrations.onec.normalizer import OneCNormalizer


class OneCNormalizerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.parser = OneCFileParser()
        self.normalizer = OneCNormalizer()

    async def test_deduplicate_marks_existing_transaction_hash(self):
        [normalized] = await self.normalizer.to_transactions(
            [
                {
                    "date": date(2025, 3, 15),
                    "description": "Оплата по договору",
                    "category": "Операционная деятельность",
                    "amount": "1234567.89",
                    "type": "income",
                    "status": "received",
                }
            ],
            company_id=1,
        )

        first_pass = await self.normalizer.deduplicate([dict(normalized)], set(), record_type="transaction")
        second_pass = await self.normalizer.deduplicate(
            [dict(normalized)],
            {first_pass[0]["import_hash"]},
            record_type="transaction",
        )

        self.assertFalse(first_pass[0]["is_duplicate"])
        self.assertTrue(second_pass[0]["is_duplicate"])

    async def test_detect_conflicts_updates_when_payload_differs(self):
        conflict = await self.normalizer.detect_conflicts(
            {"invoice_number": "INV-1", "amount": 100},
            {"invoice_number": "INV-1", "amount": 90},
        )
        self.assertEqual(conflict.strategy, "update")

    async def test_normalizes_date_and_amount_edge_cases(self):
        self.assertEqual(await self.parser.normalize_amount("1 234 567,89"), await self.parser.normalize_amount("1234567.89"))
        self.assertEqual(await self.parser.normalize_date("15.03.2025"), date(2025, 3, 15))
        self.assertEqual(await self.parser.normalize_date("2025-03-15"), date(2025, 3, 15))


if __name__ == "__main__":
    unittest.main()

