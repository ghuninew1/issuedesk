#!/usr/bin/env python3
"""Read-only RouterOS API-SSL poller that reports snapshots to IssueDesk."""

from __future__ import annotations

import hashlib
import concurrent.futures
import ipaddress
import json
import logging
import os
import random
import re
import signal
import socket
import ssl
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit


LOGGER = logging.getLogger("network_monitor")
MAX_API_WORD_BYTES = 1024 * 1024
ROUTER_INTERFACE_NAMES = {"ais": "pppoe-AIS", "true": "pppoe-TRUE"}
REPORT_PATH = "/api/network/agent/report"
CONTROL_PATH = "/api/network/agent/control"
PING_REPORT_PATH = "/api/network/agent/ping-report"
LAN_NETWORK = ipaddress.ip_network("192.168.11.0/24")
PING_LATENCY_PATTERN = re.compile(r"time[=<]\s*([0-9]+(?:\.[0-9]+)?)\s*ms", re.IGNORECASE)


class ConfigurationError(Exception):
    """Raised when a required environment setting is missing or invalid."""


class RouterConnectionError(Exception):
    """Raised for RouterOS API, login, or protocol failures."""


class IssueDeskRequestError(Exception):
    """Raised when a report cannot be delivered to IssueDesk."""


class IssueDeskRejectedError(IssueDeskRequestError):
    """Raised for a permanent 4xx response from IssueDesk."""


@dataclass(frozen=True)
class Config:
    router_host: str
    router_port: int
    router_tls_server_name: str
    router_username: str
    router_password: str
    issue_desk_report_url: str
    issue_desk_control_url: str
    issue_desk_ping_report_url: str
    issue_desk_agent_token: str
    cf_access_client_id: str
    cf_access_client_secret: str
    poll_interval_seconds: int
    router_timeout_seconds: int
    http_timeout_seconds: int
    max_retry_attempts: int


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def load_config() -> Config:
    router_password = os.environ.get("ROUTER_PASSWORD", "")
    agent_token = os.environ.get("ISSUEDESK_AGENT_TOKEN", "")
    cf_access_client_id = os.environ.get("CF_ACCESS_CLIENT_ID", "").strip()
    cf_access_client_secret = os.environ.get("CF_ACCESS_CLIENT_SECRET", "")
    api_base_url = os.environ.get("ISSUEDESK_API_URL", "").strip()
    tls_server_name = os.environ.get("ROUTER_TLS_SERVER_NAME", "").strip()

    if not router_password:
        raise ConfigurationError("ROUTER_PASSWORD is required")
    if len(agent_token) < 32 or not agent_token.isascii() or any(character.isspace() for character in agent_token):
        raise ConfigurationError("ISSUEDESK_AGENT_TOKEN must contain at least 32 characters")
    if not cf_access_client_id or not cf_access_client_secret:
        raise ConfigurationError("CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required for Cloudflare Access")
    if any(character.isspace() for character in cf_access_client_id + cf_access_client_secret):
        raise ConfigurationError("Cloudflare Access service token values must not contain whitespace")
    if not tls_server_name:
        raise ConfigurationError("ROUTER_TLS_SERVER_NAME is required for certificate verification")
    if not api_base_url:
        raise ConfigurationError("ISSUEDESK_API_URL must be set to the deployed IssueDesk HTTPS origin")

    parsed_url = urlsplit(api_base_url)
    if (
        parsed_url.scheme != "https"
        or not parsed_url.netloc
        or parsed_url.username
        or parsed_url.password
        or parsed_url.query
        or parsed_url.fragment
        or parsed_url.path not in ("", "/")
    ):
        raise ConfigurationError("ISSUEDESK_API_URL must be an HTTPS origin without credentials or a path")

    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        raise ConfigurationError("LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR, or CRITICAL")

    router_host = os.environ.get("ROUTER_HOST", "192.168.11.1").strip()
    router_username = os.environ.get("ROUTER_USERNAME", "issuedesk-monitor").strip()
    if not router_host:
        raise ConfigurationError("ROUTER_HOST is required")
    if not router_username:
        raise ConfigurationError("ROUTER_USERNAME is required")

    return Config(
        router_host=router_host,
        router_port=_env_int("ROUTER_API_PORT", 8886, 1, 65535),
        router_tls_server_name=tls_server_name,
        router_username=router_username,
        router_password=router_password,
        issue_desk_report_url=f"{api_base_url.rstrip('/')}{REPORT_PATH}",
        issue_desk_control_url=f"{api_base_url.rstrip('/')}{CONTROL_PATH}",
        issue_desk_ping_report_url=f"{api_base_url.rstrip('/')}{PING_REPORT_PATH}",
        issue_desk_agent_token=agent_token,
        cf_access_client_id=cf_access_client_id,
        cf_access_client_secret=cf_access_client_secret,
        poll_interval_seconds=_env_int("POLL_INTERVAL_SECONDS", 30, 5, 3600),
        router_timeout_seconds=_env_int("ROUTER_TIMEOUT_SECONDS", 10, 1, 60),
        http_timeout_seconds=_env_int("ISSUEDESK_REQUEST_TIMEOUT_SECONDS", 10, 1, 60),
        max_retry_attempts=_env_int("MAX_SEND_ATTEMPTS", 5, 1, 10),
    )


