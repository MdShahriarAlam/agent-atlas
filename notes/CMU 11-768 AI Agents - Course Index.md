---
tags: [cmu-ai-agents, ai-llms, moc, agents, course-notes]
aliases: ["CMU 11-768", "AI Agents course"]
source: "CMU 11-768 AI Agents, Fall 2026 (Daniel Fried, Graham Neubig)"
---

# CMU 11-768 AI Agents (Fall 2026) — Course Index

Map of content for the CMU 11-768 *AI Agents* study notes: 21 lecture sheets (Lectures 1–15 and 17–22; Lecture 16's slides are not in yet), 15 topic deep dives, a shared glossary and a core reading list. Lectures 1–8 and 12–15 are expanded with a slide-by-slide companion, deeper-dive notes, extra worked examples and practice problems; Lectures 9–11 have the standard sheet, and Topics 10–12 cover their material in depth.

## How the notes are organised

- **Lectures/** — one note per lecture, in course order. Layout: Overview → Concept map → Detailed notes → (Slide-by-slide companion) → Going deeper → Worked examples → Key terms → Self-check → (Practice problems) → References.
- **Topics/** — one deep dive per concept, pulling together every lecture that covers it. Layout: Overview → Concept map → Core concepts → Across the lectures → Mechanics → Hands-on → Patterns & checklist → Landscape → Open problems → Glossary → Practice questions → References.
- Tags: `#cmu-ai-agents` on every note, `#lecture-notes` / `#topic-deep-dive` by type, plus subject tags such as `#agents`, `#tool-use`, `#mcp`, `#context-engineering`, `#memory`, `#planning`, `#coding-agents`, `#computer-use`, `#fine-tuning`, `#reinforcement-learning`, `#rag` and `#evaluation`.
- Diagrams live in `/images/` as `cmu-ai-agents-*.png`.

## Course map

![[cmu-ai-agents-course-map.png]]

Read top down: L1 defines the loop; L2–L5 add capabilities around it; L6, L7 and L10 apply it to real domains; L14 shows a full framework (OpenHands) that packages it, and L15 shows how to fix known procedures as orchestrated workflows and monitor what agents do; L17–L19 turn to interaction, with people at work, with other agents, and in day-to-day collaboration; L20 spends test-time compute searching over many trajectories and selecting, refining and reusing them, and L21 structures that search over partial solutions, simulated futures and delegated subtasks; L22 asks how people can trust agents once generation is cheap and checking is the bottleneck; L8 → L9 → L11 → L12 train the model that drives every application and build the systems that run that training at scale; L13 wraps every layer in safety limits.

## Lectures

| # | Lecture | Speaker | Core claim | Sheet |
| --- | --- | --- | --- | --- |
| 1 | [[L01 - What Are Agents\|What Are Agents? And How Do They Work?]] | Daniel Fried, Graham Neubig | An agent is an LLM in a loop: it proposes actions as tokens, and a harness validates, executes and feeds back results. | Expanded |
| 2 | [[L02 - Tool Use\|Tool Use for Language Model Agents]] | Graham Neubig | The model only proposes structured calls; schemas, templates, constrained decoding and MCP make them reliable in form, not in correctness. | Expanded |
| 3 | [[L03 - Long-Context Agents\|Context Management for Long-Context Agents]] | Graham Neubig | History grows every step, so context must be managed at the architecture, training, serving/caching and compaction layers. | Expanded |
| 4 | [[L04 - Memory and Skills\|Memory and Skills]] | Daniel Fried | Agents improve without retraining by turning experience into facts, lessons, episodes and skills that are induced, verified, retrieved and maintained. | Expanded |
| 5 | [[L05 - Planning and Task Decomposition\|Planning and Task Decomposition]] | Daniel Fried | Explicit plans pay off only under modularity, feedback, long-horizon or control pressures; every bit of structure has a cost. | Expanded |
| 6 | [[L06 - Coding Agents\|Agents for Coding and Software Development]] | Graham Neubig | Strong coding agents combine a trained code model, a localize–edit–verify harness, and executable tests used as benchmark, data and reward. | Expanded |
| 7 | [[L07 - Computer Use Agents\|Computer Use Agents]] | Jing Yu Koh | Screen-driven agents need behavior-matched evaluators and a grounding → SFT → RL pipeline in resettable, verifiable environments. | Expanded |
| 8 | [[L08 - SFT for Agents\|Supervised Fine-Tuning for Agents]] | Yueqi Song | SFT renders trajectories as token sequences and trains only on agent tokens; data choice, formatting and masking decide the result. | Expanded |
| 9 | [[L09 - RL Foundations\|RL Foundations for Agents]] | Daniel Fried | Sampling from the agent and weighting log-probs by relative reward fixes SFT's mismatches; REINFORCE, GRPO and DrGRPO differ only in that weight. | Standard |
| 10 | [[L10 - Deep Research Agents\|Deep Research Agents]] | Akari Asai | Good research agents need synthesis-aware evaluation, training beyond exact-match rewards, and retrievers that see the agent's reasoning. | Standard |
| 11 | [[L11 - Advanced RL\|Advanced RL Algorithms for Agents]] | Graham Neubig | Practical agent RL adds credit assignment, async rollouts with importance sampling, clipped updates, reliable rewards and distillation. | Standard |
| 12 | [[L12 - RL Systems\|Reinforcement Learning Systems]] | Apurva Gandhi | An RL framework is two different GPU workloads, a decode-heavy sampler and a gradient-heavy trainer; the engineering is making each fast and keeping them exactly consistent. | Expanded |
| 13 | [[L13 - Agent Safety\|Agent Safety: Limiting What Agents Can Access and Do]] | Speaker not named on slides | Because model behavior cannot be guaranteed, safety comes from limiting access and actions outside the model, and from measuring harm alongside usefulness. | Expanded |
| 14 | [[L14 - OpenHands\|OpenHands (Frameworks 1)]] | Speaker not named on slides | Agent performance is model plus system: a stateless agent, an event log, a sandboxed workspace and human checks, reused across interfaces and automations. | Expanded |
| 15 | [[L15 - Orchestration and Monitoring\|Orchestration and Monitoring (Frameworks 2)]] | Daniel Fried | Fix known procedures as code-routed workflows with checkpoints and tests; monitor traces at scale to explain regressions and discover unanticipated agent behaviors. | Expanded |
| 17 | [[L17 - AI Agents for Human Work\|AI Agents for Human Work]] | Zora Wang (guest) | Benchmark capability is not usefulness at work; agents need realistic tasks, environments and evaluation, plus collaboration, efficiency, safety and respect for meaningful work. | Expanded |
| 18 | [[L18 - Multi-agent Systems\|Multi-agent Systems (Interaction 1)]] | Saujas Vaduguru | Multi-agent structure pays when work is long, parallel and checkable; other agents also serve as simulated users and as incentive-shaping training partners. | Expanded |
| 19 | [[L19 - Human-AI Collaboration\|Rethinking Human-AI Collaboration in the Agentic Era]] | Valerie Chen (guest) | Agents must be designed, trained and evaluated for the collaboration process: interaction timing, implicit feedback, and effects on users' understanding. | Expanded |
| 20 | [[L20 - Search over Trajectories\|Search over Trajectories]] | Fried | More samples raise coverage (pass@k), but the selector sets the ceiling: spend on breadth when pass@k is low, on selection when accuracy trails it. | Expanded |
| 21 | [[L21 - Search and Planning\|Search and Planning (Search II)]] | Jing Yu Koh (guest) | Structured search (learned, grounded, simulated or decomposed) beats full-attempt sampling only when partial states can be scored and recovered cheaply. | Expanded |
| 22 | [[L22 - How to Trust Your AI Agents\|How to Trust Your AI Agents]] | Karthik Narasimhan (guest) | As agents take on longer tasks, verification becomes the bottleneck; trust needs reliability measured at scale, evidence, targeted review and autonomy earned per task type. | Expanded |

## Topic deep dives

| # | Topic | Draws on |
| --- | --- | --- |
| T1 | [[T01 - The Agent Loop and Harness Design\|The Agent Loop and Harness Design]] | [[L01 - What Are Agents\|L1]], [[L02 - Tool Use\|L2]], [[L03 - Long-Context Agents\|L3]], [[L06 - Coding Agents\|L6]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]] |
| T2 | [[T02 - Tool Calling, Schemas, MCP and Constrained Decoding\|Tool Calling, Schemas, MCP and Constrained Decoding]] | [[L01 - What Are Agents\|L1]], [[L02 - Tool Use\|L2]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]] |
| T3 | [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction\|Context Engineering: KV Cache, Prefix Caching and Compaction]] | [[L03 - Long-Context Agents\|L3]], [[L06 - Coding Agents\|L6]], [[L10 - Deep Research Agents\|L10]], [[L12 - RL Systems\|L12]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L18 - Multi-agent Systems\|L18]], [[L21 - Search and Planning\|L21]] |
| T4 | [[T04 - Agent Memory and Skills\|Agent Memory and Skills]] | [[L03 - Long-Context Agents\|L3]], [[L04 - Memory and Skills\|L4]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L19 - Human-AI Collaboration\|L19]] |
| T5 | [[T05 - Planning, Task Decomposition and Multi-Agent Systems\|Planning, Task Decomposition and Multi-Agent Systems]] | [[L05 - Planning and Task Decomposition\|L5]], [[L07 - Computer Use Agents\|L7]], [[L10 - Deep Research Agents\|L10]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L20 - Search over Trajectories\|L20]], [[L21 - Search and Planning\|L21]] |
| T6 | [[T06 - Coding Agents and Software-Engineering Benchmarks\|Coding Agents and Software-Engineering Benchmarks]] | [[L06 - Coding Agents\|L6]], [[L08 - SFT for Agents\|L8]], [[L11 - Advanced RL\|L11]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L19 - Human-AI Collaboration\|L19]], [[L20 - Search over Trajectories\|L20]], [[L21 - Search and Planning\|L21]] |
| T7 | [[T07 - Computer-Use and Web Agents - Perception, Grounding and Action\|Computer-Use and Web Agents: Perception, Grounding and Action]] | [[L01 - What Are Agents\|L1]], [[L07 - Computer Use Agents\|L7]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L21 - Search and Planning\|L21]] |
| T8 | [[T08 - Deep Research Agents - Search, Retrieval and Synthesis\|Deep Research Agents: Search, Retrieval and Synthesis]] | [[L10 - Deep Research Agents\|L10]] |
| T9 | [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics\|Evaluating Agents: Benchmarks, Verifiers and Metrics]] | [[L01 - What Are Agents\|L1]], [[L06 - Coding Agents\|L6]], [[L07 - Computer Use Agents\|L7]], [[L10 - Deep Research Agents\|L10]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L19 - Human-AI Collaboration\|L19]], [[L20 - Search over Trajectories\|L20]], [[L22 - How to Trust Your AI Agents\|L22]] |
| T10 | [[T10 - Supervised Fine-Tuning on Agent Trajectories\|Supervised Fine-Tuning on Agent Trajectories]] | [[L08 - SFT for Agents\|L8]], [[L09 - RL Foundations\|L9]] |
| T11 | [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO\|Policy-Gradient RL for Agents: REINFORCE, PPO and GRPO]] | [[L09 - RL Foundations\|L9]], [[L11 - Advanced RL\|L11]], [[L12 - RL Systems\|L12]], [[L20 - Search over Trajectories\|L20]], [[L21 - Search and Planning\|L21]] |
| T12 | [[T12 - Rewards, Verifiers and Reward Hacking\|Rewards, Verifiers and Reward Hacking]] | [[L06 - Coding Agents\|L6]], [[L07 - Computer Use Agents\|L7]], [[L10 - Deep Research Agents\|L10]], [[L11 - Advanced RL\|L11]], [[L12 - RL Systems\|L12]], [[L13 - Agent Safety\|L13]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L19 - Human-AI Collaboration\|L19]], [[L20 - Search over Trajectories\|L20]], [[L21 - Search and Planning\|L21]], [[L22 - How to Trust Your AI Agents\|L22]] |
| T13 | [[T13 - Workflow Orchestration and Agent Monitoring\|Workflow Orchestration and Agent Monitoring]] | [[L01 - What Are Agents\|L1]], [[L05 - Planning and Task Decomposition\|L5]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L22 - How to Trust Your AI Agents\|L22]] |
| T14 | [[T14 - Agent Safety and Security - Sandboxes, Permissions, Injection and Monitoring\|Agent Safety and Security: Sandboxes, Permissions, Injection and Monitoring]] | [[L02 - Tool Use\|L2]], [[L05 - Planning and Task Decomposition\|L5]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L15 - Orchestration and Monitoring\|L15]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L22 - How to Trust Your AI Agents\|L22]] |
| T15 | [[T15 - Human-Agent Interaction and Agents for Real-World Work\|Human-Agent Interaction and Agents for Real-World Work]] | [[L07 - Computer Use Agents\|L7]], [[L10 - Deep Research Agents\|L10]], [[L13 - Agent Safety\|L13]], [[L14 - OpenHands\|L14]], [[L17 - AI Agents for Human Work\|L17]], [[L18 - Multi-agent Systems\|L18]], [[L19 - Human-AI Collaboration\|L19]], [[L22 - How to Trust Your AI Agents\|L22]] |

## Cross-cutting glossary

These terms recur across several lectures; each sheet has its own fuller Key terms table.

| Term                        | Meaning                                                                                                                                                | Main lectures |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| Advantage                   | How much better an action was than the policy's average from that state: Q(h,a) − V(h).                                                                | 9, 11         |
| Alert precision             | The share of monitor alerts that are real; it collapses when unsafe actions are rare (90 of 189 alerts in L13's example).                              | 13            |
| Baseline                    | A value subtracted from the reward to cut gradient variance without adding bias.                                                                       | 9, 11         |
| Best-of-N | Sample N candidates, score each with a reward model or verifier, and return the highest-scoring one. | 6, 12, 20 |
| Calibrated reliance | Relying on an agent exactly as much as its measured reliability warrants, neither over- nor under-trusting it (Lee and See, 2004). | 19, 22 |
| Chat template               | The program that renders role-tagged messages and tool schemas into one token string; must match between training and serving.                         | 1, 2, 8       |
| Checkpointer | Saves workflow state after each step under a thread ID, so a run can resume, retry or pause for a human. | 14, 15 |
| Compaction                  | Replacing old history with a bounded working state: exact anchors, a checkpoint, the recent tail, and pointers to evidence.                            | 3, 4          |
| Condenser                   | A component that summarizes older events in the LLM's view while keeping the first and most recent ones, so long runs fit the context window.          | 3, 14         |
| Confirmation policy         | A rule that pauses chosen actions until a human approves them; a rejection is fed back to the agent as an observation.                                 | 13, 14        |
| Constrained decoding        | Masking logits so output always matches a grammar or JSON Schema. Guarantees form, not correctness.                                                    | 2             |
| Construct validity | How far a benchmark score supports the claim it is used to make, such as "agents can do this job". | 9, 17 |
| Credential broker           | A trusted service that checks each request and issues a short-lived scoped token (or calls the API itself), so the agent never holds the real secret.  | 2, 13         |
| Critical path (span) | The longest chain of dependent steps in a task graph; with coordination time, it caps how much parallel execution can speed a job up. | 18, 21 |
| Delta weight sync           | Sending only the parameters whose bf16 value changed since the last sync (about 1% of them), instead of the full model.                                | 12            |
| Earned autonomy | Granting an agent more independence (from suggesting each step up to acting alone) per task type, only as its track record on that type justifies. | 22 |
| Effective context           | The length a model can actually use on a task, as opposed to its advertised window.                                                                    | 3, 10         |
| Event-sourced conversation  | Keeping all agent state as an append-only log of action and observation events, so runs can be persisted, resumed, streamed and condensed.             | 1, 14         |
| Explicit workflow | Control flow fixed by the developer in code; the LLM makes judgments only inside steps. | 5, 14, 15 |
| Frontier | The partial solutions generated but not yet expanded; DFS, BFS, best-first search and MCTS differ only in how they order it. | 5, 21 |
| GRPO                        | RL that scores each rollout against its group's mean reward (normalized by the group's std) with clipping and a KL term.                               | 9, 10, 11     |
| Grounding                   | Mapping a phrase or intent to a concrete screen location or UI element.                                                                                | 7             |
| Harness                     | Software around the model that manages state, tools, memory and control flow, and validates and executes actions.                                      | 1, 2, 6       |
| Harness search | Optimizing the code around a fixed model (prompts, tools, control flow) with a coding agent that reads past code, scores and traces; WHALE alternates it with weight training. | 20 |
| Implicit feedback | Signals users give without rating anything — follow-ups, sentiment, accepts, commits, code that survives — used to evaluate or train agents. | 18, 19 |
| Importance ratio            | πθ/μ: reweights samples from a stale behavior policy toward the current policy.                                                                        | 11            |
| Interrupt | Pauses a workflow step until outside input (often human approval) arrives; on resume the step re-runs from its start, so side effects must be idempotent. | 13, 15 |
| Joint action | All agents' actions taken together, which jointly change a shared environment's state. | 18 |
| KV cache / prefix caching   | Stored keys and values for processed tokens, reused across calls so an unchanged prefix is not recomputed.                                             | 3             |
| Loss mask                   | One bit per token saying whether it counts in the loss; 1 only on tokens the agent generated.                                                          | 8, 9          |
| MCP                         | Model Context Protocol: an open protocol for discovering and calling server tools (tools/list, tools/call).                                            | 2             |
| Mixed-initiative interaction | Human and computer each contribute what they do best at the most appropriate time (Hearst; Horvitz, 1999). | 19 |
| Monte Carlo tree search (MCTS) | Repeated select, expand, simulate (or evaluate) and back up; AlphaZero selects children with PUCT, Q + c·P·√N(s)/(1+N(s,a)). | 21 |
| pass@k                      | Probability that at least one of k sampled attempts passes all tests; with per-attempt success p it is 1 − (1 − p)^k, the ceiling a perfect selector could reach.                                                                                  | 6, 20             |
| pass^k | Probability that all k independent tries of the same task succeed; measures reliability, where pass@k measures capability (τ-bench). | 22 |
| Prediction-powered inference (PPI) | A few true labels plus model predictions on many unlabeled sessions give an unbiased estimate with a narrower confidence interval. | 19 |
| Proactive agent | An agent that decides from context when and what to show the user, instead of only answering prompts. | 18, 19 |
| Progressive disclosure      | Loading skill metadata always, the skill body on trigger, and bundled files on demand.                                                                 | 4             |
| Prompt injection            | Attacker instructions hidden in data the agent reads (an email, issue, web page or tool result) that the agent then follows.                           | 2, 5, 13      |
| ReAct                       | A loop that interleaves reasoning, tool calls (actions) and observations.                                                                              | 1, 5          |
| Recursive Tournament Voting (RTV) | Selecting among many agent rollouts by having an LLM judge compare their summaries in small groups, with repeated votes, until one rollout remains. | 20 |
| Replanning                  | Revising plan steps or the task graph when execution feedback shows the plan failed.                                                                   | 5             |
| Reward hacking              | Getting high reward through a shortcut the verifier fails to rule out.                                                                                 | 7, 11         |
| Rollout / trajectory        | One complete multi-step run of an agent, logged in order; the unit of evaluation, SFT data and RL.                                                     | 1, 8, 9       |
| Rollout Routing Replay (R3) | Replaying the mixture-of-experts routing chosen during rollout when the trainer recomputes log-probs, so both sides use the same experts.              | 12            |
| Rubric score                | The weighted share of checkable criteria an answer meets, judged item by item.                                                                         | 10            |
| Sandbox                     | An isolated environment for executing agent actions with limits on compute, network and files.                                                         | 1, 6, 7       |
| Self-consistency | Majority vote over the final answers of many sampled reasoning paths; a sample approximation of minimum-Bayes-risk decoding with 0–1 loss. | 20 |
| Self-preference bias | An LLM judge overrating outputs from its own model family. | 17 |
| Simulator collapse | A policy trained against one frozen user simulator overfits to it, so reward on held-out users falls. | 18 |
| Staleness                   | How many policy versions old a rollout is when it is trained on; asynchronous RL trades staleness for GPU utilization and needs off-policy correction. | 11, 12        |
| team@k | Success rate of a communicating team of k agents, compared with pass@k from k independent tries at the same compute. | 18 |
| Token-in, token-out (TITO)  | Passing token IDs, never re-tokenized strings, from the inference engine to the trainer, because detokenizing is many-to-one.                          | 12            |
| Trace / span | A span records one operation (inputs, outputs, latency, tokens, errors); a trace is the tree of spans for one run. | 14, 15 |
| Unsupervised monitoring | Summarizing, embedding and comparing groups of agent actions to surface misbehavior nobody wrote a test for. | 13, 15 |
| Verification ladder | The historical sequence of checking methods (human labels, environment rewards, developer tests, simulated users plus final state), each automating more checking for narrower tasks. | 22 |
| Verified progress sharing | Agents share only checked partial results, which the others then build on. | 18 |
| Verifier                    | Code or a model that checks the outcome (tests, app state, rubric) to produce a reward.                                                                | 6, 7, 10, 11  |
| Workspace                   | Where an agent's files live and commands run (a local folder, a Docker container or a cloud sandbox), behind one API.                                  | 6, 13, 14     |
| World model | A model that predicts the next state from a state and an action, so an agent can try branches in imagination before executing them. | 21 |

## Core reading list

If you read one paper per lecture, read these; each sheet's References section has the full cited list plus further reading.

| Lecture | Paper                                                                                                                                           | Why read it                                                                                                     |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| 1       | [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., 2023                               | The reason–act–observe loop every later lecture builds on.                                                      |
| 1       | [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — SWE-agent team, 2025                                                            | A complete agent in about 100 lines; the best code to read first.                                               |
| 2       | [What Are Tools Anyway? A Survey from the Language Model Perspective](https://arxiv.org/abs/2403.15452) — Wang, Cheng, Zhu, Fried, Neubig, 2024 | Instructors' own map of tool types and how LMs use them.                                                        |
| 2       | [Executable Code Actions Elicit Better LLM Agents (CodeAct)](https://arxiv.org/abs/2402.01030) — Wang et al., 2024                              | Why code can beat JSON as the action format.                                                                    |
| 3       | [Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., 2023                         | How KV caches are stored and shared in practice (vLLM).                                                         |
| 4       | [Agent Workflow Memory](https://arxiv.org/abs/2409.07429) — Wang et al., 2024                                                                   | Inducing reusable workflows from past episodes.                                                                 |
| 4       | [Inducing Programmatic Skills for Agentic Tasks (ASI)](https://arxiv.org/abs/2504.06821) — Wang et al., 2025                                    | Evidence that code skills beat text skills.                                                                     |
| 5       | [Multi-Agent Computer Use (MACU)](https://arxiv.org/abs/2606.01533) — Koh, Salakhutdinov, Fried, 2026                                           | The lecture's running example of planning under all four pressures.                                             |
| 6       | [SWE-bench](https://arxiv.org/abs/2310.06770) — Jimenez et al., 2023                                                                            | The benchmark that defined repository-level coding agents.                                                      |
| 6       | [SWE-agent: Agent-Computer Interfaces](https://arxiv.org/abs/2405.15793) — Yang et al., 2024                                                    | Why interface design for the agent matters as much as the model.                                                |
| 7       | [OSWorld](https://arxiv.org/abs/2404.07972) — Xie et al., 2024                                                                                  | The main real-computer benchmark with execution-based checks.                                                   |
| 7       | [WebArena](https://arxiv.org/abs/2307.13854) — Zhou et al., 2023                                                                                | Self-hosted, resettable web environments for agents.                                                            |
| 8       | [Agent Data Protocol](https://arxiv.org/abs/2510.24702) — Song et al., 2025                                                                     | One format for many agent datasets, from the L8 speaker.                                                        |
| 8       | [SWE-Gym](https://arxiv.org/abs/2412.21139) — Pan et al., 2024                                                                                  | Training SWE agents and verifiers from executable environments.                                                 |
| 9       | [DeepSeekMath (introduces GRPO)](https://arxiv.org/abs/2402.03300) — Shao et al., 2024                                                          | Origin of group-relative policy optimization.                                                                   |
| 9       | [Understanding R1-Zero-Like Training (DrGRPO)](https://arxiv.org/abs/2503.20783) — Liu et al., 2025                                             | The length and std biases in GRPO, and the fix.                                                                 |
| 10      | [DR Tulu: RL with Evolving Rubrics for Deep Research](https://arxiv.org/abs/2511.19399) — Shao, Asai et al., 2025                               | Rubric rewards that evolve during training.                                                                     |
| 10      | [Tongyi DeepResearch Technical Report](https://arxiv.org/abs/2510.24701) — Alibaba, 2025                                                        | A full open recipe: mid-training, SFT, then RL.                                                                 |
| 11      | [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347) — Schulman et al., 2017                                             | The clipped objective most agent RL still builds on.                                                            |
| 11      | [DAPO](https://arxiv.org/abs/2503.14476) — Yu et al., 2025                                                                                      | Practical tricks for large-scale RL on LLMs.                                                                    |
| 12      | [PipelineRL: In-flight Weight Updates](https://arxiv.org/abs/2509.19128) — Piché et al., 2025                                                   | In-flight weight updates that keep async RL nearly on-policy.                                                   |
| 12      | [AReaL: Asynchronous RL for Language Reasoning](https://arxiv.org/abs/2505.24298) — Fu et al., 2025                                             | A fully asynchronous RL system for reasoning and agent training.                                                |
| 13      | [AgentDojo](https://arxiv.org/abs/2406.13352) — Debenedetti et al., 2024                                                                        | A benchmark that scores prompt-injection attacks and defenses together with task utility.                       |
| 13      | [AI Control](https://arxiv.org/abs/2312.06942) — Greenblatt et al., 2023                                                                        | Safety protocols that hold even if the model itself is untrustworthy: monitors, audits and limited affordances. |
| 14      | [The OpenHands Software Agent SDK](https://arxiv.org/abs/2511.03690) — Wang et al., 2025                                                        | The design of a production agent SDK: events, tools, workspaces, condensers and confirmation.                   |
| 14      | [Don't Sleep on Single-agent Systems](https://www.openhands.dev/blog/dont-sleep-on-single-agent-systems) — Neubig, 2024                         | Why one generalist agent with a broad action space often beats a multi-agent pipeline.                          |
| 15 | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Schluntz and Zhang (Anthropic), 2024 | When to fix a workflow and when to let the model drive; the patterns the lecture builds on. |
| 15 | [Hodoscope: Unsupervised Monitoring for AI Misbehaviors](https://arxiv.org/abs/2604.11072) — Zhong, Saxena, Raghunathan, 2026 | Finding agent behaviors nobody tested for by comparing summarized actions across many traces. |
| 17 | [How Well Does Agent Development Reflect Real-World Work?](https://arxiv.org/abs/2603.01203) — Wang et al., 2026 | Maps agent benchmarks onto real occupations and shows how narrow a slice of work they cover. |
| 18 | [Improving Factuality and Reasoning through Multiagent Debate](https://arxiv.org/abs/2305.14325) — Du et al., 2023 (ICML 2024) | The canonical multi-agent debate setup and when it helps. |
| 19 | [How can we assess human-agent interactions? Case studies in software agent design](https://arxiv.org/abs/2510.09801) — Chen et al., 2025 (ICML 2026) | PULSE: comparing agent designs on 15k real users with implicit signals and prediction-powered inference. |
| 20 | [Large Language Monkeys: Scaling Inference Compute with Repeated Sampling](https://arxiv.org/abs/2407.21787) — Brown et al., 2024 | Coverage grows log-linearly with samples, but practical selection (voting, reward models) falls well short of it. |
| 21 | [Tree Search for Language Model Agents](https://arxiv.org/abs/2407.01476) — Koh, McAleer, Fried, Salakhutdinov, 2024 | Best-first search over real web actions with a value function, and what backtracking costs when actions change the environment. |
| 22 | [τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045) — Yao, Shinn, Razavi, Narasimhan, 2024 | Simulated users plus final-state checks, and the pass^k metric that shows how unreliable agents are across repeated tries. |

**Background textbooks and courses.** Russell and Norvig, *Artificial Intelligence: A Modern Approach* (agents and environments, ch. 2). Sutton and Barto, [*Reinforcement Learning: An Introduction*](http://incompleteideas.net/book/the-book-2nd.html), 2nd ed. (policy gradients, ch. 13). OpenAI's [Spinning Up in Deep RL](https://spinningup.openai.com/) for readable RL derivations.

---

## Related

- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]
- [[Context Engineering - Concepts and Tutorials]]
- [[DeepSeek-V4 a million-token context that agents can actually use]]
- [[Creating and Deploying an MCP Server from Scratch]]
- [[Claude Code Complete Tutorial]]
- [[How People Use Claude Code]]
- [[Vibe Coding]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]
- [[RAG - Evolution and Complexity]]
- [[RAG and Agentic RAG Tooling]]
- [[What is Agentic RAG Use Cases and Top Agentic RAG Tools (2025)]]
- [[The State of LLM Reasoning Model Inference]]
