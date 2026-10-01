"""Imports every model module so Base.metadata is fully populated for Alembic
autogenerate and for `Base.metadata.create_all()` in tests/seed scripts.
Add a line here each time a new model module is added in a later phase.
"""

# Phase 1
from app.models import user, profile, user_state, password_reset  # noqa: F401

# Phase 2
from app.models import workspace, document, tracker  # noqa: F401

# Phase 3
from app.models import source, opportunity, scrape_run  # noqa: F401

# Phase 5
from app.models import notification, outcome, api_cache  # noqa: F401
