# KnowGap 프롬프트 5종 (Claude Code 핸드오프용)

| 파일 | 역할 |
|---|---|
| prompt1_문제생성.txt | Classification+Why 문제 생성 (시드 기반 변형, 정답 재검증) |
| prompt2_답변판별.txt | 1차 답변 판정 (통과/부분/실패) |
| prompt3_다음노드결정.txt | 실패 시 선행노드 탐색 |
| prompt4_집중학습.txt | gap_type별 개인화 학습 콘텐츠 생성 |
| prompt5_2차점검.txt | 음성 재점검 + 최종 피드백 생성 |

각 파일 하단에 "# 참고" 주석으로, 코드로 뺄 수 있는 판정 로직(judgment,
next_action, overall_result)이 어디에 해당하는지 표시해뒀습니다. 실제 함수
구현은 `claude_code_핸드오프_판정로직스펙.md` 참고.

## 함께 필요한 파일
- `claude_code_핸드오프_판정로직스펙.md`: determine_judgment / determine_next_action / determine_overall_result 함수 구현 스펙
- `데이터_인터페이스_계약서.md`: 프롬프트가 그래프에서 받아야 할 필드 정의
- `knowgap_linear_algebra_concepts_v1_with_relation_recheck_contexts.json`: 그래프 데이터 (105 노드)

## 처리 흐름
```
① 문제생성 → 학생답변 → ② 답변판별
                            ├─ 통과 → 종료
                            ├─ 부분 → gap(shallow) → ④ 집중학습
                            └─ 실패 → ③ 다음노드결정(반복 가능) → gap(conceptual) → ④ 집중학습
                                                                                        ↓
                                                                              ⑤ 2차점검 → 피드백 종료
```
