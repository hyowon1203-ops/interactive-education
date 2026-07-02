import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';

const MASTERY = {
  0: { label: '미진단', color: '#D1D5DB', text: '#111827' },
  1: { label: '공백', color: '#EF4444', text: '#FFFFFF' },
  2: { label: '오개념', color: '#F97316', text: '#111827' },
  3: { label: '얕은 이해', color: '#FACC15', text: '#111827' },
  4: { label: '충분 이해', color: '#22C55E', text: '#FFFFFF' },
};

const AREA_LABELS = {
  foundations: '기초 객체',
  vectors: '벡터 / 선형결합',
  matrices: '행렬',
  linear_systems: '연립방정식',
  vector_spaces: '벡터공간 / 부분공간',
  linear_transformations: '선형변환',
  rank_nullity: 'Rank / Nullity',
  determinants_invertibility: '행렬식 / 가역성',
  eigen_diagonalization: '고유값 / 대각화',
  orthogonality_least_squares: '직교성 / 최소제곱',
  svd_pca: 'SVD / PCA',
  statistics_for_pca: 'PCA용 통계',
  other: '기타',
};

const ALL_CONTEXTS = '__all_contexts__';
const ALL_AREAS = '__all_areas__';
const NODE_SIZE = 108;
const TARGET_NODE_SIZE = 118;
const X_GAP = 280;
const Y_GAP = 150;
const MIN_Y_GAP = 142;

function clampMastery(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, Math.round(n)));
}

function getConceptLabel(concept) {
  return concept?.name_kr || concept?.name_en || concept?.id || '';
}

function shortText(text, limit = 70) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildIndexes(concepts) {
  const byId = new Map();
  const prereqMap = new Map();
  const successorMap = new Map();
  for (const concept of concepts) {
    byId.set(concept.id, concept);
    prereqMap.set(concept.id, Array.isArray(concept.prerequisites) ? concept.prerequisites : []);
    if (!successorMap.has(concept.id)) successorMap.set(concept.id, []);
  }
  for (const concept of concepts) {
    for (const prereq of prereqMap.get(concept.id) || []) {
      if (!successorMap.has(prereq)) successorMap.set(prereq, []);
      successorMap.get(prereq).push(concept.id);
    }
  }
  return { byId, prereqMap, successorMap };
}

function getDirectPrereqs(id, prereqMap, byId) {
  return (prereqMap.get(id) || []).filter((nodeId) => byId.has(nodeId));
}

function getDirectSuccessors(id, successorMap, byId) {
  return (successorMap.get(id) || []).filter((nodeId) => byId.has(nodeId));
}

function makeExpansionKey(nodeId, direction) { return `${nodeId}::${direction}`; }

function parseExpansionKey(key) {
  const index = key.lastIndexOf('::');
  if (index < 0) return null;
  return { nodeId: key.slice(0, index), direction: key.slice(index + 2) };
}

function addFocusNode({ id, level, parent, visibleIds, levels, parents }) {
  if (visibleIds.has(id)) return false;
  visibleIds.add(id);
  levels.set(id, level);
  parents.set(id, parent || null);
  return true;
}

function isAllowedExpansion(level, direction) {
  if (direction === 'prereq') return level <= 0;
  if (direction === 'successor') return level >= 0;
  return false;
}

function computeFocusState(targetId, expandedKeys, prereqMap, successorMap, byId) {
  const visibleIds = new Set();
  const levels = new Map();
  const parents = new Map();
  if (!targetId || !byId.has(targetId)) return { visibleIds, levels, parents };
  addFocusNode({ id: targetId, level: 0, parent: null, visibleIds, levels, parents });
  for (const id of getDirectPrereqs(targetId, prereqMap, byId)) {
    addFocusNode({ id, level: -1, parent: { sourceId: targetId, direction: 'prereq' }, visibleIds, levels, parents });
  }
  for (const id of getDirectSuccessors(targetId, successorMap, byId)) {
    addFocusNode({ id, level: 1, parent: { sourceId: targetId, direction: 'successor' }, visibleIds, levels, parents });
  }
  let changed = true;
  let guard = 0;
  while (changed && guard < 50) {
    changed = false;
    guard += 1;
    for (const key of expandedKeys) {
      const parsed = parseExpansionKey(key);
      if (!parsed || !visibleIds.has(parsed.nodeId)) continue;
      const sourceLevel = levels.get(parsed.nodeId);
      if (sourceLevel === undefined || !isAllowedExpansion(sourceLevel, parsed.direction)) continue;
      const neighbors = parsed.direction === 'prereq'
        ? getDirectPrereqs(parsed.nodeId, prereqMap, byId)
        : getDirectSuccessors(parsed.nodeId, successorMap, byId);
      const nextLevel = sourceLevel + (parsed.direction === 'prereq' ? -1 : 1);
      for (const neighbor of neighbors) {
        if (addFocusNode({ id: neighbor, level: nextLevel, parent: { sourceId: parsed.nodeId, direction: parsed.direction }, visibleIds, levels, parents })) changed = true;
      }
    }
  }
  return { visibleIds, levels, parents };
}

