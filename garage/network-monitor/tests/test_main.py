import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import Config, RateTracker, _encode_length, _send_once  # noqa: E402


def sample_wan(ais_rx: int, ais_tx: int, true_rx: int, true_tx: int, running: bool = True):
    return {
        "ais": {"interface": "pppoe-AIS", "running": running, "ipAddress": None, "rxBytes": ais_rx, "txBytes": ais_tx},
        "true": {"interface": "pppoe-TRUE", "running": running, "ipAddress": None, "rxBytes": true_rx, "txBytes": true_tx},
    }


def sample_config() -> Config:
    return Config(
        router_host="192.168.11.1",
        router_port=8886,
        router_tls_server_name="router.example.invalid",
        router_username="monitor",
        router_password="local-only-test-password",
        issue_desk_report_url="https://issuedesk.example.invalid/api/network/agent/report",
        issue_desk_agent_token="x" * 48,
        poll_interval_seconds=30,
        router_timeout_seconds=10,
        http_timeout_seconds=10,
        max_retry_attempts=5,
    )


class RateTrackerTests(unittest.TestCase):
    def test_calculates_rates_from_actual_elapsed_time(self):
        tracker = RateTracker()
        first = sample_wan(100, 200, 300, 400)
        second = sample_wan(10_000_100, 5_000_200, 20_000_300, 10_000_400)

        self.assertIsNone(tracker.update(first, 100.0)["ais"]["download"])
        rates = tracker.update(second, 130.0)

        self.assertAlmostEqual(rates["ais"]["download"], 2.6666667)
        self.assertAlmostEqual(rates["ais"]["upload"], 1.3333333)
        self.assertAlmostEqual(rates["true"]["download"], 5.3333333)

    def test_counter_reset_does_not_create_negative_traffic(self):
        tracker = RateTracker()
        tracker.update(sample_wan(10_000, 20_000, 30_000, 40_000), 100.0)

        rates = tracker.update(sample_wan(50, 60_000, 35_000, 10), 130.0)

        self.assertIsNone(rates["ais"]["download"])
        self.assertAlmostEqual(rates["ais"]["upload"], 0.010666666666666666)
        self.assertIsNone(rates["true"]["upload"])

    def test_down_interface_and_first_sample_after_recovery_have_no_rate(self):
        tracker = RateTracker()
        tracker.update(sample_wan(100, 200, 300, 400), 100.0)
        down = sample_wan(500, 600, 700, 800, running=False)
        self.assertIsNone(tracker.update(down, 130.0)["ais"]["download"])
        recovered = sample_wan(900, 1000, 1100, 1200)
        self.assertIsNone(tracker.update(recovered, 160.0)["ais"]["download"])

    def test_routeros_word_length_encoding_boundaries(self):
        self.assertEqual(_encode_length(0x7F), b"\x7f")
        self.assertEqual(_encode_length(0x80), b"\x80\x80")
        self.assertEqual(_encode_length(0x4000), b"\xc0\x40\x00")
        self.assertEqual(_encode_length(0x200000), b"\xe0\x20\x00\x00")


class IssueDeskSenderTests(unittest.TestCase):
    @patch("main.urllib.request.urlopen")
    def test_posts_payload_with_expected_endpoint_and_bearer_header(self, urlopen):
        response = MagicMock()
        response.status = 201
        response.read.return_value = json.dumps({"success": True, "receivedAt": "2026-10-25T00:00:00Z", "snapshotId": "snapshot-1"}).encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = None
        urlopen.return_value = response
        payload = {"collectedAt": "2026-10-25T00:00:00Z", "router": {}, "wan": {}}

        duplicate = _send_once(sample_config(), payload)

        self.assertFalse(duplicate)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://issuedesk.example.invalid/api/network/agent/report")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Authorization"), f"Bearer {'x' * 48}")
        self.assertEqual(json.loads(request.data), payload)

    @patch("main.urllib.request.urlopen")
    def test_duplicate_snapshot_response_is_treated_as_delivered(self, urlopen):
        urlopen.side_effect = HTTPError(
            "https://issuedesk.example.invalid/api/network/agent/report",
            409,
            "Duplicate",
            None,
            io.BytesIO(b"{}"),
        )

        duplicate = _send_once(sample_config(), {"collectedAt": "2026-10-25T00:00:00Z"})

        self.assertTrue(duplicate)


if __name__ == "__main__":
    unittest.main()
