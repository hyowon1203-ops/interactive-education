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
    judgment: str  # "통과" | "부분" | "실패"
    feedback: str
    is_done: bool
    gap_type: Optional[str] = None  # "shallow" | "conceptual" | null
    learning_content: Optional[LearningContent] = None
    recheck_question: Optional[str] = None


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
    overall_result: str  # "full_understanding" | "partial_understanding" | "insufficient_understanding"
    feedback: FeedbackResult


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
