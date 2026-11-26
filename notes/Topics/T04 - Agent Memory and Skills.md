---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, memory, skills]
aliases: ["CMU T4", "Agent Memory and Skills"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 4 · Agent Memory and Skills

[[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction|← T3]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T05 - Planning, Task Decomposition and Multi-Agent Systems|T5 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L03 - Long-Context Agents]], [[L04 - Memory and Skills]], [[L13 - Agent Safety]], [[L14 - OpenHands]], [[L15 - Orchestration and Monitoring]], [[L19 - Human-AI Collaboration]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L3, L4, L13, L14, L15, L19 · 11-768 AI Agents, Fall 2026

## Overview

Agent memory and skills are the machinery that lets an agent keep what it learned from one task and reuse it on the next, instead of starting every run from zero.

A large language model (LLM) is stateless: each call sees only the tokens in its prompt. Everything an agent "knows" about its past must therefore be put back into the prompt, baked into the weights, or stored somewhere it can look up. L4 (Fried) frames this as a choice between three *locations* for experience: the context window, external artifacts, and model weights. This sheet is about the middle option, external artifacts, and about how it connects to the other two.

**Why it matters for building real agents.** Real deployments are repetitive. A support agent sees the same refund flow hundreds of times; a coding agent works in the same repository every day; a web agent searches the same store again and again. Without memory the agent pays full price for each repetition, repeats old mistakes, and forgets user preferences. With good memory it gets faster and more accurate over time. L4 reports that code skills induced from experience raise WebArena checkpoint completion from 41.3% to 80.2% while cutting steps per task from 24.5 to 15.0. With bad memory it gets worse: over-retrieval, stale facts and poisoned records all degrade behavior.

**Key questions this sheet answers**

- What kinds of memory does an agent have (working, episodic, semantic, procedural), and where did those categories come from?
- What is worth storing: raw episodes, facts, lessons, or skills? When does each pay off?
- How does an agent write memory: extraction, induction, conflict resolution, and admission checks?
- How does it read memory: embeddings, BM25, recency and importance scoring, progressive disclosure, and why retrieving more can hurt?
- Should a skill be text or code? What do AWM, ASI, Voyager, TroVE, PolySkill and ReasoningBank show?
- How should memory be consolidated, revised and forgotten, and can a model be trained to manage its own memory?
- How can memory be poisoned, and how do you evaluate whether memory actually helps?

**Which lectures cover it**

- **L4 Memory and Skills (Fried)** is the main lecture. It covers authored skills (SKILL.md, progressive disclosure, SkillsBench), memories of facts, lessons and episodes (MemGPT, Mem0, Reflexion, ExpeL), skill induction (AWM, ASI, SkillWeaver, PolySkill) and the skill lifecycle (ReasoningBank, TroVE, SAGE).
- **L3 Context Management (Neubig)** covers working memory: why context grows, what it costs, and how compaction turns a long history into a bounded working state.
- **L1** lists memory and skills as harness capabilities for coherence and customizability. **L5** separates a plan (for this task) from a skill (reusable across tasks). **L7** raises personal memory, consent and forgetting (GUM, MyPCBench). **L8** revisits the three-location table from the weight-update side. **L10** explains the retrieval machinery (BM25, dense dual encoders, AgentIR).

**Prerequisites.** The agent loop (observe, think, act) and tool calling from L1–L2. Basic Python. Helpful but not required: cosine similarity, what an embedding is, and the idea of a reward signal from L9.

**Suggested reading path.** Read the Concept map, then Core concepts in order: sections 1–3 give the taxonomy and working memory, 4–6 cover what to store and how to write and read it, 7 covers skills, and 8–9 cover maintenance, safety and evaluation. Then read Mechanics for the exact formulas, run the Hands-on program, and finish with the checklist and practice questions.

**Newer lectures.** Three later lectures move skills and memory out of the research setting and into frameworks. L14 (OpenHands) shows skills as a first-class SDK object (`AgentContext` with always-on or triggered `Skill`s, formerly "microagents") and closes with SkillRefiner, which revises a skill from the traces of many automation runs and beats the initial skill on held-out tasks. L15 (Fried, Orchestration and Monitoring) places skills on a spectrum: "instructions guide behavior; executable skills can constrain execution," and a fixed workflow goes one step further by prescribing the procedure in code; its checkpointed, thread-scoped state is the framework form of short-term memory. L13 (Agent Safety) never names memory or skills, but its "shared state can outlive the run that changed it" case (Cline) is exactly the persistence risk of section 9, and its sandboxing, scoped tokens and monitoring are the controls a memory store needs. Sections 10–14 cover this material; the "Lectures 13–15" part of Across the lectures, the new patterns and pitfalls, the "Added with L12–L15" landscape table, open problems 10–12, practice questions 16–22 and the added references extend it.

**Lecture 19.** L19 (Valerie Chen, Human–AI Collaboration) adds memory about the *user*: ToM-SWE keeps a hierarchical user model of preferences and rules from past sessions and consults it when instructions are unclear. Its PULSE study also found that reducing memory made no significant difference to user satisfaction. The "L19 · Memory about the user" part before Mechanics, the L19 patterns and pitfalls, the "Added with L19" landscape table, open problem 13, questions 23–26 and the added references cover it; T15 covers the interaction design.

## Concept map

![[cmu-ai-agents-T04-concept-map.png]]
*Concept map: The memory loop · act, write, store, read, maintain, with failure points*

Read it clockwise from Working memory: the agent acts, experience is judged and written into one of three long-term stores, maintenance prunes and repairs them, and retrieval copies a few items back into the context window; the dashed links mark where the loop most often fails.

## Core concepts

This section builds the topic from first principles: why a stateless model needs memory, how memory is classified, what gets stored, how it is written and read, how skills work, and how memory is maintained, attacked and evaluated.

### 1. Why agents need memory: three places to keep experience

An LLM call is a pure function from a prompt to a completion. The model does not remember the previous call unless the harness pastes it back in. An **agent** wraps the model in a loop that calls tools and feeds results back, so within one task the growing prompt acts as a short-term record. Across tasks, nothing survives by default. A useful analogy is a patient with anterograde amnesia who keeps notes and photos to function: the notes are the memory, and the skill is in deciding what to write down and when to look.

L4 (Fried) opens with two web tasks: "add Sony headphones to my wish list" and "find the wireless keyboard price range." Both start with the same **shared search procedure**: go to the store, find the search box, fill it, click Search. Only the finish differs. The lecture's point is that "lots of structure recurs in agent tasks," and an agent that cannot keep that structure re-derives it every time.

The lecture then asks where an update to the agent should live. The same table appears again in L8 (the SFT lecture), which shows the course treats these as three points on one design axis.

| Location | Pros | Cons | Covered in |
| --- | --- | --- | --- |
| Context window | High fidelity to what happened | Costly, noisy, does not decide what matters | L3 |
| External artifacts | Inspectable, editable, retrievable, portable | Must be induced, selected and maintained | L4 |
| Model weights | Faster inference, broad behavior change | Slower updates, opaque, model-specific | L8, L9, L11 |

L8 adds the key operational contrast: "The first two rows update in seconds. This row costs a training run every time you change it." You also cannot open weights to see what changed, or move the change to another model. External artifacts are the only option that is both fast to update and human-readable.

Why not just keep everything in the context window? L3 (Neubig) gives the numbers. If each call's input is a fixed prefix plus all prior history, then input grows linearly per call but cumulative input grows quadratically. In L3's example, calls consume 6K, 11K, 16K, 21K and 26K tokens, for 80K cumulative tokens after only five calls. Across 1,500 OpenHands sessions the mean was 77,922 tokens per session, and tool results alone were 37% of the prompt. Long contexts are also used unevenly: models find evidence at the start or end of the input more reliably than in the middle ("lost in the middle," Liu et al., 2023). So a raw transcript is expensive, noisy, and does not decide what matters.

**The central question** of L4 is therefore: *what experience is worth turning into an external artifact?* The rest of this sheet unpacks that question into representation (what form), induction (how to create it), and lifecycle (when to retrieve, check, revise or forget it).

Common misconception: "A million-token context window makes memory unnecessary." Bigger windows raise capacity, not selectivity. You still pay for every token on every call, effective context is shorter than advertised (L3's needle-in-a-haystack slide), and nothing in a window persists to the next session.

### 2. A taxonomy of memory: from cognitive science to CoALA

The words used for agent memory are borrowed from psychology, so it helps to know the originals.

- **Multi-store model** (Atkinson and Shiffrin, 1968): information flows from sensory input into a small short-term store, and rehearsal moves some of it into a large long-term store.
- **Working memory** (Baddeley and Hitch, 1974): the short-term store is an active workspace with limited capacity, where reasoning happens. For an agent, this is the context window.
- **Episodic vs semantic memory** (Tulving, 1972): episodic memory stores specific experiences tied to a time and place ("last Tuesday the checkout page timed out"). Semantic memory stores general facts detached from any episode ("checkout requires a login").
- **Declarative vs procedural memory** (Squire and others): declarative memory is knowing *that* (episodic plus semantic; you can state it). Procedural memory is knowing *how* (riding a bike, typing a password); it is shown by doing, not stating.
- **Consolidation and forgetting**: memories are strengthened and reorganized over time, and unused ones fade. Ebbinghaus (1885) measured the forgetting curve, where retention falls roughly exponentially with time since learning unless reviewed.

Classic cognitive architectures such as Soar and ACT-R turned these ideas into software. ACT-R stores declarative *chunks* and procedural *production rules*, and Soar's *chunking* compiles a successful chain of reasoning into a new rule. That is exactly what skill induction does for LLM agents: compile a successful trajectory into a reusable procedure.

**CoALA** (Cognitive Architectures for Language Agents; Sumers, Yao, Narasimhan and Griffiths, 2023) maps this vocabulary onto LLM agents. Beyond the lecture: CoALA is not on the L4 slides, but it is the standard framework for the terms the lecture uses. It defines:

- **Working memory**: the variables active in the current decision cycle, i.e. what is in the prompt now (goal, recent observations, retrieved items, intermediate reasoning).
- **Episodic memory**: records of past experiences, such as trajectories or past dialogues.
- **Semantic memory**: knowledge about the world and the agent itself, such as facts and learned insights.
- **Procedural memory**: knowledge of how to act, split into *implicit* procedural memory (the LLM weights) and *explicit* procedural memory (the agent's code, prompts and skill library).
- An **action space** with *external* actions (grounding: tools, web, robots) and *internal* actions: **reasoning** (update working memory), **retrieval** (read long-term memory into working memory) and **learning** (write to long-term memory, including new skills or even weight updates).

The most useful idea in CoALA is that *memory operations are actions*. Retrieval and learning are decisions the agent makes, with costs and consequences, just like clicking a button. MemGPT (Section 3) and AgeMem (Section 8) take this literally by exposing memory reads and writes as tool calls.

| Human memory | CoALA module | Agent implementation | Examples in the course |
| --- | --- | --- | --- |
| Working memory | Working memory | Context window; compacted working state | L3 compaction; MemGPT working context |
| Episodic | Episodic | Stored trajectories, dialogue logs, reflections on specific runs | Reflexion, ExpeL, Synapse, MemGPT recall storage |
| Semantic | Semantic | Facts and insights in a database or files | Mem0 facts, MemGPT archival storage, CLAUDE.md-style notes |
| Procedural (implicit) | Procedural (weights) | Model parameters | SFT and RL (L8, L9, L11) |
| Procedural (explicit) | Procedural (code/prompts) | Skills as text, code or packages | SKILL.md, AWM workflows, ASI and Voyager code skills |

L4 uses its own practical taxonomy, organized by *what unit of experience you save*:

- **Episode**: a full trace, every observation and action. Useful if the exact product, prices or sequence will matter again.
- **Fact**: a statement such as "This store shows prices only on the product page." Useful if it recurs or can be updated.
- **Lesson**: generalized feedback on a trajectory, such as a Reflexion reflection or a ReasoningBank strategy. The section title "Memories: facts, lessons, and episodes" names it explicitly.
- **Skill**: reusable knowledge about how to act, such as "fill the search box, click search, open a result." Useful if later tasks will repeat the pattern.

L4 also separates **memory** from **skill** by *source* rather than content. Memory is saved from the agent's own interaction (for example, a previously purchased product). A skill is reusable how-to knowledge in code, text or both, and may be written by a person (a release checklist) or induced by the agent. An **induced skill** sits in the overlap: it is a skill the agent made from its own successful searches. L5 (planning) adds a third neighbor: "A plan is for this task (versus a skill, which provides reusable guidance across tasks). Plans can be more specific than skills."

Common misconception: "Agent memory means a vector database." A vector index is one retrieval mechanism for one kind of store. The context window, a markdown notes file, a skill folder, a SQL table of facts, and the weights are all memory in the CoALA sense. Pick the store by the unit of experience and the access pattern, not by habit.

### 3. Working memory: the context window, compaction and virtual context

**Working memory** is whatever the model can see on this call. It is the only memory the model reads directly; every other store must be copied into it before it can influence behavior. So every long-term memory design is ultimately a policy for what to put in the context window, and when.

L3 (Neubig) frames context management as **state estimation**. Let H\_t be the full history up to step t. A **compactor** C with token budget B produces a working state ŝ\_t = C(H\_t; B) with |ŝ\_t| ≤ B. A good compactor has three properties:

- **Behavioral fidelity**: the agent should act the same from ŝ\_t as from H\_t, i.e. p(A\_future | H\_t) ≈ p(A\_future | ŝ\_t).
- **Bounded representation**: the state fits the budget.
- **Recoverability**: copy exact anchors and keep pointers to source evidence, so detail can be re-fetched later.

L3's example compacts a CI-debugging session. Before: a 30-minute timeout, a 24K-line log with repeated "address already in use," a rerun with --workers=1, and a passing suite with the log saved at /tmp/ci.log. After: "Goal: fix CI timeout. Cause: port collision. Verified: --workers=1 passes. Evidence: /tmp/ci.log. Next action: open the PR with the tested worker setting." Four lines replace thousands, and the path keeps the evidence recoverable.

L3 then sorts context into four fates. **Keep exact**: anchors (goal, constraints) and the recent tail (active attempt, fresh result). **Encode**: a checkpoint of decisions, progress and IDs. **Externalize**: bulky evidence goes to an evidence store ("24K-line log → 3 failures + command + artifact path"). **Discard**: duplicates and superseded attempts. The policy has four decisions: a *trigger* (token threshold, provider overflow, manual request, reserving room for the next output), a *selection* (protect the beginning, compact the older region, keep the recent tail, cut at a valid turn or tool boundary), a *replacement* (readable summary, structured checkpoint, opaque provider item, or fresh context), and a *recovery* plan (leave history unchanged on failure, retry or reset, keep searchable history).

**Repeated compaction drift** is the failure that links working memory to long-term memory. If each summary is built from the previous summary plus new events, ŝ\_{k+1} = C(ŝ\_k ⊕ R\_k), detail erodes. L3's example: "Use CUDA 12.4" becomes "Use CUDA 12.x," then "Use recent CUDA," then the constraint disappears. The fixes are to copy anchors exactly, keep the recent tail, and retrieve source evidence rather than trusting a summary of a summary.

The externalized evidence store is where working memory turns into long-term memory. **MemGPT** (Packer et al., 2023), shown in L4, makes the operating-system analogy explicit: the context window is RAM and external storage is disk. Its prompt has read-only **system instructions**, a read-write **working context** (key facts, written via functions), and a **FIFO queue** of recent messages managed by a queue manager. Outside the prompt, **recall storage** holds the full message history and **archival storage** holds arbitrary long-term data. The L4 slide shows the agent calling recall\_storage.search("six flags") and getting three dated past messages back. The key message: "Reads and writes are function calls the agent issues itself."

Two practical corollaries from L3 shape where memory goes in the prompt. First, prompt caching rewards a **stable prefix**: put instructions, tool schemas and a slowly changing memory index at the front, and append changing state at the end. Cached input is often about one-tenth the price of regular input (for example, L3 lists Claude Opus 5 at $0.50 vs $5.00 per million tokens). Second, a memory block that is rewritten every turn near the top of the prompt breaks the cache for everything after it.

| Mechanism | Unit kept | Who decides what to keep | Survives the session? | Main risk |
| --- | --- | --- | --- | --- |
| Raw transcript | Everything | Nobody | No | Cost, noise, lost-in-the-middle |
| Compaction (L3) | Checkpoint + anchors + tail | Harness policy or a summarizer model | Only if externalized | Drift across repeated summaries |
| Virtual context (MemGPT) | Working context + paged records | The agent, via function calls | Yes | Agent forgets to write or read |
| Long-term store (L4) | Facts, lessons, episodes, skills | Induction and admission pipeline | Yes | Stale, wrong or poisoned records |

Common misconception: "Compaction is just summarization." A summary optimizes readability; compaction optimizes *future behavior*. L3's continuation-based evaluation makes this concrete: plant constraints, decisions and artifacts, compact with the production policy, then measure whether later decisions are still correct, alongside tokens, latency and stability over repeated compactions.

### 4. What to store: episodes, facts, lessons and skills

The unit of storage determines what can be retrieved, how well it transfers, and how much context it costs. L4 walks through each unit with a representative system.

**Episodes (whole trajectories).** The simplest memory saves complete runs and retrieves similar ones as few-shot examples. L4 describes this "similar-trajectory conditioning" family: what is stored is whole trajectories, both successes and failures, sometimes rewritten and annotated; the pool is collected offline, grown while the agent works, or hand-written; at use time the runs most similar to the new task are retrieved by text embeddings. The lecture cites ExpeL (Zhao et al., AAAI 2024), Agent S (Agashe et al., ICLR 2025), Synapse (Zheng et al., ICLR 2024) and ICAL (Sarch et al., NeurIPS 2024). Synapse, for example, abstracts away task-irrelevant state so more exemplars fit, and reports 99.2% average success on 64 MiniWoB++ tasks. Episodes preserve concrete behavior but are long and transfer poorly when the new task differs in details.

**Facts.** A fact is a short declarative statement, often about the user or the environment: "shop.example shows prices only on the product page," or "user prefers pnpm." Facts are cheap to store and retrieve and easy to update, but they conflict over time. **Mem0** (Chhikara et al., 2025), shown in L4, handles this with a two-phase pipeline. In the *extraction phase* an LLM reads a conversation summary plus the last m messages and extracts candidate memories. In the *update phase* it fetches the top-s similar stored memories and calls a tool to choose one of four operations: **ADD** (nothing similar is stored yet), **UPDATE** (messages change an existing memory), **DELETE** (messages negate an existing memory) or **NOOP** (already stored, or irrelevant). Beyond the lecture: on the LoCoMo benchmark Mem0 reports a 26% relative improvement over OpenAI's memory on an LLM-as-judge metric, with 91% lower p95 latency and over 90% token savings compared with putting the full history in context.

**Lessons (reflections and strategies).** A lesson is feedback that generalizes an episode. **Reflexion** (Shinn et al., NeurIPS 2023) runs attempt → evaluator predicts reward → reflection generates feedback → retry. In L4's example the agent answers "Battle of White Plains" to a question asking for *a series of battles*; the reflection notes "the question asked for a series of battles, but I only provided the name of one battle," and attempt 2 answers "The New York and New Jersey campaign," which is correct. Reflexion keeps these reflections in an episodic buffer and reports 91% pass@1 on HumanEval versus 80% for GPT-4 at the time. Reflexion's lessons help *retries of the same task*; ExpeL goes further by extracting cross-task **insights** from an experience pool of successes and failures and injecting them as guidance on new tasks.

**ReasoningBank** (Ouyang et al., ICLR 2026) stores *strategies*: short titled lessons distilled from both successful and failed episodes. L4's case study is a failed task: "Provide the complete names of Bluetooth headphones from Sony, and also share the price range." The agent searched "Bluetooth headphones Sony," got 5,578 results from every department at 12 per page, paged until the step limit, and sent nothing. Three strategies were induced: "Search query optimization" (tighten the query before browsing), "Adjust number of items displayed per page" (12 per page makes every *next* cost a step), and "Use filters available" (sidebar category filters shrink the list without paging).

**Skills.** A skill is a reusable procedure, covered in depth in Section 7.

Whether to keep failures depends on the unit. L4 shows ReasoningBank's comparison on WebArena shopping with Gemini-2.5-flash, where the no-memory baseline is 39.0% success:

| Memory type | Success only | With failures | Effect of failures |
| --- | --- | --- | --- |
| Synapse (trajectories) | 40.6 | 41.7 | +1.1 |
| AWM (workflows) | 44.4 | 42.2 | −2.2 |
| ReasoningBank (strategies) | 46.5 | 49.7 | +3.2 |

The lecture's reading: failures help substantially when inducing *strategies*, but are less useful as trajectories or workflows, which are demonstrations, and a demonstration of what not to do is still a demonstration.

| Unit | Example | Tokens per item | Transfer to new tasks | Best when |
| --- | --- | --- | --- | --- |
| Episode | Full trace of a wish-list task | Thousands | Low | Exact sequence will repeat |
| Fact | "Prices only on product page" | Tens | Medium | Environment or user facts recur and change |
| Lesson | "Tighten the query before browsing" | Tens to hundreds | High | Failures are informative; tasks vary |
| Text skill | AWM workflow with {query} variables | Hundreds | Medium-high | Structure repeats; pages vary |
| Code skill | search\_product(id, query) | Hundreds, but one call to run | Medium; brittle across sites | Structure repeats exactly; outcomes testable |

Common misconception: "Store the raw trajectory and let the model figure it out later." Raw episodes are the most faithful but the least reusable and the most expensive to condition on. Most of the gains in L4 come from *abstracting* experience (facts, strategies, workflows, functions) at write time.

### 5. Writing memory: triggers, induction, judging and admission

Writing is the hardest part of memory because the value of a record is unknown when it is written. L4's lifecycle names the write path explicitly: **LEARN: episode → judge → induce → admit → memory**. Each arrow is a design decision.

**When to write (the trigger).** Common choices are: after every turn (chat assistants extracting user facts), at the end of each episode (trajectory stores, AWM, ASI), only after success (AWM's default), after failure (Reflexion), or when enough has accumulated. Beyond the lecture: Generative Agents (Park et al., 2023) triggers a **reflection** when the summed importance scores of recent events exceed a threshold of 150, which in their simulation happened two or three times a game day. A good trigger batches work and avoids writing every trivial observation.

**Judge.** Before inducing anything, decide whether the episode went well. In online settings there is no ground-truth reward, so systems use an **LLM-as-judge**: a model reads the task, actions and final state and predicts success. AWM's judge asks, "Final state predicted to be correct?" and passes on NO. ASI's judge also asks "Skills used?" so that a skill is only credited when it actually ran. How much does judge quality matter? L4 shows ReasoningBank's experiment with simulated judges that flip the true label with a fixed probability:

| Simulated judge accuracy | 100% | 90% | 80% | 70% | 60% | 50% (coin flip) |
| --- | --- | --- | --- | --- | --- | --- |
| Success rate (%) | 52.4 | 49.7 | 48.7 | 49.7 | 47.6 | 47.6 |

The no-memory baseline in that setting is 39.0%. So performance depends on judge accuracy, but improves over no memory across a wide range of judge qualities. Even a coin-flip judge helps here, likely because ReasoningBank also mines failures, so a mislabeled episode still yields a plausible strategy.

**Induce.** Induction turns an episode into a reusable artifact by abstraction: drop specifics, name the pattern, parameterize what varies. AWM's induction prompt (L4, from AWM Appendix A.1) is worth memorizing: "find the repetitive subset of actions across multiple tasks, and extract each of them out as a workflow. Each workflow should be a commonly reused sub-routine of the tasks. Do not generate similar or overlapping workflows. Each workflow should have at least two steps. Represent the non-fixed elements (input text, button strings) with descriptive variable names." In L4's example, the episode click("Marketing"), click("All Reviews"), fill(757, "satisfied"), click("Search"), send\_msg\_to\_user("2") becomes "Task: Search for reviews matching {term}" with the literal "satisfied" replaced by {term}.

**Resolve conflicts.** When the new item overlaps an old one, choose ADD, UPDATE, DELETE or NOOP (Mem0). Without this step a store accumulates duplicates and contradictions: two records claiming different search-box IDs, or a preference the user has since revoked.

**Admit.** Admission is the gate that decides whether a candidate enters memory. Code skills make a stronger gate possible because code can be executed. L4 shows SkillWeaver-style admission:

```python
candidates = propose_skill(task)
episode = practice(candidates, task)
if reward_model(episode.actions, episode.screenshots, task):
    memory.add(candidate)
else:
    candidate = revise(candidate, task)
```

It also shows static checking: a linter flags identify\_pill(page, imprint="M366", color="White") with "parameter 'color' is defined but never used," and the revision adds the missing branch that selects the color. Text skills get no such check; the only test is whether later tasks go better.

**Who should do each step?** L4 closes with an ownership table. Human effort is valuable for *authoring* when the skill or policy is already known, for *verifying* when correctness is normative or high-stakes, for *selecting* when rare exceptions need contextual judgment, and for *maintaining* when accountability requires an owner. Agent effort is valuable when the skill must be discovered through interaction, outcomes are executable and cheap to test, routing repeats and produces feedback, and drift is visible in outcomes and repairable.

**Online induction and compounding.** In L4's online setting, evaluation tasks arrive one at a time, and a successful task updates memory before the next arrives. The metric is **cumulative success rate** over all tasks seen so far. AWM's plot on a maps website shows the payoff: early workflows ("find a place by its name," "get the coordinates of a place") are reused inside later ones ("get driving time from A to B," "find a Hilton hotel near this location, then show me the shortest walking path"), and the gap over the baseline widens to 22.5 points after 40 examples. Beyond the lecture: AWM reports 24.6% and 51.1% relative success-rate improvements on Mind2Web and WebArena.

Common misconception: "If the task succeeded, save the solution." SAGE (Section 8) points out that task success says nothing about whether *saving* part of the solution was worthwhile; only a later task can show that. Admission is a bet on future reuse.

### 6. Reading memory: retrieval, scoring and the cost of over-retrieval

Reading memory means choosing a handful of records to copy into working memory. L4's lifecycle names it: **USE: memory → select/retrieve → act → outcomes**. Retrieval has three design choices: who issues the query, how candidates are scored, and how many are returned.

**Who issues the query.** In *harness-driven* retrieval, code runs a search on every turn (usually using the user message or task as the query) and injects the top results. In *agent-driven* retrieval, the model decides when to search and what to ask, as in MemGPT's recall\_storage.search. Harness-driven retrieval is predictable but blind to the agent's reasoning; agent-driven retrieval is adaptive but the agent may forget to look. L10 (deep research) makes a related point: "the retriever often sees only the query," not the agent's reasoning, and AgentIR improves retrieval by feeding the retriever the agent's information need along with the query.

**Lexical scoring (BM25).** BM25 ranks documents by term overlap, weighting rare terms higher (inverse document frequency) and saturating repeated terms. It excels at exact identifiers: error codes, function names, element IDs, SKU numbers. It fails on paraphrase: "cost" will not match "price."

**Dense scoring (embeddings).** L10 describes the dual encoder: encode each document once with E\_d, encode the query with E\_q, score s(q, d) = E\_q(q)ᵀE\_d(d), and return the top k from a vector index. Encoders are trained contrastively to score a relevant passage above negatives. Dense retrieval handles paraphrase but blurs exact tokens and numbers. **Hybrid** retrieval runs both and fuses the rankings, which is the usual production default.

**Beyond relevance: recency and importance.** Beyond the lecture, the most cited scoring rule for agent memory comes from Generative Agents (Park et al., 2023). Each memory gets three scores. **Recency** decays exponentially with the game hours since the memory was last retrieved, with decay factor 0.995. **Importance** is an integer from 1 ("purely mundane, e.g., brushing teeth") to 10 ("extremely poignant, e.g., a break up"), assigned by the LLM at write time. **Relevance** is the cosine similarity between the memory's embedding and the query's. Each score is min-max normalized to \[0, 1\] over the candidates, and the final score is the weighted sum with all weights set to 1. The Mechanics section gives the formula, and Hands-on works an example by hand.

**Progressive disclosure is retrieval by the model.** Skills (Section 7) use a different read path: the harness shows an index of names and descriptions, and the model itself decides which skill to load. This is agent-driven retrieval where the "embedding" is the model's own reading of a one-line description. It works well when there are tens of skills; with thousands, you need a search step first.

**The cost of over-retrieval.** More memory in the prompt is not better. L4 shows ReasoningBank's success rate on WebArena shopping as a function of how many experiences are retrieved:

| Experiences retrieved | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| Success rate (%) | 39.0 | 49.7 | 46.0 | 45.5 | 44.4 |

One experience gives the best result, and each additional one lowers it. L4 notes that SkillsBench found the same for human-curated skills: tasks with 1–3 skills improved more than tasks with 4 or more. The lecture offers two explanations: some retrieved experiences are irrelevant (a limitation of the memory), and the agent is limited in what it can condition on (a limitation of the model). Beyond the lecture, a third is interference: two similar but different procedures invite the model to blend them.

| Retrieval method | Good at | Weak at | Typical use |
| --- | --- | --- | --- |
| BM25 (lexical) | Exact IDs, rare terms, code symbols | Paraphrase, synonyms | Logs, code, error messages |
| Dense embeddings | Paraphrase, topical similarity | Exact numbers and IDs; negation | Facts, lessons, trajectories |
| Hybrid + fusion | Both, robustly | Needs two indexes | General default |
| Recency/importance weighting | Fresh and salient items | Old but relevant items | Conversational and simulation agents |
| Model reads an index | Small, well-described sets | Large libraries | Skills (progressive disclosure) |

Common misconception: "Top-k with a big k is the safe choice." L4's data say the opposite. Treat k as a hyperparameter to tune on your own tasks, prefer a relevance threshold over a fixed k, and let the agent request more if needed.

### 7. Skills: procedural memory as text, code and packages

A **skill** is reusable knowledge about how to act. L4 splits skill creation into two pathways. *Skills as instructions* are written by a person or organization from existing expertise, policy or documentation; their strength is known intent and provenance, and their burden is expert time to write and maintain. *Skills as learning* are induced by the agent from its own episodes and outcomes; they work where the skill must be discovered, and their burden is judging outcomes, verification and curation.

**Authored skills and SKILL.md.** L4's motivating example is the same request typed into every pull-request conversation: check this Python code with Black at an 88-character line limit, Ruff with custom rules, type hints on public APIs, Google-style docstrings and pytest for new functions. A skill packages that request once. In the Agent Skills format it is a folder:

```text
python-review/
├── SKILL.md      # Required: instructions + metadata
├── scripts/      # Optional: executable code
├── references/   # Optional: documentation
└── assets/       # Optional: templates, resources
```

SKILL.md starts with YAML frontmatter (name: python-review; a description saying it "should be used when the user asks to review Python code, check Python style, lint Python, or mentions code quality"; optional triggers) followed by a Markdown body with the actual procedure. Beyond the lecture: the open AgentSkills specification requires only name (at most 64 lowercase characters, hyphens allowed, matching the folder name) and description (at most 1,024 characters, saying what the skill does and when to use it). It recommends roughly 100 tokens of metadata per skill, a body under 5,000 tokens and under 500 lines, and file references kept one level deep.

**Progressive disclosure** is the loading rule that makes skills cheap. L4's table:

| Level | What | When it enters the context window |
| --- | --- | --- |
| 1 | SKILL.md metadata (YAML) | Always loaded |
| 2 | SKILL.md body (Markdown) | When the agent triggers the skill |
| 3 | Bundled files (text, scripts, data) | When the agent reads the files |

L4 walks through it with HermesAgent. Turn 1: the system prompt lists skills by category with name and description only (about 3k tokens in Hermes), with the instruction that if a skill "matches or is even partially relevant to your task, you MUST load it with skill\_view(name)." Turn 2: skill\_view('python-review') returns the body as a tool result. Turn 3: the agent runs scripts/run\_checks.py src/ and sees only the script's output, so the checker's code never enters context. Turn 4: skill\_view('python-review', 'references/docstring-style.md') loads the docstring rules only when needed. The design keeps the always-on cost proportional to the *number* of skills, not their size.

**Do authored skills help?** SkillsBench (arXiv 2602.12670), shown in L4, pairs 87 real-work tasks across 8 domains with human-curated skill bundles and runs 18 model–harness configurations with and without skills (9,396 trajectories). Skills raise the average pass rate from 33.9% to 50.5%. Beyond the lecture, the paper reports per-configuration gains from +4.1 to +25.7 points. But the lecture stresses the limits: focused skills correlate with larger gains (tasks with 1–3 skills improve more than tasks with 4 or more, and shorter SKILL.md groups gain more), and skills still *hurt* on 13 of 87 tasks because "a skill can displace a better default strategy."

**Where skills come from and how they are kept alive.** L4 lists three sources: *bundled* with the harness; *installed or written* by a person, checked into the repository under .agents/skills/ or installed from a registry; and *created by the agent*, as with Hermes's skill\_manage tool (create, patch, delete) or OpenHands's /skill-creator command, which drafts a skill from the workflow the agent just finished. OpenHands' advice: "don't write a skill from scratch. Create it right after the agent finishes a workflow you want to repeat, then test it a few times." Its code-review case study shows maintenance as a loop: run the review skill on every PR, log each run, have a model judge count how many suggestions humans kept after merge, have a model find recurring failures (ignoring repo conventions, about 15%; approving PRs with a critical flaw, about 10%), and patch SKILL.md (request changes whenever a critical issue is found; check a suggestion against the repo before posting).

**Induced skills: text vs code.** For learned skills the central question is representation. AWM (Agent Workflow Memory; Wang, Mao, Fried and Neubig, ICLR 2025) induces **text workflows**: a task description plus an annotated action trajectory with variables, e.g. click(1274) "navigate to the Video Games category," fill(473, {search\_terms}), click(478). ASI (Agent Skill Induction; Wang, Gandhi, Neubig and Fried, COLM 2025) induces **code skills**: Python functions with docstrings, such as search\_product(search\_box\_id, query), which clicks, fills and presses Enter, and can then be called like a tool.

| Property | Text workflow (AWM) | Code skill (ASI) |
| --- | --- | --- |
| How it is used | A hint the model reads and adapts | A function the model calls as an action |
| Flexibility | High: adapts to the page in front of it | Low: does exactly what it says, even on a changed page |
| Efficiency | None: the agent still issues every low-level action | High: one call replaces many model steps |
| Verifiability | Only via later outcomes | Can be run and tested before storing |
| Composition | Informal | Hierarchical: skills call skills |

ASI's induction produces two functions from the reviews episode: open\_marketing\_reviews() (click Marketing, then All Reviews) and search\_reviews(search\_box\_id, search\_button\_id, search\_term). The candidate is then *tested* by re-solving the task with the new skills: open\_marketing\_reviews(); search\_reviews('757', '704', "satisfied"); send\_msg\_to\_user("2"). The judge checks both that the final state is correct and that the skills were used.

The efficiency gain can be dramatic. ASI's Figure 5 (shopping site) asks the agent to change a billing address and then a shipping address. Without memory the agent takes redundant steps, updates one field at a time, and hits the 50-step cap. With code skills it takes 4 steps: navigate\_to\_address\_settings(...), then update\_address\_details(...) twice. Averaged over five WebArena sites (ASI Table 2):

| Condition | Checkpoints reached (%) | Steps per task |
| --- | --- | --- |
| No memory | 41.3 | 24.5 |
| Text skills | 59.5 | 20.6 |
| Code skills | 80.2 | 15.0 |

Beyond the lecture, ASI's abstract summarizes this as a 23.5% success-rate improvement over the static baseline, 11.3% over text skills, and 10.7–15.3% fewer steps.

**The generality problem.** Code skills are brittle across environments. ASI's Figure 4 induces skills on WebArena and runs them on target.com: search\_product transfers correctly, but sort\_listings clicks a dropdown while Target's sort opens a sidebar. **PolySkill** (Yu et al., ICLR 2026) fixes this with software-engineering polymorphism: an AbstractShoppingSite class declares primitives (search\_product, add\_to\_cart, checkout) and defines compositions once against them (find\_and\_add\_to\_cart, purchase\_item); AmazonWebsite and TargetWebsite implement only the primitives. Beyond the lecture: PolySkill reports 1.7x higher skill reuse on seen websites, up to 9.4% higher success on Mind2Web and 13.9% on unseen websites, and over 20% fewer steps.

**Lineage: program induction.** L4 places ASI in a longer line of work. **Voyager** (Wang et al., 2023) builds a Minecraft skill library of JavaScript functions that call earlier ones, driven by an automatic curriculum and iterative prompting with environment feedback and self-verification; beyond the lecture, it reports 3.3x more unique items, 2.3x longer distances and up to 15.3x faster tech-tree milestones than prior methods. **DreamCoder** induces functions that compress a corpus of solved programs; **Stitch** does that compression fast and symbolically; **LAPS** uses natural-language descriptions to guide induction; **LILO** has an LLM write programs, Stitch compress them, and the LLM name and document each function. **SkillWeaver** (Zheng et al., 2025) has web agents explore a site, propose skills, practice them and distill them into APIs; beyond the lecture it reports 31.8% and 39.8% relative gains on WebArena and real websites.

**The unifying trade-off.** L4 summarizes representation as a spectrum: a retrieved episode preserves concrete behavior but is long and hard to transfer; a text skill gives flexible guidance but does not improve efficiency; a code skill is executable, composable and efficient but can be brittle. The question is "how much of the behavior is left to the model, and how much is fixed in the artifact?"

Common misconception: "Code skills are strictly better." They win when structure repeats exactly and outcomes can be tested. When the environment varies or the task needs judgment, text guidance (or a code skill with an abstract interface, as in PolySkill) is safer. SKILL.md packages combine both: text for judgment, scripts/ for the parts that must be exact.

### 8. Maintaining memory: consolidation, forgetting and learned memory management

A memory that only grows eventually hurts: retrieval gets noisier, conflicts pile up, and stale skills fire on changed environments. L4's third loop is **MAINTAIN: outcomes → add → repair → retire → memory**.

**Consolidation** means merging and abstracting many specific records into fewer general ones. Generative Agents' reflections consolidate observations into higher-level inferences; ExpeL's insight extraction consolidates many trajectories into rules; Mem0's UPDATE merges a new statement into an old one. AWM's induction prompt enforces consolidation at write time: "Do not generate similar or overlapping workflows."

**Forgetting** means removing records that no longer earn their place. **TroVE** (Wang, Fried and Neubig, ICML 2024), shown in L4, grows a toolbox of functions while solving programmatic tasks and periodically drops any function used fewer than ½·log₁₀(n) times, where n is the number of examples seen so far. The threshold rises slowly: 0.5 uses at n = 10, 1 at n = 100, 1.5 at n = 1,000. On L4's plots, forgetting shrinks the library by 74% on MATH algebra, 83% on HiTab and 90% on GQA, with the library staying nearly flat while the unpruned one keeps growing. Beyond the lecture: TroVE reports 79–98% smaller toolboxes than prior methods with equal or better accuracy, and 31% faster, 13% more accurate human verification of its solutions. L4 also cites "Not All Skills Help": a skill that helps one task type can hurt another, so retirement may need to be per task type, not global.

Beyond the lecture, other forgetting rules include time decay (MemoryBank uses an Ebbinghaus-style curve in which recalled memories are reinforced), capacity limits with least-recently-used eviction, and explicit DELETE on contradiction. Claude Code's auto memory, for example, loads only the first 200 lines or 25KB of its MEMORY.md index each session and prompts the model to merge or drop stale entries when the index nears that limit.

**Repair** keeps a useful skill working when the environment changes. ASI updates incompatible skills when moving to a new website; PolySkill makes repair local by re-implementing only primitives; the OpenHands review skill is repaired by patching SKILL.md from failure analysis.

**Training the memory manager.** Everything so far uses a frozen model prompted to induce and retrieve. L4's final technical slide asks whether the model can be *trained* to decide what to save. The obstacle is credit assignment: task 1's reward says whether task 1 succeeded, not whether saving its search skill was worthwhile, because the value is "unknown until reuse." **SAGE** (Wang et al., ACL 2026) puts the later task inside the training example: two related tasks in one rollout, with task 1's reward set to r₁ + 1\[both succeed\] · 1\[task 2 reused its skill\]. On AppWorld test-normal with Qwen2.5-32B, scenario completion rises from 55.4 (outcome-only reward) to 56.6 (reward both tasks succeeding) to 60.7 (reward successful skill reuse). Beyond the lecture, SAGE reports 26% fewer interaction steps and 59% fewer generated tokens. **AgeMem** (Yu et al., ACL 2026) does the same inside one long trajectory: it exposes six memory tools (add, update and delete for long-term memory; retrieve, summary and filter for short-term context) and trains their use with three-stage RL. Here memory management becomes a learned policy, closing the loop to L8–L11's weight updates.

Common misconception: "Forgetting loses information, so avoid it." In a retrieval system, an unused record is not free: it competes for retrieval slots and context. TroVE's large pruning with no accuracy loss shows most of a grown library is dead weight.

### 9. Safety and evaluation of memory

Memory creates a new attack surface: anything that can write to memory can influence every future run that retrieves it. This is **memory poisoning**, a persistent form of prompt injection.

- **AgentPoison** (Chen et al., NeurIPS 2024) optimizes a backdoor trigger so that queries containing it retrieve attacker-planted records. It reports over 80% average attack success with under 0.1% of the memory poisoned and under 1% impact on benign performance, across driving, question-answering and healthcare agents.
- **MINJA** (Dong et al., 2025) shows an attacker needs no write access: ordinary queries can steer an agent into storing malicious "bridging" reasoning steps in its own memory, which later retrievals reuse.
- **PoisonedRAG** (Zou et al., USENIX Security 2025) injects five crafted texts per target question into a knowledge base of millions and reaches about 90% attack success.
- **Skill supply chain.** A skill is instructions plus code the agent will run. Anthropic's Agent Skills guidance is to install skills only from trusted sources and otherwise audit every bundled file, especially code dependencies and instructions to contact external network endpoints.

Beyond the lecture, defenses layer up: record **provenance** (who or what wrote each item, from which source); separate trusted *instructions* from untrusted *data* and never let retrieved memory raise permissions; require admission tests or human review for skills, especially those that run code; quarantine memories written from untrusted web content; and keep versioned, auditable stores that can be rolled back. L7 adds the user-facing side: GUM retrieves and updates confidence-weighted user facts, and MyPCBench stresses that "consent and forgetting are essential" for personal memory.

**Evaluating memory.** The core design is **paired evaluation**: the same tasks with and without memory, as in SkillsBench's no-skills vs curated-skills runs. Other protocols from the lectures:

- **Online cumulative success** (AWM, ASI): tasks arrive in a stream, memory updates after each, and success is averaged over tasks seen so far. This measures compounding.
- **Efficiency**: steps per task, tokens and latency (ASI's 24.5 → 15.0 steps; L3's cost metrics).
- **Sensitivity analyses**: judge accuracy (ReasoningBank), number retrieved (over-retrieval curve), successes only vs with failures.
- **Continuation-based evaluation** (L3): plant state, compact or store it, and measure later decisions, state recall and stability over repeated compactions.
- **Cross-environment transfer**: induce on one website and test on another (ASI on target.com, PolySkill on unseen sites).

Beyond the lecture, dedicated long-term-memory benchmarks include **LoCoMo** (conversations averaging about 300 turns and 9K tokens over up to 35 sessions), **LongMemEval** (500 questions testing information extraction, multi-session reasoning, temporal reasoning, knowledge updates and abstention; commercial assistants showed about a 30% accuracy drop over sustained interactions), and **MemoryAgentBench** (accurate retrieval, test-time learning, long-range understanding and selective forgetting, with no current method mastering all four).

Common misconception: "If the memory benchmark score is high, memory is safe to deploy." Benchmarks measure recall and task gains, not robustness to adversarial writes, privacy, or drift. Evaluate safety and forgetting separately.

### 10. Skills inside a framework: AgentContext and triggers in OpenHands (L14)

L14 shows what a skill looks like once it is a framework object rather than a research artifact. Slide 25 is titled "Skills: additional instructions for the same agent" and gives the whole API in a few lines:

```python
agent_context = AgentContext(
    skills=[Skill(
        name="repo.md",
        content=repo_instructions,
        trigger=None,
    )],
)
agent = Agent(
    llm=llm, tools=tools,
    agent_context=agent_context,
)
```

The slide's three bullets say what this is for: "project conventions and recurring procedures," "relevant instructions on demand," and "earlier name: microagents." The rename matters. A skill is not a second agent with its own loop; it is text the harness splices into the one agent's context. In L4's terms it is procedural memory authored as instructions.

**Why skills matter more in a single-agent design.** L14 argues for one generalist agent over role pipelines. CodeR-style systems split the work into Manager, Reproducer, Fault localizer, Editor and Verifier (slide 22). Neubig's "Don't Sleep on Single-agent Systems" (slide 23) answers with one agent that reproduces, locates, edits and tests, keeping shared context and avoiding handoffs. Slide 24 adds a small general tool set: edit files, run commands, browse. Something must still carry each role's know-how, and skills are that carrier. The Reproducer's procedure becomes a skill the generalist loads when the task calls for it, so memory replaces agent specialization, not just repetition.

**Triggers are the retrieval policy.** The `trigger` field decides when a skill's text enters the context, which is L4's progressive-disclosure question written as code. On the slide, `trigger=None` means always loaded. Beyond the lecture, the OpenHands SDK documentation lists further options:

| Skill form (OpenHands SDK) | When its text enters context | Where it lands | Baseline token cost | L4 analogue |
| --- | --- | --- | --- | --- |
| `Skill(..., trigger=None)` | Every turn | System prompt (`<REPO_CONTEXT>`) | Full content, always | Always-on instructions (AGENTS.md style) |
| `KeywordTrigger(keywords=[...])` | When a keyword appears in the user message | Appended to that user message | Zero until triggered | Harness-driven retrieval by exact word match |
| `PathTrigger(paths=[...])` ("rules") | When the agent reads, edits or creates a file matching a glob | Appended to that tool result | Zero until triggered | Retrieval keyed on the action, not the query |
| AgentSkills folder (`SKILL.md`) | Name and description always; body when the agent reads it | Listed in `<available_skills>` | About one line per skill | Progressive disclosure, levels 1–3 |

Three points follow. First, `trigger=None` is the most expensive form, so the docs reserve it for "small, always-needed context." Second, a keyword trigger is harness-driven retrieval with the crudest scorer, an exact word match: it fires on "encrypt" whether or not the task needs the skill. Third, a path trigger attaches knowledge to the place it is needed, a file pattern, which is a precise trigger L4 did not discuss. Beyond the lecture, `load_project_skills()` also reads AGENTS.md, CLAUDE.md and GEMINI.md from the workspace root, so a repository's instruction file is treated as an always-on skill.

**Four things that "remember" in one SDK.** L14's SDK walk-through shows three more features that map onto this sheet's taxonomy. They are easy to confuse because all of them keep something.

| L14 feature | What it keeps | Lifetime | Memory type (section 2) |
| --- | --- | --- | --- |
| Conversation persistence (`persistence_dir`, `conversation_id`, slide 17) | Saved events and conversation state | Until deleted; restored with the same ID and storage | Episodic record of one task |
| `LLMSummarizingCondenser(max_size=10, keep_first=2)` (slide 18) | Original instructions, a summary of older events, recent work | Within one conversation | Working memory under compaction (section 3) |
| `AgentContext` skills (slide 25) | Conventions and procedures | Every conversation that loads them | Procedural memory |
| Workspace files (slides 15 and 19) | Code, notes, test results | As long as the workspace exists | External artifacts the agent can re-read |

Slide 17 adds that "workspace persistence \[is\] a separate concern": restoring a conversation brings back its events, not the files the agent changed. Slide 18 warns of "potential detail loss" when condensing and names "files and tests as evidence" as the backstop. That is L3's externalize move. Facts that must survive compaction belong in the workspace or a skill, not only in the transcript.

Common misconception: "A microagent is a small agent." It never was; the rename to skills makes clear it is a prompt fragment for the same agent. Adding a skill changes what one agent knows, not how many agents run.

### 11. Learning skills from automation runs: SkillRefiner (L14)

L14 ends by turning its automation pipeline into a skill-learning loop: runs produce traces, traces revise the skill, and the revised skill shapes the next runs. This is L4's LEARN loop (episodes, judge, induce, admit) running on production traffic instead of a benchmark stream.

**Where the traces come from.** L14 frames an automation run as "event → bounded task → inspectable result" (slide 39): Trigger (issue, PR or schedule) → Context (repository, instructions, permissions) → Run (isolated workspace) → Artifact (patch, report or comment) → Check (person or policy). Two boxes matter for memory. Skills enter at Context, as the run's instructions. Outcome labels come from Check, because a reviewer accepting or rejecting the artifact is the judge that L4 says induction needs. The demo dashboard (slide 38) shows a PR reviewer and an issue triager with over a thousand runs each. That volume is what makes learning from runs possible, and also what makes reading every trace by hand impossible.

**The SkillRefiner pipeline.** Khatry et al. (slide 42, Figure 1) start from rollout traces D and an initial skill S₀ and produce a revised skill S₁ in five stages:

1. **Feedback-augmented trajectory representation.** Score each trace and summarize it with the available evidence. Successful traces, and failure traces plus their evidence, each become a summary sᵢ.
2. **Embedding and clustering.** Embed the summaries and cluster within each outcome partition, giving success clusters and failure clusters.
3. **Proposal generation.** An edit proposer, given S₀, generates candidate edits from each cluster with outcome-specific instructions: positive proposals P⁺ from successes and negative proposals P⁻ from failures.
4. **Evidence gating.** Failure-derived proposals are verified against their supporting evidence; only the supported ones pass.
5. **Skill merging.** The positive and validated negative proposals are merged with S₀ to give S₁.

Each stage answers a problem L4 raised. Summarizing first cuts each long trace down to what matters, as ReasoningBank does with its memory items. Clustering consolidates at write time (section 8): one edit addresses a recurring pattern rather than one odd run, and cost scales with the number of clusters, not traces. Splitting by outcome follows ReasoningBank's finding that failures carry lessons too. The evidence gate is section 5's admission check, applied asymmetrically. A lesson from a success describes behavior that already worked; a lesson from a failure is a hypothesis about what went wrong, and an unchecked hypothesis is how a skill absorbs a wrong "fix."

The sketch below restates the figure as code. It is an illustrative reconstruction, not the paper's implementation; `llm`, `embed` and `cluster` stand for any model call, embedder and clustering routine.

```python
def refine_skill(skill_0, traces, llm, embed, cluster):
    # 1. Summarize each trace together with its evidence (test output, reviewer verdict)
    summaries = {"success": [], "failure": []}
    for t in traces:
        outcome = "success" if t.passed else "failure"
        summaries[outcome].append(llm.summarize(t.actions, t.evidence))
    # 2. Cluster within each outcome partition
    groups = {k: cluster(embed(v)) for k, v in summaries.items()}
    # 3. One edit proposal per cluster, with outcome-specific instructions
    pos = [llm.propose_edit(skill_0, g, mode="keep what worked") for g in groups["success"]]
    neg = [llm.propose_edit(skill_0, g, mode="fix what failed") for g in groups["failure"]]
    # 4. Gate only the failure-derived edits on their cited evidence
    neg_ok = [p for p in neg if llm.verify(p, p.cited_evidence)]
    # 5. Merge accepted edits into the original skill
    return llm.merge(skill_0, pos + neg_ok)
```

**The evidence on the slide.** Slide 43 (Khatry et al., Table 1) reports held-out results. "Init." says whether S₀ was written by an LLM or a human. GEPA and T2S are baseline refiners; the slide does not expand T2S (probably Trace2Skill, see References). The last column is computed here.

| Task (metric) | Init. | Model | Initial | GEPA | T2S | SkillRefiner | Gain over initial |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SpreadsheetBench (acc. %) | LLM | GPT-5.4-mini | 77.5 | 78.5 | 79.0 | 84.0 | +6.5 |
| SpreadsheetBench | LLM | MiniMax-M2.7 | 68.0 | 75.0 | 69.5 | 76.0 | +8.0 |
| SpreadsheetBench | Human | GPT-5.4-mini | 86.0 | 86.0 | 86.5 | 86.5 | +0.5 |
| SpreadsheetBench | Human | MiniMax-M2.7 | 79.0 | 73.0 | 81.5 | 84.5 | +5.5 |
| DAPO-Math (acc. %) | LLM | GPT-5.4-mini | 90.0 | 90.0 | 91.0 | 91.0 | +1.0 |
| DAPO-Math | LLM | MiniMax-M2.7 | 53.5 | 53.5 | 61.0 | 64.0 | +10.5 |
| PR Review (F1) | Human | GPT-5.4-mini | 0.16 | – | 0.13 | 0.18 | +0.02 |
| PR Review (F1) | Human | MiniMax-M2.7 | 0.11 | – | 0.13 | 0.15 | +0.04 |

Some SkillRefiner cells carry † and \* markers defined in the paper, not on the slide. The slide's caption is "Higher scores than initial skills across both agent models." Four readings matter for this topic:

- **Headroom drives gains.** The largest jump comes from the weakest start (MiniMax-M2.7 on DAPO-Math, 53.5 → 64.0). A strong human skill at 86.0 barely moves; the remaining failures may be model limits that no instruction can fix.
- **Learned edits help human skills too.** Three of the four human-initialized rows improve by at least 0.02 F1 or 5.5 points. This echoes L4's OpenHands code-review loop, where a human-written SKILL.md is patched from logged failures.
- **Refinement can regress.** GEPA drops the human/MiniMax-M2.7 row from 79.0 to 73.0, and T2S drops PR-review F1 for GPT-5.4-mini from 0.16 to 0.13. This is SkillsBench's warning again (skills hurt on 13 of 87 tasks): every edit needs held-out evaluation before it ships.
- **Hard tasks stay hard.** PR-review F1 stays below 0.2 for every method, so a better skill does not substitute for a stronger model on judgment-heavy work.

**How it compares with L4's methods.** AWM and ASI induce new skills from individual successful episodes and admit them by re-solving the task. SkillRefiner edits an existing skill using many runs of both outcomes and gates failure lessons on evidence. It is closest to L4's OpenHands review-skill maintenance loop, now automated end to end. It also differs from ReasoningBank: ReasoningBank adds retrievable memory items, while SkillRefiner rewrites the one procedure the agent loads. Beyond the lecture, Trace2Skill (Ni et al., 2026) also merges many trajectories in parallel into a skill directory and reports beating both sequential skill editing and ReasoningBank-style retrieval; GEPA (Agrawal et al., 2025) evolves prompts by reflecting on execution traces.

Common misconception: "Learning from runs means fine-tuning." SkillRefiner changes no weights. The learned artifact is a text file a reviewer can diff, which fits the software factory's review culture (slide 41) and L8's rule of thumb: keep knowledge in external artifacts while it is still changing.

### 12. Instructions, executable skills and fixed workflows (L15)

L15 places skills on a scale of how much structure surrounds an agent's actions. Its opening slide lists three structures the course has already met: skills ("Instructions guide behavior; executable skills can constrain execution"), planning and decomposition (MACU, RAO, RLM), and automations ("Connect agent runs through prescribed steps and checks"). The lecture's subject is the next step: "Orchestration frameworks let developers specify parts of a workflow in advance, while delegating judgments and actions to LLMs."

**Guide versus constrain.** A text skill is advice. It enters the context, and the model decides whether and how to follow it. An executable skill (L4's ASI code skills) constrains: once the model calls `search_product(...)`, the function's clicks happen as written. A workflow goes further. The developer writes the procedure as a graph; the model does not choose whether to follow it, but supplies specific judgments inside it. L4's closing question was "how much of the behavior is left to the model, and how much is fixed in the artifact?" L15 extends the same dial past code skills.

| Form | Who chooses the next step | What is fixed in advance | Testable before use? | Typical failure |
| --- | --- | --- | --- | --- |
| Retrieved episode (L4) | Model | Nothing; a concrete example | No | Copies irrelevant details |
| Text skill or SKILL.md (L4, L14) | Model | Advice | Only through outcomes | Ignored, or displaces a better default |
| Code skill (ASI, L4) | Model chooses to call it; code runs the steps | Steps inside the function | Yes, by running it | Brittle on a changed environment |
| Automation run (L14) | Trigger and pipeline | Trigger, context, isolation, check | Partly, per run | A wrong artifact passes a weak check |
| Explicit workflow (LangGraph, L15) | Graph edges, with model output feeding routing | Steps, order, required checks | Yes, node by node | Rigid; an unanticipated case has no path |

**Why fix a procedure.** L15 slide 3 contrasts a single agent, whose behavior is "determined by model, prompt, and environment," with an explicit workflow (Classify → Retrieve → Investigate → Check), where "more of the behavior is specified by the developer in advance." Slide 4 names two gains. Consistency: "prescribe required steps and enforce checks in code," for example flagged reply → approval → send. Efficiency: "use an appropriate model for each step, or even just code (no model at all)"; polling is plain code and classification uses a smaller model. Slide 22 lists the costs: workflows are less adaptable, and information flow has to be managed explicitly. Testability is a third gain.

**A workflow is a skill compiled into control flow.** Take L15's support example. A billing rule written as a SKILL.md line ("refund requests need employee approval before sending") is something the model can forget, misread or be talked out of. In the LangGraph version the same rule is an edge. If the classifier returns billing, complex or urgent, execution passes through Review proposed reply, and Send reply cannot be reached without approval. The procedure has moved from procedural memory the model reads to structure the model runs inside. Model judgments remain, since classification and drafting are LLM calls, but each is narrow.

This suggests a promotion path for procedural knowledge. It is this sheet's synthesis, not a slide. A procedure first appears as a successful episode, becomes a text skill once it recurs, a code skill once its steps are stable, and a workflow node once it must be enforced. Each promotion buys consistency, efficiency and testability and pays in flexibility. L8's rule (move stable, high-volume behavior into weights) is a parallel path toward the model rather than toward code.

**Instructions still live inside the workflow.** L15's `draft_response` node calls the model with the system message "Draft a reply using these documents." That is an instruction, and in a richer system it would be a loaded skill. Workflows do not remove skills; they shrink the scope each skill has to govern.

Common misconception: "Executable means safe." An executable skill or workflow constrains what happens after a decision; it does not make the decision right. In L15's graph "the review path depends on the model's classification," so a billing email misclassified as a routine question goes from draft to send with no review. Put checks on the risky outcome (money moves, a reply leaves), not only on the label.

### 13. Checkpointed thread state: short-term memory in a workflow framework (L15)

In a workflow framework, short-term memory is a typed state object saved after each step. L15 builds it in three slides. Slide 11 defines the state:

```python
class SupportState(TypedDict, total=False):
    email_id: str
    email_content: str
    classification: dict
    search_results: list[dict]
    draft_response: str
    review_decision: dict
```

Slide 12 states the rule: "A node reads state and returns the fields it changes." `classify_intent` reads `email_content` and returns only `{"classification": ...}`. Slide 14 compiles the graph with `g.compile(checkpointer=checkpointer)`. Slide 17 lists what that buys: save progress ("a persistent checkpointer records the workflow's state and where execution should continue"), resume ("use the same execution ID to load saved progress"), retry a failed node after a temporary error, and pause for human input with an interrupt.

**How this differs from transcript memory.** In a plain agent, working memory is the growing transcript, and L3 treats compaction as estimating the task state from it (section 3). A workflow declares the task state up front as named fields, so there is nothing to estimate. Each field is written by a known node, holds raw data rather than prose, and survives a crash. The cost is the one slide 22 names: information flow must be designed. A fact with no field is not remembered.

Beyond the lecture, LangGraph's documentation draws the same line this sheet uses. Checkpointers are for "short-term, thread-scoped memory, including conversation continuity, human-in-the-loop workflows, time travel, and fault tolerance." A separate Store is for "long-term, cross-thread memory, including user preferences, facts, and shared knowledge." A thread is one execution keyed by a `thread_id`, and savers range from in-memory to SQLite and Postgres. The docs also advise that "your state should store raw data, not formatted text," and note that "LangGraph's persistence layer creates checkpoints at node boundaries."

|  | Checkpointed thread state | Long-term memory and skills |
| --- | --- | --- |
| Scope | One thread (one email, one task) | Every thread that retrieves it |
| Key | Thread or execution ID | Namespace, embedding, skill name or trigger |
| Written by | Each node, every step | A write pipeline: judge, induce, admit (sections 5 and 11) |
| Holds | Task-state fields and where to resume | Facts, lessons, procedures |
| Main use | Resume, retry, human-in-the-loop, debugging | Reuse across tasks |
| L14 analogue | Conversation persistence by `conversation_id` | `AgentContext` skills |

**Node granularity is a memory decision.** Slide 16 shows a crash during reply generation. Because the search results were saved as their own node's output, the restart repeats only generation: "With saved search results, restart generation using completed work." Finer nodes save state more often. As a rough model, if a failure is equally likely at any point inside a node of duration d, the expected rework is d/2:

$$
\mathbb{E}[\text{rework}] \approx \sum_{i} p_i \, \frac{d_i}{2}
$$

Here pᵢ is the probability that a failure lands in node i and dᵢ is that node's duration. Splitting one node into k equal parts divides its term by k, at the price of more checkpoint writes. This is the same trade as L3's compaction recovery plan: save enough that resuming never repeats expensive, non-deterministic work such as an LLM call or a paid search.

**Saved state is also the audit trail.** L15's monitoring half uses the recorded execution as data. LangSmith traces record each operation's inputs, outputs, time and errors (slide 18), and node tests check "returned updates and routing decisions" (slide 20). The same records, analyzed at scale with tools such as Docent and Hodoscope, are the input that SkillRefiner-style learning needs. T13 (Workflow Orchestration and Agent Monitoring) covers that side.

Common misconception: "Adding a checkpointer gives the agent long-term memory." It does not. A checkpoint is scoped to one thread and stores that thread's fields. A lesson learned while handling one email is invisible to the next thread unless something writes it to a store or a skill.

### 14. Persistent state as an attack surface: what L13 adds

L13 never mentions agent memory or skills, yet one of its slides describes the memory-poisoning pattern exactly. Slide 22, "Shared state across runs," says: "Shared state can outlive the run that changed it." Its example is the Cline incident (slides 6 and 22). An issue-handling agent with a shell ran instructions planted in an issue title. That run left poisoned files in a shared cache. A later release run restored the cache, and the attacker obtained a publish token that was then used to ship an unauthorized command-line release.

Beyond the lecture, Cline's postmortem gives the mechanism. The triage workflow and the nightly release workflow shared a GitHub Actions cache scope, so code run during triage could plant entries under the keys the release job expected. Remediation included making future automation read-only with no shell access and removing cache use from workflows that hold publishing credentials.

Replace "cache" with "memory store" and this is section 9's threat model. The write happens in a low-trust run that reads attacker text. The read happens later, in a run with more authority. Neither run looks malicious on its own.

**Prompt injection with a delay.** L13 defines prompt injection on slide 10: the user has a legitimate task, an attacker "puts instructions in an email, webpage, file, or tool result," and the agent follows them. Memory and skills add a channel and a time shift. A retrieved memory or loaded skill enters the context as text, like a tool result, but it was written earlier and is usually treated as trusted. That trust is what MINJA and AgentPoison (section 9) exploit.

**Where L14 and L15 widen the surface.**

- **Learned skills (L14).** Automations read untrusted text by design: issues, PR descriptions, chat messages. SkillRefiner turns those runs' traces into edits to a skill that every later run loads, which is a write path from an outside author to all future runs. The evidence gate checks that a lesson is supported by the trace. That guards against honest mistakes, not against an attacker who planted the supporting evidence. Success-derived proposals are not gated at all, so a shortcut that "worked" in an attacker-shaped run passes straight through.
- **Repository skills (L14).** `trigger=None` skills and project files such as AGENTS.md load on every turn. Anyone who can merge to the repository can change what every agent run is told.
- **MCP servers and third-party skills (L14).** Slide 26 lists "server access and trust requirements" for MCP. The same applies to installed skills that bundle scripts (section 9's supply-chain point).
- **Workflow state (L15).** A checkpoint is persistent state too. A field filled from untrusted input, such as `email_content`, is read by every later node, including one that sends a reply or approves a refund.

**Applying L13's controls to memory.**

| L13 control | What the slide says | Applied to memory and skills |
| --- | --- | --- |
| Sandbox boundary (slide 21) | "Keep access rules and enforcement beyond the agent's control." | The agent writes memory only through a harness API and cannot edit the store or skill files directly. |
| Fine-grained tokens (slide 28) | The issue-handling account can read and label issues but not publish; the release account can publish but cannot modify the issue cache. | Separate write rights per store. Runs that read untrusted text write only to a quarantine area that privileged runs never load. |
| Check before acting (slide 35) | "To prevent an unsafe tool call, finish the check before executing it." | The admission check runs before a memory write or skill edit takes effect, not after it is retrieved. |
| Rules plus model-based checks (slide 33) | "Use rules for precise conditions and models for questions that need context." | Rules: who may write which namespace, size limits, no URLs or shell commands in learned skills. Model check: does this edit carry instructions that came from untrusted input? |
| Controls beyond the agent (slide 35) | "Keep the checks, logs, and stop controls beyond the agent's control." | Versioned, append-only skill history, so a poisoned edit can be traced to its source run and rolled back. |

**Review does not scale by itself.** L13's base-rate slide (41) shows why. With 10,000 decisions, 1% unsafe, 90% of those caught and 1% of safe decisions flagged, reviewers see 189 alerts, of which only 90 (48%) are real. A team screening every proposed skill edit with a noisy checker faces the same arithmetic. L15 makes the matching point on slide 38: "Agents produce more context than a person can review in full." Scoped write permissions shrink the number of edits that need review, and held-out regression tests (L15 slide 21; SkillRefiner's Table 1) catch edits that hurt behavior whatever their intent. T14 (Agent Safety and Security) covers these controls in depth.

Common misconception: "Memory our own agent wrote is trusted input." An agent's writes inherit the trust level of everything it read during that run. Cline's release job trusted a cache that was poisoned during an agent run that obeyed an issue title.

## Across the lectures

Memory and skills sit at the junction of three course threads: context management (L3), external artifacts (L4) and weight updates (L8–L11), with retrieval (L10) as shared machinery.

**L1 Agents (overview).** L1 lists memory and skills as *harness* capabilities, not model capabilities. Under "coherence over long context" it pairs harness techniques (compaction, dynamic memory lookup, sub-agent delegation) with a training technique (long-context SFT). Under "customizability" it pairs agent memory, skills and custom tools with RL from user feedback. Under "environment understanding" it lists learning skills that encode domain knowledge. The harness diagram names Memory as one of four boxes alongside Permissions, Tools and Control flow. The message is that the same capability can be bought either in the harness or in the weights.

**L2 Tool use.** L2 does not treat memory directly, but it supplies the interface: memory reads and writes, skill\_view, and code skills are all tool calls. Its warning that JSON Schema and grammar constraints "guarantee form, not semantic correctness" applies to memory writes too: a well-formed record can still be wrong.

**L3 Context management (Neubig).** L3 is the working-memory lecture. It quantifies why raw history cannot be the memory (quadratic cumulative input; 77,922 mean tokens per OpenHands session; 37% tool results), explains architectural mechanisms that decide what history remains accessible, and treats compaction as state estimation with anchors, checkpoints, a recent tail, an external evidence store and discards. Its final slide calls this "preserve intent, exact task state, recent work, and recovery paths—then evaluate continuation." L3 cites MemGPT for "externalize and retrieve," which is exactly where L4 picks up. Interesting parallel: L3's linear-attention architectures (DeltaNet, Gated DeltaNet, Kimi Delta Attention) are *memory systems inside the model*. The delta rule writes only the prediction error, which is Mem0's UPDATE in matrix form, and the gates α implement forgetting, the in-weights analogue of TroVE's pruning.

**L4 Memory and Skills (Fried).** L4 is the core. It frames the topic with three questions (representation, induction, lifecycle), a three-location table, and a taxonomy of episodes, facts, lessons and skills. It then moves from authored skills (SKILL.md, progressive disclosure, SkillsBench, OpenHands maintenance) to memories (MemGPT, Mem0, Reflexion, ExpeL family), to induced skills (AWM text workflows, ASI code skills, SkillWeaver testing, PolySkill abstraction), and finally to the lifecycle (ReasoningBank failures and judge noise, over-retrieval, TroVE forgetting, SAGE and AgeMem training). It ends with open tensions: exact episode vs general skill, flexible guidance vs committed execution, reuse vs explore, grow vs update-merge-delete, and a table of when human vs agent effort is valuable.

**L5 Planning.** L5 draws the boundary between a plan and a skill: a plan is intended future behavior "for this task," whereas a skill "provides reusable guidance across tasks," so plans can be more specific. L5 also revisits Reflexion under test-time interaction: scaling interaction gathers more information from the environment. Together these suggest a pipeline in which a plan that works repeatedly becomes a candidate skill.

**L6 Coding agents.** L6 closes with "learning skills for new tasks," but through *training*: SWE-Playground generates projects for practice, and Hybrid-Gym trains a 32B model whose gains transfer to repair, test generation and library building. This is the weight-based counterpart of L4's external skills. Practical coding agents also rely on file-based memory such as repository instruction files and skill folders under .agents/skills/, which L4 mentions.

**L7 Computer-use agents.** L7 contributes two things. First, WorkArena++ shows that composing atomic UI skills (5 skill families, 682 composite tasks) produces knowledge-work workflows, the same compositional idea as ASI and PolySkill. Second, its personalization slide says "memory must be revisable" (GUM retrieves and updates confidence-weighted user facts) and "user control is essential" (MyPCBench: consent and forgetting). That is the user-rights view of Mem0's UPDATE and DELETE.

**L8 SFT.** L8 repeats L4's three-location table with the weights row highlighted. It stresses the costs L4 avoids: every change needs a training run, the change is opaque, and it does not move to another model. It also shows the benefit: once trained, "every call after that gets the new behavior, with nothing extra in the prompt." The two lectures together make a clear rule of thumb: use external artifacts while knowledge is still changing or needs auditing; move stable, high-volume behavior into weights.

**L9 and L11 Reinforcement learning.** RL supplies the credit-assignment tools that SAGE and AgeMem use to train memory management. L11's lecture map lists "memory, parallelism, and execution at scale" as the next stage, and the core difficulty is the one L4 names: the value of a saved skill is "unknown until reuse."

**L10 Deep research agents.** L10 explains the retrieval machinery L4 assumes: lexical BM25, dense dual encoders with s(q, d) = E\_q(q)ᵀE\_d(d) and contrastive training, and web search APIs. Its AgentIR result (retrievers see only the query, not the agent's reasoning, so give them the information need) is directly relevant to memory retrieval, where the best query is often the agent's current subgoal rather than the user's first message.

**Where the lectures differ in emphasis.**

- *Keep everything vs choose what matters.* L3 leans toward keeping recoverable evidence (retain pointers, leave history searchable); L4 leans toward abstraction and pruning (TroVE, over-retrieval). Both agree that exact anchors must survive.
- *Model vs harness.* L4 mostly uses frozen models with prompted induction; L6, L8 and L11 put the same knowledge into weights. SAGE and AgeMem sit in between: external memory, but a trained policy for managing it.
- *Human vs agent authorship.* L4's authored-skill half (SkillsBench, OpenHands) favors people for known procedures and high-stakes checks; its induced-skill half favors agents where skills must be discovered and outcomes are cheap to test. L7 adds that users must keep control over personal memory.
- *Flexibility vs efficiency.* Text skills and trajectories keep the model in charge; code skills commit to execution. L4 frames this as a dial, not a winner.

### Lectures 13–15

The three later lectures stop asking whether memory and skills help and start asking how frameworks package them, how they are learned from production runs, and how they fail under attack.

**L13 Agent Safety.** L13 has no memory slides, but it supplies the threat model that section 9 only sketched. Its four threat types each have a memory form. Prompt injection becomes memory poisoning when the injected text is stored. Agent error becomes a wrong lesson written to memory, the judge-noise problem ReasoningBank measured in L4. Improper means becomes a skill that encodes a shortcut: L13's example agent copied an exposed answer, and L15's Commit0 cluster shows agents recovering deleted code from Git history. A malicious user corresponds to anyone with write access to a shared skill library. Its "shared state across runs" slide (the Cline case) is the clearest real incident in the course of state outliving the run that wrote it. Its controls (sandbox boundaries, scoped tokens, checks before actions, logs beyond the agent's reach) translate directly into write permissions and admission gates for memory (section 14).

**L14 OpenHands.** L14 changes the picture in three ways. First, skills become the way a single generalist agent specializes. L4 treated skills as a way to avoid repeating work; L14 uses them to replace role-specific agents, which raises the stakes of retrieval because a missing skill now means a missing role. Second, it makes trigger design concrete: always-on, keyword-triggered and file-triggered skills are three retrieval policies with very different token costs (section 10). Third, SkillRefiner blurs L4's split between authored and induced skills. Half of Table 1's rows start from a human-written skill that is then refined from traces, so the realistic lifecycle is "a person writes it, runs improve it, a person reviews the diff." L14 also quietly disagrees with L4's emphasis. L4's strongest numbers came from code skills (ASI), whereas L14's production skills are text instructions paired with a small set of general tools. Both positions fit L4's dial: text where tasks vary, code where steps are fixed.

**L15 Orchestration and Monitoring.** L15 extends L4's flexibility–efficiency dial beyond code skills to whole workflows, framing the difference as guiding versus constraining (section 12). It also offers a different answer to L3's problem. L3 compacts a transcript into an estimated task state; L15 declares the task state as typed fields and checkpoints it at every node, so short-term memory is designed rather than inferred (section 13). L15 and L14 disagree about where procedure belongs. L15's slide 3 cites L14's single-agent baseline and then argues for fixing known procedures in code; L14 argues for one flexible agent guided by skills. The reconciliation the lectures support is to fix in code what must be enforced or is cheap to automate, and leave to skills what needs judgment.

L15's monitoring half connects back to the write side of memory. Hodoscope summarizes trajectories or actions, embeds the summaries and clusters them to surface behaviors nobody thought to search for. That is the same recipe as SkillRefiner's first two stages, used for diagnosis instead of editing. Its model-as-judge example is a warning for section 5's LLM judges: Claude Opus 4.6 rated the suspiciousness of an agent inspecting Git history in SWE-bench at 2/10, and raised it to 7/10 only after being given a link to the benchmark issue that documents the loophole (agents using git log --all to peek at future commits). A judge flags what it is told to look for, so an automated write pipeline inherits its judge's blind spots. The Docent case study adds a caution for anyone evaluating a new skill. On Terminal-Bench, GPT-5.1 Codex scored 27% against GPT-5 Codex's 40%, mostly through timeouts (50% vs 32% of scored runs), and on the 28 tasks where neither timed out the ranking reversed (0.500 vs 0.429). A headline score can hide why a change helped or hurt, so a skill edit should be judged with paired traces, not one number.

**What changes overall.** Before L13, this sheet treated memory as a research technique judged by benchmark gains. After L15, memory and skills are infrastructure: loaded by trigger rules, learned from production traces, checkpointed per thread, promoted into workflows when they must be enforced, and guarded like any other persistent state that crosses a trust boundary.

### L19 · Memory about the user (ToM-SWE)

Every memory in sections 1–14 is about the task or the environment. L19 (Valerie Chen, guest, Stanford) adds a third subject: the person giving the instructions. Its motivating failure is a terminal session. The user types "make me a website", the agent takes 100 actions and announces a shopping-guidance site, and the user replies: "Ugh, after 30 mins, you produce a bunch of useless things." The agent did not lack coding skill. It filled an underspecified goal with a guess. The interaction side of this story (proactivity, timing, Horvitz's principles) is covered in T15; this part covers only the memory.

**ToM-SWE's user model.** ToM-SWE (Zhou et al., incl. Chen, ICML 2026) pairs the coding agent with a lightweight *ToM agent* (theory of mind). When instructions are unclear, the SWE agent consults it, and it answers from its model of the user: "personal website, prefer Vercel; academic style; concise communication…". The ToM agent keeps a hierarchical memory: raw previous sessions at the bottom, a user model per session above them, and an overall user model at the top. The model is built offline from past sessions and read only when needed. L19 places this beside Letta's sleep-time compute (idle time between queries spent precomputing inferences) and Anthropic's "components of agent memory" (transcripts, memory notes, memory representations and injected context, consolidated by an offline "dreaming" step). All three use the same consolidate-between-sessions pattern as section 8.

**In-the-wild evidence.** Across n = 174 ToM suggestions, users accepted 74.7%, partially accepted 11.5% and rejected 13.8%. One participant said: "ToM helps me explicitly write out rules I already have in my previous conversations." The ToM agent is most useful for *somewhat* underspecified queries that have prior context. It still struggles with very vague queries, where there is little to infer from. Beyond the slides: the paper reports 59.7% task success on its stateful SWE benchmark against 18.1% for plain OpenHands.

**How a user model differs from task memory and skills.**

| Store | What it is about | Typical record | When it is read |
| --- | --- | --- | --- |
| Task memory (sections 4–6) | The environment and past attempts | "The CSV parser lives in io/import.py" | Retrieved by relevance to the current step |
| Skill (sections 7, 10–12) | How to do a kind of task | A SKILL.md procedure or a code function | Loaded by a trigger or when the agent calls it |
| User model (L19) | What this person wants | "Prefers Vercel; academic style; concise replies" | Consulted when the instructions leave a gap |

Three differences follow. First, the trigger is *ambiguity*, not relevance: a user model is useless on a fully specified task and most valuable on a half-specified one. Second, the quote shows a user model converging on rules. A rule the user always wants ("deploy to Vercel") behaves like an always-on skill, close to the CLAUDE.md and AGENTS.md files of L4 and L6. Third, its records go stale and leak across scopes in ways task facts rarely do. Beyond the lecture: preferences change, and one project's style may not suit the next, so a user model needs provenance, scope and an edit path the user can see (section 9).

**A caution from deployment.** L19's PULSE study ran agent-design A/B tests on over 15k OpenHands users. Changing the LLM moved satisfaction by 6–8% and changing the reasoning strategy by 3%, but reducing memory made no significant difference. Beyond the lecture: "no significant difference" is not proof of no effect, but it means a memory feature has to show its value on real users, not only on benchmarks (open problem 1).

## Mechanics

This section gives the exact formulas and protocols behind memory: the cost argument for externalizing, the three retrieval scorers, fusion and diversity, record and skill formats, the write and admission loops, progressive-disclosure budgets, forgetting and the SAGE reward.

### Why raw history does not scale: cumulative input cost

L3 models each call's input as a fixed prefix plus all history so far. If every step adds roughly the same number of tokens, the total input over a task is:

$$
C_{\text{raw}}(T) = \sum_{t=1}^{T} \big(P + (t-1)\,\Delta\big) = T P + \Delta \frac{T(T-1)}{2}
$$

Here T is the number of model calls, P is the fixed prefix (system prompt, tools, instructions) in tokens, and Δ is the tokens added per step (action plus observation). With L3's numbers, P = 6K and Δ = 5K, five calls cost 5 × 6K + 5K × 10 = 80K tokens, matching the slide. The second term is O(T²), so doubling the task length roughly quadruples input cost.

With a bounded working state, each call sees the prefix, a retrieved memory block of at most M tokens, and a recent tail of at most W tokens:

$$
C_{\text{mem}}(T) \le T\,(P + M + W)
$$

This is linear in T. The price is paid elsewhere: write-time induction calls, retrieval latency, and the risk that the working state omits something needed. Caching changes the constant, not the shape: a stable prefix P is billed at the cached rate, which is why memory indexes belong in the stable prefix and fresh retrievals belong at the end.

### Recency, importance and relevance scoring (Generative Agents)

For a query q and candidate memories i = 1, …, N:

$$
\begin{aligned}
\text{rec}_i &= \gamma^{\,\tau - \tau_i}, \qquad \gamma = 0.995 \\
\text{imp}_i &\in \{1, 2, \dots, 10\} \\
\text{rel}_i &= \frac{\mathbf{e}_q^{\top}\mathbf{e}_i}{\lVert \mathbf{e}_q \rVert\,\lVert \mathbf{e}_i \rVert} \\
\hat{x}_i &= \frac{x_i - \min_j x_j}{\max_j x_j - \min_j x_j} \\
\text{score}_i &= \alpha_{\text{rec}}\,\widehat{\text{rec}}_i + \alpha_{\text{imp}}\,\widehat{\text{imp}}_i + \alpha_{\text{rel}}\,\widehat{\text{rel}}_i
\end{aligned}
$$

τ is the current time and τ\_i the time memory i was last accessed, in game hours. γ is the per-hour decay factor. imp\_i is the importance the LLM assigned at write time. e\_q and e\_i are embedding vectors of the query and the memory. The hat denotes min-max normalization over the current candidate set, and the α weights were all 1 in the paper.

**Derivation: the half-life of recency.** Recency halves when γ^h = 1/2, so h = ln 2 / (−ln γ) = 0.6931 / 0.0050125 ≈ 138 hours, about 5.8 days of game time. Because recency is updated on *access*, frequently retrieved memories stay fresh; this is a crude version of the spacing effect in human memory.

**Properties to know.** Min-max normalization makes scores *relative to the candidate set*: the least relevant candidate always gets relevance 0 even if it is quite relevant in absolute terms, and with a single candidate the denominator is zero (implementations fall back to 1). The sum of three terms means a very important but irrelevant memory can outrank a relevant one; Hands-on shows this. Cost per query is one embedding call plus O(N·d) for brute-force cosine over N memories of dimension d.

### Lexical scoring: BM25

$$
\text{BM25}(q, d) = \sum_{t \in q} \text{IDF}(t)\cdot \frac{f(t,d)\,(k_1 + 1)}{f(t,d) + k_1\left(1 - b + b\,\frac{|d|}{\text{avgdl}}\right)}, \qquad \text{IDF}(t) = \ln\!\left(1 + \frac{N - n_t + 0.5}{n_t + 0.5}\right)
$$

f(t, d) is how often term t occurs in document d, |d| is the document length in tokens, avgdl is the average length, N is the number of documents, and n\_t is the number containing t. k₁ (typically 1.2–2.0) controls term-frequency saturation and b (typically 0.75) controls length normalization.

Two properties follow from the formula. As f(t, d) → ∞ the fraction tends to k₁ + 1, so repeating a word cannot dominate the score (saturation). A term in every document has n\_t = N and IDF = ln(1 + 0.5/(N + 0.5)) ≈ 0, so common words contribute almost nothing. This is why BM25 is strong on rare exact tokens such as element IDs and error codes.

### Dense scoring, fusion and diversity

Dense retrieval (L10) scores s(q, d) = E\_q(q)ᵀE\_d(d). With normalized vectors this is cosine similarity. Brute force costs O(N·d) per query; approximate nearest-neighbor indexes such as HNSW cut this to roughly logarithmic in N at a small recall loss.

To combine lexical and dense rankings without calibrating their scales, use **reciprocal rank fusion** (Cormack, Clarke and Büttcher, 2009):

$$
\text{RRF}(d) = \sum_{r \in \mathcal{R}} \frac{1}{k + \text{rank}_r(d)}
$$

ℛ is the set of rankers (for example BM25 and dense), rank\_r(d) is document d's 1-based position in ranker r, and k is a damping constant, commonly 60. A document ranked first by both rankers scores 2/61 ≈ 0.0328; one ranked first by one and tenth by the other scores 1/61 + 1/70 ≈ 0.0307.

To fight over-retrieval of near-duplicates, select items greedily with **maximal marginal relevance** (Carbonell and Goldstein, 1998):

$$
d^{*} = \arg\max_{d \in \mathcal{C} \setminus S} \Big[\lambda\,\text{sim}(q, d) - (1-\lambda)\max_{d' \in S} \text{sim}(d, d')\Big]
$$

𝒞 is the candidate set, S the items already selected, sim a similarity function, and λ ∈ \[0, 1\] trades relevance against novelty. Selecting k items costs O(k·|𝒞|) similarity evaluations.

### A memory record format

A record should carry enough metadata to score it, resolve conflicts, audit it and roll it back. Beyond the lecture, a practical schema:

```json
{
  "id": "mem_000184",
  "type": "fact",
  "key": "shop.example/search_box_id",
  "text": "The search box on shop.example has element id 212 after the redesign.",
  "importance": 4,
  "created_at": "2026-09-28T14:02:11Z",
  "last_accessed": "2026-09-30T09:15:40Z",
  "access_count": 7,
  "source": {"kind": "episode", "episode_id": "ep_5521", "trust": "agent_observed"},
  "supersedes": ["mem_000031"],
  "embedding_model": "example-embed-v1",
  "status": "active"
}
```

type is one of episode, fact, lesson or skill. key is a canonical subject used for conflict detection. importance, last\_accessed and access\_count feed scoring and forgetting. source and trust support provenance and poisoning defenses. supersedes records an UPDATE so it can be undone. embedding\_model matters because vectors from different models are not comparable, so a model change requires re-embedding.

### The write protocol (extraction plus conflict resolution)

This follows Mem0's two phases, with an admission gate added.

```python
def write_memories(new_messages, summary, store, llm, k_similar=5):
    # Phase 1: extraction. Candidate facts/lessons from recent context only.
    candidates = llm.extract(summary=summary, recent=new_messages[-M:])
    for cand in candidates:
        if not admit(cand):              # schema, length, trust, PII policy
            continue
        # Phase 2: update. Compare with the most similar stored items.
        similar = store.search(cand.text, k=k_similar, relevance_only=True)
        op, target = llm.choose_op(cand, similar)   # ADD | UPDATE | DELETE | NOOP
        if op == "ADD":
            store.insert(cand)
        elif op == "UPDATE":
            store.replace(target, cand, keep_history=True)
        elif op == "DELETE":
            store.retire(target, reason=cand.text)
        # NOOP: nothing to do
```

Cost: one extraction call per write trigger, plus one decision call and one similarity search per candidate. With c candidates per trigger the write path costs 1 + c LLM calls, which is why systems batch writes rather than writing per token of dialogue. Note relevance\_only=True: the duplicate check must rank by similarity alone, or a weighted scorer can hide an old duplicate (Hands-on shows the bug).

### Skill induction and admission (AWM and ASI style)

```python
for task in stream:                       # online setting: tasks arrive one by one
    skills = retrieve_skills(task, library)          # or progressive-disclosure index
    episode = agent.run(task, tools=PRIMITIVES + skills)
    ok = judge(task, episode)                        # LLM-as-judge; no ground truth online
    if not ok:
        continue                                     # AWM default; ReasoningBank also mines failures
    for cand in induce(episode, library):            # abstract constants -> parameters
        if cand.kind == "code":
            if lint(cand) and judge(task, agent.run(task, tools=PRIMITIVES + [cand]),
                                     require_skill_used=cand.name):
                library.add(cand)                    # ASI: re-solve with the skill to test it
        else:
            library.add(cand)                        # text workflows: no executable test
```

The online metric is **cumulative success rate** after n tasks:

$$
\text{CSR}(n) = \frac{1}{n}\sum_{j=1}^{n} \mathbb{1}[\text{task } j \text{ solved}]
$$

𝟙\[·\] is 1 when the condition holds and 0 otherwise. Because memory improves over the stream, CSR lags the current success rate; a widening gap between two CSR curves (AWM's 22.5 points after 40 examples) means the memory is compounding.

The code-skill test doubles the model calls per admitted skill (one extra run), but ASI shows it pays back through fewer steps on later tasks (24.5 → 15.0 average).

### A SKILL.md file and the progressive-disclosure budget

```text
---
name: python-review
description: Review Python code against team standards. Use when the user asks to
  review Python code, check Python style, lint Python, or mentions code quality.
---
# Python Code Review
1. Run scripts/run_checks.py <path> (Black at 88 chars, Ruff with repo rules).
2. Check type hints on public APIs and Google-style docstrings
   (details: references/docstring-style.md).
3. Require pytest tests for new functions.
4. Request changes whenever a critical issue is found; check each suggestion
   against repo conventions before posting.
```

Let N be the number of installed skills, m\_i the metadata tokens of skill i, b\_i its body tokens, and A the set of skills activated in a session. The context cost is:

$$
\text{tokens} = \underbrace{\sum_{i=1}^{N} m_i}_{\text{always}} + \underbrace{\sum_{i \in A} b_i}_{\text{on demand}} + \underbrace{\sum_{f \in F} |f|}_{\text{files read}}
$$

F is the set of bundled files actually read. With N = 30 skills at m = 100 tokens, the always-on index costs 3,000 tokens, matching L4's "≈3k tokens in Hermes." Loading all 30 bodies eagerly at 5,000 tokens each would cost 150,000 tokens per session. With |A| = 2, progressive disclosure costs about 3,000 + 10,000 = 13,000 tokens, a 91% saving. Scripts cost only their output, since the code itself never enters context.

### TroVE forgetting rule

$$
\text{keep}(f) \iff u_f(n) \ge \tfrac{1}{2}\log_{10} n
$$

u\_f(n) is how many times function f has been used after n examples. The threshold is 0.5 at n = 10, 1 at n = 100, 1.5 at n = 1,000 and 3 at n = 1,000,000. Because it grows logarithmically, a function needs only a handful of uses to survive even after very long streams, so the rule removes functions that were *never really reused*, not ones that are merely rare. Pruning costs O(|library|) and runs periodically.

### SAGE: rewarding a skill for being reused

$$
R_1 = r_1 + \mathbb{1}[r_1 = 1 \wedge r_2 = 1] \cdot \mathbb{1}[\text{task 2 called a skill saved in task 1}]
$$

r\_1 and r\_2 are the outcome rewards of two related tasks placed in the same rollout, and R\_1 is the shaped reward assigned to task 1's actions. The bonus is earned only if saving the skill actually helped later, which solves the credit-assignment problem L4 highlights. L4's ablation on AppWorld: 55.4 with r\_1 alone, 56.6 when the bonus requires only that both tasks succeed, 60.7 when it also requires reuse.

## Hands-on

Three worked examples: a runnable memory store, a by-hand retrieval calculation, and a design walkthrough for a real agent.

### Example 1: a minimal memory store with Mem0-style writes, hybrid retrieval and TroVE pruning

The program below is self-contained Python (standard library only). It implements typed records, an ADD/UPDATE/DELETE/NOOP write path, BM25 plus a toy embedding fused with reciprocal rank fusion, Generative-Agents-style scoring, and TroVE's forgetting rule. **call\_llm is a stub**: deterministic rules stand in for the model that would choose the memory operation, so the output is reproducible. The "embedding" is a hashed bag of words, not a real model.

```python
"""Minimal agent memory: typed records, Mem0-style writes, hybrid retrieval,
Generative-Agents-style scoring, and TroVE-style skill pruning.
Standard library only. call_llm() is a deterministic STUB, not a real model."""
import json, math, re
from collections import Counter

def call_llm(messages):
    """STUB for an LLM that picks a memory operation. A real system would send
    the prompt to a model; here simple rules on the JSON payload stand in."""
    req = json.loads(messages[-1]["content"])
    cand, similar = req["candidate"], req["similar"]
    for m in similar:
        if m["key"] == cand["key"]:
            if cand["text"].startswith("NOT "):
                return json.dumps({"op": "DELETE", "id": m["id"]})
            if m["text"] == cand["text"]:
                return json.dumps({"op": "NOOP", "id": m["id"]})
            return json.dumps({"op": "UPDATE", "id": m["id"]})
    return json.dumps({"op": "ADD", "id": None})

def tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())

def embed(text, dim=64):
    """Toy 'embedding': hashed bag of words, L2-normalised (stands in for a model)."""
    v = [0.0] * dim
    for t in tokens(text):
        v[sum(map(ord, t)) % dim] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]

class MemoryStore:
    def __init__(self):
        self.items, self.next_id, self.clock = {}, 1, 0

    def write(self, key, text, kind, importance):
        self.clock += 1
        # Dedup lookup must rank by relevance alone: recency/importance weighting
        # would hide an old, low-importance duplicate and create a conflicting copy.
        similar = self.search(text, k=3, touch=False, relevance_only=True)
        prompt = {"candidate": {"key": key, "text": text},
                  "similar": [{"id": m["id"], "key": m["key"], "text": m["text"]} for m in similar]}
        decision = json.loads(call_llm([{"role": "user", "content": json.dumps(prompt)}]))
        op, mid = decision["op"], decision["id"]
        if op == "ADD":
            mid = self.next_id; self.next_id += 1
            self.items[mid] = {"id": mid, "key": key, "text": text, "kind": kind,
                               "importance": importance, "last_access": self.clock,
                               "vec": embed(text)}
        elif op == "UPDATE":
            self.items[mid].update(text=text, vec=embed(text), last_access=self.clock)
        elif op == "DELETE":
            del self.items[mid]
        return op, mid

    def bm25(self, query, k1=1.2, b=0.75):
        docs = {i: tokens(m["text"]) for i, m in self.items.items()}
        N = len(docs) or 1
        avgdl = sum(len(d) for d in docs.values()) / N
        df = Counter(t for d in docs.values() for t in set(d))
        scores = {}
        for i, d in docs.items():
            tf, s = Counter(d), 0.0
            for q in set(tokens(query)):
                if tf[q]:
                    idf = math.log(1 + (N - df[q] + 0.5) / (df[q] + 0.5))
                    s += idf * tf[q] * (k1 + 1) / (tf[q] + k1 * (1 - b + b * len(d) / avgdl))
            scores[i] = s
        return scores

    def search(self, query, k=3, touch=True, decay=0.995, rrf_k=60, relevance_only=False):
        if not self.items:
            return []
        qv = embed(query)
        dense = {i: sum(a * b for a, b in zip(qv, m["vec"])) for i, m in self.items.items()}
        sparse = self.bm25(query)
        # Reciprocal-rank fusion of the lexical and dense rankings = "relevance"
        rel = Counter()
        for ranking in (sparse, dense):
            for r, i in enumerate(sorted(ranking, key=ranking.get, reverse=True), 1):
                rel[i] += 1.0 / (rrf_k + r)
        rec = {i: decay ** (self.clock - m["last_access"]) for i, m in self.items.items()}
        imp = {i: m["importance"] for i, m in self.items.items()}
        def minmax(d):
            lo, hi = min(d.values()), max(d.values())
            return {i: (v - lo) / (hi - lo) if hi > lo else 1.0 for i, v in d.items()}
        R, I, V = minmax(rec), minmax(imp), minmax(rel)
        score = {i: (V[i] if relevance_only else R[i] + I[i] + V[i])  # all alphas = 1
                 for i in self.items}
        top = sorted(score, key=score.get, reverse=True)[:k]
        if touch:
            for i in top:
                self.items[i]["last_access"] = self.clock
        return [dict(self.items[i], score=round(score[i], 3),
                     parts=(round(R[i], 2), round(I[i], 2), round(V[i], 2))) for i in top]

def prune_skills(usage, n_seen):
    """TroVE-style forgetting: drop skills used fewer than 0.5*log10(n) times."""
    thr = 0.5 * math.log10(n_seen)
    return {s: u for s, u in usage.items() if u >= thr}, thr

if __name__ == "__main__":
    mem = MemoryStore()
    events = [
        ("shop.search_box", "The search box on shop.example has element id 145", "fact", 3),
        ("shop.prices", "shop.example shows prices only on the product page", "fact", 6),
        ("lesson.query", "Lesson: tighten a vague search query before paging through results", "lesson", 8),
        ("user.pkg", "User prefers pnpm over npm for installs", "fact", 5),
        ("shop.search_box", "The search box on shop.example has element id 145", "fact", 3),
        ("shop.search_box", "The search box on shop.example has element id 212 after the redesign", "fact", 4),
        ("user.pkg", "NOT User prefers pnpm over npm for installs", "fact", 5),
    ]
    print("WRITES")
    for key, text, kind, imp in events:
        op, mid = mem.write(key, text, kind, imp)
        print(f"  t={mem.clock} {op:<6} id={mid} key={key}")
    print(f"\nSTORE ({len(mem.items)} records)")
    for m in mem.items.values():
        print(f"  [{m['id']}] {m['kind']:<6} imp={m['importance']} last={m['last_access']} {m['text']}")
    q = "what element id is the search box on shop.example"
    print(f"\nQUERY: {q}")
    for k in (1, 2, 3):
        hits = mem.search(q, k=k, touch=False)
        print(f"  k={k}: " + "; ".join(f"id{h['id']} score={h['score']} (rec,imp,rel)={h['parts']}" for h in hits))
    hits = mem.search(q, k=3, touch=False, relevance_only=True)
    print("  relevance only, k=3: " + "; ".join(f"id{h['id']} rel={h['parts'][2]}" for h in hits))
    usage = {"search_product": 14, "add_to_wishlist": 3, "sort_listings": 1,
             "open_reviews": 2, "report_price_range": 0}
    for n in (10, 100, 1000):
        kept, thr = prune_skills(usage, n)
        print(f"\nPRUNE n={n}: threshold={thr:.2f} kept={sorted(kept)}")
```

Real output of python3 memory\_demo.py:

```text
WRITES
  t=1 ADD    id=1 key=shop.search_box
  t=2 ADD    id=2 key=shop.prices
  t=3 ADD    id=3 key=lesson.query
  t=4 ADD    id=4 key=user.pkg
  t=5 NOOP   id=1 key=shop.search_box
  t=6 UPDATE id=1 key=shop.search_box
  t=7 DELETE id=4 key=user.pkg

STORE (3 records)
  [1] fact   imp=3 last=6 The search box on shop.example has element id 212 after the redesign
  [2] fact   imp=6 last=2 shop.example shows prices only on the product page
  [3] lesson imp=8 last=3 Lesson: tighten a vague search query before paging through results

QUERY: what element id is the search box on shop.example
  k=1: id1 score=2.0 (rec,imp,rel)=(1.0, 0.0, 1.0)
  k=2: id1 score=2.0 (rec,imp,rel)=(1.0, 0.0, 1.0); id3 score=1.248 (rec,imp,rel)=(0.25, 1.0, 0.0)
  k=3: id1 score=2.0 (rec,imp,rel)=(1.0, 0.0, 1.0); id3 score=1.248 (rec,imp,rel)=(0.25, 1.0, 0.0); id2 score=1.092 (rec,imp,rel)=(0.0, 0.6, 0.49)
  relevance only, k=3: id1 rel=1.0; id2 rel=0.49; id3 rel=0.0

PRUNE n=10: threshold=0.50 kept=['add_to_wishlist', 'open_reviews', 'search_product', 'sort_listings']

PRUNE n=100: threshold=1.00 kept=['add_to_wishlist', 'open_reviews', 'search_product', 'sort_listings']

PRUNE n=1000: threshold=1.50 kept=['add_to_wishlist', 'open_reviews', 'search_product']
```

**What to notice**

- The seven writes produce only three records. The duplicate at t=5 is a NOOP, the redesign at t=6 is an UPDATE of the same key (so no stale "id 145" survives), and the revoked preference at t=7 is a DELETE. Without conflict resolution the store would hold five records, two of them wrong.
- The dedup lookup uses relevance only. An earlier draft of this program used the full weighted score there; the old low-importance duplicate fell out of the top 3, so the stub saw no match, chose ADD, and the store ended up with two contradictory search-box IDs. Write-path and read-path scoring have different jobs.
- At k=2 the *irrelevant* lesson (relevance 0.0) outranks the relevant prices fact, purely because its importance is the highest. This is over-retrieval in miniature: the weighted scorer happily fills extra slots with salient noise.
- Min-max normalization is relative: the prices fact gets recency 0.0 simply because it is the oldest of three, not because it is old in absolute terms.
- TroVE's threshold barely moves (0.5 → 1.0 → 1.5 across a 100x increase in n). report\_price\_range, never used, is dropped at once; sort\_listings, used once, survives until n is large.

### Example 2: scoring three memories by hand

A coding agent asks its memory "how do I run the test suite?" Three candidates exist. Hours since last access, importance (1–10) and embedding cosine relevance are:

| Memory | Text | Hours since access | Importance | Relevance |
| --- | --- | --- | --- | --- |
| A | Run tests with pytest -x tests/ | 300 | 7 | 0.86 |
| B | CI timeout was caused by a port collision | 5 | 8 | 0.35 |
| C | Lint with ruff before committing | 24 | 4 | 0.55 |

**Step 1: recency.** rec = 0.995^hours. A: 0.995^300 = e^(300 × −0.0050125) = e^(−1.504) ≈ 0.222. B: 0.995^5 ≈ 0.975. C: 0.995^24 ≈ 0.887.

**Step 2: min-max normalize each column.** Recency range is 0.222 to 0.975, so A = 0, B = 1, C = (0.887 − 0.222)/0.753 ≈ 0.882. Importance range is 4 to 8, so A = 0.75, B = 1, C = 0. Relevance range is 0.35 to 0.86, so A = 1, B = 0, C = (0.55 − 0.35)/0.51 ≈ 0.392.

**Step 3: sum with all weights 1.** A = 0 + 0.75 + 1 = 1.75. B = 1 + 1 + 0 = 2.00. C = 0.882 + 0 + 0.392 ≈ 1.27.

The winner is B, the CI note, which is the *least relevant* memory. It wins on freshness and salience. With α\_rel = 3 instead: A = 3.75, B = 2.00, C ≈ 2.06, and the correct memory A wins.

**What to notice**

- Equal weights are a choice for social simulation, where recent and emotional events should surface. For task agents, relevance should dominate, either through a larger α\_rel or by filtering to a relevance threshold first and using recency and importance only to break ties.
- A's recency is low only because it has not been *accessed* for 300 hours. Recency based on last access rewards memories the agent keeps using, which suits habits but penalizes rarely needed yet critical facts.
- The half-life of 0.995 per hour is about 138 hours. If your clock ticks per step or per session instead of per hour, retune γ; otherwise recency is either flat or collapses immediately.

### Example 3: designing memory for an engineering drawing-review agent

**Scenario.** An agent reviews drawing submissions for a highway bridge project against the project's standards and past reviewer comments. A senior engineer checks every comment it drafts. Goal: fewer missed issues and less repeated feedback, without letting untrusted drawing text change the agent's behavior.

**Step 1: choose units of memory.** Use L4's taxonomy.

- *Skills (authored)*: standards checklists (title-block fields, sheet numbering, required notes per sheet type) written by engineers, with scripts/ that extract title-block fields and cross-check the sheet index against the drawing list. The ownership table says humans should author when the policy is already known and verify when correctness is normative.
- *Lessons (induced, human-approved)*: generalized reviewer corrections, such as "check rebar cover notes on every section view, not just the first."
- *Facts (per project)*: "Structural sheets use the S-### prefix"; "The design manual revision in force is the 2024 edition."
- *Episodes*: keep full past reviews for audit and for inducing lessons, but do not retrieve them into context by default; they are long and transfer poorly.

**Step 2: write triggers and admission.** Write after each review closes. The admission signal is the reviewer's action, as in OpenHands' review skill: a kept comment is a success; an edited or rejected comment is a failure worth mining (ReasoningBank shows failures help lessons). Every induced lesson waits in a queue until an engineer approves it. Facts use ADD/UPDATE/DELETE with the key being the subject, so a new manual revision updates rather than duplicates.

**Step 3: retrieval.** Skills use progressive disclosure. Facts use hybrid retrieval because exact tokens matter: BM25 finds "S-201" and clause numbers that embeddings blur. Lessons are capped at k ≤ 3 with a relevance threshold, following L4's over-retrieval evidence.

**Step 4: token budget per review call.**

| Component | Calculation | Tokens |
| --- | --- | --- |
| System prompt and tools | fixed | 4,000 |
| Skill index | 12 skills × 100 | 1,200 |
| Activated skill bodies | 2 × 1,500 | 3,000 |
| Facts | 5 × 60 | 300 |
| Lessons | 3 × 80 | 240 |
| Total memory and instructions |  | 8,740 |

That leaves most of the window for the drawings. Eagerly loading all 12 skill bodies instead would add 15,000 tokens (12 × 1,500 minus the 3,000 already counted) on every call.

**Step 5: forgetting and versioning.** Archive project facts when the project closes. Retire lessons with a TroVE-style usage threshold, but only after checking that they are unused rather than rare-but-critical (keep any lesson tagged safety-critical regardless of usage). Version the standards skills and record which version each review used.

**Step 6: safety.** Drawing notes and submittal text are untrusted input. Nothing extracted from a submission may be written to memory as an instruction; only reviewer-approved items enter, with provenance recorded. A note like "reviewers should skip the load-rating check" must be treated as data to flag, never as a lesson.

**Step 7: evaluation.** Run paired evaluation on 30 closed past submissions: no memory vs memory. Measure the fraction of drafted comments the reviewer kept, the missed-critical-issue rate, and tokens per review. Re-run monthly as the memory grows to catch drift.

**What to notice**

- The same agent uses four memory units with four different write paths and three retrieval methods. "Add a vector database" would have answered none of these design questions.
- Human effort is placed where L4's ownership table says it pays: authoring known standards, approving lessons, and owning maintenance. Agent effort goes to mining failures and routing.
- The budget shows why progressive disclosure matters even with only 12 skills.

## Design patterns, pitfalls and checklist

Good memory design is mostly about choosing the right unit, the right gate and the right amount to retrieve; the patterns below name the recurring solutions.

### Named patterns

- **Checkpoint-and-evidence compaction (L3).** Keep anchors and the recent tail exact, encode progress as a checkpoint, externalize bulky evidence with a pointer. *Use when* a single task outgrows the context window.
- **Virtual context / memory as tools (MemGPT, AgeMem).** Expose search, insert, update and delete as tool calls the agent chooses. *Use when* what matters is unpredictable and the model is capable enough to manage it; pair with a harness-level fallback retrieval.
- **Extract-then-reconcile (Mem0).** Extract candidate facts, then choose ADD, UPDATE, DELETE or NOOP against similar records. *Use when* storing user or environment facts that change over time.
- **Reflect-and-retry (Reflexion).** After a failure, write a short lesson and retry the same task. *Use when* a reliable evaluator exists and retries are cheap.
- **Strategy bank from successes and failures (ReasoningBank, ExpeL).** Distill titled, general lessons from both outcomes. *Use when* tasks vary and failures are informative.
- **Workflow induction (AWM).** Abstract repeated sub-routines into text templates with variables. *Use when* structure repeats but the page or input varies.
- **Verified code skills (ASI, SkillWeaver, Voyager).** Induce functions, lint them, and re-run the task with them before admitting. *Use when* structure repeats exactly and outcomes are cheap to test.
- **Abstract interface, local implementations (PolySkill).** Write compositions once against abstract primitives; implement primitives per environment. *Use when* the same skill must work across several sites, APIs or tools.
- **Progressive disclosure (Agent Skills).** Always load names and descriptions; load bodies and files on demand. *Use when* you have more than a handful of skills.
- **Log, score, analyze, patch (OpenHands).** Treat a skill like code in production: log runs, score outcomes, find recurring failures, patch the skill. *Use when* a skill runs often enough to produce feedback.
- **Usage-based pruning (TroVE).** Periodically retire items used fewer than a slowly rising threshold. *Use when* the library grows automatically.
- **Trust tiers.** Separate human-authored instructions, agent-induced memory, and untrusted observations, and never let a lower tier override a higher one. *Use always* when memory can be written from external content.

### Failure modes

| Failure | Symptom | Likely cause | Fix |
| --- | --- | --- | --- |
| Over-retrieval | Success drops as k grows; answers blend two procedures | Fixed large k; weighted scores pull in salient but irrelevant items | Tune k (often 1–3), relevance threshold, MMR diversity |
| Stale memory | Agent uses an old element ID or revoked preference | No UPDATE/DELETE; append-only store | Key-based reconciliation; supersedes links; timestamps |
| Duplicate bloat | Many near-identical records or overlapping workflows | Dedup lookup too weak or scored by recency | Relevance-only dedup; "no overlapping workflows" in the induction prompt |
| Compaction drift | Constraints vanish after several summaries (CUDA 12.4 → missing) | Summaries of summaries | Copy anchors exactly; keep evidence pointers; re-read sources |
| Brittle code skill | Skill fails on a new site or after a redesign | Hard-coded element IDs or UI assumptions | Parameterize IDs; abstract interfaces; repair on failure |
| Skill displaces better default | Skill-equipped agent does worse than no skill (13 of 87 SkillsBench tasks) | Over-broad trigger description; bloated skill | Narrow descriptions; focused skills; paired evaluation per task type |
| Never retrieved | Useful memory exists but is not used | Agent-driven retrieval with no prompt to look; vague descriptions | Harness fallback retrieval; explicit "check skills first" instruction; better descriptions |
| Judge-induced noise | Wrong lessons or workflows admitted | Inaccurate LLM judge | Stronger judge; executable tests; human review for high-stakes items |
| Memory poisoning | Agent follows injected instructions in later sessions | Writes from untrusted content; no provenance | Trust tiers; admission gates; quarantine; audit and rollback |
| Cache thrash | Latency and cost jump after adding memory | Memory block rewritten near the prompt start | Put stable index in the prefix; append retrievals at the end |
| Privacy leak | Personal facts appear in unrelated contexts | No scoping or consent | Per-user and per-project scopes; user-visible memory; delete on request |

### Builder's checklist

- [ ] Decide which units you store (episode, fact, lesson, skill) and why each will be reused.
- [ ] Define a record schema with type, key, timestamps, access count, source and trust.
- [ ] Choose explicit write triggers and batch writes; do not write on every token.
- [ ] Reconcile every candidate with ADD, UPDATE, DELETE or NOOP using relevance-only lookup.
- [ ] Gate admission: a judge for text items, execution tests for code skills, human review for high-stakes items.
- [ ] Keep human-authored skills focused, with precise descriptions and bodies under the recommended size.
- [ ] Use progressive disclosure for skills; keep scripts' code out of context.
- [ ] Use hybrid retrieval (BM25 plus embeddings) when records contain exact identifiers.
- [ ] Tune k and a relevance threshold on your own tasks; start small.
- [ ] Keep anchors and evidence pointers exact through compaction; test continuation after repeated compactions.
- [ ] Prune or retire unused items on a schedule, and log what was removed.
- [ ] Record provenance, separate trusted instructions from untrusted data, and support rollback.
- [ ] Give users visibility and deletion rights over personal memory.
- [ ] Evaluate paired (with vs without memory), online (cumulative success) and efficiency (steps, tokens, latency).
- [ ] Re-run evaluations as memory grows to detect drift and over-retrieval.

### Patterns and pitfalls from L12–L15

The framework lectures turn the earlier patterns into concrete configuration choices. The patterns below are the ones L14 and L15 make visible; sections 10–14 explain them in full.

**Named patterns**

- **Pay-per-trigger skills.** Keep `trigger=None` for small, always-needed context, and load everything else by keyword, file path or progressive disclosure. *When to use:* any repository with more than a handful of conventions, since an always-on skill is paid for on every LLM call (section 10).
- **Skills instead of roles.** Give one generalist agent a small general tool set (edit, run, browse) and carry each role's know-how as a skill, as L14 argues against CodeR-style role pipelines (slides 22–24). *When to use:* activities share context, such as reproduce, locate, edit and test. Add a second agent only for the reasons slide 28 names: parallel work, independent review with separate permissions, or cost control.
- **Externalize before you condense.** Before a condenser summarizes old events, make sure anything that must survive is in a file, a test or a skill. L14 slide 18 names "files and tests as evidence" as the backstop for "potential detail loss." *When to use:* long runs with `LLMSummarizingCondenser` or any compaction.
- **Refine from runs, merge by review.** Summarize traces, cluster them by outcome, propose edits, gate failure-derived edits on evidence, then evaluate on held-out tasks before a person merges the diff (SkillRefiner, section 11). *When to use:* an automation with many runs and a reliable check signal, such as PR acceptance.
- **Promote a procedure when it must be enforced.** Move a recurring procedure from episode to text skill to code skill to workflow node as it stabilizes. *When to use:* a rule whose violation is costly, such as L15's "flagged reply → approval → send" (section 12).
- **One field per fact, one node per expensive step.** Declare task state as typed raw fields, and give each expensive or non-deterministic step (an LLM call, a paid search) its own node so its output is checkpointed (L15 slides 11 and 16). *When to use:* any workflow that may crash, retry or wait for a person.
- **Two-tier memory with an explicit bridge.** Use the checkpointer for thread state and a store or skill library for what should outlive the thread, and write a deliberate step that copies a fact across. Beyond the lecture, LangGraph's memory docs offer two places for that step: on the "hot path" during the run, or in the background as a separate task. *When to use:* whenever one thread learns something the next thread needs.

**Failure modes**

| Failure | Symptom | Fix |
| --- | --- | --- |
| Always-on bloat | Every call carries every skill; costs rise and task text is crowded out | Move to keyword, path or SKILL.md triggers; keep `trigger=None` for a few hundred tokens at most |
| Keyword misfire | A skill loads on an incidental word and the agent follows irrelevant guidance | Narrow the keywords, prefer path triggers, and test triggers on real prompts |
| Restored conversation, stale workspace | A conversation resumes by ID but files it relied on are gone or changed (L14 slide 17) | Persist the workspace separately, or store a commit hash in conversation state and check it on resume |
| Condenser drops a constraint | After summarization the agent violates an instruction given mid-run | Keep instructions in `keep_first`; write durable constraints to files or a skill |
| Refinement regression | A revised skill scores below the original (GEPA 79.0 → 73.0 in L14's Table 1) | Held-out evaluation before merge; versioned skills with rollback |
| Poisoned learned skill | Runs that read attacker-written issues produce a skill edit every later run loads | Provenance on proposals, quarantine for low-trust runs, reviewed merges (section 14; see T14) |
| Checkpoint mistaken for memory | A lesson from one thread is missing in the next | Add an explicit write from thread state to a store or skill |
| Misrouted workflow | A billing email classified as a question skips review and is sent (L15 slide 8) | Put the check on the risky action (sending, refunding), not only on the label |
| Headline-score evaluation | A skill or model change is judged by one pass rate that hides the cause | Compare paired traces and slice by failure mode, as in L15's Docent case (see T13) |

**Checklist additions**

- [ ] Every `trigger=None` skill is short and needed on every turn; everything else has a trigger.
- [ ] Facts that must survive condensing or a crash live in files, typed state fields or skills, not only in the transcript.
- [ ] Each workflow node that calls an LLM or a paid service checkpoints its output before the next node runs.
- [ ] Anything learned in one thread reaches long-term memory only through an explicit, logged write.
- [ ] Skill edits learned from runs pass a held-out evaluation and a human diff review before they ship.
- [ ] Runs that read untrusted text cannot write directly to skills that privileged runs load.

### Patterns and pitfalls from L19

L19 adds one store, the user model, and one test for any store, a deployment A/B test. The patterns below apply to memory about people; T15 covers when and how an agent should act on it.

**Named patterns**

- **Consult the user model on ambiguity.** Keep the user model out of every call, and let the main agent query it when instructions leave a gap, as ToM-SWE's SWE agent does. *When to use:* somewhat underspecified requests from a user with prior sessions.
- **Consolidate between sessions.** Build the user model offline from raw sessions, through per-session models, into one overall model (ToM-SWE; also Letta's sleep-time compute and Anthropic's "dreaming"). *When to use:* any store whose records summarize many past sessions.
- **Rules the user can read.** Surface stable preferences as a short list of rules the user can see and edit, the form the "write out rules I already have" quote points to. *When to use:* preferences that hold across tasks, such as hosting, style or tone.

**Failure modes**

| Failure | Symptom | Fix |
| --- | --- | --- |
| Guessing on a vague goal | 100 actions toward the wrong product ("make me a website") | Consult the user model; with no history, ask a clarifying question (T15) |
| Cold start | A new user gets generic or confidently wrong suggestions | Treat an empty model as "unknown", not as a default profile |
| Stale preference (beyond the lecture) | An old rule overrides what the user now wants | Keep dates and source sessions on each rule; let the user edit or retire it |
| Scope leak (beyond the lecture) | One project's style appears in another | Scope rules per project unless the user marks them global |
| Assuming memory pays off | A costly memory feature ships without effect on users | A/B test it on real users; L19's PULSE found no significant difference from reducing memory |

**Checklist**

- [ ] The user model is separate from task memory and skills, with its own provenance.
- [ ] The agent consults it when instructions are unclear, not on every call.
- [ ] A user can see and edit the rules the agent holds about them.
- [ ] With no history, the agent asks instead of guessing.
- [ ] Memory features are judged with real-user experiments as well as benchmarks.

## Landscape

The tables below collect the systems, benchmarks, attacks and tools relevant to agent memory and skills, newest first within each table; numbers marked (L4) are from the lecture slides, others from the papers' abstracts.

### Memory and skill methods

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| SAGE (Wang et al., ACL 2026) | RL (GRPO) with sequential rollouts over related tasks; rewards skill reuse | AppWorld scenario completion 55.4 → 56.6 → 60.7 (L4); 26% fewer steps, 59% fewer tokens | L4; [arXiv 2512.17102](https://arxiv.org/abs/2512.17102) |
| AgeMem (Yu et al., ACL 2026) | Six memory tools (add, update, delete, retrieve, summary, filter) trained with three-stage RL | Outperforms memory baselines on ALFWorld, SciWorld, PDDL, BabyAI, HotpotQA | L4; [arXiv 2601.01885](https://arxiv.org/abs/2601.01885) |
| ReasoningBank (Ouyang et al., ICLR 2026) | Strategy memory distilled from self-judged successes and failures; MaTTS test-time scaling | WebArena shopping: 39.0 → 49.7 with failures; best at 1 retrieved experience (L4) | L4; [arXiv 2509.25140](https://arxiv.org/abs/2509.25140) |
| PolySkill (Yu et al., ICLR 2026) | Skills as abstract classes with per-site implementations | 1.7x skill reuse; +9.4% Mind2Web; +13.9% unseen sites; >20% fewer steps | L4; [arXiv 2510.15863](https://arxiv.org/abs/2510.15863) |
| ASI (Wang et al., COLM 2025) | Online induction of verified code skills for web agents | Checkpoints 41.3 / 59.5 / 80.2 and steps 24.5 / 20.6 / 15.0 for none / text / code (L4) | L4; [arXiv 2504.06821](https://arxiv.org/abs/2504.06821) |
| SkillWeaver (Zheng et al., 2025) | Explore, propose, practice and distill web skills into APIs | +31.8% WebArena, +39.8% real sites (relative) | L4; [arXiv 2504.07079](https://arxiv.org/abs/2504.07079) |
| Mem0 (Chhikara et al., 2025) | Extract-then-reconcile fact memory with ADD/UPDATE/DELETE/NOOP | LoCoMo: +26% relative vs OpenAI memory (LLM judge); 91% lower p95 latency; >90% token savings | L4; [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) |
| AWM (Wang et al., ICLR 2025) | Induces text workflows from successful trajectories, offline or online | +24.6% Mind2Web, +51.1% WebArena (relative); gap 22.5 after 40 examples (L4) | L4; [arXiv 2409.07429](https://arxiv.org/abs/2409.07429) |
| TroVE (Wang et al., ICML 2024) | Grows and prunes a function toolbox; drops functions used < ½log₁₀ n times | Library 74% / 83% / 90% smaller on MATH / HiTab / GQA (L4) | L4; [arXiv 2401.12869](https://arxiv.org/abs/2401.12869) |
| ExpeL (Zhao et al., AAAI 2024) | Experience pool plus extracted insights, recalled on new tasks | Performance improves as experience accumulates | L4; [arXiv 2308.10144](https://arxiv.org/abs/2308.10144) |
| Synapse (Zheng et al., ICLR 2024) | Trajectory-as-exemplar prompting with exemplar memory | 99.2% on 64 MiniWoB++ tasks | L4; [arXiv 2306.07863](https://arxiv.org/abs/2306.07863) |
| MemGPT (Packer et al., 2023) | OS-style virtual context: working context, FIFO queue, recall and archival storage via function calls | Document analysis and multi-session chat beyond the context window | L3, L4; [arXiv 2310.08560](https://arxiv.org/abs/2310.08560) |
| CoALA (Sumers et al., 2023) | Framework: working, episodic, semantic, procedural memory; internal and external actions | Conceptual | [arXiv 2309.02427](https://arxiv.org/abs/2309.02427) |
| Voyager (Wang et al., 2023) | Minecraft agent with automatic curriculum and a growing code skill library | 3.3x unique items; 2.3x distance; up to 15.3x faster milestones | L4; [arXiv 2305.16291](https://arxiv.org/abs/2305.16291) |
| Generative Agents (Park et al., 2023) | Memory stream with recency, importance and relevance retrieval, reflection and planning | 25 agents in a sandbox; decay 0.995; reflection threshold 150 | [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) |
| Reflexion (Shinn et al., NeurIPS 2023) | Verbal self-reflection stored in episodic memory, used on retries | 91% pass@1 HumanEval vs 80% for GPT-4 | L4, L5; [arXiv 2303.11366](https://arxiv.org/abs/2303.11366) |
| LILO / Stitch / DreamCoder / LAPS | Program-library induction by compression and documentation | Lineage for code skills | L4 |

### Benchmarks and evaluation settings

| Name | What it tests | Key numbers | Source |
| --- | --- | --- | --- |
| SkillsBench (2026) | Paired no-skill vs curated-skill runs on real work | 87 tasks, 8 domains, 18 configs; 33.9% → 50.5%; skills hurt on 13 tasks | L4; [arXiv 2602.12670](https://arxiv.org/abs/2602.12670) |
| MyPCBench (Jang et al., 2026) | Personal-context computer use | Stresses consent and forgetting | L7 |
| MemoryAgentBench (Hu et al., 2025) | Accurate retrieval, test-time learning, long-range understanding, selective forgetting | No method masters all four | [arXiv 2507.05257](https://arxiv.org/abs/2507.05257) |
| LongMemEval (Wu et al., ICLR 2025) | Five long-term chat-memory abilities | 500 questions; \~30% accuracy drop for commercial assistants | [arXiv 2410.10813](https://arxiv.org/abs/2410.10813) |
| WorkArena++ (Boisvert et al., NeurIPS 2024) | Compositional enterprise workflows from atomic UI skills | 682 composite tasks; 5 skill families | L7 |
| LoCoMo (Maharana et al., 2024) | Very long-term conversational memory | Up to 35 sessions, \~300 turns, \~9K tokens per conversation | [arXiv 2402.17753](https://arxiv.org/abs/2402.17753) |
| WebArena, Mind2Web, AppWorld, MiniWoB++ | Task environments used for AWM, ASI, ReasoningBank, SAGE, Synapse | See method rows | L4, L7 |

### Attacks on memory

| Name | Attack | Key numbers | Source |
| --- | --- | --- | --- |
| PoisonedRAG (Zou et al., USENIX Security 2025) | Inject crafted texts into a knowledge base | \~90% success with 5 texts per target in millions | [arXiv 2402.07867](https://arxiv.org/abs/2402.07867) |
| MINJA (Dong et al., 2025) | Query-only injection into an agent's own memory | No direct memory access needed | [arXiv 2503.03704](https://arxiv.org/abs/2503.03704) |
| AgentPoison (Chen et al., NeurIPS 2024) | Optimized backdoor triggers in memory or RAG | >80% success, <0.1% poison rate, <1% benign impact | [arXiv 2407.12784](https://arxiv.org/abs/2407.12784) |

### Tools and formats

| Name | What it is | Notable details | Source |
| --- | --- | --- | --- |
| OpenHands skills | Repository skills and /skill-creator | Skills under .agents/skills/; log-score-patch maintenance loop | L4; [blog, Feb 2026](https://www.openhands.dev/blog/20260227-creating-effective-agent-skills) |
| HermesAgent | Agent harness with skill index and tools | skill\_view, skill\_manage; \~3k-token skill index | L4 |
| Claude Code memory | CLAUDE.md or AGENTS.md instructions plus auto memory | MEMORY.md index: first 200 lines or 25KB loaded per session; topic files read on demand | [docs](https://code.claude.com/docs/en/memory) |
| Agent Skills / SKILL.md (Anthropic, Oct 2025; open spec) | Folder with SKILL.md, scripts, references, assets | name ≤ 64 chars, description ≤ 1,024 chars; \~100-token metadata; body < 5,000 tokens | L4; [spec](https://agentskills.io/specification) |

### Added with L12–L15

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| OpenHands Software Agent SDK | Python SDK for production agents: LLM, Agent, typed tools, Conversation, Workspace, condenser, `AgentContext` skills, MCP config | Skills were formerly "microagents"; `trigger=None` means always loaded; slide example `LLMSummarizingCondenser(max_size=10, keep_first=2)` | L14; [paper (Wang et al., 2025)](https://arxiv.org/abs/2511.03690); [skills guide](https://docs.openhands.dev/sdk/guides/skill) |
| SkillRefiner | Revises an existing skill from many rollout traces: summarize, cluster by outcome, propose edits, gate failure edits on evidence, merge | Held-out gains over the initial skill in every row; largest DAPO-Math with MiniMax-M2.7, 53.5 → 64.0; PR-review F1 at most 0.18 | L14 slides 42–43 (Khatry et al.); no public version found |
| Trace2Skill | Distils lessons from many trajectories in parallel into one skill directory, from human or LLM-drafted starting skills | Reports beating sequential skill editing and ReasoningBank-style retrieval; skills from a 35B model's traces raised a 122B model by up to 57.65 points on WikiTableQuestions | Likely "T2S" in L14's table; [arXiv 2603.25158](https://arxiv.org/abs/2603.25158) |
| GEPA | Reflective prompt evolution: a model reads execution traces and proposes prompt edits | Baseline in L14's table; regresses one row from 79.0 to 73.0 | L14; [arXiv 2507.19457](https://arxiv.org/abs/2507.19457) |
| LangGraph checkpointer and Store | Checkpointer saves thread-scoped graph state; Store holds cross-thread long-term memory | Resume by execution ID, retry policies, interrupts for human input (L15 slide 17) | L15; [persistence docs](https://docs.langchain.com/oss/python/langgraph/persistence); [memory overview](https://docs.langchain.com/oss/python/langgraph/memory) |
| Hodoscope | Unsupervised monitoring: summarize agent actions, embed and cluster them, and flag clusters over-represented in one group | Found agents recovering removed code from Git history in Commit0; the paper estimates 6–23× less human review effort than uniform sampling | L15; [arXiv 2604.11072](https://arxiv.org/abs/2604.11072) |
| Docent (Transluce) | Trace-analysis tool for querying and reading large collections of agent runs | Terminal-Bench, 89 tasks and 518 runs: GPT-5 Codex 40% vs GPT-5.1 Codex 27%; ranking reverses (0.500 vs 0.429) on the 28 no-timeout tasks | L15; [docs](https://docs.transluce.org/analysis/docent-agent) |
| Cline CLI incident (Feb 2026) | Prompt-injected triage workflow poisoned a CI cache shared with the release workflow | Unauthorized `cline@2.3.0` npm publish on February 17, 2026 | L13; [post-mortem](https://cline.bot/blog/post-mortem-unauthorized-cline-cli-npm) |

### Added with L19

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| ToM-SWE | A coding agent paired with a ToM agent that keeps a hierarchical user model (raw sessions, per-session models, overall model) and is consulted when instructions are unclear | In the wild, n = 174 suggestions: 74.7% accepted, 11.5% partial, 13.8% rejected; paper: 59.7% vs 18.1% for plain OpenHands on stateful SWE tasks | L19; [arXiv 2510.21903](https://arxiv.org/abs/2510.21903) |
| Sleep-time compute (Letta) | Uses idle time between queries to precompute useful inferences about stored context | Shown beside ToM-SWE as the same consolidate-between-sessions idea | L19 slide 33; [arXiv 2504.13171](https://arxiv.org/abs/2504.13171) |
| Anthropic "components of agent memory" | Transcripts, memory notes, memory representations and injected context, consolidated between sessions by an offline "dreaming" step | Diagram only; no numbers in the lecture | L19 slide 33 |
| PULSE | A/B tests of agent designs that add a predictor of user ratings to borrow power from unrated sessions | Over 15k OpenHands users; LLM change 6–8%, reasoning strategy 3%, reducing memory not significant; intervals up to 40% narrower | L19; [arXiv 2510.09801](https://arxiv.org/abs/2510.09801) |

## Open problems

The field can now build memories and skills that help on repetitive benchmarks, but deciding what to keep, trusting what was kept, and proving it helps in open-ended use remain unsolved.

**1. Valuing a memory before it is reused.** The worth of a saved item depends on future tasks the agent has not seen. L4 states this directly for skills: the value is "unknown until reuse." SAGE and AgeMem attack it with RL over multi-task rollouts, but that requires curated sequences of related tasks and a trainable model. *Why it's hard:* it is a long-horizon credit-assignment problem where the delay can be days, the task distribution shifts, and most saved items are never used.

**2. Reliable judging without ground truth.** Online induction depends on an LLM judge deciding which episodes succeeded. ReasoningBank shows gains survive noisy judges on one benchmark (52.4% with a perfect judge, 47.6% with a coin flip, 39.0% without memory), but a systematically biased judge could admit consistently wrong skills. *Why it's hard:* judges share failure modes with the agent they judge, and in real deployments many outcomes (a good code review, a correct research summary) are not executable.

**3. How much to retrieve, and when.** Over-retrieval is documented in L4 (ReasoningBank peaks at one experience; SkillsBench prefers 1–3 skills), but there is no principled rule for k, for when to retrieve at all, or for how the model should weigh conflicting memories. *Why it's hard:* the optimum depends on the model's ability to ignore distractors, the memory's precision, and the task, and all three change as models and stores evolve.

**4. Generality vs efficiency of skills.** Code skills are efficient and testable but brittle across sites (ASI's sort\_listings on Target); text skills adapt but do not save steps. PolySkill's abstract interfaces help when the domain has a clear shared schema. *Why it's hard:* choosing the right abstraction level is itself a program-synthesis problem, and real environments change silently (redesigns, API versions) without telling the skill it is broken.

**5. Maintenance at scale.** TroVE's usage-based pruning and OpenHands' log-score-patch loop work for tens of skills. Libraries with thousands of items raise questions of merging, versioning, dependency tracking between skills that call skills, and retiring an item that is rare but critical. *Why it's hard:* usage frequency is a poor proxy for value, and "Not All Skills Help" shows a skill's value can be positive for one task type and negative for another.

**6. Security and provenance.** AgentPoison, MINJA and PoisonedRAG show that small, targeted writes can steer future behavior, and skills add executable supply-chain risk. *Why it's hard:* agents must learn from untrusted observations to be useful, yet anything learned from untrusted input can be adversarial. Separating "data" from "instructions" is easy for humans to state and hard for a model that reads both as text.

**7. Privacy, consent and the right to be forgotten.** L7 notes that personal memory must be revisable and user-controlled. Deleting a fact from a store is easy; removing everything *derived* from it (lessons, summaries, fine-tuned weights) is not. *Why it's hard:* derived artifacts do not record their lineage by default, and weight-level forgetting (machine unlearning) is still immature.

**8. External memory vs weights.** L4 and L8 present the three locations as a design axis, but there is no settled policy for when a stable memory should be distilled into weights, or how to keep a model and its external memory consistent after a model upgrade. *Why it's hard:* weights are opaque and model-specific, embeddings from a new model are not comparable with old ones, and skills tuned for one model may displace better defaults in a stronger one.

**9. Evaluation that matches deployment.** Current benchmarks test recall (LoCoMo, LongMemEval), competencies (MemoryAgentBench) or task gains in fixed streams (AWM, ASI). Few measure long-run drift, robustness to poisoning, cost over months, or user trust. *Why it's hard:* realistic evaluation needs long interaction histories, changing environments and adversaries, which are expensive to build and hard to reproduce.

**10. Learning skills from production runs without learning the attacker's lessons.** SkillRefiner shows that traces from automation runs can improve a skill on held-out tasks (L14). Those runs read issues, PR text and chat messages written by outsiders, and the refined skill is loaded by every later run. *Why it's hard:* the evidence gate checks that a lesson is supported by the trace, not who shaped the trace, and success-derived edits are not gated at all.

**11. Deciding when a skill should become a workflow.** L14 favors one flexible agent guided by skills; L15 favors fixing known procedures in code for consistency, efficiency and testability. No lecture gives a rule for when a procedure has stabilized enough to promote, or when a workflow should be relaxed back into a skill. *Why it's hard:* the benefit depends on how often unanticipated cases appear, which is only visible after deployment.

**12. Bridging thread state and long-term memory.** Checkpointed state is scoped to one thread, and a store or skill library spans threads (L15). Something must decide which facts in a finished thread deserve promotion, under what key, and with what trust level. *Why it's hard:* this is the write problem of section 5 again, now with typed fields that look authoritative even when they were filled from untrusted input.

**13. Keeping a user model useful.** ToM-SWE helps most on somewhat underspecified requests with prior context and still struggles with very vague ones, where history is thin. A user model must also know when its rules are out of date or belong to another project. *Why it's hard:* preferences are rarely stated outright, change without notice, and the only clean signal (a user accepting or rejecting a suggestion) arrives after the agent has already acted on the model.

## Glossary

| Term | Meaning |
| --- | --- |
| Admission | The gate deciding whether a candidate memory or skill enters the store, e.g. a judge verdict, an execution test or human review. |
| AgentContext | OpenHands SDK object that holds the skills (and other context) passed to an Agent; skills in it are always on (trigger=None) or loaded by a trigger (L14). |
| Anchor | Exact information that must survive compaction unchanged, such as the goal and constraints (L3). |
| BM25 | Lexical ranking function scoring documents by query-term frequency, inverse document frequency and length normalization. |
| Checkpointer | Workflow component that saves a thread's state after each step so a run can resume, retry or wait for human input; LangGraph's short-term, thread-scoped memory (L15). |
| CoALA | Cognitive Architectures for Language Agents: framework with working, episodic, semantic and procedural memory plus internal and external actions. |
| Code skill | A skill stored as an executable function the agent can call as an action (ASI, Voyager). |
| Compaction | Replacing a long history with a bounded working state that preserves future behavior (L3). |
| Consolidation | Merging or abstracting many specific memories into fewer general ones. |
| Cumulative success rate | Mean success over all tasks seen so far in an online stream; the metric for compounding memory. |
| Dense retrieval | Ranking by similarity of learned embeddings, s(q, d) = E\_q(q)ᵀE\_d(d). |
| Episodic memory | Records of specific past experiences, such as full trajectories or dialogues. |
| Evidence gating | SkillRefiner stage that admits a failure-derived skill edit only if the trace evidence supports it (L14). |
| Explicit workflow | A procedure fixed in code as steps and transitions, with LLM calls inside some steps; constrains behavior rather than guiding it (L15). |
| Fact | A short declarative memory about the user or environment that can be updated. |
| Induction | Turning episodes into reusable artifacts by abstracting constants into parameters (AWM, ASI). |
| Lesson | Generalized feedback from an episode, such as a Reflexion reflection or ReasoningBank strategy. |
| LLM-as-judge | A model that predicts whether a trajectory succeeded when no ground-truth reward exists. |
| Memory poisoning | Planting records in an agent's memory so later retrievals steer its behavior. |
| Microagent | Earlier OpenHands name for a skill: a prompt fragment for the same agent, not a separate agent (L14). |
| Over-retrieval | Performance loss from retrieving more memories than helpful (ReasoningBank, SkillsBench). |
| Procedural memory | Knowledge of how to act: implicit in weights, or explicit in code, prompts and skills. |
| Progressive disclosure | Loading skill metadata always, the SKILL.md body on trigger, and bundled files only when read. |
| Provenance | Metadata recording who or what wrote a memory and from which source. |
| Reciprocal rank fusion (RRF) | Combining rankings by summing 1/(k + rank) across rankers. |
| Semantic memory | General knowledge detached from a specific episode, such as facts and insights. |
| Skill trigger | The rule deciding when a skill's text enters context: always (trigger=None), on a keyword, on a file path, or when the agent reads it (L14, OpenHands SDK). |
| SKILL.md | Required file of an Agent Skills package: YAML name and description plus a Markdown procedure. |
| SkillRefiner | Method that revises a skill from many rollout traces by summarizing, clustering by outcome, proposing edits, gating failure lessons on evidence and merging (Khatry et al., L14). |
| Sleep-time compute | Letta's idea of using idle time between queries to precompute inferences over stored context; shown in L19 beside ToM-SWE's offline user modelling. |
| Text skill (workflow) | A skill stored as natural-language guidance with example actions and variables (AWM). |
| Thread | One workflow execution identified by a thread or execution ID; checkpoints are scoped to it, while a store or skill library spans threads (L15). |
| ToM agent | In ToM-SWE, the lightweight "theory of mind" agent that holds the user model and answers the coding agent's questions when instructions are unclear (L19). |
| User model | Memory about a person rather than a task: preferences and rules inferred from past sessions, such as "prefer Vercel; academic style; concise communication" (L19). |
| Virtual context | MemGPT's OS-style scheme paging information between the context window and external storage via function calls. |
| Working memory | The information active in the current model call, i.e. the context window. |

## Practice questions

The questions move from recall to calculation to open design; try each before reading the answer.

1. Name L4's three locations for updating an agent and one pro and one con of each. **Answer:** Context window: high fidelity, but costly, noisy and it does not decide what matters. External artifacts: inspectable, editable, retrievable and portable, but they must be induced, selected and maintained. Model weights: faster inference and broad behavior change, but slower to update, opaque and model-specific.
2. Map the four CoALA memory types onto concrete agent components. **Answer:** Working memory is the context window for the current call. Episodic memory is stored trajectories or dialogues (Reflexion's buffer, MemGPT recall storage). Semantic memory is facts and insights (Mem0 records, archival storage). Procedural memory is implicit in the weights and explicit in code, prompts and skills (SKILL.md, AWM workflows, ASI functions).
3. What are Mem0's four update operations, and when is each chosen? **Answer:** ADD when nothing similar is stored; UPDATE when new messages change an existing memory; DELETE when they negate an existing memory; NOOP when the information is already stored or irrelevant. The choice is made by an LLM tool call after fetching the top-s similar memories.
4. Explain the three levels of progressive disclosure and what enters context at each. **Answer:** Level 1 is SKILL.md metadata (name and description), always loaded. Level 2 is the SKILL.md body, loaded when the agent triggers the skill (skill\_view in Hermes). Level 3 is bundled files, loaded only when the agent reads them; for scripts only the output enters context, never the code.
5. With a 6K-token prefix and 5K tokens added per step, what is the cumulative input after 10 calls without compaction? **Answer:** C = TP + ΔT(T−1)/2 = 10 × 6K + 5K × 45 = 60K + 225K = 285K tokens. For comparison, five calls cost 80K, so doubling the calls multiplies cost by about 3.6, reflecting the quadratic term.
6. Using Generative Agents' decay factor 0.995 per hour, what is recency after 24 hours and after one week, and what is the half-life? **Answer:** 0.995^24 = e^(24 × −0.0050125) ≈ e^(−0.120) ≈ 0.887. One week is 168 hours: 0.995^168 ≈ e^(−0.842) ≈ 0.431. Half-life h = ln 2 / 0.0050125 ≈ 138 hours. These are raw values before min-max normalization.
7. TroVE has seen n = 500 examples. Which of these functions survive: f1 used 0 times, f2 once, f3 twice? **Answer:** Threshold = ½ log₁₀ 500 = 0.5 × 2.699 ≈ 1.35. f1 (0) and f2 (1) fall below and are dropped; f3 (2) survives. A function needs at least two uses to survive until n reaches 10,000, where the threshold becomes exactly 2.
8. An agent has 40 skills with 120-token descriptions and 4,000-token bodies, and uses 3 per session. Compare progressive disclosure with eager loading. **Answer:** Progressive: 40 × 120 + 3 × 4,000 = 4,800 + 12,000 = 16,800 tokens. Eager: 40 × 120 + 40 × 4,000 = 164,800 tokens. Progressive disclosure uses about 10% of the eager cost, and the saving grows with the number of installed skills.
9. With RRF (k = 60), document X ranks 1st in BM25 and 4th in dense retrieval; Y ranks 2nd in both. Which ranks higher after fusion? **Answer:** X: 1/61 + 1/64 = 0.01639 + 0.01563 = 0.03202. Y: 2/62 = 0.03226. Y ranks slightly higher, showing that RRF rewards consistent agreement across rankers over one top placement.
10. Summarize ReasoningBank's over-retrieval result and give three reasons it happens. **Answer:** On WebArena shopping, success is 39.0 with no memory, 49.7 with one retrieved experience, then 46.0, 45.5 and 44.4 with two, three and four. L4 gives two reasons: some retrieved items are irrelevant (memory limitation), and the agent can only condition on so much (model limitation). A third is interference between similar but different procedures that the model blends.
11. Why do failures help ReasoningBank but hurt AWM? **Answer:** ReasoningBank stores strategies, and a failure yields a useful lesson such as "tighten the query before browsing" (46.5 → 49.7). AWM stores workflows, which are demonstrations to imitate, so including failed trajectories adds demonstrations of what not to do (44.4 → 42.2). The unit of storage determines whether negative experience can be expressed usefully.
12. Compare text and code skills on flexibility, efficiency and verifiability, citing ASI's numbers. **Answer:** Text skills are flexible hints the model adapts, but the agent still issues every low-level action, so they save few steps. Code skills are called as actions, can be linted and tested before admission, and compose hierarchically, but they are rigid on changed pages. On five WebArena sites ASI reports checkpoints of 41.3 / 59.5 / 80.2 and steps of 24.5 / 20.6 / 15.0 for no memory / text / code.
13. Explain SAGE's reward and why an outcome-only reward is insufficient for training skill creation. **Answer:** Task 1's outcome reward says whether task 1 succeeded, not whether saving part of its solution helps later. SAGE places two related tasks in one rollout and sets R₁ = r₁ + 𝟙\[both succeed\] · 𝟙\[task 2 reused task 1's skill\]. On AppWorld this raises scenario completion from 55.4 (outcome only) to 56.6 (both succeed) to 60.7 (reuse required).
14. Design defenses for a customer-support agent whose memory is written from user chats, given AgentPoison and MINJA. **Answer:** Record provenance and trust level on every item, and treat user-derived memory as data that can never change permissions or tool policies. Require admission checks before chat-derived lessons become shared across users, and scope personal facts to that user only. Quarantine items whose retrieval pattern is anomalous, keep versioned stores for rollback, and red-team with trigger-style and query-only injection. MINJA shows that denying direct write access is not enough, because the agent can be steered into writing the poison itself.
15. You must choose between an AWM-style text workflow store and an ASI-style code skill library for an agent that operates 20 different vendor portals. Recommend a design and justify it. **Answer:** Pure code skills would be efficient but brittle across 20 portals, as ASI's sort\_listings failure on Target shows. A PolySkill-style design fits: define an abstract interface (login, search\_order, download\_invoice) with compositions written once, and implement primitives per portal, testing each before admission. Keep a text-workflow or lesson store as fallback guidance for portals where primitives fail, and evaluate with paired runs and cumulative success per portal, retiring or repairing implementations that stop working.

### More practice questions (L12–L15)

16. A repository has five OpenHands skills of 800 tokens each. A conversation makes 40 LLM calls, and on this task two of the skills are relevant from the first message. Compare the skill tokens read if all five use `trigger=None` with keyword triggers that fire on the first message.

    **Answer:** Always-on: 5 × 800 = 4,000 tokens in the system prompt, read on all 40 calls, so 160,000 tokens. Keyword-triggered: 2 × 800 = 1,600 tokens appended to the first user message, which then stays in the history for 40 calls, so 64,000 tokens. The triggers save 96,000 tokens (60%). Prompt caching lowers the price of the repeated prefix but not the share of context the skills occupy.
17. An OpenHands conversation is restored with the same `persistence_dir` and `conversation_id`, but the agent's next test run fails because files it created earlier are missing. What happened, and how do you prevent it?

    **Answer:** L14 slide 17 says restoration brings back saved events and conversation state, and that "workspace persistence \[is\] a separate concern." The episodic record survived; the external artifacts did not. Persist the workspace too (a durable volume, or a branch the agent pushes to), and record a commit hash in the conversation so a resume can check that the files match the events.
18. Using L14's Table 1, compare SkillRefiner's gains as relative error reductions for (a) DAPO-Math, LLM-initialized skill, MiniMax-M2.7 and (b) SpreadsheetBench, human-initialized skill, GPT-5.4-mini. What does the comparison say about headroom?

    **Answer:** (a) Error falls from 100 − 53.5 = 46.5 to 100 − 64.0 = 36.0, a reduction of 10.5 / 46.5 ≈ 22.6%. (b) Error falls from 14.0 to 13.5, a reduction of 0.5 / 14.0 ≈ 3.6%. A weak starting skill leaves many failures that better instructions can fix. A strong human skill leaves mostly failures that instructions cannot fix, such as model limits.
19. A LangGraph support workflow has a search node (20 s) followed by a generation node (40 s). Failures are equally likely at any moment. Compare expected rework per failure for one combined 60 s node and for the two separate nodes, using section 13's model.

    **Answer:** With E\[rework\] ≈ Σ pᵢ dᵢ / 2 and pᵢ proportional to duration: one node gives 1 × 60 / 2 = 30 s. Two nodes give (20/60)(20/2) + (40/60)(40/2) = 3.33 + 13.33 ≈ 16.7 s. Splitting saves about 13.3 s (44%) per failure, and it also avoids repeating a paid search, which is L15 slide 16's point.
20. While handling one email, a support workflow learns two things: customer Acme wants invoices sent by email, and refund replies must always be reviewed. Where should each be kept?

    **Answer:** Neither belongs only in checkpointed thread state, which is scoped to that one email's thread. Acme's preference is a semantic fact about one customer, so write it to a long-term store under an Acme namespace, with its source email as provenance. The refund rule is a procedure that must be enforced, so make it a workflow edge to the review node, as L15 does for billing, rather than a skill line the model could ignore.
21. Your team wants to run SkillRefiner-style refinement on an issue-triage automation that reads public GitHub issues. Propose a design that keeps the benefits but limits poisoning.

    **Answer:** Treat every trace as low-trust because its inputs came from outsiders. Keep proposals in a quarantine area with the IDs of their source runs, and require that a cluster span several independent issue authors before an edit is proposed. Gate success-derived edits as well as failure-derived ones, and forbid URLs, shell commands and permission changes in learned text. Merge only after a held-out evaluation and a human diff review, and keep versioned skills for rollback, as section 14 and L13's Cline case suggest.
22. After a skill update, an agent's Terminal-Bench pass rate falls from 40% to 27%. Using L15's Docent case study, explain why that number alone should not decide whether to revert.

    **Answer:** In L15's case the lower-scoring model timed out on 132 of 265 scored runs (50%) against 69 of 219 (32%) for the other. On the 28 tasks where neither model timed out, the ranking reversed: 0.500 against 0.429. The headline score mixed two effects, slower delivery and better problem solving. Pair failed runs with successful runs on the same task, synthesize the failure modes, and then fix the real cause, which might be a time budget rather than the skill.

### More practice questions (L19)

23. While fixing a bug, a coding agent learns three things: the test runner is `pytest -x`, a reliable way to bisect a regression, and that this user wants one-line commit messages. Where does each belong?

    **Answer:** The test command is a fact about the environment, so it goes to task memory (or a repository file such as AGENTS.md) and is retrieved by relevance. The bisect method is a procedure, so it becomes a skill loaded by a trigger. The commit-message preference is about the person, so it goes to the user model, with its source session as provenance and an edit path for the user. ToM-SWE consults that store when instructions leave a gap, not on every step.
24. A brand-new user types "make me a website". A returning user with ten past sessions types "put my new paper on my site". Using L19's in-the-wild findings, how should a ToM-SWE-style agent treat each?

    **Answer:** The ToM agent is most useful for somewhat underspecified queries that have prior context, and it struggles with very vague ones. The returning user's request is in that sweet spot: the user model can supply hosting, style and tone, as in "personal website, prefer Vercel; academic style". The new user has no history and a very vague goal, so the agent should ask a clarifying question instead of starting 100 actions on a guess (T15 covers how to ask).
25. Of 174 ToM-SWE suggestions, 74.7% were accepted, 11.5% partially accepted and 13.8% rejected. Roughly how many suggestions fall in each group, and what should the partial and rejected ones feed back into?

    **Answer:** About 130 accepted, 20 partial and 24 rejected (174 × 0.747 ≈ 130, × 0.115 ≈ 20, × 0.138 ≈ 24). Beyond the lecture: partial and rejected suggestions are the cheapest evidence that a rule in the user model is wrong, stale or out of scope. They should trigger an update or a question to the user, as Mem0's UPDATE and DELETE do for facts (section 4).
26. L19's PULSE study found that reducing memory made no significant difference to user satisfaction across over 15k OpenHands users. Does that show memory is useless for coding agents?

    **Answer:** No. "Not significant" means the test could not separate the two designs; a small effect could still exist, and PULSE's intervals were tight enough to detect 3% for reasoning strategy. The result does show that this memory setting had no large effect on satisfaction for that population. A memory feature should therefore be justified on real users and on the tasks where history matters (stateful or repeat work), not on benchmark gains alone (open problem 1).

## References and further reading

All links below were checked; start with CoALA for vocabulary, AWM and ASI for skill induction, and ReasoningBank for the lifecycle.

### Core papers

- [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427) — Sumers, Yao, Narasimhan, Griffiths, 2023 — the working/episodic/semantic/procedural framework and memory-as-actions view.
- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) — Park et al., 2023 — memory stream with recency, importance and relevance retrieval, plus reflection.
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — Packer et al., 2023 — virtual context management with agent-issued memory function calls.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., 2023 — lessons stored as verbal reflections for retries.
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291) — Wang et al., 2023 — the classic growing code-skill library.
- [Agent Workflow Memory](https://arxiv.org/abs/2409.07429) — Wang, Mao, Fried, Neubig, 2024 (ICLR 2025) — text workflow induction, offline and online.
- [Inducing Programmatic Skills for Agentic Tasks (ASI)](https://arxiv.org/abs/2504.06821) — Wang, Gandhi, Neubig, Fried, 2025 — verified code skills; the text-vs-code comparison in L4.
- [ReasoningBank: Scaling Agent Self-Evolving with Reasoning Memory](https://arxiv.org/abs/2509.25140) — Ouyang et al., 2025 (ICLR 2026) — strategies from failures, judge noise and over-retrieval.
- [TroVE: Inducing Verifiable and Efficient Toolboxes for Solving Programmatic Tasks](https://arxiv.org/abs/2401.12869) — Wang, Fried, Neubig, 2024 — usage-based forgetting of induced functions.
- [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) — Chhikara et al., 2025 — extract-then-reconcile fact memory.
- [AgentPoison: Red-teaming LLM Agents via Poisoning Memory or Knowledge Bases](https://arxiv.org/abs/2407.12784) — Chen et al., 2024 — the main memory-poisoning attack paper.
- [LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory](https://arxiv.org/abs/2410.10813) — Wu et al., 2024 (ICLR 2025) — five-ability memory benchmark.

### From the lectures

- [SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks](https://arxiv.org/abs/2602.12670) — Li et al., 2026 — paired evaluation of human-curated skills (L4).
- [PolySkill: Learning Generalizable Skills Through Polymorphic Abstraction](https://arxiv.org/abs/2510.15863) — Yu, Li, Shi, Qi, 2025 (ICLR 2026) — abstract skill interfaces across websites (L4).
- [SkillWeaver: Web Agents can Self-Improve by Discovering and Honing Skills](https://arxiv.org/abs/2504.07079) — Zheng et al., 2025 — practice-and-distill skill APIs; the admission loop in L4.
- [Reinforcement Learning for Self-Improving Agent with Skill Library (SAGE)](https://arxiv.org/abs/2512.17102) — Wang et al., 2025 (ACL 2026) — rewarding skill reuse (L4).
- [Agentic Memory: Learning Unified Long-Term and Short-Term Memory Management (AgeMem)](https://arxiv.org/abs/2601.01885) — Yu et al., 2026 (ACL 2026) — memory operations as RL-trained tools (L4).
- [ExpeL: LLM Agents Are Experiential Learners](https://arxiv.org/abs/2308.10144) — Zhao et al., 2023 (AAAI 2024) — experience pools and insight extraction (L4).
- [Synapse: Trajectory-as-Exemplar Prompting with Memory for Computer Control](https://arxiv.org/abs/2306.07863) — Zheng et al., 2023 (ICLR 2024) — trajectory memory for computer control (L4).
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — Liu et al., 2023 — why stuffing more into context is not the same as memory (background for L3).

### Tutorials, docs and courses

- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — Anthropic, 2025 — the progressive-disclosure design and skill security guidance cited in L4.
- [Agent Skills specification](https://agentskills.io/specification) — AgentSkills, 2025–2026 — exact SKILL.md fields, limits and folder layout.
- [How to Create Effective Agent Skills](https://www.openhands.dev/blog/20260227-creating-effective-agent-skills) — Michelini and Neubig (OpenHands), 2026 — creating skills from finished workflows and the maintenance loop (L4).
- [How Claude remembers your project](https://code.claude.com/docs/en/memory) — Anthropic docs — a production example of instruction files plus an auto-memory index with load limits.

### Added for L12–L15

- SkillRefiner — Khatry et al. — trace-driven skill refinement (L14 slides 42–43, sections 11 and 14); no public version could be located, so no link is given.
- [The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents](https://arxiv.org/abs/2511.03690) — Xingyao Wang et al., 2025 — the SDK behind L14's `AgentContext` skills, persistence and condenser (section 10).
- [Agent Skills & Context (OpenHands SDK guide)](https://docs.openhands.dev/sdk/guides/skill) — OpenHands, docs — always-loaded versus keyword-triggered skills and their token cost (section 10).
- [Don't Sleep on Single-agent Systems](https://www.openhands.dev/blog/dont-sleep-on-single-agent-systems) — Graham Neubig (OpenHands blog), 2024 — the single-agent argument that makes skills carry role know-how (L14 slide 23).
- [Trace2Skill: Distill Trajectory-Local Lessons into Transferable Agent Skills](https://arxiv.org/abs/2603.25158) — Jingwei Ni et al., 2026 — parallel trajectory-to-skill distillation; probably "T2S" in L14's table.
- [GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning](https://arxiv.org/abs/2507.19457) — Agrawal et al., 2025 (ICLR 2026) — reflective prompt evolution, a baseline in L14's table.
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) — LangChain, docs — checkpointers for short-term, thread-scoped memory and stores for long-term, cross-thread memory (section 13).
- [LangGraph Memory overview](https://docs.langchain.com/oss/python/langgraph/memory) — LangChain, docs — short-term versus long-term memory, and hot-path versus background memory writes.
- [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph) — LangChain, docs — the email-support workflow and `SupportState` used throughout L15.
- [Hodoscope: Unsupervised Monitoring for AI Misbehaviors](https://arxiv.org/abs/2604.11072) — Zhong, Saxena and Raghunathan (CMU), 2026 — clustering action summaries to find unexpected behaviors (L15).
- [Docent analysis plans](https://docs.transluce.org/analysis/docent-agent) — Transluce, docs — the trace-analysis tool used in L15's Terminal-Bench case study.
- [Post-mortem: Unauthorized Cline CLI npm publish on February 17, 2026](https://cline.bot/blog/post-mortem-unauthorized-cline-cli-npm) — Cline, 2026 — shared-cache poisoning across agent runs (L13; section 14).

### Added for L19

- [ToM-SWE: User Mental Modeling for Software Engineering Agents](https://arxiv.org/abs/2510.21903) — Zhou, Chen et al., 2025 (ICML 2026) — the user-model memory L19 presents; hierarchical memory over past sessions.
- [Sleep-time Compute: Beyond Inference Scaling at Test-time](https://arxiv.org/abs/2504.13171) — Lin, Snell et al., Letta and UC Berkeley, 2025 — offline consolidation between queries, shown beside ToM-SWE.
- [How can we assess human-agent interactions? Case studies in software agent design](https://arxiv.org/abs/2510.09801) — Chen et al., 2025 (ICML 2026) — PULSE; the deployment A/B test where reducing memory made no significant difference.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L03 - Long-Context Agents]]
- Lecture: [[L04 - Memory and Skills]]
- Lecture: [[L13 - Agent Safety]]
- Lecture: [[L14 - OpenHands]]
- Lecture: [[L15 - Orchestration and Monitoring]]
- Lecture: [[L19 - Human-AI Collaboration]]
- [[Context Engineering - Concepts and Tutorials]]
- [[DeepSeek-V4 a million-token context that agents can actually use]]

[[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction|← T3]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T05 - Planning, Task Decomposition and Multi-Agent Systems|T5 →]]
