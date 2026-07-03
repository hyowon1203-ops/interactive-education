from typing import Optional
from pydantic import BaseModel


class QuestionSet(BaseModel):
    classification_question: str
    why_question: str
    counter_example_question: str


class LearningContent(BaseModel):
    acknowledge: Optional[str] = None
    misconception_correction: Optional[str] = None
    core_explanation: str
    example: str


# ── /api/sessions ─────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    concept_id: str


class StartSessionResponse(BaseModel):
    session_id: str
    concept_name: str
    question: QuestionSet


# ── /api/sessions/{id}/answer ─────────────────────────────────────────────────

class SubmitAnswerRequest(BaseModel):
    classification_answer: str  # "YES" | "NO"
    why_answer: str


class SubmitAnswerResponse(BaseModel):
    # 항상 존재
    judgment: str
    feedback: str
    action: str          # "start_learning" | "done"
    mastery_updates: dict = {}

    # action == "start_learning" 일 때
    learning_concept_id: Optional[str] = None
    learning_concept_name: Optional[str] = None
    gap_type: Optional[str] = None
    learning_content: Optional[LearningContent] = None
    recheck_question: Optional[str] = None
    # 선행 개념 공백 발견 시 설명 문구 (없으면 바로 학습 시작)
    gap_context: Optional[str] = None

    # legacy
    is_done: bool = False


# ── /api/sessions/{id}/verbal-answer ─────────────────────────────────────────

class SubmitVerbalAnswerRequest(BaseModel):
    transcript: str


class WeakPoint(BaseModel):
    point: str
    why_it_matters: str


class ReviewItem(BaseModel):
    concept: str
    reason: str


class FeedbackResult(BaseModel):
    strengths: str
    weak_points: list[WeakPoint]
    model_answer: str
    recommended_review: list[ReviewItem]


class SubmitVerbalAnswerResponse(BaseModel):
    overall_result: str
    feedback: FeedbackResult
    action: str          # "learn_next" | "done"
    mastery_updates: dict = {}

    # action == "learn_next" 일 때
    next_concept_id: Optional[str] = None
    next_concept_name: Optional[str] = None
    next_learning_content: Optional[LearningContent] = None
    next_recheck_question: Optional[str] = None


# ── /api/concepts ─────────────────────────────────────────────────────────────

class ConceptSummary(BaseModel):
    id: str
    name_kr: str
    primary_area: Optional[str] = None
    prerequisites: list[str] = []


class ConceptListResponse(BaseModel):
    concepts: list[ConceptSummary]


# ── /api/identify-concept ─────────────────────────────────────────────────────

class IdentifyConceptRequest(BaseModel):
    text: str


class IdentifyConceptResponse(BaseModel):
    concept_id: str
    concept_name_kr: str
    reason: str
