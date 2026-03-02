"""Data connector package -- ingests content from external sources into Qdrant.

Provides a registry so callers can retrieve a connector by :class:`ConnectorType`
without importing concrete implementations directly.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.services.types import ConnectorType

if TYPE_CHECKING:
    from app.services.ingestion.protocols import Connector

logger = logging.getLogger(__name__)

# Lazy singleton cache -- connectors are stateless (they hold no per-request
# state) so a single instance per type is safe to reuse across invocations.
_registry: dict[ConnectorType, Connector] = {}


def get_connector(connector_type: ConnectorType) -> Connector:
    """Return the connector instance for the given type."""
    if connector_type in _registry:
        return _registry[connector_type]

    connector: Connector
    if connector_type == ConnectorType.GOOGLE_DRIVE:
        from app.connectors.google_drive import GoogleDriveConnector

        connector = GoogleDriveConnector()
    elif connector_type == ConnectorType.NOTION:
        from app.connectors.notion import NotionConnector

        connector = NotionConnector()
    elif connector_type == ConnectorType.TELEGRAM:
        from app.connectors.telegram import TelegramConnector

        connector = TelegramConnector()
    else:
        raise ValueError(f"No connector registered for type: {connector_type!r}")

    _registry[connector_type] = connector
    logger.debug("Instantiated connector for %s", connector_type)
    return connector
