"""KnowGap FastAPI backend."""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import graph as graph_module
import session as session_module
from llm import call_llm
from logic import (
    determine_judgment,
    determine_next_action_1cha,
    determine_next_action_3cha,
    determine_overall_result,
    parse_must_have_ratio,
)
from models import (
    ConceptListResponse,
    ConceptSummary,
    FeedbackResult,
    IdentifyConceptRequest,
    IdentifyConceptResponse,
    LearningContent,
    ReviewItem,
    StartSessionRequest,
    StartSessionResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SubmitVerbalAnswerRequest,
    SubmitVerbalAnswerResponse,
    WeakPoint,
    QuestionSet,
)
from prompts import (
    build_prompt0,
    build_prompt1,
    build_prompt2,
    build_prompt3_with_answer,
    build_prompt4,
    build_prompt5,
)

load_dotenv()

MASTERY_FROM_RESULT = {
    "full_understanding": 4,
    "partial_understanding": 3,
    "insufficient_understanding": 1,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    graph_module.load_graph()
    errors = graph_module.validate_graph()
    if errors:
        for e in errors:
            print(f"[graph validation] {e}")
    yield


app = FastAPI(title="KnowGap API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

def _make_learning_content(p4_output: dict) -> LearningContent:
    raw = p4_output.get("content", {})
    return LearningContent(
        acknowledge=raw.get("acknowledge"),
        misconception_correction=raw.get("misconception_correction"),
        core_explanation=raw.get("core_explanation", ""),
        example=raw.get("example", ""),
    )


def _make_feedback(p5_output: dict) -> FeedbackResult:
    raw = p5_output.get("feedback", {})
    return FeedbackResult(
        strengths=raw.get("strengths", ""),
        weak_points=[
            WeakPoint(point=wp.get("point", ""), why_it_matters=wp.get("why_it_matters", ""))
            for wp in raw.get("weak_points", [])
        ],
        model_answer=raw.get("model_answer", ""),
        recommended_review=[
            ReviewItem(concept=ri.get("concept", ""), reason=ri.get("reason", ""))
            for ri in raw.get("recommended_review", [])
        ],
    )


def _resolve_gap_concept_id(
    p3_output: dict,
    current_concept_id: str,
    prerequisites_sorted: list[dict],
) -> str:
    detection_method = p3_output.get("detection_method", "hub_priority_fallback")
    detected_name = p3_output.get("detected_node")

    if detection_method == "misconception_match":
        return current_concept_id

    if detection_method == "direct_mention" and detected_name:
        for prereq in prerequisites_sorted:
            if prereq["name_kr"] == detected_name or prereq["id"] == detected_name:
                return prereq["id"]

    if prerequisites_sorted:
        return prerequisites_sorted[0]["id"]

    return current_concept_id


async def _begin_learning_phase(
    session_id: str,
    sess: dict,
    judgment: str,
    feedback_text: str,
    learning_queue: list[str],
    concept_data: dict,
    mastery_updates: dict,
    gap_context: "str | None" = None,
) -> SubmitAnswerResponse:
    """진단 완료 후 학습 단계를 시작하는 헬퍼."""
    if not learning_queue:
        session_module.update_session(session_id, {
            "phase": "COMPLETE",
            "mastery_updates": mastery_updates,
        })
        return SubmitAnswerResponse(
            judgment=judgment,
            feedback=feedback_text,
            action="done",
            is_done=True,
            mastery_updates=mastery_updates,
        )

    first_id = learning_queue[0]
    first_concept = graph_module.get_concept(first_id)
    if not first_concept:
        raise HTTPException(500, f"Concept '{first_id}' not found")

    ctx = concept_data.get(first_id, {})
    answer = ctx.get("answer", {})
    p2 = ctx.get("p2_output", {})
    gap_type = ctx.get("gap_type", "conceptual")

    sys4, usr4 = build_prompt4(
        gap_concept=first_concept,
        gap_type=gap_type,
        classification_answer=answer.get("classification", ""),
        why_answer=answer.get("why", ""),
        missing_elements=p2.get("missing_elements", []),
        misconception_detail=p2.get("misconception_detail"),
    )
    p4_output = await call_llm(sys4, usr4)

    session_module.update_session(session_id, {
        "phase": "LEARNING",
        "current_concept_id": first_id,
        "learning_queue": learning_queue,
        "concept_data": concept_data,
        "mastery_updates": mastery_updates,
        "current_p4_output": p4_output,
    })

    return SubmitAnswerResponse(
        judgment=judgment,
        feedback=feedback_text,
        action="start_learning",
        learning_concept_id=first_id,
        learning_concept_name=first_concept["name_kr"],
        gap_type=gap_type,
        learning_content=_make_learning_content(p4_output),
        recheck_question=first_concept.get("recheck_question"),
        gap_context=gap_context,
        mastery_updates=mastery_updates,
    )


# ─── /api/concepts ────────────────────────────────────────────────────────────

@app.get("/api/concepts", response_model=ConceptListResponse)
def list_concepts():
    concepts = graph_module.get_all_concepts()
    return ConceptListResponse(
        concepts=[
            ConceptSummary(
                id=c["id"],
                name_kr=c["name_kr"],
                primary_area=c.get("primary_area"),
                prerequisites=c.get("prerequisites", []),
            )
            for c in concepts.values()
        ]
    )


# ─── /api/identify-concept ───────────────────────────────────────────────────

@app.post("/api/identify-concept", response_model=IdentifyConceptResponse)
async def identify_concept(req: IdentifyConceptRequest):
    concepts = list(graph_module.get_all_concepts().values())
    sys0, usr0 = build_prompt0(req.text, concepts)
    result = await call_llm(sys0, usr0)

    concept_id = result.get("concept_id", "")
    if not graph_module.get_concept(concept_id):
        concept_id = concepts[0]["id"] if concepts else ""

    concept = graph_module.get_concept(concept_id)
    return IdentifyConceptResponse(
        concept_id=concept_id,
        concept_name_kr=concept["name_kr"] if concept else result.get("concept_name_kr", ""),
        reason=result.get("reason", ""),
    )


# ─── /api/sessions ────────────────────────────────────────────────────────────

@app.post("/api/sessions", response_model=StartSessionResponse)
async def start_session(req: StartSessionRequest):
    concept = graph_module.get_concept(req.concept_id)
    if not concept:
        raise HTTPException(404, f"Concept '{req.concept_id}' not found")

    sys1, usr1 = build_prompt1(concept)
    p1_output = await call_llm(sys1, usr1)

    session_id = session_module.create_session(req.concept_id)
    session_module.update_session(session_id, {
        "concept_data": {req.concept_id: {"p1_output": p1_output}},
    })

    return StartSessionResponse(
        session_id=session_id,
        concept_name=concept["name_kr"],
        question=QuestionSet(
            classification_question=p1_output["classification_question"],
            why_question=p1_output["why_question"],
            counter_example_question=p1_output["counter_example_question"],
        ),
    )


# ─── /api/sessions/{id}/answer ───────────────────────────────────────────────

@app.post("/api/sessions/{session_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(session_id: str, req: SubmitAnswerRequest):
    sess = session_module.get_session(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess["phase"] != "DIAGNOSING":
        raise HTTPException(400, f"Expected phase DIAGNOSING, got {sess['phase']}")

    current_id = sess["current_concept_id"]
    concept = graph_module.get_concept(current_id)
    if not concept:
        raise HTTPException(500, f"Concept '{current_id}' not found")

    concept_data = sess["concept_data"]
    p1_output = concept_data[current_id]["p1_output"]

    # P2: 답변 평가
    sys2, usr2 = build_prompt2(concept, p1_output, req.classification_answer, req.why_answer)
    p2_output = await call_llm(sys2, usr2)

    ratio = parse_must_have_ratio(p2_output["must_have_score"])
    judgment = determine_judgment(
        p2_output["classification_correct"],
        p2_output["misconception_found"],
        ratio,
    )
    action_1cha, _ = determine_next_action_1cha(judgment)

    # 현재 개념 결과 저장
    concept_data[current_id].update({
        "p2_output": p2_output,
        "judgment": judgment,
        "answer": {"classification": req.classification_answer, "why": req.why_answer},
    })

    mastery_updates = dict(sess.get("mastery_updates", {}))

    # ── 통과: 이 개념은 이해함 ────────────────────────────────────────────────
    if action_1cha == "통과_종료":
        mastery_updates[current_id] = 4
        learning_queue = list(sess["learning_queue"])

        if not learning_queue:
            # 공백 없음, 세션 완료
            session_module.update_session(session_id, {
                "phase": "COMPLETE",
                "mastery_updates": mastery_updates,
            })
            return SubmitAnswerResponse(
                judgment=judgment,
                feedback=p2_output["feedback"],
                action="done",
                is_done=True,
                mastery_updates=mastery_updates,
            )
        else:
            # 이미 발견한 공백들 학습 시작
            session_module.update_session(session_id, {"concept_data": concept_data})
            return await _begin_learning_phase(
                session_id, sess, judgment, p2_output["feedback"],
                learning_queue, concept_data, mastery_updates,
            )

    # ── 부분: 얕은 공백 (현재 개념 자체가 gap, 선행 개념은 탐색 안 함) ─────────
    elif action_1cha == "부분_공백기록":
        concept_data[current_id]["gap_type"] = "shallow"
        mastery_updates[current_id] = 3  # 얕은이해(yellow) — 학습 후 갱신

        # 현재 개념을 학습 큐 앞에 추가 (얕은 공백은 자기 자신을 학습)
        learning_queue = [current_id] + list(sess["learning_queue"])
        session_module.update_session(session_id, {"concept_data": concept_data})

        return await _begin_learning_phase(
            session_id, sess, judgment, p2_output["feedback"],
            learning_queue, concept_data, mastery_updates,
        )

    # ── 실패: P3로 선행 개념 공백 탐색 → 즉시 집중학습으로 이동 ──────────────────
    else:
        prereqs_sorted = graph_module.get_prerequisites_sorted(current_id)
        sys3, usr3 = build_prompt3_with_answer(concept, prereqs_sorted, req.why_answer)
        p3_output = await call_llm(sys3, usr3)
        determine_next_action_3cha(p3_output["detection_method"])

        gap_concept_id = _resolve_gap_concept_id(p3_output, current_id, prereqs_sorted)
        concept_data[current_id]["gap_type"] = "conceptual"
        concept_data[current_id]["gap_concept_id"] = gap_concept_id
        mastery_updates[current_id] = 1  # 공백(red)

        gap_concept = graph_module.get_concept(gap_concept_id)

        if gap_concept and gap_concept_id != current_id:
            # 선행 개념 B에 공백 → [B, A] 순서로 학습 (B 먼저, A 나중)
            mastery_updates[gap_concept_id] = 1
            concept_data.setdefault(gap_concept_id, {})["gap_type"] = "conceptual"
            learning_queue = [gap_concept_id, current_id] + list(sess["learning_queue"])
            gap_context = (
                f"'{concept['name_kr']}' 개념을 진단하는 중 "
                f"선행 개념 '{gap_concept['name_kr']}'에서 공백이 발견되었습니다. "
                f"'{gap_concept['name_kr']}'부터 집중 학습합니다."
            )
        else:
            # 선행 개념 없음 or 자기 자신 → 현재 개념 직접 학습
            learning_queue = [current_id] + list(sess["learning_queue"])
            gap_context = None

        session_module.update_session(session_id, {"concept_data": concept_data})
        return await _begin_learning_phase(
            session_id, sess, judgment, p2_output["feedback"],
            learning_queue, concept_data, mastery_updates,
            gap_context=gap_context,
        )


# ─── /api/sessions/{id}/verbal-answer ────────────────────────────────────────

@app.post(
    "/api/sessions/{session_id}/verbal-answer",
    response_model=SubmitVerbalAnswerResponse,
)
async def submit_verbal_answer(session_id: str, req: SubmitVerbalAnswerRequest):
    sess = session_module.get_session(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess["phase"] != "LEARNING":
        raise HTTPException(400, f"Expected phase LEARNING, got {sess['phase']}")

    current_id = sess["current_concept_id"]
    gap_concept = graph_module.get_concept(current_id)
    if not gap_concept:
        raise HTTPException(500, "Current concept not found")

    prereqs = [
        graph_module.get_concept(pid)
        for pid in gap_concept.get("prerequisites", [])
        if graph_module.get_concept(pid)
    ]

    # P5: 2차 점검 평가
    sys5, usr5 = build_prompt5(gap_concept, prereqs, req.transcript)
    p5_output = await call_llm(sys5, usr5)

    overall_result = determine_overall_result(
        p5_output.get("must_have_coverage", []),
        p5_output.get("integration_level", "insufficient"),
        p5_output.get("misconceptions_detected", []),
    )
    mastery_level = MASTERY_FROM_RESULT.get(overall_result, 1)

    mastery_updates = {**sess.get("mastery_updates", {}), current_id: mastery_level}
    remaining_queue = sess["learning_queue"][1:]  # 현재 개념 제거

    feedback = _make_feedback(p5_output)

    if not remaining_queue:
        # 모든 학습 완료
        session_module.update_session(session_id, {
            "phase": "COMPLETE",
            "mastery_updates": mastery_updates,
        })
        return SubmitVerbalAnswerResponse(
            overall_result=overall_result,
            feedback=feedback,
            action="done",
            mastery_updates=mastery_updates,
        )

    # 다음 개념 학습
    next_id = remaining_queue[0]
    next_concept = graph_module.get_concept(next_id)
    if not next_concept:
        raise HTTPException(500, f"Next concept '{next_id}' not found")

    concept_data = sess.get("concept_data", {})
    ctx = concept_data.get(next_id, {})
    answer = ctx.get("answer", {})
    p2 = ctx.get("p2_output", {})
    gap_type = ctx.get("gap_type", "conceptual")

    sys4, usr4 = build_prompt4(
        gap_concept=next_concept,
        gap_type=gap_type,
        classification_answer=answer.get("classification", ""),
        why_answer=answer.get("why", ""),
        missing_elements=p2.get("missing_elements", []),
        misconception_detail=p2.get("misconception_detail"),
    )
    p4_output = await call_llm(sys4, usr4)

    session_module.update_session(session_id, {
        "phase": "LEARNING",
        "current_concept_id": next_id,
        "learning_queue": remaining_queue,
        "mastery_updates": mastery_updates,
        "current_p4_output": p4_output,
    })

    return SubmitVerbalAnswerResponse(
        overall_result=overall_result,
        feedback=feedback,
        action="learn_next",
        mastery_updates=mastery_updates,
        next_concept_id=next_id,
        next_concept_name=next_concept["name_kr"],
        next_learning_content=_make_learning_content(p4_output),
        next_recheck_question=next_concept.get("recheck_question"),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
