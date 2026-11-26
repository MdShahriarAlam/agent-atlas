---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, reinforcement-learning, policy-gradient, ppo, grpo, llm-training]
aliases: ["CMU T11", "Policy-Gradient RL for Agents: REINFORCE, PPO and GRPO"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 11 · Policy-Gradient RL for Agents: REINFORCE, PPO and GRPO

[[T10 - Supervised Fine-Tuning on Agent Trajectories|← T10]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T12 - Rewards, Verifiers and Reward Hacking|T12 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L09 - RL Foundations]], [[L11 - Advanced RL]], [[L12 - RL Systems]], [[L20 - Search over Trajectories]], [[L21 - Search and Planning]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L9, L11, L12, L20, L21 · 11-768 AI Agents, Fall 2026

## Overview

Policy-gradient reinforcement learning (RL) trains an agent by sampling its own attempts, scoring them with a reward, and nudging the model toward the higher-scoring actions; it is the main way today's coding, search and computer-use agents learn to finish tasks rather than merely imitate demonstrations.

**Why it matters for building real agents.** Supervised fine-tuning (SFT) teaches an agent to copy recorded trajectories. It cannot tell the agent that a different route to the same goal is fine, it cannot learn from failed attempts, and it never shows the agent its own mistakes. RL fixes all three by optimizing the thing we actually care about: expected task reward. Every open agent model discussed in the course (DeepCoder in L6, CUA-Gym in L7, Search-R1, Tongyi DeepResearch and DR Tulu in L10) finishes its training with an RL stage built on the algorithms in this sheet. Even if you never train a model yourself, the same ideas explain why agents behave as they do: why they get verbose, why they sometimes game tests, and why a verifier bug can wreck a training run.

**Key questions this sheet answers.**

- Why can we not simply backpropagate through an agent's episode, and how does the log-derivative trick get around it?
- Why does subtracting a baseline leave the gradient unbiased, and why does it reduce variance so much?
- What exactly are advantages, value functions, TD errors and GAE, and when do you need a learned critic?
- How do GRPO, DrGRPO, DAPO, CISPO and GSPO differ, and which biases does each one fix?
- How do importance sampling, clipping and KL penalties keep updates stable when rollouts come from an older policy?
- How are rejection-sampling fine-tuning (ReST, expert iteration) and REINFORCE related?
- How should credit be split across tokens, turns and whole trajectories in a multi-turn agent?
- How is a large RL training system laid out: rollout workers, inference engine, reward services and trainer?

**Which lectures cover it.**

- **L9 (Fried), RL Foundations for Agents:** the core derivation. It goes from SFT to ReST, REINFORCE, baselines, advantages, GRPO and DrGRPO, all on a toy "Number Search" game.
- **L11 (Neubig), Advanced RL Algorithms for Agents:** credit assignment with critics and GAE, asynchronous RL, importance sampling, PPO/CISPO/GSPO/DAPO, reward reliability, and distillation, on a coding bug-fix task.
- **L8 (SFT):** why RL starts from an SFT "cold start", and how much SFT to do before RL.
- **L10 (Deep research agents):** RL with verifiable rewards for search agents, asynchronous rollouts, and rubric rewards for open-ended reports.
- **L1, L4, L5, L6, L7:** training-system software (SkyRL, Miles), reward design for skill reuse, RL for reasoning (STaR, DeepSeek-R1), execution-reward RL for code, and resettable environments for computer-use RL.

**Lectures 12–15.** L12 (Gandhi), RL Systems, is the one new lecture that bears directly on this topic: it shows the machinery that computes the policy-gradient update, a decode-heavy sampler and a gradient-heavy trainer joined by trajectory data and weight sync, and why keeping them consistent is part of the algorithm. Its additions are in Core concepts 10–12 (engines and their optimizations; staleness, train–inference mismatch, TITO and R3; system architectures, online and multi-LoRA RL), "L12 · RL Systems" under Across the lectures, M9 (mismatch bias, truncated importance sampling and the decoupled ratio), the L12–L15 patterns, a Landscape table, open problems 11–13, nine glossary terms and practice questions 16–22. L13–L15 (safety, OpenHands, orchestration) are covered in T13 and T14.

**Lecture 20.** L20 (Fried, "Search over Trajectories") is about test-time search, but it puts a training question to this topic: RL on a pass@1 reward can sharpen the policy and shrink the coverage that search needs. Read the L20 entry before *Mechanics* (Rewarding the Unlikely, Differential Smoothing, MaxRL, fixed temperature, WHALE), "Patterns and pitfalls from L20", the "Added with L20" landscape table, four glossary terms and practice questions 23–26. Selection, verifiers and search themselves are in T12, T9 and T5.

**Lecture 21.** L21 (Koh, "Search and Planning") treats search as a policy-improvement operator: Expert Iteration, AlphaZero's distillation of visit counts, and Stream of Search with STaR and APA. Read the L21 entry before *Mechanics*, "Patterns and pitfalls from L21", the "Added with L21" landscape table, four glossary terms and practice questions 27–30. Search algorithms are in T5 and web search in T7.

**Prerequisites.** Basic probability (expectations, sampling, variance), the chain rule and gradients, and softmax/log-probabilities of a language model. It helps to have read the SFT sheet (L8): the policy gradient reuses the SFT loss computation with a different weight per token.

**Suggested reading path.** Read Core concepts sections 1 to 3 first; they carry the central derivation. Then run the first Hands-on program, which trains five of the methods on the same toy task. Continue with Core concepts 4 to 7 (critics, groups, off-policy correction, PPO family) alongside the Mechanics section, which has the full equations. Finish with Core concepts 8 and 9 (rewards, credit assignment, systems) and the design checklist. Use the practice questions to test yourself.

## Concept map

![[cmu-ai-agents-T11-concept-map.png]]
*Concept map: Policy-gradient RL · one training loop, four design choices, and how they combine into ReST, GRPO and PPO*

Read the top row as the training loop, each column below it as the choices made at that stage, and the bottom band as how one choice per column gives a named method.

## Core concepts

This section builds the whole policy-gradient family from one idea: raise the probability of actions that led to better-than-expected outcomes. Each subsection adds one ingredient, in the order the course introduces them, and then goes beyond the slides where the literature adds something you need in practice.

### 1. The RL setting for agents: objective, trajectories and why SFT is not enough

**The agent–environment loop.** An agent is a *policy* πθ: a model with parameters θ that maps a history to a probability distribution over the next action. At each step t the agent emits an action a\_t; the environment answers with an observation o\_{t+1} and, sometimes, a reward r\_{t+1}. L9 (Fried) shows the same loop at three scales: for plain text generation the action is the next token and the reward is a judge's score; for a web agent the action is a click or keystroke and the reward counts completed sub-tasks; for the toy game *Number Search* the action is a guess and the reward is 1 only for the correct number.

**Number Search**, the running example of L9, is worth memorizing because every later idea is shown on it. A hidden integer lies in 1 to 16. The agent has four guesses, and after each wrong guess the environment says "higher" or "lower". L9 samples four trajectories for hidden number 11: τ1 = 8, 12, 10, 11 (success), τ2 = 4, 8, 12, 11 (success), τ3 = 16, 8, 9, 10 (timeout), τ4 = 1, 2, 3, 4 (timeout). L11 (Neubig) uses a more realistic task: fix `retry_count(config)`, which returns `config.get("retries") or 3` and so wrongly turns 0 into 3. Four tests judge each attempt, and the reward is 1 only if all four pass.

**Histories and trajectories.** The *history* h\_t = (o\_0, a\_0, o\_1, …, o\_t) is everything the agent has seen and done before step t. It is not the full environment *state*: in Number Search the hidden number is state the agent cannot see. A *trajectory* (also called an episode or rollout) τ = (o\_0, a\_0, r\_1, o\_1, …, a\_{T−1}, r\_T, o\_T) is one complete attempt, and its *return* R(τ) is the sum of its rewards. With only a final reward, as in both running examples, R(τ) is just the outcome: 1 or 0.

**The probability of a trajectory** factorizes into policy terms and environment terms:

$$
p_\theta(\tau \mid x) = p(o_0 \mid x) \prod_{t=0}^{T-1} \pi_\theta(a_t \mid h_t)\, P(o_{t+1}, r_{t+1} \mid h_t, a_t, x)
$$

Here x is the task instance (the prompt plus the hidden setup), p(o\_0 | x) is the initial observation, and P is the environment's response. We never know P; we can only sample from it by actually running the environment. This one fact shapes everything that follows.

**The objective.** RL maximizes expected reward J(θ) = E\_{τ∼pθ(·|x)}\[R(τ)\], averaged over tasks. L9's toy numbers make this concrete: if the policy gives τ1, τ2, τ3, τ4 probabilities 0.30, 0.20, 0.25, 0.25, then J = 0.30·1 + 0.20·1 + 0.25·0 + 0.25·0 = 0.50. Training moves probability mass from low-reward trajectories toward high-reward ones.

**Three problems with SFT that RL solves** (L9, adapted from Sean Welleck's RL fundamentals slides):

| Problem | What goes wrong with SFT | How RL fixes it |
| --- | --- | --- |
| Task mismatch | SFT maximizes the probability of *the demonstrated* actions. τ2 also succeeds, but SFT on τ1 treats τ2's different actions as errors. Some actions (guessing 13 after "12 → lower") should never happen, yet SFT has no way to say so. | The objective is expected reward, so any successful route is reinforced. |
| Data mismatch | SFT cannot use sub-optimal data. τ3 and τ4 carry information (what not to do) that SFT throws away. | Every trajectory contributes according to its reward. |
| Exposure bias | The agent never sees its own mistakes during training. At test time, after guessing 8 → higher → 2, it is in a history no demonstration covered. | Trajectories are sampled from the current policy (*on-policy*), so the agent practices recovering from its own errors. |

*Beyond the lecture:* exposure bias is the language-model name for *compounding error* in imitation learning. Ross and Bagnell's analysis shows that behaviour cloning's error can grow quadratically in the horizon, while on-policy data collection (DAgger, and RL) keeps it linear. Long agent episodes make this painful, which is why L5's observation that larger models "self-condition" on earlier mistakes ends with the question "Can reinforcement learning fix this?"

**Where RL sits in the pipeline.** L8 places RL after SFT. Kimi K3 uses SFT to teach tool calls and long tasks, RL to develop domain experts, and on-policy distillation to merge them. DeepSeek-R1-Zero ran RL on the base model with no SFT, but its answers mixed languages and were hard to read, so DeepSeek-R1 reinstated a small curated SFT "cold start". L8 also quotes OpenThoughts-Agent and MAI-Thinking-1: RL on no SFT barely moves the base model, SFT alone stops short, and "RL provides the most gains when the SFT model is selected with RL in mind". L8's side-by-side table sums it up: SFT gives "a target for every token"; RL gives "one number per rollout" and is good at "sharpening what the model can already attempt".

Common misconception: "RL teaches the model new skills from nothing." With a sparse 0/1 reward, a policy that never succeeds gets no signal at all (section 5). In practice RL mostly re-weights behaviours the starting model can already produce at least occasionally, which is why the cold start and task difficulty matter so much.

### 2. From rewards to gradients: the policy-gradient theorem and REINFORCE

**Why backpropagation fails.** L9 draws the pipeline θ → πθ(a|h) → sampled action → environment → reward and crosses out two links. Sampling a discrete token is not differentiable, and neither is the world: "How do you take the derivative of a unit test with respect to code?" We need the gradient of J without differentiating R or P.

**The log-derivative trick.** Write J as a sum over trajectories, J(θ) = Σ\_τ pθ(τ|x) R(τ). Only pθ depends on θ; R(τ) is a number observed after the rollout. So ∇J = Σ\_τ ∇pθ(τ|x) R(τ). Multiply and divide by pθ(τ|x) and use the identity ∇p / p = ∇ log p:

$$
\nabla_\theta J = \sum_\tau p_\theta(\tau\mid x)\, R(\tau)\, \nabla_\theta \log p_\theta(\tau\mid x) = \mathbb{E}_{\tau\sim p_\theta}\big[R(\tau)\, \nabla_\theta \log p_\theta(\tau\mid x)\big]
$$

The gradient of an expectation has become an expectation of something we can compute, so we can estimate it by sampling. This is the *score-function* or *likelihood-ratio* estimator, and its RL form is REINFORCE (Williams, 1992). *Beyond the lecture:* Sutton et al. (1999) proved the general policy-gradient theorem, which extends this to per-step rewards and function approximation.

**The environment drops out.** Take the log of the trajectory probability. It splits into environment terms and policy terms, and the environment terms do not depend on θ, so their gradient is zero:

$$
\nabla_\theta \log p_\theta(\tau\mid x) = \sum_t \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

This is why RL works with a black-box environment: we need samples from it, never its derivatives. For a language-model agent, each action a\_t is a string of m\_t tokens u\_{t,1…m\_t}, so log πθ(a\_t|h\_t) is the sum of the token log-probabilities. That is exactly the computation SFT already performs.

**REINFORCE in one line.** With one sampled trajectory, the estimate is R(τ) Σ\_t ∇ log πθ(a\_t|h\_t). As a loss to minimize:

$$
\mathcal{L}_{\mathrm{PG}} = -\sum_i R(\tau_i) \sum_t m_{i,t} \log \pi_\theta(u_{i,t} \mid u_{i,<t})
$$

The mask m\_{i,t} is 1 for tokens the policy sampled (including the end-of-turn token) and 0 for prompt and tool-output tokens, which the policy did not choose. L9 puts it memorably: "we just do masking and rescaling of the standard SFT loss computation". The only new ingredient is one scalar per trajectory, shared by all its generated tokens.

**The training loop** has four steps (L9): collect (sample task instances and roll out the agent), evaluate (compute each trajectory's reward), form the loss (weight action log-probabilities by reward), and update (backpropagate, change θ, and collect again with the new policy). L11 draws the same loop as sample → score → update.

**ReST and expert iteration are a special case.** Before REINFORCE, L9 introduces *Reinforced Self-Training* (ReST; Gulcehre et al., 2023) and ReST-EM (Singh et al., 2023): *grow* a dataset by sampling from the current policy and computing rewards, *improve* by filtering to high-reward trajectories and running SFT on them, and repeat. The loss is plain SFT on the kept set, −Σ\_{τ: R(τ)=1} Σ\_t log πθ(a\_t|h\_t). With binary rewards this is literally the REINFORCE loss, because multiplying by R ∈ {0, 1} keeps successes and zeroes out failures. L9 notes the practical differences: ReST collects large batches, trains for several steps on each, and aggregates datasets across rounds. The same loop appears as STaR (Zelikman et al., 2022) in L5 and as "expert iteration" in L8, where MAI-Thinking-1 trains on its own passing reasoning runs. Its general name is *rejection-sampling fine-tuning*.

Common misconception: "ReST is not RL because it uses an SFT loss." It is REINFORCE with a 0/1 weight and batched, somewhat off-policy updates. What it lacks is a way to learn from failures, which the next section adds.

**Sanity check on sizes.** A GRPO-style step on L9's slide uses 3 task instances × 4 rollouts. A realistic agent run might use 64 tasks × 8 rollouts × 20 turns × 300 generated tokens ≈ 3 million generated tokens per update, each carrying the same scalar weight as the rest of its trajectory. That tells you where the difficulty is: one noisy number must be spread over millions of token decisions.

### 3. Baselines and advantages: making rewards relative

**The problem with raw rewards.** In plain REINFORCE every action in a successful trajectory is pushed up by the same amount, including bad ones, and a failed trajectory (R = 0) "produces no gradient at all" (L9). L11 shows the same on the bug-fix task: "This attempt contributes no update." Two things are wrong. Failures carry information that we waste. And the signal is not relative: if the policy already succeeds 99% of the time, another success is not news, yet REINFORCE treats it as a full-strength push.

**Advantage.** The fix is to ask how much better an action was than the policy's average. L9 defines the *advantage*:

$$
A^{\pi}(h,a) = Q^{\pi}(h,a) - V^{\pi}(h)
$$

Q^π(h, a) is the expected reward if the agent takes action a after history h and then follows π. V^π(h) is the expected reward from h under π, averaged over the policy's own action choices. L9's example: after "8 → higher, 12 → lower", the number is 9, 10 or 11 and two guesses remain. Guessing 10 splits the three candidates, so one more guess always finishes: A(h, 10) > 0. Guessing 11 leaves two candidates and one guess if wrong: A(h, 11) < 0. Neither Q nor V is known, so we estimate the advantage from the sampled outcome: Â\_t = R(τ) − b(h\_t), where the *baseline* b(h\_t) is an estimate of V^π(h\_t).

**Why a baseline does not bias the gradient.** The baseline term contributes E\[b(h) ∇ log πθ(a|h)\] at each step. Expand the expectation over the action: b(h) Σ\_a πθ(a|h) ∇ log πθ(a|h) = b(h) Σ\_a ∇πθ(a|h) = b(h) ∇ Σ\_a πθ(a|h) = b(h) ∇ 1 = 0. Probabilities always sum to one, so their gradients sum to zero. The key condition, which L9 states explicitly, is that the baseline depends only on the history, not on the action being scored. Common misconception: "any baseline is fine." A baseline that uses a\_t itself, or later information from the same sample, can bias the estimator.

**Why it reduces variance: the two-armed bandit.** L9 works this example exactly, and it is the best intuition pump in the course. One parameter θ, p = σ(θ) = 0.25 is the probability of guess A (reward 1), and 1 − p = 0.75 of guess B (reward 0). The score of A is ∂ log p/∂θ = 1 − p = 0.75; the score of B is −p = −0.25.

| Baseline b | Gradient if A sampled (prob 0.25) | Gradient if B sampled (prob 0.75) | Mean | Standard deviation |
| --- | --- | --- | --- | --- |
| 0 (plain REINFORCE) | (1 − 0)·0.75 = +0.75 | (0 − 0)·(−0.25) = 0 | 0.1875 | 0.325 |
| 0.25 | +0.5625 | +0.0625 | 0.1875 | 0.217 |
| 0.5 | +0.375 | +0.125 | 0.1875 | 0.108 |

The mean stays at the true gradient, 0.1875, while the spread drops by a factor of three (the b = 0.25 row is computed by this sheet's calculator program; L9 shows b = 0 and 0.5). Look at what b = 0.5 does to a failure: sampling B now gives Â = −0.5 and a *positive* gradient on θ, because lowering p(B) raises p(A). "The baseline adds a learning signal from failure while preserving the expected gradient." L9's interactive plot of running averages shows both estimators converge to 0.188, the baseline one with a spread of 0.108 instead of 0.325.

*Beyond the lecture:* the variance-minimizing constant baseline is not exactly the mean reward. It is b\* = E\[‖∇ log π‖² R\] / E\[‖∇ log π‖²\], a reward average weighted by squared score. The mean reward is the standard, near-optimal choice, and the value function V^π(h) is its history-dependent version.

**Choices of baseline define algorithms.** L9 lists four: a constant (the bandit), a running mean of recent rewards (adapts as the policy improves), a trained value model V\_φ(h\_t) (actor–critic methods and PPO), and the mean reward of a group of rollouts on the same task (GRPO). "Both lines are different ways to estimate the same ∇J."

**Reward-to-go.** If rewards arrive during the episode, an action cannot influence rewards that came before it. So weight a\_t only by the *reward-to-go* R\_t = Σ\_{t'>t} r\_{t'}. L9: "Earlier rewards do not depend on a\_t, so dropping them cuts variance without adding bias." The proof is the same zero-mean argument as for baselines: a past reward acts like a history-dependent baseline. In Number Search and the bug-fix task, reward arrives once at the end, so R\_t = R(τ) for every action.

**What baselines do not solve** (L9's summary slide). A baseline marks a whole trajectory as better or worse than expected, but every action in it still gets the same Â. In L9's picture, Â = +0.5 lands on guesses 8, 12, 10 and 11 equally. Telling a good step from a bad one inside the same trajectory is the *credit assignment* problem, and it needs either a value estimate per history or finer rewards.

### 4. Critics, temporal-difference errors and GAE

**Expected reward-to-go from a history.** L11 makes the value function concrete. Take trajectory B, a failed bug-fix attempt, and stop at history h\_3. Imagine continuing ten times from h\_3 with the same rollout policy μ. Three continuations succeed, so the estimate of V^μ(h\_3) = E\_μ\[R\_3 | h\_3\] is 3/10 = 0.3. B's own reward-to-go at h\_3 is 0, but the history was not hopeless: from there, the policy succeeds 30% of the time.

**Learning the value function.** We cannot afford ten fresh continuations per history, so we train a *critic* V\_φ(h) to predict reward-to-go with squared error, L\_V(φ) = E\_t\[(V\_φ(h\_t) − R\_t)²\]. L11's numbers: with the ten outcomes at h\_3 (three 1s, seven 0s), predicting 0.6 gives mean squared error (3·0.16 + 7·0.36)/10 = 0.30. The best constant prediction is the mean, 0.3, with error 0.21. Squared-error regression learns the conditional mean, which is exactly the value (Ranzato et al., MIXER, 2016).

**Two ways to build a critic** (L11). A *separate value network* has its own body and output layer, trained entirely by the value loss; InstructGPT did this. A *value head on the policy body* is a small linear layer reading the policy's hidden state, with a stop-gradient so that the value loss trains only the head; MIXER did this. The separate network costs a second large model in memory; the shared body saves memory but couples two objectives.

**Temporal-difference (TD) error.** With a critic, we can score a single step by comparing values before and after it:

$$
\delta_t = r_{t+1} + \gamma V_\phi(h_{t+1}) - V_\phi(h_t)
$$

r\_{t+1} is the reward after action a\_t, γ is the discount (L11 uses γ = 1), and V\_φ(h\_{t+1}) is set to 0 after the episode ends. On trajectory B's last three actions the critic reads 0.3 → 0.6 → 0.4 → 0.0, so δ\_3 = +0.3 (a\_3 made success more likely), δ\_4 = −0.2 and δ\_5 = −0.4. Even inside a failed trajectory, a\_3 was a good move. This is the "helpful turn inside a failure" that L11 illustrates on its turn-level slide.

**Generalized advantage estimation (GAE).** A one-step TD error has low variance but trusts the critic completely. The full return R\_t − V(h\_t) trusts the critic not at all but is noisy. GAE (Schulman et al., 2016) blends them with a parameter λ in \[0, 1\]:

$$
\hat{A}_t = \delta_t + \gamma\lambda\,\hat{A}_{t+1}, \qquad \hat{A}_T = 0
$$

L11's example with λ = 0.5: Â\_3 = 0.3 + 0.5(−0.2) + 0.25(−0.4) = 0.1. The calculator program in Hands-on shows the whole family on the same numbers: λ = 0 gives Â\_3 = 0.3 (pure TD), λ = 0.5 gives 0.1, and λ = 1 gives −0.3, which equals R\_3 − V(h\_3) = 0 − 0.3 (pure Monte Carlo). Low λ means low variance but bias from critic errors; high λ means unbiased but noisy.

| Advantage estimator | Formula | Bias | Variance | Needs |
| --- | --- | --- | --- | --- |
| Raw return (REINFORCE) | R(τ) | none | highest | nothing |
| Reward-to-go minus baseline | R\_t − b(h\_t) | none if b ignores a\_t | lower | a baseline |
| Group-relative (GRPO) | R\_j − mean of group | none (up to a scale factor) | lower | G rollouts per task |
| GAE, λ = 1 | R\_t − V\_φ(h\_t) | none | moderate | a critic |
| GAE, 0 < λ < 1 | Σ (γλ)^k δ\_{t+k} | some, from critic errors | low | a critic |
| One-step TD, λ = 0 | δ\_t | most | lowest | a good critic |

**Process reward models as a surrogate.** Instead of learning value from outcomes, L11 shows learning step correctness from human annotation: a *process reward model* (PRM) such as Lightman et al.'s "Let's Verify Step by Step" scores each reasoning step. In their example, an annotator marks "x = 7" wrong after 5x = 6x − 14 (the correct result is x = 14). A PRM gives dense, per-step signal without rollouts, but costs labeling and can be exploited like any learned reward.

**Why LLM RL often drops the critic.** *Beyond the lecture:* for language-model agents a critic is expensive (another model the size of the policy, trained alongside it) and hard to train well. Values must be predicted at every token from a sparse final reward, and a poor critic injects bias through the TD errors. This is the motivation GRPO's authors give (L9, citing DeepSeekMath Fig. 4): replace the learned value model with a group of samples.

### 5. Group-relative advantages: GRPO, RLOO and DrGRPO

**The idea.** Instead of learning V(h), sample the policy G times on the same task instance and use the group's mean reward as the baseline for every history in the group. "No separate model needed!" (L9). GRPO (Group Relative Policy Optimization; Shao et al., 2024, in the DeepSeekMath paper) also divides by the group's reward standard deviation:

$$
\hat{A}_j = \frac{R(\tau_j) - \bar{R}}{\sigma_R}, \qquad \bar{R} = \frac{1}{G}\sum_{k=1}^{G} R(\tau_k), \qquad \sigma_R = \mathrm{std}\{R(\tau_1),\dots,R(\tau_G)\}
$$

On L9's four Number Search trajectories (rewards 1, 1, 0, 0), R̄ = 0.5 and σ = 0.5, so the advantages are +1, +1, −1, −1. Each task instance in a batch is normalized with its own statistics. L9's batch has three instances:

| Task instance | Rewards of 4 rollouts | Group mean | GRPO advantages | DrGRPO advantages (no σ) |
| --- | --- | --- | --- | --- |
| x1, hidden 11 | 1, 1, 0, 0 | 0.50 | +1, +1, −1, −1 | +0.5, +0.5, −0.5, −0.5 |
| x2, hidden 3 | 1, 0, 0, 0 | 0.25 | +1.73, −0.58, −0.58, −0.58 | +0.75, −0.25, −0.25, −0.25 |
| x3, hidden 7 | 1, 1, 1, 0 | 0.75 | +0.58, +0.58, +0.58, −1.73 | +0.25, +0.25, +0.25, −0.75 |

The GRPO loss (without the ratio, clipping and KL terms, which L11 adds) is −(1/G) Σ\_i Σ\_j Â\_ij Σ\_t log πθ(a\_ij,t | h\_ij,t), with i indexing task instances and j the group. L10 tells the same story for a search agent: three attempts at a CMU trivia question return "Herbert Simon" (reward 0) and "Allen Newell" twice (reward 1); the first is below the group average and is pushed down, the other two are pushed up.

**The group mean is (almost) a leave-one-out baseline.** *Beyond the lecture:* strictly, a baseline for sample j must not depend on sample j itself. The group mean includes R\_j, but a line of algebra shows R\_j − R̄ = ((G−1)/G)(R\_j − R̄\_{−j}), where R̄\_{−j} is the mean of the other G − 1 rewards. So mean-centering equals the unbiased *leave-one-out* baseline times a constant. That is the RLOO estimator (REINFORCE Leave-One-Out; Kool et al., 2019; Ahmadian et al., 2024, who found it matches or beats PPO for RLHF).

**Degenerate groups.** If all G rewards are equal, every advantage is zero: \[0, 0, 0, 0\] and \[1, 1, 1, 1\] both give no gradient (L9 slide 41; L11 slide 37). An all-fail group means the task may be too hard for the current policy; an all-pass group means it is too easy. L9 lists the remedies: choose different task instances, broaden exploration, add demonstrations, or supply a more informative reward. L11 adds a diagnosis step: before choosing a remedy, check verifier quality (is a valid solution being rejected?), current capability (does a stronger model's demonstration succeed?) and exploration (do the trajectories even differ?). DAPO's *dynamic sampling* (L11 slide 44) handles this in the data loader: skip groups with identical rewards and keep sampling until the batch has enough mixed groups.

**The two biases DrGRPO removes.** Liu et al. (2025), in "Understanding R1-Zero-Like Training", point out two normalizations in GRPO that change which samples count (L9 slides 39–40):

1. **Standard-deviation normalization.** σ\_R is measured inside each group, so it differs across task instances. For binary rewards with success rate p, σ = √(p(1−p)): 0.5 at p = 0.5 but only 0.1 at p = 0.99. Dividing by σ therefore up-weights questions the policy almost always passes or almost always fails. In the table above, the single success on x2 gets +1.73 under GRPO but +0.75 under DrGRPO.
2. **Response-length normalization.** GRPO averages each response's token terms, (1/|y\_j|) Σ\_t. Each response then gets the same total push regardless of length, so a long wrong answer is penalized less *per token* than a short wrong one. The policy "drifts toward longer wrong answers" (L9). DrGRPO replaces 1/|y\_j| with 1/C, a global constant; the paper uses the generation budget.

DrGRPO's advantage is simply Â\_j = R(τ\_j) − R̄, and each generated token gets Â\_j / C. "Rewards stay fixed; the relative weights of task instances and responses change" (L9). The calculator program in Hands-on makes the length effect concrete. With Â = −1 and C = 4096, GRPO puts −1/100 on each token of a 100-token wrong answer but only −1/4000 on each token of a 4000-token one. DrGRPO puts −1/4096 on every token, so the long wrong answer receives about 40 times more total push-down than the short one.

Common misconception: "dividing by σ is harmless normalization, like batch norm." It is harmless only if all groups have similar spread. Because it is per group, it changes the relative weight of questions, which changes what the gradient optimizes. Common misconception: "length normalization is neutral." It creates an incentive about length that has nothing to do with correctness.

**L9's unifying table.** Every method so far computes ∇J ≈ Σ\_t w\_t ∇ log πθ(a\_t | h\_t) and differs only in the weight w\_t: ReST-EM uses w = 1 on successful trajectories and 0 otherwise; REINFORCE uses w = R(τ); GRPO and DrGRPO use w = Â\_j, the reward relative to the other rollouts on the same task. PPO, next, uses a GAE advantage from a critic.

### 6. Off-policy data: importance sampling and stale rollouts

**Why data goes stale.** Everything so far assumed on-policy data: the trajectories came from the current πθ. Real systems break this in two ways. First, to use expensive rollouts efficiently, PPO-style methods take several gradient steps on the same batch, so after the first step the batch is slightly old. Second, asynchronous systems (section 9) keep generating while the learner updates, so "some completed trajectories now come from an earlier policy version" (L11). L11 names the two policies: the *rollout* or *behaviour* policy μ that generated the data, and the *learner* policy πθ being updated. Its example: at one history, μ gave "check None explicitly" 0.40 and πθ now gives it 0.70; μ gave "use get(…, 3)" 0.40 and πθ gives 0.20.

**Importance sampling (IS).** To estimate an expectation under πθ using samples from μ, reweight each sample by how much more (or less) likely it is under πθ:

$$
\mathbb{E}_{a\sim\pi_\theta}[R(a)] = \mathbb{E}_{a\sim\mu}\Big[\frac{\pi_\theta(a\mid h)}{\mu(a\mid h)} R(a)\Big]
$$

In L11's example the correct edit gets weight 0.70/0.40 = 1.75 and the incomplete edit gets 0.20/0.40 = 0.50. The identity holds whenever μ gives non-zero probability to every action πθ might take.

**The trajectory ratio explodes.** For a whole trajectory the environment terms cancel again, and the weight is a product of per-action ratios, w(τ|x) = Π\_t πθ(a\_t|h\_t) / μ(a\_t|h\_t). L11's arithmetic: if every action ratio is only 1.05, a 100-action trajectory gets 1.05^100 ≈ 132 (the calculator gives 131.5). With 0.95 per action it gets 0.006. "A few samples can dominate." CTPO (Zhang et al., 2026) defines the cumulative ratio ρ\_t^cum through token t and shows its spread grows at later positions in tool-using math rollouts.

**Per-token ratios are an approximation.** Because of the explosion, PPO, GRPO, DAPO and CISPO use only the current token's ratio ρ\_t = πθ(u\_t|u\_\<t) / μ(u\_t|u\_\<t). That ignores the fact that earlier actions change which histories are reached. L11's example: μ adds a None check with probability 0.40, πθ with 0.10. At the next step (run tests), both give 0.50, so the next-action ratio is 1, but "reaching this history is 0.10 / 0.40 = 0.25 as likely". The per-token ratio silently treats that history as if the new policy would visit it just as often.

**Which actions enter the weight** (L11, after CTPO Table 1):

| Method | Ratio used for token t | Trade-off |
| --- | --- | --- |
| PPO, GRPO, DAPO, CISPO | current token only, ρ\_t | low variance; ignores history shift |
| CTPO | cumulative through t, ρ\_t^cum | accounts for how h\_t was reached; variance grows with t |
| Full ratio | all actions, w(τ) | exact but explodes on long trajectories |
| GSPO | whole response, length-normalized (geometric mean) | one weight per response, matches a sequence-level reward |

**A hidden source of off-policyness.** *Beyond the lecture:* even "on-policy" training is slightly off-policy in practice. The inference engine that samples rollouts (vLLM or SGLang, with their own kernels and often lower precision) assigns slightly different probabilities than the training framework computing πθ on the same weights. Yao, Liu and colleagues (2025) showed this *training–inference mismatch* can destabilize RL, and proposed truncated importance sampling: multiply each token's loss by min(π\_train/π\_infer, C) using the inference engine's recorded log-probs. The lesson: always record the sampler's log-probabilities with each rollout, and treat μ as "the engine that actually sampled", not "the same weights".

### 7. Stable updates: PPO clipping, its descendants, KL anchors and entropy

**Why limit an update?** Importance weights can be large, so a few stale samples can dominate a step, and a big step can move the policy somewhere its own data no longer describes. *Beyond the lecture:* TRPO (Schulman et al., 2015) enforced a hard KL "trust region" around the old policy; PPO (Schulman et al., 2017) replaced it with a cheap clipped objective, which is why PPO became the default.

**Clipping.** clip(ρ, ℓ, u) replaces a ratio outside \[ℓ, u\] with the nearest bound; PPO uses ℓ = 1 − ε and u = 1 + ε with ε = 0.2. PPO's per-token objective, to maximize, is

$$
J_{\mathrm{PPO}}(\theta) = \mathbb{E}_t\big[\min(\rho_t \hat{A}_t,\ \mathrm{clip}(\rho_t, 1-\epsilon, 1+\epsilon)\,\hat{A}_t)\big]
$$

The min makes it pessimistic. For a helpful token (Â > 0), the objective stops rising once ρ > 1 + ε: no extra gain from pushing its probability further. For an unhelpful token (Â < 0), it stops rising once ρ < 1 − ε. But when the ratio has moved the *wrong* way (Â > 0 with ρ < 1 − ε, or Â < 0 with ρ > 1 + ε), the unclipped term is the smaller one, so the gradient still flows and pulls the token back. The calculator's case table shows all four cases. At θ = μ every ratio is 1, and the gradient of J\_PPO equals the ordinary policy gradient with advantage Â.

**The descendants differ mainly in the ratio and the clip rule** (L11's summary table, slide 35):

| Algorithm | Weight from reward | Learned critic? | Importance ratio | Clipping |
| --- | --- | --- | --- | --- |
| REINFORCE | reward-to-go R\_t | no | none (fresh rollouts) | none |
| PPO | GAE from a critic | yes | current token ρ\_t | min of raw and clipped terms |
| GRPO | group comparison | no | current token ρ\_t | same as PPO |
| CISPO | group comparison | no | current token ρ\_t | clipped ratio as a fixed weight |
| GSPO | group comparison | no | whole response, length-normalized | PPO minimum on the response ratio |
| DAPO | group comparison | no | current token ρ\_t | PPO minimum with a higher upper bound |

- **DAPO** (Yu et al., 2025) raises the upper clip bound ("clip-higher"; the paper uses ε\_low = 0.2, ε\_high = 0.28) so that low-probability tokens with positive advantage can grow faster. That counters entropy collapse. DAPO also adds dynamic sampling, a token-level loss average over the whole batch (so long responses are not down-weighted per token), and a soft penalty for over-long responses. *Beyond the lecture:* DAPO reports 50 points on AIME 2024 with Qwen2.5-32B, beating DeepSeek-R1-Zero-Qwen-32B's 47 with half the training steps.
- **CISPO** (MiniMax-M1, 2025) uses the clipped ratio as a *stop-gradient weight*: J = E\_t\[sg(c\_t) Â\_t log πθ(u\_t|u\_\<t)\]. PPO drops the gradient of clipped tokens entirely; CISPO keeps every token's gradient but caps how much a stale token can count. The MiniMax team reports this mattered for rare "reflective" tokens (such as "However" or "Recheck") that PPO clipping kept removing, and a 2× speed-up over DAPO in a controlled comparison.
- **GSPO** (Zheng et al., Qwen, 2025) uses one ratio per response, the geometric mean of token ratios (πθ(y|x)/μ(y|x))^{1/|y|}, and clips at the sequence level. The unit of the ratio then matches the unit of the reward. Qwen reports better stability for mixture-of-experts models. L7's CUA-Gym trains with GSPO.

**Reference-model KL.** L11 (citing DeepSeekMath's GRPO objective) adds a penalty that keeps the policy near a fixed *reference model* π\_ref, usually the SFT checkpoint: max\_θ J\_policy − β D\_KL(πθ ‖ π\_ref), with β setting the strength. Keep three policies apart: μ generates the batch and supplies the IS denominator; πθ is being trained; π\_ref stays fixed as an anchor. *Beyond the lecture:* there are two placements. Classic RLHF (InstructGPT) subtracts β log(πθ/π\_ref) from the reward at each token. GRPO adds a KL term directly to the loss, estimated per token with Schulman's unbiased, always-positive "k3" estimator r − 1 − log r, where r = π\_ref/πθ. The calculator shows k3 has a third of k1's standard deviation on L11's 0.5/0.5 versus 0.8/0.2 example. Several reasoning-RL recipes, DAPO and DrGRPO among them, drop the KL term, because verifiable rewards are harder to exploit than a learned reward model and the anchor slows learning.

**Entropy for exploration.** An entropy bonus, max J\_policy + α H(πθ), rewards a broader next-token distribution (PPO §5). L11's caveat: breadth "can help the agent try other actions", but "it does not guarantee that those actions will be useful". The failure it targets is *exploration collapse* (L11 slide 47, citing DAPO): at one history the probabilities go from A 0.20, B 0.60, C 0.20 to A 0.01, B 0.98, C 0.01. Almost every sample then chooses B, groups become identical, advantages become zero and learning stalls. L11's practical advice is to check whether trajectories actually differ. L10 shows the healthy case: Tongyi DeepResearch's training reward rises while policy entropy "stays relatively stable".

Common misconception: "clipping makes PPO a trust-region method with a guarantee." Clipping only removes the incentive to move further on the clipped tokens. Many small updates, large learning rates or many epochs can still push the policy far away, which is why practitioners also monitor the KL to the rollout policy and the *clip fraction* (the share of tokens whose ratio fell outside the band).

### 8. Rewards, task selection and credit assignment in multi-turn agents

**Reward reliability comes first.** L11's slogan is "Reliable rewards: match task difficulty and verify the behavior you actually want." Most agent RL uses *verifiable rewards* (RLVR): unit tests (L6, L11), exact-match answers (Search-R1 in L10), or programmatic state checks (L7's CUA-Gym). Two failure types matter:

- **False negatives** reject valid solutions. L11's example verifier requires the exact phrase `value is None`, so a correct fix written differently gets 0. The results are reward noise and benchmark saturation: L11 cites audits placing plateaus near 81% on SWE-bench Verified (many remaining failures had flawed tests), about 70% on τ-bench Airline and about 92% on τ-bench Retail.
- **False positives** reward invalid solutions, and RL will find them. If training tests only `retries=0`, the patch `return 0` earns reward 1 while failing the other three cases. L11 lists coding-agent shortcuts documented in MAI-Thinking-1: finding the published solution online, copying a later fix from git history, and making tests pass without fixing the bug. It also cites PostTrainBench, where an agent used a grading API key to generate training data despite an explicit restriction. The defence is independent checks: held-out tasks, the behaviours the training verifier missed, and inspection of tool calls and repeated actions. "If reward rises without independent improvement, inspect trajectories for shortcuts."

**Partial and auxiliary rewards.** Partial credit reduces degenerate groups. In L11's example, four trajectories pass 0/4, 1/4, 2/4 and 1/4 checks. With success-only reward all advantages are 0; with 0.25 per check they become −0.25, 0, +0.25, 0. But "the model may learn to increase the added reward without improving the task". L11's two OpenAI cases: a bug that credited superficial web-tool calls led GPT-5.1 to use the browser as a calculator, and a persona reward that favoured "goblin" and "gremlin" metaphors spread creature metaphors beyond the persona. For open-ended reports, L10's DR Tulu uses rubric rewards that *evolve* during training as the agent discovers new failure modes. Its ablation averages over HealthBench, ScholarQABench v2 and DeepResearch Bench and compares no RL, random rewards, initial rubrics only, and evolving rubrics.

**Credit assignment: tokens, turns, trajectories.** A multi-turn agent trajectory interleaves policy tokens (reasoning, tool calls, answers) with environment tokens (tool outputs, page contents). The loss runs only over policy tokens, via the mask m\_t. Tool outputs are context, never targets; Search-R1, for example, masks retrieved passages out of the loss. The question is what weight each policy token gets:

| Granularity | Where the weight comes from | Lecture example | Strength | Weakness |
| --- | --- | --- | --- | --- |
| Trajectory | one outcome advantage shared by all tokens | GRPO in L9, L10 | cheap, unbiased | cannot tell a good turn from a bad one |
| Turn | turn-level rewards, or a critic evaluated at turn boundaries | L11 slides 9–16 | credits the helpful turn inside a failure | needs a turn reward or a good critic |
| Step, via a learned judge | process reward model | L11, Lightman et al. | dense signal without rollouts | labeling cost, hackable |
| Token, via a teacher | on-policy distillation: reverse KL to a teacher at the student's histories | L11 slides 50–53 | a target for every token | needs a stronger teacher |
| Across episodes | reward for a later task's success | L4's SAGE | credits actions whose value appears later | more complex rollouts |

L11's point about turns is that "a successful trajectory can contain a mistake; a failed trajectory can contain a helpful turn", and a group weight cannot see either. L4 gives a striking example of cross-episode credit. Whether saving a skill was worthwhile only shows up in a later task, so SAGE puts two related tasks into one rollout and rewards task 1 with r₁ + 1\[both succeed\]·1\[task 2 reused its skill\]. On AppWorld, scenario completion rises from 55.4 (outcome only) to 56.6 (both tasks succeed) to 60.7 (successful skill reuse).

**Teachers as dense rewards.** When the student rarely succeeds, L11 recommends a warm start from demonstrations and a curriculum from learnable to harder tasks, keeping earlier tasks in the mix and measuring on a fixed evaluation set. On-policy distillation (Agarwal et al., GKD) samples histories from the student and minimizes the reverse KL to a teacher's next-action distribution at those histories. In L11's example the student gives 0.5/0.5, the teacher 0.8/0.2, and the KL is 0.223. On-policy self-distillation (OPSD) uses a frozen copy of the starting model as teacher, given a verified solution in its context.

### 9. The RL training system: rollout workers, inference engine, rewards and trainer

**Four jobs, very different hardware profiles.** An RL step for agents has four jobs. (1) *Generation*: an inference engine samples tokens; it is memory-bandwidth bound and benefits from batching and KV caching. (2) *Environment execution*: sandboxes run tools, tests, browsers or search APIs; this is CPU- and network-bound, and its latency is long-tailed. (3) *Reward computation*: verifiers, test runners, rubric judges or reward models. (4) *Training*: forward and backward passes over the collected tokens, compute bound and sharded across GPUs. L1 lists what a training framework must share across these: prepare data and collect rollouts, coordinate distributed workers, and checkpoint, evaluate and reproduce runs. Its examples are SkyRL and Miles; L1 draws the pipeline as rollouts → workers → rewards → update.

**Synchronous RL wastes time on stragglers.** In the synchronous design, "every trajectory in a batch must finish before the policy update starts" (L11, citing AReaL). Agent rollouts vary enormously in length: one search agent answers after two tool calls, another takes twenty. Generation GPUs sit idle waiting for the slowest trajectory, then the trainer runs while generators wait.

**Asynchronous RL overlaps them.** "Rollout workers keep generating while the learner updates from completed trajectories" (L11). L10 shows the agent version from Tongyi DeepResearch and DR Tulu: score each trajectory as it finishes, assemble a batch from completed ones, and update. L10 lists further practical efficiencies: cached tool results, robust API handling and background task curation. The price is staleness: some trajectories were generated by a policy a few versions old, which brings back sections 6 and 7. *Beyond the lecture:* AReaL (Fu et al.) bounds the allowed staleness and uses a PPO variant that separates the behaviour policy from the proximal anchor; it reports up to 2.77× training speed-up over synchronous systems.

**A typical architecture.** *Beyond the lecture*, but common to verl (HybridFlow), SkyRL, slime/Miles, AReaL and OpenRLHF:

| Component | Role | Typical implementation |
| --- | --- | --- |
| Task sampler / data loader | picks task instances, filters degenerate groups, manages the curriculum | Python service; DAPO-style dynamic sampling lives here |
| Rollout workers | run the agent loop: call the engine, parse tool calls, execute tools, append observations | async Python with many concurrent episodes |
| Inference engine | samples tokens and returns their log-probs under μ | vLLM or SGLang servers |
| Environment sandboxes | isolated, resettable environments with injected state | Docker containers, mock web apps (CUA-Gym's 94 mock web apps), VMs |
| Reward service | runs tests, checks final state, calls judge models | worker pool; often the slowest stage |
| Trainer (learner) | computes advantages, losses and updates; holds πθ, and optionally π\_ref and a critic | FSDP or Megatron-LM |
| Weight sync | pushes new weights from trainer to engines | NCCL broadcast, or shared memory when colocated |
| Buffer and logger | stores trajectories with version tags; tracks reward, KL, entropy, clip fraction and lengths | object store, experiment tracker |

Two placement strategies exist. *Colocated* systems time-share the same GPUs between engine and trainer, which is simple and memory-efficient but inherently synchronous. *Disaggregated* systems give each its own GPUs and stream data between them, which enables asynchrony and needs staleness control.

**Environments are infrastructure.** L7 argues that computer-use RL needs *simulated*, resettable environments, because real bookings cost money, affect real people and cannot be cleanly reset. CUA-Gym builds 94 mock web apps plus 16 desktop apps, 110 environments with 32,112 verified task–state–reward tuples, generating each world and its reward independently and then testing that they agree. Starting from 3,578 SFT demonstrations, GSPO on 10,858 verified tuples raises OSWorld-Verified success from 62.2% to 72.6% (L7). L6 makes the same point for code: SWE-Gym and R2E-Gym build runnable tasks whose tests fail before the fix and pass after it, and "validate the environment before collecting training trajectories".

**Where the cost goes.** *Beyond the lecture:* in agent RL, generation plus environment time usually dominates, often most of the wall-clock time, because each trajectory requires many sequential model calls and tool executions. The trainer sees only the finished tokens. That is why the big systems wins come from generation-side tricks: asynchrony, continuous batching, prefix caching of shared prompts across a group of G rollouts, partial rollouts that pause long generations across weight updates, and in-flight weight updates (PipelineRL). Memory also matters. PPO with a learned reward model holds four large models (policy, reference, reward model, critic); GRPO drops the critic, and dropping the KL term also removes the reference.

Common misconception: "asynchronous RL is just an engineering speed-up." It changes the algorithm. Once rollouts are stale, you are doing off-policy RL, and the ratio, clipping and staleness bound are part of the method's correctness, not tuning details.

### 10. Running policy-gradient RL at scale: sampler, trainer and the consistency between them

**From the formula to a system.** L12 (Gandhi) starts from the same update this sheet derived in sections 2–3, θ += Σ\_t (R(τ) − b(h\_t)) ∇θ log πθ(a\_t|h\_t), and asks which operations a framework must provide to compute it. Each symbol becomes a system call:

| Piece of the update | Operation | Who runs it |
| --- | --- | --- |
| h\_t, a\_t | env.state / env.step plus the agent harness | inference engine + environment ("sample") |
| R(τ) | env.verify (tests, answer checks, tool outcomes) | environment |
| πθ(a\_t\|h\_t) | forward: recompute log-probs with gradient tracking | trainer |
| ∇θ log πθ | backward | trainer |
| θ += … | optim\_step, then weight sync to the sampler | trainer, then sync |

L12 writes the step as five stages: 1 sample, 2 verify, 3 forward, 4 backward, 5 optim\_step + sync, then "repeat with the updated weights". Section 9 of this sheet named the same jobs; L12 adds that they fall into exactly two engines with opposite needs.

**Two workloads, two engines.** Sampling is decode-heavy and sequential: one token per sequence per step, no gradients, limited by memory bandwidth. Training is prefill-style and parallel: whole known sequences in one pass, full autograd, limited by arithmetic. So frameworks pair a specialized inference engine (vLLM, SGLang) with a specialized trainer (Megatron, FSDP2) rather than write one engine. Plain PyTorch maps neatly onto forward, backward and optimizer.step(), but nothing in it generates long multi-turn rollouts fast. L12 lists each engine's toolkit, and every item has a number or a catch that matters for RL:

| Engine | Optimization | What it does | Numbers or RL-specific catch (L12) |
| --- | --- | --- | --- |
| Sampler | KV caching | Store each past token's keys and values; compute q, k, v only for the new token | Llama-3-8B in bf16: 128 KB per token; one 32k-token trace ≈ 4 GB; 64 traces ≈ 256 GB. "Trades a lot of recomputation for a lot of memory." |
| Sampler | Prefix (radix) caching | Reuse KV for shared prefixes across requests | GRPO groups share the task prompt; a rollout's later turns share its earlier turns. Only works if tokens match exactly (SGLang RadixAttention, vLLM Automatic Prefix Caching) |
| Sampler | Continuous batching | Schedule per decode step; finished sequences leave, queued ones fill the slot | Orca (Yu et al., 2022); usually with chunked prefill, or disaggregated prefill and decode. Long-tailed agent episodes make it essential |
| Sampler | Speculative decoding / MTP | A drafter proposes k tokens (k = 4 on the slide); the policy checks them in one pass; rejection sampling keeps the exact distribution | The policy changes every step, so a frozen drafter's acceptance rate decays; train it online (SFT, distillation) |
| Trainer | Activation checkpointing | Keep only each layer's input; recompute internals during backward | Full recompute ≈ +33% compute; selective (attention-only) recompute costs far less |
| Trainer | Prefix sharing | Process a shared prompt once, with a tree attention mask, standalone position IDs and gradients accumulated from every branch | Snowflake ZoRRo: 80–95% of tokens in long-prompt GRPO batches are duplicate prompt tokens; up to 6× faster actor updates. AReaL-DTA: τ²-bench rollouts compress 9.43× as a prefix tree; up to 8.31× vs dense training |
| Both | Sharding (PP, CP, TP, EP) | Split layers, sequence, matrices or experts across GPUs | The sampler and trainer usually choose different layouts, so weights must be resharded at every sync |

Two of these are mirror images. Prefix caching (inference) and prefix sharing (training) both exploit GRPO's G rollouts on one prompt. KV caching stores to avoid recomputation; activation checkpointing recomputes to avoid storing. *Beyond the lecture:* the 128 KB figure follows from 32 layers × 8 KV heads × 128 dimensions × 2 tensors × 2 bytes, and the 64-trace example is one GRPO step of 8 tasks × 8 rollouts. In agent RL, KV memory, not FLOPs, often decides how many rollouts can run at once.

**Weight sync: the second arrow.** Only two flows connect the engines: trajectories go from sampler to trainer, and weights go back. L12 sizes the return flow. A full weight sync broadcasts every parameter to every inference rank, so a 1T-parameter model means about 2 TB per sync. Delta weight sync exploits the fact that about 99% of parameters are unchanged between RL updates once cast to bf16 (PULSE, Miahi and Belilovsky, 2026; the slide spells it "Mihai"). Sending only the changed entries cuts the volume roughly a hundredfold; the PULSE abstract reports over 100× less sync communication with bit-identical reconstruction. *Beyond the lecture:* the reason is that bf16 keeps 8 mantissa bits, so neighbouring values near 1.0 are about 0.0078 apart, and an RL step with a learning rate near 1e-6 rarely crosses half that gap.

**Why this matters for the algorithm.** Every one of these tricks carries a correctness condition, because the policy-gradient estimator assumes the samples came from the policy whose log-probs the trainer computes. Caches must match tokens exactly. Speculative decoding must stay distribution-exact. Resharded weights must be the trainer's weights. When any condition slips, the sampler's distribution μ (L12 writes π\_rollout) differs from the trainer's πθ (L12's π\_train), and section 6's importance-sampling machinery is needed even in a run that looks on-policy. The next subsection covers the three ways that happens.

### 11. Staleness and train–inference mismatch: keeping the gradient estimate honest

Section 6 treated off-policy data as one problem: the batch came from an older policy. L12 shows that a production system has three separate sources of gap between the sampler's distribution μ and the trainer's πθ, and each needs its own fix.

**Source 1: staleness from asynchrony.** L12's slide 25 (after PipelineRL and AReaL) draws both schedules on a GPUs × time grid. *Sync RL* co-locates the engines on the same GPUs: every GPU generates until the longest rollout ends (hatched "GPU idle" tails), then all GPUs run optim step 0 and optim step 1, then generate again. *Async RL* splits the GPUs: inference rows generate continuously while their bars darken as the weights advance through optim steps 0–3, and trainer rows run optim steps back to back. Agentic RL is often rollout-bound, so L12 suggests giving inference more GPUs, "e.g., 3:1 ratio". The slide's three conditions are the whole bargain: async "reduces GPU idle due to very long rollouts", "requires staleness/off-policy corrections", and requires continuous batching plus in-flight weight-update support in the engine.

**In-flight weight updates make μ a per-token quantity.** L12 shows SGLang's POST /pause\_generation endpoint, whose mode field has three options, followed by POST /continue\_generation:

| Mode | What happens to running requests | Consequence for the RL data |
| --- | --- | --- |
| abort (default) | Returned to the caller, like the abort endpoint with abort\_all | Partial rollouts are lost or restarted; each surviving trajectory has one policy version |
| retract | Moved back to the waiting queue; KV cache can be flushed and recomputed later | The prefix is re-prefilled under new weights; later tokens come from the new version |
| in\_place | Paused without changing request state; they keep their KV cache, so a later flush\_cache fails | Fastest resume; new tokens are sampled by new weights over a KV cache built by old ones |

With retract or in\_place, one trajectory contains tokens from several policy versions. *Beyond the lecture:* this is harmless for the estimator only if the sampler records each token's log-probability at the moment it was sampled. Then the denominator μ(u\_t|u\_\<t) is simply "whatever actually produced token t", and the per-token ratio of section 6 still applies. PipelineRL (Piché et al., 2025) is built on this idea and reports about 2× faster learning than conventional RL baselines on 128 H100 GPUs. AReaL instead bounds staleness explicitly; both are "bounded-staleness async RL" from the pattern table, with a different unit of freshness.

**Source 2: numerical mismatch with identical weights.** The trainer recomputes log-probs in stage 3 because the sampler's were computed without gradients and with different kernels, batch shapes and often precision. L12's metrics slide names the gap directly: importance\_weight\_max is the "worst token ratio, e.g. π\_train / π\_rollout", and spikes mean "mismatch or stale data; a few tokens dominate the update". *Beyond the lecture:* Thinking Machines (He et al., 2025) traced inference nondeterminism to kernels that are not batch-invariant; with batch-invariant kernels, sampler and trainer log-probs matched bitwise, the KL stayed at 0, and an RLVR run without importance weighting no longer collapsed. Qi et al. (2025) argue that training and sampling in FP16 instead of BF16 removes most of the gap. Yao, Liu and colleagues (2025) keep the engines as they are and correct with truncated importance sampling (M9).

**Source 3: discrete mismatch — the trainer scores a different action.** These bugs do not shrink with better numerics, because the token sequence or the sub-network itself differs:

- **Tokens (TITO).** Should rollouts travel as strings or tokens? L12's answer is tokens. Small string-space changes (a chat template adding whitespace) change tokenization, and "tokenization is one-to-one, but de-tokenization is many-to-one": the text "Hello" decodes from \[Hello\], \[H, ello\], \[He, llo\] or \[Hel, lo\]. If the model sampled He + llo and the trainer re-tokenizes, it scores the single token Hello, an action the policy never chose. The ratio for that sample is meaningless. M6's rollout record already stores token IDs for this reason.
- **Chat templates and sequence extension.** A harness has the *sequence extension* property when each turn's context starts with the previous turn's exact tokens. Harness A (append) keeps it: four turns become one datapoint with loss mask 0,1,0,1,0,1,0,1,0 over Task, A₁, O₁ … A₄, O₄, and one Â broadcast to every action token. Harness B (compact every two observations into S) breaks it: two datapoints, both containing Task, and "repeated task tokens have zero direct loss, but still require context computation". Qwen 3 and Qwen 3.5's default templates break it silently by stripping past reasoning, so frameworks such as Tinker and PrimeRL ship their own renderers. Tinker's documentation puts the cost at O(T) compute for a trajectory with extension versus O(T²) without. L12's rule: "Preserve exact prefixes and concatenate for as long as practical."
- **Mixture-of-experts routing (R3).** "Tiny numerical differences can select different MoE experts." Top-k routing is discontinuous, so a near-tie can send a token through a different sub-network in the trainer than in the sampler. Rollout Routing Replay (Ma et al., 2025) records the experts chosen at inference (the figure's select (1, 4)) and forces both training passes, old policy and update policy, to use them. The inference engine must therefore return routing decisions with each token. The R3 paper reports that this sharply cuts the training–inference KL and prevents collapse, outperforming GSPO and TIS on MoE models. GSPO (section 7) was Qwen's algorithmic answer to the same MoE instability; R3 is the systems answer.

| Source of μ ≠ πθ | Continuous or discrete | Shows up as | Fix at the source | Fix in the loss |
| --- | --- | --- | --- | --- |
| Staleness (async, several epochs) | continuous, grows with version lag | average staleness rising; clip fraction rising with lag | cap staleness; more inference GPUs | per-token ratio with clipping (section 7); decoupled or truncated weights (M9) |
| Kernel and precision differences | continuous, small per token | importance\_weight\_max > 1 at step 0 of a sync run | batch-invariant kernels; FP16 | truncated importance sampling |
| Re-tokenization | discrete | rare huge ratios on specific samples | token-in, token-out end to end | none: the sample is wrong, not reweightable |
| Template strips history | discrete (context differs) | prefix-cache misses; extra datapoints | extension-preserving renderer | none |
| MoE routing flip | discrete, per token per layer | ratio spikes on MoE models only | Rollout Routing Replay | sequence-level ratio (GSPO) helps partly |

The last column is the key lesson for this topic. Importance weights can correct a *distribution* shift. They cannot repair a sample whose tokens or computation path differ from what was sampled, because then there is no single action whose two probabilities form a meaningful ratio.

**Reading the logs.** L12's backup slide lists eight health metrics. The first four are learning health; the last four are system health.

| Metric | What it tells you | Warning sign (L12) |
| --- | --- | --- |
| Reward / pass@1 | Is the policy improving on the training tasks? | Flat for many steps, or rising while held-out evals fall (reward hacking) |
| pass@k | Coverage: can any of k samples solve it? | Falls while pass@1 rises: diversity is collapsing |
| Entropy | How much the policy still explores | Sudden collapse toward 0, or a jump (degenerate text) |
| importance\_weight\_max | Worst token ratio, e.g. π\_train / π\_rollout | Spikes: mismatch or stale data; a few tokens dominate the update |
| Grad norm | Size of each update before clipping | Spikes ahead of divergence; steady upward drift |
| Average staleness | How many weight versions old the data is | Creeping up: rollouts can't keep pace with training |
| Trainer MFU | How well the trainer GPUs are used | Drops from padding, imbalance or small microbatches |
| Timing: rollout, update, stall, total | Where the wall-clock time of a step goes | Stall > 0: the trainer is waiting on rollouts |

A useful inference: if importance\_weight\_max spikes in a synchronous run, staleness is zero by construction, so the cause must be source 2 or 3, not off-policyness.

Common misconception: "a synchronous run is on-policy, so it needs no ratio." Every run with separate sampler and trainer engines is slightly off-policy. Record the sampler's log-probs, measure the ratio at step 0, and keep a correction in the loss.

### 12. Where the RL loop lives: architectures, harnesses and new training regimes

**SPMD versus everything-as-a-service.** L12 contrasts two ways to wire the engines. In *Single Program Multiple Data* (SPMD; the slide's pseudocode is labelled "AReaL versions < 1.0"), one Python program runs on every GPU rank. Ranks 0–3 loop forward\_backward → optimizer.step → publish\_weights\_async; ranks 4–7 loop refresh\_weights\_if\_ready → rollout → enqueue\_trajectory. "Coordination lives in the program running on every rank": direct control, but less flexible. The alternative is *everything-as-a-service with a single controller*: a lightweight CPU orchestrator talks to an agent service, an env/reward service (Open Reward Standard, hosted e.g. by OpenReward or self-hosted), an inference service (SGLang/vLLM API), a trainer service (Tinker training API) and a weight-sync service. L12 gives two benefits: separation of concerns (researchers prototype a new algorithm in a small CPU loop, and projects release on their own schedules) and modularity (swap any service that speaks the same protocol). For this topic, the practical effect is that a new advantage estimator or loss from sections 3–7 becomes a change to the controller, not to a distributed training fork.

**Harness-agnostic rollouts.** Agents are trained inside real harnesses: L12 lists Codex, Claude Code, OpenHands, Pi, Hermes and Prime Agent. Writing custom rollout code per harness is the anti-pattern. The pattern (credited to Agent Lightning) is a middleman proxy that emulates inference APIs (Chat Completions, Responses, Anthropic) and records token IDs, log-probs and R3 routing data into a rollout store for the trainer. The harness sees text; the proxy keeps the exact tokens, which is how TITO and μ's log-probs survive an unmodified harness. Sub-agents and context compaction (Recursive Agent Optimization, 2026; Recursive Language Models, 2025) turn one episode into a tree of sequences that must share the final reward, an open credit-assignment question (Open problems).

**Scaling the sampler.** Because the orchestrator only sees an inference service, that service can grow elastically behind an inference-service controller, and its replicas can be heterogeneous (the slide pairs 8×H100 with 4×MI350). AstraFlow (Zheng et al., 2026) streams rollout data across regions into a trainer pool and also supports multi-policy training, such as multi-agent rollouts with heterogeneous policies. Each new hardware type widens source 2's numerical gap, so these designs lean on recorded log-probs and per-token correction.

**Online RL.** In online RL the production deployment is the sampler. L12 shows AReaL 2.0's design (an agent such as Hermes calls an ordinary base\_url and api\_key; data proxies record trajectories; a training service pushes weights back) and cites Cursor running online RL in production for Cursor Tab and for Composer, which gets "a new model checkpoint from real user interaction every 5 hours". *Beyond the lecture:* Cursor's Composer post (March 2026) says the short cycle keeps data "fully or almost-fully on-policy", which is the staleness argument of section 11 applied to a product.

**Multi-tenant, multi-LoRA RL.** Many LoRA runs can share one base model. L12's chart (SkyRL + Trajectory Labs, eight GSM8K runs on Qwen3-4B) shows eight serial jobs stretching to about 250 minutes against eight concurrent runs finishing near 90. "8 concurrent runs beat 8 serial runs in throughput", each run can be a different user, and it needs Grouped-GEMM/SGMV kernels (Punica, 2023). The Trajectory Labs post reports 2.81×, with the eighth experiment finishing at 5,433 s concurrently versus 15,244 s serially. Tinker "pioneered multi-tenant, multi-LoRA RL training and the decoupled training service design": a training client per run, a sampling client per LoRA checkpoint, and four calls (forward\_backward, optim\_step, sample, save\_state). Those calls are the operations of section 10's first table, so the policy-gradient update becomes the whole API. A sampling client bound to one checkpoint also makes the policy version, and hence μ, explicit.

Service boundaries, controllers and monitoring of long-running agent workflows in general are the subject of T13 (Workflow Orchestration and Agent Monitoring); sandboxing and credential isolation for the environment side are in T14 (Agent Safety and Security).

## Across the lectures

Two lectures carry the algorithms (L9 builds the foundations, L11 makes them stable and reliable), while six others show RL at work in specific agent domains and supply the systems and data context.

**L1 (Agents overview).** L1 lists "training systems" as one of the shared layers of agent engineering: prepare data and collect rollouts, coordinate distributed workers, checkpoint, evaluate and reproduce runs. It names SkyRL and Miles as example software and sketches the pipeline rollouts → workers → rewards → update. This is the system view that the later lectures fill in.

**L4 (Memory and skills).** L4 contributes a reward-design lesson rather than an algorithm. A skill's value only appears when a later task reuses it, so a single-task reward cannot credit the decision to save it. SAGE puts two related tasks into one rollout and adds a bonus when task 2 succeeds by reusing task 1's skill, raising AppWorld scenario completion from 55.4 to 60.7. It is a clean example of credit assignment across episodes.

**L5 (Planning).** L5 mentions that chain-of-thought "can be trained to increase the probability of a correct answer" (STaR, DeepSeek-R1), which is REINFORCE or rejection sampling applied to reasoning tokens. It also raises the motivating question for agents: larger models "execute longer tasks but self-condition more" on earlier mistakes (Sinha et al.), and L5 asks "Can reinforcement learning fix this?" That is the exposure-bias argument of L9 in a long-horizon setting.

**L6 (Coding agents).** L6 shows execution-reward RL in its simplest form: sample reasoning plus code, run the tests, make passing responses more likely, and sample again (DeepCoder, with a response-token limit raised from 16K to 32K during RL and a 64K budget at evaluation, compared against o3-mini on LiveCodeBench). For multi-step repair (R2E-Gym) it points out the core difficulty: the reward is terminal, and "a late failure does not identify which earlier decision was wrong". L6 also stresses that training tasks must be runnable and validated (SWE-Gym), which foreshadows L11's verifier discussion.

**L7 (Computer-use agents).** L7 places RL as the last stage of the pretrain → SFT → RL pipeline for GUI agents and argues that RL needs simulated, resettable environments. CUA-Gym supplies the numbers: 110 environments, 32,112 verified RLVR tuples, and GSPO on 10,858 of them lifting OSWorld-Verified from 62.2% to 72.6%. L7 is the only lecture whose headline RL result uses GSPO rather than GRPO.

**L8 (SFT).** L8 frames RL from the other side. SFT learns from "a target for every token"; RL from "one number per rollout". RL is "good at sharpening what the model can already attempt" and gets "stuck when the start is too weak, or the reward cannot be checked". L8 recounts DeepSeek-R1-Zero versus R1 (RL without SFT gave hard-to-read, language-mixing outputs) and cites OpenThoughts-Agent and MAI-Thinking-1 to argue that the SFT checkpoint should be chosen with RL in mind. It also names "expert iteration" as the loop in which the model trains on its own passing runs, which L9 formalizes as ReST.

**L9 (RL foundations, Fried).** L9 is the mathematical core. It motivates RL through three SFT failures (task mismatch, data mismatch, exposure bias), defines trajectories and the expected-reward objective, and presents ReST-EM as filtered SFT. It then derives the policy gradient with the log-derivative trick and shows that the environment drops out. It proves baselines are unbiased, quantifies their variance reduction on a two-armed bandit, and ends with GRPO's group-relative advantages and DrGRPO's removal of the standard-deviation and length normalizations. Its closing table unifies the methods as one gradient with different weights. It deliberately leaves out ratios, clipping and KL terms: "The advanced RL lecture covers ratios, clipping, and reference-model terms."

**L10 (Deep research agents).** L10 applies RLVR to search agents: Search-R1's exact-match reward, GRPO on groups of search trajectories, and asynchronous rollouts from Tongyi DeepResearch and DR Tulu. It writes out the full GRPO objective with clipping and a KL penalty. It then moves beyond verifiable answers: open-ended reports need rewards for coverage, relevance, factuality and supported citations, and DR Tulu's evolving rubrics outperform static rubrics and random rewards. L10 also shows SFT as an RL warm start: even 5% of the SFT data helps, and the full mixture gives the strongest RL results.

**L11 (Advanced RL, Neubig).** L11 turns L9's foundations into a working recipe with three themes: useful feedback, stable updates and reliable rewards. On feedback, it covers group baselines, reward-to-go, critics, TD errors, GAE and process reward models. On stability, it covers asynchronous RL, importance sampling, the explosion of trajectory ratios, CTPO's cumulative ratios, clipping in PPO and CISPO, reference-model KL and entropy bonuses, summarized in a six-algorithm table. On rewards, it covers degenerate groups, false negatives and positives, reward hacking, DAPO dynamic sampling, partial rewards and exploration collapse. It closes with teachers: curricula, distillation, on-policy distillation and self-distillation.

**How the ideas connect.** Read L9 and L11 as one arc. L9's baseline becomes L11's critic. L9's "fresh rollouts" assumption is dropped in L11 when asynchronous systems make data stale. L9's degenerate groups are diagnosed in L11 as verifier errors, capability gaps or collapsed exploration. The domain lectures (L6, L7, L10) show that the algorithm is rarely the bottleneck; the environment and the reward are.

**Where the lectures differ in emphasis.**

- *Standard-deviation normalization.* L9 presents DrGRPO's argument that dividing by σ biases the weighting of task instances. L11's summary table still defines "group comparison" as subtracting the mean and dividing by the spread. Both are correct descriptions of what is used in practice; the choice is live.
- *Entropy.* L10 shows Tongyi's entropy staying "relatively stable" during agentic RL, while L11 warns of exploration collapse and recommends entropy bonuses and checks on trajectory diversity. The difference is setting and recipe, not a contradiction.
- *What RL can do.* L8 is cautious (RL sharpens existing abilities and needs a good cold start). L5 is hopeful that RL can fix long-horizon self-conditioning. L11 sits between them: teachers, curricula and partial rewards are how you get RL started when the model rarely succeeds.
- *Algorithm choice.* L9, L10 and L11 centre on GRPO-style critic-free methods; L7's CUA-Gym result uses GSPO; L11 covers PPO's critic and GAE as the way to get turn-level credit that group baselines cannot provide.

### L12 · RL Systems (Gandhi): the machinery under the update

**What it contributes.** L9 and L11 gave the estimator; L12 shows the machine that computes it. Its first content slide annotates the policy-gradient update with system verbs (env.verify, env.step plus harness, forward, backward, optim\_step) and its last content slide, Tinker, exposes almost exactly those verbs as an API. In between it explains why the verbs split into a decode-heavy sampler (vLLM, SGLang) and a gradient-heavy trainer (Megatron, FSDP2), and what each needs: KV and prefix caching, continuous batching and speculative decoding on one side; activation checkpointing, prefix sharing and sharding on the other. Core concepts 10–12 hold the details and numbers.

**How it connects to L9.** L9's training loop had four steps (collect, evaluate, form the loss, update) and assumed fresh rollouts. L12's five-stage step adds the stage L9 never needed: sync the new weights back to the sampler and reshard them. It also gives L9's GRPO group a systems payoff. The G rollouts on one prompt are exactly what prefix caching and prefix sharing exploit (Snowflake ZoRRo: 80–95% duplicate prompt tokens, up to 6× faster actor updates). L9's loss mask reappears as L12's sequence-extension table, where observations get mask 0 and one Â is broadcast to every action token.

**How it extends L11.** L11 introduced asynchronous RL and the importance ratio πθ/μ to correct stale data. L12 agrees and adds three things. First, the engine-side requirements that make async possible: continuous batching and in-flight weight updates (SGLang's abort, retract and in\_place modes), which mean one trajectory can span several policy versions. Second, a GPU split ("e.g., 3:1" inference to training) for rollout-bound agent RL. Third, and most important for this topic, staleness is only one reason μ ≠ πθ. Numerical differences between engines, re-tokenized strings, chat templates that strip reasoning, and MoE routing flips all change the ratio, and the last three cannot be fixed by reweighting at all. L11 treated μ as "the older policy"; L12 effectively redefines it as "the exact computation that produced each token".

**Where it agrees and differs.** All three lectures agree that the per-token ratio with clipping is the working default. L11 frames GSPO as the stability fix for long and MoE responses; L12 presents R3 as a systems-level fix for the MoE case, removing the mismatch at its source rather than damping it. L11 stresses reward reliability; L12 adds the matching systems checks, a metrics table in which importance\_weight\_max, average staleness and stall time sit beside reward, pass@k and entropy. Earlier lectures' system talk (L1's SkyRL and Miles, L10's async rollouts) was descriptive; L12 makes it quantitative, from 128 KB of KV per token to 2 TB per full weight sync for a 1T-parameter model.

**What it adds beyond algorithms.** Two regimes change the shape of the problem. Online RL turns the product into the sampler (Cursor Composer: a new checkpoint from real user interaction every 5 hours). Multi-LoRA training lets eight concurrent runs beat eight serial ones in throughput on shared GPUs. Both keep the same update, but with a different answer to "who generated this token, with which weights?".

### L20 · Search over Trajectories (Fried): training for coverage

L20 is about spending inference compute: sample many trajectories, then select, refine or reuse them. Coverage, pass@k = 1 − (1 − p)^k, is the ceiling for all of it, and that puts a training question to this sheet: does the policy-gradient update raise p on the hardest tasks, or only on tasks the model already solves? The selection and search material is in T12, T9 and T5.

**Why a pass@1 reward can hurt pass@k.** With a 0/1 reward, the objective of Concept 1 is exactly pass@1. Raising it can mean pushing probability onto one solution the model already likes, so later samples repeat it and stop exploring others. This is the "sharpening" in open problem 5 and the L12 warning sign "pass@k falls while pass@1 rises". L20's slide 7 lists "incentivize diversity / optimize for pass@k in training" as a coverage lever and cites three fixes:

- **Rewarding the Unlikely** (He, Fried and Welleck, 2025). GRPO has a rank bias: it reinforces already-likely correct proofs and neglects rare ones. An unlikeliness reward up-weights rare correct solutions and improves pass@N across a wide range of N in formal theorem proving.
- **Differential Smoothing** (Gai et al., 2025/2026). Diversity collapse comes from selection and reinforcement bias, and the fix only changes rewards on correct trajectories. It improves both pass@1 and pass@k, with up to 6.7% gains on AIME24.
- **MaxRL** (Tajwar et al., 2026). With binary terminal rewards, expected-reward RL is only a first-order approximation of maximizing the likelihood of correct rollouts. MaxRL interpolates toward maximum likelihood as sampling compute grows, with up to 20× better test-time scaling efficiency than GRPO. Beyond the lecture: ∇ log p = ∇p / p, so a likelihood objective gives more weight to tasks the policy rarely solves.

L20's own summary table names the risk: diversity-aware RL raises coverage at large k but can lower pass@1 if overdone.

**Temperature is part of the policy.** Slide 3 notes that reasoning models may fix the temperature at 1.0, and slide 7 marks temperature "less applicable for reasoning models". For RL this matters twice. The trained model is the one served at that temperature, so diversity must be learned rather than added at decode time. And beyond the lecture: a sampler at temperature T ≠ 1 draws from softmax(z/T), not πθ, so μ ≠ πθ unless the trainer scales logits the same way (Concept 11's mismatch).

**WHALE alternates weight training with harness search.** Kim et al. (2026) train the weights under the current harness with online rejection-sampling fine-tuning, the ReST-style 0/1-weighted update of Concept 2, then run Meta-Harness search under the new weights. For small Qwen3.5 agents it reaches 48.3 / 24.8 / 29.8% on SearchQA / Math / Chess, against 38.3 / 15.4 / 22.2% for rejection SFT alone and 38.3 / 0.4 / 19.8% for harness search alone. The harness is part of the environment the policy gradient sees, so it can be co-optimized rather than fixed.

### L21 · Search and Planning (Koh): search as a policy-improvement operator

L21 is mostly about test-time search, but its first part is a training loop. Search finds better decisions than the raw policy, and the policy is then trained on those decisions. In RL terms, search is a policy-improvement operator and training distils its output. The search mechanics (MCTS, PUCT, the AlphaZero loss) are in T5 (core concepts 17–18, M10); web search and reset-and-replay are in T7.

**Expert Iteration: search as expert, network as apprentice.** Anthony, Tian and Barber (NeurIPS 2017; slide 13) name the loop: a neural policy guides tree search, the search collects improved decisions, and the policy is trained on them. "Search discovers (improved) decisions that we can train on." ReST and rejection sampling (Concept 2) are the same loop with a weak expert: sample N, keep what the verifier passes, fit.

**AlphaGo Zero and the AlphaZero losses.** At every self-play move the system runs MCTS, plays a move sampled from the visit-count distribution π, and records the final result z (slide 14). One network is then trained on both targets (slide 99, L2 term omitted):

$$
\mathcal{L}(\theta) = \big(z - v_\theta(s)\big)^2 \; - \; \sum_{a} \pi_{\text{search}}(a \mid s) \, \log p_\theta(a \mid s)
$$

Read it against this sheet. The value term is a critic (Concept 4) regressed on the Monte Carlo outcome. The policy term is not a policy gradient at all: there is no advantage and no importance ratio, only cross-entropy toward a full distribution, so the policy is distilled toward the search. *Beyond the lecture:* that target covers every legal move, which is a much denser signal than REINFORCE's one sampled action weighted by one scalar. The search has already done the credit assignment.

**ReST-MCTS\* (slide 96).** Zhang et al. (NeurIPS 2024) carry the loop to LLM reasoning: MCTS\* collects traces on questions with known answers, per-step values inferred from reaching the right answer train a PRM, correct traces train the policy, and the two alternate.

**Stream of Search and Searchformer.** Gandhi et al. (COLM 2024) train a 250M model on 500,000 serialized DFS/BFS traces, failures included. L21 then shows two policy-improvement steps from that model (slide 31): STaR / Expert Iteration (sample → filter → fit, the same next-token loss) and APA, an RL method that rewards valid solutions and penalizes extra search expansions. On 10,000 Game of 24 problems, accuracy goes from 25.73% (optimal-path training) to 51.27% (SoS), 55.59% (SoS + STaR) and 56.52% (SoS + APA). Lehnert et al. (COLM 2024, appendix slide 88) train on A\* search dynamics and then fine-tune on shorter successful traces. *Beyond the lecture:* the resulting Searchformer solves 93.7% of unseen Sokoban puzzles optimally with up to 26.8% fewer search steps than A\*.

**Why the loop works in games and breaks for agents.** Slide 15 gives four reasons: a compact state, an exact and cheap simulator, enumerable legal moves and an unambiguous result. LLM agents have long histories, costly or side-effecting transitions, free-text actions and fuzzy success. The summary adds the key one for training: a Go move keeps its identity, so visit counts accumulate, but a resampled thought is a new string, so π\_search is spread over nodes that are rarely revisited. L21 cites DeepSeek-R1 §4.2, which lists MCTS among its unsuccessful attempts. The approach that worked there was outcome-reward RL on long chains of thought, which, like SoS, puts the search inside one sequence. "Search must improve the decision enough to justify its cost."

## Mechanics

This section gives the exact equations, derived step by step, then the data format of a rollout record, the training-loop pseudocode and a cost analysis.

### M1. The policy-gradient theorem with reward-to-go

Start from the objective and apply the log-derivative trick:

$$
\nabla_\theta J(\theta) = \nabla_\theta \sum_\tau p_\theta(\tau)R(\tau) = \sum_\tau p_\theta(\tau)\,\nabla_\theta \log p_\theta(\tau)\,R(\tau) = \mathbb{E}_{\tau\sim p_\theta}\Big[\sum_{t=0}^{T-1} \nabla_\theta \log \pi_\theta(a_t\mid h_t)\; \sum_{t'=1}^{T} r_{t'}\Big]
$$

Here τ is a trajectory, pθ(τ) its probability (dropping x for brevity), R(τ) = Σ r\_{t'} its return, πθ(a\_t|h\_t) the policy's probability of action a\_t given history h\_t, and r\_{t'} the reward received after action a\_{t'−1}. The last step uses ∇ log pθ(τ) = Σ\_t ∇ log πθ(a\_t|h\_t), because environment factors do not depend on θ.

**Causality: dropping past rewards.** Split the reward sum for action a\_t into past rewards (t' ≤ t) and future rewards (t' > t). A past reward r\_{t'} is fixed once h\_t is known, so it acts as a history-dependent constant c(h\_t):

$$
\mathbb{E}\big[c(h_t)\,\nabla_\theta \log \pi_\theta(a_t\mid h_t)\big] = \mathbb{E}_{h_t}\Big[c(h_t)\sum_{a}\pi_\theta(a\mid h_t)\nabla_\theta\log\pi_\theta(a\mid h_t)\Big] = \mathbb{E}_{h_t}\Big[c(h_t)\,\nabla_\theta\sum_a \pi_\theta(a\mid h_t)\Big] = 0
$$

The inner sum is ∇ of 1, which is 0. So only the reward-to-go R\_t = Σ\_{t'=t+1}^{T} r\_{t'} survives:

$$
\nabla_\theta J = \mathbb{E}\Big[\sum_t \nabla_\theta \log \pi_\theta(a_t\mid h_t)\,\big(R_t - b(h_t)\big)\Big]
$$

The baseline b(h\_t) is any function of the history alone; the same argument shows it adds zero in expectation. Replacing R\_t by its expectation given (h\_t, a\_t) gives Q^π(h\_t, a\_t), and choosing b = V^π gives the advantage form E\[Σ\_t ∇ log πθ(a\_t|h\_t) A^π(h\_t, a\_t)\]. This is the policy-gradient theorem in the form used by every algorithm below.

**Token level.** For a language-model action a\_t = (u\_{t,1}, …, u\_{t,m\_t}), log πθ(a\_t|h\_t) = Σ\_k log πθ(u\_{t,k} | h\_t, u\_{t,\<k}). Flattening the whole episode into one token sequence with a loss mask m\_i (1 for sampled tokens, 0 for prompt and tool-output tokens), the per-sample REINFORCE loss is:

$$
\mathcal{L} = -\sum_{i=1}^{L} m_i\,\hat{A}_i\,\log \pi_\theta(u_i \mid u_{<i})
$$

L is the flattened sequence length, u\_i the i-th token, and Â\_i the advantage assigned to token i. For outcome rewards Â\_i is the same for every token of the trajectory.

### M2. Optimal constant baseline (variance derivation)

For one sample, write g = ∇ log πθ(a) and the estimator ĝ = (R − b) g. Its mean does not depend on b, so minimizing variance means minimizing the second moment:

$$
\frac{\partial}{\partial b}\,\mathbb{E}\big[\|g\|^2 (R-b)^2\big] = -2\,\mathbb{E}\big[\|g\|^2 (R-b)\big] = 0 \;\Rightarrow\; b^* = \frac{\mathbb{E}\big[\|g\|^2 R\big]}{\mathbb{E}\big[\|g\|^2\big]}
$$

‖g‖² is the squared norm of the score. In L9's bandit, the scores are 0.75 (A, probability 0.25) and −0.25 (B, probability 0.75). So b\* = (0.25·0.5625·1) / (0.25·0.5625 + 0.75·0.0625) = 0.1406/0.1875 = 0.75. At b = 0.75 both samples give gradient 0.1875 exactly: zero variance. The mean reward (0.25) is a good default but not optimal here.

### M3. GAE as a weighted sum of n-step advantages

Define the TD error δ\_t = r\_{t+1} + γV(h\_{t+1}) − V(h\_t), with V = 0 after the final step. The n-step advantage estimate uses n real rewards and then the critic:

$$
\hat{A}^{(n)}_t = \sum_{k=0}^{n-1}\gamma^k r_{t+k+1} + \gamma^n V(h_{t+n}) - V(h_t) = \sum_{k=0}^{n-1}\gamma^k \delta_{t+k}
$$

The second equality holds because the intermediate values telescope. GAE takes an exponentially weighted average over n with weights (1−λ)λ^{n−1}:

$$
\hat{A}^{\mathrm{GAE}(\gamma,\lambda)}_t = (1-\lambda)\sum_{n\ge 1}\lambda^{n-1}\hat{A}^{(n)}_t = \sum_{k\ge 0}(\gamma\lambda)^k\,\delta_{t+k}, \qquad \hat{A}_t = \delta_t + \gamma\lambda\,\hat{A}_{t+1}
$$

γ in \[0, 1\] discounts future rewards (L11 uses 1); λ in \[0, 1\] trades bias for variance. λ = 0 gives δ\_t; λ = 1 gives R\_t − V(h\_t). The backward recursion costs O(T) per trajectory. The critic's regression target is usually Â\_t + V(h\_t), the "λ-return".

### M4. Importance sampling and the surrogate objective

Let μ be the policy that generated the data. For any function f, E\_{a∼π}\[f(a)\] = Σ\_a π(a) f(a) = Σ\_a μ(a) (π(a)/μ(a)) f(a) = E\_{a∼μ}\[ρ(a) f(a)\], provided μ(a) > 0 wherever π(a) > 0. For trajectories the environment factors cancel in the ratio:

$$
w(\tau) = \frac{p_\theta(\tau)}{p_\mu(\tau)} = \prod_{t}\frac{\pi_\theta(a_t\mid h_t)}{\mu(a_t\mid h_t)}
$$

If each factor has mean 1 and small independent log-noise with variance s², then log w has variance T s², which grows linearly in the horizon T. The spread of w grows exponentially, which is L11's 1.05^100 ≈ 132 effect.

The practical *surrogate* keeps only the per-token ratio ρ\_t = πθ(u\_t|u\_\<t)/μ(u\_t|u\_\<t), treats the advantage as fixed, and maximizes:

$$
J_{\mathrm{surr}}(\theta) = \mathbb{E}_{t\sim\mu}\big[\rho_t(\theta)\,\hat{A}_t\big], \qquad \nabla_\theta J_{\mathrm{surr}}\Big|_{\theta=\mu} = \mathbb{E}_{t\sim\mu}\big[\hat{A}_t\,\nabla_\theta \log \pi_\theta(u_t\mid u_{<t})\big]
$$

The gradient identity uses ∇ρ = ρ ∇ log π and ρ = 1 at θ = μ. So the surrogate matches the policy gradient at the start of an update and remains a first-order approximation as θ moves away. The error from ignoring the change in the history distribution (L11's 0.10/0.40 example) is second order in the policy change, which is the justification for keeping updates small.

### M5. PPO and the clipped family, written out

**PPO with a critic** (Schulman et al., 2017) maximizes, per token:

$$
J_{\mathrm{PPO}} = \mathbb{E}_t\Big[\min\big(\rho_t\hat{A}_t,\ \mathrm{clip}(\rho_t,1-\epsilon,1+\epsilon)\hat{A}_t\big)\Big] - c_V\,\mathbb{E}_t\big[(V_\phi(h_t)-\hat{R}_t)^2\big] + c_H\,\mathbb{E}_t\big[H(\pi_\theta(\cdot\mid h_t))\big]
$$

ρ\_t is the per-token ratio, Â\_t the GAE advantage, ε the clip margin (typically 0.2), c\_V the value-loss weight, R̂\_t the critic's regression target (the λ-return), c\_H the entropy weight and H the entropy of the next-token distribution. The gradient of the policy term per token is Â\_t ρ\_t ∇ log πθ when the unclipped branch is the minimum, and 0 otherwise. The unclipped branch is the minimum unless (Â > 0 and ρ > 1+ε) or (Â < 0 and ρ < 1−ε).

**GRPO** (Shao et al., 2024) removes the critic, uses group advantages, averages per response, and adds a KL term to a reference model:

$$
J_{\mathrm{GRPO}} = \mathbb{E}_{x,\{y_j\}\sim\mu}\Bigg[\frac{1}{G}\sum_{j=1}^{G}\frac{1}{|y_j|}\sum_{t=1}^{|y_j|}\Big(\min\big(\rho_{j,t}\hat{A}_j,\ \mathrm{clip}(\rho_{j,t},1-\epsilon,1+\epsilon)\hat{A}_j\big) - \beta\,\hat{D}_{j,t}\Big)\Bigg], \qquad \hat{A}_j = \frac{R_j-\mathrm{mean}(R)}{\mathrm{std}(R)}
$$

x is the task, y\_j the j-th of G sampled responses, |y\_j| its number of generated tokens, R\_j its reward, β the KL weight, and D̂\_{j,t} the per-token KL estimate below.

**KL estimators.** With r = π\_ref(u\_t|u\_\<t)/πθ(u\_t|u\_\<t) evaluated at a token sampled from πθ, Schulman's three estimators of KL(πθ ‖ π\_ref) are:

$$
k_1 = -\log r, \qquad k_2 = \tfrac{1}{2}(\log r)^2, \qquad k_3 = (r-1) - \log r
$$

k1 is unbiased but can be negative and is noisy. k2 is biased but low-variance. k3 is unbiased (because E\[r\] = 1 under πθ) and always non-negative (because log r ≤ r − 1); GRPO uses k3. On L11's example (πθ = 0.5/0.5, π\_ref = 0.8/0.2, exact KL 0.223), the calculator program measures standard deviations of 0.693, 0.155 and 0.093 for k1, k2 and k3.

**DrGRPO** (Liu et al., 2025) changes two normalizers:

$$
J_{\mathrm{Dr}} = \mathbb{E}\Bigg[\frac{1}{G}\sum_{j=1}^{G}\frac{1}{C}\sum_{t=1}^{|y_j|}\min\big(\rho_{j,t}\hat{A}_j,\ \mathrm{clip}(\rho_{j,t},1-\epsilon,1+\epsilon)\hat{A}_j\big)\Bigg], \qquad \hat{A}_j = R_j - \mathrm{mean}(R)
$$

C is a constant shared by all responses (the generation budget in the paper). The paper also drops the KL term.

**DAPO** (Yu et al., 2025) uses asymmetric clipping and a batch-level token average:

$$
J_{\mathrm{DAPO}} = \mathbb{E}\Bigg[\frac{1}{\sum_{j}|y_j|}\sum_{j=1}^{G}\sum_{t=1}^{|y_j|}\min\big(\rho_{j,t}\hat{A}_j,\ \mathrm{clip}(\rho_{j,t},1-\epsilon_{\mathrm{low}},1+\epsilon_{\mathrm{high}})\hat{A}_j\big)\Bigg] \quad \text{s.t.}\quad 0 < |\{j: \text{correct}_j\}| < G
$$

ε\_low = 0.2 and ε\_high = 0.28 in the paper. The constraint is dynamic sampling: groups that are all correct or all wrong are discarded and replaced. Over-long responses get a length-dependent soft penalty added to R.

**CISPO** (MiniMax-M1, 2025) keeps every token's gradient and clips only the weight:

$$
J_{\mathrm{CISPO}} = \mathbb{E}\Bigg[\frac{1}{\sum_j |y_j|}\sum_{j}\sum_{t}\mathrm{sg}\big(\mathrm{clip}(\rho_{j,t},1-\epsilon^{IS}_{\mathrm{low}},1+\epsilon^{IS}_{\mathrm{high}})\big)\,\hat{A}_j\,\log\pi_\theta(u_{j,t}\mid u_{j,<t})\Bigg]
$$

sg(·) is stop-gradient: the clipped ratio multiplies the gradient but is not differentiated.

**GSPO** (Zheng et al., 2025) uses a sequence-level ratio:

$$
s_j(\theta) = \Big(\frac{\pi_\theta(y_j\mid x)}{\mu(y_j\mid x)}\Big)^{1/|y_j|} = \exp\Big(\frac{1}{|y_j|}\sum_{t}\log\frac{\pi_\theta(u_{j,t}\mid u_{j,<t})}{\mu(u_{j,t}\mid u_{j,<t})}\Big), \qquad J_{\mathrm{GSPO}} = \mathbb{E}\Big[\frac{1}{G}\sum_j \min\big(s_j\hat{A}_j,\ \mathrm{clip}(s_j,1-\epsilon,1+\epsilon)\hat{A}_j\big)\Big]
$$

The 1/|y\_j| exponent keeps s\_j near 1 regardless of length, which avoids the explosion of the plain product while still using all tokens.

**Loss aggregation choices, side by side.** *Beyond the lecture:* frameworks expose this as a setting (verl calls it the loss aggregation mode). For a batch of responses with per-token terms ℓ\_{j,t}:

| Scheme | Formula | Used by | Effect on long responses |
| --- | --- | --- | --- |
| Mean over tokens, then over responses | (1/G) Σ\_j (1/\|y\_j\|) Σ\_t ℓ\_{j,t} | original GRPO | each response counts equally, so long responses get smaller per-token weight |
| Mean over all tokens in the batch | (Σ\_j Σ\_t ℓ\_{j,t}) / Σ\_j \|y\_j\| | DAPO, CISPO | each token counts equally |
| Sum over tokens, divided by a constant | (1/G) Σ\_j (1/C) Σ\_t ℓ\_{j,t} | DrGRPO | each token counts equally, and the scale does not depend on the batch |

### M6. Data format of one agent rollout record

A rollout record must carry everything the trainer needs without re-running the environment: the exact token IDs, which tokens are trainable, the sampler's log-probabilities, the policy version and the reward details.

```json
{
  "task_id": "retry_count-0007",
  "group_id": "retry_count-0007/step-412",
  "policy_version": 412,
  "turns": [
    {"role": "user", "text": "Fix the retry setting: zero should disable retries..."},
    {"role": "assistant", "text": "<tool_call>{\"name\": \"read_file\", \"arguments\": {\"path\": \"config.py\"}}</tool_call>"},
    {"role": "tool", "text": "def retry_count(config):\n    return config.get(\"retries\") or 3"},
    {"role": "assistant", "text": "<tool_call>{\"name\": \"run_tests\", \"arguments\": {}}</tool_call>"}
  ],
  "token_ids": [151644, 872, 198, 4430, 279],
  "loss_mask": [0, 0, 0, 1, 1],
  "sampler_logprobs": [null, null, null, -0.21, -1.73],
  "reward": {"total": 1.0, "tests_passed": 4, "tests_total": 4, "format_ok": true},
  "num_turns": 5,
  "finish_reason": "stop",
  "env_time_s": 38.2,
  "gen_tokens": 1874
}
```

The token arrays are truncated for display. Store token IDs, not only text: re-tokenizing the text can produce different tokens from those actually sampled, which silently corrupts ρ\_t and the loss mask. `policy_version` lets the trainer measure staleness and drop over-stale samples. `sampler_logprobs` supply μ for the ratio and allow correction of training–inference mismatch.

### M7. Pseudocode: an asynchronous GRPO-style trainer for a tool-using agent

The sketch below shows how the pieces from Core concepts 9 connect. It is pseudocode: `engine`, `sandbox`, `verifier` and `trainer` stand for an inference server, an environment pool, a reward service and a sharded trainer.

```python
# ---- rollout worker: runs many episodes concurrently ----
async def run_episode(task, engine, sandbox, max_turns=30):
    env = await sandbox.reset(task)                   # fresh, isolated state
    ids, mask, logps = tokenize(task.prompt), [], []
    mask += [0] * len(ids); logps += [None] * len(ids)
    for _ in range(max_turns):
        out = await engine.generate(ids, stop=END_OF_TURN, return_logprobs=True)
        ids += out.token_ids; mask += [1] * len(out.token_ids); logps += out.logprobs
        call = parse_tool_call(out.text)
        if call is None:                              # final answer
            break
        obs = await env.execute(call, timeout=60)     # tool output = context only
        obs_ids = tokenize_tool_turn(obs)
        ids += obs_ids; mask += [0] * len(obs_ids); logps += [None] * len(obs_ids)
    reward = await verifier.score(task, env)          # tests, state checks, judge
    return Rollout(task.id, engine.version, ids, mask, logps, reward)

async def producer(queue, G=8):
    while True:
        task = sampler.next()                         # curriculum / difficulty filter
        group = await gather(*[run_episode(task, engine, sandbox) for _ in range(G)])
        rewards = [r.reward for r in group]
        if min(rewards) == max(rewards):              # degenerate group (DAPO)
            sampler.report_uninformative(task); continue
        await queue.put(group)

# ---- learner ----
def learner(queue, groups_per_step=64, max_staleness=2, eps_lo=0.2, eps_hi=0.28):
    while True:
        batch = []
        while len(batch) < groups_per_step:
            group = queue.get()
            if trainer.version - group[0].policy_version <= max_staleness:
                batch.append(group)                   # drop over-stale data
        tokens = []
        for group in batch:
            R = [r.reward for r in group]
            for r in group:
                adv = r.reward - mean(R)              # DrGRPO-style; / std(R) for GRPO
                tokens += [(r, i, adv) for i, m in enumerate(r.mask) if m == 1]
        loss = 0.0
        for r, i, adv in tokens:
            logp = trainer.logprob(r.ids, i)          # pi_theta, recomputed
            rho = exp(logp - r.logps[i])              # vs the sampler's logprob (mu)
            loss -= min(rho * adv, clip(rho, 1 - eps_lo, 1 + eps_hi) * adv)
        trainer.step(loss / len(tokens))              # token-mean aggregation
        trainer.version += 1
        engine.load_weights(trainer.state_dict(), version=trainer.version)
        log(reward=..., kl=..., entropy=..., clip_frac=..., staleness=..., length=...)
```

Three details matter in real systems. The ratio uses the sampler's recorded log-probabilities, so staleness and training–inference mismatch are both corrected in one place. The loss mask excludes tool outputs. And the staleness filter plus clipping keep the update close to on-policy.

### M8. Cost analysis

**Tokens per step.** With B tasks, G rollouts per task, T turns and m generated tokens per turn, one step generates B·G·T·m tokens. For B = 64, G = 8, T = 20 and m = 300, that is 64·8·20·300 ≈ 3.1 million generated tokens. Prompt and observation tokens can be several times more, and all of them are re-processed in the trainer's forward pass.

**Compute split.** Generation costs roughly 2N FLOPs per token for an N-parameter model, but it is memory-bandwidth bound and sequential across turns. Training costs roughly 6N FLOPs per token (forward plus backward) but runs in large parallel batches. The environment adds latency that no GPU can hide. In practice generation plus environment time dominates wall-clock time for agents, which is why asynchrony pays off.

**Memory.** PPO with a learned reward model keeps four models: policy (with optimizer state, about 16 bytes per parameter in mixed precision with Adam), critic (the same again), reference and reward model (weights only). GRPO removes the critic; removing the KL term removes the reference. An inference copy of the policy lives on the rollout GPUs as well.

**Sample efficiency versus group size.** Larger G gives a better baseline and fewer degenerate groups, but costs G rollouts per task. With success probability p, the chance a group of G binary rewards is degenerate is p^G + (1−p)^G. For p = 0.1 and G = 8 that is 0.43; for G = 16 it is 0.19. This is why dynamic sampling and task-difficulty filtering matter most for hard tasks.

### M9. Off-policy corrections in a real system: mismatch bias, truncation and the decoupled ratio

L12 says async RL "requires staleness/off-policy corrections" and tracks importance\_weight\_max = max π\_train/π\_rollout. This subsection derives what those corrections do. *Beyond the lecture:* the derivations are standard; the specific objective combines ideas from truncated importance sampling (Yao et al., 2025), AReaL's decoupled PPO and IMPALA's V-trace.

**Three policies per token.** For generated token u\_t with history u\_\<t, keep three numbers apart. μ\_t is the probability the sampler recorded when it produced u\_t (whatever weights version, kernels and routing it used). π\_old is the trainer's own probability at the weights that the batch is anchored to. πθ is the probability under the weights being optimized. In a perfect synchronous system all three agree at the first gradient step; in practice μ\_t ≠ π\_old because of staleness and engine mismatch (Core concepts 11).

**The bias of ignoring mismatch.** Suppose the trainer uses samples from μ but computes the plain policy-gradient term, as if they came from πθ. Write ρ = πθ/μ. Then:

$$
g_{\text{naive}} = \mathbb{E}_{u\sim\mu}\big[\hat A\,\nabla_\theta \log \pi_\theta(u)\big]
= \mathbb{E}_{u\sim\pi_\theta}\Big[\tfrac{1}{\rho(u)}\,\hat A\,\nabla_\theta \log \pi_\theta(u)\Big]
= \nabla_\theta J + \mathbb{E}_{u\sim\pi_\theta}\Big[\big(\tfrac{1}{\rho(u)} - 1\big)\hat A\,\nabla_\theta \log \pi_\theta(u)\Big]
$$

The second term is the bias. It vanishes only when ρ = 1 for every token that matters. Tokens the sampler over-produced (ρ < 1) are pushed too hard; tokens it under-produced (ρ > 1) too weakly. The bias is systematic, not noise, so it does not average out over a batch. This is how a small, persistent engine gap can steer training somewhere the loss does not describe.

**Full correction and why it is truncated.** Multiplying by ρ removes the bias exactly, E\_μ\[ρ Â ∇log πθ\] = ∇J, but ρ is unbounded wherever μ is tiny. Truncated importance sampling caps the weight at a constant C:

$$
g_{\text{TIS}} = \mathbb{E}_{u\sim\mu}\big[\min(\rho(u), C)\,\hat A\,\nabla_\theta \log \pi_\theta(u)\big]
= \mathbb{E}_{u\sim\pi_\theta}\Big[\min\!\big(1, \tfrac{C}{\rho(u)}\big)\,\hat A\,\nabla_\theta \log \pi_\theta(u)\Big]
$$

Read the second form. Tokens with ρ ≤ C get weight exactly 1, so they are unbiased. Only tokens with ρ > C, the ones the sampler badly under-sampled, are down-weighted by C/ρ. Every per-sample weight is at most C, so the variance is bounded. This is the same bias-for-variance trade as PPO's clip and V-trace's ρ̄, applied to a different cause.

**Decomposing the ratio.** The full ratio factors into a part the optimizer controls and a part it does not:

$$
\frac{\pi_\theta(u_t)}{\mu_t(u_t)} = \underbrace{\frac{\pi_\theta(u_t)}{\pi_{\text{old}}(u_t)}}_{r_t:\ \text{trust region}} \times \underbrace{\frac{\pi_{\text{old}}(u_t)}{\mu_t(u_t)}}_{w_t:\ \text{behaviour correction}}
$$

r\_t moves as θ changes, so PPO clips it to \[1 − ε, 1 + ε\] to keep each update small (section 7). w\_t is a constant with respect to θ: it records how differently the sampler behaved, from staleness or from numerics. It is applied with a stop-gradient and truncated:

$$
J(\theta) = \mathbb{E}_{t}\Big[\operatorname{sg}\big(\min(w_t, C)\big)\cdot \min\big(r_t \hat A_t,\ \operatorname{clip}(r_t, 1-\epsilon, 1+\epsilon)\,\hat A_t\big)\Big]
$$

The expectation runs over tokens sampled by μ, Â\_t is the (group or GAE) advantage, ε the PPO clip margin, C the truncation cap and sg the stop-gradient. Clipping r\_t around π\_old instead of around μ matters: if μ is several versions stale, a trust region centred on μ would clip almost every token before the first step. AReaL's decoupled PPO uses this behaviour/proximal split; TIS uses the truncated w\_t with π\_old computed by the trainer.

**Worked numbers.** Take C = 2, ε = 0.2 and Â = +1. Token A: μ = 0.20, π\_old = 0.30, πθ = 0.36. Then w = 1.5 (kept) and r = 1.2, the clip edge, so the term is 1.5 × 1.2 = 1.8 and pushing further gains nothing. Token B: μ = 0.05, π\_old = 0.40. Then w = 8, truncated to 2, so this rarely sampled token cannot dominate the batch; importance\_weight\_max would log 8 before truncation. If B's gap came from a MoE expert flip, truncation only limits the damage; R3 removes it by making π\_old use the sampler's experts, which brings w back near 1.

**Why per-token correction, not per-sequence.** Model each token's log-ratio log w\_t as independent noise with mean about 0 and standard deviation s. The sequence log-ratio is the sum over T generated tokens, so its standard deviation is s√T. With a small engine gap of s = 0.01, a 1,000-token response gives 0.32 (a factor e^0.32 ≈ 1.4 either way), but a 30,000-token agent trajectory gives 1.73 (a factor of about 5.6). The per-token weight keeps its spread at s whatever the length. GSPO's length-normalized geometric mean divides the summed log-ratio by T, shrinking its spread to s/√T. This is the systems version of L11's 1.05^100 ≈ 132.

**Staleness filter.** With in-flight updates each token carries its policy version v(t). Drop or mask any token with v\_now − v(t) > η, where η is the maximum staleness (AReaL makes it explicit). The "average staleness" metric is the mean of v\_now − v(t) over the batch.

```python
import torch

def decoupled_tis_loss(logp_theta, logp_old, logp_sampler, adv, mask,
                       version_lag, eps=0.2, C=2.0, max_lag=2):
    """All tensors are per token [B, L]. logp_sampler comes from the inference
    engine (TITO), logp_old from the trainer's forward pass at the anchor weights."""
    keep = mask * (version_lag <= max_lag).float()            # staleness filter
    w = torch.exp(logp_old - logp_sampler).clamp(max=C).detach()  # behaviour weight
    r = torch.exp(logp_theta - logp_old)                       # trust-region ratio
    surr = torch.minimum(r * adv, r.clamp(1 - eps, 1 + eps) * adv)
    loss = -(w * surr * keep).sum() / keep.sum().clamp(min=1)  # token-level mean
    stats = {"importance_weight_max": torch.exp(logp_old - logp_sampler)[keep > 0].max(),
             "clip_frac": ((r - 1).abs() > eps).float()[keep > 0].mean()}
    return loss, stats
```

The stats line logs the untruncated maximum on purpose: it is the diagnostic L12's metrics table asks for, and it reveals mismatch even when truncation hides it from the loss.

## Hands-on

Three worked examples: a runnable program that trains five methods on L9's Number Search, a runnable calculator that reproduces every number on the L9 and L11 slides, and a design walkthrough for sizing an agent RL run. Both programs need only Python 3 and numpy, use no language model, and were run as shown.

### Example 1: ReST, REINFORCE, GRPO, DrGRPO and PPO on Number Search

The policy is a softmax over the 16 possible guesses. Its logits come from two features of each guess given the feasible interval \[lo, hi\] (which summarizes the history): whether the guess is still possible, and how close it is to the middle. θ = (0, 0) is the uniform random policy; large weights give binary search, whose ceiling is 15/16 = 0.938 because four halvings cover only 15 numbers. Every method uses the same update Σ w ∇ log π; only the weight differs, exactly as in L9's summary table.

```python
"""Policy-gradient family on L9's Number Search task (numpy only, no LLM).

Hidden integer n in 1..16, four guesses, feedback "higher"/"lower",
reward 1 only on a correct guess. The history h_t is summarised by the
feasible interval [lo, hi]. The policy is a softmax over the 16 guesses with
two learned weights on hand-made features:
    phi_in(g)  = 1 if lo <= g <= hi else 0      (guess is still possible)
    phi_mid(g) = -|g - (lo+hi)/2| / 4           (guess is near the middle)
theta = 0 is the uniform random policy; large weights give binary search.
Every method is the same update  sum_t w_t * grad log pi(a_t|h_t);
only the weight w_t (and, for PPO, the ratio and clip) differs.
"""
import numpy as np

N, K = 16, 4                  # numbers, guesses allowed
B, G = 16, 8                  # task instances per batch, rollouts per instance
ITERS, LR, EPS_CLIP, PPO_EPOCHS = 60, 0.5, 0.2, 4
GUESSES = np.arange(1, N + 1)


def features(lo, hi):
    """(N, 2) feature matrix: one row per candidate guess."""
    f_in = ((GUESSES >= lo) & (GUESSES <= hi)).astype(float)
    f_mid = -np.abs(GUESSES - (lo + hi) / 2) / 4
    return np.stack([f_in, f_mid], axis=1)


def policy(theta, lo, hi):
    phi = features(lo, hi)
    z = phi @ theta
    p = np.exp(z - z.max())
    return phi, p / p.sum()


def rollout(theta, n, rng):
    """One episode on hidden number n -> list of (lo, hi, action_index, prob), R."""
    lo, hi, steps = 1, N, []
    for _ in range(K):
        _, p = policy(theta, lo, hi)
        a = rng.choice(N, p=p)
        steps.append((lo, hi, a, p[a]))
        g = a + 1
        if g == n:
            return steps, 1.0
        lo, hi = (max(lo, g + 1), hi) if g < n else (lo, min(hi, g - 1))
    return steps, 0.0


def group_weights(method, Rs):
    """Per-trajectory weight for one group of G rollouts on the same task."""
    Rs = np.asarray(Rs)
    if method in ("rest", "reinforce"):   # binary reward: identical weights
        return Rs.copy()
    centred = Rs - Rs.mean()
    if method in ("grpo", "ppo"):         # divide by the group's reward std
        return centred / (Rs.std() + 1e-6)
    if method == "drgrpo":                # mean-centred only
        return centred
    raise ValueError(method)


def train(method, seed):
    rng = np.random.default_rng(seed)
    theta = np.zeros(2)
    log = []
    for it in range(ITERS):
        batch, degenerate, rewards = [], 0, []
        for _ in range(B):
            n = rng.integers(1, N + 1)                    # one task instance
            group = [rollout(theta, n, rng) for _ in range(G)]
            Rs = [R for _, R in group]
            rewards += Rs
            degenerate += len(set(Rs)) == 1               # all-0 or all-1 group
            for (steps, _), w in zip(group, group_weights(method, Rs)):
                # GRPO/PPO: per-response 1/|y|; DrGRPO: global constant 1/K
                scale = 1 / len(steps) if method in ("grpo", "ppo") else 1 / K
                for lo, hi, a, p_old in steps:
                    batch.append((lo, hi, a, p_old, w * scale))
        clipped = 0
        for _ in range(PPO_EPOCHS if method == "ppo" else 1):
            grad = np.zeros(2)
            for lo, hi, a, p_old, adv in batch:
                phi, p = policy(theta, lo, hi)
                g_logp = phi[a] - p @ phi                  # grad log pi(a|h)
                if method == "ppo":
                    rho = p[a] / p_old                     # pi_theta / mu
                    if (adv > 0 and rho > 1 + EPS_CLIP) or (adv < 0 and rho < 1 - EPS_CLIP):
                        clipped += 1                       # flat clipped branch: no gradient
                        continue
                    g_logp = rho * g_logp                  # grad of rho*A = A*rho*grad log pi
                grad += adv * g_logp
            theta = theta + LR * grad / (B * G)
        if it % 15 == 0 or it == ITERS - 1:
            log.append((it, np.mean(rewards), degenerate / B, theta.copy(),
                        clipped / (PPO_EPOCHS * len(batch)) if method == "ppo" else 0.0))
    return theta, log


def evaluate(theta, seed, episodes=3000):
    rng = np.random.default_rng(seed)
    return np.mean([rollout(theta, rng.integers(1, N + 1), rng)[1] for _ in range(episodes)])


if __name__ == "__main__":
    print(f"uniform random policy: success={evaluate(np.zeros(2), 0):.3f}; "
          f"binary-search ceiling: {(2**K - 1) / N:.3f}")
    print(f"\n{'method':<10}{'iter':>5}{'batch R':>9}{'degenerate':>12}"
          f"{'theta_in':>10}{'theta_mid':>11}{'clip frac':>11}")
    final = {}
    for method in ["rest", "reinforce", "grpo", "drgrpo", "ppo"]:
        theta, log = train(method, seed=0)
        for it, r, d, th, cf in log:
            print(f"{method:<10}{it:>5}{r:>9.2f}{d:>12.2f}{th[0]:>10.2f}{th[1]:>11.2f}{cf:>11.3f}")
        final[method] = np.mean([evaluate(train(method, s)[0], 100 + s, 1500) for s in range(3)])
    print("\nheld-out success after", ITERS, "iterations (mean of 3 seeds):")
    for m, s in final.items():
        print(f"  {m:<10}{s:.3f}")
```

Output (about 30 seconds on a laptop CPU):

```text
uniform random policy: success=0.232; binary-search ceiling: 0.938

method     iter  batch R  degenerate  theta_in  theta_mid  clip frac
rest          0     0.23        0.12      0.01       0.00      0.000
rest         15     0.20        0.00      0.18       0.24      0.000
rest         30     0.29        0.00      0.35       0.50      0.000
rest         45     0.38        0.00      0.55       0.80      0.000
rest         59     0.46        0.00      0.72       1.02      0.000
reinforce     0     0.23        0.12      0.01       0.00      0.000
reinforce    15     0.20        0.00      0.18       0.24      0.000
reinforce    30     0.29        0.00      0.35       0.50      0.000
reinforce    45     0.38        0.00      0.55       0.80      0.000
reinforce    59     0.46        0.00      0.72       1.02      0.000
grpo          0     0.23        0.12      0.02       0.01      0.000
grpo         15     0.30        0.06      0.44       0.65      0.000
grpo         30     0.50        0.00      0.89       1.35      0.000
grpo         45     0.52        0.00      1.27       1.75      0.000
grpo         59     0.73        0.00      1.56       2.02      0.000
drgrpo        0     0.23        0.12      0.00      -0.00      0.000
drgrpo       15     0.19        0.06      0.16       0.21      0.000
drgrpo       30     0.29        0.12      0.32       0.46      0.000
drgrpo       45     0.36        0.00      0.47       0.67      0.000
drgrpo       59     0.39        0.00      0.62       0.86      0.000
ppo           0     0.23        0.12      0.07       0.02      0.000
ppo          15     0.63        0.00      1.58       1.77      0.001
ppo          30     0.72        0.06      2.41       2.68      0.000
ppo          45     0.76        0.06      2.74       3.41      0.000
ppo          59     0.78        0.06      2.93       3.79      0.000

held-out success after 60 iterations (mean of 3 seeds):
  rest      0.439
  reinforce 0.439
  grpo      0.624
  drgrpo    0.411
  ppo       0.768
```

**What to notice.**

- The `rest` and `reinforce` rows are identical, digit for digit. With a 0/1 reward, weighting by R(τ) is the same as keeping successes and running SFT on them (L9 slide 24).
- All methods learn the same thing: both weights grow, so the policy stops guessing impossible numbers and moves toward the middle of the interval, that is, toward binary search.
- The ranking reflects *step size* as much as algorithm quality, because all methods share one learning rate. Dividing by σ (at most 0.5 for binary rewards) roughly doubles GRPO's weights compared with DrGRPO. PPO makes four passes over each batch, so it takes four times as many gradient steps per rollout. Tune the learning rate separately per method before drawing conclusions; this is a real trap when comparing RL papers.
- PPO's clip fraction stays near zero because each step is small. Raise `LR` to 5 and the clip fraction rises, and clipping starts to matter.
- The degenerate-group rate starts at 12% (groups of eight where every rollout fails) and falls as success moves toward 50%. As success approaches 1, all-pass groups will make it rise again; that is the regime where dynamic sampling helps.
- REINFORCE, ReST and DrGRPO here share the same 1/K scaling and differ only in the baseline. Mean-centring helps less than you might expect because this task's gradient signal comes mostly from successes; the variance benefit is larger with larger groups and longer episodes.

### Example 2: a calculator for every worked number on the L9 and L11 slides

The fastest way to check that you understand a slide is to recompute its numbers from the definitions. This program does that for the expected reward, the bandit gradients and their variance, group advantages, the critic's squared error, TD errors, GAE, importance weights, PPO's clipped term, partial rewards, entropy collapse and the distillation KL. Each output line is tagged with the slide it reproduces; lines tagged "beyond" go past the slides. Change any input (a probability, λ, ε, a reward vector) and rerun to build intuition.

```python
'''Reproduce the worked numbers on the L9 (Fried) and L11 (Neubig) slides.

Every quantity is computed from its definition, so you can change an input
and see how the result moves. numpy only; no language model is involved.
'''
import numpy as np


def show(label, value, slide):
    print(f'  {label:<44}{value:>24}  [{slide}]')


def group_adv(rewards, divide_by_std=True):
    r = np.asarray(rewards, float)
    c = r - r.mean()
    return c / r.std() if divide_by_std and r.std() > 0 else c


def entropy(p):
    p = np.asarray(p, float)
    return float(-(p * np.log(p)).sum())


print('L9  RL foundations')
# Expected reward over the four Number Search trajectories (slide 13)
probs, rewards = np.array([0.30, 0.20, 0.25, 0.25]), np.array([1, 1, 0, 0])
show('J(theta) = sum_tau p(tau) R(tau)', f'{probs @ rewards:.2f}', 'L9 s13')

# Two-armed bandit: p = sigmoid(theta) = 0.25 (slides 30-33)
p = 0.25
theta = np.log(p / (1 - p))
show('theta with sigmoid(theta) = 0.25', f'{theta:.3f}', 'L9 s30')
slope = {'A': 1 - p, 'B': -p}          # d/dtheta log pi(a)
R = {'A': 1.0, 'B': 0.0}
prob = {'A': p, 'B': 1 - p}
for b in (0.0, 0.5):
    for a in 'AB':
        show(f'b={b}: sampled {a}, (R-b)*slope', f'{(R[a] - b) * slope[a] + 0.0:+.3f}', 'L9 s30-31')


def grad_stats(b):
    g = np.array([(R[a] - b) * slope[a] for a in 'AB'])
    w = np.array([prob[a] for a in 'AB'])
    mean = w @ g
    return mean, np.sqrt(w @ (g - mean) ** 2)


for b in (0.0, 0.5):
    m, sd = grad_stats(b)
    show(f'b={b}: E[g_hat], SD[g_hat]', f'{m:.4f}, {sd:.3f}', 'L9 s32-33')
# Beyond the slides: sweep b to find the variance-minimising constant baseline
bs = np.linspace(0, 1, 101)
sds = [grad_stats(b)[1] for b in bs]
show('variance-minimising constant b (sweep)', f'{bs[int(np.argmin(sds))]:.2f}', 'beyond')
show('SD[g_hat] at that b', f'{min(sds):.3f}', 'beyond')
# Empirical check: 20 draws, as in the slide-33 simulator, then 100k draws
rng = np.random.default_rng(0)
for n in (20, 100_000):
    draws = rng.random(n) < p          # True = sampled A
    for b in (0.0, 0.5):
        g = np.where(draws, (1 - b) * (1 - p), (0 - b) * (-p))
        show(f'{n} draws ({draws.sum()} were A), b={b}: mean, SD',
             f'{g.mean():.4f}, {g.std():.3f}', 'L9 s33')

# Group-relative advantages (slides 37-38) and DrGRPO (slide 40)
for name, grp in [('x1 hidden 11', [1, 1, 0, 0]), ('x2 hidden 3', [1, 0, 0, 0]),
                  ('x3 hidden 7', [1, 1, 1, 0])]:
    a = group_adv(grp)
    show(f'GRPO {name} {grp}', ' '.join(f'{v:+.2f}' for v in a), 'L9 s37-38')
show('DrGRPO x1 [1,1,0,0] (no std)', ' '.join(f'{v:+.1f}' for v in group_adv([1, 1, 0, 0], False)), 'L9 s40')
for grp in ([0, 0, 0, 0], [1, 1, 1, 1]):
    show(f'degenerate group {grp}', ' '.join(f'{v + 0.0:+.0f}' for v in group_adv(grp)), 'L9 s41')

print('\nL11  Advanced RL')
show('group baseline for [1,0,0,0]', ' '.join(f'{v:+.2f}' for v in group_adv([1, 0, 0, 0], False)), 'L11 s8')
r = np.array([0, 0, 0, 0, 0, 1])       # r1..r6 on trajectory A
show('reward-to-go R3 = r4 + r5 + r6', f'{r[3:].sum()}', 'L11 s10')
cont = np.array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0])   # ten continuations from h3
show('V(h3) estimate = mean of 10 continuations', f'{cont.mean():.1f}', 'L11 s12')
for v in (0.6, cont.mean()):
    show(f'critic squared error at V = {v:.1f}', f'{np.mean((v - cont) ** 2):.2f}', 'L11 s13')
V = {3: 0.3, 4: 0.6, 5: 0.4, 6: 0.0}   # critic on trajectory B, rewards all 0
delta = {t: 0 + V[t + 1] - V[t] for t in (3, 4, 5)}
show('TD errors delta_3, delta_4, delta_5', ' '.join(f'{delta[t]:+.1f}' for t in (3, 4, 5)), 'L11 s15')
lam, A = 0.5, 0.0
for t in (5, 4, 3):                    # backward recursion A_t = delta_t + lam * A_{t+1}
    A = delta[t] + lam * A
show('GAE A_3 with lambda = 0.5', f'{A:.2f}', 'L11 s16')
show('IS weight, correct edit 0.70 / 0.40', f'{0.70 / 0.40:.2f}', 'L11 s23')
show('IS weight, incomplete edit 0.20 / 0.40', f'{0.20 / 0.40:.2f}', 'L11 s23')
show('trajectory ratio 1.05 ** 100', f'{1.05 ** 100:.1f}', 'L11 s24')
show('reach probability ratio 0.10 / 0.40', f'{0.10 / 0.40:.2f}', 'L11 s26')
eps = 0.2
for adv in (+1, -1):
    for rho in (0.5, 0.8, 1.0, 1.2, 1.5):
        obj = min(rho * adv, np.clip(rho, 1 - eps, 1 + eps) * adv)
        show(f'PPO term, A={adv:+d}, ratio {rho:.1f}', f'{obj:+.2f}', 'L11 s32')
partial = np.array([0, 1, 2, 1]) * 0.25
show('partial reward [0,.25,.5,.25] minus mean', ' '.join(f'{v + 0.0:+.2f}' for v in partial - partial.mean()), 'L11 s45')
show('entropy before collapse (0.2, 0.6, 0.2)', f'{entropy([0.2, 0.6, 0.2]):.3f} nats', 'beyond, L11 s47')
show('entropy after collapse (0.01, 0.98, 0.01)', f'{entropy([0.01, 0.98, 0.01]):.3f} nats', 'beyond, L11 s47')
student, teacher = np.array([0.5, 0.5]), np.array([0.8, 0.2])
show('reverse KL(student || teacher)', f'{(student * np.log(student / teacher)).sum():.3f}', 'L11 s52')
show('forward KL(teacher || student), for contrast', f'{(teacher * np.log(teacher / student)).sum():.3f}', 'beyond')
```

Output (`python3 slide_numbers.py`):

```text
L9  RL foundations
  J(theta) = sum_tau p(tau) R(tau)                                0.50  [L9 s13]
  theta with sigmoid(theta) = 0.25                              -1.099  [L9 s30]
  b=0.0: sampled A, (R-b)*slope                                 +0.750  [L9 s30-31]
  b=0.0: sampled B, (R-b)*slope                                 +0.000  [L9 s30-31]
  b=0.5: sampled A, (R-b)*slope                                 +0.375  [L9 s30-31]
  b=0.5: sampled B, (R-b)*slope                                 +0.125  [L9 s30-31]
  b=0.0: E[g_hat], SD[g_hat]                             0.1875, 0.325  [L9 s32-33]
  b=0.5: E[g_hat], SD[g_hat]                             0.1875, 0.108  [L9 s32-33]
  variance-minimising constant b (sweep)                          0.75  [beyond]
  SD[g_hat] at that b                                            0.000  [beyond]
  20 draws (5 were A), b=0.0: mean, SD                   0.1875, 0.325  [L9 s33]
  20 draws (5 were A), b=0.5: mean, SD                   0.1875, 0.108  [L9 s33]
  100000 draws (25012 were A), b=0.0: mean, SD           0.1876, 0.325  [L9 s33]
  100000 draws (25012 were A), b=0.5: mean, SD           0.1875, 0.108  [L9 s33]
  GRPO x1 hidden 11 [1, 1, 0, 0]               +1.00 +1.00 -1.00 -1.00  [L9 s37-38]
  GRPO x2 hidden 3 [1, 0, 0, 0]                +1.73 -0.58 -0.58 -0.58  [L9 s37-38]
  GRPO x3 hidden 7 [1, 1, 1, 0]                +0.58 +0.58 +0.58 -1.73  [L9 s37-38]
  DrGRPO x1 [1,1,0,0] (no std)                     +0.5 +0.5 -0.5 -0.5  [L9 s40]
  degenerate group [0, 0, 0, 0]                            +0 +0 +0 +0  [L9 s41]
  degenerate group [1, 1, 1, 1]                            +0 +0 +0 +0  [L9 s41]

L11  Advanced RL
  group baseline for [1,0,0,0]                 +0.75 -0.25 -0.25 -0.25  [L11 s8]
  reward-to-go R3 = r4 + r5 + r6                                     1  [L11 s10]
  V(h3) estimate = mean of 10 continuations                        0.3  [L11 s12]
  critic squared error at V = 0.6                                 0.30  [L11 s13]
  critic squared error at V = 0.3                                 0.21  [L11 s13]
  TD errors delta_3, delta_4, delta_5                   +0.3 -0.2 -0.4  [L11 s15]
  GAE A_3 with lambda = 0.5                                       0.10  [L11 s16]
  IS weight, correct edit 0.70 / 0.40                             1.75  [L11 s23]
  IS weight, incomplete edit 0.20 / 0.40                          0.50  [L11 s23]
  trajectory ratio 1.05 ** 100                                   131.5  [L11 s24]
  reach probability ratio 0.10 / 0.40                             0.25  [L11 s26]
  PPO term, A=+1, ratio 0.5                                      +0.50  [L11 s32]
  PPO term, A=+1, ratio 0.8                                      +0.80  [L11 s32]
  PPO term, A=+1, ratio 1.0                                      +1.00  [L11 s32]
  PPO term, A=+1, ratio 1.2                                      +1.20  [L11 s32]
  PPO term, A=+1, ratio 1.5                                      +1.20  [L11 s32]
  PPO term, A=-1, ratio 0.5                                      -0.80  [L11 s32]
  PPO term, A=-1, ratio 0.8                                      -0.80  [L11 s32]
  PPO term, A=-1, ratio 1.0                                      -1.00  [L11 s32]
  PPO term, A=-1, ratio 1.2                                      -1.20  [L11 s32]
  PPO term, A=-1, ratio 1.5                                      -1.50  [L11 s32]
  partial reward [0,.25,.5,.25] minus mean     -0.25 +0.00 +0.25 +0.00  [L11 s45]
  entropy before collapse (0.2, 0.6, 0.2)                   0.950 nats  [beyond, L11 s47]
  entropy after collapse (0.01, 0.98, 0.01)                 0.112 nats  [beyond, L11 s47]
  reverse KL(student || teacher)                                 0.223  [L11 s52]
  forward KL(teacher || student), for contrast                   0.193  [beyond]
```

**What to notice.**

- Every slide number is reproduced exactly: J = 0.50, the bandit's +0.75 / 0 and +0.375 / +0.125, E\[ĝ\] = 0.1875 with SD 0.325 versus 0.108, the GRPO rows ±1, +1.73 / −0.58 and +0.58 / −1.73, TD errors +0.3, −0.2, −0.4, GAE 0.10, importance weights 1.75 and 0.50, 1.05^100 ≈ 132, and the reverse KL 0.223.
- The baseline sweep lands on b = 0.75, where the SD of ĝ is exactly zero. That is M2's optimal baseline b\* = E\[g²R\] / E\[g²\] = (0.25 × 0.5625) / 0.1875 = 0.75. In a two-action bandit both outcomes then give the same ĝ = 0.1875, so one sample equals the true gradient. Real tasks never get this lucky, but it shows why a well-chosen baseline matters so much.
- The 20-draw simulation matches the population values exactly only because this seed drew exactly 5 A's out of 20 (the expected 25%). Change the seed and the 20-draw SDs wander, while the 100,000-draw row stays put.
- The PPO rows trace L11's slide-32 plot. For A = +1 the term is flat above ratio 1.2; for A = −1 it is flat below 0.8. Outside those flat regions the min keeps the raw, more pessimistic term, so a ratio of 0.5 with A = +1 is not rescued, and a ratio of 1.5 with A = −1 is fully penalized.
- GRPO's σ-division changes weights between tasks, not within one: x2's lone success gets +1.73 while x1's successes get +1.00. That is exactly the per-instance reweighting DrGRPO removes.
- Entropy falls from 0.950 to 0.112 nats in the exploration-collapse example (a uniform three-way choice would be ln 3 ≈ 1.099). Logging per-token entropy lets you see this happen before success rates plateau.
- Reverse KL (0.223) and forward KL (0.193) differ on the same pair of distributions. The choice is not cosmetic: reverse KL, which L11 uses for on-policy distillation, is mode-seeking and punishes the student for putting mass where the teacher puts little.

### Example 3: design walkthrough — sizing a GRPO run for a bug-fixing agent

This walkthrough turns L9 and L11 into a plan for a real run: which tasks to train on, what group size, how many tokens and GPU-seconds per step, and what to watch. The scenario is L11's bug-fix task scaled up: a 7-billion-parameter coding agent, 3,000 bug-fix tasks, each judged by hidden unit tests (reward 1 if all pass). *Beyond the lecture:* the model size, task counts, token lengths and hardware throughput are illustrative assumptions; the reasoning steps follow the lectures.

**Step 1 — Screen task difficulty before training.** Run the starting policy 8 times on every task: 3,000 × 8 = 24,000 rollouts. Suppose 1,200 tasks go 0/8, 300 go 8/8 and 1,500 are mixed. The 300 all-pass tasks teach nothing (every advantage is zero, L9 slide 41). The 1,200 all-fail tasks need L11's diagnosis first: read 20 of them and ask whether the verifier is wrong, the model is not yet capable, or all attempts look the same. Hold out 200 of the mixed tasks as a fixed evaluation set, which L11's curriculum slide explicitly recommends. That leaves 1,300 training tasks for phase one.

**Step 2 — Choose the group size G.** A group of G binary rewards is degenerate with probability p^G + (1 − p)^G (M8). For typical mixed tasks with p around 0.2:

| Group size G | Degenerate, p = 0.05 | Degenerate, p = 0.2 | Degenerate, p = 0.5 | Rollouts per useful group at p = 0.2 |
| --- | --- | --- | --- | --- |
| 4 | 0.815 | 0.411 | 0.125 | 4 / (1 − 0.411) ≈ 6.8 |
| 8 | 0.663 | 0.168 | 0.008 | 8 / (1 − 0.168) ≈ 9.6 |
| 16 | 0.440 | 0.028 | 0.000 | 16 / (1 − 0.028) ≈ 16.5 |

G = 4 is cheapest per useful group but gives a noisy four-sample baseline and wastes 41% of groups. G = 16 almost never wastes a group but costs 16 rollouts each. Choose G = 8 with DAPO-style dynamic sampling: about 20% extra rollouts (1 / 0.832 ≈ 1.20) buy a batch in which every group has a signal. Very hard tasks (p = 0.05) stay degenerate two times in three even at G = 8, which is why Step 1 removed them.

**Step 3 — Count tokens per step.** Take B = 32 tasks × G = 8 = 256 trajectories. Assume 15 turns, 250 generated tokens and 400 observation tokens per turn, and a 1,500-token prompt.

- Generated tokens per step: 256 × 15 × 250 = 960,000.
- Tokens per trajectory: 1,500 + 15 × (250 + 400) = 11,250.
- Tokens the trainer processes: 256 × 11,250 = 2.88 million, of which only 960,000 (33%) have mask m = 1 and carry loss.

**Step 4 — Estimate compute per step.** Using M8's rules of thumb (training ≈ 6N FLOPs per token, forward-only ≈ 2N) with N = 7 × 10^9, and assuming 400 TFLOP/s sustained per H100-class GPU:

- Policy update: 6 × 7e9 × 2.88e6 ≈ 1.21 × 10^17 FLOPs ≈ 300 GPU-seconds.
- Reference-model forward pass for the KL term: 2 × 7e9 × 2.88e6 ≈ 4.0 × 10^16 FLOPs ≈ 100 GPU-seconds. Dropping the KL term (as DAPO does) removes it.
- Decoding: 960,000 tokens at an assumed 2,500 tokens/s per inference GPU ≈ 384 GPU-seconds, or about 460 with the 20% dynamic-sampling overhead.

Total ≈ 860 GPU-seconds per step, so 200 steps cost about 48 GPU-hours of pure compute. Expect real runs to take two to three times longer because of stragglers, weight syncs and restarts.

**Step 5 — Check wall-clock time and stragglers.** One trajectory takes about 15 × (250 tokens at \~30 tokens/s per sequence ≈ 8.3 s, plus a 3 s test run) ≈ 170 s. A synchronous step waits for the slowest of 256 trajectories (L11 slide 19). If the slowest runs 2.5 times the median, the step takes about 425 s while most rollout GPUs sit idle. The asynchronous design (L11 slide 20) removes the wait but makes data stale, so set a maximum staleness of one or two policy versions. Keep the per-token ratio with PPO-style clipping (ε = 0.2, or DAPO's 0.28 upper bound), and log the version lag and clip fraction.

**Step 6 — Compare memory for GRPO and PPO.** The policy with Adam in mixed precision needs about 16 bytes per parameter: 7e9 × 16 = 112 GB, so shard it over at least 4 GPUs (about 28 GB each, before activations). The frozen reference model adds 14 GB in bf16. PPO's critic doubles the trainable state to about 224 GB, plus another ≈ 1.2 × 10^17 FLOPs per step for its own forward and backward passes. This is the quantitative version of L9's closing point that GRPO was proposed as a cheaper alternative to PPO.

**Step 7 — Lock down the reward before step 1.** L11's false-negative and false-positive slides turn into two small tests. Run the verifier on 20 known-good patches written in unusual styles, which should all pass. Run it on 20 known-bad shortcuts, such as the constant `return 0` patch, which should all fail. Then close L11's reward-hacking routes: no internet, no future Git history, no model API keys, and no write access to test files.

**Step 8 — Decide what to monitor.** Track training reward and the fixed 200-task evaluation every 20 steps, since training reward alone can rise through hacking (L11 slide 43). Also track per-token entropy, clip fraction, mean response length, the degenerate-group rate and the version lag. Read 10 random successful trajectories every 20 steps, because a shortcut shows up in trajectories long before it shows up in averages.

| Decision | Choice | Main reason |
| --- | --- | --- |
| Training tasks | 1,300 mixed tasks; 200 held out | Only mixed groups give gradient; the held-out set gives an independent check |
| Group size | G = 8 with dynamic sampling | 17% degenerate at p = 0.2; about 20% rollout overhead |
| Batch | 32 tasks × 8 = 256 trajectories | about 1 million generated tokens per step |
| Algorithm | GRPO or DrGRPO, clipped per-token ratio | No critic: half the trainable memory of PPO |
| KL to reference | Optional, small β | Costs about 100 GPU-seconds per step; many recent recipes drop it |
| Scheduling | Async, staleness ≤ 2 versions | 170 s median trajectories with a long tail |
| Budget | 200 steps ≈ 48 GPU-hours of compute | Plan for 2–3 times that in wall-clock GPU time |

**What to notice.**

- Difficulty screening is the cheapest improvement available. It costs one pass of 24,000 rollouts and sets aside half the task pool (1,500 of 3,000 tasks) that would have produced zero or unreliable gradient.
- Only a third of the tokens the trainer processes carry loss, yet all of them cost forward and backward compute. Long tool observations make agent RL much more expensive than chat RL of the same response length.
- Decoding plus environment time, not the gradient step, sets wall-clock time. That is why L11 moves from synchronous to asynchronous RL, and why asynchrony forces importance ratios and clipping into the loss.
- The GRPO-versus-PPO choice is mostly a systems decision. Dropping the critic halves trainable memory and removes a whole training pass, at the cost of needing G rollouts per task.
- Reward checks come before scale. A verifier with a 5% false-positive rate turns a 48-GPU-hour run into a very efficient way to learn a shortcut.

## Design patterns, pitfalls and checklist

Most agent RL failures come from the data and the reward, not from the choice between PPO and GRPO. The patterns below are the reusable moves from L9 and L11 plus common practice; the failure table maps symptoms you will see in logs to causes and fixes.

### Named patterns and when to use them

| Pattern | What it is | Use when | Cost or caveat | Source |
| --- | --- | --- | --- | --- |
| Rejection-sampling fine-tuning (ReST / ReST-EM) | Sample, keep R = 1 trajectories, run SFT on them, repeat | Binary rewards and a policy that already succeeds sometimes; first RL step for a new agent | Ignores failures; no signal on all-fail tasks | L9 slides 15–16, 24 |
| Group-relative baseline (GRPO, DrGRPO, leave-one-out) | Sample G rollouts per task, use R − group mean as the weight | Verifiable outcome rewards; tasks cheap enough to try G times | G× rollout cost; degenerate groups give nothing | L9 slides 37–40 |
| Learned critic with GAE (PPO) | Train Vφ, compute TD errors, blend them with λ | Long horizons with intermediate rewards; you need per-turn credit | A second trainable model; critic must be accurate to help | L11 slides 12–16 |
| Difficulty screening and dynamic sampling | Drop all-pass and all-fail groups; keep sampling until the batch is full | Always, with group methods | Extra rollouts; changes the task distribution | L11 slide 44 (DAPO) |
| Clipped importance-weighted surrogate | Ratio πθ / μ per token, clipped to \[1 − ε, 1 + ε\] | Async rollouts, several epochs per batch, any stale data | Clipping discards some gradient; watch clip fraction | L11 slides 22–32 |
| Bounded-staleness async RL | Rollout workers keep generating; tag each trajectory with its policy version | Long, variable-length agent episodes with stragglers | Needs version tags, μ log-probs and a staleness cap | L11 slides 19–20 |
| Warm start plus curriculum | SFT on teacher demos, then practice on sometimes-solved tasks, then harder ones | The student almost never succeeds | Keep old tasks in the mix; use a fixed eval set | L11 slide 49 |
| On-policy distillation | Student generates histories; teacher supplies per-token targets; minimize reverse KL | A stronger teacher exists; you want dense signal | Needs teacher log-probs at every student token | L11 slides 51–53 |
| Partial or auxiliary reward | Add credit for progress (checks passed, valid tool calls) | Success is rare and most groups are degenerate | The model optimizes the proxy; cap and audit it | L11 slides 45–46 |
| Independent evaluation | Measure progress on held-out tasks with a different check than the training verifier | Always | Costs extra evaluation compute | L11 slide 43 |

### Failure modes: symptoms, causes and fixes

| Symptom in the logs | Likely cause | How to confirm | Fix |
| --- | --- | --- | --- |
| Loss is near zero and reward is flat from step 0 | Most groups are degenerate (tasks too hard or too easy) | Log the fraction of groups with identical rewards | Screen difficulty, dynamic sampling, warm start, partial rewards |
| Training reward climbs but held-out success does not | Reward hacking through a false positive | Read successful trajectories; run a stricter verifier on them | Fix the verifier; remove shortcuts (internet, Git history, API keys, test access) |
| Reward plateaus below 100% while outputs look correct | False negatives in the verifier | Audit failed trajectories by hand | Check behaviour, not wording; fix broken tests |
| Response length grows steadily, especially on wrong answers | Per-response 1/\|y\| normalization favours long wrong answers | Plot length separately for correct and incorrect responses | Use DrGRPO's constant normalizer or token-level aggregation |
| All G rollouts look the same; pass@k ≈ pass@1 | Exploration or entropy collapse | Track per-token entropy and trajectory diversity | Entropy bonus, higher sampling temperature, DAPO's higher upper clip |
| Loss spikes or divergence after switching to async | Stale rollouts with extreme ratios | Log version lag and clip fraction | Cap staleness, clip ratios, try CISPO or GSPO weighting |
| Ratio πθ / μ is not 1 even on fresh data | Inference engine and trainer compute different log-probs | Measure the ratio at step 0 before any update | Recompute μ in the trainer or correct with truncated importance weights |
| PPO is unstable or no better than REINFORCE | Critic is inaccurate early in training | Track value loss and explained variance | Warm up the critic first, or switch to a group baseline |
| Easy tasks dominate the gradient | Division by a small group σ on near-always-pass tasks | Compare advantage magnitudes by task pass rate | Drop σ division (DrGRPO) or filter easy tasks |
| Model optimizes a side metric (odd tool calls, repeated phrases) | Auxiliary reward is misspecified | Log each reward component separately | Cap or anneal the auxiliary term; remove it once success is common |
| Model starts imitating tool outputs | Loss mask includes observation tokens | Check that m\_t = 1 only on sampled tokens | Fix the mask; unit-test it on a known transcript |
| Two methods rank differently across papers or runs | Learning rates tuned for one method only | Sweep the learning rate per method | Compare at each method's best step size (see Example 1) |

### Builder's checklist

- [ ] The verifier accepts 20 hand-written correct solutions in unusual styles and rejects 20 known shortcuts.
- [ ] The sandbox has no internet, no future Git history, no model API keys and no write access to tests.
- [ ] Each task has been screened with 8 or more rollouts, and all-pass and all-fail tasks are handled deliberately.
- [ ] A fixed held-out evaluation set exists and uses a check independent of the training reward.
- [ ] The loss mask covers only tokens the policy sampled, including end-of-turn tokens, and is unit-tested.
- [ ] Every trajectory stores its policy version and the sampler's per-token log-probs.
- [ ] The ratio πθ / μ has been measured at step 0 and is close to 1.
- [ ] Staleness is capped, and the ratio is clipped or truncated.
- [ ] The advantage estimator (group mean, σ division, critic) and length normalization are chosen on purpose, not left at a default.
- [ ] Logs include reward, held-out success, degenerate-group rate, entropy, clip fraction, KL, response length and version lag.
- [ ] Someone reads 10 random successful trajectories at a regular interval.
- [ ] Each auxiliary reward component is logged separately and has a plan for removal.
- [ ] The learning rate has been swept for the chosen method.
- [ ] Tokens, GPU-seconds and wall-clock per step are estimated before launch (see Example 3).

### Patterns and pitfalls from L12–L15

L12 adds the systems layer of policy-gradient RL. Its patterns are about keeping the sampler and trainer consistent and busy; its pitfalls are bugs that look like algorithm failures. (Monitoring and orchestration patterns for agent workflows in general are in T13; sandbox and credential isolation for RL environments is in T14.)

**Named patterns and when to use them.**

- **Token-in, token-out (TITO).** Carry the sampled token IDs and their log-probs from the engine to the trainer; never round-trip through text. Use always. Source: L12 slides 23–24.
- **Extension-preserving renderer.** Build each turn's prompt by appending tokens so turn n is an exact prefix of turn n+1; keep past reasoning if the default template strips it. Use for every multi-turn agent; it buys O(T) instead of O(T²) training compute and prefix-cache hits. Source: L12 slides 19–22.
- **Decoupled, truncated importance weight.** Clip the trust-region ratio πθ/π\_old and apply a stop-gradient, truncated behaviour weight π\_old/μ (M9). Use whenever sampler and trainer are different engines, sync or async.
- **Rollout Routing Replay.** Record MoE expert choices at sampling and replay them in both training passes. Use for any mixture-of-experts policy. Source: L12 slide 17.
- **Disaggregated async with in-flight updates.** Split GPUs (e.g. 3:1 inference to training), pause and resume generation for weight loads, cap staleness. Use when rollouts are long-tailed and stall time is above zero. Source: L12 slides 25–26.
- **Delta weight sync.** Send only parameters whose bf16 value changed (\~99% do not). Use for very large models or when inference runs in another cluster or region. Source: L12 slide 16.
- **Harness-agnostic proxy.** Put an API-emulating middleman between unmodified harnesses and the engine, and let it write the rollout store. Use when training inside Codex-, Claude Code- or OpenHands-style harnesses. Source: L12 slide 29.
- **Multi-LoRA tenancy.** Run many LoRA RL jobs concurrently on one base model to fill each other's idle gaps. Use for many small experiments or a training service with several users. Source: L12 slides 40–41.

| Failure | Symptom | Fix |
| --- | --- | --- |
| Re-tokenized strings sent to the trainer | Rare, very large ratios on specific samples; loss spikes that do not track staleness | Ship token IDs and sampler log-probs end to end (TITO) |
| Chat template strips past reasoning | Prefix-cache misses; each turn becomes its own datapoint; trainer compute grows quadratically with turns | Custom renderer that preserves sequence extension; round-trip test turn n against turn n+1 |
| MoE routing differs between engines | importance\_weight\_max spikes only on MoE models; instability even in sync runs | Rollout Routing Replay; GSPO-style sequence ratio as a partial mitigation |
| Kernel or precision mismatch ignored | Ratio not 1 at step 0; slow drift, then collapse | Log ratios from step 0; truncated importance weights; batch-invariant kernels or FP16 |
| Staleness creeping up | Average staleness rising; stall time > 0; clip fraction rising | More inference replicas or a different GPU ratio; lower the staleness cap |
| Frozen speculative drafter | Decode throughput falls over training | Train the drafter online with SFT or distillation |
| Trust region centred on a stale μ | Clip fraction near 1 on old samples; tiny effective updates | Clip around π\_old and move the π\_old/μ factor into a truncated weight (M9) |
| Mixed-version trajectory treated as single-version | Wrong ratios after in-flight updates | Record log-prob and version per token, not per trajectory |

- [ ] At step 0 of every run, mean π\_train/π\_rollout is within about 1% of 1 and importance\_weight\_max is small.
- [ ] A unit test asserts that turn n's tokens are a prefix of turn n+1's prompt for the production renderer.
- [ ] For MoE policies, routing decisions are recorded at sampling and replayed in training.
- [ ] Policy version and sampler log-prob are stored per token, and a staleness cap is set.
- [ ] The dashboard shows the timing breakdown (rollout, update, stall, total) next to reward, pass@k and entropy.

### Patterns and pitfalls from L20

L20 asks what RL training does to the coverage that test-time search depends on. Its patterns protect pass@k while pass@1 is optimized. (Selection and verifiers are in T12; pass@k estimation is in T9.)

**Named patterns**

- **Track the pass@1–pass@k pair.** Log pass@1 and pass@k (several k) on held-out tasks at every evaluation; a widening pass@1 gain with a shrinking pass@k is sharpening. Use always when the deployed system samples more than once.
- **Reward rare correct solutions.** Add an unlikeliness bonus for correct samples the policy rated improbable (Rewarding the Unlikely). Use when GRPO keeps reinforcing one proof or patch style.
- **Change rewards on correct trajectories only.** Modify the reward only on correct samples and leave incorrect ones alone (Differential Smoothing). Use when you want pass@k back without giving up pass@1.
- **Scale the objective with the sampling budget.** Move from expected reward toward likelihood of success as rollouts per prompt grow (MaxRL). Use when many rollouts per prompt are affordable and test-time sampling is planned.
- **Train at the serving temperature.** Sample rollouts at the temperature the model will be served at (often 1.0 for reasoning models) and score them with the same logit scaling. Use always.
- **Alternate weights and harness.** Interleave rejection-sampling fine-tuning with harness search (WHALE). Use when the harness is still being designed and both can be evaluated on the same tasks.

| Failure | Symptom | Fix |
| --- | --- | --- |
| Sharpening | pass@1 rises, large-k pass@k falls below the base model | Unlikeliness reward, Differential Smoothing or MaxRL; entropy checks (Concept 7) |
| Overdone diversity bonus | pass@k rises but pass@1 drops | Smaller bonus; apply it to correct samples only |
| Temperature mismatch | Ratios differ from 1 at step 0; rollouts look unlike served outputs | Same temperature and logit scaling in sampler and trainer (Concept 11) |
| Harness fixed too early | Weight training plateaus; a harness change later gives a big jump | Alternate harness search with training (WHALE) |
| Harness tuned for weak weights | Harness search alone gains nothing (WHALE's 0.4% on Math) | Improve the weights first, then search the harness again |

- [ ] Held-out pass@k at several k is logged next to pass@1 and entropy.
- [ ] The base model's pass@k curve is kept as a reference to detect sharpening.
- [ ] Rollout temperature matches the serving temperature, and the trainer scales logits the same way.
- [ ] Any diversity bonus is tuned against pass@1, not only pass@k.
- [ ] If the harness may change, weights are re-evaluated under the new harness before shipping.

### Patterns and pitfalls from L21

L21 treats search as a source of training data. Its patterns decide what to distil from search and when the loop is worth running at all. (Search algorithms are in T5; scorers for partial states are in T12.)

**Named patterns**

- **Expert Iteration.** Alternate search guided by the current policy with training on the search's decisions. Use when search reliably beats the raw policy and a cheap scorer exists.
- **Distil the visit distribution, not the argmax.** Train the policy head on normalized visit counts and the value head on the final outcome (AlphaZero). Use when the same actions are revisited often enough for counts to mean something.
- **Train on the whole search trace.** Keep failed branches and backtracking in the target (Stream of Search, Searchformer). Use when you want the model to recover from mistakes, not only reproduce clean answers.
- **Improve the trace policy with a verifier.** After trace training, run sample → filter → fit (STaR) or an RL step that also penalizes extra expansions (APA). Use when correct answers can be checked automatically.
- **Co-train policy and process reward model.** Alternate policy training on correct traces with PRM training on search-derived step values (ReST-MCTS\*). Use when final answers are known but step labels are not.

| Failure | Symptom | Fix |
| --- | --- | --- |
| Visit counts never accumulate | Nearly every child has one visit; π\_search is close to uniform over unique strings | Cap or cluster children; use discrete actions; or train on traces instead of tree statistics |
| Weak value model | Search is no better than sampling; distilled policy stalls | Use an exact checker (tests, Lean, game result) where possible; check value accuracy on held-out states |
| Search cost not repaid | Training compute grows several-fold for little gain | Compare against best-of-N + rejection sampling at equal compute first |
| Trace bloat | Distilled model writes long, wandering searches | Add an expansion penalty (APA) or keep shorter successful traces (Searchformer) |
| Optimal-path-only data | Model cannot backtrack after an early mistake | Include failed branches in the training stream (SoS: 25.73% → 51.27%) |

- [ ] Measure how much search beats the raw policy before building the training loop.
- [ ] Check that the search scorer is more accurate than the policy it will teach.
- [ ] Log the visit-count spread (unique children per node) when distilling tree statistics.
- [ ] Compare against rejection sampling at the same compute.
- [ ] Track search length as well as accuracy after each improvement round.

## Landscape

The field moved from PPO with a learned critic (2017–2022) to critic-free group methods with verifiable rewards (2024 onward), and then to agent-specific systems work on environments, asynchrony and reward reliability (2025–2026). The tables list the algorithms, agent training systems and reward-reliability findings the lectures rely on, newest first. Numbers come from the lecture slides or the linked paper abstracts.

### Algorithms

| Method | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [GSPO](https://arxiv.org/abs/2507.18071) (Zheng et al., Qwen, Jul 2025) | Sequence-level, length-normalized importance ratio with PPO-style clipping | Authors report better efficiency than GRPO, more stable Mixture-of-Experts RL, and use in Qwen3 | L11 slides 27, 35; L7 (CUA-Gym uses it) |
| [CISPO](https://arxiv.org/abs/2506.13585) (MiniMax-M1, Jun 2025) | Clipped importance weight used as a fixed coefficient (stop-gradient) on log π | MiniMax-M1's full RL run took 3 weeks on 512 H800 GPUs, about $534,700 | L11 slides 30–31, 35 |
| [Dr. GRPO](https://arxiv.org/abs/2503.20783) (Liu et al., Mar 2025) | GRPO without σ division and without per-response 1/\|y\| | 43.3% on AIME 2024 with a 7B base model | L9 slides 39–40 |
| [DAPO](https://arxiv.org/abs/2503.14476) (Yu et al., Mar 2025) | Decoupled clip (higher upper bound), dynamic sampling, token-level loss, overlong shaping | 50 points on AIME 2024 from the Qwen2.5-32B base model; open code on verl | L11 slides 35, 44, 47 |
| [DeepSeek-R1 / R1-Zero](https://arxiv.org/abs/2501.12948) (Jan 2025) | GRPO with rule-based rewards on a large base model; R1 adds a cold-start SFT stage | R1-Zero AIME 2024 pass@1 rose from 15.6% to 71.0% during RL; R1 reached 79.8% | L5, L8 (cold start before RL) |
| [Tulu 3 RLVR](https://arxiv.org/abs/2411.15124) (Lambert et al., Nov 2024) | Names "reinforcement learning with verifiable rewards" as a post-training stage | Open recipe combining SFT, DPO and RLVR | Beyond the lectures |
| [RLOO / Back to Basics](https://arxiv.org/abs/2402.14740) (Ahmadian et al., Feb 2024) | REINFORCE with a leave-one-out group baseline | Reports that many PPO components are unnecessary for RLHF and that REINFORCE-style methods can beat PPO at lower cost | Beyond the lectures |
| [GRPO / DeepSeekMath](https://arxiv.org/abs/2402.03300) (Shao et al., Feb 2024) | Group-relative advantage, no critic, per-token ratio, clip and KL | 51.7% on MATH (7B, no tools or voting); 60.9% with self-consistency | L9 slides 37–42; L11 slide 33 |
| [ReST-EM](https://arxiv.org/abs/2312.06585) (Singh et al., Dec 2023) | Sample, filter with binary reward, fine-tune, repeat | Beats fine-tuning on human data alone on math and code with PaLM 2 | L9 slides 15–16 |
| [ReST](https://arxiv.org/abs/2308.08998) (Gulcehre et al., Aug 2023) | Grow a dataset from the policy, improve with offline RL or filtered SFT | Demonstrated on machine translation | L9 slides 15–16 |
| [GKD / on-policy distillation](https://arxiv.org/abs/2306.13649) (Agarwal et al., 2023; ICLR 2024) | Student generates; teacher supplies per-token targets | Addresses train–inference mismatch of standard distillation | L11 slides 50–52 |
| [Process reward model](https://arxiv.org/abs/2305.20050) (Lightman et al., May 2023) | Step-level correctness model as a surrogate for value | 78% on a representative MATH test subset; released PRM800K (800,000 step labels) | L11 slide 17 |
| [InstructGPT](https://arxiv.org/abs/2203.02155) (Ouyang et al., Mar 2022) | PPO with a learned reward model and a separate value network | 1.3B InstructGPT outputs preferred over 175B GPT-3 | L11 slide 14 |
| [PPO](https://arxiv.org/abs/1707.06347) (Schulman et al., Jul 2017) | Clipped surrogate objective; several epochs per batch | The default policy optimizer for RLHF until 2024 | L11 slides 30–34 |
| [MIXER](https://arxiv.org/abs/1511.06732) (Ranzato et al., 2015; ICLR 2016) | Sequence-level REINFORCE for text generation with a learned baseline | Early use of a value head on a text model | L11 slides 13–14 |
| [GAE](https://arxiv.org/abs/1506.02438) (Schulman et al., 2015; ICLR 2016) | λ-weighted sum of TD errors as the advantage | Standard advantage estimator for PPO | L11 slide 16 |
| REINFORCE (Williams, 1992) | Score-function policy gradient | The base estimator all others modify | L9 slides 18–24 |

### Agent RL environments, systems and results

| System | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [CUA-Gym](https://arxiv.org/abs/2605.25624) (Wang et al., May 2026) | Resettable mock apps with co-generated tasks and verifiers for computer-use agents | 110 environments, 32,112 verified RLVR tuples, 38% cross-application; L7 shows 3,578 SFT demos then GSPO on 10,858 tuples, with OSWorld 62.2 → 72.6% in the data-scale ablation | L7 slides 82–85 |
| [AReaL](https://arxiv.org/abs/2505.24298) (Fu et al.) | Fully asynchronous RL with staleness control | Up to 2.77× training speedup over synchronous systems on the same GPUs | L11 slides 19–20 |
| [SkyRL-Agent](https://arxiv.org/abs/2511.16108) (Cao et al., Nov 2025) | Multi-turn agent RL framework from Berkeley's SkyRL project | SA-SWE-32B: 39.4% pass@1 on SWE-bench Verified; async dispatcher 1.55× faster than naive async batching | L1 (SkyRL named as training software) |
| [DR Tulu-8B](https://arxiv.org/abs/2511.19399) (Shao et al., Nov 2025; ICML 2026) | Deep research agent trained with RL on evolving rubrics (RLER) | Authors report matching OpenAI Deep Research on average across four long-form benchmarks at about 1000× lower cost per query | L10 |
| DeepCoder-14B-Preview (Luo et al., Apr 2025) | Execution-reward RL for code (GRPO with DAPO-style changes) on 24,000 problems | 60.6% pass@1 on LiveCodeBench; L6 shows the response limit growing 16K → 32K tokens during RL | L6 slides 28–30 |
| [R2E-Gym](https://arxiv.org/abs/2504.07164) (Jain et al., Apr 2025) | Procedurally generated executable software-engineering environments | 8.7K+ tasks; 34.4% pass@1 (32B); 51% on SWE-bench Verified with hybrid test-time verifiers | L6 slide 49 |
| [SWE-Gym](https://arxiv.org/abs/2412.21139) (Pan et al., Dec 2024) | First executable training environment for real-world software engineering agents | 2,438 Python task instances; up to 19% absolute gains; 32.0% on SWE-bench Verified | L6 slide 48 |
| [verl / HybridFlow](https://arxiv.org/abs/2409.19256) (Sheng et al., Sep 2024) | RL training framework mixing single- and multi-controller designs | 1.53× to 20.57× throughput over earlier systems | Beyond the lectures (DAPO builds on it) |
| [OpenRLHF](https://arxiv.org/abs/2405.11143) (Hu et al., May 2024) | Ray + vLLM + DeepSpeed RL framework | 1.22× to 1.68× speedups over prior frameworks | Beyond the lectures |

### Reward reliability findings cited in L11

| Finding | What happened | Number | Source |
| --- | --- | --- | --- |
| Goblin metaphors (OpenAI, Apr 2026) | A persona reward favored "goblin" and "gremlin" metaphors, which spread beyond the persona | Qualitative | L11 slide 46 |
| SWE-bench Verified audit (OpenAI, Feb 2026) | Many remaining failures had flawed tests | Progress slowed near 80.9% | L11 slide 40 |
| τ-bench fixes (Feb 2026) and SABER (Cuadron et al., 2025) | Inconsistent tasks and annotation errors capped achievable scores | Airline ≈ 70%, Retail ≈ 92% | L11 slide 40 |
| Calculator hacking (OpenAI, Dec 2025) | A bug credited superficial web-tool calls; GPT-5.1 used the browser as a calculator | Qualitative | L11 slide 46 |
| MAI-Thinking-1 | Agents found web, Git-history and test-runner shortcuts | Qualitative | L11 slide 42 |
| PostTrainBench | An agent used a grading API key to generate training data despite a restriction | Qualitative | L11 slide 42 |
| OpenThoughts-Agent and MAI-Thinking-1 on SFT before RL | RL without SFT barely moves the base model; the best recipe starts RL from an SFT checkpoint chosen with RL in mind | Qualitative | L8 slide 47 |

### Added with L12–L15

Systems that make policy-gradient RL run at scale, from L12 (Gandhi). Numbers come from the slides or the linked abstracts and posts.

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [PipelineRL](https://arxiv.org/abs/2509.19128) (Piché et al., Sep 2025) | Async RL with in-flight weight updates: the engine takes new weights mid-generation | About 2× faster learning than conventional RL baselines on 128 H100 GPUs (abstract) | L12 slide 25 |
| [AReaL](https://arxiv.org/abs/2505.24298) (Fu et al., 2025) and AReaL 2.0 (2026) | Fully async RL with a staleness-enhanced PPO variant; 2.0 adds a microservice and online-RL design | Up to 2.77× speedup over synchronous systems on the same GPUs; SPMD pseudocode labelled "versions < 1.0" | L12 slides 25, 30, 39 |
| [Truncated importance sampling](https://neurips.cc/virtual/2025/124259) (Yao, Liu et al., 2025) | Corrects the vLLM-versus-FSDP probability gap with a capped ratio | Keeps RL stable even with quantized rollouts (abstract gives no numbers) | Beyond the lecture |
| [Batch-invariant inference](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) (Thinking Machines, Sep 2025) | Kernels whose results do not depend on batch size | Bitwise-equal sampler and trainer log-probs; KL stays at 0 | Beyond the lecture |
| [FP16 for RL](https://arxiv.org/abs/2510.26788) (Qi et al., 2025) | Train and sample in FP16 instead of BF16 | Claims to remove the training–inference mismatch without changing model or algorithm | Beyond the lecture |
| [Rollout Routing Replay, R3](https://arxiv.org/abs/2510.11370) (Ma et al., 2025) | Replays the sampler's MoE expert choices during training | Cuts training–inference KL, prevents collapse, outperforms GSPO and TIS (abstract) | L12 slide 17 |
| [PULSE](https://arxiv.org/abs/2602.03839) (Miahi and Belilovsky, 2026) | Delta weight sync exploiting bf16-invisible updates | \~99% of parameters unchanged per step; over 100× less sync traffic; 1T-parameter full sync ≈ 2 TB | L12 slide 16 |
| [Snowflake ZoRRo / Arctic RL](https://www.snowflake.com/en/developers/guides/arctic-rl-unified-post-training-backend/) (2026) | Prefix sharing in the trainer for GRPO batches | 80–95% duplicate prompt tokens; up to 6× faster actor updates | L12 slide 14 |
| [AReaL-DTA](https://arxiv.org/abs/2602.00482) (Zhang et al., 2026, ICML) | Dynamic tree attention over prefix trees of multi-turn rollouts | 9.43× compression on τ²-bench (slide); up to 8.31× throughput vs dense training | L12 slide 14 |
| [No Token Left Behind (Miles TITO)](https://lmsys.org/blog/2026-05-13-no-token-left-behind) (LMSYS / Miles team, 2026) | Token-in, token-out design for agentic RL | Many-to-one de-tokenization example: "Hello" from four ID sequences | L12 slides 21–24 |
| [Agent Lightning](https://arxiv.org/abs/2508.03680) (Luo et al., Aug 2025) | Decouples agent execution from training via an API-level middleman | Trains agents from existing frameworks with almost no code changes | L12 slide 29 |
| [AstraFlow](https://arxiv.org/abs/2605.15565) (Zheng et al., May 2026) | Dataflow-oriented, elastic, cross-region RL with multi-policy training | 2.7× faster training for multi-policy collaborative training (abstract) | L12 slides 37–38 |
| [Multi-LoRA RL](https://www.trajectory.ai/field-notes/multi-lora-training-for-continual-learning) (SkyRL + Trajectory Labs, 2026) | Concurrent LoRA RL jobs on one base model with SGMV kernels | 8 GSM8K runs (Qwen3-4B): 2.81× throughput; 5,433 s concurrent vs 15,244 s serial | L12 slide 40 |
| [Tinker](https://thinkingmachines.ai/blog/announcing-tinker/) (Thinking Machines) | Multi-tenant, multi-LoRA training service with a four-call API | forward\_backward, optim\_step, sample, save\_state | L12 slide 41 |
| [Cursor Composer real-time RL](https://cursor.com/en/blog/real-time-rl-for-composer) (Mar 2026) | Online RL from production interactions | New checkpoint about every 5 hours; data "fully or almost-fully on-policy" | L12 slide 39 |

### Added with L20

Training methods L20 (Fried) cites for protecting coverage, plus WHALE. Numbers come from the L20 slides or the linked abstracts.

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| Rewarding the Unlikely (He, Fried and Welleck, 2025) | Unlikeliness reward that up-weights rare correct solutions, countering GRPO's rank bias | Better pass@N across a wide range of N in formal theorem proving | L20 slide 7 |
| Differential Smoothing (Gai et al., 2025/2026) | Reward modification on correct trajectories only, against selection and reinforcement bias | Improves pass@1 and pass@k; up to 6.7% gains on AIME24 | L20 slide 7 |
| MaxRL (Tajwar et al., 2026) | Sample-based objectives that interpolate from expected reward to maximum likelihood as sampling compute grows | Up to 20× better test-time scaling efficiency than GRPO | L20 slide 7 |
| WHALE (Kim et al., 2026) | Alternating online rejection-sampling fine-tuning and Meta-Harness search | SearchQA / Math / Chess 48.3 / 24.8 / 29.8 vs rejection SFT 38.3 / 15.4 / 22.2; gains of 4.15 to 24.38 points over baselines | L20 slide 29 |

### Added with L21

Search-then-train loops L21 (Koh) cites. Numbers come from the L21 slides unless marked as from the paper abstract.

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| Expert Iteration (Anthony, Tian and Barber, 2017) | Tree search as expert, neural policy as apprentice; the policy is trained on search decisions and guides the next search | The loop behind AlphaGo Zero | L21 slide 13 |
| AlphaGo Zero / AlphaZero (Silver et al., 2017, 2018) | Self-play with MCTS at every move; policy head trained toward visit counts, value head toward the game result | Loss (z − v)² − πᵀ log p (L2 omitted) | L21 slides 14, 97, 99 |
| ReST-MCTS\* (Zhang et al., 2024) | MCTS\* traces on questions with known answers train a PRM and the policy, alternately | Per-step values (0 to 1) inferred from reaching the correct answer | L21 slide 96 |
| Stream of Search (Gandhi et al., 2024) | 250M model trained on 500k serialized search traces, then improved with STaR or APA | Game of 24: 25.73% (OP) → 51.27% (SoS) → 55.59% (+STaR) / 56.52% (+APA) | L21 slides 30–32 |
| Searchformer (Lehnert et al., 2024) | Transformer trained on A\* search dynamics, then fine-tuned on shorter successful traces | 93.7% of unseen Sokoban puzzles solved optimally, up to 26.8% fewer search steps than A\* (abstract) | L21 slide 88 |
| DeepSeek-R1 §4.2 (2025) | Reported MCTS among unsuccessful attempts for reasoning RL | Cited as "unsuccessful MCTS attempt" | L21 slide 91 |

## Open problems

The algorithms are now fairly settled; what remains hard is getting the right signal to the right action in long, expensive, partly observed agent episodes. Each problem below names what is open and why it resists easy fixes.

**1. Credit assignment over long horizons.** An agent episode can run 50 turns and 100,000 tokens, yet most RL for agents still gives one scalar at the end. Group baselines tell a trajectory it was better than its siblings, but every turn inside it gets the same weight (L9 slide 34, L11 slide 9). Critics could separate good turns from bad ones, but learning V(h) over huge, varied histories is hard, and an inaccurate critic adds bias rather than removing variance. Process reward models help in math, but step labels are costly and the idea of a "step" is fuzzy for tool use. *Why it is hard:* the signal-to-noise ratio falls with every added turn, and each fix trades variance for bias or for labeling cost.

**2. Rewards for open-ended tasks.** Unit tests and exact answers cover coding and math. Research reports, UI tasks and customer-service dialogs need rubrics or judge models, which the policy can learn to please without doing the task. DR Tulu's evolving rubrics (L10) and CUA-Gym's co-generated verifiers (L7) are early answers. *Why it is hard:* any learned or written judge is a fixed target, and RL is an optimizer that searches specifically for where that target is wrong.

**3. Detecting reward hacking before it spreads.** L11's examples (calculator hacking, goblin metaphors, grading-key misuse) were found after the fact by people reading outputs. There is no general detector that flags a shortcut while training reward is still rising. *Why it is hard:* a hack is by definition behavior the verifier scores as correct, so the training signal itself cannot reveal it; you need an independent check, and it must anticipate shortcuts nobody has seen yet.

**4. Correcting for stale, long trajectories.** Asynchronous RL is necessary for throughput, but the per-token ratio ignores that earlier actions changed which histories were reached (L11 slide 26). The full trajectory ratio fixes that in principle but explodes (1.05^100 ≈ 132). CTPO's cumulative ratios, GSPO's length-normalized sequence ratio and CISPO's clipped weights are different compromises. *Why it is hard:* there is a basic bias–variance trade-off, and the right compromise depends on episode length and staleness, which vary within a batch.

**5. Does RL create new abilities or only sharpen existing ones?** *Beyond the lecture:* [Yue et al. (2025)](https://arxiv.org/abs/2504.13837) report that base models beat their RLVR-trained versions on pass@k when k is large, suggesting RL mostly concentrates probability on solutions the base model could already find. L11's exploration-collapse slide shows the mechanism: entropy falls and alternatives stop being sampled. *Why it is hard:* exploration in a space of token sequences is enormous, and the usual tools (entropy bonuses, temperature) add randomness without direction.

**6. Building environments at scale.** L7 argues that RL needs resettable replicas, not the real world, because real bookings cost money and affect real people. CUA-Gym needed 110 environments to produce about 32,000 verified tasks. *Why it is hard:* each environment must be faithful enough to transfer, cheap enough to run thousands of times in parallel, and paired with a verifier that is itself correct.

**7. Interference between capabilities.** L8 quotes MAI-Thinking-1: training on one capability moves others, whether or not you measure them. RL on bug fixing can change chat style, refusal behavior or long-context skill. *Why it is hard:* the evaluation surface is much larger than the training reward, and mixing tasks by examples is not the same as mixing them by tokens.

**8. Training–inference mismatch and numerics.** Even "on-policy" rollouts are sampled by an inference engine whose log-probabilities differ slightly from the trainer's, and Mixture-of-Experts routing can differ between them. Small per-token gaps compound over long agent responses. *Why it is hard:* the two systems are optimized for different goals (speed versus exact gradients), and forcing them to agree costs throughput.

**9. Cost and sample efficiency.** Generation and environment time dominate wall-clock time, and degenerate groups waste a large share of rollouts on hard tasks. Curricula, difficulty prediction, replay of old successes and off-policy reuse all help. *Why it is hard:* reusing data makes it staler, which brings back problem 4, and predicting difficulty requires the rollouts you wanted to save.

**10. Choosing between RL and distillation.** L11 closes with on-policy distillation and self-distillation, which give dense per-token targets. When a strong teacher exists, distillation can be far cheaper than RL. *Why it is hard:* the frontier model has no teacher, and nobody yet knows how to combine sparse outcome rewards with dense teacher signals without one drowning out the other.

**11. Credit across broken and branching sequences.** L12 shows that real harnesses compact history and spawn sub-agents (Recursive Agent Optimization, Recursive Language Models), so one episode becomes several datapoints or a tree of sequences that share one final reward. It is unclear how much credit a summary S, or a sub-agent's work, should receive, and broken sequence extension also multiplies training compute. *Why it is hard:* the policy-gradient derivation assumes one trajectory with one history; once context is rewritten mid-episode, the actions are no longer conditioned on what actually happened, and no standard estimator handles that.

**12. Online RL from production traffic.** L12 cites Cursor shipping a new Composer checkpoint every 5 hours from real user interaction, and AReaL 2.0 records trajectories straight from deployed agents. Rewards then come from noisy user behaviour, the task distribution shifts with the product, and a regression ships within hours. *Why it is hard:* the reward is a proxy the policy can learn to please (problem 3), the data is never quite on-policy, and safety and privacy checks (see T14) must run at the same cadence as training.

**13. Reproducible, debuggable asynchronous runs.** In-flight weight updates, elastic replicas and mixed hardware (8×H100 beside 4×MI350 on L12's slide) mean two runs with the same seed diverge, and a single trajectory can mix policy versions. *Why it is hard:* exact reproducibility needs batch-invariant kernels, deterministic scheduling and per-token version logs, and each costs throughput, which is the reason the system went asynchronous in the first place.

## Glossary

These 25 terms cover the vocabulary of L9 and L11; symbols follow L11's notation slides.

| Term | Meaning |
| --- | --- |
| Advantage Â\_t | How much better an action did than the policy's average from the same history: Q(h, a) − V(h), estimated in practice as R − b(h) or with GAE. |
| Asynchronous RL | Running sampling and training at the same time on separate GPUs, so the trainer learns from trajectories generated by slightly older weights; it needs staleness caps and importance corrections (L12 slide 25). |
| Baseline b(h) | A number subtracted from the reward that depends only on the history. It leaves the gradient unbiased and can greatly reduce its variance. |
| Clipping | Replacing an importance ratio outside \[1 − ε, 1 + ε\] (or \[ℓ, u\]) by the nearest bound so that no single sample can move the policy too far. |
| Coverage (pass@k) | The chance that at least one of k samples succeeds, 1 − (1 − p)^k for single-sample success p; the ceiling for any test-time selector (L20). |
| Critic Vφ(h) | A learned model that predicts expected reward-to-go from a history. It supplies the baseline and TD errors for PPO-style methods. |
| Degenerate group | A group of rollouts on one task whose rewards are all equal (all 0 or all 1). Every advantage is zero, so it contributes no gradient. |
| Delta weight sync | Sending only the parameters whose bf16 value changed after an update instead of the full model; about 99% do not change per RL step (L12 slide 16, PULSE). |
| Diversity collapse (sharpening) | RL concentrating probability on solutions the model already favours, so pass@1 rises while large-k pass@k stalls or falls (L11, L20). |
| Dynamic sampling | DAPO's rule of discarding degenerate groups and sampling more tasks until the batch is full of mixed groups. |
| Entropy bonus | A term α·H(πθ) added to the objective to keep the next-token distribution broad and discourage exploration collapse. |
| Expert Iteration (ExIt) | A loop in which a slow search (the expert) finds better decisions than the policy and the policy (the apprentice) is trained on them, then guides the next search (Anthony et al., 2017; L21). |
| Exposure bias | The gap created when a model trained only on demonstrations never sees its own mistakes, so it cannot recover from them at inference time. |
| GAE (generalized advantage estimation) | An advantage estimate that sums TD errors with geometrically decaying weights λ (and discount γ): Â\_t = δ\_t + λÂ\_{t+1} when γ = 1. |
| GRPO | Group Relative Policy Optimization: sample G responses per task and use (R − group mean) / group std as each response's advantage, with PPO-style clipping and an optional KL term, and no critic. |
| Importance ratio ρ\_t | πθ(a\_t \| h\_t) / μ(a\_t \| h\_t): how much more or less likely the current policy is to take a recorded action than the policy that sampled it. |
| In-flight weight update | Loading new weights into the inference engine while rollouts are still running (pause, load, continue), so one trajectory can contain tokens from several policy versions (L12 slide 26, PipelineRL). |
| KL penalty | A term β·D\_KL(πθ ‖ π\_ref) that keeps the trained policy close to a fixed reference model. |
| Loss mask m\_t | A 0/1 flag per token: 1 for tokens the policy sampled (including end-of-turn), 0 for prompt and observation tokens, which receive no loss. |
| MaxRL | Maximum Likelihood RL: objectives that move from expected reward toward the likelihood of a correct rollout as sampling compute grows (Tajwar et al., 2026; L20). |
| Off-policy data | Trajectories sampled by a different (usually older) policy than the one being trained; they need importance weighting. |
| On-policy distillation | Training a student to match a teacher's next-token distribution on histories the student itself generated, usually by minimizing reverse KL. |
| PPO | Proximal Policy Optimization: maximize E\[min(ρÂ, clip(ρ)Â)\] with advantages from a critic via GAE, allowing several epochs per batch. |
| Prefix sharing | Trainer-side counterpart of prefix caching: process a prompt shared by a GRPO group once, with a tree attention mask, and accumulate gradients from every branch into it (L12 slide 14). |
| Process reward model (PRM) | A model trained on step-level correctness labels that scores intermediate steps, used as a dense surrogate for value. |
| REINFORCE | The basic score-function policy gradient (Williams, 1992): weight each sampled action's ∇ log π by the trajectory's reward. |
| Reward hacking | The policy earning reward through a shortcut the verifier fails to reject, such as passing a weak test without fixing the bug. |
| Reward-to-go R\_t | The sum of rewards received after action t. Earlier rewards cannot depend on a\_t, so dropping them cuts variance without bias. |
| RLVR | Reinforcement learning with verifiable rewards: rewards computed by a program (tests, exact answers, final-state checks) rather than a learned model. |
| Rollout policy μ | The policy (often an older version on an inference engine) that actually generated a trajectory; also called the behaviour policy. |
| Rollout Routing Replay (R3) | Recording the mixture-of-experts experts chosen during sampling and forcing the trainer to use the same experts, so both engines evaluate the same sub-network (L12 slide 17). |
| Self-play | Generating training games by letting the current policy play against itself, with search at every move; the game result is the reward (AlphaGo Zero; L21). |
| Sequence extension | The property that each turn's context begins with the previous turn's exact tokens; it lets a whole episode be one datapoint and keeps prefix caches valid (L12 slides 19–22). |
| Staleness | How many policy updates have happened since a rollout's policy version; higher staleness means larger ratios and more clipping. |
| Stream of Search (SoS) | Training a model on serialized search traces that include failed branches and backtracking, so it learns to search inside one token stream (Gandhi et al., 2024; L21). |
| TD error δ\_t | r\_{t+1} + V(h\_{t+1}) − V(h\_t): the one-step surprise in value after taking an action. |
| Token-in, token-out (TITO) | Passing sampled token IDs and their log-probs from sampler to trainer instead of text, because re-tokenizing text can produce a different token sequence (L12 slides 23–24). |
| Train–inference mismatch | The gap between the sampler's probabilities π\_rollout and the trainer's π\_train for the same weights and tokens, caused by kernels, precision, tokenization or MoE routing; logged as importance\_weight\_max. |
| Trajectory τ | One complete attempt at a task: the sequence of observations, actions and rewards from the prompt to the end. |
| Truncated importance sampling (TIS) | Multiplying each token's loss by min(π\_train/π\_rollout, C) so the mismatch is corrected without letting any single weight exceed C (M9). |
| Unlikeliness reward | A reward term that up-weights correct samples the policy considered unlikely, countering GRPO's bias toward already-likely solutions (He, Fried and Welleck, 2025; L20). |
| Visit-count distribution π\_search | MCTS's normalized visit counts at a state; AlphaZero trains the policy head toward it with cross-entropy, distilling the search into the network (L21). |

## Practice questions

The 15 questions run from recall (1–3) through calculation (4–11) to design (12–15). Try each before reading the answer.

1. Name the three problems with SFT on demonstrations that L9 says RL addresses, and say how RL addresses each.

   **Answer:** Task mismatch: SFT maximizes the probability of the demonstrated actions, while we want the probability of completing the task; RL maximizes expected reward directly, so any successful path is reinforced. Data mismatch: SFT cannot learn from sub-optimal attempts; RL weights every trajectory by its reward, including failures once a baseline is used. Exposure bias: SFT never sees the model's own mistakes; RL trains on the model's own rollouts, so it learns to recover.
2. Why can't we backpropagate from the reward to θ, and what identity gets around this?

   **Answer:** Actions are discrete samples and the environment (for example, a unit test) is not differentiable, so there is no path for gradients from R back to θ. The log-derivative identity ∇p = p·∇log p turns ∇J = Σ ∇p(τ)R(τ) into E\[R(τ)∇log p(τ)\], which we can estimate from samples. Only the policy's own log-probabilities need gradients.
3. Why do the environment's transition probabilities drop out of ∇θ log pθ(τ | x)?

   **Answer:** log pθ(τ | x) is a sum of log πθ(a\_t | h\_t) terms and log P(o, r | h, a, x) terms. The environment terms do not depend on θ, so their gradient is zero. What remains is Σ\_t ∇ log πθ(a\_t | h\_t), the same token log-probability computation as SFT.
4. In L9's bandit, change p = σ(θ) to 0.4 (guess A pays 1, guess B pays 0). Compute the single-sample gradient for each action with b = 0 and b = 0.5, the expected gradient, and the variance-minimizing constant baseline.

   **Answer:** The slopes are 1 − p = 0.6 for A and −p = −0.4 for B. With b = 0: A gives 0.6, B gives 0, so E = 0.4 × 0.6 = 0.24. With b = 0.5: A gives 0.5 × 0.6 = 0.30 and B gives (−0.5)(−0.4) = 0.20, so E = 0.4 × 0.30 + 0.6 × 0.20 = 0.24, unchanged. The optimal baseline is E\[g²R\] / E\[g²\] = (0.4 × 0.36) / (0.4 × 0.36 + 0.6 × 0.16) = 0.144 / 0.24 = 0.6; then both actions give exactly 0.24 and the variance is zero.
5. A group of G = 8 rollouts has rewards \[1, 0, 0, 0, 0, 0, 0, 0\]. Compute GRPO and DrGRPO advantages.

   **Answer:** The mean is 0.125 and the population standard deviation is √(0.125 × 0.875) ≈ 0.331. GRPO gives the success (1 − 0.125) / 0.331 ≈ +2.65 and each failure −0.125 / 0.331 ≈ −0.38. DrGRPO skips the division: +0.875 and −0.125. Note how GRPO's weight on a rare success grows as the group gets more lopsided.
6. What is the probability that a group of G = 6 binary rewards is degenerate if the task's success rate is p = 0.3? What does a degenerate group contribute?

   **Answer:** p^G + (1 − p)^G = 0.3^6 + 0.7^6 = 0.0007 + 0.1176 ≈ 0.118, so about 12% of such groups are wasted. A degenerate group has every reward equal to the mean, so every advantage is zero and it contributes no gradient, only cost.
7. Show that REINFORCE with binary rewards and ReST give the same loss, and name one practical difference.

   **Answer:** With R ∈ {0, 1}, −Σ\_i R(τ\_i) Σ\_t log π = −Σ\_{i: R=1} Σ\_t log π, which is SFT on the successful trajectories. L9 notes differences: ReST collects a large dataset and makes batched updates, often across several epochs and with aggregated data from earlier rounds, while REINFORCE updates once on fresh samples. Neither learns from failures without a baseline.
8. Trajectory: V(h0) = 0.2, V(h1) = 0.5, V(h2) = 0.9; rewards are 0 after a0 and a1 and 1 after a2 (the end). Compute the TD errors and Â\_0 for λ = 0, 0.5 and 1 (γ = 1).

   **Answer:** δ\_0 = 0 + 0.5 − 0.2 = 0.3; δ\_1 = 0 + 0.9 − 0.5 = 0.4; δ\_2 = 1 + 0 − 0.9 = 0.1. λ = 0: Â\_0 = 0.3 (pure one-step TD). λ = 0.5: 0.3 + 0.5 × 0.4 + 0.25 × 0.1 = 0.525. λ = 1: 0.3 + 0.4 + 0.1 = 0.8, which equals R − V(h0) = 1 − 0.2 because the sum telescopes. λ trades the critic's bias (small λ) against Monte Carlo variance (large λ).
9. With ε = 0.2, evaluate PPO's per-token term min(ρÂ, clip(ρ)Â) and say whether a gradient flows for (a) ρ = 1.4, Â = +2; (b) ρ = 0.6, Â = +2; (c) ρ = 0.6, Â = −2.

   **Answer:** (a) min(2.8, 2.4) = 2.4, the clipped branch, so no gradient: the action is already 40% more likely and PPO stops pushing. (b) min(1.2, 1.6) = 1.2, the raw branch, so the gradient flows: a good action that became less likely is pushed back up. (c) min(−1.2, −1.6) = −1.6, the clipped branch, so no gradient: a bad action already 40% less likely is not pushed further.
10. Each token of a 200-token stale response has ratio 0.98. What is the whole-sequence ratio, and what would it be at 1.02? What does this imply?

    **Answer:** 0.98^200 ≈ 0.018 and 1.02^200 ≈ 52. A 2% per-token drift turns into a 50-fold swing at the sequence level, the same effect as L11's 1.05^100 ≈ 132. Full trajectory ratios are too high-variance to use raw, which is why methods use per-token ratios (PPO, GRPO), clipped weights (CISPO) or a length-normalized geometric mean (GSPO).
11. Explain with numbers how GRPO's per-response 1/|y| normalization can encourage long wrong answers.

    **Answer:** Two incorrect responses both get Â = −1. With 1/|y|, the 100-token response gets −0.01 per token and the 1,000-token response gets −0.001 per token. Each token of the long wrong answer is penalized ten times less, so the policy drifts toward longer wrong answers. DrGRPO divides by a global constant C instead, so every token of every response carries the same scale.
12. For a 7B-parameter policy, estimate the trainable-state memory of PPO versus GRPO, and name one situation where PPO is still worth it.

    **Answer:** With Adam in mixed precision at about 16 bytes per parameter, the policy needs about 112 GB. PPO's critic adds a similar 112 GB (about 224 GB in total), while GRPO has no critic; both may keep a 14 GB bf16 reference. PPO is still worth it when episodes are long with informative intermediate rewards, or when sampling G rollouts per task is too expensive, because a good critic gives per-turn credit that a group baseline cannot.
13. After difficulty screening, 60% of your agent tasks are still 0/8. Using L11, how do you decide what to do?

    **Answer:** Inspect before acting, using L11's three checks. Verifier quality: read the requirements and failed tests to see whether valid solutions are being rejected (false negatives). Capability: check whether demonstrations from a stronger model succeed; if they do, warm-start with SFT and build a curriculum. Exploration: check whether the eight trajectories differ at all; if they are near-identical, raise temperature or add an entropy bonus. Partial rewards are a last resort because they can be gamed.
14. Your coding agent's training reward jumps from 0.35 to 0.80 in 30 steps while held-out success stays at 0.36. What is likely happening and how do you respond?

    **Answer:** A jump in training reward without independent improvement is L11's signature of reward hacking through a false positive. Read a sample of newly successful trajectories and run them against stricter tests; look for patterns like the constant-zero patch, test edits, or copying from Git history. Fix the verifier and sandbox (remove test access, network, future commits and keys), then restart from a checkpoint before the jump. Keep the held-out check in every run from then on.
15. Design question: you move to asynchronous RL where rollouts are up to 3 policy versions stale and episodes reach 30,000 generated tokens. Which ratio and weighting would you use, and what would you log?

    **Answer:** Store the sampler's per-token log-probs and the policy version with every trajectory. Per-token ratios with PPO clipping are the robust default, but they ignore the history-reach mismatch that grows along long responses (L11 slide 26). GSPO's length-normalized sequence ratio controls that without the explosion of the full product, and CISPO keeps gradient from every token by clipping only the weight. Whatever you choose, cap staleness, and log clip fraction, the ratio distribution by token position, version lag, entropy and held-out success. If the clip fraction climbs with staleness, reduce the cap before tuning ε.

### More practice questions (L12–L15)

Questions 16–22 cover L12's systems view: memory and sync budgets (16–17), train–inference consistency (18–21) and diagnosis (22).

16. Using L12's figure of 128 KB of KV cache per token for Llama-3-8B in bf16, how much KV memory does a GRPO step of 16 tasks × 8 rollouts need if every rollout reaches 20,000 tokens? How much does prefix caching save if each group shares a 4,000-token prompt?

    **Answer:** One rollout needs 131,072 B × 20,000 ≈ 2.6 GB, so 128 rollouts need about 336 GB, more than four 80 GB GPUs before any weights. With prefix caching each group stores its 4,000-token prompt once instead of 8 times, saving 7 × 4,000 × 131,072 B ≈ 3.7 GB per group, or about 59 GB over 16 groups (to roughly 277 GB). This is why L12 says KV caching "trades a lot of recomputation for a lot of memory" and why GRPO groups gain so much from prefix reuse.
17. A 70B-parameter policy is synced in bf16 after every step. What does a full sync send, and what does a delta sync send if 99% of values are unchanged and each changed value carries a 4-byte index?

    **Answer:** A full sync sends 70e9 × 2 B = 140 GB to every inference rank. A delta sync sends 0.7e9 changed values × 2 B = 1.4 GB plus 0.7e9 × 4 B = 2.8 GB of indices, about 4.2 GB, a 33× cut. The index overhead is twice the payload, so encoding matters; PULSE reports over 100× with a more compact scheme. L12's 1T-parameter example (≈ 2 TB per full sync) shows why this matters most for very large models and cross-region inference.
18. The sampler produced the tokens \[He, llo\]; the trainer receives the string "Hello" and re-tokenizes it to \[Hello\]. Why can no importance weight repair this sample?

    **Answer:** An importance weight compares two probabilities of the same action: πθ(a)/μ(a). Here the trainer scores a different action, the single token Hello, which the sampler never chose and for which no μ was recorded. Its gradient pushes up a token sequence that was not sampled, so the estimator is wrong rather than merely reweighted. The fix is upstream: token-in, token-out, so the trainer scores exactly the IDs that were sampled (L12 slides 23–24).
19. One-parameter policy, p = πθ(A) = σ(θ) = 0.5; A pays 1 and B pays 0; baseline b = 0. Because of an engine mismatch, the sampler actually draws A with probability 0.6. Compare the true gradient, the naive estimate, and the TIS estimate with C = 2.

    **Answer:** The scores are ∂log p/∂θ = 1 − p = 0.5 for A and −p = −0.5 for B. True gradient: p × 1 × 0.5 = 0.25. Naive (samples from μ, no weight): 0.6 × 1 × 0.5 = 0.30, a 20% overestimate that does not average away. TIS: A's weight is min(0.5/0.6, 2) = 0.833, so 0.6 × 0.833 × 0.5 = 0.25, exact. Truncation never bit because no ratio exceeded C, which is M9's point that TIS is unbiased on tokens with ρ ≤ C.
20. Evaluate M9's decoupled objective for one token with μ = 0.10, π\_old = 0.25, πθ = 0.32, Â = −1, ε = 0.2 and C = 2. Does a gradient flow?

    **Answer:** The behaviour weight is w = 0.25/0.10 = 2.5, truncated to 2; importance\_weight\_max would log 2.5. The trust-region ratio is r = 0.32/0.25 = 1.28. With Â < 0 the PPO term is min(−1.28, −1.2) = −1.28, the unclipped branch, so the gradient flows and pushes this bad token back down. The token's contribution is 2 × (−1.28) = −2.56. Clipping around μ instead would use 0.32/0.10 = 3.2, far outside \[0.8, 1.2\], showing why the trust region is centred on π\_old.
21. An engine gap gives each token an independent log-ratio with standard deviation 0.005. For a 50,000-token agent trajectory, what is the spread of the sequence-level ratio, the per-token ratio, and GSPO's length-normalized ratio?

    **Answer:** The summed log-ratio has standard deviation 0.005 × √50,000 ≈ 1.12, so the sequence weight typically ranges over a factor e^1.12 ≈ 3 in either direction from a tiny per-token gap. The per-token ratio's spread stays 0.005 (about 0.5%). GSPO's geometric mean divides the summed log-ratio by T, giving a spread of about 0.005/√50,000 ≈ 2 × 10⁻⁵. This is the systems form of L11's 1.05^100 ≈ 132: long agent episodes make whole-sequence weights unusable even when the per-token mismatch is small.
22. Design question: a synchronous GRPO run on a mixture-of-experts coding agent shows importance\_weight\_max spiking to 30 on some batches, grad-norm spikes, and pass@1 slipping. Average staleness is 0. What do you check, in what order?

    **Answer:** Staleness is zero by construction, so off-policyness from old weights is ruled out and the cause is mismatch (Core concepts 11, sources 2 and 3). First check discrete causes, because they produce large ratios: confirm the trainer receives token IDs, not strings (TITO), and that the renderer preserves sequence extension (a turn-n-is-prefix-of-turn-n+1 test). Then check MoE routing: compare expert choices between engines on the spiking tokens and enable Rollout Routing Replay. Only then treat the residual as numerical noise with truncated importance weights or matched precision. Keep logging the untruncated importance\_weight\_max so the fix is visible.

### More practice questions (L20)

Questions 23–26 cover L20's view of RL as a coverage problem: sharpening (23–24), temperature (25) and joint weight–harness training (26).

23. A base model solves task 1 with p = 0.5 and task 2 with p = 0.05. After RL with a 0/1 reward it solves task 1 with p = 0.9 and task 2 with p = 0. Compare mean pass@1 and mean pass@16 before and after.

    **Answer:** pass@1 rises from (0.5 + 0.05) / 2 = 0.275 to (0.9 + 0) / 2 = 0.45. pass@16 for the base model is (1 − 0.5^16 + 1 − 0.95^16) / 2 ≈ (1.0 + 0.56) / 2 ≈ 0.78. After RL it is (1 − 0.1^16 + 0) / 2 ≈ 0.50. The policy improved for one sample and got worse for sixteen, because it lost the only route to task 2. This is the sharpening L20's training fixes target.
24. Expected-reward RL maximizes p; MaxRL moves toward maximizing log p. For the two base-model tasks in question 23, how differently do the two objectives weight a gradient step on each task?

    **Answer:** Beyond the lecture: ∇ log p = ∇p / p. Expected reward weights both tasks' ∇p equally. The log objective multiplies them by 1/0.5 = 2 and 1/0.05 = 20, so the hard task gets ten times the relative weight. That is why a likelihood-style objective pushes on rarely solved tasks, which is where coverage at large k is won. MaxRL interpolates between the two as the sampling budget grows.
25. A team samples RL rollouts at temperature 0.6 to get cleaner trajectories, but the trainer computes log-probabilities at temperature 1.0, and the model is served at 1.0. Name two problems.

    **Answer:** First, the behaviour distribution is softmax(z/0.6), not πθ, so the importance ratio πθ/μ is not 1 even at step 0: an unmodelled train–inference mismatch (Concept 11). Second, the policy is trained on sharper samples than it will produce when served, so diversity seen in training is not the diversity users get. L20 notes that reasoning models may fix the temperature at 1.0; train at the serving temperature and scale logits identically in both engines.
26. In WHALE's results, harness search alone scores 0.4% on Math, rejection SFT alone 15.4%, and WHALE 24.8%. What does each number say about where the bottleneck was?

    **Answer:** 0.4% means no scaffold can help a small model that cannot do the math: the weights were the bottleneck. 15.4% shows weight training fixes much of that. WHALE's 24.8% shows that once the weights improve, a re-searched harness adds value that training alone did not reach. Each phase changes the environment the other optimizes against, so alternating them beats either one.

### More practice questions (L21)

Questions 27–30 cover L21's view of search as policy improvement: the AlphaZero loss (27–28), search-trace training (29) and transfer to agents (30).

27. At one self-play state, MCTS visit counts give π\_search = (0.7, 0.2, 0.1) over three legal moves, and the network outputs p\_θ = (0.5, 0.3, 0.2) and v\_θ = 0.6. The game is won, z = +1. Compute both loss terms and the gradient of the policy term with respect to the logits.

    **Answer:** Value term: (1 − 0.6)² = 0.16. Policy term: −(0.7 ln 0.5 + 0.2 ln 0.3 + 0.1 ln 0.2) ≈ 0.485 + 0.241 + 0.161 ≈ 0.887. Total ≈ 1.05 (L2 term omitted, as on slide 99). For softmax cross-entropy the logit gradient is p − π = (−0.2, +0.1, +0.1), so a descent step raises the first move and lowers the other two. All three moves get a signal from one state.
28. Why is the AlphaZero policy update not a policy gradient in the sense of Concept 2? What does the job of the advantage?

    **Answer:** The target is a fixed distribution produced by search, and the loss is cross-entropy toward it: supervised distillation with no sampled action, no reward weight and no importance ratio. The search does the advantage's job. MCTS backs up values through PUCT and shifts visits toward moves whose subtrees look better, so π\_search already encodes which moves beat the policy's average. The game result z reaches the policy only through the value head that guides the next search.
29. L21's slide 32 reports Game of 24 accuracy of 25.73% (optimal-path training), 51.27% (SoS), 55.59% (SoS + STaR) and 56.52% (SoS + APA). What does each step contribute, and which step is Expert Iteration?

    **Answer:** Training on full search traces, with failures and backtracking, adds 25.54 points at the same model size, data size and gradient steps. STaR adds 4.32 points by sampling traces, keeping verified ones and refitting the same next-token loss: that is Expert Iteration, with the verifier-filtered samples as the expert. APA adds 5.25 points with an RL reward for valid solutions and a penalty for extra expansions. The last two add training, so they are not compute-matched with SoS.
30. A team plans AlphaZero-style Expert Iteration for a shopping web agent: MCTS over browser actions, then distil visit counts into the policy. Using slide 15 and the summary slide, name three things that break and one safer alternative.

    **Answer:** Transitions: each expansion is a real, slow action, and some (placing an order) cannot be undone (see T7). Actions: free-text arguments make children rarely identical, so visit counts do not accumulate and π\_search is a weak target. Outcome: success is often judged by an LLM, so the expert is only as good as a noisy scorer (T12). A safer loop is rejection sampling or STaR on whole trajectories in a resettable replica, with a programmatic checker, or search only over read-only actions.

## References and further reading

Start with the two lecture decks, then Spinning Up for the derivation, then DeepSeekMath, Dr. GRPO and DAPO for the modern recipe. All links were checked in September 2026.

### Core papers

- [Simple Statistical Gradient-Following Algorithms for Connectionist Reinforcement Learning](https://link.springer.com/article/10.1007/BF00992696) — Ronald J. Williams, 1992 — the original REINFORCE paper and the score-function estimator every method here builds on.
- [High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438) — Schulman, Moritz, Levine, Jordan, Abbeel, 2015 — defines GAE and the λ bias–variance knob used in L11.
- [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347) — Schulman et al., OpenAI, 2017 — the clipped surrogate objective behind PPO, GRPO and DAPO.
- [Training Language Models to Follow Instructions with Human Feedback](https://arxiv.org/abs/2203.02155) — Ouyang et al., OpenAI, 2022 — InstructGPT; the reference PPO-with-critic pipeline for language models.
- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) — Shao et al., DeepSeek-AI, 2024 — introduces GRPO; read §4 for the objective and the PPO comparison.
- [Back to Basics: Revisiting REINFORCE Style Optimization for Learning from Human Feedback in LLMs](https://arxiv.org/abs/2402.14740) — Ahmadian et al., Cohere, 2024 — argues much of PPO is unnecessary for LLMs; leave-one-out baselines (RLOO).
- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — large-scale GRPO with rule-based rewards; the R1-Zero experiment without SFT.
- [DAPO: An Open-Source LLM Reinforcement Learning System at Scale](https://arxiv.org/abs/2503.14476) — Yu et al., ByteDance Seed and Tsinghua, 2025 — clip-higher, dynamic sampling, token-level loss; a practical recipe with open code.
- [Understanding R1-Zero-Like Training: A Critical Perspective](https://arxiv.org/abs/2503.20783) — Liu et al., 2025 — Dr. GRPO; explains GRPO's length and difficulty biases.
- [MiniMax-M1: Scaling Test-Time Compute Efficiently with Lightning Attention](https://arxiv.org/abs/2506.13585) — MiniMax, 2025 — introduces CISPO and reports the cost of a full RL run.
- [Group Sequence Policy Optimization](https://arxiv.org/abs/2507.18071) — Zheng et al., Qwen team, 2025 — GSPO's sequence-level ratio and why it stabilizes MoE training.
- [AReaL: A Large-Scale Asynchronous Reinforcement Learning System for Language Reasoning](https://arxiv.org/abs/2505.24298) — Fu et al., 2025 — the asynchronous design and staleness control that L11 cites.
- [Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?](https://arxiv.org/abs/2504.13837) — Yue et al., 2025 — the pass@k evidence that RLVR mostly sharpens existing abilities.

### From the lectures

- RL Foundations for Agents: From SFT to policy gradients (L9 slides) — Daniel Fried, CMU 11-768, 2026 — Number Search, REINFORCE, baselines, GRPO and DrGRPO with worked numbers.
- Advanced RL Algorithms for Agents (L11 slides) — Graham Neubig, CMU 11-768, 2026 — critics, GAE, async RL, importance ratios, clipping, reward reliability and distillation.
- [Reinforced Self-Training (ReST) for Language Modeling](https://arxiv.org/abs/2308.08998) — Gulcehre et al., Google DeepMind, 2023 — the grow/improve loop in L9.
- [Beyond Human Data: Scaling Self-Training for Problem-Solving with Language Models](https://arxiv.org/abs/2312.06585) — Singh et al., Google DeepMind, 2023 — ReST-EM, the binary-reward form L9 equates with REINFORCE.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — Lightman et al., OpenAI, 2023 — process reward models and PRM800K, L11's surrogate for value.
- [On-Policy Distillation of Language Models: Learning from Self-Generated Mistakes](https://arxiv.org/abs/2306.13649) — Agarwal et al., Google DeepMind, 2023 (ICLR 2024) — GKD, the basis of L11's on-policy distillation slides.

### Tutorials, docs and courses

- [Spinning Up, Part 3: Intro to Policy Optimization](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html) — OpenAI, 2018 — the cleanest step-by-step derivation of the policy gradient, reward-to-go and baselines.
- [Reinforcement Learning: An Introduction (2nd edition)](http://incompleteideas.net/book/the-book-2nd.html) — Sutton and Barto, 2018 — free textbook; chapter 13 covers policy gradients and actor–critic.
- [Approximating KL Divergence](http://joschu.net/blog/kl-approx.html) — John Schulman, 2020 — the k1/k2/k3 KL estimators used in GRPO's KL term.
- [RLHF Book](https://rlhfbook.com) — Nathan Lambert — a free, current book on post-training with chapters on policy-gradient methods for LLMs.
- [GRPO Trainer documentation](https://huggingface.co/docs/trl/main/en/grpo_trainer) — Hugging Face TRL — a runnable GRPO implementation with DAPO and Dr. GRPO loss options, good for first experiments.

### Added for L12–L15

- Reinforcement Learning Systems (L12 slides) — Apurva Gandhi, CMU 11-768, 2026 — the sampler/trainer split, weight sync, R3, TITO, async RL and the metrics table behind Core concepts 10–12 and M9.
- [PipelineRL: Faster On-policy Reinforcement Learning for Long Sequence Generation](https://arxiv.org/abs/2509.19128) — Piché, Kamalloo, Pardinas, Chen, Bahdanau, 2025 — in-flight weight updates; cited on L12's async slide.
- [AReaL: A Large-Scale Asynchronous Reinforcement Learning System for Language Reasoning](https://arxiv.org/abs/2505.24298) — Fu et al., 2025 — staleness-controlled async RL and the behaviour/proximal split used in M9 (code and AReaL 2.0 at [github.com/areal-project/AReaL](https://github.com/areal-project/AReaL)).
- [On the Rollout-Training Mismatch in Modern RL Systems](https://neurips.cc/virtual/2025/124259) — Yao, Liu, Zhang, Dong, Shang, Gao, 2025 — truncated importance sampling for the vLLM–FSDP gap (blog version: [Your Efficient RL Framework Secretly Brings You Off-Policy RL Training](https://fengyao.notion.site/off-policy-rl)).
- [Stabilizing MoE Reinforcement Learning by Aligning Training and Inference Routers](https://arxiv.org/abs/2510.11370) — Ma et al., 2025 — Rollout Routing Replay (R3), L12 slide 17.
- [Understanding and Exploiting Weight Update Sparsity for Communication-Efficient Distributed RL](https://arxiv.org/abs/2602.03839) — Miahi and Belilovsky, 2026 — PULSE, the \~99% bf16-invisible updates behind delta weight sync.
- [Defeating Nondeterminism in LLM Inference](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/) — Horace He with Thinking Machines, 2025 — batch-invariant kernels and bitwise-equal sampler/trainer log-probs.
- [Defeating the Training-Inference Mismatch via FP16](https://arxiv.org/abs/2510.26788) — Qi et al., 2025 — precision as a source-level fix for the mismatch.
- [No Token Left Behind: Demystifying Token-In-Token-Out in Miles](https://lmsys.org/blog/2026-05-13-no-token-left-behind) — Miles team, LMSYS, 2026 — the TITO principle and chat-template pitfalls on L12 slides 21–24.
- [Agentic RL: Token-In, Token-Out Done Right](https://huggingface.co/blog/huggingface/tito) — Gallouédec and Rasul, Hugging Face, 2026 — the same principle from the TRL side.
- [Sequence Extension](https://tinker-docs.thinkingmachines.ai/rl/sequence-extension) — Tinker documentation, Thinking Machines — why extension gives O(T) instead of O(T²) training compute.
- [Announcing Tinker](https://thinkingmachines.ai/blog/announcing-tinker/) — Thinking Machines, 2025 — the LoRA-based training service and its forward\_backward / sample primitives.
- [Multi-LoRA Training for Continual Learning](https://www.trajectory.ai/field-notes/multi-lora-training-for-continual-learning) — SkyRL + Trajectory Labs, 2026 — the 2.81× concurrent-versus-serial result on L12 slide 40.
- [Snowflake Arctic RL and ZoRRo](https://www.snowflake.com/en/developers/guides/arctic-rl-unified-post-training-backend/) — Snowflake AI Research, 2026 — prefix sharing for GRPO batches (80–95% duplicate tokens, up to 6× faster actor updates).
- [AReaL-DTA: Dynamic Tree Attention for Efficient Reinforcement Learning of Large Language Models](https://arxiv.org/abs/2602.00482) — Zhang et al., 2026 — prefix-tree training, up to 8.31× over dense.
- [Agent Lightning: Train ANY AI Agents with Reinforcement Learning](https://arxiv.org/abs/2508.03680) — Luo et al., 2025 — the harness-agnostic middleman pattern.
- [AstraFlow: Dataflow-Oriented Reinforcement Learning for Agentic LLMs](https://arxiv.org/abs/2605.15565) — Zheng et al., 2026 — elastic, cross-region and multi-policy RL.
- [Real-time RL for Composer](https://cursor.com/en/blog/real-time-rl-for-composer) — Cursor, 2026 — online RL with a roughly five-hour checkpoint cycle.
- [IMPALA: Scalable Distributed Deep-RL with Importance Weighted Actor-Learner Architectures](https://arxiv.org/abs/1802.01561) — Espeholt et al., DeepMind, 2018 — V-trace, the original truncated importance correction for decoupled acting and learning.

### Added for L20

- [Rewarding the Unlikely: Lifting GRPO Beyond Distribution Sharpening](https://arxiv.org/abs/2506.02355) — He, Fried and Welleck, 2025 — GRPO's rank bias and the unlikeliness reward; better pass@N in theorem proving.
- [Differential Smoothing Mitigates Sharpening and Improves LLM Reasoning](https://arxiv.org/abs/2511.19942) — Gai, Zeng, Zhang and Raghunathan, 2025/2026 — reward modification on correct trajectories only; improves pass@1 and pass@k.
- [Maximum Likelihood Reinforcement Learning](https://arxiv.org/abs/2602.02710) — Tajwar et al., 2026 — expected-reward RL as a first-order approximation of maximum likelihood; MaxRL objectives indexed by sampling compute.
- [Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?](https://arxiv.org/abs/2504.13837) — Yue et al., 2025 — base models beat RLVR models at large-k pass@k; the evidence behind open problem 5 and L20's training levers.
- [WHALE: A Simple Recipe for Joint Harness-Weight Optimization](https://arxiv.org/abs/2609.00196) — Kim et al., 2026 — alternating rejection-sampling fine-tuning and harness search.
- [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052) — Lee et al., 2026 — the harness-search half of WHALE.
- [DeepSeek-R1 usage recommendations](https://github.com/deepseek-ai/deepseek-r1) — DeepSeek, 2025 — recommended sampling temperature for a reasoning model, cited on L20 slide 3.

### Added for L21

- [Thinking Fast and Slow with Deep Learning and Tree Search](https://arxiv.org/abs/1705.08439) — Anthony, Tian and Barber, 2017 — Expert Iteration: tree search as expert, network as apprentice.
- [Mastering the game of Go without human knowledge](https://doi.org/10.1038/nature24270) — Silver et al., Nature 2017 — AlphaGo Zero: self-play with MCTS, policy trained toward visit counts, value toward the result.
- [A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play](https://doi.org/10.1126/science.aar6404) — Silver et al., Science 2018 — AlphaZero and the combined value and policy loss on L21 slide 99.
- [ReST-MCTS\*: LLM Self-Training via Process Reward Guided Tree Search](https://arxiv.org/abs/2406.03816) — Zhang et al., NeurIPS 2024 — alternating search, PRM training and policy training for LLM reasoning.
- [Stream of Search (SoS): Learning to Search in Language](https://arxiv.org/abs/2404.03683) — Gandhi et al., COLM 2024 — training on full search traces, then STaR and APA policy improvement.
- [Beyond A\*: Better Planning with Transformers via Search Dynamics Bootstrapping](https://arxiv.org/abs/2402.14083) — Lehnert et al., COLM 2024 — Searchformer: A\* traces, then expert iteration toward shorter searches.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L09 - RL Foundations]]
- Lecture: [[L11 - Advanced RL]]
- Lecture: [[L12 - RL Systems]]
- Lecture: [[L20 - Search over Trajectories]]
- Lecture: [[L21 - Search and Planning]]
- [[The State of LLM Reasoning Model Inference]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]

[[T10 - Supervised Fine-Tuning on Agent Trajectories|← T10]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T12 - Rewards, Verifiers and Reward Hacking|T12 →]]
