---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, reinforcement-learning, rl-systems, llm-infrastructure, llm-training]
aliases: ["CMU L12", "11-768 Lecture 12", "Reinforcement Learning Systems"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-12-rl-systems.pdf"
---

# Lecture 12 · Reinforcement Learning Systems

[[L11 - Advanced RL|← L11]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L13 - Agent Safety|L13 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 12 · Apurva Gandhi
> **Source:** lecture slides `lecture-12-rl-systems.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]], [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]], [[T12 - Rewards, Verifiers and Reward Hacking]]

Apurva Gandhi · 11-768 AI Agents, Fall 2026 · source slides: lecture-12-rl-systems.pdf (43 slides)

## Overview

An LLM reinforcement-learning framework is really two very different GPU workloads glued together — a decode-heavy inference engine that samples trajectories and a gradient-heavy trainer that updates weights — and most of RL systems engineering is about making each side fast and keeping the two sides exactly consistent with each other.

The lecture starts from the policy-gradient update you met in L9 and asks which operations a framework must provide: `sample` (with an environment and agent harness), `verify`, `forward_backward` and `optim_step`. It then covers the optimizations on each side (KV and prefix caching, continuous batching, speculative decoding; activation checkpointing, prefix sharing, parallelism), the train–inference interactions (weight sync, MoE routing replay), the "sharp bits" of agentic RL (sequence extension, chat-template quirks, token-in-token-out, async RL), and finally how to architect the whole system (SPMD versus everything-as-a-service, elastic and heterogeneous compute, online RL, multi-LoRA tenants, Tinker).

**After this lecture you can…**

- Map each term of the policy-gradient update onto the system operations `sample`, `verify`, `forward`, `backward` and `optim_step`, and say which engine runs each.
- Explain why inference (vLLM, SGLang) and training (Megatron, FSDP2) are separate engines, and name the main optimization each one uses.
- Estimate KV-cache memory and weight-sync volume for a given model, and explain prefix caching, prefix sharing and delta weight sync.
- Diagnose agentic-RL consistency bugs: broken sequence extension, chat templates that strip reasoning, string round-trips that change tokens, and MoE router mismatch.
- Compare synchronous and asynchronous RL, and SPMD versus service-oriented (single-controller) architectures, including when each is the better choice.
- Read the standard RL health metrics (reward, pass@k, entropy, importance weights, grad norm, staleness, MFU, stall time) and say what a warning sign means.

**Prerequisites.** Policy gradients, baselines and GRPO from L9; importance sampling, off-policy correction and async RL from L11; basic transformer inference (attention, KV cache) and PyTorch training.

**Place in the course.** The course now has 12 lectures: L1 agents, L2 tool use, L3 long context, L4 memory & skills, L5 planning, L6 coding agents, L7 computer-use agents, L8 SFT, L9 RL foundations, L10 deep research agents, L11 advanced RL, L12 RL systems. L9 and L11 gave the *math* of RL for agents; this lecture is the *machinery* that makes that math run at scale. It also reuses L3 (long contexts drive KV-cache and context-parallel costs), L4 and L5 (context compaction and sub-agents complicate training), and L6–L7 (coding and computer-use harnesses such as Codex, Claude Code and OpenHands are what get trained). The next class covers sandboxing and credential management, which is where the environment side of these systems lives.

## Concept map

![[cmu-ai-agents-L12-concept-map.png]]
*Concept map: RL system loop · inference engine, trainer engine, and the two flows between them*

Read it top to bottom: the harness and environment drive the inference engine (steps 1–2), the trainer runs steps 3–5, the two middle arrows are the only coupling, and the band lists what must stay identical on both sides for the policy-gradient update to be correct.

## Detailed notes

These notes follow the lecture's four parts: what an RL framework must do, the optimizations on each engine and between them, the "sharp bits" specific to agentic RL, and system design choices.

### 1. What an LLM RL framework must support

The lecture derives the requirements of an RL framework directly from the policy-gradient update. Every symbol in the update maps to an operation the system must perform.

$$
\theta \mathrel{+}= \sum_t \big(R(\tau) - b(h_t)\big)\, \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

Here θ are the policy weights, τ is one trajectory (a full agent episode), R(τ) is its reward, h\_t is the history (context) before step t, a\_t is the action (tokens) the agent produced at step t, b(h\_t) is a baseline (for GRPO, the mean reward of the group; see L9), and π\_θ(a\_t | h\_t) is the probability the policy gives that action. A learning rate and optimizer (e.g. Adam) are implicit in the "+=".

The slide annotates the formula with the operation behind each piece:

| Piece of the formula | System operation | What actually happens |
| --- | --- | --- |
| R(τ) | `env.verify` | Run tests, check an answer, or score tool outcomes to get a reward |
| h\_t, a\_t | `env.state` / `env.step` + agent harness | Run the agent loop: the model emits an action, the environment executes it and returns an observation |
| π\_θ(a\_t \| h\_t) | `forward` | Recompute token log-probabilities on the trainer, tracking gradients |
| ∇\_θ log π | `backward` | Backpropagate to get gradients |
| θ += … | `optim_step` | Apply the optimizer update |

**Why not hand-roll it in vanilla PyTorch?** The second slide maps the same pieces to `model.forward()`, `model.backward()` and `optimizer.step()`, which suggests a simple training loop would do. The catch is that sampling trajectories requires *generating* tokens one at a time, which plain PyTorch does very slowly. A naive loop that calls `model.forward()` per token, with no KV cache, batching or scheduling, would spend almost all its time in rollout.

**Two fundamentally different workloads.** The lecture regroups the operations into two engines, drawn as two octopuses (blue for inference, orange for training):

|  | Inference engine ("sample") | Trainer engine ("forward\_backward") |
| --- | --- | --- |
| Examples | vLLM, SGLang | Megatron, FSDP2 |
| Shape of work | Decode-heavy, sequential: one token per step per sequence | Prefill-style, parallel: whole sequences in one pass |
| Gradients | None | Full autograd |
| Key optimizations | KV caching, radix/prefix caching across requests, continuous batching, speculative decoding / MTP, model sharding (PP, CP, TP, EP) | Activation checkpointing, prefix sharing, batch sample packing, model sharding (PP, CP, EP) |

Decode is memory-bandwidth bound: each new token needs the full weights read from GPU memory but does little arithmetic. Training on complete sequences is compute-bound and parallel across all positions. Optimizing both in one codebase is hard, so frameworks reuse specialized engines and connect them.

**How the engines interact.** Two flows connect the engines. Rollout (trajectory) data flows from inference to the trainer. Updated weights flow back from the trainer to inference ("weight sync"). Everything in sections 4 and 5 below is about making these two flows fast and exact.

**One training step, end to end.** The lecture breaks a step into five stages, then loops:

1. **sample** (inference + environment): generate trajectories from the current policy while executing actions in the environment.
2. **verify** (environment): compute rewards from verifiers, tests or tool outcomes.
3. **forward** (trainer): recompute log-probabilities of the sampled tokens while tracking gradients.
4. **backward** (trainer): compute the gradient.
5. **optim\_step + sync**: update the trainer's weights, send them to the inference engine and reshard them into its layout.

Then repeat with the updated weights.

**Why recompute log-probs in step 3?** The inference engine already produced log-probs while sampling, but without gradients, and often with different kernels and numerics. The trainer must recompute them with autograd. The gap between the two sets of log-probs (π\_train versus π\_rollout) is a recurring source of bugs; the metrics table in section 6 tracks it as `importance_weight_max`.

**Common pitfall.** Treating the inference engine as a black box that "just returns text". In RL it must also return token IDs, log-probs and sometimes MoE routing decisions, and it must accept new weights mid-run.

### 2. Inference-side optimizations

Rollout generation usually dominates the wall-clock time of agentic RL, so the inference engine's tricks matter most. The lecture covers four.

**KV caching.** In attention, each token produces a query (q), key (k) and value (v) vector per layer. When generating token t7, the engine computes q, k, v for the new token only, attends over the cached k and v of t1…t6, then appends its own k and v to the cache. Without the cache, each new token would recompute keys and values for the entire prefix.

The slide sizes the cost for Llama-3-8B in bf16:

- **128 KB per token.** This follows from 32 layers × 8 KV heads × 128 head dimension × 2 tensors (K and V) × 2 bytes = 131,072 bytes.
- **One 32k-token trace ≈ 4 GB.**
- **64 such traces ≈ 256 GB**, more than three 80 GB GPUs hold.

$$
\text{KV bytes per token} = 2 \times L \times H_{kv} \times d_{head} \times \text{bytes per value}
$$

L is the number of layers, H\_kv the number of key/value heads (fewer than query heads under grouped-query attention), and d\_head the dimension per head. The takeaway on the slide: KV caching trades a lot of recomputation for a lot of memory. In agentic RL, trajectories are long and a GRPO group runs many in parallel, so KV memory, not compute, often limits how many rollouts fit.

**Prefix caching.** Many requests share a prefix, so the engine keeps KV entries for prefixes it has already seen and reuses them across requests. The slide's tree has a shared root "System prompt + tools", two branches "Task Prompt A" and "Task Prompt B", and leaves for rollouts. Light boxes are reused; dark boxes are freshly computed. Agentic RL benefits especially for two reasons:

- In group rollouts (e.g. GRPO), many rollouts share the same task prompt, so the prompt's KV is computed once.
- Within one rollout, step 2's context starts with step 1's context, so the KV for the history can be reused instead of recomputed at each turn.

SGLang implements this with **RadixAttention** (a radix tree of cached prefixes); vLLM calls it **Automatic Prefix Caching**. Prefix caching only works if the new request's tokens match the cached tokens exactly, which is why section 5's "sequence extension" matters so much.

**Continuous batching.** Static batching starts a batch of requests together and waits for the longest one to finish. The slide shows four slots A–D where A, C and D finish early and sit idle while B runs. Continuous batching (Orca's "iteration-level scheduling", Yu et al., 2022) schedules at the granularity of one decode step. Finished sequences leave immediately and queued requests (E, F, G, H, I) take their slots at the next step.

This matters a lot for RL because rollout lengths are long-tailed: a few agent episodes run far longer than the median. Continuous batching is usually paired with **chunked prefill**, which splits a long prompt's prefill into pieces so it does not stall decoding for everyone else. The alternative is to **disaggregate prefill and decode** onto different GPUs.

**Speculative decoding.** A cheap drafter (a multi-token-prediction head, or a small model) guesses k tokens ahead; the policy checks all k in one parallel forward pass. In the slide, k = 4: the policy accepts t1 and t2, rejects t3 and substitutes its own t3′. A rejection-sampling rule keeps the output distribution exactly equal to the policy's (Leviathan et al., 2023), so the speed-up is free in terms of correctness. Speed depends on the acceptance rate.

**RL-specific catch.** The policy changes every training step, so a frozen drafter drifts away from it and its acceptance rate decays. The fix on the slide is to train the drafter online with an auxiliary objective, such as SFT on fresh rollouts or distillation from the policy.

**Why it matters.** Every one of these optimizations has a correctness constraint in RL. Caches must match tokens exactly, batching must not change numerics more than necessary, and speculative decoding must stay distribution-exact, because the trainer assumes the samples came from π\_θ.

### 3. Trainer-side optimizations and parallelism

The trainer's problem is memory: long agent trajectories produce enormous activation tensors during the forward pass, and all of them are normally kept for the backward pass.

**Activation checkpointing.** Standard training stores every layer's internal activations (L1…L6 "all activations") until backward reaches that layer. Checkpointing keeps only each layer's *input*. When the backward pass reaches a layer, it recomputes that layer's internals, uses them, and frees them before moving to the next layer (the slide shows L4 "recomputing" while the others hold "input only").

- **Memory:** drops from every layer's activations to one input per layer, plus one layer's activations at a time.
- **Cost:** full recompute adds about one extra forward pass, ≈ +33% compute. Backward costs roughly twice a forward, so a step goes from 1 + 2 = 3 units to 4 units. Selective recompute of only the attention internals (Korthikanti et al., 2022) costs far less, because attention activations are large but cheap to recompute.

The idea dates to Chen et al., 2016 ("Training Deep Nets with Sublinear Memory Cost").

**Prefix sharing.** This is the trainer's counterpart to prefix caching. RL batches repeat prefixes: the same prompt appears in every rollout of a GRPO group, and in multi-turn data the history repeats across turns. A dense batch stores "prompt P + r1", "prompt P + r2", … and processes P four times. A shared batch processes P once and attaches r1…r4 as branches. Three mechanics make this exact:

1. A **tree attention mask**: each branch attends to P and to itself, never to other branches.
2. **Position IDs** as in each standalone sequence, so branch r2 starts at position len(P), not after r1.
3. **Gradient accumulation into P**: P's activations receive gradient contributions from every branch, so the result equals the dense computation.

Two systems quantify the gains on the slide:

- **Snowflake ZoRRo** (Zero Redundancy Rollouts, in Arctic RL, Snowflake AI Research, 2026): in long-prompt GRPO batches, 80–95% of tokens are duplicate prompt tokens. Deduplicating them gives up to 6× faster actor updates.
- **AReaL-DTA** (Dynamic Tree Attention, Zhang et al., 2026, ICML): multi-turn τ²-bench rollouts compress 9.43× when stored as a prefix tree. A depth-first search walks one root-to-leaf path at a time, which bounds memory, and reaches up to 8.31× the throughput of dense training.

**Batch sample packing** (listed on the overview slide) is the simpler cousin: concatenate several short sequences into one long row, with a mask that blocks attention across them, so no compute is wasted on padding.

**Parallelism.** Models and sequences that do not fit on one GPU are split across GPUs. The slide (with figures from the NVIDIA NeMo user guide) shows three schemes:

| Scheme | What is split | Picture on the slide |
| --- | --- | --- |
| Expert parallelism (EP) | Mixture-of-Experts experts live on different GPUs; the router sends each token to its experts' GPU | Experts 1–3 on one GPU become one expert per GPU, EP (N=3) |
| Tensor parallelism (TP) | Each weight matrix is split column- or row-wise across GPUs within a layer | An MLP whose W and V matrices are split four ways |
| Context parallelism (CP) | The sequence is split; each GPU keeps its queries (Q) and the key/value blocks rotate in a ring | GPU 0→1→2→3 passing KV blocks |
| Pipeline parallelism (PP) | Consecutive layers live on different GPUs | Named on the overview slide |

CP is especially relevant to agents because agent trajectories can reach tens or hundreds of thousands of tokens. Note that the inference engine and the trainer usually use *different* layouts (for example, TP for fast decode versus FSDP plus CP for training), which is why weights must be resharded at sync time.

### 4. Train–inference interactions

The two engines must exchange weights efficiently and must compute the *same* function. Two slides cover this.

**Weight sync.** After each optimizer step, the inference engine needs the new weights.

- **Full weight sync** broadcasts every parameter to every inference rank. A 1-trillion-parameter model in bf16 is ≈ 2 TB per sync, which can rival the step time itself.
- **Delta weight sync** exploits a surprising fact: about 99% of parameters are unchanged after an RL update *once the weights are cast to bf16*. RL learning rates are tiny, so most updates are smaller than the gap between neighbouring bf16 values and round away. The slide cites PULSE (Miahi & Belilovsky, 2026; the slide spells it "Mihai"), which syncs only the changed entries and reports over 100× less weight-sync communication.
- **Resharding.** Either way, parameters must be re-sharded from the trainer's parallel layout into the inference engine's layout.

**Rollout Routing Replay (R3).** In a Mixture-of-Experts model, a router picks the top-k experts for each token. Tiny numerical differences between inference kernels and training kernels can flip which experts are selected, so the trainer evaluates a slightly *different network* from the one that generated the tokens. That inflates the train–inference probability mismatch and destabilizes RL. R3 (Ma et al., 2025, "Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers") records the experts chosen during rollout and replays those selections during training. The figure shows the inference engine selecting experts (1, 4), and both the old-policy and update-policy training passes forced to use (1, 4) instead of their own choices.

**System consequence.** The inference engine must return routing decisions alongside tokens and log-probs, and the rollout store must carry them to the trainer. This is the first of several cases where RL needs more from the inference API than text.

### 5. Agentic RL: the sharp bits

Multi-turn agents break assumptions that single-turn RL (one prompt, one response) gets for free. This part of the lecture covers five such traps.

**Sequence extension.** A harness has the *sequence extension property* when each turn's context contains the previous turn's full context, token for token, as a prefix. The slide compares two harnesses over four turns (T = task, Aᵢ = action, Oᵢ = observation, S = compacted history):

- **Harness A** appends to the history: turn 4 is T A₁ O₁ A₂ O₂ A₃ O₃ A₄ O₄, and every turn extends the previous one.
- **Harness B** compacts every two observations: after O₂ it keeps T and summarizes A₁ O₁ A₂ O₂ into S, so turn 3 is T S A₃ O₃. Turn 3 is no longer an extension of turn 2.

The question "which harness is better for training efficiency?" is answered on the next slide. (The slide links Tinker's "Sequence Extension" documentation.)

**What the training batch looks like.** In GRPO-style training, one trajectory advantage Â is broadcast to every action token, and observation tokens are masked out because the model did not generate them.

- **Harness A gives one concatenated datapoint.** Token spans Task, A₁, O₁, …, A₄, O₄ carry loss mask 0,1,0,1,0,1,0,1,0 and advantage 0,Â,0,Â,… . One forward and backward pass covers the whole episode.
- **Harness B gives two datapoints, both containing Task.** The first is Task A₁ O₁ A₂ O₂; the second is Task S A₃ O₃ A₄ O₄, where S also has mask 0 (S is produced by the harness or a summarizer, not as one of these actions).

Repeated task tokens have zero direct loss but still cost context computation, because the actions attend to them. With frequent compaction, the repeated context grows with the number of segments. The slide's rule: **preserve exact prefixes and concatenate for as long as practical.** Tinker's docs put the cost plainly: with extension, compute over a trajectory of length T scales as O(T); when extension breaks at every step, each step needs its own pass over its whole context, giving O(T²).

**Chat template quirks.** Even a harness that appends faithfully can lose the extension property inside the chat template. Qwen 3 and Qwen 3.5's default templates remove reasoning ("thinking") from past assistant turns. In the slide, turn 1 is rendered as task + turn-1 thinking + turn-1 tool call. When turn 2 is rendered, the template drops turn-1 thinking, so turn 2 is task + turn-1 tool call + harness output + turn-2 thinking + turn-2 tool call. The two renderings "don't match", which breaks prefix caching at inference and forces separate datapoints in training.

Agent RL frameworks therefore often ship their own chat templates or "renderers" that preserve sequence extension (e.g. Tinker, PrimeRL). Tinker's Qwen3 renderer exposes this as a `strip_thinking_from_history` option.

**Token-In, Token-Out (TITO).** In what format should rollout data travel from the inference engine to the trainer: strings or tokens? The answer is tokens, for two reasons on the slide (from the LMSYS "No Token Left Behind: Demystifying Token-In-Token-Out in Miles" post):

1. Small, inconsistent transformations in string space, such as a chat template adding whitespace, can produce different tokenizations at train time than at inference time.
2. Tokenization is one-to-one, but de-tokenization is many-to-one. The figure shows the text "Hello" decoding from token "Hello" (id 4), from "H" + "ello" (1, 5), from "He" + "llo" (2, 6), or from "Hel" + "lo" (3, 7). If the model sampled "He" + "llo" and the trainer re-tokenizes the string, it gets "Hello" (4), a different action with a different probability.

The fix is to keep the exact sampled token IDs (and their log-probs) end to end, and to build each turn's prompt by appending tokens rather than re-rendering text.

**Async RL.** The lecture's diagram (from PipelineRL and AReaL) contrasts two schedules on a GPUs × time grid:

- **Sync RL** co-locates the train and inference engines on the same GPUs. All GPUs generate until the slowest rollout finishes (hatched "GPU idle" regions appear as short rollouts end early), then all switch to optim step 0, then optim step 1, then generate again.
- **Async RL** splits GPUs between inference and training. Inference GPUs generate continuously; their bars change shade as the weights advance through optim steps 0–3 mid-rollout; the trainer GPUs run optim steps back to back.

Async overlaps inference with weight updates and removes idle time caused by very long rollouts. Agentic RL is often rollout-bound, so one can dedicate more GPUs to inference, e.g. a 3:1 ratio. The price is that some data is generated by older weights, so async **requires staleness and off-policy corrections** (importance weights and clipping, from L11). It also requires **continuous batching** and **in-flight weight-update** support in the inference engine.

**In-flight weight updates.** Inference frameworks have evolved to serve RL. The slide shows SGLang's `POST /pause_generation` endpoint, whose `mode` field has three options:

| Mode | Behaviour | Consequence |
| --- | --- | --- |
| `abort` (default) | Same as the abort endpoint with abort\_all; pending requests in the waiting and running queues are returned to the caller | Partial rollouts are lost or must be restarted |
| `retract` | Engine paused; running requests go back to the waiting queue; KV cache can be flushed and recomputed later | Rollouts resume under new weights after re-prefill |
| `in_place` | Engine paused without changing request state; running requests keep their KV cache | Fastest resume, but a later `flush_cache` call will fail |

Generation resumes with `POST /continue_generation`. With `retract` or `in_place`, a single trajectory can contain tokens from two policy versions. Off-policy corrections must then work per token, using the log-prob recorded at sampling time.

**Complex harnesses.** Modern harnesses use sub-agents, context compaction and recursion. A sub-agent's call is its own sequence with its own context, so one "episode" becomes a tree of sequences that all need credit from the final reward. The slide points to Recursive Agent Optimization (RAO, 2026; by Gandhi, the lecturer, with Chakraborty, Wang, Kumar and Neubig), which trains agents that spawn and delegate sub-tasks to new instances of themselves, and to Recursive Language Models (RLM, Zhang, Kraska and Khattab, 2025). For systems, the consequence is that the trainer must accept many linked sequences per episode and the batch builder must handle broken extension gracefully.

### 6. System design choices

The last part asks how to put the pieces together. The theme is decoupling: separate services with standard protocols are more flexible than one monolithic program.

**Harness-agnostic design.** There are many popular agent harnesses: Codex, Claude Code, OpenHands, Pi, Hermes, Prime Agent and more. Writing custom rollout and environment code for each one is the anti-pattern. The harness-agnostic pattern puts a **middleman (proxy) service** in front of the inference engine that emulates standard inference APIs (Chat Completions, Responses, Anthropic Messages and so on). Any harness can then be pointed at it with zero code changes. In the slide's diagram (credited to Microsoft's Agent Lightning), Pi talks to the middleman via the Responses API and OpenHands via Chat Completions. The middleman forwards requests to the inference engine and writes everything the trainer needs (token IDs, log-probs, R3 routing data) into a **rollout store**, which feeds the trainer.

This is the practical answer to TITO and sequence extension: the proxy sees the exact tokens, so it can record them even though the harness only sees text.

**Single Program Multiple Data (SPMD).** The first architecture style runs one Python program on every GPU rank (the slide's simplified pseudocode, labelled "AReaL versions < 1.0"):

```python
rank = dist.get_rank()
train = dist.new_group([0, 1, 2, 3])   # every rank creates both groups,
infer = dist.new_group([4, 5, 6, 7])   # in the same order
if rank < 4:                           # ranks 0-3: training
    while True:
        batch = next_batch_shard(train)
        forward_backward(batch, train) # FSDP collectives
        optimizer.step()
        publish_weights_async(train)
else:                                  # ranks 4-7: inference
    while True:
        refresh_weights_if_ready(infer)
        prompt = next_prompt(infer)
        trace = rollout(prompt, infer) # tensor/context-parallel decoding
        enqueue_trajectory(trace, infer)
```

Coordination lives inside the program running on every rank. This is straightforward and gives direct control of everything, but it is less flexible: changing the algorithm means touching distributed code, and every component shares one codebase, one dependency set and one release cycle.

**Everything-as-a-service with a single controller.** The alternative splits the system into services around a lightweight **orchestrator/controller**. The slide's illustrative boundaries and protocols:

| Service | Talks to | Example protocol on the slide |
| --- | --- | --- |
| Agent service (the harness) | Orchestrator; env service; inference service | ACP to the orchestrator; MCP to environments/tools; Chat Completions or Responses API to inference |
| Env / reward service | Orchestrator | Open Reward Standard (ORS); hosted (e.g. OpenReward) or self-hosted |
| Inference service | Orchestrator; weight-sync service | SGLang / vLLM API |
| Trainer service | Orchestrator; weight-sync service | Tinker training API |
| Weight-sync service | Trainer and inference | Moves new weights between them |

Two benefits follow. **Separation of concerns:** each component is complex and specialized; the orchestrator is a CPU-only training loop, so researchers can prototype new algorithms without heavy dependencies, and each project can be maintained and released on its own schedule. **Modularity:** any service can be swapped for another implementation that speaks the same protocol. The slide's logos suggest such swaps: several harnesses on the agent side, vLLM or SGLang on the inference side, and different trainer backends (including Thinking Machines' Tinker).

**Elastic scale-up.** Because the orchestrator only talks to an inference *service*, that service can hide an **inference service controller** that adds or removes engine replicas as rollout demand changes. The orchestrator does not change.

**Multi-cluster and heterogeneous compute.** The same abstraction lets the replicas run on different hardware and clusters, e.g. one replica on 8× NVIDIA H100 and another on 4× AMD MI350. Inference is the easiest part to spread out because it only needs weights in and trajectories out.

**Example: AstraFlow** (Haizhong Zheng et al., 2026; with Ion Stoica and Beidi Chen among the authors). Its animation shows "RaaS: Elastic · Heterogeneous · Cross Region": rollout data streams in from regions such as the United States, Europe and Asia into a central Data Acquisition component, which feeds a Trainer Pool, while a Weight Manager distributes weights. The paper describes a dataflow-oriented design that decouples rollout, data management and training.

**Multi-policy training.** A microservice architecture also makes it easy to train several *different* models at once, for example in multi-agent rollouts where the agents use heterogeneous policies. The slide's AstraFlow graph shows Model 1 → Models 2 and 3 → Model 4 → back to Model 1.

**Online RL (training after deployment).** In online RL, the production deployment *is* the rollout generator. The slide's AReaL 2.0 (2026) diagram connects an **agent service** (e.g. Hermes Agent, with a controller and a workflow of planning, tool execution, sandbox and memory) to an **inference service** through an ordinary LLM API call (a base\_url and api\_key). Inside, an inference gateway and router feed data proxies, which record trajectories from inference workers into **trajectory storage**. A **training service** (a training controller over train workers 1…N) reads that storage and pushes weights back through a weight-sync service. Cursor runs online RL in production for **Cursor Tab** and for **Composer**, which gets a new model checkpoint from real user interaction every 5 hours.

**Multi-tenant, multi-LoRA training.** LoRA adapters are small, so many independent RL runs can share one base model on the same GPUs. The slide's chart (SkyRL + Trajectory Labs, 2026; eight GSM8K runs with Qwen3-4B) compares a serial baseline, where jobs 1–8 run one after another out to about 250 minutes, with eight concurrent multi-LoRA runs that all finish in about 90 minutes. Bars are coloured by phase: sample, train, weight sync. The slide's points:

- Eight concurrent runs beat eight serial runs in total throughput, although each individual run takes longer end to end.
- Each concurrent LoRA run can belong to a different user of your training service.
- It requires special kernels (Grouped-GEMM or SGMV) that apply many different adapters in one batched launch. SGMV comes from Punica (multi-tenant LoRA serving, 2023).

**Tinker.** Thinking Machines' Tinker pioneered multi-tenant, multi-LoRA RL training and the decoupled training-service design. Its API is small: a **training client** per training run and a **sampling client** per LoRA weight checkpoint, with four core calls.

| Call | What it does |
| --- | --- |
| `forward_backward` | Forward and backward pass, accumulating the gradient |
| `optim_step` | Update weights from the accumulated gradient |
| `sample` | Generate tokens for interaction, evaluation or RL actions |
| `save_state` | Save training progress so a run can resume |

These are exactly the operations the lecture derived from the policy-gradient formula on its first content slide, so the lecture closes the loop.

### 7. Metrics to track and debug

The backup slide lists the health metrics an RL engineer should watch, with the warning sign for each.

| Metric | What it tells you | Warning sign |
| --- | --- | --- |
| Reward / pass@1 | Is the policy improving on training tasks? | Flat for many steps, or rising while held-out evals fall (reward hacking) |
| pass@k | Coverage: can any of k samples solve it? | Falls while pass@1 rises: diversity is collapsing |
| Entropy | How much the policy still explores | Sudden collapse toward 0, or a jump (degenerate text) |
| importance\_weight\_max | Worst token ratio, e.g. π\_train / π\_rollout | Spikes: mismatch or stale data; a few tokens dominate the update |
| Grad norm | Size of each update before clipping | Spikes ahead of divergence; steady upward drift |
| Average staleness | How many weight versions old the data is | Creeping up: rollouts cannot keep pace with training |
| Trainer MFU | How well trainer GPUs are used | Drops from padding, imbalance or small microbatches |
| Timing: rollout, update, stall, total | Where a step's wall-clock time goes | Stall > 0: the trainer is waiting on rollouts |

Read the table as two groups. The first four rows are *learning* health (is the policy getting better without collapsing?). The last four are *system* health (are the engines consistent, fresh and busy?). `importance_weight_max` links them: it rises both when async data goes stale and when the inference and training numerics diverge, for instance from broken TITO or MoE routing flips.

The lecture ends with "Thank you, Questions?" and announces the next class: Sandboxing and Credential Management.

## Slide-by-slide companion

Every slide of the 43-slide deck, in PDF order, with what it shows, what it means and how it connects. (Slides 19–20 carry printed numbers 23–24 in the PDF; the numbers below are PDF page positions.)

### Slides 1–8 · What an RL framework must do

**Slide 1 — Title.** "Reinforcement Learning Systems", Apurva Gandhi, CMU Language Technologies Institute, 11-768 AI Agents.

**Slide 2 — RL Systems: Overview.** Section divider for the first part.

**Slide 3 — What operations must an LLM RL framework support?** The slide shows the policy-gradient update θ += Σₜ (R(τ) − b(hₜ)) ∇θ log πθ(aₜ | hₜ) with coloured arrows. Grey arrows point from `env.verify` to R(τ), and from `env.state / env.step` plus "agent harness" to the history hₜ and action aₜ. A green arrow labels "+=" as `optim_step`. An orange arrow labels ∇θ as `backward`. A dark-blue arrow labels πθ(aₜ | hₜ) as `forward`, and a second dark-blue arrow runs back to R(τ) − b(hₜ), signalling that the forward pass also feeds the advantage weighting.

The point is methodological: derive the system's API from the math. The environment supplies R and h; the model supplies π; the optimizer supplies the update. The same formula appeared in L9 (with GRPO's group mean as b) and L11 (with importance ratios added). Here it becomes a list of services. Keep this slide in mind: slide 41 (Tinker) closes the lecture with almost exactly these verbs.

**Slide 4 — Why not just hand-roll a custom implementation in vanilla PyTorch?** The same formula now has a dashed box underneath mapping each operation to a PyTorch call: `optimizer.step()`, `model.backward()`, `model.forward()`. The question is rhetorical. Training maps neatly onto PyTorch, but nothing in that box *generates* trajectories. Sampling thousands of long multi-turn rollouts with naive per-token forward calls (no KV cache, no batching scheduler, no paged memory) would be orders of magnitude slower than a dedicated inference engine. The slide sets up the key insight on the next slide: rollout and training are different kinds of computation.

**Slide 5 — RL frameworks are composed of two fundamentally different workloads!** The formula is relabelled: `optim_step` on "+=", **"sample"** on R(τ) (producing the trajectory and its reward), and **"forward\_backward"** on ∇θ log πθ. Two cartoon octopuses represent the engines. The blue one is the **inference engine** (e.g. vLLM, SGLang): decode-heavy, sequential, no gradients. The orange one is the **trainer engine** (e.g. Megatron, FSDP2): prefill-style, parallelizable, autograd.

"Decode-heavy" means one token per sequence per step, which is limited by memory bandwidth. "Prefill-style" means processing whole known sequences at once, which is limited by arithmetic throughput. This is why mature RL frameworks (veRL, OpenRLHF, AReaL, SkyRL, PrimeRL, Miles) wrap an existing inference engine and an existing training stack rather than writing one engine.

**Slide 6 — Two workloads, two optimization toolkits.** The octopuses return with their optimizations listed around them. Inference: KV caching; radix/prefix caching (across requests); continuous batching; speculative decoding/MTP; model sharding (PP, CP, TP, EP). Trainer: activation checkpointing; prefix sharing; batch sample packing; model sharding (PP, CP, EP). This slide is the table of contents for slides 9–15.

Notice the mirror pairs. Prefix caching (inference) mirrors prefix sharing (training): both avoid redoing work on repeated prefixes. KV caching (store to avoid recompute) mirrors activation checkpointing (recompute to avoid storing). TP appears only on the inference side. Training often prefers FSDP-style data parallel sharding plus PP/CP/EP, while decode benefits from TP's low per-token latency.

**Slide 7 — Interaction between train and inference engines.** A green arrow labelled "Rollout/trajectory data" goes from the inference octopus to the trainer octopus. A return arrow labelled "weight sync" goes back. These two arrows are the only coupling between the engines, and the rest of the lecture keeps returning to them. Rollout data must be exact (slides 21–24, TITO and templates). Weight sync must be fast (slide 16) and consistent (slide 17, R3). In async systems (slide 25), the two arrows run concurrently rather than in alternation.

**Slide 8 — Breaking down a training step.** Five coloured boxes joined by arrows, with a feedback line "Repeat with the updated weights":

| Box | Who | What |
| --- | --- | --- |
| 1 · sample | Inference + env | Sample trajectories from the current policy while executing actions in the environment |
| 2 · verify | Environment | Rewards from verifiers, tests or tool outcomes |
| 3 · forward | Trainer | Recompute logprobs while tracking grad |
| 4 · backward | Trainer | Backward pass to compute gradient |
| 5 · optim\_step + sync | Sync | Update trainer weights, send to inference engine and reshard |

In a synchronous system these run strictly in sequence, so the step time is the sum of the stages. That makes it easy to see where time goes (the "Timing" row of the metrics table on slide 43). Step 1 usually dominates for agents because episodes are long and contain tool latency. Step 5 can be surprisingly expensive for very large models. Async RL (slide 25) overlaps step 1 with steps 3–5.

### Slides 9–15 · Optimizing each engine

**Slide 9 — Inference optimizations: KV caching.** Left: a row of seven cells labelled t1…t7. Cells t1–t6 hold "K,V"; t7 is dark and labelled "new". The caption reads "Step t7 computes q, k, v for the new token only, attends over every cached k, v, then appends its own." Right, a box "How big is it?": Llama-3-8B in bf16 uses **128 KB per token**; one 32k-token trace ≈ **4 GB**; 64 of them ≈ **256 GB**. The banner: "KV caching trades a lot of recomputation for a lot of memory."

The numbers check out: 2 (K and V) × 32 layers × 8 KV heads × 128 dims × 2 bytes = 131,072 bytes. Multiply by 32,768 tokens and you get 4 GiB. Why 64 traces? A GRPO step might sample 8 rollouts for each of 8 tasks. That alone is 256 GB of KV, before the 16 GB of weights. So in agentic RL, KV memory, not FLOPs, decides how many rollouts run concurrently. This motivates PagedAttention (vLLM), which allocates KV in fixed blocks to avoid fragmentation, and context parallelism for very long traces.

**Slide 10 — Inference optimizations: prefix caching.** A tree diagram: a root box "System prompt + tools" branches to "Task Prompt A" and "Task Prompt B". Task A has three leaves, "rollout 1/2/3, step 1". Task B has "rollout 1, step 1" followed by "rollout 1, step 2". A legend marks light boxes as "reused" and dark boxes as "freshly computed": the root, both task prompts and B's step 1 are reused; A's three leaves and B's step 2 are fresh. The text: "Agentic RL especially benefits from prefix caching. In group rollouts (e.g. GRPO), many rollouts share the same task prompts. KV from past steps/history of a rollout can be reused in future steps." Links: SGLang RadixAttention, vLLM Automatic Prefix Caching.

The tree captures *two* kinds of sharing. Horizontal: siblings in a GRPO group share the task prompt. Vertical: step 2 of a rollout shares everything from step 1. Vertical sharing is what makes multi-turn agents affordable. Without it, each turn would re-prefill the whole growing history, giving quadratic total prefill. It only works if step 2's tokens start with exactly step 1's tokens, which is the sequence-extension property of slide 19.

**Slide 11 — Inference optimizations: continuous batching.** Two Gantt-style panels with four slots each. **Static batching:** A, C and D end early and are followed by grey "idle" blocks while B runs to the end; caption "Every slot waits for the longest request (B)." **Continuous batching:** after A ends, E and then H take its slot; after C, F starts; after D, G and then I; caption "Freed slots are refilled at the next step." The text says scheduling happens at the granularity of one decode step, and it is usually accompanied by chunked prefill to avoid long prompts causing decode latency spikes; alternatively, prefill and decode can be disaggregated. Citation: Yu et al., 2022 (Orca, iteration-level scheduling).

For RL the effect is large because agent rollout lengths are heavy-tailed. One 30-turn debugging episode can run ten times longer than a typical one. Continuous batching is also the prerequisite for async RL (slide 25): the engine must keep accepting new prompts while old ones are still running.

**Slide 12 — Inference optimizations: speculative decoding.** The idea: a cheap drafter guesses k tokens; the policy checks all k in **one parallel pass**; rejection sampling keeps the policy's exact distribution. The diagram shows a drafter box ("e.g. MTP head or a small model") proposing k = 4 tokens t1–t4. These go into a dark "Policy — scores all 4 in one pass" box. The output is t1 and t2 in green (accepted) and t3′ in red (rejected and resampled). A red callout, "RL-specific catch": the policy changes every training step, so a frozen drafter's acceptance rate decays; train it online with an auxiliary objective (e.g. SFT, distillation). Citation: Leviathan et al., 2023.

The acceptance rule: accept drafted token x with probability min(1, p(x)/q(x)), where p is the policy and q the drafter; on rejection, sample from the normalized residual max(0, p − q). This makes the output exactly distributed as p. That exactness is non-negotiable in RL, since the trainer assumes the samples came from πθ. MTP (multi-token prediction) heads, as in DeepSeek-V3, are attractive drafters because they are part of the policy and can be trained alongside it.

**Slide 13 — Trainer optimizations: activation checkpointing.** "Keep only each layer's input in the forward pass; recompute the layer's internals when the backward pass reaches it." Two rows of six layers. In the **standard** row every layer is shaded "all activations". In the **checkpointed** row, every layer is outlined "input only" except L4, which is shaded "recomputing". An arrow runs right to left: "backward pass: recompute one layer at a time, use it, free it". **Memory:** from every layer's activations to one input per layer, plus a single layer's activations at a time. **Cost:** full recompute adds about one forward pass, ≈ **+33% compute**; selective recompute (only attention) costs far less. Citations: Chen et al., 2016 (gradient checkpointing); Korthikanti et al., 2022 (selective activation recomputation).

The +33% comes from forward ≈ 1 unit and backward ≈ 2 units: recomputation turns 3 units into 4. Agent trajectories are long, and activation memory grows with sequence length times hidden size times layers, so checkpointing is usually on by default in RL trainers.

**Slide 14 — Trainer optimizations: prefix sharing.** "RL batches repeat prefixes: the prompt across a GRPO group, the history across turns. Compute each once, forward and backward. (Counterpart to prefix caching in inference.)" Left, **dense**: four rows of "prompt P" each followed by a response r1–r4 of different lengths. Right, **shared**: one "prompt P" box fanning out to r1–r4. The caption gives the three mechanics: tree attention mask (no attention across branches); position IDs as in each standalone sequence; gradients from every branch accumulate into P. Two result boxes: **Snowflake ZoRRo** (80–95% of tokens in long-prompt GRPO batches are duplicate prompt tokens; deduplicating gives up to 6× faster actor updates) and **AReaL-DTA** (multi-turn τ²-bench rollouts compress 9.43× as a prefix tree; a DFS walks one root-to-leaf path at a time; up to 8.31× vs dense training). Citations: Snowflake AI Research, 2026 (ZoRRo, Arctic RL); Zhang et al., 2026 (AReaL-DTA, ICML).

Why 80–95%? If a prompt has 4,000 tokens and each of 8 rollouts adds 300, then prompt tokens make up 32,000 of 34,400, about 93%. Snowflake also reports a 67% cut in attention memory.

**Slide 15 — Optimizations: parallelism.** Three figures (from the NVIDIA NeMo Framework user guide; two embedded animations render as black boxes in the PDF). **Expert parallelism (EP):** a router sends a token to Expert 1–3, first all on GPU 1, then with EP (N=3) one expert per GPU. **Tensor parallelism (intra-layer):** an MLP with X → W → activation → Vᵀ → dropout is split across four GPUs, with W = \[W₁ W₂ W₃ W₄\] split by columns and V split by rows, so each GPU computes a slice and one all-reduce combines them. **Context parallelism:** four GPUs in a ring, each "keeps its Q" while "KV blocks rotate" (ring attention). The inference engine and the trainer usually choose different mixes, which is why slide 16 mentions resharding.

### Slides 16–24 · Train–inference consistency and the sharp bits

**Slide 16 — Train–inference interactions: weight sync.** Both octopuses appear in the corner. **Full weight sync:** a full broadcast to every inference rank; a 1T-parameter model → \~2 TB per sync. **Delta weight sync:** \~99% of parameters are unchanged between RL weight updates once cast to bf16, so sync only the delta. Note: parameters must be re-sharded for the inference engine's parallelism layout. Citation: PULSE, 2026 (the paper's first author is Erfan Miahi; the slide writes "Mihai").

Why are 99% unchanged? bf16 keeps only 8 bits of mantissa, so neighbouring representable values near 1.0 are about 0.0078 apart. The trainer keeps fp32 master weights. An RL step with a learning rate around 1e-6 moves most fp32 weights by far less than half a bf16 gap, so their bf16 casts do not change. Only changed entries need to be sent, as (index, value) pairs or a sparse mask. At 1% density that is roughly a 100× reduction before index overhead, matching PULSE's reported >100× cut in weight-sync traffic. This matters most when inference runs in a different cluster or region (slides 36–37).

**Slide 17 — Train–inference interactions: Rollout Routing Replay (R3).** Left text. **Problem:** tiny numerical differences can select different MoE experts. **R3 solution:** record rollout expert choices and replay the selections in training. **Requirement:** the inference engine must provide routing decisions to the training engine. Right, Ma et al. 2025's Fig. 1: three panels (inference engine; training engine, old policy; training engine, update policy). Each has input → router → four experts → combine → output, with a bar chart of router scores. In the inference panel the router selects experts (1, 4). A green "Rollout Routing Replay" bubble carries "select (1, 4)" into both training panels. There, the experts the training router would have picked differently (3 in one panel, 2 in the other) are crossed out with a trash-can icon.

Why it matters: top-k routing is discontinuous. If two experts' scores are within rounding error, inference and training can pick different ones. The token's log-prob then comes from a different sub-network, and the ratio π\_train/π\_rollout can be far from 1 even with identical weights. That variance compounds over long agent trajectories (the ratio-product issue from L11). R3 removes this source of mismatch, at the cost of storing k expert IDs per token per MoE layer.

**Slide 18 — Agentic RL: The Sharp Bits.** Section divider (with a knife icon). The next slides cover traps that appear only with multi-turn agents.

**Slide 19 (printed 23) — Sequence extension.** Two columns of four turns. **Harness A** ("Append to the existing history") grows T A₁ O₁ → T A₁ O₁ A₂ O₂ → … → T A₁ O₁ A₂ O₂ A₃ O₃ A₄ O₄. **Harness B** ("Compact every two observations") is the same for turns 1–2, then a purple note "After O₂: keep T; summarize A₁ O₁ A₂ O₂ → S". Turn 3 is T S A₃ O₃ and turn 4 is T S A₃ O₃ A₄ O₄. Legend: T = task, Aᵢ = action, Oᵢ = observation, S = compacted interaction history. The green question: "Which harness is better for training efficiency?" Link: Tinker documentation, "Sequence Extension".

Harness A is better for training efficiency (slide 20 explains why). Harness B may still be better for the *agent*: it keeps context short, which is the motivation for compaction in L3 and L4. That is the real trade-off. Notice that B still satisfies extension *within* each segment (turn 4 extends turn 3), so it produces one datapoint per segment rather than one per turn.

**Slide 20 (printed 24) — Sequence extension: training batch.** "One trajectory advantage Â, broadcast to every action token." **Harness A: one concatenated datapoint**, a nine-column table (Task, A₁, O₁, A₂, O₂, A₃, O₃, A₄, O₄) with loss mask 0 1 0 1 0 1 0 1 0 and advantage 0 Â 0 Â 0 Â 0 Â 0. **Harness B: two datapoints, both containing Task:** (Task, A₁, O₁, A₂, O₂) with mask 0 1 0 1 0, and (Task, S, A₃, O₃, A₄, O₄) with mask 0 0 1 0 1 0. Footnote: "Repeated task tokens have zero direct loss, but still require context computation." Green conclusion: "Preserve exact prefixes and concatenate for as long as practical."

The mask says which tokens the model is trained to produce: its own actions. Observations come from the environment, so training on them would teach the model to predict tool output. The S summary also gets mask 0 here, because it is treated as context. If the agent itself wrote S as an action, one could choose to train on it. The cost of B is the second copy of Task (plus S) in the forward and backward pass. With frequent compaction and a long task prompt, that overhead dominates; prefix sharing (slide 14) can recover some of it.

**Slide 21 — Chat template quirks.** "Popular chat templates may not satisfy the sequence extension property. E.g. Qwen 3 / Qwen 3.5's default chat template removes reasoning from past history." The diagram: **turn 1** = \[task\] → \[turn 1 thinking\] + \[turn 1 tool call\]. **Turn 2** = \[task\] + \[turn 1 tool call\] + \[harness output\] → \[turn 2 thinking\] + \[turn 2 tool call\]. A purple dashed bracket spanning turn 1's boxes reads "don't match!", because turn 2's rendering lacks "turn 1 thinking". Link: "No Token Left Behind: Demystifying Token-In-Token-Out in Miles".

The consequence is concrete. At inference, the prefix cache misses at the point where the thinking was removed, so the engine re-prefills from there. In training, turn 1 and turn 2 cannot be merged into one datapoint, and the model is trained on contexts (no past thinking) that differ from what it saw when generating turn 1. Whether that mismatch is acceptable is a modelling decision; the systems cost is real either way.

**Slide 22 — Chat template quirks (continued).** The same diagram, plus the remedy: "Agent RL training frameworks often ship with their own custom chat template or 'renderers' that preserve sequence extension (e.g. Tinker, PrimeRL)." A renderer is code that turns a message list into tokens. A good RL renderer guarantees that rendering turn n+1 starts with exactly the tokens of turn n, for example by keeping past thinking or by appending only new tokens.

**Slide 23 — Token-In, Token-Out (TITO).** "In what format should we store and transport rollout/trajectory data from the inference engines to the trainer engines? 1. String 2. Tokens." A pause-and-think slide.

**Slide 24 — TITO (answer).** "String" is struck through in red; "Tokens" is in green. Two reasons: small, inconsistent transformations in string space can lead to inconsistent tokenizations between train and inference (e.g. a chat template adding whitespace); and tokenization is one-to-one, but de-tokenization is many-to-one. The figure: text "Hello" tokenizes to the single token Hello (4), but detokenizes from four different ID sequences: \[4\], \[1 H, 5 ello\], \[2 He, 6 llo\], \[3 Hel, 7 lo\].

Models sometimes sample non-canonical splits such as "He"+"llo". If the trainer re-tokenizes the string, it scores the canonical \[4\] instead. That is a token the policy never chose, with a different probability, and the importance ratio is meaningless for it. Keeping token IDs end to end, and building the next turn's prompt by appending IDs, removes the whole class of bugs. Hugging Face's TRL team describes the same principle in "Agentic RL: Token-In, Token-Out Done Right".

### Slides 25–33 · Async RL, harnesses and architecture

**Slide 25 — Async RL.** "Overlap inference and weight updates. Reduces GPU idle due to very long rollouts. Requires staleness/off-policy corrections." Two GPUs-versus-time charts, with a colour legend "weights through time" (lighter to darker blue) and hatching for "GPU idle".

- **Sync RL** (left): eight GPU rows generate in the lightest shade, each ending at a different time, with hatched idle tails until the longest finishes. Then all GPUs do "Optim step 0" and "Optim step 1" as vertical bands, then generate again in a darker shade. Bullet: co-locate train and inference engines (same GPUs shared by both).
- **Async RL** (right): the top four rows generate continuously, and their segments darken as weights advance. The bottom rows (the trainer) run "Optim step 0, 1, 2, 3" back to back after one initial idle block. Bullets: split GPUs between train and inference; agentic RL is often rollout-bound (long trajectories), so more GPUs can go to inference (e.g. a 3:1 ratio); requires *continuous batching* and *in-flight weight-update support*.

Citations: Pipeline RL, AReaL. This is the systems view of L11's sync-versus-async slides. The "off-policy correction" is L11's importance weight πθ/μ, usually truncated or clipped per token. The design knob is the maximum staleness η: how many weight versions old a sample may be before it is discarded. AReaL makes η explicit, and the "average staleness" metric on slide 43 monitors it. One subtle point: in the async chart, a single rollout's colour changes mid-bar. With in-flight updates (slide 26), one trajectory can contain tokens from several policy versions.

**Slide 26 — In-flight weight updates.** "Inference frameworks have evolved to accommodate RL systems needs. Example from SGLang docs." A screenshot of the `POST /pause_generation` endpoint. Its request body has one field, `mode` (default `abort`; options `abort`, `retract`, `in_place`):

- `abort`: same as the abort endpoint with `abort_all` set; pending requests from `waiting_queue` and `running_queue` are returned immediately to the caller.
- `retract`: put the engine in a "paused" state; move running requests back to the waiting queue; the KV cache can be flushed and recomputed later.
- `in_place`: put the engine in a "paused" state without changing request states; running requests rely on their KV caches to continue, so any subsequent `flush_cache` call will be unsuccessful.

The screenshot ends with `POST /continue_generation`. The typical RL sequence is pause → load new weights → (optionally flush cache) → continue. With `in_place`, the old KV cache was computed by old weights, a small additional inconsistency that PipelineRL-style systems accept for throughput. With `retract`, the prefix is recomputed under new weights. vLLM has a similar pause/resume feature for RL.

**Slide 27 — Complex harnesses (sub-agents, context compaction, etc.).** The slide body is a blank grid in the PDF (an animation shown live). Citations: Recursive Agent Optimization (RAO), 2026; Recursive Language Models (RLM), 2025. The message: real harnesses are not one growing sequence. They spawn sub-agents with fresh contexts, compact history (slide 19's Harness B) and call themselves recursively (RLM lets a model call sub-instances over pieces of a long context). For RL, one episode becomes a tree of sequences whose leaves must share the final reward, or get their own. RAO, from the lecturer's group, is an RL method for training such recursive agents to decide when and how to delegate.

**Slide 28 — System Design Choices.** Section divider for the architecture part.

**Slide 29 — Harness agnostic design.** Bullets: many popular agent harnesses (Codex, Claude Code, OpenHands, Pi, Hermes, Prime Agent, etc.). How to support them all? **Anti-pattern:** custom rollout/environment code for each harness. **Harness-agnostic pattern:** a middleman/proxy service that emulates inference APIs (chat-completions, responses, anthropic, etc.) → 0 code changes when using a new harness. The diagram: Pi (via the Responses API) and OpenHands (via the Chat Completions API) talk to a green **Middleman** inside a dashed "Inference Service" boundary. The middleman talks to the **Inference Engine** and reads and writes a purple **Rollout Store (logprobs, r3, etc.)**, which sends data to the **Trainer** outside the boundary. Credit: Agent Lightning.

This is a familiar pattern for anyone from RPA or integration work: put an adapter at a stable interface instead of modifying every client. The harness believes it is calling a normal model API. The proxy tags each call with a rollout ID, records token IDs and log-probs (TITO), and returns ordinary text to the harness. A design detail: the proxy must also know which calls belong to which episode, usually through a session header or a per-episode base URL.

**Slide 30 — Single Program Multiple Data (SPMD).** "One Python program runs on every GPU rank (simplified example pseudocode)." The code creates two process groups (train = ranks 0–3, infer = ranks 4–7), then branches. Ranks < 4 loop: next\_batch\_shard → forward\_backward → optimizer.step → publish\_weights\_async. The other ranks loop: refresh\_weights\_if\_ready → next\_prompt → rollout → enqueue\_trajectory. Side notes: all ranks create both groups in the same order (a requirement of torch.distributed collectives); ranks 0–3 do FSDP collectives and optimizer updates; ranks 4–7 do tensor/context-parallel decoding and weight refresh. Label: AReaL versions < 1.0. Footer: "Coordination lives in the program running on every rank. Straightforward with direct control of everything in a single program, but less flexible."

SPMD is how most PyTorch distributed training is written (torchrun launches N copies). It has no central point of failure and no RPC overhead. But it hard-codes the GPU split (4:4 here), makes elastic scaling difficult, and mixes algorithm logic with distributed plumbing.

**Slide 31 — Everything-as-a-service with a single controller.** "Illustrative service boundaries and API examples." Five octopuses around a central **Orchestrator / Controller**: **Agent Service** (yellow), **Env / Reward Service** (purple), **Trainer Service** (orange), **Inference Service** (blue), **Weight Sync Service** (green). The labelled links: Agent ↔ Env via **MCP**; Agent ↔ Orchestrator via **ACP**; Env ↔ Orchestrator via the **Open Reward Standard (ORS)**; Orchestrator ↔ Trainer via the **Tinker training API**; Agent ↔ Inference via the **Chat Completions/Responses API**; Inference ↔ Weight Sync via the **SGLang/vLLM API**; Trainer ↔ Weight Sync; Orchestrator ↔ Inference.

MCP (Model Context Protocol) is the tool/environment protocol from L2. ACP is most likely the Agent Client Protocol, a standard for driving coding agents from a client. ORS comes from General Reasoning's OpenReward platform (launched March 2026), which serves RL environments as API endpoints. The controller is the "single controller" design popularized by HybridFlow/veRL: one CPU process holds the algorithm and calls remote workers.

**Slide 32 — Everything-as-a-service: separation of concerns.** The same diagram plus a panel. Each of these components is fairly complex and specialized. Instead of all living in the same codebase: a lightweight orchestrator (a CPU training loop) lets researchers easily prototype different algorithms without complex dependencies; and project maintenance, updates and releases need not be synchronized. In practice, a new advantage estimator or loss becomes a change to a small Python loop, not to a Megatron fork.

**Slide 33 — Everything-as-a-service: modularity.** The same diagram with logos: harness logos near the agent service (including OpenAI's and Anthropic's marks), vLLM and SGLang near inference, trainer backends near the trainer service (including Thinking Machines), and "Hosted service (e.g. OpenReward) or self-hosted" near the env service. Panel: "Easy to swap a service implementation for another one as long as the same protocols are used for inter-service communication." This is classic interface-based design. The protocols are the contract; implementations are interchangeable.

### Slides 34–43 · Scaling out, new training regimes, metrics

**Slides 34–35 — Elastic scale up.** A build pair. Slide 34 shows the orchestrator/controller connected to a single inference-service octopus. Slide 35 replaces the octopus with a dashed box holding an **Inference Service Controller** that manages several inference octopuses ("…" between them). The orchestrator's view does not change; only the service's internals grow.

This is the payoff of the service boundary. Rollout demand in agentic RL varies: long-tail episodes, tool latency, or a curriculum that moves to harder tasks. A service controller can add replicas (spot or idle GPUs) when the trainer starts stalling, and release them later. The controller also does load balancing and, ideally, prefix-aware routing, sending a GRPO group's requests to the same replica so prefix caching (slide 10) still hits.

**Slide 36 — Multi-cluster / heterogeneous compute.** The same layout, but the two inference octopuses are now green with an NVIDIA logo ("8xH100") and red with an AMD logo ("4xMi350"). Inference replicas can run on different vendors and clusters, because each one only needs weights in and trajectories out. Caveat: different hardware and kernels give slightly different numerics, which widens the train–inference mismatch (slide 17, slide 43's importance\_weight\_max). TITO plus recorded log-probs and per-token importance correction keep this manageable.

**Slide 37 — Example: AstraFlow (Haizhong Zheng et al., 2026).** A world map titled "RaaS: Elastic · Heterogeneous · Cross Region" with regions Canada, Europe, Asia, Latin America, United States and Africa. Blue "Data" dots stream from distant regions into a **Data Acquisition** box. Below it are a **Trainer Pool** and a **Weight Manager** (orange "Weight" dots). RaaS presumably stands for "RL as a Service". The AstraFlow paper ("Dataflow-Oriented Reinforcement Learning for Agentic LLMs", May 2026) describes decoupling rollout services, dataflow management and training, and reports up to 2.7× faster training in multi-policy settings. Cross-region weight transfer is exactly where delta sync (slide 16) pays off.

**Slide 38 — Multi-policy training.** "Microservice architecture makes it easy to train multiple *different* models simultaneously (e.g. for multi-agent rollouts with heterogeneous policies)." An AstraFlow graphic shows Model 1 → Model 2 and Model 3 → Model 4, with an arc from Model 4 back to Model 1. Example uses: a planner model and an executor model trained together; a proposer and a verifier; or a main agent with a cheaper sub-agent model (linking back to slide 27). In an SPMD design, each extra model means rewriting the rank layout. In a service design, it is another trainer service plus a routing rule.

**Slide 39 — Online RL (training after deployment).** The AReaL 2.0 Online RL diagram. Left, a green **Agent Service (e.g. Hermes Agent)**: an Agent Controller over an Agent Workflow with Planning, Tool Execution, Sandbox ("execute") and Memory. Arrows labelled "LLM API call — base\_url, api\_key" go out and "model response" comes back. Right, the **AReaL 2.0 Online RL** box. The **Inference Service** contains an Inference Gateway → Router → Data Proxy 1…N → Inf. Worker 1…N, with dashed arrows from the workers to a **Trajectory Storage** cylinder. The **Training Service** contains Train Worker 1…N under a Training Controller that reads trajectory storage. A dashed "weight sync service" arrow returns from training to inference. Bottom: "Online RL in production at Cursor: Cursor Tab; Composer (new model checkpoint from real user interaction every 5 hours)."

The agent only knows a base URL and API key, which is the harness-agnostic proxy of slide 29 in production form. Data proxies record trajectories; rewards come from real outcomes. Cursor's public posts give concrete figures. The Tab blog (September 2025) describes shipping new Tab checkpoints every 1.5–2 hours, with 21% fewer suggestions and a 28% higher accept rate. The Composer post (March 2026) says the roughly five-hour cycle keeps data fully or almost fully on-policy. Online RL needs guardrails: offline evaluation gates before each deploy, and protection against reward hacking from noisy user signals.

**Slide 40 — Multi-tenant, multi-LoRA training.** A chart titled "Eight Concurrent vs Serial Experiments Stepwise Breakdown" (8× GSM8K, Qwen3-4B runs). On top, a **Serial Baseline** row: job 1's steps run to about 30 minutes, then Job 2, Job 3, …, Job 8 as grey "projected" blocks out to about 250 minutes (the axis has a break between 100 and 230). Below, **Multi-LoRA**: eight rows, Concurrent Run 1–8, all running together and finishing at roughly 85–90 minutes. Colours: sample (teal), train (yellow), weight sync (lavender). Bullets: eight concurrent runs beat eight serial runs in throughput (though each run's end-to-end time is longer); each concurrent LoRA run can be a different user of your training service; requires special Grouped-GEMM/SGMV kernels. Citations: SkyRL + Trajectory Labs, "Multi-LoRA Training for Continual Learning", 2026; Punica, "Multi-tenant LoRA Serving", 2023.

The Trajectory Labs write-up reports 2.81× higher end-to-end experiment throughput, with the last of eight experiments finishing at 5,433 s concurrently versus 15,244 s serially. The gain comes from filling idle gaps. While one run waits on rollouts, another trains, and SGMV lets many adapters share one decode launch. A single run's own time rises from about 30 to about 90 minutes, because it shares the GPUs.

**Slide 41 — Tinker.** Bullets: pioneered multi-tenant, multi-LoRA RL training and the decoupled training-service design; clean API design with a training client per training run and a sampling client per LoRA weight checkpoint. Four icons with descriptions: **forward\_backward** ("perform a forward pass and a backward pass, accumulating the gradient"), **optim\_step** ("update weights based on the accumulated gradient"), **sample** ("generate tokens for interaction, evaluation, or RL actions"), **save\_state** ("save training progress for resumption").

Compare with slide 3: the formula's operations, plus checkpointing, are the whole API. The user writes the RL loop (environment, rewards, advantages) on a laptop, and Tinker runs the GPU-heavy calls remotely on shared base models. A sampling client tied to a specific checkpoint makes the policy version explicit, which is useful for importance weights and staleness accounting.

**Slide 42 — Thank you, questions?** Next class: Sandboxing and Credential Management.

**Slide 43 — Some useful metrics to track/debug (backup).** A three-column table (Metric | What it tells you | Warning sign) with eight rows, reproduced in Detailed notes section 7: reward/pass@1, pass@k, entropy, importance\_weight\_max, grad norm, average staleness, trainer MFU, and timing (rollout, update, stall, total).

Three diagnostic patterns are worth memorizing. (1) pass@1 up, pass@k down, entropy falling: the policy is sharpening onto fewer solutions, i.e. mode collapse; consider entropy bonuses, higher temperature or a KL penalty. (2) importance\_weight\_max spiking in a sync run, where staleness is 0: the cause must be numerical or tokenization mismatch (TITO, chat template, MoE routing), not off-policyness. (3) Stall > 0 with staleness creeping up: inference cannot keep pace; add inference replicas (slide 35) or shift the GPU ratio.

## Going deeper

The ideas in this lecture have a long lineage in deep-RL systems. They also leave several hard problems open, and they come with a set of practical habits that save weeks of debugging.

### Lineage: from Atari actor-learners to LLM RL services

Splitting "acting" from "learning" is older than LLMs. **IMPALA** (Espeholt et al., DeepMind, 2018) ran many CPU actors that generated experience with slightly stale weights and one GPU learner that consumed it. It introduced **V-trace**, a truncated importance-weighting correction for exactly the staleness problem that async LLM RL faces today. **SEED RL** (Espeholt et al., 2019) moved inference to the central accelerator and kept only environment stepping on the actors, an early version of "inference as a service". **Ray** (Moritz et al., 2017) supplied the actor/task abstraction many current frameworks use for orchestration.

The RLHF era (2022–2024) brought the four-model PPO setup (policy, reference, reward, critic). It also produced systems such as DeepSpeed-Chat, OpenRLHF and NeMo-Aligner, which first glued vLLM to a training engine. **HybridFlow/veRL** (Sheng et al., 2024) formalized the *single-controller* pattern that slide 31 generalizes: one driver process holds the algorithm, and remote worker groups run multi-GPU computation. GRPO (DeepSeekMath, 2024) dropped the critic and made group sampling central, which is why prefix caching and prefix sharing became so valuable.

Agentic RL (2025–2026) added long multi-turn episodes, tool latency and sandboxes. That pushed the field toward async designs (AReaL, PipelineRL, PrimeRL), token-exact data paths (TITO), and harness-agnostic proxies (Agent Lightning, AReaL 2.0). The lecture's service architecture is the current endpoint of that trend.

### The training–inference mismatch, even without async

One point the slides imply but do not state: **a synchronous, fully on-policy RL run is still slightly off-policy.** The inference engine uses different kernels, batch sizes, reduction orders and sometimes precision (e.g. FP8 KV cache) than the trainer. So π\_rollout(a|h) and π\_train(a|h) differ for the same weights. Floating-point addition is not associative, so even the batch composition changes results. Thinking Machines' post "Defeating Nondeterminism in LLM Inference" (2025) traced this to batch-size-dependent kernels and proposed batch-invariant ones.

Practical consequences:

- Always send the rollout log-probs from the inference engine to the trainer, and compute an importance ratio π\_train/π\_rollout per token even in "on-policy" runs.
- Truncate or clip that ratio. Yao et al.'s 2025 note "Your Efficient RL Framework Secretly Brings You Off-Policy RL Training" popularized **truncated importance sampling (TIS)** for this purpose.
- Some groups reduce the mismatch at its source. For example, "Defeating the Training-Inference Mismatch via FP16" (2025) argues that FP16's extra mantissa bits shrink rounding differences compared with BF16.
- MoE routing (R3) and tokenization (TITO) are the two largest *discrete* sources of mismatch. Numerical noise is the continuous one.

### Memory placement: co-located versus disaggregated

Co-located (sync) designs put both engines on the same GPUs, so they must time-share memory. Typical tricks: the inference engine frees or offloads its weights and KV cache while training runs (vLLM's "sleep mode"), and the trainer offloads optimizer state while sampling. Disaggregated (async) designs avoid this juggling but need a network path for weights and accept staleness.

A useful rule of thumb from the slides: if rollout time dominates and episodes are long-tailed, disaggregate and give inference most GPUs (the 3:1 example). If episodes are short and uniform, co-location wastes little and is simpler.

### Parallelism vocabulary in one place

- **DP / FSDP / ZeRO:** replicate the model per GPU but shard parameters, gradients and optimizer state (ZeRO stages 1–3; PyTorch FSDP2 implements stage-3-style sharding). This is the default for training.
- **TP** (Megatron-LM): split matrices within a layer; needs fast intra-node links (NVLink).
- **PP:** split layers into stages; needs micro-batching to fill the "pipeline bubble".
- **CP / ring attention:** split the sequence; essential above roughly 64k tokens.
- **EP:** place MoE experts on different GPUs; needs all-to-all communication.

Resharding at weight-sync time means converting, for example, FSDP shards over 64 GPUs into TP = 8 shards over each inference node. That needs a gather/scatter plan, and frameworks precompute it once.

### Open problems

- **Credit assignment across broken sequences.** With compaction and sub-agents (slides 19–20 and 27), one reward must be shared across many sequences. It is unclear how to weight a summary-writing action or a sub-agent's work.
- **Environment throughput.** Many agent environments are containers (repositories, browsers, operating systems). Spinning up thousands of sandboxes, and securing them, is often the real bottleneck; the next lecture on sandboxing and credentials covers it.
- **Reward latency and cost.** LLM-judge rewards and long test suites make `verify` slow. Async reward services and caching help.
- **Online RL safety.** Training on live user traffic risks reward hacking via user-behaviour proxies, privacy leakage, and regressions shipped every few hours. Evaluation gates are mandatory.
- **Reproducibility.** Async scheduling, elastic replicas and heterogeneous hardware make two runs with the same seed diverge. Logging policy versions per token is the minimum for debugging.

### Practical engineering checklist

1. **Step-0 sanity check.** Before any update, compute π\_train/π\_rollout on a batch. The mean should be within about 1% of 1 and the max small. If not, fix tokenization, templates or routing before training.
2. **Round-trip test the renderer.** For a multi-turn episode, assert that the tokens of turn n are a prefix of turn n+1's prompt tokens.
3. **Never re-tokenize model output.** Store token IDs and log-probs from the engine.
4. **Log policy version per sample** (or per token with in-flight updates) and cap staleness.
5. **Watch the timing breakdown first.** Optimize the biggest bar: usually rollout, sometimes weight sync, rarely the optimizer step.
6. **Start synchronous and small** (one node, LoRA, short episodes). Add async and services only when stall time shows you need them.

## Worked example

This runnable sketch reproduces the lecture's TITO argument (slides 23–24) numerically: shipping strings instead of token IDs silently corrupts a sizeable fraction of RL samples, while shipping IDs leaves only tiny numerical noise.

The setup is a toy "policy": a bigram model over a 12-token vocabulary where the same text has several spellings ("Hello" = \[Hello\] = \[He, llo\] = \[Hel, lo\] = \[H, ello\]). The "inference engine" samples token IDs and records log-probs with small numerical noise; the "trainer" rescores with its own small noise. Path A sends IDs (TITO). Path B sends text and re-tokenizes it with a deterministic canonical tokenizer. Only Python and numpy are used; no LLM is called.

```python
"""TITO in miniature: why the trainer must receive token IDs, not strings."""
import numpy as np

VOCAB = ["<s>", "</s>", "Hello", "He", "llo", "Hel", "lo", "H", "ello", " world", " wor", "ld"]
ID = {t: i for i, t in enumerate(VOCAB)}
V = len(VOCAB)
rng = np.random.default_rng(0)

# Bigram logits: row = previous token, column = next token.
LOGITS = rng.normal(0.0, 1.0, size=(V, V))
LOGITS[:, ID["<s>"]] = -1e9                      # never generate <s>
LOGITS[ID["<s>"], ID["</s>"]] = -1e9             # no empty outputs

def log_softmax(x):
    x = x - x.max()
    return x - np.log(np.exp(x).sum())

def logprobs(seq, noise):
    """Per-token log-probs of seq[1:] given the previous token.
    `noise` mimics kernel/precision differences between engines."""
    out = []
    for prev, tok in zip(seq[:-1], seq[1:]):
        row = LOGITS[prev] + noise * rng.normal(size=V)
        out.append(log_softmax(row)[tok])
    return np.array(out)

def sample(max_len=6):
    seq = [ID["<s>"]]
    while len(seq) <= max_len:
        p = np.exp(log_softmax(LOGITS[seq[-1]]))
        nxt = int(rng.choice(V, p=p))
        seq.append(nxt)
        if nxt == ID["</s>"]:
            break
    return seq

def rollout():
    ids = sample()
    if ids[-1] != ID["</s>"]:
        ids.append(ID["</s>"])                    # truncated: force end
    return ids

def detokenize(seq):
    return "".join(VOCAB[t] for t in seq if t not in (ID["<s>"], ID["</s>"]))

def tokenize(text):
    """Canonical tokenizer: fewest-token segmentation (deterministic: one text
    -> one ID sequence), found by dynamic programming over string positions."""
    best = {0: []}
    for i in range(len(text)):
        if i not in best:
            continue
        for p in VOCAB[2:]:
            j = i + len(p)
            if text.startswith(p, i) and (j not in best or len(best[i]) + 1 < len(best[j])):
                best[j] = best[i] + [ID[p]]
    return [ID["<s>"]] + best[len(text)] + [ID["</s>"]]

INFER_NOISE, TRAIN_NOISE = 1e-3, 1e-3
n, changed = 2000, 0
max_tito, max_str, seq_ratio_str = 0.0, 0.0, []
for _ in range(n):
    ids = rollout()
    lp_rollout = logprobs(ids, INFER_NOISE)       # recorded by the engine

    # Path A: TITO. Same IDs, trainer numerics.
    lp_train = logprobs(ids, TRAIN_NOISE)
    max_tito = max(max_tito, float(np.abs(lp_train - lp_rollout).max()))

    # Path B: string round trip, then re-tokenize.
    ids_b = tokenize(detokenize(ids))
    if ids_b != ids:
        changed += 1
        lp_b = logprobs(ids_b, TRAIN_NOISE)
        # Token-level ratios no longer line up; compare whole-sequence log-probs.
        seq_ratio_str.append(abs(lp_b.sum() - lp_rollout.sum()))
        max_str = max(max_str, seq_ratio_str[-1])

print(f"rollouts sampled                 : {n}")
print(f"re-tokenized IDs differ (path B) : {changed} ({100*changed/n:.1f}%)")
print(f"TITO   max |log pi_train - log pi_rollout| per token : {max_tito:.4f}")
print(f"String max |seq log-ratio| on changed rollouts       : {max_str:.2f}"
      f"  (ratio up to {np.exp(max_str):.1e}x)")
print(f"String mean |seq log-ratio| on changed rollouts      : {np.mean(seq_ratio_str):.2f}")
ex = next(s for s in (rollout() for _ in range(500)) if tokenize(detokenize(s)) != s)
print("example sampled IDs :", [VOCAB[t] for t in ex])
print("after round trip    :", [VOCAB[t] for t in tokenize(detokenize(ex))])
```

Actual output (Python 3, numpy, seed 0):

```text
rollouts sampled                 : 2000
re-tokenized IDs differ (path B) : 328 (16.4%)
TITO   max |log pi_train - log pi_rollout| per token : 0.0054
String max |seq log-ratio| on changed rollouts       : 6.86  (ratio up to 9.5e+02x)
String mean |seq log-ratio| on changed rollouts      : 1.56
example sampled IDs : ['<s>', 'He', ' wor', ' world', 'ello', 'Hel', 'lo', '</s>']
after round trip    : ['<s>', 'He', ' wor', ' world', 'ello', 'Hello', '</s>']
```

**What to notice.**

- With TITO, the only train–inference gap is numerical noise: per-token log-prob differences stay below 0.006, so importance ratios stay within about 0.5% of 1.
- With strings, 16.4% of rollouts come back as *different actions*. In the example, the policy sampled "Hel" + "lo", but the trainer scores the single token "Hello", an action the policy never took.
- The whole-sequence probability can be off by a factor of up to about 950 (e^6.86). An importance-weighted loss would then let a few corrupted samples dominate, which is the `importance_weight_max` spike warned about on slide 43.
- The token sequences no longer even have the same length, so per-token loss masks and advantages (slide 20) cannot be aligned. Most real frameworks would silently misalign them.
- Real tokenizers (BPE) behave the same way: models occasionally sample non-canonical splits, and chat-template whitespace changes (slide 24) add more round-trip errors.

## More worked examples

Two more examples: a runnable simulator of sync versus async RL scheduling (slide 25), and a back-of-envelope capacity plan that applies slides 9, 10, 14, 16 and 20 to one realistic agentic GRPO step.

### Example A — Sync versus async RL on 8 GPUs (runnable)

The simulator is a small discrete-event model. A training step needs 64 finished rollouts. Rollout durations are long-tailed (lognormal, median 4 minutes), as in agentic RL. An optimizer step costs 16 GPU-minutes, so it is faster when more GPUs train. **Sync** co-locates both engines on all 8 GPUs. **Async** splits the GPUs n\_inf : (8 − n\_inf), tags every rollout with the policy version live when it started, and drops rollouts more than 2 versions stale. Only Python and numpy are used.

```python
"""Sync vs async RL scheduling on a fixed GPU budget (discrete-event toy)."""
import bisect
import heapq
import numpy as np

GPUS, BATCH, STEPS, SLOTS = 8, 64, 30, 8       # SLOTS = concurrent rollouts per GPU
TRAIN_GPU_MIN = 16.0                           # GPU-minutes per optimizer step

def durations(rng, n):
    return rng.lognormal(mean=np.log(4.0), sigma=0.8, size=n)   # minutes

def run_sync(seed=0):
    rng, t, busy = np.random.default_rng(seed), 0.0, 0.0
    for _ in range(STEPS):
        d = durations(rng, BATCH)
        # continuous batching inside each GPU: GPUS*SLOTS slots, refill on finish
        slots = [0.0] * (GPUS * SLOTS)
        for x in sorted(d, reverse=True):          # longest first (LPT)
            i = int(np.argmin(slots)); slots[i] += x
        gen = max(slots)
        busy += sum(slots) / SLOTS                  # GPU-minutes actually used
        train = TRAIN_GPU_MIN / GPUS
        busy += TRAIN_GPU_MIN
        t += gen + train
    return dict(wall=t, util=busy / (GPUS * t), stale=0.0, stall=0.0)

def run_async(n_inf, max_stale=2, seed=0):
    rng = np.random.default_rng(seed)
    train_time = TRAIN_GPU_MIN / (GPUS - n_inf)
    finish = []                                    # optimizer-step finish times
    published = lambda t: bisect.bisect_right(finish, t)   # weights live at t
    events = [(d, 0) for d in durations(rng, n_inf * SLOTS)]   # (end, version)
    heapq.heapify(events)
    done, stale, stall, dropped, busy_inf, t_free = [], [], 0.0, 0, 0.0, 0.0
    while len(finish) < STEPS:
        t_end, v0 = heapq.heappop(events)
        k = len(finish)                            # step this rollout would feed
        if k - v0 > max_stale:
            dropped += 1                           # too off-policy: discard
        else:
            done.append(v0)
        nd = durations(rng, 1)[0]                  # refill slot with live weights
        heapq.heappush(events, (t_end + nd, published(t_end)))
        busy_inf += nd / SLOTS
        if len(done) >= BATCH:                     # batch ready at t_end
            stale += [k - v for v in done[:BATCH]]
            done = done[BATCH:]
            if k > 0:
                stall += max(0.0, t_end - t_free)  # trainer idle, waiting on data
            t_free = max(t_end, t_free) + train_time
            finish.append(t_free)
    wall = t_free
    util = (min(busy_inf, n_inf * wall) + STEPS * TRAIN_GPU_MIN) / (GPUS * wall)
    return dict(wall=wall, util=util, stale=float(np.mean(stale)), stall=stall,
                dropped=dropped)

print(f"{'mode':<14}{'wall (min)':>11}{'GPU busy':>10}{'avg stale':>11}{'stall (min)':>13}{'dropped':>9}")
r = run_sync()
print(f"{'sync 8 shared':<14}{r['wall']:>11.1f}{r['util']:>10.0%}{r['stale']:>11.2f}{r['stall']:>13.1f}{0:>9}")
for n_inf in (4, 6, 7):
    r = run_async(n_inf)
    name = f"async {n_inf}:{GPUS - n_inf}"
    print(f"{name:<14}{r['wall']:>11.1f}{r['util']:>10.0%}{r['stale']:>11.2f}{r['stall']:>13.1f}{r['dropped']:>9}")
```

Actual output:

```text
mode           wall (min)  GPU busy  avg stale  stall (min)  dropped
sync 8 shared       846.5       26%       0.00          0.0        0
async 4:4           329.3       68%       0.82        197.5       18
async 6:2           251.6       96%       1.56          3.3      243
async 7:1           487.0       93%       1.90          0.0     2690
```

**What to notice.**

- **Sync wastes three-quarters of the GPUs.** Each step waits for the slowest of 64 long-tailed rollouts (about 26 minutes) while the median finished in 4. That is slide 25's hatched "GPU idle" region, in numbers.
- **4:4 is rollout-bound.** The trainer stalls for 197 minutes in total, the "Stall > 0" warning sign on slide 43. Moving GPUs to inference is the fix.
- **6:2 is the sweet spot here** (3:1, the ratio on slide 25). It is 3.4× faster than sync, with almost no stall and an average staleness of 1.6 versions. That staleness is why async needs L11's importance-weight corrections.
- **7:1 is trainer-bound.** Inference produces far more than the trainer can consume, so 2,690 rollouts exceed the staleness cap and are thrown away. The GPUs are "busy" but much of the work is wasted. Staleness rises and wall time doubles.
- The right ratio depends on the rollout/train cost balance, which shifts during training as episodes get longer. Elastic inference (slides 34–35) exists to track it.

### Example B — Capacity plan for one agentic GRPO step (numeric walkthrough)

**Scenario.** A Llama-3-8B-class policy (128 KB of KV per token in bf16, from slide 9; 8B parameters). One step uses 16 tasks × a GRPO group of 8 = 128 rollouts. The context has a 6k-token system prompt with tool definitions and a 2k-token task prompt. Each episode runs 12 turns of a 300-token action plus a 1,200-token observation, so 18k new tokens. The final context is 8k + 18k = 26k tokens.

**Step 1 — KV memory at the end of rollout.**

1. Without prefix caching: 26,000 tokens × 131,072 B ≈ 3.4 GB per rollout, × 128 ≈ **436 GB**.
2. With horizontal prefix caching (slide 10): the 6k system prompt is stored once, each 2k task prompt once per task (16 × 2k = 32k), plus 128 × 18k unique tokens. That is 2.342M tokens ≈ **307 GB**, a 30% saving.
3. Lesson: long unique continuations still dominate memory. You need several GPUs of KV (or fewer concurrent rollouts) no matter what.

**Step 2 — Prefill compute across turns.** Vertical reuse is where the big win lies.

1. Without reuse, turn t re-prefills its whole context: 8,000 + (t − 1) × 1,500 tokens. Summed over 12 turns: 12 × 8,000 + 1,500 × (0 + 1 + … + 11) = 96,000 + 99,000 = **195,000 prefill tokens per rollout**.
2. With extension-preserving caching, only new non-generated tokens are prefilled: the 8k prompt plus 12 observations × 1,200 = **22,400 tokens**.
3. That is about 8.7× less prefill. A chat template that strips past thinking (slides 21–22) breaks the cache at every turn and pushes you back toward the first number.

**Step 3 — Training tokens: Harness A versus B (slides 19–20, 14).**

1. Harness A, dense: one 26k datapoint per rollout, 128 × 26k = **3.33M tokens** through forward and backward.
2. Harness A with prefix sharing: the 8k prompt once per group, so 16 × 8k + 128 × 18k = **2.43M tokens**, 27% fewer. (With longer prompts or shorter answers, this approaches ZoRRo's 80–95% duplicates.)
3. Harness B, compacting every 4 turns into a 1k summary: three datapoints per rollout of 14k, 15k and 15k tokens (8k prompt + 1k summary + 6k new), so **44k tokens per rollout**, 1.69× Harness A's 26k. The extra tokens are repeated context with zero loss but full compute cost.

**Step 4 — Weight sync (slide 16).** Assume a 100 Gb/s link (12.5 GB/s) within a cluster and 10 Gb/s (1.25 GB/s) across regions.

| Model | Full sync size | Full sync time (100 / 10 Gb/s) | Delta at 1% (2-byte value + 4-byte index) | Delta time (100 / 10 Gb/s) |
| --- | --- | --- | --- | --- |
| 8B | 16 GB | 1.3 s / 13 s | 0.48 GB | 0.04 s / 0.4 s |
| 1T | 2 TB | 160 s / 1,600 s (27 min) | 60 GB | 4.8 s / 48 s |

**What to notice.**

- For small models, weight sync is negligible next to a multi-minute rollout. For trillion-parameter models, a full sync can take minutes, as long as an optimizer step. Delta sync turns cross-region training (AstraFlow, slide 37) from impractical into feasible.
- Index overhead matters. At 1% density, 4-byte indices triple the payload compared with values alone. Real systems use bitmasks or compressed index runs.
- Memory is limited by unique continuations; compute is limited by repeated prefixes. Prefix caching (inference) and prefix sharing (training) attack the compute side, while KV memory needs paging, offloading or context parallelism.
- Every saving in Steps 2–3 depends on exact token prefixes. That is why the lecture spends four slides on sequence extension, templates and TITO.

## Key terms

| Term | Meaning |
| --- | --- |
| Activation checkpointing | Store only each layer's input during the forward pass and recompute internals during backward; trades about +33% compute for much less activation memory |
| Async RL | Inference and training run concurrently on separate GPUs; removes idle time from long rollouts but makes data stale, so it needs off-policy corrections |
| Chat template / renderer | Code that turns a list of messages into tokens; RL frameworks ship custom renderers so each turn's tokens extend the previous turn's |
| Continuous batching | Iteration-level scheduling: finished sequences leave the batch at each decode step and queued requests take their slots (Orca) |
| Delta weight sync | Sending only the parameters whose bf16 value changed after an update (about 1% in RL) instead of the full model |
| Everything-as-a-service | Architecture where agent, environment/reward, inference, trainer and weight sync are separate services coordinated by a lightweight single controller |
| Harness-agnostic proxy (middleman) | A service that emulates standard inference APIs so any agent harness can be trained unchanged, while it records tokens, log-probs and routing data |
| In-flight weight update | Loading new weights into a running inference engine by pausing (abort, retract or in-place) and continuing generation |
| Inference engine vs trainer engine | The decode-optimized, gradient-free sampler (vLLM, SGLang) versus the gradient-computing system for forward/backward and optimizer steps (Megatron, FSDP2) |
| KV cache | Stored key and value vectors of past tokens so each new token attends without recomputation; about 128 KB per token for Llama-3-8B in bf16 |
| Multi-LoRA (multi-tenant) training | Many LoRA adapters, possibly from different users, trained concurrently on a shared base model using Grouped-GEMM/SGMV kernels |
| Online RL | Training on trajectories from a deployed product's real users, with frequent checkpoint releases (e.g. Cursor Tab, Composer) |
| Prefix caching | Reusing cached KV for token prefixes shared across requests or turns (SGLang RadixAttention, vLLM Automatic Prefix Caching) |
| Prefix sharing | Training-side counterpart: compute a shared prefix once in forward and backward with a tree attention mask (ZoRRo, AReaL-DTA) |
| Rollout Routing Replay (R3) | Recording MoE expert choices made during rollout and forcing the trainer to use the same experts |
| Sequence extension property | Each turn's context contains the previous turn's exact tokens as a prefix; enables cache reuse and one datapoint per episode |
| SPMD | Single Program Multiple Data: one program runs on every GPU rank and branches on rank to train or infer |
| Speculative decoding | A cheap drafter proposes k tokens that the policy verifies in one pass; rejection sampling keeps the exact distribution |
| Staleness | How many policy versions old a training sample is (version trained minus version that generated it) |
| Token-In, Token-Out (TITO) | Passing token IDs, not strings, from inference to trainer so the trainer scores exactly what was sampled |

## Self-check

1. Map each part of the policy-gradient update θ += Σₜ (R(τ) − b(hₜ)) ∇θ log πθ(aₜ | hₜ) to a system operation. **Answer:** R(τ) comes from `env.verify`; hₜ and aₜ come from `env.state`/`env.step` driven by the agent harness and the sampling engine; πθ(aₜ | hₜ) is the trainer's `forward`; ∇θ is `backward`; "+=" is `optim_step`. Tinker's API (`sample`, `forward_backward`, `optim_step`, `save_state`) packages exactly these.
2. Why do RL frameworks use separate inference and training engines instead of one PyTorch program? **Answer:** Sampling is decode-heavy, sequential and memory-bandwidth bound, and needs KV caching, continuous batching and paged memory. Training is prefill-style, parallel, compute bound and needs autograd, checkpointing and sharded optimizers. Specialized engines (vLLM/SGLang versus Megatron/FSDP2) are far faster at each than a single generic loop.
3. Estimate the KV cache for 16 rollouts of 32k tokens with Llama-3-8B in bf16. **Answer:** 128 KB/token × 32,768 tokens ≈ 4 GB per rollout, so about 64 GB for 16. That is most of an 80 GB GPU before the 16 GB of weights, so 16 such rollouts barely fit on one GPU even with perfect paging.
4. What are the two kinds of prefix reuse in agentic RL, and which needs the sequence extension property? **Answer:** Horizontal reuse shares a task prompt across the rollouts of a GRPO group. Vertical reuse shares a rollout's history across its own turns. Vertical reuse requires that each turn's tokens begin with exactly the previous turn's tokens, which is the sequence extension property; compaction or thinking-stripping templates break it.
5. Why does a frozen speculative-decoding drafter become less useful during RL, and what is the fix? **Answer:** The policy changes every step, so the drafter's guesses match it less and less and the acceptance rate decays. Correctness is unaffected because rejection sampling keeps the policy's distribution exact. The fix is to train the drafter online, e.g. by SFT or distillation on fresh rollouts.
6. Why are about 99% of parameters unchanged after an RL step, and how does that help? **Answer:** RL learning rates are tiny, and most fp32 updates are smaller than half the spacing of bf16 values, so the bf16 copy does not change. Sending only changed entries (delta sync, as in PULSE) cuts sync traffic by around 100×, which matters for trillion-parameter models and cross-region inference.
7. What problem does Rollout Routing Replay solve, and what does it require of the inference engine? **Answer:** In MoE models, tiny numerical differences can make the trainer's router pick different experts from the inference router, so the trainer scores a different sub-network and the importance ratios become noisy. R3 records rollout expert choices and replays them in training. The inference engine must export the routing decisions alongside tokens and log-probs.
8. Harness A appends history; Harness B compacts every two observations. Which trains more efficiently and why? **Answer:** Harness A: the whole episode is one datapoint with a loss mask on the action tokens. Harness B produces one datapoint per segment, each repeating the task prompt (and summary) as context with zero loss but full compute. B may still be the better agent design for long tasks, so the real choice is a trade-off.
9. Give two reasons to ship token IDs rather than strings from inference to training. **Answer:** String transformations such as template whitespace can change tokenization between the two sides. De-tokenization is many-to-one, so re-tokenizing a sampled string can produce a canonical token sequence the model never sampled, with a different probability.
10. In an async run, `stall` is large and staleness is low. What is going on and what would you change? **Answer:** The trainer is waiting for rollouts: the system is rollout-bound. Move GPUs from training to inference (e.g. toward 3:1), add elastic inference replicas, or speed up rollouts with prefix caching and speculative decoding.
11. pass@1 rises while pass@k falls and entropy drops. What does this indicate? **Answer:** The policy is collapsing onto fewer solutions: it gets more reliable on what it already solves but loses coverage. Consider entropy regularization, a KL penalty, higher sampling temperature, or more diverse tasks, and check held-out evaluations for reward hacking.
12. How would you design an RL system that can train any agent harness (Codex, Claude Code, OpenHands) without modifying it? **Answer:** Put a middleman proxy in front of the inference engine that speaks the harnesses' APIs (Chat Completions, Responses, Anthropic). Tag each request with an episode ID, record exact token IDs, log-probs and routing data in a rollout store, and feed the trainer from that store. Rewards come from an environment/reward service, and a controller orchestrates the loop.

## Practice problems

Exam-style problems on calculation, design, critique and debugging. Try each before reading the solution.

1. **KV budget.** A model has 36 layers, 8 KV heads and head dimension 128, with a bf16 KV cache. One 80 GB GPU holds 16 GB of weights and reserves 8 GB for activations and fragmentation. How many 24k-token agent trajectories can decode concurrently? What changes with an FP8 KV cache? **Solution:** KV per token = 2 × 36 × 8 × 128 × 2 bytes = 147,456 B (144 KB). One 24,000-token trajectory needs 24,000 × 147,456 ≈ 3.54 GB. Free memory is 80 − 16 − 8 = 56 GB, so 56 / 3.54 ≈ 15.8, i.e. 15 concurrent trajectories at full length. FP8 halves the per-token cost to 72 KB, allowing about 31. A GRPO group of 16 with 4 tasks (64 rollouts) therefore needs about 5 such GPUs in bf16, or 3 in FP8, unless prefix caching shares the prompts. FP8 KV adds another small source of train–inference mismatch, so watch `importance_weight_max`.
2. **Checkpointing cost.** Take forward = 1 unit of compute and backward = 2 units. (a) What is the overhead of full activation recompute? (b) If attention internals are 10% of forward FLOPs but 50% of activation memory, what does selective recompute of attention cost, and what does it save? **Solution:** (a) Full recompute repeats the forward during backward: 1 + 2 + 1 = 4 units versus 3, so +33%, as on slide 13. (b) Selective recompute repeats only the attention part: 1 + 2 + 0.1 = 3.1 units, about +3.3% compute. It frees roughly half the activation memory. This is why Korthikanti et al. (2022) recommend recomputing only the cheap-but-large tensors. Use full recompute only when the remaining half still does not fit.
3. **Prefix-sharing payoff.** A GRPO batch has groups of G = 16 rollouts. Each prompt has 3,000 tokens and each response averages 500. What fraction of trainer tokens are duplicated prompt tokens, and what is the upper bound on token-count speed-up from sharing? **Solution:** One group has 16 × (3,000 + 500) = 56,000 tokens. Of these, 15 × 3,000 = 45,000 are repeated prompt copies, so 80% are duplicates, inside ZoRRo's reported 80–95% range. With sharing, the group costs 3,000 + 16 × 500 = 11,000 tokens, an upper bound of 56,000 / 11,000 ≈ 5.1× in tokens processed. Real speed-ups differ because attention cost is not linear in tokens and tree masks add overhead. Snowflake reports up to 6× for longer prompts.
4. **Why delta sync is exact.** A weight is 0.02 and is updated by about 1e-6 per step with a consistent sign. The trainer keeps fp32 master weights; inference uses bf16. When does the bf16 value change? Does sending only changed bf16 values lose information? **Solution:** 0.02 lies in \[2⁻⁶, 2⁻⁵), where bf16 (7 stored mantissa bits) has spacing 2⁻⁶ × 2⁻⁷ = 2⁻¹³ ≈ 1.22e-4. Rounding flips after the fp32 value moves about half a spacing, 6.1e-5, which takes about 61 steps. In each of the other steps the bf16 cast is identical, so nothing needs sending. Delta sync is therefore lossless relative to the bf16 model the inference engine would have received anyway. The small updates are not discarded; they accumulate in the fp32 master copy until they cross a rounding boundary.
5. **Debugging a trajectory.** A synchronous GRPO run on a Qwen3 thinking model shows `importance_weight_max` near 1 for tokens in turn 1 of every episode, but values up to 40 in turns 2 and later. Staleness is 0 and the model is dense (no MoE). What is the most likely cause, and how do you confirm and fix it? **Solution:** With zero staleness and no routing, large ratios mean the trainer is conditioning on a different context from the one used at sampling. The turn-dependence points to a renderer that breaks sequence extension: Qwen3's default template strips past thinking, so the trainer's re-rendered turn-2 context lacks the turn-1 reasoning the engine saw. To confirm, render turn 2 both ways and assert that turn 1's tokens are a prefix; they will not be. Fix it with an extension-preserving renderer (keep thinking in history, as Tinker and PrimeRL do), or by building each turn's prompt from stored token IDs (TITO). Re-check that ratios at step 0 are about 1.
6. **Ratio products.** An async rollout is one version stale. Each of its 200 action tokens has πθ/μ = 1.02. What is the sequence-level ratio, and what does this imply for the correction design? **Solution:** 1.02²⁰⁰ = e^(200 × ln 1.02) ≈ e^3.96 ≈ 52. One trajectory would get 52 times normal weight from a per-token mismatch of only 2%. This is L11's "mismatch grows along a response" problem. It is why PPO/GRPO-style methods use per-token ratios with clipping, why GSPO length-normalizes the sequence ratio, and why systems cap staleness. Watching `importance_weight_max` together with average staleness shows whether the cap is tight enough.
7. **Speculative decoding yield.** A drafter proposes k = 4 tokens. Assume each is accepted independently with probability α. The expected number of tokens produced per policy pass is (1 − α^(k+1)) / (1 − α) (Leviathan et al., 2023). Compare α = 0.8 with α = 0.5, and explain the RL implication. **Solution:** For α = 0.8: (1 − 0.8⁵) / 0.2 = (1 − 0.328) / 0.2 ≈ 3.36 tokens per pass. For α = 0.5: (1 − 0.5⁵) / 0.5 ≈ 1.94 tokens per pass. Ignoring drafter cost, the speed-up nearly halves. In RL, a frozen drafter's α drifts from the first number toward the second as the policy moves, so the slide's advice to train the drafter online is worth roughly a 1.7× difference in decode throughput here. Correctness is unaffected either way.
8. **Broken extension cost.** An episode has a 2,000-token prompt and 20 turns, each adding 1,000 tokens (action plus observation). Compare total trainer tokens when extension holds versus when it breaks at every turn (each turn becomes its own datapoint containing its full context). **Solution:** With extension, one datapoint covers everything: 2,000 + 20 × 1,000 = 22,000 tokens. Broken at every turn, datapoint i has 2,000 + 1,000i tokens, so the total is 20 × 2,000 + 1,000 × (1 + … + 20) = 40,000 + 210,000 = 250,000 tokens, about 11.4× more. This is the O(T) versus O(T²) contrast in Tinker's documentation. Attention cost grows faster still, because each datapoint's attention is quadratic in its own length.
9. **Multi-LoRA trade-off.** Eight LoRA runs each take 30 minutes alone. Run concurrently on the same GPUs, all eight finish at 90 minutes. Compute the throughput gain and the latency cost. When would you still run serially? **Solution:** Serially, eight runs take 240 minutes, i.e. 1 run per 30 minutes. Concurrently, 8 runs take 90 minutes, i.e. 1 per 11.25 minutes, a 2.67× throughput gain (close to Trajectory Labs' reported 2.81×). Each run's own latency triples, from 30 to 90 minutes. Serial or prioritized scheduling is better when a decision depends on one result (e.g. sequential hyperparameter search) or a user needs a single run back quickly. Concurrent wins for sweeps and multi-tenant services.
10. **Architecture critique.** A team's SPMD trainer hard-codes 4 training and 4 inference ranks on one node. They now want to add an LLM-judge reward model, burst inference onto a spare AMD MI350 cluster, and train a planner and an executor policy together. Critique the current design and propose a new one. **Solution:** SPMD puts all coordination in one program with a fixed rank layout. Adding a judge, a second vendor's GPUs or a second policy means rewriting process groups and collectives, and the whole system must share one codebase and release cycle (slide 30). A service design fits better (slides 31–38): an orchestrator; an inference service with its own controller that can add MI350 replicas elastically; an env/reward service hosting the judge behind a reward protocol such as ORS; two trainer services (planner, executor); and a weight-sync service using delta sync across clusters. Cross-vendor numerics will widen the mismatch, so keep TITO, record rollout log-probs, and correct per token.
11. **Online RL guardrails.** You are asked to retrain a customer-support agent every few hours from live conversations, as Cursor does for Composer. List the system components and three safeguards. **Solution:** Components: the deployed agent calls a proxy inference gateway (base URL plus key) that records token IDs and log-probs per session; a trajectory store; a reward service turning outcomes (ticket resolved, no reopen, user feedback) into rewards; a training service; weight sync; and a release pipeline. Safeguards: (1) an offline evaluation gate on a fixed benchmark before each checkpoint ships, to catch regressions and reward hacking; (2) privacy filtering and consent handling before conversations enter the training store; (3) caps on staleness and on update size (KL or clipping), plus a fast rollback path. A short release cycle also keeps data nearly on-policy, which is the argument in Cursor's Composer post.

## References and further reading

Links were checked in October 2026. arXiv abstract pages are preferred.

### Cited in the lecture

- [Efficient Execution of Structured Language Model Programs (SGLang, RadixAttention)](https://arxiv.org/abs/2312.07104) — Zheng et al., 2023 — the radix-tree prefix cache behind slide 10; see also the [LMSYS RadixAttention blog post](https://lmsys.org/blog/2024-01-17-sglang/).
- [vLLM Automatic Prefix Caching design doc](https://docs.vllm.ai/en/latest/design/prefix_caching.html) — vLLM project — how vLLM hashes KV blocks to reuse shared prefixes.
- [Orca: A Distributed Serving System for Transformer-Based Generative Models](https://www.usenix.org/conference/osdi22/presentation/yu) — Yu et al., OSDI 2022 — origin of iteration-level scheduling (continuous batching).
- [Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192) — Leviathan, Kalman, Matias, 2023 — the exact rejection-sampling scheme and expected-speed-up analysis.
- [Training Deep Nets with Sublinear Memory Cost](https://arxiv.org/abs/1604.06174) — Chen et al., 2016 — the original gradient (activation) checkpointing paper.
- [Reducing Activation Recomputation in Large Transformer Models](https://arxiv.org/abs/2205.05198) — Korthikanti et al., 2022 — selective recomputation and sequence parallelism in Megatron.
- [Snowflake Arctic RL unified post-training backend and ZoRRo](https://www.snowflake.com/en/developers/guides/arctic-rl-unified-post-training-backend/) — Snowflake AI Research, 2026 — source of the 80–95% duplicate-token and 6× actor-update figures.
- [AReaL-DTA: Dynamic Tree Attention for Efficient Reinforcement Learning of Large Language Models](https://arxiv.org/abs/2602.00482) — Zhang et al., ICML 2026 — prefix-tree training with DFS; up to 8.31× over dense on τ²-bench.
- [Parallelisms — NVIDIA NeMo Framework User Guide](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/features/parallelisms.html) — NVIDIA — the DP/TP/PP/CP/EP figures on slide 15.
- [Understanding and Exploiting Weight Update Sparsity for Communication-Efficient Distributed RL (PULSE)](https://arxiv.org/abs/2602.03839) — Miahi & Belilovsky, 2026 — shows about 99% of updates vanish after the bf16 cast; over 100× less sync traffic.
- [Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers (R3)](https://arxiv.org/abs/2510.11370) — Ma et al., 2025 — Rollout Routing Replay.
- [Sequence Extension — Tinker documentation](https://tinker-docs.thinkingmachines.ai/rl/sequence-extension) — Thinking Machines — the extension property, Qwen3 thinking-stripping and O(T) versus O(T²) compute.
- [No Token Left Behind: Demystifying Token-In-Token-Out in Miles](https://lmsys.org/blog/2026-05-13-no-token-left-behind) — Miles team (LMSYS), 2026 — TITO, chat-template cut-thinking boundaries and many-to-one detokenization.
- [PipelineRL: Faster On-policy Reinforcement Learning for Long Sequence Generation](https://arxiv.org/abs/2509.19128) — Piché et al., 2025 — in-flight weight updates for async RL.
- [AReaL: A Large-Scale Asynchronous Reinforcement Learning System for Language Reasoning](https://arxiv.org/abs/2505.24298) — Fu et al., NeurIPS 2025 — fully async RL with staleness control; the SPMD example is from AReaL < 1.0.
- [AReaL repository (AReaL 2.0 microservice architecture, online RL)](https://github.com/areal-project/AReaL) — Tsinghua IIIS and Ant Group, 2026 — source of slide 39's online-RL diagram.
- [SGLang documentation](https://docs.sglang.ai/) — SGLang project — includes the `pause_generation` / `continue_generation` endpoints on slide 26.
- [Recursive Agent Optimization (RAO)](https://arxiv.org/abs/2605.06639) — Gandhi, Chakraborty, Wang, Kumar, Neubig, 2026 — RL for agents that recursively spawn sub-agents (the lecturer's work).
- [Recursive Language Models (RLM)](https://arxiv.org/abs/2512.24601) — Zhang, Kraska, Khattab, 2025 — models that recursively call themselves over long contexts.
- [Agent Lightning: Train ANY AI Agents with Reinforcement Learning](https://arxiv.org/abs/2508.03680) — Luo et al. (Microsoft), 2025 — the harness-agnostic middleman pattern on slide 29.
- [Introducing OpenReward](https://www.gr.inc/releases/introducing-openreward) — General Reasoning, 2026 — hosted RL environments and the Open Reward Standard (ORS).
- [Tinker](https://www.thinkingmachines.ai/tinker) — Thinking Machines Lab, 2025 — the multi-tenant LoRA training API (`forward_backward`, `optim_step`, `sample`, `save_state`); see also the [announcement post](https://thinkingmachines.ai/blog/announcing-tinker/).
- [AstraFlow: Dataflow-Oriented Reinforcement Learning for Agentic LLMs](https://arxiv.org/abs/2605.15565) — Zheng et al., 2026 — elastic, heterogeneous, cross-region and multi-policy RL.
- [Online RL for Cursor Tab](https://cursor.com/blog/tab-rl) — Cursor, 2025 — policy-gradient training on live accept/reject signals.
- [Real-time RL for Composer](https://cursor.com/en/blog/real-time-rl-for-composer) — Cursor, 2026 — a new checkpoint about every five hours from real user interactions.
- [Multi-LoRA Training for Continual Learning](https://www.trajectory.ai/field-notes/multi-lora-training-for-continual-learning) — Trajectory Labs with SkyRL (UC Berkeley Sky Lab) and Anyscale, 2026 — source of slide 40's chart (2.81× throughput).
- [Punica: Multi-Tenant LoRA Serving](https://arxiv.org/abs/2310.18547) — Chen et al., 2023 — introduced the SGMV kernel for batching many LoRA adapters.
- [Model Context Protocol](https://modelcontextprotocol.io/) and [Agent Client Protocol](https://agentclientprotocol.com/) — the MCP and ACP labels on slide 31's service diagram.

### Further reading

- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., 2023 — the vLLM paper; why paged KV memory matters for many long rollouts.
- [HybridFlow: A Flexible and Efficient RLHF Framework (veRL)](https://arxiv.org/abs/2409.19256) — Sheng et al., 2024 — the single-controller design that slide 31 generalizes.
- [IMPALA: Scalable Distributed Deep-RL with Importance Weighted Actor-Learner Architectures](https://arxiv.org/abs/1802.01561) — Espeholt et al., 2018 — the original actor-learner split with V-trace staleness correction.
- [Your Efficient RL Framework Secretly Brings You Off-Policy RL Training](https://fengyao.notion.site/off-policy-rl) — Yao et al., 2025 — the train–inference mismatch in "on-policy" runs and truncated importance sampling.
- [Defeating Nondeterminism in LLM Inference](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) — He et al. (Thinking Machines), 2025 — why batch composition changes numerics, and batch-invariant kernels.
- [Defeating the Training-Inference Mismatch via FP16](https://arxiv.org/abs/2510.26788) — 2025 — argues FP16 reduces RL mismatch compared with BF16.
- [Agentic RL: Token-In, Token-Out Done Right](https://huggingface.co/blog/huggingface/tito) — Hugging Face, 2026 — a second practical take on TITO.
- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) — Rajbhandari et al., 2019 — the sharding idea behind FSDP.
- [Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism](https://arxiv.org/abs/1909.08053) — Shoeybi et al., 2019 — tensor parallelism explained.
- [Ring Attention with Blockwise Transformers for Near-Infinite Context](https://arxiv.org/abs/2310.01889) — Liu, Zaharia, Abbeel, 2023 — the rotating-KV context parallelism on slide 15.
- [DistServe: Disaggregating Prefill and Decoding](https://arxiv.org/abs/2401.09670) — Zhong et al., 2024 — the prefill/decode disaggregation mentioned on slide 11.
- [The Ultra-Scale Playbook: Training LLMs on GPU Clusters](https://huggingface.co/spaces/nanotron/ultrascale-playbook) — Hugging Face (Nanotron), 2025 — a hands-on guide to DP/TP/PP/CP/EP and memory budgeting.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]]
- Topic deep dive: [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- [[The State of LLM Reasoning Model Inference]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]

[[L11 - Advanced RL|← L11]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L13 - Agent Safety|L13 →]]
