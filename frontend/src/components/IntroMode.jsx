import { useState } from 'react'
import { identifyConcept } from '../api.js'

export default function IntroMode({ onStartLearning, onCancel }) {
  const [phase, setPhase] = useState('INPUT')
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!text.trim()) return
    setPhase('IDENTIFYING')
    setError(null)
    try {
      const data = await identifyConcept(text)
      setResult(data)
      setPhase('RESULT')
    } catch (e) {
      setError(e.message)
      setPhase('INPUT')
    }
  }

  function handleStartLearning() {
    onStartLearning({ id: result.concept_id, name_kr: result.concept_name_kr })
  }

  return (
    <div className="learning-shell">
      <div className="learning-topbar">
        <button className="btn-back" onClick={onCancel}>그래프 보기</button>
        <span className="learning-topbar-title">학습 시작</span>
        <span className="phase-badge">
          {phase === 'INPUT' ? '개념 입력' : phase === 'IDENTIFYING' ? '분석 중' : '결과 확인'}
        </span>
      </div>

      <div className="learning-body">
        <div className="learning-card">

          {phase === 'INPUT' && (
            <div>
              <h2 className="intro-heading">모르는 내용을 설명해 주세요</h2>
              <p className="intro-desc">
                헷갈리거나 어려운 부분을 자유롭게 적어주세요.<br />
                AI가 어떤 개념을 먼저 진단할지 찾아드립니다.
              </p>
              {error && (
                <div className="error-state" style={{ padding: '12px 14px', marginBottom: 14, borderRadius: 8 }}>
                  <p style={{ margin: 0 }}>{error}</p>
                </div>
              )}
              <textarea
                className="answer-textarea"
                placeholder={'예: 행렬의 역행렬이 언제 존재하는지 잘 모르겠어요.\nrank랑 관련이 있다고 하는데 정확히 연결이 안 됩니다.'}
                value={text}
                onChange={e => setText(e.target.value)}
                rows={7}
              />
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!text.trim()}
              >
                분석하기
              </button>
            </div>
          )}

          {phase === 'IDENTIFYING' && (
            <div className="loading-state">
              <div className="spinner" />
              <p>어떤 개념을 학습할지 분석하고 있습니다...</p>
            </div>
          )}

          {phase === 'RESULT' && result && (
            <div>
              <p className="q-label" style={{ marginBottom: 8 }}>학습 추천 개념</p>
              <div className="intro-result-box">
                <span className="intro-result-concept">{result.concept_name_kr}</span>
                <span className="intro-result-id">{result.concept_id}</span>
              </div>
              <div className="feedback-text" style={{ marginTop: 16, marginBottom: 24 }}>
                {result.reason}
              </div>
              <button className="btn-primary" onClick={handleStartLearning}>
                이 개념 학습하기 →
              </button>
              <button
                className="btn-secondary"
                style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 10 }}
                onClick={() => { setPhase('INPUT'); setResult(null) }}
              >
                다시 입력하기
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