def _encode_length(length: int) -> bytes:
    if length < 0x80:
        return bytes((length,))
    if length < 0x4000:
        return struct.pack("!H", length | 0x8000)
    if length < 0x200000:
        return (length | 0xC00000).to_bytes(3, "big")
    if length < 0x10000000:
        return struct.pack("!I", length | 0xE0000000)
    if length < 0x100000000:
        return b"\xf0" + struct.pack("!I", length)
    raise RouterConnectionError("RouterOS API word exceeds protocol length limit")


class RouterOSAPI:
    """Small synchronous RouterOS API client with TLS hostname verification."""

    def __init__(self, sock: ssl.SSLSocket):
        self.sock = sock

    @staticmethod
    def _read_exact(sock: ssl.SSLSocket, size: int) -> bytes:
        chunks = bytearray()
        while len(chunks) < size:
            chunk = sock.recv(size - len(chunks))
            if not chunk:
                raise RouterConnectionError("RouterOS closed the API connection")
            chunks.extend(chunk)
        return bytes(chunks)

    @classmethod
    def _read_length(cls, sock: ssl.SSLSocket) -> int:
        first = cls._read_exact(sock, 1)[0]
        if first < 0x80:
            length = first
        elif first < 0xC0:
            length = ((first & 0x3F) << 8) | cls._read_exact(sock, 1)[0]
        elif first < 0xE0:
            tail = cls._read_exact(sock, 2)
            length = ((first & 0x1F) << 16) | (tail[0] << 8) | tail[1]
        elif first < 0xF0:
            tail = cls._read_exact(sock, 3)
            length = ((first & 0x0F) << 24) | (tail[0] << 16) | (tail[1] << 8) | tail[2]
        elif first == 0xF0:
            length = struct.unpack("!I", cls._read_exact(sock, 4))[0]
        else:
            raise RouterConnectionError("RouterOS sent an unsupported API control byte")
        if length > MAX_API_WORD_BYTES:
            raise RouterConnectionError("RouterOS API word exceeds the configured read limit")
        return length

    def _send_sentence(self, words: list[str]) -> None:
        payload = bytearray()
        for word in words:
            encoded = word.encode("utf-8")
            payload.extend(_encode_length(len(encoded)))
            payload.extend(encoded)
        payload.extend(b"\x00")
        self.sock.sendall(payload)

    def _read_sentence(self) -> list[str]:
        words: list[str] = []
        while True:
            length = self._read_length(self.sock)
            if length == 0:
                return words
            words.append(self._read_exact(self.sock, length).decode("utf-8"))
            if len(words) > 512:
                raise RouterConnectionError("RouterOS API sentence exceeds the configured word limit")

    @staticmethod
    def _attributes(words: list[str]) -> dict[str, str]:
        result: dict[str, str] = {}
        for word in words:
            if not word.startswith("="):
                continue
            key, separator, value = word[1:].partition("=")
            if separator:
                result[key] = value
        return result

    def talk(self, words: list[str]) -> tuple[list[dict[str, str]], dict[str, str]]:
        self._send_sentence(words)
        rows: list[dict[str, str]] = []
        trap_received = False
        while True:
            sentence = self._read_sentence()
            if not sentence:
                continue
            kind = sentence[0]
            attributes = self._attributes(sentence[1:])
            if kind == "!re":
                rows.append(attributes)
            elif kind == "!trap":
                trap_received = True
            elif kind == "!fatal":
                raise RouterConnectionError("RouterOS terminated the API session")
            elif kind == "!done":
                if trap_received:
                    raise RouterConnectionError("RouterOS rejected a read command or login")
                return rows, attributes

    def login(self, username: str, password: str) -> None:
        _, response = self.talk(["/login", f"=name={username}", f"=password={password}"])
        challenge = response.get("ret")
        if challenge:
            try:
                challenge_bytes = bytes.fromhex(challenge)
            except ValueError as error:
                raise RouterConnectionError("RouterOS returned an invalid legacy login challenge") from error
            digest = hashlib.md5(b"\x00" + password.encode("utf-8") + challenge_bytes).hexdigest()  # noqa: S324 - RouterOS legacy compatibility only.
            self.talk(["/login", f"=name={username}", f"=response=00{digest}"])

    def command(self, command: str, *arguments: str) -> list[dict[str, str]]:
        rows, _ = self.talk([command, *arguments])
        return rows


