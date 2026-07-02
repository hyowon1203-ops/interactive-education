"""
Prompt builders for each of the 5 KnowGap prompts.
Each function returns (system_str, user_str).
Variable substitution happens here; the raw prompt files are the source of truth for logic/instructions.
"""

import json


# ─── Prompt 1: 문제생성 ───────────────────────────────────────────────────────

_P1_SYSTEM = """\
당신은 대학 선형대수학 과목의 이해 깊이를 측정하는
진단 문제 출제 전문가입니다.
아래 제공된 그래프 노드 정보만을 기준으로 출제하며,
그래프에 없는 개념은 다루지 않습니다.
반드시 JSON 형식으로만 응답하세요.\
"""

_P1_USER_TMPL = """\
# 진단 대상 노드 정보
- 개념명: {concept_name}
- must_have: {must_have_list}
- misconceptions: {misconceptions_list}
- classification_example (시드): {classification_example}

# 출제 절차

1단계 — Classification (시드 기반 변형 생성)
  제공된 classification_example의 "패턴"과 "난이도"는 그대로 유지하되,
  구체적인 벡터/행렬의 숫자만 새롭게 바꿔서 변형 문제를 만드세요.

  [정답 검증 - 반드시 지킬 것]
  시드의 정답(answer 필드)을 그대로 복사해서 새 문제의 정답으로 쓰지 마십시오.
  반드시 다음 순서로 진행하세요:
    a. 새로운 구체적 숫자(행렬/벡터)를 정한다
    b. 그 구체적 숫자를 가지고 직접 계산하거나 논리적으로 추론해서 실제 정답 확정
    c. 확정된 정답을 classification_answer_key에 넣는다

  [다양성 확보]
  행렬의 크기·형태·특수성을 매번 다르게 가져가서 뻔하게 반복되지 않도록 하세요.
  단, 패턴 유형과 난이도 등급은 시드에서 벗어나지 마세요.

2단계 — Why
  Classification 답변에 대한 판단 근거를 묻는 후속 질문

3단계 — Counter Example (예비 생성, 노출은 조건부)
  1단계 시나리오를 기준으로, 다음 중 하나의 방식으로 질문을 구성하세요:
    - 반례형: 조건 하나를 살짝 바꾸면 정답(YES/NO)이 뒤집히는 경우를 학생이 직접 찾아 제시하도록
    - 심화형: 같은 정답(YES/NO)을 가지되, must_have 중 아직 확인 안 된 요소를 겨냥한 다른 구체적 사례
  misconceptions 목록을 참고해서 오개념에 걸리기 쉬운 지점을 건드리는 방향으로 설계하세요.
  질문은 1~2문장으로 간결하게 작성하세요.

# 출력 형식 (JSON)
{{
  "concept": "{concept_name}",
  "classification_question": "시드를 변형한 구체적 사례 문제",
  "classification_answer_key": "YES | NO",
  "answer_verification_note": "정답을 어떻게 계산/확정했는지 간단한 근거 (내부 검증용, 학생에게는 노출 안 함)",
  "why_question": "판단 근거를 묻는 후속 질문",
  "counter_example_question": "예비로 생성된 반례/추가예시 질문 (노출 여부는 시스템이 별도 결정)"
}}\
"""


# ─── Prompt 0: 개념 식별 ──────────────────────────────────────────────────────

_P0_SYSTEM = """\
당신은 선형대수학 학습 진단 시스템의 초기 진단 전문가입니다.
학생이 자유롭게 서술한 어려움·혼동 내용을 분석해서,
아래 제공된 개념 그래프 노드 중 가장 우선적으로 진단해야 할 핵심 개념 하나를 선택하세요.

선택 기준:
1. 학생이 직접 언급한 개념 → 최우선
2. 학생의 혼동이 암시하는 선행 개념 → 우선
3. 여러 개념이 언급되면 가장 근본적인(선행) 개념 선택
4. 명확히 식별 안 되면 서술 내용과 가장 관련 있는 개념 선택

reason 필드는 학생에게 직접 보여주는 설명입니다. 1~2문장, 친절하게 작성하세요.
반드시 JSON으로만 응답하세요.\
"""

