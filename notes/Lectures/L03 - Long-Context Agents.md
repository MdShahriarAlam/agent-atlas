---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, context-engineering, kv-cache, long-context]
aliases: ["CMU L3", "11-768 Lecture 3", "Context Management for Long-Context Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-03-long-context.pdf"
---

# Lecture 3 · Context Management for Long-Context Agents

[[L02 - Tool Use|← L2]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L04 - Memory and Skills|L4 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 3 · Graham Neubig
> **Source:** lecture slides `lecture-03-long-context.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T01 - The Agent Loop and Harness Design]], [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]], [[T04 - Agent Memory and Skills]]

Graham Neubig · 11-768 AI Agents, Fall 2026 · source slides: lecture-03-long-context.pdf (54 slides)

## Overview

An agent's history grows with every step, so keeping it working means managing context at every layer of the stack: the model architecture decides what history stays reachable, training decides whether the model can actually use it, serving (prefill, decode, KV caching) decides what it costs, and compaction decides what the agent keeps when the window is full.

The lecture moves bottom-up. It starts from why agent contexts explode (each call re-reads everything before it), explains how LLM inference turns that into cost and latency, surveys the architectural tricks that make long contexts affordable, shows how models are trained to use long inputs, then covers the two tools an agent builder controls directly: prompt/KV caching and context compaction.

**Learning objectives.** After this lecture you can…

- Explain why linear growth in agent history leads to roughly quadratic cumulative input tokens, and read an agent's prompt composition (system, user, reasoning, tool calls, tool results).
- Describe prefill vs. decode, the KV cache, and the serving metrics TTFT, TPOT, throughput and cost.
- Compare the four recurring long-context mechanisms (sliding-window, linear/recurrent, sparse attention, KV compression) and explain why production models mix local and global layers at roughly 3:1 to 5:1.
- Explain how positional encodings (absolute, RoPE, NoPE) and extension methods (position interpolation, YaRN) plus short-to-long curricula produce usable long context.
- Design prompts and serving setups that maximize prefix-cache reuse (stable prefix, append-only state, cache-aware routing).
- Design and evaluate a compaction policy: what to keep exact, what to summarize, what to externalize, and how to test that the agent still continues correctly.

**Prerequisites.** Basic transformer self-attention (Q, K, V, softmax), big-O notation, and the agent loop from Lectures 1–2.

**How it connects.** L1 defined the agent loop and L2 added tool use; tool results are exactly what fills the context here (37% of tokens in the OpenHands sample). This lecture (L3) treats the context window as a finite, costly resource. L4 (memory and skills) picks up where compaction ends, moving state out of the window into external stores. Planning (L5), coding agents (L6) and computer-use agents (L7) all run long trajectories that depend on these techniques. The training parts (L8 SFT, L9 and L11 RL) reuse the long-context curricula shown here, and deep research agents (L10) are among the heaviest context consumers.

## Concept map

![[cmu-ai-agents-L03-concept-map.png]]
*Concept map: The long-context system stack · 5 layers from agent history down to the model*

Read it top to bottom: each call's growing history is bounded by compaction, laid out for cache reuse, served through prefill and decode, and finally read by an architecture whose training sets how much of it the model can really use; the loop on the left is why the stack is re-run every step.

## Detailed notes

The notes follow the lecture's six parts: context growth, LLM inference, architectures, training, caching, and compaction.

### 1. Agent context growth

An agent's context grows with every step, and because every model call re-reads the whole prefix, total input tokens grow roughly quadratically in the number of steps. The slide's rule is simple: the input to call t is a fixed prefix (system prompt, tool schemas) plus all history produced before call t.

The slide's bar chart shows five calls with inputs of 6K, 11K, 16K, 21K and 26K tokens. Each call adds about 5K tokens of new history (the model's action plus the tool's observation). The cumulative input billed across calls is 6K, 17K, 33K, 54K and 80K. Per-call input grows linearly; the running total grows quadratically.

$$
\text{input}_t = P + (t-1)\,\Delta, \qquad \sum_{t=1}^{T} \text{input}_t = TP + \Delta\,\frac{T(T-1)}{2}
$$

Here P is the fixed prefix (6K in the example), Δ is the history added per step (5K), and T is the number of calls. With T = 5 this gives 30K + 50K = 80K, matching the slide. Extrapolating the same numbers to a 50-step run gives about 6.4M input tokens, even though the final call's context is only about 251K. This extrapolation is ours, not the slide's, but it shows why long agent runs are expensive even when each step looks cheap.

**What fills the context.** A second slide breaks down 1,500 OpenHands sessions, averaging 77,922 tokens per session:

| Component | Share of tokens | Source |
| --- | --- | --- |
| System prompt + tool definitions | 23% | Fixed prefix |
| User messages | 9% | Human |
| Reasoning | 9% | Model |
| (unlabeled) | 2% | Other |
| Tool calls | 20% | Model |
| Tool results | 37% | Environment |

Tool results are the single largest block, and tool calls plus results together make up 57%. This matters for design: the most effective place to save tokens is usually in what the environment returns (long logs, file dumps, web pages), not in the system prompt.

**Two separate challenges.** The lecture splits long context into two questions that are easy to conflate:

- **Capacity**: can the model actually use the evidence it needs? Architecture, position encoding and training shape the usable context; evaluation measures it.
- **Efficiency**: can the system afford to serve it? Attention cost, KV memory, caching and compaction shape cost and latency.

A model can have a 1M-token window and still fail to use a fact at position 300K (a capacity failure). Another can use the fact perfectly but cost too much per call to run a 200-step agent (an efficiency failure). The rest of the lecture addresses both.

### 2. LLM inference: where the cost comes from

Serving an LLM request has two very different phases, prefill and decode, joined by a per-request memory called the KV cache. Understanding them explains nearly every cost and latency effect later in the lecture.

**The serving stack.** The slide (after DistServe, Zhong et al., OSDI 2024) draws a pipeline:

1. **Request**: the prompt plus controls (max tokens, temperature, stop sequences).
2. **Scheduler**: queues, batches and routes requests to GPU workers.
3. **Prefill**: processes all prompt positions in one parallel pass and *writes* keys and values for every position into the KV cache.
4. **Decode**: generates one new position per step, *reading* the whole KV cache and *appending* one new K,V entry each step. It loops until a stop condition.
5. **Response**: tokens are streamed back as they are decoded.

The KV cache is "persistent per-request state": it lives for the duration of the request (and, with prefix caching, possibly beyond it).

**Inference phases.** Prefill processes tokens x₁ … xₙ together and leaves one K,V pair per position. Decode step 1 produces y₁ using the prompt KV and adds y₁'s K,V; decode step 2 produces y₂ using prompt + y₁ KV, and so on. The two phases stress hardware differently:

| Phase | Work per pass | Bottleneck | Latency scales with |
| --- | --- | --- | --- |
| Prefill | All n prompt tokens in parallel | Compute (matrix multiplies) | Prompt length |
| Decode | One token per step, sequential | Memory bandwidth (reading weights + KV cache) | Number of output tokens, and KV size |

DistServe's contribution was to run these two phases on separate GPUs, because batching them together makes each interfere with the other's latency target. Why it matters for agents: agent calls are prefill-heavy. A typical step reads tens of thousands of context tokens and writes a few hundred output tokens.

**Deeper dive — why decode is memory-bound, in numbers.** Each decode step must stream every weight from GPU memory to produce one token. A 70B-parameter model in 16-bit precision is about 140 GB. At 3.35 TB/s of memory bandwidth (one H100's figure; spreading the model over several GPUs changes the bookkeeping, not the ratio), one full read takes about 42 ms, so a single user gets at most about 24 tokens/s, however fast the arithmetic units are. Batching fixes part of this: 32 users decoding together share one weight read. But each user's KV cache is private and must also be read every step. At the 320 KB per token computed below, a 32K-token context is about 10.5 GB per user, so 32 such users read about 336 GB of KV per step, more than twice the weights. This is why long agent contexts hurt decode throughput even with batching, and why the KV-shrinking mechanisms of Part 3 (windows, recurrent state, GQA, MLA) matter for serving cost, not only for fitting in memory.

**Serving metrics.** The slide's timeline starts at request arrival, shows a prefill bar, then output tokens at regular ticks:

- **TTFT (time to first token)**: arrival to first token. Dominated by queueing plus prefill, so it grows with prompt length.
- **TPOT (time per output token)**: the gap between consecutive output tokens. Dominated by decode.
- **Throughput**: completed tokens or requests divided by wall-clock time.
- **Cost**: input tokens + cached input tokens + output tokens, each billed at its own rate.

**Refresher: attention.** Each layer projects the token states into queries, keys and values, then mixes values by similarity:

$$
Q = XW_Q, \quad K = XW_K, \quad V = XW_V
$$

$$
A = \mathrm{softmax}\!\left(\frac{QK^{\top} + M}{\sqrt{d_k}}\right), \qquad O = AV
$$

X is the n × d matrix of token states (row zₜ per token); W\_Q, W\_K, W\_V are learned projections; qᵢ, kⱼ, vⱼ are rows of Q, K, V; dₖ is the key width; M is the causal mask (Mᵢⱼ = 0 for j ≤ i, −∞ otherwise). The figure is a lower-triangular grid: each query row sees every earlier key and none of the future. Computing A needs n² comparisons, and during decode each new token compares against all t earlier keys.

The KV cache exists because K and V for past tokens never change under causal masking, so they are computed once and stored. Its size is the practical limit on context. As a rough guide (our addition): bytes per token = 2 (K and V) × layers × KV heads × head dimension × bytes per value. For a Llama-3-70B-style model (80 layers, 8 KV heads, head dimension 128, 16-bit values) that is about 320 KB per token, or roughly 40 GB for a single 128K-token context.

**Advertised vs. effective context.** The slide shows Greg Kamradt's 2023 "needle in a haystack" test on GPT-4 (128K window). A fact is planted at a chosen depth in filler text and the model is asked to retrieve it. The heatmap has context length on the x-axis (1K to 128K tokens) and needle depth on the y-axis (top to bottom of the document); colour is retrieval accuracy. Up to about 64K tokens the grid is entirely green (100%). From roughly 73K to 128K, cells turn yellow and red, with scores such as 0%, 40%, 55% and 65%. The failures cluster where the fact sits between 10% and 50% depth, while facts near the very end stay reliable.

**Common pitfall.** The advertised window is the maximum the model *accepts*, not the length it *uses well*. Measure effective context on your own task before relying on it, and remember that single-needle retrieval is the easiest case; multi-hop reasoning over long context degrades sooner.

### 3. Architectures for long context

Standard attention compares every token with every earlier token, so its cost is quadratic in length; long-context architectures replace most of that global work with cheap local or stateful computation and keep a few global layers for retrieval.

**Global vs. local.** In standard attention each query attends to the full visible history: O(n²) pairwise comparisons for a sequence of length n. Local computation only considers a constant-size subset, typically a window of the w most recent tokens, so the cost falls to O(wn). For fixed w this is linear in n.

**Periodic global access (hybrid models).** Purely local models cannot retrieve a fact from far back. The fix used by current long-context models is a stack pattern: N local layers ("cheap state update") followed by 1 global layer ("retrieve from full history"), repeated. The global layers keep exact long-range lookup; the local layers do most of the work cheaply. The slide's table of 2026 models shows how consistent this ratio has become:

| Model | Local / stateful layers | Global layers | Local : global |
| --- | --- | --- | --- |
| Qwen3.8-Flash-Next | Gated DeltaNet | QSA sparse retrieval | 36 : 12 ≈ 3:1 |
| GLM-5.3-Flash | Kimi Delta Attention | DSA + IndexPool | 34 : 11 ≈ 3:1 |
| Kimi K3 | Kimi Delta Attention | dense Gated MLA | 69 : 24 ≈ 3:1 |
| Nemotron 3 Ultra | Mamba-2 | dense GQA | 48 : 12 = 4:1 |
| Inkling-Small | 512-token window | dense GQA | 35 : 7 = 5:1 |
| DeepSeek-V4-Pro-0813 | 128-token window branch | compressed sparse / dense | interleaved branches |

The lecture then names **four recurring mechanisms**: sliding-window attention, linear attention or recurrent models, sparse attention, and KV compression.

#### 3a. Sliding-window attention

Sliding-window attention (Longformer, Beltagy et al., 2020) keeps the attention equation and changes only the mask:

$$
M^{(w)}_{ij} = \begin{cases} 0, & 0 \le i - j < w \\ -\infty, & \text{otherwise} \end{cases}
$$

w is the number of causal positions each query can see. The figure is a diagonal band in the query–key grid instead of a full lower triangle. Work falls from O(n²) to O(nw), and the KV cache for that layer never exceeds w entries. The price is stated in red on the slide: **a local layer cannot directly retrieve distant tokens.** Stacking layers widens the receptive field indirectly, but exact recall of old details needs a global layer.

#### 3b. From softmax to linear attention and the delta rule

The lecture builds a five-step ladder: Softmax → Linear → DeltaNet → Gated DeltaNet → KDA. Each step changes how the past is represented.

**1. Softmax attention** (Vaswani et al., NeurIPS 2017). The past is a growing KV cache; every prior kᵢ, vᵢ is kept, and each new query compares against all of them:

$$
a_{ti} = \frac{\exp(q_t^{\top} k_i / \sqrt{d_k})}{\sum_{j=1}^{t} \exp(q_t^{\top} k_j / \sqrt{d_k})}, \qquad o_t = \sum_{i=1}^{t} a_{ti} v_i
$$

aₜᵢ is the normalized weight from query t to key i. This gives explicit token-level access but O(t) comparisons per decode step and memory that grows with t.

**2. Linear attention** (Katharopoulos et al., "Transformers are RNNs", ICML 2020). Replace the softmax weight with the raw bilinear score qₜᵀkᵢ. Because there is no normalization over i, the sum can be reordered:

$$
o_t = \sum_{i=1}^{t} (q_t^{\top} k_i)\, v_i = \Big(\sum_{i=1}^{t} k_i v_i^{\top}\Big)^{\!\top} q_t = S_t^{\top} q_t, \qquad S_t = S_{t-1} + k_t v_t^{\top}
$$

Sₜ is a fixed-size dₖ × dᵥ matrix: an online mapping from keys to values. Decode now costs the same at step 10 and step 10 million, and memory is constant. The weakness is that writes are purely additive, so interference between stored associations is never erased.

**Deeper dive — how recurrent layers train fast, and where they fail.** The recurrence Sₜ = Sₜ₋₁ + kₜvₜᵀ looks sequential, which would make training slow. In practice these layers are trained in a chunkwise form. The sequence is cut into chunks of C tokens (often 64 to 256). Inside a chunk, outputs are computed like masked attention, a C × C matrix product that GPUs handle well. Between chunks, only the d\_k × d\_v state is passed forward. Total work is roughly O(nCd + nd²) instead of O(n²d), and the same trick extends to DeltaNet, Gated DeltaNet and KDA with extra bookkeeping for the delta and gate terms. The failure mode is capacity. A fixed matrix can store only about d\_k well-separated key–value pairs per head, so tasks that need exact recall of many items (copying a long list, finding one identifier among thousands) degrade. The Zoology study (Arora et al., 2023) traced much of the quality gap between efficient models and transformers to this associative-recall weakness, which is the underlying reason hybrids keep a few global layers.

**3. DeltaNet** (Schlag et al., "Linear Transformers Are Secretly Fast Weight Programmers", ICML 2021). Before writing, read what the memory currently predicts for this key and write only the error:

$$
\hat{v}_t = S_{t-1}^{\top} k_t, \quad e_t = v_t - \hat{v}_t, \quad S_t = S_{t-1} + \beta_t k_t e_t^{\top}, \quad o_t = S_t^{\top} q_t
$$

v̂ₜ is the memory's current prediction, eₜ its error, and βₜ ∈ \[0,1\] the correction strength. This is the classic delta (Widrow–Hoff) learning rule applied to the state. It corrects the association along kₜ while leaving unrelated memory intact.

**4. Gated DeltaNet** (Yang et al., 2024). Add scalar forgetting: first decay the whole state, then apply the same targeted correction.

$$
\tilde{S}_{t-1} = \alpha_t S_{t-1}, \qquad S_t = \tilde{S}_{t-1} + \beta_t k_t (v_t - \tilde{S}_{t-1}^{\top} k_t)^{\top}
$$

αₜ ∈ \[0,1\] is a global retention gate; βₜ is the targeted edit. Setting αₜ = 1 recovers DeltaNet. The gate lets the model clear stale memory, for example at a document boundary.

**5. Kimi Delta Attention, KDA** (Kimi Team, Kimi Linear, 2025). Make the forgetting per channel instead of scalar:

$$
D_t = \mathrm{Diag}(\alpha_t), \qquad S_t = (I - \beta_t k_t k_t^{\top})\, D_t S_{t-1} + \beta_t k_t v_t^{\top}
$$

αₜ ∈ \[0,1\]^{dₖ} is now a vector gate, Dₜ its diagonal matrix, and I the dₖ × dₖ identity. Each key-space feature gets its own memory lifetime, so some channels can hold long-term facts while others turn over quickly. Equal retention in every channel recovers Gated DeltaNet.

| Step | State | Write rule | Forgetting |
| --- | --- | --- | --- |
| Softmax | Growing KV cache | Append k, v | None (exact) |
| Linear | Fixed matrix S | Additive | None |
| DeltaNet | Fixed matrix S | Error-correcting | Implicit, along k |
| Gated DeltaNet | Fixed matrix S | Error-correcting | Scalar decay α |
| KDA | Fixed matrix S | Error-correcting | Per-channel decay |

#### 3c. Sparse attention

Sparse attention keeps softmax but lets each query attend to a subset Sᵢ of keys, then renormalizes over that subset:

$$
A_{ij} = \mathrm{softmax}_{j \in S_i}\!\left(\frac{q_i^{\top} k_j}{\sqrt{d_k}}\right), \qquad o_i = \sum_{j \in S_i} A_{ij} v_j
$$

The two families differ in how Sᵢ is chosen:

- **Fixed pattern** (Longformer, 2020): Sᵢ = {j ≤ i : i − j < w} ∪ (G ∩ \[1, i\]), a local window plus a fixed set G of global positions. Cost is predictable, but the pattern cannot adapt to the query.
- **Content-dependent** (DeepSeek Sparse Attention, 2025): Sᵢ = TopK over j ≤ i of g(qᵢ, kⱼ), where g is a cheap learned selector (an "indexer") and |Sᵢ| = K. Retrieval adapts to the query, but if the selector misses a relevant key, that key is simply excluded.

#### 3d. KV compression

KV compression shrinks what is cached per token rather than how many tokens are attended. The slide's figure (from DeepSeek-V2, 2024) compares four designs; hatched boxes mark what is cached during inference:

- **MHA (multi-head attention)**: every query head has its own K and V head. Largest cache.
- **GQA (grouped-query attention**, Ainslie et al., 2023): groups of query heads share one K,V head.
- **MQA (multi-query attention)**: all query heads share a single K,V head. Smallest cache, some quality loss.
- **MLA (multi-head latent attention**, DeepSeek-V2): cache one small latent vector per token and reconstruct per-head K and V from it.

$$
c^{KV}_t = W^{KV}_{D} z_t, \qquad k^{(h)}_t = W^{(h)}_{UK} c^{KV}_t, \qquad v^{(h)}_t = W^{(h)}_{UV} c^{KV}_t
$$

cₜᴷⱽ is the cached latent, h indexes heads, W\_D compresses (down-projects) the token state zₜ, and W\_UK, W\_UV up-project to head-specific keys and values. MLA keeps per-head expressiveness while caching far less per token.

**Why it matters.** Every mechanism trades exact access to the past for cost. Hybrids exist because no single cheap mechanism gives reliable long-range recall; the global layers are the "retrieval" path and the rest is a compressed running summary.

### 4. Training long-context models

A long window is not usable until the model has been trained on long inputs, so models are pretrained short and then extended in stages, with position encodings adjusted along the way.

**Short-to-long training.** The slide shows three stages:

| Stage | Typical length | Data | Why |
| --- | --- | --- | --- |
| Short pretraining | 4K–8K | Abundant web-scale data | Cheap: attention cost is small at short length |
| Continued training | 32K–128K | Long documents, packed sequences | Teach the model to use distance |
| Long adaptation | 128K+ | Task traces, synthetic curricula | Teach long-horizon behaviour, not just tolerance |

Most of the tokens are seen at short length because that is where data is plentiful and compute is cheap. The long stages are short but targeted.

#### 4a. Position encodings

Attention by itself is order-blind, so the model needs some signal of token position. How that signal is built decides how well a model extends beyond its training length.

**Absolute positional encodings** (Vaswani et al., 2017). A position vector is added to the token embedding before the first layer:

$$
z_t = E[x_t] + p_t, \qquad p_{t,2\ell} = \sin(t/\omega_\ell), \quad p_{t,2\ell+1} = \cos(t/\omega_\ell), \quad \omega_\ell = 10000^{2\ell/d}
$$

xₜ is the token ID, E the embedding table, pₜ the positional vector, and ℓ indexes sinusoid pairs. Position enters before the projections that produce Q, K and V. Learned absolute embeddings use a fixed table and simply have no entry past the trained length; sinusoids define any position analytically but still generalize poorly past it.

**Rotary position embeddings, RoPE** (RoFormer, Su et al., Neurocomputing 2024). Instead of adding a vector, rotate each query and key by an angle proportional to its position:

$$
\tilde{q}_i = R(i)\, q_i, \qquad \tilde{k}_j = R(j)\, k_j, \qquad \tilde{q}_i^{\top} \tilde{k}_j = q_i^{\top} R(j - i)\, k_j
$$

R(t) is block-diagonal, made of 2D rotations with angles tθ\_ℓ (one frequency per pair of dimensions). Because rotations compose, the score depends only on the relative displacement j − i. V is unchanged. RoPE is the default in most open models, and the extension tricks below all rescale its angles.

**No positional encoding, NoPE** (Kazemnejad et al., NeurIPS 2023). Drop explicit position entirely: zₜ = E\[xₜ\], and the attention equation is unchanged. A causal model can still infer order, because each position sees a different number of predecessors; recurrent layers (such as KDA in Kimi K3) also carry order implicitly. This removes the problem of extrapolating positions, but not the need to train long-range behaviour.

**Position interpolation** (Chen et al., 2023). To extend a RoPE model from length L to L′ = sL, squeeze the new positions into the old range:

$$
R(t) \longrightarrow R(t/s) \quad \text{equivalently} \quad \theta_\ell \longrightarrow \theta_\ell / s
$$

Every RoPE dimension is stretched by the same factor s, so long positions stay inside the phase range seen in pretraining. The cost is that nearby tokens become harder to tell apart, because their angle differences shrink by s too.

**YaRN** (Peng et al., ICLR 2024). Interpolate selectively by frequency, and correct the attention temperature:

$$
\theta'_\ell = (1 - \gamma_\ell)\, \frac{\theta_\ell}{s} + \gamma_\ell\, \theta_\ell, \quad 0 \le \gamma_\ell \le 1
$$

$$
A = \mathrm{softmax}\!\left(\frac{\tilde{Q}\tilde{K}^{\top} + M}{\tau \sqrt{d_k}}\right), \qquad \sqrt{1/\tau} = 0.1 \ln s + 1
$$

γ\_ℓ ramps from 0 for long-wavelength dimensions (fully interpolated) to 1 for short-wavelength dimensions (kept as is); middle dimensions blend. τ is the attention temperature. Long-wavelength dimensions encode coarse position and need interpolation; short-wavelength ones encode local order and must keep their resolution. The temperature term counteracts the drift in attention entropy at larger extension scales. The slide warns that the τ formula was fit on LLaMA models: it is a recipe, not a universal constant.

**Deeper dive — how YaRN decides which dimensions to stretch.** For each RoPE pair ℓ the paper computes its wavelength λℓ = 2π/θℓ and the ratio rℓ = L/λℓ, the number of full turns the pair completes within the original training length L. The ramp is then γℓ = 0 if rℓ < α, γℓ = 1 if rℓ > β, and (rℓ − α)/(β − α) in between, with α = 1 and β = 32 recommended for LLaMA. The logic: a pair that turned more than 32 times during training has seen every angle many times, so positions beyond L are not new to it, and it is left alone. A pair that never completed one turn would meet unseen angles, so it is fully interpolated like Position Interpolation. For the temperature, note the square root on the slide: √(1/τ) = 0.1 ln s + 1 is the factor applied to both q and k, so the logits are scaled by its square. With s = 4 (for example 262K to 1M, as in the Qwen row) the logit scale is (1 + 0.1 ln 4)² ≈ 1.30.

**How 2026 models reach their maximum context** (slide table):

| Model | Context-length training | Position method | How it reaches max context |
| --- | --- | --- | --- |
| Qwen3.8-Flash-Next | 262K native; full curriculum undisclosed | Partial RoPE | YaRN extension to 1M |
| DeepSeek V4 | 4K → 16K → 64K → 1M | Partial RoPE | Progressive training + YaRN |
| GLM-5.3-Flash | 1M native; exact curriculum undisclosed | NoPE in main attention | No RoPE rescaling |
| Kimi K3 | 8K → 64K → 256K → 1M | NoPE | Progressive training to 1M |
| Nemotron 3 Ultra | 1M long-context CPT; SFT to 512K | Implicit order in Mamba; no RoPE | Trained/evaluated at long lengths |
| Inkling | 1M context; curriculum undisclosed | Relative position embedding | Learned relative representation |

"Partial RoPE" means only some dimensions are rotated. Notice the trend: models with recurrent or linear local layers increasingly drop RoPE in global layers and rely on training at length instead of rescaling tricks.

#### 4b. Long-context data

Long-context training needs data whose answers actually depend on distant tokens. The slide lists four kinds:

- **Long documents**: books, codebases, repositories, multi-document corpora. Coherent natural structure.
- **Packed examples**: several short examples concatenated into one long sequence. High token utilization, but document boundaries and cross-example leakage matter (the model can learn to attend across unrelated examples unless masked).
- **Agent trajectories**: actions plus observations. They teach long-horizon recovery, state tracking and tool use.
- **Synthetic tasks**: controlled dependencies, with evidence and distractors placed at designed positions.

The slide's data-mixture table:

| Model | Natural long data | Constructed supervision | Length curriculum |
| --- | --- | --- | --- |
| Kimi K3 | Cleaned, upsampled documents + video | Permuted multimodal subtasks with evidence across the full context | 8K → 64K → 256K → 1M |
| GLM-5 | Documents; repository files, issues, PRs, diffs | Synthetic dependencies + agent trajectories | 32K → 128K → 200K |
| Nemotron 3 Ultra | Long-document QA | Multi-document reasoning, sequential scans, synthetic tables | 33B-token 1M CPT; SFT to 512K |
| DeepSeek V4 | Scientific papers + technical reports | Agentic post-training after long-context pretraining | 4K → 16K → 64K → 1M |

The shared recipe, in the slide's words: coherent long sources, plus tasks whose answer depends on distant evidence, plus progressive length growth.

#### 4c. Context parallelism

Training on a 1M-token sequence does not fit on one GPU, so the sequence itself is split across devices. The figure (Ring Attention, Liu et al., 2023; also Megatron context parallelism) shows query blocks in an outer loop and key/value blocks in an inner loop. Each device holds one block of queries and computes blockwise attention against the K,V block it currently holds, then passes that K,V block to the next device in a ring while receiving one from the previous device. Three properties are listed:

- **Memory per device**: O(n dₖ / P) for P devices.
- **Communication**: overlapped with block attention, so it is largely hidden.
- **Total work**: still O(n² dₖ). This is exact attention, not sparse; it spreads the cost, it does not reduce it.

### 5. Prompt and KV caching

Because an agent's prompt at step t+1 is its prompt at step t plus a small suffix, the KV state for the shared prefix can be reused instead of recomputed; this is the single largest cost lever for agents, but it only saves prefill work and does not shrink what the model must attend to.

**KV caching across calls.** The slide shows three stacked bars, colour-coded as cached input, regular (new) input, model output and tool result:

1. **Call 1**: everything is new input. Prefill creates the prompt KV; decode produces the output; the tool then returns a result.
2. **Call 2**: the whole of call 1 (input, output, tool result) is now a cached prefix. Only the new material is fresh input.
3. **Call 3**: the cached region is longer again. The reusable prefix keeps growing.

Within a call, output tokens extend the KV cache during decode. Between calls, the tool result comes back as new input and, once prefilled, joins the reusable prefix. The idea of reusing attention state across prompts is formalized in Prompt Cache (Gim et al., MLSys 2024).

**Deeper dive — the cost algebra of caching.** Let c\_t be the context length at call t, n\_t the new (uncached) tokens, p\_in the regular input price and p\_c the cached price. Call t costs about n\_t · p\_in + (c\_t − n\_t) · p\_c. With the Slide 3 numbers (c\_t = 6K + 5K(t − 1), n\_t = 5K), the uncached part is now linear in the number of calls, but the cached part still sums to a quadratic. Caching shrinks the quadratic's coefficient by the price ratio (10× for most rows of the pricing table); it does not remove it. Only compaction does. Some providers also charge a premium to write a cache entry. Anthropic's API, for instance, bills a 5-minute cache write at 1.25× the base input price and a read at 0.1×. Writing X tokens then costs an extra 0.25X · p\_in, and each later read saves 0.9X · p\_in, so caching pays for itself on the first reuse. Check current documentation for exact multipliers.

**Empirical benefits.** Two plots are shown side by side.

- *Prompt Cache (Gim et al., 2024)*: latency (ms, y-axis, 0–1000) against token length (x-axis, 0–3,000) for "compute" (normal prefill) vs "cache" (load stored attention state) on a CPU, an A40 GPU and an RTX 4090. Compute latency rises steeply with length: on the CPU it passes 1,000 ms almost immediately; on the A40 it reaches about 1,000 ms by 3,000 tokens; on the 4090 about 500 ms. Cache-loading curves stay much flatter (roughly 140 ms on the 4090 and 210 ms on the A40 at 3,000 tokens). The advantage grows with length, and where the curves cross depends on hardware.
- *Can I Buy Your KV Cache? (2026)*: amortized per-call cost (seconds, log scale) against reuse count N, the number of agents or queries reading the same document (1 to 1,000, log scale). A dashed line marks the from-scratch cost for a 3,774-token document (about 15 s). The KV-reuse curves for documents of 255 to 3,774 tokens start near or below that line at N = 1 and fall steeply, flattening at a floor. A one-time prefill is amortized across readers, so per-call cost approaches the cost of the reuse step itself.

The slide adds a caution: measured physical cost and provider API price are different quantities.

**Cached-token API pricing** (USD per 1M tokens, checked Aug. 30, 2026):

| Model | Cached input | Regular input | Output |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | $0.007–0.014 | $0.22–0.44 | $0.66–1.32 |
| GLM-5.2 | $0.26 | $1.40 | $4.40 |
| Kimi K3 | $0.30 | $3.00 | $15.00 |
| GPT-5.6 Luna | $0.02 | $0.20 | $1.20 |
| GPT-5.6 Sol | $0.40 | $4.00 | $20.00 |
| Claude Opus 5 | $0.50 | $5.00 | $25.00 |

"Cached" means a cache read (hit); cache creation may be billed separately. The DeepSeek range is off-peak to peak. Cached input is typically about 10% of the regular input price (about a 31× discount for DeepSeek; GLM-5.2 is higher, at about 19%). For an agent whose input is mostly a reused prefix, this changes the bill by close to an order of magnitude.

**Paged KV-cache allocation** (vLLM / PagedAttention, Kwon et al., SOSP 2023). KV caches grow unpredictably, and allocating one contiguous region per request wastes GPU memory through fragmentation and over-reservation. PagedAttention borrows virtual memory from operating systems. The figure shows request A (prompt "Four score and seven years ago our", outputs "fathers" → "brought" → …). Its *logical* KV blocks 0, 1, 2 (four tokens each) map through a **block table** to non-contiguous *physical* blocks 7, 1 and 3 in GPU DRAM. The table also tracks how many slots are filled (block 1 goes from 3 to 4 when "fathers" is generated; block 2 is allocated when "brought" arrives). Blocks can also be shared between requests with a common prefix.

**RadixAttention prefix sharing** (SGLang, Zheng et al., 2023). SGLang keeps all cached prefixes in a radix tree keyed by tokens, so any new request can reuse its longest matching prefix. The slide shows three operations:

1. **Match** (step 3): a request that extends an existing path ("You are a helpful assistant. User: Hello! Assistant: Hi!" then "User: Solve this problem…") reuses the prefix and appends its suffix.
2. **Split** (step 4): a request sharing only the system prompt ("User: What can you do?") splits the node, so both branches share the common prefix.
3. **Evict** (step 5): under memory pressure, the least-recently-used leaf is evicted.

**Cache-aware request routing** (SGLang v0.4). With many workers, each holds a different cache, so routing matters. The router scores each worker as *reusable prefix − queue penalty*. In the example, request A (prefix hash A) can go to Worker 1 (18K-token prefix match, queue length 2) or Worker 2 (2K match, empty queue). The router picks Worker 1: avoiding 16K tokens of prefill outweighs waiting behind two requests.

**Prompt design for cache reuse.** The slide's four rules:

1. **Stabilize the prefix**: put instructions, tool definitions and examples first and keep them byte-identical across calls.
2. **Append changing state**: new user turns and observations go at the end.
3. **Avoid needless churn**: a timestamp in the system prompt or re-ordered tool schemas changes early tokens and invalidates everything after them.
4. **Measure reuse**: track cached-token counts, TTFT and eviction rates.

**Common pitfall.** Editing anything early in the context (for example, deleting an old tool result to save space) invalidates the cache for every token after the edit. Caching and compaction therefore pull in opposite directions, which is why compaction is done rarely and in large chunks.

**Deeper dive — when does a compaction pay for itself?** Take Claude Opus 5 prices ($5 regular, $0.50 cached per 1M input tokens) and an agent at 128K tokens of mostly cached context. Continuing without compaction costs about 128K × $0.50/M ≈ $0.064 of cached input per step, plus the new tokens. Compaction has three one-off costs: the compaction call itself (reading about 120K tokens, mostly cached, ≈ $0.06, plus a 2K-token summary at the $25 output rate, ≈ $0.05); and the first call after it, which must prefill the new context fresh. If the new context is 20K tokens with the 8K fixed prefix still cached, that first call pays 12K × $5/M ≈ $0.06. After that, each step costs about 20K × $0.50/M ≈ $0.01 instead of $0.064. The one-off cost of about $0.17 is recovered in roughly three to four steps. The same arithmetic explains the pitfall above: compacting a small context every few steps pays the one-off cost repeatedly for little saving.

### 6. Context compaction

When history outgrows the window (or the budget), the agent must replace old history with a shorter working state; the lecture frames this as state estimation and argues it must be judged by whether the agent still continues correctly, not by how good the summary reads.

**A worked compaction.** The slide's "before" trace is five steps of a CI debugging session:

1. OBSERVATION: CI job times out after 30 minutes.
2. ACTION: inspect the job log.
3. OBSERVATION: a 24K-line log with repeated "address already in use".
4. ACTION: set `--workers=1` and rerun.
5. OBSERVATION: suite passes; log saved at `/tmp/ci.log`.

After compaction this becomes one observation block (Goal: fix CI timeout. Cause: port collision. Verified: `--workers=1` passes. Evidence: `/tmp/ci.log`) and one NEXT ACTION: open the PR with the tested worker setting. The 24K-line log is gone from context, but a pointer to it survives, and the exact flag is copied verbatim.

**Compaction as state estimation.** The slide draws History Hₜ → Compactor 𝒞\_B → Working state ŝₜ, with three requirements:

$$
p(A_{\text{future}} \mid H_t) \approx p(A_{\text{future}} \mid \hat{s}_t)
$$

$$
\hat{s}_t = \mathcal{C}(H_t; B), \qquad |\hat{s}_t| \le B
$$

Hₜ is the full history at step t, ŝₜ the compacted working state, 𝒞 the compactor, B its token budget, and A\_future the agent's future actions.

- **Behavioral fidelity** (first equation): the agent should act the same given the compact state as given the full history. The target is future actions, not a faithful summary of the past.
- **Bounded representation** (second equation): the state must fit the budget B.
- **Recoverability**: copy exact anchors and keep pointers to source evidence, so anything dropped can be fetched back.

**Deeper dive — choosing B and the checkpoint format.** The budget B trades off three things. Too small, and fidelity drops because decisions and identifiers do not fit. Too large, and the next compaction comes sooner and each post-compaction step costs more. A practical starting point is to let the checkpoint plus anchors use 10–20% of the window, so there is room for many steps before the next trigger. The format matters as much as the size. A structured checkpoint with fixed fields (Goal, Constraints, Decisions, Progress, Open questions, Identifiers, Evidence pointers, Next action) is easier to audit and to evaluate than free prose, because a test can check that each field survived. Slide 46's "After" block is exactly such a structure. It also makes drift visible: if the Constraints field shrinks between two checkpoints, something was lost. Free-text summaries hide that loss inside fluent sentences.

**What survives compaction.** The slide divides the model-visible context into three regions plus two off-context destinations:

| Region | Treatment | Contents |
| --- | --- | --- |
| Anchors | Keep exact | Goal, constraints |
| Checkpoint | Encode (summarize) | Decisions, progress, IDs |
| Recent tail | Keep exact | Active attempt, fresh result |
| Evidence store | Externalize | e.g. 24K-line log → 3 failures + command + artifact path |
| Discard | Drop | Duplicates, superseded attempts |

The slide cites MemGPT (externalize and retrieve) and LongLLMLingua (selective compression) for the last two ideas.

**Compaction policy decisions.** Real agent harnesses (the slide cites Codex, OpenCode, Pi, Hermes and OpenHands) must make four decisions:

1. **Trigger**: a token threshold, a provider overflow error, or a manual request. Reserve room for the next output.
2. **Select**: protect the beginning, compact the older region, keep the recent tail. Cut at a valid turn or tool-call boundary (never split a tool call from its result).
3. **Replace**: with a readable summary, a structured checkpoint, an opaque provider item (an encrypted compaction blob returned by the API), or a fresh context.
4. **Recover**: leave the stored history unchanged, retry or reset, retain searchable history. Define what happens when compaction itself fails.

**Repeated compaction drift.** Long agents compact many times, and each summary is built from the previous one plus the new region:

$$
\hat{s}_{k+1} = \mathcal{C}(\hat{s}_k \oplus R_k)
$$

ŝₖ is the k-th checkpoint, Rₖ the new history since it, and ⊕ concatenation. Errors compound like a game of telephone. The slide's example: "Use CUDA 12.4" becomes "Use CUDA 12.x", then "Use recent CUDA", then the constraint is missing entirely. The remedies: copy anchors exactly, keep the recent tail, and retrieve source evidence rather than re-summarizing summaries. ReSum (summary-conditioned agent continuation) is cited.

**Continuation-based evaluation.** The lecture proposes testing compaction by its downstream effect:

1. **Plant state**: build trajectories containing constraints, decisions and artifacts.
2. **Compact**: apply the production compaction policy.
3. **Continue**: let the agent keep going and measure its later decisions.

Metrics: *state recall* (constraints and identifiers survive), *task success* (correct continuation), *efficiency* (tokens, latency, cost) and *stability* (behaviour under repeated compactions).

**Takeaways: the long-context system stack.** The final slide lists five layers:

1. **Growth**: agent loops repeatedly ingest instructions, actions and environment observations.
2. **Inference**: prefill, decode, dense attention and KV memory create different bottlenecks.
3. **Architecture**: local, recurrent, sparse and compressed mechanisms choose what history remains accessible.
4. **Caching**: stable prefixes avoid repeated prefill but do not reduce visible history.
5. **Compaction**: preserve intent, exact task state, recent work and recovery paths, then evaluate continuation.

The next class is Agent Capabilities 3, Skills and Memory.

## Slide-by-slide companion

A walk through all 54 slides in order: what each one shows (including the figures), what it means, and how it links to the rest of the course.

### Slides 1–5 · Why agent context grows

**Slide 1 — Context Management for Long-Context Agents.** Title slide: "How agents keep working as their history grows", Graham Neubig, Language Technologies Institute, Carnegie Mellon University.

**Slide 2 — Agent context growth.** Section divider for Part 1.

**Slide 3 — Quadratic input from linear history growth.** The slide states one rule in monospace: input\_t = fixed prefix + history before call t. Below it, five horizontal bars show the input size of calls 1 to 5: 6K, 11K, 16K, 21K and 26K tokens. Each bar is longer than the last by the same 5K, and the fifth bar fills the whole track. A right-hand column shows the running total of input tokens: 6K, 17K, 33K, 54K and 80K cumulative.

The point is the gap between the two columns. The per-call bars grow by a constant step, so the context at any one call looks manageable. But the provider bills, and the GPU computes, every call's full input. The running total therefore grows like the area of a triangle, roughly T²Δ/2 for T calls. After five calls the agent has paid for 80K input tokens to hold a context of only 26K, about 3× more. After 50 calls that ratio is roughly 25×. This is why the later sections on prefix caching (Slides 37–44) and compaction (Slides 45–51) matter. Caching makes the repeated part cheap; compaction makes the context itself shorter.

**Slide 4 — Agent prompt composition example.** One stacked horizontal bar splits the tokens of 1,500 OpenHands sessions into six coloured segments. From left: System + tools 23% (black), User 9% (grey), Reasoning 9% (red), an unlabeled 2% sliver (light grey), Tool calls 20% (light blue) and Tool results 37% (dark blue). Below the bar: 77,922 mean tokens per session.

In absolute terms, 37% of 77,922 is about 28,800 tokens of tool output per session, and the fixed system-plus-tools prefix is about 17,900. The human contributes under a tenth. So an agent's context is mostly machine-generated: actions the model wrote and observations the environment returned. This links back to Lecture 2 (tool use). Every tool you add brings schema tokens into the fixed prefix, and every call brings its output into the history. The practical lesson is to design tool outputs to be short (pagination, head and tail of logs, filtered search results) before worrying about the system prompt.

**Slide 5 — Two long-context challenges.** Two cards side by side. The red card, Capacity, asks "Can the model use the needed evidence?" and says architecture, position encoding and training shape usable context, while evaluation measures it. The blue card, Efficiency, asks "Can the system afford to serve it?" and says attention, KV memory, caching and compaction shape cost and latency.

This slide is the map for the rest of the lecture. Slides 11, 26–36 and 51 are mostly about capacity. Slides 6–10, 12–25 and 37–44 are mostly about efficiency. Compaction (Slides 45–51) sits on both sides: it saves money, but a bad summary also removes evidence the model needs. Keep the two questions separate when debugging. "The agent forgot the constraint" is a capacity or compaction problem; "each step takes 20 seconds" is an efficiency problem.

### Slides 6–11 · LLM inference

**Slide 6 — LLM inference.** Section divider for Part 2.

**Slide 7 — Elements of the serving stack.** A left-to-right pipeline of five boxes. Request ("prompt + controls") feeds a Scheduler ("queue · batch · route", shaded blue). The scheduler feeds a large two-part box: Prefill ("all prompt positions", red top edge) and Decode ("one new position per step", blue top edge, with a loop arrow). Under both sits a black pill labelled KV cache, described as "persistent per-request state". Prefill has a red arrow marked "write" into it; decode has a blue double arrow marked "read + append". The last box, Response, says "streamed tokens". The citation is DistServe (Zhong et al., OSDI 2024).

Read this as the physical path an agent step takes. Every tool call your agent makes becomes one such request. The scheduler decides when and where it runs, which is why the same prompt can have different latency under load. The KV cache is the only thing linking prefill to decode. It is also the object that caching (Slides 37–44) keeps alive between requests. DistServe's own result, for context: by giving prefill and decode separate GPUs, it served 7.4× more requests (or met a 12.6× tighter latency target) than colocated systems while keeping over 90% of requests within their latency limits.

**Slide 8 — Inference phases.** Three panels in a row. Panel 1, "Prefill" (black header), processes red tokens x₁, x₂, x₃, …, xₙ together and leaves a K,V pair under each one. Panel 2, "Decode" (blue), processes one token y₁; its KV row shows a grey "prompt KV" block plus one new K,V. Panel 3, "Decode", processes y₂; its KV row shows "prompt + y₁ KV" plus one new K,V. Captions: prefill is compute-intensive and its latency grows with prompt length; decode is sequential and memory-bandwidth-intensive, one step per output token.

Why the difference? In prefill, n tokens share each read of the weights, so the GPU does many multiplies per byte loaded and stays busy. In decode, the whole model and the whole KV cache are read to produce just one token, so the GPU waits on memory. Batching many users' decode steps together is how servers recover efficiency. For an agent, a step is typically tens of thousands of prompt tokens and a few hundred output tokens, so prefill dominates both cost and time to first token.

**Slide 9 — Serving metrics.** A horizontal timeline. A black dot marks "request arrives". A red bar labelled "prefill" runs to the first blue dot, "first token"; further blue dots mark tokens 2, 3 and 4 at even spacing. A red bracket under the first stretch is TTFT ("arrival → first token"); a blue bracket between the first two output dots is TPOT ("gap between output tokens"). Two boxes underneath define Throughput ("completed tokens or requests ÷ wall-clock time") and Cost ("input + cached input + output token charges").

The useful mental formula is: total latency ≈ TTFT + (output tokens − 1) × TPOT. TTFT includes queueing, not just prefill, so a busy server raises it even for short prompts. The cost box already splits input into regular and cached input, foreshadowing the pricing table on Slide 40. For agents, TTFT per step times the number of steps is what the user feels, and it is the metric prefix caching improves most.

**Slide 10 — Refresher: attention.** Left: the linear projections Q = XW\_Q, K = XW\_K, V = XW\_V and causal self-attention A = softmax((QKᵀ + M)/√d\_k), O = AV. Right: a 6 × 6 grid with Queries down the side and Keys along the top. The lower triangle including the diagonal is red ("Visible history"); the upper triangle is pale ("Future masked"). The notation line defines X ∈ ℝⁿˣᵈ with token-state rows zₜ, rows qᵢ, kⱼ, vⱼ of Q, K, V, key width d\_k, and the mask Mᵢⱼ = 0 for j ≤ i and −∞ otherwise.

Count the red cells: 21 of 36, or n(n+1)/2 in general. That count is the quadratic cost every later slide tries to cut. The same grid reappears on Slides 13, 18 and 24 with different cells coloured, so it is the visual language of the architecture section: each mechanism is "which cells does a query still get to see?" Note also that K and V rows depend only on their own token (under causal masking), which is what makes it legal to cache them.

**Slide 11 — Advertised vs. effective context.** The figure is Greg Kamradt's 2023 needle-in-a-haystack heatmap, titled "Asking GPT-4 To Do Fact Retrieval Across Context Lengths & Document Depth". The x-axis is context length in 15 steps: 1K, 10K, 19K, 28K, 37K, 46K, 55K, 64K, 73K, 82K, 91K, 100K, 109K, 118K and 128K tokens. The y-axis is the placed fact's depth, from top of document (0%) to bottom (100%). Colour runs from green (100% accuracy) through yellow (50%) to red (0%). Everything up to 64K is green. At 73K and 82K a few cells fail (0%, 55%, 65%, 85%). From 100K to 128K a boxed cluster of failures sits in the top half, with values such as 0%, 55%, 65% and 40%. A callout says retrieval "started to degrade at large context lengths when the fact was placed between 10%–50% document depth". Two cells at 128K near 75% depth show 85% and 65%.

The test hides one out-of-place sentence in long filler text and asks the model to repeat it. The failures show that a 128K window is not 128K of reliable recall: the weak zone is long contexts with the fact in the early-to-middle region. This is the capacity problem from Slide 5 in a single picture. It also motivates the training slides (26–36) and the evaluation advice in Going deeper: a model passing this easy test can still fail multi-hop tasks.

### Slides 12–18 · Architectures: global, local and hybrid

**Slide 12 — Architectures for long context.** Section divider for Part 3.

**Slide 13 — Standard attention is global.** The same 6 × 6 causal grid as Slide 10, with every lower-triangle cell red. Caption: "Typically, attention makes pairwise comparisons across the entire sequence."

The slide isolates the property that later slides relax. Global means every query can reach every earlier key in one hop, so a fact at position 1 is as reachable as one at position n−1. That is ideal for recall and bad for cost: prefill does about n²/2 comparisons, and each decode step at position t does t comparisons and needs t cached K,V entries per layer. When the notes say "exact long-range lookup", this is the property they mean.

**Slide 14 — Local modeling.** A single card: "Local computation only considers a constant subset of the other data." Under the heading "Pairwise-comparison cost" it shows O(n²) → O(wn), and notes that w is the local window size, so for constant w the work is linear in n.

A concrete sense of scale: at n = 1,000,000 tokens and w = 4,096, global attention needs about 5 × 10¹¹ comparisons per layer, local about 4 × 10⁹, over 100× fewer. The KV cache for a local layer also stops growing once it holds w entries. "Local" here is broad. It covers sliding windows and also recurrent state updates, which look only at the current token and a fixed-size summary of the past.

**Slide 15 — Periodic global access in hybrid models.** Four boxes in a row. Three blue boxes, Local 1, Local 2 and Local N, each say "cheap state update". A red box, Global, says "retrieve from full history". The caption, in red monospace: N × local computation → 1 × global computation → repeat.

This is the design pattern behind every model on the next slide. Local layers do the bulk of the processing, such as syntax, nearby context and running summaries. Every so often a global layer can look anywhere in the history and pull back an exact detail. The analogy for an agent builder: most steps work from short-term state, but occasionally the agent must re-open an old file. Keeping a few global layers is what stops the model from being unable to do that.

**Slide 16 — Long-context hybrid architectures.** A four-column table of 2026 models:

| Model | Local / stateful calculation | Global calculation | Local : global | Total layers implied |
| --- | --- | --- | --- | --- |
| Qwen3.8-Flash-Next | Gated DeltaNet | QSA sparse retrieval | 36 : 12 ≈ 3:1 | 48 |
| GLM-5.3-Flash | Kimi Delta Attention | DSA + IndexPool | 34 : 11 ≈ 3:1 | 45 |
| Kimi K3 | Kimi Delta Attention | dense Gated MLA | 69 : 24 ≈ 3:1 | 93 |
| Nemotron 3 Ultra | Mamba-2 | dense GQA | 48 : 12 = 4:1 | 60 |
| Inkling-Small | 512-token window | dense GQA | 35 : 7 = 5:1 | 42 |
| DeepSeek-V4-Pro-0813 | 128-token window branch | compressed sparse / dense | interleaved branches | n/a |

The last column is our arithmetic (local + global). Three patterns stand out. First, the ratio clusters between 3:1 and 5:1. Second, the local column is either a recurrent layer (DeltaNet family, Mamba-2) or a short window (512 or 128 tokens). Third, even the global layers are often made cheaper, through sparse retrieval (QSA, DSA) or compressed caches (MLA). A rough consequence for memory: if only the global quarter of layers keeps a full-length KV cache, the cache is about a quarter of an all-global model's, before any per-layer compression. DeepSeek-V4 differs in running local and global paths as parallel branches inside a layer rather than as separate layers.

**Slide 17 — Four recurring mechanisms.** A plain list: sliding-window attention; linear attention or recurrent models; sparse attention; KV compression.

These four are the toolbox for building the "local" and "cheaper global" layers in the table. They cut cost in different places. Sliding windows limit which keys a query sees by distance. Linear and recurrent models replace the growing cache with a fixed-size state. Sparse attention lets a query see a chosen subset of keys. KV compression keeps every key but stores each one in fewer bytes. Slides 18–25 take them in this order.

**Slide 18 — Sliding-window attention.** Left: the 6 × 6 grid now shows a diagonal band three cells wide. Row 1 sees key 1; row 2 sees keys 1–2; rows 3 to 6 each see only themselves and the two keys before them (so w = 3). Cells outside the band are pale ("Outside window / future"). Right: the causal window mask, Mᵢⱼ⁽ʷ⁾ = 0 if 0 ≤ i − j < w and −∞ otherwise. The text says the same attention equation now costs O(nw), and in red: "A local layer cannot directly retrieve distant tokens." New variable: w is the number of causal positions retained by each query. Citation: Longformer (Beltagy et al., 2020).

Only the mask changes; the softmax, Q, K and V are untouched, which makes this the easiest mechanism to add to an existing model. Stacking helps indirectly. Information can hop up to w−1 positions per layer, so L layers give a theoretical reach of about L(w−1) tokens. Mistral 7B used this argument with a 4,096-token window and 32 layers for a reach of about 131K tokens. But each hop passes through a lossy hidden state, so exact recall of a distant identifier is unreliable. That is why the hybrids on Slide 16 keep global layers.

### Slides 19–25 · The recurrent ladder, sparse attention and KV compression

Slides 19–23 share one layout: a five-step tab bar (Softmax 1, Linear 2, DeltaNet 3, Gated DeltaNet 4, KDA 5) with the current step highlighted in red and earlier steps in blue. A left card names what changed; the right side gives the equations. Read them as one derivation, each step adding one idea.

**Slide 19 — Softmax attention.** Step 1 is highlighted. The left card: "Past representation — Growing KV cache. Retain every prior kᵢ, vᵢ; compare qₜ with every kᵢ", tagged "explicit token-level access · O(t) decode comparisons". The right side shows the normalized causal score aₜᵢ = exp(qₜᵀkᵢ/√d\_k) / Σⱼ₌₁..ₜ exp(qₜᵀkⱼ/√d\_k) and the read oₜ = Σᵢ aₜᵢ vᵢ. Citation: Vaswani et al., NeurIPS 2017.

This is the baseline written for a single decode step t rather than for the whole matrix. The key word is "normalized": the denominator depends on every key, so you cannot pre-combine the past into anything smaller than the full list of keys and values. That is the property the next slide removes.

**Slide 20 — Linear attention.** Step 2. Left card: "Past representation — Fixed matrix state. Sₜᵀ stores an online mapping from keys to values", tagged "additive writes · interference is not explicitly erased". Right side, three numbered moves: (1) start from standard attention; (2) replace softmaxᵢ(qₜᵀkᵢ/√d\_k) with the bilinear score qₜᵀkᵢ; (3) reassociate, oₜ = Σ(qₜᵀkᵢ)vᵢ = (Σkᵢvᵢᵀ)ᵀqₜ = Sₜᵀqₜ, with Sₜ = Sₜ₋₁ + kₜvₜᵀ. Key step: dropping the query-normalized weights lets the sum be reordered; Sₜ ∈ ℝ^(d\_k×d\_v) is fixed-size recurrent memory. Citation: Katharopoulos et al., ICML 2020.

A size comparison makes the win concrete. With d\_k = d\_v = 128, Sₜ holds 16,384 numbers per head, whatever the length. A softmax KV cache holds 2 × 128 = 256 numbers per token per head, so it passes Sₜ's size after only 64 tokens and keeps growing. The cost is capacity: a d\_k-dimensional key space can hold at most about d\_k cleanly separable associations, and additive writes pile new pairs on top of old ones.

**Slide 21 — DeltaNet.** Step 3. Left card: "Memory operation — Targeted correction. Read the current association, then write only its prediction error", tagged "correct along kₜ · unrelated memory persists". Right side: prediction and error v̂ₜ = Sₜ₋₁ᵀkₜ, eₜ = vₜ − v̂ₜ; delta-rule write Sₜ = Sₜ₋₁ + βₜkₜeₜᵀ, output oₜ = Sₜᵀqₜ. New variables: v̂ₜ is the memory's prediction, eₜ its error, βₜ ∈ \[0,1\] the correction strength. Citation: Schlag et al., ICML 2021.

A quick check shows why this fixes interference. If kₜ has unit length and βₜ = 1, reading the new state with the same key gives Sₜᵀkₜ = v̂ₜ + (kₜᵀkₜ)eₜ = v̂ₜ + eₜ = vₜ. The old value stored under kₜ is overwritten, not added to. Keys orthogonal to kₜ read back unchanged. Another view: the update is one step of gradient descent, with learning rate βₜ, on the loss ½‖Sᵀkₜ − vₜ‖². The state is a tiny model trained online as the sequence streams past, which is why the paper calls it a "fast weight programmer".

**Slide 22 — Gated DeltaNet.** Step 4. Left card: "New operation — Scalar forgetting. Decay the entire memory before applying the same targeted correction", tagged "αₜ: global retention · βₜ: targeted edit". Right side: whole-state decay S̃ₜ₋₁ = αₜSₜ₋₁, then correction after decay Sₜ = S̃ₜ₋₁ + βₜkₜ(vₜ − S̃ₜ₋₁ᵀkₜ)ᵀ. Setting αₜ = 1 recovers DeltaNet. Citation: Yang et al., 2024 (paper title: "Improving Mamba2 with Delta Rule").

The gate is learned per token, so the model can decide when to forget. A useful rule of thumb: with a constant gate α, a stored association halves after about ln 2 / (1 − α) steps. At α = 0.999 that is about 693 tokens; at α = 0.9999 about 6,900. Mamba-2 has this kind of scalar decay but a purely additive write; DeltaNet has the targeted write but no decay. Gated DeltaNet combines them, and it is the local layer in Qwen3.8-Flash-Next on Slide 16.

**Slide 23 — Kimi Delta Attention.** Step 5. Left card: "New operation — Channelwise forgetting. Give each key-space feature its own memory lifetime", tagged "fine-grained retention · same targeted correction". Right side: per-channel decay Dₜ = Diag(αₜ), S̃ₜ₋₁ = DₜSₜ₋₁, and the KDA recurrence Sₜ = (I − βₜkₜkₜᵀ)DₜSₜ₋₁ + βₜkₜvₜᵀ. αₜ ∈ \[0,1\]^d\_k is a vector gate and I the d\_k × d\_k identity. Equal retention in every channel recovers Gated DeltaNet. Citation: Kimi Linear / KDA, Kimi Team, 2025.

Expanding the product shows it is the same delta rule: (I − βkkᵀ)DS + βkvᵀ = DS + βk(v − (DS)ᵀk)ᵀ. The only change is that D replaces the scalar α, so each row of the state (each key feature) decays at its own rate. Some features can hold long-term facts while others refresh every few tokens. KDA is the local layer in Kimi K3 and GLM-5.3-Flash on Slide 16, and Kimi K3 pairs it with NoPE (Slide 30), because the recurrence already carries order.

**Slide 24 — Sparse attention.** Two panels, each with a 6 × 6 grid. Left, "Fixed pattern — Input-independent" (blue): every row sees key 1 (a global position) plus the current key and the one before it, so G = {1} and w = 2. Formula: Sᵢ^fixed = {j ≤ i : i − j < w} ∪ (G ∩ \[1, i\]); "Predictable cost; the pattern cannot adapt to the query." Right, "Content-dependent — Query-specific" (red): each row lights a scattered set of up to three keys, different per row (for example row 4 sees keys 2 and 4; row 6 sees keys 2, 5 and 6). Formula: Sᵢ^dyn = TopK over j ≤ i of g(qᵢ, kⱼ); "Adaptive retrieval; selector errors exclude relevant keys." Both renormalize over the retained set: Aᵢⱼ = softmax over j ∈ Sᵢ of qᵢᵀkⱼ/√d\_k, oᵢ = Σ Aᵢⱼ vⱼ. New variables: G is a fixed set of global positions, g a learned selector, and |Sᵢ^dyn| = K. Citations: Longformer, 2020; DeepSeek Sparse Attention, 2025.

Unlike sliding windows, content-dependent sparsity can reach any distance, so it can serve as a global layer. The catch is that the selector must still score every earlier key; it is simply much cheaper per key than full attention. In DeepSeek-V3.2 the "lightning indexer" picks the top 2,048 tokens per query, so attention cost per query is fixed at 2,048 keys whatever the context length. Note that sparsity cuts compute but not KV memory: all keys must stay cached because any of them might be selected later.

**Slide 25 — KV compression.** The figure (from DeepSeek-V2) shows four attention designs side by side, each with columns of Queries, Keys and Values; hatched boxes are "Cached During Inference". MHA: eight query heads, eight hatched key heads and eight hatched value heads. GQA: eight queries share four hatched K,V heads in pairs. MQA: all eight queries share one hatched K and one hatched V. MLA: eight per-head keys and values drawn unhatched, fed by a "projection" arrow from a single hatched "Compressed Latent KV" vector. Below: cₜᴷⱽ = W\_Dᴷⱽ zₜ, kₜ⁽ʰ⁾ = W\_UK⁽ʰ⁾ cₜᴷⱽ, vₜ⁽ʰ⁾ = W\_UV⁽ʰ⁾ cₜᴷⱽ. Citations: GQA (Ainslie et al., 2023); DeepSeek-V2, 2024.

The cached bytes per token per layer shrink in steps: MHA stores 2 × heads × d\_h, GQA 2 × groups × d\_h, MQA 2 × d\_h, and MLA only the latent. In the figure's 8-head example GQA halves the cache and MQA cuts it 8×. The DeepSeek-V2 paper reports that MLA cut the KV cache by 93.3% and raised maximum generation throughput 5.76× relative to DeepSeek 67B. This mechanism is complementary to the other three: it shrinks each entry, while windows, recurrence and sparsity change which entries exist or are read. Kimi K3's "dense Gated MLA" global layers on Slide 16 combine global access with this compression.

### Slides 26–31 · Training for length and position encodings

**Slide 26 — Training long-context models.** Section divider for Part 4.

**Slide 27 — Short-to-long training.** Three cards joined by arrows. Short pretraining ("abundant data · lower cost", 4K–8K) → Continued training ("long documents · packed sequences", 32K–128K) → Long adaptation ("task traces · synthetic curricula", 128K+, shown in red).

Why not train at full length from the start? Attention cost per sequence grows with length squared, and very long natural documents are rare, so most tokens are cheapest and most plentiful at short length. The model learns language, facts and reasoning there. The later stages teach two separate things. Continued training teaches the model to use distance, including new position ranges (Slides 28–32). Long adaptation teaches behaviour over long horizons, such as recovering from an error made 100 steps earlier, which is what agents need. The red colour on the last card marks where agent-specific data enters, linking to the SFT and RL lectures (L8, L9, L11).

**Slide 28 — Absolute positional encodings.** Left: a box adding "token state E\[xₜ\]" to "position vector pₜ". Right: zₜ = E\[xₜ\] + pₜ as the first-layer input, and the fixed sinusoidal encoding pₜ,₂ℓ = sin(t/ωℓ), pₜ,₂ℓ₊₁ = cos(t/ωℓ), ωℓ = 10000^(2ℓ/d). Bullets: position enters before the projections that produce Q, K and V; learned absolute embeddings have a fixed table, while sinusoids define positions analytically. Citation: Vaswani et al., 2017.

Each pair of dimensions is a clock hand turning at its own speed. Pair ℓ = 0 turns once every 2π ≈ 6.3 tokens; the last pair turns so slowly that it barely moves across a whole document. Together they give every position a unique pattern, like the digits of an odometer. The weakness for long context is that position is mixed into the token content before attention. The model learns patterns for the absolute values it saw, and positions past the training length produce combinations it never met. A learned table is worse: it has no row at all for position L + 1.

**Slide 29 — Rotary position embeddings (RoPE).** Left: two ovals holding arrows for qᵢ (pointing up-right) and kⱼ (pointing down-right), and a red box labelled "Relative angle j − i". Right: rotate rows of Q and K, q̃ᵢ = R(i)qᵢ and k̃ⱼ = R(j)kⱼ; the score depends on relative displacement, q̃ᵢᵀk̃ⱼ = qᵢᵀR(j − i)kⱼ. New variable: R(t) is block-diagonal in 2D rotations with angles tθℓ. Bullet: V is unchanged; attention uses the same equation with rotated Q and K. Citation: RoFormer, Su et al., Neurocomputing 2024.

The identity works because rotations compose: R(i)ᵀR(j) = R(j − i). Only the angle between query and key matters, not where the pair sits. With the usual θℓ = 10000^(−2ℓ/d) and d = 128, the fastest pair rotates 1 radian per token (wavelength about 6 tokens) and the slowest about 1.15 × 10⁻⁴ radians per token (wavelength about 54,000 tokens). This spread matters on Slide 32. Fast pairs have already wrapped around many times within the training length, so they generalize; slow pairs never completed a turn during training, so angles beyond the trained range are genuinely new to the model.

**Slide 30 — No positional encoding (NoPE).** Left: "token state only E\[xₜ\]" → "model layers — causal order". Right: zₜ = E\[xₜ\], and the attention equation unchanged. Bullets: order is inferred from causal computation or recurrent dynamics, not from pₜ or R(t); this removes position extrapolation, but not the need to train long-range behaviour. Citations: Kazemnejad et al., NeurIPS 2023; Kimi K3 (NoPE with recurrent KDA).

How can a model know order with no position signal? The causal mask makes position t see exactly t tokens, so, for example, attention averages behave differently at different depths, and the network can learn to count from that. Recurrent layers are even more direct: a DeltaNet state after token 5 differs from the state after token 50. Hybrids exploit this. The recurrent local layers supply order, so the global layers can drop RoPE and have no angles that could fall outside the trained range. That is the pattern in Kimi K3 and GLM-5.3-Flash on Slide 33.

**Slide 31 — Position interpolation.** Two bars: "Pretraining range" from 0 to L (blue) and "Target range" from 0 to L′ = sL (red). The red caption: evaluate target position t using the familiar phase t/s. Uniform position interpolation: R(t) → R(t/s), equivalently θℓ → θℓ/s. New variables: L and L′ are the original and target limits, s = L′/L. Bullets: every RoPE dimension is stretched by the same scale s; long positions stay inside the phase range observed during pretraining. Citation: Chen et al., 2023.

Worked instance: extending from L = 4K to L′ = 32K gives s = 8. Position 20,000 is rotated as if it were position 2,500, which the model has seen. The price shows up in the fast dimensions. Neighbouring tokens now differ by 0.125 of a position, so the pair that used to turn 1 radian per token turns only 0.125, and fine local order becomes blurrier. The original paper extended LLaMA models up to 32,768 tokens with fewer than 1,000 fine-tuning steps. The blurring of local detail is the flaw YaRN fixes next.

### Slides 32–36 · YaRN, extension recipes, data and context parallelism

**Slide 32 — YaRN.** Left: three bars. "Long wavelength — interpolate fully" (all red), "Middle — blend" (half blue, half red) and "Short wavelength — keep local phase" (all blue). Right: frequency-selective interpolation θ′ℓ = (1 − γℓ)θℓ/s + γℓθℓ with 0 ≤ γℓ ≤ 1, and an attention-temperature adjustment A = softmax((Q̃K̃ᵀ + M)/(τ√d\_k)) with √(1/τ) = 0.1 ln s + 1. New variables: γℓ ramps from 0 for long wavelengths to 1 for short wavelengths; τ is the attention temperature. Bullets: long-wavelength dimensions are interpolated while short ones keep local distinctions; the temperature correction counteracts attention-entropy drift at larger scales; the τ formula was fit on LLaMA models and is a recipe, not a universal constant. Citation: Peng et al., ICLR 2024.

The ramp is set per dimension by how many full turns it makes within the original length L. In the YaRN paper, for LLaMA, dimensions with fewer than 1 turn are fully interpolated (γ = 0) and those with more than 32 turns are left alone (γ = 1); in between, γ rises linearly. So the fast "clock hands" from Slide 29 keep their resolution, and only the slow ones that would enter unseen angles are squeezed. The temperature term fixes a second effect: with more tokens to spread over, softmax becomes flatter (higher entropy), so logits are sharpened slightly. For s = 8, √(1/τ) = 1 + 0.1 ln 8 ≈ 1.21, so logits are multiplied by 1/τ ≈ 1.46. For s = 16 the factor is about 1.63. Note the square root: the value 0.1 ln s + 1 is the scale applied to both q and k, and their product gives 1/τ.

**Slide 33 — Model-specific extension paths.** A table of six 2026 models with columns "Context-length training", "Position method" and "How it reaches maximum context". Qwen3.8-Flash-Next: 262K native, full curriculum undisclosed, partial RoPE, YaRN extension to 1M. DeepSeek V4: 4K → 16K → 64K → 1M, partial RoPE, progressive training + YaRN. GLM-5.3-Flash: 1M native, exact curriculum undisclosed, NoPE in main attention, no RoPE rescaling. Kimi K3: 8K → 64K → 256K → 1M, NoPE, progressive training to 1M. Nemotron 3 Ultra: 1M long-context CPT and SFT to 512K, implicit order in Mamba with no RoPE, trained and evaluated at long lengths. Inkling: 1M context, curriculum undisclosed, relative position embedding, learned relative representation.

The table sorts into two camps. RoPE models (Qwen, DeepSeek) train to some length and then stretch the angles with YaRN for the last factor, here about 4× for Qwen (262K to 1M). Models without RoPE in their global layers (GLM, Kimi, Nemotron) have nothing to stretch, so they must actually train at long lengths, using progressive curricula. Note that every curriculum grows by factors of about 4 per stage (4K → 16K → 64K, or 64K → 256K → 1M), which keeps each jump small enough for the model to adapt cheaply. "Partial RoPE" rotates only some dimensions, leaving the rest position-free, a halfway point between RoPE and NoPE.

**Slide 34 — Long-context data examples.** Four cards in a 2 × 2 grid. Long documents: "coherent natural structure" — books, codebases, repositories and multi-document corpora. Packed examples: "high token utilization" — efficient, but boundaries and cross-example leakage matter. Agent trajectories: "actions + observations" — teach long-horizon recovery, state tracking and tool use. Synthetic tasks: "controlled dependencies" — place evidence and distractors at designed positions.

Each type covers a gap in the others. Natural long documents are the only source of real long-range structure, but many of them can be predicted from local context alone, so the model may never need to look far back. Packing fills a 128K training window with many short documents, which is efficient, but without masking the model learns to attend across unrelated examples. Agent trajectories are the closest match to deployment. Synthetic tasks, for example "the answer is in a key–value pair 700K tokens back, surrounded by near-duplicates", are the only way to guarantee that distant evidence is required. That is the property the needle test on Slide 11 probes.

**Slide 35 — Long-context data mixtures.** A table with columns Natural long data, Constructed supervision and Length curriculum. Kimi K3: cleaned, upsampled documents + video; permuted multimodal subtasks with evidence across the full context; 8K → 64K → 256K → 1M. GLM-5: documents plus repository files, issues, PRs and diffs; synthetic dependencies + agent trajectories; 32K → 128K → 200K. Nemotron 3 Ultra: long-document QA; multi-document reasoning, sequential scans, synthetic tables; 33B-token 1M CPT, SFT to 512K. DeepSeek V4: scientific papers + technical reports; agentic post-training after long-context pretraining; 4K → 16K → 64K → 1M. Red caption: the shared recipe is coherent long sources + tasks whose answer depends on distant evidence + progressive length growth.

Two details are relevant to agent builders. GLM-5 trains on repository files together with issues, PRs and diffs, which is exactly the shape of a coding agent's context (L6). "Upsampled" in the Kimi row means long documents are repeated more often than their natural frequency, because they are rare. "33B-token 1M CPT" means continued pretraining on 33 billion tokens in 1M-token sequences, which is about 33,000 full-length sequences.

**Slide 36 — Context parallelism.** The figure (Ring Attention) has a vertical "Query Outer Loop" of four query blocks (Query1 solid, Query2–4 hatched) and a horizontal "Key and Value Inner Loop" of four Key/Value block pairs. Each column computes Blockwise Attention, then Blockwise FeedForward. Two middle columns are annotated "compute, send to next device" and "receive from previous device". Three boxes below: Memory / device O(nd\_k/P); Communication overlapped with block attention; Total work O(n²d\_k), exact, not sparse. Citations: Ring Attention (Liu et al., 2023); Megatron context parallelism.

Picture P GPUs in a ring, each owning one slice of the sequence. Each keeps its query block fixed and passes its K,V block to the next GPU. After P − 1 passes every query block has met every key block. The trick is overlap: while a GPU computes attention on the current K,V block, the next block is already arriving, so communication is hidden if compute per block takes longer than the transfer. For a 1M-token sequence on 8 GPUs, each holds 125K tokens of activations. This is a training (and long-prefill) technique, not an inference shortcut. It spreads the quadratic cost across devices without reducing it, which is why it sits in the training part of the lecture.

### Slides 37–44 · Prompt and KV caching

**Slide 37 — Prompt and KV caching.** Section divider for Part 5.

**Slide 38 — KV caching during decoding.** Three horizontal bars with a legend: cached input (blue), regular input (red), model output (black) and tool result (grey hatched). Call 1: a long red "new input", then "output", then "tool result"; note: "create prompt KV; decode output". Call 2: a blue "cached" block as long as all of call 1, then a short red "new input", "output" and "tool result"; note: "tool result returns as new input". Call 3: an even longer blue "cached" block, then new input, output and tool result, almost filling the bar; note: "the reusable prefix keeps growing". Footer: within a call, output tokens extend the KV cache during decode; between calls, the tool result returns as new input and joins the reusable prefix after prefill. Citation: Prompt Cache, MLSys 2024.

Compare this with Slide 3. There, every call paid full price for its whole bar. Here only the red and black parts are computed fresh, and the blue part is loaded. The red part at call t is roughly the previous tool result plus the new user turn, so prefill work per call becomes roughly constant instead of growing. That turns the quadratic cumulative prefill into a linear one. The attention reads during decode still cover the whole context, though, so decode cost per output token still grows. That is the meaning of the takeaway on Slide 53: caching avoids repeated prefill but does not reduce visible history.

**Slide 39 — Empirical benefits of cache reuse.** Two plots. Left, Prompt Cache: latency (ms, 0–1,000) against token length (0–3,000) for "Compute" and "Cache" on a CPU, an A40 and an RTX 4090. The CPU compute curve shoots above 1,000 ms within a few hundred tokens while the CPU cache curve rises gently from about 340 to 620 ms. The A40 compute curve climbs past 1,000 ms by about 3,000 tokens; its cache curve stays near 130–210 ms. The RTX 4090 compute curve reaches about 500 ms; its cache curve about 140 ms. Dotted arrows mark the "cache advantage" on each device, widening with length. Caption: compute grows faster than loading cached attention state; the crossover depends on hardware. Right, "Can I Buy Your KV Cache?": amortized per-call cost in seconds (log scale) against reuse count N from 1 to 1,000 (log scale). A dashed line marks from-scratch prefill of a 3,774-token document at about 15 s. Five KV-reuse curves (255, 485, 945, 1,888 and 3,774 tokens) fall steeply as N grows and flatten between N = 100 and 1,000, the largest near 0.3 s and the smallest near 0.08 s. Caption: one-time prefill is amortized across readers, and per-call cost approaches the reuse-step floor. Footer: measured physical cost and provider API price are different quantities.

The Prompt Cache paper reports time-to-first-token reductions from 8× on GPUs to 60× on CPUs. The CPU gap is bigger because CPUs are slow at the matrix multiplies of prefill but reasonably fast at copying memory. The right plot is the multi-agent version: if many agents read the same document, the first reader pays the prefill and the rest pay only a load. The footer is a warning for budgeting. The hardware saving may be 10–30×, while the price discount you are billed (next slide) is set by the provider's policy.

**Slide 40 — Cached-token API pricing.** USD per 1M tokens, checked Aug. 30, 2026. The pricing table is already reproduced in Detailed notes §5, so here is what it implies:

| Model | Cached as % of regular input | Discount factor | Output ÷ regular input |
| --- | --- | --- | --- |
| DeepSeek V4 Flash | about 3% | about 31× | 3× |
| GLM-5.2 | about 19% | about 5× | about 3× |
| Kimi K3 | 10% | 10× | 5× |
| GPT-5.6 Luna | 10% | 10× | 6× |
| GPT-5.6 Sol | 10% | 10× | 5× |
| Claude Opus 5 | 10% | 10× | 5× |

A per-step example with Claude Opus 5 prices: a 100K-token context with 95K cached, 5K new and 500 output tokens costs 95K × $0.50/M + 5K × $5/M + 500 × $25/M ≈ $0.085. The same step uncached costs about $0.51, six times more. The notes on the slide matter: cache creation may be billed separately (often at a premium), and DeepSeek's range is off-peak to peak.

**Slide 41 — Paged KV-cache allocation.** The vLLM figure. Request A has prompt "Four score and seven years ago our" and outputs "fathers" → "brought" → …. Logical KV blocks hold four tokens each: block 0 = Four, score, and, seven; block 1 = years, ago, our, fathers; block 2 = brought. A block table maps logical to physical blocks with a "# filled" count: 0 → physical 7 (4 filled), 1 → physical 1 (3 → 4 filled once "fathers" is written), 2 → physical 3 (1 filled). On the right, physical KV blocks 0–8 in GPU DRAM show the same tokens scattered in blocks 7, 1 and 3; circled numbers mark the order of events. Citation: Kwon et al., SOSP 2023.

This is virtual memory for the KV cache. Without it, a server must reserve one contiguous region per request sized for the maximum possible output, and most of that sits empty. With pages, memory is claimed four tokens at a time as generation proceeds, so waste is at most one partly filled block per sequence. The paper reports near-zero KV waste and 2–4× higher throughput than earlier systems at the same latency. Paging also makes prefix sharing cheap: two requests with the same system prompt can point their block tables at the same physical blocks.

**Slide 42 — RadixAttention prefix sharing.** Three tree snapshots from the SGLang paper, labelled with steps 3–5 of its example. (3) Match: a single path from the root holds "You are a helpful assistant. User: Hello! Assistant: Hi!" to node b, then "User: Solve this problem… Assistant: Sure! …" to a new green leaf; the request reused the prefix and appended its suffix. (4) Split: the root edge now ends at a blue node after "You are a helpful assistant.", which branches into the "User: Hello!" path (continuing to leaf c) and a new "User: What can you do? Assistant: I can …" branch ending at leaf d; the shared system prompt is stored once. (5) Evict: under memory pressure, the least-recently-used leaf on the Hello branch is removed (dashed orange X, "evicted"), while the other branch grows a "User: Write a story…" leaf.

A radix tree is a prefix tree whose edges hold whole token runs rather than single tokens. Lookup walks from the root and stops at the longest match, which is exactly "how many tokens of this prompt can I skip?". Evicting only leaves guarantees that a prefix used by many requests (like a system prompt) is the last thing thrown out. For agents this is a perfect fit: many parallel sub-agents or retries share the same system prompt, tools and early history.

**Slide 43 — Cache-aware request routing.** Incoming request A ("prefix hash A") → a red Cache-aware router ("score = reusable prefix − queue penalty") → two workers: Worker 1 ("18K match · queue 2", highlighted as the choice) and Worker 2 ("2K match · queue 0"). Citation: SGLang v0.4.

With several GPUs, each holds a different cache, so a round-robin load balancer spreads an agent's calls across workers and loses most reuse. The router predicts each worker's prefix match and trades it off against queueing. Here Worker 1 saves 16K tokens of prefill compared with Worker 2, which usually outweighs two queued requests. The SGLang v0.4 release reported that its cache-aware balancer raised throughput 1.9× (82,665 to 158,596 tokens/s) and the cache hit rate from 20% to 75% on its benchmark. Provider APIs do a version of this for you, which is why some expose a session or cache key.

**Slide 44 — Prompt design for cache reuse.** Four cards. Stabilize the prefix: instructions, tools, examples. Append changing state: new user turn, observations. Avoid needless churn: timestamps, reordered schemas. Measure reuse: cached tokens, TTFT, eviction.

These are the builder-facing rules that follow from Slides 38–43. A cache hit needs the tokens to match exactly from the very first one, so anything that varies must go as late as possible. A current date in the system prompt, a random request ID, or tool schemas serialized from an unordered dictionary each break the match at an early token and turn the rest into a miss. "Measure reuse" is the one most teams skip: log cached-token counts per call, and alert when the hit rate drops, because a silent prompt change can multiply cost several times over.

### Slides 45–51 · Context compaction

**Slide 45 — Context compaction.** Section divider for Part 6.

**Slide 46 — Compaction example.** Left, "Before": five alternating rows. OBSERVATION: CI job times out after 30 minutes. ACTION: Inspect the job log. OBSERVATION: 24K-line log; repeated "address already in use." ACTION: Set --workers=1 and rerun. OBSERVATION: Suite passes; log saved at /tmp/ci.log. A red arrow labelled "compact" points right to "After": one pink OBSERVATION block with four labelled lines (Goal: fix CI timeout. Cause: port collision. Verified: --workers=1 passes. Evidence: /tmp/ci.log.) and one blue NEXT ACTION: open the PR with the tested worker setting.

Notice what each label does. Goal restates intent, so the agent knows why it is acting. Cause is an inference ("address already in use" means a port collision), so the agent need not re-derive it. Verified records a tested fact, with the exact flag copied verbatim. Evidence is a pointer, not content: the 24K lines are gone, but the path lets the agent re-open them. The NEXT ACTION line carries momentum, so the agent resumes rather than restarts. A generic "summarize the conversation" prompt often loses exactly these distinctions, for example writing "fixed by reducing workers" and dropping the flag and the path.

**Slide 47 — Compaction as state estimation.** A three-box pipeline: History Hₜ → Compactor 𝒞\_B → Working state ŝₜ. Below, three requirement cards. Behavioral fidelity: p(A\_future | Hₜ) ≈ p(A\_future | ŝₜ). Bounded representation: ŝₜ = 𝒞(Hₜ; B), |ŝₜ| ≤ B. Recoverability: copy exact anchors; retain pointers to source evidence. Notation: Hₜ is the full history, ŝₜ the compacted working state, B its token budget, A\_future the future actions.

"State estimation" borrows from control and robotics: the agent cannot keep the full past, so it keeps an estimate of the current state that is sufficient for acting. The fidelity equation sets the target. A good compaction is not one a human rates as a nice summary; it is one after which the agent takes the same actions it would have taken with the full history. That changes what to keep. A line of reasoning that led nowhere can be dropped. A constraint that has not mattered yet ("do not touch the migrations folder") must stay, because it will shape a future action. Recoverability is the safety net for the approximation sign: when the estimate turns out to miss something, the pointer lets the agent go back to the source.

**Slide 48 — What survives compaction.** A wide band labelled MODEL-VISIBLE CONTEXT holds three blocks: black "KEEP EXACT — Anchors: goal · constraints", red "ENCODE — Checkpoint: decisions · progress · IDs" and blue "KEEP EXACT — Recent tail: active attempt · fresh result". An arrow leads down from the band to a light-blue "EXTERNALIZE — Evidence store: 24K-line log → 3 failures + command + artifact path". A dashed grey box to the right says "DISCARD — duplicates · superseded attempts". Citations: MemGPT (externalize and retrieve), LongLLMLingua (selective compression).

The colours map to five policies for five kinds of content. Only the middle block is rewritten; both ends are copied byte for byte. That keeps the start of the context stable, which also helps the prefix cache (Slide 44), and it keeps the most recent work exactly as the model produced it. The evidence-store example shows the right granularity: not "the log had errors", but the three distinct failures, the command that produced them and where the full file lives. The two citations represent two ways to shrink content. MemGPT moves it out of the window and pages it back on demand. LongLLMLingua deletes low-information tokens from the prompt itself.

**Slide 49 — Compaction policy decisions.** Four boxes joined by arrows. 1 · Trigger: token threshold, provider overflow, manual request; note: reserve room for the next output. 2 · Select: protect beginning, compact older region, keep recent tail; note: cut at a valid turn / tool boundary. 3 · Replace (red border): readable summary, structured checkpoint, opaque provider item, fresh context. 4 · Recover (red border): leave history unchanged, retry or reset, retain searchable history; note: define behavior when compaction fails. Citations: Codex, OpenCode, Pi, Hermes, OpenHands.

These are the design choices you see when you read real agent harnesses. Trigger: if you wait until the provider rejects the request for overflow, you have already lost a call, so most harnesses compact at a threshold such as 80–90% of the window minus room for the output. Select: an assistant tool call separated from its tool result makes most chat APIs reject the request, so the cut must fall between complete turns. Replace: an "opaque provider item" is a compacted state returned by the API that you pass back without being able to read it. A "fresh context" starts a new conversation seeded only with the checkpoint. Recover: compaction is itself an LLM call and can fail or produce garbage, so the harness needs a fallback, typically keeping the old history and retrying later.

**Slide 50 — Repeated compaction drift.** Four boxes in a chain: History "Use CUDA 12.4" → Summary 1 "Use CUDA 12.x" → Summary 2 "Use recent CUDA" → Summary 3 "Constraint missing" (shaded red). Caption: each update inherits the previous checkpoint, ŝₖ₊₁ = 𝒞(ŝₖ ⊕ Rₖ). Remedies in blue: copy anchors exactly · keep the recent tail · retrieve source evidence. Citation: ReSum.

The mechanism is a recursion. Each summary sees only the previous summary plus new history Rₖ, never the original. Suppose each compaction keeps a given detail exactly with probability p. After k compactions it survives with probability pᵏ: with p = 0.95, that is about 0.77 after 5 rounds and 0.60 after 10. Each loss is small and plausible (12.4 to 12.x looks harmless), so no single step looks like an error. The three remedies break the recursion in different ways. Anchors are never passed through 𝒞. The tail is always fresh. Evidence pointers let a later step re-read the original instead of trusting a copy of a copy.

**Slide 51 — Continuation-based evaluation.** Three boxes: Plant state (constraints · decisions · artifacts) → Compact (apply the production policy, shaded red) → Continue (measure later decisions). Four metric tiles: State recall (constraints + identifiers), Task success (correct continuation), Efficiency (tokens + latency + cost), Stability (repeated compactions).

This is an experimental protocol, and it follows directly from the fidelity equation on Slide 47. You deliberately put known facts into a trajectory, run the exact compaction code you will ship, and check whether later actions respect those facts. State recall can be scored automatically: does the compacted state still contain "CUDA 12.4" and "/tmp/ci.log"? Task success asks whether the agent finishes correctly. Efficiency checks that you actually saved something. Stability repeats the loop several times to expose drift. Always include a no-compaction baseline, so you can tell compaction damage from the agent's ordinary failure rate.

### Slides 52–54 · Takeaways

**Slide 52 — Takeaways.** Section divider.

**Slide 53 — The long-context system stack.** Five numbered red circles, one per layer. 1 Growth: agent loops repeatedly ingest instructions, actions and environment observations. 2 Inference: prefill, decode, dense attention and KV memory create different bottlenecks. 3 Architecture: local, recurrent, sparse and compressed mechanisms choose what history remains accessible. 4 Caching: stable prefixes avoid repeated prefill but do not reduce visible history. 5 Compaction: preserve intent, exact task state, recent work and recovery paths, then evaluate continuation.

Each line compresses one part of the lecture, and each names what that layer can and cannot do. The table below maps each layer to the slides behind it and to who controls it.

| Layer | Slides | Who controls it | What it fixes | What it leaves unsolved |
| --- | --- | --- | --- | --- |
| Growth | 3–5 | Agent designer | (the problem itself) | — |
| Inference | 7–11 | Serving engineer | Explains cost and latency | Quadratic attention remains |
| Architecture | 13–25 | Model builder | Cheaper long-range access | Local layers lose exact recall |
| Training | 27–36 | Model builder | Usable (not just accepted) length | Effective context still below advertised |
| Caching | 38–44 | Agent designer + server | Repeated prefill | Visible context still grows |
| Compaction | 46–51 | Agent designer | Visible context size | Lossy; can drift |

The slide lists five layers; training appears here as its own row because Part 4 of the lecture treats it separately. As an agent builder you directly control only growth, caching-friendly prompt layout and compaction. You choose the rest by picking a model and a provider.

**Slide 54 — Questions.** Closing slide: "Next Class: Agent Capabilities 3 — Skills and Memory" (Lecture 4), which continues where compaction stops by moving state into external memory the agent can read and write.

## Going deeper

The lecture's stack view connects to a decade of work on efficient attention, long-context evaluation, LLM serving and agent context engineering; this section fills in that background and the practical advice that follows from it.

### Lineage of efficient long-context models

The four mechanisms in the lecture have a long history. Transformer-XL (Dai et al., 2019) added segment-level recurrence, carrying cached hidden states from one segment to the next. Sparse Transformers (Child et al., 2019), Longformer and BigBird (Zaheer et al., 2020) introduced fixed sparse patterns mixing local windows with global tokens. Reformer (Kitaev et al., 2020) used hashing to find similar keys, an early form of content-dependent sparsity. Performer (Choromanski et al., 2020) and linear attention approximated softmax with kernels.

A separate line came from state space models. S4 (Gu et al., 2021) and then Mamba (Gu and Dao, 2023) showed that input-dependent recurrent state updates could match transformers on language at small-to-medium scale. Mamba-2 (Dao and Gu, 2024) showed a formal duality between state space models and a form of linear attention, which is why the lecture can put Mamba-2 and DeltaNet-family layers in the same table column. RWKV and RetNet are other members of the same family.

The lesson from this history is that pure sub-quadratic models repeatedly lagged on tasks needing exact recall, such as copying or retrieving a specific identifier from far back. Hybrids with a minority of global attention layers are the pragmatic resolution the lecture's 3:1 to 5:1 table reflects.

### Exact attention got cheaper too

One reason long contexts became practical is not architectural at all. FlashAttention (Dao et al., 2022) and its successors compute exact softmax attention in tiles that stay in fast on-chip memory, avoiding materializing the n × n score matrix. The FLOP count is still quadratic, but memory use becomes linear and wall-clock time drops substantially. Ring Attention, shown in the lecture, is essentially the same blockwise idea distributed across devices.

### Measuring effective context beyond the needle

Needle-in-a-haystack tests are the easiest possible long-context task: one distinctive fact, one lexical match. Harder benchmarks show larger gaps between advertised and effective length:

- **Lost in the Middle** (Liu et al., TACL 2024) found a U-shaped curve in multi-document QA. Models used information at the start and end of the context much better than in the middle.
- **RULER** (Hsieh et al., NVIDIA, 2024) adds multi-needle, multi-hop tracing and aggregation tasks. Many models claiming 128K or more scored far lower at their full length than on the simple needle test.
- **HELMET** (Yen et al., 2024) and LongBench cover more application-like tasks (summarization, citation, in-context learning, code).

For agents, the relevant question is narrower: does the model still follow a constraint stated 150K tokens ago, while acting? That is why the lecture's continuation-based evaluation is the right frame. Build your own small version of it before trusting a model's window.

### Serving techniques the lecture assumes

Several serving ideas sit underneath the prefill/decode picture:

- **Continuous batching** (Orca, Yu et al., OSDI 2022) schedules at the level of individual decode iterations, so finished requests leave the batch and new ones join immediately.
- **Chunked prefill** (Sarathi-Serve, Agrawal et al., 2024) splits long prefills into pieces interleaved with decode steps, protecting TPOT for other users when one request has a huge prompt.
- **Disaggregated serving** (DistServe, cited in the lecture; also Splitwise and Mooncake) places prefill and decode on different machines and ships the KV cache between them. Mooncake builds a whole serving system around a distributed KV-cache store.
- **KV-cache eviction and quantization.** StreamingLLM (Xiao et al., 2023) found that keeping a few initial "attention sink" tokens plus a recent window lets a model run on unbounded streams. H2O and SnapKV drop low-attention entries. KV quantization to 8 or 4 bits halves or quarters memory. These are lossy, model-level analogues of the text-level compaction in Part 6.

### Provider prompt caching in practice

Commercial APIs expose caching in two styles. Some cache automatically once a prompt passes a minimum length (OpenAI does this for prompts of 1,024 tokens or more). Others, such as Anthropic's API, let you mark explicit cache breakpoints, with cache writes billed at a premium and cache reads at a large discount. Caches expire after minutes of inactivity unless a longer TTL is requested. Check the current documentation for exact numbers, since prices and TTLs change.

Three practical consequences follow. First, anything nondeterministic in the prefix (dates, random IDs, dictionary ordering when serializing tool schemas) silently destroys hit rates. Second, long pauses in an agent (waiting for a human, a slow CI job) can outlast the cache TTL, so the next call pays full price. Third, most APIs report cached-token counts in the usage field of each response; log them per step to see your real hit rate.

### Context engineering: a practitioner's toolbox

Compaction is one tool among several that agent builders now call "context engineering" (Anthropic's 2025 engineering post uses this term):

1. **Shrink observations at the source.** Truncate or paginate tool output, return head and tail of logs, and let the agent request more. Since tool results are 37% of tokens in the OpenHands sample, this is often the biggest win.
2. **Observation masking.** Replace old tool outputs with a placeholder while keeping the agent's actions and reasoning. Lindenbauer et al. (2025) reported that this simple approach was competitive with LLM summarization for software-engineering agents, at lower cost.
3. **External memory and notes.** Have the agent maintain a progress file or to-do list outside the context (MemGPT's idea; L4 covers this).
4. **Sub-agents.** Delegate a noisy search or exploration to a sub-agent with its own context and return only a short report.
5. **Retrieval instead of retention.** Keep the full trajectory on disk and let the agent search it, the "retain searchable history" option on the policy slide.

### Open problems

- **Learning to compact.** Most compactors are prompted LLM calls. Training the agent end to end to maintain its own compact state (for example, with RL on long tasks) is an active research direction.
- **Text-level vs KV-level compression.** Summaries are readable and portable across models but lossy and cache-breaking. KV eviction is invisible and model-specific. How to combine them is unsettled.
- **Evaluation.** There is no standard benchmark for compaction fidelity yet; the lecture's plant–compact–continue protocol is a sketch of what one should look like.
- **Long context vs retrieval.** Bigger windows reduce the need for retrieval, but cost, latency and the effective-context gap mean retrieval and compaction remain necessary for long agent runs.

## Worked example

This self-contained sketch implements the lecture's compaction policy (trigger, select, replace, recover) and prices a run with and without prefix caching. `call_llm(messages) -> str` is a stub standing in for any chat-model API; it is not a real library function. Token counts use a crude 4-characters-per-token estimate.

```python
from dataclasses import dataclass, field

def call_llm(messages: list[dict]) -> str:
    """Stub: replace with a real model call. Returns a checkpoint summary."""
    return "Decisions: ...\nProgress: ...\nIDs/paths: ..."

def ntok(text: str) -> int:
    return max(1, len(text) // 4)          # rough token estimate

@dataclass
class Turn:
    role: str                              # "system" | "user" | "assistant" | "tool"
    content: str
    turn_id: int                           # assistant call + its tool result share an id

@dataclass
class Agent:
    anchors: list[Turn]                    # goal + constraints: KEEP EXACT, never summarized
    history: list[Turn] = field(default_factory=list)
    evidence: dict[str, str] = field(default_factory=dict)  # EXTERNALIZE: full text on "disk"
    window: int = 128_000
    reserve: int = 8_000                   # room for the next output
    tail_turns: int = 3                    # recent tail kept exact

    def context(self) -> list[Turn]:
        return self.anchors + self.history

    def used(self) -> int:
        return sum(ntok(t.content) for t in self.context())

    def add_tool_result(self, turn_id: int, text: str, max_inline: int = 2_000) -> None:
        """Shrink observations at the source; keep a pointer to the full output."""
        if ntok(text) > max_inline:
            key = f"evidence/{turn_id}.log"
            self.evidence[key] = text
            lines = text.splitlines()
            text = "\n".join(lines[:20] + [f"... [{len(lines)} lines, full log at {key}] ..."] + lines[-20:])
        self.history.append(Turn("tool", text, turn_id))

    # 1. TRIGGER: token threshold, leaving room for the next output
    def needs_compaction(self) -> bool:
        return self.used() > self.window - self.reserve

    # 2. SELECT: older region vs recent tail, cut on a turn boundary
    def split(self) -> tuple[list[Turn], list[Turn]]:
        ids = sorted({t.turn_id for t in self.history})
        keep_ids = set(ids[-self.tail_turns:])
        old = [t for t in self.history if t.turn_id not in keep_ids]
        tail = [t for t in self.history if t.turn_id in keep_ids]
        return old, tail                    # a call and its result are never separated

    # 3. REPLACE: structured checkpoint; 4. RECOVER: keep old history if it fails
    def compact(self) -> None:
        old, tail = self.split()
        if not old:
            return
        prompt = [
            {"role": "system", "content": "Write a checkpoint: decisions, progress, "
             "exact IDs/paths/flags. Copy identifiers verbatim. Do not restate the goal."},
            {"role": "user", "content": "\n".join(f"[{t.role}] {t.content}" for t in old)},
        ]
        try:
            summary = call_llm(prompt)
        except Exception:
            return                          # recover: leave history unchanged, retry later
        pointers = ", ".join(self.evidence) or "none"
        checkpoint = Turn("user", f"CHECKPOINT\n{summary}\nEvidence store: {pointers}", -1)
        self.history = [checkpoint] + tail  # anchors are untouched, so no drift there

def run_cost(prefix: int, per_step: int, steps: int, cached: bool,
             p_in=5.00, p_cached=0.50) -> float:
    """USD for input tokens only; prices per 1M tokens (Claude Opus 5 row of the slide)."""
    total, ctx = 0.0, prefix
    for _ in range(steps):
        new = per_step if cached else ctx       # with caching, only the suffix is uncached
        reused = ctx - per_step if cached else 0
        total += (max(new, 0) * p_in + max(reused, 0) * p_cached) / 1e6
        ctx += per_step
    return total

if __name__ == "__main__":
    for c in (False, True):
        print("cached" if c else "uncached", round(run_cost(6_000, 5_000, 50, c), 2))
```

What to notice:

- Anchors live outside `history`, so repeated compactions can never paraphrase "Use CUDA 12.4" into "recent CUDA"; only the checkpoint is re-summarized.
- `split` cuts on `turn_id`, which is the slide's "cut at a valid turn / tool boundary" rule; orphaned tool results break most chat APIs.
- Big tool outputs are externalized with a pointer before they ever enter context, which attacks the 37% tool-result share directly.
- The pricing helper reproduces the quadratic growth from Part 1: with the slide's 6K prefix and 5K per step over 50 steps, input costs about $32 uncached and about $4.3 cached at Opus 5 list prices (the first call is simplified as 1K cached plus 5K new).
- Compaction breaks the cache (the checkpoint changes early tokens), so trigger it rarely and near the limit, not every few steps.

## More worked examples

Two further examples: a runnable numpy experiment on the fixed-size memories of Slides 20–23, and a cost walkthrough that stacks caching, observation shrinking and compaction for one agent run.

### Example A · Linear attention vs the delta rule, in 75 lines of numpy

This program builds the state matrix S from Slides 20–23 directly and runs three experiments: overwriting a stored fact, filling the memory past its capacity, and forgetting under scalar vs per-channel decay. It uses only numpy and makes no model or LLM calls. Keys are random unit vectors in 64 dimensions; recall quality is the cosine similarity between what the memory returns for a key and the value that should be stored there.

```python
"""Toy fixed-size memories from Slides 20-23: linear attention, DeltaNet,
Gated DeltaNet and KDA, compared on overwrite, capacity and forgetting.
Pure numpy; no model or LLM calls are involved."""
import numpy as np

rng = np.random.default_rng(0)
D = 64                                   # d_k = d_v = 64

def unit(x):
    return x / np.linalg.norm(x, axis=-1, keepdims=True)

def cos(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

# ---- write rules: S has shape (d_k, d_v); read is S^T q -------------------
def linear(S, k, v):                     # S_t = S_{t-1} + k v^T
    return S + np.outer(k, v)

def delta(S, k, v, beta=1.0):            # S_t = S_{t-1} + beta k (v - S^T k)^T
    return S + beta * np.outer(k, v - S.T @ k)

def gated_delta(S, k, v, alpha=0.98, beta=1.0):
    return delta(alpha * S, k, v, beta)  # decay whole state, then correct

def kda(S, k, v, alpha_vec, beta=1.0):
    return delta(alpha_vec[:, None] * S, k, v, beta)  # per-key-channel decay

def store(rule, keys, vals, **kw):
    S = np.zeros((D, D))
    for k, v in zip(keys, vals):
        S = rule(S, k, v, **kw)
    return S

# ---- 1. Overwrite: store 20 facts, then update 5 of them -----------------
keys = unit(rng.normal(size=(20, D)))
old = rng.normal(size=(20, D))
new = rng.normal(size=(5, D))
seq_k = np.vstack([keys, keys[:5]])
seq_v = np.vstack([old, new])
print("1) Overwrite test: query the 5 updated keys")
for name, rule in [("linear", linear), ("delta", delta)]:
    S = store(rule, seq_k, seq_v)
    reads = [S.T @ keys[i] for i in range(5)]
    c_new = np.mean([cos(r, new[i]) for i, r in enumerate(reads)])
    c_old = np.mean([cos(r, old[i]) for i, r in enumerate(reads)])
    print(f"   {name:7s} cos(read, new)={c_new:+.2f}  cos(read, old)={c_old:+.2f}")

# ---- 2. Capacity: how many random pairs fit in a 64 x 64 state? -----------
print("\n2) Capacity test: mean cos(read, true value) over all stored pairs")
print("   pairs | linear: all oldest16 newest16 | delta: all oldest16 newest16")
for n in (8, 32, 64, 128, 256):
    ks, vs = unit(rng.normal(size=(n, D))), rng.normal(size=(n, D))
    row = []
    for rule in (linear, delta):
        S = store(rule, ks, vs)
        c = np.array([cos(S.T @ k, v) for k, v in zip(ks, vs)])
        row += [c.mean(), c[:16].mean(), c[-16:].mean()]
    print("   {:5d} |      {:.2f}    {:.2f}     {:.2f}  |      {:.2f}    {:.2f}     {:.2f}"
          .format(n, *row))

# ---- 3. Forgetting: one early fact, then 200 steps of chatter -------------
fact_k = np.zeros(D); fact_k[:32] = rng.normal(size=32); fact_k = unit(fact_k)
fact_v = rng.normal(size=D)
chat_k = np.zeros((200, D)); chat_k[:, 32:] = rng.normal(size=(200, 32))
chat_k = unit(chat_k)                    # chatter lives in channels 32..63
chat_v = rng.normal(size=(200, D))
ks = np.vstack([fact_k, chat_k]); vs = np.vstack([fact_v, chat_v])
alpha_vec = np.r_[np.full(32, 1.0), np.full(32, 0.9)]  # slow vs fast channels
print("\n3) Forgetting test: recall the fact written 200 steps ago")
for name, S in [("delta (no decay)", store(delta, ks, vs)),
                ("gated a=0.98", store(gated_delta, ks, vs, alpha=0.98)),
                ("kda slow/fast", store(kda, ks, vs, alpha_vec=alpha_vec))]:
    r = S.T @ fact_k
    print(f"   {name:17s} cos={cos(r, fact_v):+.2f}  "
          f"|read|/|v|={np.linalg.norm(r) / np.linalg.norm(fact_v):.3f}")
```

Output from running it (Python 3, numpy, seed 0):

```text
1) Overwrite test: query the 5 updated keys
   linear  cos(read, new)=+0.63  cos(read, old)=+0.67
   delta   cos(read, new)=+0.97  cos(read, old)=+0.03

2) Capacity test: mean cos(read, true value) over all stored pairs
   pairs | linear: all oldest16 newest16 | delta: all oldest16 newest16
       8 |      0.93    0.93     0.93  |      0.95    0.95     0.95
      32 |      0.80    0.79     0.81  |      0.82    0.72     0.92
      64 |      0.71    0.70     0.72  |      0.68    0.51     0.92
     128 |      0.58    0.60     0.54  |      0.45    0.22     0.88
     256 |      0.45    0.45     0.45  |      0.25    -0.01     0.88

3) Forgetting test: recall the fact written 200 steps ago
   delta (no decay)  cos=+1.00  |read|/|v|=1.000
   gated a=0.98      cos=+1.00  |read|/|v|=0.018
   kda slow/fast     cos=+1.00  |read|/|v|=1.000
```

What to notice:

- **Overwrite (Slide 20 vs 21).** Linear attention returns a blend of the old and new values (cosine about 0.63 with each), because additive writes never erase. The delta rule returns the new value (0.97) and has almost no trace of the old one (0.03). For an agent this is the difference between "the test now passes" replacing "the test fails" and the two being averaged.
- **Capacity.** Neither memory can hold 256 pairs in a 64 × 64 state. They fail differently. Linear attention degrades every item evenly (0.45 for oldest and newest alike). The delta rule keeps the newest 16 items near 0.88 even at 256 pairs, but the oldest 16 drop to about zero: it behaves like a recency-weighted store. This is the associative-recall limit from the Deeper dive in §3b, and the reason hybrids keep global layers for exact old facts.
- **Forgetting (Slide 22 vs 23).** A single scalar gate of 0.98 shrinks the old fact to 0.018 of its size after 200 steps (0.98²⁰⁰ ≈ 0.018), even though the chatter never touched its channels. Per-channel gates (1.0 on the fact's channels, 0.9 on the chatter's) keep the fact at full strength while still letting the chatter channels turn over. That is KDA's point: different features get different lifetimes.
- **The cosine stays at +1.00 under gating.** Decay changes the size of the read, not its direction. In a real layer the tiny read would be swamped by other signals, so a small norm means the fact is effectively gone.

### Example B · Stacking the cost levers on one 40-step coding agent

This is a numeric walkthrough. Assume an agent with a 10K-token fixed prefix (system prompt and tools) that runs 40 steps. Each step the model writes 600 tokens (reasoning and a tool call) and the tool returns 3,000 tokens. Prices are the Claude Opus 5 row of Slide 40: $5 regular input, $0.50 cached input and $25 output per 1M tokens. Cache-write premiums are ignored.

**Step 1 — no caching (strategy A).** Each step adds Δ = 600 + 3,000 = 3,600 tokens. Input at step t is 10K + 3.6K(t − 1). Summed over 40 steps: 40 × 10K + 3.6K × (0 + 1 + … + 39) = 400K + 3.6K × 780 = 3.21M input tokens. Cost: 3.21M × $5/M = $16.04, plus output 40 × 600 × $25/M = $0.60, total $16.64. The final context is 150.4K tokens.

**Step 2 — add prefix caching (strategy B).** The same 3.21M tokens are read, but only the new material is uncached: 10K on step 1 and 3.6K on each later step, 150.4K in total. Cost: 150.4K × $5/M = $0.75 uncached, plus (3.21M − 0.15M) × $0.50/M = $1.53 cached, plus $0.60 output, total about $2.88. That is 5.8× cheaper, with no change to what the model sees.

**Step 3 — shrink observations at the source (strategy C).** Cap each tool result at 1,000 tokens (head and tail plus a file path, as in the existing Worked example). Now Δ = 1,600, cumulative input falls to 400K + 1.6K × 780 = 1.65M, and the final context to 72.4K. With caching the cost is about $1.75.

**Step 4 — add compaction (strategy D).** Compact when context exceeds 40K: the old region becomes a 3K-token checkpoint, the prefix and the last three steps stay exact. The compaction call reads the context (cached) and writes 3K output tokens. After compaction everything past the prefix must be prefilled fresh once. In this run compaction fires twice.

| Strategy | Cumulative input | Peak context | Total cost |
| --- | --- | --- | --- |
| A · no caching | 3.21M | 150.4K | $16.64 |
| B · + prefix caching | 3.21M | 150.4K | $2.88 |
| C · + shrink tool results to 1K | 1.65M | 72.4K | $1.75 |
| D · + compaction at 40K | 1.10M | 38.8K | $1.68 |

What to notice:

- **Caching is the biggest single cost lever**, cutting the bill 5.8× without touching the context. It fixes the efficiency problem from Slide 5, not the capacity problem: peak context is still 150K.
- **Shrinking observations halves both cost and peak context.** It attacks the 37% tool-result share from Slide 4 at the source and, unlike compaction, never breaks the cache.
- **Compaction barely changes cost here ($1.75 → $1.68) but cuts peak context by almost half.** Its real benefit is capacity: the model works in the 0–40K region where Slide 11 shows retrieval is reliable, instead of near 150K.
- **Order matters.** Each lever was evaluated on top of the previous one. Compaction applied to strategy A alone would look far more valuable in dollars, only because caching had not been done first.
- The numbers come from a short script in the scratch folder that applies the formulas above; they are simple arithmetic and can be checked by hand, as done for A and B.

## Key terms

These are the terms the lecture relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Compaction | Replacing older agent history with a shorter working state (summary, checkpoint, pointers) to stay within a token budget. |
| Context parallelism | Splitting one long sequence across devices (e.g. Ring Attention) so each holds O(n dₖ / P) memory; exact attention, same total work. |
| Continuation-based evaluation | Testing compaction by planting state, compacting, and measuring whether later agent decisions stay correct. |
| Decode | The sequential generation phase: one token per step, bottlenecked by memory bandwidth. |
| DeltaNet / Gated DeltaNet / KDA | Linear-attention variants with a fixed-size state updated by an error-correcting delta rule; Gated adds scalar decay, KDA per-channel decay. |
| Effective context | The length a model can actually use reliably on a task, often much shorter than the advertised window. |
| GQA / MQA / MLA | KV-compression schemes: query heads share K,V heads in groups (GQA) or all share one (MQA); MLA caches a low-rank latent and reconstructs per-head K,V. |
| Hybrid architecture | A stack mixing many cheap local or recurrent layers with a few global attention layers, typically 3:1 to 5:1. |
| KV cache | Stored keys and values for all processed tokens, reused so past tokens are not recomputed during decode or later calls. |
| Linear attention | Attention with softmax replaced by a bilinear score, allowing a fixed-size recurrent state Sₜ and constant per-token cost. |
| NoPE | No explicit positional encoding; order is inferred from causal masking or recurrent layers. |
| PagedAttention | vLLM's allocator that stores KV cache in fixed-size blocks mapped by a block table, avoiding fragmentation and enabling sharing. |
| Position interpolation | Extending RoPE to longer contexts by dividing all positions (angles) by the scale factor s. |
| Prefill | The parallel phase that processes the whole prompt and writes its KV cache; compute-bound, drives TTFT. |
| Prefix (prompt) caching | Reusing the KV state of an unchanged prompt prefix across requests, billed at a discounted cached-input rate. |
| RadixAttention | SGLang's radix-tree index of cached prefixes supporting match, split and LRU eviction. |
| RoPE | Rotary position embedding: rotates queries and keys by position-dependent angles so scores depend on relative distance. |
| Sliding-window attention | Each query attends only to the w most recent positions, making cost O(nw). |
| TTFT / TPOT | Time to first token (arrival to first output) and time per output token (gap between output tokens). |
| YaRN | RoPE extension that interpolates long-wavelength dimensions, keeps short-wavelength ones, and adjusts attention temperature. |

## Self-check

These questions test recall, reasoning and design; try each before reading the answer.

1. Why does an agent whose history grows by a constant amount per step accumulate roughly quadratic total input tokens? **Answer:** Each call re-reads the fixed prefix plus all earlier history, so input at call t grows linearly in t. Summing a linear sequence over T calls gives a term proportional to T². In the slide, per-call inputs of 6K–26K add up to 80K after only five calls.
2. In the OpenHands sample of 1,500 sessions, which component takes the largest share of tokens, and what does that suggest? **Answer:** Tool results, at 37% (tool calls add another 20%). The biggest savings usually come from trimming or externalizing what tools return, not from shortening the system prompt.
3. Contrast prefill and decode: what bottlenecks each, and which serving metric does each mainly drive? **Answer:** Prefill processes all prompt tokens in parallel and is compute-bound; it dominates TTFT and grows with prompt length. Decode generates one token per step and is memory-bandwidth-bound, reading weights and the KV cache each step; it drives TPOT.
4. What does Kamradt's needle-in-a-haystack heatmap for GPT-4 show, and why is it not enough to certify a model for agent use? **Answer:** Retrieval was perfect up to about 64K tokens but degraded (down to 0% in some cells) beyond about 73K, mostly when the fact sat 10–50% into the document. It tests a single lexical lookup; agents need multi-hop use of constraints while acting, which degrades sooner, so you need task-specific continuation tests.
5. Derive why linear attention allows a fixed-size state, and name its main weakness. **Answer:** Replacing softmax with the bilinear score qᵀk lets you reorder Σ(qᵀkᵢ)vᵢ into (Σkᵢvᵢᵀ)ᵀq, so the past is summarized by Sₜ = Sₜ₋₁ + kₜvₜᵀ. Its writes are purely additive, so interference between stored associations is never erased; DeltaNet's error-correcting update and the gates in Gated DeltaNet and KDA address this.
6. Why do almost all 2026 long-context models keep some global attention layers, typically in a 3:1 to 5:1 local-to-global ratio? **Answer:** Local and recurrent layers are cheap but compress or truncate the past, so they cannot reliably retrieve an exact distant token. A minority of global layers restores exact long-range lookup, while the majority keeps cost and KV memory low.
7. How does YaRN differ from plain position interpolation? **Answer:** Position interpolation divides every RoPE frequency by s, which also blurs local distinctions. YaRN interpolates only long-wavelength dimensions, keeps short-wavelength ones unchanged, blends the middle, and rescales attention temperature (√(1/τ) = 0.1 ln s + 1, fit on LLaMA) to counter entropy drift.
8. A cache-aware router sees Worker 1 with an 18K-token prefix match and queue 2, and Worker 2 with a 2K match and an empty queue. Where should the request go and why? **Answer:** Worker 1, as in the slide: its score (reusable prefix minus queue penalty) is higher because reusing 18K tokens avoids 16K tokens of prefill. That saving usually outweighs waiting behind two requests, though the penalty weight should be tuned to actual queue delays.
9. Your agent's cached-token rate is near zero even though the system prompt never changes. What would you check? **Answer:** Look for churn early in the prompt: a timestamp or random ID in the system prompt, tool schemas serialized in nondeterministic order, or history edits that alter early turns. Also check that pauses between calls do not exceed the provider's cache TTL and that requests hit the same cache (routing, minimum cacheable length).
10. Why does repeated compaction drift, and how would you design against it? **Answer:** Each checkpoint is summarized from the previous one plus new history (ŝₖ₊₁ = 𝒞(ŝₖ ⊕ Rₖ)), so small paraphrases compound, as in "CUDA 12.4" becoming "recent CUDA" and then missing. Keep anchors verbatim outside the summarized region, keep the recent tail exact, and store pointers to source evidence to re-read instead of re-summarizing.
11. How would you evaluate a new compaction policy before shipping it? **Answer:** Use continuation-based evaluation: plant constraints, decisions and artifacts in real or synthetic trajectories, run the production compaction, then let the agent continue. Measure state recall, task success, efficiency (tokens, latency, cost) and stability across several repeated compactions, compared with a no-compaction baseline.
12. Caching and compaction both reduce cost. Why can they conflict, and how do you reconcile them? **Answer:** Caching rewards an append-only, unchanged prefix, while compaction rewrites earlier context and so invalidates the cache after the edit point. Compact rarely and in large chunks near the budget limit, keep the stable prefix (instructions, tools, anchors) untouched, and prefer shrinking observations before they enter context.

## Practice problems

Twelve exam-style problems, harder than the Self-check. Prices refer to the Slide 40 table (USD per 1M tokens). Work each one before reading its solution.

1. **Cumulative input and cost.** An agent has an 8K-token fixed prefix and adds 4K tokens of history per step. It runs 30 steps on GPT-5.6 Sol ($4.00 regular input, $0.40 cached). Compute (a) the final context size, (b) total input tokens, (c) input cost without caching, and (d) input cost with perfect prefix caching, where only each step's new 4K (and the first call's 8K) is uncached.

   **Solution:** (a) The final context is 8K + 29 × 4K = 124K tokens. (b) Total input is 30 × 8K + 4K × (0 + 1 + … + 29) = 240K + 4K × 435 = 1.98M tokens, about 16× the final context. (c) Uncached, 1.98M × $4/M = $7.92. (d) With caching, the uncached tokens total 8K + 29 × 4K = 124K, costing $0.50. The remaining 1.856M are cached, costing 1.856M × $0.40/M ≈ $0.74. Total input is about $1.24, roughly 6.4× cheaper. The cached part still grows quadratically; only its coefficient fell.
2. **KV-cache sizing for a hybrid.** A dense model has 64 layers, 8 KV heads per layer, head dimension 128 and 16-bit values. (a) How many bytes of KV cache per token, and how much for one 200K-token context? (b) A hybrid version makes 48 of the 64 layers sliding-window layers with w = 4,096 and keeps 16 global layers. How much KV cache does the same context need now?

   **Solution:** (a) Per token, 2 (K and V) × 64 × 8 × 128 × 2 bytes = 262,144 bytes, or 256 KiB. For 200,000 tokens that is about 52.4 GB. (b) One layer stores 2 × 8 × 128 × 2 = 4,096 bytes per token. The 16 global layers keep all 200K tokens: 16 × 200,000 × 4,096 ≈ 13.1 GB. The 48 window layers keep only 4,096 tokens each: 48 × 4,096 × 4,096 ≈ 0.81 GB. The total is about 13.9 GB, 3.8× smaller. Almost all remaining memory is in the global layers, which is why real hybrids also compress or sparsify those (MLA, DSA on Slide 16).
3. **Recurrent state vs KV cache.** A model has 48 layers and 32 heads per layer, with d\_k = d\_v = 128 and 16-bit values. Compare (a) the total size of a DeltaNet-style state across all layers and heads with (b) the per-token KV cache of standard multi-head attention in the same model. At what context length are they equal?

   **Solution:** (a) Each head holds a 128 × 128 matrix, 16,384 values or 32 KiB. Across 48 × 32 heads that is 50,331,648 bytes, about 48 MiB, fixed for any length. (b) MHA stores 2 × 48 × 32 × 128 × 2 = 786,432 bytes (768 KiB) per token. They are equal at 50,331,648 / 786,432 = 64 tokens. Beyond that the recurrent state is smaller, and at 1M tokens it is about 15,600× smaller. The price is that the fixed state must compress everything, which limits exact recall (Example A, capacity test).
4. **Can the local layers reach it?** Inkling-Small uses 35 layers with a 512-token window and 7 dense GQA layers (Slide 16). A user states a constraint 100K tokens before the current step. Can the window layers alone carry that constraint to the current token? What does this imply about the role of the 7 global layers, and what would happen if they were removed?

   **Solution:** Information moves at most w − 1 = 511 positions per window layer, so 35 layers give a theoretical reach of about 35 × 511 ≈ 17.9K tokens. That is far short of 100K, so the window layers cannot carry the constraint on their own. The 7 global layers are the only path by which the current token can read the constraint directly. Without them the model would have a hard 18K-token horizon, and in practice less, since multi-hop relaying through hidden states is lossy. This is the Slide 18 warning ("A local layer cannot directly retrieve distant tokens") made quantitative.
5. **Position interpolation vs YaRN.** A RoPE model trained at L = 32,768 is extended to 131,072. (a) What is s, and what position does PI use for token 100,000? (b) How much does PI slow the fastest dimension's rotation per token? (c) Using YaRN's ramp with α = 1 and β = 32, find γ and the new frequency for dimensions with wavelengths 6.28, 2,000 and 54,000 tokens. (d) What logit scale does the temperature rule give?

   **Solution:** (a) s = 131,072 / 32,768 = 4, so position 100,000 is rotated as position 25,000. (b) The fastest pair drops from 1 radian per token to 0.25, so neighbouring tokens become four times harder to tell apart. (c) The ratio r = L/λ gives about 5,215 for λ = 6.28 (above 32, so γ = 1 and the frequency is unchanged), about 0.61 for λ = 54,000 (below 1, so γ = 0 and θ′ = θ/4), and 16.4 for λ = 2,000. For the last, γ = (16.4 − 1)/31 ≈ 0.50 and θ′ = (0.50/4 + 0.50)θ ≈ 0.62θ. (d) √(1/τ) = 1 + 0.1 ln 4 ≈ 1.139, so logits are scaled by about 1.139² ≈ 1.30.
6. **When cache-aware routing is wrong.** A 20K-token request arrives. Worker 1 has an 18K-token prefix match and 2 requests queued; Worker 2 has a 2K match and an empty queue. Prefill runs at 10K tokens/s on both, and each queued request occupies a worker for 1.5 s. (a) Which worker gives the lower time to first token? (b) Above what per-request queue time does Slide 43's choice (Worker 1) become the wrong one?

   **Solution:** (a) Worker 1 must prefill 2K new tokens (0.2 s) after waiting 2 × 1.5 = 3.0 s, so TTFT is about 3.2 s. Worker 2 must prefill 18K tokens (1.8 s) with no wait, so TTFT is about 1.8 s. Here Worker 2 wins, unlike on the slide. (b) Worker 1 saves 16K tokens, or 1.6 s of prefill. It is better only if its queue costs less than 1.6 s, meaning each of the 2 queued requests takes under 0.8 s. The lesson is that the "queue penalty" in the router's score must be calibrated to real service times. Routing to Worker 1 still has a cluster-wide benefit, since it avoids 16K tokens of GPU work that other users would otherwise wait behind.
7. **Debug the trajectory.** A coding agent produced the log below. Identify what went wrong in terms of the lecture's concepts, name the exact slide that predicts it, propose three concrete fixes, and describe a test that would have caught it before release.

   ```text
   step  3  USER: The build must use CUDA 12.4. Do not upgrade the GPU driver.
   step 41  [compaction 1] checkpoint: "Environment: CUDA 12.x required."
   step 77  [compaction 2] checkpoint: "Environment: use a recent CUDA."
   step 80  ACTION: pip install torch --index-url https://download.pytorch.org/whl/cu126
   step 81  OBSERVATION: installed torch (cu126); warning: driver too old for CUDA 12.6
   step 82  ACTION: sudo apt install nvidia-driver-560
   ```

   **Solution:** This is repeated compaction drift (Slide 50): each checkpoint was built from the previous one, so "12.4" became "12.x" and then "recent", and the second constraint (do not upgrade the driver) vanished entirely. Step 82 violates a user constraint that the full history contained, so behavioral fidelity (Slide 47) failed. Fix 1: store user constraints as anchors that are copied verbatim into every context and never passed through the compactor (Slide 48). Fix 2: use a structured checkpoint with a Constraints field, and fail the compaction if that field loses items or exact tokens such as version numbers. Fix 3: keep the original user turn in a searchable evidence store and have the agent re-read it before environment-changing actions. A continuation-based test (Slide 51) would plant "CUDA 12.4" and "no driver upgrade" early, force two or more compactions, then check that state recall contains both strings and that no later action installs another CUDA or driver.
8. **The 3% cache hit rate.** An agent's system prompt template begins "You are a build assistant. Current time: {now}.", tool schemas are serialized with json.dumps on a dict built from a set, and to save space the harness deletes tool results older than 10 steps from the history each turn. The typical context is 100K tokens and a run has 50 steps on Claude Opus 5. List every cause of the low hit rate, estimate the cost difference between 3% and 95% hits, and give a fix for each cause.

   **Solution:** Three causes, all early-token churn (Slide 44). The timestamp changes on every call at about token 10, so everything after it misses. Iterating over a set gives no stable order, so tool schemas can be reordered between processes, breaking the prefix near the top. Deleting old tool results edits the middle of the history every turn, invalidating everything after the first deletion. At 100K input per step over 50 steps (5M tokens), 3% hits cost about 4.85M × $5/M + 0.15M × $0.50/M ≈ $24.3 of input, while 95% hits cost about 0.25M × $5/M + 4.75M × $0.50/M ≈ $3.63, roughly 7× less. Fixes: move the time into the latest user message (or drop it); serialize schemas from a sorted list with sort\_keys=True; and replace per-turn deletion with rare, large compaction near the limit, or with observation masking applied only at compaction time.
9. **How reliable must the compactor be?** A detail passed through a compactor survives each compaction with probability p, independently. (a) With p = 0.97, what is the chance it survives 12 compactions? (b) What p would be needed for 99% survival over 12 compactions? (c) What does this imply for design?

   **Solution:** (a) 0.97¹² ≈ 0.69, so about a 31% chance the detail is lost by the end. (b) p must satisfy p¹² ≥ 0.99, so p ≥ 0.99^(1/12) ≈ 0.99916, less than one loss per 1,000 compactions. (c) No prompted LLM summarizer reliably reaches that for every detail, so critical items must not go through the compactor at all. Copy anchors exactly (p = 1 by construction) and keep pointers to source evidence. Repeated summarization is acceptable only for information the agent can afford to lose or can re-derive from the evidence store.
10. **Latency budget of an agent step.** A provider gives TTFT = 1.2 s for your 80K-token prompt and TPOT = 25 ms. Each step emits 400 output tokens and a run has 60 steps. (a) What is the model-side wall-clock time per step and per run? (b) Caching cuts TTFT to 0.3 s. How much time does it save per run? (c) Which lever would save more time, and why does this differ from the cost picture?

    **Solution:** (a) Per step, 1.2 + 399 × 0.025 ≈ 11.2 s, so 60 steps take about 670 s, roughly 11 minutes. (b) With caching, a step takes 0.3 + 9.975 ≈ 10.3 s, saving 0.9 s per step or 54 s per run, about 8%. (c) Decode dominates: 399 × 25 ms ≈ 10 s per step. Halving output length (terser reasoning, compact tool-call formats) would save about 5 s per step, far more than caching does. For cost, input dominates because input tokens outnumber output about 200 to 1. For latency, output dominates because decode is sequential (Slide 8). The two metrics point at different levers.
11. **Critique: "We have a 1M-token window, so we don't need compaction."** A teammate proposes letting a long-running research agent grow to 1M tokens without compaction. Give at least four specific objections using the lecture, with numbers where possible.

    **Solution:** Capacity: advertised is not effective context (Slide 11). GPT-4 already failed retrieval at 73K–128K, and multi-hop use of constraints degrades sooner than single-needle lookup. Cost: even fully cached, reading 1M tokens costs $0.50 per step on Claude Opus 5 (Slide 40), so 200 steps near the limit cost about $100 in cached input alone. Latency: decode must read the whole KV cache every output token (Slide 8), so TPOT rises with context, and any cache miss means a 1M-token prefill, a TTFT of many seconds. Serving: long KV caches reduce how many requests fit on a GPU, lowering throughput and raising queueing for everyone. Quality: the relevant evidence is diluted by hundreds of thousands of tokens of stale tool output. A defensible plan is to shrink observations, cache the prefix, and compact near a lower budget with anchors and an evidence store.
12. **Design a compaction evaluation.** You maintain a coding agent whose compactor turns the older region into a structured checkpoint. Design a continuation-based evaluation (Slide 51): what you plant, how you compact, what you measure, and what baseline and pass criteria you use.

    **Solution:** Plant: take 50 real long trajectories and insert, early on, three kinds of state: a user constraint with an exact token ("pin numpy==1.26.4"), a decision with its reason ("chose SQLite over Postgres because tests run offline"), and an artifact identifier (a branch name and a log path). Compact: run the production policy at its real trigger and then force two further compactions to test stability. Measure state recall by exact string match of each planted item in the checkpoint; task success by whether the agent finishes the task with tests passing; violations by scanning later actions for commands that break a planted constraint; and efficiency by tokens, cost and TTFT per step. Baseline: the same trajectories continued without compaction (or with a very large window), so you measure compaction damage rather than normal failures. Pass criteria might be 100% recall for anchored constraints, no more than a 2-point drop in task success, and no increase in constraint violations after the third compaction.

## References and further reading

The first list covers every source the slides cite, grouped by the lecture's parts; the second adds background worth reading next.

### Cited in the lecture

**Inference and evaluation**

- [DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving](https://arxiv.org/abs/2401.09670) — Zhong et al., OSDI 2024 — source of the serving-stack, phase and TTFT/TPOT diagrams.
- [LLMTest\_NeedleInAHaystack](https://github.com/gkamradt/LLMTest_NeedleInAHaystack) — Greg Kamradt, 2023 — the original needle-in-a-haystack test and GPT-4 heatmap.

**Architectures**

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — Vaswani et al., NeurIPS 2017 — softmax attention and sinusoidal position encodings.
- [Longformer: The Long-Document Transformer](https://arxiv.org/abs/2004.05150) — Beltagy, Peters, Cohan, 2020 — sliding-window plus global-token sparse attention.
- [Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention](https://arxiv.org/abs/2006.16236) — Katharopoulos et al., ICML 2020 — the linear-attention reordering trick.
- [Linear Transformers Are Secretly Fast Weight Programmers](https://arxiv.org/abs/2102.11174) — Schlag, Irie, Schmidhuber, ICML 2021 — the delta-rule update (DeltaNet).
- [Gated Delta Networks: Improving Mamba2 with Delta Rule](https://arxiv.org/abs/2412.06464) — Yang, Kautz, Hatamizadeh, 2024 — adds scalar gating to DeltaNet.
- [Kimi Linear: An Expressive, Efficient Attention Architecture](https://arxiv.org/abs/2510.26692) — Kimi Team, 2025 — introduces Kimi Delta Attention (per-channel gating).
- [DeepSeek-V3.2: Pushing the Frontier of Open Large Language Models](https://arxiv.org/abs/2512.02556) — DeepSeek-AI, 2025 — describes DeepSeek Sparse Attention (content-dependent top-K with a lightning indexer).
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245) — Ainslie et al., 2023 — grouped-query attention.
- [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model](https://arxiv.org/abs/2405.04434) — DeepSeek-AI, 2024 — multi-head latent attention and the MHA/GQA/MQA/MLA figure.

**Training and position encodings**

- [RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864) — Su et al., Neurocomputing 2024 — RoPE.
- [The Impact of Positional Encoding on Length Generalization in Transformers](https://arxiv.org/abs/2305.19466) — Kazemnejad et al., NeurIPS 2023 — evidence for NoPE.
- [Extending Context Window of Large Language Models via Positional Interpolation](https://arxiv.org/abs/2306.15595) — Chen et al., 2023 — uniform RoPE interpolation.
- [YaRN: Efficient Context Window Extension of Large Language Models](https://arxiv.org/abs/2309.00071) — Peng et al., ICLR 2024 — frequency-selective interpolation plus temperature.
- [Ring Attention with Blockwise Transformers for Near-Infinite Context](https://arxiv.org/abs/2310.01889) — Liu, Zaharia, Abbeel, 2023 — context parallelism across devices.
- Megatron Core context parallelism — NVIDIA — production implementation of sequence splitting for training (see the Megatron Core developer guide).

**Models in the tables**

- Qwen3.8-Flash-Next — Qwen Team, 2026 — Gated DeltaNet hybrid, YaRN to 1M (as cited on the slide).
- [GLM-5 repository](https://github.com/zai-org/GLM-5) — Z.ai, 2026 — GLM-5 family, data mixture with repository files, issues, PRs.
- [Kimi K3](https://www.kimi.com/ai-models/kimi-k3) — Moonshot AI, 2026 — KDA + gated MLA hybrid with NoPE, 8K→1M curriculum.
- [NVIDIA Nemotron 3 Ultra Technical Report](https://research.nvidia.com/labs/nemotron/files/NVIDIA-Nemotron-3-Ultra-Technical-Report.pdf) — NVIDIA, 2026 — Mamba-2 + GQA hybrid, 1M CPT.
- [Welcome Inkling by Thinking Machines](https://huggingface.co/blog/thinkingmachines-inkling) — Thinking Machines Lab / Hugging Face, 2026 — 512-token window + GQA, relative positions.
- DeepSeek V4 technical report — DeepSeek-AI, 2026 — 4K→16K→64K→1M progressive training (as cited on the slide).

**Caching**

- [Prompt Cache: Modular Attention Reuse for Low-Latency Inference](https://arxiv.org/abs/2311.04934) — Gim et al., MLSys 2024 — reusing attention state across prompts; latency plot.
- [Can I Buy Your KV Cache?](https://arxiv.org/abs/2606.13361) — 2026 — amortizing one prefill across many agent readers (a "prefill CDN").
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., SOSP 2023 — vLLM's paged KV cache.
- [SGLang: Efficient Execution of Structured Language Model Programs](https://arxiv.org/abs/2312.07104) — Zheng et al., 2023 — RadixAttention prefix tree.
- [SGLang v0.4 release blog](https://www.lmsys.org/blog/2024-12-04-sglang-v0-4) — LMSYS, 2024 — cache-aware load balancing.
- Provider pricing pages (DeepSeek, Z.AI, Kimi, OpenAI, Anthropic), checked Aug. 30, 2026 — source of the cached-token price table.

**Compaction**

- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — Packer et al., 2023 — externalize memory and page it back in.
- [LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression](https://arxiv.org/abs/2310.06839) — Jiang et al., 2023 — selective token-level prompt compression.
- [ReSum: Unlocking Long-Horizon Search Intelligence via Context Summarization](https://arxiv.org/abs/2509.13313) — Wu et al. (Alibaba Tongyi), 2025 — summary-conditioned continuation for search agents.
- Agent harnesses with compaction: [Codex CLI](https://github.com/openai/codex) (OpenAI), [OpenCode](https://github.com/sst/opencode), [Pi](https://github.com/badlogic/pi-mono), [Hermes Agent context compression docs](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching) (Nous Research), [OpenHands](https://github.com/All-Hands-AI/OpenHands) — compare their trigger, select and replace choices.

### Further reading

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — Liu et al., TACL 2024 — the U-shaped position effect; why placement matters.
- [RULER: What's the Real Context Size of Your Long-Context Language Models?](https://arxiv.org/abs/2404.06654) — Hsieh et al., 2024 — harder synthetic tasks that expose effective context.
- [HELMET: How to Evaluate Long-Context Language Models Effectively and Thoroughly](https://arxiv.org/abs/2410.02694) — Yen et al., 2024 — application-style long-context evaluation.
- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) — Dao et al., 2022 — why exact attention became practical at long lengths.
- [Mamba: Linear-Time Sequence Modeling with Selective State Spaces](https://arxiv.org/abs/2312.00752) — Gu and Dao, 2023 — the selective SSM behind Mamba-2 layers.
- [Transformers are SSMs (Mamba-2)](https://arxiv.org/abs/2405.21060) — Dao and Gu, 2024 — the link between state space models and linear attention.
- [Efficient Streaming Language Models with Attention Sinks](https://arxiv.org/abs/2309.17453) — Xiao et al., 2023 — KV eviction with sink tokens (StreamingLLM).
- [Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve](https://arxiv.org/abs/2403.02310) — Agrawal et al., 2024 — chunked prefill.
- [Mooncake: A KVCache-centric Disaggregated Architecture for LLM Serving](https://arxiv.org/abs/2407.00079) — Qin et al., 2024 — serving built around a shared KV store.
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic, 2025 — practical compaction, note-taking and sub-agent patterns.
- [The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management](https://arxiv.org/abs/2508.21433) — Lindenbauer et al., 2025 — a strong, cheap baseline for compaction.
- [Toward Reliable Context Compression for Long-Horizon Agents: An Empirical Study of Execution Instability](https://arxiv.org/abs/2608.06503) — 2026 — recent empirical study of how compaction destabilizes agent runs.
- [Zoology: Measuring and Improving Recall in Efficient Language Models](https://arxiv.org/abs/2312.04927) — Arora et al., 2023 — traces most of the quality gap of efficient sub-quadratic models to associative recall; cited in the Deeper dive on recurrent layers.
- [Mistral 7B](https://arxiv.org/abs/2310.06825) — Jiang et al., 2023 — sliding-window attention with W = 4,096 and a theoretical span of about 131K tokens; cited in the Slide 18 companion.
- [DeepSeek-V3.2-Exp in vLLM: Fine-Grained Sparse Attention in Action](https://vllm.ai/blog/2025-09-29-deepseek-v3-2) — vLLM team, 2025 — how the DSA lightning indexer selects the top 2,048 tokens per query.
- [DistServe (arXiv version)](https://arxiv.org/abs/2401.09670) — Zhong et al., 2024 — source of the 7.4× more requests / 12.6× tighter SLO figures quoted in the Slide 7 companion.
- [SGLang v0.4 release blog](https://lmsys.org/blog/2024-12-04-sglang-v0-4/) — LMSYS, 2024 — source of the cache-aware load balancer numbers (1.9× throughput, 20% to 75% cache hit rate) in the Slide 43 companion.
- [YaRN (arXiv version)](https://arxiv.org/abs/2309.00071) — Peng et al., 2023 — defines the ramp with α = 1, β = 32 for LLaMA and the temperature rule √(1/t) = 0.1 ln s + 1.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T01 - The Agent Loop and Harness Design]]
- Topic deep dive: [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]]
- Topic deep dive: [[T04 - Agent Memory and Skills]]
- [[Context Engineering - Concepts and Tutorials]]
- [[DeepSeek-V4 a million-token context that agents can actually use]]

[[L02 - Tool Use|← L2]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L04 - Memory and Skills|L4 →]]
