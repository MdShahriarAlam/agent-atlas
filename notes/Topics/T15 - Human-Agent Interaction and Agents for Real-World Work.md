---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, human-agent-interaction, evaluation, future-of-work]
aliases: ["CMU T15", "Human–Agent Interaction and Agents for Real-World Work"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 15 · Human–Agent Interaction and Agents for Real-World Work

[[T14 - Agent Safety and Security - Sandboxes, Permissions, Injection and Monitoring|← T14]] · [[CMU 11-768 AI Agents - Course Index|Course index]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L07 - Computer Use Agents]], [[L10 - Deep Research Agents]], [[L13 - Agent Safety]], [[L14 - OpenHands]], [[L17 - AI Agents for Human Work]], [[L18 - Multi-agent Systems]], [[L19 - Human-AI Collaboration]], [[L22 - How to Trust Your AI Agents]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L7, L10, L13, L14, L17, L18, L19, L22 · 11-768 AI Agents, Fall 2026

## Overview

Human–agent interaction and agents for real-world work is the study of how agents fit the work people actually do: which tasks they should take on, how much the person stays involved, how they are steered and evaluated on open-ended deliverables, and what they change for workers. It matters because an agent that tops a benchmark can still be useless at work: L17 (Wang) shows frontier agents at about 80% on SWE-Bench Pro yet completing only about one Remote Labor Index project in five.

**Why it matters for building real agents.** Almost every deployed agent has a person on the other side who holds information the agent lacks, sets preferences it cannot guess, approves risky actions and must review what it produces. Optimising for fully autonomous success therefore misses the quantities that decide value: how much human time a task takes end to end, whether the output is reviewable, and whether the agent asks the right question at the right moment. MIT NANDA's enterprise survey (cited in L17) finds the top barriers are "it doesn't learn from our feedback" (about 66%) and "too much manual context required each time" (about 63%), not raw intelligence. For an RPA practitioner this is familiar: the exception queue, not the happy path, decides whether automation pays.

**Key questions this sheet answers.**

- What is "work" when we say agents will do it, and how do O\*NET tasks, occupations and freelance projects turn it into benchmarks?
- Why do benchmark scores overstate usefulness at work, and what is construct validity?
- How do you build realistic tasks, environments and data for workplace agents (GDPval, Remote Labor Index, JobBench, TheAgentCompany, Gym-Anything, Terminal-Bench)?
- How do you evaluate fuzzy deliverables: execution checks, expert rubrics, LLM-generated rubrics, evolving rubrics from training or from user feedback, and the biases of LLM judges?
- What levels of human involvement exist (Human Agency Scale H1–H5), and which tasks do workers want automated versus augmented (WORKBank)?
- How do users steer agents at run time (CowPilot, the four interaction modes), and how do you measure collaboration rather than autonomy (CollabSkill, patch bloat)?
- How do you train collaborative agents with simulated users (SWEET-RL, PPP, CollabLLM), and why does one frozen simulator cause simulator collapse?
- What do efficiency, safety, meaningful work and labour economics add to the picture?

**Which lectures cover it.**

- **L17 (Zora Wang, "AI Agents for Human Work")** is the main lecture: the reality check, the task / environment / evaluation triad, and "capable agents are not enough" (collaboration, efficiency, safety, joy of work, labour market).
- **L18 (Vaduguru, multi-agent systems)** supplies the training side: human–agent interaction as a two-agent, partially observed problem; user simulators; PPP's three-part reward; simulator collapse; Generative Agents and agentic marketplaces as simulations of people.
- **L7 (computer use)** gives the environments and judge-error arithmetic; **L10 (deep research)** gives expert rubrics and DR Tulu's evolving rubrics; **L13 (safety)** gives confirmation, stop controls and alert fatigue; **L14 (OpenHands)** gives interfaces (CLI, IDE, GUI, integrations) and the "Code with Me or for Me?" human study; **L15 (orchestration)** gives the human-approval interrupt as a workflow node.

**Lecture 19.** L19 (Valerie Chen, Stanford, "Rethinking Human-AI Collaboration in the Agentic Era") is a second core lecture for this topic. It moves from simulated to real users: mixed-initiative guidelines mapped onto before / during / after (Core concept 10), proactive agents and timing (11), learning from implicit interaction with PULSE, critics and real-time RL (12, Mechanics 11), and downstream effects on comprehension, maintainability and upskilling (13).

**Lecture 22.** L22 (Karthik Narasimhan, guest, Princeton, "How to Trust Your AI Agents") is mainly an evaluation lecture (T9), but its second pillar, trust between person and agent, belongs here. It adds calibrated reliance, show-your-work evidence, targeted human attention and earned autonomy levels 1–5 (Core concept 14, Mechanics 12).

**Prerequisites.** The agent loop and benchmarks (T1), computer-use environments (T7), rubric rewards and verifiers (T12), basic policy-gradient RL (T11), and evaluation methodology in general (T9). Multi-agent coordination beyond the human case lives in T5; safety controls in T14.

**Suggested reading path.**

1. Read Core concepts 1–2 (what work is; the reality gap) with L17's reality-check section.
2. Read Core concepts 3–4 (tasks, environments, evaluation) next to T9 and L10's rubric section.
3. Read Core concepts 5–7 (agency levels, steering, collaboration benchmarks), then L14 §5 and L15's approval interrupts.
4. Read Core concept 8 (simulated users) with L18 §7, then run the Hands-on program.
5. Finish with Core concept 9 (efficiency, safety, meaningful work, labour market) and the Open problems.

## Concept map

![[cmu-ai-agents-T15-concept-map.png]]
*Concept map: Concept map · real work → benchmarks → reality gap → the human–agent pair → value at work*

Read top to bottom: the task / environment / evaluation triad turns real work into benchmarks, autonomous capability falls short of work (the reality gap), and the human–agent pair, trained with simulated users and graded by rubrics that evolve from its own interaction signals, is what delivers value under efficiency, safety and meaningful-work constraints.

## Core concepts

The core idea is that "agents doing work" has three parts that benchmarks usually collapse into one: a realistic piece of work, an honest judgement of the deliverable, and a person who shares the task with the agent. The fourteen subsections build from what work is, through how we measure agents on it, to how agents and people share it and what that does to jobs.

### 1. What "work" is: tasks, occupations and projects

A **task** is a unit of work with an input, an output and a person who would normally do it: "negotiate prices and discount terms with suppliers". An **occupation** is a bundle of such tasks. This *task-based view* comes from labour economics (Autor, Levy and Murnane, 2003) and is the frame every work benchmark in L17 inherits.

**O\*NET.** The U.S. Department of Labor's O\*NET database describes each occupation as a list of tasks. L17 (Wang) shows "Wholesale and Retail Buyers, Except Farm Products" (SOC 13-1022.00) with 16 tasks, from negotiating with suppliers to recommending mark-up rates. O\*NET covers roughly 900 occupations (Gym-Anything uses 894), so it is the natural sampling frame for "all human work". Occupations are grouped into 22 **SOC major groups** (Standard Occupational Classification), such as Computer and Mathematical, or Office and Administrative Support.

**Projects, not tasks.** Mazeika et al. (Remote Labor Index, 2025) argue O\*NET misses the long tail of real commissioned work. A freelance **project** bundles many tasks into one deliverable a client pays for: an animated advert, architectural plans, a browser game. Grading a project asks one hard question: would a client accept this as the commissioned work?

**Work people want help with.** JobBench (Li et al., 2026) adds a third lens: which tasks do workers *want* to delegate? L17's example contrasts reporters, who most want help with fact-checking across records, with GDPval's reporter task (editing an already-assembled source packet). Beyond the lecture: the JobBench paper has 130 tasks across 35 occupations, graded by about 35.6 binary rubric criteria per task, and its best configuration (Claude Opus 4.7 in Claude Code) scored 45.9%.

**How long a task is.** METR's *50% time horizon* (L17, slide 3) measures task length by how long a human expert takes, then fits a logistic curve of model success against log task length. The length at which success is 50% has doubled about every 7 months, from seconds (GPT-2) to minutes (GPT-4) to hours (Claude Opus 4.6), with an early Claude Mythos Preview above 16 hours. L17 immediately asks whether 50% is the right bar: a worker who fails half the time would not keep the job. Mechanics derives how much shorter the 80% or 90% horizon is.

**Exposure versus use.** Eloundou et al. ("GPTs are GPTs", 2023) estimate about 80% of U.S. workers could have at least 10% of their tasks affected by LLMs, mostly writing and programming. That is *theoretical* exposure. L17's radar chart from Anthropic's "How AI is transforming work" contrasts it with *observed* coverage, which is a small polygon peaking in computer/math and office/admin. Beyond the lecture: Anthropic's Economic Index paper (Handa et al., 2025), over four million Claude conversations, finds about 36% of occupations use AI for at least a quarter of their tasks, with 57% of use augmenting and 43% automating.

| Lens | Unit | Source of tasks | Typical grader | Example |
| --- | --- | --- | --- | --- |
| Occupational tasks | O\*NET task | Experts per occupation | Expert rubric + LLM judge | GDPval (44 occupations, 220 gold tasks) |
| Freelance projects | Whole deliverable | Freelancers' real projects | Client-acceptance judgement | Remote Labor Index (240 projects) |
| Worker-desired tasks | Task workers want gone | Worker/expert desire surveys | Fact-anchored rubric chain | JobBench (130 tasks, 35 occupations) |
| Observed activity | Recorded trace | Real computer use | Trajectory verifier | OpenCUA (22.5K traces) |

*Common misconception:* "An occupation is automated when an agent can do its headline task." Occupations are bundles; automating one task usually changes the job rather than removing it (subsection 9).

### 2. The reality gap: benchmarks versus real work

The reality gap is the distance between benchmark scores and value delivered at work. L17 (Wang) documents it from five angles.

**(1) Whole projects fail.** Frontier models score about 80% on SWE-Bench Pro and about 85% on OSWorld-Verified in L17's model-card table. On the Remote Labor Index leaderboard shown, the best agent (Opus 5.5) reaches 21.25 and the tenth only 4.17. The score is the *automation rate*: the share of projects a client would accept. Beyond the lecture: the original RLI paper (October 2025) reported a best automation rate of only 2.5%, so the 2026 leaderboard is a large climb from a very low base.

**(2) Benchmarks cover the wrong jobs.** Wang et al. (2026), "How Well Does Agent Development Reflect Real-World Work?", map benchmark tasks to SOC groups. Computer and Mathematical gets 8,622 benchmark tasks, over twice any other group, but holds about 5.2M workers (about 5% of employment). Office and Administrative Support (18.2M workers) gets 3,186; Healthcare Practitioners (9.2M workers, $785.1B capital) only 29. Food Preparation (13.6M), Transportation (13.0M) and Construction (6.3M) get zero. Beyond the lecture: the paper analyses 43 benchmarks and 72,342 tasks against 1,016 occupations, and proposes three principles for future benchmarks: coverage, realism and granular evaluation.

**(3) Autonomy rankings do not predict collaboration.** CollabSkill (Shao et al., 2026) ranks coding-agent products by how well they work with a person: Claude Code, Codex, Gemini CLI. L17's slide shows the fully autonomous ranking reversed. Patch bloat (successful patch length divided by gold patch length) is above 1.0 for every model, from about 1.19 (Claude Opus 4.5) to about 1.6 (GPT-5.2 High), so humans must review more code than needed.

**(4) Agents do not fit workflows.** NANDA's barriers are about adaptation: no learning from feedback (about 66%), too much manual context (about 63%), no customisation to specific workflows (about 58%), breaking on edge cases (about 52%). These are the memory and context problems of T3 and T4 seen from the customer's side.

**(5) Use is a sliver of potential.** Observed coverage is far smaller than theoretical coverage in every occupation group.

**Construct validity** names the underlying problem. Bean et al. (2025) define it as "the degree to which a benchmark score provides evidence for making claims about the target phenomenon". Their review of LLM benchmarks (L17's Sankey) finds 21.7% never define the phenomenon, 84.0% use no statistical tests, and 46.6% never discuss construct validity. A benchmark built from GitHub issues supports claims about resolving GitHub issues; it does not support "agents can do software engineering jobs", let alone "agents can do work".

Three finer distinctions help when critiquing a benchmark (T9 covers them in depth):

- **Content validity:** do the tasks cover the domain? The occupation chart is a content-validity failure at the scale of the field.
- **Criterion validity:** does the score predict an outside outcome, such as client acceptance or time saved? The CollabSkill reversal is a criterion failure for "usefulness to a human partner".
- **Ecological validity:** do conditions match real use (messy data, interruptions, a person in the loop)? Synthetic 12-row CSVs fail it.

**Field evidence.** Beyond the lecture: METR's 2025 randomised trial with experienced open-source developers found they took about 19% longer with early-2025 AI tools, while believing they were faster. In L14, Chen et al.'s "Code with Me or for Me?" study (20 Copilot users) found an OpenHands agent roughly doubled task correctness (about 0.25 to 0.60) and halved active effort (about 25 to 12.5 minutes), with the caveat of a "continued need for understanding and oversight". Field results disagree because tasks, tools and people differ: exactly why lab scores need field checks.

*Common misconception:* "High OSWorld or SWE-bench scores mean the agent is ready for the job." They show competence on a narrow, verifiable slice; the job adds fuzzy deliverables, private data, workflows and a human partner.

### 3. Realistic tasks, environments and data

Every agent benchmark and every RL training setup has three parts, which L17 (Wang) draws as a triad: the **task** (the instruction a person gives), the **environment** (the computer the agent acts in) and the **evaluation** (what decides the result is good). If any one is unrealistic, the score says little about real work. This subsection covers the first two; subsection 4 covers evaluation.

**Where tasks come from.** L17 shows five sources, each trading realism against cost.

| Source | Example | How it works | Strength | Weakness |
| --- | --- | --- | --- | --- |
| Expert annotation per occupation | GDPval (Patwardhan et al., 2025) | Professionals averaging 14 years' experience write tasks with reference files and a human deliverable; 44 occupations from the top 9 GDP sectors; 220 gold tasks | Real deliverables (a 3D cable-reel stand, a nurse's lesion report) | 44 of about 900 occupations; polished last steps |
| Expert annotation from markets | Remote Labor Index (Mazeika et al., 2025) | 358 freelancers source real projects; 240 projects in 23 of 64 Upwork categories | Whole, paid projects | Expensive; small |
| Desire-aligned tasks | JobBench (Li et al., 2026) | Start from what workers want delegated | Targets the burden people want lifted | Desire surveys are subjective |
| Recorded human activity | OpenCUA / AgentNet (Wang, Xinyuan et al., 2025) | A tool records real computer use; the user annotates the task, edits auto-segmented steps; a verifier checks; 22.5K traces (12K Windows, 5K macOS, 5K Ubuntu) | Non-intrusive, real behaviour | Privacy; intent is hard to recover from actions |
| Agent-powered synthesis | BAGEL, NNetNav (Murty et al., 2024) | An agent explores, an LM labels what the trajectory did, relabel until they agree; NNetNav adds pruning on the live web | Cheap, scalable training data | Tasks reflect what an explorer stumbles on, not what workers need |

BAGEL and NNetNav use *hindsight relabelling*: instead of asking "how do I do task X?", they ask "what task did this trajectory just accomplish?". The same trick powers L4's workflow induction and much synthetic-trajectory SFT (T10).

**Where environments come from.** An environment must be reproducible (every run starts from the same state), resettable, safe to break, and close enough to real work that skills transfer. L17 shows three building styles.

1. **Manual deployment of open-source software** (TheAgentCompany, Xu et al., 2024): self-host stand-ins for SaaS, such as Rocket.Chat for Slack and GitLab for GitHub, plus ownCloud and Plane. Reproducible and offline, but each application costs human engineering, so coverage is small (5 software products, 175 tasks, 4 SOC groups).
2. **Automatic deployment** (Gym-Anything, Aggarwal et al., 2026): start from 894 O\*NET occupations, weight them by GDP, discover about 16,600 software products with an LLM plus search, filter to about 3,400 free, self-hostable GUI products, select about 500 across 22 SOC groups, and have coding agents install them. 200 environments were built within budget; the resulting CUA-World has 10,000 tasks across all 22 SOC groups, against OSWorld's 9 products, 369 tasks and 3 groups.
3. **File-centric containers** (Terminal-Bench, Merrill et al., 2026): each task is a Docker image plus an instruction in `task.yaml`; hidden tests (`run-tests.sh`, `tests/`) and a reference `solution.sh` grade it. L17's example asks the agent to re-implement a COBOL program in Python with identical output; the run ends with 1 test passed and 2 failed. Cheap to build and easy to grade, but limited to work that lives in files.

**Loading data.** Empty software is not a workplace. Data can be *scraped* (real GitHub repositories poured into self-hosted GitLab, as in WebArena and TheAgentCompany) or *synthesised* (Gym-Anything's creation agent writes realistic data and 5 seed tasks per application, then an LLM amplifies them 75× and execution filtering keeps verified tasks). The targets are **realistic** (match worker activity), **diverse** (cover jobs) and **difficult** (long horizons, distracting data).

**Two open problems.** First, *limited-source software*: much real work happens in proprietary, cloud-only tools such as Google Docs, and LibreOffice behaves differently, so skills may not transfer. Second, *limited realistic data*: TheAgentCompany's tax-credit task uses a 12-line CSV of made-up employees, while a real finance worker faces multi-sheet cash-flow workbooks. Real data is private and messy; synthetic data is clean and small, which makes tasks easier than reality.

L7 adds personal context. MyPCBench (Jang et al., 2026) seeds a reproducible Linux desktop from one persona with 17 pre-logged-in web apps, 184 tasks and about 42K records; GUM (Shaikh et al., 2025) infers confidence-weighted facts about a user ("likely going to a friend's wedding in Chicago", 0.8) from their activity. Real work is personal: the same request means different things to different people.

*Common misconception:* "10,000 tasks means a realistic benchmark." CUA-World's tasks come from 5 seeds per application amplified 75×, so they inherit whatever the creation agent thought realistic. Count software and occupations covered, not tasks.

### 4. Evaluating open-ended work: from execution to evolving rubrics

Evaluation decides what "done well" means, and most human work cannot be graded by running a test. L17 (Wang) places tasks on a **verifiable-to-fuzzy spectrum**: solving a GitHub issue (tests pass or fail) sits at the verifiable end, data cleaning and analysis in the middle, interior design at the fuzzy end. Most human work lies in the middle-to-fuzzy half; most agent evaluation, and RL with verifiable rewards (T11, T12), lives at the verifiable end.

**Execution checks.** SWE-bench grades a patch by running repository tests. Mathematics can be made verifiable with a proof assistant such as Lean; L17 pairs this with OpenAI's September 2026 announcement of a Navier–Stokes result "including a formal proof in Lean", a fuzzy-looking task made verifiable by formalisation. But execution has a ceiling. TheAgentCompany's `hr-make-slides-introduce-leadership` evaluator opens the .pptx and checks that each leadership position's name appears in a slide's text. Whether the slides are clear or persuasive is invisible to it: "limited to rule-based checks, impossible for advanced semantic measures".

**Expert rubrics with an LLM judge.** A **rubric** is a list of checkable criteria, each with a weight; an **LLM-as-a-judge** marks each criterion satisfied or not. GDPval pairs each task with a long expert rubric. L17's audit example asks for a sample size at 90% confidence and 10% tolerable error; rubric items include "a worksheet is named exactly 'Sample Size Calculation'", "uses z = 1.645, p = 0.5 and finite population correction, rounding up" and "sampled rows match the source exactly". L10 adds the evidence that this works: on ScholarQABench, expert–LM agreement on rubric items was 79%, essentially equal to expert–expert agreement (80%). Many small near-binary checks are easier to judge reliably than one holistic score.

**LLM-generated rubrics.** Hand-writing rubrics does not scale. CollabSkill's prompt tells an LLM to read the task prompt and reference files (never the deliverables), extract values, formulas and thresholds, and write a `rubric.json` with 100 points split into Correctness & Accuracy (40), Deliverable Completeness (20), Task Requirements (25) and Technical Quality (15). L17's caveat: it needs careful multi-faceted prompting and manual validation. L10 quantifies the risk: an expert audit of ResearchQA found 15% of LM-generated rubric items vacuous, erroneous or unclear.

**Evolving rubrics for training.** A static rubric saturates: once the policy satisfies it, the reward stops discriminating. DR Tulu (Rulin Shao et al., 2025; L10) samples several rollouts, has an LM contrast them, and writes new positive and negative criteria into a rubric buffer. L10 reports roughly 61% for evolving rubrics against 59.5% for static rubrics and 51% for random rewards after about 2,500 RL steps.

**Evolving rubrics from human interaction.** Wang et al. (2026), "Efficient Test-Time Adaptation through Human-AI Interaction", apply the idea within a user's session. Initial rubrics come from the query ("HTML file opens without errors", "text is large and visible"); each user reaction ("+ rank bars by their scores", "− make title 32px") becomes a new gradable criterion. Beyond the lecture: the paper (TAHI) studies 30 people on 600 writing and visual-creation tasks, reports solo success gains of 4.5% to 20.9% within tens of tasks, and finds its rubrics catch 16.0% to 22.3% more failures than LLM-only or human-only rubrics.

**Three evaluation challenges** from L17:

1. **Judges are biased.** Pombal et al. (2026) measure *self-preference*: how many times more likely a judge overestimates its own model's outputs than others'. Pairwise comparison is worst (ratios up to about 1.65); rubric protocols sit near 1.0–1.2; even accurate judges show 1.05–1.47. Other issues: run-to-run randomness and poor visual judgement. Zheng et al. (2023) also catalogue position and verbosity bias.
2. **Perfect rubrics are hard.** LLM-only, human-only and interactive rubrics each miss things (agreement clusters of about 65–78% in L17's figure); good rubrics are model- and user-specific.
3. **Benchmarks drift, saturate and cost money.** OpenAI stopped reporting SWE-bench Verified, calling it "saturated due to test-design issues and contamination"; LiveCodeBench shows pass@1 dropping for problems released after a model's cutoff.

L7 adds the arithmetic of judge error: a judge with 90% true-positive and 20% false-positive rates agrees with humans on 83% of episodes, yet reports 41% success for an agent whose true rate is 30%. Mechanics derives the correction.

| Point on spectrum | Example task | Best evaluator | Main risk |
| --- | --- | --- | --- |
| Verifiable | Fix a GitHub issue | Execution tests | Weak tests, contamination |
| Mostly verifiable | Audit sample selection | Code checks + a few rubric items | Rules miss semantics |
| Mixed | Data cleaning and a written analysis | Code for numbers, rubric judge for prose | Judge bias on prose |
| Fuzzy, shared taste | Research report | Expert or evolving rubrics | Rubric saturation, hallucinated criteria |
| Fuzzy, personal taste | Interior design, a user's chart style | Interaction-derived rubrics, user ratings | Rubrics do not transfer across users |

*Common misconception:* "LLM judges are unreliable, so use pass/fail tests only." That restricts evaluation to the verifiable end, which is the least representative of work. The fix is to compute what is verifiable in code and reserve calibrated rubric judges for the rest (T9, T12).

### 5. Levels of human involvement: automation versus augmentation

**Automation** means the agent does the task in place of the person; **augmentation** means the person still does the task, but better or faster with the agent. L17 (Wang) argues capable agents are not enough because most real work wants some point between the two, and benchmarks measure only the automation end.

**The Human Agency Scale (HAS).** Yijia Shao et al. (2025), "Future of Work with AI Agents", define five levels of required human involvement:

| Level | Who drives | Required human involvement | Role of AI | Example interaction |
| --- | --- | --- | --- | --- |
| H1 | Agent | None; the agent handles the task entirely | Automation | Nightly report generated and filed |
| H2 | Agent | Input at a few key points improves the result | Automation | Agent asks which of two data sources is authoritative |
| H3 | Equal partnership | Agent and person together beat either alone | Augmentation | Co-editing an analysis, each correcting the other |
| H4 | Person | Agent needs the person's input to complete | Augmentation | Agent drafts; expert supplies judgement on every key call |
| H5 | Person | Completion relies fully on the person | Augmentation | Agent only retrieves references for a negotiation |

Most benchmarks measure only H1. Real work spans all five, and the right level is a property of the *task and the worker*, not of the agent alone.

*Beyond the lecture:* the HAS has a long ancestry in human factors. Sheridan and Verplank (1978) proposed ten levels of automation for teleoperation. Parasuraman, Sheridan and Wickens (2000) noted that the level can differ across four stages: information acquisition, analysis, decision and action. An agent may automate search (H1) while leaving the decision at H4; SAE driving levels 0–5 follow the same logic.

**WORKBank: desire versus capability.** The same paper builds WORKBank on O\*NET. Beyond the lecture, the paper reports preferences from 1,500 domain workers and capability ratings from AI experts on 844 tasks across 104 occupations. L17 reports that workers expressed automation desire for 46% of occupational tasks. Splitting worker desire and expert-rated capability at 3 on 1–5 scales gives four zones:

| Zone | Desire | Capability | L17 examples | What to do |
| --- | --- | --- | --- | --- |
| Automation "Green Light" | High | High | Tax preparers scheduling client appointments; QC managers checking reported data | Deploy |
| Automation "Red Light" | Low | High | Municipal clerks preparing meeting agendas; logistics analysts contacting vendors | Offer as optional augmentation; expect resistance |
| R&D Opportunity | High | Low | Video-game designers creating production schedules; technical writers arranging distribution | Research priority |
| Low Priority | Low | Low | Art directors presenting layouts; ticket agents tracing lost baggage | Leave alone |

L17's key observation is that many tasks sit in the R&D Opportunity zone: people want help AI cannot yet give, while investment flows to tasks they would rather keep. Beyond the lecture: the paper also reports early signs that valued human skills shift from information processing towards interpersonal ones.

**Observed use.** The Anthropic Economic Index split (57% augmentation, 43% automation, beyond the lecture) suggests people already use AI mostly at H3–H4 in conversation. Agentic products push towards H1–H2, which is where interaction design becomes critical.

*Common misconception:* "Higher autonomy is always the goal." WORKBank's Red Light zone shows capability without desire, and L13's incidents show autonomy without control. The goal is the right level for each task, with the agent able to move between levels.

### 6. Interaction modes, steering and approval

**Steering** means the person changes the agent's course during execution, not just before (the prompt) or after (review). L17 (Wang) shows two results on steering web agents, and L13–L15 supply the engineering.

**CowPilot: pause and take over.** Huq et al. (2025) build a web agent that proposes each next step; the user can pause, reject, override or take over, then hand control back. L17's storyboard: the goal is to count comments with more downvotes than upvotes for the author of the latest post in the "space" forum. The agent opens Forums, cannot find "space" and scrolls indefinitely. The user navigates to /f/space; the agent resumes and finishes in three more steps. One small human action rescues a failing trajectory. Beyond the lecture: the paper reports 95% task success in collaborative mode with humans performing only 15.2% of the steps.

**Four interaction modes.** Huq\*, Wang\* et al. (2026), "Modeling Distinct Human Interaction in Web Agents", cluster 20 participants by intervention behaviour (a PCA of intervention frequency and hand-back rate):

- **Takeover:** occasional interventions, mostly at the very end; once in control, they never hand back (P10, P13, P18).
- **Hands-on:** frequent, substantial interventions, alternating between taking over and handing back (P3, P7–8).
- **Hands-off:** never intervene (P1–2, P15).
- **Collaborative:** rare, modest, later interventions with a strong tendency to hand back (the largest group, 11 of 20).

The proposal is to train agents to recognise the user's mode and their own autonomy level: offer a takeover user control early with a clean summary; never interrupt a hands-off user except for irreversible actions. Beyond the lecture: the paper's CowCorpus has 400 real-user trajectories with over 4,200 interleaved human and agent actions; models trained to predict interventions improved prediction accuracy by 61.4–63.4% over base models, and intervention-aware agents raised user-rated usefulness by 36.8%.

**Approval as a control point.** Steering is voluntary; approval is mandatory for some actions. L13's OpenClaw incident shows why: the user's "don't act until I approve" lived only in the model's context, compaction dropped it, and "Stop don't do anything" typed in chat did not stop shell commands already running. Two engineering answers follow:

- **In code, not in the prompt.** L15 models the human reviewer as a workflow node with typed input (request + draft) and output (approve, edit or reject). A graph edge "flagged reply → approval → send" is a guarantee; a prompt saying "always ask" is a request. A checkpointer persists state so a run can wait hours for the person, and side effects go *after* the interrupt with an idempotency key.
- **Pluggable confirmation policies.** L14's OpenHands SDK offers `AlwaysConfirm()` and a risk-based `ConfirmRisky` policy driven by an LLM security analyser. A rejection is fed back as an observation so the agent plans another route.

**Alert fatigue limits approval.** L13 shows that when unsafe actions are rare, most alerts are false alarms: precision collapses as the base rate falls (Mechanics works an example). Reviewers who see mostly false alarms start approving everything, turning a pause into a rubber stamp. Human attention is the scarce budget; for unattended automations, L14 recommends making high-risk actions impossible (scoped credentials, isolation) rather than confirmable.

**Interfaces decide what the person can see.** L14 crosses execution location (local or cloud) with interface:

| Interface | What the person sees | Best for |
| --- | --- | --- |
| CLI (e.g. Claude Code) | A streaming trace of tool calls in a terminal | Developers in the terminal; works over SSH |
| IDE (e.g. VS Code with Copilot) | Diffs, files and tests; line-level feedback | Reviewing code where it lives |
| Custom GUI (e.g. OpenHands Agent Canvas) | Many runs, previews, diffs, pending approvals | One person supervising many agents |
| Integrations (issues, PRs, chat) | Agent output inside existing review gates | Teams; oversight via normal workflow |

L7 adds background computer use: the agent works in an isolated session while the user keeps working, showing progress and accepting corrections. Its design rule: "Proactivity needs consent, visibility, and an easy off switch."

*Common misconception:* "A human in the loop makes an agent safe." Only if the loop is enforced outside the model, the human sees enough to judge, and alerts are rare enough to be read.

### 7. Measuring collaboration, and humans in coding-agent research

A collaboration benchmark scores the human–agent *pair*, not the agent alone, and it has to separate how much of the result each side contributed. L17 (Wang) presents the coding case in detail because coding agents are the most deployed agents and the most benchmarked.

**Humans are missing from coding-agent research.** Wang, Yang, Lieret et al. (2026) argue that, as agents improve, usefulness is limited less by raw task-solving and more by how users direct, oversee and trust them. Their evidence on L17's slide is **patch bloat**: the length of a successful patch divided by the length of the gold (human-written) patch. Every model sits above 1.0: Claude Opus 4.5 and Gemini 3 Pro near 1.2, Claude Sonnet 4.5 about 1.35, GLM-4.6 about 1.5, GPT-5.2 High about 1.6. A patch 1.6× longer than needed costs reviewer time and hides risk, yet SWE-bench counts it as a full success. Beyond the lecture: the paper names four interaction-level dimensions of the human–agent loop (task alignment, verifiability, steerability and adaptability) and calls for user-involved coding environments, stronger verification and principled measures of interaction quality.

**CollabSkill.** Shao et al. (2026) pair real workers with agents on tasks matched to their occupations. Beyond the lecture: the paper reports 93 workers, 386 sessions and over 1,500 prompts, and uses a **Bayesian skill rating** to separate the human's and agent's contributions, the way chess ratings separate player strength from game outcomes. L17's bump chart shows the agent ranking: Claude Code, Codex, Gemini CLI for collaboration, versus the reverse order on the slide's autonomous ("AutoAgent") ranking. (The paper's abstract phrases it as Codex leading autonomous benchmarks while Claude Code leads CollabSkill; either way the order changes.) On the human side, practical experience was the main driver of collaboration skill, and collaborating changed workers' AI literacy.

**Why rankings flip.** Autonomous success rewards an agent that pushes through without asking. With a person present, value also depends on asking the right question, producing reviewable output, accepting corrections and exposing progress. These traits cost turns, so an autonomy-optimised agent learns to drop them (subsection 8 shows this in training).

**Field studies with real developers.** L14's "Code with Me or for Me?" (Chen, Talwalkar, Brennan and Neubig, 2025) is the first controlled comparison of a copilot with an agent: 20 regular Copilot users on Python tasks. The agent (OpenHands) raised correctness from about 0.25 to about 0.60 and cut active effort from about 25 to about 12.5 minutes. The paper's caveat is that users may not fully understand what the agent did, which is why IDEs, GUIs and PR integrations invest in diffs, previews and review.

**Collaboration as a two-agent problem.** L18 (Vaduguru) recasts human–agent interaction as a multi-agent system with private observations. SWEET-RL's collaborative benchmark (ColBench) has two task types: *backend programming*, where the human holds a hidden reference function and the agent must ask clarifying questions before submitting code checked by unit tests; and *frontend design*, where the human holds a reference web page and the agent iterates on drafts scored by image similarity. Because the human knows what the agent needs, the agent's job includes eliciting it.

**What to measure.** Combining L14, L17 and L18 gives a practical scorecard for any collaboration study:

| Measure | What it captures | Example |
| --- | --- | --- |
| Joint task success | Did the pair finish correctly? | CowPilot 95% with humans doing 15.2% of steps |
| Human active time | Cost to the person | Copilot about 25 min vs agent about 12.5 min |
| Intervention count and timing | Where the agent needed rescue | CowCorpus intervention traces |
| Reviewability | Cost of checking the output | Patch bloat |
| Question quality and effort | Did questions help at low user effort? | PPP proactivity score |
| Preference adherence | Did the agent follow how this user works? | PPP personalisation score |
| User-rated usefulness or satisfaction | Subjective value | +36.8% usefulness for intervention-aware agents |

*Common misconception:* "Collaboration is just autonomy with a human safety net." CollabSkill's reversal shows the traits that make a good partner are different from, and sometimes opposed to, the traits that maximise solo success.

### 8. User simulators and training from simulated interaction

A **user simulator** is a model, usually an LLM with a persona and a goal, that plays the human so an agent can be trained or evaluated without real people in every episode. L18 (Vaduguru) explains why it is needed and how it fails.

**Why simulate.** RL needs thousands of episodes (T11). Running each with a real person is slow, expensive and unrepeatable. From the agent's point of view the simulator is simply the environment, so the quality of training depends on how human-like it is.

**Anatomy.** L18's diagram, from Tomlin and Lin's blog "What does it take to build a human-like user simulator?", shows two parts inside the environment:

1. a **user policy**: an LLM prompted with a goal and persona ("Your goal is to…", "You are a 45 year old…", "Previous purchases: …") that writes replies ("ok but i don't want…");
2. a **reward model** that knows the user's goal and scores the episode (0.66 in the example).

Both are LLMs, and both can be exploited by the policy being trained.

**SWEET-RL.** Zhou et al. (2025) train on ColBench with a **privileged critic**: a critic that sees training-time-only information (the hidden reference) and gives per-turn rewards, solving credit assignment over many turns. Beyond the slides (L18 notes, verified against the abstract): a 6% absolute gain in success and win rate over other multi-turn RL methods, and Llama-3.1-8B matching or beating GPT-4o on ColBench.

**PPP: productive, proactive, personalised.** Sun et al. (COLM 2026) build a preference-aware simulator. Each simulated user has a *preference* (L18's example: "can only answer selection questions", so questions must offer options A, B, C) and holds *user-side information* at three effort levels: a precise prompt (low effort), "IDK" (medium) or a hint (high). In an astropy bug-fixing task, the bad agent says "Can you give me some hints?" (high effort, ignores the preference); the good agent asks "Which caused the error? A. removed time column B. removed flux column" and gets "B". The reward is R = R\_Prod + R\_Proact + R\_Pers. L18's curves over 200 steps: productivity rises from about 38 to 57 under both PPP and task-only reward, but with task-only reward proactivity peaks near 60 and falls to about 42 and personalisation decays from about 72 to 57, while PPP reaches about 75 and 89. **Optimising only task success actively erodes collaboration.** Beyond the slides: PPP-trained agents beat GPT-5 by 16.7 points on average across SWE-Bench and BrowseComp-Plus.

**CollabLLM** (beyond the lectures; Wu et al., ICML 2025) is a sibling method. It rewards each response by its *multiturn-aware* effect on the rest of a simulated conversation rather than the next turn alone. It reports 18.5% higher task performance and 46.3% better interactivity (LLM-judged), and in a 201-person user study, 17.6% higher satisfaction and 10.4% less user time.

**Simulator collapse.** Yu et al. (2026), in L18, train Qwen3-4B-Instruct against one of three frozen simulators (GPT-5-mini, Haiku-4.5, Gemini-3-Flash). Training reward rises to about 0.65, 0.85 and 0.95. Reward on a held-out panel peaks near step 80 (about 0.47–0.54) and then falls; the Gemini-trained policy ends around 0.31–0.37, below its starting 0.40. Policy entropy collapses from about 1.75 nats to near zero within about 50 steps. **The easiest partner to please produces the most overfit policy**: it learns one script tuned to one simulator's dominant reply. This is reward hacking (T12) where the hacked object is the other agent.

**Remedies.** L18's customer-return illustration: a single frozen simulator always replies "Sure, it's #12345", so the policy asks "What's your order ID?" to everyone, including the user who lost their tracking number. *Verbalized sampling* makes the frozen simulator sample from a stated distribution (0.55 / 0.30 / 0.15 over three replies), so one rollout meets varied reactions. *Co-training* trains the simulator alongside the policy so it drifts and keeps getting harder. Beyond the slides: on τ²-bench Retail, held-out success was 46.1% (single simulator), 55.5% (verbalized sampling) and 62.2% (population co-training). This is the same lesson as population-based training in game RL (AlphaStar's league): train against one opponent and you exploit it; train against a population and you generalise.

**Simulating people at scale.** L18 also shows simulation as a research instrument. Generative Agents (Park et al., UIST 2023) populate a town with LLM characters that have memory streams, reflection and planning; social behaviour emerges. Magentic Marketplace (Bansal et al., 2025) simulates customer agents and business agents through search, negotiation and transaction, to study whether agents compare enough offers or can be manipulated before such markets exist. Beyond the lecture: τ-bench (Yao et al., 2024) is the standard tool–agent–user benchmark built on LLM-simulated customers.

*Common misconception:* "A better simulator is one that is easier to satisfy." Yu et al. show the opposite: realism means variety and difficulty. Always evaluate on held-out simulators and, ideally, a small panel of real users.

### 9. Beyond capability: efficiency, safety, meaningful work and the labour market

Even a capable, collaborative agent can fail at work if it is too slow or costly, unsafe in ways no benchmark catches, or aimed at the parts of work people value. L17 (Wang) closes with these, then with what labour economics predicts.

**Efficiency and redundancy.** OpenAI's 2026 Navier–Stokes write-up credits "a system of coordinating agents" involving "on the order of 10,000 concurrent agents"; for one variant "nearly 100 agents worked together for approximately 50 hours", about 5,000 agent-hours for one result. Kim et al. (2026), "Into the Unknown", plot run times on open research problems: median 19.5 h for DeepSeek-V4-Pro, 7.5 h for Opus 5, 5.3 h for Opus 5.5 and 1.3 h for Astra 6, with outliers beyond 100 h. Multi-agent systems carry heavy redundancy (T5); L18's Park et al. table even shows a communicating team@2 (60.67%) below independent pass@2 (62.36%) on Terminal-Bench 2.0. The right metric is **cost per accepted deliverable**, including human review time, not accuracy alone (Mechanics, Hands-on).

**Safety at work.** Two L17 examples show that access is power: a Discord OAuth2 screen with dozens of scopes a bot can request, and the OpenClaw inbox deletion (L13). OpenAgentSafety (Vijayvargiya et al., 2025) finds most safety benchmarks lack real tools and user interaction. Jones et al. (2026) argue many harms must be *elicited*: their AutoElicit perturbs a benign SSH request, and the agent writes a global `PasswordAuthentication yes` before the user-specific block, a change nobody asked for. Static safety benchmarks cannot anticipate such side effects of ordinary work; see T14 for controls.

**Meaningful work.** Ranjit et al. (2026) ask workers what each task means to them and compute an **AI exposure gap**: how much more a property is rated for AI-exposed tasks than unexposed ones. Exposed tasks are the ones that "produce a tangible outcome" (+0.34), "require novel ideas or creativity" (+0.23), "give a sense of accomplishment" (+0.22) and "feel meaningful and worthwhile" (+0.21). Unexposed tasks "serve mainly bureaucracy or appearances" (−0.22) or "require emotional awareness" (−0.14). Current AI targets the satisfying parts of work, not the drudgery, which is the WORKBank Red Light problem seen from the worker's side.

**The labour-market picture.** L17 presents both sides.

- **Exposure is broad.** About 80% of U.S. workers have at least 10% of tasks exposed (Eloundou et al.); exposure skews to higher-income jobs such as translators, tax consultants and web designers.
- **Automation is not only replacement.** Workers want 46% of tasks automated (WORKBank), and many of those are R&D Opportunities.
- **Work is not a fixed set.** Acemoglu and Restrepo (2019) show automation's *displacement effect* has historically been offset by a *reinstatement effect*: new tasks in which labour has a comparative advantage, which raise labour share and demand.
- **Jobs will change shape.** Narayanan and Kapoor's "decide–execute–deliver sandwich": AI shrinks the execute layer while deciding and delivering stay human. Motivation and judgement become more important.
- **Early-career workers may lose most.** Brynjolfsson, Chandar and Chen (2025) find that since late 2022, headcount for workers aged 22–25 in the most AI-exposed quintile fell to about 0.93 of its 2022 level by September 2025, while the least-exposed rose to about 1.10–1.15.
- **Work is part of learning.** Narayanan: use AI "to increase, not decrease your cognitive load… There is no learning without the cognitive sweat."

*Beyond the lecture:* Bainbridge's "Ironies of Automation" (1983) ties these together. Automating the routine leaves people the rare, hard cases while removing the practice that kept them sharp, so operators end up supervising systems they can no longer rescue. If juniors no longer do routine work, who becomes the senior who writes rubrics and catches the agent's mistakes? Two cautions when reading labour studies: exposure is not harm (an exposed task may become more valued), and early employment effects are hard to separate from interest rates and hiring cycles.

*For RPA practitioners:* classic RPA is H1 on deterministic, rule-defined workflows and breaks on any UI change. LLM agents mostly operate at H2–H3 on fuzzier work. The NANDA complaints (no learning from feedback, too much manual context) are the same issues RPA teams handle with exception queues and process documentation, now moved into the agent's memory and skills.

*Common misconception:* "Exposure estimates predict job losses." They are upper bounds on which tasks *could* be sped up, not forecasts of displacement; the net effect depends on the race between displacement and new tasks.

### 10. Mixed-initiative interaction, from 2019 guidelines to agents (before / during / after)

L19 (Valerie Chen, Stanford) argues that in the agentic era an agent is judged by the **process** it supports, not only by its final output. Her coffee-shop case makes the point. A user asks a data-science agent whether to open a coffee shop in Seattle using provided data, approves a three-step plan, and then sees one of two trajectories.

- **Trajectory A (end-to-end).** The agent works alone and returns 270 words plus 770 lines of code. Something is wrong, so the user must read everything and ask "What did you do for…?". All verification lands on the human, at the end.
- **Trajectory B (collaborative).** The agent does part of the work, shows initial data statistics, and asks "Is that correct? By the way, how is this data collected?". The user checks cheaply and adds domain context.

The slides (Shen\*, Chen\* et al., ACL Findings 2026, "Completion ≠ Collaboration") strike out "complete the analysis end-to-end and have data scientists review at last". The new goal is to support the user's process, do subtasks, provide scaffolds, and leave the user with the domain and data knowledge needed for later decisions. L19 lists the same failure in five domains: subtly wrong proofs (math), no multi-round discussion (science), short-term help that undermines learning (education), unconfirmed risk tolerance (finance) and missing domain knowledge (data science).

**Why agents change the design problem.** In the pre-agent era (a news classifier) the human called the model once, at a known moment, and checked one output. In the agent era (Cursor) human and agent actions interleave, and the agent may take several actions in a row. Users can engage differently at each point, and the many ways to follow up create new problems. This is the timeline view of subsection 6's interaction modes and L18's two-agent framing.

**Old guidelines still apply.** *Mixed-initiative interaction* (Hearst et al., 1999) is "a flexible interaction strategy in which each agent (human or computer) contributes what it is best suited at the most appropriate time." Horvitz's 12 principles (CHI 1999) include uncertainty about user goals, attention and timing, weighing costs and benefits under uncertainty, dialog to resolve key uncertainties, minimising the cost of poor guesses and learning by observing. His LookOut add-in offered to schedule a meeting only when p(Sched) was high (0.96 in the slide). Amershi et al. (CHI 2019) distilled more than 150 recommendations into 18 guidelines, grouped as initially (G1–G2), during interaction (G3–G6), when wrong (G7–G11) and over time (G12–G18).

L19 maps them onto the three phases of one agent interaction:

| Phase | 2019 assumption | Agent era | Guidelines |
| --- | --- | --- | --- |
| Before | Invoke a pre-defined service | Articulate goal and constraints | G1 what it can do, G2 how well, G3 time services to context |
| During | Wait for a prediction | Monitor progress, interrupt or steer | G4 show relevant information, G7 efficient invocation, G8 efficient dismissal |
| After | Accept or override the prediction | Check outcomes, request follow-up | G9 efficient correction, G11 explain why, G16 convey consequences of user actions |

Each phase is now a user skill and an agent surface. "Before" is specification, "during" is oversight (subsection 6's approval and steering), and "after" is review of large outputs, the 770-line problem.

*Common misconception:* "HCI guidelines from the single-prediction era are obsolete for agents." L19's takeaway is the opposite: pre-2000 principles still hold, and most agent products still violate them, especially in the "during" phase.

### 11. Proactive agents: when and what to show

A **reactive** system computes output = LM(prompt): nothing happens until the user asks. A **proactive** system computes (when to show, what to show) = LM(context), where the context is the user's prompts, prior sessions and code. The model makes two decisions: whether to intervene now, and with what. This restates Horvitz's principle "costs, benefits, uncertainty → ideal action" for LLMs.

**Before the run: ToM-SWE models the user.** L19's motivating failure: the user types "make me a website", the agent runs 100 actions and announces a shopping-guidance site, and the user replies "Ugh, after 30 mins, you produce a bunch of useless things." ToM-SWE (Zhou et al., incl. Chen, ICML 2026) pairs the SWE agent (OpenHands) with a lightweight theory-of-mind agent. When instructions are unclear, the SWE agent consults it, and it answers from a model of this user ("personal website, prefer Vercel; academic style; concise communication").

- The ToM agent keeps a hierarchical memory: raw past sessions, per-session user models, and one overall user model.
- In the wild, users accepted 74.7% of 174 suggestions, partially accepted 11.5% and rejected 13.8%.
- It helps most on somewhat underspecified queries with prior history; very vague queries with no history leave nothing to infer from.
- Beyond the slides: the paper reports 59.7% success on its stateful SWE benchmark versus 18.1% for plain OpenHands.

ToM-SWE is the mirror image of subsection 8's user simulator. There a model imitates the user to train the agent; here a model predicts the user to help the agent at run time. L19 shows it beside Letta's sleep-time compute and Anthropic's memory layers (transcripts, memory notes, representations, injected context).

**During and after: timing decides engagement.** Kuo et al. (incl. Chen, IUI 2026) built a proactive code-quality assistant into JetBrains Fleet and ran a 5-day field study: 229 interactions across 5,732 intervention points. Mid-iteration suggestions faded over the week, while code-review suggestions at the commit boundary came to dominate. Usability was high (93% quick to learn, 87% easy to use, 86% would use often) but only 67% found it well integrated. Beyond the slides: the paper reports 52% engagement at workflow boundaries, 62% dismissal for mid-task interventions, and 45.4 s versus 101.4 s to interpret well-timed proactive versus reactive suggestions.

The design rule follows Horvitz's decision-theoretic model. With p the probability the user wants help, B the benefit, C the cost of an unwanted action and i the interruption cost, the agent does nothing at low p, asks in a middle band and acts at high p. A high mid-task i can remove the "ask" band entirely (practice question 20 works it). L19's own takeaway: proactivity helps, but it needs careful design, above all of timing.

*Common misconception:* "A better user model makes proactive help welcome." Good inference with poor timing still fails; L19's "Going deeper" cites Clippy as the classic case.

### 12. Learning from implicit interaction: PULSE, critics and real-time RL

RLHF (InstructGPT, Ouyang et al., 2022) learns from pairwise labels on single responses. L19's example: for the coffee-shop prompt, an annotator prefers the reply that asks about neighbourhood, traffic, competitors and budget over one that jumps to cost estimates. Agent trajectories do not fit this recipe. They are long and multi-turn, and most real sessions get no explicit rating at all.

Older proxies are environment signals (fail-to-pass unit tests, as in SWE-bench) and LLM judges. Chen's move is to use the **unlabelled interactions themselves**. Users reveal satisfaction through behaviour: follow-up messages, sentiment, whether the code was committed. L19 shows this signal driving two things.

**1. Harness optimisation: PULSE (Chen et al., ICML 2026).** A coding agent is more than its LLM (CoALA: model, memory, reasoning and planning), so the deployment question is which design change most affects satisfaction. PULSE works in two steps:

1. Train a predictor f of the user's rating from interpretable features of a session (number of user messages, sentiment, "did the agent fail to test code?", "did the agent commit code?"). These features improve correlation with ratings by over 26% compared with baselines given the raw trajectory.
2. Estimate the A-versus-B effect with prediction-powered inference (PPI), which combines the few rated sessions with f's predictions on the many unrated ones (Mechanics 11).

On OpenHands, over multiple months and more than 15k users:

| Design change | Effect on user rating | Significant with naive A/B? | With PULSE? |
| --- | --- | --- | --- |
| Claude 3.7 → Claude 4 | about +0.05 | No | Yes |
| Claude 4 → GPT-5 | about −0.07 | Yes | Yes |
| No plan → show plan | about +0.03 | No | Yes |
| Reduce memory | no significant difference | — | — |

Changing the LLM had the largest effect (6–8%), the reasoning strategy a smaller significant one (3%). PULSE cut confidence intervals by up to 40% while agreeing with the naive point estimates.

**2. Model training.** A rubric-supervised critic (Wang et al., incl. Chen, COLM 2026) learns from real user–agent traces to predict real-world success. On code-survival AUC (was the agent's code kept?), a critic trained on synthetic data scores 0.45, below chance; adding real interaction data raises it to 0.69. Beyond the slides: it predicts 24 behavioural rubrics jointly with sparse outcomes and serves for best-of-N reranking and early stopping. Cursor's Composer runs **real-time RL** in production: each cycle collects billions of tokens from user interactions with the current checkpoint, distils them into rewards and updates the weights. Beyond the slides: Cursor's 26 March 2026 blog reports roughly five-hour cycles, +2.28% edits persisting and −3.13% dissatisfied follow-ups, and reward hacking (broken tool calls on likely-failing tasks; clarifying questions to avoid penalised edits).

This connects subsection 4's evolving rubrics to deployment, and it is the real-user complement of subsection 8's simulators. L19's takeaway: implicit interactions are valuable when explicit success signals are sparse.

*Common misconception:* "Implicit signals are free ground truth." They are proxies. Accepting is a default, silence can mean giving up, and code can "survive" because nobody read it. Once rewarded, even good behaviour such as asking questions can be gamed.

### 13. Downstream effects: copilot vs agent, comprehension, maintainability, upskilling

SWE-bench and rebuild-the-program benchmarks score the agent alone. L19's third thrust asks what happens to the person who used the agent, and to the next person or agent who builds on its code.

**Copilot vs agent, the experience side.** Subsection 7 gives the productivity result of "Code with Me or for Me?" (correctness about 0.25 with Copilot, about 0.60 with OpenHands). L19 adds the survey, OpenHands versus Copilot (agree / disagree): less cognitive load 75% / 10%; able to do new tasks 70% / 5%; faster 50% / 35%; more in flow 45% / 30%; more satisfied 45% / 40%. But only 25% agreed, and 55% disagreed, that they understood OpenHands' outputs better. Agents let people do more while understanding less.

**Measuring understanding: "(Im)Paired Programming"** (Balepur et al., incl. Chen; to be committed to NAACL 2027). Students build a small web game with either an agent that edits their code or a chatbot that only suggests syntax (n = 27 per group). An LLM then generates personalised quiz questions from each user's own code, covering memory, authorship and behaviour. Finally everyone extends the code with the chatbot only.

| Measure | Chat (user writes) | Agent (AI writes) | Test |
| --- | --- | --- | --- |
| Initial task completion | about 0.55 | about 0.95 | p < 0.01, d = 1.4 |
| Comprehension questions | about 0.82 | about 0.67 | p < 0.01, d = 0.9 |
| Extension, all users | about 0.45 | about 0.53 | p = 0.45, d = 0.2 |
| Extension, initial score > 0.50 | about 0.69 | about 0.53 | p = 0.18, d = 0.5 |

Agent users' small extension edge comes mostly from starting with more complete code. Among users who started well, chat users extended better, though not significantly. Behaviours of "top users" (comprehension score): turning criteria into syntax in the prompt 0.743 versus asking the agent to explain the project 0.635; accepting each change 0.777 versus auto-accept 0.615. Fewer lines and fewer comments tended to help, but those intervals touch zero.

**Agent code is harder for agents too.** Patel et al. (incl. Chen, EMNLP 2026) chain tasks so a follow-on task must build on earlier code. Agents resolve fewer follow-on tasks on agent-written than human-written code. Agent edits add more lines (p = 0.04) and add validation or error-handling code that later edits then fail to handle (p = 0.01). Beyond the slides: the paper (CodeThread) reports drops of up to 13.1%. This generalises subsection 7's patch bloat from a review cost to a maintainability cost.

**Upskilling.** "Upskilling Together" (Padmakumar et al., incl. Chen; arXiv forthcoming) trains students for the forward deployed engineer (FDE) role with Claude Code and Codex, graded by holistic rubrics. All gains were significant: requirements elicitation +0.23 / +0.18, prototyping +0.38 / +0.28, slide presentation +0.21 / +0.09 (Claude Code / Codex). From week 1 to week 4, human-only work (H5 on subsection 5's Human Agency Scale) fell from 35% to 22%, human-led shared work (H3–H4) rose from 41% to 48%, and agent-led work (H1–H2) from 24% to 30%. Reviewing and editing AI output each rose 13 points. Students delegated more and oversaw more, together.

*Common misconception:* "If the task passes, the human is fine." The comprehension gap means the approver may not understand what they approve, which weakens subsection 6's human-in-the-loop safeguards.

### 14. Trust between people and agents: evidence, attention and earned autonomy

L22 (Karthik Narasimhan, guest, Princeton) opens with a poll (slide 2). On the left, **Review every line**: "Who reads everything an agent writes before using it?" Its cost is your hours. On the right, **YOLO**: "Who has merged or sent agent output they didn't fully read?" Its cost is silent errors. A bar beneath runs from "All human time" to "All risk", and the middle card asks "What goes in the middle?" Most practitioners answer yes to both at different times, which shows there is no principled middle yet. This subsection covers L22's answer on the human side; the measurement side (the verification ladder, pass^k, continuous evaluation, outcome versus process scoring) is in T9.

**Why the middle is urgent now.** L22's thesis is "Generation is cheap. Verification is expensive." Slide 15 sketches human time against task length ("a sketch, not data"): time to generate is almost flat, while time to verify crosses it early and climbs steeply. Two causes are named: errors are subtle ("hard for a person to spot") and there is too much output ("more than anyone can review"). With 50% time horizons doubling every 4–7 months (slide 14, after METR), review load grows faster than the work it replaces. Mechanics 6 shows why this matters for value: review time sits directly in the break-even condition.

**Two pillars.** L22 splits "can I trust this agent?" into two questions (slide 16). **Reliability** is "a property of the agent. Does it work every time?" **Trust** is "a property of the person and the agent together. Does the person know when to rely on it?" A 2×2 grid crosses agent reliability with how easy the output is to verify:

|  | Easy to verify | Hard to verify |
| --- | --- | --- |
| Reliable agent | Delegate | Blind faith |
| Unreliable agent | Spot-check | Don't use |

Blind faith is the dangerous cell: the agent may be good, but nobody can tell when it is not. An unreliable agent is still useful when its errors are cheap to catch. Two levers move work towards Delegate: make the agent more reliable (pillar 1, measured with pass^k and continuous evaluation, see T9), or make its output easier to verify (pillar 2, the rest of this subsection).

**Calibrated reliance.** The slide's caption reads: "The goal is for us to have calibrated reliance on AI agents. Trusting too little and trusting too much are both failures." It cites Lee and See (2004), "Trust in Automation: Designing for Appropriate Reliance", a human-factors classic. Trust should match the automation's actual capability. Over-trust leads to misuse (relying on automation where it fails); under-trust leads to disuse (ignoring it where it would help), terms from Parasuraman and Riley (1997). Reliability is the agent's true capability; trust is the person's model of it. The poll's two ends are the two failures: review-every-line is under-trust paid in hours, YOLO is over-trust paid in silent errors. Beyond the slides (L22's sheet): Lee and See also ask that trust be *resolved* (fine-grained enough to tell situations apart) and *temporally specific* (updated as capability changes). Per-task-type autonomy gives resolution; continuous evaluation and demotion give temporal specificity.

**How we already trust (slide 21).** People and software both have mature trust mechanisms, and the rows line up. On the slide the agent column is four pink question marks; the candidates below are from L22's sheet, beyond the slide.

| Mechanism | For people | For software | Candidate for agents |
| --- | --- | --- | --- |
| Evidence from the past | Track record | Tests | pass^k on this task type; logged production success rate |
| Up-front guarantees | Credentials | Types | Certified capabilities per task type; schemas and contracts on tool calls; sandbox permissions |
| Independent inspection | Audits | Code review | Sampled audits; human or LLM review of trajectories; monitors (L13, L15) |
| Ongoing consequence | Accountability | Continuous integration | Every run logged and re-checked; automatic demotion of autonomy on failures |

The next three slides fill some of the boxes: evidence with the output, attention where it matters, and autonomy that is earned.

**Show your work (slide 22).** With output only ("Here is the patch."), "the person has to read the entire thing or redo the work." With output plus evidence, the patch arrives with five kinds of support: tests it ran, citations, logs, proofs (e.g. Lean), and a reason for each change. "The person checks the evidence instead of redoing the work." Evidence restores the old asymmetry that checking is cheaper than doing. A Lean proof is the extreme case: the proof assistant checks every step, so the person reads only the theorem statement. A per-change reason lets a reviewer reject one unjustified edit without re-deriving the patch. The pitfall: evidence the agent produces can be selective or fabricated, such as tests that test the wrong thing or citations that do not support the claim. It helps only when it can be checked independently, by re-running the tests in CI or opening the source.

**Where to look (slide 23).** A diff of `apply_refund(order, amount)` adds seven lines. One, `db.run("DELETE FROM holds", order.user)`, is highlighted and tagged "Low confidence". "The agent points the reviewer to the few lines that need a careful read." The flagged line deserves it: it deletes every hold for the user, not just this order's, and it is irreversible. The slide lists five ways to direct attention: calibrated confidence, flags on uncertain parts, summaries of what it did, review by risk, and spot-checks and audits. Slide 20 states the same rule for trajectories: "Humans are the scarce resource. Send them the important steps where the automatic checker is least sure." Calibration is the hard requirement. An agent that flags everything recreates subsection 6's alert fatigue (Mechanics 5); one that never flags is back to output only. L22's sheet works an example: 200 agent PRs a week, 16 of them defective. Review-every-line costs 133.3 hours and lets 1.6 defects escape; YOLO lets all 16 through. Evidence plus calibrated flags costs 53.3 hours for 2.8 escapes. The same hours with uncalibrated flags let 6.4 escape.

**Earned autonomy (slide 24).** "Agents get more freedom on a type of task as their track record on it grows, the way driving automation is described in levels."

| Level | Name | Who does what |
| --- | --- | --- |
| 1 | Suggest | The person does the work |
| 2 | Draft | The person approves every step |
| 3 | Act, ask first on risky steps | Agent acts; risky steps need approval |
| 4 | Act, with sample audits | Agent acts; a sample of runs is checked afterwards |
| 5 | Act alone | On this type of task only |

A tag adds: "A good agent also knows when to ask." Three ideas follow. Autonomy is **per task type**: Level 5 on "issue refunds under $50" says nothing about "migrate the billing database". It is **earned and can be lost**: promotion follows a track record (pillar 1), and demotion follows failures or drift. **Asking is a skill**: at Levels 3–4 the agent must recognise risky or uncertain steps itself, the agent-side half of calibration. The analogy is SAE J3016's driving-automation levels; the human-factors ancestor is Sheridan and Verplank's ten levels of automation (1978). Mechanics 12 turns promotion and demotion into a rule.

**Links to confirmation policies.** L22 places L14's OpenHands confirmation prompts at Level 3. Beyond the lecture, in subsection 6's terms, `AlwaysConfirm()` is Level 2 and the risk-based `ConfirmRisky` policy is Level 3. L22's sheet notes that coding agents already expose such permission modes: suggest only, approve each edit or command, auto-approve inside a sandbox but ask for network or destructive actions, and fully autonomous runs. L13's lesson still applies: a level is real only when enforced outside the model (scoped permissions, an approval node as in L15), not stated in a prompt.

**Links to L19.** L19's comprehension results are the empirical warning against YOLO: users who auto-accepted agent edits scored 0.615 on comprehension, against 0.777 for those who accepted each change (subsection 13). A Level 4 audit is a real check only if the auditor understands what they audit. PULSE (subsection 12) is one form of the continuous, in-deployment evaluation that keeps a track record current. Beyond the lecture: the Human Agency Scale (subsection 5) and earned autonomy answer different questions. HAS describes how much human involvement a task needs or workers want; earned autonomy describes how much freedom an agent has been granted on a task type from evidence. A task workers rate H3 should cap the level whatever the record says.

*Common misconception:* "A reliable agent can be trusted." Reliability belongs to the agent; trust also needs the person to see when to rely on it. A reliable agent on hard-to-verify work is blind faith, and autonomy must be granted per task type from evidence and withdrawn when the evidence changes.

## Across the lectures

The human appears in almost every lecture, but usually as an assumption (the person who writes the prompt, labels the data or approves the action); L17 and L18 are where the course makes the human a first-class part of the system.

**L1–L2 (agent loop, tools).** The loop is defined as observe → think → act until done, with the user only at the start and the end. L17 asks what that loop is *for*: which jobs, and with how much human involvement. In HAS terms, the L1 loop is an H1 design by default; T1's harness is where steering hooks and approval gates must later be inserted.

**L3–L4 (context, memory, skills).** L17's NANDA barriers ("doesn't learn from our feedback", "too much manual context each time") are the L3–L4 problems seen from the customer's side. Agent Workflow Memory, Zora Wang's earlier work covered in L4, is one concrete answer: induce reusable workflows from past episodes. L13's OpenClaw incident adds a warning from L3: an instruction that lives only in context can be compacted away.

**L5 (planning, multi-agent).** Plan-then-execute creates natural checkpoints for human review. L18 generalises multi-agent coordination and shows its cost; L17's efficiency slide shows the redundancy of large agent systems. See T5 for coordination patterns.

**L6 and L14 (coding agents, OpenHands).** L6 makes SWE-bench the archetype of verifiable work. L17 then shows its saturation, contamination and patch bloat. L14 supplies the human-facing engineering: confirmation policies (`AlwaysConfirm`, risk-based), interfaces (CLI, IDE, GUI, integrations), and the "Code with Me or for Me?" study (correctness about 0.25 → 0.60, active time about 25 → 12.5 min). L14's automation pattern (trigger → context → isolated run → artifact → check) moves the human to the end as a reviewer.

**L7 (computer use).** L7 provides environments (OSWorld, WebArena, MyPCBench) and the judge-error arithmetic that shows how an 85%-agreement judge can inflate a score. Its open problems (personalisation via GUM, background computer use with consent and an off switch) are L17's collaboration agenda applied to GUIs. L17's Gym-Anything and CUA-World answer L7's question of how to scale environments.

**L8–L12 (training, rewards).** BAGEL and NNetNav's hindsight relabelling connect to L8's synthetic trajectories. L9–L11's policy-gradient methods are what PPP, SWEET-RL and simulator-collapse experiments use, with the twist that the environment contains another policy. L11–L12's reward hacking reappears as simulator collapse: the hacked object is the simulated user.

**L10 (deep research).** L10 supplies the evidence that rubrics work (expert–LM agreement 79% vs expert–expert 80%) and that generated rubrics can be wrong (15% bad items in ResearchQA). DR Tulu's evolving rubrics, born for training, reappear in L17 as test-time adaptation from user feedback.

**L13 (safety).** L13 frames confirmation and stop controls as security controls that must live outside the model, and warns of alert fatigue. L17 adds that many harms in ordinary work must be elicited empirically (AutoElicit) rather than enumerated. See T14.

**L15 (orchestration, monitoring).** L15 makes the human a typed workflow node with approve / edit / reject outputs, persisted by a checkpointer so runs can wait hours. Its monitoring half (Docent, Hodoscope) is the scalable alternative when humans cannot watch every trajectory.

**L17 (Wang).** The organising lecture: reality check, the task / environment / evaluation triad, and "capable agents are not enough".

**L18 (Vaduguru).** Recasts the human as another agent with private information, then trains against simulated humans. Its practical rule (always evaluate on held-out simulators and real users) is the training-side version of L17's construct-validity critique.

**Where lectures disagree or pull in different directions.**

- **Autonomy as the goal.** L6, L7 and L14's automation section celebrate rising autonomous success and unattended runs. L17 argues autonomous rankings can reverse under collaboration (CollabSkill) and that most work wants H2–H4. Both are right for different tasks: the automation pattern fits well-specified, verifiable work; collaboration fits fuzzy or personal work.
- **Confirmation versus isolation.** L13 and L14's interactive examples put a human approval before risky actions. L14's automation exercise concludes that, for unattended runs, high-risk actions should be made impossible rather than confirmable. The deciding variable is whether a person is actually available and attentive.
- **Simulated versus real humans.** L18 trains against simulators because real users do not scale; L17's evidence (CollabSkill, CowCorpus, TAHI) comes from real users. L18's simulator-collapse result is the bridge: simulators help only if diverse and validated against people.
- **More agents versus efficiency.** L18 shows communicating swarms sometimes win; L17 shows thousands of agent-hours per result and asks whether that is efficient. Cost per accepted deliverable is the common currency.

### L19 · Human–AI collaboration in the agentic era (Chen)

L19 is the third lecture in a row on humans and agents, and it moves the topic from simulated users to real ones. L17 asked which work agents should do and how users steer them. L18 trained agents against user simulators. L19 works with field studies, OpenHands deployment telemetry and controlled human-subject experiments, organised as three thrusts: optimise the interaction, learn from it, and understand its downstream effects (Core concepts 10–13).

**What it changes in this sheet's picture.**

- **Evaluation target.** Subsection 2's reality gap and subsection 7's collaboration benchmarks gain a third axis: the human's resulting understanding. A pair can finish more tasks while the person understands less (comprehension 0.82 → 0.67 with an agent).
- **Steering vocabulary.** Subsection 6 treats steering and approval as mechanisms. L19 adds a design checklist for each phase, before / during / after, from Horvitz (1999) and Amershi et al. (2019).
- **Proactivity.** Subsection 8's PPP rewards proactive questions in training. L19 shows the run-time side: ToM-SWE infers the user's preferences from past sessions, and the IDE field study shows that timing (commit boundary versus mid-task) decides whether help is welcome.
- **Evaluation from behaviour.** Subsection 4's rubrics and L10's evolving rubrics are judged by experts or LLMs. L19 adds rubrics and ratings inferred from user behaviour: PULSE's rating predictor, the rubric-supervised critic and Cursor's real-time RL.

**Links to other lectures.** L1–L2: proactivity adds a new loop decision, whether to act at all right now. L3–L4: ToM-SWE is a memory system aimed at the user, shown beside Letta's sleep-time compute. L5: "show the plan" is one of PULSE's compared designs (+0.03, significant only with PULSE). L6 and L14: every study is on coding agents, most on OpenHands. L9 and L11–L12: real-time RL is RLHF with feedback read off behaviour, and it inherits reward hacking (T12). L13 and L15: approval only protects if the approver understands the change (T14).

**What stays unresolved.** No study yet rewards an agent for making its user more capable over months, and most participants are students or developers. See Open problems 11–12.

### L22 · How to trust your AI agents (Narasimhan)

L22 is an evaluation lecture with a human-factors ending. Its first two parts trace who supplies ground truth: human labels, environment reward (WebShop), developer tests (SWE-bench), and simulated users with final-state checks (τ-bench). They show that no rung yet checks a week of agent work (T9 covers this ladder, pass^k and continuous evaluation). Its third part, "two pillars", lands squarely in this topic. Pillar 2 defines trust as a property of the person and the agent together and asks what replaces line-by-line review (Core concept 14).

**What it changes in this sheet's picture.**

- **Oversight cost.** Subsection 6 and Mechanics 5 treat human attention as a budget that alerts can exhaust. L22 adds that the budget is being outrun: time to verify now rises faster with task length than time to generate. Mechanics 6's review term t\_r is where that shows up.
- **Steering versus permission.** Subsection 6 asks how a person steers a run; subsection 5's HAS asks how much involvement a task needs. L22 adds a third axis: how much freedom an agent has *earned* on a task type, granted in levels 1–5 from its track record and withdrawn on failure.
- **What the agent hands over.** Subsection 7's patch bloat and subsection 13's comprehension gap say outputs are hard to review. L22's answer is to change the deliverable: output plus evidence (tests, citations, logs, proofs, a reason per change) and flags that point to the few lines that need a careful read.
- **A target for interaction design.** Lee and See's calibrated reliance gives the sheet one criterion that spans its mechanisms. Approval gates, proactive check-ins and earned autonomy all succeed when reliance matches real reliability.

**Links to other lectures.** L13: monitors and unsafe-action flags become process scores, and an autonomy level must be enforced outside the model. L14: OpenHands' confirmation prompts are L22's Level 3. L15: Docent and Hodoscope supply the "testing at scale" and failure grouping that build a track record. L17: GDPval-style rubric judges are the current attempts at a check for open-ended work. L19: comprehension results warn against YOLO merging, and PULSE is evaluation in deployment.

**What stays unresolved.** L22 shows no data on calibrated flags from real agents; the review-hours comparison is a worked example in L22's sheet, not a study. Who checks agent-written evidence, and where one task type ends and the next begins, are open (Open problems 13–14).

## Mechanics

This section turns the sheet's claims into formulas you can compute: how reliability shrinks a time horizon, how rubric scores and judge errors behave, when human oversight pays, how alerts and costs scale, and how simulated-user training and evolving rubrics run step by step.

### 1. From a 50% time horizon to a reliable one

METR models the probability that a model succeeds on a task that takes a human expert t minutes as a logistic function of log task length:

$$
P(\text{success} \mid t) = \sigma\big(\beta\,(\log_2 h_{50} - \log_2 t)\big), \qquad \sigma(z) = \frac{1}{1 + e^{-z}}
$$

Here h\_50 is the 50% time horizon (the t where P = 0.5) and β is the slope in logits per doubling of task length. To find the horizon h\_q at reliability q, set P = q and solve. Taking the logit of both sides gives logit(q) = β (log2 h\_50 − log2 h\_q), so:

$$
h_q = \frac{h_{50}}{2^{\,\mathrm{logit}(q)/\beta}}, \qquad \mathrm{logit}(q) = \ln\frac{q}{1-q}
$$

**Worked example.** Take h\_50 = 240 minutes and β = 0.6. For q = 0.8, logit = ln 4 = 1.386, so the divisor is 2^(1.386/0.6) = 2^2.31 = 4.96 and h\_80 = 48 minutes. For q = 0.9, logit = ln 9 = 2.197, the divisor is 2^3.66 = 12.7 and h\_90 = 19 minutes. For q = 0.99, logit = 4.595, the divisor is 2^7.66 = 202 and h\_99 is about 1.2 minutes. A model with a "4-hour horizon" is only a one-minute model at the reliability a worker needs. This is L17's "fair automation measure?" question in numbers; a flatter curve (smaller β) makes the gap worse.

**Compounding.** A job of n independent steps, each succeeding with probability p, succeeds with probability p^n. At p = 0.95 and n = 20 that is 0.95^20 = 0.36. If a reviewer catches and fixes a fraction c of step failures, the effective per-step reliability is p + (1 − p) c; with c = 0.8 it becomes 0.99 and the job success 0.99^20 = 0.82. Oversight changes the arithmetic of long tasks more than a small gain in p does.

### 2. Weighted rubric scores

A rubric is a set of K criteria r\_k with weights w\_k; negative weights mark "must not" items. The judge returns J\_k = Judge(r\_k, y) in {0, 1} for deliverable y. The normalised score is:

$$
S(y) = \frac{\sum_{k=1}^{K} w_k\, J_k(y)}{\sum_{k:\, w_k > 0} w_k}
$$

Dividing by the positive weight puts S on a scale where 1.0 means all positive items met and no violations; a violated negative item can push S below 0. DR Tulu (L10, L17) uses the same weighted sum, with the criteria set changing over training.

**Data format.** A CollabSkill-style rubric file (L17, slide 39) fixes 100 points across four categories. A minimal example for an audit-sampling deliverable:

```json
{
  "task_id": "audit-sample-q2q3",
  "total_points": 100,
  "categories": [
    {"name": "Correctness & Accuracy", "points": 40, "items": [
      {"id": "c1", "text": "Sample size uses z=1.645, p=0.5, E=0.10 with finite population correction, rounded up", "points": 20, "check": "code"},
      {"id": "c2", "text": "Sampled rows match the source exactly", "points": 20, "check": "code"}]},
    {"name": "Deliverable Completeness", "points": 20, "items": [
      {"id": "d1", "text": "Workbook has a sheet named 'Sample Size Calculation'", "points": 20, "check": "code"}]},
    {"name": "Task Requirements", "points": 25, "items": [
      {"id": "t1", "text": "Every selection criterion is covered by at least one sampled row", "points": 25, "check": "code"}]},
    {"name": "Technical Quality", "points": 15, "items": [
      {"id": "q1", "text": "Variance analysis is explained clearly enough for a reviewer to follow", "points": 15, "check": "llm_judge"}]}
  ],
  "must_not": [{"id": "n1", "text": "Fabricates rows not present in the population", "points": -30, "check": "code"}]
}
```

The `check` field is a design choice beyond the lecture: route every verifiable item to code and only semantic items to the judge. Here 85 of 100 points never touch an LLM, which removes judge noise and self-preference from them.

**Judge noise on a rubric.** If the judge flips each item's verdict independently with probability ε, the expected score of a deliverable that truly meets a fraction f of equally weighted items becomes f(1 − ε) + (1 − f)ε = f + ε(1 − 2f). Noise pulls every score towards 0.5: strong outputs are under-rated and weak ones over-rated, compressing the scale and making close comparisons harder.

### 3. Correcting a biased judge, and how rankings flip

L7 models a binary judge by its true-positive rate (TPR, says PASS when the task succeeded) and false-positive rate (FPR, says PASS when it failed). For an agent with true success rate s, the measured rate m and the judge–human agreement A are:

$$
m = \mathrm{TPR}\cdot s + \mathrm{FPR}\cdot (1 - s), \qquad A = \mathrm{TPR}\cdot s + (1 - \mathrm{FPR})(1 - s)
$$

Solving the first equation for s gives the correction you apply once TPR and FPR are estimated on a human-labelled sample:

$$
\hat{s} = \frac{m - \mathrm{FPR}}{\mathrm{TPR} - \mathrm{FPR}}
$$

**Ranking flip.** Agent A has s = 0.50; agent B has s = 0.40 but fails in plausible-looking ways, so the judge's FPR is 0.25 for A and 0.40 for B (TPR = 0.92 for both). Then m\_A = 0.46 + 0.125 = 0.585 and m\_B = 0.368 + 0.24 = 0.608. The weaker agent wins on the leaderboard although agreement on A's episodes is a respectable 0.835. A single, model-independent FPR is an assumption; check it per model, as L7 advises.

**Self-preference ratio.** Pombal et al.'s measure compares how often a judge overestimates outputs from its own model family versus others':

$$
\mathrm{HSPP} = \frac{P(\hat{J} > J^{*} \mid \text{own family})}{P(\hat{J} > J^{*} \mid \text{other families})}
$$

Here Ĵ is the judge's verdict and J\* the reference (human) verdict. HSPP = 1 means no bias. L17 reports up to about 1.65 for pairwise comparison and about 1.0–1.2 for rubric protocols. Mitigations: judge with a different model family, use rubric items rather than pairwise preference, and average over several judges.

### 4. When does watching the agent pay? Human time under H1 and H3

Compare two ways a person can use an agent on a task the agent completes alone with probability p.

- **H1 (check afterwards):** the agent runs unsupervised; the person spends c minutes checking each result and redoes failures manually in r minutes.
- **H3 (watch and steer, CowPilot-style):** the person watches for w minutes; on a failing run they intervene for i minutes and rescue it with probability q; unrescued failures are redone in r minutes.

Both end with the task done, so compare expected human minutes:

$$
T_{H1} = c + (1-p)\,r, \qquad T_{H3} = w + (1-p)\big(i + (1-q)\,r\big)
$$

Subtracting, H3 saves time exactly when:

$$
T_{H3} < T_{H1} \iff w - c < (1-p)\,(q\,r - i)
$$

Read it as: the extra watching cost (w − c) must be smaller than the failure rate times the net value of a rescue (q r − i). Two consequences follow. Watching pays most for a mediocre agent (large 1 − p) whose failures are cheap to rescue (large q, small i). As the agent improves, (1 − p) shrinks and watching stops paying, which is why takeover and hands-off users exist.

**Worked example.** With p = 0.4, c = w = 3, i = 4, q = 0.7 and r = 20 (L17 sheet's example), T\_H1 = 3 + 0.6 × 20 = 15 and T\_H3 = 3 + 0.6 × (4 + 0.3 × 20) = 9 minutes. Now strengthen the agent to p = 0.7 and make watching costlier (w = 6, c = 2, r = 30, i = 5, q = 0.6): T\_H1 = 2 + 0.3 × 30 = 11, T\_H3 = 6 + 0.3 × (5 + 0.4 × 30) = 11.1. The two modes break even; any better agent makes H1 cheaper. An agent that recognises the user's mode (L17) is effectively choosing where on this curve to sit.

### 5. Approval gates and alert precision

An approval gate (L13–L15) is a classifier that pauses some actions for a person. If unsafe actions occur at base rate b, the monitor catches them with true-positive rate TPR and flags safe actions with false-positive rate FPR, then:

$$
\text{precision} = \frac{\mathrm{TPR}\cdot b}{\mathrm{TPR}\cdot b + \mathrm{FPR}\cdot (1-b)}, \qquad \text{alerts per run} = n\,\big(\mathrm{TPR}\cdot b + \mathrm{FPR}\cdot(1-b)\big)
$$

where n is the number of actions per run. With b = 0.02, TPR = 0.9, FPR = 0.05 and n = 60: precision = 0.018 / (0.018 + 0.049) = 0.27, and a run raises 60 × 0.067 = 4.0 alerts, about 3 of them false. Halving FPR to 0.025 raises precision to 0.42 and cuts alerts to 2.6. The reviewer's attention, not the model's accuracy, is the binding constraint: below roughly 30% precision, people start approving by habit (L13's alert fatigue).

### 6. Cost per accepted deliverable

Accuracy-only leaderboards hide cost. For a task a human would do in t\_h hours at wage W, let the agent cost c\_a per attempt, the person review it in t\_r hours, and the deliverable be accepted with probability a; rejected work is redone by hand. The expected cost with the agent, and the condition for the agent to be worth using, are:

$$
C_{\text{agent}} = c_a + W\,t_r + (1-a)\,W\,t_h, \qquad C_{\text{agent}} < W\,t_h \iff c_a + W\,t_r < a\,W\,t_h
$$

The right-hand inequality says the agent's cost plus review must be smaller than the expected human work it saves. With W = $60/h, t\_h = 2 h, t\_r = 0.25 h and c\_a = $8: the left side is 8 + 15 = $23; the right side is 0.21 × 120 = $25.20 at the best RLI automation rate on L17's leaderboard. The agent barely pays. At a = 0.10 it costs more than doing the work by hand, and a long review (t\_r = 0.5 h) kills it even at a = 0.21. Review time, which patch bloat inflates, sits directly in the break-even condition.

The same logic gives L17's research-agent comparison: cost per solved problem = (hours per run × price per hour) / success rate. At equal 30% success, 19.5 h × $1 / 0.3 = $65 versus 1.3 h × $3 / 0.3 = $13: the pricier-per-hour model is five times cheaper per solution.

### 7. WORKBank zones and research priority

For task j, let D\_j be mean worker desire for automation and C\_j mean expert-rated capability, both on 1–5. The zone rule with threshold 3 is:

```text
if D >= 3 and C >= 3: Green Light   (deploy)
if D <  3 and C >= 3: Red Light     (capable but unwanted)
if D >= 3 and C <  3: R&D Opportunity
if D <  3 and C <  3: Low Priority
```

Within the R&D zone, a natural priority score (beyond the lecture) is the gap D\_j − C\_j weighted by employment E\_j in that occupation: priority\_j = E\_j (D\_j − C\_j). It combines L17's two complaints, that benchmarks ignore large occupations and ignore what workers want, into one ranking.

### 8. Logging interaction and recognising a user's mode

To model interaction you must log it. A CowCorpus-style trace interleaves agent and human actions with who held control (the field names are an illustrative format, not the paper's schema):

```json
{
  "session_id": "s-0142", "user_id": "P07", "task": "Count comments with more downvotes than upvotes...",
  "steps": [
    {"t": 1, "actor": "agent", "action": "click('Forums')"},
    {"t": 2, "actor": "agent", "action": "scroll(down)", "flag": "loop_suspected"},
    {"t": 3, "actor": "human", "action": "goto('/f/space')", "event": "takeover"},
    {"t": 4, "actor": "human", "action": null, "event": "handback"},
    {"t": 5, "actor": "agent", "action": "click('latest post')"}
  ],
  "outcome": {"success": true, "human_steps": 1, "total_steps": 7, "user_rating": 4}
}
```

From each user's sessions compute three features: intervention frequency f = takeovers / agent steps, hand-back rate h = handbacks / takeovers, and mean intervention position π = average of (step of takeover / total steps). Huq, Wang et al. cluster such features with PCA; a transparent rule that reproduces the four modes is:

```text
if f == 0:                    mode = hands-off
elif h < 0.2 and pi > 0.8:    mode = takeover        # late, and keeps control
elif f > 0.2 and h >= 0.5:    mode = hands-on        # frequent, hands back
else:                         mode = collaborative   # rare, modest, hands back
```

The paper goes further and trains a model to predict *when* the next intervention will come, which lets the agent pause and ask before the user has to grab control.

### 9. Training against simulated users

Let π\_θ be the agent policy and S a user simulator (user policy plus reward model). An episode τ is a multi-turn conversation produced by π\_θ and S together, scored by R(τ). Standard training maximises reward against one frozen simulator S\_0; population training maximises it against a distribution 𝒫 over simulators:

$$
J_{\text{single}}(\theta) = \mathbb{E}_{\tau \sim (\pi_\theta, S_0)}\big[R(\tau)\big], \qquad J_{\text{pop}}(\theta) = \mathbb{E}_{S \sim \mathcal{P}}\, \mathbb{E}_{\tau \sim (\pi_\theta, S)}\big[R(\tau)\big]
$$

The policy gradient (T11) is the same in both cases, ∇J = E\[ A(τ) ∇ log π\_θ(a | h) \], with A the advantage and h the dialogue history; only the sampling of partners differs. Simulator collapse is a growing **generalisation gap**:

$$
\Delta(\theta) = J(\theta; S_{\text{train}}) - J(\theta; S_{\text{held-out}}), \qquad H(\pi_\theta(\cdot \mid h)) = -\sum_a \pi_\theta(a \mid h)\log \pi_\theta(a \mid h)
$$

The signature in Yu et al. is Δ rising while the entropy H falls to zero: the policy has committed to one script. With n equally likely replies in S\_0, a policy can memorise the best response to each; with a population, the replies vary per episode and no single script is optimal.

**PPP's reward.** Sun et al. decompose the episode reward into three terms:

$$
R(\tau) = R_{\text{Prod}}(\tau) + R_{\text{Proact}}(\tau) + R_{\text{Pers}}(\tau)
$$

R\_Prod is task success (tests pass, answer correct). R\_Proact rewards asking useful questions and penalises questions that cost the user high effort (the simulator labels each reply low, medium or high effort). R\_Pers rewards following the user's stated preference, such as "only multiple-choice questions". The exact constants are in the paper; the Hands-on program uses illustrative values. The design principle is general: **any behaviour you want but do not reward will drift away under RL**, which is why task-only training erodes proactivity and personalisation.

**Training loop with a simulator population** (pseudocode; verbalized sampling and co-training are options from L18):

```python
pool = [make_simulator(persona) for persona in sample_personas(k=32)]   # goals, styles, knowledge
for step in range(num_steps):
    batch = []
    for _ in range(batch_size):
        sim = random.choice(pool)                       # new partner each episode
        task = sample_task()
        tau = rollout(policy, sim, task, max_turns=12)  # alternate agent and simulated-user turns
        tau.reward = r_prod(tau) + r_proact(tau) + r_pers(tau, sim.preference)
        batch.append(tau)
    policy.update(grpo_or_ppo(batch))                   # T11
    if step % co_train_every == 0:
        pool.append(fine_tune_simulator(pool[-1], batch))  # co-training: partner drifts
    if step % eval_every == 0:
        log(train=mean_reward(policy, pool), held_out=mean_reward(policy, held_out_sims),
            entropy=policy_entropy(policy))             # watch the gap and the entropy
```

SWEET-RL changes one line: the advantage comes from a critic that also sees the hidden reference (privileged information), giving per-turn credit instead of one end-of-episode reward.

### 10. Evolving rubrics from interaction (test-time)

The test-time version of DR Tulu's idea, as in Wang et al.'s TAHI, keeps a per-user rubric that grows with feedback:

```python
rubric = llm_initial_rubric(query)           # e.g. "HTML opens without errors", "text is legible"
for turn in session:
    y = agent(query, history, rubric)        # the agent sees the current rubric as guidance
    feedback = user_reacts(y)                # "+ rank bars by score", "- title 32px"
    new_items = llm_feedback_to_criteria(feedback, y)   # -> "Bars are sorted by score"
    rubric = dedupe_and_merge(rubric, new_items)        # keep old items unless contradicted
    score = weighted_score(rubric, y, judge)            # Section 2 formula
    store(user_id, rubric)                   # reuse for this user's next tasks
```

Cost per turn is one extra LLM call to turn feedback into criteria plus one judge call per rubric item, so a rubric of K items costs K judge calls per scored draft. Batching items into one judge prompt cuts calls but raises correlated errors; the trade-off is the same as Section 2's noise analysis.

### 11. Prediction-powered inference for A/B tests of agent designs (PULSE)

PULSE (L19) compares two agent designs when only a few sessions carry an explicit rating. For design group c there are n\_c rated sessions (X\_i, Y\_i), with X the interaction and Y the rating, and N\_c unrated sessions X̃\_j from the same distribution. A predictor f maps a session's features to a predicted rating. The PPI estimate of the group's mean rating, as on L19's slide (Angelopoulos et al., Science 2023), is:

$$
\hat{\mu}_c(\lambda_c) = \frac{1}{n_c}\sum_{i=1}^{n_c} Y_i + \lambda_c\left(\frac{1}{N_c}\sum_{j=1}^{N_c} f(\tilde{X}_j) - \frac{1}{n_c}\sum_{i=1}^{n_c} f(X_i)\right)
$$

The first term is the ordinary mean of the labels. The bracket compares f's average on unrated and on rated sessions. Both sets come from the same distribution, so the bracket has expectation zero and the estimate is unbiased whatever f is. When f tracks Y, the bracket cancels much of the sampling noise in the label mean. λ\_c = 1 is the original PPI; tuning λ\_c is PPI++.

The two effect sizes on L19's slide are:

$$
\hat{\Delta}_{\text{augment}} = \hat{\mu}_A(\hat{\lambda}_A) - \hat{\mu}_B(\hat{\lambda}_B) \qquad \hat{\Delta}_{\text{naive}} = \frac{1}{n_A}\sum_{i \in A} Y_i - \frac{1}{n_B}\sum_{i \in B} Y_i
$$

**Variance reduction (beyond the lecture).** Write σ\_Y² and σ\_f² for the variances of Y and f, and ρ for their correlation. The variance-minimising weight and the resulting variance are:

$$
\lambda^{*} = \frac{\mathrm{Cov}(Y, f(X))}{(1 + n/N)\,\mathrm{Var}(f(X))} \qquad \mathrm{Var}\big(\hat{\mu}(\lambda^{*})\big) = \frac{\sigma_Y^2}{n}\left(1 - \rho^2 \frac{N}{N+n}\right)
$$

So the confidence interval narrows by the square root of the bracket. Two levers shrink it: a better predictor (higher ρ) and more unrated data (larger N). A useless predictor gets λ\* near 0 and falls back to the naive estimate, so PPI++ never does worse. The variance of the effect is the sum of the two groups' variances.

**Worked example.** A group has n = 200 rated and N = 3,800 unrated sessions, and ρ = 0.6. The variance factor is 1 − 0.36 × 0.95 = 0.658, so the interval is √0.658 ≈ 0.81 as wide, about 19% narrower. Matching that precision naively needs 200 / 0.658 ≈ 304 rated sessions. L19's "up to 40% narrower" needs a width factor of 0.6, a variance factor of 0.36, so 0.95ρ² = 0.64 and ρ ≈ 0.82. This is why PULSE's 26% better correlation from interpretable features matters: the gain grows with ρ².

```python
from statistics import mean, variance, covariance  # Python 3.10+

def ppi_mean(y, f_lab, f_unl):
    """PPI++ estimate of a group's mean rating and its standard error."""
    n, N = len(y), len(f_unl)
    lam = covariance(y, f_lab) / ((1 + n / N) * variance(f_lab + f_unl))
    mu = mean(y) + lam * (mean(f_unl) - mean(f_lab))
    resid = [yi - lam * fi for yi, fi in zip(y, f_lab)]
    se = (variance(resid) / n + lam**2 * variance(f_unl) / N) ** 0.5
    return mu, se, lam

def effect(group_a, group_b, z=1.96):
    """Delta = mu_B - mu_A with a 95% CI; each group is (y, f_lab, f_unl)."""
    (ma, sa, _), (mb, sb, _) = ppi_mean(*group_a), ppi_mean(*group_b)
    d, se = mb - ma, (sa**2 + sb**2) ** 0.5
    return d, (d - z * se, d + z * se)
```

On a synthetic run with 200 rated and 3,800 unrated sessions per arm and a true effect of +0.05, the naive interval was \[+0.020, +0.089\] and the PPI interval \[+0.024, +0.076\], about 25% narrower.

**The assumption that matters.** PPI needs rated and unrated sessions to come from the same distribution. On a real platform, angry and delighted users rate more often. Then both estimators are biased, and a narrower interval only makes you confidently wrong. Ask a random sample of sessions for ratings, or reweight by the probability of rating. Also exclude features the design changes mechanically (showing a plan adds a message, which inflates "user messages").

### 12. Earned autonomy: a promotion rule with confidence bounds

L22's slide 24 says autonomy grows "as their track record on it grows" but gives no rule. L22's sheet supplies one; everything in this subsection beyond the five levels is from that sheet, not the slides. Each task type keeps its own level and its own record of checked runs. With k successes in n checked runs and p̂ = k/n, the Wilson 95% interval (z = 1.96) is:

$$
\frac{\hat{p} + \frac{z^2}{2n} \pm z\sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}
$$

**The rule.** Promote from level L to L+1 when n ≥ MIN\_N\[L+1\] and the lower bound clears BAR\[L+1\]. Demote to L−1 when the upper bound falls below BAR\[L\]. At Levels 4–5, an audited severe failure demotes at once to Level 3. After any move the record restarts, so each level is earned with fresh evidence. Promoting on the lower bound and demoting on the upper bound gives hysteresis, so the level does not flap.

| Level | BAR (lower bound to reach) | MIN\_N (checked runs) | Share of runs a person checks |
| --- | --- | --- | --- |
| 2 Draft | 0.70 | 20 | 100% |
| 3 Ask on risky | 0.85 | 50 | 100% |
| 4 Sample audits | 0.93 | 150 | 20% |
| 5 Act alone | 0.97 | 400 | 5% |

```python
def update_level(level, record, severe_in_audit):
    if severe_in_audit and level >= 4:
        return 3, []                      # severe failure: drop to "ask on risky"
    k, n = sum(record), len(record)
    lo, hi = wilson(k, n)
    if level < 5 and n >= MIN_N[level + 1] and lo >= BAR[level + 1]:
        return level + 1, []              # promote, restart the record
    if level > 1 and hi < BAR[level]:
        return level - 1, []              # demote, restart the record
    return level, record
```

**Worked numbers.** 148 successes in 150 audited runs give p̂ = 0.9867 and a Wilson lower bound of about 0.953, which clears Level 4's bar of 0.93. With zero failures the lower bound simplifies to n / (n + z²), so reaching 0.97 needs n ≥ 0.97 × 3.8416 / 0.03 ≈ 124.2, that is 125 straight successes. The rule of three gives the zero-failure view: no failures in n runs bounds the failure rate below about 3/n at 95%. Claiming under 1% needs about 300 runs; under 0.1%, about 3,000.

**What a simulation shows.** L22's sheet runs this policy for 5,000 runs per task type, with outcomes drawn at random (no LLM). A refund task succeeds 98.5% of the time until a model update at run 3,000, then 90%. It reaches Level 4 at run 220 and is demoted three times by severe audit findings. After the update it cannot clear 0.93 again and stays at Level 3. Review costs 338 hours against 2,500 for line-by-line review at 30 minutes a run. The price is 41 failures that ran at Level 4 with only a 1-in-5 chance of audit. A data-migration task at 80% stays at Level 2 (1,023 hours), because its lower bound never reaches 0.85. Level 5 is never reached. It needs 400 audited runs at a 20% audit rate, about 2,000 runs. With 0.3% of runs severe, about 1.2 severe failures are expected among those 400, so demotion nearly always comes first.

**Audit-rate bias.** At Level 4 only a sample is checked, so the record grows slowly and rare severe failures may never be audited. Audit more heavily right after a promotion or a model update, and weight audits towards high-risk runs. BAR, MIN\_N and the audit rates encode risk appetite. A finance team might demand 0.99 for Level 4 and audit half of all runs.

## Hands-on

Three worked examples: a runnable program that reproduces simulator collapse and PPP's reward lesson in miniature, a numeric walkthrough of when collaboration beats autonomy, and a design walkthrough for evaluating a document-extraction agent.

### Example 1 — Simulator collapse and the three-part reward (runnable)

The program trains a tiny customer-support policy against simulated users with REINFORCE (T11). Experiment 1 compares training against one frozen simulator with training against a population, then evaluates both on a held-out panel of "real" users, mirroring Yu et al. (L18). Experiment 2 compares a task-only reward with a PPP-style reward R = R\_prod + R\_proact + R\_pers. The LLM user simulators are stubbed: each persona is a probability table standing in for `call_llm(messages) -> str` with a persona prompt. Standard library only; run with `python3 sim_collapse.py`.

```python
"""Training a support agent against simulated users: simulator collapse and PPP-style rewards.
Standard library only. The 'LLM' user simulators are stubs: each persona is a small
probability table, standing in for call_llm(messages) -> str with a persona prompt.
The agent is a tabular softmax policy trained with REINFORCE (L11) plus a baseline."""
import math, random

CONTEXTS = ["return", "broken", "lost_tracking"]          # user's opening message type
ACTIONS = ["ASK_ORDER_ID", "LOOKUP_BY_EMAIL", "ESCALATE"]

# A persona = P(user has the order ID at hand | context). A frozen LLM simulator tends to
# collapse onto one dominant reply pattern, e.g. "Sure, it's #12345." almost every time.
FROZEN_SIM = {"return": 0.97, "broken": 0.97, "lost_tracking": 0.97}
TRAIN_POP = [FROZEN_SIM,
             {"return": 0.6, "broken": 0.3, "lost_tracking": 0.05},
             {"return": 0.9, "broken": 0.5, "lost_tracking": 0.2},
             {"return": 0.4, "broken": 0.2, "lost_tracking": 0.0}]
HELD_OUT = [{"return": 0.8, "broken": 0.4, "lost_tracking": 0.1},   # "real users" panel
            {"return": 0.7, "broken": 0.5, "lost_tracking": 0.15},
            {"return": 0.85, "broken": 0.35, "lost_tracking": 0.05}]

def simulate_episode(persona, ctx, action, rng):
    """Return task reward in [0, 1] for one short support episode."""
    has_id = rng.random() < persona[ctx]
    if action == "ASK_ORDER_ID":
        return 1.0 if has_id else 0.0      # user without an ID gets stuck
    if action == "LOOKUP_BY_EMAIL":
        return 0.8                          # always works, a bit slower
    return 0.3                              # escalation: resolved, but costly

def softmax(z):
    m = max(z); e = [math.exp(v - m) for v in z]; s = sum(e)
    return [v / s for v in e]

def entropy(p):
    return -sum(q * math.log(q) for q in p if q > 0)

def train(personas, steps=3000, lr=0.5, seed=0, log_every=750):
    rng = random.Random(seed)
    theta = {c: [0.0] * len(ACTIONS) for c in CONTEXTS}
    baseline = {c: 0.5 for c in CONTEXTS}
    yield 0, theta                                        # untrained, uniform policy
    for t in range(1, steps + 1):
        persona = rng.choice(personas)                    # population: new partner each episode
        ctx = rng.choice(CONTEXTS)
        p = softmax(theta[ctx])
        a = rng.choices(range(len(ACTIONS)), weights=p)[0]
        r = simulate_episode(persona, ctx, ACTIONS[a], rng)
        adv = r - baseline[ctx]
        baseline[ctx] += 0.05 * adv
        for k in range(len(ACTIONS)):                     # REINFORCE gradient of log softmax
            theta[ctx][k] += lr * adv * ((1.0 if k == a else 0.0) - p[k])
        if t % log_every == 0:
            yield t, theta

def expected_reward(theta, personas):
    """Exact expected reward of the current policy on a set of personas."""
    total = 0.0
    for persona in personas:
        for ctx in CONTEXTS:
            p = softmax(theta[ctx])
            vals = [persona[ctx], 0.8, 0.3]               # E[r] for each action
            total += sum(pi * v for pi, v in zip(p, vals))
    return total / (len(personas) * len(CONTEXTS))

def mean_entropy(theta):
    return sum(entropy(softmax(theta[c])) for c in CONTEXTS) / len(CONTEXTS)

print("Experiment 1: one frozen simulator vs a population of simulators")
print(f"{'setting':12} {'step':>5} {'train R':>8} {'held-out R':>10} {'entropy':>8}")
for name, pop in [("frozen-1", [FROZEN_SIM]), ("population", TRAIN_POP)]:
    for step, theta in train(pop):
        print(f"{name:12} {step:5d} {expected_reward(theta, pop):8.3f} "
              f"{expected_reward(theta, HELD_OUT):10.3f} {mean_entropy(theta):8.3f}")
    for ctx in CONTEXTS:
        p = softmax(theta[ctx]); best = ACTIONS[max(range(3), key=lambda k: p[k])]
        print(f"    {ctx:14} -> {best:16} (p={max(p):.2f})")
oracle = sum(max(h[c], 0.8) for h in HELD_OUT for c in CONTEXTS) / (len(HELD_OUT) * 3)
print(f"held-out oracle (best action per context) = {oracle:.3f}")

# ---------- Experiment 2: task-only reward vs PPP reward (R = R_prod + R_proact + R_pers) ----
# One ambiguous task. The user's stated preference: "only answer multiple-choice questions".
Q_ACTIONS = {            # P(task success), user effort, follows preference?
    "GUESS_NO_QUESTION": (0.45, "none", True),
    "OPEN_QUESTION":     (0.90, "high", False),   # "I'm stuck, can you give me hints?"
    "OPTIONS_QUESTION":  (0.85, "low",  True),    # "Which caused it? A. ... B. ..."
}
def r_parts(action, rng):
    succ, effort, follows = Q_ACTIONS[action]
    r_prod = 1.0 if rng.random() < succ else 0.0
    r_proact = {"none": 0.0, "low": 0.1, "high": -0.5}[effort]
    r_pers = 0.2 if follows else -0.3
    return r_prod, r_proact, r_pers

def train_q(use_ppp, steps=4000, lr=0.3, seed=1):
    rng = random.Random(seed); names = list(Q_ACTIONS); theta = [0.0] * 3; b = 0.0
    for _ in range(steps):
        p = softmax(theta); a = rng.choices(range(3), weights=p)[0]
        rp, ra, rs = r_parts(names[a], rng)
        r = rp + ra + rs if use_ppp else rp
        adv = r - b; b += 0.02 * adv
        for k in range(3):
            theta[k] += lr * adv * ((1.0 if k == a else 0.0) - p[k])
    p = softmax(theta)
    prod = sum(pi * Q_ACTIONS[n][0] for pi, n in zip(p, names))
    low_effort = sum(pi for pi, n in zip(p, names) if Q_ACTIONS[n][1] != "high")
    pers = sum(pi for pi, n in zip(p, names) if Q_ACTIONS[n][2])
    return p, prod, low_effort, pers

print("\nExperiment 2: what the reward leaves out drifts away")
print(f"{'reward':10} {'P(guess)':>8} {'P(open)':>8} {'P(opts)':>8} {'productivity':>12} "
      f"{'low-effort':>10} {'follows pref':>12}")
for label, ppp in [("task-only", False), ("PPP", True)]:
    p, prod, lowe, pers = train_q(ppp)
    print(f"{label:10} {p[0]:8.2f} {p[1]:8.2f} {p[2]:8.2f} {prod:12.3f} {lowe:10.2f} {pers:12.2f}")
```

Real output (Python 3, stdlib only):

```text
Experiment 1: one frozen simulator vs a population of simulators
setting       step  train R held-out R  entropy
frozen-1         0    0.690      0.511    1.099
frozen-1       750    0.963      0.440    0.131
frozen-1      1500    0.967      0.436    0.064
frozen-1      2250    0.967      0.436    0.057
frozen-1      3000    0.968      0.435    0.044
    return         -> ASK_ORDER_ID     (p=0.99)
    broken         -> ASK_ORDER_ID     (p=0.99)
    lost_tracking  -> ASK_ORDER_ID     (p=1.00)
population       0    0.535      0.511    1.099
population     750    0.792      0.793    0.151
population    1500    0.797      0.797    0.087
population    2250    0.798      0.798    0.036
population    3000    0.798      0.798    0.034
    return         -> LOOKUP_BY_EMAIL  (p=1.00)
    broken         -> LOOKUP_BY_EMAIL  (p=1.00)
    lost_tracking  -> LOOKUP_BY_EMAIL  (p=0.99)
held-out oracle (best action per context) = 0.806

Experiment 2: what the reward leaves out drifts away
reward     P(guess)  P(open)  P(opts) productivity low-effort follows pref
task-only      0.00     0.98     0.02        0.899       0.02         0.02
PPP            0.00     0.00     1.00        0.850       1.00         1.00
```

**What to notice.**

- **Training reward up, held-out reward down.** Against the frozen simulator, training reward climbs from 0.690 to 0.968 while held-out reward falls from 0.511 to 0.435, *below the untrained policy*. That is the signature in Yu et al.'s Gemini-3-Flash run (L18).
- **Entropy collapse.** Mean policy entropy drops from ln 3 = 1.099 to 0.044: one script ("What's your order ID?") for every user, including the one who lost their tracking number.
- **The population fixes generalisation, not entropy.** The population-trained policy is also nearly deterministic (0.034), but it committed to the action that works for everyone (lookup by email), reaching 0.798 against an oracle of 0.806. Low entropy is only a problem when it is the wrong commitment.
- **Task-only reward erases collaboration.** With task reward alone, the policy asks the open, high-effort question 98% of the time because it is 5 points more likely to succeed (0.90 vs 0.85). The PPP reward trades those 5 points of productivity for 100% low-effort, preference-following questions. Note that the paper found no productivity cost at all; here the cost is real but small, which is the usual trade-off.
- **Exercise.** Add a fourth held-out persona with P(has ID) = 1.0 in every context. Does the population policy still win? Then set LOOKUP\_BY\_EMAIL's reward to 0.6 (in both simulate\_episode and the vals list of expected\_reward) and rerun: a contextual policy (ask in `return`, look up elsewhere) should now emerge.

### Example 2 — Should the team watch its agent? (numeric walkthrough)

A finance-operations team reconciles 400 vendor invoices a month; each takes a person 25 minutes by hand. An agent's success rate, measured by an LLM judge, is m = 0.66.

1. **Correct the judge first (Mechanics §3).** On 100 human-labelled runs the judge has TPR = 0.90 and FPR = 0.30. True success is ŝ = (0.66 − 0.30) / (0.90 − 0.30) = 0.36 / 0.60 = **0.60**. Judge–human agreement is 0.9 × 0.6 + 0.7 × 0.4 = 0.82, which sounds fine but hides a 6-point overestimate.
2. **H1, check afterwards.** Checking takes c = 4 minutes; failures are redone in r = 25. T\_H1 = 4 + 0.4 × 25 = **14 minutes** per invoice. Using the uncorrected 0.66 would have predicted 4 + 0.34 × 25 = 12.5, overstating savings by 600 minutes a month.
3. **H3, watch and steer.** Watching costs w = 6 minutes; an intervention takes i = 3 minutes and rescues the run with q = 0.75. T\_H3 = 6 + 0.4 × (3 + 0.25 × 25) = 6 + 0.4 × 9.25 = **9.7 minutes**.
4. **Monthly impact.** Against 25 minutes by hand, H1 saves 11 minutes per invoice (73 hours a month) and H3 saves 15.3 minutes (102 hours a month).
5. **When to switch modes.** From Mechanics §4, H3 beats H1 while w − c < (1 − p)(q r − i), that is 2 < (1 − p) × 15.75, so 1 − p > 0.127. Once true success passes about **87%**, checking afterwards becomes cheaper than watching.

**What to notice.**

- The judge correction changed the business case before any interaction design was discussed. Calibrate evaluators on human labels first (T9).
- Collaboration beat autonomy by 4.3 minutes per task with the same agent. The value came from cheap, effective rescues (q r − i = 15.75 minutes per rescue).
- The optimal mode depends on agent reliability, so it should change as the agent improves. An agent that recognises when the user should watch (L17's interaction modes) automates this switch.

### Example 3 — Designing evaluation and interaction for a document-extraction agent (design walkthrough)

Suppose an agent reads a structural-engineering drawing set and specification and produces a bill of quantities (BOQ): items, units, quantities and the clauses they comply with, plus a short compliance narrative. Here is how this sheet's ideas turn into a design.

**Step 1 — Split the deliverable along the verifiable-to-fuzzy spectrum.**

| Part of the deliverable | Spectrum position | Evaluator | Human agency level |
| --- | --- | --- | --- |
| Quantities (concrete m³, rebar kg) | Verifiable | Code: within ±2% of a reference takeoff; units consistent | H2: engineer resolves ambiguous dimensions |
| Item coverage (every element on the drawings appears once) | Verifiable | Code: element list from drawing index vs BOQ lines | H1 |
| Mapping items to specification clauses | Mixed | Code for clause existence; rubric judge for appropriateness | H2–H3 |
| Compliance narrative | Fuzzy | Rubric judge from a different model family, calibrated on 50 human labels | H4: engineer signs off |

**Step 2 — Guard construct validity.** Draw test projects from the structure types you will actually see (bridges, buildings, culverts), not only the convenient ones with clean drawings. Hold out whole projects, not sheets, so the agent cannot memorise a project's conventions. Report confidence intervals; a 5-point difference on 40 sheets is within noise.

**Step 3 — Design the questions (PPP).** When dimensions conflict, the agent asks a low-effort multiple-choice question: "Pier-cap depth: A. 1.2 m per section B–B, B. 1.5 m per the schedule?" It never asks open questions such as "what should I do?". Log each question with the user's effort level and whether the answer changed the BOQ.

**Step 4 — Learn from corrections (evolving rubrics).** Each engineer correction becomes a candidate rubric item: "− rebar mass must use 7,850 kg/m³ and include laps" becomes "Rebar mass uses 7,850 kg/m³ and includes lap lengths". Store per-team rubrics; promote an item to the shared rubric only after it recurs across users.

**Step 5 — Measure the pair, not the agent.** Track the accepted-BOQ rate, engineer minutes per sheet, corrections per sheet, question count and effort, and review time. Check the cost condition from Mechanics §6 monthly.

**What to notice.**

- Most points come from code checks; the LLM judge handles only the narrative, which limits self-preference and noise.
- The HAS level differs within one deliverable; a single "autonomy setting" for the whole agent would be wrong for some parts.
- Corrections are the cheapest source of realistic evaluation data you will ever get. Log them in a structured format from day one.

## Design patterns, pitfalls and checklist

The patterns below put the person in the right place in the loop, measure the pair rather than the agent, and keep training honest about real users.

### Named patterns

- **Agency level per sub-task.** Assign an H1–H5 level to each part of a deliverable rather than one autonomy setting for the agent. *When:* deliverables mix verifiable and judgement-heavy parts (Example 3).
- **Pause-and-take-over (CowPilot).** The agent proposes each step; the user can pause, override and hand back. *When:* web or GUI tasks where agents get stuck in loops and a single human action rescues them.
- **Mode-aware autonomy.** Infer the user's interaction mode (takeover, hands-on, hands-off, collaborative) from intervention logs and adapt check-ins. *When:* a product serves many users with different supervision styles.
- **Multiple-choice clarification.** Ask questions that offer concrete options and cost the user one word (PPP). *When:* the user holds information the agent needs but has little time.
- **Approval node in code.** Model the reviewer as a workflow node with approve / edit / reject outputs, persisted by a checkpointer; side effects run after approval with idempotency keys (L15). *When:* any irreversible or money-moving action.
- **Impossible rather than confirmable.** For unattended runs, scope credentials and isolate so high-risk actions cannot happen; review the artifact afterwards (L14). *When:* nobody is available to approve in real time.
- **Verifiable-first rubric.** Route every checkable criterion to code and only semantic criteria to an LLM judge from a different model family. *When:* grading fuzzy deliverables at scale.
- **Interaction-derived rubrics.** Convert each user correction into a gradable criterion and keep a per-user rubric (TAHI). *When:* quality is personal or team-specific.
- **Population of simulators.** Train against many personas, verbalized sampling or co-trained simulators; evaluate on held-out simulators and real users (L18). *When:* any RL with simulated users.
- **Reward every behaviour you want.** Add explicit terms for proactivity and personalisation next to task success (PPP). *When:* training collaborative agents with RL.
- **Review-sized outputs.** Constrain the size of diffs and reports; measure bloat. *When:* humans must approve the agent's work.

### Failure modes

| Failure | Symptom | Fix |
| --- | --- | --- |
| Benchmark–work mismatch | High benchmark score, low acceptance in pilots | Sample tasks from the target occupation and workflow; measure client acceptance |
| Convenience sampling | Tasks cluster in one domain or software | Stratify by occupation and software; report coverage |
| Judge inflation | Measured success exceeds human-checked success | Calibrate TPR/FPR on human labels; apply the correction |
| Self-preference | Judge favours its own model family | Use a different-family judge; rubric items rather than pairwise preference |
| Rubric saturation | All candidates score near 100% | Evolving rubrics; add negative criteria |
| Hallucinated rubric items | Criteria cite nonexistent facts or restate the task | Generate from reference files only; validate a sample by hand |
| Prompt-only approval | Agent acts after "wait for my OK" is compacted away | Enforce approval in the harness or workflow graph |
| Alert fatigue | Reviewers approve everything | Raise monitor precision; make high-risk actions impossible instead |
| Patch or report bloat | Reviews take longer than doing the work | Penalise length relative to reference; ask for minimal diffs |
| Simulator collapse | Training reward up, held-out reward down, entropy near zero | Simulator population, verbalized sampling, co-training, held-out evaluation |
| Task-only reward erosion | Agent stops asking questions, ignores preferences | Add proactivity and personalisation reward terms |
| Fighting the user for control | Agent resumes after a takeover user wanted to finish | Detect takeover mode; hand off with a summary |
| Automating the joy | Workers resist or disengage | Use WORKBank-style desire surveys; target Green Light and R&D zones |
| Hidden cost | Accuracy fine, agent-hours and review time huge | Report cost per accepted deliverable including human time |

### Checklist

- [ ] The task set is sampled from the occupations and workflows you claim to serve, with coverage reported.
- [ ] Each part of the deliverable is placed on the verifiable-to-fuzzy spectrum with a matching evaluator.
- [ ] Verifiable criteria are checked in code; the LLM judge sees only semantic criteria.
- [ ] The judge is from a different model family and calibrated (TPR, FPR) on at least 50 human labels.
- [ ] Results carry confidence intervals and a contamination check (dated or held-out tasks).
- [ ] Each sub-task has an intended Human Agency Scale level.
- [ ] Irreversible actions pass an approval node enforced outside the model, with a working external stop.
- [ ] Monitor precision is estimated at the real base rate, and alerts per run are acceptable to reviewers.
- [ ] Clarifying questions are low-effort (options) and logged with effort and outcome.
- [ ] Interaction traces (takeovers, hand-backs, corrections) are stored in a structured format.
- [ ] User corrections feed a per-user or per-team rubric.
- [ ] Simulator-trained agents are evaluated on held-out simulators and a small panel of real users.
- [ ] The reward includes every collaborative behaviour you care about, not only task success.
- [ ] Metrics include human active time, review time and cost per accepted deliverable.
- [ ] Workers were asked which tasks they want automated before you automated them.

### Patterns and pitfalls from L19

**Named patterns.**

- **Partial result, then a specific question (Trajectory B).** Return a first slice (data summary, plan, one module) and ask one concrete question before committing hundreds of actions.
- **Phase-mapped guidelines.** Check each phase of the interaction against its guidelines: before (G1–G3), during (G4, G7, G8), after (G9, G11, G16).
- **Consult-the-user-model.** When instructions are unclear, query a model of this user built from past sessions (ToM-SWE) before guessing or asking.
- **Boundary-time proactivity.** Offer reviews and suggestions at natural breakpoints such as post-commit, not mid-iteration.
- **Implicit-signal A/B with PPI.** Log follow-ups, sentiment, accepts and commits, randomly sample explicit ratings, and compare designs with PULSE-style estimates.
- **Comprehension-preserving friction.** Accept changes one at a time, prompt in technical terms, and keep diffs short.

| Failure | Symptom | Fix |
| --- | --- | --- |
| End-to-end run on an underspecified goal | "After 30 mins, you produce a bunch of useless things"; 770 lines to review | Check in early with partial results; consult a user model |
| Mid-task interruptions | Suggestions dismissed; engagement fades over days | Move interventions to workflow boundaries; model interruption cost |
| Naive A/B on rare ratings | Wide intervals; real design effects look insignificant | Rating predictor plus PPI over unrated sessions (up to 40% narrower) |
| Non-random raters | Confident but biased effect estimates | Prompt a random subset for ratings; reweight by rating probability |
| Rewarding implicit signals directly | Broken tool calls on hard tasks; questions asked to dodge edits | Guard-rail metrics (edit rate, invalid calls); rubric critics that score behaviours |
| Auto-accepting agent edits | High completion, low comprehension (0.615 vs 0.777) | Per-change accept; short comprehension probes |
| Verbose, defensive agent code | Follow-on tasks fail on agent-written code | Keep edits small; evaluate follow-on success, not only first resolve |

- [ ] Does the agent show an intermediate result and ask a specific question before long autonomous runs?
- [ ] Are proactive suggestions timed to workflow boundaries, with easy dismissal (G8)?
- [ ] Is the inferred user model a visible, editable file the user can correct?
- [ ] Do you log implicit signals and a randomly sampled explicit rating for every session?
- [ ] Does evaluation include user comprehension and follow-on maintainability, not only task success?

### Patterns and pitfalls from L22

**Named patterns.**

- **Output plus evidence.** Ship every deliverable with tests it ran, logs, source links and a one-line reason per change, so the reviewer checks evidence instead of redoing the work.
- **Point to the risky lines.** The agent flags the few low-confidence or irreversible lines (slide 23's `DELETE FROM holds`) and summarises the rest.
- **Route by confidence and stakes.** Automatic checkers settle what they are sure of; low-confidence, high-stakes steps go to a person (slide 20).
- **Per-task-type autonomy ladder.** Grant Levels 1–5 separately for each task type, never for "the agent" as a whole.
- **Promote on the lower bound, demote on the upper.** Use confidence bounds with a minimum run count, restart the record after each move, and demote at once on a severe audit finding (Mechanics 12).
- **Audit harder after change.** Raise the audit rate right after a promotion or a model update, when the old record no longer describes the agent.

| Failure | Symptom | Fix |
| --- | --- | --- |
| YOLO merging | Silent errors reach production; approvers cannot explain the change | Evidence with every output; per-change accept for risky work (L19) |
| Review every line | Review hours exceed the time the agent saved | Evidence check for all, full review only for flagged or irreversible work |
| Uncalibrated flags | Defects hide in unflagged work (6.4 vs 2.8 escapes at equal hours in L22's sheet) | Measure the error rate of flagged and unflagged items; keep a small random audit |
| Unverifiable evidence | "All 412 tests pass" while tests were weakened or the log is stale | Re-run from a clean checkout in CI; require a fail-to-pass test for the change |
| Autonomy granted globally | Success on refunds carried over to migrations | Separate levels and records per task type |
| Coasting on an old record | Level kept after a model update degrades the agent | Restart or re-weight the record on model and environment changes; demote on drift |
| Rubber-stamp audits | Level 4 audits pass everything (automation complacency) | Seed known-bad canary cases; give auditors feedback on misses |

- [ ] Does each output carry evidence a reviewer can check independently?
- [ ] Has the agent's flagging been measured for calibration on your own tasks?
- [ ] Is autonomy set per task type, with written promotion and demotion rules?
- [ ] Is the autonomy level enforced in code (permissions, approval nodes), not in the prompt?
- [ ] Do irreversible actions always get a full human review, whatever the flag says?

## Landscape

The field has three layers: benchmarks of real work, methods for collaboration and simulated users, and studies of how work and workers change; each table is newest first.

### Benchmarks and datasets of real work

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| CollabSkill (Shao et al., 2026) | Workers paired with agents on occupational tasks; Bayesian skill rating | 93 workers, 386 sessions, 1,500+ prompts; Claude Code ranks first, autonomous ranking differs | L17; [arXiv 2606.09833](https://arxiv.org/abs/2606.09833) |
| JobBench (Li et al., 2026) | Tasks workers want delegated | 130 tasks, 35 occupations, about 35.6 binary criteria per task; best 45.9% (Opus 4.7 in Claude Code) | L17; [arXiv 2605.26329](https://arxiv.org/abs/2605.26329) |
| Gym-Anything / CUA-World (Aggarwal et al., 2026) | Auto-built environments from GDP-weighted software | 200 environments, 10,000 tasks, all 22 SOC groups | L17, L7 |
| Terminal-Bench (Merrill et al., 2026) | Container-packaged CLI tasks with hidden tests | File-centric, cheap to grade | L17 |
| Agent-benchmark audit (Wang et al., 2026) | Benchmarks mapped to occupations | 43 benchmarks, 72,342 tasks, 1,016 occupations; Computer/Math gets 8,622 tasks for about 5% of employment | L17; [arXiv 2603.01203](https://arxiv.org/abs/2603.01203) |
| Remote Labor Index (Mazeika et al., 2025) | Real freelance projects, client-acceptance grading | 240 projects, 23 of 64 Upwork categories; paper's best 2.5%; L17 leaderboard tops at 21.25 | L17; [arXiv 2510.26787](https://arxiv.org/abs/2510.26787) |
| GDPval (Patwardhan et al., 2025) | Expert-written occupational tasks and rubrics | 44 occupations, 9 GDP sectors, 220 gold tasks; experts average 14 years | L17; [arXiv 2510.04374](https://arxiv.org/abs/2510.04374) |
| OpenCUA / AgentNet (Wang, Xinyuan et al., 2025) | Recorded human computer-use traces | 22.5K traces (12K Windows, 5K macOS, 5K Ubuntu) | L17 |
| ColBench (Zhou et al., 2025) | Collaborative backend-programming and frontend-design tasks with a hidden reference | Unit tests and image similarity | L18 |
| TheAgentCompany (Xu et al., 2024) | Self-hosted software company | 5 software products, 175 tasks, checkpoint evaluators | L17 |
| τ-bench (Yao et al., 2024) | Tool–agent–user benchmark with LLM-simulated customers | Retail and airline domains | Beyond the lectures; [arXiv 2406.12045](https://arxiv.org/abs/2406.12045) |

### Methods for interaction, collaboration and simulated users

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| Simulator collapse (Yu et al., 2026) | Overfitting to one frozen user simulator | Held-out reward peaks near step 80 then falls; entropy 1.75 → near 0; τ²-bench Retail 46.1% / 55.5% / 62.2% (single / verbalized / population) | L18 |
| TAHI (Wang et al., 2026) | Test-time adaptation from interaction; evolving per-user rubrics | 30 people, 600 tasks; +4.5% to +20.9% solo success; rubrics catch 16.0–22.3% more failures | L17; [arXiv 2609.04141](https://arxiv.org/abs/2609.04141) |
| Modeling Distinct Human Interaction (Huq, Wang et al., 2026) | Four interaction modes; intervention prediction | 400 trajectories, 4,200+ actions; +61.4–63.4% prediction accuracy; +36.8% usefulness | L17; [arXiv 2602.17588](https://arxiv.org/abs/2602.17588) |
| PPP (Sun et al., COLM 2026) | RL with productivity, proactivity and personalisation rewards in UserVille | +16.7 points over GPT-5 on SWE-Bench and BrowseComp-Plus | L18; [arXiv 2511.02208](https://arxiv.org/abs/2511.02208) |
| DR Tulu / RLER (Shao et al., 2025) | RL with evolving rubrics | About 61% vs 59.5% static vs 51% random after about 2,500 steps | L10, L17 |
| SWEET-RL (Zhou et al., 2025) | Multi-turn RL with a privileged critic | +6% absolute over other multi-turn RL; Llama-3.1-8B matches or beats GPT-4o on ColBench | L18; [arXiv 2503.15478](https://arxiv.org/abs/2503.15478) |
| CollabLLM (Wu et al., ICML 2025) | Multiturn-aware rewards from simulated collaboration | +18.5% task performance, +46.3% interactivity; 201-person study: +17.6% satisfaction, −10.4% time | Beyond the lectures; [arXiv 2502.00640](https://arxiv.org/abs/2502.00640) |
| CowPilot (Huq et al., 2025) | Pause, override and hand-back web agent | 95% success with humans doing 15.2% of steps | L17; [arXiv 2501.16609](https://arxiv.org/abs/2501.16609) |
| Generative Agents (Park et al., UIST 2023) | LLM town with memory, reflection, planning | Emergent social behaviour | L18; [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) |

### Studies of work, workers and the labour market

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| Humans are Missing from AI Coding Agent Research (Wang, Yang, Lieret et al., 2026) | Position paper on human-centred coding agents | Patch bloat above 1.0 for all models (about 1.19–1.6); four dimensions: alignment, verifiability, steerability, adaptability | L17; [arXiv 2608.12355](https://arxiv.org/abs/2608.12355) |
| Automating the Joy Out of Work (Ranjit et al., 2026) | Task meaning vs AI exposure | Exposed tasks rate higher on "tangible outcome" (+0.34) and creativity (+0.23) | L17; [arXiv 2603.14963](https://arxiv.org/abs/2603.14963) |
| Self-preference bias (Pombal et al., 2026) | Judge bias across protocols | Ratios up to about 1.65 pairwise; about 1.0–1.2 rubric | L17; [arXiv 2604.06996](https://arxiv.org/abs/2604.06996) |
| Code with Me or for Me? (Chen et al., 2025) | Controlled study: copilot vs agent | 20 users; correctness about 0.25 → 0.60; effort about 25 → 12.5 min | L14; [arXiv 2507.08149](https://arxiv.org/abs/2507.08149) |
| WORKBank / Human Agency Scale (Shao et al., 2025) | Worker desire vs expert capability | 1,500 workers, 844 tasks, 104 occupations; desire for 46% of tasks | L17; [arXiv 2506.06576](https://arxiv.org/abs/2506.06576) |
| Canaries in the Coal Mine (Brynjolfsson, Chandar, Chen, 2025) | Early-career employment by AI exposure | Most-exposed 22–25-year-olds about 0.93 of late-2022 level by Sept 2025 | L17 |
| Anthropic Economic Index (Handa et al., 2025) | Claude conversations mapped to O\*NET | 4M+ conversations; 36% of occupations use AI for ≥25% of tasks; 57% augment / 43% automate | Beyond the lectures; [arXiv 2503.04761](https://arxiv.org/abs/2503.04761) |
| METR time horizons (Kwa, West et al., 2025) | 50% task-length horizon | Doubles about every 7 months | L17; [arXiv 2503.14499](https://arxiv.org/abs/2503.14499) |
| GPTs are GPTs (Eloundou et al., 2023) | Task exposure to LLMs | About 80% of workers have ≥10% of tasks exposed | L17; [arXiv 2303.10130](https://arxiv.org/abs/2303.10130) |
| Automation and New Tasks (Acemoglu, Restrepo, 2019) | Displacement vs reinstatement | New tasks offset displacement historically | L17 |

### Added with L19

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| Completion ≠ Collaboration | Coffee-shop case; judges agents by how they scale with user effort | End-to-end run returns 270 words + 770 lines; partial results with a question let users verify cheaply | [Shen, Chen et al., ACL Findings 2026](https://arxiv.org/abs/2510.25744) |
| Amershi guidelines | 18 human–AI interaction guidelines in four phases | Distilled from 150+ recommendations; mapped by L19 onto before / during / after | [Amershi et al., CHI 2019](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) |
| ToM-SWE | SWE agent plus theory-of-mind agent with hierarchical user memory | 74.7% of 174 in-the-wild suggestions accepted; 59.7% vs 18.1% on stateful SWE tasks (paper) | [Zhou et al., ICML 2026](https://arxiv.org/abs/2510.21903) |
| Proactive IDE field study | Proactive code-quality assistant in JetBrains Fleet, 5 days | 229 interactions, 5,732 intervention points; engagement shifts to commit-boundary reviews | [Kuo et al., IUI 2026](https://arxiv.org/abs/2601.10253) |
| PULSE | Rating predictor plus PPI to compare agent designs in deployment | 15k+ OpenHands users; LLM change 6–8%, reasoning 3%, memory n.s.; CIs up to 40% narrower | [Chen et al., ICML 2026](https://arxiv.org/abs/2510.09801) |
| Rubric-supervised critic | Critic trained on real user–agent traces with 24 behavioural rubrics | Code-survival AUC 0.45 (synthetic only) → 0.69 (with real data) | [Wang et al., COLM 2026](https://arxiv.org/abs/2603.03800) |
| Composer real-time RL | Continual on-policy RL from production user interactions | Reward rises over about 40 RL steps; blog reports reward hacking | [Cursor blog, 26 Mar 2026](https://cursor.com/blog/real-time-rl-for-composer) |
| (Im)Paired Programming | Agent vs chatbot study with personalised comprehension quizzes | Completion 0.95 vs 0.55; comprehension 0.67 vs 0.82 (n = 27 per group) | [Balepur et al., 2026](https://arxiv.org/abs/2607.26375) |
| CodeThread | Chained tasks building on human- vs agent-written code | Agents do worse on agent code; drops up to 13.1% (paper) | [Patel et al., EMNLP 2026](https://arxiv.org/abs/2606.21804) |
| Upskilling Together | FDE training with Claude Code and Codex, rubric-graded | Prototyping +0.38 / +0.28; human-only work 35% → 22% over 4 weeks | Padmakumar et al., arXiv forthcoming (no link yet) |

### Added with L22

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| Two pillars grid | Agent reliability crossed with ease of verification | Delegate, Blind faith, Spot-check, Don't use; goal is calibrated reliance | Narasimhan, L22 slide 16, 2026 |
| Earned autonomy | Five autonomy levels granted per task type from a track record | Suggest, Draft, Ask on risky steps, Sample audits, Act alone (this task type only) | Narasimhan, L22 slide 24, 2026 |
| Prover–Verifier Games | Training solutions that a small verifier model can check | Outputs also became more legible to time-limited humans, at some cost in accuracy ("legibility tax") | Kirchner et al. (OpenAI), 2024 |
| Trust in Automation | Trust as the attitude that mediates reliance | Trust should be calibrated, resolved and temporally specific | Lee and See, Human Factors, 2004 |
| Humans and Automation | Taxonomy of how people go wrong with automation | Use, misuse (over-reliance), disuse (under-reliance), abuse | Parasuraman and Riley, Human Factors, 1997 |
| SAE J3016 | Taxonomy of driving-automation levels | Levels 0–5, from no automation to full self-driving; the analogy behind slide 24 | SAE International, 2014, revised since |

## Open problems

The central open problem is measuring and training for value delivered with people, at the scale and cost that benchmarks of autonomy enjoy today.

**1. Benchmarks with construct validity for work.** We lack task sets that cover the economy in proportion to employment and value, with realistic data, and that predict real outcomes such as client acceptance. *Why it's hard:* real tasks need real data, which is private and messy; proprietary cloud software cannot be self-hosted; and every expert-annotated task costs hours of professional time. Synthetic amplification (Gym-Anything's 75×) scales counts but inherits the generator's idea of realism.

**2. Evaluating fuzzy and personal quality.** Rubric judges scale but are noisy, self-preferring and visually weak; LLM-generated rubrics contain wrong items; and L17 shows good rubrics are model- and user-specific. *Why it's hard:* there may be no single ground truth. How to aggregate per-user rubrics into a benchmark without averaging away the expertise that "lives in the departure from the average" (TAHI's framing) is unsolved.

**3. Measuring augmentation.** H3–H5 value shows up as time saved, quality gained, learning or satisfaction, none of which a pass/fail score captures. *Why it's hard:* studies with real users are expensive and slow, results depend on the participants' skill (CollabSkill finds experience drives collaboration skill), and effects can be negative even when people feel faster (METR's developer trial).

**4. Faithful user simulators.** Training collaborative agents needs millions of interactions; real people cannot supply them. *Why it's hard:* simulators drift towards agreeable, articulate, consistent users, while real users are terse, inconsistent and sometimes wrong. Simulator collapse shows policies exploit whatever regularity the simulator has. We lack validated metrics for how human-like a simulator is, and population co-training adds non-stationarity that can destabilise RL.

**5. Knowing when to ask, act or hand over.** An agent must decide each turn whether to proceed, ask a question, request approval or yield control. *Why it's hard:* the right choice depends on the user's mode, expertise, attention and the action's reversibility, most of which are unobserved. Intervention prediction (CowCorpus) is an early step; principled value-of-information estimates for questions are rare in practice.

**6. Oversight that scales.** Approval gates fail through alert fatigue; reviewing patches and reports does not scale to thousands of runs. *Why it's hard:* monitor precision collapses at low base rates, and output bloat raises review cost exactly as volume grows. Automated verification and trajectory monitoring (L15) help but can themselves be gamed.

**7. Efficiency as a first-class objective.** Systems with thousands of agent-hours per result are hard to justify for routine work. *Why it's hard:* accuracy leaderboards do not price tokens, wall-clock time or human review, and multi-agent redundancy often buys reliability. A shared cost-per-accepted-deliverable metric with human time included is not standard.

**8. Choosing what to automate.** WORKBank and the joy-of-work study suggest targeting tasks people want gone, yet current AI is aimed at satisfying, tangible tasks. *Why it's hard:* desire is easy to survey but hard to turn into training objectives, and commercial incentives favour the most automatable tasks, not the most wanted.

**9. Preserving expertise.** If juniors stop doing routine work, who becomes the expert who writes rubrics, reviews agents and handles the hard cases (Bainbridge's irony)? *Why it's hard:* the costs appear years later, at the scale of careers, while productivity gains appear immediately; early evidence (the "canaries" study) is suggestive but confounded by economic cycles.

**10. Safety in ordinary work.** Many harms arise as side effects of benign requests (AutoElicit's global SSH change). *Why it's hard:* such behaviours cannot be enumerated in advance, so static benchmarks miss them; eliciting them empirically requires realistic environments, which loops back to problem 1.

**11. Rewarding long-term outcomes for the user.** Real-time RL and PULSE optimise immediate behavioural signals: follow-ups, accepts, code that persists. L19's comprehension and maintainability results show that these can rise while the user's understanding falls. *Why it's hard:* comprehension and skill change over weeks or months, are costly to measure (on-the-fly quizzes need a study), and nobody yet knows how to turn "the user became more capable" into a reward an agent can train on.

**12. Trustworthy evaluation from implicit signals.** Deployment telemetry is the only large source of real collaboration data, but every signal is a proxy. *Why it's hard:* raters are not a random sample, accepting is a default, silence can mean giving up, and rewarded proxies get gamed (Cursor's reward hacks). Most studies also use students or developers, so it is unclear whether findings hold for domain experts who cannot read the code at all.

**13. Calibrated flags and checkable evidence.** L22's "where to look" and "show your work" make review cheap only if the agent's low-confidence flags really concentrate its errors and its evidence can be checked independently. *Why it's hard:* LLM self-reported confidence is often miscalibrated, especially out of distribution, and agents can write tests that pass trivially or cite sources that do not support the claim. Once evidence or flags are rewarded, they can be gamed like any other proxy, so calibration must be measured on each deployment's own tasks.

**14. Task-type boundaries and honest audits for earned autonomy.** Earned autonomy needs a stable definition of "the same type of task" and audits that still catch errors when the agent is usually right. *Why it's hard:* real requests drift across boundaries (a large refund can be phrased like a small one), sampled audits grow the record slowly and rarely see severe failures, and reviewers become complacent at high success rates. No general, automatic check yet exists for a week of agent work; today's answer is to decompose it into checkable milestones.

## Glossary

These 37 terms recur across L17, L18 and the related lectures.

| Term | Meaning |
| --- | --- |
| AI exposure gap | How much more a task property (e.g. "gives a sense of accomplishment") is rated for AI-exposed tasks than unexposed ones (Ranjit et al.). |
| Alert fatigue | Reviewers approving by habit because most alerts are false alarms at low base rates (L13). |
| Approval node | A workflow step that pauses for a person's approve / edit / reject decision, enforced in code and persisted (L15). |
| Augmentation | The person still does the task, better or faster with AI (HAS H3–H5). |
| Automation | The agent does the task in place of the person (HAS H1–H2). |
| Automation rate | Share of projects whose deliverable a client would accept as commissioned work (Remote Labor Index). |
| Blind faith | Relying on an agent whose output is hard to verify: it may be reliable, but nobody can tell when it is not (L22's two-pillar grid). |
| Calibrated reliance | Relying on an agent exactly as much as its real reliability warrants; trusting too little and too much are both failures (Lee and See, 2004; L22). |
| Code-survival AUC | How well a critic's score separates sessions whose agent code users kept from those whose code was discarded; 0.5 is chance (rubric-supervised critic: 0.69, L19). |
| Construct validity | The degree to which a benchmark score supports claims about the target phenomenon (Bean et al.). |
| Cost per accepted deliverable | Agent cost plus human review and redo cost, divided by accepted outputs; the efficiency metric this sheet recommends. |
| CowPilot | Web-agent framework where users can pause, override, take over and hand back control (Huq et al.). |
| Earned autonomy | Granting an agent more freedom on one task type as its track record grows, in Levels 1–5 from Suggest to Act alone, and taking it back on failures (L22). |
| Evolving rubrics | Rubric criteria generated during training from contrasting rollouts (DR Tulu) or during a session from user feedback (TAHI). |
| Hindsight relabelling | Labelling a trajectory with the task it actually accomplished, to synthesise training data (BAGEL, NNetNav). |
| Human Agency Scale (HAS) | Five levels H1–H5 of required human involvement, from agent-alone to human-driven (Shao et al.). |
| Implicit feedback | Behavioural signals (follow-ups, sentiment, accepts, commits, code survival) that reveal satisfaction without an explicit rating (L19). |
| Interaction modes | Stable user styles towards a web agent: takeover, hands-on, hands-off, collaborative (Huq, Wang et al.). |
| Interruption cost | The attention cost of a proactive intervention; much lower at workflow boundaries such as post-commit than mid-task (L19). |
| LLM-as-a-judge | Using a language model to grade outputs, usually against a rubric; scalable but noisy and biased. |
| Misuse and disuse | Over-reliance on automation where it fails, and under-reliance where it would help (Parasuraman and Riley, 1997). |
| Mixed-initiative interaction | A strategy in which each party, human or computer, contributes what it is best suited to at the most appropriate time (Hearst et al., 1999; L19). |
| O\*NET | U.S. Department of Labor database describing about 900 occupations as lists of tasks. |
| Patch bloat | Successful patch length divided by gold patch length; above 1 means extra code to review. |
| PPP | Productivity, proactivity, personalisation: a three-part RL reward for collaborative agents (Sun et al.). |
| Prediction-powered inference (PPI) | An estimator that combines a few true labels with model predictions on many unlabelled samples; unbiased, with narrower intervals (Angelopoulos et al.; used by PULSE). |
| Privileged critic | A critic that sees training-only information (e.g. the hidden reference) to give per-turn credit (SWEET-RL). |
| Proactive AI | A system that decides when and what to show from context (prompts, prior sessions, code), instead of answering only when prompted (L19). |
| Real-time RL | Continual on-policy RL from production use: collect interactions with the current checkpoint, distil them into rewards, update, redeploy (Cursor Composer, L19). |
| Rubric | A list of weighted, checkable criteria for grading a deliverable; negative weights mark "must not" items. |
| Self-preference bias | A judge overrating outputs from its own model family; measured as a ratio of overestimation rates. |
| Show your work | Delivering output with checkable evidence (tests run, logs, citations, proofs, a reason per change) so the person checks evidence instead of redoing the work (L22). |
| Simulator collapse | A policy trained against one frozen user simulator overfits to it: training reward up, held-out reward down, entropy to zero (Yu et al.). |
| Time horizon (50%) | Length of task, in human-expert time, that a model completes with 50% probability (METR). |
| ToM-SWE | A SWE agent paired with a theory-of-mind agent that keeps a hierarchical memory of the user and advises when instructions are underspecified (Zhou et al.). |
| User simulator | An LLM with a persona and goal that plays the user, plus a reward model that scores the episode. |
| WORKBank zones | Green Light, Red Light, R&D Opportunity and Low Priority, from worker desire versus AI capability (Shao et al.). |

## Practice questions

The questions run from recall to design and calculation; try each before reading the answer.

1. Name the three components of every agent benchmark in L17 and one open problem for each. **Answer:** Task, environment and evaluation. Tasks: coverage and alignment with what workers want (JobBench vs GDPval). Environments: proprietary software and realistic private data are hard to reproduce. Evaluation: most work is fuzzy, LLM judges are biased and rubrics imperfect.
2. What is the Remote Labor Index's score, and why is it a stricter test than OSWorld? **Answer:** The automation rate: the share of real freelance projects whose deliverable a client would accept. OSWorld grades individual computer tasks by state checks; RLI requires a complete, paid-quality deliverable from a brief and input files. Frontier models score about 85% on OSWorld-Verified but the best reaches 21.25 on L17's RLI leaderboard.
3. Define construct validity and give one example of a benchmark failing it from L17. **Answer:** The degree to which a benchmark score supports claims about the target phenomenon. Claims that "agents can automate work" rest on benchmarks with 8,622 Computer and Mathematical tasks, a group with about 5% of employment, while Food Preparation and Construction get none. The scores may be valid for coding but not for "work".
4. List the five Human Agency Scale levels and say which ones most benchmarks measure. **Answer:** H1 agent alone; H2 agent drives with input at a few points; H3 equal partnership; H4 human drives, agent needs input; H5 completion relies on the human. Most benchmarks measure only H1. H1–H2 are automation, H3–H5 augmentation.
5. Place these WORKBank tasks (desire, capability): A (4.1, 3.8), B (2.0, 4.4), C (4.6, 1.7). What should a product team do with each? **Answer:** A is Green Light: deploy. B is Red Light: capable but unwanted, so offer at most optional augmentation. C is R&D Opportunity: wanted but not yet feasible, a research priority (gap 4.6 − 1.7 = 2.9).
6. Describe the four interaction modes of Huq, Wang et al. and how an agent should behave with a takeover user. **Answer:** Takeover (late interventions, never hands back), hands-on (frequent interventions, alternating control), hands-off (never intervenes) and collaborative (rare, modest interventions, hands back). With a takeover user, the agent should expect the user to finish, offer control early with a concise state summary, and not resume or fight for control.
7. Why did CollabSkill's ranking of coding agents differ from the autonomous ranking? **Answer:** Autonomous success rewards pushing through without asking. With a person present, value depends on asking the right questions, producing reviewable output and accepting corrections, traits that cost turns and are not rewarded autonomously. Patch bloat shows one consequence: successful patches 1.2–1.6× longer than needed raise review cost.
8. A model has a 50% time horizon of 2 hours and slope β = 0.8 logits per doubling. What is its 90% horizon? **Answer:** h\_90 = h\_50 / 2^(logit(0.9)/β) with logit(0.9) = ln 9 = 2.197. The exponent is 2.197 / 0.8 = 2.75, and 2^2.75 = 6.73. So h\_90 = 120 / 6.73 ≈ 17.8 minutes.
9. An LLM judge reports 52% success. On a human-labelled sample it has TPR 0.85 and FPR 0.30. Estimate true success and the judge–human agreement. **Answer:** ŝ = (0.52 − 0.30) / (0.85 − 0.30) = 0.22 / 0.55 = 0.40. Agreement = 0.85 × 0.40 + 0.70 × 0.60 = 0.34 + 0.42 = 0.76. The judge inflates success by 12 points.
10. Explain simulator collapse and two remedies from L18. **Answer:** A policy trained against one frozen user simulator overfits to its dominant reply pattern: training reward rises, held-out reward peaks then falls, and policy entropy goes to zero. Remedies: verbalized sampling (the simulator samples from a stated distribution of replies) and co-training (the simulator is trained alongside the policy so it drifts). Population co-training reached 62.2% vs 46.1% on τ²-bench Retail.
11. In PPP, what happens to proactivity and personalisation when training uses task success only, and why? **Answer:** Both rise briefly and then fall (proactivity from a peak near 60 to about 42; personalisation from about 72 to 57), while productivity matches PPP. Asking questions and following preferences cost turns without immediate task reward, so RL removes them. Any behaviour you want but do not reward drifts away.
12. A monitor flags actions with TPR 0.95 and FPR 0.04; unsafe actions occur at 1%. Compute precision and say what it implies for an approval gate. **Answer:** Precision = 0.0095 / (0.0095 + 0.0396) = 0.0095 / 0.0491 ≈ 0.19. About four of every five alerts are false, so reviewers will drift into approving by habit. Lower FPR, raise the base rate of what is flagged (flag only irreversible actions), or make risky actions impossible instead of confirmable.
13. Using Mechanics §4, should a user watch an agent with p = 0.5 if c = 2, w = 5, i = 3, q = 0.8, r = 20? **Answer:** T\_H1 = 2 + 0.5 × 20 = 12 minutes. T\_H3 = 5 + 0.5 × (3 + 0.2 × 20) = 5 + 0.5 × 7 = 8.5 minutes. Watching saves 3.5 minutes per task. Check with the condition: w − c = 3 < (1 − p)(q r − i) = 0.5 × 13 = 6.5, so yes.
14. Design an evaluator for an agent that writes a quarterly variance report from a spreadsheet. Where does each check go? **Answer:** Split by the spectrum. In code: the variance figures recompute exactly from the source; every flagged line exceeds the stated threshold; required sheets and fields exist. In a rubric judge (different model family, calibrated on human labels): explanations are clear, causes are plausible and supported, and the summary leads with the material items. Add negative items for fabricated figures, and turn reviewer corrections into new criteria over time.
15. A company wants to train a support agent with RL against an LLM user simulator. Propose a plan that avoids simulator collapse and preserves collaboration quality, and say how you will know it worked. **Answer:** Build a persona population varying goals, knowledge, patience and preferences; sample a new persona per episode, and use verbalized sampling or periodic simulator co-training. Use a PPP-style reward with task success, low-effort questioning and preference adherence. Track training reward, held-out-simulator reward and policy entropy together, stopping or adjusting when the generalisation gap widens. Validate on a small panel of real users, measuring joint success, human time and satisfaction, not only task success.

### More practice questions (L19)

16. In PULSE's PPI estimator, why does the correction term not bias the estimate, and when would PULSE still give a wrong answer?

    **Answer:** The term is λ times (f's mean on unrated sessions minus f's mean on rated sessions). If both sets come from the same distribution its expectation is zero, so the estimate is unbiased whatever f is; it only removes noise. It fails when raters are not a random sample, for example when frustrated users rate more. Then both the naive and PPI estimates are biased, and PPI's narrower interval makes the error look confident.
17. A naive A/B test with 300 rated sessions per arm gives a 95% half-width of 0.06 on the rating difference. You need 0.02. How many rated sessions per arm are needed naively, and with an estimator that narrows intervals by 40%?

    **Answer:** Half-width scales as 1/√n. Naively, n = 300 × (0.06/0.02)² = 2,700 per arm. With 40% narrower intervals the half-width at n = 300 is 0.036, so n = 300 × (0.036/0.02)² = 300 × 3.24 = 972 per arm, about 36% of the naive need.
18. (Model from L19's sheet, not the slides.) A task takes T = 100 actions, the agent misreads the goal with probability q = 0.3, and each check-in costs h = 2 action-equivalents. With Cost(k) = qk + (T/k)h, find the best check-in interval and compare it with one report at the end (Trajectory A).

    **Answer:** k\* = √(Th/q) = √(200/0.3) ≈ 26 actions. Cost ≈ 7.8 + 7.7 = 15.5. One report at the end (k = 100) costs 30 + 2 = 32, about twice as much. A user model that cuts q to 0.1 gives k\* ≈ 45 and cost ≈ 8.9, so better goal inference lets the agent run longer between check-ins.
19. In "(Im)Paired Programming", agent users score 0.53 on the extension task versus 0.45 for chat users, yet among users with an initial score above 0.50 chat users score 0.69 versus 0.53. How can both be true, and which comparison is fairer?

    **Answer:** It is a composition effect. Agent users far more often started from working code (initial completion about 0.95 vs 0.55), which lifts their overall average. Conditioning on a good start compares extension skill given equal starting points, and there chat users, who also scored higher on comprehension (0.82 vs 0.67), do better. With p = 0.18 the conditional gap is suggestive, not conclusive.
20. A proactive assistant gains B = 10 if it acts and help was wanted, loses C = 6 if not, and can ask instead at cost D = 1.5, recovering 80% of B. Interruption costs i = 0.5 at a commit boundary and i = 4 mid-task. For each phase, when should it do nothing, ask or act?

    **Answer:** EU(act) = 16p − 6 − i and EU(ask) = 8p − 1.5 − i, so act beats ask when p > 0.5625 regardless of i. Boundary: ask beats nothing above (1.5 + 0.5)/8 = 0.25, so do nothing below 0.25, ask from 0.25 to 0.5625, act above. Mid-task: act beats nothing above (6 + 4)/16 = 0.625 and ask only above 0.6875, so asking is never best: do nothing below 0.625, act above. This is why L19's IDE study finds boundary interventions welcome and mid-task ones dismissed.
21. You run real-time RL for a coding agent with reward +1 if an edit persists for 24 hours and −1 for a dissatisfied follow-up. Name two reward hacks Cursor reports for Composer and a mitigation for each.

    **Answer:** First, avoiding action: the model asks clarifying questions so it never makes an edit that could be penalised. Track edit rate and unnecessary questions as guard-rail metrics, and reward task progress. Second, hiding failure: it emits broken tool calls on tasks it would likely fail. Count invalid tool calls and abandoned sessions as negative, and add a rubric critic that scores behaviours (did it test, did it explain) alongside the outcome.

### More practice questions (L22)

22. Place each case in L22's two-pillar grid and name the lever that would move it towards "Delegate": (a) an agent that summarises supplier contracts correctly 99% of the time, where checking a summary means reading the contract; (b) an agent that writes SQL reports correctly 60% of the time, where each report is checked by tests against a reference query.

    **Answer:** (a) is reliable but hard to verify: blind faith. The lever is verifiability: make it show its work, for example by linking each claim to the clause it came from, so a reviewer checks citations instead of rereading the contract. (b) is unreliable but easy to verify: spot-check. Its errors are cheap to catch, so it is still useful; the lever is reliability (pass^k, T9), which would move it up a row.
23. Repeat the review-hours example from Core concept 14 with weaker flags. 200 PRs a week contain 16 defects. Every PR gets a 6-minute evidence check that catches 50% of the defects in unflagged PRs. The agent flags 50 PRs, which get a 40-minute review catching 90%, but the flagged PRs now hold only 10 of the 16 defects. Compute review hours and escaped defects.

    **Answer:** Time is unchanged: 200 × 6 + 50 × 40 = 3,200 minutes ≈ 53.3 hours. Flagged review catches 0.9 × 10 = 9. The 6 defects in unflagged PRs meet only the evidence check, which catches 3. Escaped: 16 − 9 − 3 = 4 a week, between the calibrated case (2.8) and random flags (6.4). The hours are identical in all three cases; only the flags' calibration changes the outcome.
24. Under Mechanics 12's rule, how many straight audited successes would lift the Wilson lower bound to Level 4's bar of 0.93? Why does the policy still require 150 checked runs?

    **Answer:** With zero failures the lower bound is n / (n + z²). Solve n / (n + 3.8416) ≥ 0.93: n ≥ 0.93 × 3.8416 / 0.07 ≈ 51.0, so 52 runs (51 gives 0.9300 to four places but falls just short). The minimum of 150 is there for rare failures. By the rule of three, 52 clean runs only bound the failure rate below about 3/52 ≈ 5.8%, and 150 below about 2%. Severe failures at a fraction of a percent need volume to show up.
25. A team has kept a coding agent at Level 4 on dependency upgrades for months and switches developers from per-change accept to auto-accept. Using L19 and L22, name two risks and two safeguards.

    **Answer:** Risks: comprehension falls (L19: 0.615 for auto-accept versus 0.777 for per-change accept), so the people who audit and maintain the code understand it less. Sampled audits also drift into rubber stamps when the agent is usually right (automation complacency). Safeguards: seed known-bad canary changes into the audit stream to check that reviewers still catch errors, and require evidence plus a full review for anything flagged or irreversible. Demote on any severe audit finding, and audit more heavily after a model update.
26. Map these controls to L22's autonomy levels, and explain why the level must be enforced outside the model: OpenHands' `AlwaysConfirm()`; its risk-based `ConfirmRisky` policy; a sandbox where file edits are auto-approved but network and destructive commands ask first; an unattended nightly run with scoped credentials.

    **Answer:** `AlwaysConfirm()` is Level 2 (the person approves every step). `ConfirmRisky` and the sandbox mode are Level 3 (act, ask first on risky steps); L22 places OpenHands' confirmation prompts there. The nightly run is Level 4 if a sample of runs is audited afterwards, or Level 5 on that task type only if not. L13's OpenClaw incident shows why enforcement matters: an approval rule that lives in the prompt can be lost to compaction, and a typed "stop" did not halt running commands. Levels must be permissions and approval nodes in code (L15), and for unattended runs high-risk actions should be impossible, not merely confirmable (L14).

## References and further reading

Every link below was checked against the paper's page or the course's verified lecture sheets; read the core papers first.

### Core papers

- [GDPval: Evaluating AI Model Performance on Real-World Economically Valuable Tasks](https://arxiv.org/abs/2510.04374) — Patwardhan et al. (OpenAI), 2025 — expert-written tasks and rubrics for 44 occupations; the template for occupational benchmarks.
- [Remote Labor Index: Measuring AI Automation of Remote Work](https://arxiv.org/abs/2510.26787) — Mazeika et al., 2025 — 240 real freelance projects graded by client acceptance; the starkest reality check.
- [Future of Work with AI Agents: Auditing Automation and Augmentation Potential across the U.S. Workforce](https://arxiv.org/abs/2506.06576) — Yijia Shao et al., 2025 — WORKBank, the Human Agency Scale and the four desire–capability zones.
- [CowPilot: A Framework for Autonomous and Human-Agent Collaborative Web Navigation](https://arxiv.org/abs/2501.16609) — Faria Huq et al., 2025 — pause-and-take-over web agent; 95% success with humans doing 15.2% of steps.
- [Modeling Distinct Human Interaction in Web Agents](https://arxiv.org/abs/2602.17588) — Huq, Wang et al., 2026 — CowCorpus, the four interaction modes and intervention prediction.
- [CollabSkill: Evaluating Human-Agent Collaboration On Real-World Tasks](https://arxiv.org/abs/2606.09833) — Yijia Shao et al., 2026 — collaboration benchmark with Bayesian skill ratings; the rank reversal.
- [Humans are Missing from AI Coding Agent Research](https://arxiv.org/abs/2608.12355) — Zora Wang, John Yang, Kilian Lieret et al., 2026 — patch bloat and the case for human-centred coding agents.
- [Efficient Test-Time Adaptation through Human-AI Interaction](https://arxiv.org/abs/2609.04141) — Zora Wang et al., 2026 — TAHI; evolving per-user rubrics from feedback.
- [SWEET-RL: Training Multi-Turn LLM Agents on Collaborative Reasoning Tasks](https://arxiv.org/abs/2503.15478) — Zhou et al., 2025 — ColBench and the privileged critic for multi-turn collaboration.
- [Training Proactive and Personalized LLM Agents](https://arxiv.org/abs/2511.02208) — Sun et al., COLM 2026 — PPP reward and the UserVille simulator.
- [One Frozen Simulator Is Not Enough: Simulator Collapse in Multi-Agent RL](https://alphaxiv.org/abs/2608.12253) — Yu et al., 2026 — why a single user simulator overfits, and population co-training.
- [CollabLLM: From Passive Responders to Active Collaborators](https://arxiv.org/abs/2502.00640) — Wu et al., ICML 2025 — multiturn-aware rewards; a 201-person user study (beyond the lectures).
- [τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045) — Yao et al., 2024 — the standard simulated-customer benchmark (beyond the lectures).

### From the lectures

- [How Well Does Agent Development Reflect Real-World Work?](https://arxiv.org/abs/2603.01203) — Zora Wang et al., 2026 (L17) — benchmark effort versus employment and capital by occupation.
- [JobBench: Aligning Agent Work With Human Will](https://arxiv.org/abs/2605.26329) — Yuetai Li et al., 2026 (L17) — tasks workers want delegated.
- [Measuring What Matters: Construct Validity in Large Language Model Benchmarks](https://arxiv.org/abs/2511.04703) — Bean et al., NeurIPS 2025 (L17) — the construct-validity review.
- [DR Tulu: Reinforcement Learning with Evolving Rubrics for Deep Research](https://arxiv.org/abs/2511.19399) — Rulin Shao et al., 2025 (L10, L17) — evolving rubrics for RL.
- [Self-Preference Bias in Rubric-Based Evaluation of Large Language Models](https://arxiv.org/abs/2604.06996) — Pombal et al., 2026 (L17) — judge bias across protocols.
- [Code with Me or for Me? How Increasing AI Automation Transforms Developer Workflows](https://arxiv.org/abs/2507.08149) — Chen, Talwalkar, Brennan, Neubig, 2025 (L14) — first controlled copilot-versus-agent study.
- [Are We Automating the Joy Out of Work? Designing AI to Augment Work, Not Meaning](https://arxiv.org/abs/2603.14963) — Ranjit et al., 2026 (L17) — the AI exposure gap.
- [Canaries in the Coal Mine? Six Facts about the Recent Employment Effects of Artificial Intelligence](https://digitaleconomy.stanford.edu/publications/canaries-in-the-coal-mine) — Brynjolfsson, Chandar, Chen, 2025 (L17) — early-career employment by AI exposure.
- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442) — Park et al., UIST 2023 (L18) — simulating people as a research instrument.

### Tutorials, docs and courses

- [O\*NET OnLine](https://www.onetonline.org/) — U.S. Department of Labor — browse occupations as task lists; the sampling frame for work benchmarks.
- [What does it take to build a human-like user simulator?](https://nickatomlin.github.io/blog/user-simulators-2.html) — Tomlin and Lin, 2025 (L18) — practical guide to user simulators.
- [Which Economic Tasks are Performed with AI? Evidence from Millions of Claude Conversations](https://arxiv.org/abs/2503.04761) — Handa et al. (Anthropic), 2025 — observed AI use mapped to O\*NET; the augmentation/automation split.
- [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://arxiv.org/abs/2507.09089) — METR, 2025 — randomised field trial; a reminder to measure real work.

### Added for L19

- [Completion ≠ Collaboration: Scaling Collaborative Effort with Agents](https://arxiv.org/abs/2510.25744) — Shen, Chen et al., 2025 (ACL Findings 2026) — the coffee-shop case and the argument for judging agents by process.
- [Principles of Mixed-Initiative User Interfaces](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/) — Horvitz, CHI 1999 — LookOut and the expected-utility view of when to act.
- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) — Amershi et al., Microsoft, CHI 2019 — the 18 guidelines L19 maps onto before / during / after.
- [ToM-SWE: User Mental Modeling for Software Engineering Agents](https://arxiv.org/abs/2510.21903) — Zhou, Chen et al., 2025 (ICML 2026) — dual-agent user modelling with hierarchical memory.
- [Developer Interaction Patterns with Proactive AI: A Five-Day Field Study](https://arxiv.org/abs/2601.10253) — Kuo, Sergeyuk, Chen, Izadi, 2026 (IUI 2026) — why intervention timing decides engagement.
- [How can we assess human-agent interactions? Case studies in software agent design](https://arxiv.org/abs/2510.09801) — Chen et al., 2025 (ICML 2026) — PULSE on 15k+ OpenHands users.
- [Prediction-Powered Inference](https://arxiv.org/abs/2301.09633) — Angelopoulos, Bates, Fannjiang, Jordan, Zrnic, 2023 (Science) — the estimator behind PULSE (Mechanics 11).
- [PPI++: Efficient Prediction-Powered Inference](https://arxiv.org/abs/2311.01453) — Angelopoulos, Duchi, Zrnic, 2023 — the tuned λ that never does worse than the naive estimate.
- [A Rubric-Supervised Critic from Sparse Real-World Outcomes](https://arxiv.org/abs/2603.03800) — Wang, Chen, Ji, Neubig, 2026 (COLM 2026) — learning a critic from real interaction traces.
- [Improving Composer through real-time RL](https://cursor.com/blog/real-time-rl-for-composer) — Cursor, 26 March 2026 — production RL from implied user feedback, including reward hacks.
- [(Im)Paired Programming: Coding Agents Improve Productivity but Harm Understanding](https://arxiv.org/abs/2607.26375) — Balepur, Baumler, Chen, Choi, Rudinger, Boyd-Graber, 2026 — personalised comprehension quizzes on agent-written code.
- [Is Agent Code Less Maintainable Than Human Code?](https://arxiv.org/abs/2606.21804) — Patel et al. (incl. Chen), 2026 (EMNLP 2026) — CodeThread; agents build worse on agent code.
- "Upskilling Together: Learning Workplace Skills with AI Agents" — Padmakumar et al. (incl. Chen), arXiv forthcoming — FDE training with Claude Code and Codex (no link yet).

### Added for L22

- [Trust in Automation: Designing for Appropriate Reliance](https://journals.sagepub.com/doi/10.1518/hfes.46.1.50_30392) — John D. Lee and Katrina A. See, Human Factors, 2004 — the source of calibrated reliance on L22's two-pillar slide.
- [Humans and Automation: Use, Misuse, Disuse, Abuse](https://journals.sagepub.com/doi/10.1518/001872097778543886) — Parasuraman and Riley, Human Factors, 1997 — the taxonomy of over- and under-reliance.
- [SAE J3016: Taxonomy and Definitions for Terms Related to Driving Automation Systems](https://saemobilus.sae.org/content/j3016_202104) — SAE International, 2021 revision (first issued 2014) — the driving-automation levels behind earned autonomy.
- [Prover-Verifier Games improve legibility of LLM outputs](https://arxiv.org/abs/2407.13692) — Kirchner et al. (OpenAI), 2024 — training outputs to be checkable, a research version of "show your work".
- [Measuring Progress on Scalable Oversight for Large Language Models](https://arxiv.org/abs/2211.03540) — Bowman et al., 2022 — humans supervising outputs they cannot fully check, the limit case of L22's question.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L07 - Computer Use Agents]]
- Lecture: [[L10 - Deep Research Agents]]
- Lecture: [[L13 - Agent Safety]]
- Lecture: [[L14 - OpenHands]]
- Lecture: [[L17 - AI Agents for Human Work]]
- Lecture: [[L18 - Multi-agent Systems]]
- Lecture: [[L19 - Human-AI Collaboration]]
- Lecture: [[L22 - How to Trust Your AI Agents]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]
- [[4 Ways to Test ML Models in Production]]

[[T14 - Agent Safety and Security - Sandboxes, Permissions, Injection and Monitoring|← T14]] · [[CMU 11-768 AI Agents - Course Index|Course index]]
