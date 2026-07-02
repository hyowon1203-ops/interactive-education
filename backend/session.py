"""In-memory session store. Not persistent across restarts."""

import uuid
from typing import Optional

_sessions: dict[str, dict] = {}


def create_session(concept_id: str) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "session_id": session_id,
        "concept_id": concept_id,
        "phase": "CREATED",
        "p1_output": None,
        "first_answer": None,
        "p2_output": None,
        "judgment": None,
        "p3_output": None,
        "gap_concept_id": None,
        "gap_type": None,
        "p4_output": None,
    }
    return session_id


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def update_session(session_id: str, updates: dict) -> None:
    if session_id in _sessions:
        _sessions[session_id].update(updates)
