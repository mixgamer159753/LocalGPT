import datetime
import re

from app.core.config import (
    DEFAULT_MAX_TOKENS,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_NUM_CTX,
    OLLAMA_NUM_THREAD,
    QWEN_MAX_TOKENS,
    LLM_USE_NATIVE_OLLAMA,
)

def _current_date_context() -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    return f"Today is {now.strftime('%A, %B %d, %Y')} (UTC)."

SYSTEM_PROMPT = (
    "You are LocalGPT, a private AI assistant. Be direct and natural.\n\n"
    "Memory is under 'Here is what you know about the user:' — use it naturally, "
    "never mention it explicitly.\n\n"
    "Web search is automatic. Do NOT invoke any tools, functions, or API calls. "
    "Never output XML/function-call tags like <invoke> or <tool>.\n\n"
    "When web research is provided below, it contains current information. Use it "
    "over your training data. Cite sources with complete https:// URLs."
)


QWEN_SPEED_PROMPT = "Be concise. Skip thinking aloud."

STYLE_PROMPTS = {
    "balanced": "Use balanced detail.",
    "concise": "Be very short.",
    "detailed": "Be thorough.",
}


def is_qwen3_model(model: str) -> bool:
    return model.lower().startswith("qwen3")


def clamp_tokens(max_tokens: int | None, model: str | None = None) -> int:
    default = QWEN_MAX_TOKENS if model and is_qwen3_model(model) else DEFAULT_MAX_TOKENS
    requested = max_tokens or default
    if model and is_qwen3_model(model):
        requested = min(requested, QWEN_MAX_TOKENS)
    return min(max(requested, 1), 21000)


def sanitize_messages(messages: list[dict]) -> list[dict]:
    result = []
    for m in messages:
        if m.get("role") not in {"user", "assistant"}:
            continue
        content = m.get("content")
        if not content:
            continue
        if isinstance(content, list):
            # pass through OpenAI-format content arrays (text + images)
            result.append({"role": m["role"], "content": content})
        elif isinstance(content, str) and content.strip():
            result.append({"role": m["role"], "content": content})
    return result


def optimize_messages_for_model(messages: list[dict], model: str) -> list[dict]:
    sanitized = sanitize_messages(messages)
    return sanitized


def strip_think_blocks(content: str) -> str:
    return re.sub(r"<think>.*?</think>\s*", "", content, flags=re.IGNORECASE | re.DOTALL)


def build_chat_payload(
    messages: list[dict],
    model: str,
    stream: bool,
    temperature: float | None = None,
    max_tokens: int | None = None,
    response_style: str = "balanced",
    memory_context: str = "",
) -> dict:
    memory_block = f"\n\n{memory_context}" if memory_context else ""
    system_prompt = f"{SYSTEM_PROMPT} {_current_date_context()} {STYLE_PROMPTS.get(response_style, STYLE_PROMPTS['balanced'])}{memory_block}"
    if is_qwen3_model(model):
        system_prompt = f"{system_prompt} {QWEN_SPEED_PROMPT}"

    safe_messages = sanitize_messages(messages)
    if LLM_USE_NATIVE_OLLAMA:
        options = {
            "num_predict": clamp_tokens(max_tokens, model),
            "num_ctx": OLLAMA_NUM_CTX,
        }
        if temperature is not None:
            options["temperature"] = temperature
        if OLLAMA_NUM_THREAD:
            options["num_thread"] = int(OLLAMA_NUM_THREAD)

        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt}] + optimize_messages_for_model(safe_messages, model),
            "stream": stream,
            "options": options,
            "keep_alive": OLLAMA_KEEP_ALIVE,
        }
    else:
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt}] + safe_messages,
            "stream": stream,
            "max_tokens": clamp_tokens(max_tokens, model),
        }
        if temperature is not None:
            payload["temperature"] = temperature
    return payload
