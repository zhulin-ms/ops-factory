#!/usr/bin/env python3
import base64
import json
import os
import socket
import ssl
import sys
import traceback
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


JSONRPC_VERSION = "2.0"
NEGOTIATED_PROTOCOL_VERSION = "2025-03-26"
SERVER_NAME = "system-health-analysis"
SERVER_VERSION = "2.0.0"
DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_QOS_BASE_URL = "https://192.168.161.163:38443"
DEFAULT_QOS_USERNAME = "managementservice"
LOG_FILE_NAME = "system_health_analysis.log"
DEFAULT_TIME_PARSE_FORMAT = "%Y/%m/%d %H:%M:%S"
DEFAULT_TIME_DISPLAY_FORMAT = "YYYY/M/D HH:MM:SS"
DEFAULT_TIME_EXAMPLE = "2026/4/16 20:00:00"
TIME_PARSE_FORMAT_ENV = "QOS_TIME_PARSE_FORMAT"


class ToolExecutionError(Exception):
    def __init__(self, public_message: str, *, internal_message: Optional[str] = None):
        super().__init__(internal_message or public_message)
        self.public_message = public_message
        self.internal_message = internal_message or public_message


class McpLogger:
    def __init__(self) -> None:
        root = Path(os.environ.get("GOOSE_PATH_ROOT") or os.getcwd())
        self.log_dir = root / "logs" / "mcp"
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.log_file = self.log_dir / LOG_FILE_NAME

    def _write(self, level: str, message: str, **fields: Any) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        }
        if fields:
            record["fields"] = fields
        line = json.dumps(record, ensure_ascii=True)
        with self.log_file.open("a", encoding="utf-8") as fp:
            fp.write(line + "\n")
        print(line, file=sys.stderr, flush=True)

    def info(self, message: str, **fields: Any) -> None:
        self._write("INFO", message, **fields)

    def error(self, message: str, **fields: Any) -> None:
        self._write("ERROR", message, **fields)

    def exception(self, message: str, **fields: Any) -> None:
        fields = dict(fields)
        fields["traceback"] = traceback.format_exc()
        self._write("ERROR", message, **fields)


LOGGER = McpLogger()


@dataclass(frozen=True)
class RuntimeConfig:
    qos_base_url: str
    qos_username: str
    qos_password: str
    verify_tls: bool
    timeout_seconds: int
    time_parse_format: str

    @classmethod
    def from_env(cls) -> "RuntimeConfig":
        qos_base_url = (os.environ.get("QOS_BASE_URL") or DEFAULT_QOS_BASE_URL).rstrip("/")
        qos_username = os.environ.get("QOS_USERNAME") or DEFAULT_QOS_USERNAME
        # Prefer the explicit QOS password when both are configured.
        qos_password = os.environ.get("QOS_PASSWORD") or os.environ.get("GATEWAY_API_PASSWORD") or ""
        verify_tls = parse_bool(os.environ.get("QOS_VERIFY_TLS"), default=False)
        timeout_seconds = parse_int(os.environ.get("QOS_TIMEOUT_SECONDS"), DEFAULT_TIMEOUT_SECONDS)
        time_parse_format = os.environ.get(TIME_PARSE_FORMAT_ENV) or DEFAULT_TIME_PARSE_FORMAT
        return cls(
            qos_base_url=qos_base_url,
            qos_username=qos_username,
            qos_password=qos_password,
            verify_tls=verify_tls,
            timeout_seconds=timeout_seconds,
            time_parse_format=time_parse_format,
        )

    def masked_dict(self) -> Dict[str, Any]:
        return {
            "qos_base_url": self.qos_base_url,
            "qos_username": self.qos_username,
            "qos_password_set": bool(self.qos_password),
            "verify_tls": self.verify_tls,
            "timeout_seconds": self.timeout_seconds,
            "time_parse_format": self.time_parse_format,
        }


