"""Text chunking service for the ingestion pipeline.

Splits raw documents into fixed-size, overlapping DocumentChunks that
are ready for embedding.  The strategy is:

1. Detect and preserve code blocks (fenced ``` ... ```) and Markdown tables
   as opaque single chunks with their respective ChunkType.
2. For prose, apply a two-level recursive split:
   paragraph boundaries first, then sentence boundaries.
3. Merge fragments with character-level overlap into target-sized chunks.
4. Prepend a contextual header to every chunk so the embedding model retains
   document provenance even in isolation.
5. Generate deterministic chunk_id values (SHA-256 truncated to 16 hex chars)
   so that re-ingestion is idempotent.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from app.services.types import ChunkType, ConnectorType, DocumentChunk, RawDocument

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuning parameters
# ---------------------------------------------------------------------------

# Target max characters per body (≈ 500 tokens × 4 chars/token)
_TARGET_CHUNK_CHARS = 2000
# Character overlap carried into the next chunk (≈ 10 % of target)
_OVERLAP_CHARS = 200
# Fragments smaller than this are discarded (noise reduction)
_MIN_CHUNK_CHARS = 80


# ---------------------------------------------------------------------------
# Chunk ID
# ---------------------------------------------------------------------------


def _make_chunk_id(source_id: str, chunk_index: int) -> str:
    """Return a 16-character deterministic hex ID.

    Args:
        source_id: The source system identifier of the parent document.
        chunk_index: Zero-based position of the chunk in the document.

    Returns:
        First 16 hex characters of SHA-256(``source_id:chunk_index``).
    """
    raw = f"{source_id}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Context header
# ---------------------------------------------------------------------------


def _context_header(title: str, source_type: ConnectorType) -> str:
    """Build the provenance header that is prepended to every chunk body.

    Format matches the spec exactly so that retrieval queries can rely on a
    stable prefix structure.

    Args:
        title: Human-readable document title.
        source_type: The connector that produced the document.

    Returns:
        Multi-line header string ending with a blank line.
    """
    return f"Title: {title}\nSource: {source_type}\n\n"


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def _estimate_tokens(text: str) -> int:
    """Approximate token count using the 4-chars-per-token heuristic.

    Args:
        text: The string to estimate.

    Returns:
        Positive integer (minimum 1).
    """
    return max(1, len(text) // 4)


# ---------------------------------------------------------------------------
# Special-block detection
# ---------------------------------------------------------------------------

# Regex: fenced code block (``` ... ```)
_CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
# Regex: a run of Markdown table rows (lines starting with |)
_TABLE_BLOCK_RE = re.compile(r"(?:(?:\|[^\n]*\|?\n)+)", re.MULTILINE)


def _detect_chunk_type(body: str) -> ChunkType:
    """Classify the dominant content type of a chunk body.

    Checked in priority order: code > table > text.

    Args:
        body: The raw text body of the chunk (without the context header).
            Both the original (un-stripped) and stripped forms are examined
            so that indented code blocks are correctly identified even when
            the body starts with leading whitespace.

    Returns:
        The most appropriate :class:`ChunkType` value.
    """
    stripped = body.strip()
    # Fenced code block: stripped starts with ``` (leading whitespace removed)
    if stripped.startswith("```"):
        return ChunkType.CODE
    # Indented code block: original body (not stripped) starts with 4 spaces
    if body.startswith("    "):
        return ChunkType.CODE
    if stripped.startswith("|") and " | " in stripped:
        return ChunkType.TABLE
    return ChunkType.TEXT


# ---------------------------------------------------------------------------
# Text-splitting helpers
# ---------------------------------------------------------------------------


def _split_paragraphs(text: str) -> list[str]:
    """Split on blank lines (paragraph boundary).

    Args:
        text: The input text.

    Returns:
        Non-empty paragraph strings with surrounding whitespace stripped.
    """
    return [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]


def _split_sentences(text: str) -> list[str]:
    """Split on sentence-ending punctuation followed by whitespace.

    The regex uses a zero-width lookbehind so the punctuation is retained
    at the end of the preceding sentence fragment.

    Args:
        text: The input text.

    Returns:
        Non-empty sentence fragments.
    """
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def _merge_with_overlap(
    pieces: list[str],
    max_chars: int,
    overlap_chars: int,
) -> list[str]:
    """Merge short pieces into chunks up to *max_chars* with character overlap.

    When flushing a full chunk, the last *overlap_chars* characters are
    prepended to the next chunk to maintain reading continuity.

    Args:
        pieces: Pre-split text segments (paragraphs or sentences).
        max_chars: Hard upper bound on the character length of a chunk.
        overlap_chars: Characters carried forward from the previous chunk.

    Returns:
        List of merged chunk strings.
    """
    chunks: list[str] = []
    current_parts: list[str] = []
    current_len = 0

    for piece in pieces:
        piece_len = len(piece)

        # Flush when adding this piece would overflow
        if current_len + piece_len + 1 > max_chars and current_parts:
            chunk_text = " ".join(current_parts)
            chunks.append(chunk_text)

            overlap_text = chunk_text[-overlap_chars:] if overlap_chars else ""
            current_parts = [overlap_text] if overlap_text else []
            current_len = len(overlap_text)

        current_parts.append(piece)
        current_len += piece_len + 1  # +1 for the joining space

    if current_parts:
        chunks.append(" ".join(current_parts))

    return chunks


def _recursive_split(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    """Two-level recursive splitter: paragraphs -> sentences -> hard truncation.

    Args:
        text: Input text to split.
        max_chars: Maximum characters per output chunk.
        overlap_chars: Overlap characters carried into the next chunk.

    Returns:
        List of text segments, each at most *max_chars* characters.
    """
    if len(text) <= max_chars:
        return [text]

    # Level 1: paragraph boundaries
    paragraphs = _split_paragraphs(text)
    if len(paragraphs) > 1:
        merged = _merge_with_overlap(paragraphs, max_chars, overlap_chars)
        result: list[str] = []
        for chunk in merged:
            result.extend(_recursive_split(chunk, max_chars, overlap_chars))
        return result

    # Level 2: sentence boundaries
    sentences = _split_sentences(text)
    if len(sentences) > 1:
        merged = _merge_with_overlap(sentences, max_chars, overlap_chars)
        result = []
        for chunk in merged:
            result.extend(_recursive_split(chunk, max_chars, overlap_chars))
        return result

    # Level 3: hard character split (no usable boundaries)
    hard_chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        hard_chunks.append(text[start:end])
        start = end - overlap_chars if end < len(text) else end
    return hard_chunks


# ---------------------------------------------------------------------------
# Special-block extraction
# ---------------------------------------------------------------------------


def _extract_special_blocks(
    text: str,
) -> tuple[list[tuple[str, ChunkType]], str]:
    """Extract code blocks and tables, replacing them with placeholders.

    This ensures that code and table blocks are never split mid-way during
    the paragraph/sentence splitting phase.

    Args:
        text: The raw document content.

    Returns:
        A 2-tuple of:
        - ``blocks``: list of (block_text, ChunkType) in extraction order.
        - ``remainder``: the original text with blocks replaced by
          ``__BLOCK_{n}__`` markers.
    """
    blocks: list[tuple[str, ChunkType]] = []

    def _replace(match: re.Match[str], chunk_type: ChunkType) -> str:
        idx = len(blocks)
        blocks.append((match.group(0), chunk_type))
        return f"\n\n__BLOCK_{idx}__\n\n"

    # Extract fenced code blocks first (higher priority)
    remainder = _CODE_BLOCK_RE.sub(
        lambda m: _replace(m, ChunkType.CODE),
        text,
    )
    # Then extract Markdown tables
    remainder = _TABLE_BLOCK_RE.sub(
        lambda m: _replace(m, ChunkType.TABLE),
        remainder,
    )

    return blocks, remainder


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------


class TextChunkingService:
    """Splits a :class:`RawDocument` into embedding-ready :class:`DocumentChunk` objects.

    Design:
    - Code blocks and Markdown tables are extracted verbatim and emitted as
      standalone chunks with the appropriate :class:`ChunkType`.
    - All other text is split recursively by paragraph, then sentence, then
      hard character boundary.
    - Each chunk body is prefixed with a contextual header so the embedding
      model retains document provenance.
    - Chunk IDs are deterministic: SHA-256(``source_id:index``)[:16].
    - Approximate token counts use the 4-chars/token heuristic.
    """

    def __init__(
        self,
        target_chunk_chars: int = _TARGET_CHUNK_CHARS,
        overlap_chars: int = _OVERLAP_CHARS,
        min_chunk_chars: int = _MIN_CHUNK_CHARS,
    ) -> None:
        """Initialise the chunking service with tunable parameters.

        Args:
            target_chunk_chars: Approximate maximum characters per chunk body
                (before the header is prepended).  Default 2000 ≈ 500 tokens.
            overlap_chars: Characters carried forward into the next chunk.
                Default 200 (≈ 10 % of target).
            min_chunk_chars: Fragments shorter than this are silently discarded.
                Default 80.
        """
        self._target_chunk_chars = target_chunk_chars
        self._overlap_chars = overlap_chars
        self._min_chunk_chars = min_chunk_chars

    async def chunk(self, document: RawDocument) -> list[DocumentChunk]:
        """Split *document* into an ordered list of :class:`DocumentChunk` objects.

        Processing steps:
        1. Return early for empty documents.
        2. Extract code blocks and tables, replacing them with markers.
        3. Recursively split the remaining prose text.
        4. Re-inject the special blocks at the correct positions.
        5. Filter fragments that are too short.
        6. Prepend the contextual header and build DocumentChunk instances.
        7. Emit a single fallback chunk if all fragments were filtered out.

        Args:
            document: The raw document fetched by a connector.

        Returns:
            Ordered list of :class:`DocumentChunk` instances (possibly empty for
            truly empty documents).
        """
        content = document.content.strip()
        if not content:
            logger.debug("Skipping empty document source_id=%s", document.source_id)
            return []

        header = _context_header(document.title, document.source_type)
        # Reserve header length so chunks (header + body) stay within target
        effective_max = max(self._target_chunk_chars - len(header), 200)

        # --- Step 1: extract special blocks ------------------------------------
        special_blocks, prose_remainder = _extract_special_blocks(content)

        # --- Step 2: split the prose remainder --------------------------------
        # Markers (__BLOCK_N__) are very short, so they survive splitting intact.
        prose_segments = _recursive_split(prose_remainder, effective_max, self._overlap_chars)

        # --- Step 3: re-expand markers ----------------------------------------
        # Walk each prose segment and split it on __BLOCK_N__ markers so that
        # special blocks (code, tables) are always emitted as distinct entries
        # with their correct ChunkType, even when a short document causes the
        # splitter to keep markers inside larger prose segments.
        expanded: list[tuple[str, ChunkType]] = []
        marker_re = re.compile(r"__BLOCK_(\d+)__")

        for segment in prose_segments:
            # Split the segment on block markers; alternating parts are:
            #   [prose, block_idx, prose, block_idx, ...] from re.split with groups
            parts = marker_re.split(segment)
            # parts = [text_before, idx_str, text_after, idx_str, ...]
            i = 0
            while i < len(parts):
                text_part = parts[i].strip()
                if text_part:
                    expanded.append((text_part, _detect_chunk_type(text_part)))
                i += 1
                if i < len(parts):
                    # parts[i] is the captured group (block index digit string)
                    block_idx = int(parts[i])
                    block_text, block_type = special_blocks[block_idx]
                    expanded.append((block_text, block_type))
                    i += 1

        # --- Step 4: build DocumentChunk objects ------------------------------
        chunks: list[DocumentChunk] = []
        chunk_index = 0

        for body, chunk_type in expanded:
            body = body.strip()
            if len(body) < self._min_chunk_chars:
                logger.debug(
                    "Dropping short fragment (len=%d) for source_id=%s",
                    len(body),
                    document.source_id,
                )
                continue

            content_with_header = f"{header}{body}"
            extra_meta: dict[str, Any] = {
                **document.metadata,
                "title": document.title,
                "url": document.url,
            }

            chunks.append(
                DocumentChunk(
                    chunk_id=_make_chunk_id(document.source_id, chunk_index),
                    document_source_id=document.source_id,
                    source_type=document.source_type,
                    content=content_with_header,
                    chunk_type=chunk_type,
                    chunk_index=chunk_index,
                    token_count=_estimate_tokens(content_with_header),
                    metadata=extra_meta,
                )
            )
            chunk_index += 1

        # --- Step 5: fallback for non-empty documents that produced no chunks -
        if not chunks and content:
            body = content[: self._target_chunk_chars].strip()
            content_with_header = f"{header}{body}"
            chunks.append(
                DocumentChunk(
                    chunk_id=_make_chunk_id(document.source_id, 0),
                    document_source_id=document.source_id,
                    source_type=document.source_type,
                    content=content_with_header,
                    chunk_type=ChunkType.TEXT,
                    chunk_index=0,
                    token_count=_estimate_tokens(content_with_header),
                    metadata={**document.metadata, "title": document.title, "url": document.url},
                )
            )

        logger.debug(
            "Chunked source_id=%s into %d chunk(s)",
            document.source_id,
            len(chunks),
        )
        return chunks
