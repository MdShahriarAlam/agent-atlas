---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, context-engineering, kv-cache, long-context]
aliases: ["CMU T3", "Context Engineering: KV Cache, Prefix Caching and Compaction"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 3 · Context Engineering: KV Cache, Prefix Caching and Compaction

[[T02 - Tool Calling, Schemas, MCP and Constrained Decoding|← T2]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T04 - Agent Memory and Skills|T4 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L03 - Long-Context Agents]], [[L06 - Coding Agents]], [[L10 - Deep Research Agents]], [[L12 - RL Systems]], [[L14 - OpenHands]], [[L15 - Orchestration and Monitoring]], [[L18 - Multi-agent Systems]], [[L21 - Search and Planning]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L3, L6, L10, L12, L14, L15, L18, L21 · 11-768 AI Agents, Fall 2026

## Overview

Context engineering is the discipline of deciding what an agent's model sees on each call, and paying for it efficiently, as history grows from a few thousand tokens to hundreds of thousands. It matters because every agent step re-reads the whole transcript, so context is simultaneously the agent's working memory, its largest cost line and its main source of silent failure.

**Why it matters for real agents.** An agent loop appends each action and each tool result to the prompt, then calls the model again. History grows linearly, but the tokens you process (and pay for) grow roughly quadratically in the number of steps. L3 (Neubig) measured a mean of 77,922 tokens per session across 1,500 OpenHands sessions, with tool results alone taking 37% of the prompt. At that scale three things go wrong at once. Cost and latency balloon, GPU memory for the key-value (KV) cache runs out, and the model starts missing evidence it technically "has". Context engineering is the set of techniques that keep all three under control: serving tricks (KV caching, paging, prefix reuse), model architecture (sparse, local and recurrent attention; position extrapolation) and harness policy (truncation, compaction, externalized memory, sub-agents).

**Key questions this sheet answers.**

- Why does input cost grow quadratically with the number of agent steps, and what exactly is quadratic inside attention?
- What is the KV cache, how large does it get (layers × KV heads × head dimension × tokens × bytes), and how do GQA, MLA and PagedAttention shrink or organize it?
- How do prefill and decode differ, why do serving systems separate them, and what do TTFT and TPOT measure?
- How does prefix caching work (block hashing, radix trees, cache-aware routing), and how do you design prompts that keep cache hit rates high?
- How do models reach 128K–1M token windows (RoPE, position interpolation, YaRN, NoPE, hybrid linear/sparse attention), and why is effective context shorter than advertised context?
- What should survive compaction, what should be externalized or discarded, and why do repeated summaries drift?
- When do observation masking, summarization or sub-agents give the best cost/quality trade-off?
- How do you evaluate a compaction policy so that you measure the agent's later behaviour, not the summary's prose?

**Which lectures cover it.**

- **L3 (Long-context agents, Neubig)** is the main lecture. It covers context growth, inference phases, attention cost, long-context architectures, position encodings and training, KV/prompt caching and compaction with continuation-based evaluation.
- **L1 (Agents)** frames "coherence over long context" as a core capability, solved by harness engineering (compaction, memory lookup, sub-agent delegation) and by long-context training. It also names vLLM and SGLang as the KV-cache-reusing inference layer.
- **L4 (Memory and skills)** treats the context window as one place to store what the agent learned, contrasted with external artifacts and weights, and shows progressive disclosure for skills.
- **L5 (Planning)** shows a real compaction (128k → 14k tokens) followed by a poor decision, sub-agent delegation (`launch_subagent`, RAO) and the warning that summary handoffs can drop needed context.
- **L6 (Coding agents)** defines a harness as prompts + tools + agent loop + context management, and shows long-context mid-training for code (Qwen2.5-Coder 8K → 32K with YaRN to 128K).
- **L7 (Computer-use agents)** shows interleaved screenshot tokens as a fast-growing context and notes that long contexts are expensive in prefill.
- **L10 (Deep research agents)** shows retrieved text becoming context at every step and that BrowseComp accuracy rises with the context budget (8K → 128K) in Tongyi DeepResearch; it also mentions cached tool results for efficient RL rollouts.
- **L12 (RL systems, Gandhi)** carries KV and prefix caching into the RL sampler and trainer, and shows that compaction and reasoning-stripping templates break sequence extension, so rollouts should travel token-in, token-out (sections 11–12).
- **L14 (OpenHands)** shows a production condenser over an append-only event log, plus skills, MCP tools and the single-agent choice as context decisions (sections 13–14, M9).
- **L15 (Orchestration and monitoring, Fried)** replaces the transcript with typed shared state, so code assembles each node's context; checkpoints make that state durable (section 15).

**Prerequisites.** You should know what a token is, the basic agent loop (think, call a tool, read the result) and the outline of a transformer. Matrix multiplication and big-O notation help for the cost sections. No GPU programming is needed.

**Suggested reading path.** Read Core concepts sections 1–3 for the cost picture, then 4–5 for KV and prefix caching. If you build harnesses rather than models, skim 6–7 and read 8–10 closely. Then do the Hands-on programs, work through the checklist, and test yourself with the practice questions. The Mechanics section is the reference for derivations when a number looks surprising.

**Newer lectures.** Three later lectures move context engineering out of the serving stack and into training and frameworks. **L12 (RL systems, Gandhi)** shows the same KV and prefix caches inside the RL sampler, where GRPO groups share prompts and every weight update can invalidate the cache; it also shows that compaction breaks the "sequence extension" property and so raises training cost. **L14 (OpenHands)** gives a production condenser (`LLMSummarizingCondenser` with `max_size` and `keep_first`) that rewrites only the LLM's view while the full event log is kept, and treats skills as instructions loaded on demand. **L15 (Orchestration, Fried)** shows a different answer altogether: in an explicit workflow, typed shared state decides what each model call sees, so context is assembled by code per node instead of accumulated in one transcript. Core concepts sections 11–15 cover this material; the L12, L14 and L15 notes under Across the lectures, Mechanics M9 (the condenser's rhythm and cache cost), the L12–L15 patterns, Landscape rows, open problems 10–12, new glossary terms and practice questions 16–22 extend it.

**Lecture 18.** L18 (Multi-agent systems, Vaduguru) treats context as the first limit of a single stream. It adds RAO's evidence that delegation substitutes for window size, and shared context through blackboards and DeLM's append-only typed log. See section 16, "L18 · Multi-agent systems" under Across the lectures, and open problem 13. L17 adds nothing specific to this topic; see T15.

**Lecture 21.** L21 (Search and Planning, Koh) adds Recursive Language Models, which keep a long prompt in a REPL instead of the window, RAO's delegation results at 256K context, and search traces and imagined rollouts that grow the context. See "L21 · Search and planning" under Across the lectures; T5 covers the search itself.

## Concept map

![[cmu-ai-agents-T03-concept-map.png]]
*Concept map: Context engineering · agent-loop growth, three levers (serving, model, harness), and how to measure them*

Read it top down: the agent loop creates the growth, each column is one lever with its main techniques (the highlighted harness column is the one a builder controls directly), and every change should be checked with the measurements at the bottom.

## Core concepts

This section builds the topic in ten steps, from why agent prompts grow, through the hardware and model mechanisms that make long context expensive, to the harness policies that keep it usable. Each step defines its terms and ends with the misconception most people hold about it.

### 1. Why agent context grows, and why cost is quadratic

An **agent loop** repeatedly calls a language model with the full transcript so far. The **context** (or prompt) of call *t* is everything the model reads on that call: the system prompt, tool definitions, the user's request, and every earlier reasoning step, tool call and tool result. A **token** is the unit the model reads, roughly three-quarters of an English word. The model has no memory between calls, so the harness must resend history each time.

L3 (Neubig) writes the input of call *t* as "fixed prefix + history before call *t*". In the slide's example the prefix is 6K tokens and each step adds 5K tokens (the model's output plus the tool result). The five calls read 6K, 11K, 16K, 21K and 26K tokens, for 80K cumulative input tokens. History grew by 20K tokens, but the model processed 80K. This is "quadratic input from linear history growth": if each step adds Δ tokens to a prefix of P tokens, *T* calls read T·P + Δ·T(T−1)/2 tokens in total.

The quadratic term dominates quickly. With P = 6K and Δ = 5K, 10 calls read 285K tokens, 30 calls read 2.36M and 60 calls read 9.2M (see the Hands-on program). Manus reports that a typical task takes around 50 tool calls and that its input-to-output token ratio is around 100:1. Beyond the lecture: Anthropic reports that agents use about 4× more tokens than chat, and multi-agent systems about 15×.

**What fills the context.** L3 breaks down the mean 77,922-token session across 1,500 OpenHands sessions:

| Component | Share of tokens | Typical content |
| --- | --- | --- |
| System prompt + tool definitions | 23% | Instructions, JSON schemas for each tool |
| User messages | 9% | Task statement, follow-ups |
| Reasoning | 9% | Model's thinking text |
| Other | 2% | Miscellaneous |
| Tool calls | 20% | Commands, file edits, search queries |
| Tool results | 37% | Logs, file contents, search pages, test output |

Two lessons follow. First, tool results are the largest and most compressible slice, which is why observation truncation is the cheapest first lever. Second, almost a quarter is a fixed prefix that is identical on every call, which is exactly what prefix caching exploits.

Other lectures show the same growth in other domains. In L10 (deep research), each search result is appended to "context so far", and Tongyi DeepResearch's BrowseComp accuracy rises as the context budget grows from 8K to 128K, because longer contexts allow longer interaction histories. In L7 (computer use), every step adds a screenshot's worth of visual tokens, and the lecture lists "long contexts are expensive" among the remaining problems, because screenshots and reasoning add prefill and generation cost. In L5 (planning), a GPU-purchasing agent's context reaches 128k tokens and is compacted to 14k.

**Two separate challenges.** L3 separates *capacity* from *efficiency*. Capacity asks whether the model can use the evidence it needs; architecture, position encoding and training shape it, and evaluation measures it. Efficiency asks whether the system can afford to serve that context; attention cost, KV memory, caching and compaction shape it. A technique usually helps one and may hurt the other. Prefix caching improves efficiency but does nothing for capacity, while summarization improves both but risks losing facts.

Common misconception: "A 1M-token window means I never need to manage context." The window only bounds what the model *accepts*. Cost still grows with every token re-read, latency grows with prefill length, and (section 8) accuracy degrades well before the advertised limit.

### 2. Attention: what is quadratic, and what is not

A transformer turns each token into a vector (the **hidden state**, width d\_model) and refines it through L layers. Each layer has an **attention** block that lets a token gather information from earlier tokens, and a feed-forward block that transforms each token on its own. Attention is the only place where tokens interact, so it is the only place where sequence length multiplies with itself.

L3's refresher defines attention with three learned projections. Each token's hidden state is projected into a **query** q (what am I looking for?), a **key** k (what do I contain?) and a **value** v (what will I hand over if chosen?). The score between token *i* and an earlier token *j* is the dot product qᵢ·kⱼ divided by √d\_k, where d\_k is the key width. A **softmax** turns the scores of one query into weights that sum to 1. A **causal mask** sets the score to −∞ for future positions (j > i), so each token only sees its past. The output for token *i* is the weighted sum of values.

An analogy helps. Think of a library where every new reader (query) compares their question to the catalogue card (key) of every book already on the shelf, then reads a blend of the books (values) in proportion to relevance. With *n* books and *n* readers, you do about n²/2 card comparisons. That pairwise comparison is the quadratic part.

**Counting the work.** For one layer and a prompt of n tokens, computing all scores QKᵀ takes about n²·d multiply-adds, and mixing values AV takes another n²·d. The projections and feed-forward block cost work proportional to n (each token independently), with a constant set by the parameter count. So per-token cost has two parts: a constant "parameter" part of about 2 FLOPs per parameter, and an "attention" part that grows with how many tokens are already in the context.

Beyond the lecture, a worked number: for a Llama-3-70B-class model (80 layers, d\_model = 8,192), generating one token at context length n costs about 4·L·d\_model·n ≈ 2.6M·n FLOPs of attention, versus about 140 GFLOPs for the parameters. The two are equal at n ≈ 53K tokens. Below that, attention is a minor cost; above it, attention dominates. Agent sessions sit right at this crossover, which is why the long-context problem feels sudden.

**Memory versus compute.** Naive attention also stores the n × n score matrix, which is quadratic *memory*. FlashAttention (Dao et al., 2022) computes attention in tiles held in fast on-chip memory, never materializing the full matrix. That removes the quadratic memory and makes attention much faster in practice, but the number of FLOPs is still quadratic. Ring Attention and Megatron context parallelism, shown in L3, split a long sequence across P devices: memory per device becomes O(n·d\_k/P), communication overlaps with block attention, but total work stays O(n²·d\_k) because the attention is exact, not sparse.

Common misconception: "FlashAttention made attention linear." It made attention *memory* linear and the kernel faster. The compute is still quadratic in prompt length, and the KV cache (next sections) is still linear in length per request.

Common misconception: "Quadratic attention is the main reason agents are expensive." For most agent sessions the bigger cost driver is the *repeated re-reading* of history across calls (section 1), which is quadratic in the number of steps even if attention were linear. Prefix caching attacks that repetition; efficient attention attacks the per-call cost. You usually need both.

### 3. Inference: prefill, decode and the serving stack

Serving a model call has two phases with opposite bottlenecks, and agent workloads stress the first one unusually hard. L3 draws the serving stack as: request (prompt + controls) → **scheduler** (queue, batch, route) → **prefill** over all prompt positions → **decode**, one new position per step → streamed response tokens. The **KV cache** sits beside the model as persistent per-request state: prefill writes it, and every decode step reads it and appends to it.

**Prefill** processes the whole prompt in one parallel pass. All prompt tokens go through every layer together, as big matrix multiplications, so the GPU's arithmetic units are the limit. L3 calls prefill compute-intensive, with latency that grows with prompt length. **Decode** generates output one token at a time, because token *t+1* depends on token *t*. Each step does little arithmetic per byte it must read (all model weights plus the request's whole KV cache), so memory bandwidth is the limit. L3 calls decode sequential and memory-bandwidth-intensive.

An analogy: prefill is a factory running a full production line on a large order; decode is a clerk who must walk to the warehouse for every single item. Making the warehouse trip cheaper (bandwidth) matters more for the clerk than hiring faster workers (compute).

**Serving metrics.** L3 (after DistServe) defines four quantities:

| Metric | Definition | Dominated by |
| --- | --- | --- |
| TTFT (time to first token) | Arrival → first output token | Queueing + prefill of the prompt |
| TPOT (time per output token) | Gap between consecutive output tokens | Decode step time |
| Throughput | Completed tokens or requests ÷ wall-clock time | Batch size, which KV memory limits |
| Cost | Input + cached input + output token charges | Token counts × prices |

