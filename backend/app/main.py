import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.chat import router as chat_router
from app.api.files import router as files_router
from app.api.projects import router as projects_router
from app.core.config import CORS_ORIGINS, DEBUG
from app.database.database import init_db
from app.services.ollama import OllamaUnavailableError

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("localgpt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("LocalGPT backend started")
    yield
    logger.info("LocalGPT backend shutting down")


app = FastAPI(
    title="LocalGPT",
    version="1.1",
    lifespan=lifespan,
)

# CORS: if allow_origins is ["*"], the spec requires allow_credentials=False
has_wildcard = "*" in CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if not has_wildcard else ["*"],
    allow_credentials=not has_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"],
)


@app.exception_handler(OllamaUnavailableError)
async def ollama_unavailable_handler(request: Request, exc: OllamaUnavailableError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


app.include_router(chat_router)
app.include_router(files_router)
app.include_router(projects_router)


@app.get("/")
def home():
    return {"status": "running"}
