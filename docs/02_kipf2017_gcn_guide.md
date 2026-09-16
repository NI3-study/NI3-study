# Kipf–Welling GCN 논문 해설

> 원문: Thomas N. Kipf and Max Welling, “Semi-Supervised Classification with Graph Convolutional Networks,” ICLR 2017

이 문서는 논문의 식을 모두 증명하는 대신, 이미 MLP를 아는 학생이 “왜 이 전파식이 나왔고 실제로 무엇을 계산하는가”를 이해하도록 돕는다.

## 학습 목표

- 반지도 노드 분류와 transductive 설정을 설명한다.
- 식 (2)의 각 행렬 차원과 역할을 말한다.
- spectral convolution에서 1차 근사와 renormalization trick으로 가는 논리의 뼈대를 설명한다.
- 작은 그래프에서 $\tilde A$, $\tilde D$, $\hat A$와 한 층 출력을 계산한다.
- 논문의 실험 결과, 비교 범위, 한계를 구분한다.

## 1. 문제 설정: 라벨은 적고 그래프와 특성은 있다 { #semi-supervised-setup }

논문이 다루는 대표 예는 인용 네트워크다.

- 정점: 논문
- 간선: 인용 관계를 무방향으로 만든 연결
- 정점 특성: 논문의 희소 bag-of-words 벡터
- 정답: 논문 주제 클래스
- 학습 라벨: 전체 정점 중 일부에만 존재

[원문] 목표는 정점 특성 $X$와 그래프 구조 $A$를 함께 사용해 라벨이 없는 정점의 클래스를 예측하는 것이다. 모델 $f(X,A)$를 전체 그래프에 적용하지만 손실은 라벨이 있는 정점에 대해서만 계산한다. [Kipf & Welling 2017, §1, §3]

이 설정은 **반지도(semi-supervised)** 이면서, 학습 시 예측 대상 정점과 그 연결 구조 및 특성을 이미 보는 **transductive node classification**이다.

[해설] 라벨 없는 정점은 손실의 정답 항에는 들어가지 않지만 쓸모없는 데이터가 아니다. 메시지 패싱 경로와 특성 $X$를 통해 라벨 있는 정점과 없는 정점의 표현 계산에 모두 참여한다.

## 2. 기존 접근과 논문의 전환

논문은 먼저 연결된 정점의 출력이 비슷해야 한다는 그래프 라플라시안 정규화 예를 든다.

$$
\mathcal L=\mathcal L_0+\lambda\mathcal L_{reg},
\qquad
\mathcal L_{reg}=\sum_{i,j}A_{ij}\|f(X_i)-f(X_j)\|^2
=f(X)^\top\Delta f(X).
\tag{1}
$$

여기서 $\Delta=D-A$는 비정규화 그래프 라플라시안이다. [Kipf & Welling 2017, Eq. (1)]

[원문] 이 방식은 간선이 정점 유사성만 나타낸다고 강하게 가정할 수 있다. 논문은 정규화 항을 별도로 더하기보다, $f(X,A)$ 안에 인접 구조 자체를 넣어 표현을 학습한다. [Kipf & Welling 2017, §1]

[해설] 손실 함수가 그래프를 “벌점”으로 보는 방식에서, 신경망의 forward 계산 자체가 그래프를 따라 정보를 전달하는 방식으로 옮겨간 것이다.

## 3. 먼저 볼 최종식 { #gcn-layer }

논문의 GCN 한 층은 다음과 같다.

$$
H^{(l+1)}=sigma\left(
\tilde D^{-1/2}\tilde A\tilde D^{-1/2}H^{(l)}W^{(l)}
\right).
\tag{2}
$$

정의는 다음과 같다.

$$
\tilde A=A+I_N,
\qquad
\tilde D_{ii}=\sum_j\tilde A_{ij},
\qquad
\hat A=\tilde D^{-1/2}\tilde A\tilde D^{-1/2}.
$$

그러면 식 (2)는 짧게

$$
H^{(l+1)}=\sigma(\hat A H^{(l)}W^{(l)})
$$

이다. [Kipf & Welling 2017, Eq. (2)]

### 행렬 차원 { #matrix-dims }

