import json
import logging

import requests

from app.core.config import (
    OLLAMA_CHAT_URL,
    OLLAMA_TAGS_URL,
    DEFAULT_MODEL,
    OLLAMA_CONNECT_TIMEOUT,
    OLLAMA_READ_TIMEOUT,
    LLM_USE_NATIVE_OLLAMA,
)
from app.services.ollama_payload import build_chat_payload, strip_think_blocks

logger = logging.getLogger("localgpt.ollama")


class OllamaUnavailableError(Exception):
    """Raised when Ollama can't be reached or returns an error."""


class OllamaService:

    def __init__(self):
        self.model = DEFAULT_MODEL

    def chat(self, messages: list[dict], model: str | None = None,
             temperature: float | None = None, max_tokens: int | None = None,
             response_style: str = "balanced", memory_context: str = "",
             thinking_effort: str = "max") -> str:

        payload = build_chat_payload(
            messages=messages,
            model=model or self.model,
            stream=False,
            temperature=temperature,
            max_tokens=max_tokens,
            response_style=response_style,
            memory_context=memory_context,
            thinking_effort=thinking_effort,
        )

        try:
            response = requests.post(
                OLLAMA_CHAT_URL,
                json=payload,
                timeout=(OLLAMA_CONNECT_TIMEOUT, OLLAMA_READ_TIMEOUT),
            )
            response.raise_for_status()
        except requests.exceptions.ConnectionError as exc:
            logger.error("Could not connect to Ollama at %s", OLLAMA_CHAT_URL)
            raise OllamaUnavailableError(
                f"Could not reach Ollama at {OLLAMA_CHAT_URL}. Is it running?"
            ) from exc
        except requests.exceptions.Timeout as exc:
            raise OllamaUnavailableError("Ollama timed out while generating a response.") from exc
        except requests.exceptions.HTTPError as exc:
            detail = exc.response.text if exc.response is not None else str(exc)
            # Sanitize image-related errors
            if "image" in detail.lower() or "does not support" in detail.lower():
                detail = "The model cannot process images. Text-only messages only."
            raise OllamaUnavailableError(f"Ollama returned an error: {detail}") from exc

        try:
            data = response.json()
        except (json.JSONDecodeError, requests.exceptions.JSONDecodeError) as exc:
            raise OllamaUnavailableError("Ollama returned invalid JSON.") from exc

        try:
            if LLM_USE_NATIVE_OLLAMA:
                content = data["message"]["content"]
            else:
                content = data["choices"][0]["message"]["content"]
            return strip_think_blocks(content)
        except (KeyError, TypeError, IndexError) as exc:
            raise OllamaUnavailableError("Unexpected response shape from LLM provider.") from exc

    def list_models(self) -> list[dict]:
        try:
            response = requests.get(OLLAMA_TAGS_URL, timeout=OLLAMA_CONNECT_TIMEOUT)
            response.raise_for_status()
        except requests.exceptions.ConnectionError as exc:
            raise OllamaUnavailableError(
                f"Could not reach Ollama at {OLLAMA_TAGS_URL}. Is it running?"
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise OllamaUnavailableError(f"Ollama returned an error: {exc}") from exc

        try:
            data = response.json()
        except (json.JSONDecodeError, requests.exceptions.JSONDecodeError) as exc:
            raise OllamaUnavailableError("Ollama returned invalid JSON for model list.") from exc

        if LLM_USE_NATIVE_OLLAMA:
            return data.get("models", [])
        return data.get("data", [])