function topologicalDepths(concepts, prereqMap, successorMap) {
  const indegree = new Map(concepts.map((c) => [c.id, 0]));
  for (const concept of concepts) {
    for (const prereq of prereqMap.get(concept.id) || []) {
      if (indegree.has(concept.id) && indegree.has(prereq)) {
        indegree.set(concept.id, indegree.get(concept.id) + 1);
      }
    }
  }
  const queue = [];
  for (const [id, degree] of indegree) { if (degree === 0) queue.push(id); }
  const depth = new Map(concepts.map((c) => [c.id, 0]));
  while (queue.length) {
    const id = queue.shift();
    for (const child of successorMap.get(id) || []) {
      if (!indegree.has(child)) continue;
      depth.set(child, Math.max(depth.get(child) || 0, (depth.get(id) || 0) + 1));
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  return depth;
}

function distributeByLevel(ids, levels, byId) {
  const buckets = new Map();
  for (const id of ids) {
    const level = levels.get(id) ?? 0;
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level).push(id);
  }
  const positions = new Map();
  for (const [level, levelIds] of buckets.entries()) {
    levelIds.sort((a, b) => getConceptLabel(byId.get(a)).localeCompare(getConceptLabel(byId.get(b)), 'ko'));
    const total = levelIds.length;
    levelIds.forEach((id, index) => {
      positions.set(id, { x: level * X_GAP, y: (index - (total - 1) / 2) * Y_GAP });
    });
  }
  return positions;
}

function enforceColumnSpacing(positions, visibleIds, levels, targetId) {
  const buckets = new Map();
  for (const id of visibleIds) {
    const level = levels.get(id) ?? 0;
    if (!buckets.has(level)) buckets.set(level, []);
    buckets.get(level).push(id);
  }
  const next = new Map(positions);
  for (const [level, ids] of buckets.entries()) {
    ids.sort((a, b) => {
      const ay = next.get(a)?.y ?? 0;
      const by = next.get(b)?.y ?? 0;
      if (ay !== by) return ay - by;
      return String(a).localeCompare(String(b));
    });
    if (ids.length <= 1) continue;
    const originalCenter = ids.reduce((sum, id) => sum + (next.get(id)?.y ?? 0), 0) / ids.length;
    const adjusted = ids.map((id) => ({ id, y: next.get(id)?.y ?? 0 }));
    for (let i = 1; i < adjusted.length; i += 1) {
      const minY = adjusted[i - 1].y + MIN_Y_GAP;
      if (adjusted[i].y < minY) adjusted[i].y = minY;
    }
    const adjustedCenter = adjusted.reduce((sum, item) => sum + item.y, 0) / adjusted.length;
    const shift = adjustedCenter - originalCenter;
    for (const item of adjusted) {
      const current = next.get(item.id) || { x: (levels.get(item.id) ?? 0) * X_GAP, y: 0 };
      next.set(item.id, { x: current.x, y: item.y - shift });
    }
  }
  if (next.has(targetId)) next.set(targetId, { x: 0, y: 0 });
  return next;
}

function buildStableFocusLayout({ targetId, visibleIds, levels, parents, previousVisibleIds, previousPositions, byId }) {
  if (!previousPositions.size || !previousVisibleIds.has(targetId)) {
    const initial = new Map();
    for (const id of visibleIds) {
      const level = levels.get(id) ?? 0;
      const parent = parents.get(id);
      const sourcePosition = parent?.sourceId ? initial.get(parent.sourceId) || { x: 0, y: 0 } : { x: 0, y: 0 };
      initial.set(id, { x: level * X_GAP, y: id === targetId ? 0 : sourcePosition.y });
    }
    return enforceColumnSpacing(initial, visibleIds, levels, targetId);
  }
  const next = new Map();
  for (const id of visibleIds) {
    const oldPosition = previousPositions.get(id);
    const level = levels.get(id) ?? 0;
    if (oldPosition) next.set(id, { x: level * X_GAP, y: id === targetId ? 0 : oldPosition.y });
  }
  const newIds = Array.from(visibleIds).filter((id) => !previousVisibleIds.has(id) || !previousPositions.has(id));
  const groups = new Map();
  for (const id of newIds) {
    const parent = parents.get(id);
    const key = parent ? `${parent.sourceId}::${parent.direction}` : 'unknown';
    if (!groups.has(key)) groups.set(key, { parent, ids: [] });
    groups.get(key).ids.push(id);
  }
  for (const group of groups.values()) {
    group.ids.sort((a, b) => getConceptLabel(byId.get(a)).localeCompare(getConceptLabel(byId.get(b)), 'ko'));
    const sourcePosition = group.parent?.sourceId
      ? next.get(group.parent.sourceId) || previousPositions.get(group.parent.sourceId) || { x: 0, y: 0 }
      : { x: 0, y: 0 };
    const total = group.ids.length;
    group.ids.forEach((id, index) => {
      const level = levels.get(id) ?? 0;
      next.set(id, { x: level * X_GAP, y: (sourcePosition?.y ?? 0) + (index - (total - 1) / 2) * Y_GAP });
    });
  }
  for (const id of visibleIds) {
    if (!next.has(id)) next.set(id, { x: (levels.get(id) ?? 0) * X_GAP, y: 0 });
  }
  return enforceColumnSpacing(next, visibleIds, levels, targetId);
}

function buildFullLayout(visibleIds, concepts, prereqMap, successorMap, byId) {
  const depths = topologicalDepths(concepts, prereqMap, successorMap);
  const levels = new Map();
  for (const id of visibleIds) levels.set(id, depths.get(id) ?? 0);
  return distributeByLevel(Array.from(visibleIds), levels, byId);
}

function ConceptNode({ data }) {
  const mastery = MASTERY[data.masteryLevel] || MASTERY[0];
  const size = data.isTarget ? TARGET_NODE_SIZE : NODE_SIZE;
  const canUseLeftControls = data.isFocusMode && (data.graphSide === 'target' || data.graphSide === 'prereq');
  const canUseRightControls = data.isFocusMode && (data.graphSide === 'target' || data.graphSide === 'successor');
  const showLeftExpand = canUseLeftControls && data.hiddenPrereqCount > 0;
  const showRightExpand = canUseRightControls && data.hiddenSuccessorCount > 0;
  return (
    <div className="concept-node-wrap" style={{ width: size, height: size }}>
      <Handle id="left" type="target" position={Position.Left} className="invisible-handle" />
      <Handle id="right" type="source" position={Position.Right} className="invisible-handle" />
      {showLeftExpand && (
        <button className="expand-chip expand-chip-left nodrag nopan" title="직접 선행 개념 펼치기"
          onClick={(e) => { e.stopPropagation(); data.onToggleExpand(data.id, 'prereq'); }}>
          +{data.hiddenPrereqCount}
        </button>
      )}
      {canUseLeftControls && data.isPrereqExpanded && !showLeftExpand && (
        <button className="collapse-chip collapse-chip-left nodrag nopan" title="접기"
          onClick={(e) => { e.stopPropagation(); data.onToggleExpand(data.id, 'prereq'); }}>−</button>
      )}
      {showRightExpand && (
        <button className="expand-chip expand-chip-right nodrag nopan" title="직접 후속 개념 펼치기"
          onClick={(e) => { e.stopPropagation(); data.onToggleExpand(data.id, 'successor'); }}>
          +{data.hiddenSuccessorCount}
        </button>
      )}
      {canUseRightControls && data.isSuccessorExpanded && !showRightExpand && (
        <button className="collapse-chip collapse-chip-right nodrag nopan" title="접기"
          onClick={(e) => { e.stopPropagation(); data.onToggleExpand(data.id, 'successor'); }}>−</button>
      )}
      <div className={`concept-node ${data.isTarget ? 'target-node' : ''} ${data.isSelected ? 'selected-node' : ''}`}
        style={{ width: size, height: size, background: mastery.color, color: mastery.text }}>
        <div className="concept-label">{data.label}</div>
      </div>
    </div>
  );
}

function makeEdges(visibleIds, concepts, prereqMap, targetId) {
  const edges = [];
  for (const concept of concepts) {
    if (!visibleIds.has(concept.id)) continue;
    for (const prereq of prereqMap.get(concept.id) || []) {
      if (!visibleIds.has(prereq)) continue;
      const touchesTarget = concept.id === targetId || prereq === targetId;
      edges.push({
        id: `${prereq}->${concept.id}`,
        source: prereq, target: concept.id,
        sourceHandle: 'right', targetHandle: 'left',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: touchesTarget ? '#334155' : '#9CA3AF' },
        style: { stroke: touchesTarget ? '#334155' : '#9CA3AF', strokeWidth: touchesTarget ? 2.4 : 1.6 },
      });
    }
  }
  return edges;
}

