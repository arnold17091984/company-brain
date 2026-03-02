"""Connector factory for the ingestion pipeline service layer.

This subpackage acts as a thin shim between the pipeline and the concrete
connector implementations in :mod:`app.connectors`.  The pipeline depends only
on this factory function so that the concrete connector implementations can be
swapped or extended without touching the pipeline logic.

Example usage::

    from app.services.types import ConnectorType
    from app.services.ingestion.connectors import get_connector

    connector = get_connector(ConnectorType.GOOGLE_DRIVE)
    async for doc in connector.fetch_documents():
        ...

Note:
    Concrete connector implementations are not yet wired in this shim.
    :func:`get_connector` delegates to :func:`app.connectors.get_connector`
    which raises :exc:`ValueError` for unknown types.  As individual connectors
    graduate to production-ready status, this module can be updated to route
    specific :class:`~app.services.types.ConnectorType` values to bespoke
    service-layer adapters.

Each module in this package implements the
:class:`~app.services.ingestion.protocols.Connector` protocol for a specific
knowledge source.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.services.types import ConnectorType

if TYPE_CHECKING:
    from app.services.ingestion.protocols import Connector

logger = logging.getLogger(__name__)


def get_connector(connector_type: ConnectorType) -> Connector:
    """Return the :class:`~app.services.ingestion.protocols.Connector` for *connector_type*.

    Currently delegates to :func:`app.connectors.get_connector`.  When this
    service layer grows its own adapter implementations they can be returned
    here without changing the call sites in the pipeline.

    Args:
        connector_type: The :class:`~app.services.types.ConnectorType` value
            that identifies which knowledge source to fetch from.

    Returns:
        A connector instance that satisfies the
        :class:`~app.services.ingestion.protocols.Connector` protocol.

    Raises:
        NotImplementedError: When the underlying registry cannot be imported or
            does not expose ``get_connector``.
        ValueError: When *connector_type* is not recognised by the underlying
            connector registry.
    """
    try:
        from app.connectors import get_connector as _registry_get_connector
    except (ImportError, AttributeError) as exc:
        msg = (
            f"No connector implementation found for connector_type={connector_type!r}. "
            "Ensure the connector is registered in app.connectors."
        )
        raise NotImplementedError(msg) from exc

    connector = _registry_get_connector(connector_type)
    logger.debug(
        "Resolved connector type=%s via app.connectors registry",
        connector_type,
    )
    return connector  # type: ignore[return-value]
