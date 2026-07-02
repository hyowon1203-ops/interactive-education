import { useState, useEffect } from 'react'
import { startSession, submitAnswer, submitVerbalAnswer } from '../api.js'

const MASTERY_FROM_RESULT = {
  full_understanding: 4,
  partial_understanding: 3,
  insufficient_understanding: 1,
}

const PHASE_LABEL = {
  LOADING: '문제 생성 중', ANSWERING: '1차 답변', EVALUATING: '평가 중',
  FEEDBACK: '피드백', VERBAL_INPUT: '2차 답변', EVALUATING_VERBAL: '최종 평가 중',
  RESULT: '결과', ERROR: '오류',
}

const RESULT_LABEL = {
  full_understanding: '충분히 이해했습니다',
  partial_understanding: '부분적으로 이해했습니다',
  insufficient_understanding: '추가 학습이 필요합니다',
}

function judgeClass(j) {
  if (j === '통과') return 'pass'
  if (j === '부분') return 'partial'
  return 'fail'
}

function resultClass(r) {
  if (r === 'full_understanding') return 'pass'
  if (r === 'partial_understanding') return 'partial'
  return 'fail'
}

function Spinner({ text }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  )
}

function ContentBlock({ label, variant, children }) {
  return (
    <div className={`content-block ${variant ? `content-${variant}` : ''}`}>
      <strong>{label}</strong>
      <div>{children}</div>
    </div>
  )
}

