const BASE = 'http://localhost:8000'

export async function getConcepts() {
  const res = await fetch(`${BASE}/api/concepts`)
  if (!res.ok) throw new Error('백엔드 서버에 연결할 수 없습니다')
  return res.json()
}

export async function startSession(concept_id) {
  const res = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ concept_id }),
  })
  if (!res.ok) throw new Error('세션 시작 실패')
  return res.json()
}

export async function submitAnswer(session_id, classification_answer, why_answer) {
  const res = await fetch(`${BASE}/api/sessions/${session_id}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classification_answer, why_answer }),
  })
  if (!res.ok) throw new Error('답변 제출 실패')
  return res.json()
}

export async function identifyConcept(text) {
  const res = await fetch(`${BASE}/api/identify-concept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error('개념 분석 실패')
  return res.json()
}

export async function skipToNextLearning(session_id) {
  const res = await fetch(`${BASE}/api/sessions/${session_id}/next-learning`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('다음 개념 이동 실패')
  return res.json()
}

export async function submitVerbalAnswer(session_id, transcript) {
  const res = await fetch(`${BASE}/api/sessions/${session_id}/verbal-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  })
  if (!res.ok) throw new Error('2차 답변 제출 실패')
  return res.json()
}
