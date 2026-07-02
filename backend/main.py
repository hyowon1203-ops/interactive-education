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
        # LLM이 없는 id를 반환했을 때 첫 번째 개념으로 fallback
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
        raise HTTPException(status_code=404, detail=f"Concept '{req.concept_id}' not found")

    sys1, usr1 = build_prompt1(concept)
    p1_output = await call_llm(sys1, usr1)

    session_id = session_module.create_session(req.concept_id)
    session_module.update_session(session_id, {"p1_output": p1_output})

    return StartSessionResponse(
        session_id=session_id,
        concept_name=concept["name_kr"],
        question={
            "classification_question": p1_output["classification_question"],
            "why_question": p1_output["why_question"],
            "counter_example_question": p1_output["counter_example_question"],
        },
    )


# ─── /api/sessions/{id}/answer ───────────────────────────────────────────────

@app.post("/api/sessions/{session_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(session_id: str, req: SubmitAnswerRequest):
    sess = session_module.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess["phase"] != "CREATED":
        raise HTTPException(status_code=400, detail=f"Expected phase CREATED, got {sess['phase']}")

    concept = graph_module.get_concept(sess["concept_id"])
    p1_output = sess["p1_output"]

    # ① Prompt 2: evaluate first answer
    sys2, usr2 = build_prompt2(concept, p1_output, req.classification_answer, req.why_answer)
    p2_output = await call_llm(sys2, usr2)

    # Deterministic judgment override
    ratio = parse_must_have_ratio(p2_output["must_have_score"])
    judgment = determine_judgment(
        p2_output["classification_correct"],
        p2_output["misconception_found"],
        ratio,
    )
    action, _ = determine_next_action_1cha(judgment)

    first_answer = {
        "classification_answer": req.classification_answer,
        "why_answer": req.why_answer,
    }

    # ② No gap — done
    if action == "통과_종료":
        session_module.update_session(
            session_id,
            {
                "phase": "PASSED",
                "first_answer": first_answer,
                "p2_output": p2_output,
                "judgment": judgment,
            },
        )
        return SubmitAnswerResponse(
            judgment=judgment,
            feedback=p2_output["feedback"],
            is_done=True,
        )

    # ③ Determine gap concept
    if action == "부분_공백기록":
        gap_concept_id = sess["concept_id"]
        gap_type = "shallow"
        p3_output = None
    else:
        # action == "분석_필요": call Prompt 3 to find root-cause prerequisite
        prereqs_sorted = graph_module.get_prerequisites_sorted(sess["concept_id"])
        sys3, usr3 = build_prompt3_with_answer(concept, prereqs_sorted, req.why_answer)
        p3_output = await call_llm(sys3, usr3)

        # Deterministic next_action override
        determine_next_action_3cha(p3_output["detection_method"])

        gap_concept_id = _resolve_gap_concept_id(
            p3_output, sess["concept_id"], prereqs_sorted
        )
        gap_type = "conceptual"

    gap_concept = graph_module.get_concept(gap_concept_id)
    if not gap_concept:
        raise HTTPException(status_code=500, detail=f"Gap concept '{gap_concept_id}' not found in graph")

    # ④ Prompt 4: generate learning content
    sys4, usr4 = build_prompt4(
        gap_concept=gap_concept,
        gap_type=gap_type,
        classification_answer=req.classification_answer,
        why_answer=req.why_answer,
        missing_elements=p2_output.get("missing_elements", []),
        misconception_detail=p2_output.get("misconception_detail"),
    )
    p4_output = await call_llm(sys4, usr4)

    session_module.update_session(
        session_id,
        {
            "phase": "GAP_IDENTIFIED",
            "first_answer": first_answer,
            "p2_output": p2_output,
            "p3_output": p3_output,
            "judgment": judgment,
            "gap_concept_id": gap_concept_id,
            "gap_type": gap_type,
            "p4_output": p4_output,
        },
    )

    content_raw = p4_output.get("content", {})
    return SubmitAnswerResponse(
        judgment=judgment,
        feedback=p2_output["feedback"],
        is_done=False,
        gap_type=gap_type,
        learning_content=LearningContent(
            acknowledge=content_raw.get("acknowledge"),
            misconception_correction=content_raw.get("misconception_correction"),
            core_explanation=content_raw.get("core_explanation", ""),
            example=content_raw.get("example", ""),
        ),
        recheck_question=gap_concept.get("recheck_question"),
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

    # no_reasoning / hub_priority_fallback / unmatched direct_mention
    if prerequisites_sorted:
        return prerequisites_sorted[0]["id"]

    return current_concept_id


# ─── /api/sessions/{id}/verbal-answer ────────────────────────────────────────

@app.post(
    "/api/sessions/{session_id}/verbal-answer",
    response_model=SubmitVerbalAnswerResponse,
)
async def submit_verbal_answer(session_id: str, req: SubmitVerbalAnswerRequest):
    sess = session_module.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess["phase"] != "GAP_IDENTIFIED":
        raise HTTPException(
            status_code=400, detail=f"Expected phase GAP_IDENTIFIED, got {sess['phase']}"
        )

    gap_concept = graph_module.get_concept(sess["gap_concept_id"])
    if not gap_concept:
        raise HTTPException(status_code=500, detail="Gap concept missing from session")

    prereq_ids = gap_concept.get("prerequisites", [])
    prereqs = [
        graph_module.get_concept(pid)
        for pid in prereq_ids
        if graph_module.get_concept(pid)
    ]

    # Prompt 5: evaluate verbal answer
    sys5, usr5 = build_prompt5(gap_concept, prereqs, req.transcript)
    p5_output = await call_llm(sys5, usr5)

    # Deterministic overall_result override
    overall_result = determine_overall_result(
        p5_output.get("must_have_coverage", []),
        p5_output.get("integration_level", "insufficient"),
        p5_output.get("misconceptions_detected", []),
    )

    session_module.update_session(session_id, {"phase": "COMPLETE"})

    feedback_raw = p5_output.get("feedback", {})
    return SubmitVerbalAnswerResponse(
        overall_result=overall_result,
        feedback=FeedbackResult(
            strengths=feedback_raw.get("strengths", ""),
            weak_points=[
                WeakPoint(
                    point=wp.get("point", ""),
                    why_it_matters=wp.get("why_it_matters", ""),
                )
                for wp in feedback_raw.get("weak_points", [])
            ],
            model_answer=feedback_raw.get("model_answer", ""),
            recommended_review=[
                ReviewItem(
                    concept=ri.get("concept", ""),
                    reason=ri.get("reason", ""),
                )
                for ri in feedback_raw.get("recommended_review", [])
            ],
        ),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
