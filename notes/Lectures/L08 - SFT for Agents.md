---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, sft, fine-tuning, llm-training]
aliases: ["CMU L8", "11-768 Lecture 8", "Supervised Fine-Tuning for Agents"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-08-sft.pdf"
---

# Lecture 8 · Supervised Fine-Tuning for Agents

[[L07 - Computer Use Agents|← L7]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L09 - RL Foundations|L9 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 8 · Yueqi Song
> **Source:** lecture slides `lecture-08-sft.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T10 - Supervised Fine-Tuning on Agent Trajectories]]

Yueqi Song · 11-768 AI Agents, Fall 2026 · source slides: lecture-08-sft.pdf (49 slides)

## Overview

Supervised fine-tuning (SFT) turns recorded agent trajectories into weights by rendering each run as one token sequence and training the model to predict only the agent's own tokens, and nearly every result depends on which trajectories you choose, how you format and mask them, and whether the checkpoint makes a good starting point for RL.

The lecture (Yueqi Song, CMU Language Technologies Institute) follows one trajectory from the sandbox to the optimizer. It covers how the run is templated, which tokens carry the loss, how data is chosen and unified, how training is configured, how to tell whether it worked, and how much SFT to do before reinforcement learning.

**Learning objectives.** After this lecture you can:

- Explain when a behavior belongs in model weights rather than in the context window or an external artifact, and what that choice costs.
- Render a multi-turn tool-using trajectory through a chat template and build its per-token loss mask, including the end-of-turn token and reasoning blocks.
- Choose trajectory sources, teacher models, filters and task sources, and explain why new tasks beat more runs of the same tasks.
- Describe how a unified trajectory format (the Agent Data Protocol) lets many datasets train one harness.
- Configure a realistic agent SFT run: packing, sequence length, learning rate, MoE routing balance, and train-serve template parity.
- Evaluate an SFT agent honestly and pick the SFT checkpoint with the later RL stage in mind.

**Prerequisites.** Next-token prediction and cross-entropy loss, chat and tool-calling formats (L2), and agent harnesses and SWE-style benchmarks (L6, L7).

**How it connects.** L1 to L7 changed agent behavior without touching weights: prompts and tool definitions (L2), long context (L3), memory and skills stored as external artifacts (L4), planning (L5), and the coding and computer-use harnesses (L6, L7) whose recorded runs become today's training data. This lecture opens the training block. SFT produces the cold-start checkpoint that L9 (RL foundations) and L11 (advanced RL) improve with rewards. Expert iteration, where the model generates its own filtered training data, is the bridge between the two. Deep research agents (L10) are trained with this same SFT-then-RL recipe.

## Concept map

![[cmu-ai-agents-L08-concept-map.png]]
*Concept map: agent SFT pipeline · 8 stages from task sources to a cold-start checkpoint, then RL*

Read it as a snake: data choices run left to right along the top, training steps run right to left along the middle, and the result is a cold-start checkpoint that RL then improves.

## Detailed notes

The notes follow the lecture's seven-part agenda: weight updates as a capability, trajectories as token sequences, choosing the trajectories, one format for many datasets, running the training, knowing it worked, and handing off to RL.

### 1. Weight updates as a capability

**A trajectory is recorded data.** The running example is a SWE-Gym run (Pan et al., 2024, §4.2). An agent in a sandbox receives a GitHub issue and two tools, bash and a file editor. The run is a sequence of messages: a *system* message (the harness prompt), a *user* message (the issue text), then alternating *assistant* turns (a thought plus a bash command or an edit) and *observation* turns (test output, a diff), ending with a *submit* action. The repository's own tests decide whether the run succeeded, so success is checkable without a human.

**Three places to put an improvement.** Earlier lectures changed agent behavior without training. The lecture places SFT in a three-way comparison:

| Location | Pros | Cons | Covered |
| --- | --- | --- | --- |
| Context window | High fidelity to what happened | Costly, noisy, does not decide what matters | Sep 1 lecture |
| External artifacts (memory, skills, notes) | Inspectable, editable, retrievable, portable | Must be induced, selected and maintained | Sep 3 lecture |
| Model weights | Faster inference, broad behavior change | Slow updates, opaque, model-specific | This lecture |

Change the weights once and every later call gets the new behavior with nothing extra in the prompt. The first two options update in seconds; a weight change costs a training run each time. You also cannot open the weights to see what changed, or move the change to a different model.

**Why it matters.** Use weights for behavior that is stable and needed on every call, such as tool-call syntax. Keep volatile or task-specific knowledge in context or artifacts.

**Deeper dive — the arithmetic of prompt versus weights.** Suppose a harness ships a 3,000-token guide on tool syntax and conventions in every system prompt, and serves one million model calls a day. That is 3 billion prompt tokens a day spent restating the same behavior. Prompt caching cuts the price, but the guide still occupies context and competes for attention on every call. Training the behavior in removes it from every future call, at the cost of one training run per change. The same arithmetic shows when weights are the wrong home: if the guide changes weekly, you would retrain weekly. And the "model-specific" con bites when you switch base models: a prompt or skill file moves over unchanged, while an SFT run must be redone on the new model. A useful rule: high frequency times high stability points to weights; anything volatile stays in context or artifacts.

**What the trajectories actually teach.** SFT on agent runs teaches more than the task solution:

- How to write a tool call this particular harness can parse and run.
- How to keep going when the conversation gets long, because the training runs were long.
- What a tool result looks like, so the model waits for one instead of hallucinating it.
- Everything else in the data too: extra commentary, repeated commands, and one way of solving a problem where several would work.

The last point sets up the whole data-curation part of the lecture. The loss does not distinguish intended behavior from incidental habits.

**The full training pipeline, drawn to token scale.** The lecture draws the training stages as a funnel where each step down uses fewer, more heavily curated tokens:

| Stage | Example scale | Source cited |
| --- | --- | --- |
| Pre-training | about 20T tokens | Nemotron 3 Ultra |
| Mid-training | about 1.43T tokens | K2 Horizon |
| SFT (today) | about 332B tokens | K2 Horizon |
| RL (from Sep 22) | rollouts plus rewards, no fixed corpus | course lectures L9, L11 |

SFT is two orders of magnitude smaller than pre-training but still large. At these scales it is not a light polish; it installs the agent's working habits.

**Cold start before RL.** A "cold start" is the checkpoint RL begins from. Kimi K3 (Kimi Team, 2026, §4.1) uses three post-training stages: SFT initializes baseline agent capabilities, RL develops domain experts at varying reasoning effort, and on-policy distillation consolidates the experts into one model. In K3 the model learns to call tools and finish long tasks during SFT, before any RL. The paper states: "The SFT stage establishes a high-quality cold-start policy for the subsequent RL stage."

Why not skip SFT? DeepSeek-R1-Zero ran RL directly on the base model with no SFT. Its successor DeepSeek-R1 put SFT back in, starting from a few thousand curated examples, because R1-Zero's answers mixed languages and were hard to read. The lesson: RL can discover reasoning, but SFT shapes the format and legibility RL builds on.

**SFT and RL side by side.** The lecture contrasts the two stages (drawing on OpenThoughts-Agent Table 11, Kimi K3, and Kimi K2 §3.2):

|  | Supervised fine-tuning | Reinforcement learning |
| --- | --- | --- |
| Learns from | Recorded trajectories, whoever produced them | Its own rollouts, scored by a reward |
| Signal | A target for every token | One number per rollout |
| Needs | Data and GPUs | Live environments, sandboxes, a checkable reward |
| Good at | Learning tool calls, formats, long tasks | Sharpening what the model can already attempt |
| Stuck when | Demonstrations are wrong, narrow, or used up | The start is too weak, or the reward cannot be checked |

The signal row is the key difference. SFT gives dense supervision on every token; RL gives one sparse number per episode. Dense supervision is efficient for learning formats, while sparse reward only helps once the model sometimes succeeds. The course covers SFT today and RL on Sep 22, Sep 29 and Oct 1.

### 2. Trajectories as token sequences

**The chat template turns a trajectory into one string.** A model does not see "messages"; it sees tokens. The chat template (a Jinja program shipped with the tokenizer, see Hugging Face Transformers chat templating) serializes each role into text with boundary markers. In the ChatML-style example on the slide, a tool turn and the next assistant turn render as:

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

The `<|...|>` markers are single special tokens in the vocabulary. Everything else is what the agent wrote and saw. Kimi K3 uses its own template format (called XTML in the paper, §4.1.1), but the principle is identical: every role boundary becomes a template token.

**Which tokens carry the loss.** Standard agent SFT computes cross-entropy only on the assistant tokens. System prompt, issue text and tool observations are context, not targets.

$$
\mathcal{L}(\theta) = -\sum_{t \,:\, m_t = 1} \log p_\theta(x_t \mid x_{<t})
$$

Here x\_t is the token at position t, x\_{\<t} is every token before it, p\_θ is the model's predicted probability under parameters θ, and m\_t is the mask bit (1 if the token's prediction counts, 0 otherwise). Minimizing this raises the probability of each recorded action given everything before it. In practice the sum is usually divided by the number of unmasked tokens.

**Deeper dive — what the mask looks like in code.** In Hugging Face-style trainers the mask is not a separate tensor. It is written into the labels: every masked position gets the label -100, and PyTorch's cross-entropy skips targets equal to its `ignore_index` (default -100). There is also a one-position shift. The logit at position t−1 is scored against the token at position t, so the mask bit m\_t belongs to the *target* token, predicted from the prefix before it. That is why the stop token is trainable: it is predicted from the last content token.

```python
labels = [tok if m == 1 else -100 for tok, m in zip(input_ids, mask)]
# inside the model (sketch): position t-1 predicts token t
loss = F.cross_entropy(logits[:, :-1].reshape(-1, vocab_size),
                       labels[:, 1:].reshape(-1), ignore_index=-100)
```

The mean is taken over non-ignored targets only. So when observations are masked, the denominator is the number of assistant tokens, not the sequence length.

**Why mask observations?** The model should condition on tool output, not learn to generate it. Training on observations would teach the model to hallucinate test results, the exact failure listed in part 1.

**How the mask is built.** Three steps:

1. **Render.** The template writes the conversation as one string and records the character offsets where each assistant span starts and ends.
2. **Tokenize.** Those character positions are mapped to token positions (via the tokenizer's offset mapping).
3. **Mask.** Tokens inside an assistant span get 1; everything else gets 0.

By the time training starts the roles are gone. The trainer sees only the token string and the bits.

**Masking controls across frameworks.** The same decision is exposed differently in the three common open-source trainers:

| Framework | What you set | How the mask is produced |
| --- | --- | --- |
| TRL | `assistant_only_loss=True` | The template marks assistant spans as it renders; needs `{% generation %}` markers, and known model families get patched templates |
| TRL | `completion_only_loss` | For prompt-completion datasets; on by default there |
| Axolotl | `roles_to_train: ["assistant"]`, `train_on_eos: turn` | Finds each turn's role header in the rendered string; the EOS of each trained turn is in the loss |
| LLaMA-Factory | `train_on_prompt: false`, `mask_history: true` | Tags whole turns as train-or-ignore while encoding; `mask_history` trains the last turn only and truncation keeps the final turn |

Only TRL puts the decision inside the template itself. **Common pitfall:** `mask_history: true` in LLaMA-Factory trains only the final turn, which throws away most of a multi-turn agent trajectory's supervision.

**The end-of-turn token.** In the rendered assistant turn, the role header (`<|im_start|>assistant`) is supplied by the harness at inference, so it is never a target. The closing `<|im_end|>` is produced by the model, so it must be inside the mask. TRL's documentation warns that otherwise "the model may not learn to stop."

"End of turn" is actually three different events: end this message, hand off to a tool, or finish the task. Kimi K3's template (XTML, §F) spells these apart with separate tokens, such as `[close]response[sep]` followed by `[end_of_msg]`, with reasoning wrapped in `[open]think[sep] … [close]think[sep]`. Separate tokens let the harness know exactly what the model intends.

**Deeper dive — how the harness uses the stop token.** At inference the serving engine samples tokens until it hits an end-of-sequence or configured stop token. The harness then parses the tool call out of the generated text, runs it, appends the result as a tool message, and re-renders the conversation with the template. It ends the prompt with the assistant header (`add_generation_prompt=True` in Transformers), so the model starts writing content directly. If the model never learned to emit `<|im_end|>` after `</tool_call>`, generation continues. A model that has seen thousands of tool turns will often write the next plausible thing: `<|im_start|>tool` followed by an invented test result. The harness then either truncates at the first call, wasting compute, or ingests a fake observation. Separate tokens for "hand off to a tool" and "finish the task", as in Kimi K3, let the harness branch on a single token instead of on text parsing.

**Masking the reasoning block.** A `<think>...</think>` block raises two independent switches:

- **Keep in context?** In context, the reasoning explains the action that follows.
- **Train on it?** Trained on, it becomes the style the model itself writes.

Nemotron 3 Ultra (NVIDIA, 2026, §3.1.1) keeps budget-truncated reasoning in the context but masks the artificial cut-off out of the loss, so the model never learns to stop thinking mid-sentence.

**Weighting inside the assistant turn.** Even within the assistant span, tokens are not equally important. Long reasoning dominates the token count, but the short tool call is what must be correct. BalanceSFT (Hao et al., 2025, Table 5) adds two components: SSB, a learned weight that rebalances reasoning tokens against tool-call tokens, and HDR, which resamples hard examples. On BFCL (the Berkeley Function-Calling Leaderboard):

| Base + SFT | SSB | HDR | Single-turn | Multi-turn |
| --- | --- | --- | --- | --- |
| Qwen2.5-Coder-Inst | no | no | 81.73 | 38.25 |
| Qwen2.5-Coder-Inst | yes | no | 82.20 | 41.62 |
| Qwen2.5-Coder-Inst | no | yes | 83.85 | 43.12 |
| Qwen2.5-Coder-Inst | yes | yes | 84.00 | 47.00 |
| Llama-3.2-3B-Inst | no | no | 73.67 | 33.25 |
| Llama-3.2-3B-Inst | yes | yes | 78.99 | 36.12 |

Rebalancing helps more on multi-turn than single-turn on both base models (+8.75 multi-turn versus +2.27 single-turn for Qwen with both modules).

**Samples versus tokens.** The loss is per token, but mixtures are usually designed per example. MAI-Thinking-1 (Microsoft AI, 2026, Table 10) shows the gap in its consolidation SFT mixture:

| Capability | Sample weight | Token weight |
| --- | --- | --- |
| STEM and coding | 56% | 89% |
| Agentic capability | 11% | 9% |
| General helpfulness and safety | 33% | 2% |

A third of the examples were helpfulness and safety, but they got 2% of the gradient signal, because STEM and coding traces run far longer. Whatever you balance by counting trajectories, check what it turned into in tokens.

**Deeper dive — backing out lengths from MAI's table.** If a category has sample share n and token share τ, its average length is proportional to τ/n. STEM and coding: 0.89/0.56 ≈ 1.59. Agentic: 0.09/0.11 ≈ 0.82. Helpfulness and safety: 0.02/0.33 ≈ 0.061. So a STEM or coding sample is about 26 times longer than a helpfulness sample, and an agentic sample about 13.5 times longer. Now ask: what sample share would give helpfulness 10% of tokens, keeping the STEM-to-agentic ratio fixed? Solving h × 0.061 = 0.10 × \[h × 0.061 + (1 − h) × 1.46\] gives h ≈ 0.73. You would need 73% of all examples to be helpfulness data just to reach 10% of the gradient signal. The alternatives are per-category loss weights, or per-sequence loss averaging (see "Loss normalization details that bite" in Going deeper), each of which changes the balance without changing the data.

**Open problem: nobody has ablated the mask for agents.** The lecture could not find a published experiment that changes the mask for agent SFT and measures the effect. Careful masking studies (Shi et al., 2024, Instruction Modelling; Chatterjee et al., 2025, WIT) are single-turn instruction tuning. The one case where unmasking the prompt helped had long prompts, short answers and little data; agent trajectories are the opposite on all three. At 8B scale the experiment is cheap and unrun, a good course project.

### 3. Choosing the trajectories

**Where trajectories come from.** The lecture sorts SFT data on two axes: who ran the task, and whether you keep every run or only those that passed.

| Who ran the task | You keep everything | You keep the runs that passed |
| --- | --- | --- |
| A stronger model ran it | Plain distillation | SWE-Gym, Nemotron, OpenThoughts-Agent |
| The model ran it itself | MAI, on its own reasoning runs (self-distillation) | Expert iteration (covered from Sep 22) |

Most agent SFT data sits in the top-right cell. A stronger model writes better trajectories than the student could, and the task's own tests make keeping only the good ones cheap. This is often called rejection sampling fine-tuning. In the bottom row the model makes its own training data; repeating that loop gives expert iteration, which bridges into RL.

**Distillation works, even at small scale.** In SWE-Gym (Pan et al., 2024, §4.2, Table 3), GPT-4o and Claude ran the SWE-Gym tasks inside OpenHands and 491 runs passed the repository tests. Qwen2.5-Coder models were fine-tuned on those 491 runs alone:

| Split | Size | Resolve rate zero-shot | Fine-tuned | Change |
| --- | --- | --- | --- | --- |
| SWE-Bench Lite (300) | 7B | 1.0% | 10.0% | +9.0 |
| SWE-Bench Lite (300) | 14B | 2.7% | 12.7% | +10.0 |
| SWE-Bench Lite (300) | 32B | 3.0% | 15.3% | +12.3 |
| SWE-Bench Verified (500) | 7B | 1.8% | 10.6% | +8.8 |
| SWE-Bench Verified (500) | 14B | 4.0% | 16.4% | +12.4 |
| SWE-Bench Verified (500) | 32B | 7.0% | 20.6% | +13.6 |

The same table shows why: fine-tuning cut "empty patch" rates sharply (14B Lite: 49.7% to 18.1%) and usually reduced "stuck in loop" rates. Most of the early gain is the model learning to operate the harness at all.

**Trajectory count and saturation.** SWE-Gym Figure 5 (§5.2) holds the task set fixed and varies how many sampled trajectories are used: 25%, 50%, 100%. The y-axis is SWE-Bench Verified resolve rate. The 32B curve climbs steadily from about 11% to about 20.6% with no sign of flattening; the 7B curve rises from about 4% to 10% and then nearly flattens. The authors had tasks to spare; what ran out was compute to sample more runs. Larger students can absorb more demonstrations.

**Successful runs still contain bad behavior.** Nemotron 3 Ultra (§3.1.1) found that passing runs often include problems: files read but never edited, long edit-test loops occupying most turns, or `print(` debugging statements left in the final patch. The loss copies every action, good or not. Nemotron's words: such data "would teach undesirable behaviors if used directly as SFT data." Passing the tests is a necessary filter, not a sufficient one.

**Filtering rollouts by shape.** OpenThoughts-Agent (Raoof et al., 2026, Table 7) compared cheap structural filters:

| Filter | SWE-bench Verified (100) | OT-TBLite | Terminal-Bench 2.0 | Average |
| --- | --- | --- | --- | --- |
| Min turns ≥ 5 | 29.00 | 19.10 | 11.61 | 19.90 |
| Filter timeouts | 26.67 | 18.03 | 10.49 | 18.39 |
| Filter subagent traces | 23.00 | 17.31 | 10.86 | 17.06 |

The winner simply drops every run shorter than five turns. Turn count measures how much work a run took, not whether the work was good. A four-turn clean fix gets dropped and a forty-turn mess gets kept, yet on average it still helped. A plausible reading is that longer runs contain more agentic supervision (exploration, testing, recovery) per example.

**Deeper dive — why a crude filter can still help.** A filter acts on the training distribution as a whole, not on each run's merit. Three mechanisms plausibly explain the min-turns result, though the table does not separate them. First, selection by difficulty: runs under five turns are mostly easy tasks, so dropping them shifts the mix toward harder tasks, where the teacher explored, tested and recovered. Second, token accounting: under a per-token loss, short runs contributed few tokens anyway, so the filter removes many examples but a small share of the gradient. Third, degenerate runs: very short runs include ones that barely used tools, or answered without checking. Removing them removes a "submit early" habit. The lesson generalizes. Judge a filter by what it does to the aggregate data (difficulty mix, token share, behaviors present), and expect it to misjudge individual runs such as the clean four-turn fix.

**Choosing the teacher.** OpenThoughts-Agent Table 6 varied the teacher model:

| Teacher | SWE-bench Verified (100) | OT-TBLite | Terminal-Bench 2.0 | Average |
| --- | --- | --- | --- | --- |
| GLM 4.7 (quantized) | 28.00 | 17.86 | 8.61 | 18.16 |
| Kimi K2.5 | 33.33 | 14.19 | 8.24 | 18.59 |
| GLM 5 | 33.00 | 14.30 | 7.50 | 18.27 |
| GLM 4.6 (quantized) | 26.00 | 16.99 | 6.37 | 16.45 |
| GPT-5.3-Codex | 21.67 | 10.42 | 3.75 | 11.94 |

GPT-5.3-Codex was the strongest model on these benchmarks itself but produced the weakest student, about 5 points behind GLM 4.7 on Terminal-Bench 2.0. Stronger model is not the same as better teacher. Possible reasons include traces that are terse, rely on capabilities the student lacks, or follow conventions far from the student's own distribution. Trying two teachers and keeping the better student is cheap by comparison with a wrong choice.

**Task sources matter most.** OpenThoughts-Agent Table 2 ranks 95 task sources. Top of the list: SWESmith (average 18.78), StackExchange SuperUser (13.62), StackExchange Tezos (14.21) and IssueTasks (15.73). At the bottom, AgentTuning-OS averaged 2.00. The paper calls task source "the largest spread of any pipeline stage." Issue-resolution tasks and human-written infrastructure questions dominate the top, but gains are spiky: SWESmith is best on SWE-bench but weak on Terminal-Bench, while SuperUser is the reverse. Spend effort here before tuning anything else, and mix the best four to eight sources; going wider did not help.

**Scaling the data: new tasks beat more runs.** OpenThoughts-Agent Figure 3 has three panels (SWE-bench Verified 100, OT-TBLite, Terminal-Bench 2.0) with dataset size on a log x-axis (10K, 31.6K, 100K rows) and accuracy on the y-axis. Both curves start from the same 10K dataset. The pink curve ("upsample rollouts") adds more runs of the same tasks; it flattens or even drops (OT-TBLite 0.386 to 0.359; Terminal-Bench 0.24 to 0.22). The blue curve ("synthetic augmentation") adds new tasks and keeps climbing (SWE-bench about 0.34 to 0.56; Terminal-Bench 0.18 to 0.26). Task diversity is the scalable axis.

**Discussion question from the lecture.** Three runs of one task return: (A) a four-turn clean solve; (B) a long run that made a wrong edit, saw the test fail and recovered; (C) a run that solved the issue after eleven attempts that changed nothing. Which do you keep, which actions carry the loss, and which would a minimum-turns filter get wrong? One defensible answer: keep A and B; in B consider masking the wrong edit but keeping the recovery; drop C or mask the eleven no-op attempts. A min-turns filter drops A and keeps C, both wrong.

### 4. One format for many datasets

**Agent datasets are heterogeneous.** The Agent Data Protocol paper (Song et al., 2026, Table 1) surveys public agent datasets, each built by a different group in its own format. Examples on the slide:

| Dataset | Domain | Count | Source |
| --- | --- | --- | --- |
| AgentInstruct (Zeng et al., 2023) | code, tools, web | 1.9K | synthetic |
| Code-Feedback (Zheng et al., 2024) | code | 66.4K | manual |
| CodeActInstruct (Wang et al., 2024) | code | 7.1K | synthetic |
| Go-Browse (Gandhi and Neubig, 2025) | web | 9.5K | rollout |
| Mind2Web (Deng et al., 2023) | web | 1.0K | manual (human demos) |
| Nebius SWE Trajectories (Golubev et al., 2024) | SWE | 13.4K | rollout |
| NNetNav-live / NNetNav-wa (Murty et al., 2024) | web | 5.0K / 4.2K | rollout |
| openhands-feedback (All Hands AI, 2024) | code, tools, web | 0.2K | rollout with human feedback |
| Orca AgentInstruct (Mitra et al., 2024) | tools | 1046.1K | synthetic |
| SWE-Gym (Pan et al., 2025) | SWE | 0.5K | rollout |
| SWE-smith (Yang et al., 2025) | SWE | 5.0K | synthetic |
| Synatra (Ou et al., 2024) | web | 99.9K | synthetic |

Even the same observation is stored differently: for a web page some datasets save raw HTML and others the accessibility tree. Training on two datasets together first requires writing custom converters, and with N datasets and M harnesses that is N times M converters.

**One representation for a trajectory.** ADP (an ICLR oral) defines a typed intermediate format. Each dataset is read once and rewritten as typed actions and observations:

- **Actions:** `APIAction(function, kwargs)` such as `goto(url=google.com)`; `CodeAction(language, content)` such as Python `print("Hello World")`; `MessageAction(content)` for natural-language replies.
- **Observations:** `WebObservation(url, html, axtree, ...)` that keeps both HTML and accessibility tree rather than picking one; `TextObservation(content, source)` for execution results or user text.
- **Trajectory(id, content=\[...\], details=...)** wraps the ordered list.

The gain is combinatorial: each dataset converts once and each harness once, so N plus M converters instead of N times M. This is the same "hub format" idea as LLVM's intermediate representation or Pandoc's document model.

**Harness-specific rendering.** A unified format is not the end. You must write the data back out for the harness you are training for (ADP §3.3). OpenHands, SWE-Agent and AgentLab expose different actions, so the same trajectory looks different in each. This step is also where you set the system prompt and decide how to handle contexts that grow too long. Then validate: do the tool calls parse, does each call come with a thought, and does the conversation end the way it should?

**Diversity beats task-specific data.** ADP's cross-task transfer experiment keeps harness, model and evaluation fixed and changes only the training mixture. The figure is a dumbbell plot with accuracy on the x-axis: a blue dot for training on the single matching source only and an orange dot for training on the full ADP mixture.

| Benchmark | Single-source only | ADP mixture | Gain |
| --- | --- | --- | --- |
| SWE-Bench | 11.0 | 16.6 | +5.6 |
| WebArena | 16.0 | 20.1 | +4.1 |
| AgentBench | 21.5 | 25.7 | +4.2 |
| GAIA | 0.6 | 9.1 | +8.5 |

The mixture beats the matching single-domain set even on that domain's own benchmark. Skills such as reading observations, recovering from errors and ending cleanly transfer across domains.

### 5. Running the training

**Real SFT configurations.** Frontier reports give concrete hyperparameters:

| Run | Sequence length | Batch | Learning rate |
| --- | --- | --- | --- |
| Nemotron 3 Ultra (§3.1) | packed 294,912, then 515,000 | 64 | 1.5e-5 decayed to 1e-6 |
| MAI self-distillation (MAI-Thinking-1 §3.1.4, §3.5) | packed 128k | 2,048 | 1.7e-5 decayed to 5.2e-6, 2% warmup |
| K2 Horizon (model card) | 512K, three phases | not stated | decayed on a high-quality subset |

Three patterns stand out. Sequences are very long, because agent trajectories are long and the model must learn to work at that length. Learning rates are small (around 1e-5) compared with pre-training, to avoid overwriting general knowledge. And the final phase often anneals on the highest-quality data, as K2 Horizon does.

**Expert routing during SFT.** The frontier models in this lecture are mixtures of experts (MoE); the models public papers fine-tune are mostly dense. The slide's figure shows two bar charts of tokens per expert. On the broad pre-training mix the eight bars are roughly equal. On a narrow agent SFT set three experts take most tokens and the rest are nearly idle. MAI-Thinking-1 (§3.1.5) counters this by weighting the load-balancing loss about a thousand times more heavily during SFT than during RL, and by raising dropout to 0.15.

**Why it matters.** Router collapse means a few experts are overtrained on narrow data while the rest are neglected, wasting capacity and risking forgetting in the overloaded experts.

**Packing whole conversations.** Training runs on fixed-length sequences. Packing fills each sequence with several conversations instead of padding most of it. Nemotron 3 Ultra (§3.1.2) packs as shown on the slide: pack 1 holds 19k, 15k, 11k and 8k token runs plus a little unused space; pack 2 holds 29k, 17k and 7k runs. Its rules:

1. Assign each conversation to the pack whose remaining capacity it fits most tightly (a best-fit bin-packing heuristic).
2. Never split or truncate a conversation. A truncated trajectory teaches the model to act without seeing the observation or the ending, which Nemotron treats as a source of hallucination.
3. Keep identical prompts out of the same pack, then shuffle packs.

Packing also needs attention masking so conversations in one pack do not attend to each other (document masking or variable-length attention); otherwise the model learns spurious cross-conversation dependencies. This detail is standard practice rather than a slide claim.

**Template drift.** The template you train with must match the template you serve with, down to whitespace. Hugging Face's documentation puts it plainly: "The chat template should always match the format the model was trained with." A subtle version: render the same trajectory twice, once with a tool message appended and once without, and you can get two different strings. Some templates contain a conditional thinking block that strips or rewrites earlier reasoning when a new message arrives. The earlier assistant turn changes, so the training prefix no longer matches what the model sees at inference. Always diff the rendered training string against what your serving stack produces.

**Released training artifacts.** K2 Horizon's model card includes a stage-by-stage training table (steps, tokens, sequence length and the purpose of each phase), which is where the configuration numbers above came from. It links the Weights and Biases run so you can inspect real loss curves, and ships intermediate checkpoints for every stage. Nemotron released post-trained checkpoints together with the training data and recipe. Reading one of these end to end teaches a lot about real practice.

### 6. Knowing it worked

**The mismatch between training and running.** The slide's figure shows a shared prefix (the issue plus the first edit) that branches. On the demonstrated branch the recorded edit A leads to passing tests and a submit. On the model's own branch a plausible but different edit B leads to failing tests and a dashed "now what" box marked "not in the data." Training grades one action at a time, always continuing the recorded run (teacher forcing). Deployed, there is no recording, and every action changes what the model sees next. One different edit puts it in a state no training run visited, and low training loss promised nothing about behavior there.

This is the covariate shift or compounding-error problem of behavior cloning, formalized by Ross et al. (2011) in the DAgger paper. If a cloned policy errs with small probability at each step, errors compound over a horizon, so expected cost can grow roughly quadratically in the horizon rather than linearly. DAgger's fix is to run the learner, then ask an expert to label the states the learner actually visited. Recovery demonstrations (run B in the discussion question) and RL both address the same gap.

**Deeper dive — compounding error in numbers.** Suppose the SFT model matches the demonstrated action with probability 1 − ε at each step, and any mismatch sends it off the demonstrated path. The chance of a whole T-step episode staying on the path is (1 − ε)^T.

| Per-step deviation ε | T = 20 | T = 30 | T = 50 | T = 100 |
| --- | --- | --- | --- | --- |
| 1% | 0.818 | 0.740 | 0.605 | 0.366 |
| 2% | 0.668 | 0.545 | 0.364 | 0.133 |

The fine-tuned SWE-Gym models averaged about 30 turns (slide 22). Even at 99% per-step agreement, about 26% of such episodes leave the demonstrated distribution somewhere. Ross et al. bound the resulting cost: an early error can leave the learner lost for the remaining steps, so behavior cloning's expected cost can grow like T²ε, while DAgger brings it to roughly Tε (up to constants). Deviation is not always failure, since a different edit can also be correct. But from there on the model is in states it was never trained on.

**Evaluation in the target harness.** The lecture's practical checklist:

1. **Overfit twenty examples first.** If loss will not drop on 20 trajectories, the bug is upstream: masking, templating or data loading.
2. **Evaluate by running the model in a harness** on tasks with checkable outcomes. Validation loss is not the metric.
3. **Read published numbers carefully.** Some are the best of several harnesses (OpenThoughts-Agent Table 1 reports such cases).
4. **Match the split to the claim.** Keep all runs of one task on the same side of the train/test split. Split by repository if you want to claim generalization to new repositories (SWE-Gym §5.2).

**Common pitfall.** Several sampled runs of one task landing in both train and test is leakage. The model has seen near-identical solutions, and the score overstates generalization.

**Robustness across harnesses.** Trajectories collected in one system teach that system's conventions along with the task: its tool names, its prompt style, its output formats. Nemotron 3 Ultra (§3.1.1) collects across several harnesses so that the model does not only work in one.

**Regressions outside the target domain.** Training on one capability moves the others, whether or not you measure them (MAI-Thinking-1 §3.5). The mixture is the control lever, and balancing by examples is not balancing by tokens (recall the 33% of samples that became 2% of tokens). Evaluate the things you were not trying to improve, too: chat quality, safety, general reasoning.

### 7. Handing off to RL

**How much SFT before RL.** OpenThoughts-Agent Table 11 compares training recipes on an 8B model:

| Recipe | SWE-bench Verified (100) | OT-TBLite | Terminal-Bench 2.0 | Average |
| --- | --- | --- | --- | --- |
| OT-Agent-ColdSFT + RL-8B | 35.7 | 16.0 | 13.5 | 21.7 |
| OT-Agent-SFT-8B (10K) | 24.3 | 15.6 | 7.9 | 15.9 |
| OT-Agent-ColdSFT | 23.7 | 14.8 | 6.7 | 15.1 |
| RL on Qwen3-8B (no SFT) | 1.0 | 7.8 | 1.9 | 3.6 |
| Qwen3-8B base | 5.3 | 1.3 | 1.5 | 2.7 |

Three conclusions. RL with no SFT barely moves the base model (2.7 to 3.6), because a model that rarely succeeds gets almost no reward signal. SFT alone stops well short of what the pair reaches (15.9 versus 21.7). And the winning recipe starts RL from the ColdSFT checkpoint, which scores lower on its own (15.1) than the best SFT model (15.9). It was deliberately not trained to its own best score.

MAI-Thinking-1 (§3.1.4) reaches the same conclusion: "RL provides the most gains when the SFT model is selected with RL in mind." One common explanation, not stated on the slide, is that an over-trained SFT model has lower output diversity (entropy). RL needs varied rollouts to find better ones, so a slightly less converged checkpoint leaves more room to explore.

**Deeper dive — why RL from a weak start gets no signal.** Group-based RL methods (L9 covers GRPO) sample G rollouts per task and use each rollout's reward minus the group mean as its advantage. If every rollout in a group fails, all advantages are zero and that task contributes no gradient. With per-task success rate p and G = 8, the chance of an all-fail group is (1 − p)^8. At p = 0.027 (roughly the base Qwen3-8B average on slide 47) it is about 0.80, so four in five tasks teach nothing. At p = 0.15 (roughly the SFT checkpoints) it falls to about 0.27. The same arithmetic explains "selected with RL in mind". If an over-trained SFT model produces eight near-identical rollouts, they all pass or all fail together, and the advantages are again zero. RL needs a start that succeeds sometimes and varies between attempts. These are illustrative averages; real success rates vary by task.

**The handoff in one sentence.** SFT teaches the model to operate the harness and attempt long tasks; RL, covered from the next lecture, sharpens which attempts succeed.

## Slide-by-slide companion

This section walks through all 49 slides in order, describing each figure and table in words, then saying what the slide means and how it links to the rest of the course.

### Slides 1–9 · Weight updates as a capability

**Slide 1 — Title.** "Supervised Fine-Tuning for Agents: Turning recorded trajectories into weights," Yueqi Song, CMU Language Technologies Institute; labelled 11-768 · AI Agents | Training 1, the first lecture of the course's training block.

**Slide 2 — Today.** The seven-part agenda: weight updates as a capability; trajectories as token sequences; choosing the trajectories; one format for many datasets; running the training; knowing it worked; handing off to RL. The Detailed notes above follow the same order.

**Slide 3 — A trajectory as recorded data.** The slide draws one run as a row of boxes: *system* (harness prompt), *user* (issue text), *assistant* (thought + bash), *observation* (test output), *assistant* (thought + edit), *observation* (diff), an ellipsis, and a final *assistant* (submit). Three bullets explain it: the agent got an issue and two tools in a sandbox, bash and a file editor; it produced thoughts, commands, and the observations those commands returned; and the repository's own tests decided whether the run succeeded (Pan et al., 2024, SWE-Gym §4.2).

This box row is the lecture's recurring picture. It reappears on slides 11, 12 and 24 with different parts highlighted. Two properties matter for everything later. First, the run alternates between text the agent *wrote* (assistant boxes) and text the world *returned* (observation boxes). That split becomes the loss mask on slide 12. Second, success is decided by a program, not a person. A checkable outcome is what makes it cheap to keep only good runs (slide 21) and later to compute an RL reward (slide 47). The coding-agent harnesses from L6 are exactly the machines that produce these rows.

**Slide 4 — Methods of updating the agent.** A three-row table with columns Location, Pros, Cons. *Context window* (Sep 1 lecture): high fidelity to what happened; but costly, noisy, and it does not decide what matters. *External artifacts* (Sep 3 lecture): inspectable, editable, retrievable, portable; but they must be induced, selected and maintained. *Model weights* (this lecture): faster inference and broad behavior change; but slower updates, opaque, and model-specific. The bullets add: change the weights once and every later call gets the behavior with nothing extra in the prompt; the first two rows update in seconds, while this row costs a training run each time; and you cannot open the weights to see what changed, or move the change to another model.

Read this as a placement decision, like choosing between a config file, a database and compiled code. In RPA terms, context is the per-run input, artifacts are a shared knowledge base, and weights are the robot's compiled logic. Put stable, every-call behavior (tool-call syntax, when to stop) into weights. Keep facts that change weekly out of them.

**Slide 5 — What the trajectories teach.** Four bullets. SFT teaches how to write a tool call this harness can actually run; how to keep going when the conversation gets long, because the training trajectories were long; what a tool result looks like, so the model waits for one instead of writing one itself; and whatever else was in the data, such as extra commentary, repeated commands, and one way of solving a problem where several would work.

The first three are the capabilities you want. The fourth is the warning that drives the second half of the lecture. Cross-entropy has no notion of "intended" behavior: every recorded token is a target with equal standing. So habits in the data become habits in the model. The third bullet also explains why observations are masked (slide 12): if the model were trained to predict tool output, it would learn to write fake results.

**Slide 6 — The full training pipeline.** A bar chart drawn to token scale. Pre-training: 20T tokens (Nemotron 3 Ultra), the widest bar. Mid-training: 1.43T (K2 Horizon). SFT, highlighted in red as "today": 332B (K2 Horizon). RL, from Sep 22, drawn as a dashed box labelled "rollouts + rewards" with the note "no fixed corpus." The subtitle says every step down uses fewer tokens, each more heavily curated.

Two things to take away. SFT is still big: 332B tokens is about 1.7% of 20T, far more than a light polish. And RL is drawn differently because its data does not exist in advance; the model generates it while training. Note the bars mix two model families (Nemotron and K2 Horizon), so they illustrate scale rather than one model's exact recipe.

**Slide 7 — Cold start before reinforcement learning.** Three ovals joined by arrows: *Supervised fine-tuning* (initialize baseline agent capabilities) → *Reinforcement learning* (develop domain experts at varying reasoning effort) → *On-policy distillation* (consolidate the experts into one model). This is Kimi K3's post-training (Kimi Team, 2026, §4.1). The subtitle defines "cold start" as the checkpoint RL begins from. Bullets: in K3 the model learns to call tools and finish long tasks during SFT, before any RL. DeepSeek-R1-Zero ran RL directly on the base model with no SFT. The next model, R1, put SFT back, starting from a few thousand curated examples, because R1-Zero's answers mixed languages and were hard to read. The quote: "The SFT stage establishes a high-quality cold-start policy for the subsequent RL stage."

The R1 story is the key evidence. RL alone found strong reasoning but not a readable format. A small SFT set fixed the format cheaply. Slide 47 later shows the agent version of the same result with numbers.

**Slide 8 — SFT and RL, side by side.** A five-row comparison. *Learns from*: SFT uses recorded trajectories, whoever produced them; RL uses its own rollouts, scored by a reward. *Signal*: a target for every token versus one number per rollout. *Needs*: data and GPUs versus live environments, sandboxes and a checkable reward. *Good at*: learning tool calls, formats and long tasks versus sharpening what the model can already attempt. *Stuck when*: the demonstrations are wrong, narrow or used up versus the start is too weak or the reward cannot be checked. Sources: OpenThoughts-Agent Table 11, Kimi K3, Kimi K2 §3.2.

The two "stuck when" cells fit together. SFT's weakness (limited by its demonstrations) is covered by RL, and RL's weakness (a weak start) is covered by SFT. That complementarity is why every frontier recipe on these slides runs both, in that order.

**Slide 9 — The training lectures.** A schedule table: supervised fine-tuning today; reinforcement learning on Sep 22, Sep 29 and Oct 1.

### Slides 10–19 · Trajectories as token sequences

**Slide 10 — Section divider: Trajectories as token sequences.**

**Slide 11 — The chat template applied to the trajectory.** The top half repeats the box row from slide 3, now with a ruler underneath marking every box boundary. The caption reads "one token sequence · every boundary above is a template token." The bottom half zooms into one boundary, showing each token as a separate chip: `<|im_start|>tool`, newline, `3 failed, 41 passed`, newline, `<|im_end|>`, newline, `<|im_start|>assistant`, newline, `The test compares floats. Fix it.`, newline, `<tool_call>`, newline, `str_replace(...)`, newline, `</tool_call>`, newline, `<|im_end|>`. A legend says "·" means space and "↵" means newline. Bullets: feed the trajectory through the template and you get one string of tokens; the `<|…|>` markers are single special tokens, and the rest is what the agent wrote and saw. Sources: Transformers chat templating docs; Kimi K3 XTML §4.1.1.

Why the whitespace legend? Because the template decides every newline and space, and the model learns them exactly. A missing newline at serving time produces a string the model never saw in training (slide 39). Also note the role name here is `tool`, not "observation": the box label is conceptual, and the actual tag depends on the template. Tool calls are wrapped in `<tool_call>` … `</tool_call>` tags that the harness parses, so the model must reproduce them byte for byte.

**Slide 12 — Which tokens carry the loss.** The box row again, now color-coded. The three assistant boxes (thought + bash, thought + edit, submit) have red borders and a pink fill, labelled "loss computed." System, user and the observation boxes are gray, labelled "context only." Below, a formula titled "Cross-entropy over the assistant tokens only":

$$
\mathcal{L}(\theta) = -\sum_{t\,:\,m_t = 1} \log p_\theta(x_t \mid x_{<t})
$$

Here x\_t is the token at position t, x\_{\<t} all earlier tokens, p\_θ the model's next-token probability with parameters θ, and m\_t the mask bit. Bullets: the mask is one bit per token saying whether that token's prediction counts; minimizing the loss raises the probability of each recorded action given everything before it; observations are conditioning context, not prediction targets.

The key subtlety: masked tokens are still *inside the input*. The model reads them and attends to them. They simply contribute no error term. So masking changes what the model is graded on, not what it sees. This is the single most important line of code in an agent SFT pipeline, and the rest of this part is about getting it right.

**Slide 13 — How the mask is built.** A three-box flow: *Render* (the template writes the conversation as one string and notes where each assistant span starts and ends) → *Tokenize* (those character positions become token positions) → *Mask* (tokens inside an assistant span get a 1, everything else a 0). Bullets: the template does the bookkeeping as it writes; by the time training starts the roles are gone, and the trainer sees only the string and the bits. Source: Transformers `apply_chat_template`.

The practical point is where bugs hide. If the character spans are off by one, or a token straddles a span boundary, the mask is silently wrong. Nothing crashes; the model just learns slightly the wrong thing. The existing Worked example implements exactly these three steps, and the "print tokens with mask bits" test in Practical advice is the cheapest defence.

**Slide 14 — Masking controls across frameworks.** A table with columns Framework, What you set, How the mask is produced. TRL: `assistant_only_loss=True`; the template marks the assistant spans as it renders. Axolotl: `roles_to_train`, `train_on_eos`; it finds each turn's role header in the rendered string. LLaMA-Factory: `train_on_prompt`, `mask_history`; it tags whole turns as train-or-ignore while encoding. Bullet: same decision in all three, and only TRL puts it in the template. Sources: TRL SFTTrainer, Axolotl conversation formats, LLaMA-Factory data args.

The three mechanisms fail in different ways. Template-driven marking (TRL) fails if the template lacks the markers. Header search (Axolotl) fails if the role header text also appears inside content, or the tokenizer merges it differently. Turn tagging (LLaMA-Factory) fails if you pick a flag like `mask_history` that drops earlier turns. Slide 49 gives the exact flags.

**Slide 15 — The end-of-turn token.** A token strip for one assistant turn, color-coded: `<|im_start|>assistant` and the newline after it are gray; `I'll run the failing test.`, `<tool_call>`, `bash(cmd="pytest -q")`, `</tool_call>`, `<|im_end|>` and the newlines between them are red (loss computed). Two captions: "The role header is supplied at inference. It is never a target" (gray) and "The model produces the stop token, so it has to be inside the mask" (red, bold). Then: "End of turn" is three events, not one: end this message, hand off to a tool, or finish the task. Kimi K3's template spells them apart with separate tokens, shown as a second strip: `[open]message role=assistant[sep]` (gray), then red chips `[open]think[sep]` … `[close]think[sep]`, `[open]response[sep]`, `Use math.isclose.`, `[close]response[sep]`, `[end_of_msg]`. The quote at the bottom: "the model may not learn to stop." Sources: TRL training chat templates, TRL SFTTrainer source, Kimi K3 XTML §F.

The asymmetry is the lesson. At inference the harness writes `<|im_start|>assistant` for the model, so predicting it is pointless. But only the model can decide to stop, so the stop token must be trained. If it is masked out, the model has never been rewarded for ending a turn. It may then keep generating past its tool call, often writing a fake observation, the failure slide 5 warned about.

**Slide 16 — Masking the reasoning block.** A token strip: `<|im_start|>assistant` gray; then `<think>`, newline, `The assert compares floats.`, newline in red; `</think>` in gray; then newline, `Use math.isclose.`, newline, `<|im_end|>` in red. Bullets: two switches, set separately — does the reasoning stay in the context, and does it get trained on; in the context the reasoning explains the action that follows, while trained on it becomes the style the model itself writes; Nemotron keeps budget-truncated reasoning in the context and masks the artificial cut-off out of the loss (NVIDIA, 2026, Nemotron 3 Ultra §3.1.1).

Look closely at the one gray chip inside the turn: `</think>`. That is the Nemotron case. When a reasoning trace is cut at a token budget, the closing tag is inserted artificially, not written by the teacher. Masking just that tag means the model sees a complete structure but is never trained to close its thinking abruptly mid-thought. It is a one-token mask decision with a real behavioral effect.

**Slide 17 — Weighting inside the assistant turn.** A screenshot of BalanceSFT Table 5 (Hao et al., 2025): two base models, each fine-tuned with the SSB and HDR modules toggled, scored on BFCL single-turn and multi-turn. The caption explains SSB as a learned weight that rebalances reasoning tokens against tool-call tokens in the loss, and HDR as resampling of hard examples. All eight rows:

| Model + SFT | SSB | HDR | Single-turn | Multi-turn |
| --- | --- | --- | --- | --- |
| Qwen2.5-Coder-Inst | no | no | 81.73 | 38.25 |
| Qwen2.5-Coder-Inst | yes | no | 82.20 | 41.62 |
| Qwen2.5-Coder-Inst | no | yes | 83.85 | 43.12 |
| Qwen2.5-Coder-Inst | yes | yes | 84.00 | 47.00 |
| Llama-3.2-3B-Inst | no | no | 73.67 | 33.25 |
| Llama-3.2-3B-Inst | yes | no | 76.82 | 34.62 |
| Llama-3.2-3B-Inst | no | yes | 78.28 | 35.75 |
| Llama-3.2-3B-Inst | yes | yes | 78.99 | 36.12 |

Bullets: long reasoning dominates the loss, and the short tool call is what you actually need correct; rebalancing helps more on multi-turn than single-turn, on both base models. For Llama the combined gain is +5.32 single-turn and +2.87 multi-turn, so the "more on multi-turn" pattern is clearest for Qwen (+2.27 versus +8.75). SSB alone helps multi-turn by +3.37 (Qwen) and +1.37 (Llama). The deeper idea: once you accept a mask, you can go further and give tokens *different* weights, not just 0 or 1.

**Slide 18 — Samples versus tokens.** MAI-Thinking-1 Table 10, "Consolidation SFT data mixture composition by capability": STEM and coding 56% of samples, 89% of tokens; agentic capability 11% and 9%; general helpfulness and safety 33% and 2%. Caption: they chose the mixture by counting examples, but the loss is computed per token. Bullets: STEM and coding traces run far longer, so they take nearly all the tokens; whatever you balance by counting trajectories, check what it turned into in tokens.

You can back out average lengths from the table (see the Deeper dive in Detailed notes): a STEM or coding sample is about 26 times longer than a helpfulness sample. This slide returns on slide 45 as the reason out-of-domain skills regress.

**Slide 19 — Open problems in supervising a trajectory.** Four bullets: the lecturer could not find a published experiment that changes the mask for agent SFT and measures what happens; the careful masking experiments are single-turn instruction tuning, not agents; the one case where unmasking the prompt helped had long prompts, short answers and little data, and agent trajectories are the opposite on all three; at 8B scale the experiment is cheap and "sitting there unrun." Sources: Chatterjee et al., 2025 (WIT); Shi et al., 2024 (Instruction Modelling).

An honest slide: the standard mask is convention, not a measured optimum. Candidate variants to test include training on observations with a small weight, masking early exploratory turns, or masking failed actions in recovery runs (slide 29, run B). It is a ready-made course project.

### Slides 20–29 · Choosing the trajectories

**Slide 20 — Section divider: Choosing the trajectories.**

**Slide 21 — Where the trajectories come from.** A 2×2 grid. Rows: who ran the task (a stronger model, or the model itself). Columns: you keep everything, or you keep only the runs that passed. Cells: stronger model + keep everything = plain distillation; stronger model + keep passing = SWE-Gym, Nemotron, OT-Agent; the model itself + keep everything = MAI, on its own reasoning runs; the model itself + keep passing = expert iteration (Sep 22). Bullets: most agent SFT data sits in the top-right box, because a stronger model writes better trajectories than the student could, and the task's own tests make keeping the good ones cheap; in the bottom row the model makes its own data, and repeating that loop gives expert iteration.

The grid is a map for the rest of the section. Slides 22–23 study the top-right cell. Slides 24–25 show that "passed" is a weak filter. Slide 26 asks which stronger model to use. The bottom-right cell is where SFT turns into RL: keep-if-reward-is-1, then train, is already a crude policy-improvement step.

**Slide 22 — Distillation from a stronger model.** SWE-Gym Table 3 (Pan et al., 2024, §4.2), with Qwen2.5-Coder at 7B, 14B and 32B, zero-shot versus fine-tuned, on SWE-Bench Lite (300 instances) and SWE-Bench Verified (500). Four metric groups: Empty Patch % (lower is better), Stuck in Loop % (lower is better), Average Turns, and Resolve Rate % (higher is better, highlighted in yellow). Bullets (tagged Sep 10, the date SWE-Gym came up earlier): GPT-4o and Claude ran the SWE-Gym tasks and 491 runs passed the repository tests; a 32B Qwen model was fine-tuned on those 491 runs alone; its scores on both splits rose by more than ten points.

The columns the Detailed notes skip are worth reading:

| Split, size | Empty patch | Stuck in loop | Avg. turns |
| --- | --- | --- | --- |
| Lite 7B | 40.3 → 29.7 | 47.0 → 31.0 | 20.3 → 22.2 |
| Lite 14B | 49.7 → 18.1 | 31.7 → 27.1 | 23.2 → 21.4 |
| Lite 32B | 27.0 → 18.1 | 16.7 → 18.1 (+1.5) | 15.5 → 29.3 |
| Verified 7B | 45.8 → 33.8 | 39.6 → 21.0 | 21.9 → 35.3 |
| Verified 14B | 44.9 → 14.5 | 32.1 → 21.3 | 25.5 → 30.1 |
| Verified 32B | 9.5 → 13.8 (+4.3) | 29.4 → 23.8 | 24.6 → 31.6 |

Resolve rates carry ± spreads (for example 32B Verified 7.0 ± 1.3 → 20.6 ± 2.1). Two red cells show that SFT is not uniformly positive: at 32B, empty patches rose on Verified and loops rose on Lite. Turns mostly went up: the fine-tuned model works longer, as it learned from long teacher runs. That is slide 5's "keep going when the conversation gets long" in data.

**Slide 23 — Trajectory count and saturation.** SWE-Gym Figure 5 (§5.2), "Scaling number of training trajectories": x-axis percentage of training data used (25%, 50%, 100%), y-axis SWE-Bench Verified resolved %. The 32B line (blue) rises almost linearly, about 10.8 → 16.8 → 20.6. The 7B line (orange) rises about 4.2 → 10.0 and then flattens at about 10.6. Side note: same task set throughout, only the number of sampled trajectories changes. Bullets: accuracy was still rising when the sampling budget ran out; they had tasks to spare but ran out of compute to sample more runs; every point uses the same tasks, and adding new tasks comes a few slides later.

Two readings. Capacity matters: the small model saturates first, the large one keeps absorbing data. And this plot changes only *runs per task*, which slide 28 will show is the weaker way to scale. Keep the two axes separate: more runs of the same tasks versus more distinct tasks.

**Slide 24 — Undesirable behaviors in successful rollouts.** The box row with three blue callout tags above it: "read, never edited" over the first assistant box, "edit–test loop" over the second assistant box (drawn with a red border), and "print( in the patch" over the final submit. Bullets: every run on this slide passed its tests; one edited and re-ran tests in a loop for most of its turns, another left print statements in the final patch; the loss copies every action, good or not, so the model learns the mess together with the fix. Quote: "would teach undesirable behaviors if used directly as SFT data" (NVIDIA, 2026, Nemotron 3 Ultra §3.1.1).

This is slide 5's fourth bullet made concrete. Test-passing is an *outcome* filter; these problems are about *process*. Each tag suggests a cheap detector: files opened but never touched, many near-identical edit-then-test cycles, and debug statements present in the final diff. Worked example 1 below implements such detectors.

**Slide 25 — Filtering rollouts by shape.** OpenThoughts-Agent Table 7 (Raoof et al., 2026), "Filtering agent rollouts: keeping longer trajectories helps." Columns: SWE-bench Verified (100), OT-TBLite, Terminal-Bench 2.0, then Average Raw and Normalized. Rows: 1. Min turns ≥ 5 — 29.00, 19.10, 11.61, raw 19.90, normalized +1.25; 2. Filter timeouts — 26.67, 18.03, 10.49, 18.39, −0.35; 3. Filter subagent traces — 23.00, 17.31, 10.86, 17.06, −0.90. Each score carries a small gray uncertainty value (for example 29.00 has 1.56). Bullets: the best filter just drops every run shorter than five turns; turn count says how much work a run took, not whether the work was good; a four-turn clean fix gets dropped and a forty-turn mess gets kept, yet on average it still helped.

Read the uncertainties before the ranks. On Terminal-Bench, 10.49 versus 10.86 differ by less than one uncertainty unit, so rows 2 and 3 are tied there. The big separation is on SWE-bench (29.00 versus 23.00). The caption says min-turns wins on all three benchmarks, which is true for the point estimates.

**Slide 26 — Choosing the teacher.** OpenThoughts-Agent Table 6, "Teacher model ablation: stronger model ≠ better teacher." Ranked by normalized average: 1. GLM 4.7 (quantized) — 28.00, 17.86, 8.61, raw 18.16, +0.73; 2. Kimi K2.5 — 33.33, 14.19, 8.24, 18.59, +0.66; 3. GLM 5 — 33.00, 14.30, 7.50, 18.27, +0.66; 4. GLM 4.6 (quantized) — 26.00, 16.99, 6.37, 16.45, +0.08; 5. GPT-5.3-Codex — 21.67, 10.42, 3.75, 11.94, −1.47. The caption says GPT-5.3-Codex, despite being the strongest model on these benchmarks, is the weakest teacher, underperforming GLM 4.7 AWQ by about 5 points on Terminal-Bench 2.0. Bullets: leaderboard rank told them the wrong thing; trying two teachers and keeping the better student is cheap by comparison.

Notice the ranking uses the normalized column, not raw. Kimi K2.5 has the highest raw average (18.59) but ranks second, because normalization weighs each benchmark relative to its spread. Also note two of the top teachers are quantized, so a cheaper teacher can produce a better student. The gap to GPT-5.3-Codex (about 6 raw points) dwarfs the differences among the top three.

**Slide 27 — Task sources.** OpenThoughts-Agent Table 2, "Task source choice has the largest spread of any pipeline stage." Top four: SWESmith (32.33, 17.63, 6.37; raw 18.78; +1.92), StackExchange SuperUser (13.33, 16.68, 10.86; 13.62; +1.51), StackExchange Tezos (16.33, 16.94, 9.36; 14.21; +1.45), IssueTasks (24.00, 16.44, 6.74; 15.73; +1.37). After an ellipsis, rank 95: AgentTuning-OS (0.00, 5.64, 0.37; 2.00; −2.31). The caption notes issue-resolution tasks and human-written infrastructure questions dominate the top, but improvements are spiky across benchmarks; full ranking in Appendix A.1. Bullets: task source changed results the most; different sources help different benchmarks, so spend effort here before tuning anything else; mix the best four to eight sources, since going wider did not help.

"Spiky" is visible in the numbers. SWESmith is best on SWE-bench (32.33) but among the weakest of the four on Terminal-Bench (6.37). SuperUser is the reverse (13.33 and 10.86). The normalized ranking rewards that Terminal-Bench strength: SuperUser ranks second despite the lowest raw average of the four. A mixture of complementary sources is the natural response.

**Slide 28 — Scaling the data.** OpenThoughts-Agent Figure 3: three panels (SWE-bench Verified 100, OT-TBLite, Terminal-Bench 2.0), x-axis dataset size in rows on a log scale (10K, 31.6K, 100K), y-axis accuracy. Pink = "Method 1: upsample rollouts"; blue = "Method 3: synthetic augmentation." Approximate readings:

| Benchmark | Start (10K) | Pink 31.6K → 100K | Blue 31.6K → 100K |
| --- | --- | --- | --- |
| SWE-bench Verified (100) | 0.335 | 0.453 → 0.482 | 0.48 → 0.557 |
| OT-TBLite | 0.331 | 0.386 → 0.359 | 0.39 → 0.413 |
| Terminal-Bench 2.0 | 0.183 | 0.24 → 0.221 | 0.213 → 0.262 |

Bullets: both curves start from the same 10K dataset and differ only in where the extra data came from; pink adds more runs of the same tasks and flattens; blue adds new tasks and keeps climbing. One nuance: at 31.6K on Terminal-Bench, pink is actually ahead (0.24 versus 0.213). Upsampling gives a quick early gain, then overfits to the same tasks; new tasks pay off at larger scale. The legend's "Method 1" and "Method 3" imply a Method 2 in the paper that the slide omits.

**Slide 29 — Discussion.** Three runs of one task: (A) a short run that solved the issue in four turns; (B) a long run that made a wrong edit, saw the test fail, and recovered; (C) a run that solved it after eleven attempts that changed nothing. Questions: which do you keep, which actions carry the loss, and which of your answers would a minimum-turns filter get wrong?

The Detailed notes give one answer. A finer point on B: the wrong edit and the failing test output are valuable *context* even if the wrong edit is masked. The model learns "after seeing this failure, do this fix," which is exactly the off-distribution state slide 42 worries about. Masking the wrong edit but keeping it in the input is the same two-switch idea as slide 16's reasoning block.

### Slides 30–34 · One format for many datasets

**Slide 30 — Section divider: One format for many datasets.**

**Slide 31 — Heterogeneity across agent datasets.** A screenshot of Agent Data Protocol Table 1 (Song et al., 2026) with columns Dataset, Variety, Count, Source, Note. Variety is coded by colored letters: C (code), T (tools), W (web), S (software engineering). The 13 rows run from AgentInstruct (C T W, 1.9K, synthetic, "mixture of browsing, database, OS, etc.") to Synatra (W, 99.9K, synthetic, "synthetically created web demos of tutorials"). Sizes range from openhands-feedback at 0.2K to Orca AgentInstruct at 1046.1K. Sources are synthetic, manual (Code-Feedback, Mind2Web human demos) or rollout (Go-Browse, NNetNav, Nebius SWE, SWE-Gym). Bullets: each dataset was built by a different group in its own format; for a web page some save the HTML and others the accessibility tree; to train on two of them together you first write two custom converters.

The spread in counts is a hidden mixture problem. Orca AgentInstruct alone is over a million examples, several times all the others combined. Concatenate naively and it dominates the sample count; the token count may differ again (slide 18). The Detailed notes list the full table.

**Slide 32 — One representation for a trajectory.** The ADP overview figure. Left column "Raw Data": speech bubbles from an agent (robot icon) and environment or user (person icon): `goto(url=google.com)`; an HTML page `<!doctype html> … <title> Google </title>`; a Python block `print("Hello World")`; "Execution result: Hello World"; and "How can I help you?". Arrows map each to a typed card under "ADP Standardized Data": `APIAction(function=goto, kwargs={url: google.com})`, `WebObservation(url=google.com, html=<html>..., axtree=RootWebArena 'Google', focused ...)`, `CodeAction(language=python, content=print("Hello World"))`, `TextObservation(content=Hello World, source=environment)`, and `MessageAction(content=How can I help you?)`. A brace gathers them into `Trajectory(id=sample, content=[...], details=...)`. Bullets: read each dataset once and rewrite it as typed actions and observations; for the web page, keep both HTML and accessibility tree instead of picking one; each dataset converts once and each harness once, not once per pair.

This is the classic hub-and-spoke integration pattern. If you have built RPA or ETL pipelines, it is a canonical data model: every source maps to it, every target reads from it. With 13 datasets and 3 harnesses, pairwise converters number 39; through the hub you need 16. Keeping both HTML and axtree is a "lossless hub" choice: the conversion step should not throw away information a future harness might need.

**Slide 33 — Harness-specific rendering.** Text only. Once data is in one format, you still write it back out for the harness you are training for. OpenHands, SWE-Agent and AgentLab take different actions, so the same trajectory comes out looking different in each. This is also where you set the system prompt and decide what to do when context gets long. Then check the result: do the tool calls parse, does each call come with a thought, does the conversation end the way it should (ADP §3.3).

The three checks map onto earlier slides. "Tool calls parse" is slide 5's first skill: a call the harness cannot run is a wasted training target. "Each call comes with a thought" keeps the reasoning-then-action pattern consistent across sources that recorded thoughts and sources that did not. "Ends the way it should" protects the end-of-turn and submit tokens from slide 15. Treat these as unit tests on the rendered data, run before any GPU time.

**Slide 34 — Diversity versus task-specific data.** A dumbbell chart with accuracy (%) on the x-axis from 0 to 30. Each benchmark has a blue dot (single-source only) and an orange dot (ADP data), joined by a colored bar with the gain in bold: SWE-Bench 11.0 → 16.6 (+5.6); WebArena 16.0 → 20.1 (+4.1); AgentBench 21.5 → 25.7 (+4.2); GAIA 0.6 → 9.1 (+8.5). Bullets: same harness, same model, same evaluation, only the training mixture changes; train on the mixture and you beat the matching single-domain set, even on that domain's own benchmark.

The GAIA row is the most striking in relative terms: from almost zero to 9.1. A single matched source was nearly useless there, while the mixture taught general skills (searching, reading observations, stopping) that transferred. This complements slide 27: pick good sources, then mix them. It also foreshadows slide 44, where diversity of harnesses plays the same role as diversity of tasks.

### Slides 35–40 · Running the training

**Slide 35 — Section divider: Running the training.**

**Slide 36 — Real SFT configurations.** A table with columns Sequence, Batch, Learning rate. Nemotron 3 Ultra: packed 294,912 then 515,000; batch 64; 1.5e-5 → 1e-6. MAI self-distillation: packed 128k; batch 2,048; 1.7e-5 → 5.2e-6 with 2% warmup. K2 Horizon: 512K in three phases; batch not given (—); learning rate decayed on a high-quality subset. Sources: Nemotron 3 Ultra §3.1; MAI-Thinking-1 §3.1.4 and §3.5; K2 Horizon model card.

Multiply sequence by batch to get tokens per optimizer step, the number that actually matters:

| Run | Tokens per step (approx.) |
| --- | --- |
| Nemotron, first phase | 64 × 294,912 ≈ 18.9M |
| Nemotron, second phase | 64 × 515,000 ≈ 33.0M |
| MAI | 2,048 × 128k ≈ 262M–268M (depending on whether 128k means 128,000 or 131,072) |

So the batch sizes look very different (64 versus 2,048), but both are enormous in tokens. The learning rates are all near 1e-5, about an order of magnitude below typical pre-training peaks, and all decay. Decaying on the best data at the end, as K2 Horizon does, is "annealing": the last, lowest-learning-rate steps have an outsized effect on the final behavior, so you spend them on the cleanest examples.

**Slide 37 — Expert routing during SFT.** Two bar charts, each titled by data type and labelled "tokens per expert." Left, "broad pre-training mix": eight black-outlined bars of nearly equal height. Right, "narrow agent SFT set": three tall red bars in decreasing height, then five tiny bars close to zero. Bullets: the frontier models in this lecture are mixtures of experts, while the models public papers fine-tune are dense; fine-tune an MoE on narrow agent data and a few experts take most of the tokens; MAI's fix is to balance the routing hard during the supervised stage, a thousand times harder than during RL, and raise dropout to 0.15 (Microsoft AI, 2026, MAI-Thinking-1 §3.1.5).

In an MoE, a small router network picks a few experts per token. A load-balancing term in the loss penalizes uneven usage. On narrow data the router learns that a few experts fit best, and the rich-get-richer effect starves the rest. "A thousand times harder" means scaling that balancing loss coefficient up by about 1,000× during SFT. Dropout 0.15 adds regularization against memorizing a narrow set. This slide is a warning for anyone copying recipes from dense-model papers onto MoE models.

**Slide 38 — Packing whole conversations.** Subtitle: training runs on fixed-length sequences; packing fills each with several conversations instead of padding most of it away. The figure shows two long boxes. Pack 1 holds a 19k run, a 15k run, an 11k run, an 8k run, then a small "unused" gap. Pack 2 holds a 29k run, a 17k run, a 7k run, then "unused." Both packs hold 53k of runs. Bullets: each conversation goes to the pack whose remaining capacity it most tightly fits; no conversation is split or truncated, a deliberate choice against hallucination; identical prompts are kept out of the same pack, and packs are shuffled afterwards (NVIDIA, 2026, Nemotron 3 Ultra §3.1.2).

Why keep identical prompts apart? Several sampled runs of one task share a long identical prefix. In one pack, with imperfect attention isolation or shared per-pack statistics, they would reinforce each other. Spreading them out also gives each optimizer step more distinct tasks. Why not truncate? A cut trajectory may end mid-action, or lose the observation that justified an action. Training on it teaches actions without their grounds. The figure is schematic; the real Nemotron packs are 294,912 or 515,000 tokens long.

**Slide 39 — Template drift.** Three bullets and a quote. The template you train with has to be the template you serve with, down to the whitespace. Render the same trajectory twice, once with a tool message after it and once without, and you can get two different strings. When a tool message is appended, a conditional thinking block changes the earlier assistant turn, and the prefix no longer matches. Quote: "The chat template should always match the format the model was trained with." Sources: Transformers "writing chat templates"; TRL "training chat templates."

A concrete case is Qwen3's published template. It keeps `<think>` content only for assistant turns after the last user message, and drops it from earlier turns. Whether a turn keeps its reasoning thus depends on what comes after it. If your training renders a trajectory one way and your server renders the growing conversation another way, the model sees a prefix it was never trained on. The fix is procedural: render with the exact serving template, and test that rendering turn k and then appending turn k+1 leaves the first k turns byte-identical.

**Slide 40 — Released training artifacts.** Text only. K2 Horizon's model card has a stage-by-stage training table (steps, tokens, sequence length, and each phase's purpose), which is where the configuration numbers on slide 36 came from. It links the Weights & Biases run, so you can see the real loss curves, and ships intermediate checkpoints for every stage. Nemotron released post-trained checkpoints together with the training data and recipe. "Reading one of these teaches a lot."

Practical suggestion: open the W&B run and look at three things. How fast the SFT loss falls in the first few hundred steps, whether there are spikes at phase boundaries, and how loss behaves during the final decay on high-quality data. Real curves calibrate your expectations for your own runs far better than papers' summary tables.

### Slides 41–45 · Knowing it worked

**Slide 41 — Section divider: Knowing it worked.**

**Slide 42 — The mismatch between training and running.** A branching diagram. A left box "same prefix: issue + first edit" splits in two. The upper, gray branch is labelled DEMONSTRATED: "edit A (the recorded one)" → "tests pass (expected observation)" → "submit (task complete)." The lower, red branch is labelled ITS OWN RUN: "edit B (plausible, different)" → "tests fail (unexpected observation)" → a dashed box "now what (not in the data)." Bullets: training grades one action at a time, always continuing the recorded run; deployed, there is no recording, and every action changes what the model sees next; one different edit and it is in a state no training run visited, so low loss promised nothing about what happens there. Source: Ross et al., 2011, DAgger.

The dashed border is the whole point: that state has no data at all. SFT's loss is computed only on the demonstrated branch (teacher forcing). This is why SFT alone plateaus on long tasks, and why the lecture keeps pointing to recovery data (slide 29, run B) and RL (slide 47). RL trains on the lower branch directly, because the rollouts are the model's own. See the Deeper dive on compounding error in Detailed notes for the numbers.

**Slide 43 — Evaluation in the target harness.** Four bullets. Before trusting any number, check that you can overfit twenty examples; if the loss will not drop, the bug is upstream. Then evaluate by running the model in a harness, on tasks with checkable outcomes. Read published numbers carefully, since sometimes they are the best of several harnesses. Match the split to the claim: keep all runs of one task on the same side, and split by repository if you want to say it generalizes to new ones. Sources: OpenThoughts-Agent Table 1; SWE-Gym §5.2.

The overfit test is a classic deep-learning sanity check. Twenty examples, many epochs: loss should approach zero. If it does not, the mask may be all zeros, the labels may be shifted wrong, or the template may not match the tokenizer. Hyperparameters cannot fix any of those. The split rule is about leakage. Several runs of one task are near-duplicates, and repositories share code style and test conventions, so a random split flatters the model.

**Slide 44 — Robustness across harnesses.** Two bullets: trajectories collected in one system teach that system's conventions along with the task; collecting across several harnesses is how labs avoid training a model that only works in one (NVIDIA, 2026, Nemotron 3 Ultra §3.1.1).

Conventions include tool names, argument formats, the system prompt's wording, and how observations are truncated. A model trained on one harness can score well there and fail in another scaffold, simply because the second one names its edit tool differently. This is slide 34's diversity argument applied to harnesses instead of tasks. ADP's "convert once, render per harness" design (slides 32–33) makes multi-harness data cheap to produce.

**Slide 45 — Regressions outside the target domain.** Three bullets: train on one capability and you move the others, whether or not you measure it; your mixture is the control, and balancing by examples is not balancing by tokens; so evaluate the things you were not trying to improve, too (Microsoft AI, 2026, MAI-Thinking-1 §3.5).

This ties back to slide 18. MAI's helpfulness and safety data was a third of the samples but 2% of the tokens, so those skills got little gradient. If they regressed, the example-count view would hide the cause. A standing regression suite (chat quality, safety refusals, general reasoning, plus the target agent benchmarks) run on every checkpoint turns this from a surprise into a tracked metric.

### Slides 46–49 · Handing off to RL, and backup

**Slide 46 — Section divider: Handing off to RL.**

**Slide 47 — How much SFT before RL.** OpenThoughts-Agent Table 11, ranked by normalized average. Scores are SWE-bench Verified (100), OT-TBLite, Terminal-Bench 2.0, with uncertainty in small type:

| Rank | Recipe | SWE-bench V. | OT-TBLite | TB 2.0 | Raw | Norm. |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | OT-Agent-ColdSFT + RL-8B | 35.7 (1.8) | 16.0 (1.6) | 13.5 (1.5) | 21.7 | +1.2 |
| 2 | OT-Agent-SFT-8B (10K) | 24.3 (1.9) | 15.6 (1.5) | 7.9 (1.4) | 15.9 | +0.5 |
| 3 | OT-Agent-ColdSFT | 23.7 (1.6) | 14.8 (1.4) | 6.7 (1.1) | 15.1 | +0.4 |
| 4 | RL on Qwen3-8B (no SFT) | 1.0 (0.5) | 7.8 (1.1) | 1.9 (0.7) | 3.6 | −0.9 |
| 5 | Qwen3-8B | 5.3 (1.1) | 1.3 (0.3) | 1.5 (0.4) | 2.7 | −1.1 |

Bullets: RL applied to no SFT barely moves the base model; SFT alone stops well short of the pair; the winning recipe starts RL from a checkpoint deliberately not trained to its own best score. Quote from MAI-Thinking-1 §3.1.4: "RL provides the most gains when the SFT model is selected with RL in mind."

Two details reward a close look. RL on the base model actually *lowered* SWE-bench (5.3 → 1.0) while raising OT-TBLite (1.3 → 7.8): with almost no successes, RL mostly reshapes behavior on the easier terminal tasks and can hurt elsewhere. And RL's gain over its own starting point is largest on the hardest benchmarks: ColdSFT → +RL adds 12.0 on SWE-bench and 6.8 on Terminal-Bench but only 1.2 on OT-TBLite. The comparison between rows 2 and 3 (15.9 versus 15.1) is within the uncertainties, so "not trained to its best" costs little up front and pays off after RL.

**Slide 48 — Questions.** Next class: Training 2, Reinforcement Learning Basics.

**Slide 49 — Backup · Exact masking flags.** A reference table with columns Framework, Flag, Behavior:

| Framework | Flag | Behavior |
| --- | --- | --- |
| TRL | `assistant_only_loss=True` | needs `{% generation %}` markers; known families get patched templates |
| TRL | `completion_only_loss` | prompt–completion datasets; on by default there |
| Axolotl | `roles_to_train: ["assistant"]` | default; loss on the listed roles only |
| Axolotl | `train_on_eos: turn` | the EOS of each trained turn is in the loss |
| LLaMA-Factory | `train_on_prompt: false` | default; prompt tokens masked |
| LLaMA-Factory | `mask_history: true` | last turn only; truncation keeps the final turn |

How to use it: `{% generation %}` … `{% endgeneration %}` are Jinja tags you wrap around the assistant content in the chat template, so the renderer can report which characters are assistant-generated. If your model's template lacks them, `assistant_only_loss` cannot work until the template is patched. For Axolotl, `train_on_eos: turn` is the setting that implements slide 15's stop-token rule for every trained turn. For LLaMA-Factory, `mask_history: true` suits single-answer chat but is usually wrong for agents, because it discards the supervision on every earlier action in the trajectory.

## Going deeper

Agent SFT is behavior cloning with a language model as the policy, so most of its strengths and failure modes have a long history in imitation learning and instruction tuning. This section adds that lineage, related methods the lecture did not cover, and practical engineering advice.

### Lineage: from behavior cloning to agent tuning

- **Behavior cloning.** Supervised learning of actions from expert demonstrations is old. ALVINN (Pomerleau, 1989) trained a neural network to steer a vehicle from recorded human driving. It already showed the core flaw: the network never saw what to do after drifting off the road, because humans rarely drift.
- **DAgger (Ross, Gordon and Bagnell, 2011).** It formalized that flaw. With a per-step error rate e over a horizon T, behavior cloning's expected cost can grow on the order of T squared times e, because early mistakes push the learner into unfamiliar states. DAgger runs the learner, has the expert label the states it visited, aggregates the data and retrains, bringing the bound down to linear in T. For LLM agents, "expert relabelling" can mean asking a teacher model what it would do from the student's actual state.
- **Instruction tuning.** FLAN (Wei et al., 2021) and InstructGPT (Ouyang et al., 2022) established SFT on formatted demonstrations as the first post-training stage. LIMA (Zhou et al., 2023) argued that about 1,000 carefully curated examples can align a strong base model. That "superficial alignment" view fits chat formatting well but fits agents less well, since agent skills need long, diverse, environment-grounded data.
- **Agent tuning.** FireAct (Chen et al., 2023) fine-tuned models on ReAct-style trajectories. AgentTuning (Zeng et al., 2023) released AgentInstruct and mixed agent data with general instruction data to preserve general ability, the same mixture concern the lecture raises. Agent-FLAN (Chen et al., 2024) observed that models learn format-following faster than reasoning and rebalanced the data accordingly, a precursor to the BalanceSFT idea.

### Self-generated data: rejection sampling, STaR and expert iteration

The bottom row of the lecture's source table has its own literature. Expert Iteration (Anthony et al., 2017) alternated a search-based expert with a neural apprentice for the game Hex. STaR (Zelikman et al., 2022) sampled rationales, kept those that reached correct answers, and fine-tuned on them repeatedly. ReST (Gulcehre et al., 2023) and rejection-sampling fine-tuning (Yuan et al., 2023) scaled the same generate-filter-train loop. For agents, the task's test suite plays the role of the answer checker. This loop is a simple form of RL: keeping only reward-1 samples and doing SFT on them is policy improvement with a binary reward.

### Parameter-efficient fine-tuning

The lecture's frontier examples use full fine-tuning. Practitioners with one or two GPUs typically use LoRA (Hu et al., 2021), which freezes the base weights and trains low-rank update matrices, or QLoRA (Dettmers et al., 2023), which does this on a 4-bit quantized base. Biderman et al. (2024), "LoRA Learns Less and Forgets Less", found LoRA underperforms full fine-tuning on hard targets such as code but preserves more of the base model's other abilities. For agent SFT this is a real trade-off: LoRA may regress less outside the domain, but may also learn long-horizon habits less completely.

### Loss normalization details that bite

The lecture's per-token loss hides a choice: average over tokens in the whole batch, or average per sequence and then over sequences. Per-sequence averaging gives a four-turn trajectory the same total weight as a forty-turn one, so each of its tokens counts more. Per-token averaging lets long trajectories dominate, which is exactly the samples-versus-tokens effect in MAI's table. In late 2024 several open-source trainers were found to normalize incorrectly under gradient accumulation (averaging per micro-batch rather than over the full effective batch), which silently upweighted short sequences. Check how your framework normalizes before comparing runs.

### Recovery data and negative examples

Because behavior cloning never shows off-distribution states, several lines of work inject them. Options include keeping runs with a failed step followed by recovery (masking the bad step, training on the fix), synthesizing error observations, or pairing good and bad actions for preference optimization such as DPO (Rafailov et al., 2023). These are partial DAgger substitutes that do not require a live expert. The lecture's discussion run B is exactly this kind of data.

### Synthetic task generation

The lecture's biggest lever was task source, and new tasks beat more runs of old ones. That makes task synthesis the active frontier. SWE-smith (Yang et al., 2025) generates bug-fix tasks by breaking working repositories and using their tests as validators. SWE-Gym, R2E-Gym and similar environments harvest real issues with executable test suites. The common pattern is: find or build an environment where success is automatically checkable, because that both filters SFT data and later supplies an RL reward.

### Open problems

- **Mask ablations for agents.** As the lecture notes, nobody has published what happens if observations or earlier turns are partially trained on in agent SFT.
- **Process quality filters.** Turn count is a crude proxy. Better filters might use an LLM judge on each step, detect no-op edits, or score redundancy. Validating such filters is costly because the true test is downstream agent success.
- **Teacher-student fit.** Why a stronger model can be a worse teacher is not well understood. Candidate explanations are style mismatch, reliance on abilities the student lacks, and trace length.
- **Harness generalization.** How much harness diversity is needed so a model transfers to an unseen scaffold is largely unmeasured.

### Practical advice for a first agent SFT run

1. Start with a small open model (for example 7B to 8B), LoRA or full fine-tuning, and a few hundred to a few thousand filtered trajectories from a single harness you will actually deploy.
2. Write a test that renders one trajectory, prints tokens with their mask bits, and asserts that every assistant end-of-turn token has mask 1 and every observation token has mask 0.
3. Overfit 20 examples, then train for real. Evaluate by running the agent, not by validation loss.
4. Log token counts per data source, not just example counts.
5. Keep a small regression suite of general tasks and run it every checkpoint.

## Worked example

This self-contained Python sketch renders a SWE-style trajectory through a toy ChatML template, builds the assistant-only loss mask from character offsets, checks the end-of-turn rule, and packs conversations with a best-fit heuristic. It uses only the standard library; the tokenizer is a toy stand-in for a real fast tokenizer's `offset_mapping`.

```python
import re

# A recorded trajectory: role-tagged messages, as a harness would log them.
trajectory = [
    {"role": "system", "content": "You are a coding agent. Tools: bash, str_replace."},
    {"role": "user", "content": "Issue: test_area fails on float comparison."},
    {"role": "assistant", "content": "I'll run the failing test.\n<tool_call>bash(cmd=\"pytest -q\")</tool_call>"},
    {"role": "tool", "content": "3 failed, 41 passed"},
    {"role": "assistant", "content": "The test compares floats. Fix it.\n<tool_call>str_replace(...)</tool_call>"},
    {"role": "tool", "content": "diff applied"},
    {"role": "assistant", "content": "Tests pass now.\n<tool_call>submit()</tool_call>"},
]

END = "<|im_end|>"

def render(messages):
    """Toy ChatML template. Returns the string plus the character spans
    that must carry the loss: assistant content AND its closing <|im_end|>.
    The role header '<|im_start|>assistant\\n' is excluded: the harness
    supplies it at inference, so the model never has to predict it."""
    text, spans = "", []
    for m in messages:
        text += f"<|im_start|>{m['role']}\n"
        start = len(text)
        text += m["content"] + END
        if m["role"] == "assistant":
            spans.append((start, len(text)))   # includes the stop token
        text += "\n"
    return text, spans

def tokenize(text):
    """Toy tokenizer: special tokens stay whole, otherwise words, spaces,
    punctuation. Returns tokens and each token's (start, end) char offsets,
    like offset_mapping in a real fast tokenizer."""
    pattern = r"<\|im_start\|>|<\|im_end\|>|\w+|\s|[^\w\s]"
    toks, offs = [], []
    for match in re.finditer(pattern, text):
        toks.append(match.group())
        offs.append(match.span())
    return toks, offs

def build_mask(offsets, spans):
    """1 if the token lies fully inside an assistant span, else 0."""
    return [int(any(s <= a and b <= e for s, e in spans)) for a, b in offsets]

text, spans = render(trajectory)
tokens, offsets = tokenize(text)
mask = build_mask(offsets, spans)

# Sanity checks you should run on real data before any training:
ends = [i for i, t in enumerate(tokens) if t == END]
roles = re.findall(r"<\|im_start\|>(\w+)", text)
for i, role in zip(ends, roles):
    want = 1 if role == "assistant" else 0
    assert mask[i] == want, f"end-of-turn for {role} has mask {mask[i]}"
assert all(m == 0 for t, m in zip(tokens, mask) if t == "<|im_start|>")
print(f"{len(tokens)} tokens, {sum(mask)} carry loss "
      f"({sum(mask) / len(tokens):.0%})")
print("trained:", "".join(t for t, m in zip(tokens, mask) if m)[:80], "...")

def best_fit_pack(lengths, capacity):
    """Nemotron-style packing: longest first, each conversation goes to
    the pack whose remaining space it fits most tightly. Never splits."""
    packs = []  # each pack: [remaining_capacity, [lengths]]
    for n in sorted(lengths, reverse=True):
        if n > capacity:
            raise ValueError(f"{n}-token run exceeds capacity; drop it, don't truncate")
        fits = [p for p in packs if p[0] >= n]
        if fits:
            best = min(fits, key=lambda p: p[0] - n)
        else:
            best = [capacity, []]
            packs.append(best)
        best[0] -= n
        best[1].append(n)
    return packs

for free, runs in best_fit_pack([19, 15, 11, 8, 29, 17, 7], capacity=55):
    print(f"pack {runs} (k tokens), unused {free}k")
```

Output when run:

```text
153 tokens, 78 carry loss (51%)
trained: I'll run the failing test.
<tool_call>bash(cmd="pytest -q")</tool_call><|im_end| ...
pack [29, 19, 7] (k tokens), unused 0k
pack [17, 15, 11, 8] (k tokens), unused 4k
```

What to notice:

- The mask comes from character spans recorded while rendering, then mapped to tokens. This is the lecture's render, tokenize, mask pipeline; after this point the trainer never sees roles.
- The assistant span starts after the role header but includes `<|im_end|>`. Remove the stop token from the span and the assertion fails: that is the "model may not learn to stop" bug.
- Tool outputs such as `3 failed, 41 passed` get mask 0. The model conditions on them but is never trained to produce them.
- Even here only about half the tokens carry loss. In real runs with long observations the fraction is often much lower, which is why you should log token counts per source.
- The packer never splits a run; a run longer than a pack is rejected instead of truncated, following Nemotron 3 Ultra. The seven runs from the lecture's figure fit into two 55k packs with 4k unused.
- For a real model, replace `render` with Transformers' `apply_chat_template(..., return_dict=True, return_assistant_tokens_mask=True)` (the template needs `{% generation %}` markers) or TRL's `assistant_only_loss=True`, and keep the assertions.

## More worked examples

Two more examples. The first is a runnable curation script for the lecture's data-selection problem. The second is a pencil-and-paper sizing of a first agent SFT run.

### Example 2 · Curating trajectories: outcome filter, process checks and token accounting

This program takes five toy SWE-style runs of one task (a float comparison bug), applies the lecture's filters, and prints what each would keep. Runs A, B and C are the three runs from the slide 29 discussion; D leaves a debug print in the patch (slide 24); E fails its tests. It compares the minimum-turns filter (slide 25) with a process filter that masks failed and repeated edits and drops runs with debug leftovers. The last block rebuilds MAI's samples-versus-tokens gap (slide 18). `call_llm(messages) -> str` is a stub that stands in for an LLM step judge; it makes no API call and simply flags an edit that repeats an earlier one verbatim. Standard library only; token counts are whitespace words.

```python
"""Curate agent trajectories for SFT: outcome filter, process checks,
per-turn loss masks, and token accounting. Standard library only.
call_llm is a stub (no API call); a real judge would replace it."""

def call_llm(messages):
    # Stub for an LLM step judge. Returns "noop" if the edit text repeats
    # an earlier edit verbatim, else "useful". A real judge would be a model.
    history, current = messages[0]["content"], messages[1]["content"]
    return "noop" if current in history else "useful"

def ntok(text):                      # crude token count: whitespace words
    return len(text.split())

# Each run: (passed tests?, list of (role, text)). Roles: assistant / tool.
RUNS = {
  "A_clean": (True, [("assistant", "read utils.py"), ("tool", "def close(a, b): return a == b"),
                     ("assistant", "edit utils.py: use math.isclose(a, b)"), ("tool", "44 passed"),
                     ("assistant", "submit")]),
  "B_recover": (True, [("assistant", "read utils.py"), ("tool", "def close(a, b): return a == b"),
                       ("assistant", "edit utils.py: round(a, 2) == round(b, 2)"), ("tool", "3 failed, 41 passed"),
                       ("assistant", "the tolerance is relative; edit utils.py: use math.isclose(a, b)"),
                       ("tool", "44 passed"), ("assistant", "run pytest -q"), ("tool", "44 passed"),
                       ("assistant", "submit")]),
  "C_noop": (True, [("assistant", "read utils.py"), ("tool", "def close(a, b): return a == b")]
             + [("assistant", "edit utils.py: return a == b"), ("tool", "3 failed, 41 passed")] * 4
             + [("assistant", "edit utils.py: use math.isclose(a, b)"), ("tool", "44 passed"),
                ("assistant", "submit")]),
  "D_debug": (True, [("assistant", "read utils.py"), ("tool", "def close(a, b): return a == b"),
                     ("assistant", "edit utils.py: print(a, b); use math.isclose(a, b)"),
                     ("tool", "44 passed"), ("assistant", "submit")]),
  "E_fail": (False, [("assistant", "read utils.py"), ("tool", "..."), ("assistant", "submit")]),
}

def process_check(turns):
    """Return (keep, per-assistant-turn mask, reasons)."""
    reasons, masks, seen_edits = [], [], []
    acts = [t for r, t in turns if r == "assistant"]
    obs = [t for r, t in turns if r == "tool"]
    for i, act in enumerate(acts):
        m = 1
        if act.startswith("edit"):
            verdict = call_llm([{"role": "user", "content": " | ".join(seen_edits)},
                                {"role": "user", "content": act}])
            if verdict == "noop":
                m = 0; reasons.append(f"turn {i}: repeated no-op edit masked")
            elif i < len(obs) and "failed" in obs[i]:
                m = 0; reasons.append(f"turn {i}: edit that failed tests masked (kept as context)")
            seen_edits.append(act)
        masks.append(m)
    final_edits = [a for a in acts if a.startswith("edit")]
    if final_edits and "print(" in final_edits[-1]:
        return False, masks, reasons + ["debug print in final patch: drop run"]
    if masks.count(0) > len(masks) // 2:
        return False, masks, reasons + ["mostly no-op: drop run"]
    return True, masks, reasons

print(f"{'run':10} {'turns':>5} {'min5':>5} {'process':>8}  trained/total tokens")
for name, (passed, turns) in RUNS.items():
    n_turns = sum(r == "assistant" for r, _ in turns)
    min5 = passed and n_turns >= 5
    keep, masks, reasons = process_check(turns) if passed else (False, [], ["tests failed"])
    acts = [t for r, t in turns if r == "assistant"]
    trained = sum(ntok(a) for a, m in zip(acts, masks) if m)
    total = sum(ntok(t) for _, t in turns)
    tok = f"{trained}/{total}" if keep else f"dropped (0/{total})"
    print(f"{name:10} {n_turns:>5} {str(min5):>5} {str(keep):>8}  {tok}")
    for r in reasons:
        print(f"{'':12}- {r}")

# Samples versus tokens for a mixture balanced by example count.
# (count, avg tokens) chosen to reproduce MAI-Thinking-1 Table 10 shares.
mix = {"stem_coding": (560, 6000), "agentic": (110, 3100), "helpful_safety": (330, 230)}
tot_s = sum(n for n, _ in mix.values()); tot_t = sum(n * L for n, L in mix.values())
print("\ncategory        samples  tokens")
for k, (n, L) in mix.items():
    print(f"{k:15} {n / tot_s:6.0%} {n * L / tot_t:7.1%}")
```

Output when run (Python 3):

```text
run        turns  min5  process  trained/total tokens
A_clean        3 False     True  8/17
B_recover      5  True     True  15/37
            - turn 1: edit that failed tests masked (kept as context)
C_noop         7  True    False  dropped (0/57)
            - turn 1: edit that failed tests masked (kept as context)
            - turn 2: repeated no-op edit masked
            - turn 3: repeated no-op edit masked
            - turn 4: repeated no-op edit masked
            - mostly no-op: drop run
D_debug        3 False    False  dropped (0/19)
            - debug print in final patch: drop run
E_fail         2 False    False  dropped (0/4)
            - tests failed

category        samples  tokens
stem_coding        56%   89.0%
agentic            11%    9.0%
helpful_safety     33%    2.0%
```

What to notice:

- The minimum-turns column and the process column disagree on exactly the runs the lecture predicted. Min-turns drops the clean run A (3 assistant turns) and keeps the no-op run C (7 turns). The process filter does the reverse.
- Run B is kept, but its wrong edit gets mask 0. The failing test output and the wrong edit stay in the input, so the model still learns "after this failure, make this fix" (the recovery behavior slide 42 says SFT usually lacks).
- Run D passed its tests and would pass any outcome filter. Only a process check on the final patch catches the `print(` leftover from slide 24.
- Even in kept runs, fewer than half the tokens are trained (8 of 17, 15 of 37). Observations dominate agent trajectories, so the supervised-token count, not the run count, is the real size of your dataset.
- The last table reproduces MAI's Table 10 by choosing average lengths of 6,000, 3,100 and 230 tokens. A mixture that looks balanced by count (33% helpfulness) gives that category 2% of the gradient.
- Replacing the stub with a real judge changes cost, not structure: one judge call per edit. For a 30-turn run that is up to 30 extra calls, which is why cheap rule-based checks usually run first.

### Example 3 · Sizing a first agent SFT run

A numeric walkthrough with assumed inputs, showing how trajectory counts become packs, optimizer steps and supervised tokens.

**Inputs (assumptions, not from the slides).** 20,000 filtered trajectories averaging 24,000 tokens each. About 30% of tokens are assistant tokens; the rest are system prompt, issue text and observations. Pack length 128k = 131,072 tokens, with best-fit packing reaching 95% fill. Batch of 64 packs, as in Nemotron's configuration on slide 36.

**Step 1 · Total and supervised tokens.** 20,000 × 24,000 = 480M tokens processed per epoch. Supervised tokens: 0.30 × 480M = 144M. The loss is averaged over those 144M, not over 480M.

**Step 2 · Packs.** Useful tokens per pack: 0.95 × 131,072 ≈ 124,518. Packs per epoch: 480M / 124,518 ≈ 3,855.

**Step 3 · Steps.** 3,855 / 64 ≈ 60 optimizer steps per epoch. Each step processes 64 × 131,072 ≈ 8.4M token positions. Three epochs give about 180 steps; a 2% warmup (as in MAI's recipe) is only about 4 steps.

**Step 4 · Compare with padding.** Without packing, each trajectory is padded to 131,072 on its own: 20,000 × 131,072 ≈ 2.62B positions, of which 480M are real. Only 18% of compute does useful work, versus 95% with packing: roughly a 5× difference in cost for the same data.

**Step 5 · Put it in scale.** K2 Horizon's SFT used 332B tokens (slide 6). This whole run is 480M / 332B ≈ 0.14% of that. Small runs like this are how public papers such as SWE-Gym (491 trajectories) still show 10-point gains: the early gains are mostly the model learning to operate the harness.

**Step 6 · The overfit check.** Twenty trajectories are 480,000 tokens, about 4 packs. Train on those 4 packs for 50–100 steps. Loss on the 20 should head toward zero. If not, check the mask and template before anything else (slide 43).

| Quantity | Value |
| --- | --- |
| Tokens per epoch | 480M |
| Supervised tokens per epoch | 144M |
| Packs per epoch (95% fill) | ≈ 3,855 |
| Optimizer steps per epoch (batch 64) | ≈ 60 |
| Token positions per step | ≈ 8.4M |
| Useful fraction with padding instead | ≈ 18% |

What to notice:

- Sixty steps per epoch is very few. With so few updates, learning rate schedule and warmup matter a lot, and the final decay phase is a large share of the run.
- The 30% assistant fraction is the lever you control least and should measure first. Long observations, such as full test logs or HTML pages, drive it down fast.
- Batch "64" means very different things at different sequence lengths. Always convert to tokens per step before comparing recipes.
- Packing matters most when trajectory lengths vary widely, which agent runs do; padding waste grows with the spread of lengths.

## Key terms

These are the terms the lecture relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Agent Data Protocol (ADP) | A typed intermediate format for agent trajectories (actions and observations) so N datasets and M harnesses need N plus M converters, not N times M. |
| Assistant-only loss | Computing cross-entropy only on tokens the agent produced; system, user and tool tokens are context. |
| Behavior cloning | Imitation learning by supervised prediction of expert actions; agent SFT is behavior cloning with an LLM policy. |
| Chat template | The program (usually Jinja) that serializes role-tagged messages into one token string with special boundary tokens. |
| Cold start | The checkpoint RL begins from; SFT's job is to make it capable enough that RL gets reward signal. |
| Compounding error (covariate shift) | At deployment the model's own actions lead to states absent from training data, so errors accumulate over the horizon. |
| DAgger | Dataset Aggregation (Ross et al., 2011): run the learner, have an expert label visited states, retrain; reduces compounding error. |
| Distillation | Training a student on outputs (here, trajectories) produced by a stronger teacher model. |
| End-of-turn token | The stop token closing an assistant message (e.g. \`< |
| Expert iteration | Repeated loop of sampling the model's own runs, keeping successful ones, and fine-tuning on them. |
| Harness | The agent scaffold (e.g. OpenHands, SWE-Agent, AgentLab) that defines the prompt, tools, action syntax and loop. |
| Loss mask | One bit per token saying whether its prediction contributes to the loss. |
| Mixture of experts (MoE) | Architecture where a router sends each token to a few expert sub-networks; narrow SFT data can collapse routing. |
| Packing | Filling each fixed-length training sequence with several whole conversations to avoid padding waste. |
| Rejection sampling fine-tuning | Keeping only trajectories that pass a checker (e.g. repository tests) and training on them. |
| Samples versus tokens | A mixture balanced by example count can be very unbalanced by token count, and the loss is per token. |
| Supervised fine-tuning (SFT) | Further training of a pretrained model with next-token cross-entropy on curated demonstrations. |
| Teacher forcing | Training each step conditioned on the recorded prefix rather than on the model's own earlier outputs. |
| Template drift | Mismatch between the string rendered at training and at serving, including whitespace or rewritten earlier turns. |
| Trajectory | The full recorded run of an agent: system prompt, task, and alternating actions and observations until it ends. |

## Self-check

These questions test recall, reasoning and design; try each before reading the answer.

1. Name the three places an agent improvement can live, and one cost of putting it in weights. **Answer:** Context window, external artifacts, and model weights. Weight updates need a training run for every change, are opaque (you cannot inspect what changed), and are model-specific (the change does not move to another model).
2. Why are tool observations masked out of the loss in agent SFT? **Answer:** The model should condition on tool output, not generate it. Training on observations would teach it to write fake tool results instead of waiting for the real ones.
3. Which tokens around an assistant turn should be in the mask: the role header, the content, the end-of-turn token? **Answer:** The content and the end-of-turn token, but not the role header. The harness supplies the header at inference, while the model must produce the stop token itself; masking it out means the model may not learn to stop.
4. MAI-Thinking-1's mixture was 33% helpfulness and safety by samples. What share of tokens did it get, and why does that matter? **Answer:** About 2%. The loss is per token, so that capability received almost no gradient signal even though a third of the examples targeted it; STEM and coding traces were much longer and took 89% of tokens.
5. In OpenThoughts-Agent, GPT-5.3-Codex was the strongest model on the benchmarks. How did it do as a teacher, and what should you do about it? **Answer:** It produced the weakest student (average 11.94 versus about 18 for the GLM and Kimi teachers). Leaderboard rank does not predict teaching quality, so try at least two teachers and keep the better student.
6. What does OpenThoughts-Agent Figure 3 show about scaling agent SFT data? **Answer:** Starting from the same 10K rows, adding more runs of the same tasks flattens or even declines, while adding new tasks keeps improving on all three benchmarks. Task diversity, not sample count, is the axis that scales.
7. Explain the train-deploy mismatch in one example, and name the classical fix. **Answer:** Training always continues the recorded run, so after the recorded edit A the tests pass. At deployment the model may make a different edit B, see failing tests, and reach a state never in the data. DAgger (Ross et al., 2011) fixes this by labelling states the learner actually visits.
8. You have 2,000 successful trajectories, several per task, from 300 repositories. How would you split them to claim generalization to new repositories? **Answer:** Split by repository, so all tasks from a given repository are either in train or in test. At minimum keep all runs of one task on the same side; otherwise near-duplicate solutions leak into the test set.
9. How would you design a filter better than minimum turns for the lecture's runs A, B and C? **Answer:** Keep runs that pass tests, then score process: detect no-op actions (edits that change nothing, repeated identical commands) and debugging leftovers in the final patch. Keep A and B, drop C or mask its no-op turns, and consider masking B's wrong edit while training on the recovery.
10. Your SFT loss does not decrease when you overfit 20 trajectories. Where do you look first? **Answer:** Upstream of the optimizer: the mask (is it all zeros or misaligned with tokens?), the chat template (does rendering match the tokenizer's special tokens?), and data loading or packing. The lecture's rule is that a failed overfit test means the bug is not in the hyperparameters.
11. Why did the best SFT-plus-RL recipe in OpenThoughts-Agent Table 11 start from a checkpoint that was not the best SFT model? **Answer:** ColdSFT scored 15.1 alone versus 15.9 for the best SFT model, but after RL it reached 21.7. An SFT checkpoint chosen for RL keeps enough diversity and room to improve; MAI states that RL gains most when the SFT model is selected with RL in mind.
12. What goes wrong when you fine-tune an MoE on a narrow agent dataset, and how did MAI address it? **Answer:** Routing collapses so a few experts receive most tokens while others sit idle. MAI weighted the load-balancing loss about a thousand times more during SFT than during RL and raised dropout to 0.15.

## Practice problems

Eleven exam-style problems, harder than the Self-check. Work each one before reading the solution.

1. **Mask fraction.** A trajectory has an 800-token system prompt, a 400-token issue, 12 assistant turns and 12 tool turns. Each assistant turn is a 3-token role header, 150 content tokens and 1 end-of-turn token. Each tool turn is 900 tokens including its header. (a) What fraction of tokens has mask 1? (b) Six of the tool outputs are replaced by 3,000-token logs. What is the new fraction, and what happens to this trajectory's supervision and its compute cost?

   **Solution:** (a) Total tokens: 800 + 400 + 12 × 154 + 12 × 900 = 1,200 + 1,848 + 10,800 = 13,848. Mask-1 tokens are content plus end-of-turn: 12 × 151 = 1,812, so the fraction is 1,812 / 13,848 ≈ 13.1%. The 3-token headers are excluded because the harness supplies them. (b) Tool tokens become 6 × 900 + 6 × 3,000 = 23,400, so the total is 26,448 and the fraction drops to 1,812 / 26,448 ≈ 6.9%. The supervised tokens are unchanged at 1,812, so under a per-token loss the trajectory teaches exactly as much. But it now costs almost twice the compute and packing space. Long observations buy context, not supervision; truncating or summarizing tool output in the harness is a cost lever.
2. **Rebalancing a mixture by weights.** You have 4,000 SWE runs averaging 30k tokens, 6,000 web runs averaging 8k, and 10,000 chat examples averaging 1.5k. (a) Give sample and token shares. (b) What per-token loss weight on chat gives it 15% of the effective gradient, leaving the others at weight 1?

   **Solution:** (a) Samples: 20% SWE, 30% web, 50% chat. Tokens: 120M, 48M and 15M, total 183M, so 65.6%, 26.2% and 8.2%. Chat is half the examples but under a tenth of the signal, the MAI pattern from slide 18. (b) Solve 15w / (168 + 15w) = 0.15, where 168M is the unweighted SWE plus web tokens. This gives 12.75w = 25.2, so w ≈ 1.98. Doubling chat's per-token weight lifts it to 15%. The alternative, upsampling chat, would need many more repeats of the same examples, which risks memorization (slide 28's lesson about repeats).
3. **Compounding error budget.** Your agent's episodes average 40 steps. (a) What per-step deviation rate ε keeps 70% of episodes fully on the demonstrated distribution? (b) If tasks grow to 80 steps at the same ε, what fraction stays on distribution?

   **Solution:** (a) Solve (1 − ε)^40 = 0.7. Then ε = 1 − 0.7^(1/40) ≈ 1 − e^(−0.00892) ≈ 0.89%. The model must match the demonstrator on more than 99.1% of steps. (b) (1 − ε)^80 = 0.7² = 0.49, so fewer than half of episodes stay on distribution. Doubling the horizon squares the survival probability. This is why long-horizon agents need recovery data or RL, not just lower SFT loss (slide 42).
4. **RL signal from a cold start.** A group-based RL method samples G rollouts per task and gets zero gradient from a task whose rollouts all fail. Compute the all-fail probability for p = 0.03 (a base model) and p = 0.18 (an SFT checkpoint), with G = 8 and G = 16. What does this say about slide 47?

   **Solution:** For p = 0.03: 0.97^8 ≈ 0.78 and 0.97^16 ≈ 0.61. For p = 0.18: 0.82^8 ≈ 0.20 and 0.82^16 ≈ 0.04. Doubling G helps the base model only modestly: 61% of its tasks still teach nothing, while each step costs twice the rollouts. SFT raises p, which cuts the dead fraction far more cheaply. This matches slide 47, where RL on bare Qwen3-8B moved the average only from 2.7 to 3.6. The same logic applies at the top: if p is near 1, all-success groups (0.9^8 ≈ 0.43) also give zero advantage, so RL tasks should be neither trivial nor impossible for the start checkpoint.
5. **Debugging a mask dump.** A teammate prints one assistant turn with mask bits: `<|im_start|>`=1, `assistant`=1, `\n`=1, `I'll run the tests.`=1, `<tool_call>`=1, `bash(cmd="pytest")`=1, `</tool_call>`=1, `\n`=1, `<|im_end|>`=0. Identify both bugs, predict the symptom of each, and give the fix.

   **Solution:** Bug 1: the role header (`<|im_start|>assistant\n`) has mask 1. It is supplied by the harness at inference, so training on it wastes a little signal. Worse, it teaches the model to open new assistant turns itself, which can cause it to continue past its own turn. Bug 2, the serious one: `<|im_end|>` has mask 0. The model is never trained to stop, so after `</tool_call>` it keeps generating, often a fake `<|im_start|>tool` block with invented output (slide 15's "may not learn to stop"). The fix is to start the span after the header's newline and end it after `<|im_end|>`. In Axolotl this is `train_on_eos: turn`; in TRL it is correct `{% generation %}` placement. Add an assertion that every assistant end-of-turn token has mask 1.
6. **Debugging a trajectory.** After SFT, the served model often produces `<tool_call>bash(cmd="pytest -q")</tool_call>` and then, in the same generation, `<|im_start|>tool\n44 passed<|im_end|>`, before the harness runs anything. List three possible causes and how you would tell them apart.

   **Solution:** Cause 1: observations were trained on (mask 1 on tool turns), so the model learned to write tool output. Check a mask dump for any tool turn. Cause 2: the end-of-turn token was masked, so the model never learned to stop after a call (problem 5). Check whether generations ever contain `<|im_end|>` right after `</tool_call>`. Cause 3: a serving bug. The model does emit `<|im_end|>`, but the server does not treat it as a stop token, perhaps because the generation config names a different EOS id. Check the raw token ids at the point where the model should have stopped. Causes 1 and 2 require retraining; cause 3 is a one-line config fix. That is why you check it first.
7. **Design a template-drift test.** Your serving template drops `<think>` content from assistant turns that come before the latest user message, as Qwen3's does. Design a test that detects prefix drift, and explain what to change if it fails for your agent data.

   **Solution:** For each trajectory and each k, render the first k messages with the serving template, then render the first k+1. Assert that the second string starts with the first, byte for byte. With a reasoning-stripping template, the test fails whenever a new user message arrives, because earlier turns lose their `<think>` blocks. In a single-issue agent run there is only one user message, so all reasoning survives. But multi-request sessions will fail. Two fixes exist. Train on what serving produces, with earlier reasoning stripped, rendering one training sample per user turn if needed. Or change the serving template to keep reasoning, and train with the same template. Either way, the training renderer and the serving renderer must be the same code (slide 39).
8. **Critique an evaluation claim.** A team reports: "Our SFT agent scores 42% on SWE-bench-style tasks, up from 20%. We split our 3,000 trajectories (several runs per task, 150 repositories) 90/10 at random and evaluated on the 10%. The baseline number is from a published paper." List the problems and a corrected protocol.

   **Solution:** First, leakage: a random split puts runs of the same task, and tasks from the same repository, on both sides, so the model has seen near-identical solutions. Second, the test set is the training distribution, not a benchmark, so "42%" is not comparable to published SWE-bench numbers. Third, the baseline may come from a different harness, or be the best of several harnesses (slide 43). Fourth, nothing checks regressions outside the target domain (slide 45). A corrected protocol: split by repository, then check you can overfit 20 examples. Evaluate base and fine-tuned models in the same target harness on a standard held-out benchmark with tests. Report uncertainty, and run a general regression suite on every checkpoint.
9. **Budget allocation.** You can afford 40,000 teacher rollouts. Option (a): 10 runs each of 4,000 tasks from one source. Option (b): 2 runs each of 20,000 tasks drawn from 6 sources. You have not yet picked a teacher. Choose, and plan the budget.

   **Solution:** Prefer (b). Slide 28 shows more distinct tasks keep improving while more runs of the same tasks flatten or decline. Slide 27 shows task source is the biggest lever and that mixing the best four to eight sources helps. Slide 34 shows mixtures beat single sources even on the matching benchmark. Before committing, spend a small slice, say 2 runs each of 1,000 tasks for two candidate teachers (4,000 rollouts), then train two small students and compare them in the target harness. Slide 26 shows leaderboard rank does not predict teacher quality. Keep 2 runs per task, rather than 1, so filtering (tests plus process checks) still leaves most tasks with at least one clean run.
10. **Packing by hand.** Pack runs of 29k, 19k, 17k, 15k, 11k, 8k and 7k tokens into 56k packs with best-fit decreasing, never splitting a run. Give the packs, the fill rate, and the fill rate if each run were padded to 56k instead.

    **Solution:** Sort descending and place each run where it leaves the least room. 29 opens pack 1 (27 left). 19 fits pack 1 (8 left). 17 does not fit, so it opens pack 2 (39 left). 15 goes to pack 2 (24 left). 11 goes to pack 2 (13 left). 8 fits both, and pack 1 is tighter (0 left). 7 goes to pack 2 (6 left). Packs: {29, 19, 8} full and {17, 15, 11, 7} with 6k unused. Fill: 106 / 112 ≈ 94.6%. Padding each run separately uses 7 × 56 = 392k positions for 106k of data, about 27% useful. Packing also needs attention isolation between runs in a pack, which padding gets for free.
11. **Choosing the RL start.** Two SFT checkpoints: X (3 epochs) scores 16.2 on your benchmark, with pass@8 of 31% on held-out RL tasks and low output diversity. Y (1.5 epochs) scores 15.3, with pass@8 of 38%. Which do you hand to RL, and how would you confirm it?

    **Solution:** Hand over Y. RL can only amplify successes it samples, and pass@8 measures how often at least one of eight rollouts succeeds, which is close to what a group-based method needs (problem 4). Y's lower single-sample score but higher coverage matches OpenThoughts-Agent's ColdSFT checkpoint (15.1 alone, 21.7 after RL, versus 15.9 for the best SFT model). It also matches MAI's rule that the SFT model should be "selected with RL in mind." X's low diversity means more all-pass or all-fail groups, and so less gradient. To confirm, run a short RL pilot from both checkpoints on the same tasks and compare reward curves after a fixed number of steps. The difference of 16.2 versus 15.3 alone is likely within noise anyway.

## References and further reading

The first list covers every source the slides cite; the second adds background worth reading next. Items dated 2026 without a link could not be verified at a stable official URL.

### Cited in the lecture

- [Training Software Engineering Agents and Verifiers with SWE-Gym](https://arxiv.org/abs/2412.21139) — Pan, Wang, Neubig et al., 2024 (ICML 2025) — the running example: 491 passing trajectories lift Qwen2.5-Coder by 9 to 14 points on SWE-Bench.
- [OpenThoughts-Agent: Data Recipes for Agentic Models](https://arxiv.org/abs/2606.24855) — Raoof, Zhuang, Nezhurina, Guha, Schmidt et al., 2026 — the source of the filter, teacher, task-source, scaling and SFT-before-RL ablations.
- [Agent Data Protocol: Unifying Datasets for Diverse, Effective Fine-tuning of LLM Agents](https://arxiv.org/abs/2510.24702) — Song et al., 2025 (ICLR 2026 oral) — the unified trajectory format and cross-task transfer results.
- [NVIDIA Nemotron 3 Ultra](https://research.nvidia.com/labs/nemotron/Nemotron-3-Ultra/) — NVIDIA, 2026 — reasoning masking, filtering successful rollouts, packing and multi-harness collection (§3.1).
- MAI-Thinking-1 technical report — Microsoft AI, 2026 — samples-versus-tokens mixture table, MoE routing balance during SFT, and selecting SFT checkpoints for RL.
- Kimi K3 technical report — Kimi Team (Moonshot AI), 2026 — SFT as cold start, the XTML template and its separate end-of-turn tokens.
- K2 Horizon model card and training overview — MBZUAI Institute of Foundation Models, 2026 — fully open stage-by-stage training table, W&B logs and intermediate checkpoints.
- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — R1-Zero (RL without SFT) versus R1 (cold-start SFT first).
- [Kimi K2: Open Agentic Intelligence](https://arxiv.org/abs/2507.20534) — Kimi Team, 2025 — large-scale agentic data synthesis and the SFT/RL split (§3.2).
- [BalanceSFT (arXiv 2505.20192; earlier versions titled FunReason)](https://arxiv.org/abs/2505.20192) — Hao et al., 2025 — reweighting reasoning versus tool-call tokens and resampling hard examples.
- [On the Effect of Instruction Tuning Loss on Generalization](https://arxiv.org/abs/2507.07817) — Chatterjee et al., 2025 (TACL) — weighted instruction tuning (WIT); careful single-turn masking study.
- [Instruction Tuning With Loss Over Instructions](https://arxiv.org/abs/2405.14394) — Shi et al., 2024 (NeurIPS) — when training on the prompt helps: long prompts, short answers, little data.
- [A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning (DAgger)](https://arxiv.org/abs/1011.0686) — Ross, Gordon and Bagnell, 2011 — the formal account of compounding error in behavior cloning.
- [Chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating) and [Writing a chat template](https://huggingface.co/docs/transformers/main/en/chat_templating_writing) — Hugging Face Transformers docs — how templates render conversations, and why they must match training.
- [SFT Trainer](https://huggingface.co/docs/trl/sft_trainer) — Hugging Face TRL docs — `assistant_only_loss`, `completion_only_loss` and generation markers.
- [Conversation dataset formats](https://docs.axolotl.ai/docs/dataset-formats/conversation.html) — Axolotl docs — `roles_to_train` and `train_on_eos`.
- [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory) — hiyouga et al. — data arguments `train_on_prompt` and `mask_history`.

### Further reading

- [FireAct: Toward Language Agent Fine-tuning](https://arxiv.org/abs/2310.05915) — Chen, Shu, Shareghi, Collier, Narasimhan, Yao, 2023 — early evidence that 500 GPT-4 trajectories substantially improve a 7B agent.
- [AgentTuning: Enabling Generalized Agent Abilities for LLMs](https://arxiv.org/abs/2310.12823) — Zeng et al., 2023 — AgentInstruct plus general data to keep broad abilities while adding agent skills.
- [Agent-FLAN: Designing Data and Methods of Effective Agent Tuning](https://arxiv.org/abs/2403.12881) — Chen et al., 2024 — format versus reasoning learning speeds, and negative samples against hallucinated actions.
- [SWE-smith: Scaling Data for Software Engineering Agents](https://arxiv.org/abs/2504.21798) — Yang et al., 2025 — synthesizing tens of thousands of checkable SWE tasks, the top task source in OpenThoughts-Agent.
- [STaR: Bootstrapping Reasoning With Reasoning](https://arxiv.org/abs/2203.14465) — Zelikman, Wu, Mu, Goodman, 2022 — the generate-filter-fine-tune loop behind self-improvement and expert iteration.
- [Thinking Fast and Slow with Deep Learning and Tree Search](https://arxiv.org/abs/1705.08439) — Anthony, Tian, Barber, 2017 — the original Expert Iteration algorithm.
- [LIMA: Less Is More for Alignment](https://arxiv.org/abs/2305.11206) — Zhou et al., 2023 — how far a small curated SFT set goes, and a useful contrast with data-hungry agent SFT.
- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — Hu et al., 2021 — the default parameter-efficient method for fine-tuning on limited hardware.
- [LoRA Learns Less and Forgets Less](https://arxiv.org/abs/2405.09673) — Biderman et al., 2024 — the learning-versus-forgetting trade-off between LoRA and full fine-tuning.
- [Fixing Gradient Accumulation](https://huggingface.co/blog/gradient_accumulation) — Hugging Face, October 2024 — why the loss must be divided by all non-padding tokens across an accumulation step; the normalization bug mentioned in Going deeper.
- [Improving Hugging Face Training Efficiency Through Packing with Flash Attention 2](https://huggingface.co/blog/packing-with-FA2) — Hugging Face — packing without cross-example attention using position ids and DataCollatorWithFlattening.
- [Qwen3-8B model card and chat template](https://huggingface.co/Qwen/Qwen3-8B) — Qwen Team — a published template that keeps reasoning only for assistant turns after the last user message; a concrete case of slide 39's template drift.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T10 - Supervised Fine-Tuning on Agent Trajectories]]
- [[Fine-Tuning Concept Primer]]
- [[5 Techniques to Fine-Tune LLMs]]

[[L07 - Computer Use Agents|← L7]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L09 - RL Foundations|L9 →]]
