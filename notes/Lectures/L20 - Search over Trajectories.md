---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, test-time-compute, search, evaluation]
aliases: ["CMU L20", "11-768 Lecture 20", "Search over Trajectories"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-20-search-basics.pdf"
---

# Lecture 20 · Search over Trajectories

[[L19 - Human-AI Collaboration|← L19]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L21 - Search and Planning|L21 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 20 · Daniel Fried
> **Source:** lecture slides `lecture-20-search-basics.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T05 - Planning, Task Decomposition and Multi-Agent Systems]], [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]], [[T12 - Rewards, Verifiers and Reward Hacking]]

Daniel Fried · 11-768 AI Agents, Fall 2026 · 12 November 2026 · source slides: lecture-20-search-basics.pdf (31 slides)

## Overview

Spending more inference compute on many trajectories raises the chance that a correct one exists (coverage), but the final accuracy is set by how well you can select, refine and reuse those trajectories, so the selector and the representation of each attempt matter as much as the number of samples. Daniel Fried builds this in four steps: repeated sampling and pass@k; selecting an answer (verifiers, reward models, voting, execution consensus); iterative refinement (Reflexion, Self-Refine, Parallel-Distill-Refine); and putting it together for long agent runs (trajectory summaries, Recursive Tournament Voting). The lecture closes with search over the harness itself (Meta-Harness, WHALE) and a rule of thumb for where to spend extra compute.

**Learning objectives.** After this lecture you can:

- Compute pass@k = 1 − (1 − p)^k, explain why it is an *oracle* upper bound, and name five ways to raise coverage (more samples, temperature, verbalized sampling, diverse prompts, diversity-aware RL).
- Classify a selection signal as ground-truth or predicted, and explain best-of-N, self-consistency as minimum Bayes risk (MBR), and execution-based consensus (MBR-Exec, AlphaCode).
- Derive the accuracy limit of "return the first accepted answer" with an imperfect verifier, pq / (pq + (1 − p)r), and reproduce the slide's 76.0% for p = 25%, q = 95%, r = 10%.
- Describe refinement loops (Reflexion, Self-Debugging, Self-Refine), say when they help, and explain Huang et al.'s finding that intrinsic self-correction can flip correct answers to wrong.
- Explain how Parallel-Distill-Refine, Recursive Self-Aggregation, structured trajectory summaries and Recursive Tournament Voting make parallel search work for long agent trajectories.
- Distinguish harness search (Meta-Harness) from joint harness–weight optimization (WHALE), and diagnose whether extra compute should go to breadth, feedback or the selector.

**Prerequisites.** The agent loop and harness (L1), sampling from an LLM, and the coding-agent setting with tests as rewards (L6); basic probability (independent events, geometric series).

**How it connects to earlier lectures.**

- **L1 (agents and harness):** the lecture's last section treats the harness, the code around the model, as something to search over automatically.
- **L5 (planning and search):** L5 previewed Tree of Thoughts, RAP and LATS and showed that acting more can beat thinking more (Shen et al.); this lecture is the "search basics" that L5 deferred, done over whole trajectories rather than single steps.
- **L6 (coding agents, SWE-bench):** L6 introduced pass@k from Codex and SWE-Gym's learned verifier (about 20.6% for one greedy rollout to about 32% at 16 rollouts); here they become the central example of the coverage–selection gap.
- **L9 and L11 (RL):** best-of-N, rejection sampling and pass@k reappear as training signals. L11's warning that RL sharpens pass@1 but can shrink pass@k motivates Rewarding the Unlikely, Differential Smoothing and MaxRL.
- **L10 (deep research):** deep-research agents already sample, compare and synthesize many search paths; PDR's bounded "distill" workspace is the same idea in a cleaner form.
- **L12 (RL systems):** parallel rollouts are independent and batch well, the same property that makes large-scale rollout generation efficient.
- **L14 (OpenHands):** trajectory summaries for selection echo OpenHands' context condensing; SWE-Gym's verifier was trained on complete OpenHands runs.
- **L15 (orchestration and monitoring):** LLM-as-a-judge scoring of whole trajectories, and the "same harness, different model" comparisons, frame both selection and harness search.
- **L18 (multi-agent systems):** debate and aggregation over several agents' answers are close relatives of self-consistency, PDR and RTV; the same "is the judge reliable?" question applies.
- **Topic sheets:** T12 (rewards and verifiers) covers verifier design and reward hacking; T5 (planning and multi-agent) covers tree search; T9 (evaluation) covers pass@k estimation. This sheet cross-references them rather than repeating them.

## Concept map

![[cmu-ai-agents-L20-concept-map.png]]
*Concept map: Search over trajectories · generate, refine and select inside a harness that can itself be searched*

Read left to right: stages 1 and 2 raise coverage (the shaded pass@k band), stage 3 (highlighted) decides how much of that coverage becomes the final answer, and the dashed outer loop is harness search over the whole pipeline.

## Detailed notes

The lecture treats inference-time compute as search over whole trajectories, and splits every search method into two jobs: generate candidates that include a correct one (coverage), then pick or improve the right one (selection and refinement). The subsections follow the slides' order.

### 1. Repeated sampling: the simplest search

**What it is.** Run the same agent on the same task several times, each time from a fresh copy of the starting state, and let each run finish independently (slide 2). Fried's illustration uses a VisualWebArena shopping page: three runs start from the same product page, take different clicks, and stop; one passes and two fail. Nothing is shared between runs. The only thing that makes them differ is randomness in the model's sampling.

**Where the randomness comes from.** At each token the model produces logits z\_t, and the sampler draws from a temperature-scaled softmax (slide 3):

$$
P_T(x_t \mid x_{<t}) = \mathrm{softmax}(z_t / T)
$$

Here x\_t is the token at position t, x\_{\<t} is everything before it, z\_t is the vector of logits over the vocabulary, and T > 0 is the temperature. T → 0 approaches greedy decoding (always the top token); T = 1 samples from the model's own distribution; T > 1 flattens it. In an agent, the sampled tokens include both reasoning text and tool calls, so randomness changes which file is opened, which query is searched, and which command is run. Small early differences compound over a long trajectory, which is why repeated agent runs diverge far more than repeated short answers.

**Temperature is often not yours to set.** Reasoning models are usually trained and served at a fixed temperature, often 1.0. The slide points to Anthropic's model-specific sampling notes and to DeepSeek-R1's usage recommendations. DeepSeek recommends a temperature of 0.5–0.7 (0.6 recommended) to avoid endless repetition or incoherent output, and generates 64 responses per query to estimate pass@1. *Beyond the slides:* Anthropic's extended-thinking documentation says thinking is not compatible with changing temperature, so for those models diversity must come from elsewhere (prompts, seeds, environment state).

**Parallel attempts (slide 4).** The slide draws the search as a grid with a vertical "Breadth" axis and a horizontal "Round" axis. Repeated sampling uses only round 0: attempts A0 and B0 start from the same task in a fresh environment and each samples a new trajectory. Two properties make this attractive:

1. The attempts are independent, so they can often be generated in a single batch (the same reason RL rollout generation parallelizes well, L12).
2. Each trajectory ends in a concrete output, for example a patch, which can be checked or compared later.

The same grid comes back on slides 17, 21 and 30 with more rounds and more arrows. It is the lecture's map of the design space.

### 2. Coverage and pass@k

**Definition (slide 5).** pass@k is the probability that at least one of k attempts succeeds. If each attempt succeeds independently with probability p:

$$
P(\text{all } k \text{ fail}) = (1-p)^k \qquad \text{pass@}k = 1 - (1-p)^k
$$

Here p is the single-attempt success rate (pass@1) and k is the number of independent attempts. The formula is the complement of "every attempt fails".

**Idealized coverage (slide 6).** An interactive plot shows pass@k against k on a log scale from 1 to 10,000, with a slider for p. At p = 25%, the dashed curve starts at 25% at k = 1, passes about 76% at k = 5 and about 94% at k = 10, and is essentially 100% by k ≈ 20. The slide's key sentence: pass@k is the success rate you would get with an *oracle* that can perfectly tell correct from incorrect candidates. It measures what the generator can reach, not what a deployed system will return. The caption adds the assumption: independent attempts at one problem with a fixed p.

| k | pass@k at p = 25% |
| --- | --- |
| 1 | 25.0% |
| 2 | 43.8% |
| 5 | 76.3% |
| 10 | 94.4% |
| 20 | 99.7% |

*Common pitfall:* real problems are not independent coin flips. On a benchmark, p varies by task: easy tasks have p near 1 and some hard tasks have p = 0. The benchmark-level pass@k is the average of 1 − (1 − p\_i)^k over tasks, which rises more slowly than the idealized curve and plateaus at the fraction of tasks with p\_i > 0. Errors are also correlated: if the model has a blind spot, every sample shares it. L6 and T9 give the unbiased estimator from Chen et al. (2021) for computing pass@k from n ≥ k samples.

### 3. Improving coverage

Slide 7 lists five levers, each with a citation. They all try to make the k samples *different*, so that correlated failures do not waste the budget.

1. **Sample more candidates.** The simplest lever: raise k. Brown et al. (2024, Large Language Monkeys) show that coverage keeps rising roughly log-linearly over several orders of magnitude of samples.
2. **Raise the sampling temperature** (Codex; Chen et al., 2021). In the Codex paper the best temperature depends on k: low temperature (about 0.2) is best for pass@1, and higher temperature (about 0.8) is best for pass@100, because diversity matters more when you get many tries. The slide marks this "less applicable for reasoning models", whose temperature is fixed.
3. **Generate multiple responses in a single pass** (Verbalized Sampling; Zhang et al., 2025). Instead of "tell me a joke", ask "generate 5 jokes about coffee and their corresponding probabilities". This training-free prompt counters mode collapse from preference tuning and raised diversity 1.6–2.1× in creative writing. The slide marks it "less applicable for agents", since an agent cannot run five different trajectories inside one response.
4. **Use a diverse set of prompts** (Mode-conditioning; Wu et al., 2025). Models tend to collapse onto a few solution modes, so samples repeat the same mistake. Mode-conditioning (ModC) splits the budget across distinct modes, using mode-specific prefixes or specialist models, and finds modes by gradient clustering when no labels exist. The authors report higher maximum pass@k and a 4× efficiency gain for Qwen2.5-7B on OpenThoughts.
5. **Incentivize diversity, or optimize for pass@k, in training.** Three RL papers attack the "sharpening" problem from L11, where RL raises pass@1 but shrinks pass@k:
   - *Rewarding the Unlikely* (He, Fried and Welleck, 2025): GRPO has a rank bias, reinforcing already-likely correct proofs and neglecting rare ones. An "unlikeliness reward" up-weights rare correct solutions and improves pass@N across a wide range of N in formal theorem proving.
   - *Differential Smoothing* (Gai et al., 2025/2026): diversity collapse comes from selection and reinforcement bias; the fix only needs to modify rewards on correct trajectories. It improves both pass@1 and pass@k, with up to 6.7% gains on AIME24.
   - *MaxRL* (Tajwar et al., 2026): with binary terminal rewards, standard expected-reward RL is only a first-order approximation of maximizing the likelihood of correct rollouts. MaxRL interpolates toward maximum likelihood as sampling compute grows and reports up to 20× better test-time scaling efficiency than GRPO.

*Why it matters:* coverage is the ceiling for everything later in the pipeline. No selector can return a correct answer that was never generated.

### 4. The selection gap: a correct answer may be present but not chosen

Slide 8 puts two classic plots side by side to show that coverage is not accuracy.

- **Codex on HumanEval** (Chen et al., 2021, Figure 7, "Sample Ranking Heuristics"). The x-axis is the number of samples k (1 to 100, log scale); the y-axis is pass rate. All curves start near 0.18 at k = 1. The *oracle* curve (pick a sample that passes the hidden tests) climbs almost linearly in log k to about 0.74 at k = 100. Ranking by *mean* token log-probability reaches only about 0.35. Docstring back-translation stays around 0.2–0.25, *sum* log-probability drifts down to about 0.18 (it favors short programs), and random choice wobbles around 0.2.
- **Large Language Monkeys on MATH** (Brown et al., 2024, Figure 7). Two panels, Llama-3-8B-Instruct and Llama-3-70B-Instruct, with k from 1 to 10,000 on a log axis. Coverage (blue) rises to about 0.98 for both models. The practical selectors flatten early. For 8B, majority vote ("output vote") and reward-weighted vote ("score + vote") plateau near 0.41, and best-of-N with a reward model peaks around 0.35 then *declines* to about 0.31. For 70B, the votes plateau near 0.57–0.58 and best-of-N sits near 0.50–0.53.

The captions say it plainly: "A correct answer may be present" and "Practical selection can still miss it." After about 100 samples, extra samples raise coverage but not accuracy, because the selector cannot find the needle. Best-of-N can even get worse with more samples: the more candidates you show a fallible reward model, the more chances it has to find a wrong answer it scores highly (a form of reward-model over-optimization).

*Why it matters:* this gap, oracle minus practical, is the main budget question for any search-based agent. L6 already showed the same gap for Codex reranking and for SWE-Gym.

### 5. Verification signals and reward models

**Two families of signals (slide 10).** A selector needs some estimate of which candidate is correct.

| Ground-truth checks | Predicted correctness |
| --- | --- |
| Math: a proof checker (e.g. Lean) | Code: passes *predicted* (model-written) test cases |
| Code: passes reference test cases | A reward model, e.g. LLM-as-a-judge |
|  | Similarity to other sampled outputs (consensus) |

Ground-truth checks are reliable but often unavailable at test time: you rarely have the hidden tests for a new GitHub issue. Predicted signals are always available but noisy. T12 covers verifier design in depth; this lecture focuses on how verifier quality limits search.

**A trained outcome verifier for agents (slide 11).** SWE-Gym (Pan et al., 2024/2025) trains a verifier on complete OpenHands runs (L14):

1. Run the agent on training tasks and use each task's tests to label each run as resolved (YES) or not (NO).
2. Balance YES and NO examples, then fine-tune a model on complete runs (the whole trajectory plus final patch) to predict the label.
3. At test time, score each new run by the probability of YES and return the highest.

The plot ("Inference Time Scaling") has number of agent rollouts (1 to 16, log scale) on the x-axis and SWE-bench Verified resolved % on the y-axis. A cross marks one greedy rollout (t = 0) at about 20.6%. Dots for rollouts sampled at t = 0.5 follow a dashed log-linear trend: about 22.4% at 2, 26% at 4, 29% at 8 and 32% at 16. Each doubling of rollouts adds roughly 3 points, with no plateau yet at 16. Notice that the verifier is itself an outcome reward model, trained exactly like a classifier on the agent's own successes and failures.

**Best-of-N (slide 12).** The generic recipe: score each candidate with a reward model and return the highest. The slide's toy example scores A = 0.3, B = 0.8, C = 0.5 and returns B. Best-of-N needs no agreement between candidates, so it works when answers are free-form (patches, essays) and cannot be voted on. Its weakness is that it trusts a single score per candidate.

### 6. Self-consistency and execution consensus

**Self-consistency (slide 13; Wang et al., 2022/2023).** Different reasoning paths can reach the same final answer. In the slide, reasoning A and C both end at 42 and B ends at 17, so 42 wins by majority vote. Welleck et al. (2024, "From Decoding to Meta-Generation", §4.2.2) frame this as minimum Bayes risk (MBR) decoding with a 0–1 loss on answers:

$$
\hat{a}_{\mathrm{MBR}} = \arg\max_a \sum_z p(z, a \mid x) \;\approx\; \arg\max_a \sum_{i=1}^{N} \mathbf{1}\{a^{(i)} = a\}
$$

Here x is the question, z is a reasoning trajectory, a is a final answer, p(z, a | x) is the model's joint probability of producing that trajectory and answer, N is the number of samples, a^(i) is the answer of sample i, and 1{·} is 1 when its condition holds and 0 otherwise. Summing over trajectories gives the marginal p(a | x), the total probability of the answer regardless of how it was reached. The vote count is a Monte Carlo estimate of that marginal. *Beyond the slides:* general MBR picks the candidate with the lowest expected loss against the others, argmin over y of the sum of L(y, y') p(y' | x); with 0–1 loss on answers this reduces to the most probable answer.

The intuition: there are many ways to be wrong and they scatter, while correct reasoning tends to converge. Self-consistency needs no reward model, but it requires answers that can be compared exactly (numbers, multiple-choice letters) and fails when the model is confidently and consistently wrong.

**Consensus over execution results (slide 14; MBR-Exec, Shi et al., 2022; AlphaCode, Li et al., 2022).** Programs are rarely textually identical, so group them by *behavior*. The slide's task: sum the even numbers up to and including n = 12.

```python
# Candidate A
evens = range(2, n + 1, 2)
return sum(evens)          # -> 42
# Candidate B (off-by-one: excludes n)
evens = range(2, n, 2)
return sum(evens)          # -> 30
# Candidate C (closed form: 2+4+...+2m = m(m+1))
m = n // 2
return m * (m + 1)         # -> 42
```

A and C produce 42, B produces 30. Execute all candidates on the same inputs, group by output, and pick from the largest group. MBR-Exec does this with a loss defined by whether two programs agree on test inputs. AlphaCode filters millions of samples with the problem's example tests, then clusters survivors by their behavior on model-generated inputs and submits one program from each of the largest clusters (up to 10 submissions). Note that the inputs need no expected outputs: agreement is the signal. This is the "similarity to other sampled outputs" row of slide 10, made concrete by an interpreter.

### 7. Imperfect verification caps the gains

Slide 15 is an interactive model of how verifier errors limit repeated sampling. Its controls are p (probability a sample is correct), q (probability the verifier *accepts a correct* answer, its true-positive rate) and r (probability it *accepts a wrong* answer, its false-positive rate). A small q–r square has presets: Perfect (q = 100%, r = 0%), No signal (q = r) and Imperfect. The plotted setting is p = 25%, q = 95%, r = 10%. The policy is stated under the plot: **return the first accepted answer; otherwise return the last response.**

The chart overlays two curves on the same log-k axis. The dashed red "Oracle coverage" curve is the pass@k curve of slide 6, reaching 100%. The solid blue "Verifier-selected" curve starts at the same 25.0% at k = 1, rises more slowly, and flattens at **76.0%**: "At k = 1: 25.0% · Limit as k grows: 76.0%".

**Derivation.** On each attempt, four things can happen:

| Outcome on one attempt | Probability (p = 0.25, q = 0.95, r = 0.10) |
| --- | --- |
| Correct and accepted | pq = 0.2375 |
| Wrong and accepted | (1 − p)r = 0.075 |
| Correct and rejected | p(1 − q) = 0.0125 |
| Wrong and rejected | (1 − p)(1 − r) = 0.675 |

Let a = pq + (1 − p)r = 0.3125 be the chance that an attempt is accepted. The policy stops at the first acceptance, so attempt i is returned when attempts 1 to i − 1 were rejected and attempt i is accepted. If all k are rejected, the last one is returned anyway. Summing the geometric series:

$$
P_k = pq \sum_{i=1}^{k} (1-a)^{i-1} + (1-a)^{k-1}\,p(1-q) = \frac{pq}{a}\left(1-(1-a)^k\right) + (1-a)^{k-1}\,p(1-q)
$$

Here P\_k is the probability the returned answer is correct after at most k attempts, and a is the per-attempt acceptance probability. Check k = 1: P\_1 = pq + p(1 − q) = p = 25%, matching the slide. As k → ∞ both (1 − a)^k terms vanish, leaving

$$
P_\infty = \frac{pq}{pq + (1-p)\,r} = \frac{0.25 \times 0.95}{0.25 \times 0.95 + 0.75 \times 0.10} = \frac{0.2375}{0.3125} = 0.76
$$

The limit is the verifier's *precision*: the probability that an accepted answer is correct, P(correct | accepted). It is Bayes' rule. Prior odds of correctness are 0.25 / 0.75 = 1/3; the likelihood ratio of acceptance is q / r = 9.5; posterior odds are 9.5 / 3 ≈ 3.17, which is 0.76 as a probability.

| k | Oracle pass@k | Verifier-selected P\_k |
| --- | --- | --- |
| 1 | 25.0% | 25.0% |
| 2 | 43.8% | 40.9% |
| 5 | 76.3% | 64.6% |
| 10 | 94.4% | 74.3% |
| 20 | 99.7% | 76.0% |
| ∞ | 100% | 76.0% |

**What the presets show.** With a perfect verifier (q = 1, r = 0) the limit is 1, and the blue curve rides on the oracle curve. With no signal (q = r) the limit is pq / (pq + (1 − p)q) = p: sampling more buys nothing. In between, the limit depends on p as well as on the verifier: at p = 5% with the same q and r, the limit falls to 0.0475 / (0.0475 + 0.095) = 33%. Hard tasks, where search is most needed, are exactly where a fixed false-positive rate hurts most.

*Why it matters:* once k is large enough, more samples stop helping; only a better verifier (higher q / r) or a better generator (higher p) raises the plateau. Stroebl et al. (2024, "Inference Scaling fLaws") make the same argument for code benchmarks with weak tests.

### 8. Iterative refinement

**From breadth to depth (slide 17).** Refinement uses feedback to revise a candidate. In the grid, A0 → A1 → A2 is one chain (circled in red) and B0 → B1 → B2 another; each step is labeled "Prior work + feedback". Rounds must run sequentially, which costs latency, but separate chains can run in parallel. Refinement trades breadth for depth: later attempts can use what earlier ones learned.

**Reflexion (slide 18; Shinn et al., NeurIPS 2023).** The loop is: attempt → evaluator (compute or predict a reward) → reflection (generate verbal feedback) → retry the same task with the feedback in memory. The slide's HotpotQA-style example asks for "a series of battles … fought on October 28, 1776 near White Plains, New York". Attempt 1 answers Finish\[Battle of White Plains\] and is marked incorrect. The generated feedback notes that the question asked for a *series* of battles but the answer named only one, and resolves to give the campaign name. Attempt 2 answers Finish\[The New York and New Jersey campaign\], which is correct. The reflection is stored as text, a form of episodic memory (L4), and no weights change.

**Types of feedback (slide 19).** Feedback sources mirror the verification signals of slide 10:

| Ground-truth feedback | Predicted feedback |
| --- | --- |
| Math: proof-checker error messages | Code: results of model-written tests (Reflexion) |
| Code: reference test results (Self-Debugging; Chen et al., 2023) | A reward model or LLM-as-a-judge; can be the agent itself (Self-Refine; Madaan et al., 2023) |
|  | Similarity to other candidates (PDR) |

Self-Debugging has the model run code, read execution results, and explain its own code line by line ("rubber duck debugging") before fixing it. Self-Refine uses one LLM in three roles: generate, critique its own output, refine, and repeat; it needs no training or external signal.

**Limits of refinement (slide 20; Huang et al., 2023/2024, "Large Language Models Cannot Self-Correct Reasoning Yet", Figure 1).** Two pie charts show what happens when GPT-3.5 is asked to review and correct its own answers *without* oracle correctness labels:

| Change after self-correction | GSM8K | CommonSenseQA |
| --- | --- | --- |
| No change | 74.7% | 42.8% |
| Correct ⇒ Incorrect | 8.8% | 39.8% |
| Incorrect ⇒ Correct | 7.6% | 5.8% |
| Incorrect ⇒ Incorrect | 8.9% | 11.6% |

On GSM8K the net effect is slightly negative (7.6 points fixed, 8.8 broken). On CommonSenseQA it is badly negative: 39.8% of questions flip from correct to incorrect and only 5.8% go the other way, because asking "review your answer" pushes the model to change answers that were fine. The slide's three bullets: some incorrect answers become correct, some correct answers become incorrect, and self-critique can preserve the original blind spot, since the same model that made the error judges it.

*Common pitfall:* many early self-correction gains came from prompts that stopped refining once the answer was correct, which secretly used the oracle. Refinement is only as good as its feedback signal; with ground-truth feedback (tests, compilers, proof checkers) it is reliable, with self-feedback it is a gamble.

### 9. Combining exploration and refinement: PDR and RSA

**Parallel-Distill-Refine (slide 21; Madaan et al., 2025, "Rethinking Thinking Tokens", Figure 2, shared-summary variant).** PDR crosses the arrows in the grid: A1 is conditioned on both A0 and B0, and so is B1. Each round has three steps:

1. **Parallel:** generate several diverse drafts.
2. **Distill:** compress all drafts into a *bounded* textual workspace, a summary of what was tried, what agrees and what conflicts.
3. **Refine:** each next-round attempt conditions on that workspace, and its output seeds the next round.

The red caption, "Sharing across attempts: bounded workspace", is the key design choice. Because the workspace has a fixed size, context length (and so per-call cost) is controlled by the degree of parallelism, not by the total tokens generated. Sequential Refinement (SR) is the special case with one draft per round. The paper reports PDR beating long chain-of-thought at matched sequential budget, with the largest gains about +11% on AIME 2024 and +9% on AIME 2025, and trains an 8B model with RL to be consistent with this mode of inference.

**Recursive Self-Aggregation (related; Venkatraman et al., 2025).** RSA keeps a population of candidate reasoning chains. At each step it samples small subsets, asks the model to aggregate each subset into an improved solution, and uses the outputs as the next population. It borrows from evolutionary algorithms: aggregation acts like recombination, and the population keeps diversity. The authors report Qwen3-4B-Instruct-2507 with RSA competing with much larger reasoning models (DeepSeek-R1, o3-mini high) on AIME-25, HMMT-25 and LiveCodeBench-v6, and propose aggregation-aware RL.

*Why it matters:* PDR and RSA use "similarity to other candidates" as a feedback signal without needing a verifier. The model sees where drafts agree and disagree, which is self-consistency turned into a refinement input. It is also close to multi-agent debate (L18), where agents read each other's answers between rounds.

### 10. Putting it together for agents: summaries and Recursive Tournament Voting

Everything so far works smoothly for short answers. Agent trajectories break it: a SWE-bench run can be tens of thousands of tokens of tool calls, file views and test output. You cannot vote on patches that differ textually, a judge cannot read sixteen full trajectories in one context, and PDR's "distill" step has too much to distill. Kim et al. (2026, "Scaling Test-Time Compute for Agentic Coding", co-authored by Fried) answer with one idea: change the *representation* of each attempt.

**Structured summaries (slide 23; Appendix G, Figure 23).** An LLM converts each trajectory into a structured summary that keeps its hypotheses, progress and failure modes and drops low-signal trace detail. The slide's excerpt is from a SymPy issue:

- `key_discoveries`: "Add(ZeroMatrix, ZeroMatrix) evaluates to scalar 0" and "MatAdd(0, ZeroMatrix, ZeroMatrix) canonicalizes to 0 because rm\_id removes all identities and keeps the first one (0)".
- `solution_approach.strategy`: "Modify `get_postprocessor` in `sympy/matrices/expressions/matexpr.py` to check if `nonmatrices` is empty. \[…\]"

The summary records *why* the bug happens and *what* the fix does, which is exactly what a judge or a later attempt needs.

**Recursive Tournament Voting (slide 24; §2.3, Figure 2).** RTV selects among N rollouts by comparing summaries in small groups:

1. Summarize all N rollouts (round 0).
2. Split the summaries into groups of size G. For each group, ask an LLM-as-a-judge to pick the best summary.
3. The judge is noisy, so ask it V times and take the majority (vote aggregation).
4. Advance each group winner; repeat until one rollout remains, and submit its patch.

The figure uses N = 4, G = 2, V = 8. Only rollout 0 is correct (green); rollouts 1–3 are wrong (red). In the first group the eight votes split 6–2 for summary 0, so the correct one advances. In the second group both candidates are wrong, so summary 3 advances regardless. In the final, summary 0 beats summary 3. The figure tracks the share of surviving candidates that pass: 1/4 = 0.25 at round 0, 1/2 = 0.5 at round 1, and 1/1 = 1.0 at the final. Each judge call sees only G short summaries, so it fits in context and stays focused, and voting reduces judge noise.

**Selection and reuse (slide 25; Figure 3 and Table 1).** As in PDR, later rollouts condition on selected summaries of earlier ones, and RTV is also used for the final choice. The ablation uses 100 SWE-bench tasks and reports mean rollout success *before* final selection, so it measures whether conditioning makes the rollouts themselves better:

| Model | Single-rollout iter 0 | Single-rollout iter 1 | Random-K iter 0 | Random-K iter 1 | Select-K iter 0 | Select-K iter 1 |
| --- | --- | --- | --- | --- | --- | --- |
| Claude-4.5-Sonnet | 69.87 | 70.87 | 69.87 | 75.06 | 69.87 | **78.06** |
| Gemini-3.1-Pro | 72.69 | 73.75 | 72.69 | 76.94 | 72.69 | **79.25** |

Iteration 0 is identical across columns (independent rollouts). In iteration 1, conditioning on a single prior summary adds about 1 point; conditioning on K random summaries adds 5.2 (Claude) and 4.3 (Gemini); conditioning on K summaries chosen by RTV adds 8.2 and 6.6. The slide's conclusion: multiple summaries help, and using RTV to pick them helps further. The paper's headline results with Claude-4.5-Opus: SWE-bench Verified (mini-SWE-agent) from 70.9% to 77.6%, and Terminal-Bench v2.0 (Terminus 1) from 46.9% to 59.1%. The authors summarize test-time scaling for long-horizon agents as a problem of representation, selection and reuse.

### 11. Harness optimization: searching over the code around the model

**The harness as a search space (slide 27).** Recall from L1: a harness is the code that controls how a model is used. The slide shows part of Meta-Harness's released text-classification baseline:

```python
examples_section = self._format_examples_section(seed=seed)
prompt = PROMPT_TEMPLATE.format(
    examples_section=examples_section,
    input=input,
)
response = self.call_llm(prompt)
answer = extract_json_field(response, "final_answer")
```

Everything except `call_llm` is *editable harness code*: which few-shot examples to show, how to format the prompt, how to parse the answer. The model weights behind `call_llm` are fixed. So far the lecture searched over trajectories for one task; here the search is over programs that will be reused across many tasks.

**Meta-Harness (slide 28; Lee et al., 2026, Figure 2).** Given fixed weights, optimize the harness to maximize task reward. The loop has three numbered steps:

1. A **proposer agent** (a coding agent) reads a filesystem holding all past experience and proposes new harness code.
2. **Task evaluation** runs the harness with the frozen LLM on a task set.
3. **Store all logs** to the filesystem: the proposed code, the reasoning traces, and the evaluation score, in a new folder per candidate.

The design choice is to give the proposer *everything*, not just scores: it can grep through earlier candidates' traces to see why they failed. The paper reports +7.7 points over a state-of-the-art context-management system on online text classification while using 4× fewer context tokens, +4.7 points on 200 IMO-level problems averaged over five held-out models for retrieval-augmented math, and harnesses that beat the best hand-engineered baselines on TerminalBench-2.

**WHALE: joint weight and harness optimization (slide 29; Kim et al., 2026, Figure 1(a–b), §§3–4).** Optimizing only the harness or only the weights leaves the other as a bottleneck. WHALE (Weight-Harness Alternating LEarning) alternates: train the weights under the current harness (online rejection-sampling fine-tuning), then search for a better harness under the new weights (Meta-Harness), with fixed or adaptive phase switching. The bar chart shows post-adaptation test accuracy (%) for small Qwen3.5 agents on three tasks:

| Method (what it changes) | SearchQA | Math | Chess |
| --- | --- | --- | --- |
| Meta-Harness (harness) | 38.3 | 0.4 | 19.8 |
| Rejection SFT (weights) | 38.3 | 15.4 | 22.2 |
| Fast-Slow (prompts + weights) | 35.3 | 17.9 | 25.7 |
| WHALE (harness + weights) | **48.3** | **24.8** | **29.8** |

WHALE wins on all three. Math is the telling case: harness search alone gets 0.4%, because a small model cannot do the math whatever the scaffold, yet the harness adds value once the weights improve. The paper reports gains of 4.15 to 24.38 points over the baselines.

### 12. Where would you spend more compute?

Slide 30 redraws the full grid: breadth (A, B, …), rounds 0–2 with "Prior work + feedback", crossing arrows labeled "Sharing across attempts: prior experience", and a final "Check / select → Final answer" box. Two diagnostic rules follow:

- **If pass@k is low**, the generator never finds the answer: increase breadth (more or more diverse attempts) or feedback conditioning (refinement, PDR-style sharing).
- **If final accuracy is much lower than pass@k**, the answer is being generated but not chosen: improve the selector (better verifier, voting, execution consensus, RTV).

| Lever | Raises | Needs | Main risk |
| --- | --- | --- | --- |
| More samples, temperature, diverse prompts | Coverage | Parallel compute | Correlated failures; selector cannot keep up |
| Diversity-aware RL (unlikeliness, smoothing, MaxRL) | Coverage at large k | Training | Lower pass@1 if overdone |
| Best-of-N with reward model | Selection | Trained verifier | Over-optimization; precision cap |
| Self-consistency, execution consensus | Selection | Comparable answers or runnable code | Consistent blind spots |
| Refinement (Reflexion, Self-Refine, Self-Debugging) | Per-attempt quality | Feedback signal; sequential time | Self-feedback flips right to wrong |
| PDR, RSA, summaries + RTV | Both | Summarizer and judge | Summary drops a key detail |
| Harness search (Meta-Harness, WHALE) | All tasks at once | Evaluation set, many runs | Overfitting the harness to the eval set |

The lecture ends with "Next class: Advanced search".

## Slide-by-slide companion

Every slide in order, with what it shows and why it matters. Section-divider slides get one line.

### Slides 1–8: repeated sampling and coverage

**Slide 1 — Search over Trajectories.** Title slide: Lecture 20, 12 November 2026, Daniel Fried, 11-768 AI Agents, CMU Language Technologies Institute.

**Slide 2 — Repeated sampling.** Subtitle: "Generate independent trajectories in parallel from the same starting page." On the left, a highlighted screenshot of a shopping product page (a canned longan product with a nutrition label) is labeled "Same start". Three arrows fan out to Run 1, Run 2 and Run 3. Each run is a row of faded page thumbnails (product grids, product pages) followed by "…" and a "Stop" box. Run 1 ends with a red X (Fail), Run 2 with a green check (Pass), Run 3 with a red X (Fail). The thumbnails come from Fried's 2024 VisualWebArena search talk. The point: the same agent on the same task produces different trajectories, and sometimes one of them succeeds. If you could tell which, one success in three would be enough. This frames the whole lecture: generate several, then pick.

**Slide 3 — Sampling methods.** A boxed formula, P\_T(x\_t | x\_\<t) = softmax(z\_t / T), with three bullets: sample the next token from the model's distribution; randomness affects reasoning and tool actions; reasoning models may fix the temperature at **1.0** (in red). Footer links: Anthropic's model-specific sampling settings and DeepSeek-R1's usage recommendations (temperature 0.5–0.7, 0.6 recommended). The meaning: temperature is the classic knob for diversity, but for agents the randomness hits actions as well as words, and for modern reasoning models the knob is often locked. So diversity must often come from elsewhere, which sets up slide 7.

**Slide 4 — Parallel attempts.** Subtitle: "Each attempt starts from the same task and samples independently." A grey panel shows a vertical "Breadth" arrow and a "Round 0" column with two dark boxes, A0 and B0, beside the notes "Same task, fresh environment" and "Each attempt samples a new trajectory". Bullets: attempts are independent, so they can often be generated in a single batch; each trajectory can produce an output, e.g. a patch. This is the first frame of the breadth × rounds grid that the lecture grows on slides 17, 21 and 30. "Fresh environment" matters for agents: attempts must not see each other's side effects (edited files, submitted forms), or they are no longer independent.

**Slide 5 — Coverage and pass@k.** "Pass@k: at least one of k attempts succeeds." Assuming success probability p, P(all k fail) = (1 − p)^k, and, in a red-bordered box, P(at least one succeeds) = 1 − (1 − p)^k. This is the complement rule from probability. It gives the upper bound on what repeated sampling can achieve, and it grows fast: even a 10% solver reaches 65% at k = 10.

**Slide 6 — Idealized coverage.** An interactive widget: a slider "Correct answer, p" set to 25.0%, and a chart of pass rate (0–100%) against attempts k on a log scale (1 to 10,000). The dashed red pass@k curve starts at 25% ("At k = 1: 25.0%"), passes 50% near k = 2.4, reaches about 94% at k = 10, and is flat at 100% from about k = 20. Left text: "pass@k is the success rate you would get with an *oracle* which can perfectly distinguish correct/incorrect candidates." Footer: "Independent attempts at one problem, with a fixed success probability p." The word *oracle* is the warning: pass@k is not what a deployed system scores. It is the ceiling that selection tries to reach.

**Slide 7 — Improving coverage.** Five bullets with linked citations: sample more candidates; increase the sampling temperature, less applicable for reasoning models \[Codex\]; generate multiple responses in a single pass, less applicable for agents \[Verbalized Sampling\]; use a diverse set of prompts \[Mode-conditioning\]; incentivize diversity or optimize for pass@k in training \[Rewarding the Unlikely; Differential Smoothing; MaxRL\]. Footer: Chen et al. (2021), Wu et al. (2025), Zhang et al. (2025/2026), He et al. (2025), Gai et al. (2026), Tajwar et al. (2026). The list runs from cheapest (more samples) to most invasive (retraining). The training-time methods respond to the L11 finding that RL sharpens the distribution: pass@1 goes up while large-k coverage goes down. He et al. is Fried's own group.

**Slide 8 — But choosing a candidate can be hard.** Two figures. Left, Codex on HumanEval ("Sample Ranking Heuristics"): pass rate against number of samples (1 to 100, log). Oracle (blue) climbs from about 0.18 to about 0.74; mean log-probability (red) reaches about 0.35; docstring back-translation (orange) hovers near 0.25 then 0.2; sum log-probability (green) sinks to about 0.18; random (purple) jitters around 0.2. Caption: "A correct answer may be present." Right, Large Language Monkeys on MATH for Llama-3-8B-Instruct and Llama-3-70B-Instruct (k from 1 to 10,000). Coverage (blue) rises to about 0.98 in both. Output vote (green) and score + vote (red) plateau near 0.41 (8B) and 0.57–0.58 (70B); best-of-N (orange) peaks then sags to about 0.31 (8B) and 0.50 (70B). Caption: "Practical selection can still miss it." This is the lecture's central gap: everything after this slide is about closing it.

### Slides 9–15: selecting an answer

**Slide 9 — Selecting an answer.** Section divider.

**Slide 10 — Verification signals.** Two columns. "Ground-truth checks": for math, a proof checker; for code, passes reference test cases. "Predicted correctness": for code, passes predicted test cases; use a reward model (e.g. LLM-as-a-judge); similarity to other sampled outputs. Footer: Madaan et al., Self-Refine (2023), §2. The split is about trust and availability. Ground-truth checks are what benchmarks use for scoring, but at deployment time you usually lack them (no hidden tests for a new issue). Predicted signals are always available but can be wrong, and the rest of the section studies how much that error costs. The third predicted signal, similarity, needs no extra model at all: it is the basis of voting (slides 13–14). The same two-column table returns on slide 19 as types of *feedback* for refinement, which shows that verification and feedback are two uses of one signal: one ranks candidates, the other tells a candidate how to improve.

**Slide 11 — Use a reward model.** Left, SWE-Gym's "Inference Time Scaling" plot: SWE-Bench Verified resolved (%) from 20 to 32 on the y-axis against number of agent rollouts (1, 2, 4, 8, 16, log scale). A cross for t = 0 (greedy) sits at about 20.6% at one rollout. Black dots for t = 0.5 lie on a dashed line rising from about 20% to about 32% at 16 rollouts, around 3 points per doubling. Right: "SWE-Gym trains an outcome verifier on complete OpenHands runs." Bullets: use task tests to label each training run; balance YES / NO examples and fine-tune on complete runs; score new runs by YES probability and return the highest. Footer: Pan et al., SWE-Gym (2024/2025), §5.1.1 and Appendix B.6, Figure 1 (bottom). This is best-of-N for agents with a learned, trajectory-level judge. The steady log-linear rise up to 16 rollouts says the verifier is still finding better runs; slide 15 explains why such curves eventually flatten.

**Slide 12 — Best-of-N.** A three-column diagram: Candidates A, B, C → scores 0.3, **0.8** (highlighted in blue), 0.5 → a dark "Return B" box. Bullets: score each candidate with a reward model; return the candidate with the highest score. Best-of-N is the simplest selector and works on free-form outputs where voting is impossible. Its risk is in the argmax: with many candidates, the top score is increasingly likely to belong to a candidate the reward model *overrates*, which is why best-of-N curves on slide 8 bend down.

**Slide 13 — Self-consistency.** "Different reasoning paths can lead to the same final answer." Three cards: Reasoning A → 42, Reasoning B → 17, Reasoning C → 42 (A and C highlighted). Under the heading "Minimum Bayes risk with 0–1 answer loss": â\_MBR = argmax\_a Σ\_z p(z, a | x) ≈ argmax\_a Σ\_{i=1..N} 1{a^(i) = a}, with an underbrace marking Σ\_z p(z, a | x) as p(a | x). Caption: "Sum over trajectories z to get answer probabilities; approximate with sample votes." Footers: Wang et al., Self-Consistency (2022/2023); Welleck et al., From Decoding to Meta-Generation (2024), §4.2.2. The formula says majority voting is not a heuristic: it estimates the most probable *answer* after integrating out the reasoning path, which is what you want when the path itself is not graded.

**Slide 14 — Consensus over execution results.** Task: sum the even numbers up to and including n = 12. Candidate A uses range(2, n + 1, 2) and returns sum → 42. Candidate B uses range(2, n, 2), an off-by-one that excludes 12 → 30. Candidate C uses m = n // 2 and returns m \* (m + 1) → 42. A and C are boxed as agreeing. "Execute programs and group by their outputs." Footers: Shi et al., MBR-Exec (2022); Li et al., AlphaCode (2022). A and C look nothing alike as text, so string-level voting would see three different answers. Execution maps them into the same behavior class. In practice you run each program on several inputs and group by the whole output vector; one input could make two wrong programs agree by accident.

**Slide 15 — Imperfect verification.** "Verifier / reward model errors limit the gains from repeated sampling." Controls: p slider at 25.0%; a square plot of "Accept wrong, r" (0–100%) against "Accept correct, q" (0–100%) with a dot at q = 95, r = 10; input boxes q (%) 95 and r (%) 10; preset buttons Perfect, No signal, Imperfect. The chart: dashed red "Oracle coverage" rising to 100%, and solid blue "Verifier-selected" rising from 25% to a plateau near 76% by about k = 20. Text: "At k = 1: 25.0% · Limit as k grows: 76.0%." Footer: "Return the first accepted answer; otherwise return the last response." The limit is pq / (pq + (1 − p)r) = 0.2375 / 0.3125 = 0.76, the verifier's precision (derivation in Detailed notes §7). Moving the dot shows the lesson: the plateau depends on the ratio q / r and on p. No amount of extra sampling moves it.

### Slides 16–22: iterative refinement

**Slide 16 — Iterative refinement.** Section divider.

**Slide 17 — Refinement.** "Refinement uses feedback to revise candidate solutions. Must be done sequentially, but can refine multiple candidates in parallel." The grid now has three columns, Round 0, Round 1, Round 2. Row A: A0 (dark) → A1 → A2 (blue), circled in red; row B: B0 → B1 → B2. The label over the arrows reads "Prior work + feedback". Each chain is independent of the other. The new axis is depth. Its cost is wall-clock latency, because round 2 cannot start before round 1 ends, but chains still parallelize across the breadth axis. For agents, "prior work" can be a whole earlier trajectory or a summary of it, and "feedback" can be a test log, a judge's critique or a self-reflection.

**Slide 18 — Remembering feedback on trajectories.** A four-box pipeline: attempt → evaluator: compute or predict reward → reflection: generate feedback → retry the same task. Below, a Reflexion example. ATTEMPT 1: "What was a series of battles … fought on October 28, 1776 near White Plains, New York?" → Finish\[Battle of White Plains\], marked incorrect. GENERATED FEEDBACK: "… the question asked for a series of battles, but I only provided the name of one battle … I will make sure to provide more context, such as the name of the campaign …". ATTEMPT 2: Finish\[The New York and New Jersey campaign\], marked correct. Footer: Reflexion, Shinn et al., NeurIPS 2023. The reflection turns a bare fail signal into an actionable lesson that the next attempt reads. It is learning without weight updates: the "policy" improves because its context improves (L4's memory, used inside one task).

**Slide 19 — Types of feedback.** "Basically parallel the verification signals we saw earlier." Ground-truth checks: for math, proof-checker errors; for code, reference test results \[Self-Debugging\]. Predicted correctness: for code, predicted test results \[Reflexion\]; use a reward model (e.g. LLM-as-a-judge), which can be the agent itself \[Self-Refine\]; similarity to other candidates \[PDR\]. Footers: Chen et al., Self-Debugging (2023), §3; Shinn et al., Reflexion (2023), §4.3; Madaan et al., Self-Refine (2023), §2. The mapping makes a clean point: every verifier can double as a feedback source, and the reliability ranking carries over. Ground-truth feedback comes with error messages that say *what* is wrong; predicted feedback may be confidently mistaken.

**Slide 20 — Limits of refinement.** Two pie charts from Huang et al. (2023/2024), Figure 1. GSM8K (GPT-3.5): No Change 74.7% (blue), Correct ⇒ Incorrect 8.8% (red), Incorrect ⇒ Correct 7.6% (green), Incorrect ⇒ Incorrect 8.9% (orange). CommonSenseQA (GPT-3.5): No Change 42.8%, Correct ⇒ Incorrect 39.8%, Incorrect ⇒ Correct 5.8%, Incorrect ⇒ Incorrect 11.6%. Right: "Without oracle correctness labels: some incorrect answers become correct; some correct answers become incorrect; self-critique can preserve the original blind spot." The red slice is the danger. On CommonSenseQA, self-correction breaks almost seven times as many answers as it fixes. The lesson for agents: do not let a model "review and fix" its own output unless it has an external signal, such as tests or an execution result.

**Slide 21 — Combining exploration and refinement.** "Parallel-Distill-Refine: generate a summary of multiple candidates ('distill'); condition on this summary in later attempts." The same 2 × 3 grid, but red arrows now cross between rows: A0 feeds B1, B0 feeds A1, A1 feeds B2, B1 feeds A2, alongside the blue same-row arrows. Red caption: "Sharing across attempts: bounded workspace." Footers: Madaan et al., PDR (2025), Figure 2, shared-summary variant; related, Recursive Self-Aggregation. The crossing arrows are the new idea: each attempt learns from all attempts, not just its own past. The "bounded" workspace keeps context small however many drafts there are, so cost per call does not grow with breadth.

**Slide 22 — Putting it together for agents.** Section divider.

### Slides 23–31: agents, harnesses and budgets

**Slide 23 — Summarization.** "Agent trajectories are long. Use an LLM to generate a structured summary of each trajectory." Two JSON excerpts from Kim et al. (2026), Appendix G, Figure 23. `key_discoveries`: "Add(ZeroMatrix, ZeroMatrix) evaluates to scalar 0"; "MatAdd(0, ZeroMatrix, ZeroMatrix) canonicalizes to 0 because rm\_id removes all identities and keeps the first one (0)". `solution_approach.strategy`: "Modify `get_postprocessor` in `sympy/matrices/expressions/matexpr.py` to check if `nonmatrices` is empty. \[…\]". The summary keeps the causal finding (why a matrix sum collapses to the scalar 0) and the intended fix, while dropping hundreds of lines of file views and test output. That compression is what lets the later steps (judging, conditioning) work on agent trajectories at all. Structured fields also make summaries comparable side by side, which free-text recaps are not.

**Slide 24 — Recursive selection.** "Recursive Tournament Voting compares rollout summaries in small groups." Figure 2 of Kim et al.: Parallel Rollouts 0–3 (N = 4; rollout 0 outlined gold and green, 1–3 red) → Round 0 summaries 0–3, grouped in pairs (G = 2). Group (0, 1) goes to a vote aggregation of V = 8 boxes, six green and two red, and summary 0 advances. Group (2, 3) has eight red boxes, and summary 3 advances. Round 2 (final) picks summary 0 (gold). Annotations: "round 0: (1/4) pass = 0.25", "round 1: (1/2) pass = 0.5", "round 2: (1/1) pass = 1.0", and "update pass@1 metrics". Bullets: have an LLM-as-a-judge select from multiple summaries; the judge may be noisy, so aggregate multiple decisions; advance the winning summary or rollout and repeat until one remains. A tournament needs about N / G judge calls in the first round and fewer after (× V votes each). Each call sees only G summaries, which keeps the comparison focused and the context short.

**Slide 25 — Selection and reuse.** "As in PDR, have rollouts condition on selected summaries. Also use selection at the end." Table 1 (100 SWE-bench tasks, mean rollout success before final selection): Claude-4.5-Sonnet single-rollout 69.87 → 70.87, Random-K 69.87 → 75.06, Select-K 69.87 → **78.06**; Gemini-3.1-Pro single-rollout 72.69 → 73.75, Random-K 72.69 → 76.94, Select-K 72.69 → **79.25** (iter 0 → iter 1). "Multiple summaries help; using RTV to select them helps further in this ablation." Because the metric is *mean* rollout success, the gain is in the rollouts themselves: second-round attempts that read good summaries of earlier attempts solve more tasks. RTV is used twice, to choose what to reuse and to choose what to submit.

**Slide 26 — Harness optimization.** Section divider.

**Slide 27 — Agent harnesses.** "Recall: a harness is the code that controls how we use a model." A code snippet, "part of a harness for text classification via few-shot examples": format an examples section with a seed, fill PROMPT\_TEMPLATE with the examples and the input, call self.call\_llm(prompt), and extract the "final\_answer" JSON field. A blue bar labels the formatting lines "Editable harness code"; a black bar labels call\_llm "Fixed model weights". Footer: Lee et al., Meta-Harness (2026), §3, released text-classification baseline. The split defines a new search space: everything in blue is a program a coding agent could rewrite. Choices like which examples, how many, and in what format often move accuracy as much as a model upgrade (compare L15's "same harness, different model").

**Slide 28 — Harness search.** "Given fixed model weights, optimize the harness around it to maximize task reward. Store all past experiences in a file system. Use a coding agent to edit the harness." Figure 2 of Meta-Harness: a "Filesystem w/ All Experience" (folders 1, 2, …) → (1) a small agent with a "Maximize" thought bubble proposes harness code → a Harness box → "Harness+LLM" with a frozen network (snowflake) → (2) evaluate on a Tasks database → a new folder with Proposed Code, Reasoning Traces and Eval Score → (3) "Store *all* Logs to Filesystem". Bottom: "Proposer agent: reads prior code, scores, and traces; edits the harness. Task evaluation: run the current harness with the fixed LLM weights; store logs and code." This is search over programs instead of trajectories. Keeping full traces, not just scores, lets the proposer diagnose failures, like a human engineer reading logs.

**Slide 29 — Joint weight and harness optimization.** "WHALE: joint model training and harness search via alternating optimization." Figure 1(b), "Post-Adaptation Test Accuracy": grouped bars for SearchQA, Math and Chess. Meta-Harness (harness, pink): 38.3, 0.4, 19.8. Rejection SFT (weights, blue): 38.3, 15.4, 22.2. Fast-Slow (prompts + weights, orange): 35.3, 17.9, 25.7. WHALE (harness + weights, green): 48.3, 24.8, 29.8. Footer: Kim et al., WHALE (2026), Figure 1(a–b), §§3–4. WHALE is highest everywhere, by 10 points on SearchQA. Math shows the complementarity: the harness alone cannot rescue a model that lacks the skill (0.4%), but once training adds it, harness search adds more.

**Slide 30 — Where would you spend more compute?** The full grid: Breadth × Rounds 0–2, blue "Prior work + feedback" arrows, red crossing arrows labeled "Sharing across attempts: prior experience", and A2 and B2 feeding a "Check / select → Final answer" box. Bullets: if pass@k scores are low, increase breadth or feedback conditioning; if final accuracy is much lower than pass@k, improve the selector. This is the lecture's practical takeaway. Measure two numbers, coverage and selected accuracy, and spend on whichever stage is the bottleneck.

**Slide 31 — Thank you, Questions?** Closing slide. Next class: Advanced search.

## Going deeper

The ideas in this lecture have a long history in NLP and a short, fast-moving history in agents; this section supplies the lineage, the theory behind the plateaus, and practical advice for building search into an agent.

### Lineage: generate-then-rerank is old

Generating a list of candidates and reranking them with a second model was standard in statistical parsing and machine translation in the 2000s (n-best reranking). Minimum Bayes risk decoding also comes from that era: Kumar and Byrne (2004) applied it to machine translation, choosing the hypothesis with the lowest expected loss against the others. Self-consistency is the same rule with a 0–1 loss on extracted answers. For LLMs, Cobbe et al. (2021) trained verifiers on GSM8K and showed that sampling 100 solutions and picking by verifier beat fine-tuning a much larger model. Lightman et al. (2023, "Let's Verify Step by Step") compared outcome reward models (ORMs, which score the final answer, like SWE-Gym's verifier) with process reward models (PRMs, which score each step) and found PRMs better for best-of-N selection on MATH. Welleck et al.'s survey, cited on slide 13, organizes all of this under "meta-generation": algorithms that call a generator several times and combine the results.

### Why selection plateaus: the theory behind slides 8 and 15

The slide 15 model assumes verifier errors are independent of the sample. In practice they are not. A reward model tends to like the same wrong answers the generator likes, because both learned from similar data. Correlation lowers the effective q / r ratio on exactly the hard cases. Stroebl, Kapoor and Narayanan (2024, "Inference Scaling fLaws") show that on coding benchmarks with weak tests, false positives put a hard ceiling on resampling. They also show that weaker models cannot match a stronger single attempt by resampling, however large k is. Best-of-N has a second failure mode, reward over-optimization: as N grows, the argmax increasingly selects outliers that exploit the reward model's flaws, which is why best-of-N curves bend *down* on slide 8. Weighted voting ("score + vote") is more robust because a single overrated candidate cannot win alone.

A useful mental model separates three quantities you should always log: pass@1 (generator quality), pass@k (coverage), and selected@k (system accuracy). The gap pass@k − selected@k is the selector's debt. The gap pass@k − pass@1 is the value of diversity.

### Compute-optimal test-time scaling

Snell et al. (2024, "Scaling LLM Test-Time Compute Optimally") asked how to split a fixed inference budget between parallel sampling and sequential revision. Their answer depends on difficulty. Easy prompts benefit from sequential revision of one good attempt; hard prompts benefit from more parallel exploration and search against a PRM. The best adaptive allocation beat best-of-N at about 4× less compute. Slide 30's rule of thumb is the same idea in diagnostic form. PDR and RSA blur the line by doing both, and L5's "thinking vs acting" result (Shen et al.) adds a third axis for agents: spend tokens on more environment interaction rather than more reasoning.

### What changes when the candidate is an agent trajectory

- **Environments must fork.** Parallel attempts need isolated sandboxes (containers, VM snapshots, fresh browser profiles). Irreversible actions, such as sending an email or making a purchase, cannot be repeated N times. This is why search over trajectories is most mature for coding, where a repository can be cloned per attempt.
- **Outputs are not comparable as strings.** Patches differ textually even when they are equivalent. Execution consensus helps if you can generate tests. CodeMonkeys (Ehrlich et al., 2025) generates tests and edits in parallel, then uses a model-based selector that can write extra tests to distinguish candidates.
- **Contexts are too long to judge directly.** Summaries (slide 23) are a lossy compression, so a judge can only be as good as the summary. A summary that omits "I edited the test file to make it pass" hides reward hacking (T12, L13).
- **Cost is dominated by tool calls and tokens.** A 16-rollout SWE-bench run costs roughly 16× a single run. Early stopping on a trusted verifier (slide 15's "first accepted" policy) recovers much of that.

### Harness search lineage

Meta-Harness belongs to a line of work that treats the agent program itself as the object of optimization. DSPy (Khattab et al., 2023) compiles declarative LLM pipelines by optimizing prompts and demonstrations against a metric. STOP (Zelikman et al., 2023, "Self-Taught Optimizer") lets a model improve the code of its own improver. ADAS (Hu et al., 2024, "Automated Design of Agentic Systems") has a meta-agent write new agent designs in code and keeps an archive of discoveries. Meta-Harness's distinctive choice is to give the proposer raw access to every prior candidate's traces through a filesystem, rather than a compressed score history. WHALE then closes the loop with training, much as expert iteration alternates search and learning. The main risk is overfitting to the evaluation set. Treat harness search like hyperparameter tuning: hold out tasks, and report results on tasks the proposer never saw.

### Open problems

- **Verifiers for open-ended work.** Tests exist for code; for research reports (L10), designs or customer emails, the only verifier is a judge, with all of slide 20's problems.
- **Diversity without losing quality.** Diversity-aware RL can trade pass@1 for pass@k. How to get both in one model is open, and the methods on slide 7 are early answers.
- **Fair reporting.** Leaderboard numbers that use best-of-N with a learned selector are not comparable with single-attempt numbers. Report k, the selector, and the cost per task (T9).
- **Learning from search.** Every search run produces labeled trajectories. Feeding the winners back into training (rejection-sampling fine-tuning, L8; RL, L9 and L11) turns test-time compute into better weights, and WHALE is one example.

### Practical checklist

1. Before adding search, measure pass@1 and pass@k on a dev set with the unbiased estimator (L6, T9).
2. If pass@k − pass@1 is small, your samples are not diverse: vary prompts, tool orderings, or seeds before adding more samples.
3. If selected accuracy lags pass@k, invest in the selector: execution-based checks first, then voting, then a trained or prompted judge with multiple votes.
4. Never let self-critique overwrite an answer without an external signal.
5. Log full trajectories and summaries; they are training data for both verifiers and policies.

## Worked example

This simulation measures the coverage–selection gap directly: it samples up to 64 attempts on 2,000 tasks of varying difficulty and compares four ways of choosing an answer. No LLM is called; each attempt is a simulated draw, so the program runs in under a second with only numpy. Wrong answers come from a skewed pool of four (popularity 50/25/15/10%), because real model errors cluster on a few popular mistakes. The verifier uses the slide 15 setting, q = 95% and r = 10%. The best-of-N reward model is the correctness bit plus Gaussian noise.

```python
"""Repeated sampling + selection: oracle vs imperfect verifier vs majority vote vs best-of-N.

No LLM is called. Each "attempt" is simulated: it returns the correct answer with
probability p_task, otherwise a wrong answer drawn from a skewed pool (so wrong
answers can agree with each other, as real model errors do).
"""
import numpy as np

rng = np.random.default_rng(0)
N_TASKS, K_MAX = 2000, 64
Q, R = 0.95, 0.10            # verifier: accept-correct rate q, accept-wrong rate r
WRONG_POOL = np.array([0.5, 0.25, 0.15, 0.10])   # popularity of 4 distinct wrong answers

# 1) Task difficulty varies: p_i ~ Beta(0.6, 1.4) -> mean 0.30, many hard tasks.
p_task = rng.beta(0.6, 1.4, size=N_TASKS)

# 2) Sample K_MAX attempts per task. Answer 0 = correct, 1..4 = wrong answers.
correct = rng.random((N_TASKS, K_MAX)) < p_task[:, None]
wrong_ids = 1 + rng.choice(len(WRONG_POOL), size=(N_TASKS, K_MAX), p=WRONG_POOL)
answers = np.where(correct, 0, wrong_ids)

# 3) Binary verifier (slide 15) and a noisy scalar reward model (for best-of-N).
accept = np.where(correct, rng.random((N_TASKS, K_MAX)) < Q,
                  rng.random((N_TASKS, K_MAX)) < R)
score = correct * 1.0 + rng.normal(0, 0.8, size=(N_TASKS, K_MAX))  # RM: signal + noise


def oracle(k):                       # pass@k: any correct among first k
    return correct[:, :k].any(axis=1).mean()


def first_accepted(k):               # return first accepted, else the last response
    acc = accept[:, :k]
    has = acc.any(axis=1)
    idx = np.where(has, acc.argmax(axis=1), k - 1)
    return correct[np.arange(N_TASKS), idx].mean()


def majority_vote(k):                # self-consistency: most frequent answer wins
    counts = np.stack([(answers[:, :k] == a).sum(axis=1) for a in range(5)], axis=1)
    return (counts.argmax(axis=1) == 0).mean()   # ties -> lowest id (correct): optimistic


def best_of_n(k):                    # argmax of noisy reward-model score
    idx = score[:, :k].argmax(axis=1)
    return correct[np.arange(N_TASKS), idx].mean()


print(f"{N_TASKS} tasks, mean p = {p_task.mean():.3f}, verifier q = {Q}, r = {R}\n")
print(f"{'k':>3} | {'oracle pass@k':>13} | {'first-accepted':>14} | {'majority':>8} | {'best-of-N':>9}")
print("-" * 60)
for k in [1, 2, 4, 8, 16, 32, 64]:
    print(f"{k:>3} | {oracle(k):>13.3f} | {first_accepted(k):>14.3f} | "
          f"{majority_vote(k):>8.3f} | {best_of_n(k):>9.3f}")

# 4) Analytic check of slide 15 for a single task with p = 0.25.
p = 0.25
a = p * Q + (1 - p) * R
print(f"\nSlide-15 single task, p = {p}: acceptance a = {a:.4f}")
for k in [1, 5, 10, 20]:
    pk = p * Q / a * (1 - (1 - a) ** k) + (1 - a) ** (k - 1) * p * (1 - Q)
    print(f"  k = {k:>2}: oracle {1 - (1 - p) ** k:.3f}   first-accepted {pk:.3f}")
print(f"  limit k->inf: pq / (pq + (1-p) r) = {p * Q / a:.3f}")

# 5) Per-difficulty view at k = 64: where does each selector lose?
bins = [(0, 0.05), (0.05, 0.2), (0.2, 0.5), (0.5, 1.01)]
print("\nk = 64 by task difficulty (p range): oracle / first-accepted / majority")
k = 64
acc = accept[:, :k]
idx_fa = np.where(acc.any(axis=1), acc.argmax(axis=1), k - 1)
fa = correct[np.arange(N_TASKS), idx_fa]
counts = np.stack([(answers[:, :k] == a_).sum(axis=1) for a_ in range(5)], axis=1)
mv = counts.argmax(axis=1) == 0
orc = correct[:, :k].any(axis=1)
for lo, hi in bins:
    m = (p_task >= lo) & (p_task < hi)
    print(f"  p in [{lo:.2f},{min(hi, 1):.2f}) n={m.sum():>4}: "
          f"{orc[m].mean():.2f} / {fa[m].mean():.2f} / {mv[m].mean():.2f}")
```

Output (seed 0):

```text
2000 tasks, mean p = 0.290, verifier q = 0.95, r = 0.1

  k | oracle pass@k | first-accepted | majority | best-of-N
------------------------------------------------------------
  1 |         0.293 |          0.293 |    0.293 |     0.293
  2 |         0.432 |          0.411 |    0.432 |     0.383
  4 |         0.577 |          0.523 |    0.399 |     0.459
  8 |         0.691 |          0.592 |    0.392 |     0.532
 16 |         0.785 |          0.621 |    0.380 |     0.586
 32 |         0.850 |          0.632 |    0.378 |     0.639
 64 |         0.902 |          0.632 |    0.381 |     0.690

Slide-15 single task, p = 0.25: acceptance a = 0.3125
  k =  1: oracle 0.250   first-accepted 0.250
  k =  5: oracle 0.763   first-accepted 0.646
  k = 10: oracle 0.944   first-accepted 0.743
  k = 20: oracle 0.997   first-accepted 0.760
  limit k->inf: pq / (pq + (1-p) r) = 0.760

k = 64 by task difficulty (p range): oracle / first-accepted / majority
  p in [0.00,0.05) n= 433: 0.55 / 0.13 / 0.00
  p in [0.05,0.20) n= 515: 1.00 / 0.55 / 0.01
  p in [0.20,0.50) n= 619: 1.00 / 0.82 / 0.53
  p in [0.50,1.00) n= 433: 1.00 / 0.96 / 1.00
```

**What to notice**

- **The oracle keeps climbing; every real selector stalls.** At k = 64, coverage is 90.2% but first-accepted selection is stuck at 63.2%, the same shape as slide 8's Large Language Monkeys plot. The 27-point gap is the selector's debt.
- **The analytic block reproduces slide 15 exactly**: 25.0% at k = 1, 74.3% at k = 10, and the limit 0.2375 / 0.3125 = 76.0%. The benchmark-level plateau (63%) is lower than 76% because many tasks are much harder than p = 0.25, and the limit pq / (pq + (1 − p)r) shrinks as p falls.
- **Majority vote *falls* after k = 2.** It wins only when the correct answer is more common than the most popular wrong one. Here that requires p > 0.5(1 − p), i.e. p > 1/3, so vote accuracy converges to the share of tasks above that threshold (about 38%). The difficulty table shows it: 0–1% on tasks with p < 0.2 and 100% on easy ones. (Its k = 2 value is inflated because ties break toward the correct answer.)
- **Best-of-N keeps rising here only because the simulated reward noise is independent of the answer.** A real reward model's errors correlate with the generator's and can be exploited, which is why slide 8's best-of-N curves flatten or bend down. Try making the noise depend on `wrong_ids` to see that happen.
- **Hard tasks are where search matters and where selection fails.** For p < 0.05, the oracle finds a correct answer 55% of the time but the verifier returns one only 13% of the time: the false-positive rate swamps the rare correct sample.

## More worked examples

Two more examples: a runnable simulation of Recursive Tournament Voting with a noisy judge, and a numeric walkthrough of what to buy with a fixed budget when the verifier is imperfect.

### Example A · Recursive Tournament Voting with a noisy judge (runnable)

The question: given N rollout summaries and an LLM judge that is right only 75% of the time on a pair, how much does the tournament structure plus vote aggregation help? The LLM judge is stubbed by `judge()`, a random choice that favors the correct summary with weight W. The one modelling assumption is labeled in the docstring: a judge reading more summaries at once discriminates less, W(G) = W0 · (2 / G)^0.5. That assumption drives the "flat" baseline, so treat its numbers as illustrative.

```python
"""Recursive Tournament Voting (RTV) vs a single flat judge, with a noisy LLM judge.

No LLM is called: call_llm is replaced by judge(), a stochastic stand-in that
picks one summary from a group. The correct summary gets weight W(G), every wrong
one weight 1. Assumption (illustrative): a judge reading more summaries at once
discriminates less, W(G) = W0 * (2 / G) ** 0.5.
"""
import numpy as np

rng = np.random.default_rng(1)
W0 = 3.0          # with G = 2, the judge picks the correct summary 75% of the time


def judge(labels, rng):
    """One judge vote over a group; returns the index it picks."""
    w = W0 * (2 / len(labels)) ** 0.5
    weights = np.where(labels, w, 1.0)
    return rng.choice(len(labels), p=weights / weights.sum())


def vote(labels, V, rng):
    """Aggregate V independent judge votes; plurality wins (ties -> random)."""
    counts = np.bincount([judge(labels, rng) for _ in range(V)], minlength=len(labels))
    best = np.flatnonzero(counts == counts.max())
    return rng.choice(best)


def rtv(labels, G, V, rng):
    """Return (is_final_correct, n_judge_calls)."""
    pool, calls = list(labels), 0
    while len(pool) > 1:
        nxt = []
        for i in range(0, len(pool), G):
            group = np.array(pool[i:i + G])
            if len(group) == 1:          # bye: advances without a comparison
                nxt.append(group[0]); continue
            nxt.append(group[vote(group, V, rng)]); calls += V
        pool = nxt
    return pool[0], calls


def flat(labels, V, rng):
    return labels[vote(np.array(labels), V, rng)], V


def run(N, p, G, V, trials=4000):
    res = {"oracle": 0, "random": 0, "flat": 0, "rtv": 0}
    calls_rtv = 0
    for _ in range(trials):
        labels = rng.random(N) < p
        res["oracle"] += labels.any()
        res["random"] += labels[rng.integers(N)]
        res["flat"] += flat(labels, V, rng)[0]
        ok, c = rtv(labels, G, V, rng)
        res["rtv"] += ok; calls_rtv += c
    return {k: v / trials for k, v in res.items()}, calls_rtv / trials


p = 0.3   # per-rollout success rate (pass@1)
print(f"pass@1 = {p}, judge W0 = {W0} (pairwise accuracy {W0 / (W0 + 1):.2f})\n")
print(f"{'N':>3} {'G':>2} {'V':>2} | {'oracle':>6} {'random':>6} {'flat':>6} {'RTV':>6} | RTV judge calls")
print("-" * 62)
for N in [4, 8, 16]:
    for V in [1, 8]:
        r, c = run(N, p, G=2, V=V)
        print(f"{N:>3} {2:>2} {V:>2} | {r['oracle']:6.3f} {r['random']:6.3f} "
              f"{r['flat']:6.3f} {r['rtv']:6.3f} | {c:6.1f}")

# Figure-2 replay: N = 4, only rollout 0 correct, G = 2, V = 8.
labels = np.array([True, False, False, False])
wins = sum(rtv(labels, 2, 8, rng)[0] for _ in range(4000)) / 4000
print(f"\nSlide 24 setup (1 of 4 correct, G=2, V=8): RTV picks the correct rollout {wins:.3f}")
one_vote = W0 / (W0 + 1)
print(f"  one pairwise vote correct: {one_vote:.3f}; one flat vote over 4: "
      f"{W0 * (2 / 4) ** 0.5 / (W0 * (2 / 4) ** 0.5 + 3):.3f}")
```

Output (seed 1):

```text
pass@1 = 0.3, judge W0 = 3.0 (pairwise accuracy 0.75)

  N  G  V | oracle random   flat    RTV | RTV judge calls
--------------------------------------------------------------
  4  2  1 |  0.767  0.308  0.429  0.531 |    3.0
  4  2  8 |  0.760  0.306  0.549  0.694 |   24.0
  8  2  1 |  0.948  0.319  0.379  0.652 |    7.0
  8  2  8 |  0.940  0.299  0.459  0.876 |   56.0
 16  2  1 |  0.997  0.301  0.314  0.766 |   15.0
 16  2  8 |  0.996  0.294  0.310  0.967 |  120.0

Slide 24 setup (1 of 4 correct, G=2, V=8): RTV picks the correct rollout 0.862
  one pairwise vote correct: 0.750; one flat vote over 4: 0.414
```

**What to notice**

- **Vote aggregation turns a 75% judge into a 93% judge per match.** With V = 8 and ties broken at random, the chance the majority is right is P(X ≥ 5) + ½ P(X = 4) for X \~ Binomial(8, 0.75), which is 0.886 + 0.043 = 0.929. Two matches in the slide 24 setup give 0.929² = 0.864, matching the simulated 0.862.
- **Matches between two wrong summaries cost nothing.** A correct summary only has to beat the opponents it meets, and a wrong-vs-wrong match cannot hurt it. That is why RTV keeps climbing with N (0.69 → 0.88 → 0.97 at V = 8) while the oracle saturates.
- **The flat judge gets worse as N grows** under the dilution assumption: at N = 16 it is no better than random (0.31). Small groups keep each comparison short and sharp, which is the slide's rationale for comparing "in small groups".
- **Compute is not free.** RTV with V = 8 at N = 16 makes 120 judge calls, versus 16 agent rollouts. Judge calls on short summaries are cheap relative to rollouts, but they still need budgeting.
- **Caveat: the votes here are independent.** Real judge votes from one model are correlated (same blind spots), so real gains from V are smaller than this simulation suggests; that is slide 20's lesson applied to judges.

### Example B · Buy more samples or a better verifier? (numeric walkthrough)

You run a coding agent with pass@1 p = 25% and a verifier with q = 95%, r = 10%. You use slide 15's policy: stop at the first accepted patch, otherwise submit the last one. A colleague offers two upgrades: (A) raise the attempt cap from 10 to 40, or (B) improve the verifier's false-positive rate from r = 10% to r = 5%. Which is better?

**Step 1: formulas.** With a = pq + (1 − p)r, accuracy after at most k attempts is P\_k = (pq / a)(1 − (1 − a)^k) + (1 − a)^(k − 1) p(1 − q), with limit pq / a. Because the policy stops early, the expected number of attempts actually run is (1 − (1 − a)^k) / a, not k.

**Step 2: baseline.** a = 0.2375 + 0.075 = 0.3125. At k = 10, P\_10 = 0.76 × (1 − 0.6875^10) + 0.6875^9 × 0.0125 = 0.76 × 0.9764 + 0.0004 = 74.3%. Expected attempts = (1 − 0.0236) / 0.3125 = 3.12.

**Step 3: compare options.**

| Setting | a | Limit pq / a | P\_10 | P\_40 | Expected attempts (k = 10) |
| --- | --- | --- | --- | --- | --- |
| Baseline q = 0.95, r = 0.10 | 0.3125 | 76.0% | 74.3% | 76.0% | 3.12 |
| (A) more attempts, k = 40 | 0.3125 | 76.0% | — | 76.0% | 3.20 (at k = 40) |
| (B) better verifier, r = 0.05 | 0.275 | 86.4% | 83.0% | 86.4% | 3.49 |
| Lower recall, q = 0.80, r = 0.10 | 0.275 | 72.7% | 70.1% | 72.7% | 3.49 |
| Worse precision, r = 0.20 | 0.3875 | 61.3% | 60.9% | 61.3% | 2.56 |
| No signal, q = r = 0.60 | 0.60 | 25.0% | 25.0% | 25.0% | 1.67 |

Option A buys only 1.7 points (74.3% → 76.0%), because the baseline is already almost at its plateau by k = 10. Option B buys 8.7 points at k = 10 and 10.4 at the limit, for about 0.4 more attempts per task. **Buy the verifier.**

**Step 4: the same question on a hard task.** At p = 5% the baseline limit is 0.0475 / (0.0475 + 0.095) = 33.3%, and P\_10 = 26.2%. Cutting r to 1% raises the limit to 0.0475 / (0.0475 + 0.0095) = 83.3%. Now more attempts *also* matter: P\_10 = 37.1% but P\_40 = 75.4%, with about 15.9 expected attempts at k = 40. On hard tasks, a precise verifier is what makes a large k worth paying for.

**What to notice**

- **Precision (low r) matters more than recall (high q).** Dropping q from 0.95 to 0.80 costs 3.3 points of limit; doubling r from 0.10 to 0.20 costs 14.7. False positives end the search early with a wrong answer; false negatives only cost an extra attempt.
- **Early stopping makes k cheap but not free.** Expected attempts stay around 3 when a is large. When p is small, a is small and the search runs long, which is exactly when cost control matters.
- **The "no signal" row is a sanity check.** With q = r the verifier is a coin flip that ignores correctness, and accuracy stays at p for every k, so sampling more is pure waste.
- **This is slide 30's rule in numbers:** selected accuracy (74%) far below pass@10 (94%) means improve the selector, not the breadth.

## Key terms

The vocabulary of search over trajectories, alphabetically.

| Term | Meaning |
| --- | --- |
| Accept-correct rate (q) | Probability that a verifier accepts a correct candidate; its true-positive rate or recall. |
| Accept-wrong rate (r) | Probability that a verifier accepts a wrong candidate; its false-positive rate. Together with p it sets the plateau pq / (pq + (1 − p)r). |
| Best-of-N | Score N candidates with a reward model and return the highest-scoring one. Works on free-form outputs; vulnerable to reward-model over-optimization as N grows. |
| Coverage | The fraction of problems for which at least one generated candidate is correct; pass@k measured with an oracle. |
| Execution consensus (MBR-Exec) | Run candidate programs on shared inputs, group them by output, and pick from the largest group. Used by MBR-Exec and AlphaCode's clustering. |
| Harness | The code around a fixed model that builds prompts, calls tools, manages context and parses outputs (L1). |
| Harness search (Meta-Harness) | Optimizing the harness code with a coding-agent proposer that reads all previous candidates' code, traces and scores from a filesystem. |
| Iterative refinement | Revising a candidate over sequential rounds using feedback (tests, a judge, self-critique). Depth instead of breadth. |
| LLM-as-a-judge | Using an LLM to score or choose among candidates; a predicted, noisy verification signal. |
| Minimum Bayes risk (MBR) | Choosing the output with the lowest expected loss under the model's distribution; with 0–1 answer loss, the most probable answer after marginalizing over reasoning paths. |
| Mode collapse | A model concentrating its samples on a few solution modes, so repeated sampling repeats the same errors; countered by verbalized sampling, mode-conditioning and diversity-aware RL. |
| Oracle | A hypothetical selector that always recognizes a correct candidate; pass@k assumes one. |
| Outcome verifier | A model trained to predict whether a complete trajectory or output succeeded (e.g. SWE-Gym's verifier trained on OpenHands runs). |
| Parallel-Distill-Refine (PDR) | Generate drafts in parallel, distill them into a bounded shared workspace, and refine new attempts conditioned on it, round after round. |
| pass@k | Probability that at least one of k attempts succeeds; 1 − (1 − p)^k for independent attempts with success probability p. |
| Recursive Self-Aggregation (RSA) | Evolve a population of reasoning chains by repeatedly aggregating small subsets into improved candidates. |
| Recursive Tournament Voting (RTV) | Select among rollouts by having an LLM judge compare trajectory summaries in small groups, aggregating several votes per match and advancing winners until one remains. |
| Reflexion | A loop of attempt, evaluate, write a verbal self-reflection, and retry the same task with the reflection in memory. |
| Self-consistency | Sample several reasoning paths and return the most common final answer; majority voting as an approximation of MBR. |
| WHALE | Weight-Harness Alternating LEarning: alternate rejection-sampling fine-tuning of weights with Meta-Harness search of the harness. |

## Self-check

Ten quick questions to test the core ideas; answers are short on purpose.

1. Why is pass@k called an *oracle* metric, and why does that matter for a deployed agent? **Answer:** pass@k counts a problem as solved if any of k attempts is correct, which assumes something can perfectly recognize the correct one. A deployed agent must submit one answer, chosen by a real selector. So pass@k is a ceiling on system accuracy, not the accuracy itself.
2. With p = 25%, what are pass@1, pass@5 and pass@10? **Answer:** 25%, 1 − 0.75^5 = 76.3%, and 1 − 0.75^10 = 94.4%. The curve saturates near 100% by about k = 20, as on slide 6.
3. Why is raising the temperature "less applicable for reasoning models", and what are two alternatives? **Answer:** Reasoning models are often served at a fixed temperature such as 1.0, and some APIs do not allow changing it when thinking is on. Alternatives are diverse prompts (mode-conditioning) and training for diversity (Rewarding the Unlikely, Differential Smoothing, MaxRL). Verbalized sampling also helps for short outputs but less for agents.
4. Give one ground-truth and two predicted verification signals for code. **Answer:** Ground truth: passing the reference (hidden) test cases. Predicted: passing model-written test cases, and a reward model or LLM-as-a-judge score. Agreement with other sampled programs (execution consensus) is a third predicted signal.
5. What does self-consistency have to do with minimum Bayes risk? **Answer:** With a 0–1 loss on final answers, the MBR choice is the answer with the highest marginal probability p(a | x), summing over all reasoning paths z. Counting how many samples end in each answer is a Monte Carlo estimate of that marginal, so majority voting approximates MBR.
6. In the slide 14 example, why would string matching fail where execution consensus succeeds? **Answer:** Candidates A (range(2, n + 1, 2)) and C (m · (m + 1) with m = n // 2) share no text, so string matching sees three different programs. Executing them gives 42, 30 and 42, so A and C form a group of two and the off-by-one B is outvoted.
7. Using slide 15's setting (p = 25%, q = 95%, r = 10%), what is the accuracy limit and what does it equal conceptually? **Answer:** pq / (pq + (1 − p)r) = 0.2375 / 0.3125 = 76.0%. It is the verifier's precision, P(correct | accepted), because with enough attempts the policy almost always returns some accepted answer.
8. What did Huang et al. find about intrinsic self-correction on CommonSenseQA? **Answer:** When GPT-3.5 reviewed its own answers without oracle labels, 39.8% of answers went from correct to incorrect and only 5.8% from incorrect to correct. Self-critique without an external signal can do net harm and keeps the model's blind spots.
9. What problem do structured trajectory summaries solve in Kim et al.'s agentic coding work? **Answer:** Agent trajectories are too long and too different to vote on or to judge many at once. A structured summary (key discoveries, solution approach) keeps the hypotheses, progress and failure modes in a short, comparable form. That makes both tournament judging (RTV) and PDR-style reuse practical.
10. On slide 30, what should you do if final accuracy is far below pass@k, and what if pass@k itself is low? **Answer:** A large gap means correct candidates exist but are not chosen, so improve the selector (verifier, voting, RTV). Low pass@k means the generator rarely finds a solution, so increase breadth (more or more diverse attempts) or feedback conditioning (refinement, PDR).

## Practice problems

Ten exam-style problems: calculations, design, critique and trajectory debugging, each with full working.

1. **Heterogeneous difficulty.** A benchmark has two equal halves: easy tasks with p = 0.6 and hard tasks with p = 0.02. Compute benchmark pass@1, pass@10 and pass@100. Compare pass@10 with the idealized formula evaluated at the mean p. **Solution:** pass@1 = 0.5 × 0.6 + 0.5 × 0.02 = 0.31. pass@10 = 0.5(1 − 0.4^10) + 0.5(1 − 0.98^10) = 0.5 × 0.9999 + 0.5 × 0.1829 = 0.591. pass@100 = 0.5 × 1.0 + 0.5(1 − 0.98^100) = 0.5 + 0.5 × 0.867 = 0.934. The idealized formula at p = 0.31 gives pass@10 = 1 − 0.69^10 = 0.976, far too optimistic. Benchmark pass@k averages per-task curves, and hard tasks need many more samples, so slide 6's curve is an upper bound when difficulty varies.
2. **Designing a verifier target.** Your agent has p = 0.2 and your verifier accepts correct patches with q = 0.9. Using the first-accepted policy, how low must the accept-wrong rate r be for the large-k accuracy to reach 90%? **Solution:** Require pq / (pq + (1 − p)r) ≥ 0.9, i.e. 0.18 / (0.18 + 0.8r) ≥ 0.9. Then 0.18 ≥ 0.162 + 0.72r, so r ≤ 0.018 / 0.72 = 0.025. The verifier may wrongly accept at most 2.5% of bad patches. Equivalently, the likelihood ratio q / r must be at least 36, since the prior odds are 1/4 and the target posterior odds are 9.
3. **When does majority voting fail?** A model answers correctly with probability p; otherwise it gives one of three wrong answers with shares 40%, 30% and 30% of the wrong mass. As N → ∞, for which p does self-consistency return the correct answer? Is p = 0.3 enough? **Solution:** With many samples, vote shares converge to probabilities. The most popular wrong answer has probability 0.4(1 − p). Voting is correct iff p > 0.4(1 − p), i.e. 1.4p > 0.4, p > 0.286. At p = 0.3 the wrong answer gets 0.28, so voting wins narrowly with large N; at small N, noise often lets the wrong answer win. The lesson: voting needs the correct answer to be the *plurality*, not merely present, which is why it plateaus on hard tasks (slide 8).
4. **Self-correction accounting.** Using Huang et al.'s pie charts, compute the net accuracy change from intrinsic self-correction on GSM8K and CommonSenseQA. Then suppose you add an external check that blocks 90% of correct-to-incorrect changes and none of the incorrect-to-correct ones. What is the new net change on CommonSenseQA? **Solution:** Net change = (Incorrect ⇒ Correct) − (Correct ⇒ Incorrect). GSM8K: 7.6 − 8.8 = −1.2 points. CommonSenseQA: 5.8 − 39.8 = −34.0 points. With the check, only 10% of the 39.8 flips survive, 3.98 points, so net = 5.8 − 3.98 = +1.8 points. Refinement becomes useful only when an external signal guards the harmful direction.
5. **RTV arithmetic.** You have N = 8 rollouts, exactly one correct, a pairwise judge that is right 70% of the time, groups of G = 2, and V = 5 independent votes per match. What is the probability RTV returns the correct rollout? How many judge calls does it make? Compare with V = 1 and with random choice. **Solution:** A match is won when at least 3 of 5 votes are right: P = C(5,3)0.7^3 0.3^2 + C(5,4)0.7^4 0.3 + 0.7^5 = 0.3087 + 0.3602 + 0.1681 = 0.837. The correct rollout must win log2(8) = 3 matches: 0.837^3 = 0.586. Calls: (4 + 2 + 1) matches × 5 votes = 35. With V = 1: 0.7^3 = 0.343 with 7 calls. Random: 1/8 = 0.125. Votes raise accuracy by 24 points for 5× the judge cost; correlated votes would give less.
6. **Diagnose two agents.** On the same 200 tasks with k = 16: Agent X has pass@1 = 30%, pass@16 = 45%, selected@16 = 42%. Agent Y has pass@1 = 30%, pass@16 = 85%, selected@16 = 40%. Where should each team spend its next compute budget? **Solution:** X's selector is nearly perfect (42 of 45 possible), but coverage barely grows with k: its samples are not diverse. X should diversify (different prompts or modes, more varied tool strategies, refinement with feedback) rather than add a better judge. Y generates a correct answer on 85% of tasks but picks it on only 40%: a 45-point selector debt. Y should invest in the selector, for example execution-based tests, voting over behavior, or RTV over summaries. This is slide 30's rule.
7. **Debug a Reflexion trajectory.** A coding agent's log reads: (1) writes `is_leap(y)` returning `y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)`; (2) writes its own test `assert is_leap(1900) == True`; (3) the test fails; (4) reflection: "My century handling is wrong; 1900 should be a leap year"; (5) rewrites to `return y % 4 == 0`; (6) its test passes; the hidden tests fail. What went wrong, and how would you change the loop? **Solution:** The original code was correct; the self-generated test encoded a false belief (1900 is not a leap year). The evaluator was a *predicted* signal (slide 19), and the reflection trusted it over the code, flipping a correct answer to incorrect, exactly Huang et al.'s red slice. Fixes: generate several tests and keep only those that agree across independent samples; prefer reference tests or execution consensus when available; only accept a revision if it also passes the tests the original passed; and treat "tests disagree with code" as uncertainty, not as proof that the code is wrong.
8. **PDR context budget.** Each draft is 8k tokens and you run 8 drafts per round for 3 rounds. Option 1: each refiner reads all 8 previous drafts verbatim. Option 2 (PDR): one distill call reads the 8 drafts and writes a 4k-token workspace, and each refiner reads only the workspace. Count input tokens per round for rounds 2 and 3, and the per-call context length. **Solution:** Option 1: each of 8 refiners reads 8 × 8k = 64k, so 512k input tokens per round and a 64k-token context per call. Option 2: the distill call reads 64k, and 8 refiners read 4k each (32k), so 96k per round, and refiner contexts stay at 4k. Over rounds 2 and 3, Option 1 reads 1,024k and Option 2 reads 192k, about 5.3× less. More importantly, refiner context does not grow with breadth, which is the "bounded workspace" property of slide 21.
9. **Is the harness gain real?** A harness-search run evaluates 200 candidate harnesses on the same 50 tasks. The baseline scores 65%; the best candidate scores 72%. Estimate the run-to-run noise on one candidate's score and argue whether the 7-point gain is convincing. **Solution:** With accuracy near 0.7 on n = 50 tasks, the binomial standard error is sqrt(0.7 × 0.3 / 50) = 0.065, about 6.5 points from task-level sampling of agent runs alone. Taking the maximum over 200 candidates selects for lucky noise: for independent normal noise the expected maximum of 200 draws is about 2.7 standard deviations, roughly 17 points. Real candidates are correlated, so the inflation is smaller, but a 7-point gain is well within selection noise. Re-evaluate the winner on held-out tasks with repeated seeds before believing it, as Meta-Harness does by reporting held-out models and benchmarks.
10. **Design a search pipeline for a web agent.** You build a shopping agent (as on slide 2) with pass@1 = 35%. Purchases are irreversible, a judge model is available, and no ground-truth checker exists at test time. Propose a search design and justify each part using the lecture. **Solution:** (a) Run k attempts in parallel in sandboxed browser sessions that *stop before checkout*, so side effects cannot repeat (slide 4's "fresh environment"). (b) Increase diversity with different prompts or plans per attempt rather than temperature, since the model may have fixed sampling (slides 3 and 7). (c) Summarize each trajectory into structured fields: chosen item, price, constraints checked, uncertainties (slide 23). (d) Select with RTV over summaries using a judge with several votes, since there is no ground truth and long trajectories are hard to compare directly (slide 24). (e) Optionally run one PDR-style round in which new attempts read the selected summaries (slide 25). (f) Only the final winner executes the purchase, ideally after human confirmation (L19). Track pass@k on a labeled dev set against selected accuracy to decide whether to spend more on breadth or on the judge (slide 30).

## References and further reading

Everything cited on the slides, in slide order, followed by extra reading; arXiv abstract pages are linked where the paper is on arXiv.

### Cited in the lecture

- Fried — VisualWebArena search talk (2024), source of the slide 2 page thumbnails. No public link verified; the related paper is [Tree Search for Language Model Agents](https://arxiv.org/abs/2407.01476) — Koh, McAleer, Fried and Salakhutdinov, 2024 — best-first search over web-agent actions on VisualWebArena.
- Model-specific sampling settings — Anthropic Claude docs (slide 3). See also [Extended thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking) — Anthropic — notes on which sampling parameters work with thinking enabled.
- [DeepSeek-R1 usage recommendations](https://github.com/deepseek-ai/deepseek-r1) — DeepSeek, 2025 — temperature 0.5–0.7 (0.6 recommended); 64 samples to estimate pass@1.
- [Evaluating Large Language Models Trained on Code (Codex)](https://arxiv.org/abs/2107.03374) — Chen et al., 2021 — pass@k, its unbiased estimator, temperature vs k, and the ranking-heuristics figure on slide 8.
- [Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity](https://arxiv.org/abs/2510.01171) — Zhang et al., 2025 — ask for several responses with probabilities in one pass.
- [Mode-Conditioning Unlocks Superior Test-Time Scaling](https://arxiv.org/abs/2512.01127) — Wu, Goyal and Raghunathan, 2025 — spread samples across distinct reasoning modes.
- [Rewarding the Unlikely: Lifting GRPO Beyond Distribution Sharpening](https://arxiv.org/abs/2506.02355) — He, Fried and Welleck, 2025 — unlikeliness reward against GRPO's rank bias; better pass@N in theorem proving.
- [Differential Smoothing Mitigates Sharpening and Improves LLM Reasoning](https://arxiv.org/abs/2511.19942) — Gai, Zeng, Zhang and Raghunathan, 2025/2026 — reward modification on correct trajectories only; improves pass@1 and pass@k.
- [Maximum Likelihood Reinforcement Learning (MaxRL)](https://arxiv.org/abs/2602.02710) — Tajwar et al., 2026 — objectives that interpolate from expected reward to likelihood of success as sampling compute grows.
- [Large Language Monkeys: Scaling Inference Compute with Repeated Sampling](https://arxiv.org/abs/2407.21787) — Brown et al., 2024 — coverage scales over orders of magnitude while voting and reward models plateau (slide 8).
- [Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651) — Madaan et al., 2023 — generate, self-critique, refine with one model (slides 10 and 19).
- [Training Software Engineering Agents and Verifiers with SWE-Gym](https://arxiv.org/abs/2412.21139) — Pan et al., 2024/2025 — outcome verifier trained on OpenHands runs; inference-time scaling plot (slide 11).
- [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171) — Wang et al., 2022/2023 — majority vote over sampled reasoning paths.
- [From Decoding to Meta-Generation: Inference-time Algorithms for Large Language Models](https://arxiv.org/abs/2406.16838) — Welleck et al., 2024 — survey; §4.2.2 frames self-consistency as MBR.
- [Natural Language to Code Translation with Execution (MBR-Exec)](https://arxiv.org/abs/2204.11454) — Shi et al., 2022 — select programs by agreement of execution results.
- [Competition-Level Code Generation with AlphaCode](https://arxiv.org/abs/2203.07814) — Li et al., 2022 — massive sampling, filtering by example tests, behavioral clustering.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., NeurIPS 2023 — verbal self-reflection stored across retries (slides 18–19).
- [Teaching Large Language Models to Self-Debug](https://arxiv.org/abs/2304.05128) — Chen et al., 2023 — refinement from execution feedback and self-explanation.
- [Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) — Huang et al., 2023/2024 — intrinsic self-correction often hurts (slide 20 pie charts).
- [Rethinking Thinking Tokens: LLMs as Improvement Operators (PDR)](https://arxiv.org/abs/2510.01123) — Madaan et al., 2025 — Parallel-Distill-Refine with a bounded workspace.
- [Recursive Self-Aggregation Unlocks Deep Thinking in Large Language Models](https://arxiv.org/abs/2509.26626) — Venkatraman et al., 2025 — population-based aggregation of reasoning chains.
- [Scaling Test-Time Compute for Agentic Coding](https://arxiv.org/abs/2604.16529) — Kim et al., 2026 — trajectory summaries, Recursive Tournament Voting, PDR for agents (slides 23–25).
- [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052) — Lee et al., 2026 — coding-agent proposer with filesystem access to all prior candidates (slides 27–28).
- [WHALE: A Simple Recipe for Joint Harness-Weight Optimization](https://arxiv.org/abs/2609.00196) — Kim et al., 2026 — alternating rejection-sampling fine-tuning and harness search (slide 29).

### Further reading

- [Training Verifiers to Solve Math Word Problems](https://arxiv.org/abs/2110.14168) — Cobbe et al., 2021 — the GSM8K paper; early evidence that verifier-based best-of-N rivals much larger models.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — Lightman et al., 2023 — process vs outcome reward models for selection; PRM800K dataset.
- [Scaling LLM Test-Time Compute Optimally Can Be More Effective than Scaling Model Parameters](https://arxiv.org/abs/2408.03314) — Snell et al., 2024 — how to split compute between parallel sampling and revision by difficulty.
- [Inference Scaling fLaws: The Limits of LLM Resampling with Imperfect Verifiers](https://arxiv.org/abs/2411.17501) — Stroebl, Kapoor and Narayanan, 2024 — the formal version of slide 15's plateau.
- [CodeMonkeys: Scaling Test-Time Compute for Software Engineering](https://arxiv.org/abs/2501.14723) — Ehrlich et al., 2025 — parallel SWE-bench trajectories with generated tests and a model-based selector.
- [Language Agent Tree Search (LATS)](https://arxiv.org/abs/2310.04406) — Zhou et al., 2023 — MCTS with reflection for acting agents; a bridge to next lecture's advanced search.
- [Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?](https://arxiv.org/abs/2504.13837) — Yue et al., 2025 — RL raises pass@1 but can lower large-k pass@k (motivation for slide 7's training methods; see L11).
- [Automated Design of Agentic Systems (ADAS)](https://arxiv.org/abs/2408.08435) — Hu, Lu and Clune, 2024 — a meta-agent that writes new agent designs in code; precursor to harness search.
- [DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines](https://arxiv.org/abs/2310.03714) — Khattab et al., 2023 — optimizing prompts and demonstrations of LLM programs against a metric.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Previous lecture: [[L19 - Human-AI Collaboration]]
- Topic deep dive: [[T05 - Planning, Task Decomposition and Multi-Agent Systems]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]
- [[4 Ways to Test ML Models in Production]]

[[L19 - Human-AI Collaboration|← L19]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L21 - Search and Planning|L21 →]]