$l$층 입력 채널 수를 $F_l$, 출력 채널 수를 $F_{l+1}$라 하자.

| 행렬 | 차원 | 하는 일 |
|---|---|---|
| $\hat A$ | $N\times N$ | 정점 축에서 자기 자신과 이웃 정보를 섞는다. |
| $H^{(l)}$ | $N\times F_l$ | 정점별 현재 표현 |
| $W^{(l)}$ | $F_l\times F_{l+1}$ | 특성 축을 학습 가능하게 변환한다. |
| $H^{(l+1)}$ | $N\times F_{l+1}$ | 갱신된 정점 표현 |

$$
(N\times N)(N\times F_l)(F_l\times F_{l+1})
=N\times F_{l+1}.
$$

[해설] $\hat A$는 “누구의 정보를 섞을지”, $W$는 “섞인 특성을 어떤 새 특성으로 바꿀지” 담당한다. $W$ 하나를 모든 정점에 공유하므로 정점 수에 비례해 새로운 파라미터가 생기지 않는다.

## 4. 왜 spectral graph convolution에서 시작하는가 { #spectral }

### 4.1 그래프 라플라시안의 고유벡터를 푸리에 기저로 본다

정규화 라플라시안은

$$
L=I_N-D^{-1/2}AD^{-1/2}=U\Lambda U^\top
$$

로 고유분해된다. $U^\top x$를 그래프 신호 $x\in\mathbb R^N$의 그래프 푸리에 변환처럼 보고, 주파수 영역 필터 $g_\theta(\Lambda)$를 적용하면

$$
g_\theta\star x=Ug_\theta(\Lambda)U^\top x.
\tag{3}
$$

가 된다. [Kipf & Welling 2017, §2.1, Eq. (3)]

[해설] 이미지에서는 규칙적 격자의 푸리에 모드가 있지만, 불규칙 그래프에서는 라플라시안 고유벡터가 그래프에 맞춘 부드러운/진동하는 모드 역할을 한다.

### 4.2 그대로 계산하면 비싸고 그래프마다 기저가 다르다

$U$를 구하는 고유분해와 조밀한 행렬 곱은 큰 그래프에 부담이 된다. 논문은 선행 연구의 Chebyshev 다항식 근사를 사용한다.