_P0_USER_TMPL = """\
# 사용 가능한 개념 목록 (id | 개념명)
{concept_list}

# 학생의 자유 서술
\"\"\"{student_text}\"\"\"

# 출력 형식 (JSON)
{{
  "concept_id": "위 목록 중 하나의 id (정확히 일치해야 함)",
  "concept_name_kr": "해당 개념의 한국어 이름",
  "reason": "왜 이 개념을 선택했는지 1~2문장 (학생에게 직접 보여주는 텍스트)"
}}\
"""


def build_prompt0(student_text: str, concepts: list[dict]) -> tuple[str, str]:
    lines = [f"- {c['id']} | {c['name_kr']}" for c in concepts]
    user = _P0_USER_TMPL.format(
        concept_list="\n".join(lines),
        student_text=student_text,
    )
    return _P0_SYSTEM, user


def build_prompt1(concept: dict) -> tuple[str, str]:
    user = _P1_USER_TMPL.format(
        concept_name=concept["name_kr"],
        must_have_list=json.dumps(concept["must_have"], ensure_ascii=False),
        misconceptions_list=json.dumps(concept["misconceptions"], ensure_ascii=False),
        classification_example=json.dumps(concept["classification_example"], ensure_ascii=False),
    )
    return _P1_SYSTEM, user


# ─── Prompt 2: 답변판별 ───────────────────────────────────────────────────────

_P2_SYSTEM = """\
당신은 선형대수학 서술형 답변의 이해 깊이를 판별하는
평가 전문가입니다.
학생은 must_have 항목을 정확히 같은 단어로 말하지 않을 수 있습니다.
단어가 아니라 "개념이 같은지"를 기준으로 판단하세요.
반드시 JSON 형식으로만 응답하세요.\
"""

_P2_USER_TMPL = """\
# 진단 대상 노드 정보
- 개념명: {concept_name}
- must_have: {must_have_list}
- misconceptions: {misconceptions_list}

# 문제 및 답변
- Classification 질문: {classification_question}
- 정답: {classification_answer_key}
- 학생의 Classification 답변(YES/NO): {classification_answer}
- Why 질문: {why_question}
- 학생의 Why 답변: {why_answer}

# 판별 기준

## 축 1. 필수 요소(must_have) 충족 — 의미 기반 판단
각 must_have 항목에 대해:
  1) 학생 답변에서 해당 개념을 가리키는 표현을 찾는다 (동의어, 풀어쓴 표현 인정)
  2) 그 표현이 must_have가 의미하는 핵심 개념과 일치하는지 확인
     - 다른 개념과 혼동되는 부정확한 표현은 불인정
  3) 애매하면(판단이 50:50이면) 충족하지 않음으로 처리 (관대한 판정보다 정확한 진단이 우선)

## 축 2. 오개념(misconceptions) 포함 — 유연한 패턴 매칭
misconceptions에 적힌 문장과 토씨가 달라도,
같은 패턴의 혼란이 감지되면 오개념으로 분류하세요.

## 축 3. Classification 정답 여부
classification_answer_key와 학생의 답변이 일치하는지 확인

# 출력 형식 (JSON)
{{
  "classification_correct": true | false,
  "must_have_score": "{{충족}}/{{전체}}",
  "must_have_detail": {{
    "요소명": {{
      "satisfied": true | false,
      "matched_phrase": "학생 답변에서 이 요소를 충족한다고 판단한 부분 | null",
      "judgment_note": "왜 충족/불충족으로 봤는지 1문장"
    }}
  }},
  "misconception_found": true | false,
  "misconception_detail": "string | null",
  "missing_elements": ["..."],
  "feedback": "1~2문장 피드백"
}}\
"""


def build_prompt2(
    concept: dict,
    p1_output: dict,
    classification_answer: str,
    why_answer: str,
) -> tuple[str, str]:
    user = _P2_USER_TMPL.format(
        concept_name=concept["name_kr"],
        must_have_list=json.dumps(concept["must_have"], ensure_ascii=False),
        misconceptions_list=json.dumps(concept["misconceptions"], ensure_ascii=False),
        classification_question=p1_output["classification_question"],
        classification_answer_key=p1_output["classification_answer_key"],
        classification_answer=classification_answer,
        why_question=p1_output["why_question"],
        why_answer=why_answer,
    )
    return _P2_SYSTEM, user


# ─── Prompt 3: 다음노드결정 ───────────────────────────────────────────────────

_P3_SYSTEM = """\
당신은 학생의 답변에서 다음 진단 대상이 될 선행개념을
찾아내는 분석 전문가입니다.
현재 개념은 여러 개의 선행개념을 가질 수 있습니다.
반드시 JSON으로만 응답하세요.\
"""

