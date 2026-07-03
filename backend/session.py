"""In-memory session store. Not persistent across restarts."""

import uuid
from typing import Optional

_sessions: dict[str, dict] = {}


def create_session(concept_id: str) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "session_id": session_id,
        "phase": "DIAGNOSING",
        "original_target_id": concept_id,
        "current_concept_id": concept_id,
        "diagnosis_chain": [concept_id],  # concepts diagnosed so far (in order)
        "learning_queue": [],             # gaps found, ordered bottom-up (deepest first)
        "concept_data": {},               # concept_id -> {p1_output, p2_output, answer, judgment, gap_type}
        "mastery_updates": {},            # accumulated {concept_id: mastery_level}
        "depth": 0,
        "max_depth": 4,
        # legacy
        "concept_id": concept_id,
    }
    return session_id


def get_session(session_id: str) -> Optional[dict]:
    return _sessions.get(session_id)


def update_session(session_id: str, updates: dict) -> None:
    if session_id in _sessions:
        _sessions[session_id].update(updates)
