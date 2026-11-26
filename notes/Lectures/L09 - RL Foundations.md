---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, reinforcement-learning, policy-gradient, llm-training]
aliases: ["CMU L9", "11-768 Lecture 9", "RL Foundations for Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-09-rl-basics.pdf"
---

# Lecture 9 · RL Foundations for Agents

[[L08 - SFT for Agents|← L8]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L10 - Deep Research Agents|L10 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 9 · Daniel Fried
> **Source:** lecture slides `lecture-09-rl-basics.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T10 - Supervised Fine-Tuning on Agent Trajectories]], [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]

Daniel Fried · 11-768 AI Agents, Fall 2026 · source slides: lecture-09-rl-basics.pdf (46 slides)

## Overview

Sampling trajectories from the agent itself and weighting their action log-probabilities by (relative) reward fixes three problems of supervised fine-tuning: task mismatch, data mismatch and exposure bias. Daniel Fried builds this idea up in steps, using one toy task (Number Search: find a hidden integer in 1 to 16 with four higher/lower guesses). He starts from the SFT loss, moves to filtered self-training (ReST / ReST-EM), derives the policy gradient (REINFORCE), adds baselines and advantages, and ends at group-relative advantages (GRPO and DrGRPO). The unifying message is that every method is the same SFT-style gradient with a different per-action weight.

**Learning objectives.** After this lecture you can:

- Name the three failure modes of SFT for agents (task mismatch, data mismatch, exposure bias) and say how on-policy RL addresses each.
- Write an agent interaction as a trajectory, write its probability, and explain why the environment terms drop out of the gradient.
- Derive the REINFORCE policy gradient with the log-derivative trick, and implement it as a masked, reward-scaled SFT loss.
- Explain why subtracting a baseline keeps the gradient unbiased but lowers its variance, using the two-armed bandit numbers.
- Compute GRPO and DrGRPO advantages for a group of rollouts, and explain why degenerate (all-pass or all-fail) groups give no signal.
- Place ReST-EM, REINFORCE, GRPO and DrGRPO on one axis: the weight w\_t each gives to an action.

**Prerequisites.** Basic probability (expectations, sampling), the chain rule and gradients, and the SFT loss from Lecture 8.

**Where it fits.** L1 framed an agent as a policy acting in an environment; L2 (tool use), L6 (coding agents) and L7 (computer-use agents) supply the environments and actions that become trajectories here. L3 (long context) and L4 (memory and skills) shape the history h\_t the policy conditions on. L8 (SFT) is the direct starting point: this lecture keeps the SFT loss computation and changes only which tokens count and how much. L10 (deep research agents) relies on RL-trained agents of this kind, and L11 (advanced RL) adds the pieces deliberately left out here: importance ratios, clipping, KL/reference-model terms and asynchronous, off-policy data.

## Concept map

![[cmu-ai-agents-L09-concept-map.png]]
*Concept map: policy-gradient training loop · 4 steps, 6 choices of weight*

Read the top row as one training iteration looping back to Collect; the table under step 3 is the only part that changes from one method to the next.

## Detailed notes

The lecture follows six parts: why SFT is not enough, interactions as trajectories, expert iteration, policy gradients, baselines and advantages, and group-relative advantages; a summary ties them together.

### 1. The running example and why SFT is not enough

**Number Search** is the toy task used on almost every slide. A hidden integer lies between 1 and 16. The agent has four guesses. After a wrong guess the environment replies "higher" or "lower". The reward is 1 only if the agent finds the number, otherwise 0. For the instance shown, the hidden number is 11, and four sample trajectories are:

| Trajectory | Guesses and replies | Outcome | Reward |
| --- | --- | --- | --- |
| τ1 | 8 higher, 12 lower, 10 higher, 11 | correct | R = 1 |
| τ2 | 4 higher, 8 higher, 12 lower, 11 | correct | R = 1 |
| τ3 | 16 lower, 8 higher, 9 higher, 10 | timeout | R = 0 |
| τ4 | 1 higher, 2 higher, 3 higher, 4 | timeout | R = 0 |

τ1 and τ2 take different actions but reach the same successful outcome. τ1 is textbook binary search; τ2 wastes its first guess yet still succeeds. τ3 is reasonable but unlucky, and τ4 is a linear scan that cannot finish in four guesses. The task is small enough to reason about exactly, but it has the features that matter for real agents: multi-step interaction, a hidden environment state, feedback observations and a sparse terminal reward.

**SFT on demonstrations.** Supervised fine-tuning (Lecture 8) splits a demonstration into (history, target action) pairs: the prompt is history h0 with target "guess 8"; the prompt plus "guess 8 / higher" is h1 with target "guess 12"; and so on. The loss maximizes the log-probability of every target action:

$$
\mathcal{L}_{\mathrm{SFT}}(\theta) = -\sum_{t} \log \pi_\theta\left(a^{*}_{t} \mid h_{1:t}\right)
$$

Here `θ` is the model's parameters; `π_θ(a | h)` is the policy (the language model's probability of emitting action `a` given history `h`); `a*_t` is the demonstrated target action at step `t`; and `h_{1:t}` is the history up to that step (prompt, earlier actions and observations). Target actions may come from a person, from a stronger model, or, as the rest of the lecture shows, from a successful trajectory of this same agent.

The slides name three ways this objective falls short for agents.

1. **Task mismatch.** SFT maximizes the probability of the demonstrated actions. What we actually want is to maximize the probability that the agent completes the task. These differ. There are many ways to succeed (τ1 and τ2 both win), so imitating one of them penalizes the others for no reason. And some actions are strictly worse than others: after "12 → lower" the agent should never guess 13, yet SFT only says "copy the demo", not "this action is bad".
2. **Data mismatch.** We would like to learn from sub-optimal data too. τ2, τ3 and τ4 all carry information (τ4 shows a strategy that cannot work), but SFT has no way to use a failed trajectory; it can only imitate.
3. **Exposure bias.** At training time the model only ever sees histories produced by the expert. At generation time it sees histories produced by itself, including its own mistakes. The slide's example: the demo goes "8 higher, 12 …", but at generation the agent guesses "8 higher, 2" (a guess that ignores the feedback). The next history is one the model never saw in training, so it has not learned how to recover.

*Background.* Exposure bias is the sequence-model name for what imitation learning calls **compounding error** or distribution shift: small errors push the agent into states the expert never visited, where it errs more. Ross, Gordon and Bagnell's DAgger (2011) fixed this for imitation by querying the expert on the learner's own states; RL fixes it by training on the learner's own rollouts with a reward instead of an expert.

**Reinforcement learning, in one sentence (adapted from Sean Welleck's RL Fundamentals slides).** Generate actions or trajectories from the agent, evaluate their reward, and adjust the parameters to maximize expected reward. The loop is: task instance (hidden number 11) → the agent π\_θ generates trajectories (e.g. τ1 with R = 1, τ3 with R = 0) → rewards are computed → the policy is updated. This loop answers all three problems:

| Problem | How RL addresses it |
| --- | --- |
| Task mismatch | The objective is expected reward, so any successful trajectory is reinforced, not only the demo's. |
| Data mismatch | The agent learns from all trajectories: it seeks high reward and avoids low reward. |
| Exposure bias | Trajectories are generated by the current policy (on-policy), so the agent trains on its own mistakes and learns to recover. |

### 2. Interactions as trajectories

An agent's episode can be written as a trajectory, and that notation is what makes the gradient derivation possible. The **agent–environment loop** has the agent (policy `π_θ`) send action `a_t` to the environment, which holds the task instance `x` and returns the next observation `o_{t+1}` and a reward `r_{t+1}`. The same loop covers very different settings:

| Setting | Task instance x | Observation o(t+1) | Action a(t) | Reward r(t+1) |
| --- | --- | --- | --- | --- |
| Text generation | the prompt | tokens so far | next token | score from a judge model |
| Web agent | the task and website | rendered page | click, type, scroll | number of sub-tasks completed |
| Number Search | the hidden number | higher, lower or correct | the next guess | 1 on correct, otherwise 0 |

**Histories.** The agent conditions only on past actions and observations, never on the hidden environment state. In Number Search the state `s` includes the hidden number 11, which the policy cannot see. What it sees is the history:

$$
h_t = (o_0, a_0, o_1, \ldots, o_t), \qquad a_t \sim \pi_\theta(a_t \mid h_t)
$$

`o_0` is the initial observation (the prompt), `a_t` is the action at step `t`, and `h_t` is everything observed so far. This is a partially observable setting: the policy acts on a history, not on a Markov state. For an LLM agent, `h_t` is literally the chat transcript in the context window, which is why context management (Lecture 3) and memory (Lecture 4) matter for RL too.

**Trajectories and returns.** A trajectory can also carry a reward at each step:

$$
\tau = (o_0, a_0, r_1, o_1, \ldots, a_{T-1}, r_T, o_T), \qquad R(\tau) = \sum_{t=1}^{T} r_t
$$

`T` is the number of steps, `r_t` is the reward received after action `a_{t-1}`, and `R(τ)` is the total (undiscounted) return. In Number Search every intermediate reward is 0 and the last is 1 on "correct", so for τ1 we get `r_1 = r_2 = r_3 = 0`, `r_4 = 1` and `R(τ1) = 1`.

**Trajectory probability.** How likely a trajectory is depends on both the policy and the environment:

$$
p_\theta(\tau \mid x) = p(o_0 \mid x) \prod_{t} \pi_\theta(a_t \mid h_t)\, P(o_{t+1}, r_{t+1} \mid h_t, a_t, x)
$$

`p(o_0 | x)` is the probability of the initial observation, `π_θ(a_t | h_t)` is the policy's probability of the action it took, and `P(o_{t+1}, r_{t+1} | h_t, a_t, x)` is the environment's probability of the next observation and reward. For τ1 the product reads: `p(o_0|x) · π_θ(8|h_0) · P(higher, 0|…) · π_θ(12|h_1) · P(lower, 0|…) · … · π_θ(11|h_3) · P(correct, 1|…)`. The key practical point from the slide: **we do not know P, but we can sample from it by interacting with the environment.** That is all RL needs.

**The objective: maximize expected reward.**

$$
J(\theta) = \mathbb{E}_{\tau \sim p_\theta(\cdot \mid x)}\left[R(\tau)\right]
$$

`J(θ)` is the expected return of the policy on task instance `x`. The slide's worked number: if the four trajectories had probabilities 0.30, 0.20, 0.25 and 0.25, then `J = 0.30·1 + 0.20·1 + 0.25·0 + 0.25·0 = 0.50`. Training adjusts `θ` to move probability mass from low-reward trajectories toward high-reward ones. With a 0/1 reward, `J` is exactly the success rate (pass@1) on that instance; in practice the objective is also averaged over a distribution of task instances `x`.

### 3. Expert iteration: reinforced self-training

The simplest way to use rewards is to keep only the successes and run SFT on them. This is **ReST** (Reinforced Self-Training; Gulcehre et al., 2023) and its simplified variant **ReST-EM** (Singh et al., 2023). The figure on the slide (ReST, Fig. 1) shows two nested loops:

1. **Grow.** Sample trajectories from the current policy and compute their rewards. This produces a dataset (called `D_g` in the paper).
2. **Improve.** Use the rewards to filter the data, augment the existing datasets, and fine-tune the policy on the result. In ReST this inner step can repeat several times with a rising reward threshold.
3. **Repeat.** Use the updated policy for the next Grow step.

On Number Search: sample τ1 to τ4, compute rewards (1, 1, 0, 0), KEEP τ1 and τ2, DROP τ3 and τ4, then run SFT on the kept set. The loss is the standard SFT loss restricted to high-reward trajectories:

$$
\mathcal{L}_{\mathrm{ReST}}(\theta) = -\sum_{\tau:\, R(\tau)=1} \sum_{t} \log \pi_\theta(a_t \mid h_t)
$$

The outer sum runs over sampled trajectories whose reward is 1; the inner sum runs over the actions inside each one. Note the actions `a_t` are now the agent's own samples, not external demonstrations.

This already fixes a lot. Task mismatch shrinks because any successful strategy is reinforced (τ2 counts as much as τ1). Exposure bias shrinks because the data come from the agent itself. What it does not do is learn anything from failures: τ3 and τ4 are thrown away. The name "expert iteration" comes from the idea that the filtered policy samples act as a slowly improving "expert" for the next round. The "EM" in ReST-EM refers to viewing the loop as expectation–maximization: the E-step samples and weights outputs by reward, the M-step fits the policy to them.

### 4. From rewards to gradients: policy gradients

**Why not just backpropagate?** The pipeline from parameters to reward is parameters `θ` → policy `π_θ(a|h)` → sampled action `a` → environment → observation and reward. Two links are non-differentiable. Sampling a discrete action is a hard choice: changing `θ` changes the probabilities but not (smoothly) which token was picked. And the environment is a black box; the slide asks, "How do you take the derivative of a unit test with respect to code?" Writing the objective as a sum shows the way out:

$$
J(\theta) = \sum_{\tau} p_\theta(\tau \mid x)\, R(\tau)
$$

Only `p_θ(τ | x)` depends on `θ`; `R(τ)` is just a number observed after the rollout. The general solution is the **policy gradient**, introduced as REINFORCE by Williams (1992).

**Derivation (the log-derivative trick).** Four lines, each a small step:

$$
\begin{aligned}
\nabla_\theta J &= \sum_{\tau} \nabla_\theta p_\theta(\tau \mid x)\, R(\tau) \\
&= \sum_{\tau} p_\theta(\tau \mid x)\, R(\tau)\, \frac{\nabla_\theta p_\theta(\tau \mid x)}{p_\theta(\tau \mid x)} \\
&= \sum_{\tau} p_\theta(\tau \mid x)\, R(\tau)\, \nabla_\theta \log p_\theta(\tau \mid x) \\
&= \mathbb{E}_{\tau \sim p_\theta(\cdot \mid x)}\left[ R(\tau)\, \nabla_\theta \log p_\theta(\tau \mid x) \right]
\end{aligned}
$$

`∇_θ` is the gradient with respect to the parameters. Line 1 moves the gradient inside the sum (only the probability depends on `θ`). Line 2 multiplies and divides by the trajectory probability. Line 3 uses the identity `∇p / p = ∇ log p`. Line 4 recognizes a probability-weighted sum as an expectation. The payoff: an expectation can be estimated by sampling, and we can sample trajectories by just running the agent.

**The single-sample estimator.** Replace the expectation by one sampled trajectory `τ ~ p_θ(·|x)`:

$$
\widehat{\nabla_\theta J} = R(\tau)\, \nabla_\theta \log p_\theta(\tau \mid x) = R(\tau) \sum_{t} \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

The hat marks an estimate. The three ingredients and where they come from:

| Ingredient | What it is | Where you get it |
| --- | --- | --- |
| sampled trajectory `τ ~ p_θ(· given x)` | current-policy trajectories and histories | by sampling: the policy plus the environment |
| reward `R(τ)` | a task-level evaluation | from the environment (test result, judge, checker) |
| score function `∇_θ log π_θ(a_t given h_t)` | changes the probabilities of the sampled actions | the same backprop mechanics as SFT |

**Why the environment drops out.** The log of the trajectory probability splits into environment terms and policy terms:

$$
\log p_\theta(\tau \mid x) = \sum_{t} \log P(o_t, r_t \mid h_t, a_t, x) + \sum_{t} \log \pi_\theta(a_t \mid h_t) = \text{const} + \sum_{t} \log \pi_\theta(a_t \mid h_t)
$$

The environment terms (including `p(o_0|x)`) do not depend on `θ`, so their gradient is zero:

$$
\nabla_\theta \log p_\theta(\tau \mid x) = \sum_{t} \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

This is the conceptual heart of the lecture. You never need a model of the environment; you only need the log-probabilities of the policy's own actions, which a language model already computes. For an LLM, one action is a sequence of tokens `a_t = (u_{t,1}, …, u_{t,m_t})`, and its log-probability is the usual token sum:

$$
\nabla_\theta \log \pi_\theta(a_t \mid h_t) = \sum_{k=1}^{m_t} \nabla_\theta \log \pi_\theta(u_{t,k} \mid h_t, u_{t,<k})
$$

`t` indexes actions (turns), `k` indexes tokens within action `a_t`, `m_t` is the number of tokens in that action, and `u_{t,<k}` are the earlier tokens of the same action. This is exactly the SFT computation; the only difference is that the tokens were sampled by the policy. Multiply by `R(τ)` and you have the gradient estimate.

**Implementation: masking and rescaling the SFT loss.** The slide shows a full chat transcript in ChatML format: `<|im_start|>user` … "Find the number in 1–16" … `<|im_start|>assistant` `guess(8)` `<|im_end|>` `<|im_start|>tool` `higher` … `guess(11)` `<|im_end|>`. Tokens the policy sampled (the assistant turns, including the end-of-turn token) are coloured; the prompt and tool outputs are gray context. The loss is:

$$
\mathcal{L}_{\mathrm{PG}}(\theta) = -R(\tau) \sum_{t:\, m_t = 1} \log \pi_\theta(u_t \mid u_{<t})
$$

Here `t` now runs over all tokens in the flattened transcript, `u_t` is token `t`, and `m_t` is a **loss mask**: `m_t = 1` for tokens the policy sampled (including end-of-turn), `m_t = 0` for prompt and observation tokens the policy did not choose. `R(τ)` is one scalar shared by every generated token in the trajectory.

*Common pitfall.* Forgetting the mask, so the model is trained to "predict" tool outputs or web pages it never produced. That teaches it to hallucinate observations, and it wastes gradient on text it cannot control. Also remember to include the end-of-turn token: it is the action "stop talking and hand control to the environment".

**The training loop.** After each update the new policy collects the next batch:

1. **Collect.** Sample task instances; sample trajectories from the agent on them.
2. **Evaluate.** Compute the reward of each trajectory.
3. **Form the loss.** Weight action log-probabilities by reward.
4. **Update.** Backpropagate, change `θ`, and go back to step 1.

$$
\mathcal{L}_{\mathrm{PG}}(\theta) = -\sum_{i} R(\tau_i) \sum_{t} \log \pi_\theta(a_{i,t} \mid h_{i,t})
$$

`i` indexes trajectories in the batch and `t` indexes actions within trajectory `i`.

**With binary rewards, this looks a lot like ReST.** If `R ∈ {0, 1}`, the REINFORCE loss is exactly the SFT loss on the successful trajectories:

$$
-\sum_{i} R(\tau_i) \sum_{t} \log \pi_\theta(a_{i,t} \mid h_{i,t}) = -\sum_{i:\, R(\tau_i)=1} \sum_{t} \log \pi_\theta(a_{i,t} \mid h_{i,t})
$$

The differences are procedural: ReST collects a big batch, aggregates datasets and trains to convergence on it, while REINFORCE takes one gradient step per fresh batch. Both have the same weakness: a trajectory with reward 0 contributes nothing.

### 5. Better than expected: baselines and advantages

**Rewards should be relative.** In basic REINFORCE, every action in τ1 (R = 1) is upweighted, and τ3 (R = 0) produces no gradient at all, exactly as in ReST. That is wasteful and noisy. Whether an outcome is good news depends on how well the policy usually does on this instance: a success on an instance the agent solves 99% of the time says little, while a success on a 5% instance says a lot. The update should depend on the reward relative to what was expected.

**Advantages.** The advantage of an action measures how much better it is than the policy's average from that history:

$$
A^{\pi}(h, a) = Q^{\pi}(h, a) - V^{\pi}(h)
$$

`Q^π(h, a)` is the expected reward if the agent takes action `a` after history `h` and then follows policy `π`; `V^π(h)` is the expected reward from `h` when the action itself is also drawn from `π`. A positive advantage means "better than my usual choice here".

The slide's example: after "guess 8 / higher, guess 12 / lower", the number is 9, 10 or 11, and two guesses remain. Guessing 11 is worse: if wrong, two candidates remain with one guess left, so `A^π(h, 11) < 0`. Guessing 10 (the middle) is better: if wrong, the reply pins down the single remaining candidate, which the last guess can take, so `A^π(h, 10) > 0`. Guessing 10 wins with certainty; guessing 11 wins with probability 1/3 + (2/3)(1/2) = 2/3 under a uniform prior (a small calculation added here, not on the slide).

Neither `Q^π` nor `V^π` is known, so we estimate the advantage from the sampled reward:

$$
\hat{A}_t = R(\tau) - b(h_t)
$$

`R(τ)` is the trajectory's reward (a one-sample estimate of `Q^π(h_t, a_t)`), and `b(h_t)` is a **baseline**, an estimate of `V^π(h_t)`.

**Policy gradient with advantage estimates.** Recentering the reward gives:

$$
\widehat{\nabla_\theta J} = \sum_{t} \left( R(\tau) - b(h_t) \right) \nabla_\theta \log \pi_\theta(a_t \mid h_t) = \sum_t \hat{A}_t \, \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

Plain REINFORCE and this version are two estimators of the same `∇_θ J`. Different choices of `b` give different algorithms:

| Baseline b(h) | Extra model? | Used by |
| --- | --- | --- |
| a constant | no | the upcoming bandit example |
| a running mean of rewards | no | classic REINFORCE with baseline; adapts as the policy improves |
| a trained value model `V_φ(h_t)` | yes, a critic with parameters `φ` | actor–critic methods, PPO |
| the group mean of rewards on the same instance | no | GRPO (next part) |

**Baselines do not bias the gradient.** Take the expectation of the baseline-adjusted estimator. It equals the true gradient minus a baseline term:

$$
\mathbb{E}\left[\widehat{\nabla_\theta J}\right] = \nabla_\theta J - \mathbb{E}\left[ \sum_t b(h_t)\, \nabla_\theta \log \pi_\theta(a_t \mid h_t) \right]
$$

So the estimator is unbiased if that last expectation is zero. For a fixed history `h`:

$$
\begin{aligned}
\mathbb{E}_{a \sim \pi_\theta(\cdot \mid h)}\left[ b(h)\, \nabla_\theta \log \pi_\theta(a \mid h) \right]
&= b(h) \sum_a \pi_\theta(a \mid h)\, \nabla_\theta \log \pi_\theta(a \mid h) \\
&= b(h) \sum_a \nabla_\theta \pi_\theta(a \mid h) \\
&= b(h)\, \nabla_\theta \sum_a \pi_\theta(a \mid h) = b(h)\, \nabla_\theta 1 = 0
\end{aligned}
$$

The second line uses `π ∇log π = ∇π`; the third uses that probabilities sum to 1. Hence `E[∇̂J] = ∇J` for **any baseline that conditions only on the history**. *Common pitfall:* if the baseline depends on the action `a_t` itself (or on the sampled trajectory's own reward), this proof fails and the gradient becomes biased.

**The two-armed bandit, computed exactly.** One parameter, two actions. The policy is `p = π_θ(guess A) = σ(θ)`, where `σ` is the sigmoid, which turns the real number `θ` into a probability. The slide sets `θ = −1.1`, so `p ≈ 0.25`. Guess A gives reward 1; guess B (probability 0.75) gives reward 0. Raising `θ` raises `p(A)` and lowers `p(B)`. The slopes of the log-probabilities are `∂/∂θ log p = 1 − p = +0.75` for A and `∂/∂θ log(1 − p) = −p = −0.25` for B.

| Case | Weight | Slope | Gradient on θ |
| --- | --- | --- | --- |
| No baseline, sampled A (R = 1) | R = 1 | +0.75 | +0.75 |
| No baseline, sampled B (R = 0) | R = 0 | −0.25 | 0 |
| Baseline b = 0.5, sampled A | Â = 1 − 0.5 = +0.5 | +0.75 | +0.375 |
| Baseline b = 0.5, sampled B | Â = 0 − 0.5 = −0.5 | −0.25 | +0.125 |

Without a baseline, sampling B does nothing. With `b = 0.5`, sampling B is "worse than expected" (`Â < 0`), so the update lowers `p(B)`, which here means raising `p(A)`. **The baseline adds a learning signal from failure while preserving the expected gradient.** Both estimators have the same mean: `0.25 × 0.75 + 0.75 × 0 = 0.1875` and `0.25 × 0.375 + 0.75 × 0.125 = 0.1875`.

**Varying the baseline (slide 32).** The figure is a histogram of the one-sample estimate `ĝ = (R − b)·∇_θ log π_θ(a)`: two bars (0.125 with probability 0.75, 0.375 with probability 0.25) with a dashed line at `E[ĝ] = 0.1875`, and a slider for `b`. Moving the slider moves the two bars but never the mean; at `b = 0` they sit at 0 and 0.75. At `b = 0.5` the standard deviation of `ĝ` is 0.108.

**Noise in the gradient estimate (slide 33).** The plot shows the running average of `ĝ` (y-axis, 0 to 0.75) against the number of samples drawn (x-axis, 1 to 20), for both estimators, with the true gradient 0.1875 as a dashed line. The no-baseline curve (purple) starts at 0.75 and swings widely; the `b = 0.5` curve (green) starts at 0.375 and hugs the true value. After 20 samples both running averages read 0.188, but the spread differs: SD 0.325 without a baseline vs 0.108 with it, three times less noise. **Both averages converge to the same value, but the baseline has lower variance.** Lower variance means fewer samples (rollouts) for the same quality of update, which is the scarce resource in agent RL.

**What baselines do and do not do (slide 34).**

| Helps | Does not solve |
| --- | --- |
| Marks a trajectory as better or worse than expected. | All actions in a trajectory still get the same advantage (e.g. Â = +0.5 for guess 8, 12, 10 and 11 alike). |
| A good baseline reduces gradient variance. | Estimating `V^π(h)` well may require a separate value model. |

The first limitation is the **credit assignment** problem: with one outcome reward, the method cannot tell which of the four guesses deserved the credit. Only averaging over many trajectories separates good actions from lucky passengers.

**Intermediate rewards: reward-to-go.** If the environment pays rewards before the final step (e.g. a tool reward of +0.2 mid-episode, then a terminal +1), weight each action only by the rewards that come after it:

$$
R_t = \sum_{t'=t+1}^{T} r_{t'}
$$

`R_t` is the reward-to-go from step `t`; `r_{t'}` are the rewards after action `a_t`. Earlier rewards cannot depend on `a_t` (causality), so dropping them cuts variance without adding bias. In Number Search, reward arrives once at the end, so `R_t = R(τ)` for every action and reward-to-go changes nothing.

### 6. Comparing trajectories: group-relative advantages (GRPO, DrGRPO)

**Group-relative advantage estimates.** Instead of training a value model, sample the policy several times on the same task instance and use the group's average reward as the baseline. No separate model is needed. For a group of `G` rollouts on one instance:

$$
b(h_t) = \bar{R} = \frac{1}{G} \sum_{j=1}^{G} R(\tau_j), \qquad \hat{A}_j = \frac{R(\tau_j) - \bar{R}}{\sigma_R}, \qquad \sigma_R = \operatorname{std}\{R(\tau_1), \ldots, R(\tau_G)\}
$$

`G` is the group size, `τ_j` is the j-th rollout, `R̄` is the group mean reward (used as the baseline for every history in the group), `σ_R` is the standard deviation of the group's rewards, and `Â_j` is the advantage shared by every action in rollout `j`. For the four Number Search trajectories:

| Rollout | Reward R(j) | Centered R(j) − R̄ | Divide by σ (0.5) | Advantage Â(j) |
| --- | --- | --- | --- | --- |
| τ1 (8, 12, 10, 11) | 1 | +0.5 | ÷ 0.5 | +1 |
| τ2 (4, 8, 12, 11) | 1 | +0.5 | ÷ 0.5 | +1 |
| τ3 (16, 8, 9, 10) | 0 | −0.5 | ÷ 0.5 | −1 |
| τ4 (1, 2, 3, 4) | 0 | −0.5 | ÷ 0.5 | −1 |

Here `R̄ = 0.5` and `σ_R = 0.5` (the population standard deviation). Failures now push probability away from their actions, which neither ReST nor plain REINFORCE did.

**The GRPO update.** A batch contains several task instances, each with its own group, its own mean `R̄_i` and its own `σ_i`. The slide's batch of three instances with `G = 4`:

| Instance | Rewards of the 4 rollouts | Group mean | Advantages |
| --- | --- | --- | --- |
| x1, hidden 11 | 1, 1, 0, 0 | 0.50 | +1, +1, −1, −1 |
| x2, hidden 3 | 1, 0, 0, 0 | 0.25 | +1.73, −0.58, −0.58, −0.58 |
| x3, hidden 7 | 1, 1, 1, 0 | 0.75 | +0.58, +0.58, +0.58, −1.73 |

Notice the asymmetry. On the hard instance x2 the single success gets a large +1.73; on the easy instance x3 the single failure gets a large −1.73. Rare outcomes carry the most information, and normalization amplifies them. The loss changes from REINFORCE to GRPO only in the weight:

$$
-\sum_{i} R(\tau_i) \sum_{t} \log \pi_\theta(a_{i,t} \mid h_{i,t}) \;\longrightarrow\; -\sum_{i} \frac{1}{G} \sum_{j=1}^{G} \hat{A}_{ij} \sum_{t} \log \pi_\theta(a_{ij,t} \mid h_{ij,t})
$$

`i` indexes task instances in the batch, `j` indexes the `G` rollouts for instance `i`, and `Â_ij` is rollout j's group-normalized advantage. GRPO supplies group-relative weights to the same policy-gradient term. GRPO comes from Shao et al.'s DeepSeekMath paper (2024, §4.1.2). The slide writes it for current-policy trajectories, without the paper's importance ratio, clipping, or KL term (those come in the advanced RL lecture).

**DrGRPO's two changes.** Liu et al. ("Understanding R1-Zero-Like Training", 2025) argue that GRPO carries two biases and remove both divisions:

| Component | GRPO | DrGRPO | Why it changes |
| --- | --- | --- | --- |
| Advantage estimate | (R(j) − R̄) / σ\_R | R(j) − R̄ | `σ_R` is measured inside each group, so it differs across instances. Instances the policy almost always passes or almost always fails have small `σ_R`, so they count for more. |
| Response aggregation | (1 / length of y\_j) × sum over tokens | (1 / C) × sum over tokens | Response length differs between responses. A long incorrect response is penalized less per token than a short one, so the policy drifts toward longer wrong answers. |

`C` is a global constant, the same for every response; the paper uses the generation budget (maximum length). The rewards stay fixed; only the relative weights of task instances and of responses change.

**Token coefficients in DrGRPO.** For one instance, every generated token in trajectory `j` shares that trajectory's advantage. With `Â_1 = +0.5` (τ1) each sampled token of τ1 gets coefficient `+0.5 / C`; with `Â_3 = −0.5` (τ3) each sampled token gets `−0.5 / C`. Tool outputs such as "higher" still have mask 0.

$$
\mathcal{L}_{\mathrm{DrGRPO}}(\theta) = -\frac{1}{G} \sum_{j=1}^{G} \frac{1}{C} \sum_{t:\, m_{j,t} = 1} \hat{A}_j \log \pi_\theta(u_{j,t} \mid u_{j,<t}), \qquad \hat{A}_j = R(\tau_j) - \bar{R}
$$

`u_{j,t}` is token `t` of rollout `j`, `m_{j,t}` is its loss mask, and `C` is the constant normalizer. The paper's full objective also has a ratio and clipping.

**Degenerate groups: equal rewards give zero advantage.** If every reward in a group matches, every centered reward is zero and the group contributes no gradient. All fail, \[0, 0, 0, 0\] → advantages \[0, 0, 0, 0\]: possibly too hard for the current policy. All succeed, \[1, 1, 1, 1\] → \[0, 0, 0, 0\]: possibly too easy. (With the σ division, GRPO implementations add a small epsilon to avoid dividing by zero here.) What to do when everything fails, per the slide: choose different task instances (a curriculum), broaden exploration (e.g. higher temperature, more samples), add demonstrations (SFT warm start), or supply a more informative reward (partial credit).

**GRPO vs PPO.** The figure (DeepSeekMath, Fig. 4) contrasts the two pipelines. In **PPO**, a question `q` goes to the policy model, which produces output `o`; a reference model (for a KL penalty), a reward model and a **value model** all process `o`; the reward `r` and value `v` feed Generalized Advantage Estimation (GAE) to produce advantage `A`; the value model is itself trained. In **GRPO**, the policy produces a group of outputs `o_1 … o_G`; the reward model scores them `r_1 … r_G`; a "group computation" turns them into `A_1 … A_G`; the KL to the reference model is applied directly to the policy. GRPO drops the value model, which for LLMs is typically as large as the policy, saving memory and compute and removing a hard-to-train component. The cost is `G` rollouts per prompt.

### 7. Summary: one gradient, different weights

Every method in the lecture weights the log-probabilities of the actions the agent took; they differ mainly in the weight:

$$
\widehat{\nabla_\theta J} = \sum_t w_t\, \nabla_\theta \log \pi_\theta(a_t \mid h_t)
$$

| Method | Weight w(t) on an action | Learns from failures? | Extra model? |
| --- | --- | --- | --- |
| SFT (L8) | 1 on demonstration actions | no | no |
| ReST-EM | 1 on a successful trajectory, 0 on the rest (SFT on what was kept) | no | no |
| REINFORCE | R(τ), the reward of the trajectory the action came from | no, if R = 0 | no |
| REINFORCE + baseline | R(τ) − b(h) | yes | optional (value model) |
| GRPO / DrGRPO | Â(j), the reward relative to the other rollouts on the same instance | yes | no |

The takeaways map back to the three opening problems. **Task mismatch:** the objective is expected reward, so any trajectory that succeeds is reinforced. **Data mismatch:** the agent also learns from sub-optimal trajectories, according to their reward. **Exposure bias:** the trajectories come from the current policy, so the agent is trained to recover from its own mistakes. Next up in the course: asynchronous RL, off-policy data and importance weighting (Lecture 11).

## Going deeper

The lecture's methods are the modern end of a 30-year line of policy-gradient research; knowing the lineage and a few extra results makes the design choices in current agent-RL recipes easier to read. Everything below is added context, not slide content.

### Lineage of the ideas

- **REINFORCE (Williams, 1992)** introduced the score-function (likelihood-ratio) gradient for neural policies, including the idea of a reinforcement baseline. The same estimator is known in statistics and simulation as the likelihood-ratio or score-function method.
- **The policy gradient theorem (Sutton, McAllester, Singh and Mansour, 1999)** generalized the result to per-step value functions, which is the basis of actor–critic methods: a critic `V_φ` learns the baseline while the actor learns the policy.
- **Trust-region methods.** TRPO (Schulman et al., 2015) and then PPO (Schulman et al., 2017) limit how far each update can move the policy, using an importance ratio and (in PPO) clipping. Generalized Advantage Estimation (GAE; Schulman et al., 2015) blends value-model predictions over many steps to trade bias against variance. These are the pieces L11 adds on top of this lecture.
- **RLHF.** Christiano et al. (2017), Ziegler et al. (2019) and InstructGPT (Ouyang et al., 2022) applied PPO to language models with a learned reward model and a KL penalty to a reference model. That is the PPO pipeline in the DeepSeekMath figure.
- **Expert iteration and self-training.** Before ReST, "expert iteration" (Anthony, Tian and Barber, 2017) alternated search and imitation for games, and STaR (Zelikman et al., 2022) bootstrapped reasoning by fine-tuning on the model's own correct rationales. ReST and ReST-EM are the LLM-scale versions.
- **Critic-free REINFORCE for LLMs.** Kool, van Hoof and Welling (2019) showed that sampling several outputs per input gives a "free" baseline. Ahmadian et al. (2024) revived this as RLOO (REINFORCE Leave-One-Out) for RLHF. GRPO (Shao et al., 2024) popularized the group-normalized version, and DeepSeek-R1 (2025) made it the default recipe for reasoning models trained on verifiable rewards. DrGRPO and DAPO (Yu et al., 2025) are corrections and engineering refinements of that recipe.

### The group mean is (almost) a leave-one-out baseline

The unbiasedness proof in the lecture requires the baseline to depend only on the history, not on the sampled action. The GRPO group mean includes the trajectory's own reward, so strictly it breaks that condition. The fix is simple algebra: with `G` rollouts, `R_j − R̄ = ((G − 1)/G) · (R_j − R̄_{−j})`, where `R̄_{−j}` is the mean of the other `G − 1` rewards. The leave-one-out baseline `R̄_{−j}` is independent of rollout `j`, so it is unbiased. The group mean therefore only rescales the gradient by the constant `(G − 1)/G`, which the learning rate absorbs. Dividing by the group standard deviation, however, does change the relative weight of instances; that is exactly DrGRPO's objection.

### Which baseline is best?

For a single action with score `s = ∇ log π(a)`, the variance of `(R − b)s` is minimized by the baseline:

$$
b^{*} = \frac{\mathbb{E}\left[R\, s^2\right]}{\mathbb{E}\left[s^2\right]}
$$

`R` is the reward, `s` is the score of the sampled action, and expectations are over actions drawn from the policy. Applied to the lecture's bandit (`p = 0.25`, `s_A = 0.75`, `s_B = −0.25`): `E[R s²] = 0.25 × 0.5625 = 0.1406` and `E[s²] = 0.25 × 0.5625 + 0.75 × 0.0625 = 0.1875`, so `b* = 0.75`. At `b = 0.75` both outcomes give exactly `ĝ = 0.1875`, a zero-variance estimator. By contrast the "natural" baseline `V(h) = p = 0.25` gives an SD of about 0.22, worse than the slide's `b = 0.5` (SD 0.108). The lesson: `V^π` is a good, simple default, not the variance-optimal choice, and in two-action problems a well-chosen baseline can remove almost all noise.

### Practical engineering notes for agent RL

- **Reward design is the real work.** Verifiable rewards (unit tests, exact-match answers, environment checks) are cheap and hard to fool, which is why RL on math and code took off first; the term "RL with verifiable rewards" (RLVR) comes from the Tülu 3 report (Lambert et al., 2024). Learned or LLM-judge rewards invite **reward hacking**: the policy finds outputs the judge likes that do not solve the task. Inspect samples, not just reward curves.
- **Filter degenerate groups.** Since all-pass and all-fail groups give zero gradient, DAPO's "dynamic sampling" keeps sampling until the batch is filled with groups that have mixed outcomes. Tracking the fraction of degenerate groups is a cheap health metric for your task mix.
- **Mask carefully in multi-turn agents.** Only assistant-generated tokens (including end-of-turn and tool-call syntax) get loss. Tool outputs, retrieved documents and environment text get mask 0. Re-tokenization mismatches between the sampler (e.g. vLLM) and the trainer are a classic silent bug.
- **Stay on-policy, or correct for it.** The derivation assumes the samples come from the current `π_θ`. Real systems generate rollouts with slightly stale weights for throughput. Importance ratios and clipping (PPO-style) are the standard correction; that is L11's topic.
- **Watch entropy and length.** Policies trained on 0/1 rewards often collapse to low entropy (little exploration) or drift in response length. DrGRPO's length fix and DAPO's token-level loss both target the length issue.
- **Frameworks.** Hugging Face TRL implements GRPO and RLOO trainers; verl and OpenRLHF are common for larger-scale runs. Read their loss code: most of the lecture's equations map to a few lines.

### Open problems

- **Credit assignment over long horizons.** A single outcome reward on a 50-step web or coding trajectory tells you almost nothing about which step mattered. Process reward models, step-level verifiers and turn-level advantages are active research directions.
- **Exploration when success is rare.** If the base policy never succeeds, every group is degenerate. Curricula, demonstrations (SFT warm start) and partial-credit rewards are the usual remedies, as the slide suggests; none is fully general.
- **Does RL teach new skills or sharpen existing ones?** Several 2025 studies debate whether RL with verifiable rewards mainly reweights behaviours already in the base model (raising pass@1) or expands what it can do (pass@k at large k). The answer matters for how much to invest in pre-training versus RL.

## Worked example

The script below trains a tiny Number Search agent with the lecture's four weightings (ReST, REINFORCE, GRPO, DrGRPO) and shows that they differ only in one function, `weights`. It is plain NumPy with no LLM: the policy is a softmax over five "where to guess inside the remaining interval" actions (0%, 25%, 50%, 75%, 100% of the way from `lo` to `hi`), with separate logits for each number of guesses left. The interval `(lo, hi)` plus guesses left is a sufficient summary of the history `h_t`. Binary search (always the 50% split) is the optimal strategy; four guesses can cover at most 1 + 2 + 4 + 8 = 15 numbers, so the best success rate is 15/16.

```python
import numpy as np

N, MAX_GUESSES = 16, 4
SPLITS = np.array([0.0, 0.25, 0.5, 0.75, 1.0])   # where in [lo, hi] to guess
rng = np.random.default_rng(0)
theta = np.zeros((MAX_GUESSES, len(SPLITS)))      # logits per "guesses left"

def policy(left):
    z = np.exp(theta[left - 1] - theta[left - 1].max())
    return z / z.sum()

def rollout(hidden):
    """One trajectory. The history h_t is summarized by (lo, hi, guesses left)."""
    lo, hi, steps = 1, N, []
    for left in range(MAX_GUESSES, 0, -1):
        k = rng.choice(len(SPLITS), p=policy(left))    # sample action a_t
        guess = lo + int(round(SPLITS[k] * (hi - lo)))
        steps.append((left, k))
        if guess == hidden:
            return steps, 1.0                           # "correct": R = 1
        lo, hi = (guess + 1, hi) if guess < hidden else (lo, guess - 1)
    return steps, 0.0                                   # timeout: R = 0

def weights(rewards, method):
    """The weight w given to every action of each rollout in one group."""
    R = np.array(rewards)
    if method == "rest":
        return (R == 1).astype(float)        # keep successes only
    if method == "reinforce":
        return R                             # w = R(tau)
    centered = R - R.mean()                  # group-mean baseline
    if method == "grpo":
        return centered / (R.std() + 1e-6)   # also divide by group std
    return centered                          # "drgrpo": no std division

def train(method, iters=150, batch=8, G=8, lr=1.0):
    theta[:] = 0.0
    for _ in range(iters):
        grad, degenerate = np.zeros_like(theta), 0
        for _ in range(batch):                             # 1. Collect
            hidden = rng.integers(1, N + 1)
            group = [rollout(hidden) for _ in range(G)]
            rewards = [r for _, r in group]                # 2. Evaluate
            degenerate += len(set(rewards)) == 1
            for (traj, _), w in zip(group, weights(rewards, method)):
                for left, k in traj:                       # 3. w * grad log pi
                    g = -policy(left)
                    g[k] += 1.0                            # onehot - probs
                    grad[left - 1] += w * g
        theta[:] += lr * grad / (batch * G)                # 4. Update
    return success_rate(), degenerate / batch

def success_rate(n=4000):
    return np.mean([rollout(rng.integers(1, N + 1))[1] for _ in range(n)])

print(f"uniform policy: success={success_rate():.3f}   (best possible 15/16 = 0.9375)")
for method in ["rest", "reinforce", "grpo", "drgrpo"]:
    acc, deg = train(method)
    print(f"{method:9s}: success={acc:.3f}  degenerate groups (last batch)={deg:.2f}"
          f"  p(split=0.5 | 4 left)={policy(4)[2]:.2f}")
```

One run with seed 0 printed:

```text
uniform policy: success=0.525   (best possible 15/16 = 0.9375)
rest     : success=0.897  degenerate groups (last batch)=0.50  p(split=0.5 | 4 left)=0.94
reinforce: success=0.894  degenerate groups (last batch)=0.62  p(split=0.5 | 4 left)=0.96
grpo     : success=0.928  degenerate groups (last batch)=0.88  p(split=0.5 | 4 left)=0.99
drgrpo   : success=0.801  degenerate groups (last batch)=0.25  p(split=0.5 | 4 left)=0.91
```

What to notice:

- The gradient line `g = onehot - probs` is the gradient of `log π_θ(a_t given h_t)` for a softmax; the same line serves all four methods. Only `weights` changes, which is the lecture's summary slide in code.
- The environment (the hidden number and the higher/lower logic) never appears in the gradient. It only produces trajectories and rewards, exactly as the derivation promised.
- All four methods discover binary search (the 50% split becomes near-certain with four guesses left). One seed is not a benchmark: the ranking changes with the seed and learning rate. DrGRPO's advantages are about half the size of GRPO's here (no division by σ of about 0.5), so at the same `lr` it simply takes smaller steps.
- As the policy improves, more groups become all-success and give zero gradient under GRPO and DrGRPO: 88% of the last GRPO batch was degenerate. This is the "too easy" case from the lecture, and why systems like DAPO resample to keep mixed groups.
- To try: set `batch=1, G=1` to see plain single-sample REINFORCE noise, or make the task harder (`MAX_GUESSES = 3`) and watch the fraction of all-fail groups rise early in training.

## Key terms

These are the terms the lecture relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Advantage | How much better an action is than the policy's average from that history: Q(h, a) minus V(h). Estimated in practice as reward minus a baseline. |
| Baseline | A value b(h) subtracted from the reward before weighting the gradient. Unbiased if it depends only on the history; a good one cuts variance. |
| Credit assignment | Working out which actions in a trajectory caused its reward. A single outcome reward gives every action the same credit. |
| Data mismatch | SFT's inability to learn from sub-optimal or failed trajectories; it can only imitate. |
| Degenerate group | A GRPO group whose rewards are all equal (all pass or all fail). Every advantage is zero, so it contributes no gradient. |
| DrGRPO | "GRPO done right" (Liu et al., 2025): drops GRPO's division by the group standard deviation and by response length, using a global constant instead. |
| Expert iteration | Alternating between sampling from the current model and fine-tuning on the best (filtered) samples. ReST and ReST-EM are LLM versions. |
| Exposure bias | A model trained only on expert histories has never seen its own mistakes, so it handles them poorly at generation time. |
| Group-relative advantage | The reward of one rollout minus (and, in GRPO, divided by the std of) the rewards of other rollouts on the same task instance. |
| GRPO | Group Relative Policy Optimization (Shao et al., 2024): policy gradient with group-relative advantages instead of a learned value model. |
| History | Everything the agent has observed so far, h(t) = (o0, a0, o1, …, o(t)). The policy conditions on it, not on hidden environment state. |
| Log-derivative trick | The identity ∇p = p ∇log p, which turns the gradient of an expectation into an expectation that can be estimated by sampling. |
| Loss mask | Per-token 0/1 flag: 1 for tokens the policy generated (including end-of-turn), 0 for prompt and observation tokens. |
| On-policy | Training on trajectories sampled from the current policy. It is what removes exposure bias. |
| Policy | The agent's action distribution given a history, written πθ(a given h). For an LLM agent, the language model itself. |
| Policy gradient | The gradient of expected reward with respect to policy parameters, estimated as reward times the sum of action log-probability gradients. |
| PPO | Proximal Policy Optimization (Schulman et al., 2017): policy gradient with a learned value model, importance ratios and clipping. |
| REINFORCE | Williams' (1992) Monte Carlo policy-gradient algorithm: weight each sampled action's log-probability gradient by the trajectory's reward. |
| ReST / ReST-EM | Reinforced Self-Training: grow a dataset by sampling, filter it by reward, fine-tune with the SFT loss, repeat. |
| Reward-to-go | The sum of rewards after a given action. Using it instead of the full return removes rewards the action could not have caused. |

## Self-check

Test yourself on recall, reasoning and design; answers follow each question.

1. Name SFT's three problems for agents and give a Number Search example of each.

   **Answer:** Task mismatch: imitating τ1 penalizes the equally successful τ2. Data mismatch: SFT cannot use failures such as τ3 or τ4. Exposure bias: after the model's own mistake ("8 higher, 2") it sees a history it was never trained on.
2. Why can't we just backpropagate from the reward to the parameters?

   **Answer:** Two links are non-differentiable: sampling a discrete action, and the environment itself (you cannot differentiate a unit test with respect to code). The policy gradient avoids both by differentiating only the log-probability of the sampled actions and treating the reward as a constant weight.
3. In the trajectory log-probability, why do the environment terms disappear from the gradient?

   **Answer:** log p(τ) splits into a sum of environment terms log P(o, r given h, a, x) and policy terms log πθ(a given h). The environment terms do not depend on θ, so their gradient is zero. We therefore never need a model of the environment, only samples from it.
4. With 0/1 rewards, how does the REINFORCE loss relate to ReST? What is still missing?

   **Answer:** Multiplying each trajectory's log-probability by R in {0, 1} is the same as running SFT on the successful trajectories only, which is ReST's loss. Failures still contribute nothing, and every action in a success is upweighted equally.
5. Prove in one line why a baseline that depends only on h does not bias the gradient.

   **Answer:** The expected baseline term is b(h) times the sum over a of π(a given h) ∇log π(a given h), which equals b(h) ∇ of the sum of π(a given h), which is b(h) ∇ 1 = 0. If b depended on the action, it could not be pulled out of the sum and the argument would fail.
6. In the two-armed bandit with p(A) = 0.25 and baseline 0.5, what is the gradient on θ when B is sampled, and what does it do?

   **Answer:** (0 − 0.5) × (−0.25) = +0.125. It lowers p(B) and therefore raises p(A). Without a baseline the same sample gives 0, so the baseline adds a learning signal from failure.
7. Compute GRPO advantages for a group with rewards \[1, 0, 0, 0\]. Then compute DrGRPO advantages.

   **Answer:** The mean is 0.25 and the population std is about 0.433. GRPO gives +1.73 for the success and −0.58 for each failure. DrGRPO skips the std division: +0.75 and −0.25.
8. Why does DrGRPO replace the 1 / (response length) factor with a constant C?

   **Answer:** Dividing by each response's own length means a long wrong answer is penalized less per token than a short wrong one. That creates pressure toward longer incorrect responses. A global constant, the same for every response, removes the length-dependent weighting.
9. Your agent-RL run shows 90% of groups with all rewards 0. What would you change?

   **Answer:** The tasks are too hard for the current policy, so almost nothing is learned. Options from the lecture: pick easier or better-targeted task instances (curriculum), broaden exploration (more samples, higher temperature), warm-start with demonstrations via SFT, or give a more informative reward such as partial credit for sub-tasks.
10. How would you implement the policy-gradient loss for a multi-turn tool-using agent in an existing SFT codebase?

    **Answer:** Render the whole trajectory as one chat transcript and compute token log-probabilities as in SFT. Apply a loss mask that is 1 only on assistant-generated tokens (including end-of-turn) and 0 on prompt and tool-output tokens. Multiply each trajectory's masked sum by its weight (R, R minus baseline, or the group advantage), average over the batch, and negate.
11. When would you prefer PPO with a value model over GRPO?

    **Answer:** When sampling many rollouts per prompt is expensive (long agent episodes), or when you want per-step advantages for credit assignment over long horizons, which a value model can provide. GRPO is attractive when rollouts are cheap relative to training a policy-sized critic, and rewards are outcome-level.

## References and further reading

The first list is everything the slides cite; the second adds the most useful background, from textbook foundations to current LLM-RL recipes.

### Cited in the lecture

- RL Fundamentals (lecture slides) — Sean Welleck — the source the "reinforcement learning" overview slide is adapted from; no public link verified.
- [Reinforced Self-Training (ReST) for Language Modeling](https://arxiv.org/abs/2308.08998) — Gulcehre et al. (Google DeepMind), 2023 — the Grow/Improve loop of filtered self-training (Fig. 1 appears on slide 15).
- [Beyond Human Data: Scaling Self-Training for Problem-Solving with Language Models](https://arxiv.org/abs/2312.06585) — Singh et al. (Google DeepMind), 2023 — ReST-EM: the simplified expectation–maximization version, with results on math and code.
- [Simple statistical gradient-following algorithms for connectionist reinforcement learning](https://link.springer.com/article/10.1007/BF00992696) — Ronald J. Williams, Machine Learning, 1992 — the original REINFORCE paper, including reinforcement baselines.
- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) — Shao et al. (DeepSeek), 2024 — introduces GRPO (§4.1.2, Eq. 3) and the PPO vs GRPO figure (Fig. 4).
- [Understanding R1-Zero-Like Training: A Critical Perspective](https://arxiv.org/abs/2503.20783) — Liu et al., 2025 — the DrGRPO paper; §3.2 and Fig. 1 explain the std and length biases.

### Further reading

- [Reinforcement Learning: An Introduction, 2nd ed.](http://incompleteideas.net/book/the-book-2nd.html) — Sutton and Barto, 2018 — Chapter 13 (policy gradient methods) is the textbook treatment of REINFORCE, baselines and actor–critic; free online.
- [Spinning Up: Intro to Policy Optimization](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html) — OpenAI (Josh Achiam), 2018 — the clearest short derivation of the policy gradient, reward-to-go and the baseline lemma, with code.
- [Policy Gradient Algorithms](https://lilianweng.github.io/posts/2018-04-08-policy-gradient/) — Lilian Weng, 2018 — a map of the whole family (REINFORCE, actor–critic, TRPO, PPO and more) in one blog post.
- [Policy Gradient Methods for Reinforcement Learning with Function Approximation](https://papers.nips.cc/paper/1713-policy-gradient-methods-for-reinforcement-learning-with-function-approximation) — Sutton, McAllester, Singh and Mansour, NeurIPS 1999 — the policy gradient theorem behind actor–critic methods.
- [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347) — Schulman et al. (OpenAI), 2017 — ratios and clipping; the baseline GRPO was designed to replace, and the core of L11.
- [High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438) — Schulman et al., 2015 — GAE, the advantage estimator in the PPO pipeline.
- [Buy 4 REINFORCE Samples, Get a Baseline for Free!](https://mlanthology.org/iclrw/2019/kool2019iclrw-buy/) — Kool, van Hoof and Welling, ICLR workshop 2019 — the leave-one-out multi-sample baseline that GRPO's group mean closely resembles.
- [Back to Basics: Revisiting REINFORCE Style Optimization for Learning from Human Feedback in LLMs](https://arxiv.org/abs/2402.14740) — Ahmadian et al. (Cohere), 2024 — RLOO; argues PPO's machinery is often unnecessary for LLMs.
- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — GRPO with verifiable rewards at scale; the paper that made this recipe standard.
- [DAPO: An Open-Source LLM Reinforcement Learning System at Scale](https://arxiv.org/abs/2503.14476) — Yu et al. (ByteDance Seed and Tsinghua), 2025 — practical fixes including dynamic sampling of non-degenerate groups and token-level loss.
- [Reinforcement Learning from Human Feedback (book)](https://rlhfbook.com/) — Nathan Lambert, ongoing — free book covering reward models, policy gradients, PPO, GRPO and RLVR for language models.
- [GRPO Trainer documentation](https://huggingface.co/docs/trl/main/en/grpo_trainer) — Hugging Face TRL — a production implementation; compare its loss options with the equations here.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T10 - Supervised Fine-Tuning on Agent Trajectories]]
- Topic deep dive: [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]
- [[The State of LLM Reasoning Model Inference]]

[[L08 - SFT for Agents|← L8]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L10 - Deep Research Agents|L10 →]]
