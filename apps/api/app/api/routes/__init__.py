"""API route registration.

All versioned sub-routers are mounted here and included by ``app.main``.
"""

from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.documents import router as documents_router
from app.api.routes.hr import router as hr_router
from app.api.routes.knowledge import router as knowledge_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(knowledge_router)
api_router.include_router(chat_router)
api_router.include_router(analytics_router)
api_router.include_router(documents_router)
api_router.include_router(hr_router)
api_router.include_router(admin_router)