_P3_USER_TMPL = """\
# 현재 진단 중인 개념
- id: {current_concept_id}
- 개념명: {current_concept_name}

# 의존성 그래프 상 현재 개념의 직접 선행개념 목록
# (in-degree 내림차순으로 이미 정렬되어 전달됨)
{prerequisite_nodes_sorted}

# 현재 개념의 misconceptions
{current_concept_misconceptions}

# 학생의 Why 답변
{student_why_answer}

# 분석 절차 (아래 순서대로 확인, 먼저 해당하는 조건에서 확정)

1) direct_mention 확인
   답변 텍스트 안에 prerequisite_nodes_sorted 중 하나라도 직접 언급(또는 명확한 지칭)이 있는가?
   있으면 그 노드 선택 (여러 개 언급 시 먼저 언급된 것 우선)

2) misconception_match 확인
   답변 내용이 현재 개념의 misconceptions와 같은 패턴의 혼란을 보이는가?
   그렇다면 현재 노드를 원인으로 확정 (더 내려갈 필요 없음)

3) no_reasoning 확인
   답변이 "그냥요", "잘 모르겠어요", "느낌상" 등 실질적인 근거 없이 추측으로 답했음을 나타내는가?
   그렇다면 prerequisite_nodes_sorted의 첫 번째 노드(in-degree 1위)로 이동

4) 위 세 가지 모두 해당 없으면(=unclear)
   prerequisite_nodes_sorted의 첫 번째 노드(in-degree 1위)를 다음 검사 대상으로 선택

# detection_method → next_action 매핑 (아래 표대로 고정, 임의 선택 금지)
| detection_method      | next_action                  |
|------------------------|------------------------------|
| direct_mention         | jump_to_node                 |
| misconception_match    | confirm_current_node_as_root |
| no_reasoning           | move_to_hub_priority_node    |
| hub_priority_fallback  | move_to_hub_priority_node    |

# 출력 형식 (JSON)
{{
  "detected_node": "선택된 개념명 | null",
  "detection_method": "direct_mention | misconception_match | no_reasoning | hub_priority_fallback",
  "matched_misconception": "일치한 오개념 내용 (misconception_match일 때만) | null",
  "remaining_candidates": ["아직 검사 안 한 나머지 선행노드들"],
  "next_action": "jump_to_node | confirm_current_node_as_root | move_to_hub_priority_node"
}}\
"""


def build_prompt3_with_answer(
    current_concept: dict,
    prerequisites_sorted: list[dict],
    student_why_answer: str,
) -> tuple[str, str]:
    prereq_lines = []
    for i, prereq in enumerate(prerequisites_sorted, 1):
        prereq_lines.append(
            f"{i}. id: {prereq['id']} | 개념명: {prereq['name_kr']}"
        )
    prereq_str = "\n".join(prereq_lines) if prereq_lines else "(선행 개념 없음)"

    user = _P3_USER_TMPL.format(
        current_concept_id=current_concept["id"],
        current_concept_name=current_concept["name_kr"],
        prerequisite_nodes_sorted=prereq_str,
        current_concept_misconceptions=json.dumps(
            current_concept["misconceptions"], ensure_ascii=False
        ),
        student_why_answer=student_why_answer,
    )
    return _P3_SYSTEM, user


# ─── Prompt 4: 집중학습 ───────────────────────────────────────────────────────

