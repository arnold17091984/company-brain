from __future__ import annotations

import asyncio
import logging

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    PayloadSchemaType,
    SparseIndexParams,
    SparseVectorParams,
    VectorParams,
)

logger = logging.getLogger(__name__)

COLLECTION_NAME = "company_brain_chunks"
_DENSE_DIM = 1024
_DENSE_VECTOR_NAME = "dense"
_SPARSE_VECTOR_NAME = "bm25"


async def ensure_collection(
    client: AsyncQdrantClient,
) -> None:
    """Create the company_brain_chunks collection if it
    does not already exist. Idempotent."""
    collections = await client.get_collections()
    existing = {c.name for c in collections.collections}

    if COLLECTION_NAME in existing:
        logger.info(
            "Collection '%s' already exists, skipping",
            COLLECTION_NAME,
        )
        return

    await client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config={
            _DENSE_VECTOR_NAME: VectorParams(
                size=_DENSE_DIM,
                distance=Distance.COSINE,
            ),
        },
        sparse_vectors_config={
            _SPARSE_VECTOR_NAME: SparseVectorParams(
                index=SparseIndexParams(),
            ),
        },
    )
    logger.info("Created collection '%s'", COLLECTION_NAME)

    for field_name, schema_type in [
        ("access_level", PayloadSchemaType.KEYWORD),
        ("department_id", PayloadSchemaType.KEYWORD),
        ("source_type", PayloadSchemaType.KEYWORD),
    ]:
        await client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name=field_name,
            field_schema=schema_type,
        )
        logger.info(
            "Created payload index: %s (%s)",
            field_name,
            schema_type,
        )


async def _main() -> None:
    from app.core.config import settings

    client = AsyncQdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
    )
    try:
        await ensure_collection(client)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(_main())
