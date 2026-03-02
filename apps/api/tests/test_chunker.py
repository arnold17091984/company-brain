"""Tests for app.services.ingestion.chunker.TextChunkingService.

Covers:
- Normal prose documents split into multiple chunks
- Contextual header format (spec-required prefix)
- Deterministic chunk_id generation
- Code-block detection and preservation as ChunkType.CODE
- Table detection and preservation as ChunkType.TABLE
- Minimum fragment filtering (short fragments are dropped)
- Empty document early-exit
- Fallback single-chunk for documents below the min threshold
- Token count estimation
- Metadata propagation from the source document
"""

from __future__ import annotations

import hashlib

import pytest

from app.services.ingestion.chunker import (
    TextChunkingService,
    _context_header,
    _detect_chunk_type,
    _estimate_tokens,
    _make_chunk_id,
)
from app.services.types import ChunkType, ConnectorType, DocumentChunk, RawDocument

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_doc(
    content: str,
    *,
    source_id: str = "doc-001",
    title: str = "Test Document",
    source_type: ConnectorType = ConnectorType.NOTION,
    url: str = "https://notion.so/test",
    access_level: str = "all",
    metadata: dict | None = None,
) -> RawDocument:
    """Build a minimal RawDocument for testing."""
    import hashlib

    return RawDocument(
        source_type=source_type,
        source_id=source_id,
        title=title,
        content=content,
        content_hash=hashlib.sha256(content.encode()).hexdigest(),
        url=url,
        access_level=access_level,
        metadata=metadata or {},
    )


PROSE_SHORT = "Hello world. This is a test sentence."

PROSE_LONG = "\n\n".join(
    [
        "First paragraph with some text. It contains multiple sentences and is designed to be "
        "long enough to illustrate paragraph splitting behaviour.",
        "Second paragraph about a completely different topic. "
        "It should ideally end up in its own chunk when the document is large enough.",
        "Third paragraph wrapping up the document. "
        "It discusses conclusions and final thoughts on the subject matter at hand.",
    ]
    * 10  # repeat 10x to exceed the chunk size
)

# These constants must produce fragments that exceed the _MIN_CHUNK_CHARS=80
# threshold so that code/table blocks survive the filtering phase and are
# emitted as separate chunks with their correct ChunkType.
CODE_CONTENT = (
    "This document describes a helper function used across the codebase.\n\n"
    "```python\n"
    "def compute_total(items: list[float]) -> float:\n"
    '    """Return the sum of all item values."""\n'
    "    return sum(items)\n"
    "```\n\n"
    "The function above should be imported from the utils module when needed."
)

TABLE_CONTENT = (
    "The following table summarises team assignments for the current sprint.\n\n"
    "| Name  | Role        | Department  |\n"
    "|-------|-------------|-------------|\n"
    "| Alice | Developer   | Engineering |\n"
    "| Bob   | QA Engineer | Quality     |\n"
    "| Carol | Designer    | Product     |\n\n"
    "All assignments are subject to change pending manager approval."
)


# ---------------------------------------------------------------------------
# Unit tests: helper functions
# ---------------------------------------------------------------------------


class TestMakeChunkId:
    def test_returns_16_hex_chars(self) -> None:
        cid = _make_chunk_id("my-source", 0)
        assert len(cid) == 16
        assert all(c in "0123456789abcdef" for c in cid)

    def test_deterministic(self) -> None:
        assert _make_chunk_id("abc", 3) == _make_chunk_id("abc", 3)

    def test_differs_for_different_index(self) -> None:
        assert _make_chunk_id("abc", 0) != _make_chunk_id("abc", 1)

    def test_differs_for_different_source_id(self) -> None:
        assert _make_chunk_id("abc", 0) != _make_chunk_id("xyz", 0)

    def test_matches_sha256_truncation(self) -> None:
        expected = hashlib.sha256(b"src:7").hexdigest()[:16]
        assert _make_chunk_id("src", 7) == expected


class TestContextHeader:
    def test_format_matches_spec(self) -> None:
        header = _context_header("My Doc", ConnectorType.GOOGLE_DRIVE)
        assert header == "Title: My Doc\nSource: google_drive\n\n"

    def test_ends_with_double_newline(self) -> None:
        header = _context_header("X", ConnectorType.TELEGRAM)
        assert header.endswith("\n\n")

    def test_uses_connector_string_value(self) -> None:
        header = _context_header("T", ConnectorType.NOTION)
        assert "notion" in header


class TestEstimateTokens:
    def test_returns_positive_int(self) -> None:
        assert _estimate_tokens("hello") >= 1

    def test_minimum_of_one(self) -> None:
        assert _estimate_tokens("a") == 1

    def test_scales_with_length(self) -> None:
        short = _estimate_tokens("abcd")  # 4 chars -> 1 token
        long = _estimate_tokens("a" * 400)  # 400 chars -> 100 tokens
        assert long > short


class TestDetectChunkType:
    def test_fenced_code_block(self) -> None:
        assert _detect_chunk_type("```python\ncode here\n```") == ChunkType.CODE

    def test_indented_code(self) -> None:
        assert _detect_chunk_type("    indented line") == ChunkType.CODE

    def test_table(self) -> None:
        assert _detect_chunk_type("| col1 | col2 |\n| a | b |") == ChunkType.TABLE

    def test_plain_text(self) -> None:
        assert _detect_chunk_type("Just a normal sentence.") == ChunkType.TEXT


