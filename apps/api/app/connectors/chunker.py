"""Default chunking service – splits raw documents into embedding-ready chunks.

Strategy: recursive text splitting at paragraph, then sentence boundaries.
Target chunk size is ~512 tokens (≈ 2048 characters at 4 chars/token).
Each chunk carries a context header so the embedding model retains document
provenance even without the surrounding context.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from app.services.types import ChunkType, ConnectorType, DocumentChunk, RawDocument

logger = logging.getLogger(__name__)

# ── Tuning parameters ────────────────────────────────────────────────────────

# Target max characters per chunk (≈ 512 tokens × 4 chars/token)
_MAX_CHUNK_CHARS = 2048
# Overlap in characters between adjacent chunks (≈ 10 % of chunk size)
_OVERLAP_CHARS = 200
# Minimum chunk size – discard smaller fragments
_MIN_CHUNK_CHARS = 80


# ── Splitting helpers ────────────────────────────────────────────────────────


def _split_paragraphs(text: str) -> list[str]:
    """Split on blank lines (paragraph boundary)."""
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]


def _split_sentences(text: str) -> list[str]:
    """Naively split on sentence-ending punctuation followed by whitespace."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _merge_with_overlap(
    pieces: list[str],
    max_chars: int,
    overlap_chars: int,
) -> list[str]:
    """Merge short pieces into chunks up to max_chars, with character-level overlap.

    Args:
        pieces: Pre-split text segments (sentences or paragraphs).
        max_chars: Hard upper bound on chunk length.
        overlap_chars: How many characters to carry forward from the previous chunk.

    Returns:
        List of chunk strings.
    """
    chunks: list[str] = []
    current_parts: list[str] = []
    current_len = 0

    for piece in pieces:
        piece_len = len(piece)

        # If adding this piece would overflow, flush the current chunk
        if current_len + piece_len + 1 > max_chars and current_parts:
            chunk_text = " ".join(current_parts)
            chunks.append(chunk_text)

            # Carry overlap: take the tail of the flushed chunk
            overlap_text = chunk_text[-overlap_chars:] if overlap_chars else ""
            current_parts = [overlap_text] if overlap_text else []
            current_len = len(overlap_text)

        current_parts.append(piece)
        current_len += piece_len + 1  # +1 for the joining space

    # Flush the last partial chunk
    if current_parts:
        chunks.append(" ".join(current_parts))

    return chunks


def _recursive_split(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Two-level recursive splitter: paragraphs → sentences → hard truncation."""
    if len(text) <= max_chars:
        return [text]

    # Level 1: split into paragraphs
    paragraphs = _split_paragraphs(text)
    if len(paragraphs) > 1:
        merged = _merge_with_overlap(paragraphs, max_chars, overlap_chars)
        # Recursively split any paragraph that is still too long
        result: list[str] = []
        for chunk in merged:
            result.extend(_recursive_split(chunk, max_chars, overlap_chars))
        return result

    # Level 2: split into sentences
    sentences = _split_sentences(text)
    if len(sentences) > 1:
        merged = _merge_with_overlap(sentences, max_chars, overlap_chars)
        result = []
        for chunk in merged:
            result.extend(_recursive_split(chunk, max_chars, overlap_chars))
        return result

    # Level 3: hard character split (no good boundaries found)
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunks.append(text[start:end])
        start = end - overlap_chars if end < len(text) else end
    return chunks


def _estimate_tokens(text: str) -> int:
    """Rough token count estimate: 1 token ≈ 4 characters."""
    return max(1, len(text) // 4)


def _chunk_id(source_id: str, chunk_index: int) -> str:
    """Deterministic chunk identifier: sha256(source_id + chunk_index)."""
    raw = f"{source_id}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _context_header(title: str, source_type: ConnectorType) -> str:
    """Short provenance header prepended to each chunk."""
    return f"[{title}] [{source_type.value}]\n"


def _detect_chunk_type(content: str) -> ChunkType:
    """Heuristically classify chunk content."""
    stripped = content.strip()
    if stripped.startswith("```") or stripped.startswith("    "):
        return ChunkType.CODE
    if stripped.startswith("|") and " | " in stripped:
        return ChunkType.TABLE
    return ChunkType.TEXT


# ── Service class ────────────────────────────────────────────────────────────


class DefaultChunkingService:
    """Splits a RawDocument into fixed-size, overlapping DocumentChunks."""

    def __init__(
        self,
        max_chunk_chars: int = _MAX_CHUNK_CHARS,
        overlap_chars: int = _OVERLAP_CHARS,
        min_chunk_chars: int = _MIN_CHUNK_CHARS,
    ) -> None:
        self._max_chunk_chars = max_chunk_chars
        self._overlap_chars = overlap_chars
        self._min_chunk_chars = min_chunk_chars

    async def chunk(self, document: RawDocument) -> list[DocumentChunk]:
        """Split *document* into embedding-ready DocumentChunks.

        Each chunk's content is prefixed with a context header so that the
        embedding model retains document provenance.

        Args:
            document: The source document to split.

        Returns:
            Ordered list of DocumentChunk objects (at least one per non-empty document).
        """
        if not document.content.strip():
            logger.debug("Skipping empty document %s", document.source_id)
            return []

        header = _context_header(document.title, document.source_type)
        # Reserve header length so chunks with header stay within limits
        effective_max = max(self._max_chunk_chars - len(header), 200)

        raw_chunks = _recursive_split(
            document.content,
            effective_max,
            self._overlap_chars,
        )

        chunks: list[DocumentChunk] = []
        for idx, raw in enumerate(raw_chunks):
            raw = raw.strip()
            if len(raw) < self._min_chunk_chars:
                logger.debug(
                    "Dropping short chunk %d for %s (len=%d)",
                    idx,
                    document.source_id,
                    len(raw),
                )
                continue

            content_with_header = f"{header}{raw}"
            extra_meta: dict[str, Any] = {
                **document.metadata,
                "title": document.title,
                "url": document.url,
            }

            chunks.append(
                DocumentChunk(
                    chunk_id=_chunk_id(document.source_id, idx),
                    document_source_id=document.source_id,
                    source_type=document.source_type,
                    content=content_with_header,
                    chunk_type=_detect_chunk_type(raw),
                    chunk_index=idx,
                    token_count=_estimate_tokens(content_with_header),
                    metadata=extra_meta,
                )
            )

        if not chunks and document.content.strip():
            # Fallback: emit the whole document as one chunk (truncated)
            raw = document.content[: self._max_chunk_chars].strip()
            content_with_header = f"{header}{raw}"
            chunks.append(
                DocumentChunk(
                    chunk_id=_chunk_id(document.source_id, 0),
                    document_source_id=document.source_id,
                    source_type=document.source_type,
                    content=content_with_header,
                    chunk_type=ChunkType.TEXT,
                    chunk_index=0,
                    token_count=_estimate_tokens(content_with_header),
                    metadata={**document.metadata, "title": document.title},
                )
            )

        logger.debug("Chunked document %s into %d chunks", document.source_id, len(chunks))
        return chunks
