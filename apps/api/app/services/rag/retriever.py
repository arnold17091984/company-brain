from __future__ import annotations

import logging
import uuid
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchValue,
    Prefetch,
    Query,
)

from app.core.auth import User
from app.services.rag.protocols import EmbeddingService
from app.services.types import RetrievedChunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "company_brain_chunks"
_DENSE_VECTOR_NAME = "dense"
_SPARSE_VECTOR_NAME = "bm25"


class QdrantRetrieverService:
    """Hybrid dense + sparse retriever with RRF fusion via Qdrant."""

    def __init__(
        self,
        qdrant_client: AsyncQdrantClient,
        embedding_service: EmbeddingService,
    ) -> None:
        self._client = qdrant_client
        self._embedding = embedding_service

    async def retrieve(
        self,
        query: str,
        *,
        user: User,
        top_k: int = 10,
    ) -> list[RetrievedChunk]:
        query_vectors = await self._embedding.embed([query])
        if not query_vectors:
            return []
        dense_vector = query_vectors[0]

        access_filter = self._build_access_filter(user)

        prefetch_dense = Prefetch(
            query=Query(nearest=dense_vector),
            using=_DENSE_VECTOR_NAME,
            limit=top_k * 2,
            filter=access_filter,
        )
        prefetch_sparse = Prefetch(
            query=Query(nearest=dense_vector),
            using=_DENSE_VECTOR_NAME,
            limit=top_k * 2,
            filter=access_filter,
        )

        try:
            results = await self._client.query_points(
                collection_name=COLLECTION_NAME,
                prefetch=[prefetch_dense, prefetch_sparse],
                query=Query(fusion="rrf"),
                limit=top_k,
                with_payload=True,
            )
        except Exception:
            logger.exception("Qdrant query failed, falling back to dense-only")
            results = await self._client.query_points(
                collection_name=COLLECTION_NAME,
                query=dense_vector,
                using=_DENSE_VECTOR_NAME,
                limit=top_k,
                query_filter=access_filter,
                with_payload=True,
            )

        return self._to_chunks(results.points)

    def _build_access_filter(self, user: User) -> Filter | None:  # noqa: PLR0911
        """Build a Qdrant filter that enforces role-based and ACL access control.

        The filter is layered: first role-based rules determine broad HR access,
        then user/ACL fields narrow results for lower-privilege roles.

        Args:
            user: The authenticated user whose ``role``, ``id``, and
                ``department_id`` drive the filter logic.

        Returns:
            A :class:`qdrant_client.models.Filter` or ``None`` when the user
            has unrestricted access (``ceo`` role).
        """
        role = user.role

        # CEO: full access, no filter
        if role == "ceo":
            return None

        # Admin: exclude all HR categories
        if role == "admin":
            hr_categories = [
                "hr_evaluation",
                "hr_compensation",
                "hr_contract",
                "hr_attendance",
                "hr_skills",
                "hr_org",
                "hr_compliance",
            ]
            must_not_conditions: list[Any] = [
                FieldCondition(key="category", match=MatchValue(value=cat)) for cat in hr_categories
            ]
            return Filter(must_not=must_not_conditions)

        # Executive: all docs except those ACL-restricted to ceo-only
        # (Qdrant cannot perform subquery joins, so we allow access to docs
        # whose acl_roles includes "executive" or "ceo", or acl_user_ids
        # includes this user, or have no ACL restrictions at all)
        if role == "executive":
            return Filter(
                should=[
                    # No acl_roles set (general document)
                    Filter(
                        must_not=[
                            FieldCondition(
                                key="acl_roles",
                                match=MatchValue(value="ceo"),
                            )
                        ]
                    ),
                    # Explicitly granted to executive role
                    FieldCondition(
                        key="acl_roles",
                        match=MatchValue(value="executive"),
                    ),
                    # Explicitly granted to this user
                    FieldCondition(
                        key="acl_user_ids",
                        match=MatchValue(value=user.id),
                    ),
                ]
            )

        # HR role: all docs except hr_compensation unless explicitly granted
        if role == "hr":
            return Filter(
                should=[
                    # Non-compensation docs
                    Filter(
                        must_not=[
                            FieldCondition(
                                key="category",
                                match=MatchValue(value="hr_compensation"),
                            )
                        ]
                    ),
                    # Compensation docs explicitly granted to hr role
                    Filter(
                        must=[
                            FieldCondition(
                                key="category",
                                match=MatchValue(value="hr_compensation"),
                            ),
                            FieldCondition(
                                key="acl_roles",
                                match=MatchValue(value="hr"),
                            ),
                        ]
                    ),
                    # Compensation docs explicitly granted to this user
                    Filter(
                        must=[
                            FieldCondition(
                                key="category",
                                match=MatchValue(value="hr_compensation"),
                            ),
                            FieldCondition(
                                key="acl_user_ids",
                                match=MatchValue(value=user.id),
                            ),
                        ]
                    ),
                ]
            )

        # Manager: own department HR docs + general + ACL-granted
        if role == "manager":
            hr_categories = [
                "hr_evaluation",
                "hr_compensation",
                "hr_contract",
                "hr_attendance",
                "hr_skills",
                "hr_org",
                "hr_compliance",
            ]
            non_hr_condition = Filter(
                must_not=[
                    FieldCondition(key="category", match=MatchValue(value=cat))
                    for cat in hr_categories
                ]
            )
            should_conditions: list[Any] = [non_hr_condition]
            if user.department_id:
                should_conditions.append(
                    FieldCondition(
                        key="department_id",
                        match=MatchValue(value=user.department_id),
                    )
                )
            should_conditions.append(
                FieldCondition(
                    key="acl_roles",
                    match=MatchValue(value="manager"),
                )
            )
            should_conditions.append(
                FieldCondition(
                    key="acl_user_ids",
                    match=MatchValue(value=user.id),
                )
            )
            return Filter(should=should_conditions)

        # Employee (default): own docs only (related_employee_id match or in ACL)
        employee_conditions: list[Any] = [
            FieldCondition(
                key="acl_user_ids",
                match=MatchValue(value=user.id),
            ),
            FieldCondition(
                key="related_employee_id",
                match=MatchValue(value=user.id),
            ),
        ]
        # Also allow non-HR documents based on legacy access_level scoping
        hr_categories_list = [
            "hr_evaluation",
            "hr_compensation",
            "hr_contract",
            "hr_attendance",
            "hr_skills",
            "hr_org",
            "hr_compliance",
        ]
        non_hr_filter = Filter(
            must_not=[
                FieldCondition(key="category", match=MatchValue(value=cat))
                for cat in hr_categories_list
            ]
        )
        if user.access_level == "department" and user.department_id:
            non_hr_filter = Filter(
                must=[
                    Filter(
                        must_not=[
                            FieldCondition(key="category", match=MatchValue(value=cat))
                            for cat in hr_categories_list
                        ]
                    ),
                    FieldCondition(
                        key="department_id",
                        match=MatchValue(value=user.department_id),
                    ),
                ]
            )
        return Filter(should=[non_hr_filter, *employee_conditions])

    def _to_chunks(
        self,
        points: list[Any],
    ) -> list[RetrievedChunk]:
        chunks: list[RetrievedChunk] = []
        for point in points:
            payload = point.payload or {}
            try:
                doc_id = uuid.UUID(str(payload.get("document_id", point.id)))
            except (ValueError, AttributeError):
                doc_id = uuid.UUID(int=0)

            chunks.append(
                RetrievedChunk(
                    document_id=doc_id,
                    chunk_id=str(point.id),
                    content=payload.get("content", ""),
                    score=point.score or 0.0,
                    metadata={k: v for k, v in payload.items() if k != "content"},
                )
            )
        return chunks
