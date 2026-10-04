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


STYLE_PROMPTS = {
    "balanced": "Use balanced detail.",
    "concise": "Be very short.",
    "detailed": "Be thorough.",
}

EFFORT_PROMPTS = {
    "low": "Answer efficiently, using only the reasoning needed for the task.",
    "medium": "Think through the main steps and check the answer before responding.",
    "high": "Reason carefully, check assumptions and edge cases, then give a clear answer.",
    "max": (
        "Use maximum reasoning effort for difficult tasks: plan, compare approaches, and verify the result. "
        "Keep private reasoning internal and present clear conclusions with a concise explanation."
    ),
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
    thinking_effort: str = "max",
) -> dict:
    effort = thinking_effort if thinking_effort in EFFORT_PROMPTS else "max"
    memory_block = f"\n\n{memory_context}" if memory_context else ""
    system_prompt = (
        f"{SYSTEM_PROMPT} {_current_date_context()} "
        f"{STYLE_PROMPTS.get(response_style, STYLE_PROMPTS['balanced'])} "
        f"{EFFORT_PROMPTS[effort]}{memory_block}"
    )

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
            "messages": [{"role": "system", "content": system_prompt}] + safe_messages,
            "stream": stream,
            "options": options,
            "think": effort != "low",
            "keep_alive": OLLAMA_KEEP_ALIVE,
        }
    else:
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt}] + safe_messages,
            "stream": stream,
            "max_tokens": clamp_tokens(max_tokens, model),
            "reasoning_effort": effort,
        }
        if temperature is not None:
            payload["temperature"] = temperature
    return payload
