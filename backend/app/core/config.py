import os
from dotenv import load_dotenv

load_dotenv()


def _get_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


# Atomic Chat's OpenAI-compatible API is the default. The legacy variable names
# are retained for existing installations and optional native Ollama support.
LLM_USE_NATIVE_OLLAMA = _get_bool("LLM_USE_NATIVE_OLLAMA", False)
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:1337").rstrip("/")
OLLAMA_CHAT_URL = os.getenv(
    "OLLAMA_URL",
    f"{OLLAMA_HOST}/api/chat" if LLM_USE_NATIVE_OLLAMA else f"{OLLAMA_HOST}/v1/chat/completions",
)
OLLAMA_TAGS_URL = f"{OLLAMA_HOST}/api/tags" if LLM_USE_NATIVE_OLLAMA else f"{OLLAMA_HOST}/v1/models"

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "").strip()

# Where the SQLite database lives (chat history persistence).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./localgpt.db")

# Comma-separated list of allowed frontend origins for CORS.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

# Timeouts (seconds) for talking to the model server.
OLLAMA_CONNECT_TIMEOUT = float(os.getenv("OLLAMA_CONNECT_TIMEOUT", "10"))
OLLAMA_READ_TIMEOUT = float(os.getenv("OLLAMA_READ_TIMEOUT", "300"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "10m")
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "4096"))
OLLAMA_NUM_THREAD = os.getenv("OLLAMA_NUM_THREAD")
# Only used for native Ollama payload (LM Studio ignores these via OpenAI API)

DEFAULT_MAX_TOKENS = int(os.getenv("DEFAULT_MAX_TOKENS", "1536"))
QWEN_MAX_TOKENS = int(os.getenv("QWEN_MAX_TOKENS", "1024"))

DEBUG = _get_bool("DEBUG", False)

# Optional web research layer. When enabled, the backend decides per-message
# whether fresh web context is useful before calling the local model.
WEB_SEARCH_ENABLED = _get_bool("WEB_SEARCH_ENABLED", True)
WEB_SEARCH_CACHE_TTL = int(os.getenv("WEB_SEARCH_CACHE_TTL", "900"))

# When true, eligible queries get a web search after trivial/directive filters.
# When false, only freshness/live/comparison terms trigger a search.
WEB_SEARCH_ALWAYS = _get_bool("WEB_SEARCH_ALWAYS", False)

# Deep search controls how many results to gather and how much page text to read.
# Higher values = more thorough but slower.
WEB_SEARCH_DEEP = _get_bool("WEB_SEARCH_DEEP", True)
WEB_SEARCH_MAX_RESULTS = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "12"))
WEB_SEARCH_MAX_PAGES = int(os.getenv("WEB_SEARCH_MAX_PAGES", "6"))
WEB_SEARCH_DEEP_QUERIES = int(os.getenv("WEB_SEARCH_DEEP_QUERIES", "3"))
WEB_SEARCH_PAGE_TEXT_LIMIT = int(os.getenv("WEB_SEARCH_PAGE_TEXT_LIMIT", "15000"))
WEB_SEARCH_PAGE_HTML_LIMIT = int(os.getenv("WEB_SEARCH_PAGE_HTML_LIMIT", "500000"))

# Google Custom Search API (optional — set both to enable Google search)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GOOGLE_CSE_ID = os.getenv("GOOGLE_CSE_ID", "")
