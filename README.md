# 이곳에서 함께 작업합시듀
그럽시듀

---

## KnowGap — 선형대수 학습 진단 시스템

학생이 선형대수 개념을 얼마나 이해하고 있는지 LLM 기반으로 진단하고, 공백 개념을 찾아 집중 학습을 제공하는 시스템입니다.

### 구조

```
backend/      # FastAPI 백엔드 (Python)
frontend/     # React + ReactFlow 프론트엔드
prompt*.txt   # LLM 프롬프트 설계 문서
```

### 주요 기능

- **자유 서술 → 개념 식별**: 학생이 모르는 내용을 자유롭게 입력하면 AI가 학습할 개념 노드를 추천
- **5단계 진단 파이프라인**: 문제 생성(P1) → 답변 평가(P2) → 다음 노드 결정(P3) → 집중 학습(P4) → 2차 점검(P5)
- **그래프 시각화**: 105개 선형대수 개념 노드를 ReactFlow로 시각화, 학습 결과에 따라 노드 색상 실시간 반영
- **자유 화면 전환**: 학습 중에도 그래프 화면으로 이동하거나 다시 학습으로 복귀 가능

### 실행 방법

**백엔드**
```bash
cd backend
pip install -r requirements.txt
# .env 파일에 OPENAI_API_KEY 설정
uvicorn main:app --reload
```

**프론트엔드**
```bash
cd frontend
npm install
npm run dev
```

### 프롬프트 파일

| 파일 | 역할 |
|---|---|
| prompt1_문제생성.txt | Classification+Why 문제 생성 |
| prompt2_답변판별.txt | 1차 답변 판정 (통과/부분/실패) |
| prompt3_다음노드결정.txt | 실패 시 선행노드 탐색 |
| prompt4_집중학습.txt | gap_type별 개인화 학습 콘텐츠 생성 |
| prompt5_2차점검.txt | 음성 재점검 + 최종 피드백 생성 |
