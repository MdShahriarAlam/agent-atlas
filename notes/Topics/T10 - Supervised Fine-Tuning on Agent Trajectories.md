---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, sft, fine-tuning, llm-training]
aliases: ["CMU T10", "Supervised Fine-Tuning on Agent Trajectories"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 10 · Supervised Fine-Tuning on Agent Trajectories

[[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics|← T9]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO|T11 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L08 - SFT for Agents]], [[L09 - RL Foundations]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L8, L9 · 11-768 AI Agents, Fall 2026

## Overview

Supervised fine-tuning (SFT) on agent trajectories is the step that turns recorded agent runs (thoughts, tool calls and tool results) into model weights, so that a model reliably calls tools, reads observations and finishes long tasks without needing those skills spelled out in every prompt.

**Why it matters for building real agents.** Everything in L1 to L7 changed the *harness* around a fixed model: prompts, tools, memory, context management. SFT is the first lever that changes the model itself. It is how open models learned to emit parseable tool calls, wait for a tool result instead of inventing one, and stay coherent over 100K-token runs. It is also the standard "cold start" that makes reinforcement learning (RL) work at all: in L8's OpenThoughts-Agent numbers, RL applied to a base 8B model with no SFT reached a 3.6 average, while SFT followed by RL reached 21.7. For a practitioner, SFT is also the most accessible training method: it needs data and GPUs, not live sandboxes and reward functions.

**Key questions this sheet answers.**

- What exactly does SFT optimize, and why is "maximize the probability of the recorded actions" not the same as "complete the task"?
- How does a multi-turn trajectory with tool calls become one token sequence, and which of its tokens should carry the loss?
- Where do training trajectories come from (humans, stronger teacher models, the model itself, synthetic environments), and how do you filter them?
- Why does balancing a data mixture by example counts mislead you, and how do you balance by tokens instead?
- How are real SFT runs configured: learning rate, epochs, batch size, sequence packing, long context, LoRA versus full fine-tuning?
- How do you know the run worked: sanity checks, harness-based evaluation, checkpoint selection, regressions elsewhere?
- Why do imitation-trained agents fall apart after one unfamiliar step (exposure bias), and what do DAgger and RL do about it?
- How much SFT should come before RL, and why is the best RL starting point not the best SFT checkpoint?

**Which lectures cover it.**

- **L8 (Yueqi Song, Supervised Fine-Tuning for Agents)** is the main lecture. It walks the whole pipeline: trajectories as token sequences, loss masking, data sources and filtering, the Agent Data Protocol, real training configurations, evaluation, and the handoff to RL.
- **L9 (Daniel Fried, RL Foundations for Agents)** opens by naming SFT's three limitations (task mismatch, data mismatch, exposure bias) and shows that policy gradients reuse the SFT loss with a reward weight.
- **L1** places SFT in the pretraining, SFT, RL stack and lists which agent capabilities SFT targets (tool-call accuracy, long-context coherence, environment understanding).
- **L3** covers long-context training curricula; several frontier models run SFT at 512K tokens.
- **L6 and L7** supply the data side for coding and computer-use agents: SWE-Gym, SWE-smith, multi-harness training, human and synthetic GUI demonstrations, and distillation from a teacher.
- **L10** shows the collect-filter-imitate recipe for deep-research agents, agentic mid-training, and SFT as an RL warm start (DR Tulu).
- **L11** revisits distillation, including on-policy distillation, which fixes SFT's exposure bias by letting the student generate the histories.

**Prerequisites.** Next-token prediction and cross-entropy; what a tokenizer does; the agent loop of action, observation, action (L1, L2); basic probability (log-likelihood, expectation). Knowing what gradient descent and a learning rate are is enough; no RL background is needed.

**Suggested reading path.** Start with *Core concepts* straight through; it builds from the loss function to the RL handoff. Look at the *Concept map* next to see how the stages connect. Then read *Mechanics* for the exact equations and data formats, and run the two programs in *Hands-on*. Use *Design patterns, pitfalls and checklist* before you plan a real run. Finish with the *Practice questions*; the calculation questions reuse numbers from the Hands-on walkthrough.

## Concept map

![[cmu-ai-agents-T10-concept-map.png]]
*Concept map: agent SFT pipeline · 3 data sources, 6 stages, the pitfall at each stage, and the fixes that go beyond imitation*

Read it top to bottom: three sources feed a six-stage pipeline on the left, each stage points right to what typically goes wrong there, and exposure bias, which no SFT stage removes, leads to the fixes that take over after the cold-start checkpoint.

## Core concepts

This section builds agent SFT from one equation upward: what the loss rewards, how a multi-turn run becomes tokens, which tokens teach, where good runs come from, how to train on them, how to tell whether it worked, and why SFT alone stops short.

### 1. What SFT optimizes: imitation through next-token cross-entropy

A language model assigns a probability to every possible next token given the tokens so far. *Supervised fine-tuning* continues training a pretrained model on a curated set of example sequences, using the same objective as pretraining: make each next token in the examples more likely. The objective is *cross-entropy* (also called negative log-likelihood, NLL): for each position, take the negative log of the probability the model gave to the token that actually came next, and sum.

L8 writes the agent version with a mask. A *mask* is one bit per token, m\_t, saying whether that token's prediction counts. The loss is L(θ) = − Σ over tokens with m\_t = 1 of log p\_θ(x\_t | x\_\<t), where θ are the model weights, x\_t is token t, and x\_\<t is everything before it. L9 writes the same thing at the level of actions: L\_SFT = − Σ\_t log π\_θ(a\*\_t | h\_t), where π\_θ is the *policy* (the model viewed as a decision maker), a\*\_t is the demonstrated action at step t, and h\_t is the history of observations and actions before it. The two forms are identical once you remember an action is a run of tokens.

**A numeric feel.** Suppose the recorded action is the 12-token tool call `bash(cmd="pytest -q")` wrapped in its tags. If the model gives each of those tokens probability 0.9, the action's log-probability is 12 × ln 0.9 ≈ −1.26, so its loss is 1.26 nats and the whole action has probability e^−1.26 ≈ 0.28. Raising every token to 0.99 cuts the loss to 0.12 and lifts the action probability to 0.89. Short, exact tool calls need very high per-token confidence to be reliable, which is one reason SFT data teaches formats so effectively.

**What the loss is really doing.** Minimizing cross-entropy on a dataset is *maximum-likelihood estimation*. Beyond the lecture: it is equivalent to minimizing the forward KL divergence KL(p\_data ‖ p\_θ) from the data distribution to the model. Forward KL is *mode-covering*: the model is penalized heavily for assigning low probability to anything that appears in the data. So the model tries to reproduce everything in the demonstrations, the good habits and the bad ones. L8's slide on what trajectories teach says exactly this: the model learns how to write a tool call this harness can run, how to keep going in long conversations, what a tool result looks like (so it waits for one instead of writing one itself), "and whatever else was in the data: extra commentary, repeated commands, one way of solving a problem where several would work."

**Teacher forcing.** During training, every prediction conditions on the *recorded* prefix, never on the model's own earlier outputs. This is called *teacher forcing*. It makes training parallel and stable: one forward pass scores every token of a 100K-token trajectory at once. It also creates the exposure bias problem of subsection 9, because the model never sees the consequences of its own mistakes during training.

**Imitation learning vocabulary.** In robotics and RL, training a policy to copy expert actions with a supervised loss is called *behavior cloning* (BC). Agent SFT is behavior cloning where the policy is an LLM and the actions are text. L7 uses exactly this term for GUI agents: human demonstrations and agent-generated traces both feed "behavior cloning", while RL rollouts feed "task reward". Keeping the BC framing in mind helps, because forty years of imitation-learning results (compounding errors, DAgger, noise injection) transfer directly.

**Where SFT sits among the ways to change an agent.** L8 opens with a three-row table of places an agent can store what it learned:

| Location | Pros | Cons | Course coverage |
| --- | --- | --- | --- |
| Context window | high fidelity to what happened | costly, noisy, does not decide what matters | L3 |
| External artifacts (memory, skills) | inspectable, editable, retrievable, portable | must be induced, selected and maintained | L4 |
| Model weights | faster inference, broad behavior change | slower updates, opaque, model-specific | L8 |

Change the weights once and every later call gets the new behavior with nothing extra in the prompt. But the first two rows update in seconds, while this row costs a training run every time. You cannot open the weights to see what changed, or move the change to a different model. L1 frames the same choice as *LLM training* versus *harness engineering*: tool-call accuracy can come from grammar-constrained decoding (harness) or SFT on tool-calling traces (training); long-context coherence from compaction (harness) or long-context SFT (training).

**Where SFT sits in the training pipeline.** L8 draws the pipeline to token scale: pre-training on about 20T tokens (Nemotron 3 Ultra), mid-training on 1.43T (K2 Horizon), SFT on 332B (K2 Horizon), then RL on rollouts and rewards with no fixed corpus. Every step down uses fewer tokens, each more heavily curated. *Mid-training* (continued pretraining on targeted data, such as agent trajectories mixed with general text) sits between pretraining and SFT; L10 shows it matters (subsection 10).

**SFT versus RL at a glance** (L8's side-by-side table):

|  | Supervised fine-tuning | Reinforcement learning |
| --- | --- | --- |
| Learns from | recorded trajectories, whoever produced them | its own rollouts, scored by a reward |
| Signal | a target for every token | one number per rollout |
| Needs | data and GPUs | live environments, sandboxes, a checkable reward |
| Good at | learning tool calls, formats, long tasks | sharpening what the model can already attempt |
| Stuck when | the demonstrations are wrong, narrow or used up | the start is too weak, or the reward cannot be checked |

The signal row is the key difference. SFT gives a dense target for every generated token, so it can teach brand-new formats quickly. RL gives one scalar per rollout, so it can only reinforce behaviors the model already produces sometimes.

Common misconception: "SFT teaches the model to solve the task." SFT teaches the model to produce the recorded actions given the recorded history. Task success follows only to the extent that the recordings were successful, representative and cover the situations the model will meet.

### 2. Trajectories as token sequences: chat templates and tool-call rendering

A *trajectory* is the full record of one agent run. L8's running example (from SWE-Gym) is a coding agent in a sandbox with two tools, bash and a file editor. Its trajectory is a sequence of messages: a *system* message (the harness prompt, including tool descriptions), a *user* message (the GitHub issue text), then alternating *assistant* turns (a thought plus a bash command or an edit) and *observation* turns (test output, a diff), ending with a submit action. The repository's own tests decided whether the run succeeded.

**The chat template.** A model does not see messages; it sees one flat sequence of tokens. A *chat template* is the small program (in Hugging Face, a Jinja template stored with the tokenizer) that writes a list of messages into that one string. ChatML, used by Qwen models among others, marks each message with special tokens:

```text
<|im_start|>tool
3 failed, 41 passed
<|im_end|>
<|im_start|>assistant
The test compares floats. Fix it.
<tool_call>
str_replace(...)
</tool_call>
<|im_end|>
```

The `<|...|>` markers are single *special tokens*: reserved vocabulary entries that ordinary text can never produce. Everything else is what the agent wrote and saw. L8's point is that "every boundary is a template token": role changes, the start and end of tool calls, and the end of each turn are all explicit tokens the model must learn to read and, for its own turns, to write.

**How tool calls are rendered.** Tool use (L2) needs three things in the token stream. First, the *tool schemas* (names, argument types, descriptions), usually rendered into the system message as JSON. Second, the model's *call*, wrapped in markers the harness can parse; many open models use a JSON object inside `<tool_call>` tags, while CodeAct-style agents emit executable code as the action. Third, the *result*, placed in its own message with a tool or observation role. The harness parses calls out of the generated text; if the rendered format in training differs from what the harness parses, calls fail at inference even though training loss looked fine.

**Richer templates for agents.** L8 shows Kimi K3's XTML template, which separates three events that "end of turn" can mean: end this message, hand off to a tool, or finish the task. It uses distinct tokens such as `[close]response[sep]` and `[end_of_msg]`, with reasoning wrapped in `[open]think[sep] … [close]think[sep]`. Separate tokens make each decision a distinct, learnable prediction rather than one overloaded stop token.

**Template drift.** L8 warns that "the template you train with has to be the template you serve with, down to the whitespace." A subtle failure: some templates render earlier assistant turns differently depending on what follows. For example, a template that drops the `<think>` block from earlier assistant turns once a later turn exists. Render the same trajectory with and without a following tool message and you get two different strings, so the prefix the model sees at inference no longer matches the prefix it was trained on. The Hugging Face docs put it bluntly: "The chat template should always match the format the model was trained with." The Hands-on program includes a check that catches exactly this bug.

**Harness-specific rendering.** L8 (from the Agent Data Protocol paper) notes that the same trajectory must be written out differently for each target harness. OpenHands, SWE-Agent and AgentLab take different actions, so one abstract "edit file" becomes three different call syntaxes. Rendering is also where you set the system prompt and decide what to do when the context gets long (truncate, summarize, or drop old observations). After rendering, check the result: do the tool calls parse, does each call come with a thought, does the conversation end the way it should.

Common misconception: "The chat template is formatting, so it does not matter much." For agents it is part of the interface contract. A single mismatched newline or a missing end-of-turn token can make a fine-tuned model ramble past its turn or invent tool outputs.

### 3. Loss masking: which tokens teach

Once a trajectory is one token sequence, you must decide which positions count as prediction targets. L8's rule: **cross-entropy over the assistant tokens only**. Observations are conditioning context, not prediction targets. Minimizing the masked loss "raises the probability of each recorded action, given everything before it."

**Why not train on everything?** Three reasons. First, the model will never have to *produce* a system prompt, an issue text or a test log; it only has to produce actions. Second, training on tool outputs teaches the model to *write* tool outputs, which at inference shows up as hallucinated observations: the model invents "42 passed" instead of stopping and waiting for the real result. Third, observations are often huge (a 5,000-line log) and would dominate the gradient with text the agent has no control over.

**How the mask is built.** L8 describes three steps. Render: the template writes the conversation as one string and notes where each assistant span starts and ends. Tokenize: those character positions become token positions (a tokenizer's offset mapping gives each token's character range). Mask: tokens inside an assistant span get 1, everything else 0. "By the time training starts, the roles are gone. The trainer sees the string and the bits, nothing else."

**The two boundary tokens.** The role header `<|im_start|>assistant` is *supplied by the harness at inference*, so it is never a target. The end-of-turn token `<|im_end|>` is *produced by the model*, so it must be inside the mask. L8 quotes the TRL documentation's warning about getting this wrong: "the model may not learn to stop." A model that never learned to emit end-of-turn keeps generating past its action, often straight into a made-up observation.

**Masking the reasoning block.** Reasoning models write a `<think> … </think>` block before acting. L8 identifies two independent switches: does the reasoning *stay in the context*, and is it *trained on*? In the context, reasoning explains the action that follows. Trained on, it becomes the style the model itself writes. Nemotron 3 Ultra keeps budget-truncated reasoning in the context but masks the artificial cut-off point out of the loss, so the model does not learn to stop thinking mid-sentence.

**Weighting inside the assistant turn.** Masking is all-or-nothing, but you can also weight tokens. L8 cites BalanceSFT (Hao et al., 2025), which adds a learned weight (SSB) that rebalances reasoning tokens against tool-call tokens, plus hard-example resampling (HDR). The motivation: long reasoning dominates the loss, yet the short tool call is what must be exactly right. On BFCL (the Berkeley Function-Calling Leaderboard), Qwen2.5-Coder-Inst+SFT improved from 81.73 to 84.00 single-turn and from 38.25 to 47.00 multi-turn with both modules; Llama-3.2-3B-Inst+SFT improved from 73.67 to 78.99 and from 33.25 to 36.12. Rebalancing helped more on multi-turn than single-turn for both models.

**Framework controls.** The same decision appears under different names:

| Framework | Setting | How the mask is produced |
| --- | --- | --- |
| TRL | `assistant_only_loss=True` | the template marks assistant spans with `{% generation %}` markers as it renders; known families get patched templates |
| TRL | `completion_only_loss` | prompt-completion datasets; on by default there |
| Axolotl | `roles_to_train: ["assistant"]`, `train_on_eos: turn` | finds each turn's role header in the rendered string; the end-of-turn token of each trained turn is in the loss |
| LLaMA-Factory | `train_on_prompt: false`, `mask_history: true` | tags whole turns as train-or-ignore while encoding; `mask_history` trains the last turn only |

L8's summary: "Same decision in all three. Only TRL puts it in the template." Watch `mask_history`: training only on the last turn throws away most of an agent trajectory's supervision.

**Loss normalization.** Beyond the lecture: after masking, the summed loss must be divided by something. Dividing by the total number of unmasked tokens in the batch (token-mean) gives every token equal weight, so a 20,000-token trajectory counts 400 times as much as a 50-token one. Averaging per-sequence means first (sequence-mean) gives every trajectory equal weight, so tokens in short runs count more. Neither is universally right, but you should know which one your trainer uses, and it must stay consistent across gradient-accumulation steps. Hugging Face fixed a widely reported bug of exactly this kind in late 2024, where gradient accumulation silently changed the effective normalization.

**An open problem the lecture flags.** L8 could not find a published experiment that changes the mask for *agent* SFT and measures the effect. The careful masking studies (Shi et al., 2024, instruction modelling; Chatterjee et al., 2025, weighted instruction tuning) are single-turn instruction tuning. The one setting where unmasking the prompt helped had long prompts, short answers and little data; agent trajectories are the opposite on all three. "At 8B scale this experiment is cheap, and it is sitting there unrun."

Common misconception: "Masking removes observations from the model's view." Masked tokens are still in the input and still shape every later prediction through attention. Masking only removes them as *targets*.

### 4. Where trajectories come from

SFT is only as good as its demonstrations. L8 organizes sources by two questions: who ran the task, and did you keep everything or only the runs that passed?

| Who ran the task | Keep everything | Keep the runs that passed |
| --- | --- | --- |
| A stronger model | plain distillation | SWE-Gym, Nemotron, OpenThoughts-Agent |
| The model itself | MAI, on its own reasoning runs | expert iteration (L9) |

"Most agent SFT data sits in the top right box: a stronger model writes better trajectories than the student could, and the task's own tests make keeping the good ones cheap." Across the course, four families of sources appear.

**Human demonstrations.** People perform the task while a recorder logs observations and actions. This is common for GUI and web agents, where the task is natural for people and hard to script. L7 lists Mind2Web and AITW (2023), WebLINX, Android and GUI datasets (2024), AgentNet (2025) and MolmoWeb (2026). AgentNet (OpenCUA) released 22,625 task trajectories across three operating systems; MolmoWebMix combines 36K human and 105K synthetic task trajectories. Human data is realistic and diverse, but slow and costly to collect, and people rarely write down the reasoning behind a click. L7 adds a caution about how such data is used for evaluation: "Next-action imitation is not the same thing as task completion."

**Teacher distillation.** A stronger model (the *teacher*) runs the tasks inside the target harness, and a smaller *student* is fine-tuned on the resulting trajectories. Formally, *distillation* means training a student to match a teacher; when only the sampled text is kept, it is sometimes called *sequence-level* or *hard-label* distillation, as opposed to matching the teacher's full probability distributions (L11). The canonical example from L8 (and L6): in SWE-Gym, GPT-4o and Claude ran the tasks, 491 runs passed the repository tests, and Qwen2.5-Coder-32B fine-tuned on those 491 runs alone improved from 7.0% to 20.6% on SWE-Bench Verified and from 3.0% to 15.3% on SWE-Bench Lite. Beyond the lecture: FireAct (2023) had shown the same pattern early, with 500 GPT-4 trajectories raising Llama-2-7B's HotpotQA score by 77%.

**Self-generated data.** The model runs the tasks itself and trains on its own filtered successes. Repeating this loop is *expert iteration*, which L9 presents as ReST (Reinforced Self-Training): grow (sample and score), improve (filter by reward and train with the ordinary SFT loss), repeat. L9 shows that with binary rewards, SFT on the successful trajectories is almost the same update as the REINFORCE policy gradient. So self-generated SFT is the bridge between imitation and RL.

**Synthetic environments and tasks.** The bottleneck is often not trajectories but *tasks with checkable outcomes*. L6 describes two routes for code: mining real issues with executable tests (SWE-Gym: 2,438 Python task instances) and injecting bugs procedurally (SWE-smith: mutate code, not tests, and keep only mutations that make a test fail; the paper reports 50K task instances from 128 repositories). L7's Gym-Anything creates and audits real software setups (200 applications, 3 operating systems, over 10K tasks) and distilled about 2,000 successful Kimi-K2.5 trajectories into a Qwen3-VL-2B-Thinking student, lifting its average checklist score from 12.7 to 22.5 and its perfect-checklist rate from 1.6% to 4.4%. L10's deep-research agents (WebDancer, Tongyi DeepResearch) synthesize questions with known answers, have a teacher attempt them, and keep trajectories with a correct answer, a valid format and a coherent path.

| Source | Strength | Weakness | Typical use |
| --- | --- | --- | --- |
| Human demos | realistic, diverse, captures human judgment | expensive, no reasoning text, noisy | GUI and web agents |
| Teacher distillation | cheap at scale, includes reasoning | capped by the teacher, inherits its habits | most agent SFT today |
| Self-generated (expert iteration) | on the student's own distribution | needs a reward and a model that sometimes succeeds | late SFT, the step into RL |
| Synthetic tasks | unlimited checkable tasks | may not match real task distribution | coding, terminal, web research |

Common misconception: "The best model makes the best teacher." Subsection 5 shows L8's evidence against this.

### 5. Filtering, rejection sampling and scaling the data

*Rejection sampling* here means: sample many runs, check each with a verifier (tests, an answer key, a checklist), and keep only those that pass. It is the cheapest quality filter in agent SFT, and the reason the "keep the runs that passed" column dominates. But passing is not the same as being good to imitate.

**Successful runs can still teach bad habits.** L8 shows three runs from Nemotron 3 Ultra's data that all passed their tests. One read files but never edited; one sat in an edit-test loop for most of its turns; one left `print(` debugging statements in the final patch. "The loss copies every action, good or not. Train on these runs and the model learns the mess together with the fix." Nemotron's report says such runs "would teach undesirable behaviors if used directly as SFT data." So an outcome filter needs process filters beside it: patch hygiene, loop detection, no tool-call parse errors, a thought with every call, a proper ending.

**Filtering by shape.** OpenThoughts-Agent (Raoof et al., 2026) compared simple trajectory filters, evaluated on SWE-bench Verified (100-task subset), OT-TBLite and Terminal-Bench 2.0:

| Filter | SWE-bench Verified (100) | OT-TBLite | Terminal-Bench 2.0 | Average |
| --- | --- | --- | --- | --- |
| Minimum turns ≥ 5 | 29.00 | 19.10 | 11.61 | 19.90 |
| Filter timeouts | 26.67 | 18.03 | 10.49 | 18.39 |
| Filter subagent traces | 23.00 | 17.31 | 10.86 | 17.06 |

The best filter just drops every run shorter than five turns. L8 is candid about why this is odd: "Turn count says how much work a run took, not whether the work was any good. A four-turn clean fix gets dropped. A forty-turn mess gets kept. On average it still helped." A plausible reading (beyond the lecture) is that longer runs contain more investigation and more observation-conditioned decisions, which are exactly what short runs fail to teach.

**Choosing the teacher.** OpenThoughts-Agent also swapped teachers while holding everything else fixed. GLM 4.7 (quantized) ranked first on the normalized average (raw average 18.16), with Kimi K2.5 (18.59 raw) and GLM 5 (18.27 raw) essentially tied with it. GPT-5.3-Codex, which the paper reports as the strongest of the five on the benchmarks themselves, produced the weakest student (11.94 raw), about 5 points behind GLM 4.7 on Terminal-Bench 2.0. "Leaderboard rank told them the wrong thing here. Trying two teachers and keeping the better student is cheap by comparison." Beyond the lecture, plausible reasons include teacher trajectories that are too terse to learn from, reasoning that is hidden or summarized, or habits specific to the teacher's native harness.

**Task sources matter most.** In the same study, the choice of task source had "the largest spread of any pipeline stage." SWE-smith tasks ranked first (18.78 average; 32.33 on SWE-bench Verified), followed by StackExchange SuperUser, StackExchange Tezos and IssueTasks; AgentTuning-OS ranked 95th with a 2.00 average. Different sources helped different benchmarks, and the recommendation was to mix the best four to eight sources; going wider did not help. L8's advice: spend effort on task sources before tuning anything else.

**Scaling: more tasks beat more runs.** Two scaling results fit together. In SWE-Gym, with the task set fixed, SWE-Bench Verified accuracy for the 32B model rose from about 11% (25% of the data) to about 17% (50%) to 20.6% (100%), and was still rising when the sampling budget ran out. In OpenThoughts-Agent, starting from the same 10K rows, adding more runs of the same tasks (upsampling) flattened or even declined on OT-TBLite and Terminal-Bench 2.0, while adding new synthetic tasks kept climbing (SWE-bench Verified subset: about 0.34 to 0.56 at 100K rows). The lesson: extra samples of one task mostly add redundant variations; new tasks add new situations.

**The recovery question.** L8 ends this part with a discussion: three runs of the same task came back. (A) a clean four-turn fix; (B) a long run that made a wrong edit, saw the test fail and recovered; (C) a run that solved it after eleven attempts that changed nothing. Which do you keep, and which actions carry the loss? A defensible answer: keep A and B, drop C. For B, keep the recovery in context but consider masking the wrong edit, so the model learns to *notice and fix* a failure without learning to *make* it. A minimum-turns filter gets this wrong twice: it drops A and keeps C.

Common misconception: "Rejection sampling makes the data correct." It makes the *outcomes* correct. Every intermediate action still gets imitated.

### 6. Mixing and unifying data: tokens, formats and harnesses

**Samples versus tokens.** Data mixtures are usually specified as example counts, but the loss is summed per token. L8's example is MAI-Thinking-1's consolidation SFT mixture:

| Capability | Sample weight | Token weight |
| --- | --- | --- |
| STEM and coding | 56% | 89% |
| Agentic capability | 11% | 9% |
| General helpfulness and safety | 33% | 2% |

A third of the examples were helpfulness and safety, yet they received 2% of the gradient signal, because STEM and coding traces are far longer. "Whatever you balance by counting trajectories, check what it turned into in tokens." The fix is simple arithmetic: token share of domain d = n\_d × L\_d / Σ n\_j × L\_j, where n\_d is the number of examples and L\_d their mean length. To hit a token target, up- or down-sample each domain by target share divided by current share (Hands-on example 1 does this).

**Heterogeneous datasets.** L8 shows the Agent Data Protocol's survey table of 13 public agent datasets, each built by a different group in its own format. They vary in domain (coding, tool use, web), size (from 0.2K OpenHands-feedback trajectories to 1,046.1K Orca AgentInstruct examples) and provenance (manual, synthetic, rollout). For a web page, some save the HTML and others the accessibility tree. To train on two of them together, you first write two customized converters.

**The Agent Data Protocol (ADP).** ADP (Song et al., ICLR 2026 oral; Song is L8's lecturer) is a small typed schema that acts as an interlingua. Every dataset is converted once into typed actions (APIAction, CodeAction, MessageAction) and typed observations (TextObservation, WebObservation that can keep both HTML and accessibility tree). Every harness gets one renderer from ADP into its own format. With D datasets and H harnesses, converters drop from D × H to D + H: for 13 datasets and 3 harnesses, 16 instead of 39. The paper reports roughly a 20% average gain over base models from training on the unified data.

**Diversity beats matched single-domain data.** L8's cross-task result from ADP keeps harness, model and evaluation fixed and changes only the mixture. Training on the full ADP mixture beat training on the matching single-domain source on that domain's own benchmark: SWE-Bench 11.0 to 16.6 (+5.6), WebArena 16.0 to 20.1 (+4.1), AgentBench 21.5 to 25.7 (+4.2), GAIA 0.6 to 9.1 (+8.5). General agentic skills (reading observations, recovering from errors, formatting calls) transfer across domains.

**Multi-harness data.** A *harness* is the prompts, tools, agent loop and context management around the model (L6). Trajectories collected in one harness teach its conventions along with the task. L6 and L8 both cite Nemotron 3 Ultra collecting from at least two harnesses per task distribution, so the model does not only work in one. L7 makes the same point for GUI agents, where output schemas differ between vendors and "reproducibility is a nightmare."

Common misconception: "A domain-specific model needs only domain-specific data." ADP's results show the mixture wins even on the target domain, and MAI's table shows your mixture may not be what you think it is.

### 7. Running the training: hyperparameters, packing, long context, LoRA

**Real configurations.** L8 collects three published frontier SFT setups:

| Model | Sequence length | Batch (sequences) | Learning rate |
| --- | --- | --- | --- |
| Nemotron 3 Ultra | packed 294,912, then 515,000 | 64 | 1.5e-5 decayed to 1e-6 |
| MAI self-distillation | packed 128K | 2,048 | 1.7e-5 decayed to 5.2e-6, 2% warmup |
| K2 Horizon | 512K, three phases | not given | decayed on a high-quality subset |

Three patterns stand out. Sequences are very long (hundreds of thousands of tokens), because agent runs are long. Learning rates are small (around 1e-5 to 2e-5), because SFT adjusts a strong pretrained model rather than learning from scratch. And the rate decays over training, sometimes ending on a high-quality subset (a form of *annealing*). Batch size is best read in tokens: Nemotron's 64 packed sequences of about 295K tokens is roughly 18.9M tokens per optimizer step.

**The hyperparameters, explained.**

- **Learning rate (LR).** The step size of each weight update. Too high and the model forgets general skills or diverges; too low and it underfits the new format. Beyond the lecture: TRL's SFT default is 2e-5 for full fine-tuning, and its docs suggest about 1e-4 for LoRA adapters.
- **Schedule and warmup.** A short *warmup* (L8's MAI example: 2% of steps) ramps the LR up from near zero to avoid large early updates; then cosine or linear decay lowers it.
- **Epochs.** One *epoch* is one pass over the dataset. More epochs fit the data more tightly and raise the risk of memorizing it. Small curated agent sets are often trained for a few epochs; very large sets for one or two. Choose by evaluation (subsection 8), not by habit.
- **Batch size.** How many tokens contribute to one update. Larger batches give smoother gradients and better GPU use, but fewer updates per epoch. Gradient accumulation lets a small GPU simulate a large batch by summing gradients over several micro-batches.

**Sequence packing.** Training runs on fixed-length rows. *Packing* fills each row with several whole conversations instead of padding most of it with blank tokens. Nemotron 3 Ultra's procedure, as L8 describes it: each conversation goes into the pack whose remaining capacity it fits most tightly (a *best-fit* bin-packing heuristic); no conversation is split or truncated, "a deliberate choice against hallucination"; identical prompts are kept out of the same pack; and packs are shuffled afterwards. Beyond the lecture: packing must also stop conversations in one row from attending to each other. Modern kernels do this by passing sequence boundaries (cumulative sequence lengths) to FlashAttention's variable-length path; Hugging Face reported up to 2x throughput from boundary-aware packing on variable-length data without hurting convergence. Hands-on example 1 shows best-fit-decreasing packing raising row utilization from 44% to 92% on a toy set.

**Why no truncation?** A truncated trajectory teaches the model that runs end abruptly, or trains it on an action whose motivating observation was cut off. Either way the model learns to act without the evidence that justified the action, which is a recipe for confident invention.

**Long-context training.** Agent runs are long: L10 notes that in Tongyi DeepResearch's SFT data over 20% of samples contain more than 10 tool calls. L1 lists long-context SFT as the training route to coherence over long runs, and L3 lists Nemotron 3 Ultra as doing 1M-token continued pretraining then SFT to 512K, and GLM-5 using agent trajectories in a 32K to 128K to 200K curriculum. The shared recipe in L3 is coherent long sources, tasks whose answer depends on distant evidence, and progressive length growth. Beyond the lecture, the costs are real: activation memory grows linearly with sequence length and attention compute grows quadratically, so long-context SFT relies on FlashAttention, activation checkpointing (recompute activations in the backward pass) and context parallelism (split one sequence across GPUs; L3).

**Mixture-of-experts routing.** In a *mixture-of-experts* (MoE) model, a router sends each token to a few of many expert sub-networks. The frontier models in L8 are MoEs, while the models public papers fine-tune are mostly dense. L8 shows what happens when you fine-tune an MoE on a narrow agent set: a few experts take most of the tokens. MAI's fix was to push the routing-balance loss a thousand times harder during SFT than during RL and raise dropout to 0.15.

**LoRA versus full fine-tuning.** *Full fine-tuning* updates every weight. *LoRA* (Low-Rank Adaptation; Hu et al., 2021) freezes the original weights and learns a small low-rank correction for selected matrices: W' = W + (α/r)·B·A, where A has r rows and B has r columns, with rank r typically 8 to 64. Beyond the lecture, a numeric example: for an 8B Llama-3-style model with LoRA rank 16 on all seven linear layers of each of 32 blocks, the adapters hold about 42M trainable parameters, roughly 0.5% of the model. *QLoRA* goes further and stores the frozen base in 4-bit precision.

|  | Full fine-tuning | LoRA | QLoRA |
| --- | --- | --- | --- |
| Trainable parameters | all (e.g. 8B) | about 0.1 to 1% | same as LoRA |
| Memory for an 8B model (weights + optimizer, rough) | about 128 GB with Adam in mixed precision | about 16 GB frozen bf16 weights + small adapter state | about 5 GB 4-bit weights + adapter state |
| Typical learning rate | about 1e-5 to 2e-5 | roughly 10x higher | similar to LoRA |
| Learns | most | less on large data | slightly less than LoRA |
| Forgets | most | less | less |
| Deployment | a full new checkpoint | small adapter file, swappable | small adapter file |

The research picture (beyond the lecture): Biderman et al. (2024) found "LoRA learns less and forgets less" than full fine-tuning on large code and math training sets. Thinking Machines' "LoRA Without Regret" (Schulman et al., 2025) found LoRA matches full fine-tuning when it is applied to all layers (especially the MLP and MoE layers, not attention only), uses a learning rate about 10 times higher, and the dataset does not exceed the adapter's capacity; it also tolerates very large batches less well. For RL, even rank-1 LoRA matched full fine-tuning, because each episode carries so little information. Practical rule: use LoRA to adapt a model to one harness or domain on limited hardware; use full fine-tuning when you are teaching broad new capabilities from hundreds of millions of tokens, as the frontier recipes in L8 do.

Common misconception: "LoRA is a lower-quality shortcut." Configured well, it matches full fine-tuning for moderate data sizes. Its real limits are capacity on very large datasets and sensitivity to batch size.

### 8. Knowing it worked: evaluation, checkpoint selection, overfitting and forgetting

**Sanity first.** L8's first rule: "Before trusting any number, check that you can overfit twenty examples. If the loss will not drop, the bug is upstream." A model that cannot memorize 20 trajectories has a broken mask, template, tokenizer or data loader. Beyond the lecture, a second cheap check: decode the masked tokens of a few training rows and read them. If you see tool outputs or system text, the mask is wrong.

**Evaluate in a harness, on checkable tasks.** Training loss and next-action accuracy are weak proxies. L8 says to evaluate by running the model in a harness on tasks with checkable outcomes. SWE-Gym's table shows why: fine-tuning changed not just resolve rate but behavior, with the 32B model's empty-patch rate falling from 27.0% to 18.1% on SWE-Bench Lite and average turns rising from 15.5 to 29.3. Those behavioral statistics (empty patches, stuck-in-loop rate, turns, tool-call parse errors) are worth tracking beside success rate.

**Read numbers carefully.** L8 warns that published numbers are sometimes the best of several harnesses. Report which harness each number comes from.

**Match the split to the claim.** Keep all runs of one task on the same side of the train/test split; otherwise the model is tested on tasks it has seen solved. To claim generalization to new repositories, split by repository. L6's "learning skills for new tasks" slide makes the same demand: held-out tasks, new repositories, equal inference budget.

**Robustness across harnesses.** Because trajectories teach harness conventions, evaluate in more than one harness if the model will be used in more than one (L8, citing Nemotron).

**Regressions outside the target domain.** "Train on one capability and you move the others, whether or not you measure it" (L8, citing MAI-Thinking-1). So evaluate things you were not trying to improve: general chat, instruction following, safety refusals, math. Beyond the lecture, the general phenomenon is *catastrophic forgetting*: fine-tuning on a narrow distribution overwrites skills that the narrow data never exercises. Standard mitigations are mixing in general data (AgentTuning's recipe), lowering the learning rate or epoch count, using LoRA, and balancing the mixture by tokens.

**Overfitting.** *Overfitting* means fitting the training trajectories so closely that performance on new tasks stops improving or falls. Symptoms: training loss near zero, validation loss rising, harness success flat or dropping, and the model reproducing verbatim command sequences from training when the situation differs. Fixes: fewer epochs, more distinct tasks (subsection 5), and choosing the checkpoint by harness success rather than by last step.

**Checkpoint selection.** Save checkpoints along the run and pick by harness evaluation on a held-out task set. If RL follows, the best checkpoint is not necessarily the best SFT score (subsection 10).

Common misconception: "Lower validation loss means a better agent." Validation loss measures agreement with held-out demonstrations under teacher forcing. It says nothing about what happens after the model's first unrecorded action.

### 9. The limits of imitation: exposure bias, compounding errors and DAgger

L9 (Fried) opens the RL block by naming three ways SFT's objective differs from what we want, using a running example called Number Search: a hidden integer between 1 and 16, four guesses, and after each wrong guess the environment says higher or lower. Reward is 1 only if the agent finds the number.

1. **Task mismatch.** SFT maximizes the probability of the *demonstrated* actions; we want to maximize the probability of *completing the task*. "These are not quite the same." For target 11, the runs 8, 12, 10, 11 and 4, 8, 12, 11 both succeed. SFT on the first pushes probability away from the second's equally good moves. And SFT has no notion that some actions are worse than others, such as guessing 13 after being told "12, lower".
2. **Data mismatch.** We would like to learn from sub-optimal data too. Failed runs such as 16, 8, 9, 10 (timeout) contain information (what not to do), but plain SFT can only imitate, so they must be thrown away.
3. **Exposure bias.** "The agent was not exposed to its own mistakes at training time, and might not be prepared to handle mistakes when generating." Trained on 8, higher, 12, …, the model at generation time guesses 8, hears higher, then guesses 2. Now it is in a history no demonstration ever contained.

**The training-running mismatch, concretely.** L8 draws the same picture for a coding agent. In the demonstration, edit A led to passing tests and a submit. In its own run, the model makes edit B, which is plausible but different; the tests fail; "now what" is not in the data. "Training grades one action at a time, always continuing the recorded run. Deployed, there is no recording. Every action the model takes changes what it sees next." Low loss promised nothing about the states the model reaches after its first deviation.

**Why errors compound.** Beyond the lecture, the classic analysis (Ross and Bagnell, 2010; restated in the DAgger paper) goes like this. Suppose the cloned policy makes a mistake with probability ε at each step *on states the expert visits*. Once it errs, it is in unfamiliar territory where it may keep erring for the rest of the episode. Over a horizon of T steps the expected number of mistakes can grow like T²ε rather than Tε. For agents this matters a lot: a 50-turn coding run with a 2% per-step slip rate has about a 64% chance of at least one slip (1 − 0.98^50 ≈ 0.64), and each slip may push the rest of the run off-distribution.

**DAgger: let the student drive, let the expert label.** DAgger (Dataset Aggregation; Ross, Gordon and Bagnell, 2011) fixes the distribution problem directly:

1. Train a policy on expert demonstrations.
2. Run the *current policy* to collect the states it actually visits.
3. Ask the expert what it would do in each of those states.
4. Add these (state, expert action) pairs to the dataset, keeping all earlier data, and retrain.
5. Repeat.

Because the training states now come from the learner's own distribution, the error bound becomes linear in T under mild conditions. The price is that the expert must be *queryable* at arbitrary states, which a human demonstrator or a fixed dataset cannot easily provide. For LLM agents the expert can be a teacher model, which makes DAgger practical. Hands-on example 2 reproduces the effect on Number Search: behavior cloning on 1,600 teacher runs reached 0.749 success because 17% of the states the student reached were never in training; DAgger reached 0.849 after five rounds, close to the 0.862 ceiling.

**Modern relatives.** L11 presents *on-policy distillation* (Agarwal et al., ICLR 2024): the student generates the histories, and a teacher supplies its full next-action probabilities at those histories as targets; the loss is the reverse KL between student and teacher. This is DAgger with soft labels. L11's example: at one history the teacher gives 0.8 and 0.2 to two actions and the student 0.5 and 0.5; the reverse KL is 0.5 ln(0.5/0.8) + 0.5 ln(0.5/0.2) ≈ 0.223. On-policy self-distillation (OPSD) goes further, using a frozen copy of the model given a verified solution as its own teacher. Kimi K3's pipeline in L8 ends with an on-policy distillation stage that consolidates domain experts into one model. Other remedies (beyond the lecture) include *noise injection* during data collection (DART, Laskey et al., 2017), where the demonstrator's actions are perturbed so recovery states appear in the data but are labeled with correct actions, and deliberately keeping recovery trajectories (subsection 5).

**Reinforcement learning as the fix.** L9's answer to all three problems is RL: generate trajectories from the agent, score them, and adjust the policy to maximize expected reward. Task mismatch goes away because any successful trajectory is reinforced. Data mismatch goes away because low-reward trajectories push probability down. Exposure bias goes away because training trajectories come from the current policy, so the agent learns to recover from its own mistakes.

**SFT and policy gradients are the same machinery.** L9 shows that the policy-gradient loss is "masking and rescaling of the standard SFT loss": L\_PG = −R(τ) Σ log π\_θ(u\_t | u\_\<t) over tokens the policy sampled (including the end-of-turn token), with prompt and observation tokens masked exactly as in SFT. With binary rewards, REINFORCE on sampled runs equals SFT on the successful ones, which is ReST. L9's summary puts every method in one form, ∇J = Σ\_t w\_t ∇ log π\_θ(a\_t | h\_t), differing only in the weight: w\_t = 1 on successes for ReST, R(τ) for REINFORCE, and a group-relative advantage for GRPO. SFT is the special case where the weight is 1 on someone else's trajectories.

Common misconception: "If the model imitates the expert perfectly on the training data, it will behave like the expert." Only on the expert's state distribution. The first deviation puts the model on its own distribution, which SFT never trained.

### 10. SFT as a cold start for reinforcement learning

In current frontier pipelines, SFT's main job is often to produce a good starting point for RL. L8 defines the *cold start* as "the checkpoint RL begins from", and describes Kimi K3's three stages: SFT to initialize baseline agent capabilities, RL to develop domain experts at varying reasoning effort, and on-policy distillation to consolidate the experts into one model. In Kimi K3, the model learns to call tools and finish long tasks during SFT, before any RL. The report's own words: "The SFT stage establishes a high-quality cold-start policy for the subsequent RL stage."

**Why not RL alone?** DeepSeek-R1-Zero ran RL directly on the base model with no SFT. Its answers mixed languages and were hard to read, so the next model, DeepSeek-R1, put SFT back in, starting from a few thousand curated examples. For agents the case is stronger still. RL needs the model to succeed sometimes: L9 shows that when every rollout in a group fails (rewards 0, 0, 0, 0), the group-relative advantages are all zero and the group contributes no gradient. A base model that cannot produce a parseable tool call will fail every rollout. SFT is what gets the success rate off zero.

**The evidence.** L8's table from OpenThoughts-Agent (Qwen3-8B base):

| Recipe | SWE-bench Verified (100) | OT-TBLite | Terminal-Bench 2.0 | Average |
| --- | --- | --- | --- | --- |
| Cold-start SFT + RL | 35.7 | 16.0 | 13.5 | 21.7 |
| SFT only, 10K examples | 24.3 | 15.6 | 7.9 | 15.9 |
| Cold-start SFT only | 23.7 | 14.8 | 6.7 | 15.1 |
| RL with no SFT | 1.0 | 7.8 | 1.9 | 3.6 |
| Qwen3-8B base | 5.3 | 1.3 | 1.5 | 2.7 |

RL on the base model barely moves it (2.7 to 3.6). SFT alone reaches about 15 to 16. The pair reaches 21.7. And the winning recipe starts RL from a cold-start checkpoint that scores *lower* on its own (15.1) than the best SFT model (15.9). MAI-Thinking-1 states the principle: "RL provides the most gains when the SFT model is selected with RL in mind."

**Why the best SFT checkpoint is not the best RL start.** Beyond the lecture, a likely mechanism: training SFT to convergence sharpens the output distribution, lowering *entropy* (the spread of probability over alternatives). RL learns by comparing different rollouts of the same task; if all rollouts look alike, there is little to compare. L11's discussion of exploration and entropy collapse makes the same point from the RL side. A cold-start checkpoint that already knows the format but still explores varied strategies gives RL more to work with.

**Corroboration from other lectures.**

- L10's DR Tulu varied the SFT checkpoint used for RL while keeping RL data and hyperparameters fixed: the full SFT mixture gave the strongest RL results, even 5% of the SFT data helped, and "No SFT" was the weakest starting point.
- L10's AgentFounder shows that agentic *mid-training* improves the starting point for SFT: with the same downstream SFT data, BrowseComp-en went from 28.6 to 39.9, BrowseComp-zh from 35.6 to 43.3, and GAIA from 71.8 to 72.8.
- L7's CUA-Gym starts from 3,578 SFT demonstrations and then runs RL (GSPO) on 10,858 verified tuples, reporting OSWorld performance rising from 62.2% to 72.6%.
- L11's curriculum slide: when the student rarely succeeds, a teacher's successful trajectories provide a warm start; then practice on tasks where the model sometimes succeeds; then raise difficulty, keeping earlier tasks in the mix.

**Putting it together.** A modern agent training pipeline looks like: pretraining, then optional agentic mid-training, then SFT on filtered, token-balanced, multi-harness trajectories (the cold start), then RL on verifiable tasks, then possibly on-policy distillation to merge specialists. SFT teaches the model *what agent behavior looks like*; RL teaches it *which behavior works*.

Common misconception: "If RL is coming anyway, SFT quality does not matter." The OpenThoughts-Agent and DR Tulu results show the SFT checkpoint largely determines how far RL can go, and a missing or weak SFT stage can leave RL with nothing to reinforce.

## Across the lectures

SFT on trajectories is taught in one lecture (L8) but is used or questioned in nearly every other one: the harness lectures supply its data and its alternatives, and the RL lectures define themselves against its limits.

**L1 (course introduction): SFT as one of two levers.** L1 frames every agent capability as buildable in two ways: *LLM training* (pretraining, SFT, RL) or *harness engineering* (prompts, tools, memory, control flow). Its six capability slides assign SFT specific jobs: "train on tool-calling traces" for accurate tool calling, "long-context training" for coherence over long runs, and "train on data with expected observation shape" for environment understanding. RL is assigned the jobs SFT cannot do well: learning from user feedback and long-horizon task management. This division of labor matches L8's side-by-side table almost exactly.

**L2 (tool use) and L3 (long context): what SFT has to encode.** L2 defines the tool-call formats and schemas that the chat template must render; L1 names grammar-constrained decoding as the harness alternative to SFT for call accuracy. L3 supplies the long-context side: the short-to-long training curriculum (4K to 8K pretraining, 32K to 128K continued training on packed long documents, then 128K+ adaptation on task traces and synthetic curricula), and a table showing Nemotron 3 Ultra running SFT to 512K and GLM-5 using agent trajectories in its 32K to 200K curriculum. L3 also flags packing's risk: "boundaries and cross-example leakage matter."

**L4 (memory and skills): the alternative to weights.** L4 is where the course stores learning in external artifacts rather than weights. L8's opening table explicitly contrasts the three locations (context, artifacts, weights) and cites L4's approach as faster to update and inspectable, but needing induction and maintenance. The two lectures are complementary rather than competing: a skill library can be distilled into weights later, and a fine-tuned model still benefits from memory.

**L6 (coding agents) and L7 (computer-use agents): where the data comes from.** These two lectures are SFT's data suppliers. L6 introduces SWE-Gym (executable environments validated before collecting trajectories), SWE-smith (procedural bug injection with execution validation), multi-language repositories, and multi-harness training (Nemotron 3 Ultra: at least two harnesses per task distribution). It also shows SWE-Gym's training-scale and inference-scale curves. L7 lays out the full GUI-agent training stack: pre-training on UI elements for grounding and actions for control, then SFT on human demos and synthetic agent traces ("behavior cloning"), then RL rollouts with task reward. L7 adds numbers (AgentNet's 22,625 trajectories, MolmoWebMix's 36K human plus 105K synthetic, Gym-Anything's 2,000 distilled trajectories lifting a 2B student from 12.7 to 22.5 checklist score) and a warning that offline next-action matching is a poor evaluation. It also explains why RL for GUI agents needs simulated environments (real money, real people, no clean reset), which is one reason SFT on demonstrations stays important there.

**L8 (SFT for agents): the core.** L8 (Yueqi Song) gives the complete pipeline in seven parts: why weight updates; trajectories as token sequences (templates, masks, end-of-turn, reasoning blocks, token weighting, samples versus tokens); choosing the trajectories (sources, filters, teachers, task sources, scaling); one format for many datasets (ADP); running the training (configurations, MoE routing, packing, template drift, released artifacts); knowing it worked (exposure bias, harness evaluation, cross-harness robustness, regressions); and the handoff to RL. Its tone is empirical and cautious. It repeatedly says where evidence is missing (no published agent-masking ablation) or counterintuitive (the best benchmark model is the worst teacher; a crude turn-count filter wins).

**L9 (RL basics): SFT's limits and its reuse.** L9 (Daniel Fried) starts where L8 ends. It restates the SFT loss on Number Search, then names three problems: task mismatch, data mismatch and exposure bias. It then shows RL fixes all three and, crucially, that the machinery is shared. The policy-gradient loss is the SFT loss with a reward weight, the same masking of prompt and observation tokens, and the end-of-turn token included. With binary rewards, REINFORCE equals SFT on successful runs (ReST, expert iteration). L8 points forward to this ("expert iteration, Sep 22"), and L9 closes the loop.

**L10 (deep research agents): SFT in a different domain.** L10 shows the same collect-filter-imitate recipe for web research: questions with known answers, teacher trajectories, and a filter for correct answer, valid format and coherent trajectory. It adds two things L8 does not emphasize. First, agentic mid-training (AgentFounder) improves the base that SFT starts from. Second, DR Tulu's ablation of SFT checkpoints for RL, which agrees with L8's OpenThoughts-Agent table that SFT quality bounds RL.

**L11 (advanced RL): distillation revisited.** L11 returns to learning from a teacher, but with full probability distributions rather than sampled text. It distinguishes off-policy distillation on a fixed set of teacher trajectories (which, like SFT, can leave the student in histories missing from the training set) from on-policy distillation, where the student generates the histories and the teacher supplies targets. This is the modern answer to L8's exposure-bias slide. L11's curriculum slide also restates the cold-start idea: demonstrations first, then learnable tasks, then harder ones.

**Where the lectures differ in emphasis.**

- **What SFT is for.** L1 and L7 present SFT as a capability builder in its own right (behavior cloning of tool calls and GUI actions). L8 and L10 increasingly present it as a cold start whose value is measured by what RL does next.
- **Where data quality comes from.** L6 and L7 emphasize verifiable environments and task creation. L8 emphasizes that verification is not enough: successful runs still carry bad habits, and task-source choice matters more than filters.
- **Teacher strength.** L7's Gym-Anything and L6's SWE-Gym treat a strong teacher as the obvious choice. L8's OpenThoughts-Agent evidence says the strongest model can be the weakest teacher.
- **How to fix exposure bias.** L8 names the problem (citing DAgger) but leaves the fix to later lectures. L9 prescribes on-policy RL; L11 prescribes on-policy distillation. Both share the principle that training states must come from the learner.
- **Harness versus weights.** L1 and L4 treat harness-side fixes as first-class alternatives; L8 notes that SFT bakes in harness conventions, so the harness choice leaks into the weights. This makes multi-harness data collection (L6, L8) the bridge between the two views.

## Mechanics

This section gives the exact objective, its gradient, the data formats, and the algorithms (masking, packing, filtering, mixing, DAgger, LoRA) with their costs.

### The masked SFT objective

For a dataset of rendered trajectories, each a token sequence with a mask, the objective is:

$$
\mathcal{L}(\theta) \;=\; -\frac{1}{Z}\sum_{i=1}^{N}\;\sum_{t=1}^{T_i} m_{i,t}\,\log p_\theta\!\left(x_{i,t}\mid x_{i,<t}\right)
$$

Here N is the number of trajectories in the batch, T\_i the token length of trajectory i, x\_{i,t} its t-th token, x\_{i,\<t} all earlier tokens, m\_{i,t} ∈ {0,1} the loss mask (1 for assistant-produced tokens, including each assistant turn's end-of-turn token), p\_θ the model's next-token distribution with weights θ, and Z a normalizer. Two common choices of Z are the total number of unmasked tokens in the batch (token-mean) and N times each sequence's own unmasked count (sequence-mean, which averages per-trajectory means).

$$
Z_{\text{token}} = \sum_{i}\sum_{t} m_{i,t}
\qquad
\mathcal{L}_{\text{seq}} = -\frac{1}{N}\sum_{i}\frac{\sum_t m_{i,t}\log p_\theta(x_{i,t}\mid x_{i,<t})}{\sum_t m_{i,t}}
$$

Under token-mean, trajectory i receives gradient weight proportional to its unmasked token count M\_i = Σ\_t m\_{i,t}. Under sequence-mean, every trajectory receives weight 1/N regardless of length. With one 50-token and one 2,000-token run, token-mean puts 50/2050 ≈ 2.4% of the weight on the short run; sequence-mean puts 50%.

### Its gradient, and why only the mask matters

The model produces logits z ∈ ℝ^V at each position (V is the vocabulary size), turned into probabilities by softmax: p\_k = e^{z\_k} / Σ\_j e^{z\_j}. For one unmasked position with target token y:

$$
\frac{\partial}{\partial z_k}\bigl(-\log p_y\bigr) \;=\; p_k - \mathbf{1}[k=y]
$$

where 1\[k=y\] is 1 for the target and 0 otherwise. So each position pushes the target's logit up by (1 − p\_y) and every other logit down by its own probability. A masked position (m = 0) contributes exactly zero gradient at its own output, but its *input* embedding still flows through attention into every later unmasked position. This is why masked observations still shape learning: the model learns to *use* them without learning to *produce* them.

### Why cross-entropy is imitation: the KL view

Let p\_data be the distribution of demonstrations. Taking the expectation of the per-sequence loss:

$$
\mathbb{E}_{x\sim p_{\text{data}}}\!\left[-\log p_\theta(x)\right]
\;=\; H(p_{\text{data}}) \;+\; \mathrm{KL}\!\left(p_{\text{data}}\,\|\,p_\theta\right)
$$

H(p\_data) is the entropy of the data, which does not depend on θ, and KL is the Kullback-Leibler divergence. Minimizing the loss therefore minimizes KL(p\_data ‖ p\_θ), the *forward* KL. Because this KL is large wherever p\_data > 0 but p\_θ is small, the model is pushed to cover every behavior in the data, including noise and bad habits. L11's on-policy distillation instead minimizes the *reverse* KL, KL(π\_θ ‖ q), on student-generated histories, which penalizes the student for putting mass where the teacher does not.

### Why observation tokens drop out: the trajectory factorization

L9 writes the probability of a trajectory τ given task x as a product of policy and environment terms:

$$
\log p_\theta(\tau\mid x) \;=\; \sum_{t}\log P\!\left(o_{t+1}, r_{t+1}\mid h_t, a_t, x\right) \;+\; \sum_{t}\log \pi_\theta\!\left(a_t\mid h_t\right)
$$

P is the environment's transition (it produces observation o and reward r), π\_θ is the policy, h\_t the history and a\_t the action. Only the second sum depends on θ. Each action is itself a token sequence, a\_t = (u\_{t,1}, …, u\_{t,m\_t}), so log π\_θ(a\_t | h\_t) = Σ\_k log π\_θ(u\_{t,k} | h\_t, u\_{t,\<k}). Maximizing the likelihood of a trajectory with respect to θ therefore means summing log-probabilities of exactly the action tokens. The loss mask is not a heuristic; it is what the factorization says. It also shows why the environment's text should not be a target: the model does not control it.

### Data formats

A trajectory in the widely used OpenAI-style message format, before rendering:

```json
{
  "task_id": "swe-gym/astropy-1234",
  "harness": "openhands-v1",
  "reward": 1,
  "messages": [
    {"role": "system", "content": "You are a coding agent...", "tools": [{"name": "bash", "parameters": {"cmd": "string"}}]},
    {"role": "user", "content": "test_ratio fails: 0.1+0.2 != 0.3"},
    {"role": "assistant", "reasoning": "Run the failing test first.", "tool_calls": [{"id": "c1", "name": "bash", "arguments": {"cmd": "pytest -q"}}]},
    {"role": "tool", "tool_call_id": "c1", "content": "1 failed, 41 passed"},
    {"role": "assistant", "content": "Fixed: use math.isclose."}
  ]
}
```

The same run in an ADP-style typed representation (simplified from the paper's figure; field names illustrative). Actions and observations are typed, and a web observation can keep both HTML and the accessibility tree:

```json
{
  "id": "sample-17",
  "content": [
    {"type": "TextObservation", "source": "user", "content": "test_ratio fails: 0.1+0.2 != 0.3"},
    {"type": "CodeAction", "language": "bash", "content": "pytest -q", "description": "Run the failing test first."},
    {"type": "TextObservation", "source": "environment", "content": "1 failed, 41 passed"},
    {"type": "APIAction", "function": "str_replace", "kwargs": {"old": "==", "new": "math.isclose"}},
    {"type": "MessageAction", "content": "Fixed: use math.isclose."}
  ],
  "details": {"dataset": "swe-gym", "reward": 1}
}
```

The pipeline is: raw dataset, then one converter to ADP, then one renderer per harness (OpenHands, SWE-Agent, AgentLab), then the model's chat template, then tokens and mask. With D datasets and H harnesses this needs D + H converters instead of D × H.

### Building the mask from character spans

```python
def render_and_mask(messages, template, tokenizer):
    text, spans = template.render(messages)        # spans: [(char_start, char_end)] of assistant outputs
    enc = tokenizer(text, return_offsets_mapping=True, add_special_tokens=False)
    mask = []
    for (a, b) in enc["offset_mapping"]:           # character range of each token
        mask.append(int(any(s <= a and b <= e for s, e in spans)))
    return enc["input_ids"], mask
# Each span starts AFTER the role header "<|im_start|>assistant\n" (supplied at inference)
# and ends AFTER the end-of-turn token "<|im_end|>" (produced by the model).
```

Cost: rendering and tokenizing are O(T) per trajectory; the naive span check is O(T × S) for S spans, or O(T + S) with a two-pointer sweep because both lists are sorted. Beware tokens that straddle a span boundary (a merged token covering a newline and the first character of the reply); a robust implementation decides by the token's start offset, and a unit test should assert that the decoded masked text equals the concatenated assistant outputs.

### Packing without splitting

Best-fit decreasing (BFD) is the heuristic L8 describes for Nemotron 3 Ultra ("the pack whose remaining capacity it most tightly fits"):

```text
input: trajectory lengths L_1..L_n, pack capacity C
sort lengths in decreasing order
for each length L:
    if L > C: reject (never truncate)
    among open packs with remaining >= L, choose the one with the SMALLEST remaining
    if none: open a new pack with remaining C
    place L there; remaining -= L
after packing: shuffle packs; keep identical prompts in different packs
```

Cost: sorting is O(n log n); the best-fit search is O(n × B) naively for B packs, or O(n log B) with a balanced tree keyed by remaining capacity. BFD is a classic bin-packing approximation; beyond the lecture, it is known to use at most about 11/9 of the optimal number of bins plus a small constant.

Inside a pack, conversations must not attend to each other. Instead of a block-diagonal mask matrix (O(C²) memory), modern kernels take cumulative sequence lengths and reset position ids at each boundary. The attention cost of a pack then drops from C² to Σ L\_j² over the conversations j in it:

$$
\text{cost}_{\text{cross-contaminated}} \propto \Bigl(\sum_j L_j\Bigr)^2
\qquad
\text{cost}_{\text{boundary-aware}} \propto \sum_j L_j^2
$$

L\_j is the token length of conversation j. For L8's example pack of 19K, 15K, 11K and 8K runs (53K tokens), boundary-aware attention costs 19²+15²+11²+8² = 771 (million token-pairs) versus 53² = 2,809, about 3.6 times less, and it is also the correct computation.

### Reweighting a mixture by tokens

Let domain d have n\_d examples of mean length L\_d. Its token share and the sampling multiplier needed to hit a target token share s\*\_d at the same total token budget are:

$$
s_d = \frac{n_d L_d}{\sum_j n_j L_j}
\qquad
 w_d = \frac{s^{*}_d}{s_d}
$$

w\_d is the number of epochs (up- or down-sampling factor) for domain d. With MAI-like numbers (Hands-on example 1), reaching 60/30/10 token shares from 89/9/2 requires multipliers of about 0.68, 3.29 and 4.91. A multiplier above roughly 3 to 4 means repeating the same examples many times, which risks memorization; the better fix is to collect more of that domain.

### Rejection sampling and expert iteration

```python
def build_sft_set(tasks, teacher, verify, k=4, process_filters=()):
    data = []
    for task in tasks:
        runs = [teacher.run(task) for _ in range(k)]          # k attempts per task
        good = [r for r in runs if verify(task, r)]           # outcome filter (tests, answer key)
        good = [r for r in good if all(f(r) for f in process_filters)]  # hygiene, loops, parse errors
        data.extend(good)
    return data

def expert_iteration(model, tasks, verify, rounds=3):       # ReST / ReST-EM (L9)
    for _ in range(rounds):
        data = build_sft_set(tasks, model, verify)           # the model is its own teacher
        model = sft(base_or_current(model), data)            # ordinary masked SFT loss
    return model
```

With success probability p per attempt, a task yields at least one kept run with probability 1 − (1 − p)^k. For p = 0.2 and k = 4 that is 1 − 0.8⁴ ≈ 0.59. The sampling cost per kept trajectory is k / (expected kept runs per task) = 1/p attempts. Hard tasks (small p) are expensive, and tasks with p = 0 yield nothing, which is why L11 recommends a curriculum. L9 shows that the expert-iteration loss, −Σ\_{τ: R(τ)=1} Σ\_t log π\_θ(a\_t | h\_t), is REINFORCE with binary rewards up to batching and dataset aggregation.

### DAgger and the compounding-error bound

```python
def dagger(expert, env, iters=5, rollouts=200, beta0=1.0):
    D = [(s, expert(s)) for s in expert_rollout_states(env)]   # start from demonstrations
    policy = train(D)
    for i in range(1, iters + 1):
        beta = beta0 * (0.5 ** i)                              # mix in the expert early, fade out
        for _ in range(rollouts):
            states = rollout(env, lambda s: expert(s) if rand() < beta else policy(s))
            D += [(s, expert(s)) for s in states]              # expert labels the LEARNER's states
        policy = train(D)                                      # aggregate: never drop old data
    return policy
```

In the analysis (Ross and Bagnell, 2010; Ross, Gordon and Bagnell, 2011), let ε be the policy's per-step error rate on the expert's state distribution and T the horizon. Behavior cloning can suffer total cost that grows quadratically:

$$
J(\hat{\pi}_{\text{BC}}) \;\le\; J(\pi^{*}) + T^{2}\epsilon
\qquad\text{versus}\qquad
J(\hat{\pi}_{\text{DAgger}}) \;\le\; J(\pi^{*}) + u\,T\,\epsilon_N + O(1)
$$

J is expected total cost over T steps, π\* the expert, ε\_N the best achievable error on the aggregated data after N iterations, and u a bound on how much one mistake can increase cost-to-go (small when mistakes are recoverable). The intuition for T²: an error at step t can leave the learner off-distribution for the remaining T − t steps, and summing over t gives order T². DAgger trains on the learner's own state distribution, so errors are counted where they happen and the bound is linear.

### LoRA: the update and its parameter count

$$
W' = W_0 + \frac{\alpha}{r}\,B A,\qquad B\in\mathbb{R}^{d_{\text{out}}\times r},\; A\in\mathbb{R}^{r\times d_{\text{in}}},\; r \ll \min(d_{\text{in}}, d_{\text{out}})
$$

W\_0 is the frozen pretrained matrix, A and B are trainable, r is the rank, and α a scaling constant. B starts at zero, so training begins exactly at the pretrained model. Trainable parameters per matrix are r(d\_in + d\_out) instead of d\_in × d\_out.

Worked count for a Llama-3-8B-style model (hidden size 4,096; MLP size 14,336; 8 key-value heads so k and v project to 1,024; 32 layers) with r = 16 on all seven linear layers:

| Matrix | Shape | LoRA parameters (r = 16) |
| --- | --- | --- |
| q, o | 4096 × 4096 | 16 × 8,192 = 131,072 each |
| k, v | 4096 → 1024 | 16 × 5,120 = 81,920 each |
| gate, up, down | 4096 ↔ 14336 | 16 × 18,432 = 294,912 each |
| Per layer |  | 1,310,720 |
| 32 layers |  | about 41.9M (about 0.5% of 8B) |

### Compute and memory for a run

Beyond the lecture, the standard estimate for training compute is about 6 floating-point operations per parameter per trained token (2 forward, 4 backward):

$$
C_{\text{train}} \approx 6\,N_{\text{params}}\,D_{\text{tokens}} \;+\; C_{\text{attn}}
$$

N\_params is the model size, D\_tokens the total tokens processed (all tokens, masked or not, because masked tokens still run forward and backward through the network), and C\_attn the extra attention cost, which grows with sequence length and matters at 100K+ tokens. For memory, full fine-tuning with Adam in mixed precision needs about 16 bytes per parameter for weights, gradients, fp32 master weights and two optimizer moments, before activations. Hands-on example 3 applies both to a realistic run.

## Hands-on

Three worked examples: a runnable data-pipeline program (render, mask, drift check, pack, mix, normalize), a runnable simulation of exposure bias and DAgger on L9's Number Search, and a compute-and-design walkthrough for a realistic SFT run.

### Example 1: from trajectory to training rows

This program takes one coding-agent trajectory through the steps of subsections 2, 3, 6 and 7 of *Core concepts*. It renders a ChatML-style template, records assistant spans, tokenizes with a regex stand-in for a real tokenizer, builds the loss mask, checks for template drift, packs 40 synthetic runs with best-fit decreasing, converts a sample-balanced mixture into token shares, and compares two loss normalizations. It uses only the standard library; the domain lengths in step 4 are made up so that the shares reproduce L8's MAI-Thinking-1 table. Save it as `sft_data_pipeline.py` and run `python3 sft_data_pipeline.py`.

```python
"""Toy agent-SFT data pipeline: render -> tokenize -> mask -> check -> pack -> count.
Standard library only. The tokenizer is a regex stand-in for a real BPE tokenizer."""
import json, random, re

SPECIAL = ["<|im_start|>", "<|im_end|>", "<tool_call>", "</tool_call>", "<think>", "</think>"]
TOKEN_RE = re.compile("|".join(re.escape(s) for s in SPECIAL) + r"|\w+|[^\w\s]|\s+")

def render(messages, add_generation_prompt=False, drop_old_thinking=False):
    """ChatML-style template. Returns the string and the (start, end) character
    spans of every assistant *output* (content + end-of-turn token)."""
    out, spans = [], []
    last_asst = max(i for i, m in enumerate(messages) if m["role"] == "assistant") if any(
        m["role"] == "assistant" for m in messages) else -1
    for i, m in enumerate(messages):
        out.append(f"<|im_start|>{m['role']}\n")            # role header: never a target
        body = m.get("content", "")
        if m["role"] == "assistant":
            think = m.get("thinking")
            if think and not (drop_old_thinking and i < last_asst):
                body = f"<think>\n{think}\n</think>\n" + body
            for call in m.get("tool_calls", []):
                body += f"\n<tool_call>\n{json.dumps(call)}\n</tool_call>"
            start = sum(map(len, out))
            out.append(body + "<|im_end|>")                 # end-of-turn IS a target
            spans.append((start, sum(map(len, out))))
            out.append("\n")
        else:
            out.append(body + "<|im_end|>\n")
    if add_generation_prompt:
        out.append("<|im_start|>assistant\n")
    return "".join(out), spans

def tokenize(text):
    return [(m.group(), m.start(), m.end()) for m in TOKEN_RE.finditer(text)]

def build_mask(tokens, spans):
    return [int(any(s <= a and b <= e for s, e in spans)) for _, a, b in tokens]

TRAJ = [
    {"role": "system", "content": "You are a coding agent. Tools: bash, str_replace."},
    {"role": "user", "content": "test_ratio fails: 0.1+0.2 != 0.3"},
    {"role": "assistant", "thinking": "Run the failing test first.", "content": "",
     "tool_calls": [{"name": "bash", "arguments": {"cmd": "pytest -q"}}]},
    {"role": "tool", "content": "1 failed, 41 passed"},
    {"role": "assistant", "thinking": "The assert compares floats.", "content": "",
     "tool_calls": [{"name": "str_replace", "arguments": {"old": "==", "new": "math.isclose"}}]},
    {"role": "tool", "content": "42 passed"},
    {"role": "assistant", "content": "Fixed: use math.isclose."},
]

# 1. Render, tokenize, mask
text, spans = render(TRAJ)
toks = tokenize(text)
mask = build_mask(toks, spans)
print(f"[1] {len(toks)} tokens, {sum(mask)} carry loss ({sum(mask)/len(toks):.0%})")
shown = [("[" + t.replace("\n", "\\n") + "]") if m else t.replace("\n", "\\n")
         for (t, _, _), m in zip(toks[:60], mask[:60])]
print("    first 60 tokens, [bracketed] = in loss:")
print("    " + "".join(shown)[:260] + " ...")
print(f"    observation words in loss: {[t for (t,a,b),m in zip(toks,mask) if m and t in ('passed','failed')]}")
eot = [m for (t, _, _), m in zip(toks, mask) if t == "<|im_end|>"]
print(f"    <|im_end|> mask bits (sys,user,asst,tool,asst,tool,asst): {eot}")

# 2. Template-drift check: every inference prefix must be a prefix of the training string
def drift_check(msgs, **kw):
    full, _ = render(msgs, **kw)
    bad = []
    for k, m in enumerate(msgs):
        if m["role"] == "assistant":
            prefix, _ = render(msgs[:k], add_generation_prompt=True, **kw)
            if not full.startswith(prefix):
                bad.append(k)
    return bad
print(f"[2] drift, consistent template: bad turns = {drift_check(TRAJ)}")
print(f"    drift, template that drops old <think> blocks: bad turns = "
      f"{drift_check(TRAJ, drop_old_thinking=True)}")

# 3. Best-fit-decreasing packing (no splitting), versus padding each run to max length
random.seed(0)
lengths = [random.choice([3, 5, 8, 11, 15, 17, 19, 29]) * 1000 + random.randint(0, 900) for _ in range(40)]
CAP = 32_768
def pack_bfd(lens, cap):
    bins = []                                     # each bin: [remaining, [lengths]]
    for L in sorted(lens, reverse=True):
        if L > cap:
            raise ValueError("run longer than pack; never truncate silently")
        fits = [b for b in bins if b[0] >= L]
        if fits:
            best = min(fits, key=lambda b: b[0])     # tightest remaining capacity
            best[0] -= L; best[1].append(L)
        else:
            bins.append([cap - L, [L]])
    return bins
bins = pack_bfd(lengths, CAP)
used = sum(lengths)
print(f"[3] {len(lengths)} runs, {used:,} tokens")
print(f"    padded to {CAP:,} each: {len(lengths)} rows, utilization {used/(len(lengths)*CAP):.0%}")
print(f"    BFD packed:           {len(bins)} rows, utilization {used/(len(bins)*CAP):.0%}")
for b in bins[:3]:
    print(f"      pack: {b[1]}  unused {b[0]:,}")

# 4. Samples versus tokens in a data mixture
mix = {"coding/STEM": (5_600, 9_000), "agentic": (1_100, 4_700), "chat/safety": (3_300, 350)}
tot_n = sum(n for n, _ in mix.values()); tot_t = sum(n * L for n, L in mix.values())
print("[4] domain        samples  tokens")
for d, (n, L) in mix.items():
    print(f"    {d:<14}{n/tot_n:>7.0%}{n*L/tot_t:>8.0%}")
target = {"coding/STEM": 0.6, "agentic": 0.3, "chat/safety": 0.1}
print("    epochs per domain to hit token target 60/30/10 at the same total tokens:")
for d, (n, L) in mix.items():
    print(f"      {d:<14} x{target[d] * tot_t / (n * L):.2f}")

# 5. Loss normalization: token-mean vs sequence-mean
nll = {"short": [2.0] * 50, "long": [0.5] * 2000}          # per-token NLL of two runs
flat = nll["short"] + nll["long"]
print(f"[5] token-mean loss {sum(flat)/len(flat):.3f}  |  sequence-mean loss "
      f"{(sum(nll['short'])/50 + sum(nll['long'])/2000)/2:.3f}")
print(f"    share of gradient weight on the short run: token-mean {50/len(flat):.1%}, "
      f"sequence-mean 50.0%")
```

Output:

```text
[1] 199 tokens, 118 carry loss (59%)
    first 60 tokens, [bracketed] = in loss:
    <|im_start|>system\nYou are a coding agent. Tools: bash, str_replace.<|im_end|>\n<|im_start|>user\ntest_ratio fails: 0.1+0.2 != 0.3<|im_end|>\n<|im_start|>assistant\n[<think>][\n][Run][ ][the][ ][failing][ ][test] ...
    observation words in loss: []
    <|im_end|> mask bits (sys,user,asst,tool,asst,tool,asst): [0, 0, 1, 0, 1, 0, 1]
[2] drift, consistent template: bad turns = []
    drift, template that drops old <think> blocks: bad turns = [4, 6]
[3] 40 runs, 571,721 tokens
    padded to 32,768 each: 40 rows, utilization 44%
    BFD packed:           19 rows, utilization 92%
      pack: [29847]  unused 2,921
      pack: [29453, 3095]  unused 220
      pack: [29414]  unused 3,354
[4] domain        samples  tokens
    coding/STEM       56%     89%
    agentic           11%      9%
    chat/safety       33%      2%
    epochs per domain to hit token target 60/30/10 at the same total tokens:
      coding/STEM    x0.68
      agentic        x3.29
      chat/safety    x4.91
[5] token-mean loss 0.537  |  sequence-mean loss 1.250
    share of gradient weight on the short run: token-mean 2.4%, sequence-mean 50.0%
```

What to notice:

- **The end-of-turn pattern \[0, 0, 1, 0, 1, 0, 1\].** Only assistant turns train their `<|im_end|>`. The role header `<|im_start|>assistant` is outside the mask (it appears unbracketed before `[<think>]`), because the harness supplies it at inference.
- **No observation text carries loss.** "passed" and "failed" appear in tool messages only, so the list is empty. Remove the mask and the model would learn to write test results itself.
- **59% of tokens carry loss here, but only because the observations are tiny.** In real coding runs, logs and file contents dominate and the trained fraction is often far lower, so token budgets for "assistant tokens" and "total tokens" differ a lot.
- **The drift check catches the classic bug.** A template that drops `<think>` from earlier turns produces training strings whose prefixes differ from what the model sees at turns 4 and 6 during inference. The consistent template passes.
- **Packing doubles utilization (44% to 92%) without truncating anything.** Big runs get packs to themselves or pair with a small one (\[29453, 3095\] leaves only 220 tokens unused).
- **Samples lie about tokens.** 33% of examples become 2% of tokens; fixing it by resampling alone would need about 5 epochs of the chat/safety data.
- **Normalization is a real choice.** Token-mean gives the short run 2.4% of the weight; sequence-mean gives it 50%. The two losses (0.537 versus 1.250) are not comparable across configurations.

### Example 2: exposure bias and DAgger on Number Search

This program reproduces subsection 9 of *Core concepts* on L9's running example: a hidden integer in 1 to 16, four guesses, feedback higher or lower. The teacher is binary search, wrapped as `call_llm(messages) -> str`, **a stub** that stands in for a real teacher model. The student is a lookup table from state (candidate interval, guesses left) to the majority action in its training data; in states it never saw, it falls back to a weak "base model" that guesses at random in 1 to 16. At test time the student slips 15% of the time to a plausible but different guess, like L8's "edit B". The program compares behavior cloning, noisy-teacher collection (DART-style) and DAgger. Standard library only; run `python3 dagger_number_search.py`.

```python
"""Exposure bias in Number Search (L9's running example): behavior cloning vs DAgger.
Hidden integer in 1..16, four guesses, feedback 'higher'/'lower'. Standard library only."""
import random
from collections import Counter, defaultdict

N, BUDGET, EPS = 16, 4, 0.15        # EPS: chance the student takes a plausible-but-different action

def call_llm(messages):
    """STUB for a teacher LLM. It reads the state in the last message and answers with
    the binary-search guess. Swap in a real model call here."""
    lo, hi, left = map(int, messages[-1]["content"].split())
    return f"guess {(lo + hi) // 2}"

def teacher(state):
    return int(call_llm([{"role": "user", "content": " ".join(map(str, state))}]).split()[1])

class TablePolicy:
    """Student = lookup table from state to the majority action seen in training.
    States never seen in training fall back to a weak 'base model': a random guess in 1..16."""
    def __init__(self): self.table = {}
    def fit(self, pairs):
        votes = defaultdict(Counter)
        for s, a in pairs: votes[s][a] += 1
        self.table = {s: c.most_common(1)[0][0] for s, c in votes.items()}
    def act(self, state, rng, noisy=True):
        lo, hi, _ = state
        if noisy and rng.random() < EPS:             # a different but valid guess
            return rng.randint(lo, hi)
        return self.table.get(state, rng.randint(1, N))

def rollout(policy_fn, target, rng):
    """Returns (success, visited states). State = (lo, hi, guesses_left)."""
    lo, hi, visited = 1, N, []
    for left in range(BUDGET, 0, -1):
        s = (lo, hi, left); visited.append(s)
        g = policy_fn(s, rng)
        if g == target: return True, visited
        if g < target: lo = max(lo, g + 1)
        else: hi = min(hi, g - 1)
        if lo > hi: return False, visited
    return False, visited

def evaluate(pol, rng, n=4000):
    wins, unseen, total = 0, 0, 0
    for _ in range(n):
        ok, vis = rollout(lambda s, r: pol.act(s, r), rng.randint(1, N), rng)
        wins += ok; total += len(vis); unseen += sum(s not in pol.table for s in vis)
    return wins / n, unseen / total

rng = random.Random(0)
exp_rate = sum(rollout(lambda s, r: teacher(s), t, rng)[0] for t in range(1, N + 1)) / N
print(f"teacher (binary search), noiseless: success {exp_rate:.3f}")
ceiling = TablePolicy(); ceiling.table = {(lo, hi, k): (lo + hi) // 2 for lo in range(1, N + 1)
                                          for hi in range(lo, N + 1) for k in range(1, BUDGET + 1)}
print(f"ceiling: student with every state labelled, still slipping {EPS:.0%}: "
      f"success {evaluate(ceiling, rng)[0]:.3f}")

# 1. Behavior cloning on teacher trajectories: more runs of the SAME tasks add no new states
for n_demos in (16, 1600):
    pairs = []
    for _ in range(n_demos):
        _, vis = rollout(lambda s, r: teacher(s), rng.randint(1, N), rng)
        pairs += [(s, teacher(s)) for s in vis]
    bc = TablePolicy(); bc.fit(pairs)
    sr, un = evaluate(bc, rng)
    print(f"BC  {n_demos:>5} demos: {len(bc.table):>3} states covered | "
          f"success {sr:.3f} | visited states unseen in training {un:.1%}")

# 2. Noisy-teacher collection (DART-style): the teacher sometimes slips while acting,
#    but every visited state is labelled with the teacher's correct action
pairs = []
for _ in range(1600):
    _, vis = rollout(lambda s, r: r.randint(s[0], s[1]) if r.random() < EPS else teacher(s),
                     rng.randint(1, N), rng)
    pairs += [(s, teacher(s)) for s in vis]
dart = TablePolicy(); dart.fit(pairs)
sr, un = evaluate(dart, rng)
print(f"noisy-teacher 1600 demos: {len(dart.table):>3} states covered | success {sr:.3f} | "
      f"unseen {un:.1%}")

# 3. DAgger: the student drives, the teacher labels the states the student actually reaches
data = []
for _ in range(16):
    _, vis = rollout(lambda s, r: teacher(s), rng.randint(1, N), rng)
    data += [(s, teacher(s)) for s in vis]
pol = TablePolicy(); pol.fit(data)
for it in range(1, 6):
    for _ in range(200):                       # 200 student rollouts per iteration
        _, vis = rollout(lambda s, r: pol.act(s, r), rng.randint(1, N), rng)
        data += [(s, teacher(s)) for s in vis]  # aggregate: keep all earlier data
    pol.fit(data)
    sr, un = evaluate(pol, rng)
    print(f"DAgger iter {it}: {len(pol.table):>3} states covered | success {sr:.3f} | "
          f"unseen {un:.1%} | dataset {len(data)} pairs")

# 4. Where BC fails: the first off-distribution step
bc_table = TablePolicy(); bc_table.fit([(s, teacher(s)) for t in range(1, N + 1)
                                        for s in rollout(lambda s, r: teacher(s), t, rng)[1]])
print("\ntrace, target 11, student slips on turn 1 (guesses 2 instead of 8):")
state, g = (1, 16, 4), 2
print(f"  state {state} -> guess {g} (slip) -> 'higher'")
state = (3, 16, 3)
print(f"  state {state} in BC table? {state in bc_table.table}  -> BC guesses at random;"
      f" DAgger table says {pol.table.get(state)}")
```

Output:

```text
teacher (binary search), noiseless: success 0.938
ceiling: student with every state labelled, still slipping 15%: success 0.862
BC     16 demos:  14 states covered | success 0.718 | visited states unseen in training 17.9%
BC   1600 demos:  15 states covered | success 0.749 | visited states unseen in training 17.1%
noisy-teacher 1600 demos: 147 states covered | success 0.850 | unseen 0.8%
DAgger iter 1:  69 states covered | success 0.812 | unseen 8.3% | dataset 710 pairs
DAgger iter 2: 106 states covered | success 0.827 | unseen 4.3% | dataset 1365 pairs
DAgger iter 3: 138 states covered | success 0.843 | unseen 2.6% | dataset 2029 pairs
DAgger iter 4: 154 states covered | success 0.842 | unseen 2.0% | dataset 2698 pairs
DAgger iter 5: 168 states covered | success 0.849 | unseen 0.8% | dataset 3373 pairs

trace, target 11, student slips on turn 1 (guesses 2 instead of 8):
  state (1, 16, 4) -> guess 2 (slip) -> 'higher'
  state (3, 16, 3) in BC table? False  -> BC guesses at random; DAgger table says 9
```

What to notice:

- **The ceiling is 0.862, not 0.938.** Even a student that knows the right action in every state loses some games to its own 15% slips. Any method's score should be compared with this ceiling, not with the noiseless teacher.
- **Behavior cloning plateaus because coverage plateaus.** 1,600 teacher demonstrations cover only 15 states, the same 15 the teacher always visits. About 17% of the states the student reaches are unseen, and there it acts like the base model. This is L8's "more runs of the same tasks flattens out" in miniature.
- **DAgger closes most of the gap with fewer labelled pairs than the 1,600-run BC set.** After five rounds (3,373 pairs) it reaches 0.849, and the unseen-state rate falls from 8.3% to 0.8%. The teacher labels the states the *student* reaches, which is exactly the distribution that matters.
- **Noisy-teacher collection also works here (0.850).** Perturbing the demonstrator's actions while labelling with correct actions fills in recovery states. It needs a teacher you can perturb, and it only covers the kinds of mistakes you simulated.
- **The trace shows the failure mode.** After the slip to guess 2, state (3, 16, 3) is absent from the BC table, so BC guesses blindly; DAgger has learned the recovery (guess 9, the midpoint of the remaining interval).
- **Mapping to LLM agents.** "Ask the expert at the learner's state" becomes "ask a teacher model for the next action given the student's own history". With the teacher's full probability distribution as the target, this is L11's on-policy distillation.

### Example 3: planning a real SFT run (numeric and design walkthrough)

Goal: fine-tune an 8B dense model into a terminal and coding agent, as a cold start for RL, similar in scale to L8's OT-Agent-SFT-8B (10K) row. All numbers below are estimates for planning, beyond the lecture.

**Step 1: size the data.** After rejection sampling and process filters you keep 10,000 trajectories with a mean of 24,000 tokens each: 240M tokens per epoch. Suppose 20% of tokens are assistant-produced (the rest are observations and prompts); then 48M tokens carry loss per epoch. Plan 3 epochs: 720M tokens processed. Note that compute depends on the 720M processed tokens, not the 144M trained tokens, because masked tokens still go forward and backward through the network.

**Step 2: estimate compute.** Linear-layer compute is 6 × 8e9 × 7.2e8 ≈ 3.46e19 FLOPs. Attention adds more at this length. With boundary-aware packing, a 24K-token run has an average causal context of about 12K tokens; for a Llama-style 8B model (hidden 4,096, 32 layers) that is roughly 3 × 4 × 12,000 × 4,096 × 32 ≈ 1.9e10 FLOPs per token, about 39% on top of the 6N term. The total is about 4.8e19 FLOPs. On H100s at a realistic 40% utilization of the roughly 989 TFLOPS bf16 dense peak, that is about 34 GPU-hours, or roughly 4 to 5 hours on one 8-GPU node.

**Step 3: choose full fine-tuning or LoRA.**

| Option | Memory (weights + optimizer) | Fits on | Fit for this job |
| --- | --- | --- | --- |
| Full fine-tuning | 16 bytes × 8e9 ≈ 128 GB, sharded with FSDP or ZeRO-3 | one 8 × 80 GB node | yes: teaching new formats and long-horizon habits from 240M tokens |
| LoRA r = 16, all linear layers | 16 GB frozen bf16 weights + about 0.7 GB adapter state | a single 80 GB GPU (with activation checkpointing) | good for adapting to one harness; watch capacity at this data size |
| QLoRA | about 5 GB 4-bit weights + adapter state | a 24 to 48 GB GPU | prototyping and ablations |

For an RL cold start at this data size, full fine-tuning is the common choice. LoRA is a strong option for fast ablations (for example, comparing two teachers, as L8 recommends).

**Step 4: set the schedule.** Pack into rows of 32,768 tokens with best-fit decreasing; at about 92% utilization (Example 1) that is about 7,960 rows per epoch. Reject any trajectory longer than 32,768 rather than truncating it, or raise the row length. With a global batch of 64 rows (about 1.9M tokens per step), one epoch is about 124 steps and three epochs about 373 steps. Use a 3% warmup (about 11 steps), a peak learning rate around 1e-5 for full fine-tuning (L8's frontier runs use 1.5e-5 to 1.7e-5), and cosine decay to about 1e-6. For LoRA, start near 1e-4.

**Step 5: balance the mixture by tokens.** You also want general chat data to limit forgetting. Five thousand chat examples of 800 tokens add only 4M tokens, about 1.6% of the total, even though they are a third of all examples. To reach a 10% token share you need about 26.7M general tokens, around 33,000 such examples. Collect more rather than repeating 5,000 examples seven times.

**Step 6: plan evaluation and checkpoint selection.**

1. Overfit 20 trajectories first; loss should approach zero within a few dozen steps (L8).
2. Decode masked tokens of 5 random rows and read them.
3. Hold out about 200 tasks, split by repository, with all runs of a task on one side.
4. Every 60 steps, run the held-out tasks in the target harness and in a second harness. Track success, empty-patch rate, stuck-in-loop rate, mean turns and tool-call parse errors.
5. Run a small general-capability suite to catch regressions (L8, MAI).
6. Since RL follows, keep checkpoints from each epoch and pick the RL start by a short RL pilot or by success plus diversity (pass@k and output variety), not by the single best SFT score (L8, OpenThoughts-Agent).

What to notice:

- **Processed tokens, not trained tokens, set the bill.** Heavy observation masking does not make training cheaper.
- **Attention is not negligible for agent SFT.** At 24K tokens it adds about 40%; at 128K and beyond it dominates, which is why L3's context parallelism and L8's packing choices matter.
- **An 8B agent SFT run is affordable.** Tens of GPU-hours per run means ablating teachers, filters and task sources, which L8 says matter most, is realistic even for a small team.
- **The mixture needs data, not multipliers.** Token-balancing by repetition quickly turns into memorization of the minority domain.

## Design patterns, pitfalls and checklist

Most agent SFT failures come from the data pipeline, not the optimizer; the patterns below keep the pipeline honest, and the table maps common symptoms to their usual causes.

### Named patterns

- **Verify-then-imitate (rejection sampling).** Run a teacher on tasks with checkable outcomes, keep only passing runs, then fine-tune. *When:* whenever tasks have tests, answer keys or checklists (L6 SWE-Gym, L7 Gym-Anything, L10 WebDancer). Pair it with process filters, because passing runs can still carry bad habits (L8, Nemotron).
- **Interlingua format (ADP).** Convert every dataset once into a typed trajectory schema and render once per harness. *When:* you combine more than two datasets or target more than one harness; it turns D × H converters into D + H.
- **Multi-harness collection.** Collect the same task distribution in two or more harnesses. *When:* the model will be deployed in more than one agent framework, or you want it to learn the task rather than one harness's quirks (L6, L8).
- **Token-balanced mixing.** Specify the mixture in tokens, then derive per-domain sampling multipliers; collect more data where multipliers exceed about 3. *When:* always; example-count mixtures silently starve short-example domains (L8, MAI).
- **Teacher bake-off.** Distill from two or more teachers on a small budget and keep the teacher whose *student* scores best. *When:* before any large-scale data generation (L8, OpenThoughts-Agent).
- **New tasks over more runs.** Spend sampling budget on new tasks before more rollouts of the same tasks. *When:* the scaling curve for extra rollouts has flattened (L8, OpenThoughts-Agent).
- **Recovery-preserving masking.** Keep trajectories where the agent erred and recovered; keep the error in context but consider masking the erroneous action out of the loss. *When:* you want the model to learn to notice and fix failures without learning to cause them (L8's discussion question).
- **Learner-state labelling (DAgger or on-policy distillation).** Let the student act and have a teacher label or score its histories. *When:* the SFT model does well on the first steps but degrades after its first deviation (L8, L9, L11).
- **RL-aware cold start.** Select the SFT checkpoint by how well RL improves it, not by its own best score. *When:* RL follows SFT (L8, OpenThoughts-Agent and MAI; L10, DR Tulu).
- **Mid-train then SFT.** Continue pretraining on agent trajectories plus general data before SFT. *When:* you control the base model and have large amounts of agentic data (L10, AgentFounder).

### Failure modes: symptoms and fixes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Model writes fake tool results after its call | observation tokens in the loss, or end-of-turn token not trained | assistant-only mask; include \`< |
| Model does not stop; runs past its turn | end-of-turn token masked out (a role-header-style mistake) | train the end-of-turn token; check `train_on_eos` or equivalent |
| Tool calls fail to parse at inference but loss was low | train/serve template mismatch; harness expects different syntax | render with the serving template; drift check on every assistant prefix; parse-check all training calls |
| Behavior differs between first and later turns | template drift (e.g. reasoning dropped from earlier turns only at inference) | make training and inference render identical prefixes; test with a drift check (Hands-on 1) |
| Model loops edit-test or leaves debug prints | imitating messy but successful runs | process filters (loop detection, patch hygiene); drop or mask offending actions |
| Good on held-out split, poor on new repositories | train/test leakage by task or repository | split by task and by repository; all runs of one task on one side |
| Strong in one harness, weak in another | single-harness data | multi-harness collection; evaluate in two harnesses |
| General chat or safety regressed | narrow data; mixture balanced by samples; too many epochs | token-balanced general data; lower LR or fewer epochs; LoRA; evaluate non-target skills |
| Loss will not drop even on tiny data | broken mask, labels shifted, tokenizer or template mismatch | overfit-20 test; inspect a batch of token ids and labels by hand |
| Agent fine for 3 to 5 steps, then derails | exposure bias; no recovery states in data | recovery trajectories, noise injection, DAgger or on-policy distillation, then RL |
| MoE model collapses onto a few experts | narrow SFT data with weak load balancing | stronger routing-balance loss during SFT; higher dropout (L8, MAI) |
| RL after SFT barely improves | SFT over-trained, low diversity; or tasks too hard (all-fail groups) | start RL from an earlier checkpoint; filter RL tasks to those with mixed outcomes |
| Unexpected hallucinations in long runs | truncated trajectories in training | never truncate; reject over-length runs or raise row length |

### Builder's checklist

- [ ] The chat template used for training is byte-identical to the one used for serving, and a drift check passes on every assistant prefix.
- [ ] The loss mask covers assistant content and each assistant end-of-turn token, and excludes role headers, system, user and tool text; decoded masked tokens have been read by a human.
- [ ] Every training tool call parses with the target harness's parser, and every conversation ends the way the harness expects.
- [ ] Trajectories passed an outcome check (tests, answer key or checklist) and process filters (loops, debug leftovers, parse errors, timeouts).
- [ ] At least two teachers were compared on a small budget, judged by student performance.
- [ ] Task sources were chosen deliberately (four to eight good sources), and extra budget goes to new tasks before extra rollouts.
- [ ] The mixture is specified and reported in tokens as well as examples; no domain relies on more than about 3x repetition.
- [ ] Data comes from more than one harness if the model will run in more than one.
- [ ] Packing is boundary-aware (no cross-conversation attention), and no trajectory is truncated.
- [ ] The loss normalization (token-mean or sequence-mean) is known and constant across gradient accumulation.
- [ ] The model overfits 20 examples before the full run starts.
- [ ] Held-out tasks are split by task and by repository, and evaluated by running the agent in the target harness.
- [ ] Non-target capabilities (general chat, instruction following, safety) are evaluated before and after.
- [ ] Checkpoints from several points in training are kept; if RL follows, the start checkpoint is chosen with RL in mind.
- [ ] The chosen full-fine-tuning or LoRA setup, learning rate and epochs are recorded with the data version, so the run can be reproduced.

## Landscape

The tables below collect the systems, datasets, benchmarks and tools that the lectures use to discuss agent SFT, with their key published numbers; rows are newest first within each table.

### Training recipes and models

| Name | What it is | Key numbers and results | Source |
| --- | --- | --- | --- |
| Kimi K3 (Moonshot AI, 2026) | frontier model; SFT, then RL domain experts, then on-policy distillation | tool calling and long tasks learned in SFT before any RL; XTML template with separate end-of-turn tokens | L8 |
| Nemotron 3 Ultra (NVIDIA, 2026) | open frontier MoE with released data and recipe | SFT packed at 294,912 then 515,000 tokens, batch 64, LR 1.5e-5 to 1e-6; at least 2 harnesses per task distribution; SFT to 512K after 1M-token continued pretraining | L3, L6, L8 |
| MAI-Thinking-1 (Microsoft AI, 2026) | frontier MoE with self-distillation SFT | packed 128K, batch 2,048, LR 1.7e-5 to 5.2e-6, 2% warmup; mixture 56/11/33% by samples became 89/9/2% by tokens; routing balance 1,000x stronger in SFT than RL, dropout 0.15 | L8 |
| K2 Horizon (2026) | fully open model with stage-by-stage training table | mid-training 1.43T tokens; SFT 332B tokens at 512K in three phases; released loss curves and intermediate checkpoints | L8 |
| OpenThoughts-Agent (Raoof et al., 2026) | open data-recipe study for agentic SFT and RL, 8B scale | cold-start SFT + RL average 21.7 vs 15.9 SFT only vs 3.6 RL only; minimum-turns filter best; GPT-5.3-Codex weakest teacher; paper abstract reports 44.8% average over seven benchmarks | L8 |
| CUA-Gym (Wang et al., 2026) | computer-use training environments | 3,578 SFT demonstrations, then GSPO on 10,858 verified tuples; OSWorld 62.2% to 72.6% | L7 |
| Gym-Anything (Aggarwal et al., 2026) | generator of real-software environments and tasks | 200 applications, 12,103 tasks; about 2,000 distilled Kimi-K2.5 trajectories lift a Qwen3-VL-2B student from 12.7 to 22.5 checklist score, 1.6% to 4.4% perfect | L7 |
| DR Tulu (Shao, Asai et al., 2025; ICML 2026) | open deep-research agent with evolving-rubric RL | full SFT mixture is the best RL start; even 5% of SFT data beats no SFT | L10 |
| Tongyi DeepResearch (2025) | web research agent | over 20% of SFT samples contain more than 10 tool calls; collect-filter-imitate pipeline | L10 |
| AgentFounder (Scaling Agents via Continual Pre-training, 2025; ICLR 2026) | agentic mid-training before SFT | same SFT data: BrowseComp-en 28.6 to 39.9, BrowseComp-zh 35.6 to 43.3, GAIA 71.8 to 72.8 | L10 |
| DeepSeek-R1 (2025) | reasoning model | R1-Zero: RL with no SFT, mixed languages and poor readability; R1: cold-start SFT on a few thousand curated examples first | L8 |
| BalanceSFT / FunReason (Hao et al., 2025) | token reweighting within assistant turns for function calling | Qwen2.5-Coder BFCL multi-turn 38.25 to 47.00 with both modules | L8 |
| SWE-Gym (Pan et al., 2024) | executable environments from real GitHub issues | 2,438 tasks; 491 passing teacher runs lift Qwen2.5-Coder-32B from 7.0% to 20.6% on SWE-Bench Verified and 3.0% to 15.3% on Lite | L6, L8 |
| FireAct (Chen et al., 2023) | early language-agent fine-tuning study | 500 GPT-4 trajectories raise Llama-2-7B's HotpotQA score by 77% | [arXiv](https://arxiv.org/abs/2310.05915) |

### Datasets and data infrastructure

| Name | What it is | Key numbers | Source |
| --- | --- | --- | --- |
| MolmoWebMix (Gupta et al., 2026) | web-agent SFT mixture | 36K human + 105K synthetic task trajectories | L7 |
| Agent Data Protocol (Song et al., 2025; ICLR 2026 oral) | typed interlingua for agent trajectories plus converters | 13 datasets unified; about 20% average gain over base models; cross-task mixture beats single-source (SWE-Bench +5.6, WebArena +4.1, AgentBench +4.2, GAIA +8.5) | L8 |
| AgentNet / OpenCUA (Wang et al., 2025) | human computer-use demonstrations | 22,625 released trajectories across 3 operating systems | L7 |
| SWE-smith (Yang et al., 2025) | procedurally generated bug-fix tasks | 50K task instances from 128 repositories; SWE-agent-LM-32B reaches 40.2% on SWE-bench Verified; top task source in OpenThoughts-Agent | L6, L8 |
| Nebius SWE trajectories (2024) | SWE-agent rollouts from open-weight models | 13.4K trajectories | L8 (ADP table) |
| Orca AgentInstruct (Mitra et al., 2024) | synthetic tool-use instruction data | 1,046.1K examples | L8 (ADP table) |
| Synatra (Ou et al., 2024) | synthetic web demonstrations from tutorials | 99.9K | L8 (ADP table) |
| Code-Feedback (Zheng et al., 2024) | code generation with runtime feedback | 66.4K, manual | L8 (ADP table) |
| AgentInstruct (AgentTuning, Zeng et al., 2023) | mixed browsing, database and OS trajectories | 1.9K; its OS subset ranked 95th as a task source in OpenThoughts-Agent | L8 |
| Mind2Web (Deng et al., 2023) | human web demonstrations on real websites | 1.0K in ADP's table | L7, L8 |

### Benchmarks used to judge agent SFT

| Benchmark | What it measures | Where it appears |
| --- | --- | --- |
| SWE-bench Verified (500) and Lite (300) | resolving real GitHub issues, checked by repository tests | L6, L8 (SWE-Gym, OpenThoughts-Agent uses a 100-task subset) |
| Terminal-Bench 2.0 and OT-TBLite | multi-step terminal tasks | L8 |
| BFCL | function-calling accuracy, single- and multi-turn | L8 (BalanceSFT) |
| WebArena, AgentBench, GAIA | web tasks, multi-environment agent tasks, general assistant tasks | L8 (ADP) |
| BrowseComp (en, zh) | hard web-browsing questions | L10 |
| OSWorld-Verified | computer-use tasks with programmatic checks | L7 |

### Training tools

| Tool | Role in agent SFT | Key settings |
| --- | --- | --- |
| TRL `SFTTrainer` (Hugging Face) | reference SFT trainer | `assistant_only_loss` (needs generation markers in the template), `completion_only_loss`, packing with best-fit decreasing (`bfd`) and padding-free batches; default LR 2e-5 |
| Axolotl | config-driven fine-tuning | `roles_to_train`, `train_on_eos` |
| LLaMA-Factory | config-driven fine-tuning | `train_on_prompt`, `mask_history` |
| PEFT (Hugging Face) | LoRA and QLoRA adapters | rank, alpha, target modules (all linear layers recommended) |
| FlashAttention variable-length kernels | boundary-aware packing | cumulative sequence lengths; up to 2x throughput reported on variable-length data |

## Open problems

Agent SFT works well in practice, but most of its recipe is still empirical: the questions below are ones the lectures leave open or answer with a single study, and each has a concrete reason it has not been settled.

**1. What should the loss mask be for agent trajectories?** L8 states it plainly: no published experiment changes the mask for agent SFT and measures the effect. The open choices are many: train on observations or not, train on reasoning or only on actions, train on a wrong action that the run later fixes, and how to weight long reasoning against short tool calls (BalanceSFT is one single-turn-heavy data point). *Why it is hard:* the experiment is cheap at 8B scale, but results may not transfer across harnesses, lengths and model sizes. The single-turn evidence (Shi et al., 2024; Chatterjee et al., 2025) points in different directions depending on prompt length, answer length and data size, and agent data sits at the opposite corner of all three.

**2. How to learn recovery without learning the error.** L8's discussion question (keep the run that made a wrong edit and recovered?) has no tested answer. Masking the wrong edit while keeping it in context is a plausible fix. *Why it is hard:* in a real trajectory the boundary between "mistake" and "exploration" is fuzzy; a failed test can be a deliberate probe. Labeling which actions were errors needs either a judge model or a counterfactual run, and both are noisy or expensive.

**3. Measuring process quality, not just outcomes.** Rejection sampling checks the outcome; L8 shows passing runs still carry loops, dead reads and leftover `print(` calls. The best filter in OpenThoughts-Agent was a crude turn count, which L8 admits is a proxy for effort, not quality. *Why it is hard:* there is no ground truth for "a good way to solve this task". Several distinct solutions can be equally good (L9's task mismatch), and a learned process judge brings its own biases into the data.

**4. Predicting teachability.** OpenThoughts-Agent found that the strongest benchmark model, GPT-5.3-Codex, produced the weakest student. Nobody yet has a metric that predicts, before training, which teacher's trajectories a student will learn most from. *Why it is hard:* candidate explanations (terse or hidden reasoning, harness-specific habits, a capability gap too large for the student) all interact, and each test requires a full distill-and-evaluate run per teacher.

**5. Choosing the SFT checkpoint for RL.** L8's winning recipe started RL from a checkpoint that scored lower on its own (15.1 versus 15.9). MAI says the SFT model should be "selected with RL in mind", but offers no cheap test for it. *Why it is hard:* the real criterion (how much RL will improve this checkpoint) can only be measured by running RL, which is the expensive step. Proxies such as output entropy, pass@k versus pass@1, or diversity of strategies are plausible but unvalidated for agents.

**6. Closing the exposure-bias gap at agent scale.** DAgger and on-policy distillation (L11) fix the training-running mismatch in principle. *Why it is hard:* each round requires live environments to roll the student out, and a teacher to label every visited history. Across 50-turn runs with sandboxes, that is costly. Token-level on-policy distillation also needs the teacher's full next-token probabilities, which closed API teachers do not expose and which require a shared tokenizer.

**7. Harness-independent skill.** Trajectories teach a harness's conventions along with the task (L8, L6). Multi-harness collection helps, but it is unclear how many harnesses suffice, and what happens when the deployed harness compresses or summarizes context in ways never seen in training (a form of template drift). *Why it is hard:* harnesses differ in action spaces, prompts and context policies, and there is no agreed benchmark that holds the task fixed while varying the harness.

**8. Task supply and data scaling laws.** L8 shows more tasks beat more runs of the same tasks, and task source matters most. *Why it is hard:* tasks with checkable outcomes are the bottleneck. Synthetic generators (SWE-smith, Gym-Anything) scale, but their distribution may not match real work, and there is no published scaling law for agent SFT that separates tasks, runs per task and tokens per run.

**9. Forgetting and MoE dynamics under narrow data.** L8 (via MAI) shows that mixture choices move capabilities you did not target, and that MoE routing collapses on narrow agent data. *Why it is hard:* the public SFT literature is almost all on dense models, and the frontier MoE recipes report fixes (1,000x routing-balance weight, dropout 0.15) without ablations that explain them.

**10. Evaluation that reflects deployment.** Published numbers can be the best of several harnesses (L8), and offline next-action accuracy is a poor proxy (L7). *Why it is hard:* honest evaluation needs held-out repositories, fixed harnesses, repeated runs to average out sampling noise, and non-target regression checks. That costs as much compute as the training run, so it is often skipped.

## Glossary

The terms below are the working vocabulary of agent SFT, defined as this sheet uses them.

| Term | Meaning |
| --- | --- |
| Agent Data Protocol (ADP) | A typed interlingua schema for agent trajectories (typed actions and observations); each dataset converts into it once and each harness renders from it once, so D datasets and H harnesses need D + H converters instead of D × H (L8). |
| Behavior cloning (BC) | Imitation learning by supervised learning on (state, expert action) pairs; agent SFT on trajectories is behavior cloning over token sequences. |
| Catastrophic forgetting | Loss of capabilities the fine-tuning data does not exercise, such as general chat or safety refusals, after training on a narrow distribution. |
| Chat template | The model-specific rule that renders a list of role-tagged messages (system, user, assistant, tool) into one token string with special boundary tokens. |
| Cold start | The checkpoint that reinforcement learning begins from; in modern pipelines, SFT's job is to make it good (L8, Kimi K3). |
| Cross-entropy loss | The negative log-probability the model assigns to each target token, summed or averaged over unmasked positions; minimizing it is maximum-likelihood imitation. |
| DAgger | Dataset Aggregation (Ross, Gordon and Bagnell, 2011): roll out the learner, have an expert label the states it visits, add them to the data and retrain, so training states match the learner's own distribution. |
| Distillation (sequence-level) | Training a student on text sampled from a stronger teacher; only the sampled tokens are kept, not the teacher's probabilities. |
| End-of-turn token | The special token that closes an assistant message (for example `<\|im_end\|>`); the model must produce it, so it must be inside the loss mask. |
| Expert iteration (ReST) | Repeatedly sample from the current model, keep high-reward trajectories and fine-tune on them with the ordinary SFT loss (L9). |
| Exposure bias | The model is trained only on recorded histories, so at run time it meets its own mistakes, which it never saw in training (L9). |
| Harness | Everything around the model at run time: system prompt, tools, agent loop, output parser and context management (L6). |
| LoRA | Low-Rank Adaptation: freeze the base weights and learn a low-rank update B·A for selected matrices, training well under 1% of parameters. |
| Loss mask | One bit per token saying whether that token's prediction counts in the loss; 1 for assistant content and end-of-turn tokens, 0 elsewhere. |
| Mid-training | Continued pretraining on a curated, often domain-specific corpus between pretraining and SFT (L8's K2 Horizon: 1.43T tokens; L10's AgentFounder). |
| Mixture of experts (MoE) | An architecture where a router sends each token to a few of many expert sub-networks; narrow SFT data can collapse routing onto a few experts (L8, MAI). |
| On-policy distillation | The student generates histories and a teacher supplies its full next-token probabilities there as targets, minimizing reverse KL (L11); DAgger with soft labels. |
| Packing | Filling each fixed-length training row with several whole conversations, with attention boundaries between them, instead of padding. |
| Rejection sampling | Sampling many runs, checking each with a verifier (tests, answer key, checklist) and keeping only those that pass. |
| Task mismatch | SFT maximizes the probability of the demonstrated actions, while we want to maximize the probability of completing the task; the two differ when many solutions exist (L9). |
| Teacher forcing | Training where every prediction is conditioned on the recorded prefix rather than on the model's own earlier outputs. |
| Template drift | A mismatch between the string rendered at training time and the one the serving stack renders, for example when a thinking block changes an earlier turn once a tool message is appended (L8). |
| Token-mean normalization | Dividing the summed loss by the number of unmasked tokens in the batch, which weights long trajectories more than sequence-mean averaging does. |
| Trajectory | The full record of an agent run: system prompt, task, and alternating assistant actions and environment observations, ending in a submit or stop. |

## Practice questions

These fifteen questions run from recall (1 to 4) through calculation (5 to 10) to open design (11 to 15); try each before reading the answer.

1. In L8's rule for agent SFT, which tokens carry the loss? Why is the assistant role header excluded while the end-of-turn token is included?

   **Answer:** Only assistant-produced tokens carry the loss: the model's thoughts, tool calls and final answers. The role header (`<|im_start|>assistant`) is written by the harness at inference, so the model never has to predict it. The end-of-turn token is produced by the model to stop, hand off to a tool or finish, so it must be a target. If it is masked out, "the model may not learn to stop" and it runs on into invented observations.
2. Name L9's three problems with SFT and say how RL addresses each one.

   **Answer:** Task mismatch: SFT maximizes the probability of the demonstrated actions, not of completing the task; RL maximizes expected reward, so any successful path is reinforced. Data mismatch: SFT cannot use failed or sub-optimal runs; RL pushes probability down on low-reward trajectories. Exposure bias: SFT never shows the model its own mistakes; RL trains on the current policy's own rollouts, so it learns to recover.
3. "Masked tokens do not influence training." True or false? Explain.

   **Answer:** False. A masked position contributes no loss at its own output, but its tokens are still inputs, and attention carries them into every later unmasked prediction. The gradient of each action token therefore flows through the observation tokens' representations. The model learns to use observations without learning to produce them.
4. Why does L8 say a successful trajectory can still be bad training data? Give two examples from the lecture.

   **Answer:** The SFT loss copies every action in a kept run, not just the outcome. Nemotron's passing runs included one that looped edit-test for most of its turns and one that left `print(` statements in the final patch; another read files but never edited them. Training on them teaches the mess together with the fix, so outcome filters need process filters beside them.
5. A mixture has three domains. Coding: 5,000 examples averaging 8,000 tokens. Agentic: 1,000 examples averaging 12,000 tokens. Safety chat: 4,000 examples averaging 500 tokens. Give the sample and token shares. What sampling multiplier brings safety to 15% of tokens, and what does L8's lesson suggest you do?

   **Answer:** Sample shares are 50%, 10% and 40%. Tokens are 40M, 12M and 2M, total 54M, so token shares are 74.1%, 22.2% and 3.7%. To reach 15% the multiplier is 0.15 / 0.037 ≈ 4.05 (ignoring the small change in total). Repeating each safety example four times risks memorization, so the better move is to collect more safety data, or accept a lower target and report the mixture in tokens, as L8 and MAI's 33% samples to 2% tokens example urge.
6. A batch has three trajectories with 200, 800 and 3,000 unmasked tokens. What fraction of the gradient weight does each get under token-mean and under sequence-mean normalization?

   **Answer:** Token-mean weights each trajectory by its token count: 200/4,000 = 5%, 800/4,000 = 20%, 3,000/4,000 = 75%. Sequence-mean gives each trajectory 1/3 ≈ 33.3%. Token-mean lets long runs dominate; sequence-mean makes each token in a short run count 15 times as much as one in the long run. Know which one your trainer uses and keep it constant across gradient accumulation.
7. An SFT agent makes a per-step error with probability ε on expert-like states. For a 40-step run, what is the probability of at least one error when ε = 1% and when ε = 3%? What does this imply?

   **Answer:** P(no error) = (1 − ε)^40. For ε = 0.01 it is 0.99^40 ≈ 0.669, so about 33% of runs have at least one error. For ε = 0.03 it is 0.97^40 ≈ 0.296, so about 70% do. Since each first error puts the model in states SFT never trained, long-horizon success is very sensitive to small per-step error rates. This is why recovery data, DAgger-style labeling and RL matter for agents.
8. You have 10 agent datasets and 4 target harnesses. How many converters do you need with pairwise conversion and with ADP?

   **Answer:** Pairwise needs one converter per dataset-harness pair: 10 × 4 = 40. With ADP each dataset converts once into the schema and each harness gets one renderer: 10 + 4 = 14. Adding an 11th dataset costs 4 more converters pairwise but only 1 with ADP.
9. Pack conversations of 30K, 25K, 20K, 18K, 12K, 9K and 5K tokens into 64K rows with best-fit decreasing and no truncation. How many rows, and what is the utilization?

   **Answer:** Sorted, 30K opens row 1 (34K left) and 25K fits there best (9K left). 20K opens row 2 (44K left), 18K goes to row 2 (26K left), 12K goes to row 2 (14K left). 9K fits row 1 exactly (0 left), and 5K goes to row 2 (9K left). Two rows hold 119K of 128K tokens: 93% utilization, versus 7 padded rows (27% utilization) without packing.
10. A GRPO group on one task returns rewards \[1, 0, 0, 0\]. Compute the advantages. What happens if the rewards are \[0, 0, 0, 0\], and what does that say about SFT?

    **Answer:** Mean = 0.25 and population standard deviation = √(0.25 × 0.75) ≈ 0.433. The success gets (1 − 0.25)/0.433 ≈ +1.73 and each failure (0 − 0.25)/0.433 ≈ −0.58, matching L9. With all zeros every advantage is 0 and the group gives no gradient. A base model that cannot yet produce a parseable tool call sits in this state on most tasks, which is why SFT is needed to lift the success rate off zero before RL.
11. In L8's OpenThoughts-Agent table, RL with no SFT averages 3.6, SFT only 15.9, cold-start SFT only 15.1 and cold-start SFT + RL 21.7. The base is 2.7. Interpret each comparison.

    **Answer:** RL on the base barely moves it (2.7 to 3.6), because most rollouts fail and give no signal. SFT alone gives the largest single jump (to about 15 to 16). RL then adds 6.6 points on top of the cold-start checkpoint (15.1 to 21.7). The cold-start checkpoint scores lower on its own than the best SFT model, yet it is the better RL start; a plausible reason is that it keeps more diversity for RL to exploit. The lesson is MAI's: select the SFT model with RL in mind.
12. If one optimizer step processes 64 packed rows of 294,912 tokens, how many tokens is that, and how many steps does one pass over a 332B-token SFT set take?

    **Answer:** 64 × 294,912 = 18,874,368 tokens, about 18.9M per step. 332 × 10^9 / 18,874,368 ≈ 17,590 steps. (This combines Nemotron 3 Ultra's batch shape with K2 Horizon's SFT token count purely as an exercise.) It shows why frontier SFT runs have only tens of thousands of steps despite hundreds of billions of tokens.
13. For one 4096 × 4096 projection, how many parameters does a rank-16 LoRA adapter train, and what fraction of the matrix is that? When would you choose full fine-tuning instead?

    **Answer:** LoRA trains A (16 × 4096) and B (4096 × 16): 16 × (4096 + 4096) = 131,072 parameters. The full matrix has 16,777,216, so the adapter is about 0.78%. Choose full fine-tuning when teaching broad new capabilities from hundreds of millions of tokens or more, where LoRA's capacity limits bite; LoRA is the right default for adapting to one harness or domain on limited hardware.
14. Design question. For L8's three runs (A: clean four-turn fix; B: wrong edit, failing test, recovery; C: success after eleven no-op attempts), decide what to keep and what carries the loss. Which decisions does a minimum-turns-≥-5 filter get wrong?

    **Answer:** Keep A: it is a clean, efficient solution. Keep B, with the wrong edit and failing test in context but consider masking the wrong edit's tokens, so the model learns to notice and recover without learning to make the error. Drop C, or at least mask the eleven wasted attempts, since imitating them teaches looping. A minimum-turns filter drops A (only four turns) and keeps C (many turns), so it gets two of three decisions wrong, even though on average it helped in OpenThoughts-Agent.
15. Design question. Your fine-tuned 8B agent scores well on your held-out split, but in a customer's harness it makes a few good steps, then derails, and sometimes writes fake tool output. Give a diagnosis and fix plan in order.

    **Answer:** First check the plumbing: render training and serving prompts for the same trajectory and diff them for template drift, and confirm the end-of-turn token is in the mask (fake tool output suggests it is not, or that observations leaked into the loss). Second, check the evaluation: if runs of one task or repository sit on both sides of the split, the held-out score is inflated. Third, address harness dependence by collecting trajectories in two or more harnesses, including one close to the customer's. Fourth, attack exposure bias with recovery trajectories, then DAgger-style or on-policy distillation rounds where a teacher labels the student's own states. Finally, use the SFT model as a cold start for RL on verifiable tasks, choosing the starting checkpoint by how much RL improves it.

## References and further reading

The list below starts with the papers that define agent SFT and its limits, then the frontier reports L8 draws on, then practical documentation; links were checked in September 2026, and items without a verified link are given as text.

### Core papers

- [OpenThoughts-Agent: Data Recipes for Agentic Models](https://arxiv.org/abs/2606.24855) — Raoof et al., 2026 — the source of L8's filter, teacher, task-source, scaling and SFT-then-RL tables; the best single read on what matters in agent SFT data.
- [Agent Data Protocol: Unifying Datasets for Diverse, Effective Fine-tuning of LLM Agents](https://arxiv.org/abs/2510.24702) — Song et al., 2025 (ICLR 2026 oral) — the interlingua schema and cross-task transfer results in L8, by L8's lecturer.
- [Training Software Engineering Agents and Verifiers with SWE-Gym](https://arxiv.org/abs/2412.21139) — Pan et al., 2024 — the canonical rejection-sampled distillation result (491 passing runs, 7.0% to 20.6% on SWE-Bench Verified) and the trajectory-count scaling curve.
- [SWE-smith: Scaling Data for Software Engineering Agents](https://arxiv.org/abs/2504.21798) — Yang et al., 2025 — procedural task generation; the top task source in OpenThoughts-Agent.
- [FireAct: Toward Language Agent Fine-tuning](https://arxiv.org/abs/2310.05915) — Chen et al., 2023 — early evidence that a few hundred teacher trajectories substantially improve a small agent.
- [AgentTuning: Enabling Generalized Agent Abilities for LLMs](https://arxiv.org/abs/2310.12823) — Zeng et al., 2023 — mixing agent trajectories with general data to limit forgetting.
- [A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning](https://arxiv.org/abs/1011.0686) — Ross, Gordon and Bagnell, 2011 — DAgger and the compounding-error analysis behind L8's training-running mismatch slide.
- [DART: Noise Injection for Robust Imitation Learning](https://arxiv.org/abs/1703.09327) — Laskey et al., 2017 — an off-policy way to put recovery states into demonstration data.
- [Reinforced Self-Training (ReST) for Language Modeling](https://arxiv.org/abs/2308.08998) — Gulcehre et al., 2023 — grow-improve loop that L9 uses to connect SFT on filtered samples to RL.
- [Beyond Human Data: Scaling Self-Training for Problem-Solving with Language Models](https://arxiv.org/abs/2312.06585) — Singh et al., 2023 — ReST-EM, expert iteration with binary rewards, cited in L9.
- [On-Policy Distillation of Language Models: Learning from Self-Generated Mistakes](https://arxiv.org/abs/2306.13649) — Agarwal et al., 2023 (ICLR 2024) — the on-policy distillation method L11 presents as the fix for exposure bias.
- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — R1-Zero versus R1, L8's evidence for why a cold-start SFT stage precedes RL.
- [Instruction Tuning With Loss Over Instructions](https://arxiv.org/abs/2405.14394) — Shi et al., 2024 — one of the two single-turn masking studies L8 cites; unmasking helps with long prompts, short answers and little data.
- [On the Effect of Instruction Tuning Loss on Generalization](https://arxiv.org/abs/2507.07817) — Chatterjee et al., 2025 (TACL) — weighted instruction tuning (WIT), the other masking study L8 cites.
- [FunReason: Enhancing Large Language Models' Function Calling via Self-Refinement Multiscale Loss and Automated Data Refinement](https://arxiv.org/abs/2505.20192) — Hao et al., 2025 — the SSB token reweighting and HDR resampling that L8 labels BalanceSFT.
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — Hu et al., 2021 — the parameter-efficient method most small-scale agent SFT uses.
- [LoRA Learns Less and Forgets Less](https://arxiv.org/abs/2405.09673) — Biderman et al., 2024 — the trade-off between LoRA and full fine-tuning on large code and math data.

### From the lectures

- [NVIDIA Nemotron 3 Ultra](https://research.nvidia.com/labs/nemotron/Nemotron-3-Ultra/) — NVIDIA, 2026 — released data and recipe; source of L8's packing procedure, multi-harness collection, successful-but-messy runs and SFT configuration.
- MAI-Thinking-1 technical report — Microsoft AI, 2026 — samples-versus-tokens mixture, MoE routing balance during SFT, and "select the SFT model with RL in mind" (L8); no verified link.
- Kimi K3 technical report — Kimi Team (Moonshot AI), 2026 — SFT, RL experts and on-policy distillation stages, and the XTML template with separate end-of-turn tokens (L8); no verified link.
- K2 Horizon model card and training overview — 2026 — stage-by-stage token counts (1.43T mid-training, 332B SFT at 512K), public loss curves and intermediate checkpoints (L8); no verified link.

### Tutorials, docs and courses

- [TRL SFTTrainer documentation](https://huggingface.co/docs/trl/sft_trainer) — Hugging Face — `assistant_only_loss`, `completion_only_loss`, packing and training chat templates; the reference implementation of L8's masking slide.
- [Chat templates](https://huggingface.co/docs/transformers/chat_templating) — Hugging Face Transformers — how `apply_chat_template` renders conversations, with a companion page on writing templates that covers generation markers and template drift.
- [Conversation dataset format](https://docs.axolotl.ai/docs/dataset-formats/conversation.html) — Axolotl — `roles_to_train` and `train_on_eos`, the per-turn masking controls in L8's framework table.
- [Improving Hugging Face Training Efficiency Through Packing with Flash Attention 2](https://huggingface.co/blog/packing-with-FA2) — Hugging Face, 2024 — boundary-aware packing with variable-length attention, and its throughput gains.
- [LoRA Without Regret](https://thinkingmachines.ai/blog/lora/) — Schulman and Thinking Machines Lab, 2025 — when LoRA matches full fine-tuning (all layers, about 10x learning rate, data within capacity) and why it suits RL.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L08 - SFT for Agents]]
- Lecture: [[L09 - RL Foundations]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]

[[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics|← T9]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO|T11 →]]
