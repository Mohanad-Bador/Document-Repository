from fastapi import FastAPI
from backend.app.database import init_db
from backend.app.routers import documents_router, tags_router, permissions_router, auth_router, admin_router

async def lifespan(app: FastAPI):
    # Create tables
    init_db()
    yield

app = FastAPI(title="Document Repository", lifespan=lifespan)

# include routers
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(documents_router, prefix="/documents", tags=["documents"])
app.include_router(tags_router, prefix="/tags", tags=["tags"])
app.include_router(permissions_router, prefix="/permissions", tags=["permissions"])

@app.get("/")
def index():
    return {"message": "Welcome to the Document Repository API"}