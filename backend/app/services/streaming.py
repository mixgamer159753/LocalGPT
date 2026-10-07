import json
import logging
from dataclasses import dataclass

import httpx
from httpx import Timeout

from app.core.config import (
    DEFAULT_MODEL,
    OLLAMA_CHAT_URL,
    OLLAMA_CONNECT_TIMEOUT,
    OLLAMA_READ_TIMEOUT,
    LLM_USE_NATIVE_OLLAMA,
)
from app.services.ollama import OllamaUnavailableError
from app.services.ollama_payload import build_chat_payload

logger = logging.getLogger("localgpt.streaming")


@dataclass
class StreamResult:
    finish_reason: str | None = None
    warning: str | None = None


@dataclass
class StreamStatus:
    message: str


async def stream_chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_style: str = "balanced",
    memory_context: str = "",
    thinking_effort: str = "max",
    result: StreamResult | None = None,
):
    """Continue explicit token-limit truncations, with a bounded two-retry budget."""
    result = result if result is not None else StreamResult()
    visible_reply = ""
    current_messages = messages
    for round_number in range(3):
        round_text = ""
        result.finish_reason = None
        async for chunk in _stream_once(current_messages, model, temperature, max_tokens, response_style, memory_context, thinking_effort, result):
            round_text += chunk
            visible_reply += chunk
            yield chunk
        logger.info("LLM generation ended: reason=%s round=%s visible_chars=%s", result.finish_reason, round_number + 1, len(round_text))
        if result.finish_reason != "length":
            if round_number and not round_text.strip():
                result.warning = "The model did not finish the continuation. The partial answer has been kept."
            elif result.finish_reason in {"content_filter", "tool_calls", "function_call"}:
                result.warning = "The model stopped before returning a complete answer."
            return
        if not round_text.strip():
            result.warning = "The model reached its token limit while thinking. Try a lower thinking effort or a shorter question."
            if not visible_reply.strip():
                raise OllamaUnavailableError(result.warning)
            return
        if round_number == 2:
            result.warning = "The model reached its output limit after two continuations. This answer is still incomplete."
            return
        yield StreamStatus("Continuing the answer...")
        # Keep the original question and recent answer tail within a local context window.
        last_user = next(message for message in reversed(messages) if message["role"] == "user")
        current_messages = [last_user, {"role": "assistant", "content": visible_reply[-24_000:]}, {
            "role": "user", "content": (
                "Continue the previous answer from its last character until the original task is complete. "
                "The assistant message may be only the answer's ending. Do not repeat it or add an introduction. "
                "If a code fence is still open, continue its code without opening another fence."
            ),
        }]


async def _stream_once(messages, model, temperature, max_tokens, response_style, memory_context, thinking_effort, result):

    payload = build_chat_payload(
        messages=messages,
        model=model or DEFAULT_MODEL,
        stream=True,
        temperature=temperature,
        max_tokens=max_tokens,
        response_style=response_style,
        memory_context=memory_context,
        thinking_effort=thinking_effort,
    )

    logger.info(
        "Sending to LLM: model=%s max_tokens=%s",
        payload["model"],
        payload.get("options", {}).get("num_predict") or payload.get("max_tokens", "default"),
    )

    timeout = Timeout(OLLAMA_CONNECT_TIMEOUT, read=OLLAMA_READ_TIMEOUT)
    think_filter = ThinkBlockFilter()
    output: list[str] = []
    count_since_flush = 0
    provider_completed = False

    def flush() -> str | None:
        nonlocal count_since_flush
        if not output:
            return None
        chunk = "".join(output)
        output.clear()
        count_since_flush = 0
        return chunk

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", OLLAMA_CHAT_URL, json=payload) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    logger.error("LLM provider returned %s: %s", response.status_code, body)
                    raise OllamaUnavailableError(_extract_error(body))

                if LLM_USE_NATIVE_OLLAMA:
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if "error" in data:
                            raise OllamaUnavailableError(_sanitize_error(str(data["error"])))

                        content = data.get("message", {}).get("content")
                        if content:
                            output.append(think_filter.feed(content))
                            count_since_flush += 1
                        if data.get("done", False):
                            result.finish_reason = data.get("done_reason") or "stop"
                            provider_completed = True
                            output.append(think_filter.flush())
                            chunk = flush()
                            if chunk:
                                yield chunk
                            break
                        if count_since_flush >= 3:
                            chunk = flush()
                            if chunk:
                                yield chunk
                else:
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        raw = line[5:].lstrip()
                        if raw.strip() == "[DONE]":
                            provider_completed = True
                            output.append(think_filter.flush())
                            chunk = flush()
                            if chunk:
                                yield chunk
                            break
                        try:
                            data = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if "error" in data:
                            raise OllamaUnavailableError(_sanitize_error(str(data["error"])))

                        choices = data.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0]
                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if content:
                            output.append(think_filter.feed(content))
                            count_since_flush += 1
                        if choice.get("finish_reason"):
                            result.finish_reason = choice["finish_reason"]
                            provider_completed = True
                            output.append(think_filter.flush())
                            chunk = flush()
                            if chunk:
                                yield chunk
                            break
                        if count_since_flush >= 3:
                            chunk = flush()
                            if chunk:
                                yield chunk

                if not provider_completed:
                    raise OllamaUnavailableError("LLM provider ended the stream unexpectedly.")

    except OllamaUnavailableError:
        raise
    except httpx.ConnectError as exc:
        logger.error("Could not connect to LLM provider at %s", OLLAMA_CHAT_URL)
        raise OllamaUnavailableError(
            f"Could not reach LLM provider at {OLLAMA_CHAT_URL}. Is it running?"
        ) from exc
    except httpx.TimeoutException as exc:
        raise OllamaUnavailableError("LLM provider timed out while generating a response.") from exc
    except httpx.HTTPError as exc:
        logger.exception("Unexpected error while streaming from LLM provider")
        raise OllamaUnavailableError(f"Unexpected error talking to LLM provider: {exc}") from exc


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
    if "image" in detail.lower():
        return "The model cannot process images. Text-only messages only."
    return detail or "LLM returned an error."


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