function makeNodes({ visibleIds, positions, byId, prereqMap, successorMap, studentState, targetId, selectedNodeId, expandedKeys, onToggleExpand, viewMode, focusLevels }) {
  const isFocusMode = viewMode === 'focus';
  return Array.from(visibleIds).map((id) => {
    const concept = byId.get(id);
    const prereqs = getDirectPrereqs(id, prereqMap, byId);
    const successors = getDirectSuccessors(id, successorMap, byId);
    const hiddenPrereqCount = prereqs.filter((nodeId) => !visibleIds.has(nodeId)).length;
    const hiddenSuccessorCount = successors.filter((nodeId) => !visibleIds.has(nodeId)).length;
    const masteryLevel = clampMastery(studentState?.[id]?.mastery_level ?? 0);
    const position = positions.get(id) || { x: 0, y: 0 };
    const focusLevel = focusLevels?.get(id) ?? 0;
    const graphSide = id === targetId ? 'target' : focusLevel < 0 ? 'prereq' : focusLevel > 0 ? 'successor' : 'neutral';
    return {
      id, type: 'conceptNode', position,
      data: { id, label: getConceptLabel(concept), masteryLevel, isTarget: id === targetId, isSelected: id === selectedNodeId, graphSide, isFocusMode, hiddenPrereqCount, hiddenSuccessorCount, isPrereqExpanded: expandedKeys.has(makeExpansionKey(id, 'prereq')), isSuccessorExpanded: expandedKeys.has(makeExpansionKey(id, 'successor')), onToggleExpand },
    };
  });
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve(JSON.parse(String(reader.result))); } catch (error) { reject(error); } };
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// externalMastery: { [conceptId]: number (0-4) } from localStorage
// onStartLearning: (concept) => void
// onStartIntro: () => void
// targetConceptId: string | undefined — concept currently being learned (focus on this in graph)
// learningActive: bool — whether a learning session is in progress
// onReturnToLearning: () => void
export default function GraphMode({ externalMastery = {}, onStartLearning, onStartIntro, targetConceptId, learningActive, onReturnToLearning }) {
  const [concepts, setConcepts] = useState([]);
  const [baseStudentState, setBaseStudentState] = useState({});
  const [viewMode, setViewMode] = useState('focus');
  const [selectedContext, setSelectedContext] = useState(ALL_CONTEXTS);
  const [selectedArea, setSelectedArea] = useState(ALL_AREAS);
  const [targetId, setTargetId] = useState(() => targetConceptId || 'matrix_rank');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [positionMap, setPositionMap] = useState(() => new Map());
  const [searchText, setSearchText] = useState('');
  const [loadError, setLoadError] = useState('');
  const reactFlow = useReactFlow();
  const previousVisibleIdsRef = useRef(new Set());
  const previousPositionsRef = useRef(new Map());
  const lastActionRef = useRef(null);

  // When learning session changes target concept, sync the graph focus
  useEffect(() => {
    if (targetConceptId) {
      setTargetId(targetConceptId);
      setExpandedKeys(new Set());
      setSelectedNodeId(null);
      setPositionMap(new Map());
      previousVisibleIdsRef.current = new Set();
      previousPositionsRef.current = new Map();
      lastActionRef.current = null;
    }
  }, [targetConceptId]);

  // Merge localStorage mastery on top of JSON student state
  const studentState = useMemo(() => {
    const merged = { ...baseStudentState };
    for (const [id, level] of Object.entries(externalMastery)) {
      merged[id] = { mastery_level: level };
    }
    return merged;
  }, [baseStudentState, externalMastery]);

  useEffect(() => {
    async function loadData() {
      try {
        const [conceptResponse, stateResponse] = await Promise.all([
          fetch('/concepts.json'),
          fetch('/sample_student_state.json'),
        ]);
        const conceptJson = await conceptResponse.json();
        const stateJson = await stateResponse.json();
        const conceptList = Array.isArray(conceptJson?.concepts) ? conceptJson.concepts : [];
        setConcepts(conceptList);
        setBaseStudentState(stateJson || {});
        if (!conceptList.some((c) => c.id === targetId) && conceptList.length > 0) {
          setTargetId(conceptList[0].id);
        }
      } catch (error) {
        setLoadError(`데이터를 불러오지 못했습니다: ${error.message}`);
      }
    }
    loadData();
  }, []);

  const { byId, prereqMap, successorMap } = useMemo(() => buildIndexes(concepts), [concepts]);

  const contexts = useMemo(() => {
    const set = new Set();
    for (const concept of concepts) for (const ctx of concept.learning_contexts || []) set.add(ctx);
    return Array.from(set).sort();
  }, [concepts]);

  const areas = useMemo(() => {
    const set = new Set();
    for (const concept of concepts) set.add(concept.primary_area || 'other');
    return Array.from(set).sort();
  }, [concepts]);

  const targetOptions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return concepts
      .filter((concept) => {
        const inContext = selectedContext === ALL_CONTEXTS || (concept.learning_contexts || []).includes(selectedContext);
        const matchesSearch = !query || concept.id.toLowerCase().includes(query) || (concept.name_kr || '').toLowerCase().includes(query) || (concept.name_en || '').toLowerCase().includes(query);
        return inContext && matchesSearch;
      })
      .sort((a, b) => getConceptLabel(a).localeCompare(getConceptLabel(b), 'ko'));
  }, [concepts, selectedContext, searchText]);

  useEffect(() => {
    if (targetOptions.length > 0 && !targetOptions.some((c) => c.id === targetId)) {
      setTargetId(targetOptions[0].id);
      setExpandedKeys(new Set()); setSelectedNodeId(null); setPositionMap(new Map());
      previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); lastActionRef.current = null;
    }
  }, [targetOptions, targetId]);

  const handleToggleExpand = useCallback((nodeId, direction) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      const key = makeExpansionKey(nodeId, direction);
      if (next.has(key)) next.delete(key); else next.add(key);
      lastActionRef.current = { nodeId, direction, mode: next.has(key) ? 'expand' : 'collapse' };
      return next;
    });
  }, []);

  const handleResetFocus = useCallback(() => {
    lastActionRef.current = null;
    previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map();
    setExpandedKeys(new Set()); setSelectedNodeId(null); setPositionMap(new Map());
    window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.22, duration: 250 }));
  }, [reactFlow]);

  const handleConceptUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const json = await readJsonFile(file);
      if (!Array.isArray(json?.concepts)) throw new Error('concepts 배열이 없습니다.');
      setConcepts(json.concepts);
      setExpandedKeys(new Set()); setSelectedNodeId(null); setPositionMap(new Map());
      previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); lastActionRef.current = null;
      if (json.concepts.length) setTargetId(json.concepts[0].id);
      setLoadError('');
    } catch (error) { setLoadError(`개념 JSON 업로드 실패: ${error.message}`); }
    finally { event.target.value = ''; }
  }, []);

  const handleStudentStateUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const json = await readJsonFile(file);
      setBaseStudentState(json || {}); setLoadError('');
    } catch (error) { setLoadError(`학생 상태 JSON 업로드 실패: ${error.message}`); }
    finally { event.target.value = ''; }
  }, []);

  const focusState = useMemo(() => {
    if (!concepts.length || viewMode !== 'focus') return { visibleIds: new Set(), levels: new Map(), parents: new Map() };
    return computeFocusState(targetId, expandedKeys, prereqMap, successorMap, byId);
  }, [concepts.length, viewMode, targetId, expandedKeys, prereqMap, successorMap, byId]);

  const visibleIds = useMemo(() => {
    if (!concepts.length) return new Set();
    if (viewMode === 'full') return new Set(concepts.filter((c) => selectedArea === ALL_AREAS || (c.primary_area || 'other') === selectedArea).map((c) => c.id));
    return focusState.visibleIds;
  }, [concepts, viewMode, selectedArea, focusState]);

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set();
      for (const key of prev) { const parsed = parseExpansionKey(key); if (parsed && visibleIds.has(parsed.nodeId)) next.add(key); }
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [visibleIds]);

  useEffect(() => {
    if (!concepts.length) return;
    if (viewMode === 'full') {
      const fullPositions = buildFullLayout(visibleIds, concepts, prereqMap, successorMap, byId);
      setPositionMap(fullPositions); previousVisibleIdsRef.current = new Set(visibleIds); previousPositionsRef.current = fullPositions;
      return;
    }
    const nextPositions = buildStableFocusLayout({ targetId, visibleIds, levels: focusState.levels, parents: focusState.parents, previousVisibleIds: previousVisibleIdsRef.current, previousPositions: previousPositionsRef.current, byId });
    setPositionMap(nextPositions); previousVisibleIdsRef.current = new Set(visibleIds); previousPositionsRef.current = nextPositions;
  }, [concepts, viewMode, visibleIds, targetId, selectedArea, prereqMap, successorMap, byId, focusState]);

  const nodes = useMemo(() => makeNodes({ visibleIds, positions: positionMap, byId, prereqMap, successorMap, studentState, targetId, selectedNodeId, expandedKeys, onToggleExpand: handleToggleExpand, viewMode, focusLevels: focusState.levels }),
    [visibleIds, positionMap, byId, prereqMap, successorMap, studentState, targetId, selectedNodeId, expandedKeys, handleToggleExpand, viewMode, focusState]);

  const edges = useMemo(() => makeEdges(visibleIds, concepts, prereqMap, targetId), [visibleIds, concepts, prereqMap, targetId]);

  const selectedConcept = byId.get(selectedNodeId) || byId.get(targetId);
  const nodeTypes = useMemo(() => ({ conceptNode: ConceptNode }), []);

  useEffect(() => {
    if (nodes.length) window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.22, duration: 250 }));
  }, [reactFlow, viewMode, targetId, selectedArea, concepts.length]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-title">KnowGap</div>
          <div className="brand-subtitle">선형대수 개념 Mind Map</div>
        </div>

        {learningActive && onReturnToLearning && (
          <div className="return-learning-block">
            <p className="return-learning-hint">학습 세션 진행 중</p>
            <button className="return-learning-btn" onClick={onReturnToLearning}>
              ← 학습으로 돌아가기
            </button>
          </div>
        )}

        {!learningActive && onStartIntro && (
          <div className="intro-entry-block">
            <p className="intro-entry-hint">어디서부터 시작해야 할지 모르겠다면?</p>
            <button className="intro-entry-btn" onClick={onStartIntro}>
              모르는 내용 설명하기 →
            </button>
          </div>
        )}

        <section className="panel-section">
          <label className="field-label">보기 모드</label>
          <div className="segmented-control">
            <button className={viewMode === 'focus' ? 'active' : ''} onClick={() => { lastActionRef.current = null; previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); setPositionMap(new Map()); setViewMode('focus'); }}>부분그래프</button>
            <button className={viewMode === 'full' ? 'active' : ''} onClick={() => { lastActionRef.current = null; previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); setPositionMap(new Map()); setViewMode('full'); }}>전체 그래프</button>
          </div>
        </section>

        {viewMode === 'focus' ? (
          <>
            <section className="panel-section">
              <label className="field-label">학습 context</label>
              <select value={selectedContext} onChange={(e) => setSelectedContext(e.target.value)}>
                <option value={ALL_CONTEXTS}>전체 context</option>
                {contexts.map((ctx) => <option key={ctx} value={ctx}>{ctx}</option>)}
              </select>
              <p className="field-help">context는 target 후보를 좁히는 필터입니다.</p>
            </section>
            <section className="panel-section">
              <label className="field-label">개념 검색</label>
              <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="예: 랭크, rank, matrix_rank" />
            </section>
            <section className="panel-section">
              <label className="field-label">target 노드</label>
              <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setExpandedKeys(new Set()); setSelectedNodeId(null); setPositionMap(new Map()); previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); lastActionRef.current = null; }}>
                {targetOptions.map((c) => <option key={c.id} value={c.id}>{getConceptLabel(c)} · {c.id}</option>)}
              </select>
              <button className="secondary-button" onClick={handleResetFocus}>초기 상태로 접기</button>
            </section>
          </>
        ) : (
          <section className="panel-section">
            <label className="field-label">primary_area 필터</label>
            <select value={selectedArea} onChange={(e) => { lastActionRef.current = null; previousVisibleIdsRef.current = new Set(); previousPositionsRef.current = new Map(); setPositionMap(new Map()); setSelectedArea(e.target.value); }}>
              <option value={ALL_AREAS}>전체 영역</option>
              {areas.map((area) => <option key={area} value={area}>{AREA_LABELS[area] || area}</option>)}
            </select>
          </section>
        )}

        <section className="panel-section legend-section">
          <label className="field-label">이해도 색상</label>
          {Object.entries(MASTERY).map(([level, info]) => (
            <div className="legend-row" key={level}>
              <span className="legend-dot" style={{ background: info.color }} />
              <span>{level} · {info.label}</span>
            </div>
          ))}
        </section>

        <section className="panel-section">
          <label className="field-label">JSON 업로드</label>
          <label className="file-button">개념 JSON 교체<input type="file" accept="application/json,.json" onChange={handleConceptUpload} /></label>
          <label className="file-button">학생 상태 JSON 교체<input type="file" accept="application/json,.json" onChange={handleStudentStateUpload} /></label>
        </section>

        {loadError && <div className="error-box">{loadError}</div>}

        {selectedConcept && (
          <section className="detail-card">
            <div className="detail-eyebrow">선택 노드</div>
            <h2>{getConceptLabel(selectedConcept)}</h2>
            <div className="detail-id">{selectedConcept.id}</div>
            <div className="detail-meta"><span>{AREA_LABELS[selectedConcept.primary_area] || selectedConcept.primary_area || '영역 없음'}</span></div>
            <div className="detail-contexts">
              {(selectedConcept.learning_contexts || []).map((ctx) => <span key={ctx}>{ctx}</span>)}
            </div>
            <div className="detail-block">
              <strong>must_have</strong>
              <ul>{(selectedConcept.must_have || []).slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="detail-block">
              <strong>recheck_question</strong>
              <p>{shortText(selectedConcept.recheck_question, 120)}</p>
            </div>
            {onStartLearning && (
              <button className="learn-start-btn" onClick={() => onStartLearning(selectedConcept)}>
                이 개념 학습하기 →
              </button>
            )}
          </section>
        )}
      </aside>

      <main className="flow-area">
        <div className="top-bar">
          <div>
            <strong>{viewMode === 'focus' ? '부분그래프' : '전체 그래프'}</strong>
            <span>{nodes.length} nodes · {edges.length} edges</span>
          </div>
          <div className="rule-summary">
            {viewMode === 'focus' ? '초기: target + 직접 선행 + 직접 후속 · 선행은 왼쪽으로만, 후속은 오른쪽으로만 1단계씩 펼침' : '전체 그래프: primary_area 필터와 prerequisite DAG 표시'}
          </div>
        </div>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          minZoom={0.08} maxZoom={1.8} fitView fitViewOptions={{ padding: 0.22 }}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable
          proOptions={{ hideAttribution: true }}>
          <Background gap={24} size={1} />
          <Controls position="bottom-right" />
          <MiniMap position="bottom-left" pannable zoomable nodeColor={(node) => MASTERY[clampMastery(node.data?.masteryLevel ?? 0)].color} />
        </ReactFlow>
      </main>
    </div>
  );
}
