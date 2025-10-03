from fastapi import FastAPI
from backend.app.database import init_db
from backend.app.routers import documents_router, tags_router, permissions_router
import uvicorn


async def lifespan(app: FastAPI):
    # Create tables
    init_db()
    yield

app = FastAPI(title="Document Repository", lifespan=lifespan)

# include routers
app.include_router(documents_router, prefix="/documents", tags=["documents"])
app.include_router(tags_router, prefix="/tags", tags=["tags"])
app.include_router(permissions_router, prefix="/permissions", tags=["permissions"])

@app.get("/")
def index():
    return {"message": "Welcome to the Document Repository API"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload="true")