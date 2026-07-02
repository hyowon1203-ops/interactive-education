"""
Concept graph loader and query helpers.
In-degree of a node = how many other nodes list it as a prerequisite.
Higher in-degree → more fundamental → checked first (hub-priority).
"""

import json
import os
from pathlib import Path
from typing import Optional

_concepts: dict[str, dict] = {}
_indegrees: dict[str, int] = {}


def load_graph(json_path: str | None = None) -> None:
    global _concepts, _indegrees
    if json_path is None:
        env_path = os.environ.get("CONCEPTS_JSON_PATH", "")
        if env_path:
            json_path = env_path
        else:
            json_path = (
                Path(__file__).parent.parent.parent
                / "knowgap_linear_algebra_concepts_v1_with_relation_recheck_contexts.json"
            )
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    _concepts = {c["id"]: c for c in data["concepts"]}
    _indegrees = _compute_indegrees()


def _compute_indegrees() -> dict[str, int]:
    indegrees: dict[str, int] = {cid: 0 for cid in _concepts}
    for concept in _concepts.values():
        for prereq_id in concept.get("prerequisites", []):
            if prereq_id in indegrees:
                indegrees[prereq_id] += 1
    return indegrees


def get_concept(concept_id: str) -> Optional[dict]:
    return _concepts.get(concept_id)


def find_concept_by_name(name_kr: str) -> Optional[dict]:
    for concept in _concepts.values():
        if concept["name_kr"] == name_kr:
            return concept
    return None


def get_prerequisites_sorted(concept_id: str) -> list[dict]:
    """Return prerequisite concepts sorted by in-degree descending (hub-priority order)."""
    concept = _concepts.get(concept_id)
    if not concept:
        return []
    prereq_ids = concept.get("prerequisites", [])
    prereqs = [_concepts[pid] for pid in prereq_ids if pid in _concepts]
    prereqs.sort(key=lambda c: _indegrees.get(c["id"], 0), reverse=True)
    return prereqs


def get_all_concepts() -> dict[str, dict]:
    return _concepts


def get_indegree(concept_id: str) -> int:
    return _indegrees.get(concept_id, 0)


def validate_graph() -> list[str]:
    """Return list of integrity error messages. Empty list means graph is valid."""
    errors: list[str] = []
    for concept in _concepts.values():
        cid = concept["id"]
        prereq_ids = concept.get("prerequisites", [])
        relation_keys = set(concept.get("relation_to_target", {}).keys())

        for pid in prereq_ids:
            if pid not in _concepts:
                errors.append(f"{cid}: prerequisites references unknown id '{pid}'")

        if set(prereq_ids) != relation_keys:
            errors.append(
                f"{cid}: relation_to_target keys {relation_keys} don't match prerequisites {set(prereq_ids)}"
            )

    # Cycle detection via DFS
    visited: set[str] = set()
    stack: set[str] = set()

    def dfs(node_id: str) -> bool:
        if node_id in stack:
            return True
        if node_id in visited:
            return False
        visited.add(node_id)
        stack.add(node_id)
        concept = _concepts.get(node_id)
        if concept:
            for pid in concept.get("prerequisites", []):
                if dfs(pid):
                    errors.append(f"Cycle detected involving node '{node_id}'")
                    return True
        stack.discard(node_id)
        return False

    for cid in _concepts:
        if cid not in visited:
            dfs(cid)

    return errors
