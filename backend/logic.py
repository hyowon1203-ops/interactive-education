"""
Pure Python deterministic judgment functions.
These override the LLM-computed fields per the 판정로직 spec.
"""


def determine_judgment(
    classification_correct: bool,
    misconception_found: bool,
    must_have_ratio: float,
) -> str:
    if not classification_correct:
        return "실패"
    if misconception_found:
        return "실패"
    if must_have_ratio <= 1 / 3:
        return "실패"
    if must_have_ratio < 1.0:
        return "부분"
    return "통과"


def determine_next_action_1cha(judgment: str) -> tuple[str, str | None]:
    mapping = {
        "통과": ("통과_종료", None),
        "부분": ("부분_공백기록", "shallow"),
        "실패": ("분석_필요", "conceptual_pending"),
    }
    return mapping[judgment]


def determine_next_action_3cha(detection_method: str) -> str:
    mapping = {
        "direct_mention": "jump_to_node",
        "misconception_match": "confirm_current_node_as_root",
        "no_reasoning": "move_to_hub_priority_node",
        "hub_priority_fallback": "move_to_hub_priority_node",
    }
    return mapping[detection_method]


def determine_overall_result(
    must_have_coverage: list[dict],
    integration_level: str,
    misconceptions_detected: list,
) -> str:
    has_incorrect = any(item["status"] == "covered_incorrect" for item in must_have_coverage)
    has_misconception = len(misconceptions_detected) > 0
    if has_incorrect or has_misconception or integration_level == "insufficient":
        return "insufficient_understanding"
    total = len(must_have_coverage)
    correct = sum(1 for item in must_have_coverage if item["status"] == "covered_correct")
    correct_ratio = correct / total if total > 0 else 0
    if correct_ratio >= 2 / 3 and integration_level == "integrated":
        return "full_understanding"
    return "partial_understanding"


def parse_must_have_ratio(score_str: str) -> float:
    parts = score_str.split("/")
    if len(parts) == 2:
        try:
            return int(parts[0]) / int(parts[1])
        except (ValueError, ZeroDivisionError):
            return 0.0
    return 0.0