Agents make TTFT the critical metric. Each tool result must be prefilled before the next action can start, and agent outputs are short (Manus's 100:1 input-to-output ratio). An agent that makes 50 calls pays 50 prefills, so prefill latency accumulates into user-visible wall-clock time.

**Worked numbers (beyond the lecture).** An H100 GPU offers roughly 1,000 TFLOPs of dense BF16 compute and about 3.35 TB/s of memory bandwidth. Prefilling 100K tokens on a 70B model needs about 2 × 70B × 100K = 1.4 × 10¹⁶ FLOPs for the parameters alone, which is several seconds on one GPU even at high utilization. A decode step on an 8-GPU node must read 140 GB of BF16 weights (about 5 ms at 26.8 TB/s aggregate) plus each sequence's KV cache. At 128K context a Llama-3-70B sequence holds 40 GiB of KV, so a batch of ten such sequences adds roughly 16 ms of KV reads per step. At long context, KV traffic, not weights, sets decode speed.

**Why the phases fight.** A GPU that batches prefills and decodes together makes decoding requests wait whenever a long prefill runs, so TPOT spikes. Conversely, tuning for decode leaves compute idle. Two fixes exist. *Chunked prefill* (Sarathi-Serve) splits long prefills into pieces interleaved with decode steps. *Disaggregated serving* (DistServe, Splitwise) puts prefill and decode on different GPUs and ships the KV cache between them. DistServe reports serving 7.4× more requests, or meeting 12.6× tighter latency targets, than colocated systems while keeping over 90% of requests within their TTFT and TPOT limits.

Common misconception: "Output tokens are the expensive part of an agent." Output tokens cost more per token (for example $25 versus $5 per million on L3's Claude Opus 5 row), but agents read about 100 times more tokens than they write. Input, and therefore prefill and caching, dominates the bill.

### 4. The KV cache: what it stores and how big it gets

The **KV cache** stores, for every layer and every past token, that token's key and value vectors, so decode does not recompute them. Without it, generating token *t* would re-run the whole prefix through the model, turning decode into quadratic work per token. With it, each decode step computes K and V only for the new token and reads the stored ones for the rest.

The cache is state, not an optimization you can skip. L3 draws it as "persistent per-request state", written by prefill and read-plus-appended by decode. Within one call, output tokens extend it. Between calls, the tool result arrives as new input, and after prefill it joins the reusable prefix.

**Memory formula.** For standard attention, the bytes per token are:

bytes per token = 2 (K and V) × layers × KV heads × head dimension × bytes per value.

Multiply by the number of tokens to get the per-sequence cache. The Hands-on program prints these numbers:

| Model (BF16, 2 bytes/value) | KiB per token | 32K tokens | 128K tokens | 1M tokens |
| --- | --- | --- | --- | --- |
| Llama-3-8B (32 layers, 8 KV heads, 128 dim) | 128 | 4 GiB | 16 GiB | 128 GiB |
| Llama-3-70B (80 layers, 8 KV heads, 128 dim) | 320 | 10 GiB | 40 GiB | 320 GiB |
| Same 70B shape with full multi-head KV (64 heads) | 2,560 | 80 GiB | 320 GiB | 2,560 GiB |
| DeepSeek-V2 MLA (60 layers, 576 cached values) | 67.5 | 2.1 GiB | 8.4 GiB | 67.5 GiB |

One 128K-token session of a 70B model needs 40 GiB of KV, half an H100. An 8×H100 node (about 596 GiB) holding 130 GiB of BF16 weights fits only about ten such sessions at once. Batch size, and therefore throughput and price, is set by KV memory, not by compute.

**Shrinking the cache.** Four families appear in L3 and its references:

| Technique | What it changes | KV saving | Cost |
| --- | --- | --- | --- |
| Multi-query attention (MQA) | All query heads share one K/V head | ÷ number of heads | Some quality loss |
| Grouped-query attention (GQA, Ainslie et al., 2023) | Groups of query heads share a K/V head | ÷ group size (8× in Llama-3-70B) | Small quality loss; standard today |
| Multi-head latent attention (MLA, DeepSeek-V2, 2024) | Cache one compressed latent cᵗ per token; per-head K and V are reconstructed with up-projections | DeepSeek-V2 reports 93.3% less KV than DeepSeek 67B and 5.76× max throughput | Extra matmuls; tricky with RoPE (needs a decoupled RoPE key) |
| KV quantization (FP8/INT4) | Fewer bytes per stored value | 2–4× | Accuracy risk at aggressive bit widths |

Architectures in section 6 go further: sliding-window layers cap the cache at *w* tokens, and linear-attention layers replace it with a fixed-size state.

**PagedAttention.** Even a right-sized cache is hard to allocate. A request's final length is unknown, so early systems reserved a contiguous region for the maximum length, wasting memory through over-reservation and fragmentation. PagedAttention (vLLM, Kwon et al., SOSP 2023) borrows virtual memory from operating systems. The cache is split into fixed-size **blocks** (for example 16 tokens). A per-request **block table** maps logical blocks to physical blocks anywhere in GPU memory, and a new block is allocated only when the last one fills.

L3's figure shows request A ("Four score and seven years ago our") whose logical blocks 0, 1 and 2 map to physical blocks 7, 1 and 3. The table records each block's fill count, so generating "fathers" changes block 1 from 3 to 4 filled slots, and "brought" triggers a new block. Blocks can be shared across requests with the same prefix and copied only when one request writes to a shared block (**copy-on-write**). vLLM reports near-zero KV waste and 2–4× higher throughput than FasterTransformer and Orca at the same latency.

Common misconception: "The KV cache is like a web cache that just speeds things up." Within a request it is required working state whose size grows linearly with context. Only *across* requests (next section) does it act as a reusable cache.

Common misconception: "GQA reduces attention compute." GQA mainly reduces KV *memory and bandwidth*; every query head still scores every key, so FLOPs barely change. That is why GQA speeds up decode (bandwidth-bound) much more than prefill (compute-bound).

### 5. Prefix caching and cache-friendly prompt design

**Prefix caching** (also called prompt caching or KV reuse) keeps the KV cache of a prompt after a call ends, so a later call that starts with the same tokens can skip prefilling them. It is the single most effective cost lever for agents, because each agent call's prompt is the previous call's prompt plus a small suffix.

**Why only prefixes.** A token's key and value depend on every token before it (through the earlier layers) and on its absolute position (through the position encoding). So a stored KV block is valid only if everything before it is byte-for-byte identical. Change one token early in the prompt, and every KV entry after that point is invalid. This is the root of every cache-friendly design rule.

L3's "KV caching during decoding" diagram shows the agent pattern. Call 1 prefills new input and decodes an output; the tool result comes back. Call 2 reuses call 1's input and output as a cached prefix and only prefills the tool result. Call 3 reuses an even longer prefix. The reusable prefix keeps growing, so uncached work per call stays roughly constant at Δ tokens instead of growing linearly.

**How engines find a match.** Three designs appear in the lecture and its sources:

- **Prompt Cache** (Gim et al., MLSys 2024) precomputes attention states for declared reusable "prompt modules" such as system messages, templates and documents. It reports time-to-first-token reductions from 8× on GPU to 60× on CPU. L3's plot shows that recomputing grows faster with length than loading cached state, and the crossover depends on hardware.
- **Block hashing** (vLLM automatic prefix caching). Each full KV block is identified by a hash of its own tokens *and* its parent block's hash, so the hash chain encodes the whole prefix. A new request walks its blocks, looks each hash up, and reuses hits until the first miss. Freed blocks are evicted least-recently-used.
- **RadixAttention** (SGLang, Zheng et al., 2023) stores all cached prefixes in a **radix tree**, a trie whose edges hold token sequences. L3 shows three operations: *match* (reuse the longest shared prefix and append the new suffix), *split* (when two conversations diverge, split an edge so the common part is stored once), and *evict* (remove the least-recently-used leaf when memory is full). SGLang reports up to 6.4× higher throughput on agent, reasoning and chat workloads.

**Cache-aware routing.** With many GPU workers, a request only hits the cache if it lands on the worker that holds its prefix. L3's example (SGLang v0.4) scores each worker as *reusable prefix − queue penalty*. Worker 1 has an 18K-token match but a queue of 2; worker 2 has a 2K match and an empty queue. The router trades prefill saved against waiting time. Providers do the same: OpenAI's docs say requests are routed by a hash of the initial prompt tokens, and a `prompt_cache_key` can keep related requests together.

**What it costs.** L3's pricing table (USD per 1M tokens, checked Aug. 30, 2026) shows cached input at roughly one-tenth of regular input:

| Model | Cached input | Regular input | Output |
| --- | --- | --- | --- |
| DeepSeek V4 Flash (off-peak–peak) | $0.007–0.014 | $0.22–0.44 | $0.66–1.32 |
| GLM-5.2 | $0.26 | $1.40 | $4.40 |
| Kimi K3 | $0.30 | $3.00 | $15.00 |
| GPT-5.6 Luna | $0.02 | $0.20 | $1.20 |
| GPT-5.6 Sol | $0.40 | $4.00 | $20.00 |
| Claude Opus 5 | $0.50 | $5.00 | $25.00 |

L3 notes that "cached" means a cache read and that cache creation may be billed separately. Anthropic's docs, for example, charge 1.25× the input price to write a 5-minute cache entry and 2× for a 1-hour entry, with reads at 0.1× by default and up to four explicit cache breakpoints. OpenAI caches automatically for prompts of at least 1,024 tokens. L3 also stresses that measured physical cost and provider API price are different quantities. The "Can I Buy Your KV Cache?" (2026) plot shows one-time prefill amortized across many readers, with per-call cost approaching a reuse floor.

A worked example from the Hands-on program: 60 calls with P = 6K and Δ = 5K at Claude Opus 5 prices cost about $46.65 without caching and $6.94 with prefix caching, a 6.7× saving with identical model behaviour.

**Designing prompts for reuse.** L3 gives four rules:

1. **Stabilize the prefix.** Put instructions, tool definitions and examples first, and never edit them mid-session.
2. **Append changing state.** New user turns and observations go at the end. Treat the transcript as append-only.
3. **Avoid needless churn.** Timestamps at the top of the system prompt, reordered tool schemas and non-deterministic JSON key order all break the prefix.
4. **Measure reuse.** Track cached tokens, TTFT and eviction; a sudden drop in hit rate is usually a harness bug.

Manus's production lessons (2025) add two agent-specific rules. Keep the tool list fixed and *mask* unavailable tools by constraining decoding rather than removing their definitions, since removal edits the prefix. And make serialization deterministic so that identical states produce identical bytes. Manus quotes a 10× price gap between cached ($0.30/MTok) and uncached ($3/MTok) input on Claude Sonnet as the reason KV-cache hit rate is its single most important production metric.

**Caching versus compaction.** These two levers conflict. Compaction rewrites the middle of the history, which invalidates every cached block after the rewrite point. The Hands-on lab shows the effect: masking one old observation per step keeps cache hits at only 34%, whereas masking in batches every 12 observations keeps 85% hits and costs less overall. Good harnesses compact rarely and in large steps, and keep the system prompt and goal untouched so at least that prefix survives.

Common misconception: "Caching makes long context free." L3's takeaway is precise: stable prefixes avoid repeated prefill but do not reduce visible history. The model still attends over every cached token on every decode step, still needs the KV memory, and is still subject to long-context accuracy loss. Caching fixes cost, not capacity.

Common misconception: "A cache hit means identical output." Reusing KV gives the same numbers as recomputing (up to floating-point order effects). Differences in output come from sampling, not from the cache.

### 6. Architectures for long context: local, recurrent, sparse and compressed

Long-context architectures reduce the cost of attention by choosing which history each layer can access directly, and 2026 frontier models mix cheap layers with a few expensive global ones. L3 frames the choice as global versus local modeling. Standard attention is **global**: every query compares against every visible key. **Local** computation considers only a constant-size subset, cutting pairwise-comparison cost from O(n²) to O(w·n), where *w* is the window size.

L3 lists four recurring mechanisms.

**Sliding-window attention (SWA).** Each query sees only the previous *w* positions (the causal window mask sets scores to −∞ when i − j ≥ w). The attention equation is unchanged; work falls to O(nw) and the KV cache is capped at *w* tokens per layer. The catch, as L3 states, is that a local layer cannot directly retrieve distant tokens. Information can hop further through stacked layers, but only indirectly. Longformer (2020) combined windows with a few global tokens.

**Linear attention and recurrent models.** L3 walks a five-step ladder from softmax to Kimi Delta Attention:

1. *Softmax attention* keeps every past kᵢ, vᵢ and compares the query with each: explicit token-level access, O(t) work per decode step, growing KV cache.
2. *Linear attention* (Katharopoulos et al., 2020) replaces the softmax weight with the raw score qₜᵀkᵢ. Because there is no per-query normalization, the sum can be reordered: oₜ = (Σ kᵢvᵢᵀ)ᵀqₜ = Sₜᵀqₜ, where Sₜ = Sₜ₋₁ + kₜvₜᵀ is a fixed-size d\_k × d\_v matrix. Memory no longer grows with length. But writes are purely additive, so interference between stored associations is never erased.
3. *DeltaNet* (Schlag et al., 2021) first reads the memory's current prediction v̂ₜ = Sₜ₋₁ᵀkₜ, then writes only the error eₜ = vₜ − v̂ₜ with strength βₜ. This is a targeted correction along kₜ; unrelated memory persists.
4. *Gated DeltaNet* (Yang et al., 2024) multiplies the whole state by a scalar retention gate αₜ ∈ \[0,1\] before the correction. It adds global forgetting; αₜ = 1 recovers DeltaNet.
5. *Kimi Delta Attention (KDA)* (Kimi Team, 2025) replaces the scalar gate with a per-channel vector gate, so each key-space feature gets its own memory lifetime. The Kimi Linear paper reports that a KDA/MLA hybrid beats full MLA under an identical recipe, with up to 75% less KV cache and up to 6× decoding throughput at 1M context.

The analogy: softmax attention is a filing cabinet that keeps every page; linear attention is a whiteboard of fixed size where you keep writing over old notes; the delta rule erases the specific note you are correcting before writing; gating fades the whole board (or each column at its own rate).

**Sparse attention.** Each query attends to a subset Sᵢ of keys and renormalizes over that subset. *Fixed* patterns (a local window plus global positions G, as in Longformer) give predictable cost but cannot adapt to the query. *Content-dependent* patterns pick the top-K keys by a learned selector g(qᵢ, kⱼ), as in DeepSeek Sparse Attention (2025); retrieval adapts, but selector errors exclude relevant keys. Sparse attention usually keeps the full KV cache, since any key might be selected later; it saves compute, not memory.

**KV compression.** GQA shares K/V heads; MLA caches a latent cₜᴷⱽ = Wᴰᴷⱽ zₜ and reconstructs per-head keys and values with Wᵁᴷ and Wᵁⱽ (section 4).

**Hybrids: local most of the time, global periodically.** L3 describes the dominant 2026 recipe as N cheap local or recurrent layers, then one global layer that retrieves from full history, repeated:

| Model | Local / stateful layer | Global layer | Local : global |
| --- | --- | --- | --- |
| Qwen3.8-Flash-Next | Gated DeltaNet | QSA sparse retrieval | 36 : 12 ≈ 3:1 |
| GLM-5.3-Flash | Kimi Delta Attention | DSA + IndexPool | 34 : 11 ≈ 3:1 |
| Kimi K3 | Kimi Delta Attention | Dense gated MLA | 69 : 24 ≈ 3:1 |
| Nemotron 3 Ultra | Mamba-2 | Dense GQA | 48 : 12 = 4:1 |
| Inkling-Small | 512-token window | Dense GQA | 35 : 7 = 5:1 |
| DeepSeek-V4-Pro-0813 | 128-token window branch | Compressed sparse / dense | Interleaved branches |

The logic is economic. Local and recurrent layers make most of the network linear-cost with a small, fixed state. The few global layers keep exact token-level retrieval, which purely recurrent models lose. With a 3:1 ratio, the full KV cache exists only in a quarter of the layers, cutting KV memory roughly 4× before any other compression.

**Attention sinks (beyond the lecture).** StreamingLLM (Xiao et al., 2023) found that plain window attention collapses once text exceeds the cache, because models park large attention weight on the first few tokens as a "sink". Keeping the KV of those initial tokens plus a recent window restored stable generation up to 4M tokens, with up to 22.2× speedup over sliding-window recomputation. It extends *fluency*, not *recall*: evicted tokens are gone.

Common misconception: "Linear-attention models have infinite context." They have unbounded *length* but finite *memory*: everything is squeezed into a fixed-size state, so exact recall of an arbitrary old token degrades. That is precisely why every model in L3's table keeps some global layers.

### 7. Position encoding and extending the window

Attention by itself is order-blind; a **position encoding** tells the model where each token sits, and how it does so decides whether a model trained on short sequences can work on long ones. Training directly at 1M tokens is prohibitively expensive, so models follow L3's **short-to-long** curriculum: short pretraining (4K–8K, abundant data, low cost), then continued training on long documents and packed sequences (32K–128K), then long adaptation on task traces and synthetic curricula (128K+).

**Absolute encodings.** The original transformer adds a position vector pₜ to the token embedding before the first layer, using sinusoids with frequencies ωₗ = 10000^(2ℓ/d). Learned absolute tables have a fixed size and simply have no entry past the training length.

**RoPE** (rotary position embedding, Su et al.) rotates each query and key by an angle proportional to its position, in 2-D pairs of dimensions with angles t·θₗ. Because rotations compose, the score between positions *i* and *j* depends only on the displacement j − i. Values are not rotated. RoPE is the default in most open models.

Why RoPE fails beyond training length: each dimension pair has a wavelength 2π/θₗ. With base 10,000 and head dimension 128, the slowest pair's wavelength is about 2π × 10000^(126/128) ≈ 54K positions. A model trained at 4K has seen that pair sweep less than a tenth of its circle. At position 100K it meets angles it never saw, and attention behaves unpredictably.

**NoPE** removes explicit position signals entirely. Order is inferred from the causal mask or from recurrent dynamics, which removes the extrapolation problem but not the need to train long-range behaviour (Kazemnejad et al., 2023). L3 notes Kimi K3 uses NoPE with recurrent KDA layers.

**Position interpolation (PI)** (Chen et al., 2023) squeezes long positions back into the trained range. To extend from L to L′ = s·L, evaluate position *t* at phase t/s, equivalently θₗ → θₗ/s. Every dimension is stretched by the same factor. The cost is that nearby tokens now differ by tiny angles in the fast dimensions, blurring local order.

**YaRN** (Peng et al., ICLR 2024) interpolates selectively. Long-wavelength dimensions are interpolated fully, short-wavelength dimensions keep their original phase (preserving local distinctions), and a ramp γₗ blends the middle. It also sharpens attention with a temperature 1/τ = 0.1·ln s + 1 to counter the entropy drift of longer sequences. L3 cautions that this τ formula was fit on LLaMA models and is a recipe, not a universal constant.

L3's table of how 2026 models reach their maximum context:

| Model | Length curriculum | Position method | How it reaches max context |
| --- | --- | --- | --- |
| Qwen3.8-Flash-Next | 262K native; full curriculum undisclosed | Partial RoPE | YaRN extension to 1M |
| DeepSeek V4 | 4K → 16K → 64K → 1M | Partial RoPE | Progressive training + YaRN |
| GLM-5.3-Flash | 1M native; curriculum undisclosed | NoPE in main attention | No RoPE rescaling |
| Kimi K3 | 8K → 64K → 256K → 1M | NoPE | Progressive training to 1M |
| Nemotron 3 Ultra | 1M long-context CPT; SFT to 512K | Implicit order in Mamba; no RoPE | Trained and evaluated at long lengths |
| Inkling | 1M context; curriculum undisclosed | Relative position embedding | Learned relative representation |

**Data.** L3 lists four sources of long training data: long natural documents (books, codebases, repositories), packed examples (efficient, but boundaries and cross-example leakage matter), agent trajectories (teach long-horizon recovery, state tracking and tool use) and synthetic tasks (place evidence and distractors at designed positions). The shared recipe is coherent long sources, tasks whose answer depends on distant evidence, and progressive length growth. L6 gives the coding version: Qwen2.5-Coder trains at 8K → 32K and uses YaRN to reach 128K, validated on cross-file completion, infilling and short-context retention.

Common misconception: "YaRN or PI gives a model long-context skill for free." They make long positions *numerically familiar*. The model still needs training data whose answers depend on distant evidence, or it will accept 1M tokens and use only the last few thousand.

### 8. Advertised versus effective context

The **advertised context** is the maximum number of tokens a model accepts; the **effective context** is the length up to which it still uses the evidence reliably on a given task, and the second is usually much shorter. L3 illustrates the gap with Greg Kamradt's 2023 **needle-in-a-haystack** (NIAH) test on GPT-4-128K. A single fact (the needle) is planted at a chosen depth inside filler text (the haystack), and the model is asked to retrieve it. The heat map is perfect up to about 64K tokens. Beyond roughly 73K–100K, retrieval drops to 0–65% in many cells, mostly when the fact sits between 10% and 50% of document depth.

**Why the gap exists.** Three mechanisms combine. Positions far beyond the bulk of training data are under-trained, even after YaRN-style extension. Softmax attention spreads a fixed budget of weight over more candidates, so a single relevant token gets diluted by many plausible distractors. And training data rarely makes answers depend on evidence buried in the middle of very long inputs, so models learn to favour the beginning and the end.

**Beyond NIAH (beyond the lecture).** NIAH is easy because the question and the needle share words, so literal matching works. Later benchmarks remove that shortcut:

| Benchmark | What it adds | Key finding |
| --- | --- | --- |
| Lost in the Middle (Liu et al., 2023) | Multi-document QA with the answer at varying positions | U-shaped accuracy: best when evidence is at the start or end, worst in the middle |
| RULER (Hsieh et al., 2024) | 13 synthetic tasks: multi-needle, multi-hop tracing, aggregation | 17 models evaluated; nearly all ace vanilla NIAH, but only half of those claiming 32K+ stay satisfactory at 32K |
| NoLiMa (Modarressi et al., 2025) | Needles with minimal lexical overlap with the question | Of 13 models claiming 128K+, 11 fall below 50% of their short-context score at 32K; GPT-4o drops from 99.3% to 69.7% |
| Context Rot (Chroma, 2025) | 18 models on simple tasks with growing input | Performance becomes increasingly unreliable as input grows, even on trivial tasks; haystack structure changes results |

**What it means for agents.** An agent's context is the worst case for these benchmarks: long, repetitive, full of near-duplicate distractors (similar log lines, earlier failed attempts) and with key constraints stated once, near the start. The practical rule is to keep the working context well inside the effective length, and to place the few facts that must never be missed where attention is strongest (the beginning and the recent end). Manus's "recitation" trick, rewriting a todo.md at the end of context each step, does exactly that.

Common misconception: "If a model passes needle-in-a-haystack at 1M tokens, it can reason over 1M tokens." NIAH tests literal single-fact lookup. Multi-hop reasoning, aggregation and non-literal matching degrade much earlier, so measure effective context on tasks that look like yours.

### 9. Compaction: turning history into working state

**Compaction** replaces part of the history with a shorter representation so the agent can continue within budget, and L3 frames it as *state estimation*, not text summarization. Given the full history Hₜ, a compactor C with budget B produces a working state ŝₜ = C(Hₜ; B) with |ŝₜ| ≤ B. Three properties define a good compactor:

- **Behavioural fidelity.** The agent should act the same from the compact state as from the full history: p(A\_future | Hₜ) ≈ p(A\_future | ŝₜ).
- **Bounded representation.** The state fits the budget B.
- **Recoverability.** Copy exact anchors, and keep pointers to source evidence so details can be re-read later.

The first property is the important shift. A summary that reads well but changes the agent's next action is a bad summary.

**A worked example (L3).** The "before" history holds: CI job times out after 30 minutes; inspect the job log; a 24K-line log with repeated "address already in use"; set --workers=1 and rerun; suite passes, log saved at /tmp/ci.log. The "after" state is five lines: Goal: fix CI timeout. Cause: port collision. Verified: --workers=1 passes. Evidence: /tmp/ci.log. Next action: open the PR with the tested worker setting. Note what survives: the goal, the causal conclusion, the exact flag, a pointer to evidence and the next step. The 24K-line log is gone from context but recoverable from disk.

**What survives compaction.** L3 sorts context into five fates:

| Fate | What | Why |
| --- | --- | --- |
| Keep exact | Anchors: goal, constraints | Paraphrase drift here changes behaviour |
| Encode | Checkpoint: decisions, progress, IDs | Compressible, but must stay precise |
| Keep exact | Recent tail: active attempt, fresh result | The model needs raw detail for the next step |
| Externalize | Evidence store: e.g. 24K-line log → 3 failures + command + artifact path | Recoverable on demand (MemGPT-style) |
| Discard | Duplicates, superseded attempts | Pure noise and distraction |

**Policy decisions.** Production harnesses (L3 cites Codex, OpenCode, Pi, Hermes and OpenHands) must make four choices:

1. **Trigger:** a token threshold, a provider overflow error or a manual request. Reserve room for the next output, so compaction happens before the window is full.
2. **Select:** protect the beginning (system prompt, goal), compact the older middle region, keep the recent tail, and cut only at a valid turn or tool boundary, never between a tool call and its result.
3. **Replace:** with a readable summary, a structured checkpoint, an opaque provider-side item, or a fresh context seeded with the checkpoint.
4. **Recover:** keep the full history unchanged on disk, retain searchable history, and define what happens when compaction itself fails (retry, or reset).

**Repeated compaction drift.** Long runs compact many times, and each new summary is built from the previous one: ŝₖ₊₁ = C(ŝₖ ⊕ Rₖ), where Rₖ is the new raw history since the last compaction. Errors compound like a photocopy of a photocopy. L3's example: "Use CUDA 12.4" becomes "Use CUDA 12.x", then "Use recent CUDA", then the constraint is missing. The fixes are the same three rules: copy anchors exactly, keep the recent tail raw, and retrieve source evidence instead of trusting the summary.

**The cheap alternative: observation masking.** Because tool results are 37% of an agent prompt, simply dropping or truncating old observations removes a large share of tokens with no model call. Beyond the lecture, "The Complexity Trap" (Lindenbauer et al., 2025) compared this with LLM summarization inside SWE-agent on SWE-bench Verified across five model configurations. Masking old observations halved cost relative to the raw agent while matching, and sometimes slightly exceeding, the solve rate of LLM summarization. A hybrid cut cost a further 7% versus masking and 11% versus summarization. Anthropic calls the same idea tool-result clearing.

**Other compaction families.**

- **Truncation at ingestion.** Cap each tool result (for example the first and last N lines of a log, plus a count of omitted lines and a file path). This prevents one giant observation from ever entering context.
- **Token-level compression.** LongLLMLingua (2023) drops low-information tokens using a small model; it reports up to 21.4% better accuracy with about 4× fewer tokens on NaturalQuestions, and 1.4–2.6× end-to-end speedup at 2–6× compression.
- **Externalized memory.** MemGPT (2023) treats context like RAM and external storage like disk, paging information in and out by tool calls. Manus uses the file system as "unlimited" context, storing restorable pointers (a URL, a path) instead of page contents.
- **Summary-conditioned continuation.** ReSum (2025) periodically summarizes a web agent's history into a compact state and continues from it. It reports +4.5% over ReAct without training and a further +8.2% after training the agent to reason from summaries with ReSum-GRPO.

L5 shows compaction's risk in context. A GPU-purchasing agent's history is compacted from 128k to 14k tokens, leaving "four vendors searched: only D fits, but has 20-week lead time". The agent then files a requisition for D anyway, without looking for a fifth vendor or asking to relax a requirement. The summary kept the facts but lost the deliberation that should have triggered replanning.

Common misconception: "Compaction is summarization." Summarization is one replacement strategy. Compaction also includes deciding what to keep verbatim, what to externalize with pointers and what to delete, and it must be judged by the agent's later actions.

### 10. Sub-agents for context isolation, and how to evaluate compaction

**Sub-agents** give a subtask its own fresh context and return only a short result, so the parent's context grows by the result, not by the subtask's full exploration. L1 lists sub-agent delegation, next to compaction and dynamic memory lookup, as a harness technique for coherence over long context. L5 goes further: delegation is itself an action, so it can be trained.

**How isolation saves context.** Suppose a parent must check four vendor sites, each needing 30K tokens of browsing. Done inline, the parent's context grows by 120K tokens, and every later call re-reads them. Delegated, each sub-agent spends its 30K tokens in its own window and returns a 1–2K-token report; the parent grows by about 6K. Anthropic reports that its sub-agents typically return 1,000–2,000 tokens of distilled results. L5's GPU-purchasing example is exactly the failure this prevents: "four independent searches run as one thread in one context".

**What the lectures say about the trade-offs.**

- L5 (Gandhi) presents RAO, where the agent calls `launch_subagent(goal)` to run a copy of itself on a subtask, recursively. Each node is scored on its own task plus how often its children succeeded. Trained only on medium tasks, it learns to delegate deeper on hard ones. L5 also cites Recursive Language Models (Zhang et al., 2025) and ADaPT (Prasad et al., 2024).
- L5 (Neubig) warns against fixed role decompositions for coding: roles are fixed before the task arrives, and *handoffs are summary reports, which can drop context the next agent needs*. A sub-agent report is a compaction, with all of section 9's risks.
- Beyond the lecture, Anthropic's research system (a Claude Opus 4 lead with Claude Sonnet 4 sub-agents) outperformed single-agent Claude Opus 4 by 90.2% on its internal research evaluation, but multi-agent systems used about 15× the tokens of chat. Token usage alone explained 80% of the performance variance on BrowseComp. Isolation buys breadth with tokens; it does not make work cheaper.

A sub-agent fits when subtasks are independent, exploration-heavy and summarizable (search, reading a large file, running a test sweep). It fits poorly when subtasks share tightly coupled state, such as editing interdependent files, where L5's "global state" open problem bites: cross-subtask constraints resist both decomposition and longer context.

**Other isolation tools.** L4's *progressive disclosure* for skills is context isolation at load time: only skill names and descriptions sit in the system prompt (about 3K tokens for Hermes' index), and a skill's body enters context only when the agent calls `skill_view`. Anthropic's "just-in-time retrieval" is the same idea for data: keep lightweight identifiers (file paths, queries, links) and load content only when needed.

**Evaluating compaction.** Because the goal is behavioural fidelity, L3 proposes **continuation-based evaluation** in three steps:

1. **Plant state.** Build or record trajectories that contain constraints, decisions and artifacts the agent will need later.
2. **Compact.** Apply the production policy exactly as deployed, including its trigger and boundaries.
3. **Continue.** Let the agent run on and measure its later decisions.

L3 names four metrics: *state recall* (are constraints and identifiers still present and exact?), *task success* (does the continuation reach the right outcome?), *efficiency* (tokens, latency and cost) and *stability* (does quality hold across repeated compactions?). A summary-quality score such as ROUGE or an LLM judge rating the summary's fluency measures none of these.

A practical recipe (beyond the lecture): replay logged trajectories, force compaction at several points, and compare the next K actions against the uncompacted run. Add probe questions ("Which CUDA version must you use?") after 1, 2 and 5 successive compactions to catch drift. Report cost per solved task, not tokens per call, since a policy that saves tokens but causes one extra failed retry can cost more overall. The Hands-on lab implements a miniature version of this.

Common misconception: "Multi-agent systems are always better at long tasks because each agent has a smaller context." They trade one long context for several handoffs, each of which is a lossy compaction, and they multiply token spend. Use them where the work is parallel and separable, and measure against a strong single agent with good compaction.

### 11. KV and prefix caching inside the RL sampler

An RL training loop for agents runs the same serving machinery as section 3, under conditions that make caching both more valuable and more fragile. L12 (Gandhi) splits an RL framework into two workloads. The *inference engine* (vLLM or SGLang) samples trajectories; it is decode-heavy, sequential and needs no gradients. The *trainer engine* (Megatron or FSDP2) recomputes log-probabilities and gradients; it is prefill-style, parallel and runs autograd. One training step is: sample, verify (rewards), forward, backward, then optimizer step plus weight sync back to the inference engine.

**Each inference optimization has a trainer counterpart.** L12 lists them side by side:

| Inference engine ("sample") | Trainer engine ("forward\_backward") | Shared idea |
| --- | --- | --- |
| KV caching | Activation checkpointing | Trade memory against recomputation, in opposite directions |
| Radix/prefix caching across requests | Prefix sharing | Compute a repeated prefix once |
| Continuous batching | Batch sample packing | Keep every slot busy despite uneven lengths |
| Speculative decoding / MTP | (none) | Cheaper decode steps |
| Model sharding (PP, CP, TP, EP) | Model sharding (PP, CP, EP) | Fit the model and parallelize |

The first row is a mirror image. KV caching spends memory to avoid recomputation. Activation checkpointing spends recomputation (L12: about +33% compute for full recompute) to save memory.

**How big the cache gets in RL.** L12's number is 128 KB of KV per token for Llama-3-8B in bf16. That matches section 4's formula: 32 layers × 8 KV heads × 128 head dimensions × 2 (K and V) × 2 bytes = 131,072 bytes. One 32K-token trace is about 4 GB, and 64 concurrent traces about 256 GB. L12's summary: "KV caching trades a lot of recomputation for a lot of memory." An RL sampler wants many long trajectories in flight at once, so KV memory, not FLOPs, usually caps the rollout batch.

**Why agentic RL is a best case for prefix caching.** L12 gives two reasons. First, group rollouts (as in GRPO) sample several rollouts per task, and every rollout starts with the same system prompt, tool schemas and task prompt. Second, each rollout's own history is reused from step to step, exactly as in section 5. L12's figure draws a tree: "system prompt + tools" at the root, task prompts A and B as branches, and only each rollout's new steps freshly computed. SGLang's RadixAttention and vLLM's Automatic Prefix Caching provide this.

A worked example. Take a batch of 64 tasks with a group size of 8, a 4K-token system-plus-tools block and a 2K-token task prompt. Without prefix reuse, the first sampling step prefills 64 × 8 × 6K ≈ 3.1M tokens. With reuse, the engine prefills the shared 4K block once and each task prompt once: 4K + 64 × 2K = 132K tokens, about 23× less. Later steps then prefill only each turn's new action and observation.

**Continuous batching matters more when rollouts are long.** With static batching every slot waits for the longest request. Agent trajectories vary widely in length, so most slots would idle. Continuous batching (Orca, Yu et al., 2022) schedules at the granularity of one decode step: finished sequences leave and queued requests take their slots. L12 notes it usually comes with chunked prefill, so a long prompt does not cause decode latency spikes, or with prefill/decode disaggregation (section 3).

**Weight updates invalidate the cache.** A KV entry is a function of the tokens *and the weights*. After each optimizer step the inference engine receives new weights, and keys and values computed under the old weights no longer match what the new policy would compute. SGLang's RL documentation reflects this: its weight-update endpoints take a `flush_cache` flag that defaults to true ("Flush KV cache after update"). L12 shows SGLang's `pause_generation` modes, which make the trade explicit:

| Mode | Running requests | KV cache |
| --- | --- | --- |
| `abort` (default) | Returned to the caller immediately | Work discarded |
| `retract` | Moved back to the waiting queue | "Can be flushed and recomputed later" |
| `in_place` | Paused with state unchanged | Kept; a later `flush_cache` call fails |

So the prefix cache is warm within one policy version and cold after each sync. That is one reason RL systems sample many rollouts per weight version.

**Async RL trades freshness for utilization.** L12 contrasts sync RL, where training and inference share the same GPUs and take turns, with async RL (PipelineRL, AReaL), where the GPUs are split. Agentic RL is "often rollout-bound (long trajectories)", so L12 suggests dedicating more GPUs to inference, for example a 3:1 ratio. Async RL needs continuous batching and *in-flight weight updates*: the engine pauses briefly, loads new weights and continues the in-progress sequences. With `in_place` pausing, a trajectory's earlier KV was computed by an older policy than its later tokens (an inference from the SGLang modes, not a slide claim). This is part of the "staleness" that L12 says async RL must correct off-policy. L12's debugging table tracks it as *average staleness* (how many weight versions old the data is) and `importance_weight_max` (the worst per-token ratio π\_train / π\_rollout).

One more RL-specific catch from L12 concerns speculative decoding. A cheap drafter guesses k tokens and the policy verifies them in one pass. Because the policy changes every step, a frozen drafter's acceptance rate decays, so L12 suggests training it online.

Common misconception: "A prefix cache is a pure speed-up with no effect on results." With fixed weights that is true. In RL, reusing KV across a weight update mixes two policies inside one trajectory, so cache policy becomes part of the on-policy versus off-policy question.

### 12. Sequence extension: why compaction raises training cost

Section 5 showed that compaction breaks the prompt cache at serving time; L12 shows the same break costs compute again at training time. The concept is the **sequence extension property**. A trajectory has it when each turn's input contains all earlier turns' tokens as an exact prefix, so the context only grows by appending. Tinker's documentation states the payoff: when it holds, a trajectory's turns merge into one training datum and "compute scales as O(T) rather than O(T²)" for T turns.

**L12's two harnesses.** Harness A appends to the existing history. Harness B compacts every two observations: after O₂ it keeps the task T and replaces A₁ O₁ A₂ O₂ with a summary S.

| Turn | Harness A context | Harness B context |
| --- | --- | --- |
| 1 | T A₁ O₁ | T A₁ O₁ |
| 2 | T A₁ O₁ A₂ O₂ | T A₁ O₁ A₂ O₂ |
| 3 | T A₁ O₁ A₂ O₂ A₃ O₃ | T S A₃ O₃ |
| 4 | T A₁ O₁ … A₄ O₄ | T S A₃ O₃ A₄ O₄ |

**The training batch.** With one trajectory-level advantage Â, every action token gets Â and every other token gets loss mask 0. Harness A yields one concatenated datapoint. Harness B yields two datapoints, both containing the task: \[T A₁ O₁ A₂ O₂\] and \[T S A₃ O₃ A₄ O₄\]. L12's key line: "Repeated task tokens have zero direct loss, but still require context computation." The trainer runs forward and backward over T twice, and over S, although neither carries loss. L12's rule: "Preserve exact prefixes and concatenate for as long as practical."

**Chat templates can break the property silently.** L12 shows that the default Qwen 3 / Qwen 3.5 chat template removes reasoning from past history. At turn 1 the model saw \[task, turn-1 thinking, turn-1 tool call\]. At turn 2 the template renders \[task, turn-1 tool call, harness output, …\], so the turn-1 prefix "doesn't match". The context is shorter, but every turn becomes a new datum and a cache miss. Agent RL frameworks therefore ship their own templates or "renderers" that preserve sequence extension (L12 names Tinker and PrimeRL). Tinker's docs give the trade-off: keeping thinking gives O(T) compute but faster-growing context; stripping it keeps context small at O(T²) compute; compacting every N turns sits between.

**Token-in, token-out (TITO).** L12 asks how rollouts should travel from the inference engine to the trainer: as strings or as tokens. Tokens win. A small string-level change, such as a template adding whitespace, can retokenize differently. And "tokenization is one-to-one, but de-tokenization is many-to-one": the text "Hello" can come from one token or from "He" + "llo". If the trainer scores different tokens from those the sampler produced, the update is silently off-policy. The Miles team's write-up, cited on the slide, reports that packing one sample per task instead of one per turn can cut training compute by roughly an order of magnitude for 30–50-turn trajectories.

This is the training-side twin of section 5's cache rules. A byte-identical, append-only prefix keeps both the serving cache and the training datum intact.

**Trainer-side prefix sharing.** When prefixes do repeat, as when a GRPO group shares one prompt, the trainer can compute them once, forward and backward. L12's figure packs prompt P with responses r1–r4 using a tree attention mask (no attention across branches) and position IDs as in each standalone sequence; gradients from every branch accumulate into P. L12 reports two 2026 results:

| System | Setting | Result reported in L12 |
| --- | --- | --- |
| Snowflake ZoRRo (Arctic RL) | Long-prompt GRPO batches where 80–95% of tokens are duplicate prompt tokens | Up to 6× faster actor updates |
| AReaL-DTA (ICML 2026) | Multi-turn τ²-bench rollouts compress 9.43× as a prefix tree; a DFS walks one root-to-leaf path at a time | Up to 8.31× vs dense training |

**A small simulation.** The program replays 16 turns with a 2,000-token task, 200-token actions, 1,500-token observations and a 300-token summary. It counts trainer tokens (the sum of datum lengths) and sampler prefill (prompt tokens not already in the KV cache). It ignores the summarizer's own model call.

```python
"""Sequence extension: training tokens and sampler prefill for two harnesses (L12).
Token IDs are unique integers, so 'same prefix' means 'exactly the same tokens'."""
import itertools

def common_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n

def run(n_turns, compact_every=None, T=2000, A=200, O=1500, S=300):
    tok = itertools.count()
    span = lambda n: [next(tok) for _ in range(n)]
    task, history, cache = span(T), [], []
    datums, cur, prefill = [], None, 0
    for k in range(1, n_turns + 1):
        prompt = task + history
        prefill += len(prompt) - common_prefix(prompt, cache)  # sampler: only new tokens
        action = span(A)
        cache = prompt + action              # engine now holds KV for prompt + action
        history = history + action + span(O)
        seq = task + history                 # training view of this turn
        if cur is not None and seq[:len(cur)] == cur:
            cur = seq                        # extends: merge into the same datum
        else:
            if cur is not None:
                datums.append(cur)
            cur = seq                        # prefix broken: start a new datum
        if compact_every and k % compact_every == 0:
            history = span(S)                # summary replaces everything after the task
    datums.append(cur)
    return len(datums), sum(map(len, datums)), prefill, len(task + history)

for name, every in [("A: append", None), ("B: compact/2", 2), ("B: compact/8", 8)]:
    d, train, pre, final = run(16, every)
    print(f"{name:13} datums={d:2}  trainer tokens={train:6,}  "
          f"sampler prefill={pre:6,}  final context={final:6,}")
```

Output:

```text
A: append     datums= 1  trainer tokens=29,200  sampler prefill=24,500  final context=29,200
B: compact/2  datums= 8  trainer tokens=45,300  sampler prefill=16,100  final context= 2,300
B: compact/8  datums= 2  trainer tokens=31,500  sampler prefill=23,300  final context= 2,300
```

Read it as a trade-off, not a winner. Compacting every 2 turns cuts sampler prefill by about a third and keeps the final context at 2,300 tokens instead of 29,200. It costs 55% more trainer tokens, spread over 8 datums. Compacting every 8 turns gives up most of the sampling saving and costs only 8% extra in the trainer. Token counts also understate harness A's attention cost, which grows with the square of its single 29K-token datum (section 2). The right interval depends on whether a run is rollout-bound or trainer-bound, which L12's timing metrics (rollout, update, stall) reveal.

Common misconception: "Dropping old reasoning tokens from the history saves compute." It saves context length. If it breaks the exact prefix, though, it forces a new training datum and a cache miss on every turn, so total compute can rise.

### 13. Condensation inside an event-sourced harness

Section 9 described compaction as a policy: trigger, select, replace, recover. L14 shows how a production harness implements it, and the key design move is that condensation destroys nothing. The OpenHands Software Agent SDK stores every message, action and observation as an immutable event in an append-only log owned by the `Conversation`. The model never reads that log directly; each step it reads a *view* derived from the log, and the condenser only changes how that view is derived.

**The slide's configuration.** L14 shows:

```python
condenser = LLMSummarizingCondenser(
    llm=llm.model_copy(update={"usage_id": "condenser"}),
    max_size=10,
    keep_first=2,
)
agent = Agent(llm=llm, tools=tools, condenser=condenser)
```

Its three bullets: older events become a summary; original instructions plus recent work are kept; detail may be lost, so files and tests serve as evidence. `max_size=10` is deliberately tiny for a demo. `keep_first=2` protects the first two events, typically the system prompt and the user's task. The condenser gets its own copy of the model, tagged `usage_id="condenser"`, so its token spend is metered apart from the agent's.

**The view formula.** The L14 sheet writes the condensed context at step t as:

$$
C_t = \big[\, e_1, \dots, e_k,\; \mathrm{sum}(e_{k+1}, \dots, e_{t-r}),\; e_{t-r+1}, \dots, e_t \,\big]
$$

Here e\_i is the i-th event, k is `keep_first`, r is the number of recent events kept verbatim, and sum(·) is the LLM-written summary. It is section 9's "protect the head, compact the middle, keep the tail" rule made concrete.

**Condensation is itself an event.** Beyond the slides, the SDK documentation spells out the mechanism. When the trigger fires, the condenser picks the events to forget, asks its LLM for a summary and returns a `Condensation` event carrying `forgotten_event_ids`, the `summary` text and a `summary_offset` (where the summary goes). The agent appends that event to the log and ends the step without acting. On the next step, `View.from_events()` replays the log, filters out the forgotten ids and inserts the summary at the offset. A `CondensationRequest` event forces the same path, for example after a context-window error.

| Property | Why it holds | Earlier counterpart |
| --- | --- | --- |
| Lossless history | Forgotten events stay in the log; only the view changes | Section 9, "Recover: keep the full history unchanged on disk" |
| Faithful resume | A restored conversation replays the stored `Condensation` events, so it rebuilds the same view without re-running the summarizer | New with L14 |
| Auditable compaction | What was dropped, and what replaced it, is on record with a timestamp | Section 10's continuation-based evaluation needs this record |
| Separate cost line | Summarizer tokens are metered under `usage_id="condenser"` | M7, cost of the checkpoint |
| Valid cut points | The SDK cuts only at "manipulation indices", so an action is never split from its observation | Section 9, "cut only at a valid turn or tool boundary" |

**What the code does with the numbers.** The SDK source (read for this sheet) has three triggers. Exceeding `max_size` events is a soft trigger; exceeding a token cap (`max_tokens` or the model's input limit) or receiving a request is a hard one. On the event trigger the target is ⌊max\_size/2⌋ events: the k head events, one summary and r = ⌊max\_size/2⌋ − k − 1 tail events. With the slide's values the view drops from 11 events to 2 + 1 + 2 = 5, then grows back. The previous summary sits inside the forgotten range, so each new summary is written from the old summary plus new raw events. That is L3's repeated-compaction loop ŝₖ₊₁ = C(ŝₖ ⊕ Rₖ) from section 9, with the same drift risk. Defaults differ between versions and pages (the architecture page cites 120 and 4; the current class default is 240 and 2), so set both explicitly. M9 derives the cycle and its cost.

**Evidence of value.** The L14 sheet cites the SDK's claim that the summarizing condenser cuts per-turn API cost by up to 2×. The OpenHands blog post behind it (Calvin Smith, April 2025) reports a 54% average solve rate on a SWE-bench Verified subset against 53% for the baseline. It says cost scales "linearly" rather than "quadratically", "when events are of similar size". Its one stated drawback is extra turns, because condensing takes a step.

**Why lost detail is tolerable here.** L14's third bullet carries the engineering point. In a coding agent the true state lives in the workspace: files, test results, git status. A summary only needs to point at them, because the agent can re-read a file or re-run a test. This is section 9's "keep pointers to source evidence" defence, with the repository as the anchor store. It fails for facts that live only in the conversation, such as a user's constraint or a test that failed once. The L14 sheet's debugging exercise (a CRLF requirement lost at a step-31 condensation) shows the failure; the fix is to write such facts to a file or the task tracker.

**Interaction with caching and training.** Between condensations the view is append-only, so every call hits the prefix cache up to its last event (section 5). A condensation rewrites everything after the head, so the next call re-prefills the summary and tail. An event-count trigger therefore produces the "infrequent and chunky" rewrites that the Hands-on lab found cheapest; the OpenHands post likewise says condensation amortizes rebuilding costs against prompt caching. For RL (section 12), each `Condensation` is exactly where sequence extension breaks and a new training datum begins.

Common misconception: "A condenser deletes old history." In an event-sourced harness it deletes nothing. It adds an event that changes the view, and debugging, audit, resume and later training can all still read the full trajectory.

### 14. Context on demand: skills, MCP tools and one shared context

Around the condenser, L14 makes three smaller context decisions: when instructions load, how many tool schemas sit in the head, and whether to split the work across agents at all.

**Skills are prompt fragments with a loading rule.** L14's skills slide shows `AgentContext(skills=[Skill(name="repo.md", content=repo_instructions, trigger=None)])`, described as "additional instructions for the same agent" for "project conventions and recurring procedures", loaded as "relevant instructions on demand" (earlier name: microagents). `trigger=None` means always loaded; a skill with a trigger loads only when the trigger appears. The SDK's skill documentation gives the placements:

| Skill kind | When it enters context | Where it lands | Cache effect (section 5) |
| --- | --- | --- | --- |
| Always-on (`trigger=None`, repository skills, `AGENTS.md`) | Conversation start | System prompt | Part of the stable head, cached once |
| Keyword-triggered | When a keyword matches a user message | Injected into that user message in an `<EXTRA_INFO>` block | Appended at the tail; the prefix survives |
| AgentSkills (`SKILL.md`) | Description listed in `<available_skills>`; body read when the model calls `invoke_skill()` | Description in the head, body later in the tail | Progressive disclosure (L4); the head stays small |
| Path rules (`PathTrigger`) | When the agent reads or edits a matching file | Folded into that tool result, once per conversation | Appended; no rewrite |

The pattern follows section 5's rule: whatever changes mid-run is appended, never spliced into the head. Beyond the lecture: a home-made harness that inserts a newly triggered instruction into the system prompt invalidates the whole prefix cache on every trigger.

**MCP tools enlarge the head.** L14's MCP slide adds a Repomix server through `mcp_config`, with "server-provided tool descriptions and execution" and "built-in and external tools together". Every tool schema lives in the system prompt (the SDK's `SystemPromptEvent` carries the system prompt with tool schemas). A large server can add thousands of tokens to every call: cached, but still attended to and still counted against effective context (section 8). L14's design slide argues for "a small tool set, many combinations" (edit files, run commands, browse), which also keeps the head short and stable.

**One context or many.** L14's single-agent slide (after Neubig's "Don't Sleep on Single-agent Systems") argues for one agent that reproduces, locates, edits and tests, with "shared context across activities", adding agents only "for a clear purpose". The contrast is CodeR's five roles (manager, reproducer, fault localizer, editor, verifier), where every handoff is a lossy compaction (section 10). The L14 sheet's exercise puts a number on it: at 0.9 fidelity per handoff, four handoffs keep 0.9⁴ ≈ 66% of facts. The division-of-labour slide lists when splitting still pays (parallel independent work, independent review with separate permissions, cheaper models for suitable tasks) and names the trade: "Task boundaries, shared context, coordination cost". This agrees with section 10: isolate only where the work separates cleanly.

