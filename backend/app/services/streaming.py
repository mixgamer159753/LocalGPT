import asyncio
import json
import logging

import httpx
from httpx import Timeout

from app.core.config import (
    DEFAULT_MODEL,
    OLLAMA_CHAT_URL,
    OLLAMA_CONNECT_TIMEOUT,
    OLLAMA_READ_TIMEOUT,
    LLM_USE_NATIVE_OLLAMA,
)
from app.services.ollama_payload import build_chat_payload

logger = logging.getLogger("localgpt.streaming")

ERROR_PREFIX = "[LOCALGPT_ERROR]"
STATUS_PREFIX = "[LOCALGPT_STATUS]"

FLUSH_INTERVAL = 0.08


async def stream_chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_style: str = "balanced",
    memory_context: str = "",
):
    """Yield plain-text chunks from LLM as they arrive."""

    payload = build_chat_payload(
        messages=messages,
        model=model or DEFAULT_MODEL,
        stream=True,
        temperature=temperature,
        max_tokens=max_tokens,
        response_style=response_style,
        memory_context=memory_context,
    )

    logger.info(
        "Sending to LLM: model=%s max_tokens=%s",
        payload["model"],
        payload.get("options", {}).get("num_predict") or payload.get("max_tokens", "default"),
    )

    timeout = Timeout(OLLAMA_CONNECT_TIMEOUT, read=OLLAMA_READ_TIMEOUT)
    think_filter = ThinkBlockFilter()

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", OLLAMA_CHAT_URL, json=payload) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    logger.error("LLM provider returned %s: %s", response.status_code, body)
                    yield _error_chunk(_extract_error(body))
                    return

                buf = []
                count_since_flush = 0
                FLUSH_EVERY = 3

                def do_flush():
                    nonlocal count_since_flush
                    if not buf:
                        return None
                    chunk = "".join(buf)
                    buf.clear()
                    count_since_flush = 0
                    return chunk

                if LLM_USE_NATIVE_OLLAMA:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if "error" in data:
                            yield _error_chunk(_sanitize_error(str(data["error"])))
                            return
                        content = data.get("message", {}).get("content")
                        if content:
                            buf.append(think_filter.feed(content))
                            count_since_flush += 1
                        if data.get("done", False):
                            buf.append(think_filter.flush())
                            chunk = do_flush()
                            if chunk:
                                yield chunk
                            break
                        if count_since_flush >= FLUSH_EVERY:
                            chunk = do_flush()
                            if chunk:
                                yield chunk
                else:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            raw = line[6:]
                            if raw.strip() == "[DONE]":
                                buf.append(think_filter.flush())
                                chunk = do_flush()
                                if chunk:
                                    yield chunk
                                break
                            try:
                                data = json.loads(raw)
                            except json.JSONDecodeError:
                                continue
                            if "error" in data:
                                yield _error_chunk(_sanitize_error(str(data["error"])))
                                return
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content")
                            if content:
                                buf.append(think_filter.feed(content))
                                count_since_flush += 1
                            if count_since_flush >= FLUSH_EVERY:
                                chunk = do_flush()
                                if chunk:
                                    yield chunk

    except httpx.ConnectError:
        logger.error("Could not connect to LLM provider at %s", OLLAMA_CHAT_URL)
        yield _error_chunk(f"Could not reach LLM provider at {OLLAMA_CHAT_URL}. Is it running?")
    except httpx.TimeoutException:
        yield _error_chunk("LLM provider timed out while generating a response.")
    except httpx.HTTPError as exc:
        logger.exception("Unexpected error while streaming from LLM provider")
        yield _error_chunk(f"Unexpected error talking to LLM provider: {exc}")


def _extract_error(body: bytes) -> str:
    try:
        parsed = json.loads(body)
        err = parsed.get("error", "LLM returned an error.")
        if isinstance(err, dict):
            err = err.get("message", str(err))
        return _sanitize_error(str(err))
    except Exception:
        return _sanitize_error(body.decode(errors="replace")[:500])


def _sanitize_error(detail: str) -> str:
    if "image" in detail.lower() or "does not support" in detail.lower():
        return "The model cannot process images. Text-only messages only."
    return detail or "LLM returned an error."


def _error_chunk(message: str) -> str:
    return f"{ERROR_PREFIX} {message}"


def status_chunk(message: str) -> str:
    return f"{STATUS_PREFIX} {message}\n"


class ThinkBlockFilter:
    """Remove Qwen-style think blocks even when tags span stream chunks."""

    START_TAG = "<think>"
    END_TAG = "</think>"

    def __init__(self):
        self.buffer = ""
        self.in_think_block = False

    def feed(self, content: str) -> str:
        self.buffer += content
        visible: list[str] = []

        while self.buffer:
            lowered = self.buffer.lower()
            if self.in_think_block:
                end = lowered.find(self.END_TAG)
                if end == -1:
                    self.buffer = self._tag_tail(self.buffer, self.END_TAG)
                    break
                self.buffer = self.buffer[end + len(self.END_TAG):]
                self.in_think_block = False
                continue

            start = lowered.find(self.START_TAG)
            if start == -1:
                tail = self._tag_tail(self.buffer, self.START_TAG)
                visible_text = self.buffer[: len(self.buffer) - len(tail)]
                if visible_text:
                    visible.append(visible_text)
                self.buffer = tail
                break

            if start > 0:
                visible.append(self.buffer[:start])
            self.buffer = self.buffer[start + len(self.START_TAG):]
            self.in_think_block = True

        return "".join(visible)

    def flush(self) -> str:
        if self.in_think_block:
            self.buffer = ""
            return ""

        tail = self.buffer
        self.buffer = ""
        return tail

    @staticmethod
    def _tag_tail(value: str, tag: str) -> str:
        max_len = min(len(value), len(tag) - 1)
        lowered = value.lower()
        for length in range(max_len, 0, -1):
            suffix = lowered[-length:]
            if tag.startswith(suffix):
                return value[-length:]
        return ""