def parse_bool(value: Optional[str], *, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def parse_int(value: Optional[str], default: int) -> int:
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError:
        return default


def normalize_timestamp_ms(value: Any, name: str) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ToolExecutionError(f"{name} must be a number (milliseconds since epoch)")
    if value != value or value in (float("inf"), float("-inf")):
        raise ToolExecutionError(f"{name} must be a finite number")

    as_int = int(value)
    if as_int <= 0:
        raise ToolExecutionError(f"{name} must be a positive timestamp")

    normalized = as_int * 1000 if as_int < 1_000_000_000_000 else as_int
    now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    if normalized > now_ms + 10 * 60 * 1000:
        raise ToolExecutionError(f"{name} looks like a future timestamp: {normalized}")
    return normalized


def normalize_datetime_string_ms(value: Any, name: str, time_parse_format: str) -> int:
    text = require_non_empty_string(value, name)
    try:
        parsed = datetime.strptime(text, time_parse_format)
    except ValueError as exc:
        raise ToolExecutionError(
            f"{name} must be a datetime string in format {DEFAULT_TIME_DISPLAY_FORMAT} (e.g. {DEFAULT_TIME_EXAMPLE})"
        ) from exc
    tzinfo = datetime.now().astimezone().tzinfo or timezone.utc
    return normalize_timestamp_ms(int(parsed.replace(tzinfo=tzinfo).timestamp() * 1000), name)


def normalize_time_ms(value: Any, name: str, time_parse_format: str) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return normalize_timestamp_ms(value, name)
    return normalize_datetime_string_ms(value, name, time_parse_format)


def require_non_empty_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ToolExecutionError(f"{name} must be a non-empty string")
    return value.strip()


def build_health_score_payload(args: Dict[str, Any], config: RuntimeConfig) -> Dict[str, Any]:
    env_code = require_non_empty_string(args.get("envCode"), "envCode")
    start_time_ms = normalize_time_ms(args.get("startTime"), "startTime", config.time_parse_format)
    end_time_ms = normalize_time_ms(args.get("endTime"), "endTime", config.time_parse_format)
    if end_time_ms <= start_time_ms:
        raise ToolExecutionError(
            f"endTime must be greater than startTime: startTime={start_time_ms} endTime={end_time_ms}"
        )
    payload: Dict[str, Any] = {
        "envCode": env_code,
        "startTime": start_time_ms,
        "endTime": end_time_ms,
    }
    mode = args.get("mode")
    if mode is not None:
        payload["mode"] = require_non_empty_string(mode, "mode")
    return payload


def build_abnormal_data_payload(args: Dict[str, Any], config: RuntimeConfig) -> Dict[str, Any]:
    env_code = require_non_empty_string(args.get("envCode"), "envCode")
    start_time_ms = normalize_time_ms(args.get("startTime"), "startTime", config.time_parse_format)
    end_time_ms = normalize_time_ms(args.get("endTime"), "endTime", config.time_parse_format)
    if end_time_ms <= start_time_ms:
        raise ToolExecutionError(
            f"endTime must be greater than startTime: startTime={start_time_ms} endTime={end_time_ms}"
        )
    return {
        "envCode": env_code,
        "startTime": start_time_ms,
        "endTime": end_time_ms,
    }


def build_topography_payload(args: Dict[str, Any]) -> Dict[str, Any]:
    return {"envCode": require_non_empty_string(args.get("envCode"), "envCode")}


TOOLS = [
    {
        "name": "get_health_score",
        "description": "查询指定时间范围的健康分数数据",
        "inputSchema": {
            "type": "object",
            "properties": {
                "envCode": {"type": "string", "description": "环境编码"},
                "startTime": {
                    "type": ["string", "number"],
                    "description": (
                        f"开始时间（字符串默认格式：{DEFAULT_TIME_DISPLAY_FORMAT}，例如 {DEFAULT_TIME_EXAMPLE}；"
                        f"可通过环境变量 {TIME_PARSE_FORMAT_ENV} 覆盖解析格式；也支持传入秒/毫秒时间戳）"
                    ),
                },
                "endTime": {
                    "type": ["string", "number"],
                    "description": (
                        f"结束时间（字符串默认格式：{DEFAULT_TIME_DISPLAY_FORMAT}，例如 {DEFAULT_TIME_EXAMPLE}；"
                        f"可通过环境变量 {TIME_PARSE_FORMAT_ENV} 覆盖解析格式；也支持传入秒/毫秒时间戳）"
                    ),
                },
                "mode": {"type": "string", "description": "监控模式（默认 real）"},
            },
            "required": ["envCode", "startTime", "endTime"],
        },
    },
    {
        "name": "get_abnormal_data",
        "description": "查询指定时间范围的告警数据",
        "inputSchema": {
            "type": "object",
            "properties": {
                "envCode": {"type": "string", "description": "环境编码"},
                "startTime": {
                    "type": ["string", "number"],
                    "description": (
                        f"开始时间（字符串默认格式：{DEFAULT_TIME_DISPLAY_FORMAT}，例如 {DEFAULT_TIME_EXAMPLE}；"
                        f"可通过环境变量 {TIME_PARSE_FORMAT_ENV} 覆盖解析格式；也支持传入秒/毫秒时间戳）"
                    ),
                },
                "endTime": {
                    "type": ["string", "number"],
                    "description": (
                        f"结束时间（字符串默认格式：{DEFAULT_TIME_DISPLAY_FORMAT}，例如 {DEFAULT_TIME_EXAMPLE}；"
                        f"可通过环境变量 {TIME_PARSE_FORMAT_ENV} 覆盖解析格式；也支持传入秒/毫秒时间戳）"
                    ),
                },
            },
            "required": ["envCode", "startTime", "endTime"],
        },
    },
    {
        "name": "get_topography",
        "description": "查询环境拓扑",
        "inputSchema": {
            "type": "object",
            "properties": {
                "envCode": {"type": "string", "description": "环境编码"},
            },
            "required": ["envCode"],
        },
    },
]


def build_ssl_context(verify_tls: bool) -> Optional[ssl.SSLContext]:
    if verify_tls:
        return ssl.create_default_context()
    return ssl._create_unverified_context()


def qos_post(path: str, body: Dict[str, Any], config: RuntimeConfig) -> Any:
    if not config.qos_base_url:
        raise ToolExecutionError("QOS_BASE_URL is required")
    if not config.qos_username:
        raise ToolExecutionError("QOS_USERNAME is required")
    if not config.qos_password:
        raise ToolExecutionError("QOS_PASSWORD (or GATEWAY_API_PASSWORD) is required")

    url = urllib.parse.urljoin(f"{config.qos_base_url}/", path.lstrip("/"))
    encoded_credentials = base64.b64encode(
        f"{config.qos_username}:{config.qos_password}".encode("utf-8")
    ).decode("ascii")
    payload_bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url=url,
        data=payload_bytes,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {encoded_credentials}",
        },
    )

    LOGGER.info(
        "Sending QOS request",
        path=path,
        url=url,
        request_body=body,
        verify_tls=config.verify_tls,
        timeout_seconds=config.timeout_seconds,
    )

    context = None
    if urllib.parse.urlparse(url).scheme == "https":
        context = build_ssl_context(config.verify_tls)

    try:
        with urllib.request.urlopen(
            request,
            timeout=config.timeout_seconds,
            context=context,
        ) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            LOGGER.info(
                "Received QOS response",
                path=path,
                status=response.status,
                response_preview=response_body[:1000],
            )
            try:
                return json.loads(response_body)
            except json.JSONDecodeError as exc:
                raise ToolExecutionError(
                    f"QOS API {path} returned non-JSON response",
                    internal_message=f"JSON decode failed for {path}: {exc}; body={response_body[:1000]}",
                ) from exc
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        LOGGER.error(
            "QOS API returned HTTP error",
            path=path,
            status=exc.code,
            response_preview=response_body[:1000],
        )
        raise ToolExecutionError(
            f"QOS API {path} returned {exc.code}: {response_body[:500]}",
            internal_message=f"HTTPError {exc.code} for {path}: {response_body}",
        ) from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        LOGGER.error(
            "QOS request failed before receiving response",
            path=path,
            url=url,
            error_type=type(reason).__name__,
            error_message=str(reason),
        )
        raise ToolExecutionError(
            f"QOS request to {path} failed: {reason}",
            internal_message=f"URLError for {url}: {type(reason).__name__}: {reason}",
        ) from exc
    except socket.timeout as exc:
        LOGGER.error("QOS request timed out", path=path, url=url, timeout_seconds=config.timeout_seconds)
        raise ToolExecutionError(
            f"QOS request to {path} timed out after {config.timeout_seconds}s",
            internal_message=f"Timeout for {url} after {config.timeout_seconds}s",
        ) from exc
    except TimeoutError as exc:
        LOGGER.error("QOS request timed out", path=path, url=url, timeout_seconds=config.timeout_seconds)
        raise ToolExecutionError(
            f"QOS request to {path} timed out after {config.timeout_seconds}s",
            internal_message=f"Timeout for {url} after {config.timeout_seconds}s",
        ) from exc


