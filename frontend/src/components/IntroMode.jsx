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
    <div className="intro-shell">

      {/* 상단 네비 */}
      <nav className="intro-nav">
        <div className="intro-nav-brand">KnowGap</div>
        <button className="intro-nav-graph-btn" onClick={onCancel}>그래프 보기 →</button>
      </nav>

      {/* 히어로 */}
      <div className="intro-hero">
        <div className="intro-hero-inner">
          <div className="intro-badge">선형대수 AI 진단 학습</div>
          <h1 className="intro-title">KnowGap</h1>
          <p className="intro-subtitle">
            모르는 부분을 설명하면 AI가 개념 공백을 찾아<br />
            맞춤 집중학습을 제공합니다
          </p>

          {/* 기능 태그 */}
          <div className="intro-feature-row">
            <span className="intro-feature-chip">📝 자유 서술 입력</span>
            <span className="intro-feature-chip">🔍 개념 공백 진단</span>
            <span className="intro-feature-chip">📚 맞춤 집중학습</span>
            <span className="intro-feature-chip">🗺 그래프 시각화</span>
          </div>
        </div>
      </div>

      {/* 메인 카드 */}
      <div className="intro-card-area">
        <div className="intro-main-card">

          {phase === 'INPUT' && (
            <>
              <h2 className="intro-card-heading">어떤 부분이 어려운가요?</h2>
              <p className="intro-card-desc">
                헷갈리거나 이해가 안 되는 내용을 자유롭게 적어주세요.<br />
                AI가 어떤 개념을 먼저 진단할지 분석해 드립니다.
              </p>
              {error && (
                <div className="intro-error">{error}</div>
              )}
              <textarea
                className="intro-textarea"
                placeholder={'예: 행렬의 역행렬이 언제 존재하는지 잘 모르겠어요.\nrank랑 관련이 있다고 하는데 정확히 연결이 안 됩니다.'}
                value={text}
                onChange={e => setText(e.target.value)}
                rows={5}
              />
              <button
                className="intro-submit-btn"
                onClick={handleSubmit}
                disabled={!text.trim()}
              >
                분석하기
              </button>
            </>
          )}

          {phase === 'IDENTIFYING' && (
            <div className="intro-loading">
              <div className="intro-spinner" />
              <p className="intro-loading-text">개념을 분석하고 있습니다...</p>
              <p className="intro-loading-sub">AI가 학습이 필요한 개념을 찾고 있어요</p>
            </div>
          )}

          {phase === 'RESULT' && result && (
            <>
              <p className="intro-result-label">학습 추천 개념</p>
              <div className="intro-result-concept-box">
                <span className="intro-result-name">{result.concept_name_kr}</span>
                <span className="intro-result-id">{result.concept_id}</span>
              </div>
              <div className="intro-result-reason">{result.reason}</div>
              <button className="intro-submit-btn" onClick={handleStartLearning}>
                이 개념 학습하기 →
              </button>
              <button className="intro-retry-btn" onClick={() => { setPhase('INPUT'); setResult(null) }}>
                다시 입력하기
              </button>
            </>
          )}

        </div>
      </div>

    </div>
  )
}
