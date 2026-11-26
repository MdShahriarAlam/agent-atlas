---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, deep-research, rag, retrieval]
aliases: ["CMU L10", "11-768 Lecture 10", "Deep Research Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-10-deep-research-agents.pdf"
---

# Lecture 10 · Deep Research Agents

[[L09 - RL Foundations|← L9]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L11 - Advanced RL|L11 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 10 · Akari Asai
> **Source:** lecture slides `lecture-10-deep-research-agents.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]], [[T05 - Planning, Task Decomposition and Multi-Agent Systems]], [[T08 - Deep Research Agents - Search, Retrieval and Synthesis]], [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T12 - Rewards, Verifiers and Reward Hacking]], [[T15 - Human-Agent Interaction and Agents for Real-World Work]]

Akari Asai · 11-768 AI Agents, Fall 2026 · source slides: lecture-10-deep-research-agents.pdf (124 slides)

## Overview

Deep research agents answer hard, open-ended questions by iterating plan → search → read → reflect many times and then writing a long, cited synthesis, and building them well requires three things done together: benchmarks that measure synthesis and evidence support (not just answer matching), training signals richer than exact-match correctness, and retrievers tuned to the agent's in-the-moment information need.

This guest lecture by Akari Asai (CMU LTI; co-author of OpenScholar, DR Tulu and AgentIR) is organised in three parts after a motivating example: **Evaluation** (benchmarks, rubrics, citation support), **Modeling** (how agents learn to search, reason and synthesise), and **Retrieval** (finding evidence for the agent's next step).

**After this lecture you can…**

- Explain why classical QA benchmarks such as Natural Questions fail to test deep research, along four axes: search complexity, domain expertise, answer quality and evidence support.
- Describe how BrowseComp, BrowseComp-Plus, FinSearchComp, MedBrowseComp, ScholarQABench, ResearchQA and DeepResearch Bench each close one of those gaps, and compute a weighted rubric score or a citation-accuracy number by hand.
- Lay out the standard training recipe for open deep research agents (agentic mid-training → SFT on filtered teacher trajectories → RL) and say where the tasks and trajectories come from (knowledge-graph question synthesis).
- Explain RL with verifiable rewards and GRPO for search agents, why exact-match rewards break down for long-form reports, and how DR Tulu's evolving rubrics (RLER) provide an on-policy reward instead.
- Explain dense (dual-encoder) retrieval and contrastive training, and why AgentIR feeds the agent's current reasoning to the retriever and trains it on DR-Synth labels for intermediate searches.

**Prerequisites:** the agent loop and tool calling (L1–L2), basic retrieval-augmented generation, and the policy-gradient/GRPO ideas from L9.

**Connections to the course:** this lecture is a case study that pulls together most earlier topics. The inference loop is the ReAct-style tool loop of L1–L2 with `search` and `browse` as tools. Long trajectories (up to 128 tool calls, 128K context) put pressure on the long-context and memory techniques of L3–L4, and the plan/reflect steps are the planning ideas of L5. The training recipe is a direct application of SFT (L8) and RL foundations (L9); the asynchronous-rollout and scheduling details are deferred to the advanced RL / RL systems lecture (L11). Like coding (L6) and computer-use agents (L7), deep research agents are judged on long-horizon, tool-grounded outcomes, but here the output is prose whose quality is hard to verify.

## Concept map

![[cmu-ai-agents-L10-concept-map.png]]
*Concept map: Deep research agent · inference loop with its evaluation, training and retrieval layers*

Read the top row left to right as one inference loop that repeats until the agent answers; the lower boxes show how the report is scored, how those scores train the policy, and how the retriever is trained to serve the loop.

## Detailed notes

The notes follow the lecture's four parts: what deep research is, how to evaluate it, how to train agents for it, and how to build retrievers that serve it.

### 1. What is a deep research agent?

A deep research agent is an LLM agent that answers a question whose answer cannot be found in one place. It must plan, issue many searches, read and compare sources, notice gaps, search again, and finally write a synthesis with citations. The contrast is easiest to see with two questions from the slides.

**A simple question needs one search.** "What is Akari Asai's office number at CMU?" has a single authoritative source (the CMU LTI faculty profile). One search retrieves it and the LM copies the answer: GHC 5507. Classic retrieval-augmented generation (RAG) handles this well.

**Complex research needs many searches.** "Can AI agents synthesize scientific literature as well as human experts?" has no single page with the answer. The slides walk through an agent's trajectory:

1. **Plan.** Separate strong benchmark results from direct comparisons with human experts. Find studies of literature synthesis, check how experts and agents were compared, then compare tasks and limits before concluding.
2. **Search.** Query "AI agent literature synthesis human expert evaluation". Result A is a research benchmark that scores answers against other AI systems. Result B is an expert evaluation that compares agent answers with human-written answers.
3. **Reflect.** The two results use different comparisons. A higher benchmark score does not answer a question about human experts. Which tasks and domains were tested?
4. **Search again** with a refined query about tasks, domains and evaluation protocol.
5. **Answer.** "Promising on tested tasks; broader parity with experts remains unproven." On evaluated literature-synthesis questions, experts preferred OpenScholar answers over expert-written ones, and its citation accuracy was comparable to human experts \[1\]. DR Tulu reports strong results across four long-form research benchmarks, but comparisons with other AI agents do not establish parity with experts \[2\].

The two cited works are the speaker's own. **OpenScholar** (Asai et al., arXiv 2024; Nature 2026) is a retrieval-augmented LM over 45 million open-access papers. On its ScholarQABench benchmark, OpenScholar-8B beat GPT-4o by 5% and PaperQA2 by 7% in correctness. GPT-4o hallucinated citations 78–90% of the time, while OpenScholar reached citation accuracy on par with human experts. In human evaluation, experts preferred OpenScholar-8B and OpenScholar-GPT4o answers over expert-written ones 51% and 70% of the time, versus 32% for plain GPT-4o. **DR Tulu** (Shao, Asai et al., ICML 2026) is an 8B open model trained end-to-end for long-form deep research with RL. It beats the open Tongyi DeepResearch agent by 15.6% on average over four long-form benchmarks and matches OpenAI Deep Research (+0.7%) at roughly 1000× lower cost per query.

*Why it matters:* the worked answer shows the qualities a good deep research output needs. It is correct, it covers the relevant evidence, it qualifies its claims, and each claim is backed by a citation that actually supports it. The rest of the lecture is about measuring and training for exactly these qualities.

**Lecture roadmap.** Evaluation (benchmarks, rubrics, citation support) → Modeling (learning to search, reason and synthesise) → Retrieval (finding evidence for the agent's next step).

### 2. Benchmarks: from classical QA to deep research

**Why classical QA falls short.** The slides use an official Natural Questions (NQ) example: "who wrote the score for the force awakens" → "John Williams", answered from a 2018 Wikipedia revision. The lecture flags four limitations:

| Axis | Limitation of classical QA | What deep research needs |
| --- | --- | --- |
| Search complexity | Simple lookup; the fact may be memorised or found in one search | Hard-to-find answers that need many searches |
| Domain expertise | General-domain web questions | Expert knowledge (medicine, finance, science) guiding the search |
| Answer quality | Short-form answer judged by string match | Long-form, multi-document synthesis |
| Evidence support | A correct answer says nothing about evidence use | Citations that actually support each claim |

The lecture then fills in each cell of this 2×2 grid with benchmarks.

#### 2.1 Search complexity: BrowseComp and BrowseComp-Plus

**BrowseComp** (Wei et al., OpenAI, arXiv 2025) contains 1,266 human-written questions designed to need many searches. The construction procedure is "inverted":

1. Start with the answer: a known person, event or artifact.
2. Write a complex question that hides the name and combines several factual clues.
3. Verify difficulty with models: LMs with search should fail, and five Google searches should not surface the answer.
4. Verify with humans: the question should still be hard after 10 minutes (checked on a subset).

The slide example asks for a fictional character who occasionally breaks the fourth wall, has a backstory involving help from selfless ascetics, is known for humour, and had a TV show airing between the 1960s and 1980s with fewer than 50 episodes. The reference answer is **Plastic Man**. Each clue alone matches thousands of candidates; only the intersection is unique. Answers are short, so grading is easy, but *finding* them is hard. This "hard to find, easy to verify" asymmetry is the core design idea.

**BrowseComp results** (accuracy, % matching the reference):

| System | Accuracy |
| --- | --- |
| GPT-4o | 0.6 |
| GPT-4o + browsing | 1.9 |
| GPT-4.5 | 0.9 |
| OpenAI o1 (medium) | 9.9 |
| OpenAI Deep Research (trained for BrowseComp-style tasks) | 51.5 |
| Human trainers (reference match) | 25.3 |

Humans attempted 1,255 of the 1,266 questions. Two lessons stand out. Adding browsing to a non-agentic model barely helps (0.6 → 1.9), so the gain comes from persistent, multi-step search behaviour rather than tool access alone. And an agent trained for this style of task more than doubles the human reference-match rate.

**More room to search improves accuracy.** A plot from the Tongyi DeepResearch Technical Report (Alibaba, arXiv 2025) shows BrowseComp accuracy against the context-length budget. Accuracy is near 0% at 8K tokens, about 4% at 16K, about 21% at 32K, about 39% at 64K and about 43% at 128K. More context allows longer interaction histories, so the agent can make more tool calls before running out of room. Tongyi's training data reflects this: more than 20% of SFT trajectories use over 10 tool calls, and evaluation allows up to 128 tool calls per task.

*Common pitfall:* comparing agents on the live web conflates the agent with the search engine, the date and the network. Results drift as pages change.

**BrowseComp-Plus** (Chen et al., ACL 2026) freezes the corpus to fix this. For each BrowseComp question–answer pair, o3 gathers candidate evidence pages; humans then mark the supporting spans, check that every clue is covered, and mark the answer documents. Hard negatives — related pages that miss at least one clue — are added. The result is a fixed benchmark of 830 questions over 100,195 documents. With a fixed corpus you can swap the retriever while holding the agent constant (or vice versa), which enables the controlled retrieval experiments in Part 4.

#### 2.2 Domain expertise: FinSearchComp, MedBrowseComp and scholarly search

BrowseComp questions are hard but general-domain; solving them needs persistence more than expertise. A second family of benchmarks asks experts to write the questions, so domain knowledge must guide what to search for and how to interpret results.

**FinSearchComp** (ICLR 2026) focuses on complex historical investigation in finance. Its pipeline has three stages:

1. **Experts write** questions starting from real work scenarios or verified financial tables.
2. **Establish answers** by retrieving reliable data, calculating, and cross-checking.
3. **Independent review**: other experts solve each question and disagreements are resolved.

A paraphrased example: "How did Johnson & Johnson's international share of revenue change year over year during 2022–2024?" Answering requires locating the right filings, knowing which line items define "international", computing shares for three years and comparing them.

Other domain benchmarks named on the slides:

| Benchmark | Domain | What it tests |
| --- | --- | --- |
| MedBrowseComp (GenAI4Health Workshop, NeurIPS 2025) | Medicine | Linking trials, drugs and regulatory facts across sources |
| FinSearchComp (ICLR 2026) | Finance | Investigating facts and numbers across financial sources |
| ScholarSearch (arXiv 2025) | Academic search | Finding scholarly information that needs literature search |
| AutoResearchBench (arXiv 2026) | Scientific literature discovery | Finding one specific paper, or all papers matching a description |

#### 2.3 Answer quality: rubrics for long-form answers

Short-answer benchmarks cannot judge synthesis. For an open question there are **several valid answers**. The slide shows a reference summary ("Experts preferred OpenScholar in one study. Parity across domains is unproven.") and another valid summary with different wording. It also shows an answer that is **similar but incorrect**: "...Parity across domains is *proven*." One word flips the meaning, yet surface similarity to the gold answer stays high.

**Similarity metrics misrank answers.** Xu et al., "A Critical Evaluation of Evaluations for Long-form Question Answering" (ACL 2023), tested whether a metric picks the answer experts prefer, over 109 expert pairwise comparisons with reference answers. Chance is 50%. ROUGE reached 58%, BERTScore 57% and BLEURT 62% preference accuracy — barely above chance. Reference-similarity metrics are therefore not a reliable way to rank long-form research answers.

**ScholarQABench: expert rubrics.** OpenScholar's benchmark (2,967 expert-written queries and 208 long-form expert answers across computer science, physics, neuroscience and biomedicine) evaluates answers against per-question rubrics written by experts. Each rubric item is a checkable criterion with a weight, and the judge marks each item satisfied (1) or not (0). The final score is the weighted fraction satisfied:

$$
S_c = \frac{\sum_i w_i \, b_i}{\sum_i w_i}
$$

Here w\_i is the weight of rubric item i and b\_i ∈ {0, 1} says whether the answer satisfies it. In the slide example the rubric has two items: "Reports a direct comparison with human experts" (weight 2) and "Qualifies the conclusion by task and domain" (weight 1). The candidate answer "OpenScholar wins 70% of expert comparisons \[1\]. This holds across all fields." satisfies the first item but not the second. Its score is (2×1 + 1×0)/3 = 0.67.

**Do LM rubric judgments agree with experts?** On 12 questions, 2 systems and 2 expert raters per answer, expert–LM agreement on rubric items was 79%, essentially equal to expert–expert agreement of 80%. Rubric items turn a fuzzy holistic judgment into many small, near-binary checks that an LM judge can make reliably.

**ResearchQA scales rubric creation with LMs.** ResearchQA (Li, Malaviya & Yatskar, UPenn, TACL 2026) mines queries and rubrics from survey papers: 21K questions across 75 fields with 160K rubric items. A survey section yields a research question, and an LM generates rubric items (up to 8 per query). An LM judge scores each item on a coverage scale (e.g., 0/4 "not at all covered", 1/4 "barely covered", 4/4 "completely covered"). In the slide example, a query mined from Zhou et al. (2024), "The Mystery of In-Context Learning", asks how term frequency in pre-training data influences few-shot numerical reasoning. One rubric item asks whether the response references the "performance gap" concept from Razeghi et al. (2022).

**Generated rubrics can encode the wrong target.** An expert audit of ResearchQA found that 15% of rubric items generated from the LM's parametric knowledge were vacuous, erroneous or unclear. Failure modes include a criterion that cites a nonexistent paper, one that merely restates the question, and one so vague that plausible errors pass. The lesson is to **evaluate the rubric before using it to evaluate answers**: ground criteria in sources, then audit relevance and verifiability. DeepResearch Bench II (arXiv 2026) follows this approach, building rubrics from expert-written reports with manual revision and expert review.

#### 2.4 Evidence support: checking the citations

A report can score well on a rubric while its citations do not back its claims. **DeepResearch Bench** (Du et al., ICLR 2026) adds a citation-checking framework called **FACT**:

1. **Extract** each (claim, cited URL) pair from the report.
2. **Read** the cited page.
3. **Judge** whether the page supports the claim.

In the slide example, "OpenScholar was compared with human answers \[1\]" is supported, because the paper reports expert comparisons on a sample of research questions. "OpenScholar matches experts in every field \[1\]" is not supported, because no test covered every field. Two metrics fall out: **citation accuracy** = supported pairs / all pairs = 1/2 = 50%, and **effective citations** = the count of supported pairs (here 1). Accuracy rewards precision; effective citations reward supplying a lot of well-supported evidence.

*Why it matters:* citation checks catch the most damaging failure of research agents — confident claims attached to real-looking sources that do not say what the agent claims.

**The completed grid.** Search complexity: BrowseComp / BrowseComp-Plus. Domain expertise: MedBrowseComp, FinSearchComp. Answer quality: ScholarQABench, ResearchQA (rubrics). Evidence support: DeepResearch Bench (citation checks).

### 3. Agent modeling: inference and the training recipe

#### 3.1 How a deep research agent runs

At inference time a deep research agent is a single LM generating one long sequence, interleaved with tool outputs. The slides build the context step by step (blue = model-generated text, grey = user input and tool output):

1. **Generate reasoning.** `<think> Find expert comparisons </think>`
2. **Generate a tool call.** `<tool> search("expert comparisons") </tool>`
3. **Execute the call.** The harness stops generation and runs the search tool with the generated query.
4. **Append the tool output.** Retrieved text ("\[1\] OpenScholar, \[2\] DR Tulu") becomes part of the context.
5. **Continue reasoning** with the retrieved text: `<think> Check the tested tasks </think>`, possibly followed by more tool calls.
6. **Generate an answer with citations.** `<answer> Promising on tested tasks [1,2] ... </answer>`

This is the ReAct-style loop from L1–L2, specialised to search. The special tags are how the harness parses the output. Everything — plan, queries, evidence, reflections — lives in one growing context, which is why the context budget in Section 2.1 limits how many searches an agent can make.

```python
# Minimal deep-research inference loop (illustrative; call_llm and search are stubs)
context = [system_prompt, user_question]
for step in range(MAX_TOOL_CALLS):          # e.g. 128 in Tongyi's evaluation
    out = call_llm(context, stop=["</tool>", "</answer>"])
    context.append(out)                      # model tokens: <think>..</think><tool>..
    if out.endswith("</answer>"):
        break
    query = parse_tool_call(out)             # e.g. search("expert comparisons")
    context.append(format_docs(search(query)))  # tool tokens (not trained on)
report = extract_answer(context)
```

#### 3.2 A three-stage training recipe

Prompting a general model with this loop works, but open agents that rival proprietary systems are trained for it. The Tongyi DeepResearch Technical Report (Alibaba, 2025) describes a recipe the lecture uses as a template: learn from teacher demonstrations, then from your own attempts.

| Stage | Goal | Training data | Objective |
| --- | --- | --- | --- |
| Agentic mid-training | Learn agent behaviour at scale | Inputs + answers, teacher trajectories, mixed with general data | Next-token prediction (continual pretraining) |
| Supervised fine-tuning (SFT) | Imitate successful demonstrations | Inputs + answers, filtered teacher trajectories | Next-token loss on model turns |
| Reinforcement learning (RL) | Learn from feedback on own attempts | Inputs + answers, the policy's own rollouts | Reward-weighted policy gradient (e.g., GRPO) |

The natural next question is where the tasks and trajectories come from, since hard multi-hop questions with verified answers are scarce.

#### 3.3 Data creation: questions from knowledge graphs

A **knowledge graph** stores facts as (subject, relation, object) triples: a node is an entity, and a labelled arrow is a relationship. The slide example is (Allen Newell, faculty member of, Carnegie Mellon). Extending the graph gives: Newell and Herbert Simon co-authored *Human Problem Solving* (1972); both received the 1975 Turing Award; Simon received the 1978 economics Nobel Prize.

WebSailor-V2 (Alibaba, ICLR 2026) turns such graphs into BrowseComp-style training questions:

1. Start from sourced facts and **sample a connected subgraph** around a target entity.
2. **Hide the target's name** and turn each relation into a clue.
3. Compose the clues into one question with a known answer.

From the Newell subgraph: "Which CMU researcher co-authored a book on human problem solving with a future economics Nobel laureate, and shared the Turing Award with that colleague three years before the Nobel Prize?" Known answer: **Allen Newell**. Because the question was built from the answer, it is automatically verifiable. Sampling larger or more obscure subgraphs makes questions harder, and random-walk expansion yields many of them cheaply. This is the same "inverted" construction as BrowseComp, automated.

#### 3.4 SFT: collect, filter, then imitate

With questions and known answers in hand, a strong teacher agent generates trajectories. WebDancer (NeurIPS 2025) and Tongyi both use **rejection sampling**:

1. Run the teacher on each question to collect trajectories.
2. **Filter**: keep only trajectories with a correct final answer, a valid format (well-formed tags and tool calls), and coherent reasoning. Drop, for example, "incorrect answer, valid format" and "correct answer, invalid format".
3. **Train with SFT** on the retained trajectories.

The filter matters because imitation copies whatever is in the data. A correct answer reached through a lucky guess or broken tool syntax teaches the wrong behaviour.

#### 3.5 Agentic mid-training

"Scaling Agents via Continual Pre-training" (Alibaba, ICLR 2026) adds a stage before SFT. It continues pretraining the base model with next-token prediction on a mix of agent trajectories and general pretraining data, producing an **agent-ready base model** called AgentFounder. The intuition: SFT has to teach a general model both a new behaviour (multi-step tool use) and a task, and a base already fluent in trajectories makes the SFT stage easier.

The controlled comparison holds the downstream SFT data ("SFT-B") fixed and changes only the initial base model (Pass@1, %):

| Benchmark | Qwen3 base + SFT | AgentFounder base + SFT |
| --- | --- | --- |
| BrowseComp-en | 28.6 | 39.9 |
| BrowseComp-zh | 35.6 | 43.3 |
| GAIA | 71.8 | 72.8 |

The gain is large on the search-heavy BrowseComp sets (+11.3 and +7.7 points) and small on GAIA (+1.0), which is a broader assistant benchmark.

#### 3.6 RL with verifiable rewards (RLVR)

SFT can only copy the teacher. RL lets the agent improve from its own attempts, including learning when to search again and when to stop. Search-R1 (COLM 2025) is the canonical setup for short-answer search tasks:

1. Take a question x (e.g., the CMU clue question) with a known answer.
2. The policy π\_θ searches and reasons, producing several trajectories y\_1, y\_2, y\_3.
3. **Verify the final answer** with exact match: r\_i = EM(a\_i, a\_gold). If the answers are "Herbert Simon", "Allen Newell", "Allen Newell", the rewards are 0, 1, 1.
4. Use the rewards to update the policy.

The reward is cheap, objective and hard to game, which is why short-answer BrowseComp-style data is so popular for training. (The CMU examples and rewards on the slides are illustrative, not from the paper.)

#### 3.7 GRPO: learn from better attempts

Group Relative Policy Optimization (GRPO, introduced in DeepSeekMath, 2024) is the RL algorithm used by Tongyi and DR Tulu. For one question it samples a group of G attempts and compares them with each other rather than with a learned value function. Attempts scoring above the group average get their probability raised; those below get it lowered. In the example, "Herbert Simon" (reward 0) is pushed down and both "Allen Newell" answers (reward 1) are pushed up.

$$
J(\theta) = \mathbb{E}\left[ \frac{1}{|y|}\sum_{t \in \text{model tokens}} \min\!\left( \rho_t \hat{A},\; \mathrm{clip}(\rho_t, 1-\epsilon, 1+\epsilon)\, \hat{A} \right) \right] - \beta\, D_{KL}\!\left(\pi_\theta \,\|\, \pi_{ref}\right)

\hat{A}_i = \frac{r_i - \mathrm{mean}(r_1,\dots,r_G)}{\mathrm{std}(r_1,\dots,r_G)}, \qquad \rho_t = \frac{\pi_\theta(y_t \mid x, y_{<t})}{\pi_{\theta_{old}}(y_t \mid x, y_{<t})}
$$

- Â is the **relative reward** (advantage): each attempt's reward compared within its group.
- ρ\_t is the probability ratio between the current policy and the policy that generated the rollout.
- clip(ρ, 1−ε, 1+ε) **limits the update size**, as in PPO, so one batch cannot move the policy too far.
- β D\_KL is a **KL penalty** that keeps the policy near a reference model (usually the SFT checkpoint).
- The sum runs over **model tokens only**. Tool outputs appear in the context but are masked out of the loss, because the model did not generate them and should not be trained to produce retrieved text.

*Common pitfall:* if all G attempts get the same reward (all right or all wrong), every advantage is zero and the question contributes no learning signal. Training data should therefore sit at the edge of the model's ability.

#### 3.8 Asynchronous rollouts

Agent rollouts vary wildly in length: rollout A might make two tool calls, rollout C four or more, and each tool call waits on a slow external API. Synchronous RL would idle the GPUs until the slowest trajectory finishes. Tongyi and DR Tulu instead run rollouts **asynchronously**: each trajectory is scored as soon as it completes, and completed trajectories plus rewards are assembled into a batch for the policy update. Additional engineering includes cached tool results, robust API error handling and background task curation. Scheduling details are deferred to the RL systems lecture.

**Tongyi's RL curves.** Over roughly 500 steps of agentic RL, training reward rises steadily from about 0.45 to about 0.63, while policy entropy stays relatively stable (no collapse into a single deterministic behaviour). A related Tongyi plot shows reward rising in a simulated search environment as well. The report does not isolate the contribution of each training stage.

#### 3.9 Open-ended reports need richer rewards: DR Tulu and RLER

Exact match works when the answer is "Allen Newell". It does not work for an open-ended synthesis, where a good report must score on **coverage, relevance, factuality and supported claims (citations)**. Most open deep research agents are trained with RLVR on short-form QA, and this does not transfer to realistic long-form tasks. Static rubrics written before training are also a weak reward: they are under-specified and cannot anticipate what the policy will discover or how it will fail.

**DR Tulu** (Shao\*, Asai\* et al., ICML 2026 oral) introduces **Reinforcement Learning with Evolving Rubrics (RLER)**. The RL loop is the same as RLVR, but the reward is a rubric score:

$$
r_i = \frac{\sum_k w_k \, \mathrm{Judge}(c_k, y_i)}{\sum_k w_k}
$$

Here c\_k is the k-th rubric criterion, w\_k its weight, y\_i the i-th report, and Judge(c\_k, y\_i) an LM judge's score of how well the report meets the criterion. The key is that the criteria c\_k **evolve** during training. The slide walks through one query: "Describe how genetically engineering T cells could be used as an anti-inflammatory therapy for IBD by changing cytokine signalling between T cells and macrophages."

1. **Persistent rubrics** are generated up front *with search*, so they are grounded in real evidence. For example: cites that "IL-10-engineered T cells reduced colitis severity"; states that "engineering T cells to over-express IL-10 suppresses macrophage TNF-α".
2. **Rollouts.** The current policy π\_θt uses web browsing, scholar search and Google search to write several reports. One mentions STAT3 activation; one notes that systemic IL-6 did not increase and no cytokine-release syndrome was observed; one wrongly claims an anti-inflammatory signal increases a pro-inflammatory one.
3. **Generate new rubrics by contrasting rollouts.** A rubric generator compares the reports and writes instance-specific criteria. **Positive rubrics** reward newly found, correct content ("states that IL-10 from engineered T cells suppresses macrophage TNF-α via STAT3 activation"). **Negative rubrics** penalise errors the policy is making ("contains wrong claims that an anti-inflammatory cytokine up-regulates...").
4. **Rubric buffer.** New rubrics join the persistent ones in a per-instance buffer, which is also fed back into later rubric generation.
5. **Score and update.** Reports are scored as S(x, y) = Σ\_k w\_k · Judge(r\_k, y) and the scores drive the GRPO update to π\_θt+1.

*Why it matters:* the rubrics become on-policy. They track what the current model actually writes, so they stay discriminative (different reports get different scores) and they close loopholes the policy discovers. Auxiliary rewards used by DR Tulu (e.g., for format and citations) are omitted on the slide.

**Results.** A cost–performance scatter plots average score across long-form DR benchmarks (y-axis, %) against cost per query in USD (x-axis, log scale from $0.001 to $10). DR Tulu-8B sits at the top-left, around 65% at well under one cent per query, on the Pareto frontier. Closed systems reach similar scores at far higher cost: GPT-5 + Search (about $0.3) and OpenAI Deep Research (about $2), with Ai2 ScholarQA (Claude Sonnet) around $1.3 and Gemini 3 Pro + Search lower. Other open agents — Tongyi DR-30B-A3B (\~50%), WebExplorer-8B, WebThinker-32B-DPO and ASearcher-Web-7B (\~10%) — score clearly lower.

**SFT as an RL warm start.** A second plot tracks score over RL steps for four initialisations. With no SFT, RL starts near 27% and climbs only to about 38% by step 600. An undertrained SFT starts around 46% and reaches about 50%. The full SFT mixture starts near 50% and keeps improving, reaching about 62% by step 4,000. An "on-policy SFT" variant starts similarly but plateaus near 52–53%. The slide's takeaways: even 5% of the SFT data helps, and the full SFT mixture gives the strongest RL results.

**Evolving rubrics improve RL.** Averaged over HealthBench, ScholarQABench v2 and DeepResearch Bench, starting from about 50% (the "no RL" baseline):

| Reward | Score after \~2,500 RL steps |
| --- | --- |
| No RL | \~50% |
| Random rewards | \~51% (flat) |
| Initial rubrics only (static) | \~59.5% |
| Evolving rubrics (RLER) | \~61% |

Random rewards barely move the score, which rules out "any RL helps" as the explanation. Static and evolving rubrics track each other for the first \~500 steps; afterwards evolving rubrics pull ahead and stay ahead.

### 4. Retrieval for deep research

The agent can only reason over what its search tool returns, so the retriever sets a ceiling on everything above it. Part 4 asks what search tools deep research agents use and how to make retrievers serve an agent rather than a human.

#### 4.1 Search tools

| Family | Tool | How it works | Pros / cons |
| --- | --- | --- | --- |
| Local search | Lexical retriever (e.g., BM25) | Scores documents by weighted term overlap | Fast, transparent, no training; misses paraphrases |
| Local search | Embedding models (dense retrieval) | Learned similarity between query and document vectors | Captures meaning; must be trained and indexed |
| Black-box APIs | `web_search` | Commercial web search API returns snippets | Huge, fresh coverage; opaque, costly, non-reproducible |
| Black-box APIs | `browse` | Fetches and reads a full page | Full evidence; slow and long outputs |

Other tools include Python execution (Tongyi) and scholarly search such as paper search APIs (Tongyi, DR Tulu). Local search over a fixed corpus is what makes BrowseComp-Plus-style controlled experiments possible.

#### 4.2 Dense (embedding) retrieval

Dense Passage Retrieval (DPR; Karpukhin et al., EMNLP 2020) popularised the **dual-encoder** design. Offline, a document encoder E\_d embeds every document into a vector index. Online, a query encoder E\_q embeds the query, and each document is scored by a dot product:

$$
s(q, d) = E_q(q)^{\top} E_d(d)
$$

The top-k highest-scoring documents are returned. In the slide example, the documents are \[1\] "Newell and Simon: 1975 Turing Award", \[2\] "Simon: economics Nobel Prize, 1978" and \[3\] "CMU campus buildings and directions". The query "Who shared the Turing Award with Simon?" lands nearest to \[1\]. Because documents are encoded independently of the query, the index is built once and search is a fast nearest-neighbour lookup.

**Training with contrastive learning.** The encoders are trained so that a relevant passage d+ scores higher than negative passages d−:

$$
L = -\log \frac{\exp s(q, d^{+})}{\exp s(q, d^{+}) + \sum_{d^{-}} \exp s(q, d^{-})}
$$

This is a softmax cross-entropy over one positive and many negatives: it increases similarity to d+ ("Newell and Simon: 1975 Turing Award") and decreases similarity to d− ("CMU campus buildings and directions"). Encoder design, negative sampling and indexing are covered in Advanced NLP and IR courses.

#### 4.3 The retriever only sees the query

In a deep research trajectory the agent's context holds the original task, previous reasoning, previous queries and evidence, and its **current reasoning τ\_t**. Yet only the latest query q\_t is passed to the retriever. The reasoning — which explains *why* the agent is searching and what it already knows — is thrown away. Short agent queries are often ambiguous out of context, e.g. a bare name when the agent actually needs one specific relation of that entity.

**AgentIR** (Chen, Ma, Zhuang, Lin, Asai & Zhong, COLM 2026) proposes **reasoning-aware retrieval**:

1. **Retriever input** = reasoning τ\_t + query q\_t, embedded jointly.
2. **Retriever training** that learns which documents help *this reasoning step*.

#### 4.4 DR-Synth: labels for intermediate searches

Standard retriever training has known relevance labels for each query. In a deep research trajectory, only the *global* question has known answer documents; nobody labels which documents help each intermediate turn. **DR-Synth** creates these local labels from standard QA datasets:

1. Run an agent and take an intermediate query q\_t; retrieve its results O\_t (e.g., the top 50 documents).
2. **Add global golds P**: the known supporting documents for the whole question are mixed into the candidate pool.
3. **Listwise rerank** the pool with an LM that sees the global query Q and the global answer A, so it knows which documents actually lead toward the answer.
4. **Label** the top-ranked document as positive and the lowest-ranked ones as negatives.
5. Train the retriever contrastively on (reasoning + query, positive, negatives).

#### 4.5 AgentIR results

On BrowseComp-Plus, a plot shows accuracy (y-axis) against the number of search calls (x-axis) for three agents: Tongyi-DeepResearch, gpt-oss-120B (high reasoning) and GLM-4.7. Up-and-left is better. With **BM25**, accuracy is about 33–36% and agents use about 31–42 search calls. **Qwen3-Embed-8B** raises accuracy to about 50% with 29–35 calls. **AgentIR-4B** reaches about 65–67% with only about 24–30 calls. A retriever half the size of Qwen3-Embed-8B thus gives higher accuracy *and* fewer searches, because better results let the agent stop sooner.

**Ablation: input vs training.** Accuracy (%) on BrowseComp-Plus:

| Agent | Query only | + Reasoning | + DR-Synth | Both (AgentIR) |
| --- | --- | --- | --- | --- |
| Tongyi-DR | 48.7 | 55.5 | 59.4 | 66.3 |
| gpt-oss-120B | 47.6 | 51.3 | 59.2 | 67.0 |
| GLM-4.7 | 50.5 | 50.9 | 57.5 | 64.7 |
| Tongyi-DR (with page visit) | 50.2 | 54.0 | 59.5 | 68.1 |

Both components help on their own, and combining them gives the highest accuracy for every agent. DR-Synth training gives the bigger single jump.

**Which history helps retrieval?** All retrievers below use DR-Synth; only the input context changes:

| Agent | Query only | Prior queries | Queries + reasoning | Queries + reasoning + docs | Current reasoning (AgentIR) |
| --- | --- | --- | --- | --- | --- |
| Tongyi-DR | 59.4 | 63.1 | 63.1 | 60.0 | 66.3 |
| gpt-oss-120B | 59.2 | 61.9 | 64.3 | 58.7 | 67.0 |
| GLM-4.7 | 57.5 | 59.1 | 60.8 | 58.7 | 64.7 |
| Tongyi-DR (with page visit) | 59.5 | 63.0 | 66.3 | 61.5 | 68.1 |

The current reasoning step alone gives the strongest signal in every setting. Adding the full history helps less, and adding previously retrieved documents actually hurts, likely because long, noisy inputs dilute the embedding. *Lesson:* give the retriever the agent's focused, current information need — not everything.

### 5. Summary

1. **Tasks.** Deep research combines many searches with evidence synthesis.
2. **Evaluation.** Assess answer quality and citation support, and audit the rubrics too.
3. **Training.** Learn from demonstrations (mid-training, SFT), then improve through task feedback (RL with verifiable rewards or evolving rubrics).
4. **Retrieval.** Give retrievers the agent's information need (its reasoning) and train them for it (DR-Synth).

## Going deeper

Deep research agents are the current end point of a decade-long line of work that moved retrieval from a fixed pre-processing step to a decision the model makes repeatedly. This section adds that lineage, the systems the lecture did not cover, and practical advice.

### Lineage: from one retrieval to many

- **Open-domain QA and retrieve-then-read (2017–2020).** DrQA (Chen et al., 2017) paired a TF-IDF retriever with a neural reader over Wikipedia. DPR (2020) replaced TF-IDF with learned dense embeddings, and REALM and RAG (Lewis et al., 2020) trained retriever and generator together. All retrieve *once*, from the original question.
- **Multi-hop and iterative retrieval (2018–2023).** HotpotQA (2018) required combining two documents. IRCoT (Trivedi et al., 2023) interleaved chain-of-thought steps with retrieval, using each reasoning step as the next query. FLARE (Jiang et al., 2023) retrieved when the model's next sentence looked uncertain. Self-RAG (Asai et al., 2023) trained the model to emit special tokens that decide when to retrieve and to critique whether passages support its output. These are direct ancestors of the "reasoning → query" loop and of AgentIR's idea that reasoning carries the information need.
- **Browsing agents with citations (2021–2023).** WebGPT (Nakano et al., OpenAI, 2021) fine-tuned GPT-3 to use a text browser, collect quotes, and answer long-form questions with references, trained with human feedback. ReAct (Yao et al., 2022) generalised the think/act/observe pattern. ALCE (Gao et al., 2023) built an early benchmark for citation quality, measuring whether cited passages entail the generated statements — the same idea as DeepResearch Bench's FACT.
- **Products and reasoning models (2024–2025).** Google announced Gemini Deep Research in December 2024 and OpenAI released Deep Research in February 2025, both producing multi-page cited reports after minutes of browsing. Reasoning models trained with RL (OpenAI o-series, DeepSeek-R1) made long, self-correcting trajectories practical, and Search-R1 and similar works showed the same RL recipe teaches open models when to search.

### Architectures the lecture did not cover

The lecture focused on a single model running one long loop. Two other designs are common in practice.

- **Pipeline or "outline first" systems.** STORM (Shao et al., Stanford, 2024) writes Wikipedia-style articles by first researching perspectives through simulated expert conversations, then building an outline, then writing each section with citations. Fixed stages make behaviour predictable and easy to debug, at the cost of flexibility.
- **Multi-agent orchestration.** Anthropic's engineering write-up on its Research feature (June 2025) describes a lead agent that plans and spawns parallel sub-agents, each exploring one sub-question in its own context window and returning condensed findings; a separate step then attaches citations. Parallel sub-agents spread the context load, which relieves the context-length ceiling seen in Tongyi's BrowseComp plot, but they use many more tokens in total.

OpenScholar sits in between: a fixed retrieve → rerank → generate → self-feedback → re-retrieve loop over a curated datastore of scientific papers, rather than free-form browsing.

### Context management is the hidden bottleneck

Tongyi's accuracy rising from near 0% at 8K to about 43% at 128K context shows that the agent's working memory limits research depth. Common mitigations link to the long-context and memory lectures (L3–L4):

- Summarise or compress each fetched page before appending it, keeping only query-relevant spans.
- Keep a running notes or evidence file that persists across context resets, and drop raw tool outputs once distilled.
- Offload sub-questions to sub-agents that return short reports.

Each of these trades recall for space: aggressive compression can discard the one clue that later turns out to matter.

### Evaluation pitfalls beyond the slides

- **LLM-as-judge bias.** LM judges favour longer answers, their own model family's style, and confident tone. Rubric decomposition reduces but does not remove this; the 79% vs 80% agreement result is on a small sample (12 questions).
- **Reward hacking with rubrics.** A policy trained against a fixed rubric can learn to mention every rubric keyword without real synthesis, or to pad reports. Evolving and negative rubrics (DR Tulu) are one defence; length penalties and held-out judges are others.
- **Contamination and staleness.** Web benchmarks leak into training data over time, and live-web answers change. Fixed-corpus benchmarks such as BrowseComp-Plus trade realism for reproducibility.
- **Citation checks depend on access.** FACT-style verification fails on paywalled or dynamic pages, and a "supported" judgment is itself an LM decision that can be wrong.

### Open problems

1. **Rewards for open-ended synthesis.** Rubrics are the current best answer, but how to generate them cheaply, keep them correct, and stop policies from gaming them is unsettled.
2. **Knowing when to stop.** Agents often over-search (cost) or stop early (missed evidence). Calibrated stopping is largely learned implicitly through RL.
3. **Conflicting and low-quality sources.** Real research requires weighing contradictory evidence and judging source credibility; most benchmarks assume a clean answer exists.
4. **Retrievers built for agents.** AgentIR shows that retrievers trained on human-style queries leave accuracy on the table. Co-training retriever and agent is a natural next step.
5. **Human-level claims.** As the lecture's own worked answer stresses, beating other AI systems on a benchmark is not the same as matching experts across domains.

### Practical engineering advice

- **Start with the evaluation.** Write 20–50 representative questions with rubrics and a citation check before tuning prompts. Audit the rubrics by hand, as the ResearchQA audit suggests.
- **Log full trajectories.** Most failures are visible in the search queries: too broad, repeated, or ignoring the plan.
- **Cache tool calls** during development and RL. It saves money and makes runs reproducible, as Tongyi does.
- **Separate retrieval quality from reasoning quality.** Measure recall of gold documents on a fixed corpus before blaming the LLM.
- **Pass intent to the retriever.** Even without training a new retriever, rewriting the query using the agent's current reasoning often helps — the cheap version of AgentIR's insight.
- **Enforce citations structurally.** Require each claim to reference a stored evidence ID, then verify support with a second pass before returning the report.

## Worked example

The sketch below scores three rollouts for one question the way an RLER-style trainer would: it computes a weighted rubric reward, evolves the rubric by contrasting the rollouts, turns rewards into GRPO advantages, and runs a FACT-style citation check. It runs offline: `call_llm(messages) -> str` is a **stub** standing in for an LM judge (a keyword-overlap heuristic), not a real API.

```python
"""Toy RLER-style reward: evolving rubrics, GRPO advantages, citation check.

call_llm(messages) -> str is a STUB for an LM judge. Here a keyword-overlap
heuristic stands in so the script runs offline; swap in a real model.
"""
from dataclasses import dataclass
from statistics import mean, pstdev

def call_llm(messages):  # STUB judge: "1" if most key words of A appear in B
    a, b = messages[-1]["content"].lower().split("|||")
    keys = [w for w in a.split() if len(w) > 4]
    return "1" if sum(k in b for k in keys) / len(keys) >= 0.6 else "0"

def judge(criterion, text):
    return int(call_llm([{"role": "user", "content": f"{criterion}|||{text}"}]) == "1")

@dataclass
class Rubric:
    text: str
    weight: float            # negative weight = penalty ("negative rubric")

def rubric_reward(report, rubrics):
    """r = sum_k w_k * Judge(c_k, y) / sum_k |w_k|."""
    num = sum(r.weight * judge(r.text, report) for r in rubrics)
    return num / sum(abs(r.weight) for r in rubrics)

def grpo_advantages(rewards):
    """A_i = (r_i - mean) / std within the group; zero if all rewards tie."""
    mu, sd = mean(rewards), pstdev(rewards)
    return [0.0 if sd == 0 else round((r - mu) / sd, 2) for r in rewards]

def citation_check(pairs, sources):
    """FACT-style: judge each (claim, source id) pair against the source text."""
    ok = [judge(claim, sources[sid]) for claim, sid in pairs]
    return sum(ok) / len(ok), sum(ok)    # citation accuracy, effective citations

# G = 3 rollouts for one question, sampled from the current policy.
group = {
    "A": "Experts preferred OpenScholar in a direct comparison with human "
         "experts [1]; parity outside the tested domain is unproven.",
    "B": "OpenScholar wins 70% of comparisons with human experts [1]. "
         "Parity is proven across all fields.",
    "C": "Agents are good at research.",
}

# 1) Persistent rubric written before training: under-specified.
rubrics = [Rubric("direct comparison with human experts", 2.0)]
r = {k: rubric_reward(v, rubrics) for k, v in group.items()}
print("static rewards  ", r, "adv", grpo_advantages(list(r.values())))

# 2) Evolve: contrast rollouts. A's hedge becomes a POSITIVE rubric,
#    B's overclaim becomes a NEGATIVE rubric. Both go into the buffer.
rubrics += [Rubric("unproven outside tested domain", 1.0),
            Rubric("claims parity proven across all fields", -1.0)]
r = {k: rubric_reward(v, rubrics) for k, v in group.items()}
print("evolved rewards ", r, "adv", grpo_advantages(list(r.values())))

# 3) Evidence support on report B's citations.
sources = {1: "OpenScholar compared with experts on a sample of research "
              "questions; experts preferred OpenScholar answers."}
pairs = [("OpenScholar compared with experts", 1),
         ("OpenScholar matches experts in every field", 1)]
print("citation acc, effective:", citation_check(pairs, sources))
```

Output:

```text
static rewards   {'A': 1.0, 'B': 1.0, 'C': 0.0} adv [0.71, 0.71, -1.41]
evolved rewards  {'A': 0.75, 'B': 0.25, 'C': 0.0} adv [1.34, -0.27, -1.07]
citation acc, effective: (0.5, 1)
```

**What to notice**

- With only the under-specified static rubric, the careful answer A and the overclaiming answer B get the same reward, so GRPO pushes both up equally. The policy gets no signal to hedge.
- Contrasting the rollouts adds a positive rubric (A's qualification) and a negative rubric (B's overclaim). Now A's advantage is clearly positive and B's turns negative. This is why DR Tulu's evolving rubrics keep the reward discriminative.
- Rewards are normalised by the sum of absolute weights, so negative rubrics pull a score down but keep it bounded.
- The citation check reproduces the lecture's DeepResearch Bench example: one of two claims is supported, giving 50% citation accuracy and 1 effective citation.
- Everything hinges on judge quality. Swap the stub for a real LM and audit a sample of its verdicts against a human, as the 79% vs 80% agreement study did.

## Key terms

These are the terms that recur across the lecture's evaluation, training and retrieval parts.

| Term | Meaning |
| --- | --- |
| Agentic mid-training | Continual pretraining (next-token prediction) of a base model on agent trajectories mixed with general data, before SFT; e.g., AgentFounder. |
| AgentIR | Reasoning-aware retriever that embeds the agent's current reasoning together with its query, trained on DR-Synth data. |
| Asynchronous rollouts | RL setup in which each trajectory is scored as soon as it finishes and batches are assembled from completed ones, so slow tool calls do not stall training. |
| BrowseComp | OpenAI benchmark of 1,266 hard-to-find, easy-to-verify questions built by hiding a known answer behind combined clues. |
| BrowseComp-Plus | Fixed-corpus version of BrowseComp: 830 questions over 100,195 human-verified documents with hard negatives, for controlled comparisons. |
| Citation accuracy | Fraction of (claim, cited source) pairs where the source actually supports the claim; used by DeepResearch Bench's FACT. |
| Contrastive loss | Retriever training objective that raises the score of a relevant passage relative to negative passages via a softmax over their scores. |
| Deep research agent | An LM agent that plans, searches many times, reads and reflects, then writes a long-form, cited synthesis. |
| DR-Synth | Method that creates positive and negative labels for intermediate agent searches by adding global gold documents and listwise reranking with the global question and answer. |
| Dual encoder (dense retrieval) | Separate query and document encoders whose embeddings are compared by dot product, so documents can be pre-indexed. |
| Effective citations | Count of cited claims that are supported by their sources; rewards providing much well-supported evidence. |
| Evolving rubrics (RLER) | DR Tulu's reward: rubric criteria regenerated during RL by contrasting the policy's rollouts, adding positive and negative items to a buffer. |
| GRPO | Group Relative Policy Optimization: samples a group of attempts per prompt and uses each attempt's reward relative to the group mean as its advantage, with clipping and a KL penalty. |
| Hard negative | A document that looks relevant but misses a required clue; used to make retrieval benchmarks and training harder. |
| Knowledge-graph question synthesis | Sampling a connected subgraph of sourced facts, hiding the target entity and turning relations into clues to create verifiable training questions. |
| Rejection sampling (for SFT) | Keeping only teacher trajectories with a correct answer, valid format and coherent reasoning before fine-tuning on them. |
| RLVR | Reinforcement learning with verifiable rewards, e.g., exact match of the final answer against a known gold answer. |
| Rubric score | Weighted fraction of expert- or LM-written criteria an answer satisfies, judged item by item. |
| Search-R1 | RL framework that trains LLMs to interleave reasoning and search calls using a final-answer exact-match reward. |

## Self-check

These questions test recall of the key results and your ability to apply the ideas to new designs.

1. Name the four ways classical QA benchmarks such as Natural Questions fall short for deep research, and one benchmark from the lecture that addresses each. **Answer:** Search complexity (BrowseComp / BrowseComp-Plus), domain expertise (FinSearchComp, MedBrowseComp), answer quality (ScholarQABench, ResearchQA rubrics) and evidence support (DeepResearch Bench's citation checks). NQ questions are simple lookups, general-domain, short-form, and say nothing about whether evidence was used.
2. How are BrowseComp questions constructed, and why does that make them useful for both evaluation and training? **Answer:** Authors start from a known answer, hide its name, and combine several factual clues; they check that models and five Google searches fail and that humans still struggle after 10 minutes. The answer is hard to find but trivially verifiable by string match, which gives clean evaluation and a cheap RLVR reward. WebSailor-V2 automates the same inversion with knowledge-graph subgraphs.
3. GPT-4o scored 0.6% on BrowseComp and 1.9% with browsing, while OpenAI Deep Research scored 51.5%. What does this gap tell you? **Answer:** Tool access alone barely helps; the gain comes from a model trained to persist through many searches, reflect and refine queries. Deep Research even exceeds the 25.3% human reference-match rate, though it was trained for this style of task.
4. Why did BrowseComp-Plus freeze the corpus, and what experiment does that enable? **Answer:** Live web search makes results depend on the search engine, date and page changes, so comparisons are not controlled. With a fixed, human-verified corpus of 100,195 documents you can swap the retriever while holding the agent constant, which is exactly what the AgentIR experiments do.
5. A rubric has items with weights 3, 2 and 1. An answer satisfies the first and third. What is its ScholarQABench-style score, and why is a rubric better than ROUGE here? **Answer:** (3×1 + 2×0 + 1×1)/6 = 4/6 ≈ 0.67. ROUGE, BERTScore and BLEURT only reached 57–62% agreement with expert preferences (chance is 50%) because a near-copy of the reference with one flipped word scores high. Rubric items check specific content, and LM judges on rubric items agreed with experts 79% of the time versus 80% expert–expert.
6. What went wrong with ResearchQA's LM-generated rubrics, and how should you guard against it? **Answer:** An expert audit found 15% of parametric rubric items were vacuous, erroneous or unclear — e.g., citing nonexistent papers or restating the question. Ground rubric items in retrieved sources, then audit a sample for relevance and verifiability before using them, as DeepResearch Bench II does with expert reports and review.
7. Describe the three-stage training recipe for open deep research agents and what each stage's data is. **Answer:** Agentic mid-training continues next-token pretraining on agent trajectories plus general data to make an agent-ready base. SFT imitates teacher trajectories filtered for correct answers, valid format and coherence. RL then learns from the policy's own rollouts with a reward, e.g., exact match (RLVR) or rubrics.
8. In GRPO, what happens to the learning signal for a question where all eight sampled attempts get reward 1? What does this imply for data selection? **Answer:** Every attempt equals the group mean, so all advantages are zero and the question contributes no gradient. Training questions should be ones the current policy sometimes solves and sometimes fails, which is why curriculum or difficulty filtering matters.
9. Why can't DR Tulu simply use exact-match rewards, and what makes its rubrics "evolving"? **Answer:** Long-form reports have no single gold string; quality is about coverage, relevance, factuality and supported claims. RLER starts with search-grounded persistent rubrics, then at each step contrasts the policy's rollouts to write new positive and negative rubrics, stored in a buffer. This keeps rewards discriminative and closes loopholes; evolving rubrics beat static ones (about 61% vs 59.5%) while random rewards stayed near 51%.
10. What information does a standard retriever miss in a deep research loop, and how does AgentIR fix it? **Answer:** It sees only the latest short query, not the agent's reasoning about why it is searching. AgentIR embeds the current reasoning with the query and trains on DR-Synth labels for intermediate searches. On BrowseComp-Plus with Tongyi-DR, accuracy rose from 48.7% (query only) to 66.3%, with fewer search calls than BM25 or Qwen3-Embed-8B.
11. The AgentIR ablation found that adding previously retrieved documents to the retriever input lowered accuracy. How would you explain this, and how would you design the retriever input for your own agent? **Answer:** Long, noisy histories dilute the embedding and pull retrieval toward documents already seen, instead of the current information need. Use the current reasoning step plus the query, optionally with a short summary of what is already known, and measure recall on a fixed corpus before adding more context.
12. How would you evaluate a deep research agent you built for your team's internal engineering documents? **Answer:** Freeze a snapshot of the document store so runs are reproducible, and write 30–50 realistic questions with expert rubrics grounded in specific documents. Score answers with an LM judge per rubric item and spot-check agreement with a human, and run a FACT-style check that each cited document supports its claim. Track cost and number of searches alongside quality.

## References and further reading

The first list covers every work the slides cite; the second adds background and adjacent systems worth reading next.

### Cited in the lecture

- [OpenScholar: Synthesizing Scientific Literature with Retrieval-augmented LMs](https://arxiv.org/abs/2411.14199) — Asai et al., 2024 (published in Nature 2026) — the literature-synthesis RAG system and the ScholarQABench rubric benchmark behind the lecture's running example.
- [DR Tulu: Reinforcement Learning with Evolving Rubrics for Deep Research](https://arxiv.org/abs/2511.19399) — Shao, Asai et al., ICML 2026 — RLER and the first fully open model trained end-to-end for long-form deep research.
- [Natural Questions: A Benchmark for Question Answering Research](https://aclanthology.org/Q19-1026/) — Kwiatkowski et al. (Google), TACL 2019 — the classical QA benchmark used to show what deep research benchmarks must go beyond.
- [BrowseComp: A Simple Yet Challenging Benchmark for Browsing Agents](https://arxiv.org/abs/2504.12516) — Wei et al. (OpenAI), 2025 — the canonical hard-to-find, easy-to-verify search benchmark.
- [Tongyi DeepResearch Technical Report](https://arxiv.org/abs/2510.24701) — Tongyi Lab (Alibaba), 2025 — the full mid-training → SFT → RL recipe, context scaling and asynchronous RL.
- [BrowseComp-Plus: A More Fair and Transparent Evaluation Benchmark of Deep-Research Agent](https://arxiv.org/abs/2508.06600) — Chen et al., 2025 (cited on slides as ACL 2026) — fixed, human-verified corpus for controlled agent and retriever comparisons.
- [FinSearchComp: Towards a Realistic, Expert-Level Evaluation of Financial Search and Reasoning](https://arxiv.org/abs/2509.13160) — ICLR 2026 — expert-written financial search questions.
- [MedBrowseComp: Benchmarking Medical Deep Research and Computer Use](https://arxiv.org/abs/2505.14963) — GenAI4Health Workshop, NeurIPS 2025 — medical multi-hop search over trials, drugs and regulations.
- [ScholarSearch: Benchmarking Scholar Searching Ability of LLMs](https://arxiv.org/abs/2506.13784) — 2025 — academic search benchmark.
- [AutoResearchBench: Benchmarking AI Agents on Complex Scientific Literature Discovery](https://www.alphaxiv.org/abs/2604.25256) — 2026 — finding one specific paper or all matching papers.
- [A Critical Evaluation of Evaluations for Long-form Question Answering](https://arxiv.org/abs/2305.18201) — Xu, Song, Iyyer & Choi, ACL 2023 — shows ROUGE/BERTScore/BLEURT barely beat chance at matching expert preferences.
- [ResearchQA: Evaluating Scholarly Question Answering at Scale Across 75 Fields with Survey-Mined Questions and Rubrics](https://arxiv.org/abs/2509.00496) — Li, Malaviya & Yatskar, TACL 2026 — 21K survey-mined queries with 160K LM-generated rubric items, plus an audit of their quality.
- [DeepResearch Bench II: Diagnosing Deep Research Agents via Rubrics from Expert Reports](https://arxiv.org/abs/2601.08536) — 2026 — rubrics grounded in expert-written reports with expert review.
- [DeepResearch Bench: A Comprehensive Benchmark for Deep Research Agents](https://arxiv.org/abs/2506.11763) — Du et al., ICLR 2026 — report-quality evaluation plus the FACT citation-support check.
- [WebSailor-V2: Bridging the Chasm to Proprietary Agents via Synthetic Data and Scalable Reinforcement Learning](https://arxiv.org/abs/2509.13305) — Alibaba, ICLR 2026 — knowledge-graph-based synthesis of hard training questions.
- [WebDancer: Towards Autonomous Information Seeking Agency](https://arxiv.org/abs/2505.22648) — Wu et al. (Alibaba), NeurIPS 2025 — trajectory collection, filtering and SFT for web agents.
- [Scaling Agents via Continual Pre-training](https://arxiv.org/abs/2509.13310) — Su et al. (Alibaba), ICLR 2026 — agentic mid-training and the AgentFounder model.
- [Search-R1: Training LLMs to Reason and Leverage Search Engines with Reinforcement Learning](https://arxiv.org/abs/2503.09516) — Jin et al., COLM 2025 — RL with exact-match rewards for interleaved reasoning and search.
- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) — Shao et al. (DeepSeek), 2024 — introduces GRPO.
- [Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2004.04906) — Karpukhin et al., EMNLP 2020 — the dual-encoder retriever and contrastive training objective.
- [AgentIR: Reasoning-Aware Retrieval for Deep Research Agents](https://arxiv.org/abs/2603.04384) — Chen, Ma, Zhuang, Lin, Asai & Zhong, COLM 2026 — reasoning-aware retrieval and DR-Synth training data.

### Further reading

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — Lewis et al., 2020 — the original RAG formulation that deep research generalises.
- [WebGPT: Browser-assisted question-answering with human feedback](https://arxiv.org/abs/2112.09332) — Nakano et al. (OpenAI), 2021 — the first browsing agent that writes long-form answers with references.
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., 2022 — the think/act/observe loop underlying the inference procedure.
- [Interleaving Retrieval with Chain-of-Thought Reasoning for Knowledge-Intensive Multi-Step Questions (IRCoT)](https://arxiv.org/abs/2212.10509) — Trivedi et al., ACL 2023 — early evidence that reasoning steps make better retrieval queries.
- [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511) — Asai et al., ICLR 2024 — the speaker's earlier work on adaptive retrieval and self-critique.
- [Enabling Large Language Models to Generate Text with Citations (ALCE)](https://arxiv.org/abs/2305.14627) — Gao et al., EMNLP 2023 — foundational citation-quality metrics.
- [Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models (STORM)](https://arxiv.org/abs/2402.14207) — Shao et al. (Stanford), NAACL 2024 — an outline-first pipeline alternative to a single agent loop.
- [GAIA: a benchmark for General AI Assistants](https://arxiv.org/abs/2311.12983) — Mialon et al., 2023 — the general assistant benchmark reported alongside BrowseComp.
- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Anthropic, June 2025 — practical lessons on orchestrator/sub-agent research systems, evaluation and cost.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]]
- Topic deep dive: [[T05 - Planning, Task Decomposition and Multi-Agent Systems]]
- Topic deep dive: [[T08 - Deep Research Agents - Search, Retrieval and Synthesis]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- Topic deep dive: [[T15 - Human-Agent Interaction and Agents for Real-World Work]]
- [[RAG - Evolution and Complexity]]
- [[RAG and Agentic RAG Tooling]]
- [[What is Agentic RAG Use Cases and Top Agentic RAG Tools (2025)]]

[[L09 - RL Foundations|← L9]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L11 - Advanced RL|L11 →]]
