# NI3-study: MLP에서 GNN/GCN까지

> 이 저장소는 MkDocs Material과 GitHub Pages로 공개할 수 있도록 구성되어 있다. 공개 사이트의 시작 문서는 `docs/index.md`이며, `main` 브랜치에 push하면 GitHub Actions가 사이트를 빌드한다.

NI3 내부 기초 스터디를 위한 한국어 학습 자료다. 독자는 다음 내용을 안다고 가정한다.

- 머신러닝: 선형층, 다층 퍼셉트론(MLP), 활성화 함수, softmax, 교차 엔트로피, 역전파
- 자료구조: 그래프, 정점과 간선, 인접 행렬/인접 리스트, BFS

목표는 두 원문을 서로 보완적으로 읽는 것이다.

1. *A Gentle Introduction to Graph Neural Networks*는 그래프 데이터, 예측 단위, 순열 대칭성, 집계와 메시지 패싱의 직관을 담당한다.
2. Kipf와 Welling의 *Semi-Supervised Classification with Graph Convolutional Networks*는 GCN의 정규화된 전파식, 반지도 노드 분류, 실험을 담당한다.

## 학습 목표

이 자료를 마치면 다음을 설명하고 계산할 수 있어야 한다.

- 그래프의 정점·간선·전체 그래프 특성을 텐서로 표현한다.
- MLP와 GNN의 차이를 “이웃 정보 사용 여부”와 “가중치 공유”로 설명한다.
- 합·평균·최댓값 집계가 왜 정점 순서에 영향을 받지 않는지 설명한다.
- $\tilde A=A+I$와 $\tilde D^{-1/2}\tilde A\tilde D^{-1/2}$를 작은 그래프에서 직접 계산한다.
- 2층 GCN의 각 행렬 차원과 한 정점의 수용 영역(receptive field)을 추적한다.
- 논문의 실험 결과와 한계를 과장 없이 해석한다.

## 4회차 권장 진행

| 회차 | 시간 | 읽을 자료 | 핵심 활동 |
|---|---:|---|---|
| 1. 그래프를 신경망 입력으로 보기 | 70분 | `docs/01_gnn_gentle_guide.md` 전반부 | 이미지·텍스트·분자를 그래프로 바꾸고 세 예측 단위를 구분한다. |
| 2. 메시지 패싱 | 80분 | `docs/01_gnn_gentle_guide.md` 후반부, `docs/03_bridge_mlp_to_gcn.md` | $AX$를 손으로 계산하고 MLP → 이웃 집계 → GCN의 연결을 이해한다. |
| 3. Kipf–Welling GCN | 100분 | `docs/02_kipf2017_gcn_guide.md` | 식 (2), (8), (9)를 중심으로 정규화와 반지도 학습을 이해한다. |
| 4. 계산·비판·설계 | 90분 | `docs/04_exercises.md` | 정규화 행렬과 한 층 출력을 계산하고, 모델 깊이·집계 방식·평가 설정을 토론한다. |

## 파일 안내

- `docs/01_gnn_gentle_guide.md`: Distill 글의 입문자용 해설
- `docs/02_kipf2017_gcn_guide.md`: Kipf–Welling 논문의 절별 해설
- `docs/03_bridge_mlp_to_gcn.md`: 이미 아는 MLP에서 GCN으로 가는 짧은 연결 문서
- `docs/04_exercises.md`: 90분용 문제 8개와 해설
- `sources/kipf2017.pdf`: 제공된 논문 원본
- `sources/Gentle introduction to GNN.txt`: 제공된 URL 파일

## 읽는 법

수식이 막히면 다음 세 질문으로 되돌아간다.

1. 행(row)은 무엇인가? 대부분 정점이다.
2. 열(column)은 무엇인가? 대부분 특성 채널이다.
3. 이 곱은 정점 축을 섞는가, 특성 축을 섞는가?

$\hat A H$는 정점 축에서 이웃 정보를 섞고, $HW$는 각 정점 안에서 특성 채널을 섞는다. GCN 한 층은 이 두 연산을 결합한 것이다.

## 표기

| 기호 | 의미 | 대표 차원 |
|---|---|---|
| $N$ | 정점 수 | 스칼라 |
| $C$ | 입력 특성 수 | 스칼라 |
| $F$ | 출력 특성/클래스 수 | 스칼라 |
| $A$ | 인접 행렬 | $N\times N$ |
| $X=H^{(0)}$ | 입력 정점 특성 | $N\times C$ |
| $W^{(l)}$ | $l$번째 층의 학습 가중치 | $F_l\times F_{l+1}$ |
| $\tilde A=A+I$ | 자기 연결을 더한 인접 행렬 | $N\times N$ |
| $\hat A=\tilde D^{-1/2}\tilde A\tilde D^{-1/2}$ | 대칭 정규화 전파 행렬 | $N\times N$ |

## 원문과 해설을 구분하는 규칙

- `[원문]`은 논문/글이 직접 설명하거나 보고한 내용이다.
- `[해설]`은 이해를 돕기 위한 비유, 재구성, 계산 팁이다.
- “오버스무딩”처럼 2017년 논문의 핵심 용어가 아닌 후대의 표현은 명시적으로 구분한다.
- 실험 수치는 데이터 분할, 학습 방식, 평가 조건과 함께 읽는다.

## 출처

- Thomas N. Kipf and Max Welling, “Semi-Supervised Classification with Graph Convolutional Networks,” ICLR 2017, arXiv:1609.02907v4.
- Benjamin Sanchez-Lengeling, Emily Reif, Adam Pearce, and Alexander B. Wiltschko, “A Gentle Introduction to Graph Neural Networks,” *Distill*, 2021, DOI: 10.23915/distill.00033.

이 저장소의 문서는 원문의 대체물이 아니라 스터디용 해설이다. 그림과 상호작용 예시는 원문에서 직접 확인하는 것을 권장한다.

## 로컬 웹 미리보기

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m mkdocs serve
```

엄격한 배포 빌드는 다음 명령으로 확인한다.

```powershell
.\.venv\Scripts\python -m mkdocs build --strict
```

`sources/`는 원문 보관용이며 MkDocs 공개 사이트에는 포함되지 않는다.
