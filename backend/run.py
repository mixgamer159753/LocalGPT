import uvicorn

from app.core.config import BACKEND_HOST, BACKEND_PORT


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
    )