$$
g_{\theta'}(\Lambda)\approx\sum_{k=0}^{K}\theta'_kT_k(\tilde\Lambda)
\tag{4}
$$

이므로 정점 영역에서는

$$
g_{\theta'}\star x\approx
\sum_{k=0}^{K}\theta'_kT_k(\tilde L)x.
\tag{5}
$$

[원문] 이 식은 라플라시안의 $K$차 다항식이므로 최대 $K$-hop 이웃에 국소화되고, 희소 연산으로 간선 수에 선형인 계산이 가능하다. [Kipf & Welling 2017, Eq. (4), Eq. (5)]

### 4.3 $K=1$로 단순화한다

논문은 각 층을 1-hop으로 제한하고 여러 층을 쌓는다. 또한 $\lambda_{max}\approx2$로 두면 1차 근사는

$$
g_{\theta'}\star x
\approx \theta'_0x-\theta'_1D^{-1/2}AD^{-1/2}x.
\tag{6}
$$

가 된다. [Kipf & Welling 2017, §2.2, Eq. (6)]

다시 파라미터를 $\theta=\theta'_0=-\theta'_1$로 묶으면

$$
g_\theta\star x\approx
\theta\left(I_N+D^{-1/2}AD^{-1/2}\right)x.
\tag{7}
$$

[해설] 여기서 파라미터를 묶는 것은 수학적으로 유일한 필연이 아니라, 파라미터와 연산을 줄이고 과적합을 억제하려는 모델링 선택이다.

### 4.4 renormalization trick

$I+D^{-1/2}AD^{-1/2}$를 깊게 반복하면 고유값 범위 때문에 수치 불안정과 gradient 문제가 생길 수 있다. 논문은 다음 치환을 사용한다.

$$
I_N+D^{-1/2}AD^{-1/2}
\quad\longrightarrow\quad
\tilde D^{-1/2}\tilde A\tilde D^{-1/2},
$$

$$
\tilde A=A+I_N.
$$

다채널 입력 $X\in\mathbb R^{N\times C}$와 $F$개 출력 채널로 일반화하면

$$
Z=\tilde D^{-1/2}\tilde A\tilde D^{-1/2}X\Theta,
\qquad
\Theta\in\mathbb R^{C\times F}.
\tag{8}
$$

[Kipf & Welling 2017, Eq. (7), Eq. (8)]

이 식이 식 (2)의 한 층으로 이어진다.

## 5. 자기 연결과 대칭 정규화의 의미 { #self-loop-normalization }

### 자기 연결 $\tilde A=A+I$

이웃만 더하면 갱신 과정에서 자신의 기존 특성이 빠진다. $I$를 더하면 정점 $i$가 자신에게 보내는 메시지도 생긴다.

### 대칭 정규화 $\tilde D^{-1/2}\tilde A\tilde D^{-1/2}$

간선 $(i,j)$를 통한 계수는

$$
\hat A_{ij}=\frac{\tilde A_{ij}}{\sqrt{\tilde d_i\tilde d_j}}
$$

이다. 차수가 큰 정점의 합이 무조건 커지는 것을 완화하면서 무방향 그래프에서 대칭성을 유지한다.

[해설] 평균 $\tilde D^{-1}\tilde A$와 완전히 같지는 않다. 대칭 정규화는 보내는 정점과 받는 정점의 차수를 모두 반영한다.

### 두 가중치를 숫자로 비교하기 { #viz-normalization }

<div class="gnn-viz" data-gnn-viz="normalization" markdown="0">
차수가 불균형한 그래프에서 원본 $A+I$ 가중치와 대칭 정규화 $\hat A$ 가중치를 바꿔 가며 비교하는 인터랙티브 요소입니다. JavaScript가 꺼져 있으면 아래 6절의 손계산이 같은 계산을 단계별로 보여 줍니다.
</div>

## 6. 4개 정점 손계산 { #hand-calc }

무방향 간선

$$
E=\{(1,2),(1,3),(2,4)\}
$$

와 스칼라 정점 특성

$$
X=\begin{bmatrix}1\\2\\3\\4\end{bmatrix}
$$

를 사용한다.

### 6.1 자기 연결 추가

$$
\tilde A=
\begin{bmatrix}
1&1&1&0\\
1&1&0&1\\
1&0&1&0\\
0&1&0&1
\end{bmatrix}.
$$

행 합은 $\tilde d=(3,3,2,2)$이므로

$$
\tilde D^{-1/2}=\operatorname{diag}
\left(\frac1{\sqrt3},\frac1{\sqrt3},\frac1{\sqrt2},\frac1{\sqrt2}\right).
$$

### 6.2 정규화 행렬

$$
\hat A=
\begin{bmatrix}
\frac13&\frac13&\frac1{\sqrt6}&0\\
\frac13&\frac13&0&\frac1{\sqrt6}\\
\frac1{\sqrt6}&0&\frac12&0\\
0&\frac1{\sqrt6}&0&\frac12
\end{bmatrix}.
$$

### 6.3 이웃 집계

$$
\hat AX\approx
\begin{bmatrix}
2.2247\\
2.6330\\
1.9082\\
2.8165
\end{bmatrix}.
$$

예를 들어 정점 1은

$$
\frac13(1)+\frac13(2)+\frac1{\sqrt6}(3)\approx2.2247
$$

을 얻는다. 자기 자신, 정점 2, 정점 3의 특성이 차수에 따라 정규화되어 섞였다.

가중치가 스칼라 $W=[2]$이고 활성화가 ReLU라면

$$
H^{(1)}=\operatorname{ReLU}(\hat AXW)
\approx
\begin{bmatrix}
4.4495\\5.2660\\3.8165\\5.6330
\end{bmatrix}.
$$

[해설] 실제 모델에서는 각 행이 벡터이므로 $W$가 여러 특성 채널을 섞는다. 하지만 정점 축의 $\hat A$ 계산은 같다.

## 7. 2층 GCN과 반지도 손실

논문의 2층 모델은

$$
Z=f(X,A)=\operatorname{softmax}\left(
\hat A\operatorname{ReLU}(\hat AXW^{(0)})W^{(1)}
\right).
\tag{9}
$$

이다. [Kipf & Welling 2017, §3.1, Eq. (9)]

차원을 따라가 보자.

$$
X:N\times C,
\quad W^{(0)}:C\times H,
\quad H^{(1)}:N\times H,
$$

$$
W^{(1)}:H\times F,
\quad Z:N\times F.
$$

각 행의 softmax는 그 정점의 클래스 확률을 만든다. 손실은 라벨이 있는 정점 집합 $\mathcal Y_L$에서만 계산한다.

$$
\mathcal L=-\sum_{l\in\mathcal Y_L}\sum_{f=1}^{F}Y_{lf}\ln Z_{lf}.
\tag{10}
$$

[Kipf & Welling 2017, Eq. (10)]

그래도 backpropagation은 $\hat A$가 만든 계산 그래프를 따라 공유 가중치 $W^{(0)},W^{(1)}$에 전달된다. 모든 정점의 특성과 연결이 forward 표현 계산에 쓰인다.

## 8. 계산 복잡도와 구현

[원문] $\tilde A$를 희소 행렬로 저장하면 식 (8)의 희소-조밀 곱 비용은 $O(|E|FC)$이며 간선 수에 선형이다. 2층 모델도 희소 연산을 사용한다. 논문 실험은 데이터 전체를 매 epoch 사용하는 full-batch gradient descent를 사용했다. [Kipf & Welling 2017, §2.2, §3.2]

최소 NumPy 형태의 의사코드는 다음과 같다.

```python
# A: (N, N), X: (N, C)
A_tilde = A + I
d = A_tilde.sum(axis=1)
D_inv_sqrt = diag(d ** -0.5)
A_hat = D_inv_sqrt @ A_tilde @ D_inv_sqrt

H = relu(A_hat @ X @ W0)
logits = A_hat @ H @ W1
Z = softmax(logits, axis=1)
loss = cross_entropy(Z[labeled_idx], Y[labeled_idx])
```

실제 큰 그래프에서는 `A_hat`을 조밀 행렬로 만들지 말고 sparse matrix 또는 edge index 기반 연산을 사용해야 한다.

## 9. 실험을 읽는 법 { #experiments }

### 9.1 데이터셋

| 데이터셋 | 정점 | 간선 | 클래스 | 특성 | 라벨 비율 |
|---|---:|---:|---:|---:|---:|
| Citeseer | 3,327 | 4,732 | 6 | 3,703 | 0.036 |
| Cora | 2,708 | 5,429 | 7 | 1,433 | 0.052 |
| Pubmed | 19,717 | 44,338 | 3 | 500 | 0.003 |
| NELL | 65,755 | 266,144 | 210 | 5,414 | 0.001 |

[Kipf & Welling 2017, Table 1]

Table 1의 NELL 특성 수 5,414는 원 표의 값이다. §5.1의 전처리 설명에서는 관계 정점마다 고유 one-hot 특성을 더해 실제 입력을 61,278차원 희소 벡터로 확장한다고 적혀 있으므로 두 숫자의 문맥을 구분해야 한다.

인용 데이터에서는 클래스당 20개 라벨만 훈련에 사용하지만 모든 정점 특성을 사용한다. 기본 모델은 2층, hidden unit 16, dropout 0.5, 첫 층 L2 정규화 $5\times10^{-4}$, Adam 학습률 0.01이다. [Kipf & Welling 2017, §5]

### 9.2 반지도 분류 결과

| 방법 | Citeseer | Cora | Pubmed | NELL |
|---|---:|---:|---:|---:|
| Planetoid* | 64.7 (26s) | 75.7 (13s) | 77.2 (25s) | 61.9 (185s) |
| GCN | **70.3 (7s)** | **81.5 (4s)** | **79.0 (38s)** | **66.0 (48s)** |
| GCN, 무작위 분할 | 67.9±0.5 | 80.1±0.5 | 78.9±0.7 | 58.4±1.7 |

[Kipf & Welling 2017, Table 2]

[해설] 괄호는 수렴까지의 wall-clock 학습 시간이고, 무작위 분할 행은 10개 분할에서 얻은 평균±표준오차다. 논문은 당시 비교 방법보다 높은 정확도와 경쟁력 있는 시간을 보였다. 그러나 고정 분할의 단일 숫자만 보지 말고 무작위 분할 결과가 달라지는 것도 함께 봐야 한다. 이 표는 2017년의 해당 데이터·분할·전처리·baseline에 대한 결과이지 모든 그래프 문제에서 항상 우월하다는 증거는 아니다.

### 9.3 전파 규칙 비교 { #propagation-comparison }

| 전파 모델 | Citeseer | Cora | Pubmed |
|---|---:|---:|---:|
| MLP $X\Theta$ | 46.5 | 55.1 | 71.4 |
| 1차 모델, 식 (6) | 68.3 | 80.0 | 77.5 |
| 단일 파라미터, 식 (7) | 69.3 | 79.2 | 77.4 |
| renormalization, 식 (8) | **70.3** | **81.5** | **79.0** |

[Kipf & Welling 2017, Table 3]

[해설] 같은 종류의 정점 특성 변환만 하는 MLP보다 그래프 전파를 넣었을 때 크게 좋아진다. 특히 이 데이터에서는 인용 간선이 문서 분류에 유용한 신호임을 보여준다. Table 3은 renormalization이 이 비교 안에서 정확도와 단순성을 함께 얻었다는 근거다.

## 10. Appendix A: Weisfeiler–Lehman 관점

WL-1 알고리즘은 각 정점에서 이웃 라벨들의 다중집합을 모으고 hash해 색을 반복적으로 갱신한다. 논문은 hash를 미분 가능한 함수로 바꾸어

$$
h_i^{(l+1)}=\sigma\left(
\sum_{j\in\mathcal N(i)}\frac1{c_{ij}}h_j^{(l)}W^{(l)}
\right)
\tag{12}
$$

로 보고, $c_{ij}=\sqrt{d_id_j}$를 선택하면 GCN의 정점별 식을 얻는다고 설명한다. [Kipf & Welling 2017, Appendix A]

중요한 표현은 논문의 “loosely speaking”이다. GCN을 WL-1의 미분 가능한 파라미터화된 일반화로 **해석할 수 있다**는 직관이지, 합과 선형변환을 쓰는 GCN이 이상적인 injective hash와 항상 같은 구별 능력을 가진다는 정리는 아니다.

## 11. Appendix B: 깊이는 많을수록 좋은가 { #depth-appendix-b }

[원문] Cora, Citeseer, Pubmed의 깊이 실험에서는 대체로 2~3층이 가장 좋고, 7층보다 깊어지면 residual connection이 없는 모델의 훈련이 어려워졌다. 논문은 수용 영역 증가, 파라미터 증가와 과적합을 원인 후보로 논의한다. [Kipf & Welling 2017, Appendix B, Figure 5]

[해설: 후대 용어] 반복적인 정규화 집계로 정점 표현이 서로 비슷해지는 현상은 이후 문헌에서 **oversmoothing**이라는 말로 널리 설명된다. 이 단어를 Figure 5의 유일한 원인이나 논문이 직접 확립한 결론처럼 읽으면 안 된다.

## 12. 논문이 밝힌 한계 { #limitations }

[원문] §7.2의 주요 한계는 다음과 같다. [Kipf & Welling 2017, §7.2]

- full-batch 방식의 메모리는 그래프 크기에 선형으로 증가한다.
- 정확한 mini-batch는 층 수만큼의 이웃을 포함해야 해서 큰·조밀한 그래프에서 어렵다.
- 기본 틀은 간선 특성과 방향성을 자연스럽게 다루지 못한다.
- $K$층의 $K$-hop locality를 가정한다.
- 자기 연결과 이웃 연결의 상대적 중요도를 고정한다. 논문은 $\tilde A=A+\lambda I$ 가능성을 제안한다.

추가로 오늘날의 관점에서 볼 때, 원 논문의 실험은 작은 단일 그래프를 full-batch로 학습하는 transductive 설정이 중심이다. 매우 큰 동적 그래프, inductive 일반화, 이종 관계, 풍부한 간선 특성은 별도 설계가 필요하다.

## 13. 흔한 오해 { #misconceptions }

### “GCN은 CNN 커널을 그래프에 그대로 옮긴 것이다”

논문은 spectral convolution을 근사해 식을 동기화하지만, 최종 구현은 이미지의 고정된 $3\times3$ 위치별 커널과 다르다. 정규화된 이웃 집계와 공유 특성 변환이다.

### “라벨 없는 정점은 학습에 사용되지 않는다”

라벨 없는 정점에는 직접 cross-entropy를 계산하지 않지만, 전체 그래프의 forward 전파에 참여한다.

### “$A+I$만 하면 정규화는 필요 없다”

자기 연결과 차수 정규화는 역할이 다르다. $A+I$는 자신의 정보를 포함하고, $D^{-1/2}$ 항은 차수에 따른 크기 차이를 조절한다.

### “두 층이면 정확히 2-hop만 본다”

자기 연결 때문에 0, 1, 2-hop 정보가 섞일 수 있다. “최대 2-hop”이 안전한 표현이다.

### “Table 2가 현대의 모든 GNN보다 좋다는 뜻이다”

아니다. 당시의 특정 baseline, 데이터, 분할과 비교한 결과다.

## 14. 핵심 요약 { #summary }

$$
\boxed{H^{(l+1)}=\sigma(\hat A H^{(l)}W^{(l)})},
\qquad
\hat A=\tilde D^{-1/2}(A+I)\tilde D^{-1/2}
$$

- $A+I$: 이웃과 자기 자신을 함께 본다.
- $\tilde D^{-1/2}$: 차수 효과를 양쪽에서 정규화한다.
- $\hat A H$: 정점 축에서 정보 전파
- $HW$: 특성 축에서 학습 가능한 변환
- 여러 층: 더 먼 이웃의 정보
- labeled-node loss: 반지도 transductive 노드 분류

## 15. 확인문제

1. $H^{(l)}\in\mathbb R^{N\times F_l}$일 때 $W^{(l)}$의 차원은 무엇인가?
2. 자기 연결을 더하는 이유와 차수 정규화를 하는 이유를 각각 한 문장으로 설명하라.
3. 손계산 예제에서 $\hat A_{13}=1/\sqrt6$인 이유는 무엇인가?
4. 손실을 라벨 있는 정점에서만 계산해도 라벨 없는 정점 특성이 모델에 영향을 줄 수 있는 이유는 무엇인가?
5. spectral 유도에서 Chebyshev 다항식을 사용하는 두 가지 실용적 이점은 무엇인가?
6. Table 3의 MLP와 GCN 차이가 말해 주는 것과 말해 주지 않는 것을 각각 하나씩 적어라.

## 16. 해답

1. $F_l\times F_{l+1}$이다.
2. 자기 연결은 갱신할 때 자신의 특성을 보존·사용하게 하고, 차수 정규화는 차수가 큰 정점의 단순 합이 과도하게 커지는 것을 완화한다.
3. 자기 연결 후 정점 1의 차수는 3, 정점 3의 차수는 2이므로 간선 가중치가 $1/\sqrt{3\cdot2}$다.
4. 모든 정점은 $\hat A H$의 forward 계산에 참여하고 공유 가중치로 연결된다. 라벨 있는 정점의 손실 gradient가 이 계산 경로를 통해 $W$를 갱신한다.
5. 고유벡터 행렬을 명시적으로 곱하지 않아도 되고, $K$차 다항식이 $K$-hop 국소 필터가 되어 희소 연산을 사용할 수 있다.
6. 말해 주는 것: 해당 인용 네트워크에서 연결 정보가 분류에 매우 유용했다. 말해 주지 않는 것: 모든 데이터셋과 모든 분할에서 GCN이 어떤 MLP보다 항상 낫다는 보편 명제.

## 참고

- Kipf, T. N. and Welling, M., “Semi-Supervised Classification with Graph Convolutional Networks,” ICLR 2017, arXiv:1609.02907.
- 원문 코드: https://github.com/tkipf/gcn
