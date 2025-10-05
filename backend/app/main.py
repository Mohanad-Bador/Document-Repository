import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.app.database import init_db
from backend.app.routers import documents_router, tags_router, permissions_router, auth_router, admin_router

async def lifespan(app: FastAPI):
    # Create tables
    init_db()
    yield

app = FastAPI(title="Document Repository", lifespan=lifespan)

# enable CORS for local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500", "http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# mount frontend static build if present (serves index.html)
frontend_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "static-site"))
if os.path.isdir(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir, html=True), name="static")

# include routers
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(documents_router, prefix="/documents", tags=["documents"])
app.include_router(tags_router, prefix="/tags", tags=["tags"])
app.include_router(permissions_router, prefix="/permissions", tags=["permissions"])

@app.get("/", include_in_schema=False)
def index():
    # serve the frontend dashboard.html if it exists under the mounted frontend_dir
    index_path = os.path.join(frontend_dir, "dashboard.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Welcome to the Document Repository API"}