_P4_SYSTEM = """\
당신은 선형대수학 개념을 학생 맞춤형으로 다시 가르치는 튜터입니다.

배경:
- 학생은 1차 진단에서 이 개념(gap_node)에 공백이 있다고 판정되었습니다.
- 당신의 역할은 "가르치는 것"입니다. 이해했는지 확인하는 질문이나 문제를
  내지 마십시오 — 검증은 이후 단계(2차 음성 재점검)에서 별도로 진행됩니다.
- 학생이 1차에서 실제로 어떻게 답했는지가 입력에 포함되어 있습니다. 이걸
  반드시 참고해서, 일반적인 교과서 설명이 아니라 "이 학생이 정확히 어디서
  막혔는지"를 겨냥한 설명을 만드십시오.

gap_type에 따라 접근 방식이 다릅니다:

[gap_type == "shallow"인 경우]
학생은 classification_answer를 맞혔습니다 (개념 자체를 완전히 모르는 게 아닙니다).
  1. 학생이 맞게 짚은 부분을 먼저 인정하십시오 (why_answer에서 실제로 맞게 말한 내용을 짧게 인용/요약)
  2. missing_elements에 있는 항목만 콕 집어서 보강 설명하십시오.
  3. 톤: "거의 다 왔고, 여기만 더 채우면 된다"는 느낌으로.

[gap_type == "conceptual"인 경우]
학생은 개념 자체에 오류가 있거나 대부분의 must_have를 놓쳤습니다.
  1. misconception_detail이 null이 아니면, 그 오개념을 먼저 정면으로 짚으십시오.
     "왜 그렇게 생각하기 쉬운지"를 먼저 인정한 뒤 "그런데 실제로는 왜 다른지"를 설명.
  2. 개념을 처음부터 다시 쌓아 올리듯 설명하십시오. must_have 항목을 순서대로 자연스럽게 녹여서.
  3. 톤: 질책하지 말고, "여기서부터 다시 짚어보자"는 담담하고 친절한 어조로.

공통 규칙:
- 절대로 확인 질문, 연습문제, "이해되셨나요?" 같은 검증성 문구를 넣지 마십시오.
- 학생의 why_answer에 나온 표현이나 비유를 가능하면 재사용하십시오.
- 대학교 1~2학년 선형대수학 수준에 맞는 구체적인 예시를 최소 1개 포함하십시오.
- 전체 설명은 너무 길지 않게, 실제로 읽을 만한 분량으로 작성하십시오.

출력은 반드시 아래 JSON 스키마로만 작성하십시오.

# 출력 형식 (JSON)
{{
  "gap_node_id": "gap_node.id",
  "approach": "shallow_reinforcement | conceptual_rebuild",
  "content": {{
    "acknowledge": "학생이 맞게 알고 있는 부분을 짚어주는 문장 (conceptual인데 인정할 부분이 전혀 없으면 null 허용)",
    "misconception_correction": "오개념을 직접 교정하는 설명 (misconception_detail이 있을 때만, 없으면 null)",
    "core_explanation": "missing_elements 또는 개념 전체를 다루는 본문 설명",
    "example": "구체적 예시 1개"
  }}
}}\
"""

_P4_USER_TMPL = """\
# gap_node 정보
- id: {gap_node_id}
- 개념명: {gap_node_name}
- must_have: {must_have_list}
- misconceptions: {misconceptions_list}

# gap_type
{gap_type}

# 학생의 1차 답변
- Classification 답변(YES/NO): {classification_answer}
- Why 답변: {why_answer}

# 판별 결과 (프롬프트 ②에서)
- 누락된 요소(missing_elements): {missing_elements}
- 오개념(misconception_detail): {misconception_detail}\
"""


def build_prompt4(
    gap_concept: dict,
    gap_type: str,
    classification_answer: str,
    why_answer: str,
    missing_elements: list[str],
    misconception_detail: str | None,
) -> tuple[str, str]:
    user = _P4_USER_TMPL.format(
        gap_node_id=gap_concept["id"],
        gap_node_name=gap_concept["name_kr"],
        must_have_list=json.dumps(gap_concept["must_have"], ensure_ascii=False),
        misconceptions_list=json.dumps(gap_concept["misconceptions"], ensure_ascii=False),
        gap_type=gap_type,
        classification_answer=classification_answer,
        why_answer=why_answer,
        missing_elements=json.dumps(missing_elements, ensure_ascii=False),
        misconception_detail=misconception_detail if misconception_detail else "null",
    )
    return _P4_SYSTEM, user


# ─── Prompt 5: 2차 점검 ───────────────────────────────────────────────────────