# ---------------------------------------------------------------------------
# Integration tests: TextChunkingService
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestTextChunkingService:
    async def test_empty_document_returns_no_chunks(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc("")
        chunks = await svc.chunk(doc)
        assert chunks == []

    async def test_whitespace_only_returns_no_chunks(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc("   \n\t  ")
        chunks = await svc.chunk(doc)
        assert chunks == []

    async def test_short_document_produces_single_chunk(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT)
        chunks = await svc.chunk(doc)
        assert len(chunks) == 1

    async def test_chunk_contains_contextual_header(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, title="My Title", source_type=ConnectorType.NOTION)
        chunks = await svc.chunk(doc)
        assert chunks[0].content.startswith("Title: My Title\nSource: notion\n\n")

    async def test_long_document_produces_multiple_chunks(self) -> None:
        svc = TextChunkingService(target_chunk_chars=300, overlap_chars=50)
        doc = _make_doc(PROSE_LONG)
        chunks = await svc.chunk(doc)
        assert len(chunks) > 1

    async def test_chunks_are_ordered_by_index(self) -> None:
        svc = TextChunkingService(target_chunk_chars=300, overlap_chars=50)
        doc = _make_doc(PROSE_LONG)
        chunks = await svc.chunk(doc)
        indices = [c.chunk_index for c in chunks]
        assert indices == list(range(len(chunks)))

    async def test_chunk_ids_are_deterministic(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, source_id="stable-id")
        first_run = await svc.chunk(doc)
        second_run = await svc.chunk(doc)
        assert [c.chunk_id for c in first_run] == [c.chunk_id for c in second_run]

    async def test_chunk_id_length_is_16(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT)
        chunks = await svc.chunk(doc)
        for chunk in chunks:
            assert len(chunk.chunk_id) == 16

    async def test_chunk_id_differs_across_indices(self) -> None:
        svc = TextChunkingService(target_chunk_chars=300, overlap_chars=50)
        doc = _make_doc(PROSE_LONG)
        chunks = await svc.chunk(doc)
        chunk_ids = [c.chunk_id for c in chunks]
        # All IDs must be unique
        assert len(set(chunk_ids)) == len(chunk_ids)

    async def test_document_source_id_propagated(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, source_id="unique-src-001")
        chunks = await svc.chunk(doc)
        for chunk in chunks:
            assert chunk.document_source_id == "unique-src-001"

    async def test_source_type_propagated(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, source_type=ConnectorType.TELEGRAM)
        chunks = await svc.chunk(doc)
        for chunk in chunks:
            assert chunk.source_type == ConnectorType.TELEGRAM

    async def test_token_count_positive(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT)
        chunks = await svc.chunk(doc)
        assert all(c.token_count >= 1 for c in chunks)

    async def test_metadata_title_and_url_present(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, title="My Doc", url="https://example.com")
        chunks = await svc.chunk(doc)
        for chunk in chunks:
            assert chunk.metadata["title"] == "My Doc"
            assert chunk.metadata["url"] == "https://example.com"

    async def test_extra_metadata_propagated(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT, metadata={"author": "Alice", "channel": "general"})
        chunks = await svc.chunk(doc)
        for chunk in chunks:
            assert chunk.metadata["author"] == "Alice"
            assert chunk.metadata["channel"] == "general"

    async def test_code_block_detected_as_code_chunk(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(CODE_CONTENT)
        chunks = await svc.chunk(doc)
        chunk_types = {c.chunk_type for c in chunks}
        assert ChunkType.CODE in chunk_types

    async def test_table_detected_as_table_chunk(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(TABLE_CONTENT)
        chunks = await svc.chunk(doc)
        chunk_types = {c.chunk_type for c in chunks}
        assert ChunkType.TABLE in chunk_types

    async def test_prose_chunk_type_is_text(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT)
        chunks = await svc.chunk(doc)
        assert all(c.chunk_type == ChunkType.TEXT for c in chunks)

    async def test_short_fragments_below_min_are_dropped(self) -> None:
        """Fragments shorter than min_chunk_chars must be silently discarded."""
        svc = TextChunkingService(min_chunk_chars=500)
        # Use a moderately sized doc; the single short chunk body should be dropped,
        # triggering the fallback path instead.
        doc = _make_doc("Short text.")
        # With min=500 the normal fragment is too short, but fallback still runs.
        chunks = await svc.chunk(doc)
        # Fallback always produces exactly one chunk.
        assert len(chunks) == 1

    async def test_fallback_chunk_emitted_when_all_filtered(self) -> None:
        """When all fragments are below min_chunk_chars, one fallback chunk is emitted."""
        svc = TextChunkingService(min_chunk_chars=10_000)
        doc = _make_doc("A small but non-empty document.")
        chunks = await svc.chunk(doc)
        assert len(chunks) == 1
        assert chunks[0].chunk_index == 0

    async def test_no_chunks_shorter_than_min_in_normal_path(self) -> None:
        """All chunks (except the fallback) must meet the min_chunk_chars threshold."""
        svc = TextChunkingService(target_chunk_chars=300, overlap_chars=30, min_chunk_chars=80)
        doc = _make_doc(PROSE_LONG)
        chunks = await svc.chunk(doc)
        # Strip the header to measure body size
        for chunk in chunks:
            header = _context_header(doc.title, doc.source_type)
            body = chunk.content[len(header) :]
            assert len(body) >= 80, f"chunk_index={chunk.chunk_index} body too short: {len(body)}"

    async def test_returns_list_of_document_chunks(self) -> None:
        svc = TextChunkingService()
        doc = _make_doc(PROSE_SHORT)
        chunks = await svc.chunk(doc)
        assert isinstance(chunks, list)
        assert all(isinstance(c, DocumentChunk) for c in chunks)
