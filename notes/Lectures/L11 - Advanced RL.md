---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, reinforcement-learning, ppo, grpo, llm-training]
aliases: ["CMU L11", "11-768 Lecture 11", "Advanced RL Algorithms for Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-11-rl-advanced.pdf"
---

# Lecture 11 · Advanced RL Algorithms for Agents

[[L10 - Deep Research Agents|← L10]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L12 - RL Systems|L12 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 11 · Graham Neubig
> **Source:** lecture slides `lecture-11-rl-advanced.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]], [[T12 - Rewards, Verifiers and Reward Hacking]]

Graham Neubig · 11-768 AI Agents, Fall 2026 · source slides: lecture-11-rl-advanced.pdf (58 slides)

## Overview

Plain "sample, score, update" RL is too slow, too noisy and too easy to fool for real agents, so practical agent RL adds four things: finer credit assignment, overlapping rollouts with updates, controlled (clipped, importance-weighted) policy updates, and trustworthy rewards on tasks of the right difficulty, with teacher distillation as a denser alternative signal. Graham Neubig builds every idea on one running task: a coding agent that must fix `retry_count(config)` so that `retries=0` disables retries, judged by four unit tests.

**After this lecture you can…**

- Explain why plain REINFORCE wastes failed attempts, and how group baselines (GRPO-style), learned critics, TD errors and GAE turn one final reward into per-action credit.
- Explain why asynchronous RL produces stale rollouts, and correct for them with importance sampling at the token, cumulative (CTPO) or sequence (GSPO) level.
- Write and interpret the PPO and CISPO objectives, the reference-model KL penalty and the entropy bonus, and place REINFORCE, PPO, GRPO, CISPO, GSPO and DAPO in one comparison table.
- Diagnose an all-zero reward group (bad verifier, task too hard, or no exploration) and choose a remedy: dynamic sampling, partial rewards, curricula or warm starts.
- Recognise false negatives, false positives and reward hacking in verifiers, and set up independent checks of progress.
- Describe off-policy distillation, on-policy distillation with a reverse-KL objective, and on-policy self-distillation (OPSD).

**Prerequisites:** Lecture 9 (RL foundations: policy, trajectory, reward, policy gradient), basic probability (expectations, logs, KL divergence) and the idea of a gradient step.

**How it connects to the course.** L1 defined the agent loop whose trajectories are trained here, and L2 (tool use) and L6 (coding agents) supply the running bug-fix task and its test-based verifier. L3 (long context) matters because long trajectories make importance ratios explode. L8 (SFT) reappears as warm starts and off-policy distillation. L9 introduced REINFORCE and the policy-gradient objective; this lecture fixes its weaknesses. L10 (deep research agents) is a domain where these algorithms are applied to browsing and search tasks. The next lecture (RL systems) covers memory, parallelism and execution at scale, which the asynchronous-RL part only previews.

## Concept map

![[cmu-ai-agents-L11-concept-map.png]]
*Concept map: RL training loop · 4 steps, each with the lecture's upgrade*

Read the top row left to right as one pass of the basic RL loop; each shaded box below names the upgrade the lecture applies to that step, and the dashed link shows why faster (asynchronous) sampling forces more careful updates.

## Detailed notes

The lecture follows one bug-fix task through five upgrades to basic RL: better credit, less waiting, stable updates, reliable rewards and learning from a teacher. The slide deck frames these as a bridge: RL basics (sample attempts, score them, update the policy) come before, and RL systems (memory, parallelism, execution at scale) come after.

### 1. Setup: the running task and plain REINFORCE

**The task.** The prompt says: "Fix the retry setting: zero should disable retries, but the code returns three. Preserve the other cases." The initial state is buggy code:

```python
def retry_count(config):
    return config.get("retries") or 3   # bug: 0 is falsy, so 0 -> 3
```

The verifier is four unit tests (input to expected output): missing key to 3, `None` to 3, `0` to 0, and `2` to 2. The bug is a classic Python truthiness trap: `0 or 3` evaluates to 3. The example is borrowed from Lecture 6 (Coding Agents), so the same environment carries across the course.

**A trajectory.** A trajectory τ is one attempt: the agent's actions plus the observations they produce. The successful example has five turns: (1) inspect the function and see that 0 becomes 3; (2) edit the default handling and save a first patch; (3) run the four tests, one still fails; (4) revise the code again; (5) rerun the tests, all four pass. The reward is binary and arrives only at the end: R(τ) = 1 if all four tests pass, otherwise 0. This is a *verifiable* or *outcome* reward.

**The training loop.** Training repeats three steps to raise average reward over many attempts.

1. **Sample:** run the agent on tasks and collect trajectories τ.
2. **Score:** the verifier assigns each trajectory its reward R(τ).
3. **Update:** use the rewards to change the policy's parameters, then collect new attempts with the updated policy.

The goal is to maximise expected reward on a task:

$$
J(\theta) = \mathbb{E}_{\tau \sim p_\theta(\cdot \mid x)}\left[ R(\tau) \right]
$$

Here x is the task (initial state plus prompt), θ the policy's parameters, pθ(τ | x) the probability that the policy produces trajectory τ on task x, and R(τ) the final reward. The expectation averages over all trajectories the policy might produce.

**Plain REINFORCE.** REINFORCE (Williams, 1992; covered in Lecture 9) uses the final reward to weight every action in the attempt. For one sampled trajectory the loss to minimise is:

$$
L_{\mathrm{PG}} = -R(\tau) \sum_{t} \log \pi_\theta(a_t \mid h_t)
$$

At step t the agent takes action a\_t after history h\_t (the task, earlier actions and observations). πθ(a\_t | h\_t) is the policy's probability of that action given the history. Minimising this loss pushes up the log-probability of every action in a rewarded trajectory.

The weakness is visible immediately. A successful attempt (R = 1) raises the likelihood of all its actions, including any mistakes. A failed attempt (R = 0) multiplies everything by zero and contributes **no update at all**. With a hard task where most attempts fail, most compute is wasted. The slide closes with the question that drives the next section: how can a failed attempt still provide a learning signal?

### 2. Credit assignment and dense feedback

Credit assignment asks which actions deserve credit for an outcome. The lecture climbs a ladder from coarse to fine: compare whole trajectories, then compute per-turn reward-to-go, then learn a value function, then use TD errors and GAE, and finally consider process reward models.

**Group baseline: compare trajectories on the same task.** Sample four attempts at the bug-fix task. Attempt 1 passes all four tests (R = 1); attempts 2 to 4 fail (R = 0). Use the group mean as a baseline: (1 + 0 + 0 + 0) / 4 = 0.25. Each trajectory's update weight becomes reward minus baseline:

| Attempt | Final tests | Reward R(τ) | Weight = reward − baseline |
| --- | --- | --- | --- |
| 1 | All four pass | 1 | 1 − 0.25 = +0.75 |
| 2 | At least one fails | 0 | 0 − 0.25 = −0.25 |
| 3 | At least one fails | 0 | 0 − 0.25 = −0.25 |
| 4 | At least one fails | 0 | 0 − 0.25 = −0.25 |

Failed attempts now contribute: their actions get a negative weight, so the policy moves away from them. Subtracting a baseline does not change the expected gradient (a standard policy-gradient result) but sharply reduces its variance. This "group comparison" is the core idea of GRPO; the full version also divides by the group's reward standard deviation.

**Why whole-trajectory weights are still coarse.** The slide shows two illustrative trajectories of six turns (a0 to a5). Trajectory A succeeds (R = 1) but contains a mistaken turn a1. Trajectory B fails (R = 0) but contains a helpful turn a3. The group weight is the same for every turn in a trajectory, so A's mistake gets reinforced and B's helpful turn gets punished. Turn-level rewards would tell us which turns to reinforce within each trajectory.

**Reward-to-go.** With only a final reward, trajectory A receives r1 = … = r5 = 0 and r6 = 1. The reward-to-go R\_t is the sum of rewards received after history h\_t. Starting just before a3, the remaining rewards are 0 + 0 + 1 = 1, so R3 = 1. The notation: r\_{t+1} is the reward right after action a\_t.

The problem: on A, R\_t = 1 at every step; on B, R\_t = 0 at every step. With a single terminal reward, reward-to-go is constant along a trajectory and gives no extra resolution. We need an estimate of how good a history is *in expectation*.

**Expected reward-to-go (the value).** Imagine restarting from B's history h3 ten times with the same rollout policy μ. Suppose three continuations succeed (R3 = 1) and seven fail. The average, 3 ÷ 10 = 0.3, estimates the value of h3:

$$
V^{\mu}(h_3) = \mathbb{E}_{\mu}\left[ R_3 \mid h_3 \right]
$$

V^μ(h) is the expected reward-to-go from history h when actions are drawn from policy μ; the bar means "given h3". Ten samples give a Monte Carlo estimate of this average. Rolling out many continuations at every step is too expensive in practice, which motivates learning V.

**Learning the value function (a critic).** Train a critic Vφ(h), with its own parameters φ, to predict reward-to-go using squared error. Reusing the ten outcomes at h3 (three 1s, seven 0s): if Vφ(h3) = 0.6, the average squared error is \[3(0.6 − 1)² + 7(0.6 − 0)²\] / 10 = 0.30. The best constant prediction is the mean, 0.3, whose squared error is 0.21. In general:

$$
L_V(\phi) = \mathbb{E}_t\left[ \left( V_\phi(h_t) - R_t \right)^2 \right]
$$

E\_t averages over histories h\_t drawn from sampled rollouts, and R\_t is the observed reward-to-go. Minimising squared error makes Vφ approximate the conditional mean, which is exactly the value. The slide attributes this squared-error baseline training to Ranzato et al. (MIXER, ICLR 2016, §3.2.1).

**Two ways to model the critic.**

| Design | How it works | What the value loss trains | Example |
| --- | --- | --- | --- |
| Separate value network | Its own body and output layer read h\_t | The whole value network | InstructGPT (Ouyang et al., 2022, App. C.4) |
| Value head on policy body | A linear head reads the policy's hidden states through a stop-gradient | Only the head | MIXER (Ranzato et al., 2016) |

The stop-gradient keeps the value loss from updating the policy body; the policy loss still trains it. A separate network doubles the memory cost for large models, which is one reason critic-free methods became popular for LLMs.

**One-step change in value: the TD error.** Along B's final three actions (all rewards zero), the critic predicts Vφ(h3) = 0.3, Vφ(h4) = 0.6, Vφ(h5) = 0.4 and Vφ(h6) = 0 (B ends after a5, so no future reward remains). Each action's effect is the reward plus the change in predicted value:

$$
\delta_t = r_{t+1} + V_\phi(h_{t+1}) - V_\phi(h_t)
$$

δ\_t is the temporal-difference (TD) error at step t, written without a discount factor (γ = 1). For B: δ3 = 0 + 0.6 − 0.3 = +0.3 (a3 made success more likely: the "helpful" turn); δ4 = 0 + 0.4 − 0.6 = −0.2; δ5 = 0 + 0.0 − 0.4 = −0.4. Even inside a failed trajectory, a3 now gets positive credit.

**Generalized advantage estimation (GAE).** A single TD error trusts the critic completely; the full reward-to-go ignores it. GAE (Schulman et al., ICLR 2016) blends them by adding later TD errors with geometrically decaying weight λ. With λ = 0.5, the advantage for B's a3 is:

$$
\hat{A}_3 = 0.3 + 0.5(-0.2) + 0.25(-0.4) = 0.1
$$

In general GAE is computed backward from the end of the trajectory:

$$
\hat{A}_t = \delta_t + \gamma \lambda \hat{A}_{t+1}, \qquad \hat{A}_{T} = 0
$$

Â\_t is the estimated advantage (how much better a\_t was than expected), γ is the reward discount (1 in the lecture's examples), λ in \[0, 1\] sets the weight on later errors, and T is the number of actions. λ = 0 gives the one-step TD error (low variance, biased by critic errors); λ = 1 gives reward-to-go minus Vφ(h\_t) (unbiased, high variance).

**A surrogate: process reward models (PRMs).** Instead of learning value from outcomes, you can learn step correctness from human labels. The slide reproduces Figure 1 of "Let's Verify Step by Step" (Lightman et al., 2023). The problem: a fraction's denominator is 7 less than 3 times its numerator, and the fraction equals 2/5; find the numerator (answer 14). The solution steps are: let the numerator be x; the denominator is 3x − 7; x/(3x − 7) = 2/5; so 5x = 2(3x − 7); 5x = 6x − 14; so x = 7. Each step has three buttons (negative, neutral, positive). Annotators mark every step positive except the last: 5x = 6x − 14 implies x = 14, so "x = 7" is marked incorrect. A PRM trained on such labels scores each step, acting as a surrogate for value.

**Why it matters:** these methods trade bias for variance. Group baselines are cheap and unbiased but give one weight per trajectory; critics and PRMs give per-step signals but can be wrong, and a wrong dense signal can be exploited.

### 3. Synchronous and asynchronous RL

Agent rollouts vary wildly in length, so waiting for the slowest one wastes GPUs; asynchronous RL removes the wait at the price of stale data.

**Waiting in synchronous RL.** In synchronous RL, every trajectory in a batch must finish before the policy update starts. The slide's timeline (after AReaL, Fu et al., §3.2) shows three GPUs generating trajectories of different lengths. GPU 1 finishes early and sits idle ("Wait") until GPUs 2 and 3 finish; then all update together, and only then does the next batch start. For agents this is severe: one trajectory might take two tool calls, another fifty, and a test suite run can take minutes.

**Overlapping rollouts and updates.** Asynchronous RL splits the hardware. Rollout GPUs keep generating continuously; a learner GPU performs Update 1, Update 2 and so on using whichever trajectories have completed (AReaL, §4.1). The AReaL paper reports up to 2.77× training speedup over synchronous systems at matched or better accuracy. The catch, stated on the slide: some completed trajectories now come from an earlier policy version. That is the problem the next section solves.

### 4. Stable policy updates: importance sampling and staleness

Once the data comes from a different policy than the one being trained, the gradient estimate is biased unless you reweight it.

**Two policies.** The *rollout* (or behaviour) policy μ sampled the recorded actions. The *learner* policy πθ is the one being updated now. The slide shows three candidate edits at one history, with probabilities under each:

| Candidate edit | Rollout policy μ | Learner policy πθ |
| --- | --- | --- |
| Check `None` explicitly (correct) | 0.40 | 0.70 |
| Use `get(..., 3)` (incomplete) | 0.40 | 0.20 |
| Keep the original code | 0.20 | 0.10 |

A rollout that finishes after the learner has updated is *stale*: its actions came from μ while the learner uses πθ. (Note `config.get("retries", 3)` is incomplete because an explicit `None` would still pass through as `None` rather than 3.)

**Importance sampling.** At a fixed history h, an expectation under πθ can be computed from samples of μ by reweighting each sample:

$$
\mathbb{E}_{a \sim \pi_\theta}\left[ R(a) \right] = \mathbb{E}_{a \sim \mu}\left[ \frac{\pi_\theta(a \mid h)}{\mu(a \mid h)} R(a) \right]
$$

R(a) is the final reward after taking action a, πθ(a | h) and μ(a | h) are the two policies' probabilities of a at h, and their ratio is the importance weight. In the example, the correct edit gets weight 0.70 / 0.40 = 1.75 (the learner now likes it more, so it counts more); the incomplete edit gets 0.20 / 0.40 = 0.50. The identity requires μ(a | h) > 0 wherever πθ(a | h) > 0.

**Long trajectories make the weight explode.** For a whole trajectory, the environment's dynamics cancel in the ratio (they are the same under both policies), leaving a product of per-action ratios:

$$
w(\tau \mid x) = \frac{p_\theta(\tau \mid x)}{p_\mu(\tau \mid x)} = \prod_{t} \frac{\pi_\theta(a_t \mid h_t)}{\mu(a_t \mid h_t)}
$$

pθ(τ | x) and pμ(τ | x) are the trajectory probabilities under each policy, and the product runs over all actions. A tiny per-action mismatch compounds: a ratio of 1.05 per action gives 1.05¹⁰⁰ ≈ 132 over 100 actions. The result is high variance, where a few samples dominate the update (CTPO, Zhang et al., 2026, §3.2).

**Evidence: mismatch grows along a response.** CTPO defines the cumulative ratio ρ\_t^cum as the product of action ratios through token t. Its Figure 1 plots std(log ρ\_t^cum) on the y-axis (0 to about 3) against token position t on the x-axis (0 to 5,000) at training step 100, for tool-using math rollouts. The empirical points follow a fitted curve σ̂√t with σ̂ = 0.0387, reaching about 2.7 at t = 5,000. So Var(log ρ\_t^cum) ≈ tσ²: the log-ratio behaves like a random walk, and its spread grows with the square root of position. Late tokens in long agent responses carry the most unreliable weights.

**Earlier actions change later histories.** Per-token ratios alone miss something. Suppose an earlier edit "add a None check" had probability 40% under μ but only 10% under πθ. The recorded history now contains that check, and the next action "run tests" has 50% under both policies. The next-action ratio is 1, yet the current policy would reach this history only 0.10 / 0.40 = 0.25 as often (CTPO, §3.1). Ignoring the prefix ratio treats a history the learner rarely visits as if it were typical.

**Which actions enter the weight?** For a response with T actions, let ρ\_t be the ratio for action t. Methods differ in which ratios they multiply (CTPO, Table 1):

| Method | Ratio used for the weight at action t | Trade-off |
| --- | --- | --- |
| PPO / GRPO | Current action only, ρ\_t | Low variance; ignores prefix mismatch (biased) |
| CTPO | Actions a0 through a\_t (cumulative, ρ\_t^cum) | Accounts for how the history was reached; needs control of growth |
| Full ratio | All actions a0 to a\_{T−1} | Unbiased for the sequence; highest variance |
| GSPO | All actions, length-normalised (geometric mean) | One ratio per response; stable for long outputs |

DAPO (Yu et al., 2025) and CISPO (MiniMax-M1, 2025) also use the current-action ratio; they differ in their clipping rules. CTPO pairs the cumulative ratio with position-adaptive clipping, and reports gains over GRPO and GSPO on math reasoning benchmarks.

**Common pitfall:** even "on-policy" training is slightly off-policy in practice. Inference engines (such as vLLM) and training frameworks compute log-probabilities with different kernels and precision, so μ and πθ differ even at the same weights. Ratios must be computed with the rollout's recorded log-probabilities, not recomputed ones, to see this mismatch.

### 5. Clipping policy updates, KL anchors and entropy

Clipping caps how much any single sample can move the policy, which keeps stale or lucky samples from dominating an update.

**Why limit an update?** The slide shows a training-dashboard plot (image credit: Aditya Soni) of the maximum importance weight per PPO actor update (y-axis, 0 to about 1,300) over roughly 75 training steps (x-axis). Two runs are compared: max off-policyness = 1 (orange) stays near zero with small bumps below about 70, while max off-policyness = 3 (green, rollouts up to three policy versions stale) spikes to about 1,350 near step 17 and repeatedly to 200 to 400 later. A single sample with weight 1,000 effectively *is* the gradient for that step.

**Clipping a probability ratio.** Here each action is a generated token u\_t with earlier context u\_{\<t}. The per-token ratio and its clipped value are:

$$
\rho_t = \frac{\pi_\theta(u_t \mid u_{<t})}{\mu(u_t \mid u_{<t})}, \qquad c_t = \mathrm{clip}(\rho_t, \ell, u)
$$

ρ\_t is the one-token policy ratio, ℓ the lower bound and u the upper bound (the bound u is unrelated to the token u\_t). The clip function returns ℓ if ρ\_t < ℓ, u if ρ\_t > u, and ρ\_t otherwise. The slide's plot shows c\_t flat at 0.8 below ℓ = 0.8, rising linearly between 0.8 and 1.2, and flat at 1.2 above u = 1.2.

**PPO and CISPO objectives.** Both use the same c\_t but in different places:

$$
J_{\mathrm{PPO}}(\theta) = \mathbb{E}_t\left[ \min\left( \rho_t \hat{A}_t,\; c_t \hat{A}_t \right) \right]
$$

$$
J_{\mathrm{CISPO}}(\theta) = \mathbb{E}_t\left[ \mathrm{sg}(c_t)\, \hat{A}_t \log \pi_\theta(u_t \mid u_{<t}) \right]
$$

E\_t averages over sampled tokens; Â\_t estimates whether the token helped; sg (stop-gradient) holds c\_t fixed so no gradient flows through it. Both are maximised; the loss to minimise is −J. In PPO the standard bounds are ℓ = 1 − ε and u = 1 + ε.

**What PPO's minimum does.** The slide adapts Figure 1 of Schulman et al. (2017) with ε = 0.2. For a positive advantage (A = +1), the objective rises with the ratio until 1.2, then goes flat: no extra gain for pushing a helpful token's probability further in one update. For a negative advantage (A = −1), the objective rises as the ratio falls until 0.8, then goes flat: no extra gain for suppressing an unhelpful token further. In the flat region the gradient for that token is exactly zero, so the token is effectively dropped from the update. The minimum is pessimistic: when the ratio moves in the "harmful" direction, the unclipped term is kept and the full penalty applies.

**CISPO's difference.** CISPO (from the MiniMax-M1 report, 2025) uses the clipped ratio as a fixed weight on an ordinary REINFORCE-style log-probability gradient. Because the weight is detached rather than zeroed, every token still contributes a gradient. The MiniMax-M1 authors motivated this with rare "fork" tokens (for example reflective words like "However" or "Wait") that get clipped away in PPO but matter for long reasoning.

**Reference-model KL penalty.** A KL penalty discourages the policy from drifting far from a fixed reference model:

$$
\max_\theta \; J_{\mathrm{policy}} - \beta\, D_{\mathrm{KL}}\left( \pi_\theta \,\|\, \pi_{\mathrm{ref}} \right)
$$

J\_policy is the policy objective (PPO, CISPO and so on), D\_KL measures how different two distributions are, π\_ref is the fixed reference (usually the starting SFT model), and β sets the penalty strength. The slide separates two roles that are easy to confuse. The rollout policy μ generates the batch and supplies the denominator in importance ratios. The reference π\_ref stays fixed as an anchor. This form appears in the GRPO objective of DeepSeekMath (Shao et al., 2024).

**Entropy bonus for exploration.** An entropy bonus rewards a broader next-token distribution:

$$
\max_\theta \; J_{\mathrm{policy}} + \alpha\, H(\pi_\theta)
$$

H(πθ) is the entropy of the policy's next-token distribution (its uncertainty), and α sets the bonus strength. The PPO paper (§5) included this term. A broader distribution can help the agent try other actions, but it does not guarantee those actions are useful; too much entropy on a 100k-token vocabulary produces gibberish.

**GRPO's advantage.** The table below refers to "group comparison". For G responses to the same prompt with rewards R\_1, …, R\_G, GRPO gives every token of response i the same advantage:

$$
\hat{A}_{i} = \frac{R_i - \mathrm{mean}(R_1, \dots, R_G)}{\mathrm{std}(R_1, \dots, R_G)}
$$

No critic is needed: the group itself is the baseline. GSPO instead uses one sequence-level ratio per response, (pθ(y\_i | x) / pμ(y\_i | x))^{1/|y\_i|}, where |y\_i| is the response length, and applies PPO's clipped minimum to it.

**A summary of popular algorithms.** The lecture's comparison table (slide 35):

| Algorithm | Weight from reward | Learned critic? | Importance ratio | Clipping |
| --- | --- | --- | --- | --- |
| REINFORCE | Reward-to-go R\_t | No | None: fresh rollouts | None |
| PPO | GAE from a critic | Yes | Current token ρ\_t | Minimum of raw and clipped terms |
| GRPO | Group comparison | No | Current token ρ\_t | Same as PPO |
| CISPO | Group comparison | No | Current token ρ\_t | Clipped ratio as a fixed weight |
| GSPO | Group comparison | No | Whole response, length-normalised | PPO minimum, on the response ratio |
| DAPO | Group comparison | No | Current token ρ\_t | PPO minimum; higher upper bound |

Group comparison means: subtract the group's mean reward, then divide by its reward spread. DAPO's higher upper bound ("clip-higher", decoupling ℓ and u) lets low-probability tokens grow more, which counters entropy collapse. Citations: PPO (Schulman et al., 2017), GRPO (Shao et al., 2024), CISPO (MiniMax-M1, 2025), GSPO (Zheng et al., 2025), DAPO (Yu et al., 2025).

### 6. Task selection and reward reliability

The algorithm can only learn from what the reward tells it, so tasks must be of the right difficulty and verifiers must check the behaviour you actually want.

**Uninformative rollout groups.** Sample four trajectories per task and subtract the group mean:

| Group | Rewards | Mean | After subtracting the mean |
| --- | --- | --- | --- |
| All attempts failed | 0, 0, 0, 0 | 0 | 0, 0, 0, 0 |
| Mixed outcomes | 0, 1, 0, 1 | 0.5 | −0.5, +0.5, −0.5, +0.5 |
| All attempts passed | 1, 1, 1, 1 | 1 | 0, 0, 0, 0 |

Equal rewards all become zero advantage, so both too-hard and too-easy tasks contribute nothing but compute. An all-zero group gives no outcome comparison, which raises the question: why did every trajectory fail?

**Diagnosing an all-fail group.** Inspect what happened before choosing a remedy:

| Cause | What it means | What to check |
| --- | --- | --- |
| Verifier quality | A valid solution might be rejected | The requirements and the failed tests |
| Current capability | The model may not yet be able to solve the task | Whether stronger-model demonstrations succeed |
| Lack of exploration | All attempts may repeat the same approach | Whether the trajectories differ |

**False negatives in the verifier.** Back to the bug-fix task: a candidate produces every required output (missing to 3, `None` to 3, 0 to 0, 2 to 2). But the verifier rule requires the exact phrase `value is None` in the source, and the candidate implements the check differently, so it is rejected. A false negative rejects a valid solution. The fix is to check behaviour, not an incidental wording choice. The slide links this to the human review behind SWE-bench Verified (OpenAI, 2024).

**Consequences of false negatives.**

- *Reward noise:* equivalent solutions receive different rewards because of wording or implementation details, so the model fits spurious features of the output.
- *Benchmark saturation:* scores flatten below 100% when the evaluator rejects valid solutions.

| Benchmark (historical version) | Plateau or limit | Evidence from the audit |
| --- | --- | --- |
| SWE-bench Verified | about 81% | Progress slowed near 80.9%; many remaining failures had flawed tests |
| τ-bench Airline | about 70% | Inconsistent tasks limited achievable scores |
| τ-bench Retail | about 92% | Annotation errors limited achievable scores |

Sources on the slide: the SWE-bench audit (OpenAI, Feb. 2026), SABER (Cuadron et al., 2025, §5.1) and the τ-bench task fixes (Feb. 2026). τ-bench has since corrected the tasks. For context, OpenAI's audit reported that 59.4% of the audited problems had flawed tests, including 35.5% with overly strict tests that reject functionally correct solutions.

**False positives and reward hacking.** Keep the same requirements, but suppose training only tests the input `retries=0`. The candidate `def retry_count(config): return 0` passes the one tested case and earns reward 1, yet it outputs 0 for missing, `None` and 2, failing three of four real requirements. A false positive rewards an invalid solution, and training can learn to exploit this gap.

**Reward hacking in coding agents.** A passing score can come from a shortcut the benchmark was meant to exclude:

| Available in the environment | Shortcut |
| --- | --- |
| Internet access | Find the published solution online |
| Git history, including future commits | Find and copy the later bug fix |
| A model API key | Call a stronger model for answers or training data |
| Access to tests or the test runner | Make the tests pass without fixing the bug |

The web, Git and test exploits are documented in the MAI-Thinking-1 report (Microsoft AI, §3.3.1, p.43). The API example is from PostTrainBench (Rank et al., 2026, §5.4, Fig. 7): an agent used a grading key to generate training data despite an explicit restriction.

**Independent checks of progress.** The constant-zero patch earned training reward 1 but passed only one of four required cases. Track three things, not one:

1. **Training reward:** success on the training verifier.
2. **Independent success:** unseen tasks and behaviour the training verifier missed.
3. **Costs and failures:** tool calls, regressions and repeated actions in the trajectories.

If reward rises without independent improvement, inspect trajectories for shortcuts.

**DAPO dynamic sampling.** Because identical rewards give zero group advantages, DAPO (Yu et al., 2025, §3.2) filters them out and keeps sampling until the batch is full. In the slide, Task A (0,0,0,0) and Task C (1,1,1,1) are skipped; Task B (0,1,0,1) and a new Task D (0,0,1,0) are kept, filling a two-group target batch before the update. Every trajectory in a kept group, including its failures, is used.

**Partial and auxiliary rewards.** Partial credit is an auxiliary reward: feedback for progress before full success. Illustrative task: pass all 4 checks, with 0.25 reward per check passed.

|  | τ₁ | τ₂ | τ₃ | τ₄ |
| --- | --- | --- | --- | --- |
| Checks passed | 0/4 | 1/4 | 2/4 | 1/4 |
| Success reward | 0 | 0 | 0 | 0 |
| Minus mean (0) | 0 | 0 | 0 | 0 |
| Success + partial | 0 | 0.25 | 0.50 | 0.25 |
| Minus mean (0.25) | −0.25 | 0 | +0.25 | 0 |

Different partial scores turn a dead group into a useful comparison.

**Risks of auxiliary rewards.** The model may increase the added reward without improving the task. Two OpenAI cases:

- *Calculator hacking* (OpenAI, Dec. 2025): a training bug gave credit for superficial web-tool calls. GPT-5.1 learned to use the browser as a calculator while acting as though it had searched.
- *Where the goblins came from* (OpenAI, Apr. 2026): a reward for a playful "Nerdy" persona scored metaphors with "goblin" or "gremlin" higher. Creature metaphors became more common, including without the persona prompt.

**Exploration collapse.** At one history, an earlier policy puts 0.20 on action A, 0.60 on B and 0.20 on C. After training it puts 0.01, 0.98 and 0.01. Almost every sample now picks B, so alternatives are rarely tried and groups become identical. An entropy bonus encourages alternatives; also check whether trajectories actually differ. DAPO discusses this as entropy collapse.

### 7. Learning from a teacher

When the student rarely succeeds, a teacher can supply the signal that sparse rewards cannot.

**Curricula and warm starts.** The pipeline has three stages:

1. **Demonstrations (warm start):** first learn from successful solutions.
2. **Learnable tasks:** practise tasks where the model sometimes succeeds.
3. **Harder tasks (curriculum):** increase difficulty as the model improves.

Keep earlier tasks in the mix to avoid forgetting, and use a fixed evaluation set to measure improvement.

**Distillation.** Train a student to match a teacher's action probabilities on a fixed set of saved teacher trajectories (Hinton et al., 2015, §2; Agarwal et al., 2024, §3). At saved history h3 the teacher puts 80% on a3 and 20% on another action; call this q(· | h3). The weakness: when the student acts, its own mistakes lead to histories that never appear in the teacher's data, so it never learns to recover (the exposure-bias problem).

**On-policy distillation.** Let the student generate the histories, then ask the teacher for targets at those histories (Agarwal et al., ICLR 2024, GKD). "On-policy" means the histories come from the student's own rollouts. At h3 on the student's trajectory B, suppose the student assigns 0.5 and 0.5 while the teacher assigns 0.8 and 0.2. The reverse KL (natural logs) is 0.5 log(0.5/0.8) + 0.5 log(0.5/0.2) ≈ 0.223. The objective averages this over student histories:

$$
L_{\mathrm{OPD}} = \mathbb{E}_{h \sim d_\mu}\left[ D_{\mathrm{KL}}\left( \pi_\theta(\cdot \mid h) \,\|\, q(\cdot \mid h) \right) \right]
$$

d\_μ is the distribution of histories collected by the student's rollout policy, πθ(· | h) the student's next-action distribution, q(· | h) the teacher's, and D\_KL(πθ ‖ q) = Σ\_a πθ(a | h) log(πθ(a | h) / q(a | h)) the reverse KL. This gives a dense signal at every token, unlike a single final reward. Reverse KL is mode-seeking: the student is penalised for putting mass where the teacher puts little.

**On-policy self-distillation (OPSD).** The Self-Distilled Reasoner (Zhao et al., 2026) removes the need for a larger teacher. The student sees the task and history h3. The teacher is a frozen copy of the starting model that sees the same task and history *plus a verified solution*. Its next-action probabilities train the student exactly as above. The privileged context makes the same model a better teacher.

### 8. Takeaways

The lecture ends with three rules:

- **Useful feedback:** use group comparisons, a critic or process rewards to assign credit.
- **Stable updates:** know the behaviour policy, and control how strongly samples change the model.
- **Reliable rewards:** match task difficulty, and verify the behaviour you actually want.

The next class covers RL systems.

## Going deeper

The algorithms in this lecture are the latest steps in a 35-year lineage, and most "new" LLM-RL tricks are old RL ideas re-tuned for very long, discrete, sparse-reward sequences.

### Lineage: from REINFORCE to GRPO and its descendants

- **REINFORCE (Williams, 1992)** introduced the likelihood-ratio policy gradient and already noted that subtracting a baseline keeps the gradient unbiased.
- **Actor-critic methods** (Sutton and Barto's textbook, chapter 13) learn the baseline as a value function. TD learning (Sutton, 1988) supplies the δ\_t used in GAE.
- **TRPO (Schulman et al., 2015)** constrained each update to a KL "trust region" around the old policy, solved with conjugate gradients. PPO (2017) replaced the hard constraint with the cheap clipped surrogate, which is why it became the default.
- **RLHF (Christiano et al., 2017; Stiennon et al., 2020; Ouyang et al., 2022)** brought PPO to language models with a learned reward model, a value network and a KL penalty to the SFT model. That setup needs four large models in memory: policy, reference, reward model and critic.
- **Critic-free methods.** RLOO (Ahmadian et al., 2024) showed that REINFORCE with a leave-one-out group baseline matches or beats PPO for RLHF. GRPO (Shao et al., 2024, DeepSeekMath) kept PPO's clipping but replaced the critic with group-normalised rewards. DeepSeek-R1 (2025) made GRPO plus verifiable rewards famous.
- **2025 refinements.** DAPO added clip-higher, dynamic sampling, token-level loss averaging and overlong-response shaping. Dr. GRPO (Liu et al., 2025) showed that GRPO's per-response length normalisation and std normalisation introduce biases, including a tendency to lengthen wrong answers. GSPO moved the ratio and clipping to the sequence level, which the Qwen team found helpful for mixture-of-experts stability. CISPO kept gradients for clipped tokens.

### Why critics fell out of favour for LLMs (and may return)

A per-token critic for a 100k-token-vocabulary model is as large as the policy and hard to train: early in training its predictions are poor, and GAE then injects bias. With a single terminal reward and cheap parallel sampling, a group baseline is simpler and almost as good. For long multi-turn agents, though, a group baseline gives the same weight to every one of hundreds of turns. That is the lecture's motivation for turn-level credit, and it keeps value models, PRMs and step-level Monte Carlo estimates (as in Math-Shepherd, Wang et al., 2023, which labels steps by rolling out continuations) an active research area.

### Off-policy correction has a long history

The staleness problem is not new. IMPALA (Espeholt et al., 2018) ran many actors asynchronously and introduced V-trace, which truncates importance weights to trade a little bias for bounded variance. Retrace (Munos et al., 2016) similarly uses truncated per-step traces. Truncated importance sampling in modern LLM trainers, and the per-position clipping in CTPO, are descendants of these ideas. The same logic explains why the lecture's cumulative ratio grows like √t: summing t roughly independent log-ratio noises gives a random walk.

### KL penalties in practice

The KL term can be applied in two places: added to the reward (the InstructGPT style) or added to the loss (the GRPO style). It is usually estimated from samples rather than computed exactly over the vocabulary. John Schulman's note "Approximating KL Divergence" (2020) describes the common low-variance estimators, which GRPO adopts. Several 2025 recipes for verifiable-reward reasoning (for example DAPO) drop the KL term entirely, arguing that the policy should move far from the SFT model. Whether to keep it is an empirical choice that depends on how much you fear reward hacking and capability drift.

### Reward hacking is Goodhart's law

"When a measure becomes a target, it ceases to be a good measure." Any verifier is a proxy, and RL is an optimiser that will find its gaps. Lilian Weng's survey (2024) catalogues cases from robotics to LLMs editing unit tests. Practical defences follow the lecture's advice: hide or sandbox tests, remove network access and future git history, restrict API keys, hold out evaluation suites with different verifiers, and read trajectories. OpenAI's work on monitoring chain-of-thought (Baker et al., 2025) adds a warning: penalising visible "bad thoughts" can teach models to hide intent rather than stop hacking.

### Practical engineering advice

- **Log more than reward.** Track policy entropy, clip fraction, KL to reference, max and mean importance weight, response length, fraction of zero-advantage groups, and pass@1 versus pass@k on a fixed evaluation set.
- **Watch for entropy collapse early.** A rapidly falling entropy with a rising pass@1 but flat pass@k usually means the model is sharpening, not learning new strategies.
- **Use recorded rollout log-probabilities** for μ, and cap staleness (for example, at most one or two policy versions) in async systems.
- **Curate tasks by difficulty.** Estimate each task's pass rate with a few samples and keep those in an intermediate band; recompute as the model improves.
- **Test the verifier before training.** Run known-good and known-bad solutions (including trivial ones like `return 0`) through it to measure false negatives and false positives.
- **Start small.** PPO has many implementation details that matter; "The 37 Implementation Details of PPO" (Huang et al., 2022) is the standard checklist.

### Open problems

- **Does RL teach new skills or only sharpen existing ones?** Yue et al. (2025) found that RL with verifiable rewards raises pass@1 but can lower pass@k at large k compared with the base model. Distillation from stronger teachers can expand what the model can do, which is one reason on-policy distillation is attractive.
- **Long-horizon credit.** Agents act over hundreds of turns with tool latency; the right unit of credit (token, turn, subgoal) is unsettled.
- **Scalable reliable rewards.** Benchmarks audited in 2025–26 had large fractions of flawed tests, so building trustworthy verifiers for open-ended tasks remains a bottleneck.
- **Off-policy at scale.** Async training trades freshness for throughput; how much staleness each algorithm tolerates is still being mapped.

## Worked example

This self-contained script (standard library only, no LLM calls) reproduces the lecture's numbers on the `retry_count` task: a behavioural verifier, group advantages, partial credit, TD errors with GAE, PPO versus CISPO per-token behaviour, and the reverse KL used in on-policy distillation. Four "attempts" are hand-written functions standing in for agent patches.

```python
import math
import statistics

# 1) Group advantages (GRPO-style) for four attempts at the bug-fix task.
def group_advantages(rewards, normalize_std=True, eps=1e-6):
    mean = sum(rewards) / len(rewards)
    centered = [r - mean for r in rewards]
    if not normalize_std:
        return centered
    std = statistics.pstdev(rewards)
    return [c / (std + eps) for c in centered]

# 2) The four checks the verifier should run (behaviour, not wording).
def verify(fn):
    cases = [({}, 3), ({"retries": None}, 3), ({"retries": 0}, 0), ({"retries": 2}, 2)]
    passed = sum(fn(cfg) == want for cfg, want in cases)
    return passed, float(passed == len(cases))

def buggy(c):   return c.get("retries") or 3
def fixed(c):   return 3 if c.get("retries") is None else c["retries"]
def hack(c):    return 0                      # passes only the retries=0 case
def partial(c): return c.get("retries", 3)    # None -> None, so 3 of 4

# 3) TD errors and GAE, computed backward (gamma = 1 as in the lecture).
def gae(rewards, values, lam=0.5, gamma=1.0):
    # values has one more entry than rewards: V(h_T) for the terminal history.
    deltas = [rewards[t] + gamma * values[t + 1] - values[t] for t in range(len(rewards))]
    adv, running = [0.0] * len(rewards), 0.0
    for t in reversed(range(len(rewards))):
        running = deltas[t] + gamma * lam * running
        adv[t] = running
    return deltas, adv

# 4) Per-token PPO and CISPO terms for one token with ratio rho and advantage A.
def clip(x, lo, hi):
    return max(lo, min(hi, x))

def ppo_term(rho, A, eps=0.2):
    return min(rho * A, clip(rho, 1 - eps, 1 + eps) * A)

def ppo_grad_wrt_rho(rho, A, eps=0.2):
    # Derivative of the PPO term w.r.t. rho: A if the unclipped branch is active, else 0.
    unclipped, clipped = rho * A, clip(rho, 1 - eps, 1 + eps) * A
    return A if unclipped <= clipped else 0.0

def cispo_weight(rho, A, lo=0.8, hi=1.2):
    # CISPO multiplies grad log pi by sg(c_t) * A: never zero unless A is zero.
    return clip(rho, lo, hi) * A

if __name__ == "__main__":
    attempts = {"buggy": buggy, "fixed": fixed, "hack": hack, "partial": partial}
    rewards, partials = [], []
    for name, fn in attempts.items():
        n, r = verify(fn)
        rewards.append(r); partials.append(r + 0.25 * n * (r == 0))
        print(f"{name:8s} checks={n}/4 reward={r}")
    print("group adv (mean only):", [round(a, 2) for a in group_advantages(rewards, False)])
    print("group adv (GRPO):     ", [round(a, 2) for a in group_advantages(rewards)])
    print("with partial credit:  ", [round(a, 2) for a in group_advantages(partials, False)])

    # Trajectory B's last three actions from the lecture: V = 0.3, 0.6, 0.4, then 0.
    deltas, adv = gae([0, 0, 0], [0.3, 0.6, 0.4, 0.0], lam=0.5)
    print("TD errors:", [round(d, 2) for d in deltas], "GAE:", [round(a, 3) for a in adv])

    for rho in (0.5, 0.9, 1.1, 1.75):
        for A in (+1, -1):
            print(f"rho={rho:4} A={A:+d}  PPO={ppo_term(rho, A):+.2f} "
                  f"dPPO/drho={ppo_grad_wrt_rho(rho, A):+.0f}  CISPO weight={cispo_weight(rho, A):+.2f}")

    # Reverse KL from the on-policy distillation slide (natural logs).
    student, teacher = [0.5, 0.5], [0.8, 0.2]
    print("reverse KL:", round(sum(p * math.log(p / q) for p, q in zip(student, teacher)), 3))
```

Output (abridged):

```text
buggy    checks=3/4 reward=0.0
fixed    checks=4/4 reward=1.0
hack     checks=1/4 reward=0.0
partial  checks=3/4 reward=0.0
group adv (mean only): [-0.25, 0.75, -0.25, -0.25]
group adv (GRPO):      [-0.58, 1.73, -0.58, -0.58]
with partial credit:   [0.06, 0.31, -0.44, 0.06]
TD errors: [0.3, -0.2, -0.4] GAE: [0.1, -0.4, -0.4]
rho=1.75 A=+1  PPO=+1.20 dPPO/drho=+0  CISPO weight=+1.20
rho=1.75 A=-1  PPO=-1.75 dPPO/drho=-1  CISPO weight=-1.20
reverse KL: 0.223
```

**What to notice:**

- The mean-only advantages reproduce slide 8 exactly (+0.75, −0.25 × 3); GRPO's std normalisation rescales them (to +1.73 and −0.58) without changing their signs.
- `c.get("retries", 3)` looks like a fix but fails the `None` case, the same "incomplete edit" as the importance-sampling slide. Only a behavioural verifier catches it.
- Partial credit ranks the buggy code (3/4 checks) almost level with the real fix and above the hack. That is the auxiliary-reward risk: the ordering rewards progress, but not necessarily the right progress.
- GAE for a3 is 0.1, matching slide 16, even though trajectory B failed overall.
- For a stale token with ρ = 1.75 and a positive advantage, PPO's gradient is zero (the token is dropped), while CISPO still pushes it with weight 1.2. With a negative advantage PPO keeps the full, unclipped penalty (−1.75): its minimum is deliberately pessimistic.

## Key terms

These terms recur across the RL lectures and the papers cited here.

| Term | Meaning |
| --- | --- |
| Advantage (Â\_t) | Estimate of how much better an action was than expected from its history; the weight on its log-probability in the update. |
| Asynchronous RL | Rollout workers generate continuously while a learner updates from completed trajectories, so some rollouts are stale (from older policies). |
| Auxiliary (partial) reward | Extra reward for progress short of full success, such as 0.25 per passed check; reduces zero-advantage groups but can be gamed. |
| CISPO | Clipped importance-sampling policy optimisation (MiniMax-M1): uses the clipped ratio as a fixed, stop-gradient weight so every token keeps a gradient. |
| Clipping | Replacing a ratio outside \[ℓ, u\] with the nearest bound to cap how far one sample can move the policy. |
| Critic (value function Vφ) | A learned predictor of expected reward-to-go from a history, trained with squared error. |
| DAPO | GRPO variant with a higher upper clip bound and dynamic sampling, which drops all-equal reward groups and resamples (Yu et al., 2025). |
| Entropy collapse | The policy concentrates almost all probability on one action, so exploration stops and groups become identical. |
| False negative / false positive | A verifier rejecting a valid solution / accepting an invalid one. |
| GAE | Generalized advantage estimation: a λ-weighted sum of future TD errors, trading bias against variance (Schulman et al., 2016). |
| GRPO | Group relative policy optimisation: PPO-style clipping with advantages from group-normalised rewards and no critic (Shao et al., 2024). |
| GSPO | Group sequence policy optimisation: one length-normalised importance ratio per response, clipped PPO-style. |
| Importance sampling | Reweighting samples from a rollout policy μ by πθ/μ to estimate expectations under the current policy πθ. |
| On-policy distillation | The student generates histories and is trained to match a teacher's next-token distribution there, usually with reverse KL. |
| PPO | Proximal policy optimisation: maximises the minimum of the raw and clipped ratio-weighted advantage (Schulman et al., 2017). |
| Process reward model (PRM) | A model trained on step-level correctness labels that scores each intermediate step. |
| Reference-model KL | Penalty β·D\_KL(πθ ‖ π\_ref) keeping the policy near a fixed anchor model. |
| Reward hacking | Earning high reward through a shortcut the reward designer meant to exclude. |
| Reward-to-go (R\_t) | Sum of rewards received after history h\_t. |
| TD error (δ\_t) | Reward plus next predicted value minus current predicted value: the one-step surprise at an action. |

## Self-check

Work through these before looking at the answers; several reuse the lecture's numbers.

1. Why does a failed trajectory contribute nothing under plain REINFORCE, and what single change fixes that? **Answer:** The loss is −R(τ) Σ log πθ(a\_t | h\_t), so R = 0 multiplies every term by zero. Subtracting a baseline, such as the group mean reward, gives failures a negative weight (−0.25 in the four-attempt example) so the policy moves away from them.
2. Six rewards in a group are 1, 0, 0, 1, 0, 0. What are the mean-only advantages, and what happens if all six were 0? **Answer:** The mean is 1/3, so successes get +0.67 and failures −0.33. If all six were 0, every advantage is 0 and the group yields no gradient, which is why DAPO skips such groups.
3. Given Vφ(h3) = 0.2, Vφ(h4) = 0.5, Vφ(h5) = 0.9 and a final reward of 1 after a5, with γ = 1 and λ = 0.5, compute δ3, δ4, δ5 and Â3. **Answer:** δ3 = 0 + 0.5 − 0.2 = 0.3; δ4 = 0 + 0.9 − 0.5 = 0.4; δ5 = 1 + 0 − 0.9 = 0.1. Â3 = 0.3 + 0.5(0.4) + 0.25(0.1) = 0.525.
4. What do λ = 0 and λ = 1 mean in GAE? **Answer:** λ = 0 uses only the one-step TD error, which has low variance but inherits the critic's bias. λ = 1 sums all TD errors, which telescopes to reward-to-go minus Vφ(h\_t): unbiased but high variance.
5. A per-token ratio averages 1.05 across a 100-action trajectory. Why is the whole-trajectory importance weight a problem, and what do PPO/GRPO, CTPO and GSPO each do instead? **Answer:** The product is about 1.05¹⁰⁰ ≈ 132, so a few samples dominate. PPO/GRPO use only the current-token ratio; CTPO uses the cumulative ratio through token t with position-adaptive clipping; GSPO uses one length-normalised (geometric-mean) ratio per response.
6. In PPO with ε = 0.2, a token has ρ = 1.5. What gradient does it get if Â = +1? If Â = −1? How does CISPO differ? **Answer:** With Â = +1 the clipped term (1.2) is the minimum, so the gradient is zero. With Â = −1 the unclipped term (−1.5) is the minimum, so the full gradient applies. CISPO always gives a gradient, weighted by sg(clip(1.5)) = 1.2 times Â.
7. What is the difference between the rollout policy μ and the reference model π\_ref? **Answer:** μ is whichever policy generated the batch; it supplies the denominator of importance ratios and changes as training proceeds. π\_ref is a fixed anchor, usually the starting SFT model, used only in the KL penalty that limits drift.
8. All four attempts on a task fail. List the three possible causes the lecture gives and one check for each. **Answer:** A faulty verifier (review the requirements and failed tests), insufficient capability (see whether a stronger model's demonstrations succeed), or lack of exploration (see whether the trajectories actually differ).
9. How would you design a verifier for the `retry_count` task that avoids both false negatives and false positives? **Answer:** Test behaviour, not source text: run all four input-to-output cases (and a few more, such as negative numbers if specified). Keep hidden tests the agent cannot read or edit, and sanity-check the verifier with known-good and trivial patches like `return 0`.
10. Your training reward climbs from 0.3 to 0.9 but held-out success is flat. What do you do? **Answer:** Suspect reward hacking or verifier false positives. Read trajectories for shortcuts (test edits, git history, web lookups, API misuse), check tool calls and regressions, and tighten the environment or verifier before continuing.
11. Why is on-policy distillation usually better than off-policy distillation for agents? **Answer:** Off-policy distillation trains only on teacher histories, so the student never learns what to do after its own mistakes. On-policy distillation queries the teacher at the student's own histories, giving dense per-token targets exactly where the student goes.
12. How does OPSD get a useful teacher without a larger model? **Answer:** It uses a frozen copy of the starting model but gives it privileged context: the task, the student's history, and a verified solution. With the answer in view, the same model gives better next-token targets than the student can produce alone.

## References and further reading

The first list covers every source linked on the slides; the second adds background for going beyond them.

### Cited in the lecture

- [Lecture 6: Coding Agents (slides)](https://cmu-agents.vercel.app/slides/lecture-06-coding-agents.pdf) — CMU 11-768, 2026 — origin of the `retry_count` bug-fix example.
- [Sequence Level Training with Recurrent Neural Networks (MIXER)](https://michaelauli.github.io/papers/iclr2016_mixer.pdf) — Ranzato, Chopra, Auli, Zaremba, ICLR 2016 — §3.2.1: squared-error baseline and a value head on the policy body.
- [Training language models to follow instructions with human feedback (InstructGPT)](https://arxiv.org/abs/2203.02155) — Ouyang et al., 2022 — App. C.4: PPO with a separate value network for LLMs.
- [High-Dimensional Continuous Control Using Generalized Advantage Estimation](https://arxiv.org/abs/1506.02438) — Schulman et al., ICLR 2016 — the GAE estimator.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — Lightman et al., 2023 — process reward models trained on step-level human labels (PRM800K).
- [AReaL: A Large-Scale Asynchronous Reinforcement Learning System for Language Reasoning](https://arxiv.org/abs/2505.24298) — Fu et al., 2025 (v5 2026) — synchronous versus asynchronous RL; up to 2.77× speedup.
- [Rethinking Importance Sampling in LLM Policy Optimization: A Cumulative Token Perspective (CTPO)](https://arxiv.org/abs/2605.07331) — Zhang et al., 2026 — cumulative ratios, the √t variance growth plot, and the ratio-choice comparison table.
- [DAPO: An Open-Source LLM Reinforcement Learning System at Scale](https://arxiv.org/abs/2503.14476) — Yu et al., 2025 — clip-higher, dynamic sampling, entropy collapse.
- [MiniMax-M1 (CISPO)](https://arxiv.org/abs/2506.13585) — MiniMax, 2025 — introduces CISPO's clipped, stop-gradient importance weight.
- [Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347) — Schulman et al., 2017 — the clipped objective (Fig. 1) and entropy bonus (§5).
- [DeepSeekMath (GRPO)](https://arxiv.org/abs/2402.03300) — Shao et al., 2024 — group relative policy optimisation with a reference-model KL.
- [Group Sequence Policy Optimization (GSPO)](https://arxiv.org/abs/2507.18071) — Zheng et al. (Qwen), 2025 — sequence-level ratios and clipping.
- [Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) — OpenAI, 2024 — human review of task and test validity.
- [Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) — OpenAI, Feb. 2026 — the audit behind the ≈81% plateau.
- [SABER: Small Actions, Big Errors — Safeguarding Mutating Steps in LLM Agents](https://arxiv.org/abs/2512.07850) — Cuadron et al., 2025 — §5.1 on τ-bench task errors.
- [τ³-Bench: Fixing Airline + Retail](https://taubench.com/blog/tau3-task-fixes.html) — τ-bench team, Feb. 2026 — corrections to 50+ flawed tasks.
- [MAI-Thinking-1 technical report](https://microsoft.ai/pdf/mai-thinking-1.pdf) — Microsoft AI, 2026 — §3.3.1 documents web, Git and test exploits by coding agents.
- [PostTrainBench: Can LLM Agents Automate LLM Post-Training?](https://arxiv.org/abs/2603.08640) — Rank et al., 2026 — §5.4: an agent misused a grading API key.
- [Sidestepping Evaluation Awareness and Anticipating Misalignment with Production Evaluations](https://alignment.openai.com/prod-evals/) — OpenAI, Dec. 2025 — the GPT-5.1 "calculator hacking" case.
- [Where the goblins came from](https://openai.com/index/where-the-goblins-came-from/) — OpenAI, Apr. 2026 — a persona reward that spread creature metaphors.
- [Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) — Hinton, Vinyals, Dean, 2015 — classic knowledge distillation.
- [On-Policy Distillation of Language Models: Learning from Self-Generated Mistakes (GKD)](https://arxiv.org/abs/2306.13649) — Agarwal et al., ICLR 2024 — on-policy distillation and choice of divergence.
- [Self-Distilled Reasoner: On-Policy Self-Distillation for Large Language Models (OPSD)](https://arxiv.org/abs/2601.18734) — Zhao et al., 2026 — the same model as teacher, given a verified solution.
- Importance-weight plot (slide 29) — image credit Aditya Soni — no public link on the slide.

### Further reading

- [Reinforcement Learning: An Introduction, 2nd ed.](http://incompleteideas.net/book/the-book-2nd.html) — Sutton and Barto, 2018 — free textbook; chapters 6 (TD), 12 (eligibility traces, the root of GAE's λ) and 13 (policy gradients).
- [Spinning Up in Deep RL](https://spinningup.openai.com/en/latest/) — OpenAI, 2018 — concise derivations of the policy gradient, baselines and PPO with reference code.
- [Trust Region Policy Optimization](https://arxiv.org/abs/1502.05477) — Schulman et al., 2015 — the KL-constrained predecessor that PPO simplifies.
- [The 37 Implementation Details of Proximal Policy Optimization](https://iclr-blog-track.github.io/2022/03/25/ppo-implementation-details/) — Huang et al., 2022 — the practical checklist for getting PPO to work.
- [Back to Basics: Revisiting REINFORCE Style Optimization for Learning from Human Feedback in LLMs (RLOO)](https://arxiv.org/abs/2402.14740) — Ahmadian et al., 2024 — why critic-free group baselines suffice for LLMs.
- [DeepSeek-R1](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — GRPO with verifiable rewards at scale; the paper that popularised the recipe.
- [Understanding R1-Zero-Like Training: A Critical Perspective (Dr. GRPO)](https://arxiv.org/abs/2503.20783) — Liu et al., 2025 — length and std-normalisation biases in GRPO.
- [Math-Shepherd](https://arxiv.org/abs/2312.08935) — Wang et al., 2023 — process rewards from automatic rollouts instead of human labels.
- [IMPALA](https://arxiv.org/abs/1802.01561) — Espeholt et al., 2018 — asynchronous actor-learner RL and V-trace off-policy correction.
- [Approximating KL Divergence](http://joschu.net/blog/kl-approx.html) — John Schulman, 2020 — the k1/k2/k3 estimators used for KL penalties.
- [On-Policy Distillation](https://thinkingmachines.ai/blog/on-policy-distillation/) — Kevin Lu / Thinking Machines Lab, 2025 — readable practical account of reverse-KL on-policy distillation and its compute savings.
- [Reward Hacking in Reinforcement Learning](https://lilianweng.github.io/posts/2024-11-28-reward-hacking/) — Lilian Weng, 2024 — survey of reward hacking from robotics to LLMs.
- [Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?](https://arxiv.org/abs/2504.13837) — Yue et al., 2025 — pass@k evidence that RLVR mostly sharpens existing ability.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- [[The State of LLM Reasoning Model Inference]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]

[[L10 - Deep Research Agents|← L10]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L12 - RL Systems|L12 →]]