export default function LearningMode({ concept, onComplete, onCancel, onViewGraph }) {
  const [phase, setPhase] = useState('LOADING')
  const [sessionId, setSessionId] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [classAns, setClassAns] = useState(null)
  const [whyAns, setWhyAns] = useState('')
  const [ansResult, setAnsResult] = useState(null)
  const [verbalAns, setVerbalAns] = useState('')
  const [finalResult, setFinalResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!concept) return
    setPhase('LOADING')
    setSessionId(null); setQuestions(null)
    setClassAns(null); setWhyAns('')
    setAnsResult(null); setVerbalAns('')
    setFinalResult(null); setError(null)

    startSession(concept.id)
      .then(data => { setSessionId(data.session_id); setQuestions(data.question); setPhase('ANSWERING') })
      .catch(e => { setError(e.message); setPhase('ERROR') })
  }, [concept?.id])

  async function handleSubmitAnswer() {
    if (!classAns || !whyAns.trim()) return
    setPhase('EVALUATING')
    try {
      const result = await submitAnswer(sessionId, classAns, whyAns)
      setAnsResult(result)
      setPhase('FEEDBACK')
    } catch (e) { setError(e.message); setPhase('ERROR') }
  }

  async function handleSubmitVerbal() {
    if (!verbalAns.trim()) return
    setPhase('EVALUATING_VERBAL')
    try {
      const result = await submitVerbalAnswer(sessionId, verbalAns)
      setFinalResult(result)
      setPhase('RESULT')
    } catch (e) { setError(e.message); setPhase('ERROR') }
  }

  if (!concept) {
    return (
      <div className="learning-shell">
        <div className="learning-empty">
          <p>그래프에서 학습할 개념 노드를 클릭하세요.</p>
          <button className="btn-secondary" onClick={onCancel}>그래프로 돌아가기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="learning-shell">
      <div className="learning-topbar">
        <button className="btn-back" onClick={onCancel}>✕ 종료</button>
        <span className="learning-topbar-title">{concept.name_kr}</span>
        <div className="topbar-right">
          {onViewGraph && (
            <button className="topbar-graph-btn" onClick={onViewGraph}>그래프 보기</button>
          )}
          <span className="phase-badge">{PHASE_LABEL[phase]}</span>
        </div>
      </div>

      <div className="learning-body">
        <div className="learning-card">

          {phase === 'LOADING' && <Spinner text="문제를 생성하고 있습니다..." />}

          {phase === 'ANSWERING' && questions && (
            <div>
              <div className="question-block">
                <span className="q-label">문제</span>
                <p className="question-text">{questions.classification_question}</p>
                <div className="yn-group">
                  <button className={`yn-btn ${classAns === 'YES' ? 'selected' : ''}`} onClick={() => setClassAns('YES')}>YES</button>
                  <button className={`yn-btn ${classAns === 'NO' ? 'selected' : ''}`} onClick={() => setClassAns('NO')}>NO</button>
                </div>
              </div>
              <div className="question-block">
                <span className="q-label">이유</span>
                <p className="question-text">왜 그렇게 생각했나요? 판단 근거를 자유롭게 설명해주세요.</p>
                <textarea
                  className="answer-textarea"
                  placeholder="판단 근거를 입력하세요..."
                  value={whyAns}
                  onChange={e => setWhyAns(e.target.value)}
                  rows={4}
                />
              </div>
              <button className="btn-primary" onClick={handleSubmitAnswer} disabled={!classAns || !whyAns.trim()}>
                제출
              </button>
            </div>
          )}

          {phase === 'EVALUATING' && <Spinner text="답변을 평가하고 있습니다..." />}

          {phase === 'FEEDBACK' && ansResult && (
            <div>
              <span className={`badge badge-${judgeClass(ansResult.judgment)}`}>{ansResult.judgment}</span>
              <p className="feedback-text">{ansResult.feedback}</p>

              {ansResult.is_done ? (
                <button className="btn-primary" onClick={() => onComplete(concept.id, 4)}>
                  완료 — 그래프로 돌아가기
                </button>
              ) : (
                <>
                  <div className="learn-content">
                    <h3>개념 보충 학습</h3>
                    {ansResult.learning_content?.acknowledge && (
                      <ContentBlock label="잘 알고 있는 부분">{ansResult.learning_content.acknowledge}</ContentBlock>
                    )}
                    {ansResult.learning_content?.misconception_correction && (
                      <ContentBlock label="오개념 교정" variant="red">{ansResult.learning_content.misconception_correction}</ContentBlock>
                    )}
                    <ContentBlock label="핵심 설명">{ansResult.learning_content?.core_explanation}</ContentBlock>
                    <ContentBlock label="예시" variant="blue">{ansResult.learning_content?.example}</ContentBlock>
                  </div>
                  <div className="recheck-section">
                    <h3>2차 점검 질문</h3>
                    <p className="question-text">{ansResult.recheck_question}</p>
                    <button className="btn-primary" onClick={() => setPhase('VERBAL_INPUT')}>
                      답변하기
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === 'VERBAL_INPUT' && (
            <div>
              <h3 style={{ marginBottom: 12 }}>2차 점검</h3>
              <p className="question-text" style={{ marginBottom: 16 }}>{ansResult?.recheck_question}</p>
              <textarea
                className="answer-textarea"
                placeholder="배운 내용을 자유롭게 설명해보세요..."
                value={verbalAns}
                onChange={e => setVerbalAns(e.target.value)}
                rows={7}
              />
              <button className="btn-primary" onClick={handleSubmitVerbal} disabled={!verbalAns.trim()}>
                제출
              </button>
            </div>
          )}

          {phase === 'EVALUATING_VERBAL' && <Spinner text="최종 평가 중..." />}

          {phase === 'RESULT' && finalResult && (
            <div>
              <span className={`badge badge-${resultClass(finalResult.overall_result)}`}>
                {RESULT_LABEL[finalResult.overall_result]}
              </span>
              <div className="feedback-detail">
                <ContentBlock label="잘한 점">{finalResult.feedback.strengths}</ContentBlock>
                {finalResult.feedback.weak_points?.map((wp, i) => (
                  <ContentBlock key={i} label="보완 필요" variant="red">
                    {wp.point}
                    {wp.why_it_matters && <small style={{ display: 'block', marginTop: 4, color: '#94a3b8' }}>{wp.why_it_matters}</small>}
                  </ContentBlock>
                ))}
                <ContentBlock label="모범 답변" variant="blue">{finalResult.feedback.model_answer}</ContentBlock>
                {finalResult.feedback.recommended_review?.length > 0 && (
                  <ContentBlock label="복습 추천">
                    {finalResult.feedback.recommended_review.map((r, i) => (
                      <p key={i} style={{ margin: '2px 0' }}>• <strong>{r.concept}</strong>: {r.reason}</p>
                    ))}
                  </ContentBlock>
                )}
              </div>
              <button
                className="btn-primary"
                onClick={() => onComplete(concept.id, MASTERY_FROM_RESULT[finalResult.overall_result] ?? 1)}
              >
                완료 — 그래프로 돌아가기
              </button>
            </div>
          )}

          {phase === 'ERROR' && (
            <div className="error-state">
              <p>오류: {error}</p>
              <button className="btn-secondary" onClick={onCancel}>돌아가기</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
