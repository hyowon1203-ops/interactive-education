import { useState, useEffect } from 'react'
import { startSession, submitAnswer, submitVerbalAnswer } from '../api.js'

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

function DiagnosisChain({ chain }) {
  if (!chain || chain.length === 0) return null
  return (
    <div className="diagnosis-chain">
      {chain.map((item, i) => (
        <span key={i} className="chain-item">
          <span className={`chain-badge chain-${judgeClass(item.judgment)}`}>
            {item.name}
            {item.judgment && <span className="chain-judgment">  {item.judgment}</span>}
          </span>
          {i < chain.length - 1 && <span className="chain-arrow">→</span>}
        </span>
      ))}
    </div>
  )
}

export default function LearningMode({ concept, onComplete, onCancel, onViewGraph, onMasteryUpdate }) {
  const [phase, setPhase] = useState('LOADING')
  const [sessionId, setSessionId] = useState(null)

  // 진단 상태
  const [diagnosisChain, setDiagnosisChain] = useState([])
  const [currentConceptName, setCurrentConceptName] = useState('')
  const [questions, setQuestions] = useState(null)
  const [classAns, setClassAns] = useState(null)
  const [whyAns, setWhyAns] = useState('')

  // 갭 발견 상태 (GAP_FOUND)
  const [gapFeedback, setGapFeedback] = useState('')
  const [gapJudgment, setGapJudgment] = useState('')
  const [nextQuestion, setNextQuestion] = useState(null)
  const [nextConceptName, setNextConceptName] = useState('')

  // 학습 상태
  const [learningConceptName, setLearningConceptName] = useState('')
  const [learningContent, setLearningContent] = useState(null)
  const [recheckQuestion, setRecheckQuestion] = useState('')
  const [verbalAns, setVerbalAns] = useState('')

  // 2차 점검 결과
  const [verbalResult, setVerbalResult] = useState(null)
  const [hasNextConcept, setHasNextConcept] = useState(false)
  const [nextLearning, setNextLearning] = useState(null)

  const [error, setError] = useState(null)

  function applyMasteryUpdates(updates) {
    if (updates && Object.keys(updates).length > 0 && onMasteryUpdate) {
      onMasteryUpdate(updates)
    }
  }

  useEffect(() => {
    if (!concept) return
    setPhase('LOADING')
    setSessionId(null)
    setDiagnosisChain([])
    setCurrentConceptName(concept.name_kr || '')
    setQuestions(null)
    setClassAns(null); setWhyAns('')
    setGapFeedback(''); setGapJudgment(''); setNextQuestion(null); setNextConceptName('')
    setLearningConceptName(''); setLearningContent(null); setRecheckQuestion('')
    setVerbalAns(''); setVerbalResult(null); setHasNextConcept(false); setNextLearning(null)
    setError(null)

    startSession(concept.id)
      .then(data => {
        setSessionId(data.session_id)
        setCurrentConceptName(data.concept_name)
        setQuestions(data.question)
        setPhase('ANSWERING')
      })
      .catch(e => { setError(e.message); setPhase('ERROR') })
  }, [concept?.id])

  async function handleSubmitAnswer() {
    if (!classAns || !whyAns.trim()) return
    setPhase('EVALUATING')
    try {
      const result = await submitAnswer(sessionId, classAns, whyAns)
      applyMasteryUpdates(result.mastery_updates)

      if (result.action === 'diagnose_next') {
        // 선행 개념으로 내려가서 계속 진단
        setDiagnosisChain(prev => [...prev, { name: currentConceptName, judgment: result.judgment }])
        setGapJudgment(result.judgment)
        setGapFeedback(result.feedback)
        setNextConceptName(result.next_concept_name)
        setNextQuestion(result.next_question)
        setPhase('GAP_FOUND')
      } else if (result.action === 'start_learning') {
        // 학습 큐 첫 번째 개념 학습 시작
        setDiagnosisChain(prev => [...prev, { name: currentConceptName, judgment: result.judgment }])
        setLearningConceptName(result.learning_concept_name)
        setLearningContent(result.learning_content)
        setRecheckQuestion(result.recheck_question)
        setPhase('LEARNING_CONTENT')
      } else {
        // done — 개념이 이미 충분히 이해됨 (학습 큐 비어있음)
        setDiagnosisChain(prev => [...prev, { name: currentConceptName, judgment: result.judgment }])
        setPhase('DONE')
      }
    } catch (e) { setError(e.message); setPhase('ERROR') }
  }

  function handleContinueDiagnosis() {
    setCurrentConceptName(nextConceptName)
    setQuestions(nextQuestion)
    setClassAns(null)
    setWhyAns('')
    setPhase('ANSWERING')
  }

  async function handleSubmitVerbal() {
    if (!verbalAns.trim()) return
    setPhase('EVALUATING_VERBAL')
    try {
      const result = await submitVerbalAnswer(sessionId, verbalAns)
      applyMasteryUpdates(result.mastery_updates)
      setVerbalResult(result)

      if (result.action === 'learn_next') {
        setHasNextConcept(true)
        setNextLearning({
          conceptName: result.next_concept_name,
          content: result.next_learning_content,
          recheckQuestion: result.next_recheck_question,
        })
      } else {
        setHasNextConcept(false)
      }
      setPhase('VERBAL_RESULT')
    } catch (e) { setError(e.message); setPhase('ERROR') }
  }

  function handleNextConcept() {
    if (!nextLearning) return
    setLearningConceptName(nextLearning.conceptName)
    setLearningContent(nextLearning.content)
    setRecheckQuestion(nextLearning.recheckQuestion)
    setVerbalAns('')
    setVerbalResult(null)
    setNextLearning(null)
    setHasNextConcept(false)
    setPhase('LEARNING_CONTENT')
  }

  const phaseLabel = {
    LOADING: '문제 생성 중',
    ANSWERING: '진단 중',
    EVALUATING: '평가 중',
    GAP_FOUND: '공백 발견',
    LEARNING_CONTENT: '개념 학습',
    VERBAL_INPUT: '2차 점검',
    EVALUATING_VERBAL: '최종 평가 중',
    VERBAL_RESULT: '점검 결과',
    DONE: '완료',
    ERROR: '오류',
  }[phase] || phase

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
          <span className="phase-badge">{phaseLabel}</span>
        </div>
      </div>

      {diagnosisChain.length > 0 && (
        <div className="chain-bar">
          <DiagnosisChain chain={diagnosisChain} />
        </div>
      )}

      <div className="learning-body">
        <div className="learning-card">

          {phase === 'LOADING' && <Spinner text="문제를 생성하고 있습니다..." />}

          {phase === 'ANSWERING' && questions && (
            <div>
              <div className="concept-label">
                <span className="concept-chip">진단 개념</span>
                <strong>{currentConceptName}</strong>
              </div>
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

          {phase === 'GAP_FOUND' && (
            <div>
              <div className="concept-label">
                <span className="concept-chip">진단 결과</span>
                <strong>{currentConceptName}</strong>
                <span className={`badge badge-${judgeClass(gapJudgment)}`}>{gapJudgment}</span>
              </div>
              <p className="feedback-text">{gapFeedback}</p>
              <div className="gap-found-box">
                <p className="gap-found-label">선행 개념에서 공백이 발견되었습니다</p>
                <p className="gap-found-concept">→ <strong>{nextConceptName}</strong></p>
                <p className="gap-found-desc">이 개념부터 먼저 진단하겠습니다.</p>
              </div>
              <button className="btn-primary" onClick={handleContinueDiagnosis}>
                계속 진단하기
              </button>
            </div>
          )}

          {phase === 'LEARNING_CONTENT' && learningContent && (
            <div>
              <div className="concept-label">
                <span className="concept-chip">집중 학습</span>
                <strong>{learningConceptName}</strong>
              </div>
              <div className="learn-content">
                {learningContent.acknowledge && (
                  <ContentBlock label="잘 알고 있는 부분">{learningContent.acknowledge}</ContentBlock>
                )}
                {learningContent.misconception_correction && (
                  <ContentBlock label="오개념 교정" variant="red">{learningContent.misconception_correction}</ContentBlock>
                )}
                <ContentBlock label="핵심 설명">{learningContent.core_explanation}</ContentBlock>
                <ContentBlock label="예시" variant="blue">{learningContent.example}</ContentBlock>
              </div>
              <div className="recheck-section">
                <h3>2차 점검 질문</h3>
                <p className="question-text">{recheckQuestion}</p>
                <button className="btn-primary" onClick={() => { setVerbalAns(''); setPhase('VERBAL_INPUT') }}>
                  답변하기
                </button>
              </div>
            </div>
          )}

          {phase === 'VERBAL_INPUT' && (
            <div>
              <div className="concept-label">
                <span className="concept-chip">2차 점검</span>
                <strong>{learningConceptName}</strong>
              </div>
              <p className="question-text" style={{ marginBottom: 16 }}>{recheckQuestion}</p>
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

          {phase === 'VERBAL_RESULT' && verbalResult && (
            <div>
              <div className="concept-label">
                <span className="concept-chip">점검 결과</span>
                <strong>{learningConceptName}</strong>
                <span className={`badge badge-${resultClass(verbalResult.overall_result)}`}>
                  {RESULT_LABEL[verbalResult.overall_result]}
                </span>
              </div>
              <div className="feedback-detail">
                <ContentBlock label="잘한 점">{verbalResult.feedback.strengths}</ContentBlock>
                {verbalResult.feedback.weak_points?.map((wp, i) => (
                  <ContentBlock key={i} label="보완 필요" variant="red">
                    {wp.point}
                    {wp.why_it_matters && (
                      <small style={{ display: 'block', marginTop: 4, color: '#94a3b8' }}>{wp.why_it_matters}</small>
                    )}
                  </ContentBlock>
                ))}
                <ContentBlock label="모범 답변" variant="blue">{verbalResult.feedback.model_answer}</ContentBlock>
                {verbalResult.feedback.recommended_review?.length > 0 && (
                  <ContentBlock label="복습 추천">
                    {verbalResult.feedback.recommended_review.map((r, i) => (
                      <p key={i} style={{ margin: '2px 0' }}>• <strong>{r.concept}</strong>: {r.reason}</p>
                    ))}
                  </ContentBlock>
                )}
              </div>
              {hasNextConcept ? (
                <button className="btn-primary" onClick={handleNextConcept}>
                  다음 개념 학습 → {nextLearning?.conceptName}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => { if (onComplete) onComplete() }}>
                  완료 — 그래프로 돌아가기
                </button>
              )}
            </div>
          )}

          {phase === 'DONE' && (
            <div className="loading-state">
              <p style={{ fontSize: '2rem' }}>✓</p>
              <p>모든 학습이 완료되었습니다.</p>
              <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => { if (onComplete) onComplete() }}>
                그래프로 돌아가기
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