def dispatch_tool(name: str, args: Dict[str, Any], config: RuntimeConfig) -> Any:
    if name == "get_health_score":
        return qos_post("/itom/machine/qos/getDiagnoseHealthScore", build_health_score_payload(args, config), config)
    if name == "get_abnormal_data":
        return qos_post(
            "/itom/machine/qos/getDiagnoseAbnormalData",
            build_abnormal_data_payload(args, config),
            config,
        )
    if name == "get_topography":
        return qos_post("/itom/machine/diagnosis/getTopology", build_topography_payload(args), config)
    raise KeyError(name)


def make_success_response(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": JSONRPC_VERSION, "id": request_id, "result": result}


def make_error_response(request_id: Any, code: int, message: str, data: Optional[Any] = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    response: Dict[str, Any] = {"jsonrpc": JSONRPC_VERSION, "error": error}
    if request_id is not None:
        response["id"] = request_id
    return response


def format_tool_result(data: Any, *, is_error: bool = False) -> Dict[str, Any]:
    if isinstance(data, str):
        text = data
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    return {
        "content": [{"type": "text", "text": text}],
        "isError": is_error,
    }


def handle_request(message: Dict[str, Any], config: RuntimeConfig) -> Optional[Dict[str, Any]]:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}

    if method == "initialize":
        LOGGER.info("Handling initialize request", params=params)
        return make_success_response(
            request_id,
            {
                "protocolVersion": NEGOTIATED_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
                "instructions": (
                    "Use the QoS health tools to query health score, abnormal data, topology, "
                    "and topology. TLS certificate verification is disabled by default."
                ),
            },
        )

    if method == "notifications/initialized":
        LOGGER.info("Client sent initialized notification")
        return None

    if method == "ping":
        return make_success_response(request_id, {})

    if method == "tools/list":
        return make_success_response(request_id, {"tools": TOOLS})

    if method == "tools/call":
        name = params.get("name")
        if not isinstance(name, str) or not name:
            return make_error_response(request_id, -32602, "Invalid params: tools/call requires a tool name")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return make_error_response(request_id, -32602, "Invalid params: tool arguments must be an object")

        LOGGER.info("Handling tool call", tool=name, arguments=arguments)
        try:
            result = dispatch_tool(name, arguments, config)
            return make_success_response(request_id, format_tool_result(result))
        except KeyError:
            return make_error_response(request_id, -32601, f"Unknown tool: {name}")
        except ToolExecutionError as exc:
            LOGGER.error("Tool execution failed", tool=name, error=exc.internal_message)
            return make_success_response(request_id, format_tool_result(exc.public_message, is_error=True))
        except Exception as exc:  # pragma: no cover - defensive path
            LOGGER.exception("Unhandled tool execution error", tool=name, error=str(exc))
            return make_success_response(
                request_id,
                format_tool_result(f"Unhandled server error: {exc}", is_error=True),
            )

    return make_error_response(request_id, -32601, f"Method not found: {method}")


def send_message(message: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def main() -> int:
    config = RuntimeConfig.from_env()
    LOGGER.info("Python MCP server starting", config=config.masked_dict())

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            LOGGER.error("Failed to parse incoming JSON-RPC message", raw_line=line, error=str(exc))
            send_message(make_error_response(None, -32700, "Parse error"))
            continue

        if not isinstance(message, dict):
            LOGGER.error("Incoming message is not a JSON object", raw_line=line)
            send_message(make_error_response(message.get("id") if isinstance(message, dict) else None, -32600, "Invalid Request"))
            continue

        response = handle_request(message, config)
        if response is not None:
            send_message(response)

    LOGGER.info("Python MCP server exiting")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
