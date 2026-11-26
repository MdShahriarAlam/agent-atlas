---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, memory, skills]
aliases: ["CMU L4", "11-768 Lecture 4", "Memory and Skills"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-04-memory-and-skills.pdf"
---

# Lecture 4 · Memory and Skills

[[L03 - Long-Context Agents|← L3]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L05 - Planning and Task Decomposition|L5 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 4 · Daniel Fried
> **Source:** lecture slides `lecture-04-memory-and-skills.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T04 - Agent Memory and Skills]]

Daniel Fried · 11-768 AI Agents, Fall 2026 · source slides: lecture-04-memory-and-skills.pdf (46 slides)

## Overview

Agents can improve across tasks without retraining by turning experience into external artifacts (facts, episodes, lessons and skills) that are induced, verified, retrieved and maintained over a lifecycle; how those artifacts are represented, as text or as code, decides how much they help.

The lecture starts from one observation: agent tasks share a lot of structure. Adding Sony headphones to a wish list and finding the price range of wireless keyboards both begin with the same search procedure. An agent that re-derives that procedure every time wastes steps and makes avoidable errors. The lecture asks three questions about capturing the shared part: **representation** (text or code?), **induction** (how can the agent learn it from experience?) and **lifecycle** (when should a skill be retrieved, checked, revised or forgotten?).

**Learning objectives.** After this lecture you can:

- Compare the three places an agent can be updated (context window, external artifacts, model weights) and say what each costs.
- Distinguish episodes, facts, lessons and skills, and explain how memory differs from a skill.
- Describe an authored skill package (SKILL.md plus scripts, references and assets) and how progressive disclosure keeps it cheap in context.
- Explain how agents induce skills from their own trajectories (AWM, ASI, SkillWeaver, ReasoningBank) and why code skills often beat text skills.
- Walk through the skill lifecycle (learn, use, maintain) and name the failure modes at each stage: bad judges, over-retrieval, brittle skills, library bloat.
- Decide which memory decisions should be made by a human and which by the agent.

**Prerequisites.** The agent loop and tool calling (L1, L2); the basics of retrieval and long-context limits (L3); comfort reading Python.

**Where it fits in the course.** L1 introduced the agent loop and L2 the tools an agent calls. L3 treated the context window as the agent's working memory; this lecture moves durable knowledge out of the window into files and databases the agent reads and writes. L5 (planning) builds on skills as reusable sub-plans. L6 (coding agents) and L7 (computer-use agents) are where skill libraries are used most, and most of this lecture's evidence comes from web agents. L8 (SFT), L9 (RL foundations) and L11 (advanced RL) cover the third option, changing weights; the lecture's last slides on training the skill inducer with RL (SAGE, AgeMem) bridge to them. L10 (deep research agents) relies heavily on memory of facts gathered over long sessions.

## Concept map

![[cmu-ai-agents-L04-concept-map.png]]
*Concept map: The skill lifecycle · learn, use and maintain loops around one skill memory*

Read the top lane left to right (a judged, tested episode becomes a skill), the middle lane right to left (the agent retrieves and uses a skill, and its outcome is logged), then the bottom lane left to right (logs drive repair, consolidation and retirement back into memory).

## Detailed notes

These notes follow the lecture's five parts: the framing, authored skills, memories, induced skills, and the skill lifecycle, then the closing discussion.

### 1. Framing: what experience should persist, and where?

**Shared task structure.** The opening slide puts two web-shopping tasks side by side. Task 1, "Add Sony headphones to my wish list", runs: go to the store, find the search box, `fill("sony headphones")`, click Search, open the Sony result, Add to Wish List. Task 2, "Find the wireless keyboard price range", runs: go to the store, find the search box, `fill("wireless keyboards")`, click Search, read the result prices, report min to max. The first four steps are the same **shared search procedure**; only the finish is task-specific. The point is that agent tasks are full of recurring sub-procedures. An agent with no way to keep them re-plans the search from scratch every time.

The lecture frames the rest of the session around three questions:

1. **Representation.** Should the shared structure be stored as text or as code?
2. **Induction.** How can the agent extract it from its own experience?
3. **Lifecycle.** When should a skill be retrieved, checked, revised or forgotten?

**Three places to put what the agent learns.** An agent can be "updated" in three locations, each with a distinct trade-off.

| Location | Covered in | Pros | Cons |
| --- | --- | --- | --- |
| Context window | Last lecture (L3) | High fidelity to what happened | Costly, noisy, does not decide what matters |
| External artifacts | This lecture | Inspectable, editable, retrievable, portable | Must be induced, selected and maintained |
| Model weights | SFT lecture (L8) | Faster inference, broad behavior change | Slower updates, opaque, model-specific |

Keeping everything in the context window is faithful but expensive, and it pushes the job of deciding what matters onto the model at every step. Fine-tuning bakes behavior in, but each update is slow and the result is hard to inspect or move to another model. External artifacts sit in between: a file or a database row that a person can read, edit, and copy to a different agent. The cost is that someone, human or agent, has to decide what to write, when to read it, and when to throw it away. The guiding question is therefore: **what experience is worth turning into an external artifact?**

**Types of experience.** The lecture distinguishes three granularities, each useful under a different condition.

| Type | Example | Worth storing if… |
| --- | --- | --- |
| Episode | A full trace: every observation and action | The exact product, prices or sequence will matter again |
| Fact | "This store shows prices only on the product page." | The fact recurs in future tasks, or can be updated |
| Skill | fill the search box → click search → open a result | Later tasks will repeat the same pattern |

A fourth type, the **lesson** (a generalizable insight such as "tighten the query before browsing"), appears later with Reflexion and ReasoningBank. It sits between a fact and a skill: it tells the agent what to do differently, without spelling out the steps.

**Memory versus skill.** The lecture draws a Venn diagram. **Memory** is anything saved from the agent's own interaction, such as a previous product purchased. A **skill** is reusable knowledge about how to act, stored as code, text or both, such as a release checklist a person wrote. The overlap is the **induced skill**: a skill the agent derived from its own successful searches. That overlap is the lecture's main subject.

**Two pathways to a skill.**

|  | Skills as instructions | Skills as learning |
| --- | --- | --- |
| Author | A person or organization | The agent |
| Source | Existing expertise, policy, documentation | Its own episodes and outcomes |
| Strength | Known intent and provenance | Works where the skill must be discovered |
| Main burden | Expert time to write and maintain | Judging outcomes, verification, curation |

Why it matters: the two pathways fail differently. Authored skills are trustworthy but only as good and as current as the expert who wrote them. Learned skills scale with use, but every learned skill is only as good as the judge that decided the episode it came from was a success.

### 2. Authored skills

**What a skill is.** The motivating example is a request a developer types into every pull-request conversation: "Please check this Python code using: Black formatting with 88-char line limit; Ruff linting with our custom rules; Type hints for all public APIs; Google-style docstrings; Pytest for all new functions." Whenever you do something repeatedly against a fixed spec (adding tests, reviewing pull requests, upgrading dependencies), that spec is a candidate skill. In this first half of the lecture a person writes it; later the agent is asked to notice the repetition and write the skill itself. In practice a skill is implemented as a **collection of files**: documentation, scripts and resources that provide guidance and automation (OpenHands; Michelini & Neubig, "How to Create Effective Agent Skills", 2026).

**Anatomy of a skill package.** The example package is `python-review/`:

```text
python-review/
├── SKILL.md        # Required: instructions + metadata
├── scripts/        # Optional: executable code
├── references/     # Optional: documentation
└── assets/         # Optional: templates, resources
```

`SKILL.md` opens with YAML front matter: a `name` (`python-review`), a `description` ("This skill should be used when the user asks to 'review Python code', 'check Python style', 'lint Python', or mentions code quality.") and optional `triggers` (python review, code review, lint python). The Markdown body below it holds the actual instructions ("Review Python code using company standards…"). This layout follows Anthropic's "Equipping agents for the real world with Agent Skills" and the open AgentSkills specification.

**Progressive disclosure.** The package is designed so the agent pays for only what it uses. Content loads in three levels:

| Level | File | When it enters the context window |
| --- | --- | --- |
| 1 | SKILL.md metadata (YAML) | Always loaded |
| 2 | SKILL.md body (Markdown) | When the agent triggers the skill |
| 3 | Bundled files (text, scripts, data) | When the agent reads the files |

Names and descriptions load up front; everything else is read only when the agent asks for it. This matters because an agent may have dozens or hundreds of skills installed. Loading every body would recreate the context-bloat problem from L3.

**Deeper dive — the token arithmetic of progressive disclosure.** A rough budget shows why the three levels exist. Hermes spends about 3k tokens on its always-loaded index. At roughly 50 tokens per name-plus-description, that is about 60 skills. Suppose each SKILL.md body averages 1,500 tokens (an illustrative figure). Loading every body up front would cost 60 × 1,500 = 90,000 tokens on every turn, before the user has said anything. With progressive disclosure, a typical task pays 3,000 for the index plus one or two bodies, about 4,500–6,000 tokens. That is a 15–20× saving. Level 3 matters even more, because reference files and scripts can be arbitrarily large, and scripts are executed rather than read. The trade-off is a routing risk: the model only sees the description when deciding whether to load. A vague description means the right skill is never opened, so the description is the most valuable 50 tokens in the package.

**Indexing skills in the system prompt.** The lecture shows an abridged system prompt from HermesAgent (`agent/prompt_builder.py`, MIT licence). It tells the model: "Before replying, scan the skills below. If a skill matches or is even partially relevant to your task, you MUST load it with `skill_view(name)` and follow its instructions." An `<available_skills>` block then lists skills grouped by category, for example `code-quality: python-review` and `workflow: submit-task` ("When the task is complete, take the required steps to submit the solution. DO NOT submit without invoking this skill.") and `release-notes`. It closes with "Only proceed without loading a skill if genuinely none are relevant." Note how the description field does the routing work: it is written as a trigger condition, not a summary.

**Loading skills with tools, turn by turn.** A single review task unfolds like this in Hermes:

1. **System prompt**: the index of skills, names and descriptions only. This is about 3k tokens in Hermes.
2. **`skill_view('python-review')`**: the SKILL.md body arrives once, as a tool result, containing the review steps as text. (Assignment 1 calls this tool `invoke_skill`; see §1.4 "Load skills".)
3. **Terminal: `python scripts/run_checks.py src/`**: the script's output (Black and Ruff findings) enters the context. The script's source code never does.
4. **`skill_view('python-review', 'references/docstring-style.md')`**: the docstring rules, only when the model calls for them.

Why it matters: step 3 shows the quiet advantage of bundling scripts. The agent gets deterministic results from a tool without spending tokens on the tool's source.

**Measuring the gain: SkillsBench.** SkillsBench (arXiv 2602.12670) asks whether human-curated skills actually help. Its pipeline figure has three phases. Phase 1 (benchmark construction) gathers a skill ecosystem of 234,896 skills from GitHub, 1,773,213 from marketplaces and 5,891 from enterprise sources, deduplicated to about 2,014,000 unique skills; 142 contributors submitted 400 tasks. Phase 2 (quality filtering) applies automated checks (structure, 100% oracle pass, AI-generated-content detection, leakage audit) and human review (data validity, task realism, oracle quality, skill quality, anti-cheating), leaving **87 tasks across 8 domains**. Phase 3 runs each task in a container with no skills or with curated skills, three trials each, across harnesses including OpenHands, Claude Code, Codex CLI and Gemini CLI, verified with pytest: 18 model–harness configurations and 9,396 trajectories in total. Humans choose the skill bundle supplied with each task.

**Gains and limits.** The results bar chart plots resolution rate (0 to 0.7) for 18 configurations, from Gemini 3.1 Flash Lite (lowest, about 0.16 without skills) up to GPT-5.5 under Codex and OpenHands (highest, about 0.66 with skills). Each bar shows the no-skill rate plus a lighter "skill lift" segment; nearly every configuration gains. Averaged, **skills raise the pass rate from 33.9% to 50.5%**, about +16.6 percentage points. Two further findings:

- **Focused skills correlate with larger gains.** Tasks supplied with 1–3 skills improve more than tasks with 4 or more, and shorter SKILL.md groups also show larger gains.
- **Skills still hurt on 13 of 87 tasks.** A skill can displace a better default strategy the model would otherwise have used.

Common pitfall: treating "more skills" as free. The SkillsBench result foreshadows the over-retrieval finding later in the lecture.

**Where skill packages come from.**

- **Bundled**: ships with the harness as part of its default set.
- **Installed or written**: a person writes one for their own work and checks it into the repository under `.agents/skills/`, or installs it from another repository or a registry.
- **Created by the agent**: the agent writes the same package itself. Hermes exposes a `skill_manage` tool that can create, patch or delete skills; OpenHands has a `/skill-creator` command that drafts one from the workflow the agent just finished. A person can review either before it ships.

OpenHands' practical advice: don't write a skill from scratch. Create it right after the agent finishes a workflow you want to repeat, then test it a few times.

**Case study: maintaining a code-review skill.** OpenHands runs a `python-review`-style skill on every pull request in its own repositories and maintains it with a loop: review skill → log each run → score each run → find recurring failures → patch SKILL.md.

1. **Evaluate the outputs.** After each PR merges, a model judge counts how many of the agent's suggestions the humans kept. This is a cheap, automatic proxy for usefulness.
2. **Have a model analyze failures.** It reads the run notes and names what recurs: ignoring repo conventions (\~15% of runs) and approving PRs that contain a critical flaw (\~10%).
3. **Update SKILL.md.** The same model drafts the patch: request changes whenever a critical issue is found, and check a suggestion against the repo before posting it.

Why it matters: even a human-authored skill needs a maintenance loop, and that loop can itself be mostly automated. This is the same learn-use-maintain lifecycle the lecture formalizes in Part 5.

### 3. Memories: facts, lessons and episodes

This part covers memory that the agent builds from its own interaction, at three granularities: facts about the world or user, lessons from feedback, and whole episodes.

**Managing an external memory: MemGPT.** MemGPT (Packer et al., 2023) treats the LLM like an operating system that pages data between a small fast memory and a large slow one. Its architecture figure shows a finite context window (for example 8k tokens) split into prompt tokens and completion tokens. The prompt tokens hold three regions:

- **System instructions**: read-only and static (the MemGPT system prompt).
- **Working context**: read-write, written via functions. This is a scratchpad of key facts, for example about the user.
- **FIFO queue**: read-write, written by a queue manager. It holds the recent message history.

Outside the window sit two stores. **Archival storage** is read and written via functions. **Recall storage** holds the full message history; it is written by the queue manager as messages are evicted and read via functions. A function executor connects the model's output buffer to these stores. The second figure shows the model issuing `recall_storage.search("six flags")` and getting "Showing 3 of 3 results (page 1/1)": dated past messages such as "lol yeah six flags" and "james and I actually first met at six flags". The key idea: **reads and writes are function calls the agent issues itself.** Memory management becomes part of the agent's action space, not a fixed pre-processing step.

**Deeper dive — how MemGPT pages memory.** The queue manager enforces two thresholds. When prompt tokens pass a "warning token count" (for example 70% of the window), it inserts a system message warning the model that eviction is coming. That warning is the model's cue to save anything important to working context or archival storage. When prompt tokens pass the "flush token count" (for example 100%), the queue manager evicts a block of messages (for example 50% of the window) into recall storage. The first slot of the FIFO queue holds a recursive summary of everything evicted so far, so some trace of old turns always stays in view. Retrieval can take several steps: a function call can set request\_heartbeat=true, which asks for another inference step immediately, so the model can search, read a page of results, and search again before replying. In OS terms, the warning is a memory-pressure signal and the heartbeat is a way to keep the process scheduled.

**Handling memory conflicts: Mem0.** Mem0 (Chhikara et al., 2025) addresses what happens when new information conflicts with old. Its pipeline has two LLM phases.

1. **Extraction phase.** The LLM sees a conversation summary (from a summary generator backed by the database), the last *m* messages, and the new message pair. It outputs candidate new memories.
2. **Update phase.** For each candidate, the system fetches the top-*s* most similar stored memories. The LLM then makes a tool call choosing one of four operations.

| Operation | When |
| --- | --- |
| ADD | Nothing similar is stored yet |
| UPDATE | The messages change an existing memory |
| DELETE | The messages negate an existing memory |
| NOOP | The messages are already stored, or are irrelevant |

Why it matters: a naive memory only appends. After a user says "I moved to Pittsburgh" and later "I moved to Boston", an append-only store holds two contradictory facts and the retriever may surface the stale one. Mem0's explicit UPDATE and DELETE make the store self-correcting.

**Deeper dive — why an LLM, not a rule, resolves conflicts.** Contradictions are semantic, not lexical. "I'm vegetarian" and "I had steak last night" share no words, yet one may invalidate the other. Or it may be a one-off exception, which calls for NOOP or a qualified UPDATE rather than DELETE. A string-matching rule cannot tell these apart. So Mem0 retrieves the top-s most similar stored memories by embedding, and lets the LLM choose the operation with those neighbours in view. Two practical points follow. First, s bounds what the model can reconcile: a contradiction outside the top-s neighbours goes unnoticed, and a duplicate is added. Second, UPDATE should keep the more informative version: "likes pizza" plus "likes pepperoni pizza" becomes the latter. The paper's graph variant stores entities and relations and marks superseded relations as invalid instead of erasing them, which preserves history for time-based questions. The same ADD/UPDATE/DELETE/NOOP vocabulary applies to skill libraries: a new skill may duplicate, refine or supersede an old one.

**Remembering feedback on trajectories: Reflexion.** Reflexion (Shinn et al., NeurIPS 2023) stores **lessons**, not facts. Its loop is: attempt → evaluator predicts reward → reflection generates verbal feedback → retry the same task with that feedback in context. The lecture's HotpotQA-style example:

- **Attempt 1.** "What was a series of battles … fought on October 28, 1776 near White Plains, New York?" The agent answers `Finish[Battle of White Plains]`: incorrect.
- **Generated feedback.** "… the question asked for a series of battles, but I only provided the name of one battle … I will make sure to provide more context, such as the name of the campaign …"
- **Attempt 2.** `Finish[The New York and New Jersey campaign]`: correct.

Reflexion's memory is scoped to retries of one task. Its lesson is written in natural language, which later methods (ReasoningBank) generalize to lessons that transfer across tasks.

**Similar-trajectory conditioning.** A family of methods stores whole trajectories and retrieves them as few-shot examples. The lecture summarizes the design space along three axes:

- **What is stored:** whole trajectories, both successes and failures, sometimes rewritten and annotated before storage.
- **Where the pool comes from:** collected offline in a training phase, grown while the agent works, and/or hand-written in advance.
- **How it is used:** retrieve the runs most similar to the new task using text embeddings, and include them as few-shot examples.

The figure from ExpeL (Zhao et al., AAAI 2024) shows this in two phases. In the training phase (A) the agent attempts tasks 1 to N, producing successful and failed trajectories that flow into an **experience pool**. An LLM then performs **insight extraction** (B) over the pool, comparing successes with failures to write general insights. In the evaluation phase, on tasks 1 to M, the agent receives both **experience recall** (similar trajectories) and **insight guidance**. Related systems cited on the slide: Agent S (Agashe et al., ICLR 2025), Synapse (Zheng et al., ICLR 2024) and ICAL (Sarch et al., NeurIPS 2024).

Common pitfall: retrieving by embedding similarity of the task description is not the same as retrieving by usefulness. Two tasks can read alike yet need different procedures, which is one reason over-retrieval can hurt (Part 5).

### 4. Inducing skills: text versus code

**Skills as reusable chunks of a task.** A skill is a parameterized sub-procedure. The slide shows "Search for a product" ("Show me results for {query}"): a comment "To find {query}, I will type it into the store's search box and submit", then `fill('element145', {query})` and `click('element147')`. "Report a price range" ("What is the price range for {query}?") **reuses** that chunk verbatim and **adds steps**: read the lowest and highest card prices, then `send_msg_to_user("{low} to {high}")`. Two properties make this a skill rather than a memory: the concrete query is abstracted into a variable, and the chunk composes into larger tasks. The open question is representation: text or code.

**Lineage: program induction.** Inducing reusable functions from solved problems predates LLM agents.

| System | Idea |
| --- | --- |
| Voyager (Wang et al., 2023) | Induce JavaScript functions for increasingly complex Minecraft action sequences, each calling earlier ones |
| DreamCoder (Ellis et al., 2021) | Induce functions that compress a corpus of solved programs; later search reuses them |
| Stitch (Bowers et al., 2023) | Fast symbolic compression: find functions that capture the most shared structure in a corpus |
| LAPS (Wong et al., 2021) | Natural-language task descriptions guide which functions are induced and how programs are searched for |
| LILO (Grand et al., 2024) | An LLM writes programs; Stitch compresses them into functions; the LLM names and documents each |

The Voyager figure shows three parts. An **automatic curriculum** proposes tasks (mine wood log → make crafting table → combat zombie → mine diamond). An **iterative prompting mechanism** writes code such as `async function combatZombie(bot)`, which calls earlier skills like `craftStoneSword(bot)` and `craftShield(bot)`, refined with environment feedback, execution errors and self-verification. A **skill library** stores verified programs (Mine Wood Log, Make Crafting Table, Craft Stone Sword, Make Furnace, Craft Shield, Cook Steak, Combat Zombie) and retrieves relevant ones for new tasks.

**Inducing skills online.** The evaluation setting for web agents is a stream. Evaluation tasks arrive one at a time, and a successful task updates the skill memory before the next task arrives. The metric is the **cumulative success rate over all tasks seen so far**. In the slide's example, succeeding on "add a Sony bluetooth headphone to my wish list" induces "search for a product" and "add a product to the wish list"; those skills are then applied to "find gaming accessories added in the last month" and "what is the price range for wireless keyboards?". There is no separate training set: the memory grows across the evaluation stream.

**Deeper dive — the cumulative success metric.** Let s\_i be 1 if task i succeeded and 0 otherwise. The cumulative success rate after t tasks and its one-step update are:

$$
\mathrm{SR}_t = \frac{1}{t}\sum_{i=1}^{t} s_i,
\qquad
\mathrm{SR}_{t+1} - \mathrm{SR}_t = \frac{s_{t+1} - \mathrm{SR}_t}{t+1}
$$

The update shows two things. Each new task moves the average by at most 1/(t+1), so early tasks cause big jumps and later ones small wiggles; that is the sawtooth in AWM's curve (slide 28). And a success raises the average only by (1 − SR\_t)/(t+1), so gains get harder as the curve rises. Two consequences for evaluation: the metric depends on task order, so papers should average over several orderings; and the final value weights every task equally, so an agent that learns late gets little credit for it. Comparing the last 20 tasks alone would show the effect of memory more sharply.

**The lifecycle, previewed.** The lecture organizes every method around one pipeline with three rows:

- **Learn:** episode → judge → induce → admit → memory
- **Use:** memory → select/retrieve → act → outcomes
- **Maintain:** outcomes → add → repair → retire → memory

**Textual skills: Agent Workflow Memory (AWM).** AWM (Wang et al., ICLR 2025; slides credit Zora Wang) induces text workflows. The example episode: "Tell me the number of reviews that our store received so far that mention the term 'satisfied'." The actions were `click("Marketing")`, `click("All Reviews")`, `fill(757, "satisfied")`, `click("Search")`, `send_msg_to_user("2")`.

1. **Judge.** An LM evaluator predicts whether the final state is correct. If not, the episode is passed over.
2. **Induce.** Few-shot prompting turns the episode into a workflow: "Task: Search for reviews matching '{term}'", with a reasoning comment ("To find reviews for {term}, I will search for '{term}' in the reviews page") and abstracted actions `click("All reviews")`, `fill(757, "{term}")`, `click("Search")`.
3. **Admit.** The workflow is added to memory, which is included in the agent's context on later tasks.

The induction prompt (AWM Appendix A.1) reads, in part: "Given a list of web navigation tasks, your task is to extract the common workflows… find the repetitive subset of actions across multiple tasks, and extract each of them out as a workflow. Each workflow should be a commonly reused sub-routine of the tasks. Do not generate similar or overlapping workflows. Each workflow should have at least two steps. Represent the non-fixed elements (input text, button strings) with descriptive variable names." Each rule targets a failure: overlapping workflows bloat memory, one-step workflows add nothing, and unabstracted values do not transfer.

**Cross-task memory compounding.** AWM's key plot (on WebArena's map site) has number of examples on the x-axis and cumulative success rate (%) on the y-axis. The AWM curve climbs steeply as it learns early skills (find a place by its name, find cafe near a place, get the coordinates of a place, display the route from A to B, get driving time from A to B) and then plateaus near 40%. The baseline rises to about 20% and slowly drifts down. The gap widens to **22.5 points after 40 examples**. Later, harder tasks ("decide if can drive from A to B in a given time"; "find a Hilton hotel near this location, then show me the shortest walking path to a nearby supermarket") are solved by composing earlier workflows. That is compounding.

**Text versus code, side by side.**

|  | Text + examples (AWM) | Code (ASI) |
| --- | --- | --- |
| Form | Commented action trajectory, e.g. `click(1274)` # Video Games category; `fill(473, {search_terms})`; `click(478)` | A Python function `search_product(search_box_id, query)` with a docstring, args and examples, calling `click`, `fill`, `keyboard_press('Enter')` |
| How it is used | A hint in context; the agent re-issues every low-level action | Called as a tool: `search_product('595', 'Macbook')` |
| Strengths | Flexible: the agent interprets it and adapts to the page in front of it | Testable (run it before storing); hierarchical (skills call skills); efficient (one call replaces many model steps) |
| Weakness | Manual: copying and modifying every step | Rigid: does exactly what it says, even on a page that has changed |

**Deeper dive — why only code skills cut steps.** Count model decisions, not environment actions. If a skill bundles k primitive actions and is used u times in a task, a code skill replaces k · u model decisions with u calls, saving (k − 1) · u steps. A text skill saves nothing on this count, because the model still emits all k actions. It only saves the exploratory steps the agent would have wasted without guidance. That explains ASI's pattern: text skills cut steps modestly (24.5 to 20.6, about 16%) by avoiding detours, while code skills cut them further (to 15.0, about 39%) by also collapsing actions. Fewer decisions also means fewer chances to err. If each decision independently succeeds with probability q, a path of n decisions succeeds with probability roughly q^n. At q = 0.97, 24 steps gives about 0.48 and 15 steps about 0.63. This toy model is optimistic about independence, but it shows why efficiency and success move together.

**Inducing code skills: ASI.** Agent Skill Induction (ASI; Wang et al., COLM 2025) runs the same learn pipeline but emits code. From the reviews episode the LM induces two functions: `search_reviews(search_box_id, search_button_id, search_term)`, which fills the box and clicks search, and `open_marketing_reviews()`, which clicks Marketing then All Reviews. The crucial addition is a **test**: the agent re-solves the task using the new skills (`open_marketing_reviews()`, then `search_reviews('757', '704', "satisfied")`). The judge then asks two questions: is the final state predicted correct, and were the skills actually used? Only then are the skills admitted. Its lineage is Voyager's memory of code skills in Minecraft.

**Code skills allow testing: SkillWeaver.** SkillWeaver (Zheng et al., 2025) makes admission explicit:

```python
candidates = propose_skill(task)
episode = practice(candidates, task)

if reward_model(episode.actions, episode.screenshots, task):
    memory.add(candidate)
else:
    candidate = revise(candidate, task)
```

Because skills are code, ordinary software tooling applies. The slide's example is a Playwright skill `identify_pill(page, imprint="M366", color="White")`. A linter warns "parameter 'color' is defined but never used in the function body". The fix adds an `if color:` branch that selects the colour in the page's "Color (optional)" combobox. A text skill has no equivalent check.

**Task compression.** ASI's Figure 5 (shopping site) shows the request "I recently moved. Can you change my billing address to '231 Willow Way, Suite 100, Chicago, IL, 60601'? Then, update my shipping address to: 987 Sycamore Circle, Philadelphia, PA, 19102." With **no memory**, the agent clicks through My Account, My Address, Add New Address and Address Book with redundant steps, then fills street line 1, street line 2, city, state and zip one field at a time, and hits the **50-step cap** before finishing. With **code skills** it takes **4 steps**: `navigate_to_address_settings(...)` reaches the page in one step, then `update_address_details(...)` updates each address in one step.

**Results.** ASI Table 2, averaged over five WebArena sites:

| Condition | Checkpoints reached (↑) | Steps per task (↓) |
| --- | --- | --- |
| No memory | 41.3% | 24.5 |
| Text skills | 59.5% | 20.6 |
| Code skills | 80.2% | 15.0 |

On web tasks with repeated structure, code skills improve success over text skills and also cut the number of agent steps. Text skills help success but barely reduce steps, because the agent still issues each action.

**How general are skills?** ASI Figure 4 induces skills on WebArena shopping and evaluates on target.com with the task "Show me the least expensive shoe storage." `search_product('1724', 'shoe storage')` transfers correctly. But `sort_listings(sort_dropdown_id, sort_option)` assumes a dropdown, and Target's Sort button opens a sidebar panel instead. The code does exactly what it says on a page where that is wrong. This is the rigidity cost made concrete.

**PolySkill: one interface, many implementations.** PolySkill (Yu et al., ICLR 2026) repairs this with ordinary object-oriented design. An abstract class `AbstractShoppingSite` declares primitives (`search_product`, `add_to_cart`, `checkout`) and defines **compositional skills** once against them: `find_and_add_to_cart` calls `search_product` then `add_to_cart`; `purchase_item` calls `find_and_add_to_cart` then `checkout`. Each site subclass implements only the primitives. `AmazonWebsite.search_product` clicks the search bar, fills it and presses Enter; `TargetWebsite.search_product` fills and clicks a search button; Amazon's `checkout` first views the cart. Compositions are written once; each website implements only the primitive browser actions.

**Consequences of representation.**

| Representation | Strengths | Weaknesses |
| --- | --- | --- |
| Retrieved episode | Preserves concrete behavior | Long, hard to transfer |
| Text skill | Provides flexible guidance | Doesn't improve efficiency |
| Code skill | Executable, composable, efficient | Can be brittle |

The unifying question: **how much of the behavior is left to the model, and how much is fixed in the artifact?**

### 5. The skill lifecycle: judge, retrieve, consolidate, train

The last technical part walks the learn-use-maintain pipeline stage by stage, asking what goes wrong at each.

**Learn: learning from failures (ReasoningBank).** ReasoningBank (Ouyang et al., ICLR 2026) induces **strategies**: short, titled lessons, from both successes and failures. The appendix case study: "Provide me with the complete names of Bluetooth headphones from Sony, and also share the price range for the available models." The agent searched "Bluetooth headphones Sony", got **5,578 results** from every department, at 12 per page, and paged next → next → … until it hit the step limit with nothing sent to the user. A failure. From it the inducer wrote three strategies:

- **"Search query optimization"**: a vague query buried the answer under thousands of loosely matched results; tighten the query before browsing.
- **"Adjust number of items displayed per page"**: twelve per page makes every "next" cost a step for little coverage.
- **"Use filters available"**: the sidebar's category filters shrink the list without paging.

None of these is a procedure to replay. Each is advice that would have prevented this failure and transfers to many other tasks.

**Failures help some memory types and hurt others.** ReasoningBank's comparison (WebArena shopping, Gemini-2.5-flash) plots success rate against a no-memory baseline of **39.0**:

| Memory type | Success only | With failures |
| --- | --- | --- |
| Synapse (trajectories) | 40.6 | 41.7 |
| AWM (workflows) | 44.4 | 42.2 |
| ReasoningBank (strategies) | 46.5 | 49.7 |

Failures help substantially when inducing strategies. They are less helpful, or harmful, for trajectories and workflows. The lecture's hypothesis: a failed trajectory or workflow is a demonstration of what *not* to do, and a model conditioned on it as an example may imitate it anyway. A strategy distils the failure into a positive instruction.

**Learn: how much does judge accuracy matter?** Every learned-memory method depends on a judge deciding which episodes succeeded, and real LLM judges are imperfect. ReasoningBank's calibration analysis swaps in simulated judges: the true label, flipped with a fixed probability. The bar chart's x-axis is simulated judge accuracy (100, 90, 80, 70, 60, 50) and the y-axis is success rate:

| Judge accuracy | 100 (oracle) | 90 | 80 | 70 | 60 | 50 (coin flip) |
| --- | --- | --- | --- | --- | --- | --- |
| Success rate | 52.4 | 49.7 | 48.7 | 49.7 | 47.6 | 47.6 |

Performance depends on judge accuracy: the oracle is clearly best. But the 70–90% band is roughly flat, and even a coin-flip judge still beats no memory (39.0 in the previous comparison). The conclusion: memory improves results for a wide range of judge qualities. A reasonable reading is that the induction step itself filters noise, since a strategy written from a wrongly labeled episode is often still sensible advice.

**Deeper dive — what a noisy judge does to the admitted set.** Let p be the agent's true success rate and a the judge's accuracy, assumed the same on successes and failures. The share of episodes labelled "success" that really succeeded (the precision of the admitted set) is:

$$
\text{precision} = \frac{p\,a}{p\,a + (1-p)(1-a)}
$$

With p = 0.39 (the no-memory rate on slide 39): at a = 0.9, precision is 0.351 / (0.351 + 0.061) ≈ 0.85; at a = 0.7 it is 0.273 / (0.273 + 0.183) ≈ 0.60; at a = 0.5 it equals p = 0.39, the same as no judge. So a 70% judge still admits mostly true successes, but a coin flip admits failures at their natural rate. ReasoningBank survives this because it learns from both labels, and a strategy induced from a mislabelled episode is often still reasonable advice. A workflow memory (AWM) would be hurt more, because a mislabelled failure becomes a recipe to copy. Precision also rises with p, so judges matter most for weak agents on hard tasks.

**Use: the cost of over-retrieval.** How many memories should the agent retrieve per task? ReasoningBank's line plot (WebArena shopping) has number of retrieved experiences on the x-axis and success rate on the y-axis: 0 → 39, 1 → **49.7**, 2 → 46, 3 → 45.5, 4 → 44.4. The peak is at one experience; each additional one lowers performance. SkillsBench found the same pattern for human-curated skills (tasks with 4+ skills gained less). Two explanations:

- **Limitations of the memory:** some retrieved experiences are simply irrelevant to the task.
- **Limitations of the agent:** the model is limited in how much it can usefully condition on, and extra guidance dilutes or conflicts with the relevant piece.

Common pitfall: tuning top-k for retrieval recall, as in document RAG. For agent memory, precision matters more than recall.

**Deeper dive — a simple model of over-retrieval.** Treat each retrieved item as having a benefit if relevant and a cost if not. Let r\_j be the chance the j-th ranked item is relevant, falling with rank. Let g be the gain from the first relevant item, and c the distraction cost of each irrelevant one. The expected value of retrieving k items is then roughly the gain from having at least one relevant item, minus c times the expected number of irrelevant ones. Because the gain saturates after the first relevant item and the cost grows linearly, the optimum is small. ReasoningBank's curve (+10.7 points for k = 1, then −5.3 by k = 4) fits this shape. Practical fixes follow from the model. Retrieve by a relevance threshold instead of a fixed k, so the agent gets zero items when nothing matches. Rerank with an LLM that asks "will this help with this task?" instead of "is this similar?". And merge near-duplicate memories during maintenance, so the top slots are not wasted on variants of the same lesson.

**Maintain: memory consolidation (TroVE).** Libraries that only grow get slower to search and noisier to retrieve from. TroVE (Wang et al., ICML 2024) induces a toolbox of verifiable functions and periodically **forgets** rarely used ones. Its rule:

$$
\text{drop function } f \quad \text{if} \quad \mathrm{uses}(f) < \tfrac{1}{2}\log_{10}(n)
$$

Here uses(f) is how many times function f has been used, and n is the number of examples seen so far. The threshold grows slowly with experience: at n = 100 a function needs at least 1 use; at n = 10,000 it needs 2. The figure plots function-library size against number of examples on three datasets. Without forgetting the library grows steadily; with forgetting it stays small: a **74% size reduction** on MATH (Algebra), **83%** on HiTab and **90%** on GQA. The slide also cites "Not All Skills Help": a skill that helps one task type can hurt another, so retirement may need to be conditional on task type.

**Train the skill inducer.** So far the inducer is a prompted, frozen model. Can it be trained? The obstacle is credit assignment. In Task 1 ("Add Sony headphones to my wish list") the agent writes and runs a search skill and saves `search(query)` to shared memory. Task 1's reward says only whether Task 1 succeeded. Whether saving the skill was worthwhile is unknown until reuse, when Task 2 ("Find the wireless keyboard price range") calls `search(query)`. The fix is to put the later task inside the training example: two related tasks in one rollout (SAGE, Wang et al., ACL 2026) or one long trajectory (AgeMem, Yu et al., ACL 2026). SAGE's Task 1 reward is:

$$
R_1 = r_1 + \mathbb{1}[\text{both succeed}] \cdot \mathbb{1}[\text{task 2 reused its skill}]
$$

Here r₁ is Task 1's own outcome reward and 𝟙\[·\] is an indicator equal to 1 when its condition holds, else 0. The bonus pays only when a saved skill actually helped a later task succeed. Results (scenario completion, AppWorld test-normal, Qwen2.5-32B):

| Reward | Scenario completion |
| --- | --- |
| Outcome only | 55.4 |
| Both tasks succeed | 56.6 |
| Successful skill reuse | 60.7 |

Rewarding reuse, not just success, adds about 5 points over outcome-only training. This connects to the RL lectures (L9, L11): it is a reward-shaping answer to a delayed-credit problem.

**Deeper dive — why the reuse bonus has two indicators.** Each factor in 1\[both succeed\] · 1\[task 2 reused its skill\] blocks a specific way of gaming the reward. Without the reuse indicator, the policy is paid when Task 2 succeeds whether or not the saved skill helped; that is the "both tasks succeed" row, worth only +1.2 points. Without the success indicator, the policy could save a trivial skill and call it in Task 2 even when Task 2 fails, collecting reward for empty reuse. The product pays only when a saved skill was used on a path that worked. The bonus is also bounded at 1, the same scale as r₁, so it cannot swamp the task objective. The deeper idea is delayed credit assignment: the action "save this skill" has consequences only in a later episode. SAGE shortens the delay by putting both tasks in one rollout. AgeMem handles it inside one long trajectory. Both are reward shaping in the sense of L9: extra signal added to make a sparse, delayed reward learnable.

### 6. Discussion: what should persist, and who decides?

The closing slide lays out four tensions:

- exact episode ↔ general skill
- flexible guidance ↔ committed execution
- reuse what exists ↔ explore and replace
- grow the memory ↔ update, merge, delete

It poses three questions: what would you store as an episode, a fact, a lesson, a text skill or code, and why? When should an agent delete a skill, or revise it? What is the right balance between agent and human effort in creating and using skills?

**Ownership of memory decisions.** The final table gives a rule of thumb for each decision.

| Decision | Human effort is valuable when… | Agent effort is valuable when… |
| --- | --- | --- |
| Author or induce | The skill or policy is already known | It must be discovered through interaction |
| Verify and admit | Correctness is normative or high-stakes | Outcomes are executable and cheap to test |
| Select and use | Rare exceptions need contextual judgment | Routing repeats and produces feedback |
| Maintain | Accountability requires an owner | Drift is visible in outcomes and repairable |

The practical takeaway: the question is not "human or agent" but which stage of the lifecycle each should own. A compliance checklist should be authored and admitted by a person. A site-navigation macro can be induced, tested and retired by the agent. Next class: planning.

## Slide-by-slide companion

This section walks through all 46 slides in order, describing what each shows (including figures and charts) and why it matters, so you can study with the PDF open beside it.

### Slides 1–6 · Framing: what should persist, and where

**Slide 1 — Memory and Skills.** Title slide: "How agents improve without starting over", Daniel Fried, 11-768 AI Agents, CMU Language Technologies Institute.

**Slide 2 — Shared task structure.** The slide is a two-row diagram. Each row is one web-shopping task drawn as a chain of boxed actions. Task 1, "Add Sony headphones to my wish list", runs goto store → find search box → fill("sony headphones") → click Search, then open Sony result → Add to Wish List. Task 2, "Find the wireless keyboard price range", runs goto store → find search box → fill("wireless keyboards") → click Search, then read result prices → report min–max. A blue bracket labels the first four boxes of both rows "SHARED SEARCH PROCEDURE"; a grey bracket labels the last two "TASK-SPECIFIC FINISH". The caption says "Lots of structure recurs in agent tasks." The only difference inside the shared part is the argument to fill, which is exactly the slot a parameterized skill will later expose.

The bottom band lists "Today's questions": Representation (should the shared structure be text or code?), Induction (how can the agent induce it from experience?) and Lifecycle (when should a skill be retrieved, checked, revised, or forgotten?). These three questions organize the whole lecture. Representation is answered in slides 29–36, induction in slides 22–31, and lifecycle in slides 25 and 37–43. Keep the Sony and keyboard tasks in mind: they return on slides 24 and 43.

**Slide 3 — Methods of updating the agent.** A three-row table with columns Location, Pros and Cons. Context window (last lecture): high fidelity to what happened; but costly, noisy, and it does not decide what matters. External artifacts (this lecture): inspectable, editable, retrievable, portable; but they must be induced, selected and maintained. Model weights (SFT lecture): faster inference and broad behavior change; but slower updates, opaque, and model-specific. The question under the table is "What experience is worth turning into an external artifact?"

Read the table as a spectrum of commitment. The context window commits to nothing: everything stays, so nothing is summarized. Weights commit to everything: knowledge is compressed into parameters you cannot read. External artifacts are the middle ground where a human can still audit what was kept. The price of the middle ground is the whole lifecycle machinery that the rest of the lecture builds.

**Slide 4 — Types of experience.** Three columns. Episode: "a full trace, every observation and action"; useful if the exact product, prices, or sequence will matter again. Fact: "This store shows prices only on the product page."; useful if the fact recurs in future tasks, or can be updated. Skill: "fill the search box → click search → open a result"; useful if later tasks will repeat the same pattern. The columns move from concrete to abstract. An episode is raw and complete but long. A fact is one declarative statement. A skill is procedural: it says how to act. The deciding question in each column is about the future (will this recur?), not the past. That is why storing experience is a prediction problem, and why the lecture later needs judges, retrieval policies and forgetting rules.

**Slide 5 — Memory versus skill.** A Venn diagram. The blue circle, Memory, is "saved from the agent's own interaction", for example "a previous product purchased". The red circle, Skill, is "reusable knowledge about how to act. Code, text, or both", for example "a release checklist a person wrote". The overlap is the induced skill: "a skill the agent induced from its own successful searches". The two axes are independent. Memory is defined by where knowledge comes from (the agent's own experience). Skill is defined by what the knowledge is for (acting). A human-written checklist is a skill that is not memory. A stored purchase record is memory that is not a skill. The lecture spends slides 7–15 on the right-only region, slides 16–20 on the left-only region, and slides 21–43 on the overlap.

**Slide 6 — Skill creation pathways.** A table comparing Skills as instructions with Skills as learning. Author: a person or organization versus the agent. Source: existing expertise, policy, documentation versus its own episodes and outcomes. Strength: known intent and provenance versus works where the skill must be discovered. Main burden: expert time to write and maintain versus judging outcomes, verification, curation. The "main burden" row predicts where each pathway breaks. Authored skills rot when experts stop updating them, as the OpenHands maintenance loop on slide 15 shows. Learned skills fail when the judge is wrong, as slide 40 measures. The closing ownership table (slide 45) is essentially this slide broken down by lifecycle stage.

### Slides 7–15 · Authored skills

**Slide 7 — Authored skills.** Section divider for the first technical part: skills a person writes.

**Slide 8 — What is a skill?** A grey box headed "The same request, typed into every pull-request conversation" holds a plain-text prompt: "Please check this Python code using: Black formatting with 88-char line limit; Ruff linting with our custom rules; Type hints for all public APIs; Google-style docstrings; Pytest for all new functions." Three bullets follow. When you want to do something repeatedly following a fixed spec (adding tests, reviewing pull requests, upgrading dependencies), that is a skill. Here a person wrote it; later in the lecture the agent is asked to notice the repetition and write the skill itself. And a skill is implemented using a collection of files: documentation, scripts and resources that provide guidance and automation. The source is OpenHands (Michelini & Neubig, "How to Create Effective Agent Skills", 2026).

The point of the example is that the prompt is already a skill in disguise. It is fixed, repeated and tied to one kind of task. Retyping it wastes effort and invites drift: one day someone forgets the docstring rule. Turning it into a file makes it versioned, shareable and loadable only when relevant. From an RPA angle, this is the same move as turning a repeated manual checklist into a documented, reusable bot process.

**Slide 9 — Example of an authored skill.** Left, a directory tree: python-review/ containing SKILL.md ("Required: instructions + metadata"), scripts/ ("Optional: executable code"), references/ ("Optional: documentation") and assets/ ("Optional: templates, resources"). Right, the SKILL.md file: YAML front matter between --- lines with name: python-review, a description ("This skill should be used when the user asks to 'review Python code', 'check Python style', 'lint Python', or mentions code quality.") and a triggers list (python review, code review, lint python), then a Markdown body "# Python Code Review / Review Python code using company standards…". Below, a three-row table maps each level to when it enters the context window: level 1 (metadata) always loaded; level 2 (body) when the agent triggers the skill; level 3 (bundled files) when the agent reads the files. The caption defines progressive disclosure: names and descriptions load up front, and the rest is read only when the agent calls for it. Credits: the example is from OpenHands, the table from Anthropic's "Equipping agents for the real world with Agent Skills", and the format from the AgentSkills specification. The cost model is simple: level 1 is paid for every installed skill on every turn, so it must be short; levels 2 and 3 are paid only on use.

**Slide 10 — Progressive Disclosure: Indexing skills.** A system-prompt excerpt, abridged from HermesAgent agent/prompt\_builder.py (MIT licence). It opens "## Skills. Before replying, scan the skills below. If a skill matches or is even partially relevant to your task, you MUST load it with skill\_view(name) and follow its instructions." An \<available\_skills> block groups entries by category: code-quality lists python-review with its full description; workflow lists submit-task ("When the task is complete, take the required steps to submit the solution. DO NOT submit without invoking this skill.") and release-notes. The prompt ends "Only proceed without loading a skill if genuinely none are relevant."

Two design choices stand out. First, the instruction is deliberately aggressive ("even partially relevant", "MUST"), because the usual failure is under-loading: the model answers from its defaults and never opens the skill. Second, the descriptions are written as routing rules, not summaries. submit-task even encodes a hard constraint in its description. The index is therefore a tiny router that lives in the system prompt.

**Slide 11 — Progressive Disclosure: loading skills with tools.** A four-row table, Turn versus What enters the context. Turn 1, System Prompt: the index of skills, names and descriptions only, about 3k tokens in Hermes. Turn 2, skill\_view('python-review'): the SKILL.md body as a tool result, the review steps as text; loaded once; this tool is called invoke\_skill in Assignment 1. Turn 3, TERMINAL python scripts/run\_checks.py src/: the script's output, Black and Ruff findings; the code itself never enters. Turn 4, skill\_view('python-review', 'references/docstring-style.md'): the docstring rules, only when the model calls for them. Footer links: HermesAgent tools/skills\_tool.py, Assignment 1 §1.4 Load skills, Anthropic Agent Skills.

This is the mechanism behind slide 9's table, shown as an actual conversation. Skills need no new model capability: loading is an ordinary tool call, and the content arrives as an ordinary tool result. Turn 3 is the strongest idea on the slide. A script can be hundreds of lines, but only its findings consume tokens. For your Assignment 1 implementation, this means invoke\_skill should return the body text once, and scripts should be run, not read.

**Slide 12 — Measuring improvements from skills.** A three-panel pipeline figure from SkillsBench (arXiv 2602.12670). Phase 1, Benchmark Construction: a skill ecosystem of 234,896 (GitHub icon), 1,773,213 (marketplace cart icon) and 5,891 (enterprise building icon) skills feeds a deduplication funnel yielding 2,014,000 unique skills; 142 contributors submitted 400 tasks, each a folder with task.md, environment/Dockerfile, skills/, oracle/ and verifier/. Phase 2, Quality Filtering: automated checks (Structure, Oracle 100%, AI Detection, Leakage Audit) and human review (Data Validity, Task Realism, Oracle Quality, Skill Quality, Anti-Cheating) leave 87 tasks in 8 domains. Phase 3, Evaluation: a Docker task setup with \[No Skills\], \[With Skills\] and \[3 Trials\]; agent execution in OpenHands, Claude Code, Codex CLI and Gemini CLI; verification by pytest to pass/fail; 18 configurations, 9,396 trajectories, and a "+16.6 pp with Skills" badge. The bullets: 87 real-work tasks across 8 domains; curated task–skill pairs where humans choose the skill bundle; main experiment no skills versus curated skills, 18 model–harness configurations × 87 tasks. The design isolates one variable, the presence of a human-chosen skill, so the measured lift is an upper-bound-style estimate for well-matched skills rather than for skills an agent must find itself.

**Slide 13 — Gains and limits of human-authored skills.** A stacked bar chart, resolution rate 0.0–0.7 on the y-axis, 18 model–harness configurations on the x-axis sorted by with-skill score. Each bar has a dark no-skill segment and a light "skill lift" segment, coloured by provider (Google, OpenAI, Anthropic, DeepSeek, Moonshot, Zhipu, MiniMax, xAI). Reading approximately from the chart: Gemini 3.1 Flash Lite (OH) rises from about 0.16 to 0.20; MiniMax M2.7 about 0.18 to 0.34; GPT-5.4 Mini about 0.30 to 0.41; Grok 4.3 about 0.23 to 0.41; Claude Sonnet 4.6 about 0.33 to 0.47; Claude Opus 4.7 under Claude Code about 0.43 to 0.61; GPT-5.5 (Codex) about 0.46 to 0.66; GPT-5.5 (OH) about 0.51 to 0.67. Gemini 3.5 Flash has one of the smallest lifts (about 0.41 to 0.48), and weaker base models such as DeepSeek V4 Pro and GLM 5.1 gain the most (roughly +0.23 to +0.26). The caption: skills raise the average pass rate from 33.9% to 50.5%.

The bullets add the limits. Focused skills correlate with larger gains: tasks with 1–3 skills improve more than tasks with 4 or more, and shorter SKILL.md groups also show larger gains. Skills still hurt on 13 of 87 tasks, because a skill can displace a better default strategy. The ordering of the chart matters too: the same model (Claude Opus 4.7, or Gemini 3.1 Pro) scores differently under different harnesses, so the harness that loads and presents skills is part of the result.

**Slide 14 — Sources of skill packages.** Three columns. Bundled: ships with the harness as part of its default set. Installed or written: a person writes one for their own work, checks it into the repository under .agents/skills/, or installs it from another repository or a registry. Created by the agent: the agent writes the same package itself; Hermes exposes a skill\_manage tool that can create, patch or delete; OpenHands has a /skill-creator command that drafts one from the workflow the agent just finished; a person can review either before it ships. The footer gives OpenHands' advice: don't write a skill from scratch; create it right after the agent finishes a workflow you want to repeat, then test it a few times. This third column is the bridge to the second half of the lecture. The package format stays the same whether a person or the agent wrote it, so the skill-loading machinery does not care who the author was. Only trust and review differ.

**Slide 15 — Case study: maintaining a code-review skill.** A five-box pipeline labelled MAINTAIN: review skill → log each run → score each run → find recurring failures → patch SKILL.md. The subtitle says OpenHands runs a review skill of the python-review kind on every pull request in its own repos. Three bullets explain the loop. Evaluate the outputs: after each PR merges, a model judge counts how many of the agent's suggestions the humans kept. Have a model analyze failures: it reads the run notes and names what recurs, ignoring repo conventions (\~15%) and approving PRs with a critical flaw (\~10%). Update SKILL.md: the same model drafts the patch, to request changes whenever a critical issue is found and to check a suggestion against the repo before posting it.

The scoring signal is clever because it is free: merged PRs reveal which suggestions humans accepted, with no extra labelling. The two failure modes map onto two different fixes. Ignoring conventions is a missing-context problem, fixed by checking the repo first. Approving flawed PRs is a policy problem, fixed by a hard rule. This slide previews the "maintain" row of the lifecycle on slide 25, applied to a human-authored skill.

### Slides 16–20 · Memories: facts, lessons and episodes

**Slide 16 — Memories: facts, lessons, and episodes.** Section divider. The lecture moves to the left-only region of the slide-5 Venn diagram: knowledge the agent saves from its own interaction, which may or may not be procedural.

**Slide 17 — Managing an external memory.** Two figures from MemGPT (Packer et al., 2023; figures 3 and 2). The top figure is a bracket labelled "LLM Finite Context Window (e.g. 8k tokens)", split into Prompt Tokens and Completion Tokens. Prompt tokens contain three coloured blocks: System Instructions (black; read-only, static; the MemGPT system prompt), Working Context (orange; read-write; written via functions) and FIFO Queue (blue with a small magenta segment; read-write; written via the Queue Manager). Completion tokens are the Output Buffer. Below the window sit Archival Storage (green cylinder; read and written via functions) and Recall Storage (blue cylinder; read via functions, written via the Queue Manager). A Function Executor and a Queue Manager connect them, with arrows showing evicted messages flowing from the queue into recall storage. The bottom-left inset shows the call recall\_storage.search("six flags") returning "Showing 3 of 3 results (page 1/1)": \[01/24/2024\] "lol yeah six flags", \[01/14/2024\] "i love six flags been like 100 times", \[10/12/2023\] "james and I actually first met at six flags". The caption: reads and writes are function calls the agent issues itself.

The operating-system analogy is precise. The context window is RAM, archival and recall storage are disk, and the model itself decides when to page data in and out. The MemGPT paper evaluates this on two domains: analysing documents larger than the context window and multi-session chat. The magenta slice of the FIFO queue is a recursive summary of evicted messages, so the window always holds a compressed trace of what left it. Compare L3's long-context methods, which compress automatically; MemGPT makes memory management an action.

**Slide 18 — Handling memory conflicts.** The Mem0 architecture figure (Chhikara et al., 2025). On the left, a chat between two users feeds the Extraction Phase (purple box, LLM). Its prompt stacks a Summary, the Last m messages and the new message pair; the summary comes from a Summary Generator that fetches summary and past messages from a Database. The phase outputs "New extracted memories". These flow into the Update Phase (green box, LLM), which fetches the "Top 's' similar memories" from the database and makes a Tool Call to one of four coloured operations, ADD, UPDATE, DELETE and NOOP, producing New memories that are written back ("update memories"). Below, four definitions: ADD, nothing similar is stored yet; UPDATE, messages change an existing memory; DELETE, messages negate an existing memory; NOOP, messages are already stored in memory, or irrelevant.

The key design choice is that conflict resolution is a separate LLM decision made against the nearest neighbours, not a blind append. The two hyperparameters are m (recent context for extraction) and s (how many similar memories to compare against). The Mem0 paper reports, on the LOCOMO long-conversation benchmark, a 26% relative improvement in an LLM-as-a-judge metric over OpenAI's memory, 91% lower p95 latency and over 90% token-cost savings compared with feeding the full history. It is the facts column of slide 4, with the "can be updated" clause made operational.

**Slide 19 — Remembering feedback on trajectories.** A four-box flow: attempt → evaluator: predict reward → reflection: generate feedback → retry the same task. The evaluator and reflection boxes are solid; attempt and retry are dashed, marking them as the agent's normal behavior. Three panels follow. Attempt 1: "What was a series of battles … fought on October 28, 1776 near White Plains, New York?", answered Finish\[Battle of White Plains\], marked incorrect in red. Generated feedback (teal): "… the question asked for a series of battles, but I only provided the name of one battle … I will make sure to provide more context, such as the name of the campaign …". Attempt 2: Finish\[The New York and New Jersey campaign\], marked correct. Source: Reflexion (Shinn et al., NeurIPS 2023).

The stored item here is a lesson, the fourth memory type. It is not a fact about the world and not a procedure; it is a diagnosis of a mistake in the agent's own reasoning. Reflexion called this "verbal reinforcement learning": the scalar reward is turned into text that changes behavior without any weight update. Its paper reports 91% pass@1 on HumanEval, above the 80% of GPT-4 at the time. The limitation is scope: the reflection helps retries of the same task, which ReasoningBank (slide 38) generalizes across tasks.

**Slide 20 — Similar-trajectory conditioning.** Left, three bullets. What is stored: whole trajectories, both successes and failures, sometimes rewritten and annotated before storage. Where the pool comes from: collected offline in a training phase, grown while the agent works, and/or hand-written in advance. How it is used: retrieve the runs most similar to the new task using text embeddings, and include them as few-shot examples. Right, the ExpeL figure (Zhao et al., 2024). In the grey training phase a robot attempts Task 1 to Task N, producing red (failed) and green (successful) trajectory icons; experience gathering (A) sends them to a cloud-shaped Experience Pool. From the pool, Insight Extraction (B) runs an LLM (drawn with a thought bubble and scroll) to write insights. In the purple evaluation phase a sunglasses-wearing robot attempts Task 1 to Task M, receiving two arrows: Experience Recall (a retrieved trajectory) and Insight Guidance (the scroll). Footer citations: ExpeL (AAAI 2024), Agent S (Agashe et al., ICLR 2025), Synapse (Zheng et al., ICLR 2024), ICAL (Sarch et al., NeurIPS 2024).

This is retrieval-augmented generation where the corpus is the agent's own past. It is the episode column of slide 4 in action. Notice that ExpeL already combines two memory types: raw episodes and extracted insights, which are lessons. That hybrid anticipates the comparison on slide 39, where storing distilled strategies beats storing trajectories.

### Slides 21–28 · Inducing skills as text

**Slide 21 — Inducing skills.** Section divider. From here on the agent writes its own skills: the overlap region of the slide-5 Venn diagram.

**Slide 22 — Skills as reusable chunks of a task.** Two cards. Left, "Search for a product", with the template query "Show me results for {query}", a reasoning comment "# To find {query}, I will type it into the store's search box and submit." and two actions, fill('element145', {query}) and click('element147'). Right, "Report a price range", with the query "What is the price range for {query}?". Its first block, outlined in dashed red, is a copy of the left card with a reworded comment ("# To get the price range for {query}, I will first search the store for it.") and the same fill and click. An arrow labelled "Reuse →" points to it. A second block, reached by "Add steps ↘", says "# The results list a price on each card. I will read the lowest and the highest." then send\_msg\_to\_user("{low} to {high}"). The caption asks: "How should a skill be represented? We'll compare text vs code."

Three ideas are packed in. Parameterization: {query}, {low} and {high} are the variables that make a trace reusable. Composition: a bigger skill is built from a smaller one plus new steps. Grounding: element145 and element147 are concrete page element ids, so the skill silently assumes the page layout. That assumption is what breaks on slide 34.

**Slide 23 — Skills / program induction in past work.** The Voyager architecture figure (Wang et al., 2023). Left, an Automatic Curriculum drawn as a cycle of Minecraft thumbnails: Mine Wood Log → Make Crafting Table → Combat Zombie → Mine Diamond. Centre, an Iterative Prompting Mechanism shows JavaScript code, async function combatZombie(bot), which finds a stone sword in the inventory, equips it if present and otherwise calls craftStoneSword(bot), then calls craftShield(bot). Arrows show environment feedback and execution errors flowing back, code as actions going to the environment, and a Self-Verification step (magnifying glass) that either refines the program (red cross) or adds a new skill (green tick). Right, a Skill Library: Mine Wood Log, Make Crafting Table, Craft Stone Sword, Make Furnace, Craft Shield, Cook Steak, Combat Zombie, with a Skill Retrieval arrow feeding the prompt. The five bullets place Voyager in a lineage: DreamCoder (compress solved programs into a library), Stitch (fast symbolic compression), LAPS (language guides induction and search) and LILO (an LLM writes programs, Stitch compresses them, the LLM names and documents each).

The common thread is compression. A good library is one that makes the corpus of solutions shorter, because repeated sub-programs become one call. Voyager adds two agent-era elements: skills are verified by execution before admission, and retrieval chooses which skills enter the prompt. Its paper reports 3.3× more unique items and tech-tree milestones up to 15.3× faster than prior methods.

**Slide 24 — Inducing skills online.** A banner, "Evaluation setting": a successful evaluation task updates memory before the next task arrives; evaluate cumulative success rate over all tasks seen so far. Left, a Skill Memory box lists "search for a product", "add a product to the wish list" and "report a price range", with the note "grows across the evaluation stream". Right, "Evaluation tasks arrive sequentially": (1) add a Sony bluetooth headphone to my wish list, (2) find gaming accessories added in the last month, (3) what is the price range for wireless keyboards? (drawn dashed, not yet arrived). Between them, arrows: ① induce after success (from task to memory) and ② apply on a later task (from memory to task).

This protocol is test-time learning with no separate training split. Its metric is cumulative success after t tasks, the running average of successes. The order of tasks therefore matters: an early success on a common sub-task pays off on every later task. It also means that a bad skill admitted early can hurt many later tasks, which is why the admission gate matters so much.

**Slide 25 — The lifecycle of an induced skill.** Three rows of rounded boxes joined by red arrows. LEARN: episode (dashed) → judge → induce → admit → memory (shaded). USE: memory (shaded) → select/retrieve → act → outcomes (dashed). MAINTAIN: outcomes (dashed) → add → repair → retire → memory (shaded). Dashed boxes are data that come from the world; solid boxes are decisions; shaded boxes are the shared memory store. The rows chain into a loop: learning writes memory, use reads it and produces outcomes, and maintenance turns outcomes back into memory edits. Later slides carry a small breadcrumb (for example "LEARN judge → induce → admit" with one box highlighted) to say which stage they address. Use this slide as the index for the rest of the lecture.

**Slide 26 — Inducing textual representations of skills.** Breadcrumb: LEARN with induce highlighted. A photo credits Zora Wang (first author of AWM and ASI). Left, an episode panel: the NL query "Tell me the number of reviews that our store received so far that mention the term 'satisfied'", then five actions with coloured backgrounds: click("Marketing") and click("All Reviews") in purple, fill(757, "satisfied") and click("Search") in orange, send\_msg\_to\_user("2") in grey. A pink "Memory" tag sits beside the actions, showing the agent already had memory in context. Below, a Judge box asks "Final state predicted to be correct?" with YES ▸ continuing and NO ▾ pass. Centre, "Few-Shot Prompting → LM → Induce". Right, the induced workflow: "Task: Search for reviews matching '{term}'", "Actions:", a comment "# To find reviews for {term}, I will search for '{term}' in the reviews page", then click("All reviews"), fill(757, "{term}"), click("Search"). An arrow sends it to a pink Memory oval.

Notice what the inducer dropped. click("Marketing") is gone, perhaps judged task-specific navigation, and send\_msg\_to\_user("2") is gone because the answer is instance-specific. The literal "satisfied" became {term}, but the element id 757 stayed concrete. The colours hint at the two sub-routines that ASI will later split into separate functions (slide 30).

**Slide 27 — An induction prompt.** Breadcrumb: LEARN, induce. A monospace box quotes the AWM induction prompt (Appendix A.1): "Given a list of web navigation tasks, your task is to extract the common workflows. Each given task contains a natural language instruction, and a series of actions to solve the task. You need to find the repetitive subset of actions across multiple tasks, and extract each of them out as a workflow. Each workflow should be a commonly reused sub-routine of the tasks. Do not generate similar or overlapping workflows. Each workflow should have at least two steps. Represent the non-fixed elements (input text, button strings) with descriptive variable names as shown in the example." The prompt is the whole induction algorithm: there is no training, only instructions. Its constraints are a hand-written version of what DreamCoder and Stitch optimize formally: find shared sub-sequences (compression), avoid duplicates (library size), require at least two steps (a one-step "skill" compresses nothing) and abstract the variable parts (generalization).

**Slide 28 — Cross-task memory compounding.** A line chart from AWM on WebArena's map site. The x-axis is Number of examples; the y-axis is Accumulative success rate (%) from 0 to 40. The dark AWM line starts at 0, jumps steeply through labelled points where new workflows are learned (Find a place by its name, Find cafe near a place, Get the coordinates of a place, Display the route from place A to B) to about 30% within the first handful of examples, dips, rises to about 36% at "Get driving time from A to B", dips near "Get the zip code of a place", and then oscillates upward to about 40%. Later annotations mark composite tasks: "Decide if can drive from A to B in a given time" and "Find a Hilton hotel near this location, then show me the shortest walking path to a nearby supermarket…". The light-blue baseline starts later, climbs to about 20–22% and drifts down to about 17–18%. A double-headed arrow at the right edge is annotated "Gap widens to 22.5 after 40 examples".

The sawtooth shape is typical of a cumulative average: each failure pulls it down a little, each success pushes it up, and the swings shrink as t grows. Compounding means later, harder tasks succeed because they reuse earlier workflows: driving-time plus route gives "can I drive there in time". The AWM paper reports 24.6% and 51.1% relative success-rate gains over baselines on Mind2Web and WebArena.

### Slides 29–36 · Skills as code

**Slide 29 — Skills as text vs skills as code.** Two columns. Left, "Text + examples": a workflow titled "Task: Search for gaming accessories within a date range", with an action trajectory click(1274) # Navigate to the Video Games category, fill(473, {search\_terms}) # Enter search terms including product name and year, click(478) # Execute the search. Its pros and cons: + Flexible, a hint the agent interprets and adapts to the page in front of it; − Manual, the agent still issues every low-level action itself, copying and modifying. Right, "Code": a Python function

```python
def search_product(search_box_id: str, query: str):
    """Search for a product using the search box.
    Args:
        search_box_id: ID of the search input field
        query: Search query string to enter
    Returns:
        None
    Examples:
        search_product('595', 'sony bluetooth headphones')
    """
    click(search_box_id)
    fill(search_box_id, query)
    keyboard_press('Enter')
```

A teal call, search\_product('595', 'Macbook'), is labelled "Usable as a tool". Its pros and cons: + Testable, run it before storing it; + Hierarchical, skills call skills; + Efficient, one call replaces many model steps; − Rigid, does exactly what it says, even on a page that has changed. Citations: workflows from AWM (ICLR 2025), skills from ASI (Wang et al., COLM 2025).

The docstring is not decoration. It becomes the tool description the model sees, so it plays the same routing role as the SKILL.md description on slide 9. The Examples line doubles as a test case. The single most important difference is who executes: with text the model re-generates each action; with code the runtime does.

**Slide 30 — Inducing code skills.** Breadcrumb: LEARN with induce and admit highlighted; photo credit Zora Wang. The left half repeats slide 26's episode (the "satisfied" reviews query and its five actions) feeding Few-Shot Prompting → LM → Induce. The right half, labelled skills, shows two induced Python functions. search\_reviews(search\_box\_id, search\_button\_id, search\_term), docstring "Search for reviews with a specific term. Args: search\_box\_id: … Examples: search\_reviews('757', '704', 'great')", body fill(search\_box\_id, search\_term) and click(search\_button\_id). open\_marketing\_reviews(), docstring "Navigate to All Reviews under Marketing. Examples: open\_marketing\_reviews()", body click("Marketing") and click("All Reviews"). Below, a test panel re-solves the task with open\_marketing\_reviews() (purple), search\_reviews('757', '704', "satisfied") (orange) and send\_msg\_to\_user("2") (struck through). The Judge asks "Final state predicted to be correct? Skills used?" and on YES the skills go to Memory. Footer: after ASI (Wang et al., COLM 2025); lineage, Voyager grew a memory of code skills in Minecraft.

Compare with slide 26: the purple and orange action groups each became a function, and the search button id 704 became a parameter. The struck-through send\_msg\_to\_user shows the test checks the path to the answer, not the instance-specific reply. The extra judge question, "Skills used?", blocks a subtle failure: a rewritten solution that succeeds by ignoring the new skill proves nothing about the skill.

**Slide 31 — Code skills allow testing.** Breadcrumb: LEARN with admit highlighted. The top box, "Code skill admission", gives pseudocode:

```python
candidates = propose_skill(task)
episode = practice(candidates, task)

if reward_model(episode.actions, episode.screenshots, task):
    memory.add(candidate)
else:
    candidate = revise(candidate, task)
```

The bottom box, "Example of linting and testing a code skill", shows a call identify\_pill(page, imprint="M366", color="White"), a yellow WARNING "parameter 'color' is defined but never used in the function body", and a green diff adding an if color: branch that calls page.get\_by\_role("group", name="Color and shape (optional)").get\_by\_role("combobox", name="Color (optional)").select\_option(color). Source: after SkillWeaver (Zheng et al., 2025), Figure 1.

The reward model here is multimodal: it reads the action list and screenshots. The linter example is the cheapest possible test, a static check that catches a skill which silently ignores an argument. A text skill cannot be linted, so this whole class of error would go unnoticed. The SkillWeaver paper reports 31.8% and 39.8% relative success-rate gains on WebArena and real-world websites, and up to 54.3% on WebArena when weaker agents use APIs synthesized by stronger agents: code skills are transferable between models.

**Slide 32 — Task compression with code skills.** ASI Figure 5 on the shopping site. The request: "I recently moved. Can you change my billing address to '231 Willow Way, Suite 100, Chicago, IL, 60601'? Then, update my shipping address to: 987 Sycamore Circle, Philadelphia, PA, 19102." Top row, no memory (50 steps, cap): from the homepage the agent clicks My Account, My Address, change billing, then detours into Add new address and Address Book (boxed red as "redundant steps"); it then fills update street line 1, update street line 2, update city name, update state name, update zip code and save changes one by one, with further red "redundant steps" boxes, and ends at "terminate max steps". Bottom row, code skills (4 steps): start on homepage, navigate\_to\_address\_settings('227', 'change billing address') ("Reach in one step"), update\_address\_details('1724', …, '231 Willow Way', Suite 100', Chicago, 'Illinois', '60601') ("Update address in one step"), and update\_address\_details('1724', …, Sycamore Circle', 'Philadelphia', 'Pennsylvania', '19102') ("Update address in one step").

This is the clearest picture of why code skills cut steps. The no-memory agent does not fail from ignorance; it fails from length. Every extra step is another chance to click the wrong thing, and the step cap turns slowness into failure. Note that update\_address\_details is reused twice within one task, for billing and then shipping.

**Slide 33 — Code skills raise success and cut steps.** Two bar charts, colour-coded grey (no memory), blue (text skills) and red (code skills). Left, "checkpoints reached ↑" on a 0–100% axis: 41.3, 59.5, 80.2. Right, "steps per task ↓" on a 0–25 axis: 24.5, 20.6, 15.0. Bullets: comparison between text and code skills on web tasks with repeated structure; code skills generally improve success (checkpoints reached) over text skills; they also use fewer steps by the agent. Source: ASI Table 2, averaged over five WebArena sites.

The relative numbers make the story sharper. Text skills cut steps by only 16% (24.5 to 20.6); code skills cut them by 39% (24.5 to 15.0). On success, code skills add 20.7 points over text skills and 38.9 over no memory. "Checkpoints reached" is a partial-credit measure: it rewards progress through a task's intermediate milestones, not only full completion. The ASI abstract reports the headline differently, as a 23.5% and 11.3% success-rate advantage over the static baseline and the text-skill agent, and a 10.7–15.3% step reduction, so check which metric a number refers to before comparing.

**Slide 34 — How general are skills?** ASI Figure 4, skills induced on WebArena and tested on target.com. The task bubble: "Show me the least expensive shoe storage." A screenshot sequence runs: start on homepage (Target's spring-sale banner) → search\_product('1724', 'shoe storage'), a results page stamped in green "correctly reuse the learned skill" → a Sort panel that slides in from the right with radio options Relevance, Featured, Price: low to high, Price: high to low, Average ratings, Best seller, Newest, boxed in orange as "opens a new page instead". Below, the induced skill

```python
def sort_listings(sort_dropdown_id: str, sort_option: str):
    """Sort product listings using the sort dropdown.
    Args:
        sort_dropdown_id: ID of the sort dropdown element
        sort_option: Sorting option (e.g., "Price", "Newest")
    Examples:
        sort_listings('1235', 'Price')
    """
    click(sort_dropdown_id)
    select_option(sort_dropdown_id, sort_option)
```

with "sort dropdown element" boxed in red and annotated "only applies to dropdown menu", linked to a WebArena "Sort By Relevance" dropdown. The bullets: induce skills on tasks on one website, evaluate on another; sort\_listings clicks a dropdown, while Target's sort opens a sidebar. The lesson is that the rigid assumption was written into the docstring all along. Generalization fails at the level of UI widgets, not task intent: "sort by price" is universal, "select from a dropdown" is not.

**Slide 35 — PolySkill: one interface, many implementations.** Breadcrumb: MAINTAIN with repair highlighted, retire greyed. A two-column code table (PolySkill, Yu et al., ICLR 2026, Table 1). Left, the abstract class: a comment "The Abstract Domain Class, defining a 'schema' for shopping sites", class AbstractShoppingSite with abstract search\_product(self, query), add\_to\_cart(self, item\_id, quantity) and checkout(self), then a "Compositional Skills" section defining find\_and\_add\_to\_cart(self, query, item\_id), which calls self.search\_product(query) then self.add\_to\_cart(item\_id), and purchase\_item(self, query, item\_id), which calls self.find\_and\_add\_to\_cart(query, item\_id) then self.checkout(). Right, two implementations. AmazonWebsite: search\_product clicks the search bar, fills it and presses Enter; add\_to\_cart clicks the add-to-cart button; checkout is noted as a composite action that first views the cart, then clicks checkout. TargetWebsite: search\_product fills the search bar and clicks a search button; add\_to\_cart clicks an add button, fills a quantity box and clicks add-to-cart; checkout just clicks the checkout button. Caption: compositions are written once against the abstract methods; each website implements only the primitive browser actions.

This is the object-oriented pattern called polymorphism, applied to skills. Repair after a site change touches only one small primitive, while the composite logic is reused unchanged. The PolySkill abstract reports 1.7× more skill reuse on seen websites, success gains of up to 9.4% on Mind2Web and 13.9% on unseen websites, and over 20% fewer steps.

**Slide 36 — Consequences of skill representation.** A three-row table. Retrieved episode: preserves concrete behavior; long, hard to transfer. Text skill: provides flexible guidance; doesn't improve efficiency. Code skill: executable, composable, efficient; can be brittle. The closing question: "How much of the behavior is left to the model, and how much is fixed in the artifact?" Read the rows as a dial. At one end the model re-derives everything from an example; at the other the artifact dictates every action. Moving the dial toward code trades adaptability for speed and testability. PolySkill (slide 35) is an attempt to get both: fix the composition in code and leave only the small, site-specific primitives to change.

### Slides 37–46 · The skill lifecycle and the closing discussion

**Slide 37 — The skill lifecycle.** Section divider. The remaining technical slides walk the three rows of slide 25 stage by stage, asking what goes wrong at each.

**Slide 38 — Learning from failures.** Breadcrumb: LEARN with judge and induce highlighted. Left, "Episode": the task "Provide me with the complete names of Bluetooth headphones from Sony, and also share the price range for the available models." and the trace search "Bluetooth headphones Sony" → 5,578 results from every department of the store, 12 per page → next page → next page → … → step limit, nothing sent to the user. "Failure." in red. Right, "Induced strategy", three titled items. "Search query optimization": a vague query buried the answer under thousands of loosely matched results; tighten the query before browsing. "Adjust number of items displayed per page": twelve per page makes every "next" cost a step for little coverage. "Use filters available": the sidebar's category filters shrink the list without paging. Source: ReasoningBank (Ouyang et al., ICLR 2026), appendix case study.

The arithmetic of the failure explains the lessons. At 12 results per page, 5,578 results is about 465 pages, far beyond any step budget. Each strategy attacks one factor: shrink the result count (better query, filters) or raise the page size. The judge's role changes here too. It no longer only gates admission; it labels the episode as a failure so the inducer writes "what to avoid" lessons instead of a procedure.

**Slide 39 — Failures help some memory types and hurt others.** A grouped bar chart, success rate on a 35–50 axis, with a dashed line "No mem: 39.0". For each of three methods, a green "Success only" bar and a pink "w/ Failure" bar: Synapse 40.6 and 41.7; AWM 44.4 and 42.2; ReasoningBank 46.5 and 49.7. Bullets: failures help substantially when inducing strategies (ReasoningBank); failures are less helpful with trajectories (Synapse) or workflows (AWM), perhaps because they are demonstrations of what not to do. Source: ReasoningBank on WebArena shopping with Gemini-2.5-flash.

Reading the deltas: adding failures gives Synapse +1.1, AWM −2.2 and ReasoningBank +3.2. Only ReasoningBank's representation can express negative knowledge as positive advice. A workflow is a recipe; a failed recipe in context is still a recipe the model may follow. Also note that even the success-only variants order the same way (strategies > workflows > trajectories), so abstraction level matters independently of failures.

**Slide 40 — How much does judge accuracy matter?** A bar chart, y-axis success rate 47–53, x-axis "Simulated LLM-as-a-Judge Accuracy" at 100, 90, 80, 70, 60, 50. Values: 52.4, 49.7, 48.7, 49.7, 47.6, 47.6. A dotted red box groups the 90, 80 and 70 bars. Setup: the real judge is imperfect, so the authors swap in simulated judges that give the true label flipped with a fixed probability, from oracle (100) to coin flip (50). Result: performance depends on judge accuracy, but improves for a wide range of judge qualities.

Three readings. The drop from a perfect to a 90% judge (52.4 to 49.7) is larger than the drop from 90% to 70%, which is flat. At 50% the judge carries no information, yet 47.6 is still 8.6 points above the 39.0 no-memory baseline of slide 39. That residual gain must come from something other than correct labels: the act of reflecting on any trajectory yields some useful strategies. Beware the axis: it starts at 47, so the bars look more different than they are.

**Slide 41 — The cost of over-retrieval.** Breadcrumb: USE with retrieve highlighted. A line chart, success rate (38–50) against number of retrieved experiences (0–4): 39 at 0, a peak of 49.7 at 1, then 46, 45.5 and 44.4. Bullets: retrieving additional experiences can cause performance to degrade; the example is from ReasoningBank; SkillsBench found the same for human-curated skills; some experiences may be irrelevant (limitations of the memory); and the agent may be limited in what it can condition on. Source: ReasoningBank, WebArena shopping.

The curve is sharply asymmetric. Going from 0 to 1 memory gains 10.7 points; going from 1 to 4 loses 5.3. So the first retrieval is the valuable one and extra ones are not neutral padding. This contradicts the document-RAG habit of retrieving top-5 or top-10 for recall. For agent memory, a retrieved item is an instruction, and conflicting instructions are worse than none.

**Slide 42 — Memory consolidation.** Breadcrumb: MAINTAIN with repair and retire highlighted. Three step plots from TroVE (Wang et al., ICML 2024), each showing Size of Function Library against Number of Examples, with a purple "w/o forgetting" line and a yellow "w/ forgetting" line. MATH, Algebra (0–about 850 examples): without forgetting the library climbs to about 38 functions; with forgetting it levels near 10; "74% size reduction". HiTab (0–about 1,550 examples): about 35 versus about 6; "83% size reduction". GQA (0–1,000 examples): about 60 versus about 6; "90% size reduction". The rule: TroVE drops any function used fewer than ½·log₁₀(n) times, where n is the number of examples seen so far. A second footer link: "Not All Skills Help", a skill that helps one task type hurts another.

The yellow lines are nearly flat after the first few hundred examples: a small core of functions does almost all the work. The log threshold is gentle on purpose, so a young function gets time to prove itself. The TroVE abstract reports 79–98% smaller toolboxes across 11 datasets, and 31% faster, 13% more accurate human verification of solutions, which shows that library size also affects human auditability.

**Slide 43 — Training the skill inducer.** A diagram of two linked tasks. Task 1, "Add Sony headphones to my wish list": write + run search skill, task succeeds. A SAVE arrow puts search(query) into a Shared Memory box stamped in red "value unknown until reuse". A RETRIEVE arrow leads to Task 2, "Find the wireless keyboard price range": call search(query), task succeeds. The explanatory text: Task 1's reward says whether the task succeeded, not whether saving part of the solution was worthwhile, which only a later task can show; so put the later task inside the training example, as two related tasks in one rollout (SAGE) or one long trajectory (AgeMem). A pink band gives the Task 1 reward r₁ + 1\[both succeed\] · 1\[task 2 reused its skill\]. Three horizontal bars, labelled Scenario completion on AppWorld test-normal: Outcome only 55.4, Both tasks succeed 56.6, Successful skill reuse 60.7 (red). Sources: SAGE (Wang et al., ACL 2026; AppWorld, Qwen2.5-32B) and AgeMem (Yu et al., ACL 2026).

The middle bar is the control that makes the result convincing. Rewarding joint success alone adds only 1.2 points; the extra 4.1 points come from requiring actual reuse. This is the first slide where the skill inducer itself is trained, so memory writes become actions with learned value, exactly the credit-assignment theme of L9 and L11.

**Slide 44 — Discussion: what should persist?** Four tension pairs, each drawn with a red double arrow: exact episode ↔ general skill; flexible guidance ↔ committed execution; reuse what exists ↔ explore and replace; grow the memory ↔ update, merge, delete. Three numbered questions: (1) what would you store as an episode, a fact, a lesson, a text skill, or code, and why? (2) when should an agent delete a skill? revise it? (3) what's the right balance between agent and human effort in creating and using skills? Each pair maps to part of the lecture. The first is the granularity choice of slide 4. The second is the representation dial of slide 36. The third is an exploration–exploitation trade-off: always reusing skills can lock in a suboptimal procedure, the SkillsBench "displaces a better default" effect. The fourth is maintenance, from Mem0's UPDATE/DELETE to TroVE's forgetting.

**Slide 45 — Ownership of memory decisions.** A four-row table with a dark header: Decision; Human effort is valuable when…; Agent effort is valuable when…. Author or induce: the skill or policy is already known; it must be discovered through interaction. Verify and admit: correctness is normative or high-stakes; outcomes are executable and cheap to test. Select and use: rare exceptions need contextual judgment; routing repeats and produces feedback. Maintain: accountability requires an owner; drift is visible in outcomes and repairable. Each row is one lifecycle stage from slide 25, and the answer is conditional, not a fixed division of labour. A useful test for any row: can the agent observe a reliable signal of success at that stage? If yes (tests, merged PRs, task completion), the agent can own it. If the signal is a norm, a law or a rare exception, a person should.

**Slide 46 — Questions?** Closing slide with the course's robot-dog mascot. Next class: Planning.

## Going deeper

The ideas in this lecture have long roots in cognitive science, reinforcement learning and software engineering; knowing them makes the current papers easier to place.

### Memory types from cognitive science

The lecture's episode / fact / skill split mirrors a classic taxonomy from psychology. Endel Tulving (1972) separated **episodic memory** (specific experiences, with time and place) from **semantic memory** (general facts). Both are *declarative*: you can state them. **Procedural memory** is knowing how, such as riding a bike; it is exercised rather than recalled. The CoALA framework (Sumers, Yao, Narasimhan and Griffiths, 2023) maps this onto language agents: a working memory (the context window) plus long-term episodic, semantic and procedural memories, where procedural memory includes both the LLM's weights and the agent's code. Seen this way, a SKILL.md or an induced Python function is explicit procedural memory that lives outside the weights.

Cognitive architectures also anticipated skill induction. Soar's **chunking** and ACT-R's **production compilation** both turn a multi-step reasoning trace into a single rule that fires directly next time. That is essentially what ASI does when it compresses a click sequence into `update_address_details(...)`.

### Skills as temporally extended actions

In reinforcement learning, the **options framework** (Sutton, Precup and Singh, 1999) formalizes a skill as an option: an initiation condition (when it may start), an internal policy, and a termination condition. A code skill is an option whose policy is a program, and the SKILL.md description plays the role of the initiation condition. The options literature also explains why skills cut steps: they let the agent plan at a coarser time scale, so fewer high-level decisions are needed per task. Hierarchical RL has studied skill discovery for decades; the LLM-era twist is that skills are readable and editable text or code instead of opaque sub-policies.

### Memory systems for chat agents

The lecture focuses on task memory for web and coding agents. A parallel line targets conversational agents. **Generative Agents** (Park et al., 2023) keeps a "memory stream" of observations and scores each for retrieval by recency, importance and relevance. It also periodically writes higher-level **reflections**, an early form of consolidation. MemGPT evolved into the open-source Letta framework. Commercial assistants now ship persistent user memory as a product feature. These systems face the same lifecycle questions as skills: what to admit, how to resolve conflicts (Mem0's ADD/UPDATE/DELETE/NOOP), and when to forget.

### Skills versus tools versus MCP

It helps to separate three layers that are often confused:

- **Tools** (L2) are callable functions with a schema; the model chooses arguments.
- **MCP servers** (the Model Context Protocol) are a standard way to expose tools and resources from external systems to any compatible agent.
- **Skills** are packaged know-how: instructions plus optional scripts and references, loaded on demand through progressive disclosure.

A skill often tells the agent *how to use* tools well. A code skill blurs the line, because it becomes a new tool once admitted. A practical heuristic: if the knowledge is "what to call", it is a tool; if it is "in what order, with what checks, following which conventions", it is a skill.

### Practical engineering advice

1. **Write descriptions as trigger conditions.** The description is the only part always in context, so it decides routing. State when to use the skill ("use when the user asks to…"), not what it contains.
2. **Keep skills focused and short.** SkillsBench's larger gains for 1–3 skills and shorter SKILL.md files point the same way as the over-retrieval curve. Split a large skill into a short core plus reference files.
3. **Put determinism in scripts.** Anything that must be exact (linting, formatting, schema validation, file conversion) belongs in `scripts/`, where its output, not its source, enters the context.
4. **Version skills like code.** Keep them in the repository (for example under `.agents/skills/`), review changes in pull requests, and keep an evaluation set of tasks to rerun after each edit. The OpenHands maintenance loop is a model for this.
5. **Log usage.** Usage counts make TroVE-style retirement possible, and outcome logs make repair possible. Without logs, the library only grows.
6. **Gate admission on a test, not just a judge.** Where outcomes are executable, re-run the task with the new skill (ASI) and lint it (SkillWeaver) before storing it.

### Security and governance

Skills and memories are instructions the agent will follow later, so they are an attack surface. A skill installed from a public registry can carry malicious scripts or prompt-injection text, which is a software supply-chain problem. Memory can be **poisoned**: if an agent writes memories from web pages or user messages, an attacker can plant a "fact" or "lesson" that steers future behavior. Mitigations include human review before admission for high-stakes skills, provenance metadata on every memory, sandboxed script execution, and treating retrieved memory as data, not as authoritative instruction. Personal memory also raises privacy duties: users should be able to inspect, correct and delete what an agent remembers about them.

### Open problems

- **Credit assignment for memory writes.** SAGE and AgeMem are early answers. Most deployed systems still decide what to save with heuristics or a prompted judge.
- **Retrieving by usefulness, not similarity.** Embedding similarity of task descriptions is a weak proxy for "this memory will help". Learned retrievers or routing policies trained on outcomes are an active area.
- **Robustness to drift.** Websites, APIs and codebases change. PolySkill's interface/implementation split is one design answer; automatic detection that a skill has started failing, followed by repair, is largely open.
- **Transfer across models.** An external artifact is portable in principle, but a skill written for one model's habits may help another model less. How model-specific skills are is not well measured.
- **When to prefer weights.** At some point a frequently used skill might be better distilled into the model via SFT or RL (L8–L11). The trade-off between keeping knowledge external and internalizing it is not settled.

## Worked example

This self-contained sketch implements the full skill lifecycle (learn with a test, use with top-1 retrieval, maintain with TroVE-style forgetting) on a toy web store, replaying the lecture's Sony-headphones-then-keyboard-price-range story. `call_llm(messages) -> str` is a **stub** that returns canned skill source so the script runs; replace it with a real model client. The script runs as-is on Python 3.10+.

```python
import math
from dataclasses import dataclass

# --- A toy web store: the "environment" an agent acts in -------------------
class ToyStore:
    def __init__(self):
        self.log, self.box = [], ""
        self.catalog = {"wireless keyboard": [29.0, 45.5, 89.0],
                        "sony headphones": [59.0, 120.0, 348.0]}
    def fill(self, elem, text):  self.log.append(("fill", elem, text)); self.box = text
    def click(self, elem):       self.log.append(("click", elem))
    def results(self):           return self.catalog.get(self.box, [])

# --- Stubbed model call (NOT a real API): returns canned skill source ------
def call_llm(messages) -> str:
    """Stand-in for an LLM that induces a code skill from an episode."""
    return (
        "def search_product(env, query):\n"
        "    '''Search the store. Use when a task needs product results.'''\n"
        "    env.fill('search-box', query)\n"
        "    env.click('search-btn')\n"
        "    return env.results()\n"
    )

@dataclass
class Skill:
    name: str
    description: str
    fn: object
    uses: int = 0

class SkillLibrary:
    def __init__(self):
        self.skills: dict[str, Skill] = {}
        self.n_seen = 0                      # tasks seen so far (TroVE's n)

    # LEARN: judge -> induce -> admit (with a test, as in ASI/SkillWeaver)
    def learn(self, task, episode, succeeded, test_query):
        if not succeeded:                    # 1. judge: only induce from wins
            return None
        src = call_llm([{"role": "user",
                         "content": f"Task: {task}\nActions: {episode}\n"
                                    "Extract a reusable function."}])
        ns = {}
        exec(src, ns)                        # 2. induce (sandbox this in practice!)
        fn = next(v for k, v in ns.items() if callable(v) and not k.startswith("__"))
        if not fn(ToyStore(), test_query):   # 3. admit only if a re-run works
            return None
        skill = Skill(fn.__name__, fn.__doc__ or "", fn)
        self.skills[skill.name] = skill
        return skill

    # USE: retrieve at most k skills (over-retrieval hurts; k=1 was best)
    def retrieve(self, task, k=1):
        words = set(task.lower().split())
        overlap = lambda s: len(words & set(s.description.lower().split()))
        scored = sorted(self.skills.values(), key=overlap, reverse=True)
        return [s for s in scored[:k] if overlap(s) > 0]   # none if irrelevant

    # MAINTAIN: TroVE-style forgetting, drop f if uses(f) < 0.5 * log10(n)
    def consolidate(self):
        threshold = 0.5 * math.log10(max(self.n_seen, 1))
        dropped = [n for n, s in self.skills.items() if s.uses < threshold]
        for n in dropped:
            del self.skills[n]
        return dropped

def solve_price_range(lib, query):
    lib.n_seen += 1
    env = ToyStore()
    skills = lib.retrieve(f"find product results for {query}")
    if skills:                               # one tool call replaces two steps
        prices = skills[0].fn(env, query)
        skills[0].uses += 1
    else:                                    # no memory: low-level actions
        env.fill("search-box", query); env.click("search-btn")
        prices = env.results()
    return f"{min(prices)} to {max(prices)}", len(env.log)

if __name__ == "__main__":
    lib = SkillLibrary()
    # Task 1 solved from scratch; its episode is turned into a skill.
    ep = [("fill", "search-box", "sony headphones"), ("click", "search-btn")]
    print("admitted:", lib.learn("Add Sony headphones to wish list", ep,
                                 succeeded=True, test_query="sony headphones"))
    # Task 2 reuses the skill.
    print("task 2:", solve_price_range(lib, "wireless keyboard"))
    lib.n_seen = 10_000                      # pretend much later: threshold = 2
    print("retired:", lib.consolidate())
```

Running it prints the admitted `search_product` skill, then `task 2: ('29.0 to 89.0', 2)`, then `retired: ['search_product']`.

**What to notice.**

- **Admission is gated twice**: the judge (`succeeded`) filters episodes, and a re-run on a fresh environment tests the induced code before it enters memory. Text skills cannot get the second gate.
- **The saving is in model steps, not environment actions.** The store still sees a fill and a click (log length 2), but the agent made one decision (call `search_product`) instead of two. That is the mechanism behind ASI's drop from 24.5 to 15.0 steps per task.
- **Retrieval returns at most one skill and nothing when irrelevant**, following ReasoningBank's over-retrieval curve. Real systems replace the word-overlap score with embeddings or an LLM router.
- **Forgetting depends on usage logs.** With n = 10,000 the threshold is 0.5 · log10(10,000) = 2, so a skill used once is retired. Without the `uses` counter there would be no basis for retirement.
- **`exec` on model output is dangerous.** In production, run induced skills in a sandbox and review them, which is the "verify and admit" ownership question from the last slide.

## More worked examples

Two more examples. The first is a runnable program for fact memory with conflict handling (slide 18). The second is a design walkthrough that applies the whole lecture to an RPA-style agent.

### Example A · A Mem0-style fact memory with ADD/UPDATE/DELETE/NOOP

This program implements Mem0's update phase on a stream of user facts. For each candidate fact it retrieves the top-s most similar stored facts, asks a decision function for one of the four operations, and applies it. It then compares retrieval against an append-only store. call\_llm(messages) -> str is a **stub**: it applies simple hand-written rules and returns JSON, so the script runs offline; in practice a real model makes this decision. The "embedding" is a toy bag-of-words vector with crude stemming. Standard library only; Python 3.9+.

```python
"""Mem0-style fact memory: extract -> compare with top-s neighbours -> ADD/UPDATE/DELETE/NOOP.

call_llm(messages) -> str is a STUB: it applies simple hand-written rules and returns
JSON, so the script runs offline. Replace it with a real model client in practice.
"""
import json
import math
import re
from collections import Counter

STOP = {"i", "my", "a", "an", "the", "to", "in", "am", "is", "im", "now", "and", "of", "at", "user"}
NEGATIONS = ("no longer", "not ", "don't", "stopped", "quit")


def embed(text):
    """Toy bag-of-words 'embedding' (real systems use a neural encoder)."""
    words = [w for w in re.findall(r"[a-z']+", text.lower()) if w not in STOP]
    return Counter(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words)  # crude stemming


def cosine(a, b):
    dot = sum(a[w] * b[w] for w in a)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def call_llm(messages):
    """STUB standing in for the update-phase LLM. Returns a JSON tool call."""
    payload = json.loads(messages[-1]["content"])
    new, neighbours = payload["candidate"], payload["neighbours"]
    if not neighbours:
        return json.dumps({"op": "ADD"})
    best = neighbours[0]
    if any(n in new.lower() for n in NEGATIONS):
        return json.dumps({"op": "DELETE", "id": best["id"]})
    if new.lower() == best["text"].lower():
        return json.dumps({"op": "NOOP"})
    if best["score"] >= 0.3:  # same topic, new value -> UPDATE
        return json.dumps({"op": "UPDATE", "id": best["id"], "text": new})
    return json.dumps({"op": "ADD"})


class FactMemory:
    def __init__(self, top_s=3, min_score=0.2):
        self.facts, self.next_id = {}, 1
        self.top_s, self.min_score = top_s, min_score
        self.log = []

    def neighbours(self, text):
        q = embed(text)
        scored = [(cosine(q, embed(t)), i, t) for i, t in self.facts.items()]
        scored = [s for s in sorted(scored, reverse=True) if s[0] >= self.min_score]
        return [{"id": i, "text": t, "score": round(s, 2)} for s, i, t in scored[: self.top_s]]

    def write(self, candidate):
        nbrs = self.neighbours(candidate)
        msg = {"candidate": candidate, "neighbours": nbrs}
        decision = json.loads(call_llm([{"role": "user", "content": json.dumps(msg)}]))
        op = decision["op"]
        if op == "ADD":
            self.facts[self.next_id] = candidate
            self.next_id += 1
        elif op == "UPDATE":
            self.facts[decision["id"]] = decision["text"]
        elif op == "DELETE":
            del self.facts[decision["id"]]
        self.log.append((op, candidate))
        return op

    def retrieve(self, query, k=1):
        return [n["text"] for n in self.neighbours(query)[:k]]


def naive_append(stream):
    return list(stream)


if __name__ == "__main__":
    stream = [
        "User lives in Pittsburgh",
        "User prefers aisle seats",
        "User works as an RPA developer",
        "User prefers aisle seats",          # duplicate -> NOOP
        "User lives in Boston",              # changed value -> UPDATE
        "User no longer prefers aisle seats",  # negation -> DELETE
        "User likes Python",
    ]
    mem = FactMemory()
    for fact in stream:
        op = mem.write(fact)
        print(f"{op:<7} <- {fact}")
    print("\nMem0-style store:", list(mem.facts.values()))
    naive = naive_append(stream)
    print("Append-only store size:", len(naive), "vs managed:", len(mem.facts))

    q = "Where does the user live?"
    print(f"\nQuery: {q}")
    print("  managed top-1 :", mem.retrieve(q, k=1))
    # Append-only retrieval: rank the raw stream the same way
    qe = embed(q)
    ranked = sorted(naive, key=lambda t: cosine(qe, embed(t)), reverse=True)
    print("  append top-2  :", ranked[:2], "<- stale and current facts tie")
```

Output from running it:

```text
ADD     <- User lives in Pittsburgh
ADD     <- User prefers aisle seats
ADD     <- User works as an RPA developer
NOOP    <- User prefers aisle seats
UPDATE  <- User lives in Boston
DELETE  <- User no longer prefers aisle seats
ADD     <- User likes Python

Mem0-style store: ['User lives in Boston', 'User works as an RPA developer', 'User likes Python']
Append-only store size: 7 vs managed: 3

Query: Where does the user live?
  managed top-1 : ['User lives in Boston']
  append top-2  : ['User lives in Pittsburgh', 'User lives in Boston'] <- stale and current facts tie
```

**What to notice.**

- All four operations fire on a seven-item stream, and the managed store ends with 3 facts against 7 for append-only. That is consolidation happening at write time rather than in a later cleanup pass.
- The append-only store returns the stale Pittsburgh fact first, because both location facts score identically against the query. Retrieval cannot resolve a conflict that writing left in place.
- The DELETE removes "prefers aisle seats", but the negated sentence itself is not stored. A real system might instead store "does not want aisle seats"; choosing between DELETE and UPDATE is a judgment the stub makes crudely.
- The first draft of this program used no stemming, so "live" missed "lives" and the managed query returned nothing. Weak embeddings make the top-s neighbour set, and therefore every later operation, unreliable. min\_score and top\_s are the knobs that decide which conflicts the LLM ever sees.
- The stub's rules (negation words, a 0.3 similarity cut-off) are exactly what the LLM replaces. The pipeline structure, retrieve neighbours then decide one operation, is the part to keep.

### Example B · Designing memory for an invoice-processing agent

This walkthrough applies the lecture to a familiar RPA problem. An agent processes supplier invoices in a web ERP: log in, open the invoice queue, match each invoice to a purchase order (PO), enter the header fields, and route exceptions. Assume the team has logs of 400 completed tasks and a no-memory baseline of about 22 steps per invoice.

**Step 1: decide what each experience becomes (slides 4, 36, 44).**

| Experience | Store as | Why |
| --- | --- | --- |
| Full trace of one disputed invoice | Episode | Auditors may ask exactly what happened; the specifics matter again |
| "Vendor 1042 sends scanned PDFs, so OCR is needed" | Fact (Mem0-style, updatable) | Recurs on every invoice from that vendor and can change |
| "If PO search returns 0 results, strip leading zeros and retry" | Lesson / strategy | Induced from failed episodes; advice, not a fixed procedure |
| Handling a three-way-match exception | Text skill | Needs judgment about which document is wrong; must adapt |
| enter\_invoice\_header(vendor\_id, po, amount, date) | Code skill | Nine fixed UI actions, repeated on every invoice, testable |
| Approval limit: invoices over a set threshold need a manager | Authored text skill | Known policy, normative and high-stakes |

**Step 2: budget the index (slides 9–11).** Suppose the library holds 25 skills at about 60 tokens of name and description each. The always-loaded index costs 25 × 60 = 1,500 tokens. Bodies load only when triggered. Each description is written as a trigger, for example "Use when entering a new invoice header in the ERP", not as a summary.

**Step 3: estimate step savings (slides 32–33).** enter\_invoice\_header bundles k = 9 primitive actions and is used once per invoice, saving k − 1 = 8 decisions. A second skill, open\_invoice\_queue(), bundles 4 actions and saves 3. From 22 steps the expected count falls to 22 − 8 − 3 = 11. A text version of the same skills would leave the count near 22, minus only avoided detours.

**Step 4: gate admission (slides 30–31).** Before storing enter\_invoice\_header, the pipeline (a) lints it, catching for example an unused date parameter, as in SkillWeaver's color bug; (b) re-runs three held-out invoices in a sandbox ERP and checks the saved records field by field; (c) confirms the skill was actually called, as in ASI's "Skills used?". The approval-limit skill skips automatic admission: a finance owner signs it off (slide 45, "correctness is normative or high-stakes").

**Step 5: retrieval policy (slide 41).** Retrieve at most one lesson per task, and none below a similarity threshold. Five PO-search lessons in context would compete; one relevant lesson is what the ReasoningBank curve rewards.

**Step 6: retirement (slide 42).** Apply TroVE's rule with n = 400 tasks seen. The threshold is 0.5 · log₁₀(400) ≈ 0.5 × 2.60 = 1.30, so any skill used fewer than 1.30 times, meaning 0 or 1 uses, is dropped. export\_quarterly\_accruals() was used once and would be retired. But it is used once a quarter by design, so a blind usage rule deletes a valuable skill. The fix is a human "pin" flag or a rule normalized by expected frequency. This is the "accountability requires an owner" row of slide 45.

**Step 7: maintenance loop (slide 15).** Log each run; score by whether the accounts-payable clerk later corrected any field the agent entered; every two weeks, have a model cluster corrections and propose SKILL.md patches for human review.

**What to notice.**

- One workflow produces all five artifact types. Choosing the type is a per-item decision, driven by whether the item recurs, needs adaptation, and can be tested.
- The step saving comes almost entirely from code skills, and the success gain from lessons and facts that prevent known failure modes.
- TroVE's usage rule assumes usage frequency reflects value. Periodic but critical skills break that assumption, so maintenance needs a human override.
- The "clerk corrected a field" signal plays the same role as OpenHands' "suggestions humans kept": a free, automatic proxy for quality that already exists in the workflow.

## Key terms

These are the terms the lecture relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Admission | The lifecycle step that decides whether an induced skill enters memory, ideally after a judge verdict and an executable test |
| Code skill | A skill stored as an executable function (e.g. `search_product(id, query)`) that the agent calls as a tool; testable, composable, efficient, but can be brittle |
| Consolidation | Maintenance that repairs, merges or retires memories so the library stays small and useful (e.g. TroVE forgetting) |
| Cumulative success rate | Online-evaluation metric: success averaged over all tasks seen so far in a stream, while memory grows |
| Episode | A full trace of one task: every observation and action |
| External artifact | Knowledge stored outside the model and context window (files, database rows), so it is inspectable, editable and portable |
| Fact | A single reusable statement about the world or user, e.g. "this store shows prices only on the product page" |
| Induced skill | A skill the agent derived from its own experience rather than one a person wrote |
| Judge | A model or check that predicts whether an episode succeeded; decides which experience is learned from |
| Lesson / strategy | A generalizable piece of advice distilled from success or failure, e.g. "tighten the query before browsing" (Reflexion, ReasoningBank) |
| Memory (agent) | Anything saved from the agent's own interaction for later use |
| Over-retrieval | Loading more memories or skills than helps; ReasoningBank peaked at one retrieved experience |
| Progressive disclosure | Loading skill content in levels: metadata always, SKILL.md body on trigger, bundled files on demand |
| Skill | Reusable knowledge about how to act, stored as text, code or both |
| Skill lifecycle | Learn (judge, induce, admit), use (retrieve, act), maintain (add, repair, retire) |
| SKILL.md | The required file in a skill package: YAML metadata (name, description, triggers) plus Markdown instructions |
| Skill-reuse reward | An RL reward that credits saving a skill only if a later task reuses it successfully (SAGE) |
| Text skill / workflow | A skill stored as natural-language steps with example actions (AWM); flexible but does not cut steps |

## Self-check

Try each question before reading the answer.

1. Name the three places an agent can be updated and give one pro and one con of each. **Answer:** Context window: high fidelity, but costly, noisy and it does not decide what matters. External artifacts: inspectable, editable, retrievable and portable, but they must be induced, selected and maintained. Model weights: fast inference and broad behavior change, but slow to update, opaque and model-specific.
2. What problem does progressive disclosure solve, and what are its three levels? **Answer:** It keeps many installed skills from flooding the context window. Level 1, the SKILL.md metadata, is always loaded; level 2, the SKILL.md body, loads when the skill is triggered; level 3, bundled files, loads only when the agent reads them. In Hermes the always-loaded index is about 3k tokens.
3. SkillsBench found skills raise the average pass rate from 33.9% to 50.5%, yet hurt on 13 of 87 tasks. How can a correct, human-written skill hurt? **Answer:** A skill can displace a better default strategy the model would otherwise use, or add irrelevant instructions that distract it. SkillsBench also found smaller gains when tasks had 4+ skills or longer SKILL.md files, which points to overload rather than wrong content.
4. In Mem0, a user who said "I'm vegetarian" later says "I've started eating fish again." Which operation should fire, and why not ADD? **Answer:** UPDATE (or DELETE plus ADD), because the new message changes an existing memory. A plain ADD would leave two contradictory memories and the retriever might surface the stale one.
5. Why do code skills cut steps per task (24.5 to 15.0 in ASI) while text skills barely do (20.6)? **Answer:** A text skill is guidance: the agent still issues every low-level action itself. A code skill is called as one tool, so one model decision replaces several, as in the 50-step versus 4-step address-update example.
6. Why do failures help ReasoningBank but hurt AWM (44.4 to 42.2)? **Answer:** ReasoningBank turns a failure into a positive strategy ("use filters available"), which transfers. AWM and Synapse store workflows or trajectories as demonstrations, so a failed one is an example of what not to do that the model may imitate anyway.
7. ReasoningBank's success rate falls from 49.7 with one retrieved experience to 44.4 with four. Give two reasons. **Answer:** Some retrieved experiences are irrelevant to the current task, a limitation of the memory and retriever. And the agent can only condition usefully on so much guidance; extra items dilute or conflict with the relevant one.
8. Under TroVE's rule, after 1,000 examples, how many uses does a function need to survive? **Answer:** The threshold is 0.5 · log10(1000) = 1.5, and functions used fewer than that are dropped. So a function needs at least 2 uses. This kept libraries 74–90% smaller on MATH, HiTab and GQA.
9. Why is rewarding Task 1 for its own success a poor signal for training a skill inducer, and what does SAGE do instead? **Answer:** Task 1's reward shows whether Task 1 succeeded, not whether saving part of its solution was worthwhile; that is only visible when a later task reuses it. SAGE puts two related tasks in one rollout and adds a bonus when both succeed and Task 2 reused the skill, lifting AppWorld scenario completion from 55.4 to 60.7.
10. How would you design skills so that `sort_listings` works on both a dropdown-based site and Target's sidebar sort? **Answer:** Use PolySkill's pattern: define an abstract `sort_listings(option)` method on an abstract shopping-site class and implement it per site with that site's primitive actions. Compositions such as "find the cheapest X" are written once against the abstract method. Add a per-site test so a changed page is detected rather than silently mis-clicked.
11. Your team wants an agent to follow the company's data-retention policy when cleaning databases. Who should author, admit and maintain that skill? **Answer:** A person should author and admit it, because the policy is already known and correctness is normative and high-stakes. The agent can help maintain it by logging runs and flagging recurring failures, but a human owner should approve changes for accountability.

## Practice problems

These are harder than the self-check and closer to exam style: calculations, designs, critiques and trajectory debugging. Work each one on paper before reading the solution.

1. **TroVE retirement (calculation).** A function library has usage counts A = 5, B = 2, C = 1, D = 0, E = 3. Using TroVE's rule (drop any function used fewer than ½·log₁₀(n) times), which functions survive at n = 90, n = 900 and n = 90,000? After what n is a function with exactly 2 uses first dropped?

   **Solution:** The thresholds are 0.5 · log₁₀(90) ≈ 0.98, 0.5 · log₁₀(900) ≈ 1.48 and 0.5 · log₁₀(90,000) ≈ 2.48. At n = 90 only D (0 < 0.98) is dropped, so A, B, C and E survive. At n = 900, C (1 < 1.48) and D are dropped, leaving A, B and E. At n = 90,000, B (2 < 2.48) is also dropped, leaving A and E. A function with 2 uses is dropped once 2 < 0.5 · log₁₀(n), that is log₁₀(n) > 4, so for any n above 10,000. The slow log growth means survival bars rise by only one use per factor of 100 in experience.
2. **Judge noise and admission precision (calculation).** An agent succeeds on 25% of 200 episodes. (a) A symmetric judge is 80% accurate on both successes and failures. How many episodes are labelled successful, and what fraction of those really succeeded? (b) Another judge has the same 80% true-positive rate but only a 5% false-positive rate. Repeat. (c) What does this say about which judge error to minimize for skill admission?

   **Solution:** There are 50 true successes and 150 failures. (a) The judge passes 0.8 × 50 = 40 real successes and 0.2 × 150 = 30 failures, so 70 are admitted and precision is 40 / 70 ≈ 0.57. Almost half the induced skills would come from failed episodes. (b) It passes 40 successes and 0.05 × 150 = 7.5 failures, so precision is 40 / 47.5 ≈ 0.84. (c) For admission, false positives are the costly error, because a failed episode becomes a stored procedure; a missed success only delays learning. When the base success rate is low, failures outnumber successes and even a small false-positive rate dominates. So tune the judge for precision on the "success" label, or use a representation (strategies, as in ReasoningBank) that can use both labels.
3. **SAGE reward (calculation).** Compute Task 1's reward R₁ = r₁ + 1\[both succeed\] · 1\[task 2 reused its skill\] for these rollouts, where each triple is (Task 1 success, Task 2 success, Task 2 called the saved skill): (i) (1, 1, 1), (ii) (1, 1, 0), (iii) (1, 0, 1), (iv) (0, 1, 1). Then say which of them the "both tasks succeed" variant rewards differently, and why that matters.

   **Solution:** (i) R₁ = 1 + 1 · 1 = 2. (ii) R₁ = 1 + 1 · 0 = 1, since Task 2 did not reuse the skill. (iii) R₁ = 1 + 0 · 1 = 1, since Task 2 failed. (iv) R₁ = 0 + 0 = 0, since Task 1 failed, so "both succeed" is false. The "both tasks succeed" variant drops the reuse indicator, so it gives case (ii) a reward of 2 as well. That pays the inducer for Task 2 successes the saved skill did not cause, which is noise in the credit signal. On AppWorld the gap is 56.6 versus 60.7 scenario completion, so precise credit is worth about 4 points.
4. **Cumulative success (calculation).** After 40 tasks an online agent's cumulative success rate is 0.40. (a) It then succeeds on 8 of the next 10 tasks. What is the new rate? (b) From the original state, how many consecutive successes are needed to reach 0.50? (c) Why does this make early skill induction so valuable?

   **Solution:** 0.40 × 40 = 16 successes so far. (a) (16 + 8) / 50 = 0.48. The recent success rate is 80%, but the cumulative number has only moved 8 points. (b) Solve (16 + x) / (40 + x) = 0.5, so 32 + 2x = 40 + x and x = 8 consecutive successes. (c) Each task's weight in the average is 1/t, so improvements made early affect every later prefix of the curve, while late improvements barely move it. A skill induced at task 5 and reused on 35 later tasks raises the final number far more than the same skill induced at task 35. This is also why the metric is sensitive to task order.
5. **Step-count and reliability (calculation).** A task contains three recurring sub-procedures of 6, 4 and 5 primitive actions, plus 5 task-specific actions. With no memory the agent also wastes 6 exploratory steps. Text skills remove exploration only; code skills also collapse each sub-procedure to one call. Compute steps for each condition. If every model decision independently succeeds with probability 0.98, estimate the task success probability for each.

   **Solution:** No memory: 6 + 4 + 5 + 5 + 6 = 26 steps. Text skills: 26 − 6 = 20 steps. Code skills: 3 calls + 5 specific actions = 8 steps. Success estimates are 0.98²⁶ ≈ 0.59, 0.98²⁰ ≈ 0.67 and 0.98⁸ ≈ 0.85. The pattern matches ASI qualitatively: text skills help somewhat, code skills help much more on both steps and success. The model ignores brittleness. If each code skill independently failed with probability 0.05 on a changed page, success would fall by a factor of 0.95³ ≈ 0.86, to about 0.73, still above text skills here but no longer by as much.
6. **Over-retrieval model (calculation and design).** Retrieved items are ranked with relevance probabilities 0.6, 0.3, 0.2 and 0.1 (independent). Having at least one relevant item is worth g = 12 points; each irrelevant item costs c = 2 points of distraction. Compute the expected value for k = 1 to 4, pick k, and suggest a better policy than a fixed k.

   **Solution:** The expected value is 12 · P(at least one relevant) − 2 · E\[irrelevant\]. For k = 1: 12 × 0.6 − 2 × 0.4 = 6.40. For k = 2: P = 1 − 0.4 × 0.7 = 0.72, so 8.64 − 2 × 1.1 = 6.44. For k = 3: P = 0.776, so 9.31 − 2 × 1.9 = 5.51. For k = 4: P ≈ 0.798, so 9.58 − 2 × 2.8 = 3.98. k = 1 and 2 are nearly tied, and value falls steadily after, the same shape as ReasoningBank's curve. A better policy retrieves only items whose estimated relevance exceeds c / (g + c) or a tuned threshold, which can return zero, one or several items depending on the task.
7. **Debugging a trajectory (critique).** An agent with ASI-style code skills gets "Show me the cheapest desk lamp" on a new store. Its trajectory: search\_product('88', 'desk lamp') → results page; sort\_listings('91', 'Price') → no error, but a sidebar opens and the list is unchanged; the agent reads the first card and replies "$34.99". The true cheapest lamp is $12.50. Which lifecycle stage failed, why did no error surface, and give two fixes at different stages.

   **Solution:** The failure is in USE (act): a rigid code skill ran on a page whose sort control is a sidebar, not a dropdown, exactly the slide-34 case. No error surfaced because the skill has no post-condition. click and select\_option "succeeded" on some element, and nothing checked that the list became sorted. The agent then trusted the call as if it had worked. Fix 1, in the skill itself: add a post-condition such as verifying that visible prices are non-decreasing, and raise an error if not, so the agent falls back to manual actions. Fix 2, in MAINTAIN: restructure along PolySkill lines, with an abstract sort\_by\_price() and per-site implementations, and log post-condition failures so repair is triggered for this site. A third option, in USE, is to retrieve skills with a site-compatibility check before calling them.
8. **Memory operations (Mem0).** Stored: M1 "Works at Acme as a data analyst", M2 "Prefers Python over R", M3 "Has a dog named Rex". New messages arrive: (a) "I just joined Globex as an ML engineer." (b) "I still prefer Python." (c) "Rex loves long walks in the park." (d) "We had to rehome Rex last month." Give the operation for each, and describe what goes wrong in (a) if top-s = 1 and the embedding ranks M2 above M1.

   **Solution:** (a) UPDATE M1 to "Works at Globex as an ML engineer": same topic, new value. (b) NOOP: the fact is already stored. (c) ADD a new fact about Rex (or UPDATE M3 to include it); it neither changes nor negates M3. (d) DELETE M3, or UPDATE it to "Previously had a dog named Rex" if history matters. If s = 1 and the retriever returns M2 for message (a), the LLM sees only "Prefers Python over R", finds no conflict, and chooses ADD. The store now holds both Acme and Globex jobs, the same stale-fact bug as append-only memory. The lesson is that the update phase can only resolve conflicts that retrieval surfaces, so s and embedding quality bound correctness.
9. **Progressive disclosure under a budget (design).** Your harness allows 8k tokens of system prompt, of which 5k are already used. You want to install 200 skills whose descriptions average 40 tokens. Does a flat index fit? Propose two designs that make it fit and name the risk of each.

   **Solution:** A flat index costs 200 × 40 = 8,000 tokens, far above the 3,000 available. Design 1, a hierarchical index: list about 15 categories with one-line descriptions (a few hundred tokens), and add a tool that lists the skills in a category on demand. This adds one level of progressive disclosure; the risk is an extra routing decision, so a wrongly chosen category hides the right skill. Design 2, retrieval pre-selection: before each task, embed the request and place only the top 20 matching descriptions (about 800 tokens) in the prompt. The risk is the similarity-versus-usefulness gap from slide 20, so a relevant skill with an oddly worded description is never shown. Shortening all descriptions to 15 tokens would also fit (3,000 tokens), but it weakens the trigger wording that makes routing work.
10. **Failures in the memory (critique).** A team stores all past trajectories, successes and failures, and retrieves the top 5 by embedding similarity as few-shot examples. Success is lower than when they retrieved only the top 1 success. Using slides 39 and 41, diagnose two causes and propose a redesign.

    **Solution:** Cause 1, representation: failed trajectories stored as demonstrations teach the wrong procedure, since the model imitates examples; slide 39 shows failures slightly help Synapse (+1.1) but hurt AWM (−2.2), and help only when distilled into strategies. Cause 2, quantity: five examples exceed the useful amount; slide 41 shows success falling from 49.7 at one item to 44.4 at four, from irrelevance and limited conditioning capacity. Redesign: keep successful trajectories or workflows as positive examples, and run a ReasoningBank-style induction step that turns failures into short titled strategies. At use time, retrieve at most one example and one strategy, with a relevance threshold so that nothing is retrieved for unfamiliar tasks. Evaluate each change separately to confirm which cause dominated.
11. **From Reflexion to cross-task lessons (design).** A Reflexion agent writes "I answered with one battle but the question asked for a series; I should give the campaign name." This helps retries of that question but not new questions. Rewrite it as a transferable strategy, and write three rules for an induction prompt that would produce such strategies.

    **Solution:** A transferable version: "Answer-type check: when a question asks for a collection or a series ('a series of', 'which battles', 'what campaign'), answer with the grouping entity, not one member." It names a trigger condition and a general action, and drops the specific battle. Three induction rules: (1) "State each strategy as a title plus one sentence of the form 'when X, do Y'"; (2) "Remove entities, dates and values specific to this episode"; (3) "Write a strategy from a failure only if it states what to do instead, not merely what went wrong." Rule 3 addresses slide 39's finding that negative demonstrations can hurt. You would admit such strategies after checking that they do not duplicate an existing one, echoing AWM's "do not generate similar or overlapping workflows".

## References and further reading

All links below were checked; the first list covers every source the slides cite, in lecture order.

### Cited in the lecture

- [How to Create Effective Agent Skills](https://www.openhands.dev/blog/20260227-creating-effective-agent-skills) — Juan Michelini & Graham Neubig (OpenHands), 2026 — practical guide to writing, deploying and monitoring skills, including the PR-review maintenance loop.
- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — Barry Zhang, Keith Lazuka & Mahesh Murag (Anthropic), 2025 — origin of the SKILL.md package and progressive-disclosure design.
- [Agent Skills specification](https://agentskills.io/specification) — AgentSkills open standard — the exact SKILL.md format, field limits and directory conventions.
- [Hermes Agent](https://github.com/NousResearch/hermes-agent) — Nous Research, MIT licence — source of the skill-index prompt (`agent/prompt_builder.py`), `skill_view` and `skill_manage`; see also its [skills guide](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills).
- [SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks](https://arxiv.org/abs/2602.12670) — 2026 — the 87-task benchmark behind the 33.9% → 50.5% result.
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — Packer et al., 2023 — memory tiers managed by the agent's own function calls.
- [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) — Chhikara et al., 2025 — extraction and ADD/UPDATE/DELETE/NOOP update phases.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., NeurIPS 2023 — verbal self-feedback stored across retries.
- [ExpeL: LLM Agents Are Experiential Learners](https://arxiv.org/abs/2308.10144) — Zhao et al., AAAI 2024 — experience pool plus insight extraction.
- [Agent S: An Open Agentic Framework that Uses Computers Like a Human](https://arxiv.org/abs/2410.08164) — Agashe et al., ICLR 2025 — experience-augmented computer-use agent.
- [Synapse: Trajectory-as-Exemplar Prompting with Memory for Computer Control](https://arxiv.org/abs/2306.07863) — Zheng et al., ICLR 2024 — retrieving whole trajectories as exemplars.
- [VLM Agents Generate Their Own Memories (ICAL)](https://arxiv.org/abs/2406.14596) — Sarch et al., NeurIPS 2024 — distilling experience into annotated examples.
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291) — Wang et al., 2023 — the canonical growing library of code skills.
- [DreamCoder](https://arxiv.org/abs/2006.08381) — Ellis et al., 2021 — wake-sleep library learning by compressing solved programs.
- [Top-Down Synthesis for Library Learning (Stitch)](https://arxiv.org/abs/2211.16605) — Bowers et al., 2023 — fast symbolic abstraction discovery.
- [Leveraging Language to Learn Program Abstractions and Search Heuristics (LAPS)](https://arxiv.org/abs/2106.11053) — Wong et al., 2021 — language-guided library learning.
- [LILO: Learning Interpretable Libraries by Compressing and Documenting Code](https://arxiv.org/abs/2310.19791) — Grand et al., 2024 — LLM synthesis plus Stitch compression plus auto-documentation.
- [Agent Workflow Memory](https://arxiv.org/abs/2409.07429) — Wang et al., ICLR 2025 — inducing text workflows online; the 22.5-point compounding gap.
- [Inducing Programmatic Skills for Agentic Tasks (ASI)](https://arxiv.org/abs/2504.06821) — Wang et al., COLM 2025 — code skills with test-before-admit; 41.3 / 59.5 / 80.2 results.
- [SkillWeaver: Web Agents can Self-Improve by Discovering and Honing Skills](https://arxiv.org/abs/2504.07079) — Zheng et al., 2025 — propose, practice and hone API skills.
- [PolySkill: Learning Generalizable Skills Through Polymorphic Abstraction](https://arxiv.org/abs/2510.15863) — Yu et al., ICLR 2026 — abstract interfaces with per-site implementations.
- [ReasoningBank: Scaling Agent Self-Evolving with Reasoning Memory](https://arxiv.org/abs/2509.25140) — Ouyang et al., ICLR 2026 — strategies from failures, judge-noise and over-retrieval analyses.
- [TroVE: Inducing Verifiable and Efficient Toolboxes for Solving Programmatic Tasks](https://arxiv.org/abs/2401.12869) — Wang et al., ICML 2024 — usage-based forgetting of induced functions.
- [Not All Skills Help: Measuring and Repairing Agent Knowledge](https://arxiv.org/abs/2606.15390) — Wang et al., 2026 — skills that help one task type can hurt another.
- [Reinforcement Learning for Self-Improving Agent with Skill Library (SAGE)](https://arxiv.org/abs/2512.17102) — Wang et al., ACL 2026 — rewarding skill reuse across paired tasks.
- [Agentic Memory (AgeMem)](https://arxiv.org/abs/2601.01885) — Yu et al., ACL 2026 — RL-trained unified long- and short-term memory management.
- Assignment 1, §1.4 "Load skills" — 11-768 course materials — the `invoke_skill` tool you implement.

### Further reading

- [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427) — Sumers, Yao, Narasimhan & Griffiths, 2023 — the working/episodic/semantic/procedural memory taxonomy for agents.
- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) — Park et al., 2023 — memory stream with recency, importance and relevance scoring, plus reflection.
- [A Survey on the Memory Mechanism of Large Language Model based Agents](https://arxiv.org/abs/2404.13501) — Zhang et al., 2024 — broad map of memory sources, forms and operations.
- [Between MDPs and Semi-MDPs: A Framework for Temporal Abstraction in RL](https://people.cs.umass.edu/~barto/courses/cs687/Sutton-Precup-Singh-AIJ99.pdf) — Sutton, Precup & Singh, Artificial Intelligence, 1999 — the options framework, the formal ancestor of "skills".
- [WebArena: A Realistic Web Environment for Building Autonomous Agents](https://arxiv.org/abs/2307.13854) — Zhou et al., 2023 — the benchmark behind most results in this lecture.
- [AppWorld: A Controllable World of Apps and People](https://arxiv.org/abs/2407.18901) — Trivedi et al., 2024 — the benchmark used for SAGE.
- [LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) — Lilian Weng, 2023 — readable overview of planning, memory and tool use.
- [Letta documentation](https://docs.letta.com/) — Letta (the MemGPT team) — a production framework for agent-managed memory.
- [Model Context Protocol](https://modelcontextprotocol.io/) — open standard — how tools and resources are exposed to agents, useful for contrasting with skills.
- [Evaluating Very Long-Term Conversational Memory of LLM Agents (LoCoMo)](https://arxiv.org/abs/2402.17753) — Maharana et al., 2024 — the long-conversation benchmark on which Mem0 reports its results.
- [LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory](https://arxiv.org/abs/2410.10813) — Wu et al., 2024 — tests extraction, multi-session reasoning, temporal reasoning, knowledge updates and abstention; knowledge updates are Mem0's UPDATE problem.
- [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110) — Xu et al., 2025 — Zettelkasten-style notes that link to each other and whose attributes evolve as new memories arrive; a consolidation design between Mem0 and TroVE.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T04 - Agent Memory and Skills]]
- [[Context Engineering - Concepts and Tutorials]]
- [[DeepSeek-V4 a million-token context that agents can actually use]]

[[L03 - Long-Context Agents|← L3]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L05 - Planning and Task Decomposition|L5 →]]
