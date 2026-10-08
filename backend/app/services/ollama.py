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

logger = logging.getLogger("localgpt.provider")


class OllamaUnavailableError(Exception):
    """Legacy exception name for model-server connection and response errors."""


class OllamaService:

    def __init__(self):
        self.model = DEFAULT_MODEL

    def resolve_model(self, requested_model: str | None = None) -> str:
        """Use the requested model when available, otherwise select a loaded model."""
        models = self.list_models()
        if LLM_USE_NATIVE_OLLAMA:
            names = [item.get("name") or item.get("model") for item in models]
        else:
            names = [item.get("id") for item in models]

        available = list(dict.fromkeys(
            name.strip()
            for name in names
            if isinstance(name, str) and name.strip() and name.strip() != "unknown"
        ))
        preferred = requested_model or self.model
        if preferred and preferred in available:
            return preferred
        if self.model and self.model in available:
            return self.model
        if available:
            if preferred:
                logger.warning(
                    "Model %s is not available; using loaded model %s",
                    preferred,
                    available[0],
                )
            return available[0]
        raise OllamaUnavailableError(
            "No models are available from the provider. Load a model and try again."
        )

    def chat(self, messages: list[dict], model: str | None = None,
             temperature: float | None = None, max_tokens: int | None = None,
             response_style: str = "balanced", memory_context: str = "",
             thinking_effort: str = "max") -> str:

        selected_model = model or self.model or self.resolve_model()

        payload = build_chat_payload(
            messages=messages,
            model=selected_model,
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
            logger.error("Could not connect to model server at %s", OLLAMA_CHAT_URL)
            raise OllamaUnavailableError(
                f"Could not reach the model server at {OLLAMA_CHAT_URL}. Is its API running?"
            ) from exc
        except requests.exceptions.Timeout as exc:
            raise OllamaUnavailableError("The model server timed out while generating a response.") from exc
        except requests.exceptions.HTTPError as exc:
            detail = exc.response.text if exc.response is not None else str(exc)
            # Sanitize image-related errors
            if "image" in detail.lower():
                detail = "The model cannot process images. Text-only messages only."
            raise OllamaUnavailableError(f"The model server returned an error: {detail}") from exc

        try:
            data = response.json()
        except (json.JSONDecodeError, requests.exceptions.JSONDecodeError) as exc:
            raise OllamaUnavailableError("The model server returned invalid JSON.") from exc

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
                f"Could not reach the model server at {OLLAMA_TAGS_URL}. Is its API running?"
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise OllamaUnavailableError(f"The model server returned an error: {exc}") from exc

        try:
            data = response.json()
        except (json.JSONDecodeError, requests.exceptions.JSONDecodeError) as exc:
            raise OllamaUnavailableError("The model server returned invalid JSON for the model list.") from exc

        if not isinstance(data, dict):
            raise OllamaUnavailableError("The model server returned an invalid model list.")
        models = data.get("models" if LLM_USE_NATIVE_OLLAMA else "data")
        if not isinstance(models, list) or any(not isinstance(item, dict) for item in models):
            raise OllamaUnavailableError("The model server returned an invalid model list.")
        return [item for item in models if isinstance((item.get("name") or item.get("model")) if LLM_USE_NATIVE_OLLAMA else item.get("id"), str)]