def _parse_int(value: str | None, field: str) -> int:
    if value is None:
        raise RouterConnectionError(f"RouterOS omitted {field}")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise RouterConnectionError(f"RouterOS returned invalid {field}") from error
    if parsed < 0:
        raise RouterConnectionError(f"RouterOS returned negative {field}")
    return parsed


def _parse_float(value: str | None, field: str) -> float:
    if value is None:
        raise RouterConnectionError(f"RouterOS omitted {field}")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as error:
        raise RouterConnectionError(f"RouterOS returned invalid {field}") from error
    if parsed < 0:
        raise RouterConnectionError(f"RouterOS returned negative {field}")
    return parsed


def _parse_temperature(resource: dict[str, str]) -> float | None:
    raw = resource.get("temperature") or resource.get("cpu-temperature")
    if not raw:
        return None
    number = "".join(character for character in raw if character.isdigit() or character in ".-")
    try:
        return float(number)
    except ValueError:
        return None


def _read_router(config: Config) -> dict[str, Any]:
    context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise RouterConnectionError("TLS certificate and hostname verification must remain enabled")

    with socket.create_connection((config.router_host, config.router_port), timeout=config.router_timeout_seconds) as raw_socket:
        with context.wrap_socket(raw_socket, server_hostname=config.router_tls_server_name) as tls_socket:
            tls_socket.settimeout(config.router_timeout_seconds)
            api = RouterOSAPI(tls_socket)
            api.login(config.router_username, config.router_password)

            identities = api.command("/system/identity/print", "=.proplist=name")
            resources = api.command(
                "/system/resource/print",
                "=.proplist=uptime,cpu-load,free-memory,total-memory,temperature,cpu-temperature",
            )
            interfaces = api.command(
                "/interface/print",
                "=stats-detail",
                "=.proplist=name,running,rx-byte,tx-byte",
                "?=name=pppoe-AIS",
                "?=name=pppoe-TRUE",
                "?#|",
            )

    if not identities or not resources:
        raise RouterConnectionError("RouterOS did not return identity or resource information")
    identity = identities[0].get("name")
    uptime = resources[0].get("uptime")
    if not identity or not uptime:
        raise RouterConnectionError("RouterOS identity or uptime is missing")

    interfaces_by_name = {item.get("name"): item for item in interfaces if item.get("name")}
    wan_data: dict[str, dict[str, Any]] = {}
    for key, interface_name in ROUTER_INTERFACE_NAMES.items():
        interface = interfaces_by_name.get(interface_name, {})
        wan_data[key] = {
            "interface": interface_name,
            "running": interface.get("running", "false").lower() in {"true", "yes", "1"},
            "ipAddress": None,
            "rxBytes": _parse_int(interface.get("rx-byte", "0"), f"{interface_name} RX byte counter"),
            "txBytes": _parse_int(interface.get("tx-byte", "0"), f"{interface_name} TX byte counter"),
        }

    return {
        "router": {
            "identity": identity,
            "uptime": uptime,
            "cpuLoad": _parse_float(resources[0].get("cpu-load"), "CPU load"),
            "memoryTotalBytes": _parse_int(resources[0].get("total-memory"), "total memory"),
            "memoryFreeBytes": _parse_int(resources[0].get("free-memory"), "free memory"),
            "temperatureC": _parse_temperature(resources[0]),
        },
        "wan": wan_data,
    }


