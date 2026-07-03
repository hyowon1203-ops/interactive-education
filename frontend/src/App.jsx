import { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import GraphMode from './components/GraphMode.jsx'
import IntroMode from './components/IntroMode.jsx'
import LearningMode from './components/LearningMode.jsx'

const STORAGE_KEY = 'knowgap_mastery'

function loadMastery() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} }
  catch { return {} }
}

export default function App() {
  const [view, setView] = useState('intro') // 'intro' | 'graph' | 'learning'
  const [activeConcept, setActiveConcept] = useState(null)
  const [learningActive, setLearningActive] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)
  const [mastery, setMastery] = useState(loadMastery)

  function updateMastery(conceptId, level) {
    setMastery(prev => {
      const next = { ...prev, [conceptId]: level }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function handleStartLearning(concept) {
    setActiveConcept(concept)
    setLearningActive(true)
    setSessionKey(k => k + 1)
    setView('learning')
  }

  function handleMasteryUpdate(updates) {
    if (!updates) return
    setMastery(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function handleLearningComplete() {
    setLearningActive(false)
    setActiveConcept(null)
    setView('graph')
  }

  function handleCancelLearning() {
    setLearningActive(false)
    setActiveConcept(null)
    setView('graph')
  }

  if (view === 'intro') {
    return (
      <IntroMode
        onStartLearning={handleStartLearning}
        onCancel={() => setView('graph')}
      />
    )
  }

  return (
    <>
      <div style={view === 'graph' ? {} : { display: 'none' }}>
        <ReactFlowProvider>
          <GraphMode
            externalMastery={mastery}
            onStartLearning={handleStartLearning}
            onStartIntro={() => setView('intro')}
            targetConceptId={activeConcept?.id}
            learningActive={learningActive}
            onReturnToLearning={() => setView('learning')}
          />
        </ReactFlowProvider>
      </div>

      {learningActive && (
        <div style={view === 'learning' ? {} : { display: 'none' }}>
          <LearningMode
            key={sessionKey}
            concept={activeConcept}
            onComplete={handleLearningComplete}
            onCancel={handleCancelLearning}
            onViewGraph={() => setView('graph')}
            onMasteryUpdate={handleMasteryUpdate}
          />
        </div>
      )}
    </>
  )
}
