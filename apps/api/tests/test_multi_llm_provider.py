"""Tests for LLM provider abstraction and factory."""

from __future__ import annotations

import pytest

from app.services.llm.provider import LLMResponse, ProviderFactory, StreamMetrics


class TestLLMResponse:
    def test_frozen_dataclass(self) -> None:
        resp = LLMResponse(
            text="hello",
            input_tokens=10,
            output_tokens=5,
            latency_ms=100.0,
            model_id="test",
            provider="test",
        )
        assert resp.text == "hello"
        with pytest.raises(AttributeError):
            resp.text = "world"  # type: ignore[misc]

    def test_fields(self) -> None:
        resp = LLMResponse(
            text="ok",
            input_tokens=1,
            output_tokens=2,
            latency_ms=50.0,
            model_id="m",
            provider="p",
        )
        assert resp.input_tokens == 1
        assert resp.output_tokens == 2
        assert resp.latency_ms == 50.0
        assert resp.model_id == "m"
        assert resp.provider == "p"


class TestStreamMetrics:
    def test_defaults(self) -> None:
        m = StreamMetrics()
        assert m.input_tokens == 0
        assert m.output_tokens == 0
        assert m.latency_ms == 0.0

    def test_mutable(self) -> None:
        m = StreamMetrics()
        m.input_tokens = 100
        m.output_tokens = 50
        m.latency_ms = 200.0
        assert m.input_tokens == 100


class TestProviderFactory:
    def setup_method(self) -> None:
        ProviderFactory.reset()

    def teardown_method(self) -> None:
        ProviderFactory.reset()

    def test_register_and_get(self) -> None:
        class FakeProvider:
            provider_name = "fake"

            async def generate(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
            ) -> LLMResponse:
                return LLMResponse(
                    text="",
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=0,
                    model_id=model,
                    provider="fake",
                )

            async def stream(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
                metrics: StreamMetrics | None = None,
            ):
                yield ""

            def supports_thinking(self, model_id: str) -> bool:
                return False

        ProviderFactory.register(FakeProvider())
        p = ProviderFactory.get("fake")
        assert p.provider_name == "fake"

    def test_available(self) -> None:
        class P1:
            provider_name = "a"

            async def generate(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
            ) -> LLMResponse: ...

            async def stream(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
                metrics: StreamMetrics | None = None,
            ):
                yield ""

            def supports_thinking(self, m: str) -> bool:
                return False

        class P2:
            provider_name = "b"

            async def generate(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
            ) -> LLMResponse: ...

            async def stream(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
                metrics: StreamMetrics | None = None,
            ):
                yield ""

            def supports_thinking(self, m: str) -> bool:
                return False

        ProviderFactory.register(P1())
        ProviderFactory.register(P2())
        assert set(ProviderFactory.available()) == {"a", "b"}

    def test_get_unknown_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown provider"):
            ProviderFactory.get("nonexistent")

    def test_reset(self) -> None:
        class P:
            provider_name = "x"

            async def generate(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
            ) -> LLMResponse: ...

            async def stream(
                self,
                messages: list[dict[str, str]],
                *,
                model: str,
                system_prompt: str = "",
                max_tokens: int = 4096,
                temperature: float = 0.3,
                metrics: StreamMetrics | None = None,
            ):
                yield ""

            def supports_thinking(self, m: str) -> bool:
                return False

        ProviderFactory.register(P())
        ProviderFactory.reset()
        assert ProviderFactory.available() == []