class RateTracker:
    """Calculate local rates from counter deltas without returning negatives."""

    def __init__(self) -> None:
        self.previous: dict[str, dict[str, Any]] = {}
        self.previous_at: float | None = None

    def update(self, wan_data: dict[str, dict[str, Any]], observed_at: float) -> dict[str, dict[str, float | None]]:
        elapsed = observed_at - self.previous_at if self.previous_at is not None else 0.0
        rates: dict[str, dict[str, float | None]] = {}
        for key, current in wan_data.items():
            previous = self.previous.get(key)
            download: float | None = None
            upload: float | None = None
            if previous and previous["running"] and current["running"] and 0 < elapsed <= 180:
                rx_delta = current["rxBytes"] - previous["rxBytes"]
                tx_delta = current["txBytes"] - previous["txBytes"]
                if rx_delta >= 0:
                    download = (rx_delta * 8) / elapsed / 1_000_000
                if tx_delta >= 0:
                    upload = (tx_delta * 8) / elapsed / 1_000_000
            rates[key] = {"download": download, "upload": upload}
            self.previous[key] = dict(current)
        self.previous_at = observed_at
        return rates


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _issue_desk_headers(config: Config) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "User-Agent": "IssueDesk-Network-Monitor/1.0 (+https://issuedesk.bigbrain-studio.com)",
        "Authorization": f"Bearer {config.issue_desk_agent_token}",
        "CF-Access-Client-Id": config.cf_access_client_id,
        "CF-Access-Client-Secret": config.cf_access_client_secret,
    }


