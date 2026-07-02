# KnowGap React Mind Map Visualizer

React Flow 기반 선형대수 개념 그래프 시각화 프로토타입입니다.

## 핵심 UX 규칙

- 노드 모양: 원
- 노드 내부 텍스트: `name_kr`
- 노드 색: `mastery_level`
  - 0 미진단: 회색
  - 1 공백: 빨강
  - 2 오개념: 주황
  - 3 얕은 이해: 노랑
  - 4 충분 이해: 초록
- 일반 노드 크기: 동일
- target 노드: 아주 조금 더 큼 + 파란 외곽선
- 접힌 노드: 작게 표시하지 않고 화면에서 완전히 숨김
- 부분그래프 초기 화면: `target + 직접 선행 + 직접 후속`
- 펼치기: target은 양방향, target 왼쪽 노드는 선행 방향만, target 오른쪽 노드는 후속 방향만 `+n` 배지로 1단계 확장
- 접기: 노드 좌우의 `−` 배지를 눌러 해당 방향으로 펼친 가지를 접음
- 접기 보존 규칙: 다른 펼쳐진 경로나 초기 target 주변 노드로 필요한 노드는 유지됨
- 위치 보존: 펼치기/접기 시 기존 노드의 상대적 위치를 유지하고, 같은 열에서 간격이 부족할 때만 순서를 유지한 채 간격을 벌림
- 자동 화면 이동 제한: target 변경/보기 모드 변경 때만 fitView를 적용하고, 노드 펼치기/접기 때는 화면을 강제로 재배치하지 않음

## 실행 방법

```bash
cd knowgap_react_mindmap_visualizer
npm install
npm run dev
```

브라우저에서 Vite가 안내하는 로컬 주소를 열면 됩니다.

## 파일 구조

```text
knowgap_react_mindmap_visualizer/
├─ package.json
├─ index.html
├─ public/
│  ├─ concepts.json
│  └─ sample_student_state.json
└─ src/
   ├─ main.jsx
   ├─ App.jsx
   └─ styles.css
```

## 데이터 입력

기본으로 포함된 `public/concepts.json`은 다음 필드를 사용합니다.

```json
{
  "id": "matrix_rank",
  "name_kr": "행렬 랭크",
  "prerequisites": ["dimension", "column_space"],
  "primary_area": "rank_nullity",
  "learning_contexts": ["rank", "rank_nullity"]
}
```

학생 상태 JSON은 다음처럼 단순화된 5단계 상태만 사용합니다.

```json
{
  "column_space": { "mastery_level": 1 },
  "span": { "mastery_level": 3 },
  "linear_combination": { "mastery_level": 4 }
}
```

앱 왼쪽 패널에서 개념 JSON과 학생 상태 JSON을 직접 업로드할 수 있습니다.

## 부분그래프 동작

부분그래프는 `learning_context`와 `target`을 선택해 시작합니다.

- `learning_context`: target 후보를 줄이는 필터
- `target`: 화면 중앙의 중심 노드
- 실제 확장/접기 구조: `prerequisites`와 그 역방향 successor 관계

초기에는 target의 직접 선행과 직접 후속만 보여줍니다. 이후 사용자가 각 노드의 좌우 배지를 눌러 NotebookLM Mind Map처럼 직접 펼치고 접습니다. 한 번의 펼치기 클릭은 클릭한 노드의 바로 이전 또는 바로 다음 노드만 추가합니다. target 왼쪽에 있는 선행 노드는 더 왼쪽 선행 방향으로만 펼쳐지고, target 오른쪽에 있는 후속 노드는 더 오른쪽 후속 방향으로만 펼쳐집니다. 새로 추가된 노드의 다음 단계는 사용자가 그 노드를 다시 펼칠 때까지 숨겨둡니다.

## 전체 그래프

전체 그래프 모드는 모든 노드를 prerequisite DAG 방향으로 배치합니다. `primary_area`로 필터링할 수 있습니다.
