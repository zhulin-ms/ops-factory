import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

import server  # noqa: E402


class RuntimeConfigTests(unittest.TestCase):
    def test_prefers_qos_password_over_gateway_password(self) -> None:
        with patch.dict(
            os.environ,
            {
                "QOS_BASE_URL": "https://example.com",
                "QOS_USERNAME": "qos-user",
                "QOS_PASSWORD": "qos-pass",
                "GATEWAY_API_PASSWORD": "gateway-pass",
            },
            clear=False,
        ):
            config = server.RuntimeConfig.from_env()

        self.assertEqual(config.qos_password, "qos-pass")

    def test_falls_back_to_gateway_password(self) -> None:
        with patch.dict(
            os.environ,
            {
                "QOS_BASE_URL": "https://example.com",
                "QOS_USERNAME": "qos-user",
                "QOS_PASSWORD": "",
                "GATEWAY_API_PASSWORD": "gateway-pass",
            },
            clear=False,
        ):
            config = server.RuntimeConfig.from_env()

        self.assertEqual(config.qos_password, "gateway-pass")

    def test_tls_verification_is_disabled_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            config = server.RuntimeConfig.from_env()

        self.assertFalse(config.verify_tls)


class PayloadBuilderTests(unittest.TestCase):
    def test_seconds_timestamp_is_normalized_to_milliseconds(self) -> None:
        payload = server.build_abnormal_data_payload(
            {
                "envCode": "VRBTL2.TEST",
                "startTime": 1_700_000_000,
                "endTime": 1_700_000_600,
            }
        )

        self.assertEqual(payload["startTime"], 1_700_000_000_000)
        self.assertEqual(payload["endTime"], 1_700_000_600_000)


if __name__ == "__main__":
    unittest.main()
