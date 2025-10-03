from backend.app.routers.documents import router as documents_router
from backend.app.routers.tags import router as tags_router
from backend.app.routers.permissions import router as permissions_router

__all__ = ["documents_router", "tags_router", "permissions_router"]