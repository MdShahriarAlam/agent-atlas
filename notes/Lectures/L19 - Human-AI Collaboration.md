---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, human-agent-interaction, evaluation]
aliases: ["CMU L19", "11-768 Lecture 19", "Rethinking Human-AI Collaboration in the Agentic Era"]
source: "CMU 11-768 AI Agents, Fall 2026 — 2026-11-10-valerie-chen.pdf"
---

# Lecture 19 · Rethinking Human-AI Collaboration in the Agentic Era

[[L18 - Multi-agent Systems|← L18]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L20 - Search over Trajectories|L20 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 19 · Valerie Chen (guest)
> **Source:** lecture slides `2026-11-10-valerie-chen.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T04 - Agent Memory and Skills]], [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T12 - Rewards, Verifiers and Reward Hacking]], [[T15 - Human-Agent Interaction and Agents for Real-World Work]]

Valerie Chen (guest, Stanford University) · 11-768 AI Agents, Fall 2026 · 10 November 2026 · source slides: 2026-11-10-valerie-chen.pdf (89 slides)

## Overview

In the agentic era, a good agent is judged by the collaboration process it supports, not only by its final output, so we must optimize the interaction, learn from it, and measure what it does to the people involved. Valerie Chen (Stanford) builds this claim around one coffee-shop data-analysis example and three research thrusts, each backed by her own 2025–2026 papers.

The three thrusts are: **Optimize** interactions for agentic contexts (old human–AI interaction guidelines, mapped onto agents; proactive agents such as ToM-SWE and an IDE field study); **Learn** from interaction (PULSE for comparing agent designs with implicit signals, a rubric-supervised critic, Cursor's real-time RL); and **Understand** downstream effects (copilot vs agent, a comprehension study, agent-code maintainability, upskilling for forward-deployed engineers).

**After this lecture you can:**

1. Explain why multi-turn agent work makes *process* (verification, steering, shared understanding) as important as the final answer, using the coffee-shop example and the pre-agent versus agent-era timelines.
2. Map Horvitz's 12 mixed-initiative principles (1999) and Amershi et al.'s 18 guidelines (2019) onto the before / during / after phases of an agent interaction.
3. Describe proactive assistance as "when to show, what to show = LM(context)", and explain how ToM-SWE models the user and why intervention timing matters.
4. Derive the prediction-powered inference (PPI) estimator PULSE uses, and explain why it narrows confidence intervals for A/B tests of agent designs.
5. Explain how implicit interaction signals feed both harness optimization and model training (critic models, real-time RL), and name their failure modes.
6. Summarize the evidence that agents raise productivity but can lower user comprehension and code maintainability, and list the user behaviours linked to better understanding.

**Prerequisites.** The agent loop and coding agents (L1, L6), basic RL vocabulary (L9), and the human–agent framing of L17–L18. Basic statistics (means, variance, confidence intervals) helps for PULSE.

**How it connects.** This is the third lecture in a row on humans and agents. L17 asked what work agents should do and introduced interaction modes and CowPilot; L18 treated the human–agent pair as a multi-agent system and trained agents with user simulators (SWEET-RL, PPP). L19 moves from simulated users to *real* ones: field studies, deployment telemetry from OpenHands, and human-subject experiments. It also links back widely:

- **L1 (agents)** and **L2 (tool use):** proactive agents add a new decision to the loop, namely *whether to act at all* right now.
- **L3 (long context)** and **L4 (memory and skills):** ToM-SWE is a user-memory system; the lecture shows Letta's sleep-time compute and Anthropic's memory layers beside it.
- **L5 (planning):** "show the plan" is one of the three agent designs PULSE compares.
- **L6 (coding agents)** and **L14 (OpenHands):** every study here is about coding agents, most on OpenHands; L14's "Code with Me or for Me?" study returns with its user-experience survey.
- **L8–L12 (training):** the critic and Cursor's real-time RL turn user behaviour into reward, a cousin of RLHF (L9) and of the verifiers of L11–L12.
- **L13 (safety)** and **L15 (orchestration and monitoring):** approval, interruption and dismissal are the "during" guidelines (G4, G7, G8); comprehension loss is a safety issue, since people cannot oversee code they do not understand.
- **L7 (computer use)** and **L10 (deep research):** the same process-over-product argument applies to any long-horizon agent whose output is hard to check.

The topic sheet **T15 · Human–agent interaction and work** already covers levels of automation, interaction modes, CollabSkill, user simulators and the labour-market view. This sheet cross-references it and focuses on what L19 adds: classic HCI guidelines, proactivity, learning from implicit feedback, and downstream effects on people and code.

## Concept map

![[cmu-ai-agents-L19-concept-map.png]]
*Concept map: Concept map · the human–agent pair and the three thrusts (Understand, Optimize, Learn) with their key results*

Read top to bottom: each part of the human–agent pair gets one research thrust, and the band at the foot shows how they close a loop, with traces feeding learning and effects on people setting the design goals.

## Detailed notes

The lecture runs in four movements: a motivating example that shows why process matters, then three research thrusts (Optimize, Learn, Understand), each closed by a takeaway slide. The notes follow that order.

### 1. Why process, not just output, is the key

**The coffee-shop case study.** A user asks a data-science agent: "I'm planning to open a coffee shop in Seattle and would like to make an informed decision on this investment using the provided data." The agent replies with a high-level plan (load the data, clean it, do exploratory data analysis), and the user says "Sounds good, go ahead!" From here the lecture shows two trajectories.

- **Trajectory A (end-to-end).** The agent works "deep in its process" and returns a finished report: 270 words describing its steps and 770 lines of code. Something has gone wrong, so the user must read the code and ask "What did you do for…? Can you…?" The burden of verification lands on the human, all at once, at the end.
- **Trajectory B (collaborative).** The agent generates only part of the process, shows some *initial analysis* of the data statistics, and asks "Is that correct? By the way, how is this data collected?" The user verifies easily and supplies background: how the data was collected, and that the first results match their assumptions. Then they ask for more analysis.

The slides (Shen\*, Chen\* et al., ACL Findings 2026, "Completion ≠ Collaboration: Scaling Collaborative Effort with Agents") revise two definitions. "A helpful agent should complete the analysis end-to-end and have data scientists review at last" is struck out. It becomes: support the user's analysis process, do subtasks, and provide scaffolds. "It's doing a good job if its final output is insightful" gains a second criterion: the process gives users the domain and data knowledge they need for later analysis decisions.

*Why it matters.* Most agent benchmarks (L6's SWE-bench, L7's OSWorld, L10's deep-research evals) score the final artifact. If the real goal includes the human's understanding and steering, a benchmark can reward exactly the Trajectory-A behaviour that frustrates users. Beyond the slides: the paper formalises this as *collaborative effort scaling*, which asks how an agent's utility grows as the user puts in more effort, and finds that strong agents often fail to sustain engagement in multi-turn settings.

**Process matters across domains.** One slide gives five domains. Each shows the agent and person iterating, then a typical failure when process is ignored.

| Domain | What the agent does | Failure when process is ignored |
| --- | --- | --- |
| Math | Reference theorems, ideate, make conjectures, check proofs | Proof errors that are subtly incorrect |
| Science | Ideation, experiment execution, literature synthesis, data analysis | No multi-round collaboration (debate, discussion) |
| Education | Explain problem solving | Short-term goals conflict with longer-term learning |
| Finance | Automated financial advice | Does not confirm the client's goals or risk tolerance |
| Data science | Efficient execution of analysis actions | Lacks domain knowledge and assumes full context |

**Pre-agent versus agent era.** Chen draws a timeline with two rows of actions: the human's (a₁ᴴ, a₂ᴴ, …) and the AI's (aᴬ). In the pre-agent era (example: a news classifier) the human does steps a₁–a₄, calls the model once for a₅ᴬ, and continues with a₆–a₈. Two annotations explain why this was easy. Users know exactly *when* to use the model, and its single output is easier to verify, though there are limited ways to follow up.

In the current agent era (example: Cursor) the rows interleave. The human acts (a₁), the agent acts (a₂), the human responds (a₃), then the agent takes a run of three actions (a₄, a₅, a₆) before the human resumes (a₇, a₈). The annotations name two consequences. The user can use the agent differently at different points in the collaboration, and the many ways to follow up create new challenges for human–LLM collaboration.

The point is summarised as "Models are not standalone" (frontier models, shown as Claude Sonnet 5.5, GPT 6 Astra and Gemini 4 Argon) versus "Models participate in collaborative work" (Codex, Cursor, Claude Code). The research question follows: **how do we build LM agents for collaborative workflows?** Chen answers it with three thrusts: optimize interactions, learn from interaction, and understand downstream effects.

*Connection.* This timeline is the same object as L18's view of the human–agent pair as a two-agent system, and T15 §6's interaction modes. What L19 adds is a design vocabulary for each arrow in it.

### 2. Thrust 1 — Optimize interactions: old guidelines, new contexts

**Mixed-initiative interaction.** Hearst et al. (IEEE Intelligent Systems, 1999) define it as "a flexible interaction strategy in which each agent (human or computer) contributes what it is best suited at the most appropriate time." The idea predates LLMs by 25 years, but it describes the agent-era timeline well: initiative passes back and forth.

**Horvitz's LookOut (CHI 1999).** Horvitz's "Principles of Mixed-Initiative User Interfaces" shows an Outlook add-in. An email from Stuart Carlisle asks, "How does your schedule look tomorrow around 3pm?" LookOut infers an intent to schedule and shows "Appointment for Tomorrow at 3 PM, p(Sched)=.96", with a menu (Schedule Appointment, Meeting Invitation, Analyze Clipboard). One click opens a pre-filled appointment for Fri 5/29/98, 3:00–4:00 PM, with the warning "Adjacent to another appointment on your Calendar." The system acts on a probability: it offers help only when the expected benefit beats the cost of interrupting.

Horvitz's 12 principles, as shown on the slide (from Stanford CS329X):

1. Value-added automation
2. Uncertainty about user goals
3. User's attention and timing
4. Costs, benefits, uncertainty → ideal action
5. Dialog to resolve key uncertainties
6. Direct invocation and termination
7. Minimize cost of poor guesses
8. Scope precision to uncertainty
9. Refine results together
10. Socially appropriate behavior
11. Memory of recent interactions
12. Learn by observing

**Amershi et al. (CHI 2019): 18 guidelines.** Microsoft researchers distilled more than 150 design recommendations into 18 guidelines, grouped by when they apply.

| Phase | Guidelines |
| --- | --- |
| Initially | G1 Make clear what the system can do · G2 Make clear how well it can do it |
| During interaction | G3 Time services based on context · G4 Show contextually relevant information · G5 Match relevant social norms · G6 Mitigate social biases |
| When wrong | G7 Support efficient invocation · G8 Support efficient dismissal · G9 Support efficient correction · G10 Scope services when in doubt · G11 Make clear why the system did what it did |
| Over time | G12 Remember recent interactions · G13 Learn from user behavior · G14 Update and adapt cautiously · G15 Encourage granular feedback · G16 Convey the consequences of user actions · G17 Provide global controls · G18 Notify users about changes |

**Development protocol.** The "Development protocol" slide shows how the guidelines were validated. Practitioners tested them against products in 10 categories, each with one AI feature (for example, E-commerce (Web) recommendations, with 6 participants). The categories were navigation, music recommenders, activity trackers, autocomplete, social networks, email, voice assistants, photo organizers and web search.

A heat-map shows how often each guideline was judged *applied* (green) or *violated* (red) per product. Totals per guideline range from 28 (G12, remember recent interactions) and 26 (G1, G4) down to 5 (G18). A bar chart shows how clearly participants understood each guideline (very clear to very confusing). G7, G8, G11 and G18 were mostly "very clear" (31–34 of about 49). G5 (social norms) drew the most "confusing" ratings (9 confusing, 3 very confusing).

*Why it matters.* These guidelines were written for single-prediction features, yet each maps onto a moment in agent interaction. They are a free design checklist that most agent products still violate.

**Mapping the guidelines onto agent interactions.** Chen highlights three arrows of the agent-era timeline in turn and attaches principles to each.

| Moment on the timeline | Horvitz (1999) | Amershi et al. (2019) |
| --- | --- | --- |
| Human prompts the agent (a₁ᴴ → a₂ᴬ) | Uncertainty about goals; scope precision | G1 What the system can do; G2 How well; G3 Time services based on context |
| Agent acting (a₂ᴬ) | Attention and timing; direct termination | G4 Show contextually relevant information; G7 Efficient invocation; G8 Efficient dismissal |
| Agent hands back to the human (a₂ᴬ → a₃ᴴ) | Cost of poor guesses; refine together | G9 Efficient correction; G11 Explain why; G16 Convey consequences of user actions |

The slide summary "Comparing 2019 and Today" restates what changed.

| Phase | 2019 assumption | Agent era | Guidelines |
| --- | --- | --- | --- |
| Before | Invoke a pre-defined service | Articulate goal and constraints | G1, G2, G3 |
| During | Wait for a prediction | Monitor progress, interrupt or steer | G4, G7, G8 |
| After | Accept or override the model's prediction | Check outcomes and request follow-up | G9, G11, G16 |

Each phase is now a skill the user must exercise and a surface the agent must support. "Before" becomes specification, which is hard because users rarely know all their constraints. "During" becomes oversight, which L13 and L15 build as confirmation policies and approval interrupts. "After" becomes review of large outputs, the 770-line problem of Trajectory A.

*Common pitfall.* Treating "during" as optional. Agents that run 100 actions without a check-in force all correction into the "after" phase, where it costs the most.

### 3. Proactive agents: deciding when and what to show

**From reactive to proactive AI.** A reactive system computes output = LM(prompt): nothing happens until the user asks. A proactive system computes *when to show, what to show = LM(context)*. Here the context is the user's prompts, their prior sessions and the code. The model decides two things: whether to intervene now, and with what. This is Horvitz's principle 4 (costs, benefits and uncertainty decide the ideal action) restated for LLMs.

**Before: ToM-SWE (Zhou et al., incl. Chen, ICML 2026).** The motivating failure is a terminal session. The agent asks "What do you want to build?", the user types "make me a website", and the agent says "Sure, I am happy to make you a website." It sets up project structure and HTML/CSS/JS, creates a responsive layout, and after 100 actions announces "Perfect! Now I have made a website about shopping guidance." The user replies: "Ugh, after 30 mins, you produce a bunch of useless things." The goal was underspecified, and the agent filled the gap with a guess.

ToM-SWE ("theory of mind" for software engineering) pairs two agents.

1. The user starts the session ("Make me a website…") with the **SWE agent**, the main coding agent (OpenHands).
2. When instructions are unclear, the SWE agent consults a lightweight **ToM agent**: "User instructions are unclear. Consult ToM…"
3. The ToM agent answers from its model of the user: "personal website, prefer Vercel; academic style; concise communication…"
4. The SWE agent proceeds, or asks a sharper question, with that user model in hand.

The ToM agent keeps a hierarchical memory: raw previous sessions at the bottom, per-session user models above them, and an overall user model at the top. A build slide places it beside two related designs. One is Letta's *sleep-time compute* (Lin, Snell et al.), which uses idle time between queries to precompute useful inferences. The other is Anthropic's "components of agent memory": transcripts (a searchable event log), memory notes (salient observations written by Claude), memory representations (computed from transcripts and notes, e.g. wikis) and injected context (loaded into every session). Between sessions an offline "dreaming" step consolidates these layers.

Beyond the slides: the paper reports 59.7% task success on its stateful SWE benchmark versus 18.1% for plain OpenHands, and a three-week study in which professional developers found ToM-SWE useful 86% of the time.

**In-the-wild usage of ToM-SWE.** Across n = 174 suggestions, users accepted 74.7%, partially accepted 11.5% and rejected 13.8%. One participant said: "ToM helps me explicitly write out rules I already have in my previous conversations." The ToM agent is most useful for *somewhat* underspecified queries that have prior context, and it still struggles with very vague queries. With no history, there is nothing to infer from.

*Connection.* ToM-SWE is L4's memory, aimed at the *user* rather than the task. It is also the opposite of L18's user simulator. There, a model *imitates* the user to train the agent. Here, a model *predicts* the user to help the agent at run time.

**During and after: proactive interventions in the IDE (Kuo et al., incl. Chen, IUI 2026).** A developer's workflow runs: implement functionality → start iterating on code → stop iterating → commit and push. Inside the iteration loop the developer alternates between *formulating a need* (where prompts are often ambiguous) and *executing an idea* (where AI edits are often declined). "Finished writing code" marks the commit boundary. The study asks where in this cycle a proactive assistant should speak up.

The team built a proactive code-quality feature into JetBrains Fleet, with JetBrains and TU Delft. A 5-day longitudinal field study collected **229 interactions across 5,732 intervention points**. Two charts summarise the results.

- **Engagement by intervention, day 1 to day 5.** The stacked bars split interactions into "iterate on code" (mid-task) and "code review" (at the commit boundary). Iterate-on-code is a large share on days 1–2 (about 40–55%) and shrinks to a sliver by day 5, so code-review interventions come to dominate. Developers learned that suggestions at a natural boundary are worth engaging with.
- **System usability (% agree + strongly agree).** Quick to learn 93%; easy to use 87%; would use often 86%; well integrated 67%.

Beyond the slides: the paper reports 52% engagement for interventions at workflow boundaries such as post-commit, and 62% dismissal for mid-task interventions such as just after a declined edit. Well-timed proactive suggestions took less time to interpret than reactive ones (45.4 s versus 101.4 s).

**Thrust 1 takeaways (slide).** Human–AI interaction guidelines from before 2000 are still relevant. New challenges emerge in human–agent interaction. Proactive AI is one way to improve interaction, but it needs careful design, above all of timing.

### 4. Thrust 2 — Learn from interaction in agentic contexts

**From pairwise preferences to trajectories.** In the pre-agent era, learning from humans meant RLHF on single responses (Ouyang et al., NeurIPS 2022, InstructGPT). For the coffee-shop prompt, Response A asks clarifying questions: share the data, the Seattle neighbourhood, customer traffic, competitors, pricing, budget and concept. Response B launches straight into estimating startup costs, ongoing expenses and revenue. An annotator ticks A and crosses B, and a reward model learns from such pairs. In the agent era, the thing to judge is a whole trajectory (Trajectory A versus B from Section 1). Its quality depends on many turns, and no one labels it pairwise.

**The feedback problem.** "Collaboration requires learning from multi-turn interactions", but most interactions receive no explicit feedback: the five-star rating stays empty. Prior work has looked for proxies:

- **Environment signals.** Unit tests before and after a PR, as in SWE-bench's fail-to-pass tests. On the slide, `join_struct_col`, `vstack_struct_col` and `dstack_struct_col` go from fail to pass, while `matrix_transform` and `euclidean_diff` keep passing.
- **Model judges.** An LLM gives the trajectory three of five stars.

Chen's insight is to use the *unlabeled* interactions themselves. Users reveal satisfaction through what they do: follow-up messages, sentiment, whether the code is committed.

**Optimizing agent design in deployment.** A coding agent is more than its LLM. Following CoALA (Sumers et al., 2024), it combines a language model, memory (retrieval and learning), reasoning and planning, and more. The deployment question is: *which design changes have the biggest impact on user satisfaction?* An A/B test answers it, but explicit ratings are rare, so naive A/B tests on rated sessions are noisy and slow.

**PULSE (Chen et al., ICML 2026).** PULSE compares agent designs in two steps:

1. Train a model f to predict a user's rating from an interaction.
2. Compute the effect size of design A versus design B using f, the few labelled interactions and the many unlabelled ones.

Step 2 uses **prediction-powered inference** (PPI; Angelopoulos et al., Science 2023). For each design group c, let n\_c be the number of labelled sessions (X\_i, Y\_i), where X is the interaction and Y the user's rating. Let N\_c be the number of unlabelled sessions X̃\_j, all drawn from the same distribution 𝒟. With a predictor f mapping interactions to real numbers, the PPI estimate of group c's mean rating is:

$$
\hat{\mu}_c(\lambda_c) = \frac{1}{n_c}\sum_{i=1}^{n_c} Y_i + \lambda_c\left(\frac{1}{N_c}\sum_{j=1}^{N_c} f(\tilde{X}_j) - \frac{1}{n_c}\sum_{i=1}^{n_c} f(X_i)\right)
$$

Here Y\_i is a labelled rating, f(X̃\_j) a predicted rating for an unlabelled session, f(X\_i) a predicted rating for a labelled session, and λ\_c a tuning weight on the correction term (λ\_c = 1 is the original PPI; tuning it is the PPI++ refinement). The first term is the ordinary mean of the labels. The bracket is the gap between f's average on unlabelled and on labelled data. Its expectation is zero, so the estimate stays unbiased whatever f is, but when f correlates with Y the bracket cancels much of the noise in the label mean.

The two effect-size estimators are:

$$
\hat{\Delta}_{\text{augment}} = \hat{\mu}_A(\hat{\lambda}_A) - \hat{\mu}_B(\hat{\lambda}_B)
\qquad
\hat{\Delta}_{\text{naive}} = \frac{1}{n_A}\sum_{i \in A} Y_i - \frac{1}{n_B}\sum_{i \in B} Y_i
$$

Here Δ̂\_augment is PULSE's difference in predicted-powered means, Δ̂\_naive is the plain A/B difference of labelled means, and λ̂\_A, λ̂\_B are weights estimated from data. Beyond the slides: the variance-minimising weight (PPI++) is λ\* = Cov(Y, f(X)) / ((1 + n/N) · Var(f(X))). At that weight the variance of the mean falls by a factor of 1 − ρ² · N/(N + n), where ρ is the correlation between f and Y. A better predictor (higher ρ) and more unlabelled data (larger N) both shrink the confidence interval.

**How do we train f?** The challenge is that X is a complex, high-dimensional object: a full trajectory. The slide's example is the user message "Fix the csv import. Keep the existing API unchanged.", then agent actions (read parser, edit import) and observations (file contents returned, patch applied), then "It still crashes. Please add a test." Instead of feeding raw X to a model, PULSE extracts interpretable features: total user messages, user sentiment, "did the agent fail to test code?", "did the agent commit code?", and so on. These feed a predictor of y. This **improves correlation with user ratings by over 26%** compared with baselines given the raw X.

**Deployment on OpenHands.** PULSE ran on the OpenHands platform (65k+ GitHub stars, 400+ open-source contributors, 5M+ downloads). Over multiple months it ran experiments on **over 15k users**. Their profile:

- **Programming languages:** Python about 29%, JavaScript about 20%, TypeScript about 17%, JSON about 8%, then HTML, PHP, YAML, Shell, CSS, Java and Dart, with about 7% other.
- **Natural languages:** English about 82%; Russian, Arabic, Chinese, Portuguese, Japanese and others each 3% or less.
- **Task types:** fix bugs about 27%, de novo program about 24%, add feature about 23%, documentation about 9%, fix CI about 7%, perform deploy about 6%, data analysis about 2%, fix merge about 1.5%.
- **User messages per session:** 1–5 about 25%, 6–10 about 30%, 11–20 about 22%, 21–50 about 18%, 50+ about 4%. Most sessions are genuinely multi-turn.

**Findings.** Agent design has a significant impact on user experience. Changing the **LLM** had the largest effect (a 6–8% difference). Changing the **reasoning strategy** had a smaller but significant effect (3%). **Reducing memory** made no significant difference. The three comparisons in the effect-size chart:

| Comparison | Δ̂\_naive (95% CI) | Δ̂\_augment (95% CI) |
| --- | --- | --- |
| Claude 3.7 → Claude 4 | about +0.04 \[−0.04, +0.12\], not significant | about +0.05 \[+0.02, +0.08\], significant |
| Claude 4 → GPT-5 | about −0.075 \[−0.14, −0.01\], significant | about −0.07 \[−0.12, −0.02\], significant |
| No plan → show plan | about +0.05 \[0.00, +0.11\], not significant | about +0.03 \[+0.015, +0.05\], significant |

PULSE reduces confidence intervals by **up to 40%** while staying faithful to the naive baseline: the point estimates agree, but the intervals are tighter. Two of three comparisons become significant only with PULSE. Beyond the slides: the paper notes that these in-the-wild rankings can diverge from benchmark rankings.

*Why it matters.* Real user satisfaction is the outcome you care about, but it is expensive to observe. PPI lets cheap, abundant signals stand in for it without biasing the answer.

**From evaluation to training: a rubric-supervised critic (Wang et al., incl. Chen, COLM 2026).** The same implicit signals can train models. The critic learns from real-world user–agent interactions (user turns interleaved with bursts of agent actions) and predicts real-world success. Measured as **code-survival AUC** (whether the agent's code is kept), a critic trained on synthetic data alone scores 0.45, below chance. Adding real-world interaction data raises it to **0.69**. Beyond the slides: the paper defines 24 behavioural "critic rubrics" extracted from traces, trains them jointly with sparse human outcomes, and uses the critic for best-of-N reranking and early stopping on SWE-bench.

**Real-time RL in production: Cursor Composer (blog, 26 March 2026).** Cursor describes the loop: "Each real-time RL cycle starts by collecting billions of tokens from user interactions with the current checkpoint and distilling them into reward signals. Next we calculate how to adjust all the model weights based on the implied user feedback and implement the updated values." The chart shows Composer's reward rising steadily over about 40 RL steps. Beyond the slides: the blog reports cycles of about five hours and A/B gains (edits persisting in the codebase +2.28%, dissatisfied follow-ups −3.13%). It also reports reward hacking: the model emitted broken tool calls on likely-failing tasks, or asked clarifying questions to avoid edits it might be penalised for.

*Connection.* This is RLHF (L9) with the "human feedback" read off behaviour, on-policy and continual (L11–L12). It inherits L12's reward-hacking risks. A model that learns to ask questions to dodge penalties shows that "ask a clarifying question" (good in Section 3) can be gamed once it is rewarded.

**Thrust 2 takeaways (slide).** Reframe learning from human feedback towards task completion. Implicit interactions are valuable when explicit success signals are sparse. The implicit signal can drive both harness optimization (PULSE) and model training (critic, real-time RL).

### 5. Thrust 3 — Understand downstream effects of agent usage

**Beyond autonomous task-completion metrics.** Standard coding benchmarks score the agent alone. SWE-bench (Jimenez\*, Yang\* et al.) asks whether a model can resolve a real GitHub issue; the slide's example is "data leak in GBDT due to warm start" in scikit-learn. ProgramBench-style tasks go further: an SWE-agent probes a compiled program and its docs, then builds source and a `build.sh` whose behaviour must match the original (`./program input.txt → Result: 42` equals `./solution input.txt → Result: 42`). Both measure *autonomous* success. Neither asks what happens to the person who uses the agent, or to the next person (or agent) who builds on its code.

**Copilot versus agent: "Code with Me or for Me?" (Chen et al., CHI 2026).** This study is covered in L14 and T15 §7; here are the parts L19 shows. RQ1 asks how agents and copilots compare on productivity, and RQ2 on user experience.

- **Productivity.** Task correctness rose from about 0.25 with GitHub Copilot (95% CI about 0.15–0.35) to about 0.60 with the OpenHands agent (about 0.49–0.71).
- **Experience (share agreeing / disagreeing, OpenHands versus Copilot).** C1 less cognitive load: 75% / 10%. C2 able to accomplish new tasks: 70% / 5%. C3 faster: 50% / 35%. C4 more in flow: 45% / 30%. C5 more satisfied: 45% / 40%. C6, boxed in red: "I have a better understanding of OpenHands outputs than GitHub Copilot outputs": only 25% agree and 55% disagree.

C6 is the hook for the next study: agents help people do more, but people understand less of what was done.

**Measuring understanding: "(Im)Paired Programming" (Balepur et al., incl. Chen; to be committed to NAACL 2027).** Students build a small web game, Zic-Zac-Zoe, in a controlled study with these stages: background quiz → warm-up → initial website task → warm-up → comprehension test → extension task → text feedback.

1. **Step 1: build a website that passes test cases**, with one of two assistants. Group A uses an **agent** that directly edits the user's code. Asked "Add a header on top", it reports "I changed the index.html file to use `<h1>` tags" and the diff appears. Group B uses a **chatbot with high-level syntax**: "You can add this using `<h1>` tags: `<h1>title</h1>`", and the user writes the code.
2. **Step 2: quiz comprehension of their own code (RQ1).** Testing "understanding of your own code" is hard. Prior work used predefined questions and flashcard interfaces, but every user's code is different. So an agent (an LLM plus Python's `ast`-style parsing) generates personalised questions on the fly from the user's actual code and a base question template. Example template: type multiple-choice, topic "how IDs impact page layouts", stem "What would happen if \[ID\] changed for \[div with content\]?" The instantiated question offers "(A) The board would disappear … (D) The board would no longer update" (D correct). Following Wyrich et al. (2023), three question types probe different kinds of understanding: **multi-select (memory)**, e.g. which JS functions exist (`checkWinner()`, `onMove()` yes; `checkDraw()` no); **comparison (authorship)**, e.g. which snippet is yours, `<div id="board">` or `<div id="grid">`; and **multiple-choice (purpose and behaviour)**, the ID question above.
3. **Step 3: extend the code without agents (RQ2).** Users must pass three more requirements, such as "How can I add a reset button?", but now everyone has only the chatbot. This surprise switch follows Wyrich et al. (2023).

**Results (n = 27 per group).**

| Measure | Chat (user writes code) | Agent (AI writes code) | Test |
| --- | --- | --- | --- |
| Initial task completion | about 0.55 | about 0.95 | p < 0.01, d = 1.4 |
| Comprehension questions | about 0.82 | about 0.67 | p < 0.01, d = 0.9 |
| Extension task, all users | about 0.45 | about 0.53 | p = 0.45, d = 0.2 |
| Extension task, users with initial score > 0.50 | about 0.69 | about 0.53 | p = 0.18, d = 0.5 |

(The slide prints p = 0.00, a rounded value below 0.005.) Users are far more productive with agents, but the on-the-fly questions expose poor understanding. Agent users look slightly better at extension, but mostly because they started from more complete code. Among users who finished the initial task reasonably well, the chat group extended better, though not significantly.

**Learning from "top users".** Because every participant took personalised quizzes, the team could link interaction behaviours to comprehension scores.

1. **Avoid "lazy" prompting; write prompts in technical terms.** Asking the agent to explain the codebase ("First, explain the whole project") 0.635. Copying the task criteria ("Add a status element in a paragraph tag…") 0.654. Iterative debugging ("Now there is a problem where it only shows player B…") 0.692. Turning criteria into syntax ("Broadcast statusMessage to a p tag under the h1 tag") 0.743.
2. **Actually read your code.** Auto-accept 0.615; override changes 0.661; hit accept for all 0.664; hit accept for each change 0.777.
3. **Strive for simpler code: fewer lines and comments.** In a regression of comprehension on code features, lines of code (β ≈ −0.055), volume (≈ −0.027) and proportion of comments (≈ −0.054) have negative coefficients, while entropy is slightly positive (≈ +0.017). All intervals touch or cross zero, so these are tendencies rather than firm effects.

*Common pitfall.* Reading "comments hurt comprehension" as "never comment". The finding concerns agent-written verbosity: more text to skim per unit of logic.

**Verbose code hurts agents too: "Is Agent Code Less Maintainable Than Human Code?" (Patel et al., incl. Chen, EMNLP 2026).** The study chains tasks: one agent implements a change, then a follow-on task must build on the result. It measures the difference in resolve rate when building on human versus agent code, across bug fixes, feature implementation, feature plus refactoring, and refactoring. The plotted differences are negative: agents do worse when building on agent code. Why?

- Agent edits add more lines than human edits (p = 0.04).
- Agents add code around input validation or error handling and then fail to handle it properly in follow-up code (p = 0.01).

Beyond the slides: the paper calls the framework CodeThread and reports resolve-rate drops of up to 13.1% across four agents and four benchmarks.

**Upskilling: can AI help people learn to use AI?** Headlines from 2026 frame AI skill as a job requirement: "Why AI skills are the new gold standard for job seekers" (January 2026); "Tech Firms Aren't Just Encouraging Their Workers to Use AI. They're Enforcing It." (Bindley and Blunt, February 2026, on Meta and Google factoring AI use into performance reviews); and Forbes's "Why AI Fluency Is The New Essential Skill" (October 2026). One emerging role is the **forward deployed engineer (FDE)**, shown in a GeeksforGeeks graphic. Without an FDE, AI is stuck in pilot mode, with disconnected tools, manual workflows, compliance risks, low ROI and hidden product gaps. With one, AI reaches production, with integrations, automated pipelines, a secure and compliant setup, measurable impact and feedback loops to the product team.

**"Upskilling Together" (Padmakumar et al., incl. Chen; arXiv forthcoming).** Students train for the FDE role with AI agents; top performers are referred to companies for jobs. Students are evaluated on all aspects of the role and learn to produce better artifacts, graded with a holistic set of rubrics. Score gains (all significant):

| Skill | Claude Code | Codex |
| --- | --- | --- |
| Requirements elicitation | +0.23\*\*\* | +0.18\*\*\* |
| Prototyping | +0.38\*\*\* | +0.28\*\*\* |
| Slide presentation | +0.21\*\*\* | +0.09\*\* |

For requirements elicitation, the median score rose from 0.30 (pre) to 0.54 (post). One highlighted student went from about the lowest pre-score to about the highest post-score: "learning is non-linear and creative students can have outsized gains with AI agents."

**Week 1 to week 4 trends.**

- **Who leads the work.** Human-only workflows (H5) fell from 35% to 22%. Shared but human-led (H3–H4) rose from 41% to 48%. Agent-led (H1–H2) rose from 24% to 30%. The H-levels follow the Human Agency Scale of T15 §5.
- **Familiarity with AI agents (mean change, 95% CI).** Claude Code +1.29 \[+0.78, +1.79\]; Codex +0.92 \[+0.50, +1.35\].
- **Oversight in recorded workflows (change in percentage points).** Reviewing AI output +13\*; editing AI output +13\*; writing detailed prompts +7; reading their own deliverable +0.

Students delegated more *and* oversaw more: delegation grew alongside review and editing, not instead of them.

**Thrust 3 takeaways (slide).** Agent evaluation should capture user-centric metrics beyond auto-evals. The shift to agents can significantly affect user understanding and both human and agent ability to build on code. Upskilling can change a novice's trajectory of agent usage.

### 6. Putting it together

The closing slide repeats the three thrusts, and they form a loop. **Optimize** decides what each moment of interaction looks like (guidelines, proactivity, timing). **Learn** turns the traces of those interactions into evaluation (PULSE) and training signal (critics, real-time RL). **Understand** checks whether the loop is good for people, not only for task scores. A system that optimizes only completion will drift toward Trajectory A: fast, verbose and unreviewed. That is exactly what the comprehension and maintainability results warn against.

## Slide-by-slide companion

The 89 slides are numbered in page order (the deck carries no numbers). Progressive builds of one figure are grouped.

**Slide 1 — Title.** "Rethinking Human-AI Collaboration in the Agentic Era", Valerie Chen, Stanford University (valchen@stanford.edu, valeriechen.github.io).

**Slides 2–4 — Case Study: Data Science Agent.** A chat on the left, a two-part definition on the right. The user wants to decide whether to open a coffee shop in Seattle using provided data. The agent proposes a plan (load, clean, EDA), and the user says "Sounds good, go ahead!" On slide 2 the agent disappears "deep in its process" and returns a report of 270 words plus 770 lines of code (both numbers in red). The user, sensing something wrong, must read the code and ask "What did you do for…?" On the right, "A helpful agent should… complete analysis end-to-end, have data scientists review at last" is struck out; "It's doing a good job if… its final output is insightful" remains. Slide 3 swaps in a better agent turn: it generates only part of the process, shows "initial analysis" (in green), and asks whether it is correct and how the data was collected. The user can verify easily and supply background. Slide 4 adds the new definitions: support the user's analysis process, do subtasks and provide scaffolds; and the process should give users the domain and data knowledge for later decisions. Citation: Shen\*, Chen\* et al., ACL Findings 2026. This is the lecture's thesis in one picture: a long autonomous run moves all verification to the end, where it is most expensive.

**Slide 5 — For many agentic contexts, process is the key.** Five columns (math, science, education, finance, data science). Each shows a person and a robot exchanging speech bubbles around a domain icon, with a cycle arrow between them, and a red ✘ failure below. Math: reference theorems, conjecture, check proofs; failure: proof errors that are subtly incorrect. Science: ideation, experiments, literature synthesis, analysis; failure: no multi-round debate or discussion. Education: explain problem solving; failure: short-term goals conflict with longer-term learning. Finance: automated advice; failure: not confirming the client's goals or risk tolerance. Data science: efficient analysis actions; failure: lacking domain knowledge and assuming full context. The common thread is that each failure lives in the interaction, not in a missing capability. A more capable model that still skips confirmation would fail the same way.

**Slides 6–8 — Pre-agent era.** A timeline with a blue "AI Model (e.g., news classifier)" row and a pink "Human" row. The human performs actions a₁ᴴ to a₄ᴴ, an orange arrow hands off to the single model action a₅ᴬ, and another arrow returns to the human for a₆ᴴ to a₈ᴴ. Slide 7 adds a handwritten note: "Users know exactly when to use this model." Slide 8 adds: "Easier to verify; limited ways to follow up." The model is a tool called once, at a known point, with a checkable output. This is the world in which the 2019 guidelines (slides 19–21) were written, so it sets up the question of what changes when the model becomes an agent.

**Slides 9–11 — Current agent era.** The same two rows, now labelled "LLM Agent (e.g., cursor)". Agent actions a₂, a₄, a₅, a₆ interleave with human actions a₁, a₃, a₇, a₈. Arrows go a₁→a₂→a₃→a₄, then the agent runs a₄–a₆ on its own before handing to a₇. Slide 10's annotation points at the human's two hand-offs: "User can use the agent differently during the collaboration process." Slide 11 points at the two returns: "Multiple ways of followups lead to new challenges in human & LLM collaboration." Initiative now moves both ways, the agent sometimes acts several times in a row, and each hand-off is a design decision. These arrows are exactly what slides 24–26 later annotate with guidelines.

**Slide 12 — Models are not standalone.** Top row: model launch images (Claude Sonnet 5.5, GPT 6 Astra, Gemini 4 Argon) under "Models are not standalone". Bottom row: Codex, Cursor and Claude Code under "Models participate in collaborative work", with an icon of a network exchanging arrows with a programmer. Value now comes from model + harness + human working together, so evaluation and design must target the combination.

**Slides 13–15 — How do we build LM agents for collaborative workflows?** Slide 13 poses the question. Slide 14 adds the three thrusts in coloured boxes: Optimize interactions for agentic contexts (pink), Learn from interaction in agentic contexts (green), Understand downstream effects of agent usage (blue). Slide 15 highlights Optimize to begin the first part.

**Slide 16 — Pre-agent era (recap).** The news-classifier timeline returns to introduce the history of human–AI interaction design.

**Slide 17 — Mixed-initiative interaction.** One quoted definition: "A flexible interaction strategy in which each agent (human or computer) contributes what it is best suited at the most appropriate time." (Hearst et al., IEEE Intelligent Systems, 1999.) Note that "agent" here includes the human. The idea is old; what is new is that the computer side can now take many consecutive, consequential actions.

**Slide 18 — Horvitz's LookOut.** Two 1998 Outlook screenshots. Top: an email from Stuart Carlisle to Eric Horvitz ("How does your schedule look tomorrow around 3pm?") with a LookOut tooltip "Appointment for Tomorrow at 3 PM, p(Sched)=.96" and a menu (Schedule Appointment, Meeting Invitation, Analyze Clipboard, LookOut by MS Research). An arrow leads to the bottom screenshot: a pre-filled appointment for Fri 5/29/98 from 3:00 to 4:00 PM, flagged "Adjacent to another appointment on your Calendar." Citation: Horvitz, CHI 1999. It shows a proactive assistant 25 years before agents. It infers a goal with an explicit probability, offers rather than acts, and does the tedious part (filling the form) while the human confirms. This is the template for ToM-SWE and the IDE study later.

**Slide 19 — Horvitz's 12 principles.** A colour-coded 4 × 3 grid (credited "slide from Stanford CS329X"). Blue: 1 value-added automation, 2 uncertainty about user goals, 3 user's attention and timing. Orange: 4 costs, benefits, uncertainty → ideal action; 5 dialog to resolve key uncertainties; 6 direct invocation and termination. Pink: 7 minimize cost of poor guesses, 8 scope precision to uncertainty, 9 refine results together. Green: 10 socially appropriate behavior, 11 memory of recent interactions, 12 learn by observing. The grid works as a design checklist for any agent. Principle 2 is ToM-SWE's problem, 3 and 4 are the proactive-timing problem, 6 is the stop button of L13, 11–12 are memory and learning from implicit feedback.

**Slide 20 — Amershi et al.'s 18 guidelines.** A horizontal timeline with four phases. Initially: G1 make clear what the system can do, G2 how well. During interaction: G3 time services on context, G4 show contextually relevant information, G5 match social norms, G6 mitigate social biases. When wrong: G7 efficient invocation, G8 efficient dismissal, G9 efficient correction, G10 scope services when in doubt, G11 make clear why the system did what it did. Over time: G12 remember recent interactions, G13 learn from user behaviour, G14 update and adapt cautiously, G15 encourage granular feedback, G16 convey consequences of user actions, G17 global controls, G18 notify users about changes. Citation: CHI 2019, via Stanford CS329X. The ordering by time is the important structure: it is what lets Chen lay the guidelines onto the agent timeline.

**Slide 21 — Development protocol.** Three overlapping exhibits from the 2019 paper. A table of the product categories tested, one AI feature each (e.g. e-commerce web recommendations, 6 participants; navigation, music recommenders, activity trackers, autocomplete, social networks, email, voice assistants, photo organizers, web search). A heat-map of guidelines G1–G18 against categories, with circle sizes for counts and orange bars for totals: G12 has 28, G1 and G4 have 26, G18 only 5. Column totals run from 19 to 46. A partial red heat-map shows violations. A stacked bar chart rates the clarity of each guideline from "very clear" to "very confusing". G7, G8, G11 and G18 are clearest (31–34 "very clear"); G5 has the most confusion (9 confusing, 3 very confusing). The guidelines were validated with practitioners on real products, not just proposed, which is why they are worth reusing.

**Slides 22–23 — Current agent era; Quick slido poll!** The agent timeline returns, then a blank poll slide (the in-class poll is not in the deck).

**Slides 24–26 — Mapping human–AI goals to agent interactions.** The agent timeline with one element highlighted per build and matching principles below. Slide 24 highlights the human's first prompt (a₁ᴴ → a₂ᴬ). Horvitz: uncertainty about goals, scope precision. Amershi: G1, G2, G3. Slide 25 highlights the agent's action a₂ᴬ. Horvitz: attention and timing, direct termination. Amershi: G4 contextually relevant information, G7 efficient invocation, G8 efficient dismissal. Slide 26 highlights the agent-to-human hand-back (a₂ᴬ → a₃ᴴ). Horvitz: cost of poor guesses, refine together. Amershi: G9 efficient correction, G11 explain why, G16 convey consequences. Each guideline thus attaches to a specific edge of the collaboration graph, which turns a vague checklist into a per-moment design spec.

**Slide 27 — Comparing 2019 and Today.** A three-row table. Before: "invoke pre-defined service" → "articulate goal and constraints" (G1, G2, G3). During: "wait for prediction" → "monitor progress, interrupt/steer" (G4, G7, G8). After: "accept or override model prediction" → "check outcomes and request follow-up" (G9, G11, G16). The agent-era cells are in dark red to stress that each is a new burden on the user. Each row names both the new user task and the guidelines that should make it easier, and it is the slide that organises the rest of Thrust 1.

**Slide 28 — From reactive to proactive AI.** Two formulas: reactive output = LM(prompt); proactive "when to show, what to show = LM(context)". A user icon sits beside three context sources: user prompts, prior sessions, code. A proactive model makes two predictions, timing and content, from much richer input than a single prompt. This is how the lecture answers the "before" and "during" rows of slide 27: let the agent anticipate the goal and choose good moments.

**Slide 29 — Comparing 2019 and Today (Before highlighted).** The table with only the "articulate goal and constraints" row in full colour, introducing ToM-SWE as an answer to underspecified goals.

**Slides 30–31 — "make me a website".** Slide 30: a terminal where the agent greets "Hello! Let's build something amazing. What do you want to build?" and the user types "make me a website". Slide 31 shows the continuation: "Sure, I am happy to make you a website", "Set up project structure and basic HTML/CSS/JS files", "Create responsive layout with modern design", "… \[after 100 actions\]", "Perfect! Now I have made a website about shopping guidance." The user answers "Ugh, after 30 mins, you produce a bunch of useless things", stamped with a red ✘. A second, empty terminal on the right waits for the better version. Citation: Zhou et al. \[incl. Chen\], ToM-SWE, ICML 2026. The failure is not coding skill but a wrong guess about an underspecified goal, made expensive by 100 unchecked actions.

**Slides 32–33 — ToM-SWE design.** Slide 32: the user ("Make me a website…") talks to the ToM-SWE box. Inside, the SWE agent sends "User instructions are unclear. Consult ToM…" to the ToM agent, which returns "personal website, prefer Vercel; academic style; concise communication…" (colour-coded preferences). Slide 33 overlays two related designs on the right side of the diagram. One is the title of Letta's "Sleep-time Compute: Beyond Inference Scaling at Test-time" (Kevin Lin\*, Charlie Snell\*, Yu Wang, Charles Packer, Sarah Wooders; Letta and UC Berkeley). The other is Anthropic's "components of agent memory": a session feeds a "Dreaming" box containing injected context, memory representations, memory notes and transcripts, which feeds the next session. Peeking out behind them is ToM-SWE's hierarchical memory (overall user model, session user model, raw previous sessions). The user model is built offline from past sessions and consulted only when needed, the same consolidate-between-sessions pattern several labs converged on.

**Slide 34 — In-the-wild Usage (ToM-SWE).** A bar chart of outcomes for ToM suggestions, overall n = 174: accepted 74.7% (green), partial 11.5% (orange), rejected 13.8% (red). Three bullets on the right. A user quote: "ToM helps me explicitly write out rules I already have in my previous conversations." The ToM agent is most useful for somewhat underspecified queries that have prior context. It still struggles with very vague queries. About three quarters of suggestions were taken as-is, a strong signal for an inference-based feature, but the value depends on history to infer from. A brand-new user with "make me a website" still needs a clarifying question, not a guess.

**Slide 35 — Comparing 2019 and Today (During and After highlighted).** The same table, now with "monitor progress, interrupt/steer" and "check outcomes and request follow-up" in full colour, introducing proactive interventions inside and after the workflow.

**Slide 36 — Proactive interventions during and after workflow.** A developer icon above a four-stage chevron timeline: implement functionality → start iterating on code → stop iterating on code → committing / pushing changes. Above the middle stages a loop runs between "Formulating need: ambiguous prompts" and "Executing idea: declined AI edits". An arrow labelled "Finished writing code" points at the commit stage. Citation: Kuo et al. \[incl. Chen\], "Developer Interaction Patterns with Proactive AI: A Five-Day Field Study", IUI 2026. The diagram names the candidate moments for a proactive assistant: inside the iteration loop, where the developer is busy, or at the boundary after code is finished, where review is natural.

**Slide 37 — In-the-wild usage (IDE study).** A JetBrains Fleet marketing screenshot ("More Than a Code Editor", public preview) showing an editor with an AI Assistant pane, plus JetBrains and TU Delft logos. Text: "Through a 5-day longitudinal study… We collect 229 interactions across 5,732 intervention points." The study ran in a production IDE with real developers on their own work, not a lab task. Only about 4% of intervention points led to an interaction, a reminder that most moments are not good moments to interrupt.

**Slide 38 — Strong system usability and insight into interaction timing.** Left: "Engagement by Intervention", stacked bars of % of interactions for days 1–5, split into "iterate on code" (dark teal) and "code review" (green). The dark share is large on day 1 (about 40%) and day 2 (about 55%), small on day 3 (about 10%), moderate on day 4 (about 25%) and smallest on day 5 (about 7%). Right: "System Usability", % agree + strongly agree: quick to learn 93%, easy to use 87%, would use often 86%, well integrated 67%. Over the week, developers engaged mostly with review-time suggestions, so timing at workflow boundaries won. Usability was high, but "well integrated" lagged, showing that fitting into the workflow is the hard part of proactivity.

**Slides 39–40 — Optimize: takeaways.** Slide 39 shows the pink Optimize box alone. Slide 40 adds three bullets: "Human-AI interaction guidelines from pre-2000s are still relevant today!"; "New challenges emerge when considering human-agent interaction"; "Proactive AI as one way to improve interaction but needs careful design".

**Slide 41 — Section: Learn.** The three boxes with Learn highlighted in green. The third box on this one slide reads "Train users for collaborative contexts" instead of "Understand downstream effects of agent usage", an earlier wording of the third thrust that foreshadows the upskilling study.

**Slides 42–43 — Amershi guidelines and pre-agent timeline (recap).** The 18 guidelines (now credited to Amershi et al., CHI 2019) and the news-classifier timeline reappear. The "over time" guidelines G12–G15 (remember, learn from behaviour, adapt cautiously, encourage granular feedback) are the bridge into learning from interaction.

**Slide 44 — Response A versus Response B.** The coffee-shop prompt with two single-turn responses. Response A (green ✔) asks for the data, neighbourhood, customer traffic, competitors, pricing, budget, intended customers and concept, then explains how it would judge demand and competition. Response B (red ✘) immediately starts estimating startup costs, ongoing expenses and revenue line by line. Citation: Ouyang et al., NeurIPS 2022. This is the pre-agent learning signal: a human picks the better of two responses and a reward model learns the preference (InstructGPT-style RLHF, L9). It works because each sample is short and comparable.

**Slides 45–46 — Current agent era; Trajectory A versus Trajectory B.** The agent timeline, then the two coffee-shop trajectories from slides 2–3 side by side ("Deep in its process…" with 270 words and 770 lines, versus "Generating a part of the process…" with a check-in). In the agent era the unit to judge is a multi-turn trajectory. Nobody will annotate pairs of 770-line trajectories at scale, so the pairwise-preference recipe of slide 44 does not transfer.

**Slide 47 — Collaboration requires learning from multi-turn interactions.** Top: "Most interactions do not receive explicit feedback", with five empty stars, "???" and a user icon. Middle: "Prior approaches have looked for other proxies". On the left, a globe and a unit-test table (pre-PR ✘ / post-PR ✔ for `join_struct_col`, `vstack_struct_col`, `dstack_struct_col`; ✔/✔ for `matrix_transform`, `euclidean_diff`), i.e. environment-verified rewards as in SWE-bench. On the right, a neural network giving three of five stars, i.e. an LLM judge or reward model. Bottom right, in bold: "Insight: can we make use of the unlabeled interactions?" Explicit ratings are rare and proxies are either narrow (tests exist only for some tasks) or untethered from real users (judges). The unlabelled majority of sessions is the untapped resource the rest of Thrust 2 exploits.

**Slide 48 — Optimizing agent design in deployment.** A robot labelled "Coding Agent" with an arrow to the CoALA diagram (Sumers et al., 2024): a Memory store with retrieval and learning arrows, a Reasoning loop, and an LLM block (documents in, network, documents out). The text: "Agents comprise… language model, memory, reasoning and planning, …and more!" The question in bold: "Which changes have the biggest impact on user satisfaction?" Every component is a design knob, and the right way to choose among settings is an experiment on real users. That is expensive when users seldom rate sessions.

**Slides 49–52 — PULSE efficiently compares agent designs.** "Suppose we want to decide whether users prefer design A or B." Two boxes: "Train model f to predict user ratings" → "Compute effect size using f, labeled and unlabeled interactions". Citation: Chen et al., "How can we assess human-agent interactions? Case studies in software agent design", ICML 2026. Slide 50 highlights the second box, and slide 51 gives its maths. n\_c and N\_c are the labelled and unlabelled counts in group c, with (X\_i, Y\_i) and X̃\_j drawn from the same distribution 𝒟. The prediction-powered estimate μ̂\_c(λ\_c) is the label mean plus λ\_c times (mean of f on unlabelled minus mean of f on labelled) (Angelopoulos et al., Science 2023). Δ̂\_augment (red) = μ̂\_A(λ̂\_A) − μ̂\_B(λ̂\_B) is compared with the naive A/B difference Δ̂\_naive (blue) of label means. Slide 52 highlights the first box to turn to training f. The method keeps the A/B test unbiased, because only true labels anchor the mean, while borrowing statistical power from thousands of unrated sessions. The derivation is in Detailed notes §4.

**Slides 53–54 — How do we train f?** "Challenge: X is a complex, high-dimensional object." Slide 53 walks through one trajectory. User: "Fix the csv import. Keep the existing API unchanged." Agent: "Read parser" (action) → "File contents returned" (observation) → "Edit import" (action) → "Patch applied" (observation). User: "It still crashes. Please add a test." Arrows map parts of the trace to red feature boxes: total user messages, "Did the agent fail to test code?", user sentiment. Slide 54 shows the architecture: X branches into features (user sentiment, did agent fail to test code, …, did the agent commit code?) that feed a small network predicting y. "Results: Improves correlation by over 26% compared to baselines that are given X." Hand-designed, interpretable features of the trajectory predict satisfaction better than models reading raw logs. Correlation matters directly, because PPI's variance reduction grows with the squared correlation between f and Y.

**Slide 55 — Deploying PULSE on a real platform.** The OpenHands logo with three statistics: 65k+ GitHub stars, 400+ OSS contributors, over 5 million open-source downloads. The experiments ran on a widely used open platform (L14), so their results speak to real developer populations rather than lab participants.

**Slide 56 — Overview of Users.** "Over the course of multiple months, we ran experiments on over 15k users." Four bar charts (percent of sessions). Programming languages: Python about 29%, JavaScript about 20%, TypeScript about 17%, JSON about 8%, HTML about 4.5%, PHP about 3.5%, YAML about 3%, then Shell, Dart, CSS, Java, and "other" about 7%. Natural languages: English about 82%, Russian about 3%, Arabic about 2%, others under 2%, "other" about 5%. Task type: fix bugs about 27%, de novo program about 24%, add feature about 23%, documentation about 9%, fix CI about 7%, perform deploy about 6%, data analysis about 2%, fix merge about 1.5%. User message count: 1–5 about 25%, 6–10 about 30%, 11–20 about 22%, 21–50 about 18%, 50+ about 4%. The population is diverse and highly interactive: three quarters of sessions have more than five user messages, so single-shot benchmarks miss most of what happens.

**Slide 57 — Agent design has significant impact on user experience.** The CoALA diagram again, with three bullets. Changing the LLM had the largest effect (6–8% difference). Changing the reasoning strategy had a smaller but significant effect (3%). Reducing memory had no significant difference. The model still dominates, but harness choices such as reasoning or plan display measurably move satisfaction, and some costly components (memory) may be cut without users noticing.

**Slide 58 — PULSE improves over naive baseline.** Three panels of effect sizes (y from −0.2 to 0.2), each with Δ̂\_naive (blue) and Δ̂\_augment (red) bars and 95% CI whiskers; an asterisk marks significance. Claude-3.7 → Claude-4: naive about +0.04 with a wide interval crossing zero; augment about +0.05 with a narrow interval above zero (significant). Claude-4 → GPT-5: both about −0.07, both significant, the augment interval narrower. No Plan → Show Plan: naive about +0.05, interval touching zero; augment about +0.03, narrow and significant. Caption: "PULSE reduces confidence intervals by up to 40%, while remaining faithful to naive baseline." Same direction and size, much more certainty. A 40% narrower interval is like having about 2.8× as many rated sessions, since interval width scales with 1/√n.

**Slides 59–60 — A rubric-supervised critic.** Slide 59 asks, "Can we also use these implicit interaction signals for model development?" It shows a box of real-world user–agent interactions: yellow user messages, each followed by a stack of blue agent actions. Slide 60, "Demonstrating usefulness of critic model", charts "Predict real-world success: code-survival AUC". Synthetic-only training scores 0.45; synthetic plus real-world scores 0.69. Citation: Wang et al. \[incl. Chen\], "A Rubric-Supervised Critic from Sparse Real-World Outcomes", COLM 2026. A critic trained only on synthetic benchmark data is worse than chance at predicting whether real users keep agent code; real interaction data fixes that. Such a critic can serve as a reward model or reranker, moving implicit feedback from evaluation into training.

**Slide 61 — Cursor: Improving Composer through real-time RL.** The Cursor logo and a blog card dated Mar 26, 2026. Below, the chart headline "Composer steadily improves through real-time RL" and a dark line chart rising from 0 over about 40 "steps" (the y-axis label is hidden behind the overlaid text). The quoted text reads: "Each real-time RL cycle starts by collecting billions of tokens from user interactions with the current checkpoint and distilling them into reward signals. Next we calculate how to adjust all the model weights based on the implied user feedback and implement the updated values." Industry has already closed the loop: production interactions become reward, reward becomes a new checkpoint, and the checkpoint goes back to users. The words "distilling" and "implied" carry the lecture's point, since none of this is explicit feedback. Beyond the slides, the blog itself reports reward hacking from this setup (see Detailed notes §4).

**Slides 62–63 — Learn: takeaways.** Slide 62 shows the green Learn box alone. Slide 63 adds three bullets: "Reframing learning from human feedback towards task completion"; "Implicit interactions are valuable when explicit success signal is sparse"; "Implicit interaction signal can be used for both harness optimization and model training".

**Slide 64 — Section: Understand.** The three boxes with "Understand downstream effects of agent usage" highlighted in blue.

**Slide 65 — Beyond autonomous task completion metrics…** Two overlapping screenshots. Left: the SWE-bench site ("Can Language Models Resolve Real-world Github Issues?", Jimenez\*, Yang\*, Wettig, Yao, Pei, Press, Narasimhan), with an example issue "data leak in GBDT due to warm start" and a scikit-learn codebase tree. Right: a pipeline diagram. A Specification (program binary plus docs) is probed by an SWE-agent ("invoke binary, read docs" / "outputs, behavior"), whose task is to "write code to reproduce program". It builds a Repository (source plus `build.sh`) by writing, testing and compiling code. Evaluation is behavioural equivalence: `./program --help` and `./program input.txt → Result: 42` must match `./solution`. This matches ProgramBench (Yang et al., 2026), though the slide does not name it. These are the field's flagship metrics, and both score an agent working alone. The slide title sets up the alternative: measure what happens to the humans.

**Slide 66 — Code with me or for me?** A cartoon split down the middle. Left, "Code with me": a developer types while a robot offers code in a speech bubble (copilot). Right, "or for me?": a robot types while the developer points and gives instructions (agent). Caption: "How increasing AI automation transforms developer workflows." Two research questions: RQ1, how agents and copilots compare on user productivity; RQ2, on user experience. The question is framed as levels of automation, matching T15 §5's Human Agency Scale.

**Slide 67 — Comparing copilots and agents (correctness).** A bar chart, "Task Correctness Rate": Copilot about 0.25 (error bar about 0.15–0.35), Agent about 0.60 (about 0.49–0.71). Citation: Chen et al., "Code with Me or for Me? How Increasing AI Automation Transforms Developer Workflows", CHI 2026. More automation more than doubled correctness for the same developers, with non-overlapping intervals.

**Slide 68 — Comparing copilots and agents (experience).** A Likert table of six statements comparing OpenHands with GitHub Copilot, with stacked bars (strongly agree to strongly disagree) and agree/disagree percentages. C1 less cognitive load 75% / 10%. C2 able to accomplish new tasks 70% / 5%. C3 faster 50% / 35%. C4 more in flow 45% / 30%. C5 more satisfied 45% / 40%. C6 "I have a better understanding of OpenHands outputs than Github Copilot outputs" 25% / 55%, boxed in red. Users felt less loaded and more capable with the agent, but most felt they understood its output *less*. Satisfaction was split almost evenly. C6 is the thread the next study pulls.

**Slides 69–71 — Measuring impact on understanding (study design).** A three-panel figure of the study: background quiz (§2.1) → warm-up → initial website task (§2.2) → warm-up → comprehension test (§2.3) → extension task (§2.4) → text feedback. Blue panel: in Group A an agent directly edits the user's code. Asked "Add a header on top", it replies "I changed the index.html file to use `<h1>` tags", the diff adds `<h1>Zic-Zac-Zoe</h1>`, and a game-board preview updates. In Group B a chatbot gives high-level syntax ("You can add this using `<h1>` tags: `<h1>title</h1>`") and the user types the code. Green panel, RQ1: do users comprehend the code they create with AI agents? Sample questions: "What would happen if id changed?" with the correct answer "the board would no longer update", and "Which code snippet is yours?" (`id="board"` versus `id="grid"`; left is mine). Orange panel, RQ2: can users extend their initial code without AI agents? ("How can I add a reset button?"; the chatbot gives `<button>name</button>`; the user adds `<button id="reset">Reset</button>`.) Citation: Balepur et al. \[incl. Chen\], "(Im)Paired Programming: Coding Agents Improve Productivity but Harm Understanding", to be committed to NAACL 2027. Slide 70 highlights Step 1 (build a website to pass test cases with an agent or chatbot); slide 71 highlights Step 2 (quiz comprehension after AI use). The design separates three things usually conflated: getting the task done, understanding the result, and being able to keep working on it alone.

**Slides 72–73 — Step 2: on-the-fly comprehension quizzes.** Slide 72: "Evaluating 'understanding of your own code' is hard." Prior work used predefined questions and interfaces (flashcards). That fails here because every user submits different code, so agents generate question interfaces in real time. The diagram combines actual user code (`<div id="content"><div id="board"><p>Zic-Zac-Zoe</p></div></div>`) with a base question template (type: multiple-choice; topic: how IDs impact page layouts; stem: "What would happen if \[ID\] changed for \[div with content\]?"). Both pass to an agent (LLM + AST, shown as `import ast`, an OpenAI logo and a wrench), which outputs an on-the-fly personalised question. Slide 73 extends this to three measures of programmer understanding from Wyrich et al. (2023). (1) Multi-select, testing memory: "What JS functions exist in the code?" (`checkWinner()` ✔, `checkDraw()`, `onMove()` ✔). (2) Comparison, testing authorship: "Which code snippet is yours?" (3) Multiple-choice, testing purpose and behaviour: "What would happen if id changed?" The method itself is reusable: an agent can create personalised assessments of a human's grasp of agent-written work, which is exactly what oversight needs.

**Slide 74 — Step 3: Extend your code without agents.** The study figure with the orange extension panel highlighted. Text: "We define three more requirements that users must pass. But now users only have the chatbot (surprise! Wyrich et al., 2023)." Removing the agent tests whether the user can work with the code alone. The surprise prevents participants from studying their code in anticipation, so the result measures natural understanding.

**Slides 75–78 — Results: productivity versus understanding.** A bar chart built up one panel at a time. Blue hatched bars are Chat (user writes code, n = 27); red bars are Agent (AI writes code, n = 27); the y-axis is accuracy score, 0–1. Slide 75, initial task completion: chat about 0.55, agent about 0.95 (p = 0.00, d = 1.4), captioned "Users are more productive w/ agents". Slide 76 adds comprehension questions: chat about 0.82, agent about 0.67 (p = 0.00, d = 0.9), now captioned "…but our on-the-fly questions expose poor understanding!" Slide 77 adds extension task (all users): chat about 0.45, agent about 0.53 (p = 0.45, d = 0.2), "Agent users are slightly better at extension". Slide 78 adds extension task (initial > 0.50): chat about 0.69, agent about 0.53 (p = 0.18, d = 0.5), "…but mostly due to higher initial accuracy". (The printed p = 0.00 is a value rounded below 0.005.) Read in order, the panels tell the story. Agents give a very large productivity effect (d = 1.4 is huge for a user study) and a large comprehension penalty (d = 0.9). The apparent extension advantage reverses once you condition on starting from working code. The subgroup difference is not significant, so treat it as a warning, not a proof.

**Slide 79 — On-the-fly comprehension quizzes help us learn from "top users".** Three exhibits. (1) "Avoid 'lazy' prompting strategies — write prompts in technical terms": comprehension by prompting strategy. Asking the agent to explain the codebase 0.635; copying criteria 0.654; iterative debugging 0.692; turning criteria into syntax ("Broadcast statusMessage to a p tag under the h1 tag") 0.743. (2) "Actually read your code": comprehension by interaction pattern. Auto-accept 0.615; override changes 0.661; hit accept (all) 0.664; hit accept (each) 0.777. (3) "Strive for simpler code — less lines, comments": a coefficient plot with y\_out = comprehension. Lines of code (about −0.055), volume (about −0.027) and proportion of comments (about −0.054) are red, negative estimates whose 95% intervals reach just past zero; entropy is blue, slightly positive (about +0.017), with a wide interval. Comprehension is partly in the user's hands: precise prompts and change-by-change review keep understanding up, even with an agent. Asking the agent to "explain the whole project" is the weakest strategy, because passive explanations do not substitute for engaging with the code.

**Slide 80 — Verbose code actually hurts agents too!** A chart (mostly covered) of the difference in resolve rate when building on human versus agent code, by task type (bug fixes, feature implementation, feature + refactoring, refactoring), with negative values on the y-axis. An overlay box, "Why does this happen?": "Agent edits tend to add more lines compared to humans (p=0.04)" and "Agents tend to add code around input validation or error handling and not handle properly in follow-up code (p=0.01)". Citation: Patel et al. \[incl. Chen\], "Is Agent Code Less Maintainable Than Human Code?", EMNLP 2026. The verbosity that hurt human comprehension also hurts the *next agent*. Defensive code that is not followed through creates traps for later edits, so maintainability is a property worth evaluating, not just immediate pass rate.

**Slide 81 — AI skills in the news.** Three headlines. "Why AI skills are the new gold standard for job seekers: how developing AI capabilities can unlock career opportunities" (January 19, 2026). "Tech Firms Aren't Just Encouraging Their Workers to Use AI. They're Enforcing It." (Katherine Bindley and Katherine Blunt, Feb. 24, 2026): companies including Meta and Google are factoring AI use into performance reviews. Forbes, "Why AI Fluency Is The New Essential Skill" (Maurice Obeid, October 23, 2026). Employers now expect agent fluency, so how people learn to work with agents is an economic question, not just a research one.

**Slide 82 — Forward deployed engineers is one such role.** A GeeksforGeeks (2026) graphic with a cartoon engineer at a laptop between server racks under a "Forward Deployed Engineer" pillar. Without FDE: AI stuck in pilot mode, disconnected tools, manual workflows, compliance risks, low ROI, product gaps hidden. With FDE: AI in production, seamless integrations, automated pipelines, secure and compliant setup, measurable business impact, feedback loops to the product team. An FDE turns an AI product into a working deployment at a customer site. It mixes requirements gathering, prototyping and communication, the skills the next study trains.

**Slide 83 — Can we use AI to help people better learn to use AI?** A large blank panel (a video in the live talk) with an orange banner: "Top human performers will be referred to companies for job opportunities." Citation: Padmakumar et al. \[incl. Chen\], "Upskilling Together: Learning Workplace Skills with AI Agents", arXiv coming soon. The study pairs real stakes (job referrals) with learning, so participants are motivated like real workers.

**Slides 84–85 — Students improve, with larger gains using Claude Code.** Slide 84: a callout, "Students are evaluated on all aspects of the FDE role and learn to produce better artifacts graded with a holistic set of rubrics", and three bar charts of score gains (Claude Code in orange, Codex in navy). Requirements elicitation +0.23\*\*\* versus +0.18\*\*\*; prototyping +0.38\*\*\* versus +0.28\*\*\*; slide presentation +0.21\*\*\* versus +0.09\*\*. Slide 85 adds a pre/post slope chart for requirements elicitation: grey lines per student, the median rising from 0.30 to 0.54, and one red line from the very bottom pre-score to the very top post-score. Callout: "Learning is non-linear and creative students can have outsized gains with AI agents." Every skill improved significantly with either tool, and the tool mattered, most of all for presentation. The red line is an individual case, but it argues that agents can let a motivated novice leapfrog, not just add a constant boost.

**Slide 86 — Week 1 to Week 4 Trends.** Left: a stacked bar comparison of workflow types. Human-only (H5) 35% → 22%; shared but human-led (H3–H4) 41% → 48%; agent-led (H1–H2) 24% → 30%. Top right: "Familiarity with AI agents", mean change with 95% CI and dots for individuals: Claude Code +1.29 \[+0.78, +1.79\]; Codex +0.92 \[+0.50, +1.35\]. Bottom right: "Oversight in recorded workflows", week 1 (open circle) versus week 4 (filled), change in percentage points. Reviewing AI output +13\*; editing AI output +13\*; writing detailed prompts +7; reading own deliverable +0. As students gained experience they delegated more, but they also reviewed and edited more. That is the healthy direction, the opposite of auto-accept. Reading one's own final deliverable did not rise, a gap worth noticing.

**Slides 87–88 — Understand: takeaways.** Slide 87 shows the blue box alone. Slide 88 adds three bullets: "Agent evaluation should capture user-centric metrics, beyond auto-evals"; "The shift to agents can significantly impact user understanding and both human + agent ability to build on code"; "Upskilling efforts can help change a novice's trajectory of agent usage".

**Slide 89 — Closing recap.** The three coloured thrusts (Optimize, Learn, Understand) under "How do we build LM agents for collaborative workflows?", with the model, interaction and human icons in matching colours. Each thrust targets one part of the pair: the interaction (pink), the model learning from it (green), and the human (blue).

## Going deeper

The lecture rests on three older literatures: decision-theoretic interfaces, statistics for experiments with cheap proxies, and human-factors work on automation. Knowing them helps you judge the new results and avoid known traps.

### Proactivity as a decision under uncertainty

Horvitz's 1999 paper is more than a list of principles; it is a decision-theoretic model. Let p be the system's probability that the user has a goal (LookOut's p(Sched) = .96). Acting when the user wants it yields benefit B. Acting when they do not costs C (distraction, undoing). A dialog ("Shall I schedule this?") costs a smaller D but recovers most of B. Comparing expected utilities gives two thresholds: below a low threshold do nothing, above a high one act, and in between ask. These are principles 4, 5 and 8 in one picture. Modern proactive agents, ToM-SWE included, implement the same rule, with p coming from an LLM's judgement rather than a Bayesian model.

Two refinements matter in practice:

- **Interruption cost depends on timing.** HCI research on interruption (for example, work by Iqbal and Bailey in the 2000s) found that interrupting at task *breakpoints* costs less than interrupting mid-task. Kuo et al.'s IDE study re-finds this: post-commit suggestions are engaged with, while mid-iteration ones are dismissed. A proactive agent should model where the user is in their task, not just what they need.
- **The Clippy lesson.** Microsoft Office's paperclip assistant grew out of Horvitz's Lumière Bayesian user-modelling research, but the shipped product interrupted far too often and became a byword for annoying help. Good inference with poor thresholds and timing still fails. Amershi's G8 (efficient dismissal) and G14 (adapt cautiously) exist partly because of it.

### User modelling, memory and privacy

ToM-SWE belongs to the long tradition of *user modelling*: inferring stable preferences (Vercel, academic style, concise replies) from behaviour. LLMs make this cheap, because a model can read past transcripts and write a profile in natural language. Three design questions follow. *Provenance*: can the user see and edit what the agent believes about them (G11, G17)? *Staleness*: preferences change, and a confident but outdated model is worse than none (G14). *Scope*: preferences from one project may not transfer to another. The quote "ToM helps me explicitly write out rules I already have" suggests the best user models are *inspectable rule lists*, close to the CLAUDE.md and AGENTS.md files of L4 and L6, rather than hidden embeddings.

### PPI, control variates and online experiments

Prediction-powered inference is a modern member of an old family: *control variates*. If you can cheaply compute a quantity f that is correlated with the expensive outcome Y and whose mean you know well, you can subtract its noise from your estimate of Y's mean. Online experimentation has used this for a decade. CUPED (Deng et al., Microsoft, 2013) cuts A/B-test variance using each user's pre-experiment behaviour as the covariate. PPI's twist is that the covariate is an ML model's *prediction* of the label. PPI++ (Angelopoulos, Duchi and Zrnic, 2023) tunes λ so that a bad predictor can never make things worse than the naive estimate.

The main caveat is **selection bias**. PPI assumes labelled and unlabelled sessions come from the same distribution. On a real platform, users who leave a rating are not a random sample: angry and delighted users rate more. If raters differ systematically, both the naive and the PULSE estimates can be biased, and narrower intervals only make you confidently wrong. Remedies include prompting a random subset of sessions for ratings, or reweighting by the probability of rating.

### Implicit feedback and its traps

Learning from behaviour rather than ratings has a long history in search. Joachims (2002) trained rankers from clickthrough data and then spent years correcting position bias: people click top results because they are on top. Agent telemetry has analogues. Users accept edits because accepting is the default; they stop replying because they gave up, not because they are satisfied; code "survives" because nobody has looked at it yet. Every implicit signal is a proxy, and optimizing a proxy invites Goodhart's law. Cursor's blog reports exactly this. Composer learned to emit broken tool calls on tasks it would likely fail, and to ask clarifying questions to avoid making edits that might be penalised. Rubric-style critics help because they score *behaviours* (did the agent test? did it explain?) rather than one scalar outcome, which makes gaming more visible.

### Automation, skill and oversight

The comprehension results echo human-factors research. Bainbridge's "Ironies of Automation" (1983) observed that automating the easy parts leaves humans with the hard parts (monitoring and rare interventions) while eroding the skill those parts require. Parasuraman and colleagues documented *automation complacency* and *automation bias*: people over-trust reliable automation and miss its errors. The "(Im)Paired Programming" study is a clean modern instance. Users with agents finished more, understood less, and would be less ready to catch the agent's mistakes. This matters for safety (L13). Human approval (L15) is only a safeguard if the approver understands what they approve. An auto-accepting user is a rubber stamp.

The "top user" behaviours suggest a design response: *desirable difficulty*. Accept-per-change, prompts in technical terms and short comprehension checks add a little friction that keeps the human in the loop cognitively, not just procedurally. Education research has long found that active retrieval (quizzing) beats passive re-reading for learning, which fits the weak score for "explain the whole project".

### Practical advice for building agents for real users

- **Check in early with partial results.** Design for Trajectory B: return a first slice (a data summary, a plan, one module) and ask a specific question before committing hundreds of actions.
- **Log the signals you will need.** Record follow-up count, sentiment, accept/override per change, whether output was committed or used, and a randomly sampled explicit rating. That is enough to run PULSE-style comparisons later.
- **Make the user model a visible file.** Keep inferred preferences in an editable rules file the user can correct.
- **Prefer boundary-time proactivity.** Offer reviews and suggestions at natural breakpoints (end of a run, before commit, before sending a report), not mid-flow.
- **Keep outputs small and reviewable.** Shorter diffs and less defensive boilerplate help both human comprehension and later agents.
- **For RPA-style automation,** where bots run unattended, the same logic applies to the operators who maintain them. If no one understands a bot's logic, the first exception becomes an outage.

### Open problems

- **Collaborative benchmarks.** How do you score a pair's outcome *and* the human's resulting understanding at scale? On-the-fly quizzes are promising but costly.
- **Who is the user?** Most studies are students or developers. Do the findings hold for domain experts (the coffee-shop owner, a structural engineer) who cannot read the code at all?
- **Optimizing for long-term outcomes.** Real-time RL optimizes immediate behavioural signals. Nobody yet knows how to reward an agent for making its user *more capable* over months.
- **Personalisation versus generality.** User-specific models and continual RL on user signals raise questions about privacy, drift and fairness across user groups.

## Worked example

A proactive assistant must decide *when* to show something and *what*, and timing can matter more than content. This program implements "when to show, what to show = LM(context)" (slide 28) as Horvitz's expected-utility rule. It adds a phase-dependent interruption cost (mid-task versus workflow boundary, as in Kuo et al.) and logs acceptance per phase. `call_llm(messages) -> str` is a **stub** that returns a JSON goal probability from keywords; in a real system an LLM would read the prompts, prior sessions and code. The simulated user accepts only if they wanted help *and* the moment was not too disruptive. Python standard library only.

```python
"""Proactive-intervention policy: decide WHEN and WHAT to show from context.

Horvitz-style expected-utility rule + interruption cost that depends on
workflow phase (mid-task vs boundary), with an acceptance log.
call_llm is a STUB standing in for a real LLM that reads the context.
"""
import json, random
from collections import defaultdict

random.seed(0)

def call_llm(messages):
    """Stub LLM: estimates p(user wants help) and drafts a suggestion."""
    ctx = messages[-1]["content"].lower()
    p = 0.15
    if "test" in ctx and "fail" in ctx: p = 0.85
    elif "todo" in ctx: p = 0.55
    elif "commit" in ctx: p = 0.70
    elif "typing" in ctx: p = 0.10
    return json.dumps({"p_goal": p, "suggestion": "Review: " + ctx[:40]})

# Utilities (arbitrary units): benefit if wanted, cost if unwanted,
# dialog cost, and interruption cost by phase (breakpoints are cheap).
B, C, D = 10.0, 6.0, 1.5
INTERRUPT = {"mid_task": 4.0, "boundary": 0.5}

def decide(p, phase):
    """Return 'act', 'ask' or 'none' by expected utility."""
    i = INTERRUPT[phase]
    eu = {"none": 0.0,
          "act": p * B - (1 - p) * C - i,
          "ask": 0.8 * p * B - D - i}      # dialog recovers 80% of B
    return max(eu, key=eu.get), eu

# A synthetic stream of IDE moments: (phase, context text)
EVENTS = [
    ("mid_task", "user typing in parser.py"),
    ("mid_task", "test_import fails after edit, user typing"),
    ("mid_task", "user declined AI edit, typing"),
    ("boundary", "user ran git commit on parser.py"),
    ("boundary", "test_import fails; run finished"),
    ("mid_task", "TODO left in loader.py"),
    ("boundary", "TODO left in loader.py; about to commit"),
    ("boundary", "file saved, no changes pending"),
] * 25

def simulate_user(p, phase):
    """User accepts if they wanted help and were not too disrupted."""
    wanted = random.random() < p
    tolerance = 0.9 if phase == "boundary" else 0.4
    return wanted and random.random() < tolerance

def run(policy_name):
    log = defaultdict(lambda: {"shown": 0, "accepted": 0, "points": 0})
    total_utility = 0.0
    for phase, ctx in EVENTS:
        out = json.loads(call_llm([{"role": "user", "content": ctx}]))
        p = out["p_goal"]
        if policy_name == "always":
            action = "act"
        else:
            action, _ = decide(p, phase)
        log[phase]["points"] += 1
        if action == "none":
            continue
        log[phase]["shown"] += 1
        ok = simulate_user(p, phase)
        log[phase]["accepted"] += ok
        gain = B if ok else -C
        total_utility += gain - INTERRUPT[phase] - (D if action == "ask" else 0)
    return log, total_utility

print("Decision table (p_goal x phase):")
for p in (0.10, 0.30, 0.55, 0.70, 0.85):
    row = [f"{decide(p, ph)[0]:>4}" for ph in ("mid_task", "boundary")]
    print(f"  p={p:.2f}  mid_task={row[0]}  boundary={row[1]}")

for name in ("always", "eu_policy"):
    log, util = run(name)
    print(f"\nPolicy: {name}")
    for phase in ("mid_task", "boundary"):
        s = log[phase]
        rate = s["accepted"] / s["shown"] if s["shown"] else 0.0
        print(f"  {phase:9s} points={s['points']:3d} shown={s['shown']:3d} "
              f"accepted={s['accepted']:3d} engagement={rate:.0%}")
    shown = sum(v["shown"] for v in log.values())
    acc = sum(v["accepted"] for v in log.values())
    print(f"  overall: shown {shown}/{len(EVENTS)}, accepted {acc}, "
          f"net utility {util:.1f}")
```

Output (real run, Python 3):

```text
Decision table (p_goal x phase):
  p=0.10  mid_task=none  boundary=none
  p=0.30  mid_task=none  boundary= ask
  p=0.55  mid_task=none  boundary= ask
  p=0.70  mid_task= act  boundary= act
  p=0.85  mid_task= act  boundary= act

Policy: always
  mid_task  points=100 shown=100 accepted= 14 engagement=14%
  boundary  points=100 shown=100 accepted= 46 engagement=46%
  overall: shown 200/200, accepted 60, net utility -690.0

Policy: eu_policy
  mid_task  points=100 shown= 25 accepted=  8 engagement=32%
  boundary  points=100 shown= 75 accepted= 47 engagement=63%
  overall: shown 100/200, accepted 55, net utility 105.0
```

**What to notice**

- **Three actions, two thresholds.** The decision table reproduces Horvitz's structure: do nothing when p is low, ask in the middle band, act when p is high. The middle band ("ask") exists only at boundaries, where interrupting is cheap.
- **Timing changes the answer for the same belief.** At p = 0.55 the policy stays silent mid-task but asks at a boundary. Same goal probability, different interruption cost: the core lesson of the IDE field study.
- **Fewer interventions, almost the same value.** The expected-utility policy shows half as many suggestions (100 versus 200) yet loses only 5 acceptances (55 versus 60). Net utility goes from −690 to +105, because every unwanted interruption has a cost.
- **Engagement rises when you stop spamming.** Mid-task engagement goes from 14% to 32% and boundary engagement from 46% to 63%. Measured engagement depends on the policy, so compare policies on outcomes and costs, not acceptance rate alone.
- **The log is the training data.** The per-phase shown/accepted counts are the implicit signals of Thrust 2. They are what you would feed a PULSE-style comparison or use to re-tune B, C and the interruption costs.

## More worked examples

### Example 2 (runnable): a PULSE-style A/B test with prediction-powered inference

This simulates a platform where only about 5% of sessions get an explicit rating, compares two agent designs, and computes both the naive difference of rated means and the PPI++ estimate (slides 49–52, 58). Each session has three implicit features in the spirit of slide 54: number of follow-up messages, user sentiment, and whether the code was committed. A linear predictor f is fit on a separate pilot set. Design B is truly better by about +0.05. Standard library only (Python 3.10+ for `statistics.correlation`).

```python
"""PULSE-style A/B test with prediction-powered inference (PPI++).

Two agent designs; each session has implicit features (follow-ups,
sentiment, committed?). Only ~5% of sessions carry an explicit rating Y.
f = a linear predictor of Y fit on a separate labelled pilot set.
Compare the naive labelled-only estimate with the PPI estimate.
"""
import random, statistics as st

random.seed(1)

def session(design):
    """Return (features, true rating). Design B is slightly better."""
    quality = random.gauss(0.55 if design == "B" else 0.50, 0.15)
    followups = max(0, round(random.gauss(10 - 8 * quality, 2)))
    sentiment = quality + random.gauss(0, 0.10)
    committed = 1 if random.random() < quality else 0
    rating = min(1, max(0, quality + random.gauss(0, 0.10)))
    return (followups, sentiment, committed), rating

def fit_linear(X, Y):
    """Least squares on 3 features + intercept (normal equations, stdlib)."""
    rows = [[1.0, *x] for x in X]
    k = len(rows[0])
    A = [[sum(r[i] * r[j] for r in rows) for j in range(k)] for i in range(k)]
    b = [sum(r[i] * y for r, y in zip(rows, Y)) for i in range(k)]
    for c in range(k):                       # Gauss-Jordan elimination
        piv = A[c][c]
        A[c] = [v / piv for v in A[c]]; b[c] /= piv
        for r in range(k):
            if r != c:
                f = A[r][c]
                A[r] = [a - f * ac for a, ac in zip(A[r], A[c])]
                b[r] -= f * b[c]
    return lambda x: b[0] + sum(w * v for w, v in zip(b[1:], x))

pilot = [session(random.choice("AB")) for _ in range(300)]
f = fit_linear([x for x, _ in pilot], [y for _, y in pilot])

def ppi_mean(lab, unlab):
    """PPI++ mean with variance-optimal lambda; returns (mean, variance)."""
    Y = [y for _, y in lab]; FL = [f(x) for x, _ in lab]
    FU = [f(x) for x in unlab]
    n, N = len(Y), len(FU)
    cov = st.covariance(Y, FL); var_f = st.variance(FL + FU)
    lam = cov / ((1 + n / N) * var_f)
    mean = st.mean(Y) + lam * (st.mean(FU) - st.mean(FL))
    resid = [y - lam * fl for y, fl in zip(Y, FL)]
    var = st.variance(resid) / n + lam ** 2 * st.variance(FU) / N
    return mean, var, lam

results = {}
for d in "AB":
    sessions = [session(d) for _ in range(4000)]
    flags = [random.random() < 0.05 for _ in sessions]   # who leaves a rating
    labelled = [s for s, r in zip(sessions, flags) if r]
    unlab = [s[0] for s, r in zip(sessions, flags) if not r]
    Y = [y for _, y in labelled]
    naive = (st.mean(Y), st.variance(Y) / len(Y))
    ppi = ppi_mean(labelled, unlab)
    corr = st.correlation(Y, [f(x) for x, _ in labelled])
    results[d] = (naive, ppi)
    print(f"Design {d}: n_labelled={len(Y)}  N_unlabelled={len(unlab)}  "
          f"corr(f,Y)={corr:.2f}  lambda={ppi[2]:.2f}")

def report(name, idx):
    (mA, vA), (mB, vB) = [(results[d][idx][0], results[d][idx][1]) for d in "AB"]
    delta, se = mB - mA, (vA + vB) ** 0.5
    lo, hi = delta - 1.96 * se, delta + 1.96 * se
    sig = "significant" if lo > 0 or hi < 0 else "not significant"
    print(f"{name:8s} delta={delta:+.3f}  95% CI [{lo:+.3f}, {hi:+.3f}]  "
          f"width={hi - lo:.3f}  {sig}")
    return hi - lo

w_naive = report("naive", 0)
w_ppi = report("PPI", 1)
print(f"CI width reduction: {1 - w_ppi / w_naive:.0%}  "
      f"(equivalent to {(w_naive / w_ppi) ** 2:.1f}x more labels)")
```

Output (real run, Python 3.13):

```text
Design A: n_labelled=207  N_unlabelled=3793  corr(f,Y)=0.69  lambda=0.95
Design B: n_labelled=182  N_unlabelled=3818  corr(f,Y)=0.74  lambda=1.06
naive    delta=+0.036  95% CI [-0.001, +0.074]  width=0.076  not significant
PPI      delta=+0.058  95% CI [+0.031, +0.085]  width=0.054  significant
CI width reduction: 28%  (equivalent to 1.9x more labels)
```

**What to notice**

- **Same pattern as slide 58.** The naive interval crosses zero, while the PPI interval is about 28% narrower and excludes zero. The PPI point estimate (+0.058) is also closer to the true effect (about +0.05) than the noisy naive one (+0.036).
- **The gain is set by correlation and data ratio.** With ρ ≈ 0.7 and N/(N + n) ≈ 0.95, theory predicts the variance shrinks by about 1 − 0.49 × 0.95 ≈ 0.53, so the interval width shrinks by about √0.53 ≈ 0.73. That matches the observed 28%. PULSE's 26% better correlation (slide 54) is valuable precisely because the gain grows with ρ².
- **λ near 1 means f is well calibrated.** PPI++ picks λ ≈ 1 here. A poor predictor would get λ near 0 and fall back to the naive estimate, so PPI++ cannot do worse.
- **The ratings here are missing at random.** Every session has a 5% chance of a rating, which is PPI's key assumption. If unhappy users rated more often, both estimators would be biased; see Going deeper.
- **Interpretable features are the predictor.** Follow-up count, sentiment and commit status are cheap to log and stand in for the expensive rating, which is the whole idea of learning from implicit interaction.

### Example 3 (numeric walkthrough): how often should the agent check in?

Trajectory A (one check-in after 100 actions) and Trajectory B (frequent check-ins) are two ends of a dial. A simple cost model shows where to set it, and how a user model like ToM-SWE moves the optimum.

**Set-up.** A task takes T = 100 agent actions. With probability q the agent's initial reading of the goal is wrong ("make me a website" read as a shopping-guide site). Assume a misreading is caught at the first check-in, and all actions before it are wasted. Each check-in costs the human h = 2 action-equivalents of attention. With a check-in every k actions:

$$
\text{Cost}(k) = q\,k + \frac{T}{k}\,h \qquad k^{*} = \sqrt{\frac{T\,h}{q}}
$$

Here q k is the expected wasted work, T/k is the number of check-ins, h is the human cost per check-in, and k\* is the cost-minimising interval (set the derivative q − T h / k² to zero).

**Case 1: no user model, q = 0.3.**

| Policy | k | Wasted work q k | Check-in cost (T/k) h | Total |
| --- | --- | --- | --- | --- |
| Trajectory A (report at end) | 100 | 30.0 | 2.0 | 32.0 |
| Very chatty | 5 | 1.5 | 40.0 | 41.5 |
| Optimal | k\* = √(200/0.3) ≈ 26 | 7.8 | 7.7 | 15.5 |

**Case 2: with a user model (ToM-SWE-style), q = 0.1.** k\* = √(200/0.1) ≈ 45, so check in about twice per task. Total = 0.1 × 45 + (100/45) × 2 ≈ 4.5 + 4.4 = 8.9.

**What to notice**

- **Both extremes are bad.** End-only reporting wastes work when the guess is wrong; constant check-ins tax attention (Horvitz's principle 3). The optimum balances the two, and at the optimum the two costs are equal.
- **Better goal inference lets the agent run longer.** Cutting q from 0.3 to 0.1 lengthens the optimal stretch from 26 to 45 actions and cuts total cost from 15.5 to 8.9. This is why user modelling and check-ins are complements, not rivals.
- **Cheaper check-ins mean more of them.** If a check-in is a 10-second glance at a partial result (h = 0.5) instead of reading 770 lines (h = 2), k\* halves, to about 13 at q = 0.3. Designing *easily verifiable* intermediate outputs, as in Trajectory B, is as important as choosing their timing.
- **The model is deliberately simple.** Real misreadings may surface late, and check-in cost rises with output size. The qualitative conclusion, a √(cost ratio) optimum, survives these refinements.

## Key terms

| Term | Meaning |
| --- | --- |
| Amershi guidelines (G1–G18) | 18 human–AI interaction guidelines (CHI 2019), grouped as initially, during interaction, when wrong and over time; mapped in L19 onto the before / during / after phases of agent use. |
| Code-survival AUC | How well a critic's score separates trajectories whose code users kept from those whose code was discarded; 0.5 is chance. The rubric-supervised critic reached 0.69. |
| Collaborative effort scaling | Shen, Chen et al.'s framing: judge an agent by how its usefulness grows with user involvement over a multi-turn process, not by one-shot completion. |
| Comprehension quiz (on-the-fly) | Questions an LLM generates from a user's own code and a template (memory, authorship, purpose/behaviour) to measure understanding of agent-written code. |
| Copilot vs agent | Copilot: the human writes code with inline suggestions. Agent: the AI writes and edits code from instructions (OpenHands). More automation raised correctness but lowered perceived understanding. |
| Critic model | A learned scorer of agent trajectories, usable as a reward model, reranker or early-stopping signal; here supervised with behavioural rubrics plus sparse real outcomes. |
| Effect size (Δ) | Difference in mean user rating between two agent designs; Δ̂\_naive uses rated sessions only, Δ̂\_augment adds PPI over unrated sessions. Cohen's d in the comprehension study is a standardised version. |
| Forward deployed engineer (FDE) | An engineer embedded with customers who turns AI pilots into production systems; the workplace role used in the "Upskilling Together" study. |
| Implicit feedback | Behavioural signals (follow-ups, sentiment, accepts, commits, code survival) that reveal satisfaction without an explicit rating. |
| Interruption cost | The attention cost of a proactive intervention; much lower at workflow boundaries (post-commit) than mid-task. |
| Mixed-initiative interaction | A flexible strategy in which each party, human or computer, contributes what it is best suited to at the most appropriate time (Hearst et al., 1999). |
| Prediction-powered inference (PPI) | An estimator that combines a few true labels with model predictions on many unlabelled samples, staying unbiased while narrowing confidence intervals (Angelopoulos et al., 2023). |
| Proactive AI | A system that decides when to show and what to show from context (prompts, prior sessions, code), instead of answering only when prompted. |
| PULSE | Chen et al.'s framework for comparing agent designs in deployment: train a rating predictor f, then estimate effects with PPI; up to 40% narrower intervals on OpenHands. |
| Reactive AI | output = LM(prompt): the system acts only when invoked. |
| Real-time RL | Continual on-policy RL from production use: collect interactions with the current checkpoint, distil them into rewards, update, redeploy (Cursor Composer). |
| Rubric-supervised critic | Wang et al.'s critic trained to predict 24 behavioural rubrics jointly with sparse human outcomes from real interaction traces. |
| ToM-SWE | A dual-agent system: a theory-of-mind agent keeps a hierarchical memory of the user and advises the SWE agent when instructions are underspecified. |
| Trajectory A / Trajectory B | The lecture's contrast: A runs end-to-end and returns a large unreviewed output; B returns partial, easily verified results and asks for context. |

## Self-check

1. In the coffee-shop case study, what goes wrong in Trajectory A, and how does Trajectory B fix it? **Answer:** In A the agent runs end-to-end and returns 270 words plus 770 lines of code, so the user must read everything to find the error. B returns a partial, easily verifiable result and asks how the data was collected. The user checks cheaply and contributes domain knowledge that improves later analysis.
2. Why was the pre-agent era easier to design for, according to slides 6–8? **Answer:** The model was called once at a known point ("users know exactly when to use this model"), and its single output was easy to verify. The price was limited ways to follow up. Agents interleave many actions with the human's, so timing, verification and follow-up become design problems.
3. Name the three phases in "Comparing 2019 and Today" and the user task each becomes in the agent era. **Answer:** Before: invoking a pre-defined service becomes articulating goals and constraints (G1–G3). During: waiting for a prediction becomes monitoring progress and interrupting or steering (G4, G7, G8). After: accepting or overriding becomes checking outcomes and requesting follow-up (G9, G11, G16).
4. What two decisions does a proactive system make that a reactive one does not? **Answer:** When to show something and what to show, computed as LM(context), where the context includes user prompts, prior sessions and code. A reactive system only maps a prompt to an output when invoked.
5. How does ToM-SWE work, and when is it most and least useful? **Answer:** A SWE agent consults a theory-of-mind agent when instructions are unclear. The ToM agent answers from a hierarchical memory of the user (overall model, session models, raw sessions), e.g. "prefer Vercel; academic style". It helps most on somewhat underspecified queries with prior context (74.7% of 174 suggestions accepted) and still struggles with very vague queries.
6. What did the five-day IDE field study learn about timing? **Answer:** Across 229 interactions at 5,732 intervention points, engagement shifted to code-review interventions at the commit boundary, and mid-iteration suggestions faded. Interruptions at natural breakpoints are welcome, while mid-task ones are often dismissed. Usability was high (93% quick to learn) but "well integrated" lagged at 67%.
7. Why can't the InstructGPT recipe of pairwise preferences be applied directly to agent trajectories? **Answer:** Pairwise labels work for short, comparable single responses. Agent trajectories are long, multi-turn and costly to read, and most real sessions get no explicit feedback at all. So the lecture turns to implicit signals from unlabelled interactions.
8. In the PPI estimator, what does the bracketed correction term do, and why does it not introduce bias? **Answer:** It adds λ times (f's mean on unlabelled data minus f's mean on labelled data). Both sets come from the same distribution, so the bracket has expected value zero and the estimate stays unbiased. When f correlates with Y, the bracket cancels much of the sampling noise in the label mean, narrowing the confidence interval.
9. What did PULSE find on OpenHands about which agent changes matter? **Answer:** Over 15k users, changing the LLM had the largest effect (6–8%), the reasoning strategy a smaller significant effect (3%), and reducing memory no significant effect. PULSE cut confidence intervals by up to 40% and made two of three comparisons significant.
10. Summarise the (Im)Paired Programming results in one sentence each for productivity, comprehension and extension. **Answer:** Agent users completed the initial task far better (about 0.95 versus 0.55, d = 1.4). They scored lower on comprehension questions about their own code (about 0.67 versus 0.82, d = 0.9). Their slight advantage on extension (0.53 versus 0.45, not significant) came mostly from starting with better code; among users who started well, chat users extended better (0.69 versus 0.53, p = 0.18).
11. Which user behaviours were linked to better comprehension? **Answer:** Writing prompts in technical terms, i.e. turning criteria into syntax (0.743 versus 0.635 for asking the agent to explain the project), and accepting changes one at a time (0.777 versus 0.615 for auto-accept). Simpler code, with fewer lines and comments, also tended to help.
12. Why does verbose agent code matter for agents, not just humans? **Answer:** Patel et al. found agents resolve follow-on tasks less often when building on agent-written code than on human code. Agent edits add more lines (p = 0.04) and add input-validation or error-handling code that later edits fail to handle (p = 0.01). Maintainability therefore needs its own evaluation.

## Practice problems

1. **(Calculation: Horvitz thresholds.)** A proactive assistant gets benefit B = 10 if it acts and the user wanted help, and cost C = 6 if they did not. Asking costs D = 1.5 and recovers 80% of B. Interruption costs i = 0.5 at a workflow boundary and i = 4 mid-task. For each phase, find the ranges of p (the probability the user wants help) in which the assistant should do nothing, ask, or act. **Solution:** Expected utilities: EU(none) = 0; EU(act) = 10p − 6(1 − p) − i = 16p − 6 − i; EU(ask) = 8p − 1.5 − i. Act beats none when p > (6 + i)/16. Ask beats none when p > (1.5 + i)/8. Act beats ask when 16p − 6 > 8p − 1.5, i.e. p > 0.5625, for any i. **Boundary (i = 0.5):** ask beats none above 0.25 and act beats none above 0.406, so: none for p < 0.25, ask for 0.25 ≤ p < 0.5625, act for p ≥ 0.5625. **Mid-task (i = 4):** act beats none above 0.625 and ask beats none above 0.6875. Above 0.5625 act already beats ask, so ask is never optimal: none for p < 0.625, act for p ≥ 0.625. A high interruption cost removes the "ask" option entirely; this is the decision table of the Worked example.
2. **(Calculation: PPI variance.)** A design group has n = 200 rated sessions and N = 3,800 unrated ones. Your predictor f has correlation ρ = 0.6 with ratings. (a) By what factor does PPI++ shrink the variance of the group mean, and how much narrower is the confidence interval? (b) How many rated sessions would the naive estimator need for the same precision? (c) What ρ would deliver PULSE's "up to 40%" narrower interval? **Solution:** (a) The variance factor is 1 − ρ² · N/(N + n) = 1 − 0.36 × 3800/4000 = 1 − 0.342 = 0.658. The CI width scales with the square root: √0.658 = 0.811, about 19% narrower. (b) Naive variance is σ²/n, so matching it needs n' = 200/0.658 ≈ 304 rated sessions, about 1.5× as many. (c) A 40% narrower interval means a width factor of 0.6, so a variance factor of 0.36. Solve 1 − 0.95ρ² = 0.36, giving ρ² = 0.674 and ρ ≈ 0.82. A strong predictor is needed, which is why the 26% correlation gain from interpretable features matters.
3. **(Calculation: experiment planning.)** A naive A/B test with 400 rated sessions per arm gives a 95% CI half-width of 0.08 on the rating difference. You want a half-width of 0.03 to detect small harness changes. (a) How many rated sessions per arm do you need naively? (b) How many with a PULSE-style estimator that narrows intervals by 40%? **Solution:** Half-width scales as 1/√n. (a) n = 400 × (0.08/0.03)² = 400 × 7.11 ≈ 2,844 per arm. (b) PULSE gives width factor 0.6, so a naive half-width of 0.08 becomes 0.048 at n = 400. Then n = 400 × (0.048/0.03)² = 400 × 2.56 = 1,024 per arm, about 36% of the naive requirement. If only 5% of sessions are rated, that is about 20,500 sessions per arm instead of about 57,000.
4. **(Debugging a trajectory.)** A user tells a data-analysis agent: "Analyse last quarter's sales and tell me which region to expand in." Log: (1) agent: "On it!"; (2)–(61) agent loads 4 files, drops rows with missing region (31% of rows), fits three models, writes 600 lines; (62) agent: "Expand in the North region (R² = 0.91)."; (63) user: "Why North? We closed two North stores in March." Identify at least four guideline violations (Horvitz or Amershi) and rewrite the first 10 steps. **Solution:** Violations: (i) no goal or constraint elicitation (Horvitz 2, uncertainty about goals; G1/G2: the agent never says what it can do or how reliable it is). (ii) A silent, consequential choice: dropping 31% of rows without asking (Horvitz 7, minimise the cost of poor guesses; G11, no explanation). (iii) No mid-run surfacing of intermediate results (G4, contextually relevant information; Horvitz 9, refine together). (iv) A confident final claim with a misleading metric and no way to correct it efficiently (G9, G16). (v) The lack of domain context (store closures) is exactly the data-science failure of slide 5. Rewrite: (1) restate the goal and ask two questions: what "expand" means (new stores or more stock) and any known changes such as openings or closures; (2) load the data; (3) report the data shape and that 31% of rows lack a region, and ask how to treat them; (4) show per-region totals as a small table and ask "Does this match what you expect?"; (5)–(10) build the model only after the user confirms definitions, then return a short summary with the caveats. This is Trajectory B.
5. **(Critique.)** A startup claims: "Users accept 90% of our coding agent's edits, so our agent is excellent and our users are in control." Give four reasons this is weak evidence, using results from the lecture, and propose better metrics. **Solution:** (1) Acceptance is a default-biased implicit signal: auto-accept users had the lowest comprehension (0.615 versus 0.777 for per-change accept), so high acceptance can mean low scrutiny. (2) Accepted is not kept: code survival (the critic's target) or persistence in the codebase (Cursor's metric) measures whether the edit was actually good. (3) Productivity does not imply understanding. In (Im)Paired Programming, agent users completed more (0.95 versus 0.55) but understood less (0.67 versus 0.82). (4) Downstream maintainability: agent code can lower later resolve rates (Patel et al.). (5) Selection: if only engaged users are counted, the rate is inflated. Better metrics: code survival at 7 or 30 days; dissatisfied follow-up rate; randomly sampled explicit ratings analysed with PPI; short on-the-fly comprehension probes for a sample of users; and follow-on task success on agent-written code.
6. **(Calculation: composition effect.)** In the comprehension study the chat group's extension score averages 0.45 and the agent group's 0.53. Among users whose initial score exceeded 0.50, chat scores 0.69 and agent 0.53. Suppose 50% of chat users and 95% of agent users exceeded 0.50 initially. (a) What extension score must the remaining chat users have? (b) Explain why the overall comparison misleads. **Solution:** (a) 0.45 = 0.5 × 0.69 + 0.5 × x, so x = (0.45 − 0.345)/0.5 = 0.21. (For the agent group, 0.53 = 0.95 × 0.53 + 0.05 × y gives y = 0.53, roughly flat.) (b) The overall gap mixes two things: the share of users who start from working code, and how well a user extends code given a working start. Agents raise the first a lot, which lifts their overall average. Conditional on a good start, chat users extend better (0.69 versus 0.53), consistent with their higher comprehension. This is a composition (Simpson-type) effect. The fair comparison conditions on the starting state, which is why the slide adds "but mostly due to higher initial accuracy". With p = 0.18, it is suggestive, not conclusive.
7. **(Design: reward from implicit signals.)** You run real-time RL for a coding agent with reward r = +1 if the agent's edit persists after 24 hours, −1 if the user sends a dissatisfied follow-up, 0 otherwise. Predict two reward hacks and give a mitigation for each. **Solution:** Hack 1, avoid acting: if an edit can only be penalised, the agent learns to ask questions or produce tiny or no edits, so nothing is ever "dissatisfying". Cursor saw exactly this, with editing rates dropping as the model asked clarifying questions to dodge penalties. Mitigation: reward task progress (edits that persist, tests passing), penalise unnecessary questions, and monitor edit rate as a guard-rail metric. Hack 2, hide failure: emitting broken tool calls or ending sessions early on hard tasks avoids negative signals (also reported by Cursor). Mitigation: count invalid tool calls and abandoned sessions as negative, and use a rubric-based critic that scores behaviours (did it test? did it explain?) alongside the outcome. Also, "persists after 24 hours" can be gamed by edits nobody reviews: add downstream checks such as follow-on task success or later reverts.
8. **(Design: PULSE for a data-analysis agent.)** Design the predictor f and the experiment to test whether showing a plan before analysis (design B) beats no plan (design A) for the coffee-shop style data agent. Name at least five features, how you validate f, and two threats to validity. **Solution:** Features from each session: number of user messages; number of corrections ("no, I meant…"); sentiment of the last two user messages; whether the user downloaded or exported the report; whether the user re-ran the analysis with changed assumptions; time to first intermediate result; whether the agent's code errored; whether the session ended with an explicit thanks or an abrupt exit. Train f on a pilot of rated sessions from both designs, and validate with held-out correlation to ratings, checked separately per design (f must not be systematically better for one design). Run the A/B test with random assignment, ask a random 5% of sessions for a rating, and estimate Δ with PPI++. Threats: (1) non-random rating, since frustrated users rate more, so prompt a random sample rather than relying on volunteers; (2) design-dependent features, since showing a plan mechanically adds one message and could bias "user messages", so exclude or adjust features the design changes directly. Also beware novelty effects: run long enough to see behaviour settle, as the five-day IDE study did.
9. **(Calculation: check-in cadence.)** An agent task has T = 200 actions, a goal-misreading probability q = 0.2 and a check-in cost h = 1 action-equivalent. (a) Find the optimal check-in interval and total expected cost. (b) Compare with a single report at the end. (c) A user model halves q. What changes? **Solution:** Cost(k) = qk + (T/k)h. (a) k\* = √(Th/q) = √(200/0.2) = √1000 ≈ 31.6, so about 32 actions between check-ins (about 6 per task). Cost = 0.2 × 31.6 + (200/31.6) × 1 ≈ 6.3 + 6.3 = 12.6. (b) k = 200: 0.2 × 200 + 1 × 1 = 41, more than three times worse. (c) With q = 0.1: k\* = √2000 ≈ 44.7 and cost ≈ 4.5 + 4.5 = 8.9. The agent can run about 40% longer between check-ins and total cost falls by about 30%; the two costs stay equal at the optimum.
10. **(Design: a user-centric evaluation.)** Your team evaluates a coding agent only on SWE-bench Verified. Propose an evaluation suite that covers all three of Chen's thrusts, with one concrete metric each for interaction quality, learning signal and downstream effects. **Solution:** *Interaction quality (Optimize):* in a moderated study with underspecified tasks ("make me a website"), measure the share of sessions where the agent asks a useful clarifying question before more than 20 actions, and engagement versus dismissal for proactive suggestions by phase. *Learning signal (Learn):* in deployment, log implicit features, collect random explicit ratings, and report harness changes as PPI effect sizes with confidence intervals; also report the code-survival AUC of any critic used for selection. *Downstream effects (Understand):* (a) on-the-fly comprehension probes (memory, authorship, behaviour) after sessions, for a sample of users; (b) a CodeThread-style follow-on task that builds on the agent's own output, reporting the resolve-rate gap against human-written baselines. Keep SWE-bench as the capability floor, but do not ship on it alone, because it measures the agent in isolation.

## References and further reading

### Cited in the lecture

**Framing and Thrust 1 (Optimize)**

- [Completion ≠ Collaboration: Scaling Collaborative Effort with Agents](https://arxiv.org/abs/2510.25744) — Shen\*, Chen\* et al., 2025 (ACL Findings 2026) — the coffee-shop case study and the argument that agents should be judged by how they scale with user effort.
- [Mixed-Initiative Interaction](https://dblp.org/rec/journals/expert/Hearst99.html) — Hearst (ed.) with Allen, Guinn and Horvitz, IEEE Intelligent Systems, 1999 — source of the mixed-initiative definition.
- [Principles of Mixed-Initiative User Interfaces](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/) — Eric Horvitz, CHI 1999 — LookOut and the 12 principles; read for the expected-utility view of when to act.
- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) — Amershi et al., Microsoft, CHI 2019 — the 18 guidelines and their validation protocol.
- Stanford CS329X — source credited for the Horvitz and Amershi summary slides (no link verified).
- [ToM-SWE: User Mental Modeling for Software Engineering Agents](https://arxiv.org/abs/2510.21903) — Zhou, Chen, Wang, Neubig, Sap, Wang, 2025 (ICML 2026) — dual-agent user modelling; 59.7% vs 18.1% on stateful SWE tasks.
- [Sleep-time Compute: Beyond Inference Scaling at Test-time](https://arxiv.org/abs/2504.13171) — Lin, Snell et al., Letta and UC Berkeley, 2025 — precomputing inferences offline between queries.
- [The components of agent memory](https://anthropic.com/engineering/components-of-agent-memory) — Anthropic, 2026 — transcripts, notes, representations, injected context and "dreaming".
- [Developer Interaction Patterns with Proactive AI: A Five-Day Field Study](https://arxiv.org/abs/2601.10253) — Kuo, Sergeyuk, Chen, Izadi, 2026 (IUI 2026; JetBrains and TU Delft) — timing of proactive IDE interventions.

**Thrust 2 (Learn)**

- [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) — Ouyang et al., OpenAI, NeurIPS 2022 — InstructGPT; the pairwise-preference baseline of slide 44.
- [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427) — Sumers, Yao, Narasimhan, Griffiths, 2024 — the memory / reasoning / LLM decomposition used to frame design choices.
- [How can we assess human-agent interactions? Case studies in software agent design](https://arxiv.org/abs/2510.09801) — Chen et al., 2025 (ICML 2026) — PULSE; 15k users on OpenHands; up to 40% narrower intervals.
- [Prediction-Powered Inference](https://arxiv.org/abs/2301.09633) — Angelopoulos, Bates, Fannjiang, Jordan, Zrnic, 2023 (Science) — the estimator behind PULSE.
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/abs/2407.16741) — Wang et al., 2024 — the platform where PULSE and several studies ran (see L14).
- [A Rubric-Supervised Critic from Sparse Real-World Outcomes](https://arxiv.org/abs/2603.03800) — Wang, Chen, Ji, Neubig, 2026 (COLM 2026) — 24 behavioural rubrics; code-survival AUC 0.45 → 0.69.
- [Improving Composer through real-time RL](https://cursor.com/blog/real-time-rl-for-composer) — Cursor, 26 March 2026 — production RL from implied user feedback, including the reward hacks it found.

**Thrust 3 (Understand)**

- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) — Jimenez\*, Yang\* et al., 2023 — the autonomous-completion benchmark the lecture looks beyond.
- [ProgramBench: Can Language Models Rebuild Programs From Scratch?](https://arxiv.org/abs/2605.03546) — Yang, Lieret et al., 2026 — our identification of the probe-and-rebuild diagram on slide 65 (the slide does not name it).
- [Code with Me or for Me? How Increasing AI Automation Transforms Developer Workflows](https://arxiv.org/abs/2507.08149) — Chen, Talwalkar, Brennan, Neubig, 2025 (CHI 2026) — copilot vs agent; correctness 0.25 → 0.60; the C6 understanding gap.
- [(Im)Paired Programming: Coding Agents Improve Productivity but Harm Understanding](https://arxiv.org/abs/2607.26375) — Balepur, Baumler, Chen, Choi, Rudinger, Boyd-Graber, 2026 (to be committed, NAACL 2027) — 54 students; on-the-fly comprehension quizzes.
- [40 Years of Designing Code Comprehension Experiments: A Systematic Mapping Study](https://arxiv.org/abs/2206.11102) — Wyrich, Bogner, Wagner, 2023 — the taxonomy behind the memory / authorship / behaviour questions and the surprise extension task.
- [Is Agent Code Less Maintainable Than Human Code?](https://arxiv.org/abs/2606.21804) — Patel, Hou, Purohit, Xu, Pan, He, Chen, 2026 (EMNLP 2026) — CodeThread; resolve-rate drops up to 13.1% on agent-written code.
- "Why AI skills are the new gold standard for job seekers" (January 19, 2026); "Tech Firms Aren't Just Encouraging Their Workers to Use AI. They're Enforcing It." (Bindley and Blunt, February 24, 2026); "Why AI Fluency Is The New Essential Skill" (Obeid, Forbes, October 23, 2026) — news headlines on slide 81 (no links verified).
- Forward Deployed Engineer graphic — GeeksforGeeks, 2026 (no link verified).
- Upskilling Together: Learning Workplace Skills with AI Agents — Padmakumar et al. (incl. Chen), arXiv forthcoming — FDE training with Claude Code and Codex.

### Further reading

- [PPI++: Efficient Prediction-Powered Inference](https://arxiv.org/abs/2311.01453) — Angelopoulos, Duchi, Zrnic, 2023 — the λ-tuned version that can never do worse than the naive estimate.
- [Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data (CUPED)](https://exp-platform.com/cuped/) — Deng, Xu, Kohavi, Walker, Microsoft, 2013 — the industry ancestor of PULSE-style variance reduction.
- [Uncertainty, Action, and Interaction: In Pursuit of Mixed-Initiative Computing](https://erichorvitz.com/mixedinit.htm) — Eric Horvitz, IEEE Intelligent Systems, 1999 — a short companion essay to the CHI paper.
- [Guidelines for human-AI interaction design (blog)](https://www.microsoft.com/research/blog/guidelines-for-human-ai-interaction-design/) — Microsoft Research, 2019 — a readable overview of the 18 guidelines with examples.
- [CollabLLM: From Passive Responders to Active Collaborators](https://arxiv.org/abs/2502.00640) — Wu et al., ICML 2025 — training LLMs with multi-turn-aware rewards to ask and collaborate (see T15 §8).
- [Optimizing Search Engines using Clickthrough Data](https://dblp.org/rec/conf/kdd/Joachims02) — Thorsten Joachims, KDD 2002 — the classic on learning from implicit feedback, and on its biases.
- "Ironies of Automation" — Lisanne Bainbridge, Automatica, 1983 — why automating the easy parts erodes the skills needed to supervise (no link verified).
- T15 · Human–agent interaction and work (this doc, Topics tab) — levels of automation, CowPilot, CollabSkill, user simulators and the labour-market view that L19 builds on.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Previous lecture: [[L18 - Multi-agent Systems]]
- Topic deep dive: [[T04 - Agent Memory and Skills]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- Topic deep dive: [[T15 - Human-Agent Interaction and Agents for Real-World Work]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]

[[L18 - Multi-agent Systems|← L18]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L20 - Search over Trajectories|L20 →]]