**Context across runs.** L14 closes with SkillRefiner (Khatry et al.), which refines skills from past runs and reports higher held-out scores than the initial skills for both agent models tested. A refined skill is compacted experience: lessons from many trajectories pressed into a few hundred tokens that future contexts load. It is compaction across episodes rather than within one.

Common misconception: "Skills are free because they are optional." Always-on skills and tool schemas are paid on every call and dilute attention; only triggered or progressively disclosed content is truly on demand.

### 15. State instead of transcript: context in explicit workflows

L15 (Fried) gives a third answer to context growth. Sections 9–14 manage one growing transcript; an explicit workflow never builds one. The developer fixes the steps as a graph, the steps share a typed state object, and code assembles each model call's prompt from only the fields that step needs.

**The support example.** L15 uses LangGraph's "Thinking in LangGraph" email workflow. The shared state, "passed between nodes in the workflow":

```python
class SupportState(TypedDict, total=False):
    email_id: str
    email_content: str
    classification: dict
    search_results: list[dict]
    draft_response: str
    review_decision: dict
```

"A node reads state and returns the fields it changes." Two nodes from the slides show exactly what each model call sees:

```python
def classify_intent(state):
    classification = model.classify(state["email_content"]).model_dump()
    return {"classification": classification}

def draft_response(state):
    response = llm.invoke([
        ("system", "Draft a reply using these documents."),
        ("human", json.dumps({
            "email": state["email_content"],
            "documents": state.get("search_results", []),
        })),
    ])
    return {"draft_response": response.text}
```

The classifier sees the email and nothing else. The drafter sees the email and the retrieved documents, but not the classifier's reasoning, the search query or any earlier attempt. `search_documentation` is plain code: it builds a query from the classification's intent and topic and makes no model call.

|  | Single-agent transcript (sections 1–14) | Explicit workflow state (L15) |
| --- | --- | --- |
| What the model sees | Everything so far, unless compacted | Only the fields the node reads |
| Who decides | Model, prompt and environment; the harness compacts after the fact | The developer, in advance, per node |
| Growth | Linear per step, quadratic cumulative (M1) | Bounded by the schema; keys are overwritten by default |
| Lost detail | A summary may drop a fact (section 9) | A field no node writes, or no node reads, is invisible by design |
| Recovery | Event log and resume (section 13) | Checkpoints at node boundaries; resume with the same execution ID |
| Main cost | Context engineering at run time | "Information flow has to be explicitly managed" (L15 trade-off slide) |

**State design rules.** LangGraph's guide, beyond the slides, gives two tests: "Does it need to persist across steps? If yes, it goes in state" and "Can you derive it from other data? If yes, compute it when needed". It adds that "your state should store raw data, not formatted text. Format prompts inside nodes when you need them." That is context engineering in schema form: each node renders the same data its own way, and prompt templates change without touching the schema. The guide also splits each LLM step's context into static parts (categories, definitions, output format) and dynamic parts from state. The static part is a natural per-node cacheable prefix (section 5).

**Reducers decide whether state grows.** By default an update overwrites its key: "If no reducer function is explicitly specified then it is assumed that all updates to that key should override it." A key annotated with `operator.add`, or the `add_messages` reducer, accumulates instead. A `messages` key with an append reducer quietly rebuilds a transcript inside the workflow, with all the growth of sections 1 and 9. Beyond the lecture: give append reducers only to fields some node truly needs in full, and add a trimming node when they can grow.