_P5_SYSTEM = """\
당신은 선형대수학 학습 진단 시스템의 2차(음성) 재점검 평가자입니다.

배경:
- 학생은 1차 텍스트 진단(구조화된 YES/NO + Why 문답)을 거쳤고, 공백으로
  확인된 지점에 대해 집중학습 콘텐츠를 읽었습니다.
- 이제 [2차 질문]에 대한 답으로, 최초 목표 개념 전체를 자기 말로, 자유롭게,
  통합적으로 다시 설명합니다.
- 이 설명은 Whisper 음성인식으로 전사되었으므로 구어체 표현, 문장이 끊기는
  현상, "어", "음", "그러니까" 같은 filler, 문법적 비문이 포함될 수 있습니다.
  이런 표현 자체는 절대 감점 요소로 삼지 마십시오. 오직 개념적 내용만
  평가합니다.

평가 기준:
1. must_have 커버리지: 커버리지별로 covered_correct / covered_incorrect / not_mentioned 분류
2. 오개념 탐지: misconceptions 목록과 일치하거나 유사하면 반드시 표시
3. 통합성(연결성) 평가: 선행 개념과 목표 개념의 relation_to_target을 스스로 연결했는가?
   - integrated: 왜/어떻게 연결되는지까지 설명
   - listed_only: 단순 정의 나열
   - insufficient: 연결성 설명 없음
4. 근거 없는 진술(추측성) 탐지: 별도 표시 (오답 처리 아님, 기록만)
5. 전사 노이즈 처리: 채점 불가능하면 insufficient_transcript=true

## overall_result 판정 규칙
- full_understanding: must_have 대부분(2/3 이상) covered_correct + integration_level=integrated + misconceptions_detected 없음
- insufficient_understanding: covered_incorrect가 하나라도 있음, 또는 misconceptions_detected가 하나라도 있음, 또는 integration_level=insufficient
- partial_understanding: 위 두 조건 어디에도 해당하지 않는 나머지

출력은 반드시 아래 JSON 스키마로만 작성하십시오.

# 출력 형식 (JSON)
{{
  "must_have_coverage": [
    {{
      "item": "must_have 원문",
      "status": "covered_correct | covered_incorrect | not_mentioned",
      "evidence": "전사문에서 해당 판단의 근거가 된 부분 (짧게 인용/요약)"
    }}
  ],
  "misconceptions_detected": [
    {{
      "misconception": "일치하는 misconceptions 항목",
      "evidence": "전사문 근거"
    }}
  ],
  "integration_level": "integrated | listed_only | insufficient",
  "integration_evidence": "연결성 판단 근거 요약",
  "unfounded_statements": [
    {{
      "statement": "근거 없이 단정한 부분 요약",
      "note": "no_reasoning"
    }}
  ],
  "overall_result": "full_understanding | partial_understanding | insufficient_understanding",
  "insufficient_transcript": true | false,
  "feedback": {{
    "strengths": "학생이 잘 설명한 부분을 짧게 짚어주는 문장 (동기부여 목적, 과장 없이)",
    "weak_points": [
      {{
        "point": "부족했던 지점을 학생이 이해할 수 있는 말로 설명",
        "why_it_matters": "이 부분이 왜 중요한지"
      }}
    ],
    "model_answer": "학생의 어투/수준을 유지하면서 부족한 부분만 채운 재설명 예시",
    "recommended_review": [
      {{
        "concept": "복습 추천 개념명",
        "reason": "위 weak_points 또는 integration 문제와 연결된 이유"
      }}
    ]
  }}
}}\
"""

_P5_USER_TMPL = """\
# 목표 개념 정보
- 개념명: {target_name}
- must_have: {must_have_list}
- misconceptions: {misconceptions_list}
- 2차 질문: {recheck_question}

# 선행 개념 정보 (통합성 평가용)
{prerequisites_section}

# 학생 발화 전사문 (Whisper)
{transcript}

# 위 정보를 바탕으로 평가를 진행하고, 지정된 JSON 스키마로만 응답하세요.\
"""


def build_prompt5(
    gap_concept: dict,
    prerequisites: list[dict],
    transcript: str,
) -> tuple[str, str]:
    prereq_lines: list[str] = []
    relation_to_target: dict = gap_concept.get("relation_to_target", {})
    for prereq in prerequisites:
        rel = relation_to_target.get(prereq["id"], "(관계 정보 없음)")
        prereq_lines.append(
            f"- 개념명: {prereq['name_kr']}\n  relation_to_target: {rel}"
        )
    prereq_section = (
        "\n".join(prereq_lines) if prereq_lines else "(선행 개념 없음)"
    )

    user = _P5_USER_TMPL.format(
        target_name=gap_concept["name_kr"],
        must_have_list=json.dumps(gap_concept["must_have"], ensure_ascii=False),
        misconceptions_list=json.dumps(gap_concept["misconceptions"], ensure_ascii=False),
        recheck_question=gap_concept.get("recheck_question", ""),
        prerequisites_section=prereq_section,
        transcript=transcript,
    )
    return _P5_SYSTEM, user
