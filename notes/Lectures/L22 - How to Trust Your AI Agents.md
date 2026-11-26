---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, evaluation, reliability, trust]
aliases: ["CMU L22", "11-768 Lecture 22", "How to Trust Your AI Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — 2026-11-19-karthik-narasimhan.pdf"
---

# Lecture 22 · How to Trust Your AI Agents

[[L21 - Search and Planning|← L21]] · [[CMU 11-768 AI Agents - Course Index|Course index]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 22 · Karthik Narasimhan (guest)
> **Source:** lecture slides `2026-11-19-karthik-narasimhan.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T12 - Rewards, Verifiers and Reward Hacking]], [[T13 - Workflow Orchestration and Agent Monitoring]], [[T14 - Agent Safety and Security - Sandboxes, Permissions, Injection and Monitoring]], [[T15 - Human-Agent Interaction and Agents for Real-World Work]]

Karthik Narasimhan (guest, Princeton University) · 11-768 AI Agents, Fall 2026 · 19 November 2026 · source slides: 2026-11-19-karthik-narasimhan.pdf (25 slides)

## Overview

Generating agent output is now cheap, but checking it is expensive, so trusting agents requires verification that keeps pace: reliability measured at scale, evidence delivered with the output, human attention aimed where it matters, and autonomy earned through a track record. Karthik Narasimhan (Princeton) builds this argument in three parts. Part 1 shows that every era of AI was shaped by *who* supplied ground truth and *what it cost*. Part 2 walks up a "verification ladder" of agent benchmarks, several of them from his own group (WebShop, SWE-bench, τ-bench), and shows that the next rung is missing for week-long tasks. Part 3 proposes two pillars for that missing rung: **reliability** (a property of the agent) and **trust** (a property of the person and the agent together).

**Learning objectives.** After this lecture you can:

- Explain the verification ladder (human labels → environment reward → developer tests → simulated user plus final-state checks → ?) and name the cost and weakness of each rung.
- Distinguish capability (pass@1, pass@k) from reliability (pass^k), compute each from repeated runs, and explain why two agents with the same pass@1 can differ completely in pass^k.
- Explain why static benchmarks saturate (Goodhart's law, contamination, benchmark bugs) and describe evaluation as a continuous deploy → log → find failures → write tests loop.
- Score a trajectory on both outcome and process, and route only the uncertain, high-stakes steps to scarce human reviewers.
- Describe how "show your work" evidence, calibrated flags and risk-based review turn checking into something cheaper than redoing the work.
- Design an earned-autonomy scheme (Levels 1–5) that promotes or demotes an agent per task type from its track record, and relate it to calibrated reliance (Lee and See, 2004).

**Prerequisites.** The agent loop (L1), what a benchmark and a verifier are (L6, L7, T9), and basic probability (independent trials, binomial counts).

**How it connects to earlier lectures.**

- **L1 (agents):** the agent–environment loop on slide 8 is L1's loop; this lecture asks how you know the loop did the right thing.
- **L6 (coding agents) and L14 (OpenHands):** SWE-bench and SWE-bench Verified are the Rung 3 example; L14's confirmation prompts before risky actions are Level 3 of earned autonomy.
- **L7 (computer use):** WebShop, WebArena, Mind2Web, OSWorld and state-check evaluators are the Rung 2–4 landscape.
- **L9–L12 (RL):** environment reward (Rung 2) is the same signal RL trains on, so "the reward is a proxy" is also the reward-hacking problem.
- **L10 (deep research):** BrowseComp and citation checking are examples of "show your work" evidence.
- **L13 (agent safety):** monitors, unsafe-action flags and policy-violation checks reappear as process scoring of trajectories.
- **L15 (orchestration and monitoring):** Docent and Hodoscope-style clustering are concrete tools for "testing at scale" and "grouping failed runs".
- **L17 (agents for human work):** GDPval-style professional tasks, construct validity and rubric judges are the attempts at Rung 5 for open-ended work.
- **L19 (human-AI collaboration):** PULSE learns from implicit user signals in deployment, one form of evaluation as a continuous process; L19's comprehension results warn against "YOLO" merging.
- **L20 and L21 (search):** pass@k is the coverage that search exploits; this lecture adds pass^k, the consistency that deployment needs. Verifiers that select among samples are the same machinery that must decide what counts as success.
- **Topic sheets:** T9 (evaluation) already covers pass@k/pass^k estimation, saturation and outcome versus process scoring; T12 (rewards and verifiers), T13 (orchestration and monitoring), T14 (agent safety) and T15 (human–agent interaction) cover the neighbouring material. This sheet cross-references them rather than repeating them.

## Concept map

![[cmu-ai-agents-L22-concept-map.png]]
*Concept map: Verification ladder (Rungs 1–4) → missing Rung 5 → two pillars → calibrated reliance*

Read top to bottom: the four existing rungs each automate more checking for narrower tasks, long agent tasks leave Rung 5 empty because verification now costs more than generation, and the lecture fills it with two pillars (reliability of the agent, trust between person and agent) whose shared goal is calibrated reliance.

## Detailed notes

The lecture follows one thread: the cost and source of ground truth decide what AI can measure, and therefore what it can improve. It runs in three parts. Part 1 (slides 4–7) is history: demos, labelled datasets and their saturation. Part 2 (slides 8–14) is agent benchmarks arranged as a ladder of ever more automated checking. Part 3 (slides 15–25) asks what replaces the ladder when tasks last a week, and answers with two pillars, reliability and trust. A small bar-chart icon in each slide's top-right corner marks which rung of the ladder the slide is on; it fills one bar per rung, and the closing slide fills the fifth.

### 1. The question: what goes between "review every line" and "YOLO"?

The lecture opens with a poll (slide 2). On the left is **Review every line**: "Who reads everything an agent writes before using it?" Its cost is *your hours*. On the right is **YOLO**: "Who has merged or sent agent output they didn't fully read?" Its cost is *silent errors*. A gradient bar underneath runs from "All human time" (blue) to "All risk" (red). The middle card is a dashed box with a question mark: "What goes in the middle?"

The poll makes the problem personal. Most practitioners already sit at one extreme or swing between them. Reading everything does not scale once an agent produces hundreds of pull requests or a week of work. Reading nothing turns every subtle mistake into a production incident. The rest of the lecture is an answer to the middle box.

Slide 3 states the thesis in two lines: **"Generation is cheap. Verification is expensive."** Its subtitle generalises it: "Every era of AI has depended on the source (who) and expense (time, money) of obtaining ground truth." At the bottom is the *verification ladder* as a row of pills: Human labels → Environment reward → Developer tests → Simulated user + final state → ?.

*Why it matters:* "ground truth" here means whatever decides whether an output is correct. If that decision needs a person, it costs human time and does not scale. If a program can make it, evaluation (and RL training, L9–L12) can scale, but only to tasks where such a program exists.

### 2. Part 1: how evaluation shaped the field

**The demo era (slide 4).** "Success = impressive demo." SHRDLU (Terry Winograd, MIT, c. 1970), ELIZA and expert systems "each worked inside its own small world." The slide's figure is a SHRDLU-style blocks world: a gripper above red, yellow and blue blocks, a green pyramid and an empty box, with the dialogue "> Pick up a big red block." / "OK." Two red tags list the problems: **brittle outside the script** and **no way to measure progress**. The corner label reads "Ground truth: the presenter's say-so." Nobody could compare two systems, because there was no shared test.

**The task era (slide 5, Rung 1 · Human labels).** A four-step recipe replaced demos:

1. **Define a narrow task** — parsing, digits, QA.
2. **Pay humans for gold labels** — tagged "Expensive" (the slide colours this step pink).
3. **Train a model to reproduce them** — "Mostly classifiers".
4. **Report accuracy** — tagged "Checking is free" (coloured blue).

The key economics: the cost is paid *once*, up front, when labels are made. After that, scoring any model is a free comparison with the gold label. The slide notes that "one field becomes three" (NLP, Vision, RL), each with its own landmark dataset: the Penn Treebank (1993), shown as a parse "(S (NP The cat) (VP sat))"; MNIST (1998), shown as the digits 3 8 1 7; and TREC QA (1999), shown as "Q: Who wrote Hamlet?"

**Bigger datasets (slide 6).** A timeline from 1990 to 2020 marks labelled datasets in red above the line and RL environments in blue below it:

| Year | Benchmark | Size / content | Kind |
| --- | --- | --- | --- |
| 1993 | Penn Treebank | 4.5M words | Labelled dataset |
| 1998 | MNIST | 70K digits | Labelled dataset |
| 2009 | ImageNet | now 14M images | Labelled dataset |
| 2013 | Atari (ALE) | arcade games | RL environment |
| 2014 | MS COCO | 330K images | Labelled dataset |
| 2016 | SQuAD | 100K questions | Labelled dataset |
| 2016 | Go · Gym + MuJoCo | a board game and simulated robots | RL environment |
| 2018–19 | GLUE → SuperGLUE | language-understanding suites | Labelled dataset |

The takeaway: "Datasets got larger and harder, but each one stayed fixed." Size grew by orders of magnitude, but the test set never changed after release. RL environments already pointed to Rung 2: the game itself computes the score.

**Saturation (slide 7).** A horizontal bar chart titled "Years from release to human-level performance" shows MNIST (1998) at about 18 years, ImageNet (2009) at about 6, and GLUE (2018) at about 1. A note adds: "SuperGLUE, the harder successor, lasted less than two years." The source is Kiela et al. (2021), "Dynabench: Rethinking Benchmarking in NLP". The callout reads: "Static benchmarks have a half-life", followed by Goodhart's law: "once a measure becomes the target, it stops being a good measure."

Three forces drive saturation. Models genuinely improve. The community optimises against the fixed test set (hyper-parameter search, architecture choices and paper selection all leak test information). And test data seeps into pre-training corpora. Kiela et al.'s response, Dynabench, keeps humans in the loop writing new adversarial examples that fool current models, so the benchmark moves with the models. The lecture returns to this idea as "living benchmarks" on slide 17.

*Common pitfall:* "human-level performance" on a saturated benchmark does not mean human-level ability on the underlying skill. It means the benchmark can no longer tell models apart. T9 §9 covers the benchmark life cycle (launch, climb, saturation, leakage, successors).

### 3. Part 2: from labels to environments (Rung 2)

Slide 8 contrasts two ways of checking. **Predict**: Input → Model → Label. "One step. To check it, compare with the gold label." **Act**: an Agent sends an *action* to an Environment and gets back an *observation, reward*. "Many steps, many valid solutions, side effects. To check it, a program has to decide what counts as success."

That last sentence is the crux of agent evaluation. A label is a single correct answer. An agent task usually has many correct paths (buy the mug through search or through a category page), and actions change the world (an order is placed, a file is deleted). So the check moves from "compare with the answer" to "inspect the resulting state and decide". Someone has to write that decision procedure, and it can be wrong.

The slide lists early environment-based benchmarks:

- **Text games · LSTM-DQN, 2015** ("> go north"). Narasimhan, Kulkarni and Barzilay trained an LSTM plus deep Q-network to play text adventures from the game's own reward. This is the lecturer's own early work: language understanding judged by whether the agent achieves goals in a world.
- **TextWorld · Jericho**: "generated and classic text games". TextWorld (Microsoft, 2018) generates games procedurally; Jericho (Hausknecht et al., 2020) wraps classic Infocom-style interactive fiction such as Zork.
- **MiniWoB · 2017**: "Small web tasks: click, type, submit" (from World of Bits, Shi et al., 2017). Each task is a tiny web page with a programmatic reward.

*Why it matters:* an environment costs a lot to build once, but then scores unlimited runs for free. That is what made agent RL and large-scale agent evaluation possible.

### 4. WebShop (2022): a realistic environment with an automatic reward

WebShop (Yao, Chen, Yang and Narasimhan, 2022) is the slide-9 example of Rung 2. Its figure shows a natural-language query going to a language agent, which exchanges actions and observations with the WebShop environment and ends by choosing a product. A **goal product**, "hidden from agent", has attributes A, B, C. The **chosen product** has attributes A, B, Z. Ticks and crosses show that two of three attributes match, and a dotted arrow sends both to a **reward in \[0, 1\]**.

The headline numbers are **1M+ real products** (scraped from Amazon) and **\~12K instructions written by people**. "The reward is computed automatically: how well the chosen product matches a hidden goal product." Beyond the slides: the reward combines attribute overlap, option overlap (size, colour), a price check and product-type similarity, so partial matches earn partial credit.

- **Principle:** "A realistic environment with a reward that scales without human graders."
- **Left open:** "The reward is a proxy for what the user wanted."

The proxy problem is concrete. A user who asked for "a quick-drying men's hiking shirt under $40" may be happy with a product that is not the hidden goal, and unhappy with one that matches its listed attributes but is poor quality. The reward measures agreement with one annotator's pick, not user satisfaction. Beyond the slides: in the original paper the best imitation-plus-RL agent reached a success rate of about 29%, against about 60% for expert humans, and policies trained in WebShop showed some transfer to the live amazon.com and ebay.com sites.

### 5. SWE-bench (2023): real tasks checked by developers' tests (Rung 3)

SWE-bench (Jimenez, Yang et al., 2023) moves to Rung 3. Slide 10's figure shows a GitHub **issue** ("data leak in GBDT due to warm start (This is about the non-histogram-based version of…") plus a **codebase** (sklearn/, examples/, README.rst, reqs.txt, setup.cfg, setup.py) going into a language model, which produces a **generated PR** (+20 −12 lines, touching gradient\_boosting.py, helper.py and utils). The PR then runs against **unit tests** shown in a Pre-PR / Post-PR table:

| Test | Pre PR | Post PR |
| --- | --- | --- |
| join\_struct\_col | fail | pass |
| vstack\_struct\_col | fail | pass |
| dstack\_struct\_col | fail | pass |
| matrix\_transform | pass | pass |
| euclidean\_diff | pass | pass |

The first three are *fail-to-pass* tests: they encode the fix the issue asked for. The last two are *pass-to-pass* tests: they check nothing else broke. (T9 §4 covers this design in detail.)

The headline numbers are **2,000+ real GitHub issues** and **2% → 90%+ solved, 2023 to today**. The footnote clarifies that "today's number is on the human-validated Verified subset." Beyond the slides: the original test set has 2,294 issues from 12 Python repositories, and the best 2023 system (Claude 2 with retrieval) resolved 1.96%. SWE-bench Verified (OpenAI with the SWE-bench authors, August 2024) is 500 issues that human annotators screened for clear descriptions and fair tests.

- **Principle:** "Real tasks, checked by running the developers' tests." The checker costs nothing to write: the repository's own maintainers wrote it.
- **Left open:** "Tests miss things, so the benchmark needed checking too." Tests are incomplete specifications. A patch can pass every test and still be wrong, and some tests reject correct patches. Verified exists because the raw benchmark contained underspecified issues and unfair tests.

L6 covered SWE-bench's construction and L15 covered environment leaks such as reading future commits from Git history. The general lesson here is that each rung's automatic checker eventually needs auditing itself.

### 6. τ-bench (2024): simulated users, final-state checks and pass^k (Rung 4)

τ-bench (Yao, Shinn, Razavi and Narasimhan, 2024) targets customer-service agents. Slide 11's left figure shows three stacked layers: **Tools** (get\_user\_details, book\_reservation, cancel\_reservation, update\_reservation\_flights) on top; the **Agent** in the middle with "Domain policy as system prompt"; and the **User** at the bottom with "User instruction as system prompt". The user is itself an LLM, prompted with a hidden scenario, so conversations can be generated without human testers.

- **Principle:** "Simulate the user, then check the final database state." Success is judged on *where the world ended up* (the reservations database), not on the wording of the conversation. Many dialogues can reach the same correct state.
- **Metric:** "pass^k: the agent solves the same task on all k tries."
- **Lesson:** "Capability (pass@1) and reliability (pass^k) come apart."

The right-hand plot has k = number of trials (1, 2, 4, 8) on the x-axis and success (0–100) on the y-axis. Dotted lines are pass@k and solid lines are pass^k for gpt-4o, gpt-4-32k-0613, gpt-4-turbo, claude-3-opus and gpt-3.5-turbo. At k = 1 the two metrics coincide, around 50–60 for the strong models and about 20 for gpt-3.5-turbo. As k grows, the dotted lines climb (gpt-4o's to roughly 95 by k = 8) and the solid lines fall (gpt-4o's to roughly 25–30; claude-3-opus to about 10; gpt-3.5-turbo to a few percent). These values are read off the plot and approximate. Beyond the slides: the paper's abstract reports that gpt-4o succeeds on under 50% of tasks and has pass^8 under 25% in the retail domain.

The two metrics, for a task attempted n times with c successes, are estimated without bias by:

$$
\text{pass@}k = \mathbb{E}_{\text{tasks}}\left[1 - \frac{\binom{n-c}{k}}{\binom{n}{k}}\right], \qquad \text{pass}^k = \mathbb{E}_{\text{tasks}}\left[\frac{\binom{c}{k}}{\binom{n}{k}}\right]
$$

Here n is the number of trials run per task (n ≥ k), c is the number of those trials that succeeded, and the binomial coefficient counts ways of choosing k trials. pass@k is the chance that at least one of k random trials succeeds; pass^k is the chance that all k succeed. If a task's per-trial success probability is p and trials are independent, they become:

$$
\text{pass@}k = \mathbb{E}\left[1-(1-p)^k\right], \qquad \text{pass}^k = \mathbb{E}\left[p^k\right]
$$

where the expectation is over tasks. A task with p = 1 contributes 1 to both. A task with p = 0.6 contributes 0.6^8 ≈ 0.017 to pass^8 but 1 − 0.4^8 ≈ 0.999 to pass@8. So pass^k rewards agents whose successes are concentrated on tasks they *always* solve.

*Why it matters:* a customer-service agent handles the same kind of request thousands of times. A 60% pass@1 with low pass^8 means the same customer request may succeed today and fail tomorrow. pass@k is what search and selection exploit (L20); pass^k is what deployment needs.

### 7. The verification ladder, assembled

Slide 12 puts the four rungs side by side as rising steps, with a dashed fifth box. Each rung names its example, its cost and, underneath, where it falls short:

| Rung | Who or what decides success | Example | Cost (slide) | Where it falls short |
| --- | --- | --- | --- | --- |
| 1. Human labels | Paid annotators, once | ImageNet, SQuAD, GLUE | Paid per label | Saturates quickly |
| 2. Environment reward | A program inside a built environment | WebShop | Build the environment once | Reward is a proxy |
| 3. Developer tests | Tests the project's developers already wrote | SWE-bench | Reuse tests that already exist | Tests are incomplete |
| 4. User simulation + final-state checks | An LLM user plus a database-state check | τ-bench | Model calls for every run | One pass isn't reliability |
| 5. ? | Unknown | — | — | Still open: long tasks with no ready-made check |

The caption is the slide's key sentence: "Each step automates more of the checking, but for a narrower set of tasks." Human labels can judge almost anything but cost money per item. A reward function costs one engineering effort but only covers tasks the environment models. Developer tests are free but only exist where developers wrote tests. Simulated users are cheap per run but only cover scripted scenarios with a checkable final state. Rung 5 is for tasks such as "write a market analysis" or "migrate this service over a week", where no ready-made check exists.

*Common pitfall:* reading the ladder as "higher is better". Each rung trades generality for automation. A team should pick the highest rung that still measures what it cares about (construct validity, L17), not the most automated one available.

### 8. The current landscape (slide 13)

Slide 13 surveys today's agent benchmarks, grouped by domain. The large panel shows **WebArena** (Zhou et al., 2023): self-hosted, fully functional web applications (a shopping site "OneStopShop", a CMS, a Reddit clone, GitLab, plus a toolbox and knowledge resources such as a Wikipedia copy). The agent receives tasks like "Tell me how much I spent on food purchase in March 2023" or "Create a 'NolanFans' repo, listing Nolan's Oscar-winning films in a README file". Programmatic checkers (check\_repo, check\_readme, check\_answer) then mark *functional success* or *functional failure*. This is Rung 2 done carefully: the state of real applications is inspected after the run.

| Group (slide) | Benchmarks named | What they check (beyond the slides) |
| --- | --- | --- |
| More web and OS | Mind2Web, VisualWebArena, WebVoyager, WorkArena, BrowseComp, OSWorld-Verified | Web navigation on many real sites (Mind2Web, recorded human actions), image-dependent web tasks (VisualWebArena), live websites judged by a multimodal model (WebVoyager), enterprise ServiceNow workflows (WorkArena), hard-to-find but easy-to-verify facts (BrowseComp, 1,266 questions), and full desktop tasks with state checks (OSWorld, re-audited as OSWorld-Verified in 2025) |
| Professional work | GDPval, Finance Agent, BigLaw Bench | Deliverables from real occupations judged by experts (GDPval: 44 occupations, blinded expert comparison), financial-analyst research (Vals AI), legal work graded by rubric (Harvey) |
| Coding and terminal | SWE-bench Pro, Terminal-Bench 2.0 | Longer, multi-file issues with held-out and commercial repositories to resist contamination (Scale AI); hard command-line tasks in containers, checked by tests |
| Research and ML | MLE-bench, RE-Bench, PaperBench | Kaggle competitions scored against medal thresholds (OpenAI), ML research-engineering environments compared with human experts (METR), replicating ICML papers graded with author-written rubrics (OpenAI) |
| Assistants and tool use | GAIA, τ²-bench, MCP-Atlas | Multi-step questions with short unambiguous answers (GAIA), τ-bench extended to *dual control* where the user also acts on tools (τ²-bench), tool use against real MCP servers (MCP-Atlas) |

The bottom band names three problems that "keep showing up":

- **Saturated quickly.** SWE-bench went from 2% to 90%+ on Verified in about three years.
- **Test data may leak into training.** Public issues, papers and web pages end up in pre-training corpora.
- **Bugs in the benchmarks themselves.** The citation is Zhu et al. (2025), the Agentic Benchmark Checklist (ABC). Beyond the slides: that paper reports that flaws in task setup or reward design can mis-estimate agent performance by up to 100% in relative terms. Its examples are SWE-bench Verified's insufficient test cases and τ-bench counting empty responses as successful on some tasks. Applying the checklist to CVE-Bench cut performance overestimation by 33%.

The slide's corner icon still says Rung 4. Even the newest benchmarks mostly reuse the existing rungs; GDPval and BigLaw Bench fall back to expert human grading (Rung 1 at much higher cost per item).

### 9. Time horizons: the next rung is missing (slide 14)

Slide 14 plots "Length of task an agent finishes half the time (log scale)" against time, after METR (Kwa et al., 2025, and later updates). Gridlines mark 1 minute, 1 hour, 1 work day and 1 week. Blue points rise from a few minutes in early 2023, through about an hour in early 2025, to several hours in late 2025 and close to a working day or more by mid-2026. A dotted extension reaches a red circle on the dashed "1 week" line around late 2026. The right side reads: **"4–7 months for that task length to double."** The footnote marks the plot as approximate.

The *50% time horizon* is defined via human baselines. METR times skilled humans on each task, then fits a logistic curve of the agent's success probability against log human-time. The horizon is the human task length at which the fitted success is 50%. Beyond the slides: the original March 2025 paper estimated a doubling time of about 7 months over 2019–2025; later data suggested faster doubling (around 4 months) since 2024, which is where the 4–7 month range comes from.

The slide's punchline: "A one-minute task is easy to check, but what about a one-week task?" The callout: "The next rung is missing. Who checks a week of agent work?" The corner icon now shows Rung 5 with a question mark.

*Why it matters:* the time-horizon metric itself depends on checking. METR can only measure horizons on tasks with reliable automatic scoring. As horizons grow, building such tasks gets harder, so measurement lags capability.

### 10. Part 3: the verification problem (slide 15)

Slide 15 names two reasons verification gets harder:

1. **Errors are subtle and nuanced** — "hard for a person to spot". A week-long agent's mistakes are buried in plausible-looking work, such as a wrong assumption in a migration plan or an off-by-one in a financial model.
2. **There is too much output** — "more than anyone can review". An agent that writes 50 pull requests a day outpaces any reviewer.

The sketch (labelled "A sketch, not data") plots *human time needed* against *task length*. A blue line, "Time to generate", is almost flat: the human only writes the request. A red curve, "Time to verify", starts slightly below it, crosses it early and then rises steeply. The caption: "Checking used to be much cheaper than doing. For long tasks, that gap is closing."

This inverts the classic asymmetry behind the task era and behind computer science's P versus NP intuition, that checking a solution is easier than finding one. That asymmetry still holds for tasks with crisp checks (a test suite, a proof checker). It breaks down when correctness is a judgement over many interacting decisions and no checker exists. The rest of the lecture is about restoring the asymmetry.

### 11. Two pillars: reliability and trust (slide 16)

The proposal splits "can I trust this agent?" into two different questions.

- **Pillar 1 — Reliability.** "A property of the agent. Does it work every time?" It is measured on the agent alone, by running it many times.
- **Pillar 2 — Trust.** "A property of the person and the agent together. Does the person know when to rely on it?" It depends on what the person can see, check and predict.

A 2×2 grid crosses agent reliability (rows) with how easy the output is to verify (columns):

|  | Easy to verify | Hard to verify |
| --- | --- | --- |
| **Reliable agent** | Delegate | Blind faith |
| **Unreliable agent** | Spot-check | Don't use |

The "Delegate" cell is dark blue (the goal). "Blind faith" is pink: the agent may be good, but you cannot tell, so relying on it is faith rather than trust. "Spot-check" is light blue: an unreliable agent is still useful when its errors are cheap to catch. "Don't use" is grey. The caption: "The goal is for us to have calibrated reliance on AI agents. Trusting too little and trusting too much are both failures."

The citation is Lee and See (2004), "Trust in Automation: Designing for Appropriate Reliance", a classic human-factors paper. Its central idea is *calibration*: trust should match the automation's actual capability. *Over-trust* leads to misuse (relying on automation where it fails). *Under-trust* leads to disuse (ignoring automation where it would help). The lecture's two pillars map onto this: reliability is the automation's true capability; trust is the person's model of it.

*Why it matters:* the grid shows two separate levers. You can move an agent up a row by making it more reliable, or move a task left a column by making the output easier to verify. Part 3's remaining slides work on both.

### 12. Pillar 1: reliability

**Evaluation as a continuous process (slide 17).** A four-box cycle: **1. Deploy** → **2. Log every run** → **3. Find failures** (highlighted pink) → **4. Write new tests** → back to Deploy. In the middle: "The test set keeps changing, so it can't be memorized." Three cards on the right name practices:

- **Living benchmarks:** "New tasks added all the time, like SWE-bench-Live and LiveCodeBench." SWE-bench-Live (Microsoft, 2025) adds freshly created GitHub issues on a rolling basis; LiveCodeBench (2024) collects new contest problems over time and tags them by release date, so a model can be scored only on problems published after its training cutoff.
- **Production monitoring:** "Keep measuring after launch, on real usage." (L15 and L19 give tools: trace review, Docent, PULSE.)
- **Continuous red-teaming:** "Keep looking for new ways the agent breaks." (L13.)

This is the agent-era answer to saturation (slide 7). A fixed test set has a half-life; a test set refreshed from real failures does not saturate in the same way, because it is generated by the agent's current weaknesses. It also mirrors software practice: every production bug becomes a regression test.

**Reliability as a metric (slide 18).** Two 8×8 dot grids, Agent A and Agent B, each with filled blue dots (successes) and red rings (failures). In Agent A every row is identical: columns 1, 3, 4, 6 and 8 are always filled and columns 2, 5 and 7 always empty. Reading columns as tasks and rows as the 8 trials, Agent A solves the same 5 of 8 tasks every time. Its labels are **\~60% pass@1** and **\~60% pass^8** (exactly 5/8 = 62.5%). Agent B's grid has a similar number of filled dots, but scattered: every column contains at least one failure. Its labels are **\~60% pass@1** and **0% pass^8**. The headline: "Both score the same on a single try, but they behave very differently."

Agent A is predictable: you can learn which tasks it handles and delegate exactly those. Agent B is a coin flip on everything: no task can be safely delegated. pass@1 cannot tell them apart; pass^k can.

The slide also says to report:

- **Variance across seeds** — run-to-run spread, not just the mean.
- **Reworded instructions** — does success survive paraphrase?
- **Changes to the environment** — different page layouts, tool latencies, data.
- **Cost and latency** — a reliable agent that costs 20× more may not be the better choice.

These are four kinds of *robustness*: to sampling, to wording, to the world and to the budget. T9 §7–8 covers the statistics (binomial intervals, paired comparisons, seeds).

**Testing at scale (slide 19).** "1,000s or millions of simulated runs per agent. Rare failures only show up in volume. Group the failed runs to see which kinds of failure you have." The figure is a scatter of grey dots (runs) with three dashed ellipses of red dots, labelled **Skipped a policy check**, **Wrong tool inputs** and **Gave up early**. Two tags name other fields that work this way: **Self-driving: simulated miles** and **Software: fuzzing**.

The arithmetic of rare failures explains "volume". If a failure mode occurs in 1 run in 1,000, then 100 runs see it with probability 1 − 0.999^100 ≈ 9.5%, while 10,000 runs see it about 10 times. Grouping turns thousands of individual failures into a handful of actionable categories. Each category becomes a fix and a regression test (slide 17's step 4). L15's Hodoscope is one concrete tool: it summarises and embeds actions, then surfaces clusters over-represented in one model. Autonomous-vehicle developers similarly log billions of simulated miles to hit rare scenarios, and fuzzers throw millions of random inputs at a program to find crashes.

**Scoring the whole trajectory (slide 20).** A six-step refund trajectory: 1. Read the request → 2. Look up the order → **3. Skip the ID check** (pink, tag "Policy violation") → 4. Cancel the order (blue tag "Checker unsure: ask a person") → **5. Refund to a new card** (pink, tag "Unsafe action") → 6. Tell the user it's done. Two score cards follow: **Outcome score: Pass** ("The order did get cancelled") and **Process score: 2 flags** ("Two steps a careful person would not take"). The caption: "Humans are the scarce resource. Send them the important steps where the automatic checker is least sure."

This is the clearest slide on why final-state checks are not enough. τ-bench-style evaluation would mark the run a success, since the database ended in the right state. But the agent skipped identity verification and sent money to an unverified card, exactly the steps a fraud attempt would exploit. Process scoring checks each step against policy and safety rules; outcome scoring checks the destination.

The routing idea combines three signals per step: the checker's confidence, the stakes of the step, and the human budget. Steps where the checker is sure (pass or fail) need no human. Steps with low confidence and high stakes go to a person. This is *selective* or *active* verification: humans label where they add the most information. T9 §6 covers outcome versus process evaluation and process reward models; L13 covers the policy and safety monitors that raise such flags.

### 13. Pillar 2: trust

**How we already trust (slide 21).** Three columns. **People**: Track record, Credentials, Audits, Accountability. **Software**: Tests, Types, Code review, Continuous integration. **Agents**: four pink boxes with question marks. The slide is a prompt: for each mechanism we already use, what is the agent-era equivalent? The rows line up as analogies:

| Mechanism | For people | For software | Candidate for agents (discussion, beyond the slide) |
| --- | --- | --- | --- |
| Evidence from the past | Track record | Tests | pass^k on this task type; logged production success rate |
| Up-front guarantees | Credentials | Types | Certified capabilities per task type; schemas and contracts on tool calls; sandbox permissions |
| Independent inspection | Audits | Code review | Sampled audits; LLM or human review of trajectories; monitors (L13, L15) |
| Ongoing consequence | Accountability | Continuous integration | Every run logged and re-checked; automatic demotion of autonomy on failures |

The slides that follow fill in some of these boxes: evidence with the output, attention where it matters, and autonomy that is earned.

**Show your work (slide 22).** Left card, **Output only**: "Here is the patch." followed by grey placeholder lines. "To check it, the person has to read the entire thing or redo the work." Right card, **Output plus evidence**: the same patch plus five boxes: *Tests it ran*, *Citations*, *Logs*, *Proofs, e.g. Lean*, and *A reason for each change*. "The person checks the evidence instead of redoing the work."

Evidence restores the generate/verify asymmetry from slide 15. A failing-then-passing test is cheaper to check than the code it tests. A citation can be opened and compared with the claim. A log shows what actually ran. A Lean proof is machine-checked, so the human only has to read the theorem statement, not the proof. Each kind of evidence moves part of the checking back onto a cheap, automatic checker, or shrinks what the person must read.

*Common pitfall:* evidence can itself be fabricated or selective. Tests the agent wrote may test the wrong thing; citations may not support the claim. Evidence is only useful if it can be checked independently, by re-running the tests or opening the source.

**Where to look (slide 23).** A code diff of apply\_refund(order, amount):

```python
def apply_refund(order, amount):
+    if amount > order.total:
+        raise ValueError("too large")
     ledger.credit(order.user, amount)
+    db.run("DELETE FROM holds", order.user)   # flagged: Low confidence
+    order.status = "refunded"
+    notify(order.user, "refund")
+    audit.log("refund", order.id)
```

Blue bars mark added lines; one line is highlighted red and tagged "Low confidence". The headline: "The agent points the reviewer to the few lines that need a careful read." The flagged line deserves it. It deletes *every* hold for the user, not just this order's, and it is an irreversible database write. The other lines are routine and low-risk.

Five "ways to do it": **Calibrated confidence**, **Flags on uncertain parts**, **Summaries of what it did**, **Review by risk**, and **Spot-checks and audits**. Calibration is the hard requirement: a flag is useful only if "low confidence" really is more often wrong, and "high confidence" lines are really safe to skim. An agent that flags everything wastes attention; one that never flags is back to output only.

**Earned autonomy (slide 24).** "Agents get more freedom on a type of task as their track record on it grows, the way driving automation is described in levels." Five rising boxes:

| Level | Name | Who does what |
| --- | --- | --- |
| 1 | Suggest | The person does the work |
| 2 | Draft | The person approves every step |
| 3 | Act, ask first on risky steps | Agent acts; risky steps need approval |
| 4 | Act, with sample audits | Agent acts; a sample of runs is checked afterwards |
| 5 | Act alone | On this type of task only (dark box) |

A pink tag adds: "A good agent also knows when to ask." The driving analogy is SAE J3016, which defines Levels 0–5 of driving automation, from no automation to full self-driving. Three ideas matter:

1. **Autonomy is per task type.** Level 5 on "issue refunds under $50" says nothing about "migrate the billing database".
2. **Autonomy is earned and can be lost.** Promotion follows a track record (pillar 1's measurements); demotion should follow failures or drift.
3. **Asking is a skill.** An agent at Level 3 or 4 must recognise risky or uncertain steps itself. This is the agent-side half of calibration.

In practice, today's coding agents already expose these levels as permission modes: suggest-only, approve each edit or command, auto-approve within a sandbox but ask for network or destructive actions, and fully autonomous runs. L14's confirmation prompts in OpenHands are Level 3. Worked example 2 below implements a promotion and demotion policy.

### 14. Closing: verification has to keep pace (slide 25)

The last slide echoes the title slide's bar chart: four bars, the fourth highlighted, and a fifth red box filled in. "Evaluation in AI has steadily moved from careful human checking to automation. The current problem is making verification keep up with what agents can do." The red box, labelled **Rung 5**, lists:

- **Reliability measured at scale** (slides 17–20)
- **Evidence with the output** (slide 22)
- **Attention where it matters** (slides 20 and 23)
- **Autonomy that is earned** (slide 24)

So Rung 5 is not one new benchmark. It is a *system* combining automatic measurement, agent-produced evidence, targeted human review and graduated permissions. Its unit of evaluation shifts from a fixed test set to a deployed agent's ongoing record on each task type. That answers the opening poll: the middle between "review every line" and "YOLO" is calibrated, evidence-backed, risk-targeted review, with autonomy granted per task type as the record justifies it.

## Slide-by-slide companion

The deck has 25 slides and no printed numbers; they are numbered here in page order. Content slides get fuller notes than usual because the deck is short.

### Slides 1–8: the question and the history

**Slide 1 — How to Trust Your AI Agents.** Title slide: "Evaluation when generation is cheap", Karthik Narasimhan, Princeton University. On a dark background, four rounded bars rise left to right (three grey, the fourth light blue), followed by a dashed pink outline with a question mark. The bars are the verification ladder's rungs; the dashed box is the missing fifth rung that the lecture tries to fill. The same graphic returns on slide 25, where the fifth box is filled in.

**Slide 2 — A quick poll.** Three cards. Left, with a clock icon: "Review every line: Who reads everything an agent writes before using it?" and a blue tag "Cost: your hours". Right, with a lightning icon: "YOLO: Who has merged or sent agent output they didn't fully read?" and a red tag "Cost: silent errors". Centre: a dashed red box with a large question mark, "What goes in the middle?" Beneath, a gradient bar runs from "All human time" (blue) to "All risk" (red). The poll frames verification as a trade-off between two costs that both grow with agent output. Most people answer yes to both questions at different times, which shows there is no principled middle yet. The lecture's final slide answers the middle box: measured reliability, evidence, targeted attention and earned autonomy let you sit at a chosen point on that bar instead of swinging between the ends.

**Slide 3 — Generation is cheap. Verification is expensive.** A full red slide with the thesis in large type and the line "Every era of AI has depended on the source (who) and expense (time, money) of obtaining ground truth." At the bottom, labelled "The verification ladder", five pills joined by arrows: Human labels → Environment reward → Developer tests → Simulated user + final state → ?. This slide is the map for the whole talk. Each pill is a regime in which a different party supplies ground truth: paid annotators, an environment's code, a project's developers, a simulated user plus a state check, and an unknown fifth. Moving right automates checking, which is what lets evaluation (and RL) scale. The question mark says that agents doing long, open-ended work have outrun every existing pill.

**Slide 4 — The demo era.** Part 1, "How evaluation shaped the field". Corner label: "Ground truth: the presenter's say-so", with an empty five-bar icon. Text: "Success = impressive demo. SHRDLU, ELIZA, expert systems. Each worked inside its own small world." The figure is a blocks world: a grey gripper over a large red block, a small yellow block, a blue block topped by a green pyramid, a small red block and an empty box, with the dialogue "> Pick up a big red block." / "OK." Pink tags: "Brittle outside the script" and "No way to measure progress". Credit: SHRDLU, Terry Winograd, MIT, c. 1970. SHRDLU really did parse and execute commands in its toy world, but nobody could compare it with another system or tell whether a new version was better. Without shared tests, progress was a matter of opinion. The parallel to agent demo videos today is intended.

**Slide 5 — The task era.** Rung 1, Human labels (first bar red). Four step cards: "Step 1 Define a narrow task" (tag: Parsing, digits, QA); "Step 2 Pay humans for gold labels" (pink card, tag: Expensive); "Step 3 Train a model to reproduce them" (tag: Mostly classifiers); "Step 4 Report accuracy" (blue card, tag: Checking is free). Below: "One field becomes three" (NLP, Vision, RL), with Penn Treebank · 1993 "(S (NP The cat) (VP sat))", MNIST · 1998 (digits 3 8 1 7) and TREC QA · 1999 "Q: Who wrote Hamlet?". The colour coding carries the message: the cost (pink) is paid once at labelling time, and from then on checking (blue) is free. That economics made benchmark-driven research possible: anyone could score a new model instantly. Narrow tasks were the price: the label had to be a single unambiguous answer.

**Slide 6 — Bigger datasets.** A 1990–2020 timeline. Red dots above the line (labelled datasets): Penn Treebank 1993, 4.5M words; MNIST 1998, 70K digits; ImageNet 2009, now 14M images; MS COCO 2014, 330K images; SQuAD 2016, 100K questions (drawn on a taller stem); GLUE → SuperGLUE 2018–19. Blue dots below (RL environments): Atari (ALE) 2013, arcade games; Go · Gym + MuJoCo 2016, a board game and simulated robots. Headline: "Datasets got larger and harder, but each one stayed fixed." The two colours foreshadow Part 2. Labelled datasets grew in size and difficulty, but each was frozen at release, so it would eventually be learned. RL environments were a different kind of benchmark, where the environment computes the score from what the agent does, which is the idea agent benchmarks later adopt.

**Slide 7 — Saturation.** A bar chart, "Years from release to human-level performance": MNIST (1998) \~18; ImageNet (2009) \~6; GLUE (2018) \~1, its short bar coloured red. Note: "SuperGLUE, the harder successor, lasted less than two years." Callout: "Static benchmarks have a half-life. Goodhart's law: once a measure becomes the target, it stops being a good measure." Source: Kiela et al., 2021, "Dynabench: Rethinking Benchmarking in NLP". The bars shrink by roughly a factor of three to six each generation: benchmarks are being used up faster as models and research effort scale. "Half-life" suggests a benchmark's informativeness decays steadily from release. Goodhart's law names the mechanism: when the field optimises a fixed number, it eventually learns the test set's quirks along with the skill. This motivates the living benchmarks of slide 17.

**Slide 8 — From labels to environments.** Part 2, "Agent benchmarks"; Rung 2, Environment reward. Left panel, "Predict": Input → Model → Label (label box pink). "One step. To check it, compare with the gold label." Right panel (blue), "Act": Agent ⇄ Environment, with "action" on the top arrow and "observation, reward" on the bottom. "Many steps, many valid solutions, side effects. To check it, a program has to decide what counts as success." Bottom row, "Early versions": Text games · LSTM-DQN, 2015 ("> go north"); TextWorld · Jericho (generated and classic text games); MiniWoB · 2017 (small web tasks: click, type, submit). The shift is from checking an answer to checking a world state, so the evaluator becomes code that someone must write and can get wrong. LSTM-DQN (Narasimhan, Kulkarni and Barzilay, 2015) is the speaker's own entry point into agents: playing text adventures from game reward.

### Slides 9–16: the ladder and the missing rung

**Slide 9 — WebShop (2022).** Rung 2. The figure (from the paper) traces a natural-language query into a language agent; the agent exchanges actions and observations with the WebShop environment and ends with a chosen product (attributes A, B, Z). A goal product, "\*hidden from agent", has attributes A, B, C; ticks and crosses show two attributes matching and one not, and dotted arrows feed both into "Rewards ∈ \[0, 1\]". Statistics: 1M+ real products; \~12K instructions written by people. "The reward is computed automatically: how well the chosen product matches a hidden goal product." Principle box: "A realistic environment with a reward that scales without human graders." Left-open box: "The reward is a proxy for what the user wanted." Citation: Yao, Chen, Yang, Narasimhan, 2022. WebShop's design choice was to make realism (real products, real human instructions) compatible with automatic scoring. The reward gives partial credit by attribute overlap, which makes RL training feasible. Its admitted weakness is the gap between "matches the annotator's hidden product" and "satisfies the user", the same proxy gap that later shows up as reward hacking in RL (L9–L11, T12).

**Slide 10 — SWE-bench (2023).** Rung 3, Developer tests. The figure: an Issue ("data leak in GBDT due to warm start (This is about the non-histogram-based version of…") and a Codebase (sklearn/, examples/, README.rst, reqs.txt, setup.cfg, setup.py) feed a Language Model, which writes a Generated PR (+20 −12; sklearn/gradient\_boosting.py added, helper.py modified, utils removed). The PR runs against Unit Tests: join\_struct\_col, vstack\_struct\_col and dstack\_struct\_col go from fail (pre-PR) to pass (post-PR); matrix\_transform and euclidean\_diff pass both before and after. Statistics: 2,000+ real GitHub issues; 2% → 90%+ solved, 2023 to today. Principle: "Real tasks, checked by running the developers' tests." Left open: "Tests miss things, so the benchmark needed checking too." Footnote: Jimenez, Yang et al., 2023; "Today's number is on the human-validated Verified subset." The cleverness is that the checker was free: maintainers had already written the tests that accompanied each real fix. The weakness is that tests are partial specifications, which is why human validation (SWE-bench Verified) and later audits (Zhu et al., 2025) were needed. The 2% → 90%+ climb is itself an example of slide 7's saturation, compressed into about three years.

**Slide 11 — τ-bench (2024).** Rung 4, Simulated user + final state. Left: three stacked layers, Tools (get\_user\_details, book\_reservation, cancel\_reservation, update\_reservation\_flights), Agent ("Domain policy as system prompt") and User ("User instruction as system prompt"), with two-way arrows between them. Right: a plot of success (0–100) against k = #trials (1, 2, 4, 8) for gpt-4o, gpt-4-32k-0613, gpt-4-turbo, claude-3-opus and gpt-3.5-turbo; dotted lines (pass@k) rise and solid lines (pass^k) fall from a shared starting point at k = 1. Three cards: Metric, "pass^k: the agent solves the same task on all k tries"; Principle, "Simulate the user, then check the final database state"; Lesson, "Capability (pass@1) and reliability (pass^k) come apart". Citation: Yao, Shinn, Razavi, Narasimhan, 2024. The plot's fan shape is the lesson: give gpt-4o eight tries and it almost always solves a task at least once (dotted line near 95), but it solves the same task on all eight tries only around a quarter of the time (solid line). Simulating the user with an LLM removes human testers from the loop, at the price of model calls per run (slide 12's cost).

**Slide 12 — The verification ladder.** Four light-blue rising boxes and a dashed red fifth. Rung 1, Human labels: ImageNet, SQuAD, GLUE; cost: paid per label. Rung 2, Environment reward: WebShop; cost: build the environment once. Rung 3, Developer tests: SWE-bench; cost: reuse tests that already exist. Rung 4, User simulation + final state checks: τ-bench; cost: model calls for every run. Rung 5: "?", "Long tasks with no ready-made check". Under them, "Where each one falls short": Saturates quickly / Reward is a proxy / Tests are incomplete / One pass isn't reliability / Still open. Caption: "Each step automates more of the checking, but for a narrower set of tasks." This is the lecture's summary diagram for Parts 1–2. Reading down each column gives a source of ground truth, its cost model and its characteristic failure. The caption names the trade-off: automation is bought with narrowness. Rung 5 needs checking that is both automated *and* general, which no single mechanism provides.

**Slide 13 — Current landscape.** Still Rung 4. Left panel: the WebArena figure (Zhou et al., 2023) with self-hosted apps (OneStopShop, CMS, reddit, GitLab, toolbox, knowledge resources), an agent receiving tasks ("Tell me how much I spent on food purchase in March 2023", "Create a 'NolanFans' repo, listing Nolan's Oscar-winning films in a README file"), and a checker (check\_repo, check\_readme, check\_answer) deciding functional success or failure. Chips under it: Mind2Web, VisualWebArena, WebVoyager, WorkArena, BrowseComp, OSWorld-Verified. Four cards: Professional work (GDPval, Finance Agent, BigLaw Bench); Coding and terminal (SWE-bench Pro, Terminal-Bench 2.0); Research and ML (MLE-bench, RE-Bench, PaperBench); Assistants and tool use (GAIA, τ²-bench, MCP-Atlas). Bottom: "The same problems keep showing up": saturated quickly; test data may leak into training; bugs in the benchmarks themselves. Footnote: Zhu et al., 2025, agentic benchmark checklist. The point is breadth without a new rung: dozens of benchmarks across domains still rely on the same four checking mechanisms, and inherit their problems. The suffix "-Verified" on OSWorld and SWE-bench signals that audits are now routine. Detailed notes §8 has a table of what each benchmark checks.

**Slide 14 — Time horizons.** Rung 5 · ? (fifth bar red). A log-scale plot, "Length of task an agent finishes half the time", with gridlines at 1 minute, 1 hour, 1 work day and 1 week, and years 2023–2027. Blue points climb from a few minutes (early 2023) to about an hour (early 2025), several hours (late 2025) and around a work day or more (2026); a dotted extension reaches a red open circle on the dashed 1-week line. Right: "4–7 months for that task length to double." "A one-minute task is easy to check, but what about a one-week task?" Callout: "The next rung is missing. Who checks a week of agent work?" Footnote: after METR (Kwa et al., 2025, and later updates), approximate. A straight line on a log scale is exponential growth. If horizons double every 4–7 months, agents go from day-long to week-long tasks within about a year. Verification cost grows with task length, so a capability trend that is good news for productivity is bad news for oversight, unless checking also scales.

**Slide 15 — The verification problem.** Part 3, "What's next". Two numbered cards: "1 Errors are subtle and nuanced: hard for a person to spot"; "2 There is too much output: more than anyone can review". A sketch ("A sketch, not data") of human time needed versus task length: a nearly flat blue line "Time to generate" and a red convex curve "Time to verify" that crosses it early and climbs steeply. Caption: "Checking used to be much cheaper than doing. For long tasks, that gap is closing." The two cards are two different failure modes. Subtlety defeats a careful reviewer on a single output; volume defeats any reviewer across many outputs. The sketch says the human's job has flipped: for long agent tasks, people spend more time checking than they would have spent instructing. Unless verification gets cheaper, the productivity gain from agents is eaten by review.

**Slide 16 — Two pillars.** Two cards: "Pillar 1, Reliability: a property of the agent. Does it work every time?" and "Pillar 2, Trust: a property of the person and the agent together. Does the person know when to rely on it?" A 2×2 grid with columns Easy to verify / Hard to verify and rows Reliable agent / Unreliable agent: Delegate (dark blue), Blind faith (pink), Spot-check (light blue), Don't use (grey). Caption: "The goal is for us to have calibrated reliance on AI agents. Trusting too little and trusting too much are both failures." Citation: Lee and See, 2004, "Trust in Automation: Designing for Appropriate Reliance". The grid shows that reliability alone is not enough: a reliable agent on hard-to-verify work still leaves the person relying on faith. It also shows that an unreliable agent can still be useful when checking is cheap. The two pillars structure the rest of the lecture: slides 17–20 are reliability, slides 21–24 are trust.

### Slides 17–25: reliability, trust and the fifth rung

**Slide 17 — Evaluation as a continuous process.** Pillar 1, Reliability. A cycle of four boxes: 1. Deploy (blue) → 2. Log every run → 3. Find failures (pink) → 4. Write new tests → back to 1. Centre text: "The test set keeps changing, so it can't be memorized." Three cards: "Living benchmarks: new tasks added all the time, like SWE-bench-Live and LiveCodeBench"; "Production monitoring: keep measuring after launch, on real usage"; "Continuous red-teaming: keep looking for new ways the agent breaks". This slide answers slide 7. A static benchmark is memorised and saturates; a loop that turns each newly found failure into a test always targets the agent's current weak spots. It is the same discipline as regression testing in software, applied to agent behaviour. The failure-finding step (pink) is where the scale and clustering of slide 19 come in. One risk is drift: a living benchmark's difficulty changes over time, so scores from different months are not directly comparable unless results are stratified by date.

**Slide 18 — Reliability as a metric.** Two 8×8 grids of dots. Agent A: every row reads filled, ring, filled, filled, ring, filled, ring, filled, so five of eight columns are always filled; labels \~60% pass@1 and \~60% pass^8 (blue). Agent B: about the same number of filled dots, but scattered so every column has at least one ring; labels \~60% pass@1 and 0% pass^8 (red). Headline: "Both score the same on a single try, but they behave very differently." "Also report": variance across seeds; reworded instructions; changes to the environment; cost and latency. Read columns as tasks and rows as repeated trials. Agent A's successes are tied to specific tasks, so it is predictable and its reliable tasks can be delegated. Agent B succeeds at random, so none can. A leaderboard that reports only pass@1 would rank them equal. The four extra reports widen "reliability" beyond repeated sampling to robustness against paraphrase, environment change and budget. Worked example 1 reproduces this with numbers.

**Slide 19 — Testing at scale.** "1,000s or millions of simulated runs per agent. Rare failures only show up in volume. Group the failed runs to see which kinds of failure you have." A scatter of grey dots (runs) with three dashed ellipses of red dots: "Skipped a policy check", "Wrong tool inputs", "Gave up early". "Other areas that do this": self-driving (simulated miles) and software (fuzzing). The figure is a 2-D map of runs, in the style of an embedding plot: failures that look alike cluster together. Two lessons. First, rare failures need volume: a 1-in-1,000 failure is unlikely to appear in a 100-run evaluation. Second, a pile of failures is only actionable when grouped by cause; each cluster becomes a fix and a regression test. L15's Hodoscope and Docent are concrete tools; worked example 1 groups failures by normalised error signature.

**Slide 20 — Scoring the whole trajectory.** Six steps in a row: 1. Read the request; 2. Look up the order; 3. Skip the ID check (pink, "Policy violation"); 4. Cancel the order (blue tag, "Checker unsure: ask a person"); 5. Refund to a new card (pink, "Unsafe action"); 6. Tell the user it's done (black). Two score cards: "Pass. Outcome score: the order did get cancelled" and "2 flags. Process score: two steps a careful person would not take." Caption: "Humans are the scarce resource. Send them the important steps where the automatic checker is least sure." A final-state check would call this run a success. The process view finds two problems that matter more than the outcome: a skipped identity check and money sent to an unverified card, the classic social-engineering pattern. The blue tag shows the triage rule: the automatic checker handles what it is sure about and escalates the rest. Human review becomes a targeted resource, not a blanket cost.

**Slide 21 — How we already trust.** Pillar 2, Trust. Three columns: People (Track record, Credentials, Audits, Accountability); Software (Tests, Types, Code review, Continuous integration); Agents (four pink "?" boxes inside a dashed red border). Society already has mature trust mechanisms for both people and code; agents are a new kind of actor that fits neither column. The rows are analogous: track record ↔ tests (past evidence), credentials ↔ types (up-front guarantees), audits ↔ code review (independent inspection), accountability ↔ CI (ongoing consequences). The question marks invite the audience to fill in agent versions. The next three slides supply some: evidence attached to output, attention directed by the agent, and a track record that unlocks autonomy.

**Slide 22 — Show your work.** Left card, "Output only": "Here is the patch." with grey lines; "To check it, the person has to read the entire thing or redo the work." An arrow leads to the right card, "Output plus evidence": the patch plus five boxes, Tests it ran, Citations, Logs, Proofs (e.g. Lean), and A reason for each change. "The person checks the evidence instead of redoing the work." Evidence is how verification becomes cheaper than generation again (slide 15). A Lean proof is the extreme case: the proof assistant checks every step, and the human reads only the statement. Tests, logs and citations are weaker but still cheaper to check than the full work. Per-change reasons let a reviewer reject a single unjustified edit without re-deriving the whole patch. Evidence must be independently checkable, or it just adds more text to read.

**Slide 23 — Where to look.** A diff of apply\_refund(order, amount) with added lines marked by blue bars: an amount > order.total guard raising ValueError("too large"); ledger.credit(order.user, amount) (unchanged); db.run("DELETE FROM holds", order.user), highlighted red and tagged "Low confidence"; order.status = "refunded"; notify(order.user, "refund"); audit.log("refund", order.id). Headline: "The agent points the reviewer to the few lines that need a careful read." Ways to do it: calibrated confidence, flags on uncertain parts, summaries of what it did, review by risk, spot-checks and audits. The flagged line is the dangerous one: an irreversible delete scoped to the user rather than the order. A reviewer skimming seven lines might miss it; a reviewer told "read this one" will not. The approach works only if the agent's confidence is calibrated, so that flags concentrate real errors and unflagged lines are mostly safe.

**Slide 24 — Earned autonomy.** "Agents get more freedom on a type of task as their track record on it grows, the way driving automation is described in levels." Tag: "A good agent also knows when to ask." Five rising boxes: Level 1 Suggest (the person does the work); Level 2 Draft (the person approves every step); Level 3 Act, ask first on risky steps; Level 4 Act, with sample audits; Level 5 Act alone, on this type of task only (dark box). This converts reliability measurements (Pillar 1) into a trust policy (Pillar 2). The phrase "on this type of task only" is the key qualifier: autonomy is scoped, like a junior employee trusted with refunds but not with database migrations. Levels 3–5 depend on the agent asking when uncertain, so calibration appears again. Worked example 2 implements promotion and demotion with confidence bounds.

**Slide 25 — Closing.** Dark background. "Evaluation in AI has steadily moved from careful human checking to automation. The current problem is making verification keep up with what agents can do." The title slide's bars return, now with a filled red fifth box labelled "Rung 5": Reliability measured at scale; Evidence with the output; Attention where it matters; Autonomy that is earned. The question mark from slide 1 is answered, not with a benchmark but with a set of practices. Rung 5 combines automatic measurement with targeted human judgement, and it applies to deployed agents continuously rather than to a model once at release.

## Going deeper

The lecture's two pillars draw on older traditions: human-factors research on trust in automation, reliability engineering, and AI-safety work on scalable oversight. Knowing them makes the proposals easier to apply and to critique.

### Trust in automation before LLMs

Lee and See (2004) sit in a line of human-factors work from aviation, process control and driving. Sheridan and Verplank (1978) proposed ten *levels of automation*, from "the computer offers no assistance" to "the computer decides everything and ignores the human". Slide 24's five levels are a compressed version of that scale. Parasuraman and Riley (1997) named four ways people go wrong with automation: *use*, *misuse* (over-reliance), *disuse* (under-reliance) and *abuse* (deploying automation without regard for its effect on people). Lee and See then argued that trust is the attitude that mediates reliance, and that good design makes trust *calibrated* (matched to capability), *resolved* (fine-grained enough to distinguish situations) and *temporally specific* (updated as capability changes).

That last pair maps directly onto the lecture. Per-task-type autonomy is resolution: trust differs by task. Continuous evaluation and demotion are temporal specificity: trust follows the current model, not last quarter's. A known failure in this literature is *automation complacency*: when automation is right 99% of the time, human monitors stop checking, so the 1% slips through. Sampled audits at Level 4 must therefore be real reviews with feedback, not rubber stamps. Seeded known-bad cases ("canaries") are one way to check that reviewers are still catching errors.

### Reliability engineering: why pass^k is the deployment metric

Operations teams measure reliability in "nines": 99.9% availability means one failure in a thousand. Agent success rates are far from that. If each of 20 steps in a workflow independently succeeds with probability 0.99, the whole workflow succeeds with 0.99^20 ≈ 0.82. Errors compound with length, which is one reason time horizons and reliability are linked. Toby Ord (2025) showed that METR's data fit a simple *constant-hazard* model well: if an agent has a fixed chance of failing per unit of human-equivalent time, success decays exponentially with task length, giving each agent a characteristic "half-life". Under that model, doubling the horizon at 50% success does much less for 99% success: the 99% horizon is about 70 times shorter than the 50% horizon (ln 0.99 / ln 0.5 ≈ 0.0145).

pass^k is the evaluation counterpart of this mindset. It asks how often the agent is right every time, not how often it is right once. Site reliability engineering adds the idea of an *error budget*: decide in advance what failure rate is acceptable for a service, and slow down changes when the budget is spent. An autonomy level can be read the same way. Level 4 says the observed failure rate is within budget for this task type; exceeding the budget triggers demotion.

For practitioners coming from RPA, the contrast is useful. A classic RPA bot is deterministic: given the same screen it does the same thing, so pass@1 ≈ pass^k and failures come from environment changes (a moved button). An LLM agent is stochastic, so the same input can succeed and fail on different runs. Reliability must be measured by repetition, not assumed from one passing test.

### The statistics of a track record

Earned autonomy needs a rule for "enough evidence". Three tools are standard:

- **Rule of three.** If n independent trials show zero failures, a 95% upper confidence bound on the failure rate is about 3/n. To claim a failure rate below 1% with no failures observed you need about 300 runs; below 0.1%, about 3,000.
- **Wilson or Clopper–Pearson intervals** on the success rate, as in worked example 2. Promote when the *lower* bound clears the next level's bar, and demote when the *upper* bound falls below the current bar. Using opposite bounds gives hysteresis, so the level does not flap.
- **Sequential tests** (for example Wald's sequential probability ratio test) decide as soon as evidence is sufficient instead of at a fixed n, which matters when each run costs review time.

A trap is *audit-rate bias*. At Level 4 only a sample of runs is checked, so the record grows slowly and rare severe failures may never be audited. A sensible design audits more aggressively right after promotion and weights audits towards high-risk runs.

### Scalable oversight: making outputs checkable

AI-safety research asks the lecture's question at its limit: how can humans supervise systems whose work they cannot fully evaluate? Bowman et al. (2022) framed *scalable oversight* experiments in which non-experts, helped by an AI assistant, try to match expert judgements. Irving, Christiano and Amodei (2018) proposed *debate*: two AIs argue and a human judges, on the theory that it is easier to spot a flaw that an opponent points out than to find it yourself. Kirchner et al. (2024, OpenAI) trained "prover" models to write solutions that a small "verifier" model can check. Their outputs became more *legible* to time-limited humans too, at some cost in raw accuracy (a "legibility tax").

These are research versions of slides 22–23. "Show your work" is legibility. "Where to look" is a cooperative form of debate, where the agent itself points to the weak spots. Formal verification is the strongest form. In Lean or other proof assistants, and in verified code with machine-checked specifications, the evidence *is* the check. This is why mathematics and verified software are likely the first domains where long agent outputs become fully trustworthy.

### Open problems

- **Who verifies the evidence?** Agents can write tests that pass trivially, or cite sources that do not support the claim. Independent re-execution and citation checking (L10) help, but evidence can still be gamed once it is rewarded.
- **Calibrated confidence.** LLM self-reported confidence is often miscalibrated, especially out of distribution. Flags are only as good as their calibration on *your* tasks, so measure it: what fraction of flagged and unflagged items turn out wrong?
- **Process checkers can be Goodharted.** If agents are trained against a process scorer, they learn to look compliant (logging an ID check without doing it). Process scores need occasional ground-truth audits like any other proxy.
- **User-simulator fidelity.** τ-bench's LLM users are cheaper than humans but may be more cooperative, consistent or literal than real customers. Agents tuned to simulators can fail on real people.
- **Task-type boundaries.** Earned autonomy assumes you can say which tasks are "the same type". Real requests drift across boundaries, and an agent trusted on small refunds may receive a large one phrased the same way.
- **Week-long tasks.** No one yet has an automatic, general check for a week of agent work. Today's answer is decomposition: break the work into checkable milestones, each with its own evidence.

### Practical advice

1. Report pass^k (k = 4 or 8) next to pass@1 for any agent you plan to deploy, and look at per-task consistency, not just the average.
2. Log every production run with enough structure (tool calls, errors, final state) to cluster failures later.
3. Turn every incident into a test case in a living evaluation set, and date-stamp tasks so you can tell old from new.
4. Require evidence with outputs: test runs, logs, source links, and a one-line reason per change.
5. Score process as well as outcome for any task with policies or irreversible actions.
6. Grant autonomy per task type, with explicit promotion and demotion rules, and audit more right after a promotion or a model update.

## Worked example

This program reproduces slides 18 and 19 with numbers. Part 1 builds three agents with roughly the same average success (about 62–66%) and computes pass@k and pass^k from 8 trials on each of 40 tasks. Part 2 generates 300 failed refund-agent trajectories and groups them by a normalised error signature. Everything is simulated with a seeded random generator; no LLM is called (in a real harness, each trial would be a full agent run through `call_llm(messages) -> str` and a task checker).

```python
"""Reliability metrics over repeated runs, plus grouping failed runs by error signature.

Part 1: three synthetic agents with the same average success rate (~62.5%)
        but different structure. We compute mean success, pass@k (capability)
        and pass^k (reliability) with the unbiased combinatorial estimators.
Part 2: synthetic failed trajectories for a refund agent; we normalise each
        failure into an "error signature" and group them, as on slide 19.
No LLM is called: trajectories are generated by simple rules (seeded).
"""
import re
from collections import Counter
from math import comb
import numpy as np

rng = np.random.default_rng(22)
N_TASKS, N_TRIALS = 40, 8

def run_matrix(task_probs):
    """Rows = tasks, columns = independent trials; 1 = success."""
    p = np.asarray(task_probs)[:, None]
    return (rng.random((len(p), N_TRIALS)) < p).astype(int)

agents = {
    # A: each task is either always solved or never solved (slide 18, Agent A)
    "A consistent": run_matrix([1.0] * 25 + [0.0] * 15),
    # B: every task solved with the same 62.5% chance (slide 18, Agent B)
    "B coin-flip": run_matrix([0.625] * N_TASKS),
    # C: a realistic mix of easy, hard and flaky tasks
    "C mixed": run_matrix(np.clip(rng.beta(2.0, 1.2, N_TASKS), 0, 1)),
}

def pass_at_k(c, n, k):     # P(at least one of k draws succeeds)
    return 1.0 - comb(n - c, k) / comb(n, k)

def pass_hat_k(c, n, k):    # P(all k draws succeed)
    return comb(c, k) / comb(n, k)

ks = [1, 2, 4, 8]
print("agent          mean  | pass@k  k=1    2      4      8   | pass^k  k=1    2      4      8")
for name, m in agents.items():
    c = m.sum(axis=1)
    at = [np.mean([pass_at_k(ci, N_TRIALS, k) for ci in c]) for k in ks]
    hat = [np.mean([pass_hat_k(ci, N_TRIALS, k) for ci in c]) for k in ks]
    print(f"{name:13s} {m.mean():.3f} |       " + " ".join(f"{v:.3f}" for v in at)
          + " |       " + " ".join(f"{v:.3f}" for v in hat))
print("theory for B: pass^8 = 0.625**8 =", round(0.625 ** 8, 4),
      "| pass@8 = 1 - 0.375**8 =", round(1 - 0.375 ** 8, 4))
seed_means = agents["B coin-flip"].mean(axis=0)
print("B per-trial success (like 8 seeds):", np.round(seed_means, 3),
      "std =", round(seed_means.std(ddof=1), 3))

# ---------------- Part 2: group failed runs by error signature -------------
def fake_failure(i):
    """Return a failed trajectory as a list of (tool, message) steps."""
    kind = rng.choice(["skip_check", "bad_input", "gave_up", "timeout"], p=[.4, .3, .2, .1])
    oid, amt = rng.integers(1000, 9999), rng.integers(5, 500)
    steps = [("read_request", "ok"), ("lookup_order", f"order {oid} found")]
    if kind == "skip_check":
        steps += [("cancel_order", f"order {oid} cancelled"), ("refund", f"refunded ${amt}")]
    elif kind == "bad_input":
        bad = rng.choice(["amount", "order_id"])
        steps += [("verify_id", "ok"),
                  ("refund", f"ValueError: invalid {bad} '{amt if bad == 'amount' else 'X' + str(oid)}'")]
    elif kind == "gave_up":
        steps += [("respond", "I'm unable to help with this request.")]
    else:
        steps += [("verify_id", "ok")] + [("lookup_order", f"order {oid} found")] * 6
    return steps

def signature(steps):
    """Abstract away ids and amounts; keep the behavioural shape of the run."""
    tools = [t for t, _ in steps]
    errs = sorted({re.sub(r"'[^']*'|\$?\d+", "<v>", msg) for _, msg in steps if "Error" in msg})
    if errs:
        return "tool error: " + "; ".join(errs)
    if "refund" in tools and "verify_id" not in tools:
        return "policy: refund without verify_id"
    if tools[-1] == "respond" and len(tools) <= 3:
        return "gave up early (<=3 steps)"
    if max(Counter(tools).values()) >= 5:
        return "loop: repeated " + Counter(tools).most_common(1)[0][0]
    return "other"

failures = [fake_failure(i) for i in range(300)]
groups = Counter(signature(f) for f in failures)
print(f"\n{len(failures)} failed runs -> {len(groups)} failure groups")
for sig, n in groups.most_common():
    print(f"  {n:4d}  ({n / len(failures):5.1%})  {sig}")
print("raw distinct messages:", len({m for f in failures for _, m in f}))
```

Output (Python 3, NumPy 2.5):

```text
agent          mean  | pass@k  k=1    2      4      8   | pass^k  k=1    2      4      8
A consistent  0.625 |       0.625 0.625 0.625 0.625 |       0.625 0.625 0.625 0.625
B coin-flip   0.656 |       0.656 0.885 0.988 1.000 |       0.656 0.428 0.179 0.050
C mixed       0.647 |       0.647 0.832 0.938 0.975 |       0.647 0.462 0.275 0.150
theory for B: pass^8 = 0.625**8 = 0.0233 | pass@8 = 1 - 0.375**8 = 0.9996
B per-trial success (like 8 seeds): [0.675 0.725 0.525 0.675 0.625 0.725 0.725 0.575] std = 0.075

300 failed runs -> 5 failure groups
   104  (34.7%)  policy: refund without verify_id
    68  (22.7%)  gave up early (<=3 steps)
    53  (17.7%)  tool error: ValueError: invalid order_id <v>
    49  (16.3%)  tool error: ValueError: invalid amount <v>
    26  ( 8.7%)  loop: repeated lookup_order
raw distinct messages: 595
```

**What to notice**

- **Same pass@1, opposite reliability.** All three agents score about 0.63–0.66 on one try. Agent A's pass^8 stays at 0.625, while Agent B's collapses to 0.050, close to slide 18's "0%". B's theoretical value is 0.625^8 ≈ 0.023; the estimate is higher because B's realised rate (0.656) is above 0.625 and 40 tasks is a small sample.
- **pass@k rewards inconsistency; pass^k punishes it.** As k grows, B's pass@k rises to 1.000 and its pass^k falls, the fan shape of τ-bench's plot (slide 11). Agent A's two curves are flat and identical. A search-and-select system (L20) would prefer B; a deployed customer agent should prefer A.
- **The realistic agent sits in between.** C has easy tasks it always solves and flaky ones it sometimes solves, so its pass^8 (0.150) depends on how many tasks are fully reliable. That per-task breakdown tells you which task types could be delegated.
- **Seed variance is real.** B's eight per-trial success rates range from 0.525 to 0.725 (std 0.075). A single-seed evaluation could report anything in that range, which is why slide 18 says to report variance across seeds.
- **Grouping compresses failures.** 300 failures containing 595 distinct raw messages collapse into 5 groups once order ids and amounts are abstracted away. The biggest group, refunds without ID verification, is a *policy* failure that no tool error would reveal: only a process check (slide 20) finds it. Real systems use embeddings or LLM summaries instead of hand-written rules (L15's Hodoscope), but the principle is the same.

## More worked examples

Two more examples: a runnable earned-autonomy policy (slide 24) and a numeric walkthrough of where review hours go under four review strategies (slides 2, 20, 22 and 23).

### Example 1 (runnable): earned autonomy with confidence bounds

Each task type has its own autonomy level. A person checks every run at Levels 1–3 and only a sample at Levels 4–5. Promotion needs a minimum number of checked runs and a Wilson 95% lower bound on success above the next level's bar. Demotion happens when the upper bound drops below the current bar, or immediately when an audit finds a severe failure at Level 4 or 5. After any move the record restarts, so the new level must be earned with fresh evidence. Two task types are simulated over 5,000 runs: refunds (98.5% success, degrading to 90% after a model update at run 3,000) and data migrations (80% success throughout). Outcomes are random draws, not LLM calls.

```python
"""Earned autonomy: promote or demote an agent per task type from its track record.

Levels follow slide 24: 1 Suggest, 2 Draft, 3 Act/ask on risky steps,
4 Act with sample audits, 5 Act alone (this task type only).
Promotion needs enough runs AND a Wilson 95% lower bound on success above the
next level's bar. Demotion happens when the Wilson upper bound falls below the
current level's bar, or at once when an audit finds a severe failure at L4-L5
(at L1-L3 a person approves risky steps, so severe errors are caught first).
After any move the record restarts: the new level must be earned afresh.
Key subtlety: at levels 4-5 only audited runs are seen, so failures are
observed less often. Outcomes are simulated (seeded); no LLM is called.
"""
import math, random

random.seed(5)
NAMES = {1: "Suggest", 2: "Draft", 3: "Ask on risky", 4: "Sample audits", 5: "Act alone"}
BAR = {1: 0.0, 2: 0.70, 3: 0.85, 4: 0.93, 5: 0.97}    # min lower bound to hold level
MIN_N = {1: 0, 2: 20, 3: 50, 4: 150, 5: 400}           # min observed runs to reach level
AUDIT = {1: 1.0, 2: 1.0, 3: 1.0, 4: 0.20, 5: 0.05}     # fraction of runs a person checks
REVIEW_MIN = {1: 30, 2: 12, 3: 6, 4: 8, 5: 8}          # human minutes per checked run
WINDOW = 300                                           # judge on the most recent runs

def wilson(k, n, z=1.96):
    if n == 0:
        return 0.0, 1.0
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half

class TaskTypePolicy:
    def __init__(self, name):
        self.name, self.level, self.record, self.minutes = name, 1, [], 0.0
        self.log = []

    def observe(self, t, success, severe):
        if random.random() < AUDIT[self.level]:          # only checked runs count
            self.minutes += REVIEW_MIN[self.level]
            self.record = (self.record + [success])[-WINDOW:]
            if severe and not success and self.level >= 4:
                self._move(t, 3, "severe failure found in audit")
                return
        k, n = sum(self.record), len(self.record)
        lo, hi = wilson(k, n)
        nxt = self.level + 1
        if nxt <= 5 and n >= MIN_N[nxt] and lo >= BAR[nxt]:
            self._move(t, nxt, f"lower bound {lo:.3f} >= {BAR[nxt]} after {n} checked runs")
        elif self.level > 1 and hi < BAR[self.level]:
            self._move(t, self.level - 1, f"upper bound {hi:.3f} < {BAR[self.level]}")

    def _move(self, t, new, why):
        self.log.append(f"  run {t:5d}: L{self.level} -> L{new} ({NAMES[new]}): {why}")
        self.level = new
        self.record = []                                 # fresh evidence for the new level

def true_rate(task, t):
    if task == "refund":
        return 0.985 if t < 3000 else 0.90               # a model update degrades it
    return 0.80                                          # data migration: never great

for task in ["refund", "migration"]:
    pol, escaped = TaskTypePolicy(task), 0
    levels = []
    for t in range(1, 5001):
        ok = random.random() < true_rate(task, t)
        severe = (not ok) and random.random() < 0.2
        if not ok and pol.level >= 4:
            escaped += 1                                 # unreviewed by default
        pol.observe(t, ok, severe)
        levels.append(pol.level)
    print(f"{task}: final level L{pol.level} ({NAMES[pol.level]})")
    print("\n".join(pol.log))
    share = {l: levels.count(l) / len(levels) for l in range(1, 6) if l in levels}
    print("  time at each level:", {f"L{l}": f"{s:.0%}" for l, s in share.items()})
    print(f"  human review: {pol.minutes / 60:.0f} h over 5000 runs "
          f"(all-review baseline at 30 min/run: {5000 * 30 / 60:.0f} h)")
    print(f"  failures that ran at L4-L5 (checked only by audit sampling): {escaped}\n")
```

Output:

```text
refund: final level L3 (Ask on risky)
  run    20: L1 -> L2 (Draft): lower bound 0.839 >= 0.7 after 20 checked runs
  run    70: L2 -> L3 (Ask on risky): lower bound 0.865 >= 0.85 after 50 checked runs
  run   220: L3 -> L4 (Sample audits): lower bound 0.953 >= 0.93 after 150 checked runs
  run   570: L4 -> L3 (Ask on risky): severe failure found in audit
  run   720: L3 -> L4 (Sample audits): lower bound 0.963 >= 0.93 after 150 checked runs
  run  2149: L4 -> L3 (Ask on risky): severe failure found in audit
  run  2299: L3 -> L4 (Sample audits): lower bound 0.963 >= 0.93 after 150 checked runs
  run  2939: L4 -> L3 (Ask on risky): severe failure found in audit
  time at each level: {'L1': '0%', 'L2': '1%', 'L3': '50%', 'L4': '48%'}
  human review: 338 h over 5000 runs (all-review baseline at 30 min/run: 2500 h)
  failures that ran at L4-L5 (checked only by audit sampling): 41

migration: final level L2 (Draft)
  run    77: L1 -> L2 (Draft): lower bound 0.703 >= 0.7 after 77 checked runs
  time at each level: {'L1': '2%', 'L2': '98%'}
  human review: 1023 h over 5000 runs (all-review baseline at 30 min/run: 2500 h)
  failures that ran at L4-L5 (checked only by audit sampling): 0
```

**What to notice**

- **Autonomy is per task type.** The same agent reaches Level 4 on refunds but stays at Level 2 on migrations. An 80% success rate earns drafting help, not independence: its Wilson lower bound never clears 0.85.
- **Level 5 is never reached, and that is informative.** Reaching it needs 400 *audited* runs at Level 4, which at a 20% audit rate is about 2,000 runs without an audited severe failure. With 0.3% of runs severe (1.5% failures × 20% severe), about 1.2 severe failures are expected among 400 audited runs, so a demotion almost always comes first. "Act alone" requires a severe-failure rate far below one over the evidence window.
- **Drift blocks re-promotion.** After the model update at run 3,000, refund success drops to 90%. The agent, already back at Level 3 after the run-2,939 demotion, can no longer clear the 0.93 bar, so it stays at Level 3. Without fresh evidence after each move, the policy would have coasted on old successes.
- **Review time drops sharply, but not to zero.** Refunds cost 338 review hours against 2,500 for line-by-line review of everything. The price is 41 failures that ran at Level 4 with only a 1-in-5 chance of being audited. Whether that is acceptable depends on how reversible a failed refund is, the stakes question of slide 20.
- **The thresholds are policy choices.** BAR, MIN\_N and AUDIT encode risk appetite. A finance team might set Level 4's bar at 0.99 and audit 50%; a documentation bot could be far looser. Hysteresis (promote on the lower bound, demote on the upper bound, restart the record after each move) keeps the level from flapping.

### Example 2 (numeric walkthrough): where review hours go

A team receives 200 agent-written pull requests a week. From past audits, 8% contain a real defect, so 16 defective PRs arrive each week. A full careful review takes 40 minutes and catches 90% of defects. Compare four strategies.

**Strategy A: review every line (slide 2, left).** Time: 200 × 40 = 8,000 minutes ≈ 133.3 hours. Caught: 0.9 × 16 = 14.4. Escaped: 1.6 defects a week.

**Strategy B: YOLO (slide 2, right).** Time: 0. Escaped: all 16.

**Strategy C: random 20% spot-check.** Reviewed: 40 PRs, 40 × 40 = 1,600 minutes ≈ 26.7 hours. Defects in the sample: 0.2 × 16 = 3.2; caught 0.9 × 3.2 = 2.88. Escaped: 16 − 2.88 ≈ 13.1.

**Strategy D: evidence plus "where to look" (slides 22–23).** Each PR ships with tests it ran, logs and a reason per change, and the agent flags low-confidence PRs.

1. Every PR gets a 6-minute evidence check: 200 × 6 = 1,200 minutes = 20 hours. On unflagged PRs, the evidence check catches 50% of defects (a failing test, a missing reason, a log showing an unexpected delete).
2. The agent flags 50 PRs (25%). Its flags are calibrated: they contain 13 of the 16 defects (recall about 81%).
3. Flagged PRs get the full 40-minute review: 50 × 40 = 2,000 minutes ≈ 33.3 hours, catching 0.9 × 13 = 11.7.
4. Unflagged PRs contain 3 defects; the evidence check catches 0.5 × 3 = 1.5.

Total time ≈ 53.3 hours. Escaped: 16 − 11.7 − 1.5 = 2.8.

| Strategy | Human hours / week | Defects escaped / week | Escaped per 100 PRs |
| --- | --- | --- | --- |
| A. Review every line | 133.3 | 1.6 | 0.8 |
| B. YOLO | 0 | 16.0 | 8.0 |
| C. Random 20% spot-check | 26.7 | 13.1 | 6.6 |
| D. Evidence + calibrated flags | 53.3 | 2.8 | 1.4 |
| D′. Evidence + uncalibrated flags | 53.3 | 6.4 | 3.2 |

The last row repeats D with flags that are no better than random. Then the 50 flagged PRs hold only 25% of defects (4), so the full review catches 0.9 × 4 = 3.6. The 150 unflagged PRs hold 12 defects, and the evidence check catches 6. Escaped: 16 − 3.6 − 6 = 6.4.

**What to notice**

- **D sits in the poll's middle box.** It uses 40% of A's hours and lets through 2.8 defects instead of 1.6. Random spot-checking uses half of D's time but lets through almost five times as many defects.
- **Calibration is worth more than review time.** D and D′ cost exactly the same hours. Calibrated flags cut escapes from 6.4 to 2.8, because they send the scarce human time to the PRs that need it (slide 20's caption).
- **Evidence is a cheap first filter.** A 6-minute evidence check that catches half of the defects it sees is far cheaper per defect than a 40-minute review. This is the restored generate/verify asymmetry of slide 22.
- **Escapes are not all equal.** If one of the 2.8 escaped defects is an irreversible delete like slide 23's DELETE FROM holds, a risk-weighted rule (always fully review irreversible operations, whatever the flag) is worth adding on top.

## Key terms

| Term | Meaning |
| --- | --- |
| Agentic Benchmark Checklist (ABC) | Zhu et al. (2025): a checklist for task setup and reward design in agent benchmarks; flaws it targets can mis-estimate performance by up to 100% in relative terms. |
| Calibrated reliance | Relying on an agent exactly as much as its real reliability warrants; over-trust and under-trust are both failures (Lee and See, 2004). |
| Developer tests | Rung 3: checking an agent's code with the project's own tests; fail-to-pass tests encode the fix, pass-to-pass tests guard against breakage (SWE-bench). |
| Earned autonomy | Granting an agent more freedom on one task type as its track record grows: Level 1 Suggest, 2 Draft, 3 Ask on risky steps, 4 Sample audits, 5 Act alone. |
| Environment reward | Rung 2: a program inside a built environment scores the agent's actions automatically, e.g. WebShop's match to a hidden goal product. |
| Error signature | A normalised description of how a run failed (ids and values removed) used to group many failed runs into a few failure types. |
| Final-state check | Judging success by the world's end state (database rows, files, app state) rather than by the agent's words or path; used by τ-bench and WebArena. |
| Goodhart's law | "Once a measure becomes the target, it stops being a good measure"; why static benchmarks lose meaning as the field optimises against them. |
| Living benchmark | A test set that keeps adding new tasks (SWE-bench-Live, LiveCodeBench) so it cannot be memorised or leaked into training. |
| Outcome score | Whether the run achieved the goal ("the order did get cancelled"), regardless of how. |
| pass@k | Probability that at least one of k independent tries succeeds; a measure of capability or coverage. |
| pass^k | Probability that all k independent tries succeed on the same task; a measure of reliability (τ-bench). |
| Process score | Flags on individual steps that violate policy or are unsafe, even when the outcome passes ("2 flags"). |
| Reliability (pillar 1) | A property of the agent alone: does it work every time, across seeds, rewordings and environment changes? |
| Saturation | A benchmark reaching or exceeding human-level scores so it no longer separates models; MNIST took \~18 years, GLUE \~1. |
| Show your work | Delivering output with checkable evidence (tests run, logs, citations, proofs, a reason per change) so the person checks evidence instead of redoing the work. |
| Simulated user | An LLM prompted with a hidden scenario that plays the customer, so conversational agents can be tested without human testers (Rung 4). |
| Time horizon (50%) | The length of task, in skilled-human time, that an agent completes with 50% probability (METR); doubling every 4–7 months. |
| Trust (pillar 2) | A property of the person and agent together: does the person know when to rely on the agent? |
| Verification ladder | The sequence of ground-truth sources: human labels → environment reward → developer tests → simulated user + final state → ?; each automates more checking for a narrower set of tasks. |

## Self-check

1. What does "generation is cheap, verification is expensive" mean, and what determined evaluation in each era of AI?

   **Answer:** Producing agent output now costs little, but deciding whether it is correct still costs human time or a hard-to-build checker. Each era depended on who supplied ground truth and how much it cost: the presenter's say-so (demos), paid annotators (labels), environment code, developers' tests, and simulated users with state checks.
2. Name the four rungs of the verification ladder, an example and the main weakness of each.

   **Answer:** Human labels (ImageNet, SQuAD, GLUE): saturates quickly. Environment reward (WebShop): the reward is a proxy. Developer tests (SWE-bench): tests are incomplete. Simulated user plus final-state checks (τ-bench): one pass isn't reliability.
3. Why did the task era make "checking free", and what was the catch?

   **Answer:** Labels were paid for once, up front; after that, scoring any model was a free comparison with the gold label. The catch was that tasks had to be narrow enough to have a single correct label, and the fixed test set eventually saturated.
4. What does slide 7 show about saturation, and what principle explains it?

   **Answer:** Time from release to human-level performance shrank from about 18 years (MNIST) to about 6 (ImageNet) to about 1 (GLUE), and SuperGLUE lasted under two years. Goodhart's law explains it: once the field targets a fixed measure, optimisation and leakage make it stop measuring the underlying skill.
5. What is WebShop's "left open" problem, and why does it matter for RL?

   **Answer:** Its reward measures how well the chosen product matches a hidden goal product, which is only a proxy for what the user wanted. An agent trained with RL optimises the proxy, so any gap between proxy and intent becomes a target for reward hacking.
6. Two agents both have pass@1 of 60%. Agent A has pass^8 of 60%; Agent B has pass^8 of 0%. Explain what each pattern means.

   **Answer:** Agent A always solves the same 60% of tasks and always fails the rest, so its successes are predictable and those tasks can be delegated. Agent B succeeds at random on every task, so every task fails at least once in eight tries and nothing can be safely delegated.
7. Why does τ-bench check the final database state rather than the conversation?

   **Answer:** Many different dialogues can correctly complete the same request, so judging wording would penalise valid solutions. The final state (reservations changed or not) is what actually matters to the business and can be checked by code.
8. What does the time-horizon plot measure, and why does it create a verification problem?

   **Answer:** It measures the length of task (in skilled-human time) that agents complete half the time, which doubles every 4–7 months and is heading toward a week. Longer tasks take much longer to verify, and no ready-made automatic check exists for week-long work, so "the next rung is missing."
9. In the two-pillar grid, what goes in each cell, and which cell is most dangerous?

   **Answer:** Reliable and easy to verify: delegate. Reliable but hard to verify: blind faith. Unreliable but easy to verify: spot-check. Unreliable and hard to verify: don't use. Blind faith is the most dangerous in practice, because the agent may be good, but nobody can tell when it is not.
10. In slide 20's refund trajectory, why is the outcome a "Pass" while the process score is "2 flags"?

    **Answer:** The order was cancelled, so the final state is correct. But the agent skipped the ID check (a policy violation) and refunded to a new card (an unsafe action), which are steps a careful person would not take and which a fraudster could exploit.
11. How does "show your work" make verification cheaper?

    **Answer:** The agent attaches evidence such as tests it ran, logs, citations, proofs and a reason per change. The reviewer checks that evidence, which is cheaper than reading everything or redoing the work; a Lean proof, for example, is machine-checked, so only its statement needs reading.
12. What does "on this type of task only" add to Level 5 of earned autonomy, and why must a good agent "know when to ask"?

    **Answer:** Autonomy is scoped to task types where the agent has a track record; success on refunds says nothing about migrations. Levels 3–5 rely on the agent itself recognising risky or uncertain steps and escalating them, so its self-assessment must be calibrated.

## Practice problems

1. **(Calculation: capability versus reliability.)** An agent's tasks fall into three groups: 50% of tasks it solves with probability 0.95 per try, 30% with probability 0.6, and 20% with probability 0.1. Trials are independent. Compute pass@1, pass@4 and pass^4. Which group drives the drop from pass@1 to pass^4?

   **Solution:** pass@1 = 0.5 × 0.95 + 0.3 × 0.6 + 0.2 × 0.1 = 0.475 + 0.18 + 0.02 = 0.675. pass^4 = 0.5 × 0.95^4 + 0.3 × 0.6^4 + 0.2 × 0.1^4 = 0.5 × 0.8145 + 0.3 × 0.1296 + 0.2 × 0.0001 = 0.4073 + 0.0389 + 0.0000 ≈ 0.446. pass@4 = 0.5 × (1 − 0.05^4) + 0.3 × (1 − 0.4^4) + 0.2 × (1 − 0.9^4) = 0.5 × 1.0000 + 0.3 × 0.9744 + 0.2 × 0.3439 ≈ 0.861. The middle group drives the drop: it contributes 0.18 to pass@1 but only 0.039 to pass^4. The reliable group loses only 0.07 (0.475 → 0.407). Improving the 0.6 tasks to 0.9 would raise pass^4 by 0.3 × (0.6561 − 0.1296) ≈ 0.158, more than any other single change.
2. **(Calculation: unbiased estimators.)** A task was run n = 10 times with c = 7 successes. Estimate pass^3 and pass@3 for this task with the combinatorial estimators. Compare with the plug-in values (c/n)^3 and 1 − (1 − c/n)^3, and explain the difference.

   **Solution:** pass^3 = C(7,3) / C(10,3) = 35 / 120 ≈ 0.292. pass@3 = 1 − C(3,3) / C(10,3) = 1 − 1/120 ≈ 0.992. Plug-in: 0.7^3 = 0.343 and 1 − 0.3^3 = 0.973. The combinatorial estimators draw k of the n observed trials *without* replacement, which gives unbiased estimates of the true p^k and 1 − (1 − p)^k. The plug-in versions raise a noisy estimate of p to a power, which is biased: (c/n)^k overestimates p^k on average, because E\[X^k\] > (E\[X\])^k for a random proportion X when k > 1 (Jensen's inequality). With small n the bias is large: 0.343 versus 0.292 here.
3. **(Calculation: testing at scale.)** A failure mode occurs in 0.2% of runs. (a) How many independent runs give a 95% chance of seeing it at least once? (b) After 1,500 runs with zero occurrences, what can you claim? (c) Why does slide 19 say to group failures rather than just count them?

   **Solution:** (a) Need 1 − 0.998^n ≥ 0.95, so n ≥ ln 0.05 / ln 0.998 = −2.996 / −0.002002 ≈ 1,496.4, so 1,497 runs. A 100-run evaluation sees it with probability only 1 − 0.998^100 ≈ 18%. (b) By the rule of three, zero failures in n runs gives a 95% upper bound of about 3/n = 3/1,500 = 0.2% on the rate. So you can say the rate is below about 0.2%, not that the failure does not exist. (c) At scale you will see hundreds of failures. A single count says how often things go wrong but not why; grouping by cause turns them into a short list of fixes and regression tests, and shows which group is largest.
4. **(Calculation: time horizons and reliability.)** An agent's 50% time horizon is 8 working hours. (a) With doubling times of 4 and 7 months, when does it reach one working week (40 hours)? (b) Under a constant-hazard model (success = 0.5^(t / T50)), what task length does it complete with 99% probability when T50 = 40 hours? (c) What does (b) imply for verification?

   **Solution:** (a) 40 / 8 = 5, so log2(5) ≈ 2.32 doublings: 2.32 × 4 ≈ 9.3 months, or 2.32 × 7 ≈ 16.3 months. (b) Solve 0.5^(t/40) = 0.99: t = 40 × ln 0.99 / ln 0.5 = 40 × 0.0145 ≈ 0.58 hours ≈ 35 minutes. (c) Even an agent that finishes week-long tasks half the time is near-certain only on tasks of about half an hour. Every longer task needs checking, and the amount of work to check grows with the horizon. That is slide 15's crossing curves: the generation side races ahead while the 99%-reliable zone stays short.
5. **(Calculation: earned-autonomy thresholds.)** Using the Wilson 95% lower bound, decide: (a) does 148 successes out of 150 audited runs clear Level 4's bar of 0.93? (b) With zero failures, how many consecutive audited successes are needed for the lower bound to reach Level 5's bar of 0.97? (c) Why is "one failure resets the clock" a reasonable extra rule for severe failures?

   **Solution:** (a) p̂ = 148/150 = 0.9867, z² = 3.8416. Centre = (0.9867 + 3.8416/300) / (1 + 3.8416/150) = 0.9995 / 1.0256 = 0.9745. Half-width = 1.96 × √(0.9867 × 0.0133/150 + 3.8416/90,000) / 1.0256 = 1.96 × √(0.0000877 + 0.0000427) / 1.0256 = 1.96 × 0.01142 / 1.0256 ≈ 0.0218. Lower bound ≈ 0.953 ≥ 0.93, so yes. (b) With p̂ = 1 the Wilson lower bound simplifies to n / (n + z²). Solve n / (n + 3.8416) ≥ 0.97: n ≥ 0.97 × 3.8416 / 0.03 ≈ 124.2, so 125 runs (124 gives 0.96995). (c) Success-rate bounds treat all failures alike, but one severe failure (money sent to a fraudster) can cost more than hundreds of successes earn. Its presence is strong evidence that the severe-failure rate is not negligible, which the success-rate bound cannot capture.
6. **(Design: routing human attention.)** A process checker scores 10,000 agent steps a day with an estimated probability of a policy violation. 9,000 steps have p = 0.001, 900 have p = 0.05, and 100 high-stakes steps have p = 0.4. Reviewers can inspect 200 steps a day and catch every violation they inspect. Compare random review with targeted review. What assumption makes targeting work?

   **Solution:** Expected violations: 9,000 × 0.001 + 900 × 0.05 + 100 × 0.4 = 9 + 45 + 40 = 94. Random review of 200 steps (2%) catches 0.02 × 94 ≈ 1.9. Targeted review takes all 100 high-stakes steps (40 violations) plus 100 of the p = 0.05 steps (5 violations), catching about 45, roughly 24 times more. The high-stakes steps also sit where the checker is least sure (p near 0.5), matching slide 20's rule. The key assumption is calibration: the checker's p must be roughly right. If the 9,000 "safe" steps really hide a 1% rate, 90 violations sit where nobody looks. So keep a small random audit of low-score steps to measure calibration.
7. **(Debugging a trajectory.)** An airline agent receives: "Cancel my flight next Tuesday, I booked it three days ago." Policy: basic-economy tickets are refundable only within 24 hours of booking or with travel insurance. Trajectory: (1) get\_user\_details; (2) get\_reservation shows basic economy, no insurance, booked 72 hours ago; (3) cancel\_reservation; (4) refund to original payment; (5) "Done, your refund is on its way." The τ-bench-style expected final state is "reservation unchanged". Grade outcome and process, and name the root cause.

   **Solution:** Outcome: fail. The final database shows a cancelled reservation and an issued refund, but the policy-compliant state is "unchanged" (the agent should refuse or offer non-refund options). Process: two flags. Step 3 is a policy violation: it cancelled a non-refundable ticket without checking eligibility. Step 4 is an unsafe financial action: it issued money the policy forbids. Step 5 also misinforms the user. Root cause: the agent read the facts (step 2 returned them) but never applied the policy. Fixes: a pre-action policy check before any cancel or refund tool; a process checker rule "refund requires an eligibility check in the trajectory"; and an escalation at Level 3 ("ask first on risky steps") for refunds. Note the opposite case too: had the agent correctly refused but been rude or confusing, the outcome would pass while the user is unhappy, which a final-state check cannot see.
8. **(Critique: evidence that misleads.)** An agent's pull request says "All 412 tests pass" and attaches a log. Give three ways this evidence could mislead, and how a reviewer or pipeline should check each.

   **Solution:** (1) *The agent changed the tests.* It may have deleted, skipped or weakened failing tests. Check the diff for test-file changes and re-run the original suite from the base commit. (2) *The log is not from this code.* It may come from an earlier commit or be partly generated. Re-run tests in CI from a clean checkout; trust only CI-produced logs. (3) *The tests do not cover the change.* 412 passing tests may not exercise the new code path. Check coverage of changed lines, and require at least one new test that fails before the change and passes after it (a fail-to-pass test, as in SWE-bench). The general rule: evidence is useful only when it can be independently reproduced or verified, not just read.
9. **(Analysis: living benchmarks and contamination.)** A model with training cutoff in March scores 72% on LiveCodeBench problems released before March and 46% on problems released after. (a) Give two explanations for the gap. (b) How would you tell them apart? (c) Which score should you report?

   **Solution:** (a) Contamination: earlier problems or their solutions were in training data, inflating the first score. Or difficulty drift: later problems may be harder. (b) Compare a model with a *later* cutoff on the same two windows. If its scores on both windows are similar while the first model's drop, contamination explains the gap. Also compare difficulty labels across windows, and check whether other models with older cutoffs show the same date-based drop. (c) Report the post-cutoff score (46%) as the headline, since it measures generalisation to unseen problems. Report the pre-cutoff score separately and flag the gap. This is exactly why slide 17 says a changing test set "can't be memorized".
10. **(Design: a verification plan for an invoice-processing agent.)** An agent reads supplier invoices (PDFs), matches them to purchase orders in an ERP system, and schedules payments. Design its evaluation and trust scheme using the lecture's ideas: rungs, metrics, process checks, evidence, review routing and autonomy levels.

    **Solution:** *Rungs:* build a sandbox ERP with seeded suppliers and POs (Rung 2), and write scenario tasks with known correct final states: invoice matched, amount and due date correct, or invoice rejected as a duplicate or mismatch (Rung 4's final-state check). Simulate supplier emails with an LLM user for disputes. *Metrics:* field-level accuracy, final-state success, pass^8 per scenario type, cost per invoice, plus variance across seeds, reworded emails and new PDF layouts. *Process checks:* flag payment scheduled without a PO match, bank-detail changes accepted from email, amounts above tolerance, and duplicates. *Evidence:* every action ships with the extracted fields linked to page coordinates in the PDF, the PO line it matched, and the tolerance check result, so a reviewer verifies in seconds. *Routing:* humans review flagged runs, low-confidence extractions and anything above an amount threshold; a small random sample of the rest measures calibration. *Autonomy:* per invoice type, starting at Level 2 (draft entries for approval). Promote to Level 3 when Wilson lower bounds clear the bar, so the agent posts entries but asks before scheduling payment. Allow Level 4 for small recurring invoices from known suppliers with sample audits. Never grant Level 5 for bank-detail changes. Demote on any severe audit finding or after a model or ERP update. *Continuous loop:* log every run, cluster failures by signature (for example, "wrong due date on two-page invoices"), and add each cluster to the scenario set.

## References and further reading

Links were checked in November 2026; arXiv abstract pages are used where they exist.

### Cited in the lecture

**Part 1: history (slides 4–7)**

- [Procedures as a Representation for Data in a Computer Program for Understanding Natural Language](https://dspace.mit.edu/handle/1721.1/7095) — Terry Winograd, MIT, 1971 — the SHRDLU thesis; the blocks-world demo on slide 4.
- [ELIZA — A Computer Program for the Study of Natural Language Communication between Man and Machine](https://doi.org/10.1145/365153.365168) — Joseph Weizenbaum, 1966 — the other demo-era classic named on slide 4.
- [Building a Large Annotated Corpus of English: The Penn Treebank](https://aclanthology.org/J93-2004/) — Marcus, Santorini, Marcinkiewicz, 1993 — the NLP landmark of the task era.
- [Gradient-Based Learning Applied to Document Recognition](https://doi.org/10.1109/5.726791) — LeCun, Bottou, Bengio, Haffner, 1998 — the paper that introduced MNIST.
- TREC-8 Question Answering track — Voorhees (NIST), 1999 — the QA benchmark on slide 5 ("Who wrote Hamlet?").
- [ImageNet: A Large-Scale Hierarchical Image Database](https://doi.org/10.1109/CVPR.2009.5206848) — Deng et al., 2009 — the vision dataset whose saturation took about 6 years.
- [Microsoft COCO: Common Objects in Context](https://arxiv.org/abs/1405.0312) — Lin et al., 2014 — 330K images, on slide 6's timeline.
- [SQuAD: 100,000+ Questions for Machine Comprehension of Text](https://arxiv.org/abs/1606.05250) — Rajpurkar et al., 2016 — the 100K-question reading benchmark.
- [GLUE](https://arxiv.org/abs/1804.07461) and [SuperGLUE](https://arxiv.org/abs/1905.00537) — Wang et al., 2018 and 2019 — the benchmarks saturated in about one and under two years.
- [The Arcade Learning Environment](https://arxiv.org/abs/1207.4708) — Bellemare et al., 2013 — Atari games as RL benchmarks.
- [OpenAI Gym](https://arxiv.org/abs/1606.01540) — Brockman et al., 2016 — the standard RL environment interface (with MuJoCo robots); Go refers to AlphaGo ([Silver et al., 2016](https://doi.org/10.1038/nature16961)).
- [Dynabench: Rethinking Benchmarking in NLP](https://arxiv.org/abs/2104.14337) — Kiela et al., 2021 — source of the saturation chart and the case for dynamic, human-in-the-loop benchmarks.

**Part 2: agent benchmarks (slides 8–14)**

- [Language Understanding for Text-based Games Using Deep Reinforcement Learning](https://arxiv.org/abs/1506.08941) — Narasimhan, Kulkarni, Barzilay, 2015 — LSTM-DQN, the text-game agent on slide 8.
- [TextWorld: A Learning Environment for Text-based Games](https://arxiv.org/abs/1806.11532) — Côté et al. (Microsoft), 2018 — procedurally generated text games.
- [Interactive Fiction Games: A Colossal Adventure](https://arxiv.org/abs/1909.05398) — Hausknecht et al., 2019 — Jericho, classic interactive-fiction games as an RL benchmark.
- [World of Bits: An Open-Domain Platform for Web-Based Agents](https://proceedings.mlr.press/v70/shi17a.html) — Shi et al., ICML 2017 — introduced MiniWoB's small web tasks.
- [WebShop: Towards Scalable Real-World Web Interaction with Grounded Language Agents](https://arxiv.org/abs/2207.01206) — Yao, Chen, Yang, Narasimhan, 2022 — Rung 2: 1M+ products, automatic reward from a hidden goal product.
- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) — Jimenez, Yang et al., 2023 — Rung 3: real issues checked by developer tests.
- [Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) — OpenAI with the SWE-bench authors, 2024 — the 500-task human-validated subset behind "90%+".
- [τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045) — Yao, Shinn, Razavi, Narasimhan, 2024 — Rung 4: simulated users, final-state checks and pass^k.
- [WebArena: A Realistic Web Environment for Building Autonomous Agents](https://arxiv.org/abs/2307.13854) — Zhou et al., 2023 — self-hosted web apps with functional checkers.
- [Mind2Web](https://arxiv.org/abs/2306.06070) — Deng et al., 2023 — generalist web agents across many real sites.
- [VisualWebArena](https://arxiv.org/abs/2401.13649) — Koh et al., 2024 — visually grounded web tasks.
- [WebVoyager](https://arxiv.org/abs/2401.13919) — He et al., 2024 — end-to-end agent on live websites with a multimodal evaluator.
- [WorkArena: How Capable Are Web Agents at Solving Common Knowledge Work Tasks?](https://arxiv.org/abs/2403.07718) — Drouin et al. (ServiceNow), 2024 — enterprise-software tasks.
- [BrowseComp: A Simple Yet Challenging Benchmark for Browsing Agents](https://arxiv.org/abs/2504.12516) — Wei et al. (OpenAI), 2025 — hard-to-find, easy-to-verify answers.
- [OSWorld](https://arxiv.org/abs/2404.07972) — Xie et al., 2024 — desktop tasks with state checks; [OSWorld-Verified](https://xlang.ai/blog/osworld-verified) is its 2025 audited version.
- [GDPval: Evaluating AI Model Performance on Real-World Economically Valuable Tasks](https://arxiv.org/abs/2510.04374) — OpenAI, 2025 — expert-graded professional deliverables.
- [Finance Agent Benchmark](https://arxiv.org/abs/2508.00828) — Vals AI and collaborators, 2025 — financial-analyst research tasks.
- [Introducing BigLaw Bench](https://www.harvey.ai/blog/introducing-biglaw-bench) — Harvey, 2024 — legal tasks graded by rubric.
- [SWE-Bench Pro: Can AI Agents Solve Long-Horizon Software Engineering Tasks?](https://arxiv.org/abs/2509.16941) — Scale AI, 2025 — harder, contamination-resistant coding tasks.
- [Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces](https://arxiv.org/abs/2601.11868) — Terminal-Bench team, 2026 — the paper behind Terminal-Bench 2.0.
- [MLE-bench](https://arxiv.org/abs/2410.07095) — Chan et al. (OpenAI), 2024 — Kaggle competitions for ML-engineering agents.
- [RE-Bench](https://arxiv.org/abs/2411.15114) — Wijk et al. (METR), 2024 — research-engineering tasks against human experts.
- [PaperBench: Evaluating AI's Ability to Replicate AI Research](https://arxiv.org/abs/2504.01848) — Starace et al. (OpenAI), 2025 — rubric-graded paper replication.
- [GAIA: a benchmark for General AI Assistants](https://arxiv.org/abs/2311.12983) — Mialon et al., 2023 — multi-step questions with short checkable answers.
- [τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment](https://arxiv.org/abs/2506.07982) — Barres et al., 2025 — τ-bench's successor where the user also acts.
- [MCP-Atlas: A Large-Scale Benchmark for Tool-Use Competency with Real MCP Servers](https://arxiv.org/abs/2602.00933) — Scale AI, 2026 — tool use against real MCP servers.
- [Establishing Best Practices for Building Rigorous Agentic Benchmarks](https://arxiv.org/abs/2507.02825) — Zhu et al., 2025 — the Agentic Benchmark Checklist; documents benchmark bugs and up-to-100% mis-estimates.
- [Measuring AI Ability to Complete Long Tasks](https://arxiv.org/abs/2503.14499) — Kwa et al. (METR), 2025 — the 50% time-horizon metric and its doubling trend.

**Part 3: reliability and trust (slides 15–25)**

- [Trust in Automation: Designing for Appropriate Reliance](https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392) — John D. Lee and Katrina A. See, Human Factors, 2004 — the source of "calibrated reliance".
- [SWE-bench goes live](https://arxiv.org/abs/2505.23419) — Zhang et al. (Microsoft), 2025 — SWE-bench-Live, a continuously updated issue benchmark.
- [LiveCodeBench: Holistic and Contamination Free Evaluation of Large Language Models for Code](https://arxiv.org/abs/2403.07974) — Jain et al., 2024 — date-stamped problems for contamination-free scoring.
- [Lean](https://lean-lang.org/) — the proof assistant named on slide 22 as machine-checkable evidence.

### Further reading

- [Is there a half-life for the success rates of AI agents?](https://arxiv.org/abs/2505.05115) — Toby Ord, 2025 — a constant-hazard reading of METR's data; explains why 99% horizons are far shorter than 50% horizons.
- [AI Agents That Matter](https://arxiv.org/abs/2407.01502) — Kapoor, Stroebl, Siegel, Nadgir, Narayanan (Princeton), 2024 — argues for cost-aware, reproducible agent evaluation; complements slide 18's "also report" list.
- [Measuring Progress on Scalable Oversight for Large Language Models](https://arxiv.org/abs/2211.03540) — Bowman et al., 2022 — the research framing of humans supervising outputs they cannot fully check.
- [AI safety via debate](https://arxiv.org/abs/1805.00899) — Irving, Christiano, Amodei, 2018 — adversarial agents pointing out each other's flaws, a cousin of "where to look".
- [Prover-Verifier Games improve legibility of LLM outputs](https://arxiv.org/abs/2407.13692) — Kirchner et al. (OpenAI), 2024 — training outputs to be checkable, the research version of "show your work".
- Humans and Automation: Use, Misuse, Disuse, Abuse — Parasuraman and Riley, Human Factors, 1997 — the taxonomy behind over- and under-trust.
- Human and Computer Control of Undersea Teleoperators — Sheridan and Verplank, MIT, 1978 — the original ten levels of automation, ancestor of slide 24's five.
- SAE J3016, Taxonomy and Definitions for Terms Related to Driving Automation Systems — SAE International (2014, revised since) — the six driving-automation levels the earned-autonomy slide alludes to.
- Lecture sheets L15 (Hodoscope and Docent for monitoring at scale), L19 (PULSE) and L20 (pass@k and verifiers) in these notes, plus topic sheets T9 and T15.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Previous lecture: [[L21 - Search and Planning]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- Topic deep dive: [[T13 - Workflow Orchestration and Agent Monitoring]]
- Topic deep dive: [[T14 - Agent Safety and Security - Sandboxes, Permissions, Injection and Monitoring]]
- Topic deep dive: [[T15 - Human-Agent Interaction and Agents for Real-World Work]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]
- [[4 Ways to Test ML Models in Production]]

[[L21 - Search and Planning|← L21]] · [[CMU 11-768 AI Agents - Course Index|Course index]]