**Checkpointed state is the workflow's event log.** L15's recovery slide: "Saving search results before generation preserves completed work." If generation crashes, the restart reuses the saved results instead of searching again. The next slide lists the mechanisms: a persistent checkpointer records state and where execution should continue; the same execution ID (LangGraph's `thread_id`) resumes; a retry policy repeats a node after a temporary error; an interrupt pauses for human input and resumes with it. LangGraph checkpoints at node boundaries, so node granularity sets how much work a crash repeats. Compared with OpenHands (section 13), the saved unit is a typed snapshot rather than an event stream, and nothing needs condensing because nothing accumulates unless a reducer says so.

**Explicit context makes nodes testable.** Because a node's input is explicit, L15 unit-tests classification in isolation: given "I was charged twice." and a fixed model output "billing", expect that update and a route to document search. A transcript-driven agent has no such boundary, since its input at step 30 depends on everything before. Traces, regression tests and monitoring at scale are covered in T13 (Workflow Orchestration and Agent Monitoring).

**Choosing between them.** L15's trade-off slide: workflows give consistency, possible efficiency gains (a smaller model, or plain code, per step) and testability; they are less adaptable and need explicit information flow. Use explicit state where the procedure is known and failures are costly, and a condensed transcript where the task is open-ended. Hybrids are common: a node can run a small agent loop with its own short transcript and return only a typed result to state, much like a sub-agent (section 10).

Common misconception: "Workflows avoid context engineering." They move it from run time to design time. Every field a node reads is a context decision, and a missing field fails silently: the drafter cannot cite a policy that the search node never wrote to state.

### 16. Context across agents: delegation, isolation and shared boards

L18 (Vaduguru) names four limits of a single agent that "typically works in a single stream". The first is context management: "the entire interaction builds up in context". So a multi-agent design is partly a context design. For every agent you decide what it sees, what it returns, and what all agents share. Section 10 covered the isolation half; this section adds the shared half and L18's evidence.

**Three context topologies.** The L18 systems fall into three shapes:

| Topology | What each agent sees | What crosses between agents | L18 example |
| --- | --- | --- | --- |
| Isolated (supervisor and subagents) | Its own task, tools and trajectory | Only the final message, returned as a tool result | LangChain personal assistant (slide 7) |
| Tree or managed graph | A subgoal; the root or manager sees the plan and child results | Child results flow up; the manager may send "continue" with new instructions | RAO (slides 11–13), MACU (slides 14–15) |
| Shared board or artifact | Its claimed task plus the shared record | Short entries any agent can read, or commits in a repository | Blackboard (slide 18), DeLM (slides 19–21), CAID and GitSwarm (Git) |

**Isolation as a substitute for window size.** In the LangChain example each specialist is wrapped as a `@tool` that returns only `["messages"][-1].text`. The supervisor never sees the subagent's intermediate steps. RAO measures what this buys. With an 8K-token context for training and evaluation, the recursive agent reaches 0.95 success overall against 0.24 for a single agent. On hard tasks it goes from 0.0 to 0.88. It takes more steps (33 vs 16) and a little more time (9.9 s vs 7.1 s), but the steps are spread across many short windows. In training, a recursive agent with 8K context tracks a single agent with 40K context (both near 0.78–0.8). L18's slide title states the lesson: "delegating to subagents uses context effectively".

The price is the one section 9 describes. A returned last message is a compaction written by the child. L18's own pitfall is that it drops what the parent may need, such as why a calendar slot was rejected. L14's "Don't sleep on single-agent systems" and Cognition's "Don't Build Multi-Agents" make the same point.

**Shared context: blackboards and append-only logs.** Isolation fails when siblings need each other's findings. L18 shows two shared designs. In the blackboard system (Salemi et al.), a main agent posts a help request on a blackboard. File agents and a search agent listen, and any agent that can help writes to a separate response board. In DeLM (Mao et al.), there is no main agent. A public task queue marks which agent holds each task. Each finished result is "compressed and admitted" as a short entry into a shared context that all agents read continuously. Slide 21 sets the rules: the board is append-only, and entries are typed and may carry attachments.

Read DeLM's board as a team-level context window. Each agent's private context holds its own work; the board holds only gists. Beyond the slides, the DeLM page names the entry types FACT, FAIL and DONE, and keeps the log under 15K tokens with four agents. That is compaction at admission time: the long trajectory stays private, and only a checked summary becomes shared.

Beyond the lecture: append-only also suits the serving layer. A log that only grows is a stable prefix, so an agent that re-reads the board can reuse its cached KV for the old entries (section 5). OpenHands' event log is append-only for the same reasons (section 13).

**Waiting is a context cost too.** DeLM's slide 19 compares Claude Code with native subagents against DeLM on one Terminal-Bench task. The hierarchical run took 162.7 minutes, and 44% of agent time was spent waiting. DeLM took 29.3 minutes with 2% waiting, about 5.5× faster. In a strict hierarchy, results can travel only through the parent's context, so the parent becomes a relay. A shared board lets peers read results directly.

**Share only what is verified.** Park et al. (slide 25) show why the board's contents matter. Communicating agents share verified progress at sync points, and each continues from the best verified state. Sharing unverified claims spreads errors instead. On Terminal-Bench 2.0, a communicating team@2 (60.67% mean) did not beat independent pass@2 (62.36%). Shared context can also make attempts more alike.

Common misconception: "A shared board removes the context problem." It moves it. The board is itself a growing context that every agent re-reads, so it needs admission rules, a token budget and verification, exactly like a single agent's compaction policy.

## Across the lectures

Context engineering is taught mainly in L3, but nearly every other lecture either creates the context-growth problem in its own domain or proposes a partial answer to it. This section walks the lectures in order and then draws out where they agree and where they pull in different directions.

**L1 — Agents: the problem statement.** L1 lists "coherence over long context" as the second of six core agent capabilities. It splits the solutions into harness engineering (context compression and compaction, dynamic memory lookup, sub-agent delegation) and LLM training (SFT on long-context data), and pictures the spectrum as history → summary → memory → retrieval. In its agent-engineering section, L1 names vLLM and SGLang as the inference layer whose job includes batching requests and reusing the KV cache. Every later idea in this sheet fits into one of those two columns.

**L2 — Tool use: where observations come from.** L2 does not discuss context length directly, but it defines the tool results that become 37% of the prompt in L3's measurement. Its structured-output material also touches caching: constrained decoding precomputes and caches token-mask decisions for context-independent tokens and only checks context-dependent ones at run time. The lesson carries over: cache whatever does not depend on the changing part.

**L3 — Long-context agents: the core lecture.** L3 (Neubig) supplies almost all the mechanisms and numbers here. It measures growth (80K cumulative tokens after five calls; 77,922 mean tokens across 1,500 OpenHands sessions), splits the problem into capacity and efficiency, and then covers the whole stack: prefill/decode and serving metrics, attention and its local, recurrent, sparse and compressed variants, 2026 hybrid models, position encodings from sinusoids to YaRN and NoPE, long-context data and context parallelism, KV and prompt caching (PagedAttention, RadixAttention, cache-aware routing, API prices), and finally compaction as state estimation with continuation-based evaluation. Its closing slide stacks the ideas as growth, inference, architecture, caching and compaction.

**L4 — Memory and skills: context as one of three stores.** L4 places the context window in a table with external artifacts and model weights. The context window has high fidelity to what happened but is costly, noisy and "does not decide what matters". External artifacts are inspectable and retrievable but must be induced and maintained. Its progressive-disclosure design for skills (metadata always loaded, body loaded on trigger, bundled files read on demand) is context engineering applied to instructions rather than history.

**L5 — Planning: long horizons and delegation.** L5 opens with a failure that starts from a compaction (128k → 14k tokens) and ends with a poorly justified purchase. It lists "limit context" as one of four reasons to add structure to agents, presents RAO's trainable `launch_subagent` delegation and Recursive Language Models, and closes with the open question "How will the system stop errors and context from accumulating?" Neubig's slide in the same lecture adds the counterweight: multi-agent handoffs are summary reports that can drop context.

**L6 — Coding agents: the harness and long-context training.** L6 defines the harness as prompts + tools + agent loop + context management, and notes that models are trained across several harnesses (OpenHands, OpenCode, Codex), so context policies become part of the training distribution. On the model side, it shows Code Llama and Qwen2.5-Coder extending context during mid-training (8K → 32K, then YaRN to 128K) on coherent cross-file sequences. Its edit formats matter too: search/replace edits are compact, whereas whole-file rewrites repeat unchanged code into the context.

**L7 — Computer-use agents: visual context.** L7 shows the policy's context as goal + screenshot 0 + action 0 + screenshot 1 + …, tokenized into interleaved visual and action tokens. It notes that tokenization and history compression vary by system, and it lists speed and cost among remaining problems: long contexts are expensive, and screenshots and reasoning add prefill and generation cost. Game-TARS's sparse thinking (reason only at key decisions) is presented as one remedy.

**L8, L9, L11 — Training.** These lectures touch context only indirectly. L9 and L6 mark tool outputs as "context only" in RL traces: they are conditioning tokens, not training targets. Long-context capability itself comes from the SFT and continued-pretraining stages L1 and L3 describe.

**L10 — Deep research agents: context as search budget.** L10 animates the loop in which each search result is appended to "context so far". It reports Tongyi DeepResearch's BrowseComp accuracy rising as context grows from 8K to 128K, with more than 20% of SFT samples using over 10 tool calls and an evaluation limit of 128 tool calls. It also mentions cached tool results as a training-efficiency trick for asynchronous RL rollouts.

**How the ideas connect.** The lectures form a chain. L1 names the capability, L2 and L10 generate the observations, L3 explains why they are expensive and how to serve and trim them, L4 moves durable knowledge out of the window, and L5 isolates exploration into sub-agents. L6 and L7 show the same pressures in code and pixels.

**Where they differ in emphasis.**

- *More context versus less.* L10's Tongyi plot argues that more context buys accuracy for search agents. L3 and L4 stress that context is costly and noisy, and that effective context is shorter than advertised. Both hold: more *room* helps, but only if what fills it is relevant.
- *Architecture versus harness.* L3 spends half its time on model-side fixes (hybrid attention, YaRN, NoPE). L1, L4 and L5 treat the model as fixed and manage context from the harness. A builder usually controls only the harness, so the harness column is where most of your leverage is.
- *Delegation.* L5's RAO results favour learned recursive delegation, while Neubig's slides in L5 warn against fixed multi-agent roles because handoffs lose context. The reconciliation is that delegation works when it is adaptive and trained, and fails when it is a fixed org chart.
- *Summaries.* L3 treats summarization as useful but drift-prone and insists on exact anchors and recoverable evidence. L5's opening example shows what happens without them.

### L12 · RL systems: the training side of the cache

L12 (Gandhi) takes the serving machinery of L3 into the RL loop, and two of L3's assumptions stop holding. L3 treats KV and prefix caching as pure cost tools under fixed weights. In RL the weights change after every optimizer step, so the prefix cache is warm within one policy version and cold after each sync; SGLang's weight-update calls flush it by default (section 11). With async RL and in-place pausing, one trajectory can even mix KV from two policies, which turns cache policy into part of the off-policy correction that L12's staleness and `importance_weight_max` metrics track.

L3 also shows that compaction breaks the serving cache. L12 adds a second bill: compaction breaks the sequence extension property, so one trajectory becomes several training datums whose repeated task and summary tokens "have zero direct loss, but still require context computation". The rule "Preserve exact prefixes and concatenate for as long as practical" is section 5's cache rule restated for the trainer. Section 12's simulation puts numbers on it: compacting every 2 turns cut sampler prefill by about a third but cost 55% more trainer tokens.

L12 sharpens what "the same prefix" means. A context is a token sequence, not a string. Chat templates that strip past reasoning (Qwen 3 / 3.5 by default) and string round-trips that retokenize differently both break the prefix silently, so L12 argues for token-in, token-out: the trainer must score exactly the tokens the sampler produced. Its harness-agnostic design shows where that is enforced in practice. A middleman proxy (credited to Agent Lightning) speaks Chat Completions, Responses or Anthropic APIs to any harness and records token IDs and log-probs in a rollout store for the trainer.

Finally, L12's complex-harness slide (sub-agents, compaction, recursion; RAO and RLM) turns section 10's sub-agent isolation into a training problem. One episode becomes a tree of sequences, each with its own context, that must share credit from one final reward. This agrees with L6's point that context policies become part of the training distribution, and adds the systems cost of that choice.

### L14 · OpenHands: the condenser in production

L3's measurements (77,922 mean tokens across 1,500 sessions) came from OpenHands sessions; L14 shows the context policy that runs there (section 13). It confirms L3 point by point. `keep_first` and the recent tail implement section 9's "Select" step. The append-only event log implements "Recover" by construction, because a `Condensation` only changes the view. The condenser's separate `usage_id` makes the cost of compaction visible, which L3's cost model needs.

L14 adds an engineering stance L3 states only briefly: detail loss is acceptable when the true state is external. "Files and tests as evidence" is L4's externalized memory with the repository as the store. It also exposes a new mismatch. Conversation persistence restores events, but L14's persistence slide calls workspace persistence "a separate concern", so a restored history can say a file was edited while the container holding that edit is gone.

L14 sides with L5's caution about multi-agent designs. Its single-agent baseline keeps "shared context across activities" and adds agents only for parallel work, independent review or cost control (section 14). Skills and MCP tools are the other context levers: always-on content sits in the cached head, triggered content is appended, and every tool schema is a recurring cost.

The automation half reframes context as an input to be assembled. An automation run is "Event → bounded task → inspectable result", and its Context stage is "Repository, instructions, permissions". Each run starts fresh from that bounded input instead of from a long chat. In the software-factory pipeline, stages hand off through durable artifacts (issue, patch, pull request, check result) rather than through summaries, which avoids the handoff loss that section 10 warns about.

### L15 · Orchestration: context assembled by code

L15 (Fried) moves context decisions from run time to design time (section 15). In an explicit workflow, typed shared state passes between nodes, and each node's prompt is built from the fields it reads. The trade-off slide names the price directly: "Information flow has to be explicitly managed." A single agent avoids that price by keeping everything in one context window, which is exactly the growth that sections 1–9 then have to manage.

L15 connects backwards on its first slide: skills (L4), planning and decomposition (MACU, RAO, RLM in L5 and L12) and automations (L14) all add structure around agent actions. Its efficiency argument is also a context argument. A step that only polls needs code, and a classification step can use a smaller model with a short prompt, so many calls never see the long context at all. Checkpointing makes the state durable: saved search results let a crashed generation restart without searching again, the workflow analogue of OpenHands' event log.

The lecture's second half turns the problem around. "Agents produce more context than a person can review in full", so monitoring becomes a long-context task for humans. Docent compares paired runs and synthesizes failure modes over 108 failed runs; Hodoscope summarizes actions and embeds the summaries to find behavior clusters. Both compact trajectories for a reader rather than for the agent. T13 covers these tools and the Terminal-Bench case in full.

L15 does not contradict L14's single-agent advice; its own comparison slide cites L14's baseline. The two lectures split by task type. A known, stable procedure suits fixed state and narrow per-node context, while an open-ended task suits one agent with a condensed transcript.

### L18 · Multi-agent systems: what each agent sees

L18 (Vaduguru) is a multi-agent lecture, but its first argument is a context argument. Of the four single-stream limits on slide 4, "context management" comes first, and the L18 notes map it to one fix: subagents with fresh contexts. The other three limits (serial execution, lack of specialization, limited exploration) belong to T5 and T13. Section 16 holds the concepts; this note places them against earlier lectures.

**It supplies the evidence L5 lacked.** L5 introduced RAO's `launch_subagent` and warned that summary handoffs drop context. L18 adds RAO's 8K-context table (0.24 → 0.95 overall) and the curve where a recursive 8K agent matches a single 40K agent. It also shows MACU's gains growing with task length. On Odysseys, which runs to 500 actions, the single agent stalls near 8% while the multi-agent system passes 32% (8.5 → 34.0 in the table). On OSWorld and Online-Mind2Web, where curves flatten by about 100 actions, the gain is small. Read together: isolation pays when one stream would outgrow its window.

**It agrees with L14 on when not to split.** The L18 notes end slide 4 with L14's rule: name which limit a multi-agent design removes, or keep one agent. Slide 7's code shows the context-loss mechanism concretely. The supervisor receives only `["messages"][-1].text`.

**It turns L14's event log and L15's typed state into team-wide shared context.** L14's condenser works over an append-only event log, and L15 replaces the transcript with typed state that code reads per node. DeLM's board combines both ideas for many agents: append-only, typed entries, read by everyone. CAID and GitSwarm use a Git repository as the shared record, so the shared context is files and commits rather than prompt text. Beyond the slides, the CAID blog reports that removing worktree isolation hurt significantly, which is the coding version of keeping contexts apart.

**It adds time to the cost model.** Earlier sections priced context in tokens and KV memory. L18 adds wall-clock waiting: 44% of agent time idle in a hierarchical run against 2% in DeLM (slide 19). A context topology that routes every result through one parent costs latency as well as tokens.

L18's second part treats a human user as another agent and trains against user simulators. That material is in T15 and adds nothing specific to context engineering here.

### L21 · Search and planning: the prompt as data, and the length of a search

L21 (Jing Yu Koh, guest) is a search lecture; T5 holds its general search and decomposition material. Three threads bear on context: a long input kept outside the window, subtasks isolated in child contexts, and search that grows the context.

**RLM: the prompt is data, not context.** In Recursive Language Models (Zhang, Kraska & Khattab), the root LM never reads the long input. The input is loaded as a variable (`prompt = long_document`) in a persistent REPL. The root writes code to inspect, filter, split and compute over it, and that code can call an LM on selected snippets. Those subcalls can themselves be RLMs; in the evaluated implementation they run sequentially. The appendix figure shows the computation change: the root prints the first 100 characters of a book, splits it by "Chapter", sends each part to a depth-1 RLM with a focused question, and assembles their structured returns. "Recursive calls isolate context and return structured intermediate results."

Compare section 9. Compaction reads everything, then summarizes it. An RLM reads almost nothing: its window holds code, printed slices and child results, while the document stays in the REPL. It is section 10's sub-agent isolation applied to the input rather than to a subtask.

**What the numbers say.** With a GPT-5 root and GPT-5-mini subcalls, L21 reports BrowseComp-Plus (6–11M tokens) at 70.5% for compaction, 88.0% for the REPL alone and 91.3% for RLM depth 1. Direct GPT-5 could not run because the input exceeded its window. A coding harness with context offloading (OpenCode + offload) beat both at 94.0%. The striking case is OOLONG-Pairs, only 32K tokens: direct GPT-5 scores 0.1 F1, the REPL 43.9 and RLM depth 3 76.0. The input fits the window, yet pairwise reasoning over every record fails in one pass. That is section 8's gap between advertised and effective context. Depth is a knob, not a free gain: on CodeQA, Qwen3-Coder scored 66% with the REPL alone and 44% at depth 3.

**RAO with a large window.** L18 showed RAO at 8K context. L21 adds results at a 256K evaluation context: TextCraft-Synth 73% → 96%, Oolong-Real 0.203 → 0.320 average reward, DeepDive 24% → 40%. Each instance chooses which context to pass and which output to want back. On Oolong-Real RAO usually used one layer of workers reading separate chunks, the same shape as an RLM. The cost is time: DeepDive took 233.0 s against 13.3 s, because later searches depend on earlier findings.

**Search grows the context.** In Stream of Search, "backtracking appends text; earlier attempts stay in context". The trace is the search, so its length is bounded by the window (4,096 tokens for the 250M GPT-Neo). APA's penalty on extra expansions and Searchformer's fine-tuning on shorter traces both shrink that budget. WebDreamer's imagined pages stack the same way. Success fell from 37% at a one-step horizon to 32% at two and three steps, which L21 attributes to compounding prediction errors. Beyond the lecture: each imagined page is also prompt text, so a longer horizon costs tokens and KV memory as well as accuracy.

## Mechanics

This section derives the numbers used elsewhere in the sheet: agent token totals, attention cost, KV memory and decode time, prefix-cache matching, the linear-attention and RoPE identities, and the compaction and evaluation procedures as pseudocode.

### M1. Cumulative input tokens in an agent loop

Let the fixed prefix be P tokens and let each step append Δ tokens (model output plus tool result). Call *t* (starting at 1) reads

$$
n_t = P + (t-1)\,\Delta
$$

Summing over T calls gives an arithmetic series:

$$
N_{\text{in}}(T) = \sum_{t=1}^{T} n_t = T P + \Delta \frac{T(T-1)}{2}
$$

Here nₜ is the prompt length of call *t*, N\_in(T) is the total input tokens over T calls, P is the fixed prefix and Δ the per-step growth. With P = 6K, Δ = 5K and T = 5, N\_in = 30K + 5K·10 = 80K, matching L3's slide. The ΔT²/2 term dominates once T > 2P/Δ.

**With a prefix cache.** If every call's prompt is cached for the next, call *t* prefills only the new Δ tokens and reads nₜ − Δ from cache. With per-token prices c\_in (uncached), c\_r (cache read) and c\_w (cache write), the input bill is approximately

$$
\text{Cost}_{\text{cache}} \approx c_w\,[P + (T-1)\Delta] + c_r \left[ N_{\text{in}}(T) - P - (T-1)\Delta \right]
$$

The first bracket (tokens written once) is linear in T; the second (tokens re-read) is still quadratic, but multiplied by c\_r ≈ 0.1·c\_in. Caching divides the quadratic term's price by about 10; it does not remove it.

**With compaction.** If the harness compacts whenever the prompt exceeds a threshold B\_max down to B\_min, the prompt oscillates between the two, so per-call input is bounded by B\_max and the total becomes linear in T: roughly T·(B\_max + B\_min)/2. Each compaction costs one summarization call and invalidates the cache after the protected head.

### M2. Attention cost: prefill and decode

For one layer with model width d (query heads × head dimension) and n tokens, full causal prefill computes QKᵀ and AV. Counting a multiply-add as 2 FLOPs and using the causal half:

$$
F_{\text{attn,prefill}} \approx 2 \cdot 2 \cdot \tfrac{1}{2}\, n^2 d \cdot L = 2 L d\, n^2
$$

A single decode step at context length n scores one query against n keys and mixes n values:

$$
F_{\text{attn,decode}}(n) \approx 4 L d\, n, \qquad F_{\text{param}} \approx 2N
$$

L is the number of layers, d the attention width, n the context length and N the parameter count. The parameter term is the usual 2 FLOPs per parameter per token. Attention overtakes parameters when 4Ldn > 2N, that is n\* = N/(2Ld). For N = 70B, L = 80 and d = 8,192: n\* ≈ 7×10¹⁰ / 1.31×10⁶ ≈ 53K tokens.

Sliding-window attention replaces n with min(n, w) in the decode formula, and sparse top-K attention replaces it with K (plus the selector's cost). Linear attention replaces the n-dependent term with a constant d\_k·d\_v state update.

### M3. KV memory and decode time

For standard multi-head or grouped-query attention:

$$
M_{\text{KV}} = 2 \cdot L \cdot H_{kv} \cdot d_h \cdot n \cdot b
$$

The 2 counts K and V, L is layers, H\_kv is the number of key/value heads (equal to query heads for MHA, 1 for MQA, the group count for GQA), d\_h is head dimension, n is tokens and b is bytes per value (2 for BF16, 1 for FP8). For Llama-3-70B, 2·80·8·128·2 = 327,680 bytes = 320 KiB per token, so 128K tokens need 40 GiB.

For MLA, only the latent cₜ and a small decoupled RoPE key are cached per layer:

$$
M_{\text{KV}}^{\text{MLA}} = L \cdot (d_c + d_h^{R}) \cdot n \cdot b
$$

In DeepSeek-V2, d\_c = 512 and d\_hᴿ = 64, so each layer stores 576 values per token instead of 2·128·128 = 32,768 for full MHA with 128 heads.

**Decode is bandwidth-bound.** A decode step for a batch of B sequences must read all weights once (shared across the batch) and each sequence's KV cache (not shared):

$$
t_{\text{step}} \gtrsim \frac{N b_w + \sum_{i=1}^{B} M_{\text{KV}}(n_i)}{\text{BW}}
$$

b\_w is bytes per weight and BW the aggregate memory bandwidth. Batching amortizes the weight read but not the KV read. On 8 H100s (about 26.8 TB/s), 140 GB of BF16 weights cost about 5 ms per step. Ten sequences at 128K add 10 × 43 GB = 430 GB, about 16 ms. The **arithmetic intensity** (FLOPs per byte read) of the KV part is about 4d·n / (2·H\_kv·d\_h·n·b), a small constant independent of batch size, which is why long-context decode stays memory-bound no matter how you batch.

### M4. Prefix-cache lookup: hash chains, radix trees and routing

A KV block is reusable only if its tokens *and every token before it* match. Hash chaining encodes that dependency, so a single dictionary lookup per block suffices. The sketch below follows vLLM's automatic prefix caching design (hash of parent hash plus block tokens, LRU eviction of free blocks):

```python
BLOCK = 16  # tokens per KV block

def block_hashes(tokens, extra=()):
    """One hash per FULL block; each depends on all earlier blocks."""
    hashes, parent = [], None
    for i in range(0, len(tokens) - len(tokens) % BLOCK, BLOCK):
        h = hash((parent, tuple(tokens[i:i + BLOCK]), extra))  # extra: LoRA id, image hash...
        hashes.append(h)
        parent = h
    return hashes

def prefill_with_cache(tokens, cache):          # cache: dict hash -> physical block
    table, hit = [], 0
    for h in block_hashes(tokens):
        if h in cache:                            # reuse; bump its LRU timestamp
            table.append(cache.touch(h)); hit += BLOCK
        else:
            break                                 # first miss ends reuse
    run_model_prefill(tokens[hit:], past=table)   # compute only the suffix
    return hit
```

Lookup cost is O(number of blocks). A partial last block is not cached. The `extra` field matters: two prompts with identical text but different adapters or images must not share KV.

A **radix tree** (SGLang) stores the same information as a trie whose edges are token runs. Matching walks from the root, comparing edge labels, and returns the deepest node reached. Inserting a conversation that diverges mid-edge **splits** the edge so the shared part is stored once. Eviction removes least-recently-used **leaves** first, so shared prefixes (system prompts) survive longest. Match cost is O(prefix length).

**Cache-aware routing** chooses a worker w for a request r with a score like

$$
\text{score}(w) = \text{match}(r, w) - \lambda \cdot \text{queue}(w)
$$

match(r, w) is the number of prefix tokens worker w already holds, queue(w) is its pending work and λ converts waiting into token-equivalents. In L3's example, worker 1 (18K match, queue 2) beats worker 2 (2K match, queue 0) unless each queued request costs more than 8K tokens of prefill time.

### M5. Linear attention and the delta rule

Start from causal softmax attention for query *t*:

$$
o_t = \sum_{i=1}^{t} \frac{\exp(q_t^\top k_i / \sqrt{d_k})}{\sum_{j=1}^{t} \exp(q_t^\top k_j / \sqrt{d_k})}\, v_i
$$

The denominator depends on qₜ, so the sum cannot be precomputed independently of the query. Replace the weight with the bilinear score qₜᵀkᵢ (optionally after a feature map) and reassociate:

$$
o_t = \sum_{i=1}^{t} (q_t^\top k_i)\, v_i = \Big(\sum_{i=1}^{t} k_i v_i^\top\Big)^{\!\top} q_t = S_t^\top q_t, \qquad S_t = S_{t-1} + k_t v_t^\top
$$

Sₜ ∈ ℝ^{d\_k × d\_v} is a fixed-size state, so decode costs O(d\_k·d\_v) per token regardless of t, and there is no KV cache. The delta rule changes the write to correct only the prediction error, and gating adds decay:

$$
\hat v_t = S_{t-1}^\top k_t,\quad S_t = \alpha_t S_{t-1} + \beta_t\, k_t\,(v_t - \alpha_t S_{t-1}^\top k_t)^\top
$$

v̂ₜ is the memory's current prediction for key kₜ, βₜ ∈ \[0,1\] is the correction strength, and αₜ ∈ \[0,1\] is Gated DeltaNet's scalar retention (αₜ = 1 gives DeltaNet). KDA replaces αₜ with a diagonal matrix Dₜ = Diag(αₜ), one retention rate per key channel: Sₜ = (I − βₜkₜkₜᵀ)DₜSₜ₋₁ + βₜkₜvₜᵀ.

### M6. RoPE, position interpolation and YaRN

RoPE rotates each 2-D pair ℓ of a query or key at position t by angle tθₗ, with θₗ = base^(−2ℓ/d\_h). Write R(t) for the block-diagonal rotation. Since rotation matrices are orthogonal and R(i)ᵀ = R(−i):

$$
\tilde q_i^\top \tilde k_j = (R(i) q_i)^\top (R(j) k_j) = q_i^\top R(i)^\top R(j)\, k_j = q_i^\top R(j-i)\, k_j
$$

The score depends only on the offset j − i, which is why RoPE is called relative. Each pair has wavelength λₗ = 2π/θₗ = 2π·base^(2ℓ/d\_h). Pairs with λₗ much shorter than the training length L have been seen at every phase; pairs with λₗ longer than L have not.

Position interpolation with scale s = L′/L divides every frequency: θ′ₗ = θₗ/s. YaRN blends per dimension and rescales attention temperature:

$$
\theta'_\ell = (1-\gamma_\ell)\frac{\theta_\ell}{s} + \gamma_\ell\,\theta_\ell, \qquad \frac{1}{\tau} = 0.1 \ln s + 1, \qquad A = \mathrm{softmax}\!\Big(\frac{QK^\top + M}{\tau\sqrt{d_k}}\Big)
$$

γₗ ∈ \[0,1\] ramps from 0 for long-wavelength pairs (fully interpolated) to 1 for short-wavelength pairs (kept unchanged); τ is the attention temperature, M the causal mask. Extending 32K to 128K gives s = 4 and 1/τ = 0.1·ln 4 + 1 ≈ 1.139, slightly sharper attention.

### M7. A compaction policy as an algorithm

L3's four policy decisions (trigger, select, replace, recover) and five fates (keep exact, encode, keep tail, externalize, discard) translate into a short procedure. The version below is a design sketch; `call_llm` is any summarization model.

```python
def maybe_compact(msgs, limit, reserve_out=8_000, tail_turns=6):
    # 1. TRIGGER: leave room for the next output, never wait for overflow
    if count_tokens(msgs) + reserve_out < 0.8 * limit:
        return msgs
    head = msgs[:2]                                    # system prompt + goal: KEEP EXACT
    cut = last_valid_boundary(msgs, keep=tail_turns)   # 2. SELECT: never split call/result
    older, tail = msgs[2:cut], msgs[cut:]              # tail: KEEP EXACT
    save_to_disk(older)                                # 4. RECOVER: full history kept
    evidence = [externalize(m) for m in older if is_large_observation(m)]  # EXTERNALIZE
    older = drop_superseded(dedupe(older))             # DISCARD
    ckpt = call_llm(CHECKPOINT_PROMPT, older)          # 3. REPLACE: ENCODE as structure
    ckpt = reinsert_anchors(ckpt, extract_anchors(msgs))  # exact constraints, IDs, paths
    if not validates(ckpt):                            # schema + anchor check
        return hard_truncate(msgs, limit)              # defined failure behaviour
    return head + [render(ckpt, evidence)] + tail
```

The checkpoint is safer as structured data than as free prose, because anchors can be checked mechanically. A format in the spirit of L3's CI example:

```json
{
  "goal": "Fix the CI timeout",
  "constraints": ["Use CUDA 12.4 exactly", "Never edit tests/"],
  "decisions": [
    {"what": "Root cause is a port collision between workers", "evidence": "/tmp/ci.log"},
    {"what": "Set --workers=1", "verified": true}
  ],
  "progress": {"done": ["reproduce", "diagnose", "verify fix"], "open": ["open PR"]},
  "identifiers": {"branch": "fix-ci-timeout", "log": "/tmp/ci.log"},
  "next_action": "Open the PR with the tested worker setting",
  "compaction_count": 2
}
```

`reinsert_anchors` copies constraints and identifiers from the *original* anchor store, not from the previous checkpoint. That breaks the drift recursion ŝₖ₊₁ = C(ŝₖ ⊕ Rₖ) for the fields that matter most, because those fields are never regenerated.

**Cost of the policy.** Each compaction costs one summarization call over the older region (|older| input tokens plus the checkpoint as output) and invalidates the cache after the head. If the prompt oscillates between B\_min and B\_max with growth Δ per step, compaction happens every (B\_max − B\_min)/Δ steps. Wider bands mean fewer cache invalidations and fewer summaries, at the price of longer average prompts.

### M8. Continuation-based evaluation protocol

L3's plant → compact → continue loop becomes a paired comparison against the uncompacted run:

```text
for each logged trajectory tau with planted facts F (constraints, IDs, decisions):
    for each compaction point k in {early, middle, late}:
        H      = tau[:k]
        s_hat  = policy(H)                     # production policy, unchanged
        for r in 1..R_repeat:                  # repeated compactions for stability
            s_hat = policy(s_hat + tau[k : k + r*step])
            recall[r]  = fraction of F present verbatim in s_hat
        a_full = agent.continue(H, K steps)    # reference continuation
        a_comp = agent.continue(s_hat, K steps)
        agree  = action agreement(a_full, a_comp)
        success, tokens, latency, dollars = run_to_completion(s_hat)
report: state recall by r, task success vs. full-context baseline,
        cost per solved task, action agreement, variance over seeds
```

The four metric families map to L3's slide: state recall, task success, efficiency and stability. Report *cost per solved task*, because a policy that saves tokens but triggers retries can cost more in total. Use at least a few seeds per point, since agent runs are noisy and a 2–3 point difference in success is often within run-to-run variance.

### M9. The event-count condenser: view size, rewrite rhythm and cache cost

This derivation makes section 13's rule quantitative. The rule follows the OpenHands SDK source; the cost model is this sheet's, using L3's price ratio for cached input.

**The rule.** Let M be `max_size`, k be `keep_first`, and g the events added per agent step (an action and an observation, so g = 2). When the view holds more than M events, the condenser keeps the k head events, writes one summary, and keeps r tail events:

$$
T = \lfloor M/2 \rfloor, \qquad r = T - k - 1 > 0, \qquad |C| = k + 1 + r = T
$$

T is the target view size after a condensation; the SDK rejects settings where r ≤ 0. The forgotten range starts at index k, so it contains the previous summary plus every event added since. With the slide's M = 10 and k = 2: T = 5, r = 2. The L14 sheet's formula then gives the token size of the view:

$$
|C_t|_{\text{tok}} = \sum_{i \le k} |e_i| + |\mathrm{sum}| + \sum_{i > t-r} |e_i|
$$

**The rhythm.** After a condensation the view grows by g per step and condenses again once it passes M, so the number of agent steps between condensations is:

$$
s = \left\lceil \frac{M + 1 - T}{g} \right\rceil
$$

For M = 10, s = ⌈6/2⌉ = 3; for M = 40, T = 20 and s = ⌈21/2⌉ = 11. Each condensation is one extra event in the log and one extra turn without an action, the overhead the OpenHands blog reports.

**The cost per step.** Let H be the head tokens, S the summary tokens, ē the mean tokens per event, and ρ the price of cached input relative to uncached (L3's prices give ρ = $0.50 / $5 = 0.1). Between condensations the view is append-only, so each call prefills only the new g events; the first call after a condensation re-prefills the summary and the r kept events. The summarizer reads the old summary plus the g·s new events. Averaged over a cycle, the cost per step is about:

$$
\begin{aligned}
c_{\text{cond}} &\approx P + Z + \rho\,(\bar V - P)\\
P &= g\bar e + \frac{S + r\bar e}{s} \quad \text{(uncached agent prefill)}\\
Z &= g\bar e + \frac{S}{s} \quad \text{(summarizer input)}\\
\bar V &= H + S + \big(r + \tfrac{gs}{2}\big)\bar e \quad \text{(mean view tokens)}
\end{aligned}
$$

Without a condenser, step n prefills only its new events and reads everything else from cache:

$$
c_{\text{none}}(n) \approx g\bar e + \rho\,(H + n\,g\,\bar e)
$$

The condenser's cost is flat in n, while the no-condenser cost grows linearly per step, so quadratically in total (M1). Note the Z term: the summarizer reads every event about once more at full price. With caching, the condenser trades cheap, growing cached re-reads for a fixed amount of extra uncached reading.

**Worked numbers.** Take H = 3,500 (system 3,000 + task 500), actions of 200 and observations of 1,300 tokens (ē = 750), S = 800, M = 10, k = 2, ρ = 0.1. Then P ≈ 2,267, Z ≈ 1,767 and V̄ ≈ 8,050, so c\_cond ≈ 2,267 + 1,767 + 0.1 × 5,783 ≈ 4,600 units per step. The no-condenser cost passes that when 1,500 + 0.1 × (3,500 + 1,500n) > 4,600, that is after about step 18. Without prompt caching (ρ = 1) the crossover comes after about 3 steps. The cache moves the break-even point by a factor of six.

**A check by simulation.** The program applies the rule step by step, including the action/observation boundary, and counts cached tokens as the prefix shared with the previous call.

```python
"""Event-count condenser (OpenHands-style rule) vs. no condenser.
The log is append-only; the LLM sees a View derived from it. Each step adds an
action and an observation event. Before a step, if len(view) > max_size, the
condenser forgets view[start:end] (start = keep_first, so an old summary is
re-summarised), keeps r = max_size//2 - keep_first - 1 tail events, never
splits an action from its observation, and appends a Condensation event
instead of acting. Prefix-cache hits = tokens shared with the previous call's prompt.
cost = uncached + 0.1 x cached + summariser input (cached input at 10% of the
uncached price, as in L3's API prices; output tokens ignored)."""

SYS, TASK, ACT, OBS, SUMM = 3000, 500, 200, 1300, 800

def simulate(steps, max_size=None, keep_first=2):
    log = [("sys", SYS, 0), ("task", TASK, 1)]          # (kind, tokens, uid)
    uid, view_ids = 2, [0, 1]                            # view = list of uids
    sizes = {0: SYS, 1: TASK}
    kinds = {0: "sys", 1: "task"}
    agent_in = cached = summ_in = condensations = 0
    prev_prompt, peak, acted = [], 0, 0
    while acted < steps:
        if max_size and len(view_ids) > max_size:
            r = max_size // 2 - keep_first - 1
            end = len(view_ids) - r
            while end < len(view_ids) and kinds[view_ids[end]] == "obs":
                end += 1                                 # do not split action/observation
            forgotten = view_ids[keep_first:end]
            summ_in += sum(sizes[i] for i in forgotten)  # summariser reads them
            sizes[uid], kinds[uid] = SUMM, "summary"
            view_ids = view_ids[:keep_first] + [uid] + view_ids[end:]
            log.append(("condensation", 0, uid)); uid += 1
            condensations += 1
            continue                                     # the step returns early
        prompt = list(view_ids)
        n = 0
        for a, b in zip(prompt, prev_prompt):
            if a != b: break
            n += 1
        agent_in += sum(sizes[i] for i in prompt)
        cached += sum(sizes[i] for i in prompt[:n])
        peak = max(peak, sum(sizes[i] for i in prompt))
        for kind, tok in (("act", ACT), ("obs", OBS)):
            sizes[uid], kinds[uid] = tok, kind
            log.append((kind, tok, uid)); view_ids.append(uid); uid += 1
        prev_prompt, acted = prompt, acted + 1
    return dict(log=len(log), view=len(view_ids), cond=condensations, agent_in=agent_in,
                hit=cached / agent_in, uncached=agent_in - cached, summ_in=summ_in, peak=peak)

print(f"{'policy':16}{'log':>5}{'view':>6}{'cond':>6}{'agent in':>11}{'hit':>6}"
      f"{'uncached':>10}{'summ in':>9}{'peak ctx':>10}{'cost':>9}")
for name, m in [("none", None), ("max_size=10", 10), ("max_size=40", 40), ("max_size=80", 80)]:
    s = simulate(60, m)
    print(f"{name:16}{s['log']:5}{s['view']:6}{s['cond']:6}{s['agent_in']:11,}{s['hit']:6.0%}"
          f"{s['uncached']:10,}{s['summ_in']:9,}{s['peak']:10,}"
          f"{s['uncached'] + 0.1 * (s['agent_in'] - s['uncached']) + s['summ_in']:9,.0f}")
```

Output (60 agent steps):

```text
policy            log  view  cond   agent in   hit  uncached  summ in  peak ctx     cost
none              122   122     0  2,865,000   97%    92,000        0    92,000  369,300
max_size=10       141     7    19    432,500   75%   107,200  101,400     9,500  241,130
max_size=40       126    33     4  1,286,000   89%   137,200   69,900    32,000  321,980
max_size=80       123    79     1  2,221,000   95%   118,300   33,000    62,000  361,570
```

Read it in three lines. The log grows in every policy, by one extra event per condensation (141 = 122 + 19), while the view stays bounded. Raw input falls 6.6× at `max_size=10`, but price-weighted cost falls only 1.5×, because most of what the condenser removes was already cheap cached input. The case for a small `max_size` is therefore mostly peak context (9,500 versus 92,000 tokens) and effective-context quality (section 8), with cost a secondary gain once caching is on.

## Hands-on

Three worked examples turn the formulas into numbers you can change: a cost and KV-memory calculator, a compaction lab that measures cache hits and state recall, and a sizing walkthrough for a real deployment. Both programs use only the Python standard library and were run exactly as shown.

### Example 1: KV memory and the price of a growing transcript

This program applies the KV formula from M3 to four model shapes, checks how many 128K-token sessions fit on an 8-GPU node, and simulates the agent-loop bill from M1 under three policies. Prices are L3's Claude Opus 5 row ($5 input, $0.50 cached, $25 output per million tokens) plus Anthropic's documented 1.25× cache-write price. No LLM is called.

```python
"""Agent context economics: KV-cache memory and cumulative token cost.

Standard library only. Prices are the L3 slide's Claude Opus 5 row
(USD per 1M tokens, checked Aug 30 2026) plus Anthropic's documented
1.25x multiplier for 5-minute cache writes.
"""

# ---------- Part 1: KV-cache memory per sequence ----------
# bytes/token = 2 (K and V) * layers * kv_heads * head_dim * bytes_per_value
MODELS = {
    # name: (layers, kv_heads, head_dim)   -> standard K/V caching
    "Llama-3-8B (GQA 8 KV heads)": (32, 8, 128),
    "Llama-3-70B (GQA 8 KV heads)": (80, 8, 128),
    "70B-class if full MHA (64 heads)": (80, 64, 128),
}
MLA = {"DeepSeek-V2 (MLA latent 512+64)": (60, 576)}  # layers, cached values/token/layer


def kv_bytes_per_token(layers, kv_heads, head_dim, bytes_per_val=2):
    return 2 * layers * kv_heads * head_dim * bytes_per_val


def gib(x):
    return x / 2**30


print("KV cache per sequence (bf16)")
print(f"{'model':36s} {'KiB/token':>10s} {'32K':>8s} {'128K':>8s} {'1M':>9s}")
rows = [(n, kv_bytes_per_token(*cfg)) for n, cfg in MODELS.items()]
rows += [(n, L * c * 2) for n, (L, c) in MLA.items()]
for name, bpt in rows:
    print(f"{name:36s} {bpt/1024:10.1f} {gib(bpt*32768):7.1f}G "
          f"{gib(bpt*131072):7.1f}G {gib(bpt*2**20):8.1f}G")

# How many 128K-token agent sessions fit next to the weights?
hbm_gib = 8 * 80 * 1e9 / 2**30          # 8 x 80 GB GPUs
weights_gib = 70e9 * 2 / 2**30          # 70B params in bf16
per_seq = gib(kv_bytes_per_token(80, 8, 128) * 131072)
usable = hbm_gib * 0.9 - weights_gib    # keep 10% for activations etc.
print(f"\n8xH100 node: {hbm_gib:.0f} GiB HBM, weights {weights_gib:.0f} GiB, "
      f"KV/seq@128K {per_seq:.1f} GiB -> {int(usable // per_seq)} concurrent sessions")

# ---------- Part 2: cumulative input tokens in an agent loop ----------
PRICE_IN, PRICE_CACHED, PRICE_OUT = 5.00, 0.50, 25.00
PRICE_WRITE = 1.25 * PRICE_IN
P, DELTA, OUT = 6_000, 5_000, 400    # fixed prefix, growth per call, output per call


def simulate(calls, cache=False, compact_at=None, compact_to=None):
    """Return (sum of input tokens, dollars, peak context)."""
    ctx, total_in, dollars, peak, cached_prefix = P, 0, 0.0, 0, 0
    for _ in range(calls):
        if compact_at and ctx > compact_at:
            ctx = compact_to              # summary replaces history
            dollars += (ctx * PRICE_OUT) / 1e6   # rough: summary is generated output
            cached_prefix = min(cached_prefix, P)  # prefix after P changed
        total_in += ctx
        peak = max(peak, ctx)
        if cache:
            new = ctx - cached_prefix
            dollars += (cached_prefix * PRICE_CACHED + new * PRICE_WRITE) / 1e6
            cached_prefix = ctx           # this call's input is now cached
        else:
            dollars += ctx * PRICE_IN / 1e6
        dollars += OUT * PRICE_OUT / 1e6
        ctx += DELTA                      # output + tool result appended
    return total_in, dollars, peak


print("\nCumulative input tokens (slide check, 5 calls):",
      [P + t * DELTA for t in range(5)], "->", simulate(5)[0])
print(f"\n{'calls':>5s} {'policy':22s} {'input tokens':>13s} {'peak ctx':>9s} {'cost $':>8s}")
for T in (10, 30, 60):
    for label, kw in [("no cache", {}), ("prefix cache", {"cache": True}),
                      ("cache + compact@60K", {"cache": True, "compact_at": 60_000,
                                               "compact_to": 12_000})]:
        tok, usd, peak = simulate(T, **kw)
        print(f"{T:5d} {label:22s} {tok:13,d} {peak:9,d} {usd:8.2f}")
```

Output:

```text
KV cache per sequence (bf16)
model                                 KiB/token      32K     128K        1M
Llama-3-8B (GQA 8 KV heads)               128.0     4.0G    16.0G    128.0G
Llama-3-70B (GQA 8 KV heads)              320.0    10.0G    40.0G    320.0G
70B-class if full MHA (64 heads)         2560.0    80.0G   320.0G   2560.0G
DeepSeek-V2 (MLA latent 512+64)            67.5     2.1G     8.4G     67.5G

8xH100 node: 596 GiB HBM, weights 130 GiB, KV/seq@128K 40.0 GiB -> 10 concurrent sessions

Cumulative input tokens (slide check, 5 calls): [6000, 11000, 16000, 21000, 26000] -> 80000

calls policy                  input tokens  peak ctx   cost $
   10 no cache                     285,000    51,000     1.53
   10 prefix cache                 285,000    51,000     0.54
   10 cache + compact@60K          285,000    51,000     0.54
   30 no cache                   2,355,000   151,000    12.07
   30 prefix cache               2,355,000   151,000     2.35
   30 cache + compact@60K          974,000    57,000     2.27
   60 no cache                   9,210,000   301,000    46.65
   60 prefix cache               9,210,000   301,000     6.94
   60 cache + compact@60K        2,009,000    57,000     4.86
```

**What to notice.**

- The loop check reproduces L3's slide exactly: prompts of 6K, 11K, 16K, 21K and 26K tokens sum to 80,000.
- Going from 30 to 60 calls roughly quadruples input tokens (2.36M to 9.21M), because the total grows with the square of the number of calls.
- Prefix caching cuts the 60-call bill from $46.65 to $6.94 without changing a single token the model sees. Compaction then cuts peak context from 301K to 57K, which keeps the run inside the effective window, and trims cost further to $4.86.
- GQA is worth 8×: the same 70B shape with full multi-head KV would need 320 GiB for one 128K session, more than four H100s. MLA shrinks KV a further 4.7× relative to Llama-3-70B's GQA.
- Only about ten 128K-token sessions fit on a whole 8×H100 node next to BF16 weights. Long agent sessions are limited by memory, not compute.

### Example 2: A compaction lab with prefix-cache and recall metrics

This program runs one synthetic 24-step coding-agent trajectory (the CI-timeout story from L3) under five context policies. It measures total input tokens, peak context, prefix-cache hit rate, a price-weighted cost (uncached token = 1, cached read = 0.1) and continuation-style **state recall**: the fraction of four planted anchors ("CUDA 12.4", "never edit tests/", "/tmp/ci.log", "--workers=1") still present verbatim at the end. `call_llm` is a stub, not a real model: a deterministic lossy summarizer that paraphrases versions and drops paths, mimicking L3's drift example. Tokens are approximated by words.

```python
"""Compaction lab: compare context policies on one synthetic agent run.

Measures, per policy: total input tokens, peak context, prefix-cache hit
rate, and continuation-style state recall after the run.
call_llm() is a STUB standing in for a real model: a deterministic, lossy
summarizer that paraphrases (so repeated summaries drift, as in L3).
Tokens are approximated by whitespace-separated words.
"""
import re

GOAL = "GOAL: fix the CI timeout. CONSTRAINT: use CUDA 12.4 exactly. CONSTRAINT: never edit tests/ ."
SYSTEM = "SYSTEM: you are a coding agent. TOOLS: bash, edit, finish. " + "tool-spec " * 300
ANCHOR_KEYS = ["CUDA 12.4", "never edit tests/", "/tmp/ci.log", "--workers=1"]


def ntok(msgs):
    return sum(len(m.split()) for m in msgs)


def make_trajectory(steps=24):
    """Yield (action, observation, note) triples. Notes carry decisions."""
    for i in range(steps):
        action = f"ACTION {i}: run step {i} of the investigation"
        log = " ".join(["address already in use"] * 120) if i % 3 == 0 else "ok " * 150
        obs = f"OBSERVATION {i}: {log}"
        note = None
        if i == 5:
            note = "DECISION: root cause is a port collision between workers."
        if i == 11:
            note = "DECISION: set --workers=1 ; ARTIFACT: full log saved at /tmp/ci.log"
        if i == 17:
            note = "DECISION: suite passes with --workers=1 ; next open the PR."
        yield action, obs, note


def call_llm(messages):
    """STUB for an LLM summarizer. Keeps decision lines but paraphrases them
    lossily: exact versions become vaguer and paths are dropped."""
    text = " ".join(messages)
    kept = re.findall(r"DECISION: (?:(?! ;)(?!\. ).)*", text)
    summary = "SUMMARY: " + " | ".join(kept[-3:])
    summary = re.sub(r"(\d+)\.(\d+)", r"\1.x", summary)      # 12.4 -> 12.x
    summary = summary.replace("12.x", "a recent version")     # second pass drifts further
    summary = re.sub(r"/tmp/\S+", "a log file", summary)
    return summary


class PrefixCache:
    """Single-thread prefix cache: tokens reused = longest common prefix
    with the previous call's input (what a radix tree would match)."""
    def __init__(self):
        self.prev, self.hit, self.total = [], 0, 0

    def call(self, msgs):
        toks = " ".join(msgs).split()
        n = 0
        for a, b in zip(self.prev, toks):
            if a != b:
                break
            n += 1
        self.hit += n
        self.total += len(toks)
        self.prev = toks


def run(policy, budget=3000, tail=4):
    msgs = [SYSTEM, GOAL]
    cache, total_in, peak, compactions = PrefixCache(), 0, 0, 0
    for action, obs, note in make_trajectory():
        msgs += [action, obs] + ([note] if note else [])
        live = [i for i, m in enumerate(msgs) if m.startswith("OBSERVATION ")]
        if policy == "mask_old_obs" or (policy == "mask_batched" and len(live) > 3 * tail):
            # observation masking: keep the last `tail` observations verbatim.
            # mask_batched waits until 3*tail pile up, so the prefix changes rarely.
            for i in live[:-tail]:
                msgs[i] = f"OBSERVATION-MASKED ({len(msgs[i].split())} tokens omitted)"
        if ntok(msgs) > budget and policy in ("naive_summary", "anchored_checkpoint"):
            compactions += 1
            head, older, recent = msgs[:2], msgs[2:-tail], msgs[-tail:]
            if policy == "naive_summary":
                # summarize everything except the system prompt, goal included
                summary = call_llm(msgs[1:-tail])
                msgs = [SYSTEM, summary] + recent
            else:
                checkpoint = call_llm(older)
                # re-attach exact anchors and pointers the summarizer may drop
                exact = [ln for ln in older if "DECISION" in ln]
                pointers = sorted(set(re.findall(r"/tmp/\S+|--workers=\d+", " ".join(older))))
                msgs = head + [checkpoint, "EXACT: " + " | ".join(exact[-3:]),
                               "EVIDENCE: " + " ".join(pointers)] + recent
        cache.call(msgs)
        n = ntok(msgs)
        total_in += n
        peak = max(peak, n)
    final = " ".join(msgs)
    recall = sum(k in final for k in ANCHOR_KEYS) / len(ANCHOR_KEYS)
    # price-weighted input: uncached token = 1.0, cached read = 0.1 (typical ratio)
    units = (cache.total - cache.hit) + 0.1 * cache.hit
    return dict(total_in=total_in, peak=peak, hit=cache.hit / cache.total, units=units,
                compactions=compactions, recall=recall)


if __name__ == "__main__":
    print(f"{'policy':22s} {'input tok':>10s} {'peak':>6s} {'cache hit':>9s} "
          f"{'cost units':>10s} {'compact':>7s} {'recall':>6s}")
    for p in ["full_history", "mask_old_obs", "mask_batched",
              "naive_summary", "anchored_checkpoint"]:
        r = run(p)
        print(f"{p:22s} {r['total_in']:10,d} {r['peak']:6,d} {r['hit']:9.1%} "
              f"{r['units']:10,.0f} {r['compactions']:7d} {r['recall']:6.0%}")
    # Show what the stub summary looks like after a drift-prone pass
    print("\nstub summary sample:", call_llm([GOAL, "DECISION: pin CUDA 12.4 ; log /tmp/ci.log"]))
```

Output:

```text
policy                  input tok   peak cache hit cost units compact recall
full_history               91,811  6,834     92.6%     15,332       0   100%
mask_old_obs               35,321  1,870     34.2%     24,439       0   100%
mask_batched               56,981  3,702     84.7%     13,522       0   100%
naive_summary              47,396  2,930     84.5%     11,333       3    25%
anchored_checkpoint        43,487  2,956     83.4%     10,845       2   100%

stub summary sample: SUMMARY: DECISION: pin CUDA a recent version
```

**What to notice.**

- *Fewest tokens is not cheapest.* Masking one old observation per step reads the fewest tokens (35K) but is the most expensive policy (24,439 units), because each edit lands inside the cached prefix and drops the hit rate to 34%. Masking the same observations in batches keeps 85% hits and costs 45% less.
- *Naive summarization is cheap and wrong.* It reaches 25% recall: summarizing the goal along with history turned "CUDA 12.4" into "a recent version" and lost the tests/ constraint and the log path, exactly L3's drift chain.
- *Anchoring fixes recall at almost no cost.* Protecting the head (system prompt and goal), re-attaching exact decisions and keeping evidence pointers restores 100% recall while being the cheapest policy here.
- *Compaction count matters.* The anchored policy compacted twice versus three times for the naive one, because its checkpoint kept the right information and the budget was hit less often.
- *Swap the stub for a real model* and the harness stays the same. Recall should then be measured with probe questions to the agent, not string matching, as in M8.

### Example 3: Sizing the context policy for a 50-step coding agent

This walkthrough chooses a compaction band and estimates cost, memory and latency for one realistic deployment, using only the formulas above. Assume a coding agent with a 6K-token prefix, 5K tokens of growth per step and 50 steps per task (close to Manus's reported average of about 50 tool calls). It runs either on an API priced like L3's Claude Opus 5 row or self-hosted on a Llama-3-70B-class model with a 128K window on one 8×H100 node.

**Step 1: Is the naive transcript even feasible?** From M1, the last call would read 6K + 49 × 5K = 251K tokens. That exceeds a 128K window, so the naive agent crashes around step 25. Even on a 1M-token model it would sit far beyond the effective context most models show on RULER-style tests.

**Step 2: Pick the band from effective context, not the advertised window.** Suppose your own long-context evaluation (section 8) shows accuracy holding to about 64K on your task mix. Set B\_max = 64K as the compaction trigger and B\_min = 16K as the target after compaction. From M7, compaction happens about every (64K − 16K) / 5K ≈ 10 steps, so about four times per task. That is few enough to keep cache disruption and drift manageable.

**Step 3: Price it.** Running the Example 1 simulator with 50 calls gives:

| Policy | Input tokens | Peak context | Cost per task |
| --- | --- | --- | --- |
| No cache, no compaction | 6.43M | 251K | $32.63 (infeasible at 128K) |
| Prefix cache only | 6.43M | 251K | $5.16 (infeasible at 128K) |
| Prefix cache + compaction band 64K → 16K | 1.83M | 61K | $4.57 |

Caching is the big money lever (6.3×). Compaction is the feasibility and quality lever: it cuts peak context 4× and input tokens 3.5×, but saves only about 11% more money because re-reading cached tokens was already cheap.

**Step 4: Self-hosted memory.** At 320 KiB per token, a session at the 61K peak holds about 18.6 GiB of KV, and about 12 GiB at the 40K average. The node has about 406 GiB left after weights and a 10% reserve. That is about 21 sessions if all sit at peak, and about 33 on average, because PagedAttention allocates blocks on demand. Without compaction, 128K sessions would allow only 10.

**Step 5: Latency.** With a prefix-cache hit, each call prefills only the new 5K tokens: about 2 × 70B × 5K = 7 × 10¹⁴ FLOPs. At an assumed 40% utilization of 8 × \~1,000 TFLOPs, that is roughly 0.2 s of TTFT. A cache miss on a 60K prompt costs roughly 12× more, about 2.6 s, on every call that misses. Over 50 calls, cache misses alone would add about two minutes of waiting per task.

**Step 6: Decide the details.** Protect the system prompt and goal (never compacted, so always cached). Compact at turn boundaries with a structured checkpoint and exact anchors (M7). Truncate any single tool result above, say, 4K tokens at ingestion, writing the full output to a file and keeping the path. Route each session sticky to one worker so its prefix stays hot. Then run the M8 evaluation at compaction points 1, 2 and 4 before shipping.

**What to notice.**

- The effective-context measurement, not the price sheet, set the most important parameter (B\_max).
- Caching and compaction solve different problems: caching fixes cost, compaction fixes feasibility, memory and accuracy.
- On self-hosted hardware, compaction doubles or triples concurrency because KV memory, not compute, limits batch size.
- Latency is dominated by cache misses. A harness bug that breaks the prefix (a timestamp in the system prompt) shows up first as slow TTFT, then as a bigger bill.

## Design patterns, pitfalls and checklist

Most context problems in production agents come from a handful of harness decisions, so a small set of named patterns covers most of the design space. Each pattern below says when to use it; the table then maps common failures to their symptoms and fixes.

### Patterns

- **Stable head, append-only tail.** Keep system prompt, tool schemas and examples byte-identical for the whole session, and only ever append. *Use always*; it is the precondition for prefix caching (L3's "stabilize the prefix, append changing state").
- **Mask, don't remove.** Keep the full tool list in the prompt and restrict availability by constrained decoding or a short state note at the end. *Use* when tool availability changes mid-task (Manus).
- **Truncate at ingestion.** Cap each tool result to head + tail lines with an "N lines omitted, full output at PATH" note. *Use* for logs, test output, HTML and file listings, the 37% slice of L3's breakdown.
- **Observation masking.** Replace old observations with a one-line placeholder while keeping actions and reasoning. *Use* as the default first compaction step for coding agents; it matched LLM summarization at half the raw cost in SWE-agent experiments. Mask in batches to protect the cache.
- **Anchored checkpoint compaction.** When the budget trips, replace the older middle with a structured checkpoint, re-inserting goal, constraints and identifiers verbatim from an anchor store. *Use* for long tasks that exceed the effective context even after masking.
- **Externalize with pointers.** Write large evidence to files or a store and keep only paths, URLs or query strings in context (L3's evidence store; MemGPT; Manus's file system as context). *Use* whenever an observation might be needed later but not now.
- **Recitation.** Rewrite a short plan or todo list at the end of context every few steps. *Use* on long tasks where early goals risk getting lost in the middle.
- **Sub-agent isolation.** Run exploration-heavy, separable subtasks in a fresh context and return a 1–2K-token report. *Use* for parallel search or reading; avoid for tightly coupled edits (L5's handoff warning).
- **Progressive disclosure.** Load names and descriptions first and bodies on demand (L4's skills). *Use* for large tool sets, skills and documentation.
- **Cache-aware routing and sticky sessions.** Route a session's calls to the worker holding its prefix, trading match length against queue length. *Use* when self-hosting with several replicas.

### Failure modes

| Failure | Symptom | Likely cause | Fix |
| --- | --- | --- | --- |
| Cache hit rate collapses | TTFT and bill jump; cached-token count near zero | Timestamp or request ID in system prompt; tool list reordered; non-deterministic JSON | Move volatile data to the end; sort keys; freeze tool order; alert on hit rate |
| Constraint forgotten after compaction | Agent violates an early rule ("never edit tests/") | Goal summarized along with history | Protect the head; keep an anchor store and re-insert verbatim |
| Repeated-compaction drift | Values become vaguer each cycle (12.4 → 12.x → recent) | Summary of a summary, ŝₖ₊₁ = C(ŝₖ ⊕ Rₖ) | Copy anchors from source, not from the last summary; test stability over repeated compactions |
| Lost in the middle | Agent ignores evidence it retrieved earlier | Context past the effective length; key fact buried mid-context | Lower the compaction threshold; recite key facts at the end |
| Tool call orphaned | Provider error or confused agent after compaction | Cut between a tool call and its result | Compact only at valid turn and tool boundaries |
| One giant observation | Context jumps by 50K+ in one step; overflow | Unbounded tool output (full log, whole file) | Truncate at ingestion; externalize to disk |
| Compaction thrash | Compaction every step or two; cost rises | Band too narrow or checkpoint too large | Widen the B\_min–B\_max band; cap checkpoint size |
| Premature commitment after compaction | Agent acts on a summarized conclusion without re-checking (L5's vendor D) | Summary kept facts but not open questions | Include open questions and alternatives in the checkpoint schema |
| Sub-agent report loses detail | Parent re-does work or makes a wrong edit | Handoff is a lossy summary | Require structured reports with evidence paths; let the parent re-read sources |
| KV memory exhaustion | Requests queue or get preempted; throughput falls | Many long sessions; no paging | PagedAttention; GQA/MLA or FP8 KV; lower compaction threshold |

### Builder's checklist

- [ ] System prompt and tool definitions are byte-identical across calls in a session (no timestamps, sorted keys, fixed tool order).
- [ ] The transcript is append-only between compactions.
- [ ] Cached-token counts, hit rate and TTFT are logged per call, with an alert on sudden drops.
- [ ] Every tool result has an ingestion cap, and truncated output is saved to a path the agent can read.
- [ ] Old observations are masked in batches, not one per step.
- [ ] Compaction triggers before overflow, leaving room for the next output.
- [ ] The compaction threshold is set from measured effective context on your tasks, not the advertised window.
- [ ] Compaction cuts only at valid turn and tool-call boundaries.
- [ ] Goal, constraints and identifiers are kept verbatim in an anchor store and re-inserted after each compaction.
- [ ] Checkpoints are structured (goal, constraints, decisions, open questions, identifiers, next action) and validated.
- [ ] The full uncompacted history is saved and searchable for recovery.
- [ ] Failure behaviour for compaction itself is defined (retry, hard truncate or reset).
- [ ] Sub-agents are used only for separable subtasks and return structured, evidence-linked reports.
- [ ] Compaction is evaluated with plant → compact → continue, reporting state recall, task success, cost per solved task and stability over repeated compactions.
- [ ] Self-hosted serving uses paged KV, prefix caching and sticky or cache-aware routing.

### Patterns and pitfalls from L12–L15

The new lectures add patterns at three levels: the harness (L14), the trainer (L12) and the workflow (L15).

- **Non-destructive condensation (a view over a log).** Keep an append-only event log, derive the model's view from it, and record each compaction as an event. Use it in any harness that must resume, be audited or feed RL training (L14, section 13).
- **Evidence over memory.** Let summaries point to files, tests and trackers the agent can re-read. Write conversation-only facts, such as a user constraint or a one-off failure, to a file before they age out of the tail (L14).
- **Append, don't splice.** Load triggered skills, path rules and late instructions into the tail (a user message or tool result), never into the system prompt mid-run (L14, section 14).
- **Chunky condensation.** Trigger on a size threshold with a target well below it (OpenHands uses half of `max_size`), so rewrites are rare and the cache stays warm between them (M9).
- **Token-faithful trajectories.** Record token IDs and log-probs at the inference proxy and train on exactly those; use a renderer that preserves sequence extension (L12, section 12).
- **Compaction interval as a training knob.** In RL, choose the interval from timing metrics: compact more often when rollout-bound, less often when trainer-bound (L12).
- **Per-node context from typed state.** For a known procedure, store raw data in typed state, format each node's prompt from the fields it reads, and checkpoint at node boundaries (L15, section 15).
- **Reducer discipline.** Let keys overwrite by default; give an append reducer only to a field some node needs in full, and pair it with a trimming step (L15).

| Failure | Symptom | Fix |
| --- | --- | --- |
| Conversation-only fact condensed away | After a condensation the agent forgets a user constraint or a failing test (the L14 sheet's CRLF exercise) | Write such facts to a notes file or the task tracker; make the final check run the full test suite |
| Restored history, lost workspace | The resumed history says a file was edited, but the file is unchanged | Persist the workspace with the conversation, or re-verify from disk after restore; L14 calls workspace persistence "a separate concern" |
| Condenser thrash | Condensations every one or two steps, many turns without an action, low cache hit rate | Raise `max_size`, keep the target at about half, or switch to a token trigger (M9) |
| Summary-of-summary drift | Versions, paths or IDs degrade over many condensations | Keep anchors in the protected head or a pinned file; summarize from raw events where possible (section 9) |
| Template strips past reasoning | Each RL turn becomes a new datum; trainer tokens and cache misses jump | Use a renderer that preserves sequence extension (L12) |
| String round-trip in RL | `importance_weight_max` spikes on a few tokens | Pass token IDs end to end (TITO, L12) |
| Stale KV after a weight sync | Rollout and trainer log-probs disagree | Flush the cache on update, or correct off-policy and track staleness (L12, section 11) |
| Append reducer on a messages key | Workflow prompts grow every turn; late nodes get slow and costly | Overwrite by default; pass each node only the fields it needs (L15) |
| Field never written to state | A node's output ignores what another step found (the drafter cites no policy) | Unit-test nodes with explicit inputs and review the schema (L15) |

- [ ] The full trajectory is an append-only log, and each compaction is an event that records what it forgot.
- [ ] `keep_first` covers the system prompt and the task, and conversation-only constraints are written to a file the agent re-reads.
- [ ] Triggered skills and late instructions are appended to the tail, never spliced into the system prompt.
- [ ] RL rollouts travel as token IDs with log-probs, and the chat template preserves sequence extension.
- [ ] Each workflow node's prompt is built only from the state fields it reads, and every append reducer is justified.
- [ ] After a resume, the agent re-checks workspace state instead of trusting the restored history.

### Patterns and pitfalls from L17–L18

L18 adds context patterns for systems with several agents. L17 adds none specific to this topic.

- **Delegate to keep windows short.** Give exploration-heavy subtasks to subagents and return only results. RAO at 8K context reaches 0.95 success against 0.24 for one stream.
- **Admit gists, not trajectories.** Keep each agent's full trajectory private and admit only a compressed, typed entry to the shared record (DeLM's "compress + admit").
- **Append-only, typed shared context.** Never edit or delete board entries. Types (FACT, FAIL, DONE on the DeLM page) let an agent read only what it needs.
- **Claim before working.** A public task queue that marks the owner stops two agents spending context on the same task.
- **Share verified progress.** Post a test passed or a level reached, not a claim (Park et al.).

| Failure | Symptom | Fix |
| --- | --- | --- |
| Lossy return | Parent re-asks or decides wrongly; the reason a child rejected an option is gone | Return a structured result with key reasons and identifiers, not only the last message |
| Parent as relay | Agents idle while results pass through one parent (44% waiting in DeLM's hierarchical run) | Let peers read results from a shared board |
| Board bloat | Every agent re-reads a growing board; costs rise and the board crowds out task context | Token budget on the board (DeLM keeps under 15K tokens with four agents); compress old entries |
| Poisoned board | An unverified FAIL or FACT makes other agents skip or repeat work | Require evidence on entries; re-check cheaply before relying on one |
| Splitting coupled work | Subagents make conflicting implicit decisions | Keep one agent with good compaction for tightly coupled tasks (L14, Cognition) |

- [ ] For each subagent, write down what it sees, what it returns, and in what format.
- [ ] Make shared boards append-only, typed and token-budgeted.
- [ ] Keep the board's old entries byte-stable so re-reads hit the prefix cache.
- [ ] Compare against a strong single agent and against independent pass@k before adding communication.

### Patterns and pitfalls from L21

L21 adds patterns for inputs too long to read and for searches that write themselves into the context.

- **Prompt as a variable.** Load a long input into a REPL and let the model inspect it with code; only printed slices and results enter the window (RLM).
- **Recurse on snippets, return structure.** Send selected chunks to child calls with a focused question and combine their structured returns in code, not in prose.
- **Pick depth per task.** One level of recursion often suffices; on CodeQA depth 3 fell to 44% from 66% for the REPL alone.
- **Budget the search trace.** When search is serialized into the context (SoS), failed branches stay in the window; penalize extra expansions (APA) or train on shorter traces (Searchformer).
- **Short imagined horizons.** Keep world-model lookahead to one step unless predictions are accurate; WebDreamer's best horizon was 1.

| Failure | Symptom | Fix |
| --- | --- | --- |
| Reading the whole input | Fails on pairwise or aggregate questions even when the input fits (0.1 F1 for direct GPT-5 on 32K-token OOLONG-Pairs) | Keep the input in a REPL; let code enumerate records and delegate judgments in batches |
| Over-recursion | Accuracy drops and calls multiply as depth grows | Start with REPL only or depth 1; add depth only where it measurably helps |
| Delegating a sequential task | Wall-clock time explodes with no parallel gain (RAO on DeepDive: 13.3 s → 233.0 s) | Delegate only independent branches; keep dependent steps in one context |
| Trace overflow | A serialized search hits the window before it finds a solution | Penalize expansions, cap depth, or move search state out of the prompt into code |

- [ ] For a long input, try REPL-plus-code before compaction, and compare against an offloading harness.
- [ ] Make child calls return structured fields that code can merge.
- [ ] Measure accuracy and wall-clock time at each recursion depth.
- [ ] Count tokens per search branch or imagined step before deepening a search.

## Landscape

The tables below collect the systems, models, benchmarks and methods that matter for context engineering, newest first within each table, with numbers only where a lecture or primary source states them.

### Serving and caching systems

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| Can I Buy Your KV Cache? (2026) | Study of amortizing one prefill across many readers | Per-call cost falls toward a reuse-step floor as readers increase | L3 |
| Provider prompt caching (Anthropic, OpenAI, DeepSeek, Z.AI, Kimi) | API-level prefix caching | Cached input about 10% of regular input on most L3 rows; Anthropic writes cost 1.25× (5 min) or 2× (1 h); OpenAI automatic from 1,024 tokens | L3; provider docs |
| SGLang v0.4 cache-aware router | Load balancer scoring reusable prefix minus queue penalty | Example: 18K match with queue 2 vs 2K match with queue 0 | L3 |
| DistServe (OSDI 2024) | Disaggregated prefill and decode on separate GPUs | 7.4× more requests or 12.6× tighter SLO; >90% of requests within TTFT/TPOT limits | L3; arXiv 2401.09670 |
| Sarathi-Serve (2024) | Chunked prefill interleaved with decode | Reduces prefill–decode interference without separate GPUs | arXiv 2403.02310 |
| SGLang / RadixAttention (2023) | Radix-tree prefix cache with LRU leaf eviction | Up to 6.4× throughput on agent, reasoning and chat workloads | L1, L3; arXiv 2312.07104 |
| Prompt Cache (MLSys 2024) | Reusable attention states for declared prompt modules | TTFT 8× lower on GPU, 60× on CPU | L3; arXiv 2311.04934 |
| vLLM / PagedAttention (SOSP 2023) | Block-table KV allocation, prefix sharing, copy-on-write | Near-zero KV waste; 2–4× throughput vs FasterTransformer and Orca | L1, L3; arXiv 2309.06180 |
| Ring Attention (2023) | Exact attention split across devices in a ring | Memory O(n·dₖ/P) per device; total work still O(n²·dₖ) | L3; arXiv 2310.01889 |
| FlashAttention (2022) | IO-aware tiled exact attention | Removes n² memory; FLOPs unchanged | arXiv 2205.14135 |

### Long-context model designs (from L3's 2026 tables)

| Model | Architecture (local : global) | Position method | Context path |
| --- | --- | --- | --- |
| Qwen3.8-Flash-Next | Gated DeltaNet + QSA sparse retrieval, 36 : 12 | Partial RoPE | 262K native, YaRN to 1M |
| GLM-5.3-Flash | KDA + DSA/IndexPool, 34 : 11 | NoPE in main attention | 1M native |
| Kimi K3 | KDA + dense gated MLA, 69 : 24 | NoPE | 8K → 64K → 256K → 1M |
| Nemotron 3 Ultra | Mamba-2 + dense GQA, 48 : 12 | Implicit order in Mamba | 1M CPT (33B tokens); SFT to 512K |
| Inkling-Small | 512-token window + dense GQA, 35 : 7 | Relative position embedding | 1M |
| DeepSeek-V4 / V4-Pro-0813 | 128-token window branch + compressed sparse/dense | Partial RoPE | 4K → 16K → 64K → 1M + YaRN |
| Kimi Linear (2025) | KDA + MLA hybrid, 48B total / 3B active | — | Up to 75% less KV; up to 6× decode throughput at 1M |
| DeepSeek-V2 (2024) | MLA + MoE, 236B total / 21B active | Decoupled RoPE | 128K; KV 93.3% smaller than DeepSeek 67B; 5.76× max throughput |

### Long-context benchmarks

| Benchmark | What it tests | Key finding | Source |
| --- | --- | --- | --- |
| NoLiMa (2025) | Needle retrieval without lexical overlap | 11 of 13 models below 50% of short-context baseline at 32K; GPT-4o 99.3% → 69.7% | arXiv 2502.05167 |
| Context Rot (Chroma, 2025) | 18 models on simple tasks as input grows | Performance grows increasingly unreliable with length | trychroma.com |
| BrowseComp (Tongyi DeepResearch) | Web research with a context budget | Accuracy rises as context grows 8K → 128K | L10 |
| RULER (2024) | 13 synthetic tasks incl. multi-hop tracing, aggregation | 17 models; only half of those claiming 32K+ satisfactory at 32K | arXiv 2404.06654 |
| Lost in the Middle (2023) | Multi-document QA by evidence position | U-shaped accuracy; middle positions worst | arXiv 2307.03172 |
| Needle in a Haystack (Kamradt, 2023) | Single fact at varying depth and length | GPT-4-128K degrades beyond \~73K–100K at 10–50% depth | L3 |

### Harness-level context management

| Method | Idea | Key result | Source |
| --- | --- | --- | --- |
| Anthropic context engineering guide (2025) | Compaction, tool-result clearing, note-taking, sub-agents, just-in-time retrieval | Sub-agents return about 1,000–2,000 tokens | anthropic.com |
| The Complexity Trap (2025) | Observation masking vs LLM summarization in SWE-agent | Masking halves cost vs raw agent and matches summarization; hybrid saves 7–11% more | arXiv 2508.21433 |
| ReSum (2025) | Periodic summarization for web agents, plus ReSum-GRPO | +4.5% over ReAct training-free; +8.2% more with training | L3; arXiv 2509.13313 |
| Manus lessons (2025) | Production rules: KV-cache hit rate, masking tools, file system as context, recitation | 100:1 input-to-output; \~50 tool calls per task; 10× cached vs uncached price | manus.im |
| Anthropic multi-agent research (2025) | Lead agent plus parallel sub-agents | +90.2% vs single agent on internal eval; \~15× chat tokens | anthropic.com |
| LongLLMLingua (2023) | Question-aware token-level prompt compression | Up to +21.4% on NaturalQuestions with \~4× fewer tokens | L3; arXiv 2310.06839 |
| MemGPT (2023) | OS-style paging between context and external memory | Externalize and retrieve on demand | L3; arXiv 2310.08560 |
| OpenHands, Codex, OpenCode, Pi, Hermes | Production harnesses with compaction policies | 77,922 mean tokens per OpenHands session (1,500 sessions) | L3 |

### Added with L12–L15

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [OpenHands `LLMSummarizingCondenser`](https://docs.openhands.dev/sdk/arch/condenser) | Event-sourced condenser: keeps `keep_first` head events and a recent tail, summarizes the middle, records a `Condensation` event | Up to 2× lower per-turn API cost; 54% vs 53% solve rate on a SWE-bench Verified subset ([blog](https://openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents)) | L14 |
| [OpenHands skills](https://docs.openhands.dev/sdk/guides/skill.md) | Always-on, keyword-triggered, path-triggered and progressively disclosed instruction fragments | Triggered content is injected into the user message, not the system prompt | L14 |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph) | Workflow graphs over typed shared state, with reducers, checkpointers, retries and interrupts | Checkpoints at node boundaries; keys overwrite unless a reducer is set | L15 |
| SGLang RadixAttention and vLLM Automatic Prefix Caching in RL samplers | Prefix caches shared across a GRPO group and across turns | Llama-3-8B bf16: 128 KB KV per token, about 4 GB per 32K-token trace | L12 |
| [SGLang](https://docs.sglang.ai/) weight-update and `pause_generation` modes | `abort`, `retract` or `in_place` running requests during a weight sync; `flush_cache` on update | Cache is warm within a policy version, cold after a sync | L12 |
| [Snowflake ZoRRo (Arctic RL)](https://www.snowflake.com/en/developers/guides/arctic-rl-unified-post-training-backend/) | Trainer-side deduplication of shared prompt tokens | 80–95% duplicate prompt tokens; up to 6× faster actor updates | L12 |
| [AReaL-DTA](https://arxiv.org/abs/2602.00482) | Prefix-tree training with a depth-first walk | τ²-bench rollouts compress 9.43×; up to 8.31× vs dense training | L12 |
| [Tinker sequence extension](https://tinker-docs.thinkingmachines.ai/rl/sequence-extension) and [Miles TITO](https://lmsys.org/blog/2026-05-13-no-token-left-behind) | Renderers that keep exact prefixes; token-in, token-out rollouts | O(T) instead of O(T²) training compute when extension holds | L12 |
| [Agent Lightning](https://arxiv.org/abs/2508.03680) middleman | Proxy that emulates inference APIs for any harness and logs token IDs and log-probs | Zero harness code changes | L12 |
| Docent and Hodoscope | Trajectory review by paired comparison, or by summarizing and embedding actions | Docent explained 108 failed Terminal-Bench runs; see T13 | L15 |

### Added with L17–L18

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [RAO](https://arxiv.org/abs/2605.06639) at 8K context | Recursive `launch_subagent` delegation, trained with RL | 0.24 → 0.95 success overall, 0.0 → 0.88 on hard tasks; recursive 8K tracks single-agent 40K in training | L18 (slide 13) |
| [DeLM](https://yuzhenmao.github.io/DeLM/) | Decentralized agents with a public task queue and an append-only, typed shared context | 29.3 vs 162.7 min (2% vs 44% waiting) against Claude Code subagents on one Terminal-Bench task; log under 15K tokens with four agents (project page) | L18 (slides 19–21) |
| [Blackboard system](https://arxiv.org/abs/2510.01285v2) (Salemi et al.) | Main agent posts requests; helper agents volunteer answers on a response board | 13–57% relative gain in end-to-end success on KramaBench, DSBench and DA-Code variants (paper) | L18 (slide 18) |
| [CAID](https://arxiv.org/abs/2603.21489) | Manager DAG, JSON messages and Git worktrees for isolated parallel coding agents | +25.6 points on PaperBench and +14.7 on Commit0 over single-agent baselines (arXiv v2) | L18 (slides 16–17) |

### Added with L21

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [Recursive Language Models](https://arxiv.org/abs/2512.24601) (RLM) | Long input held as a REPL variable; root LM inspects it with code and calls sub-LMs on snippets | GPT-5 root: BrowseComp-Plus (6–11M tokens) 70.5% compaction, 88.0% REPL, 91.3% depth 1 (OpenCode + offload 94.0%); OOLONG-Pairs (32K) 0.1 → 76.0 F1 at depth 3 | L21 (slides 57–60, 90) |
| [RAO](https://arxiv.org/abs/2605.06639) at 256K context | Learned recursive delegation with one shared policy | TextCraft-Synth 73% → 96%; Oolong-Real 0.203 → 0.320; DeepDive 24% → 40% but 13.3 s → 233.0 s | L21 (slides 61–64) |
| [Stream of Search](https://arxiv.org/abs/2404.03683) | Search serialized into the token stream, failed branches included | 250M model, 4,096-token context; 51.27% vs 25.73% for optimal-path training on Countdown | L21 (slides 27–32) |
| [WebDreamer](https://arxiv.org/abs/2411.06559) horizons | LLM-imagined web pages used for lookahead | 26% reactive, 37% at horizon 1, 32% at horizons 2–3 (GPT-4o, Online-Mind2Web) | L21 (slide 50) |

## Open problems

The core open problem is that nobody yet knows how to give an agent a working memory that is at once exact, cheap and unbounded; every current technique gives up one of the three. The directions below are where the course lectures and recent papers point.

**1. Closing the gap between advertised and effective context.** Windows have reached 1M tokens, yet RULER and NoLiMa show sharp degradation at 32K on harder-than-lookup tasks. It is hard because the causes interact: under-trained positions, attention dilution across many near-duplicate distractors, and scarce training data whose answers truly depend on distant evidence. L3's shared data recipe (coherent long sources, distant-evidence tasks, progressive length) is a start, but there is no agreed benchmark that looks like a real agent transcript.

**2. Hybrid architectures that keep exact recall.** L3's 2026 models converge on roughly 3:1 local-to-global hybrids. What stays unclear is how few global layers are enough, where they should go, and which tasks silently fail when recurrent layers compress away a detail. It is hard because fixed-size states trade recall for efficiency by construction, and standard benchmarks rarely probe the exact-copy behaviour agents need (file paths, version numbers, IDs).

**3. Learned compaction that is trained end to end.** Most harnesses compact with a prompted summarizer that never sees whether its summary helped. ReSum-GRPO shows that training the agent to continue from summaries helps (+8.2%), and L5's RAO trains delegation. Training the compactor itself on downstream reward is harder: credit assignment spans many steps, and the target behaviour changes as the policy changes.

**4. Drift and stability over many compactions.** L3's CUDA example shows that recursive summaries lose precision. Anchoring fixes known anchors, but agents also create new constraints mid-task that nobody has marked as anchors. Deciding automatically which new facts are load-bearing is essentially the "what matters" problem L4 says the context window cannot solve by itself.

**5. Caching versus editing the context.** Prefix caching rewards append-only transcripts, while compaction and masking rewrite the middle. Techniques that reuse KV for non-prefix segments (Prompt Cache's modules hint at this) could reconcile the two. It is hard because a token's KV depends on everything before it, so reuse after an edit is approximate and needs correction or retraining.

**6. Evaluating compaction properly.** L3's continuation-based evaluation is the right idea, but there is no shared dataset of trajectories with planted state and ground-truth continuations. Agent runs are noisy, so detecting a 2-point success difference needs many runs. And cost per solved task depends on provider pricing, which changes monthly (L3's prices carry a date for this reason).

**7. When to delegate.** Sub-agents isolate context but multiply tokens (about 15× chat in Anthropic's report), and L5 warns that handoffs drop context. There is no principled rule for when isolation pays off. RAO learns delegation depth from reward, but only on its task distribution. Coupled subtasks (L5's "global state" open problem) resist both decomposition and longer context.

**8. Serving economics for agent traffic.** Agent workloads are long-input, short-output and bursty, with long idle gaps during tool execution. Keeping KV warm across a 30-second test run costs memory; evicting it costs a re-prefill. Tiered KV storage (GPU, CPU, SSD), cross-request sharing and the market questions raised by "Can I Buy Your KV Cache?" are active areas. They are hard because the right policy depends on tool latency, reuse probability and hardware prices at once.

**9. Visual and multimodal context.** L7's computer-use agents add a screenshot per step, each worth many tokens. Deciding which past screenshots to keep, downsample or replace with text descriptions is largely unexplored. It is hard because visual details that look irrelevant (a small error banner) may matter three steps later.

**10. Training through compaction.** Condensation lowers inference cost (L14), but it breaks sequence extension, so the RL trainer sees several datums per trajectory and pays again for the task and summary tokens (L12). Worse, summary tokens carry no direct loss, yet their quality decides later rewards. Whether the summarizer should be trained jointly with the policy, and how to assign credit across a condensation boundary, is open; L12's complex-harness slide and RAO point at the same tree-of-sequences problem for sub-agents.

**11. Deciding what each workflow node sees.** L15 makes information flow explicit but leaves it manual: the developer chooses every field a node reads. No standard method checks that a node received everything it needs, so a missing field fails silently. When a fixed node should become a small agent loop with its own transcript, and how much context that loop should return to state, is also unsettled.

**12. Compacting trajectories for reviewers.** L15's closing point is that agents produce more context than a person can review in full. Docent and Hodoscope compress trajectories into explanations or action summaries, which inherits the compaction risk of section 9: the one suspicious action may not survive the summary. Hodoscope's example, where a judge needed a hint to flag Git-history peeking, shows the gap. T13 covers these monitors.

**13. What to admit into shared context.** L18's DeLM compresses each result into a typed entry and keeps the shared log small (under 15K tokens with four agents, per its project page). Nobody yet knows the right admission rule for larger teams or longer runs. Admit too much and every agent re-reads a bloated board; admit too little and peers repeat work or miss a FAIL. Park et al. add that only verified progress should be shared, but most agent work has no cheap verifier. Admission, eviction and verification for a shared board are the single-agent compaction problem again, now with concurrent writers.

## Glossary

These terms are used throughout the sheet; each definition is the sense used here.

| Term | Meaning |
| --- | --- |
| Activation checkpointing | Trainer technique that stores few activations and recomputes the rest in the backward pass; the mirror image of KV caching (L12: about +33% compute for full recompute). |
| Anchor | A fact that must survive compaction verbatim, such as the goal, a constraint, a version number or a file path. |
| Attention sink | Early tokens that absorb large attention weight; keeping their KV stabilizes window attention (StreamingLLM). |
| Blackboard | Shared board where one agent posts requests and other agents volunteer answers, often on a separate response board; agents need not know who is competent (Salemi et al., L18). |
| Block table | PagedAttention's per-request map from logical KV blocks to physical GPU memory blocks. |
| Cache-aware routing | Sending a request to the worker that holds the longest matching prefix, penalized by that worker's queue. |
| Checkpointer | Workflow component that saves graph state and the next node at each node boundary, so a run can resume under the same execution or thread ID (L15). |
| Claim marker | Label on a public task queue naming the agent working on a task, so no two agents spend context on the same task (DeLM, L18). |
| Compaction | Replacing part of the history with a shorter working state so the agent can continue within budget. |
| Condensation event | OpenHands log entry holding the forgotten event IDs, the summary and its offset; the model's view is rebuilt by applying it to the log (L14). |
| Condenser | Harness component that rewrites the model's view when history grows too long; LLMSummarizingCondenser keeps keep\_first head events and a recent tail and summarizes the middle (L14). |
| Context isolation | Running a subtask in its own fresh context and returning only its result, so the parent's window grows by the result alone (sections 10 and 16; RAO, L18). |
| Context offloading | Keeping large inputs or results in files or variables outside the prompt and reading back only what is needed; OpenCode + offload scored 94.0% on BrowseComp-Plus (L21). |
| Continuation-based evaluation | Plant state, compact with the production policy, continue the run and measure later decisions (L3). |
| Decode | Generating output one token per step; memory-bandwidth-bound. |
| Delta rule | Linear-attention update that writes only the error between the stored prediction and the new value (DeltaNet). |
| Disaggregated serving | Running prefill and decode on separate GPUs and transferring the KV cache between them (DistServe). |
| Effective context | The length up to which a model still uses evidence reliably on a task, usually below the advertised window. |
| Event log | Append-only record of every message, action, observation and condensation; the conversation's single source of state in OpenHands (L14). |
| GQA | Grouped-query attention: groups of query heads share one key/value head, shrinking the KV cache. |
| KV cache | Stored keys and values of all previous tokens in every layer, reused so decode need not recompute them. |
| Linear attention | Attention without softmax normalization, rewritten as a fixed-size recurrent state updated per token. |
| MLA | Multi-head latent attention: caches one compressed latent per token and reconstructs per-head K and V. |
| Needle in a haystack | Test that hides one fact at a chosen depth in long filler text and asks the model to retrieve it. |
| NoPE | No explicit position encoding; order comes from the causal mask or recurrent layers. |
| Observation masking | Replacing old tool results with a short placeholder while keeping actions and reasoning. |
| PagedAttention | vLLM's allocation of the KV cache in fixed-size blocks, like virtual-memory pages. |
| Position interpolation | Extending RoPE by dividing all rotation frequencies by the extension factor s. |
| Prefill | Processing all prompt tokens in one parallel pass to build the KV cache; compute-bound. |
| Prefix caching | Keeping a prompt's KV after a call so later calls sharing the same prefix skip its prefill. |
| Prefix sharing | Trainer-side reuse of a repeated prefix, computed once forward and backward with a tree attention mask (L12). |
| RadixAttention | SGLang's radix-tree prefix cache with match, split and LRU leaf eviction. |
| Recursive Language Model (RLM) | Inference scheme in which the prompt is a variable in a persistent REPL; the root LM inspects it with code and calls sub-LMs (possibly RLMs) on selected snippets (Zhang, Kraska & Khattab; L21). |
| Reducer | Function that merges a node's update into a state key; by default the update overwrites, while operator.add or add\_messages accumulates (LangGraph, L15). |
| RoPE | Rotary position embedding: rotates queries and keys by position so scores depend on relative offset. |
| Sequence extension property | Each turn's input contains all earlier turns' tokens as an exact prefix, so a trajectory trains as one datum at O(T) rather than O(T²) cost (L12). |
| Serialized search trace | A whole search, including failed branches and backtracking, written into the token stream; its length grows with the search and is bounded by the window (Stream of Search, Searchformer; L21). |
| Shared context (multi-agent) | Append-only, typed board that every agent reads; each agent's result is compressed and admitted as a short entry (DeLM's FACT, FAIL, DONE; L18). |
| Shared state | Typed object passed between workflow nodes; each node reads the fields it needs and returns the fields it changes (L15). |
| Sliding-window attention | Each query attends only to the previous w tokens, making cost O(nw). |
| TITO | Token-in, token-out: passing token IDs, not strings, from sampler to trainer so the trainer scores exactly the sampled tokens (L12). |
| TTFT / TPOT | Time to first token (arrival to first output) and time per output token (gap between outputs). |
| YaRN | Frequency-selective RoPE interpolation with an attention-temperature correction, 1/τ = 0.1 ln s + 1. |

## Practice questions

The questions move from recall to calculation and design; try each before reading the answer.

1. What are the two long-context challenges L3 distinguishes, and which techniques address each? **Answer:** Capacity (can the model use the needed evidence?) and efficiency (can the system afford to serve it?). Architecture, position encoding and long-context training shape capacity, and evaluation measures it. Attention cost, KV memory, caching and compaction shape efficiency. Compaction touches both, because it also removes distractors.
2. In L3's breakdown of 1,500 OpenHands sessions, which component takes the largest share of tokens, and why does that matter? **Answer:** Tool results, at 37% of a mean 77,922-token session. They are also the most compressible part: old logs and file dumps rarely need to be re-read verbatim. That makes truncation at ingestion and observation masking the cheapest first levers.
3. Why is prefill compute-bound and decode memory-bandwidth-bound? **Answer:** Prefill pushes all prompt tokens through each layer at once, so each weight byte loaded is used for thousands of multiply-adds. Decode produces one token per step, so each step must read all weights and the whole KV cache to do only a little arithmetic per byte. Faster memory helps decode; more FLOPs help prefill.
4. An agent has a 4K-token prefix and adds 3K tokens per step. How many input tokens does it read over 20 calls? **Answer:** N = T·P + Δ·T(T−1)/2 = 20 × 4K + 3K × 20 × 19 / 2 = 80K + 570K = 650K tokens. The last call alone reads 4K + 19 × 3K = 61K. The quadratic term is almost 90% of the total.
5. Compute the KV cache for one 64K-token session of a model with 48 layers, 8 KV heads of dimension 128, stored in FP8. **Answer:** Bytes per token = 2 × 48 × 8 × 128 × 1 = 98,304 bytes = 96 KiB. Times 65,536 tokens gives 6,291,456 KiB = 6 GiB. In BF16 it would be 12 GiB.
6. Why does GQA speed up decode much more than prefill? **Answer:** GQA shrinks the number of stored K/V heads, so it cuts KV memory and the bytes read per decode step. It does not reduce the number of query heads, so attention FLOPs are nearly unchanged. Decode is bandwidth-bound and benefits; prefill is compute-bound and barely changes.
7. Why must cached KV be restricted to exact prefixes? **Answer:** A token's key and value depend on every earlier token through the previous layers, and on its absolute position. If any earlier token changes, every later KV entry would differ. So a block is valid only if all tokens before it match exactly, which is what hash chaining and radix trees check.
8. List three prompt-design mistakes that silently destroy prefix-cache hits, and the fix for each. **Answer:** A timestamp or request ID in the system prompt (move volatile data to the end). Adding or removing tool definitions mid-session (keep a fixed tool list and mask availability). Non-deterministic serialization such as unordered JSON keys (sort keys and use a fixed template). Measure cached tokens per call to catch all three.
9. Using L3's Claude Opus 5 prices, compare the input cost of a call with a 100K-token prompt of which 95K is cached versus uncached. **Answer:** Uncached: 100K × $5/M = $0.50. Cached: 95K × $0.50/M + 5K × $5/M = $0.0475 + $0.025 = $0.0725 (ignoring a separate cache-write charge). That is about 6.9× cheaper. The model still attends over all 100K tokens, so quality and KV memory are unchanged.
10. Show why linear attention needs no KV cache, and what it gives up. **Answer:** Without softmax normalization, oₜ = Σ(qₜᵀkᵢ)vᵢ = (Σkᵢvᵢᵀ)ᵀqₜ = Sₜᵀqₜ, with Sₜ = Sₜ₋₁ + kₜvₜᵀ. The state Sₜ is a fixed d\_k × d\_v matrix, so memory is constant in length. It gives up exact token-level retrieval, because all history is superimposed in that matrix; delta rules and gates reduce but do not remove the interference.
11. With RoPE base 10,000 and head dimension 128, why does a model trained at 4K struggle at 100K, and how does YaRN respond? **Answer:** The slowest dimension pair has wavelength about 2π × 10000^(126/128) ≈ 54K positions, so at 4K training it saw less than a tenth of a rotation. At 100K those pairs take unseen angles. YaRN interpolates such long-wavelength pairs fully, keeps short-wavelength pairs unchanged to preserve local order, blends the middle, and sharpens attention with 1/τ = 0.1·ln s + 1.
12. A model passes needle-in-a-haystack at 1M tokens. Why might it still fail an agent task at 60K? **Answer:** NIAH tests literal single-fact lookup, which lexical matching makes easy. Agent tasks need multi-hop reasoning over many near-duplicate observations and non-literal matches. RULER and NoLiMa show large drops on such tasks at 32K even for models advertising 128K+. Effective context must be measured on task-like evaluations.
13. Explain repeated-compaction drift with L3's formula and give two defences. **Answer:** Each new state is built from the previous summary plus new raw history: ŝₖ₊₁ = C(ŝₖ ⊕ Rₖ). Small paraphrase errors compound, as in "CUDA 12.4" → "12.x" → "recent" → missing. Defences: copy anchors verbatim from an anchor store rather than from the last summary, and keep pointers to source evidence so the agent can re-read the original.
14. In the Hands-on lab, why did masking one observation per step cost more than keeping the full history, and what fixed it? **Answer:** Each step's masking edited a message inside the cached prefix, so everything after it had to be re-prefilled; hit rate fell to 34% and price-weighted cost rose to 24,439 units versus 15,332. Masking in batches every 12 observations changed the prefix rarely, kept 85% hits and cost 13,522 units. Compaction should be infrequent and chunky.
15. Design a context policy for a deep-research agent that makes about 100 search calls, each returning 3K tokens, on a model with an effective context of about 64K. Include how you would evaluate it. **Answer:** Keep a stable head (instructions, tools, question) and truncate each search result at ingestion to the top passages plus a URL, externalizing full pages. Run independent sub-questions in sub-agents that return 1–2K-token cited reports, so the lead grows slowly. Trigger anchored checkpoint compaction at about 56K, down to about 16K, keeping the question, found facts with sources, open questions and the next step. Evaluate with plant → compact → continue: probe recall of planted facts after 1, 2 and 4 compactions, and compare answer accuracy and cost per solved question against an uncompacted baseline over several seeds.

### More practice questions (L12–L15)

16. With `LLMSummarizingCondenser(max_size=10, keep_first=2)`, how many events does the view hold just after a condensation, and how many agent steps of two events each pass before the next one?

    **Answer:** The target is T = ⌊10/2⌋ = 5, so the tail keeps r = 5 − 2 − 1 = 2 events and the view is 2 + 1 + 2 = 5 events. It condenses again once the view exceeds 10, so s = ⌈(11 − 5)/2⌉ = 3 steps later. Each condensation adds one `Condensation` event to the log, while the view gains only the summary (M9).
17. Why does OpenHands record a condensation as an event instead of editing the history? Give three consequences.

    **Answer:** The log stays append-only and the view is derived from it, so nothing is lost. First, debugging and audit can see both the full trajectory and exactly what was forgotten. Second, a restored conversation replays the stored summary and rebuilds the same view without calling the summarizer again. Third, evaluation and RL can locate every point where the context was rewritten, which is where sequence extension breaks (sections 12 and 13).
18. In M9's simulation, `max_size=10` cuts raw agent input 6.6× but price-weighted cost only about 1.5×. Explain the gap.

    **Answer:** Without a condenser, 97% of input is a cached prefix billed at 10% (ρ = 0.1), so most of the 2.4M tokens removed were cheap. The condenser adds full-price work: each rewrite forces a re-prefill of the summary and tail (uncached input rises from 92,000 to 107,200), and the summarizer reads 101,400 tokens. Cost falls from 369,300 to 241,130 units, a 1.5× gain; the bigger wins are peak context (9,500 vs 92,000 tokens) and effective-context quality.
19. A GRPO run compacts every two turns and uses Qwen 3's default chat template. Trainer tokens are far above the sum of trajectory lengths. Name two causes and a fix for each.

    **Answer:** Each compaction breaks the exact prefix, so the trajectory splits into several datums that each repeat the task and summary, which carry no direct loss but still need forward and backward passes. The default template strips past reasoning, so even turns without compaction fail to extend, and every turn becomes its own datum. Fixes: compact less often (section 12's simulation: every 8 turns costs 8% extra, every 2 turns 55%), and use a renderer that preserves sequence extension, as Tinker and PrimeRL ship.
20. Why should rollouts reach the trainer as token IDs rather than text? Use L12's example.

    **Answer:** Tokenization is one-to-one but detokenization is many-to-one: the text "Hello" can come from one token or from "He" + "llo". If the trainer retokenizes text, it may score tokens the policy never sampled, so the update is silently off-policy and `importance_weight_max` spikes. A template that adds whitespace has the same effect. Recording token IDs and log-probs at the inference proxy, then training on exactly those, removes the mismatch.
21. In L15's support workflow, assume system prompts of 200 tokens, a 300-token email and 2,000 tokens of search results. Count model-input tokens for a billing email, and compare a single agent whose 1,500-token prompt re-reads its growing history over three calls.

    **Answer:** The classifier reads 200 + 300 = 500 tokens; search is plain code; the drafter reads 200 + 300 + 2,000 = 2,500. The workflow total is 3,000 tokens. The single agent reads 1,800 (prompt + email), then about 3,900 after a 100-token search action and the results, then about 4,200 after drafting: roughly 9,900 tokens, 3.3× more (illustrative numbers). The agent buys adaptability with that context; the workflow buys narrowness with design effort.
22. A LangGraph state declares `messages` with the `add_messages` reducer, and every node appends its prompt and output. What happens over a 40-node run, and how do you fix it?

    **Answer:** The append reducer rebuilds a transcript inside the workflow, so every node that reads `messages` sees all earlier prompts and outputs. Input grows linearly per node and quadratically in total (M1), and late nodes face the effective-context limits of section 8. Fix it by storing raw typed fields with default overwrite, letting each node read only the fields it needs, and keeping any conversational history local to a sub-agent node that returns a typed result.

### More practice questions (L17–L18)

23. In RAO's 8K-context table, the recursive agent takes about twice as many steps as the single agent (33 vs 16) yet reaches 0.95 success against 0.24. Why can more steps mean better use of context?

    **Answer:** The single agent puts all 16 steps into one 8K window, so history crowds out the task and long tasks fail (0.0 on hard ones). The recursive agent spreads its 33 steps across many short windows, and each parent sees only child results. No window overflows, so total work can grow while every context stays small. That is why a recursive 8K agent tracks a single 40K agent in training (section 16).
24. L18's LangChain supervisor wraps each subagent as a tool that returns `["messages"][-1].text`. Name one benefit and one risk for context, and a fix for the risk.

    **Answer:** Benefit: the supervisor's context never holds the subagent's intermediate steps, so it grows by one message per call. Risk: the last message is an unplanned compaction, so reasons and identifiers the parent needs (why a slot was rejected) can vanish. Fix: have the subagent return a structured result with the answer, key reasons and exact identifiers, and evaluate it like any compaction (section 9).
25. Four DeLM-style agents each take 30 steps. Each step re-reads the shared board, placed right after a shared system prompt, and the board averages 7,500 tokens. About 300 tokens are new at each read. Cached input costs 10% of the normal price. Compare an append-only board with one that agents edit in place. (Illustrative numbers.)

    **Answer:** Board reads total 4 × 30 × 7,500 = 900,000 tokens. Append-only, the old entries form a stable prefix, so only 4 × 30 × 300 = 36,000 tokens miss the cache; the other 864,000 cost 86,400 units, about 122,400 units in all. If agents edit entries in place, an early edit breaks the prefix, and in the worst case all 900,000 tokens are billed at full price, about 7× more. Append-only buys safe concurrency and prefix-cache hits (sections 5 and 16).
26. On Terminal-Bench 2.0, independent pass@2 scores 62.36% mean and a communicating team@2 scores 60.67%. What does this say about shared context?

    **Answer:** Sharing context is not free accuracy. Terminal-Bench tasks are short and mostly pass or fail, so there is little verified partial progress to share. Communication can also make the two attempts more alike, which removes the diversity pass@k relies on. Share context when there is checkable intermediate progress (Park et al.'s verified sync points), and always compare against independent samples.

### More practice questions (L21)

27. OOLONG-Pairs inputs are only 32K tokens, well inside GPT-5's window, yet direct GPT-5 scores 0.1 F1. Why can an RLM reach 76.0 on the same input?

    **Answer:** The task needs a judgment about every pair of records. One forward pass over the whole input does not reliably enumerate and compare them all, which is the advertised-versus-effective gap of section 8. An RLM keeps the records in a REPL, uses code to enumerate them, and sends batches to subcalls. Each subcall sees a short, focused context, and code combines the labels exactly.
28. How does an RLM differ from compaction on BrowseComp-Plus, and what does the 94.0% score of OpenCode + offload suggest?

    **Answer:** Compaction (70.5%) must read the input and then summarize, so details are lost before the question is known. An RLM (91.3% at depth 1) never reads the whole input; code retrieves only relevant slices. OpenCode + offload beating both shows the gain comes from keeping data outside the prompt, not from recursion as such.
29. RAO raised DeepDive success from 24% to 40% but took 233.0 s against 13.3 s. What does that say about context isolation as a design choice?

    **Answer:** Isolation can improve accuracy even at a 256K window, because each child works in a clean context. But DeepDive's later searches depend on earlier findings, so children cannot run in parallel and each adds overhead. Isolate when branches are independent or the context would otherwise overflow, and measure wall-clock time as well as success.
30. In Stream of Search, "backtracking appends text; earlier attempts stay in context." Name two consequences for context budgeting and one remedy L21 mentions.

    **Answer:** First, the depth of the search a model can do is bounded by its window (4,096 tokens for the 250M SoS model). Second, failed branches compete for attention with the useful state. Remedies: APA penalizes extra search expansions, and Searchformer fine-tunes on shorter successful traces.

## References and further reading

Every link below was checked; start with the core papers for the mechanisms, then the practitioner guides for harness design.

### Core papers

- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., 2023 (SOSP) — block-table KV allocation behind vLLM; the reference for KV memory management.
- [SGLang: Efficient Execution of Structured Language Model Programs](https://arxiv.org/abs/2312.07104) — Zheng et al., 2023 — introduces RadixAttention prefix sharing, the model for agent-friendly KV reuse.
- [DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving](https://arxiv.org/abs/2401.09670) — Zhong et al., 2024 (OSDI) — source of L3's prefill/decode, TTFT and TPOT framing.
- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) — Dao et al., 2022 — why attention memory is no longer quadratic while FLOPs still are.
- [YaRN: Efficient Context Window Extension of Large Language Models](https://arxiv.org/abs/2309.00071) — Peng et al., 2023 (ICLR 2024) — frequency-selective RoPE extension used by several models in L3's tables.
- [RULER: What's the Real Context Size of Your Long-Context Language Models?](https://arxiv.org/abs/2404.06654) — Hsieh et al., 2024 — the standard evidence that effective context is shorter than advertised.
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — Liu et al., 2023 — the U-shaped position effect behind "put key facts at the start or end".
- [NoLiMa: Long-Context Evaluation Beyond Literal Matching](https://arxiv.org/abs/2502.05167) — Modarressi et al., 2025 — shows how much NIAH scores rely on lexical overlap.
- [The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management](https://arxiv.org/abs/2508.21433) — Lindenbauer et al., 2025 — the key empirical comparison of masking and summarization for coding agents.

### From the lectures

- [Prompt Cache: Modular Attention Reuse for Low-Latency Inference](https://arxiv.org/abs/2311.04934) — Gim et al., 2023 (MLSys 2024) — L3's evidence that loading cached attention beats recomputation.
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245) — Ainslie et al., 2023 — the KV-sharing scheme in most current models.
- [DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model](https://arxiv.org/abs/2405.04434) — DeepSeek-AI, 2024 — introduces MLA and its 93.3% KV reduction.
- [Gated Delta Networks: Improving Mamba2 with Delta Rule](https://arxiv.org/abs/2412.06464) — Yang, Kautz and Hatamizadeh, 2024 — the gated delta rule used in hybrid 2026 models.
- [Kimi Linear: An Expressive, Efficient Attention Architecture](https://arxiv.org/abs/2510.26692) — Kimi Team, 2025 — KDA and the KDA/MLA hybrid with up to 75% less KV.
- [Extending Context Window of Large Language Models via Positional Interpolation](https://arxiv.org/abs/2306.15595) — Chen et al., 2023 — uniform RoPE interpolation, the baseline YaRN improves on.
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — Packer et al., 2023 — externalize-and-retrieve memory, cited in L3's "what survives compaction".
- [ReSum: Unlocking Long-Horizon Search Intelligence via Context Summarization](https://arxiv.org/abs/2509.13313) — Wu et al., 2025 — summary-conditioned continuation and training, cited for repeated compaction.
- [Needle in a Haystack test harness](https://github.com/gkamradt/LLMTest_NeedleInAHaystack) — Kamradt, 2023 — the GPT-4 heat map on L3's advertised-versus-effective slide.

### Tutorials, docs and courses

- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic, 2025 — compaction, tool-result clearing, note-taking, sub-agents and just-in-time retrieval.
- [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) — Manus, 2025 — production rules for KV-cache hit rate, tool masking and file-system memory.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Anthropic, 2025 — numbers on sub-agent gains and token cost.
- [Prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — Anthropic — cache breakpoints, TTLs, pricing multipliers and what invalidates a cache.
- [Automatic Prefix Caching design](https://docs.vllm.ai/en/latest/design/prefix_caching.html) — vLLM project — block hashing and LRU eviction in a real engine.
- [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://www.trychroma.com/research/context-rot) — Hong, Troynikov and Huber (Chroma), 2025 — 18-model study of degradation with input length.

### Added for L12–L15

- [The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents](https://arxiv.org/abs/2511.03690) — Wang, Rosenberg, Michelini, Smith, Tran, Nyst, Malhotra, Zhou, Chen, Brennan, Neubig, 2025 (v2 2026) — the event-sourced SDK behind L14 and sections 13–14.
- [Condenser architecture](https://docs.openhands.dev/sdk/arch/condenser) and [Context condenser guide](https://docs.openhands.dev/sdk/guides/context-condenser) — OpenHands docs — the `Condensation` event, `View.from_events()`, head/tail selection and the up-to-2× cost claim used in section 13 and M9.
- [Events architecture](https://docs.openhands.dev/sdk/arch/events) — OpenHands docs — the append-only log, LLM-convertible versus internal events, `CondensationRequest`.
- [`llm_summarizing_condenser.py`](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/context/condenser/llm_summarizing_condenser.py) — OpenHands, source code — the triggers, the ⌊max\_size/2⌋ target and the tail formula derived in M9.
- [Agent Skills & Context](https://docs.openhands.dev/sdk/guides/skill) — OpenHands docs — where always-on, triggered and progressively disclosed skills enter the context (section 14).
- [OpenHands Context Condensation for More Efficient AI Agents](https://openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents) — Calvin Smith, OpenHands blog, 2025 — the 54% vs 53% result, linear versus quadratic cost, interaction with prompt caching.
- [Don't Sleep on Single-agent Systems](https://www.openhands.dev/blog/dont-sleep-on-single-agent-systems) — Graham Neubig, OpenHands blog, 2024 — the shared-context argument on L14's single-agent slide.
- [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph) — LangChain docs — L15's support workflow, "store raw data, not formatted text", static versus dynamic context, checkpoints at node boundaries.
- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api) and [Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) — LangChain docs — reducers (overwrite by default, `operator.add`, `add_messages`), checkpointers and `thread_id` (section 15).
- [Sequence Extension Property in Multi-Turn RL](https://tinker-docs.thinkingmachines.ai/rl/sequence-extension) — Thinking Machines, Tinker docs — O(T) versus O(T²) training compute and the thinking-stripping trade-off (section 12).
- [No Token Left Behind: Demystifying Token-In-Token-Out in Miles](https://lmsys.org/blog/2026-05-13-no-token-left-behind) — Miles team, LMSYS blog, 2026 — TITO and many-to-one detokenization (section 12).
- [SGLang documentation](https://docs.sglang.ai/) — SGLang project — weight-update endpoints with `flush_cache` and the `pause_generation` modes (section 11).
- [Snowflake Arctic RL and ZoRRo](https://www.snowflake.com/en/developers/guides/arctic-rl-unified-post-training-backend/) — Snowflake AI Research, 2026 — 80–95% duplicate prompt tokens, up to 6× faster actor updates.
- [AReaL-DTA: Dynamic Tree Attention for Efficient Reinforcement Learning of Large Language Models](https://arxiv.org/abs/2602.00482) — Zhang et al., 2026 — prefix-tree training, up to 8.31× over dense on τ²-bench.
- [Agent Lightning: Train ANY AI Agents with Reinforcement Learning](https://arxiv.org/abs/2508.03680) — Luo et al. (Microsoft), 2025 — the harness-agnostic middleman that records token IDs and log-probs.
- [Orca: A Distributed Serving System for Transformer-Based Generative Models](https://www.usenix.org/conference/osdi22/presentation/yu) — Yu et al., OSDI 2022 — continuous batching, cited in section 11.
- [PipelineRL](https://arxiv.org/abs/2509.19128) — Piché et al., 2025, and [AReaL](https://arxiv.org/abs/2505.24298) — Fu et al., 2025 — async RL with in-flight weight updates (section 11).
- [Recursive Agent Optimization (RAO)](https://arxiv.org/abs/2605.06639) — Gandhi, Chakraborty, Wang, Kumar, Neubig, 2026, and [Recursive Language Models](https://arxiv.org/abs/2512.24601) — Zhang, Kraska, Khattab, 2025 — the tree-of-sequences harnesses behind open problem 10.

### Added for L17–L18

- [Decentralized Multi-Agent Systems with Shared Context (DeLM)](https://arxiv.org/abs/2606.10662) — Mao, Gu, Chauhan, Zhang, Kang, Mirhoseini (Stanford), 2026 — public task queue and append-only typed shared context; the 162.7 vs 29.3 minute comparison (section 16). The [DeLM project page](https://yuzhenmao.github.io/DeLM/) gives the FACT / FAIL / DONE entry types and the under-15K-token log budget.
- [LLM-Based Multi-Agent Blackboard System for Information Discovery in Data Science](https://arxiv.org/abs/2510.01285v2) — Salemi et al., 2025 — blackboard and response board where helpers volunteer; shared context without a fixed routing table.
- [Effective Strategies for Asynchronous Software Engineering Agents (CAID)](https://arxiv.org/abs/2603.21489) — Geng and Neubig, 2026 — isolated Git worktrees as per-agent context, with branch-and-merge as the shared record.
- [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents) — Walden Yan (Cognition), 2025 — the case for sharing full agent traces and for single-threaded agents when decisions are coupled.

### Added for L21

- [Recursive Language Models](https://arxiv.org/abs/2512.24601) — Zhang, Kraska & Khattab, 2025/2026 — the prompt as a REPL variable with recursive subcalls; the BrowseComp-Plus and OOLONG-Pairs results.
- [Recursive Agent Optimization (RAO)](https://arxiv.org/abs/2605.06639) — Gandhi et al., 2026 — learned delegation at a 256K context and its wall-clock trade-off.
- [Stream of Search (SoS): Learning to Search in Language](https://arxiv.org/abs/2404.03683) — Gandhi et al., COLM 2024 — search serialized into a 4,096-token context.
- [Beyond A\*: Better Planning with Transformers via Search Dynamics Bootstrapping (Searchformer)](https://arxiv.org/abs/2402.14083) — Lehnert et al., COLM 2024 — fine-tuning on shorter search traces.
- [Is Your LLM Secretly a World Model of the Internet? (WebDreamer)](https://arxiv.org/abs/2411.06559) — Gu et al., 2024/2025 — imagined lookahead and the horizon result.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L03 - Long-Context Agents]]
- Lecture: [[L06 - Coding Agents]]
- Lecture: [[L10 - Deep Research Agents]]
- Lecture: [[L12 - RL Systems]]
- Lecture: [[L14 - OpenHands]]
- Lecture: [[L15 - Orchestration and Monitoring]]
- Lecture: [[L18 - Multi-agent Systems]]
- Lecture: [[L21 - Search and Planning]]
- [[Context Engineering - Concepts and Tutorials]]
- [[DeepSeek-V4 a million-token context that agents can actually use]]

[[T02 - Tool Calling, Schemas, MCP and Constrained Decoding|← T2]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T04 - Agent Memory and Skills|T4 →]]