def _read_agent_control(config: Config) -> dict[str, Any]:
    request = urllib.request.Request(config.issue_desk_control_url, method="GET", headers=_issue_desk_headers(config))
    try:
        with urllib.request.urlopen(request, timeout=config.http_timeout_seconds) as response:
            raw_response = response.read(16 * 1024)
    except urllib.error.HTTPError as error:
        error.close()
        if error.code in {408, 429} or error.code >= 500:
            raise IssueDeskRequestError(f"IssueDesk control endpoint returned retryable HTTP status {error.code}") from error
        raise IssueDeskRejectedError(f"IssueDesk control endpoint rejected the request with HTTP status {error.code}") from error
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as error:
        raise IssueDeskRequestError(f"IssueDesk control request failed ({type(error).__name__})") from error

    try:
        result = json.loads(raw_response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise IssueDeskRequestError("IssueDesk control endpoint returned invalid JSON") from error
    if not isinstance(result, dict) or result.get("success") is not True or not isinstance(result.get("active"), bool):
        raise IssueDeskRequestError("IssueDesk control endpoint returned an unexpected response")
    ping_job = result.get("pingJob")
    if ping_job is not None:
        if not isinstance(ping_job, dict) or not isinstance(ping_job.get("id"), str) or not isinstance(ping_job.get("targets"), list):
            raise IssueDeskRequestError("IssueDesk control endpoint returned an invalid ping job")
        if not 1 <= len(ping_job["targets"]) <= 20 or any(not _is_allowed_ping_target(target) for target in ping_job["targets"]):
            raise IssueDeskRequestError("IssueDesk control endpoint returned invalid ping targets")
    return result


def _is_allowed_ping_target(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return address.version == 4 and address in LAN_NETWORK and address not in {LAN_NETWORK.network_address, LAN_NETWORK.broadcast_address}


def _ping_one(target: str) -> dict[str, Any]:
    if not _is_allowed_ping_target(target):
        return {"ipAddress": target, "status": "error", "latencyMs": None}
    started = time.monotonic()
    try:
        result = subprocess.run(
            ["ping", "-n", "-c", "1", "-W", "1", target],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ipAddress": target, "status": "offline", "latencyMs": None}
    except OSError:
        return {"ipAddress": target, "status": "error", "latencyMs": None}

    if result.returncode == 1:
        return {"ipAddress": target, "status": "offline", "latencyMs": None}
    if result.returncode != 0:
        return {"ipAddress": target, "status": "error", "latencyMs": None}
    match = PING_LATENCY_PATTERN.search(result.stdout)
    latency = float(match.group(1)) if match else (time.monotonic() - started) * 1000
    return {"ipAddress": target, "status": "online", "latencyMs": round(latency, 3)}


def _run_ping_job(targets: list[str]) -> list[dict[str, Any]]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, len(targets))) as executor:
        return list(executor.map(_ping_one, targets))


def _send_ping_results(config: Config, check_id: str, results: list[dict[str, Any]]) -> None:
    body = json.dumps({"checkId": check_id, "results": results}, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        config.issue_desk_ping_report_url,
        data=body,
        method="POST",
        headers={**_issue_desk_headers(config), "Content-Type": "application/json"},
    )
    for attempt in range(1, config.max_retry_attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=config.http_timeout_seconds) as response:
                payload = json.loads(response.read(16 * 1024).decode("utf-8"))
                if response.status != 200 or not isinstance(payload, dict) or payload.get("success") is not True:
                    raise IssueDeskRequestError("IssueDesk rejected ping results")
                return
        except urllib.error.HTTPError as error:
            error.close()
            if error.code not in {408, 429} and error.code < 500:
                raise IssueDeskRejectedError(f"IssueDesk ping report rejected with HTTP status {error.code}") from error
            last_error: Exception = IssueDeskRequestError(f"IssueDesk ping report returned HTTP status {error.code}")
        except (urllib.error.URLError, TimeoutError, socket.timeout, OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            last_error = IssueDeskRequestError(f"IssueDesk ping report failed ({type(error).__name__})")
        if attempt == config.max_retry_attempts:
            raise last_error
        delay = min(2 ** (attempt - 1), 15) + random.uniform(0, 0.25)
        LOGGER.warning("Ping result delivery attempt %s/%s failed; retrying in %.1fs", attempt, config.max_retry_attempts, delay)
        time.sleep(delay)


def _send_once(config: Config, payload: dict[str, Any]) -> bool:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        config.issue_desk_report_url,
        data=body,
        method="POST",
        headers={
            **_issue_desk_headers(config),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=config.http_timeout_seconds) as response:
            raw_response = response.read(64 * 1024)
            if response.status != 201:
                raise IssueDeskRequestError(f"IssueDesk returned unexpected HTTP status {response.status}")
    except urllib.error.HTTPError as error:
        response_content_type = error.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        response_message = None
        try:
            response_body = error.read(4096)
            if response_content_type == "application/json":
                decoded = json.loads(response_body.decode("utf-8"))
                if isinstance(decoded, dict):
                    for key in ("message", "detail", "error", "title"):
                        value = decoded.get(key)
                        if isinstance(value, str) and value.strip():
                            response_message = value.strip()[:200]
                            break
                    if response_message is None and isinstance(decoded.get("errors"), list):
                        for item in decoded["errors"]:
                            if isinstance(item, dict) and isinstance(item.get("message"), str) and item["message"].strip():
                                response_message = item["message"].strip()[:200]
                                break
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            pass
        finally:
            error.close()
        if error.code == 409:
            return True
        if error.code in {408, 429} or error.code >= 500:
            raise IssueDeskRequestError(f"IssueDesk returned retryable HTTP status {error.code}") from error
        details = f": {response_message}" if response_message else f" (content type: {response_content_type or 'unknown'}; no safe error message returned)"
        raise IssueDeskRejectedError(f"IssueDesk rejected the report with HTTP status {error.code}{details}") from error
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as error:
        raise IssueDeskRequestError(f"IssueDesk request failed ({type(error).__name__})") from error

    try:
        parsed = json.loads(raw_response.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise IssueDeskRequestError("IssueDesk returned an invalid JSON response") from error
    if not isinstance(parsed, dict) or parsed.get("success") is not True or not parsed.get("snapshotId"):
        raise IssueDeskRequestError("IssueDesk returned an unexpected report response")
    return False


def _send_with_retry(config: Config, payload: dict[str, Any], stop_event: threading.Event) -> bool:
    for attempt in range(1, config.max_retry_attempts + 1):
        try:
            return _send_once(config, payload)
        except IssueDeskRejectedError:
            raise
        except IssueDeskRequestError as error:
            if attempt == config.max_retry_attempts:
                raise
            delay = min(2 ** (attempt - 1), 15) + random.uniform(0, 0.25)
            LOGGER.warning("IssueDesk report attempt %s/%s failed (%s); retrying in %.1fs", attempt, config.max_retry_attempts, type(error).__name__, delay)
            if stop_event.wait(delay):
                return False
    return False


def _rate_text(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.2f} Mbps"


def run_agent(config: Config, stop_event: threading.Event) -> None:
    rate_tracker = RateTracker()
    was_active = False
    while not stop_event.is_set():
        cycle_started = time.monotonic()
        try:
            control = _read_agent_control(config)
            ping_job = control.get("pingJob")
            if ping_job:
                ping_results = _run_ping_job(ping_job["targets"])
                _send_ping_results(config, ping_job["id"], ping_results)
                online_count = sum(result["status"] == "online" for result in ping_results)
                LOGGER.info("Ping check %s completed: %s/%s online", ping_job["id"], online_count, len(ping_results))

            if not control["active"]:
                if was_active:
                    LOGGER.info("No active Network Monitor viewers; Router polling paused")
                was_active = False
                rate_tracker = RateTracker()
            else:
                if not was_active:
                    LOGGER.info("Network Monitor viewer active; Router polling started")
                was_active = True
                collected = _read_router(config)
                sample_at = time.monotonic()
                local_rates = rate_tracker.update(collected["wan"], sample_at)
                payload = {
                    "collectedAt": _utc_now(),
                    "router": collected["router"],
                    "wan": collected["wan"],
                }
                was_already_received = _send_with_retry(config, payload, stop_event)
                if not stop_event.is_set():
                    if was_already_received:
                        LOGGER.info("IssueDesk already has this snapshot; duplicate delivery was ignored")
                    else:
                        LOGGER.info(
                            "Snapshot delivered; AIS down/up=%s/%s, True down/up=%s/%s",
                            _rate_text(local_rates["ais"]["download"]),
                            _rate_text(local_rates["ais"]["upload"]),
                            _rate_text(local_rates["true"]["download"]),
                            _rate_text(local_rates["true"]["upload"]),
                        )
        except ssl.SSLCertVerificationError:
            LOGGER.error("Router TLS certificate or hostname verification failed")
        except ssl.SSLError:
            LOGGER.error("Router TLS handshake failed")
        except RouterConnectionError:
            LOGGER.error("RouterOS API read or authentication failed")
        except IssueDeskRejectedError as error:
            LOGGER.error("IssueDesk rejected the request (%s)", error)
        except IssueDeskRequestError as error:
            LOGGER.error("IssueDesk request failed (%s)", error)
        except (socket.timeout, TimeoutError):
            LOGGER.warning("Router API request timed out")
        except OSError as error:
            LOGGER.warning("Router connection failed (%s)", type(error).__name__)
        except Exception as error:  # Keep the long-running agent alive on unexpected poll failures.
            LOGGER.exception("Unexpected monitoring cycle failure (%s)", type(error).__name__)

        remaining = config.poll_interval_seconds - (time.monotonic() - cycle_started)
        if remaining > 0:
            stop_event.wait(remaining)


def _configure_logging() -> None:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main() -> int:
    _configure_logging()
    try:
        config = load_config()
    except ConfigurationError as error:
        LOGGER.critical("Invalid configuration: %s", error)
        return 2

    stop_event = threading.Event()
    signal.signal(signal.SIGTERM, lambda _signum, _frame: stop_event.set())
    signal.signal(signal.SIGINT, lambda _signum, _frame: stop_event.set())
    LOGGER.info("Network Monitor Agent started; polling every %s seconds", config.poll_interval_seconds)
    try:
        run_agent(config, stop_event)
    finally:
        LOGGER.info("Network Monitor Agent stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
