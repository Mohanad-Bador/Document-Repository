from backend.app.routers.documents import router as documents_router
from backend.app.routers.tags import router as tags_router
from backend.app.routers.permissions import router as permissions_router
from backend.app.routers.auth import router as auth_router
from backend.app.routers.admin import router as admin_router

__all__ = ["documents_router", "tags_router", "permissions_router", "auth_router", "admin_router"]