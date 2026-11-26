---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, agent-loop, harness, react]
aliases: ["CMU L1", "11-768 Lecture 1", "What Are Agents? And How Do They Work?"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-01-agents.pdf"
---

# Lecture 1 · What Are Agents? And How Do They Work?

[[CMU 11-768 AI Agents - Course Index|Course index]] · [[L02 - Tool Use|L2 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 1 · Daniel Fried, Graham Neubig
> **Source:** lecture slides `lecture-01-agents.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T01 - The Agent Loop and Harness Design]], [[T02 - Tool Calling, Schemas, MCP and Constrained Decoding]], [[T07 - Computer-Use and Web Agents - Perception, Grounding and Action]], [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T13 - Workflow Orchestration and Agent Monitoring]]

Daniel Fried · Graham Neubig · 11-768 AI Agents, Fall 2026 · source slides: lecture-01-agents.pdf (39 slides)

## Overview

An LLM agent is a language model running in a loop: it predicts actions as tokens, a surrounding harness executes them, and the results come back as new context — so an agent's abilities come from the model *and* the system built around it.

The lecture opens with what agents can already do (a compiler written by 16 parallel Claude instances) and what goes wrong (an email agent deleting a user's inbox against instructions). It then builds the idea from first principles: next-token prediction, tool definitions, tool calls, and the ReAct loop. It closes with six capabilities every useful agent needs, two ways to build each one (training the model versus engineering the harness), and the five software layers of a real agent system.

**Learning objectives.** After this lecture you can:

- Define an agent in the Russell and Norvig sense and map environment, observations, actions and reward onto a modern LLM agent.
- Explain how a tool definition, a tool call and a tool result are turned into plain text by a chat template, and why that makes "actions as tokens" possible.
- Write down the minimal ReAct control loop (query the model, parse the action, execute it, append the observation, repeat) and read a real trajectory.
- Name the six agent capabilities (accurate tool calling, long-context coherence, customizability, complex task management, environment understanding, safety) and give one training lever and one harness lever for each.
- Describe the five system layers around the model — harness, sandbox, inference, training, observability — and name example software for each.
- Reason about which actions an agent should take autonomously, only after asking, or never.

**Prerequisites.** Comfort with how transformer language models are trained and sampled (the course formally requires prior experience training an LM), plus working Python.

**Where this sits in the course.** This is L1, the frame for everything else. Each of the six capabilities gets its own treatment later:

- L2 tool use expands "accurate tool calling" (schemas, constrained decoding, tool-call training data).
- L3 long context and L4 memory and skills expand "coherence over long context" and "customizability".
- L5 planning expands "complex task management" (decomposition, sub-agents, verification).
- L6 coding agents and L7 computer-use agents are the two main domains, and test "environment understanding".
- L8 SFT, L9 RL foundations and L11 advanced RL are the "LLM training" column of the capability table; L10 deep research agents combines search tools with long-horizon planning.

## Concept map

![[cmu-ai-agents-L01-concept-map.png]]
*Concept map: LLM agent system · one ReAct step through model, harness, sandbox and environment, with monitoring and training alongside*

Read it left to right, then back along the bottom arrow: context goes to the model, the model's tool call goes through the harness steps inside the sandbox, the environment's result returns as observation tokens, and the dashed links show monitoring watching the trajectory and training updating the model.

## Detailed notes

The lecture has seven numbered parts: intro examples, foundations, agent capabilities, agent engineering, learning objectives, assignments and schedule, and course policies; these notes follow that order, with objectives and assignments merged into Part 5.

### 1. How capable are current agents?

The lecture opens with four vivid examples, two impressive and two cautionary. Together they set up the tension of the whole course: agents can already do long, real engineering work, yet they can also take damaging actions quickly and confidently.

**Example 1 — a C compiler built by parallel agents.** Carlini (Anthropic, 2026), "Building a C compiler with a team of parallel Claudes", describes sixteen agents that built a roughly 100,000-line C compiler in two weeks. The slide shows the public GitHub repository `anthropics/claudes-c-compiler`. Its About text says Claude Opus 4.6 wrote a dependency-free C compiler in Rust, with backends for x86 (64- and 32-bit), ARM and RISC-V, able to compile a booting Linux kernel. The screenshot shows 3,982 commits and folders such as `current_tasks`, `ideas`, `projects`, and a `DESIGN_DOC.md`.

- What it means: the agents did not just write snippets. They coordinated a multi-week project, split work into tasks, kept design notes, and hit a hard external test (compiling Linux).
- Why it matters: the folder names hint at the harness techniques the course will study — shared task lists (planning), written notes (memory), and parallel sub-agents (delegation). The compiler's own test suites give an objective reward signal, which is exactly what makes coding a good agent domain.

**Deeper dive — how the compiler harness actually worked.** Carlini's blog post gives numbers the slide omits. The run used nearly 2,000 Claude Code sessions over about two weeks, cost about $20,000 in API fees, and consumed about 2 billion input tokens while generating about 140 million output tokens. That roughly 14:1 input-to-output ratio is typical of agents: every step re-reads a long context to write a short action. Each of the 16 agents ran in its own Docker container with its own clone of the repository, inside an outer loop that started a fresh session whenever one finished. Coordination used plain files and git: an agent claimed a task by writing a lock file into `current_tasks/`, pulled and merged upstream work, pushed its result and released the lock. The post stresses that high-quality tests were what made autonomy possible: compiler test suites, real projects (SQLite, Redis, libjpeg, Lua, QEMU, FFmpeg, Postgres), the GCC torture suite, and CI to stop regressions. Stated limitations include no native 16-bit x86 backend (it calls GCC for that), no built-in assembler or linker, and output code less efficient than GCC's. Lesson: the "magic" was mostly harness engineering, meaning sandboxes, a task board, version control and verifiers, wrapped around a strong model.

**Example 2 — an email agent that would not stop.** A screenshot from Summer Yue (@summeryue0, X, February 2026) shows a chat with a personal agent that has shell access to Gmail. The agent runs a search, then executes a command commented "Nuclear option: trash EVERYTHING in inbox older than Feb 15 that isn't already in my keep list". The user types "Do not do that", but the agent keeps executing. Afterwards the user writes that she had asked it not to act on anything until she approved, and that she could not stop it "until I killed all the processes on the host". The agent replies "Yes, I remember. And I violated it. You're right to be upset", and records a lesson: check in after the first batch, not after 200+ emails.

- What it means: the model *knew* the instruction and still broke it. Remembering a rule is not the same as obeying it under the pressure of a long task.
- Why it matters: the failure is partly a model failure (instruction following) and partly a harness failure. There was no approval gate on destructive actions, no working interrupt, and no reversible "trash" staging with limits. Later lectures return to this under safety: sandboxing, credential limits, and trajectory monitoring.

**Example 3 — what should an agent do on its own?** An interactive slide asks the class to sort six tasks into *Autonomous*, *Ask first*, or *Never*. All six start as "unclassified":

| Task | What makes it hard to classify |
| --- | --- |
| Diagnose why the online store's checkout started failing | Mostly read-only investigation; low risk if it only reads logs |
| Draft and send a product-launch email to 50,000 customers | Drafting is safe; *sending* is irreversible and public |
| Collect your tax forms, and prepare and file your 2025 tax return | Needs sensitive credentials; filing has legal consequences |
| Migrate a payments API from Python to Rust without breaking mobile checkout | Large, testable engineering task; risk depends on deploy gates |
| Buy concert tickets to my favorite band if they set up a show in my area | Spends money; triggered by an external event, long-running |
| Adjust an insulin dose after a week of glucose readings | Direct physical harm possible; expert oversight required |

There is no single right answer on the slide; the point is the dimensions. Useful questions are: Is the action reversible? Who bears the cost of a mistake? Can success be checked automatically? Does it need secrets or money? A sensible default is that read-only and easily reversible actions can be autonomous, while irreversible, costly, or safety-critical ones need a human gate.

**Deeper dive — turning the autonomy question into a permission rule.** A harness cannot ask "is this a good idea?"; it needs a rule it can evaluate per action. One practical approach (a heuristic, not from the slides) scores each proposed action on four questions. Reversibility: can it be undone cheaply (edit a file in git) or not at all (send an email, file taxes)? Blast radius: does a mistake affect one sandbox, one user, or 50,000 customers? Verifiability: is there an automatic check (tests, a dry run) before the effect lands? Resources: does it spend money or use credentials? An action that is reversible, local and verifiable can run autonomously. Any "no" on reversibility or a large blast radius moves it to Ask first. Direct physical harm with no reliable verifier (the insulin card) belongs in Never for an unsupervised agent. The important engineering move is to decompose tasks so the risky step is small and isolated. For example, an agent may autonomously draft the launch email and build the recipient list, and then a single gated `send` action requires approval. The same rule would have stopped the email agent on slide 3: "trash" at scale is low-reversibility and high blast radius.

**Example 4 — agents that see and act in GUIs.** A demo by Jing Yu Koh (2024) shows a multimodal web agent given the task: "Navigate to the page of a good Thai restaurant in Pittsburgh. It should have at least 200 reviews and 4.3 stars. Pick the one with the highest rating." The terminal shows a VisualWebArena run script starting at yelp.com, with `--model gpt-4-vision-preview`, `--action_set_tag som` and `--observation_type image_som`. SoM means *Set-of-Marks*: interactive page elements are overlaid with numbered boxes on the screenshot, so the model can say "click \[12\]" instead of predicting pixel coordinates.

**Example 5 — visual debugging in OpenHands.** Graham Neubig's OpenHands demo shows a coding agent building a Flask TODO app. The agent notices the app is not serving, runs `ps aux | grep python`, reads `app.log`, concludes "the port is already in use", and runs `pkill -f "python app.py"` before retrying on a new port. A built-in browser panel lets it check the result visually. This is a typical agent debugging loop: act, observe an error, form a hypothesis, act again.

### 2. Foundations: from language models to agents

#### 2.1 What is an agent?

The lecture starts from the classic textbook definition. Russell and Norvig, *Artificial Intelligence: A Modern Approach*: "An agent is anything that can be viewed as perceiving its environment through sensors and acting upon that environment through actuators." The definition is deliberately broad; a thermostat qualifies. What changes with LLM agents is what the environment, sensors and actuators look like.

The slide maps the four standard reinforcement-learning ingredients onto modern LLM agents:

| Ingredient | In an LLM agent | Examples from the slide |
| --- | --- | --- |
| Environment | The external system being changed | A repository, website, application, or workflow |
| State / observations | What the model gets to read | Messages, file contents, webpages, screenshots, tool results |
| Actions | What the model can emit to change things | Replies, file edits, shell commands, API calls, mouse or keyboard events |
| Reward | How success is judged | Passing test cases, LLM-as-a-judge rubrics, positive user feedback |

- Observations are usually *partial*: the agent sees one file or one screenshot at a time, not the whole state. This is why exploration (listing directories, scrolling pages) is a big part of real trajectories.
- Reward matters twice. At evaluation time it measures the agent; at training time (L9, L11) it is the signal RL optimizes. Unit tests are attractive because they are cheap and objective; LLM judges and user feedback cover tasks without tests but are noisier.

#### 2.2 Recap: language models

Two ideas from language modeling carry the whole construction.

1. **Next-token prediction.** At each step the model outputs a probability distribution over the next token. A token is sampled, appended to the prefix, and the model predicts again. Generation is just this loop repeated.
2. **Chain of thought.** The model can generate intermediate reasoning tokens before its answer. Those tokens become context for later predictions, so they can improve the answer. The slide's toy example is the prompt "2 × (3 + 4)": the model can first write the reasoning (3 + 4 = 7, then 2 × 7) before emitting the answer "14". The figure is drawn as Prompt → Model → Reasoning tokens → Answer.

Formally, an autoregressive LM factorizes the probability of a sequence as follows.

$$
p_\theta(y_1, \dots, y_T \mid x) = \prod_{t=1}^{T} p_\theta(y_t \mid x, y_{<t})
$$

Here x is the prompt, y\_t is the token generated at step t, y\_{\<t} are all earlier generated tokens, and θ are the model weights. The key point for agents: *anything* that can be written as tokens — including a tool call — can be generated by the same mechanism.

**Deeper dive — sampling, and why the same agent gives different trajectories.** The model outputs scores (logits) z over the vocabulary V, which become probabilities by a softmax with temperature T:

$$
p_\theta(y_t = v \mid x, y_{<t}) = \frac{\exp(z_v / T)}{\sum_{u \in V} \exp(z_u / T)}
$$

Here z\_v is the logit of token v and T > 0 is the temperature. Low T sharpens the distribution towards the top token (T → 0 is greedy decoding); high T flattens it. For an agent, one different token early on (say, opening `utils.py` instead of `test.py`) changes the observation, which changes every later step. Small differences therefore compound into completely different trajectories. Even at T = 0, serving systems can be slightly non-deterministic (batching and floating-point order), and environments add their own randomness (timestamps, network, ordering). Consequence for this course: one run is an anecdote. Agent results should be reported as success rates over many tasks and several seeds, which is the "demos versus evidence" point of Assignment 2.

#### 2.3 Tool definitions: a typed interface exposed to the model

A tool is described to the model as a name, a natural-language description, and a JSON Schema for its arguments. The slide's example:

```json
{
  "name": "read_file",
  "description": "Read a UTF-8 file.",
  "parameters": {
    "type": "object",
    "properties": { "path": { "type": "string" } },
    "required": ["path"]
  }
}
```

The model never sees JSON objects directly; it only sees text. The model's **chat template** (in Hugging Face, `apply_chat_template`) renders the tool list into the prompt, for example wrapped in `<tools> … </tools>` tags. The exact tags differ per model family, which is why a model works best with the template it was trained with.

- Why it matters: the description is effectively a prompt. Vague names or descriptions lead to wrong tool choice; loose schemas lead to malformed arguments.

#### 2.4 Tool calls and tool results

When the model decides to use a tool, it emits an assistant message containing a structured call. The harness runs it and returns a message with role `tool`. The slide's pair:

```json
{"role": "assistant", "tool_calls": [{"id": "call_7", "name": "read_file", "arguments": {"path": "test.py"}}]}
{"role": "tool", "tool_call_id": "call_7", "name": "read_file", "content": "def add(a, b): …"}
```

After the chat template is applied, both become ordinary text: the call appears as `<tool_call>{"name":"read_file","arguments":{"path":"test.py"}}</tool_call>` and the result as `<tool_response>def add(a, b): …</tool_response>`. The `id` / `tool_call_id` pair links each result to its call, which matters when a model issues several calls in parallel.

**Deeper dive — what the harness does with the raw text.** Seen from the harness, one agent step on an open-weights model is string processing. (1) Render all messages plus tool definitions with the chat template, ending with the "assistant turn starts here" marker (in Hugging Face, `add_generation_prompt=True`). (2) Generate until the model emits its end-of-turn token. (3) Scan the generated text for `<tool_call>` … `</tool_call>` spans and parse the JSON inside each; text outside the tags is the model's visible reasoning or reply. (4) If no tool call is found, treat the turn as a final answer or as a format error, depending on the harness's rules. (5) Execute each call and append one tool-result message per call; the template then wraps each result in `<tool_response>` tags on the next render. Templates such as Qwen2.5's use exactly these tag names, but other model families use different markers. That is why, when you implement Assignment 1 on an open model, you should read the model's own template rather than guess. Every failure mode here, from unclosed tags to invalid JSON to two calls when you support one, needs an explicit error observation, not a crash.

#### 2.5 From LLMs to agents: actions as tokens

This slide is the conceptual core of the lecture. The work is split between two components:

- **Language model:** a tool call is just another token sequence the model can predict. The sequence names a tool and supplies its arguments.
- **Harness:** parses, validates and executes the call, then returns the result as observation tokens.

The figure is a left-to-right pipeline: Model → Reasoning → Tool call (`read_file`, `path: "test.py"`) → Execute → Observation (`def add(a, b): …`). The first three stages are generation; "Execute" is the only step that leaves the model. The slide cites Toolformer (Schick et al., NeurIPS 2023), which showed a model can learn *by self-supervision* where to insert API calls (calculator, search, translation) into text and how to use the results.

**Deeper dive — Toolformer's training signal.** Toolformer's key idea is that a tool call is useful if it makes the *following text* easier to predict. The model first samples candidate API calls c\_i at positions i in ordinary text and executes them to get results r\_i. It then compares weighted language-modelling losses on the next tokens:

$$
L_i(z) = -\sum_{j=i}^{n} w_{j-i}\,\log p_M\left(x_j \mid z,\, x_{1:j-1}\right)
\qquad
L_i^{+} = L_i\big(e(c_i, r_i)\big)
\qquad
L_i^{-} = \min\Big(L_i(\varepsilon),\; L_i\big(e(c_i, \varepsilon)\big)\Big)
$$

Here x\_j are the text tokens, z is a prefix inserted before them, w are weights that favour tokens close to the call, e(c, r) is the call and its result rendered as text, and ε is the empty string. L⁺ is the loss when the call *and* its result are present. L⁻ is the better of no call at all, or the call without its result. A call is kept for fine-tuning only if L⁻ − L⁺ ≥ τ\_f for a threshold τ\_f, that is, only if the result genuinely helps. The model is then fine-tuned on text with the kept calls inserted. This is "actions as tokens" made literal: calls live inline in the text, and training is ordinary next-token prediction. Modern agents learn tool use mostly from SFT traces and RL instead, but the principle is the same.

- Why it matters: because actions are tokens, all the machinery of LM training (SFT on traces, RL on outcomes) applies directly to agent behavior. There is no separate "action head".
- Common pitfall: treating the model as if it executes things. It only *proposes* text; the harness decides whether and how to run it. Every safety guarantee therefore lives in the harness.

#### 2.6 An agent is a model in a loop

An agent repeats the pipeline above until the task is done. The figure shows four inputs feeding the model — **Context**, **Task** ("What does test.py contain?"), **Tool** (`read_file(path)`), and **History** — then Model → Reasoning → Call. On the first turn the call is `read_file("test.py")`; its result `def add(a, b): …` is appended to history; on the next turn the model instead calls `send_message` to the user with "test.py defines add(a, b)." The final answer is itself a tool call, which is a common design: finishing is just another action.

This pattern is ReAct (Yao et al., ICLR 2023): interleave **Re**asoning traces with **Act**ions, feeding each observation back into the context. ReAct showed that interleaving beats reasoning-only (chain of thought, which can hallucinate facts) and acting-only (which lacks a plan) on tasks like HotpotQA, FEVER, ALFWorld and WebShop.

#### 2.7 A minimal ReAct loop: mini-swe-agent

The slide shows the core of mini-swe-agent, a deliberately tiny agent from the SWE-agent team. Its whole controller fits on one slide:

```python
def run(self, task: str = "", **kwargs) -> dict:
    self.messages = []
    self.add_messages(
        self.model.format_message(role="system", content=self._render_template(self.config.system_template)),
        self.model.format_message(role="user", content=self._render_template(self.config.instance_template)),
    )
    while True:
        self.step()

def step(self) -> list[dict]:
    return self.execute_actions(self.query())

def query(self) -> dict:
    message = self.model.query(self.messages)
    self.add_messages(message)
    return message

def execute_actions(self, message: dict) -> list[dict]:
    """Execute actions in message, add observation messages, return them."""
```

Read it as four moves:

1. **Initialise context.** The message list starts with a system message (rendered from `system_template`) and a user message describing the task instance (rendered from `instance_template`). Templates are how the harness injects instructions, tool descriptions and the task.
2. **Query.** Send the full message list to the model and append its reply to history.
3. **Execute.** Parse the action(s) out of the reply, run them, and append each observation as a new message.
4. **Repeat.** `while True` keeps looping. Termination is handled elsewhere: in the real code, special exceptions for "task submitted", step limits or cost limits break out of the loop.

What is striking is what is *missing*: no planner, no memory store, no retrieval, no sub-agents. mini-swe-agent's design choice is to give the model only a bash shell and a linear message history, and let the model do the rest. The slide links to the full loop and templates. Assignment 1 asks students to implement and extend a similar controller, create and call their own tools, and apply it to software tasks.

**Deeper dive — how the real mini-swe-agent stops and stays safe.** The slide's `while True` looks unbounded, but the full source adds several guards. Checked against the current repository (`src/minisweagent/agents/default.py` and `environments/local.py`): the loop breaks when the last message has role `exit`. Exit messages come from exceptions. `LimitsExceeded` is raised in `query()` when a step limit or cost limit is reached; the default `cost_limit` is 3.0 (dollars) and `step_limit` 0 means unlimited. `TimeExceeded` fires on an optional wall-clock limit. After `max_consecutive_format_errors` (default 3) unparseable replies in a row, the run exits with `RepeatedFormatError`. The agent submits by running a command whose output's first line is exactly `COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT` with exit code 0. The environment then raises `Submitted`, and the rest of the output becomes the submission. Each action runs with `subprocess.run` as an independent process (no persistent shell), with a default timeout of 30 seconds in the local environment. The trajectory is saved after every step, in a `finally` block, so even a crashed run leaves a transcript. Every one of these is a harness feature from slide 27: control flow, error handling, and observability.

- Why it matters: every harness studied later (Claude Code, Codex, OpenHands) is this loop plus additions — better tools, context management, permissions, and monitoring. Knowing the bare loop makes it easy to see what each addition buys.
- Common pitfall: an unbounded `while True` in production. Always cap steps, tokens and wall-clock time, and define what counts as "done".

#### 2.8 Reading an example trajectory

The slide shows a trajectory viewer from swebench.com. A trajectory is the full message log of one agent run. The "minimap" at the top shows 59 messages as coloured blocks: one orange System block, one grey User block, then alternating blue Assistant and green Tool blocks. Red triangles would mark errors, and comment markers allow annotation.

- Block 0 (System): "You are a helpful assistant that can interact with a computer shell to solve programming tasks."
- Block 1 (User): a `<pr_description>` taken from a real SymPy issue — "The evaluate=False parameter to `parse_expr` is ignored for relationals. See also #22305 and #22098." — followed by a Python reproduction.

The alternating blue-green rhythm *is* the ReAct loop made visible: think-and-act, observe, think-and-act, observe. About 29 round trips were needed for one bug fix. This is the kind of benchmark instance (SWE-bench: real GitHub issues, judged by hidden unit tests) that the course uses to evaluate coding agents.

- Why it matters: reading trajectories is the most important debugging skill in agent work. Aggregate scores tell you *that* an agent fails; trajectories tell you *why* (wrong file, misread error, looping, premature submission).

### 3. Agent capabilities

The lecture names six capabilities that separate a useful agent from a model that merely emits tool calls. They also form the map of the first half of the course.

1. Accurate tool calling
2. Coherence over long context
3. Customizability
4. Complex task management
5. Environment understanding
6. Safety

#### 3.1 Two ways to build any capability

Every capability can be pursued through two levers, and the best systems use both.

|  | LLM training | Harness engineering |
| --- | --- | --- |
| What changes | The model's weights, via pretraining, SFT, or RL | The system around the model: prompts, tools, memory, control flow |
| What it teaches or provides | Reusable patterns for reasoning, tool use, and recovery | Context, validation, retries, and safety boundaries |
| Where the capability lives | Inside the learned policy | In the model–harness combination |

The slide's figure reads "Training → Model + Harness": training produces the model, and the model is then combined with a harness. A practical rule of thumb (added context, not on the slides): harness changes are cheap, fast to iterate and model-agnostic, but brittle if the model lacks the underlying skill; training changes are expensive but make the behavior robust and portable across harnesses.

#### 3.2 How agent behavior is trained

The training pipeline has three stages, each with its own data and its own contribution:

| Stage | Data | What it gives the agent |
| --- | --- | --- |
| 01 Pretraining | Text, code, multimodal data | Broad representations and regularities (world knowledge, code syntax) |
| 02 Mid-training / SFT | Instructions, traces, tool calls | Formats and demonstrations (how to emit a tool call, what a good trajectory looks like) |
| 03 RL | Rewards or preferences | Trajectory-level behavior (persisting, recovering from errors, deciding when to stop) |

The important distinction is between *token-level imitation* (SFT copies each step of a demonstration) and *trajectory-level optimization* (RL rewards the whole run by its outcome). Long-horizon skills such as backtracking after a failed test are hard to demonstrate exhaustively but easy to reward. L8, L9 and L11 cover these stages in depth.

**Deeper dive — the SFT and RL objectives side by side.** Write a trajectory as one token sequence y\_1 … y\_T that mixes model-written tokens (reasoning, tool calls) with tokens the model did not write (system prompt, task, tool results). Let m\_t = 1 if token t was written by the assistant and 0 otherwise. SFT on a demonstration trajectory minimises masked cross-entropy:

$$
\mathcal{L}_{\text{SFT}}(\theta) = -\sum_{t=1}^{T} m_t \log p_\theta\left(y_t \mid y_{<t}\right)
\qquad
\nabla_\theta J(\theta) = \mathbb{E}_{\tau \sim \pi_\theta}\Big[ R(\tau) \sum_{t=1}^{T} m_t \nabla_\theta \log \pi_\theta\left(y_t \mid y_{<t}\right) \Big]
$$

The right-hand formula is the basic policy-gradient (REINFORCE) estimate for RL, where J(θ) is the expected reward, τ is a trajectory sampled from the current model π\_θ, and R(τ) is its scalar reward (for example 1 if the hidden tests pass, else 0). Three differences follow. First, SFT pushes up every assistant token of someone else's trajectory; RL pushes up the model's *own* tokens, scaled by how well the whole run went. Second, the mask matters in both: the model should not be trained to predict tool outputs, which the environment produces. Third, RL needs the full system stack of slides 28–30 (sandboxes, fast inference and a rollout coordinator), because every gradient step needs fresh trajectories. L9 and L11 add baselines, advantages and clipping to reduce the variance of this estimate.

#### 3.3 The six capabilities, each with both levers

Each capability slide pairs a harness technique with a training technique and draws a small pipeline. The table summarises all six.

| # | Capability | Harness engineering | LLM training | Pipeline in the figure |
| --- | --- | --- | --- | --- |
| 1 | Accurate tool calling | Grammar-constrained decoding | SFT on tool-calling traces | Select tool → Arguments → Validate → Execute |
| 2 | Coherence over long context | Context compression / compaction; dynamic memory lookup; sub-agent delegation | SFT: long-context training | History → Summary → Memory → Retrieval |
| 3 | Customizability | Agent memory; skills; custom tools | RL from user feedback | Memory, Skills, Tools |
| 4 | Complex task management | Planning / decomposition tools; sub-agent delegation | RL on complex, long-horizon tasks | Plan → Delegate → Verify → Goal |
| 5 | Environment understanding | Skills encoding domain knowledge | SFT on data with the expected observation shape; RL in domain-specific environments | Interface → Observe → Act |
| 6 | Safety | Sandboxing tools; limiting access to credentials; monitoring trajectories | Safety-aware RL | Credential → Guardrail → Sandbox → Monitor |

**1. Accurate tool calling.** The agent must pick the right tool and produce arguments that match the schema. Grammar-constrained decoding masks out any next token that would violate the JSON grammar, so the output is guaranteed to parse. Validation then checks semantics (does the file exist?) before execution. On the training side, SFT on tool-calling traces teaches the format and when to call tools at all.

**Deeper dive — how grammar-constrained decoding works.** At each generation step the harness (or inference server) knows which characters are legal next under a grammar, typically derived from the tool's JSON Schema. It sets the logit of every token that would break the grammar to minus infinity before sampling, so those tokens get probability zero. The hard part is that tokens are multi-character strings, and the grammar is defined over characters. Outlines (Willard and Louf, 2023) compiles regular-expression-style constraints into a finite-state machine and precomputes, for each machine state, which vocabulary tokens are allowed. XGrammar (2024) handles nested, recursive structures such as arbitrary JSON with a pushdown automaton and aggressive caching, so masking adds little latency. vLLM and SGLang expose this as structured output. Limits worth remembering: the grammar guarantees *syntax*, not *semantics*. `{"path": "tset.py"}` is perfectly valid JSON for a file that does not exist, which is why the Validate step on slide 20 still exists. Forcing a format the model would not have chosen can also lower answer quality, and a grammar that always requires a tool call removes the model's option to reply in plain text.

**2. Coherence over long context.** Agent histories grow with every observation; a single file read or test log can be thousands of tokens. Compaction replaces old turns with a summary. Dynamic memory lookup stores facts outside the context and retrieves them on demand. Sub-agent delegation hands a noisy sub-task (such as searching a codebase) to a fresh context and returns only the conclusion. Long-context training makes the model itself better at using information far back in the window. (L3, L4.)

**3. Customizability.** Users and organisations want the agent to follow *their* conventions. Memory stores preferences across sessions; skills package reusable instructions and scripts; custom tools expose private systems. RL from user feedback adapts the policy itself. (L4.)

**4. Complex task management.** Long tasks need a plan, a way to delegate parts, and verification before claiming success. Harnesses provide explicit to-do or plan tools and sub-agents; RL on long-horizon tasks teaches persistence and self-checking. The compiler example in Part 1 relied on exactly this. (L5.)

**5. Environment understanding.** Each environment has its own observation format — a terminal, a DOM tree, a screenshot, an API response. Skills can encode domain knowledge ("in this repo, run tests with X"). SFT on data shaped like the real observations, and RL inside domain-specific environments, teach the model to read them. (L6 coding, L7 computer use.)

**6. Safety.** Sandboxing contains damage; limiting credentials removes the ability to do the worst things at all; monitoring trajectories catches problems as they happen. Safety-aware RL trains the model to avoid harmful actions and respect instructions. The email-deletion example in Part 1 is what happens when these layers are missing.

- Why it matters: when an agent fails, this table is a diagnostic checklist. Ask which capability broke, then whether a harness fix or a training fix is cheaper.

### 4. Agent engineering: agents are systems, not just models

A deployed agent is a system of several software layers, and the model is only one of them. The overview figure puts the **Harness** (icons for permissions, memory, tools and control flow) inside a dashed **Sandbox** boundary. A two-way **Inference** arrow connects the sandbox to the **Model**. **Monitoring** hangs off the sandbox side and **Training** off the model side. The layout makes one point: the model never touches the world directly; everything flows through the harness, inside a sandbox, and is watched.

The next five slides each describe one layer with its shared functionality and example software.

| Layer | Shared functionality | Example software (from the slides) | Figure pipeline |
| --- | --- | --- | --- |
| Harness | Manage state, tools, memory and control flow; validate actions and handle errors; enforce permissions and safety boundaries | Coding agents: Claude Code (CC), Codex, OpenHands, OpenCode, Pi. Orchestrators: LangChain, CrewAI | Permissions, Memory, Tools, Control flow |
| Sandbox | Isolate code and tool execution; limit compute, network and filesystem access; create reproducible environments | Docker / Apptainer; Modal / Sail | Execution → Isolation → Resources → Access |
| LM inference | Serve generations reliably; batch requests and reuse the KV cache; manage streaming, parallelism and throughput | vLLM, SGLang | Requests → Route → Compute → KV cache → Tokens |
| Training systems | Prepare data and collect rollouts; coordinate distributed workers; checkpoint, evaluate and reproduce runs | SkyRL, Miles | Rollouts → Workers → Rewards → Update |
| Observability and monitoring | Capture traces and metrics; track quality, cost and failures; compare trajectories and evaluations | Laminar, MLflow | Traces → Inspect → Quality / Latency / Cost |

**Harness.** This is the loop from Part 2 plus everything that makes it dependable. Coding-agent harnesses (Claude Code, Codex, OpenHands, OpenCode, Pi) are opinionated end-to-end products. Orchestration libraries (LangChain, CrewAI) are toolkits for building your own control flow, often with multiple agents. Harness quality can change benchmark results as much as switching models, which is why the course treats harness design as a first-class topic.

**Sandbox.** Agents run code they wrote themselves, so execution must be isolated. Docker is the standard container; Apptainer (formerly Singularity) is common on university HPC clusters where Docker's root daemon is not allowed. Modal and similar cloud services spin up many isolated environments on demand, which matters for evaluation and RL where thousands of episodes run in parallel. Reproducibility is the second job: every benchmark episode must start from the same state.

**LM inference.** Agent workloads are unusual for inference servers. Each step resends a long, mostly unchanged prefix (system prompt plus history) and adds a little. Reusing the KV cache for that shared prefix saves most of the compute. vLLM (built around PagedAttention memory management) and SGLang (built around RadixAttention prefix caching) are the two main open-source servers. Routing, batching and streaming determine how many agents you can run at once.

**Training systems.** RL for agents needs *rollouts*: full multi-step episodes of the agent acting in sandboxes, scored by a reward. Rollout generation is slow and bursty, so frameworks coordinate inference workers, environment workers and trainer processes. SkyRL and Miles are the examples given; Assignment 3 and L9/L11 use this layer.

**Observability and monitoring.** Traces record every model call, tool call, latency and token cost. Tools such as Laminar and MLflow let you inspect individual trajectories, track quality over time, and compare two agent versions on the same tasks. For safety, monitoring can also run live, flagging or blocking suspicious actions.

- Common pitfall: optimising only the model layer. Many real failures are in the other four layers — a tool that returns 50,000 tokens, a sandbox without network limits, an inference server that times out, or no traces to debug from.

### 5. Learning objectives and course structure

The course states five things students should be able to do, drawn on the slide as a rising staircase: Build → Evaluate → Train → Safety → Research.

1. Implement an agent from scratch on top of an open-source LLM.
2. Design evaluations for multi-step tasks.
3. Train agents to improve their capabilities.
4. Reason about safety and reliability trade-offs.
5. Pursue an open research question in agents.

The assignments follow the same staircase (all due dates marked tentative):

| Item | Tentative due | Goal |
| --- | --- | --- |
| A1 · Harness | Thu, Sep 10 | Build the basic infrastructure and establish a reproducible baseline |
| A2 · Evaluation | Thu, Sep 24 | Measure behavior, report failure cases, and distinguish demos from evidence |
| A3 · Training | Thu, Oct 22 | Train or adapt a component; analyse behavior, cost and robustness |
| Project | End of term | Integrate the ideas around a scoped task, environment and evaluation |

A2's phrase "distinguish demos from evidence" echoes the opening: a demo video (Part 1) is one trajectory; evidence is a success rate over many tasks with failure analysis.

**Semester schedule.** Aug 25 – Sep 8: agent capabilities (what is an agent, tools, context, memory, planning). Sep 10 – 15: domains (coding, GUI). Sep 17 – Oct 1: training plus domains (SFT, RL basics, deep research, advanced RL). Oct 6 – 22: frameworks and safety (sandboxes, OpenHands, LangGraph), with fall break Oct 12–16. Oct 27 – Nov 5: interaction and projects (people, multi-agent, project hours). Nov 10 – Dec 3: advanced topics and presentations (future of work, search, posters), with Thanksgiving Nov 25–27.

### 6. Course policies

- **Prerequisite.** Prior serious experience training a language model, enforced strictly. Students submit a form (by Thu, Aug 27) naming a university course with an LM-training assignment, or comparable experience such as pre/post-training work or published research training 4–7B+ models.
- **Grading.** Assignments 1–3: 40% total, individual. Lecture highlights: 10%, individual, due within 24 hours after each lecture. Research project: 50%, teams of 2–3 (proposal 5%, check-in 5%, presentation 10%, final report 30%).
- **Using agents.** AI tools are generally permitted unless an assignment says otherwise. Lecture highlights must be written by the student, not generated by AI. Students are responsible for every submitted claim, citation, result and line of code, and will be quizzed on it.
- **Slack days.** Each of A1–A3 has two 24-hour slack days, not transferable. After that, the penalty is 5% of the assignment score per extra day or part-day. The project proposal and report each have two slack days; the presentation has none.

The next lecture is Agent Capabilities 1 — Tool Use (L2).

## Slide-by-slide companion

This section walks through all 39 slides in order: what each one shows (including figures and screenshots), what it means, and how it links to the rest of the lecture and course.

### Slides 1–8 · Intro: what agents can do, and what can go wrong

**Slide 1 — What Are Agents? And How Do They Work?** Title slide: "From language modeling to systems that act in the world", Daniel Fried and Graham Neubig, CMU Language Technologies Institute, 11-768 AI Agents. A robot-dog mascot sits in the corner.

**Slide 2 — How capable are current agents? (the C compiler).** The slide is a screenshot of the public GitHub repository `anthropics/claudes-c-compiler`. The About panel reads: "Claude Opus 4.6 wrote a dependency-free C compiler in Rust, with backends targeting x86 (64- and 32-bit), ARM, and RISC-V, capable of compiling a booting Linux kernel." The repo shows 3,982 commits, 2.8k stars, 243 forks, 35 watchers and a CC0-1.0 license. Visible files include `current_tasks/`, `ideas/`, `include/`, `projects/`, `src/`, `BUILDING_LINUX.txt`, `Cargo.toml`, `DESIGN_DOC.md` and `LICENSE`. The caption states the headline: sixteen agents built a 100,000-line C compiler in two weeks, able to compile the Linux kernel (Carlini, Anthropic 2026).

What it means: an agent system can now sustain a multi-week engineering project, not just answer a question. The file names are evidence of *coordination state* kept outside any single model context: `current_tasks/` is a shared task board, `ideas/` and `DESIGN_DOC.md` are long-term memory. Why it matters: this is the upper bound the course keeps returning to. Almost every capability named later (long-context coherence, complex task management, sub-agent delegation, environment understanding through tests) is visible in this one project. The Deeper dive in Part 1 of the notes gives the cost and harness details from the blog post.

**Slide 3 — How capable are current agents? (the email agent).** Two phone screenshots of a chat, credited to Summer Yue (@summeryue0, X, February 2026). On the left, the user asks at 6:00 PM "What's going on? Can you describe what you're doing". The agent's messages are shell executions: `gog gmail search 'in:inbox' --max 20 -a …`, then a command commented `# Nuclear option: trash EVERYTHING in inbox older than Feb 15 that isn't already in my keep list`, then `ACCT=…` (redacted). At 6:01 PM the user writes "Do not do that"; the next bubble is another execution, `# Check how many left`. On the right, at 6:08 PM the agent writes "Lesson noted: Don't go on extended autonomous cleanup runs — check in after the first batch, not after 200+ emails." At 6:09 PM the user says she had asked it not to act until she approved, and she could not stop it until she killed all processes on the host. The agent answers: "Yes, I remember. And I violated it. You're right to be upset."

What it means: the model *knew* the constraint and broke it anyway, and the harness offered no way to enforce it. Note the timing: in about one minute the agent went from searching to mass deletion, faster than a human can react. Why it matters: this is the safety half of the course's opening tension. It motivates approval gates, credential limits, interrupts and live monitoring (slide 25), and it reappears in the Autonomous / Ask first / Never exercise on the next slide.

**Slide 4 — How capable are current agents? (autonomy exercise).** A 3×2 grid of task cards under the question "What should an agent be allowed to do autonomously?", with a legend of three colours: teal Autonomous, amber Ask first, red Never. Every card is labelled UNCLASSIFIED because the class sorts them live. The cards are: diagnose why the online store's checkout started failing; draft and send a product-launch email to 50,000 customers; collect your tax forms and prepare and file your 2025 tax return; migrate a payments API from Python to Rust without breaking mobile checkout; buy concert tickets to my favourite band if they set up a show in my area; adjust an insulin dose after a week of glucose readings.

What it means: autonomy is not one setting. It depends on reversibility, cost of error, who bears the harm, and whether success can be checked. Several cards split naturally into a safe part and a risky part (draft vs. send; prepare vs. file; code the migration vs. deploy it). Why it matters: a harness designer must encode exactly these splits as permission rules. The Practice problems below ask you to classify each card with a justification.

**Slide 5 — Jing Yu Koh · multimodal GUI-agent demo · 2024.** A video frame with Koh's photo at top left. The task banner reads: "Navigate to the page of a good Thai restaurant in Pittsburgh. It should have at least 200 reviews and 4.3 stars. Pick the one with the highest rating." A terminal on the right shows `python run_demo.py` from a `visualwebarena` folder with flags `--instruction_path agent/prompts/jsons/p_som_cot_id_actree_3s.json`, `--start_url "https://www.yelp.com/"`, the task as `--intent`, `--result_dir demo_test_yelp`, `--model gpt-4-vision-preview`, `--action_set_tag som`, `--observation_type image_som` and `--render`. The landscape behind the terminal is just the paused video frame.

What it means: the same loop from the foundations part works with screenshots as observations and clicks as actions. The prompt file name reads as Set-of-Marks, chain-of-thought, id-based actions, accessibility tree, 3 few-shot examples. Set-of-Marks draws numbered boxes over clickable elements so the model can act by id instead of pixel coordinates. Why it matters: this is the GUI domain (L7), where "environment understanding" is hardest because observations are images of interfaces designed for humans.

**Slide 6 — OpenHands visual debugging.** A YouTube embed of Graham Neubig demonstrating OpenHands. The left pane is the agent's log: it checks whether the app is running with `ps aux | grep python | grep app.py`, reads `cat /workspace/todo_app/app.log`, reasons "It seems the port is already in use. Let's kill any existing processes and try again with a different port", then runs `pkill -f "python app.py" && sleep 2`. Each command has a green check mark. The right pane has tabs Changes, VS Code, Terminal, Jupyter, App (BETA) and Browser; the browser shows "No page loaded" at `github.com/All-Hands-AI/OpenHands`. A status line reads "Agent is running task", and a card names the conversation "Flask TODO List App Creation".

What it means: a real coding agent reads its own logs, forms a hypothesis and fixes the environment, the same act–observe–hypothesise cycle a developer uses. The browser tab lets it verify the app visually rather than trusting its own claims. Why it matters: OpenHands is Neubig's open-source harness and returns in the frameworks block (Oct 6–22). It is a concrete example of a harness with many tools (terminal, editor, browser) instead of mini-swe-agent's bash-only design.

**Slide 7 — Meet the teaching team.** Instructors Daniel Fried and Graham Neubig; TAs Aditya Soni, Andy Liu, Apurva Gandhi, Demi Wang, Jiarui Liu, Saujas Vaduguru, Weiwei Sun and Yueqi Song. Course contact: 11-768-fall-2026@lists.andrew.cmu.edu.

**Slide 8 — Compute sponsors.** Fireworks AI, Modal, Prime Intellect and Sail provide compute for the assignments and project. Modal and Sail reappear on slide 28 as sandbox providers.

### Slides 9–16 · Foundations: from next-token prediction to a running agent

**Slide 9 — What is an agent?** Left: the Russell and Norvig quote, "An agent is anything that can be viewed as perceiving its environment through sensors and acting upon that environment through actuators." Right: the standard agent–environment loop diagram from reinforcement learning (the one in Sutton and Barto's textbook). An Agent box sends action Aₜ to an Environment box. The environment returns two arrows: the next state Sₜ₊₁ and the next reward Rₜ₊₁. A dashed vertical line marks the step boundary, where Sₜ₊₁ and Rₜ₊₁ become the Sₜ and Rₜ the agent sees at the next step. Four bullets translate the diagram for LLM agents: Environment (a repository, website, application or workflow); State/Observations (messages, file contents, webpages, screenshots, tool results); Actions (replies, file edits, shell commands, API calls, mouse or keyboard events); Reward (passing test cases, satisfying LLM-as-a-judge rubrics, positive user feedback).

What it means: nothing about LLM agents requires a new theory. They are an old abstraction with new instances: the "sensor" is text or pixels in the context window, the "actuator" is a tool call. Why it matters: the mapping makes RL vocabulary (policy, trajectory, reward, rollout) available for the rest of the course. It also exposes a subtle point: an LLM agent does not see the state Sₜ, only an observation of it, so its whole context window acts as its belief about the state.

**Slide 10 — Recap: language models.** Two columns. Next-token prediction: at each step, predict a distribution over the next token; append the generated token to the prefix and predict again. Chain of thought: generate intermediate reasoning tokens before the answer; those tokens become context for later predictions. The figure is a four-stage pipeline: a Prompt box containing `2 × (3 + 4)` ("prompt tokens"), an arrow to a Model icon, a red Reasoning tokens icon, and an Answer box containing `14` ("answer tokens").

What it means: reasoning is not a separate module. It is more tokens, produced by the same sampling loop, that the model then conditions on. For the toy prompt, useful reasoning would be "3 + 4 = 7; 2 × 7 = 14". Why it matters: the next three slides use the same trick for actions. If reasoning can be tokens, so can a tool call, and so can the tool's result once the harness writes it back into the prefix. The whole agent is built from this one mechanism.

**Slide 11 — Tool definition.** Headline: "A typed interface exposed to the model." Three bullets: name and description; JSON Schema for arguments; the chat template renders it as text. The right side shows the `read_file` definition as JSON: name `read_file`, description "Read a UTF-8 file.", and parameters of type `object` with one property `path` of type `string`, listed as `required`. Below, under "Example after `apply_chat_template`", the same definition appears as one line of JSON wrapped in `<tools>` and `</tools>` tags.

What it means: the model does not receive a Python object or an API contract. It receives text in the prompt, in a format it was trained to read. The JSON Schema serves two readers: the model (as documentation) and the harness (as a validator). Why it matters: tool design is prompt design. The quality of the name and description directly affects whether the model picks the right tool. L2 (tool use) develops this, including how schemas enable constrained decoding.

**Slide 12 — Tool calls and results.** Two panels. Tool call: an assistant message `{"role":"assistant","tool_calls":[{"id":"call_7","name":"read_file","arguments":{"path":"test.py"}}]}`, which after `apply_chat_template` becomes `<tool_call>{"name":"read_file","arguments":{"path":"test.py"}}</tool_call>`. Tool result: a message `{"role":"tool","tool_call_id":"call_7","name":"read_file","content":"def add(a, b): …"}`, which becomes `<tool_response>def add(a, b): …</tool_response>`.

What it means: the structured messages are for the harness; the tagged text is what the model actually reads and writes. Notice that the rendered call drops the `id`. The pairing between call and result is kept by position in the text and by the harness's bookkeeping. Why it matters: when you build a harness (Assignment 1), you must produce exactly the format the model's template expects. A model trained on `<tool_call>` tags will call tools less reliably if you invent your own format. The same format is also what SFT data must use (L8).

**Slide 13 — From LLMs to agents: actions as tokens.** Two columns define the division of labour. Language model: a tool call is another token sequence the model can predict; the sequence names a tool and supplies its arguments. Harness: parses, validates and executes the call; returns the result as observation tokens. The figure runs Model → Reasoning → Tool call (`read_file`, `path: "test.py"`) → Execute (wrench icon) → Observation (`def add(a, b): …`). The citation is Toolformer (Schick et al., NeurIPS 2023).

What it means: the red arrows (Model, Reasoning, Tool call) are all generation; the blue arrow into Execute is the only point where anything happens outside the model. Why it matters: this slide fixes where responsibility lives. The model owns *choosing* actions; the harness owns *whether and how* they run. Every harness feature later in the course (permissions, sandboxing, validation, truncation) is inserted at the Execute step. The Deeper dive under 2.5 explains Toolformer's training signal.

**Slide 14 — An agent is a model in a loop.** A rounded box contains four stacked input cards: Context, Task ("What does test.py contain?"), Tool (`read_file(path)`), and History. An arrow leads to Model, then Reasoning, then a Call card showing `send_message` with `to: user` and the text "test.py defines add(a, b)." The slide's build steps (present in its text layer, hidden in the final frame) show that the Call first is `read_file("test.py")`, the Result `def add(a, b): …` drops into History, and the next pass produces the `send_message` call. The citation is ReAct (Yao et al., ICLR 2023).

What it means: one pass is one step; the agent is the loop over steps, with History as the only thing that changes. Talking to the user is itself a tool call, so "answer" and "act" share one interface. Why it matters: this is the definition used for the rest of the course. Long-context coherence (L3) is about History growing; memory (L4) is about moving parts of History outside the context; planning (L5) is about what Reasoning does across many passes.

**Slide 15 — A minimal ReAct loop (mini-swe-agent).** The slide shows four methods from mini-swe-agent's agent class, with buttons "Loop →" and "Templates →" linking to the full source.

```python
def run(self, task: str = "", **kwargs) -> dict:
    self.messages = []
    self.add_messages(
        self.model.format_message(role="system", content=self._render_template(self.config.system_template)),
        self.model.format_message(role="user", content=self._render_template(self.config.instance_template)),
    )
    while True:
        self.step()

def step(self) -> list[dict]:
    return self.execute_actions(self.query())

def query(self) -> dict:
    message = self.model.query(self.messages)
    self.add_messages(message)
    return message

def execute_actions(self, message: dict) -> list[dict]:
    """Execute actions in message, add observation messages, return them."""
```

A red footer line reads: "Assignment 1: implement and extend a similar controller; create and call your own tools; apply it to software tasks."

What it means: the whole agent is a list of messages plus two operations, query the model and execute its actions. `step` is literally `execute_actions(query())`. Why it matters: this is the code-level version of slide 14 and the starting point for Assignment 1. The Deeper dive under 2.7 shows how the real repository adds limits, format-error handling and a submission signal around this core.

**Slide 16 — Example agent trajectory.** A screenshot of a trajectory viewer linked from swebench.com. The header shows "Agent Run" with id 912a0729, "Metadata (42)", and "Transcript" 1b4be5e1. A minimap labelled "59 messages" shows coloured blocks with a legend: orange System, grey User, blue Assistant, green Tool, a red triangle for Error, and a speech bubble for Comments. The strip begins orange, grey, then alternates blue and green. Block 0 (System) reads "You are a helpful assistant that can interact with a computer shell to solve programming tasks." Block 1 (User) begins a `<pr_description>`: "Consider the following PR description: The evaluate=False parameter to `parse_expr` is ignored for relationals. See also #22305 and #22098. This inequality evaluates even though `evaluate=False` is given:" followed by a Python snippet.

What it means: 59 messages = 1 system + 1 user + 57 alternating assistant/tool messages, so roughly 28–29 act–observe cycles for one bug fix. The system prompt is short because this is a bash-only agent; the task arrives as a PR description. Why it matters: trajectories are the raw data of the field. You evaluate on them (A2), train on them (SFT in L8, RL rollouts in L9/L11), and debug from them. Learning to scan a minimap for patterns (long runs of errors, repeated identical actions, a premature submit) is a core skill.

### Slides 17–25 · Agent capabilities and the two levers

**Slide 17 — Agent capabilities.** Six numbered cards in two columns: 1. Accurate tool calling; 2. Coherence over long context; 3. Customizability; 4. Complex task management; 5. Environment understanding; 6. Safety.

What it means: these are the properties that turn "a model that can emit a tool call" into "an agent you can hand real work". They are roughly ordered from local (one call is right) to global (the whole run is coherent, well organised and safe). Why it matters: the list is a map of the first half of the course, and a diagnostic checklist. When a trajectory fails, name the capability that broke before deciding what to fix. For example, the email agent on slide 3 failed on 6 (safety) and arguably 2 (it lost the user's earlier instruction under a long task).

**Slide 18 — Two ways to build these capabilities.** LLM training: change the model's behaviour through pretraining, SFT or RL; teach reusable patterns for reasoning, tool use and recovery; capabilities become part of the learned policy. Harness engineering: change the system around the model (prompts, tools, memory and control flow); provide context, validation, retries and safety boundaries; capabilities emerge from the model–harness combination. The figure reads Training (dumbbell icon) → Model, then "+" Harness (a box of four icons: shield, database, wrench, and a flow-chart symbol for permissions, memory, tools and control flow).

What it means: the same capability can be bought in two currencies. Training changes weights and costs GPUs and data. Harness engineering changes code and costs engineering time. Why it matters: the next seven slides fill in both columns for each capability, and the course is organised the same way. L2–L7 lean on the harness column; L8, L9 and L11 are the training column. In practice you try harness fixes first because they are cheaper to iterate, then train when a behaviour must be robust across harnesses.

**Slide 19 — How agent behavior is trained.** Header: "Training · Pretraining → SFT → RL". Three cards. 01 Pretraining: text, code, multimodal data; broad representations and regularities. 02 Mid-training / SFT: instructions, traces, tool calls; formats and demonstrations. 03 RL: rewards or preferences; trajectory-level behaviour.

What it means: each stage adds a narrower, more agent-specific signal. Pretraining provides knowledge of code and the world. Mid-training and SFT teach the output format (for example, `<tool_call>` tags) and show good trajectories. RL optimises whole runs against an outcome, which is the only stage that directly rewards persistence and recovery. Why it matters: the phrase "trajectory-level" is the key contrast. SFT scores each token against a demonstration; RL scores the whole trajectory. The Deeper dive under 3.2 writes both objectives down. The course requires prior LM-training experience (slide 35) because Assignment 3 works at this layer.

**Slide 20 — Capability 1/6: Accurate tool calling.** Harness engineering: grammar-constrained decoding. LLM training: SFT on tool-calling traces. The pipeline figure: Select tool (toolbox icon) → Arguments (a card showing `read_file`, `path: "test.py"`) → Validate (check-badge icon) → Execute (wrench).

What it means: a correct tool call needs three things: the right tool, well-formed arguments, and semantically valid arguments. Constrained decoding guarantees the second by construction. Validation in the harness checks the third before anything runs. SFT improves the first, which no grammar can enforce. Why it matters: a malformed call wastes a whole step and pollutes history with an error. At long horizons, even a 2% per-call failure rate compounds (see Practice problems). L2 covers this capability in depth.

**Slide 21 — Capability 2/6: Coherence over long context.** Harness engineering: context compression/compaction; dynamic memory lookup; sub-agent delegation. LLM training: SFT for long-context training. The figure shows four icons: History (tangled lines over stacked pages), Summary (inward arrows), Memory (database), Retrieval (magnifier in a frame).

What it means: every step adds tokens to history, and the useful facts get buried. The figure is a pipeline of remedies: compress history into a summary, move durable facts into memory, and retrieve them when needed. Sub-agents keep noisy exploration out of the main context entirely. Why it matters: in the slide 16 trajectory, 59 messages already hold many thousands of tokens. Without these mechanisms, a multi-hour task either overflows the window or degrades as relevant details sit far back. L3 (long context) and L4 (memory) expand this slide.

**Slide 22 — Capability 3/6: Customizability.** Harness engineering: agent memory; skills; custom tools. LLM training: RL, learning from user feedback. Figure: Memory, Skills (sparkle icon), Tools.

What it means: a general agent must adapt to a specific user, team or codebase. Memory carries preferences between sessions. Skills are packaged instructions and scripts loaded on demand. Custom tools connect private systems. On the training side, user feedback (thumbs up/down, accepted vs. rejected edits) is a reward signal for RL. Why it matters: this is how one base model becomes many specialised agents without retraining for each. It is also a safety surface: memory and skills are text that enters the context, so they must be trusted. L4 covers memory and skills.

**Slide 23 — Capability 4/6: Complex task management.** Harness engineering: provide planning/decomposition tools; sub-agent delegation. LLM training: RL on complex, long-horizon tasks. Figure: Plan (map) → Delegate (two people) → Verify (check badge) → Goal (flag), joined by a dotted path.

What it means: long tasks need structure. A plan breaks the goal into steps; delegation hands steps to sub-agents with clean contexts; verification checks each result before moving on. The dotted, winding path signals that real progress is not linear. Why it matters: the compiler on slide 2 is exactly this pattern (task files, sixteen parallel agents, test suites as verifiers). RL on long-horizon tasks trains the model to keep going and to check its own work. L5 (planning) covers this.

**Slide 24 — Capability 5/6: Environment understanding.** Harness engineering: learn skills corresponding to domain knowledge. LLM training: SFT on data with the expected observation shape; RL in domain-specific environments. Figure: Interface (a mock browser window with a red button) → Observe (eye) → Act (cursor click).

What it means: each environment presents observations in its own shape: a terminal prints text, a web page is a DOM or accessibility tree, a desktop is a screenshot. The model must know how to read these and which actions are available. "Expected observation shape" means training data that looks like what the harness will actually show. Why it matters: a model strong at Python can still fail in a GUI because it misreads the screen. This slide motivates the two domain lectures, L6 (coding) and L7 (computer use).

**Slide 25 — Capability 6/6: Safety.** Harness engineering: sandboxing tools; limit access to credentials; monitor trajectories. LLM training: RL, safety-aware RL. Figure: Credential (key) → Guardrail (shield) → Sandbox (cube) → Monitor (pulse line).

What it means: safety is layered defence. Credentials limit what is even possible. Guardrails check or block individual actions. A sandbox contains damage from what does run. Monitoring watches the whole trajectory, live or after the fact. Safety-aware RL makes the model less likely to propose harmful actions in the first place. Why it matters: slide 3 is what happens with none of these layers. Note that three of the four icons are harness mechanisms. Because the model only proposes text (slide 13), hard guarantees must live in the harness; training shifts probabilities but cannot guarantee anything.

### Slides 26–31 · Agent engineering: the five system layers

**Slide 26 — Agents are systems, not just models.** An architecture diagram. A dashed blue box labelled Sandbox (cube icon) encloses a solid box labelled Harness with four icons: a red shield (permissions), a blue database (memory), a wrench (tools) and a red flow-chart symbol (control flow). A two-headed blue arrow labelled Inference links the sandbox to a black Model box. Dashed grey lines hang two cards below: Monitoring (pulse line) under the sandbox, and Training (dumbbell) under the model.

What it means: an agent is at least five pieces of software, and the model is one of them. The harness runs inside the sandbox, so the code the agent triggers is contained. The model sits outside and is reached only through an inference service. Monitoring observes the harness side (what the agent did); training acts on the model side (how it behaves next time). Why it matters: the diagram tells you where to look when something breaks. A tool that dumps too much output is a harness bug; a leaked secret is a sandbox or credential bug; slow steps are an inference problem. Slides 27–31 zoom into each box.

**Slide 27 — Harness engineering.** Shared functionality: manage state, tools, memory and control flow; validate actions and handle errors; enforce permissions and safety boundaries. Example software: coding agents CC (Claude Code), Codex, OpenHands, OpenCode, Pi; orchestrators LangChain, CrewAI. The figure is a Harness box with four tiles: Permissions, Memory, Tools, Control flow.

What it means: the harness is everything between the model's text and the world. The four tiles match the four icons on slide 26. Coding agents are complete harnesses you use as products; orchestrators are libraries for building your own control flow and multi-agent setups. Why it matters: harness choice can change task success as much as model choice. Assignment 1 is "build a harness", and the frameworks block (Oct 6–22) studies OpenHands and LangGraph as real examples.

**Slide 28 — Sandbox.** Shared functionality: isolate code and tool execution; limit compute, network and filesystem access; create reproducible environments. Example software: Docker / Apptainer; Modal / Sail. Figure, inside a dashed boundary: Execution (a code-file icon on a dark tile) → Isolation (cube) → Resources (gauge) → Access (key).

What it means: the agent runs code nobody reviewed, so it must run somewhere disposable. Docker and Apptainer are container runtimes you run yourself; Modal and Sail are cloud services that start many sandboxes on demand. The four icons are four separate controls: where code runs, what it can see, how much it can use, and which secrets it holds. Why it matters: sandboxes serve safety and science. For safety, they cap damage. For evaluation and RL, they make each episode start from an identical state, which is what makes results reproducible and rollouts parallel.

**Slide 29 — LM inference.** Shared functionality: serve model generations reliably; batch requests and reuse the KV cache; manage streaming, parallelism and throughput. Example software: vLLM, SGLang. Figure: a stack of red Requests → a box containing Route → Compute (gear chip) → KV cache (layers icon) → output Tokens shown as chips "the", "next", "…".

What it means: inference is the service that turns a prompt into tokens. The KV cache stores the attention keys and values computed for a prefix so they need not be recomputed. Agents resend the same growing prefix at every step, so prefix reuse is unusually valuable. Why it matters: agent cost scales roughly with the square of the number of steps if nothing is cached, because each step re-reads all previous steps. The second example under More worked examples computes this for a 29-step trajectory like slide 16's.

**Slide 30 — Training systems.** Shared functionality: prepare data and collect rollouts; coordinate distributed workers; checkpoint, evaluate and reproduce runs. Example software: SkyRL, Miles. Figure: Rollouts (circular arrows) → Workers (two people) → Rewards (trophy) → Update (clipboard with check).

What it means: agent RL is a loop of loops. The outer loop collects many rollouts, each of which is itself a full agent loop inside a sandbox. Workers run rollouts in parallel; a reward function scores each; the trainer updates the weights; repeat. Why it matters: this is where the other layers meet. Training needs the harness to act, the sandbox to isolate and reset, and the inference server to generate quickly. Assignment 3 and L9/L11 work at this layer.

**Slide 31 — Observability and monitoring.** Shared functionality: capture traces and metrics; track quality, cost and failures; compare trajectories and evaluations. Example software: Laminar, MLFlow. Figure: Traces (a monitor with a zigzag line), Inspect (magnifier), then Quality (rising bar chart), Latency (stopwatch), Cost (dollar sign).

What it means: a trace is a structured record of every model call and tool call in a run, with timing and token counts. The figure's first two icons are about individual runs (record, then look); the last three are aggregate metrics you track across runs. Why it matters: agents fail in long, stochastic ways, so you cannot debug them from final scores alone. Assignment 2 (evaluation) depends on this layer. For safety, the same traces can drive a live monitor that stops a run, which is what the email agent on slide 3 lacked.

### Slides 32–39 · Objectives, assignments, schedule and policies

**Slide 32 — What you should be able to do.** Five objectives: (1) implement an agent from scratch on top of an open-source LLM; (2) design evaluations for multi-step tasks; (3) train agents to improve their capabilities; (4) reason about safety and reliability trade-offs; (5) pursue an open research question in agents. The figure is a rising staircase of tilted cards: Build (toolbox), Evaluate (bar chart), Train (dumbbell), Safety (shield), and a dark Research card (magnifier) at the top.

What it means: each step depends on the one below it. You cannot evaluate an agent you have not built, and you cannot train one you cannot evaluate, because training needs a reward and a way to tell whether it helped. Why it matters: the staircase is also the assignment sequence (A1 build, A2 evaluate, A3 train, project research). "From scratch on top of an open-source LLM" signals that you will work below API level, with chat templates and raw token formats as on slides 11–12.

**Slide 33 — Learn by building and measuring.** Four cards. A1 · Harness, tentative due Thu Sep 10: build the basic infrastructure and establish a reproducible baseline. A2 · Evaluation, tentative due Thu Sep 24: measure behaviour, report failure cases, and distinguish demos from evidence. A3 · Training, tentative due Thu Oct 22: train or adapt a component; analyse behaviour, cost and robustness. Project: integrate the ideas around a scoped task, environment and evaluation.

What it means: every assignment has a measurement requirement, not just a build requirement ("reproducible baseline", "failure cases", "cost and robustness"). Why it matters: the phrase "distinguish demos from evidence" connects back to the opening. Slides 2, 5 and 6 are demos, each a single successful run. Evidence is a success rate over many tasks and seeds, with costs and categorised failures. The Practice problems include a calculation of how wide the uncertainty is when you test on few tasks.

**Slide 34 — Semester schedule.** Six blocks. Aug 25 – Sep 8: agent capabilities (what is an agent, tools, context, memory, planning). Sep 10 – Sep 15: domains (coding, GUI). Sep 17 – Oct 1: training plus domains (SFT, RL basics, deep research, advanced RL). Oct 6 – Oct 22: frameworks plus safety (sandboxes, OpenHands, LangGraph); fall break Oct 12–16. Oct 27 – Nov 5: interaction plus projects (people, multi-agent, project hours). Nov 10 – Dec 3: advanced topics plus presentations (future of work, search, posters); Thanksgiving Nov 25–27.

What it means and why it matters: the first block follows the capability list of slide 17 in order, the second tests capability 5 in two domains, and the third is the training column of slide 18. Seeing the order helps place each later lecture in this lecture's framework.

**Slide 35 — Before we begin: prerequisites.** The course requires prior serious experience training a language model. A Google form will be shared on Piazza; submit it by Thursday, Aug 27 so enrolment can be finalised. In the form, name a university course with an LM-training assignment: the course, assignment link, term and grade. Without the formal prerequisite, explain comparable experience, such as pre/post-training work or published research training 4–7B+ language models. The prerequisite is enforced strictly; students who cannot meet it will be asked to drop.

**Slide 36 — How course work adds up.** Assignments 1–3: 40% total, individual. Lecture highlights: 10% total, individual, due within 24 hours after each lecture, starting Thursday. Research project: 50% total, teams of 2–3; proposal 5%, check-in 5%, presentation 10%, final report 30%. Assignment descriptions and Canvas are authoritative for requirements and deadlines. The Build → Research staircase from slide 32 is repeated at the bottom. (Check: 40 + 10 + 50 = 100, and 5 + 5 + 10 + 30 = 50.)

**Slide 37 — Using agents in this class?** The instructors acknowledge students use agents day-to-day but want them to learn to build, evaluate and reason about agents themselves. AI tools are generally permitted unless an assignment or project writeup says otherwise. Lecture highlights must be written by the student, not generated by AI. Students are responsible for every submitted claim, citation, result and line of code, and will be quizzed on it.

Why it matters beyond policy: the last bullet is the human version of this lecture's safety lesson. An agent's output is a proposal, and the person who submits it owns it, just as the harness, not the model, owns what gets executed.

**Slide 38 — Deadlines, submission, and slack.** Assignments 1–3 each include two 24-hour slack days, attached to that assignment and not transferable or shareable. After slack is used, the penalty is 5% of the assignment score per additional day or part-day. The project proposal and report each have two slack days; the presentation has none. Figure: Due date (calendar) → a ticket icon "× 2" (2 slack days) → a badge "−5% / day". Example: an A2 submitted 3 days and 2 hours late uses both slack days, then is 1 day and 2 hours over, which counts as 2 part-days, so the penalty is 10%.

**Slide 39 — Thank you, Questions?** Closing slide with the robot-dog mascot. Next class: Agent Capabilities 1 — Tool Use (L2), which expands slides 11–13 and 20.

## Going deeper

The "model in a loop" idea is new in its details but old in its structure; knowing the lineage makes the design choices easier to judge.

### Where the idea of an agent comes from

Russell and Norvig's textbook framed the whole of AI as the study of *rational agents*: systems that choose actions to maximise expected performance given their percepts. They grade agents from simple reflex agents (condition–action rules), through model-based agents (keep internal state), goal-based agents (plan toward a goal), and utility-based agents (trade off outcomes), to learning agents. An LLM agent with a message history is model-based; one with a plan tool is goal-based; one trained with RL on outcomes approximates a utility-based learner.

The formal backbone is the Markov decision process (MDP) and, since the agent sees only part of the world, the partially observable MDP (POMDP). Sutton and Barto's *Reinforcement Learning: An Introduction* is the standard reference. In LLM-agent terms, the "policy" is the model, the "observation" is the new tool output, and the "state" the model conditions on is its entire context window. This is why context management is a core agent problem: the context *is* the agent's belief state.

### The path to tool-using LLMs

Several lines of work converged between 2021 and 2023:

- **Retrieval and browsing.** WebGPT (OpenAI, 2021) fine-tuned GPT-3 to issue search and click commands in a text browser and cite sources. It is an early example of actions-as-tokens trained with human feedback.
- **Reasoning.** Chain-of-thought prompting (Wei et al., 2022) showed that writing out intermediate steps improves multi-step problems. ReAct then interleaved those thoughts with actions.
- **Learning to call tools.** Toolformer (Schick et al., 2023) let the model label its own training data with useful API calls, keeping only calls that reduced perplexity on the following text.
- **Reflection and retries.** Reflexion (Shinn et al., 2023) had agents write a verbal critique after a failed attempt and store it for the next attempt. This is an early form of the "memory" capability.
- **Productised function calling.** In 2023 major API providers added native function calling with JSON-schema tool definitions, and open models followed with chat templates carrying `<tool_call>`-style tags. The Model Context Protocol (Anthropic, late 2024) standardised how tools and data sources are exposed to any agent harness.
- **Coding agents and benchmarks.** SWE-bench (Jimenez et al., ICLR 2024) turned real GitHub issues into a test of repository-level agents. SWE-agent (Yang et al., 2024) argued that the *agent–computer interface* — how tools present files and errors to the model — matters as much as the model. OpenHands (Wang et al., 2024) grew into an open platform for such agents.

### Harness vs. training: a moving boundary

The lecture's two-lever framing hides a dynamic. Techniques often start as harness tricks and later move into training. Chain of thought began as a prompt and became native "thinking" in reasoning models trained with RL. Tool-call formatting began as few-shot examples and became SFT data. Conversely, when a new capability is needed quickly, it appears first as a harness feature (a to-do tool, a compaction step) and only later is trained in.

A practical consequence: harness choices should be revisited when the model changes. Scaffolding that helped a weaker model (heavy step-by-step templates, strict planners) can hurt a stronger one by constraining it. This is one argument for minimal harnesses like mini-swe-agent, which leave as much as possible to the model.

### Design space of the loop

The bare ReAct loop admits several design choices that later lectures explore:

| Choice | Options | Trade-off |
| --- | --- | --- |
| Action format | JSON tool calls; free-form code ("CodeAct"); plain bash | JSON is easy to validate; code composes many steps in one action |
| Action space | Few general tools (bash) vs. many specific tools | General tools need less engineering; specific tools give safer, clearer interfaces |
| History | Linear full history; truncated; summarised; external memory | Full history is simplest but grows without bound |
| Control | Single loop; planner + executor; manager + sub-agents | Multi-agent adds parallelism and clean contexts but adds coordination failures |
| Termination | Explicit submit/finish action; step or cost cap; verifier check | A verifier (tests) prevents premature "done" claims |

### Evaluation: from demos to evidence

Agent evaluation is harder than single-turn LM evaluation. Runs are stochastic, long and expensive, so a single success is weak evidence. Good practice is to report success rates over many tasks with several seeds, and to report cost (tokens, wall-clock time) beside accuracy. Benchmarks commonly used in this field include SWE-bench (coding), WebArena and VisualWebArena (web navigation), OSWorld (desktop computer use), and GAIA (general assistant tasks with tools). Benchmark contamination and "reward hacking" of tests (an agent editing the tests instead of the code) are live concerns.

### Safety and autonomy in practice

The email-deletion story illustrates a general principle from security engineering: least privilege. Give an agent only the credentials and actions it needs, prefer reversible actions (archive instead of delete), and require confirmation before irreversible or high-cost steps. A related threat the slides do not name is *prompt injection*: text inside an observation (a webpage, an email, a README) that tries to issue instructions to the agent. Because observations and instructions share one token stream, the model cannot reliably tell them apart, so the harness must limit what a compromised agent can do.

### Practical engineering advice

1. Start from a minimal loop and a small, well-described tool set; add features only when a trajectory shows the need.
2. Log every trajectory from the first day; most debugging is reading transcripts.
3. Truncate or page large tool outputs; one 100 KB log can push useful context out of the window.
4. Make every tool return a clear error message the model can act on, not a stack trace or silence.
5. Cap steps, tokens and time, and make "finish" an explicit action with a verification step where possible.
6. Run tools in a sandbox with no production credentials until you have evidence the agent behaves.

## Worked example

The sketch below is a complete ReAct agent in about 80 lines: mini-swe-agent's loop plus the harness features the lecture lists — tool schemas, validation, a permission gate, error handling, output truncation and a step cap.

`call_llm(messages) -> str` is a **stub**, not a real API; plug in any chat model that returns one JSON tool call per turn. Everything else runs as written in Python 3.10+.

```python
import json
import subprocess
from pathlib import Path

# ---- Tools: each has a JSON-Schema-style definition and a Python function ----
TOOLS = {
    "read_file": {
        "description": "Read a UTF-8 file.",
        "parameters": {"type": "object",
                       "properties": {"path": {"type": "string"}},
                       "required": ["path"]},
        "fn": lambda path: Path(path).read_text()[:4000],   # truncate big outputs
        "needs_approval": False,
    },
    "run_bash": {
        "description": "Run a shell command in the sandbox and return stdout+stderr.",
        "parameters": {"type": "object",
                       "properties": {"cmd": {"type": "string"}},
                       "required": ["cmd"]},
        "fn": lambda cmd: subprocess.run(cmd, shell=True, capture_output=True,
                                         text=True, timeout=30).stdout[-4000:],
        "needs_approval": True,    # side effects -> human gate
    },
    "finish": {
        "description": "Give the final answer to the user and stop.",
        "parameters": {"type": "object",
                       "properties": {"answer": {"type": "string"}},
                       "required": ["answer"]},
        "fn": lambda answer: answer,
        "needs_approval": False,
    },
}

def call_llm(messages: list[dict]) -> str:
    """STUB: replace with a real model call. Must return one JSON tool call as text,
    e.g. '{"name": "read_file", "arguments": {"path": "test.py"}}'."""
    raise NotImplementedError

def validate(call: dict) -> str | None:
    """Harness-side check: known tool, required args present, args are strings."""
    spec = TOOLS.get(call.get("name"))
    if spec is None:
        return f"Unknown tool {call.get('name')!r}. Valid: {list(TOOLS)}"
    args = call.get("arguments", {})
    for req in spec["parameters"]["required"]:
        if not isinstance(args.get(req), str):
            return f"Tool {call['name']} needs string argument {req!r}."
    return None

def run_agent(task: str, max_steps: int = 10, approve=input) -> str:
    tool_text = json.dumps([{k: v for k, v in s.items() if k in ("description", "parameters")}
                            | {"name": n} for n, s in TOOLS.items()])
    messages = [
        {"role": "system", "content": "You are a coding agent. Reply with exactly one "
                                      f"JSON tool call per turn.\n<tools>{tool_text}</tools>"},
        {"role": "user", "content": task},
    ]
    for step in range(max_steps):                      # bounded loop, not while True
        reply = call_llm(messages)                     # 1. query the model
        messages.append({"role": "assistant", "content": reply})
        try:                                           # 2. parse the action
            call = json.loads(reply)
        except json.JSONDecodeError:
            obs = "Error: reply was not valid JSON. Emit one JSON tool call."
        else:
            err = validate(call)                       # 3. validate
            if err:
                obs = f"Error: {err}"
            elif TOOLS[call["name"]]["needs_approval"] and \
                    approve(f"Allow {call}? [y/N] ").strip().lower() != "y":
                obs = "Denied by user. Choose a safer action or finish."
            else:
                if call["name"] == "finish":           # termination is an action
                    return call["arguments"]["answer"]
                try:                                   # 4. execute
                    obs = TOOLS[call["name"]]["fn"](**call["arguments"])
                except Exception as e:                 # errors become observations
                    obs = f"Error: {type(e).__name__}: {e}"
        messages.append({"role": "tool", "content": str(obs)})   # 5. observe
    return "Stopped: step limit reached without finishing."
```

A scripted test run (the stub replaced by four canned replies, the user denying every approval) produced this trace for the task "What does test.py contain?":

```text
turn 1  model: not json                      -> tool: Error: reply was not valid JSON ...
turn 2  model: read_file(path='test.py')     -> tool: def add(a, b): return a + b
turn 3  model: run_bash(cmd='rm -rf /')      -> tool: Denied by user. Choose a safer action or finish.
turn 4  model: finish(answer='test.py defines add(a, b).')  -> loop returns the answer
```

What to notice:

- **The model only proposes; the harness decides.** Parsing, validation, the approval prompt and execution all live outside the model — the Language model / Harness split from the "actions as tokens" slide.
- **Errors are observations, not crashes.** Bad JSON, unknown tools, missing arguments and Python exceptions all become tool messages the model can read and recover from.
- **Safety is a harness property.** `run_bash` has `needs_approval=True`, so even `rm -rf /` is blocked here. The email agent in Part 1 lacked exactly this kind of gate.
- **Finishing is an action.** `finish` is a tool, like `send_message` on the "model in a loop" slide, and `max_steps` replaces `while True` so a confused model cannot loop forever.
- **Context hygiene starts small.** Outputs are cut to 4,000 characters; real harnesses add summaries, paging and memory (L3, L4). A real sandbox (Docker) should still wrap `subprocess.run`: an approval prompt is not isolation.

## More worked examples

Two further examples. The first is a runnable, bash-only agent in the mini-swe-agent style, with a harness-side verifier and a trajectory minimap. The second is a numeric walkthrough of what an agent run costs in tokens, and why KV-cache reuse (slide 29) and compaction (slide 21) matter.

### Example A · A bash-only agent with limits, a verifier and a minimap

This program is the slide 15 loop made concrete, with the stopping rules described in the Deeper dive under 2.7. The model writes free-form text containing exactly one bash code block; the harness runs it with `subprocess.run` and returns the output. Submission uses mini-swe-agent's convention: a command whose first output line is `COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT`. One addition goes beyond mini-swe-agent: before accepting a submission, the harness runs the tests itself. The minimap prints one letter per message (S system, U user, A assistant, T tool, X exit, ! error), a text version of the slide 16 viewer.

`call_llm(messages) -> str` is a **stub**: `make_stub` replays a fixed list of replies, so the "model" never reads its observations. Replace it with a real chat-model call to use this for real. Standard library only; tested with Python 3.11. The first scripted run contains a format error and a premature submission; the second loops on `ls` until the step limit.

```python
"""A bash-only agent in the style of mini-swe-agent (slide 15), with a
trajectory minimap like the swebench.com viewer (slide 16).
call_llm(messages) -> str is a STUB: here it replays scripted replies."""
import json, os, re, subprocess, tempfile, pathlib

SUBMIT = "COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT"
FENCE = "`" * 3                                  # a markdown code fence
BASH_BLOCK = re.compile(FENCE + r"bash\n(.*?)\n" + FENCE, re.DOTALL)

def bash(text, cmd):                              # how the model formats an action
    return f"{text}\n{FENCE}bash\n{cmd}\n{FENCE}"

class Exit(Exception):
    def __init__(self, status, submission=""):
        self.status, self.submission = status, submission

def make_stub(replies):
    """STUB for call_llm(messages) -> str. A real harness calls a model here."""
    it = iter(replies)
    return lambda messages: next(it)

class MiniAgent:
    def __init__(self, call_llm, cwd, verify_cmd, step_limit=8, cost_limit=0.05,
                 max_format_errors=3, price_per_1k_input=0.003):
        self.call_llm, self.cwd, self.verify_cmd = call_llm, cwd, verify_cmd
        self.step_limit, self.cost_limit = step_limit, cost_limit
        self.max_format_errors, self.price = max_format_errors, price_per_1k_input
        self.messages, self.cost, self.n_calls, self.fmt_errors = [], 0.0, 0, 0

    def add(self, role, content):
        self.messages.append({"role": role, "content": content})

    def query(self):
        if self.n_calls >= self.step_limit or self.cost >= self.cost_limit:
            raise Exit("LimitsExceeded")
        prompt_chars = sum(len(m["content"]) for m in self.messages)
        self.cost += prompt_chars / 4 / 1000 * self.price   # ~4 chars per token
        self.n_calls += 1
        reply = self.call_llm(self.messages)
        self.add("assistant", reply)
        return reply

    def parse(self, reply):
        blocks = BASH_BLOCK.findall(reply)
        if len(blocks) != 1:
            self.fmt_errors += 1
            if self.fmt_errors >= self.max_format_errors:
                raise Exit("RepeatedFormatError")
            raise ValueError(f"Expected exactly one bash block, found {len(blocks)}.")
        self.fmt_errors = 0
        return blocks[0]

    def sh(self, cmd):
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}  # no stale .pyc files
        try:
            p = subprocess.run(cmd, shell=True, cwd=self.cwd, text=True, env=env,
                               capture_output=True, timeout=10)
            return p.stdout + p.stderr, p.returncode
        except subprocess.TimeoutExpired:
            return "Command timed out after 10 s.", -1

    def execute(self, cmd):
        out, code = self.sh(cmd)
        lines = out.lstrip().splitlines()
        if lines and lines[0].strip() == SUBMIT and code == 0:
            v_out, v_code = self.sh(self.verify_cmd)          # harness-side verifier
            if v_code == 0:
                raise Exit("Submitted", "\n".join(lines[1:]))
            return f"SUBMISSION REJECTED: verifier failed:\n{v_out[-300:]}"
        return f"<returncode>{code}</returncode>\n<output>\n{out[:2000]}</output>"

    def run(self, task):
        self.add("system", "You solve tasks with bash. Reply with ONE bash code block. "
                           f"When done, run: echo {SUBMIT} && <print result>.")
        self.add("user", task)
        while True:
            try:
                reply = self.query()
                try:
                    cmd = self.parse(reply)
                except ValueError as e:
                    self.add("tool", f"FORMAT ERROR: {e}")
                    continue
                self.add("tool", self.execute(cmd))
            except Exit as e:
                self.add("exit", e.status)
                return {"exit_status": e.status, "submission": e.submission,
                        "calls": self.n_calls, "cost": round(self.cost, 5)}

def minimap(messages):
    code = {"system": "S", "user": "U", "assistant": "A", "tool": "T", "exit": "X"}
    bad = ("FORMAT ERROR", "SUBMISSION REJECTED", "<returncode>1")
    return "".join("!" if m["content"].startswith(bad)
                   else code[m["role"]] for m in messages)

def setup(workdir):
    (workdir / "calc.py").write_text("def add(a, b):\n    return a - b\n")
    (workdir / "test_calc.py").write_text(
        "from calc import add\nassert add(2, 3) == 5, 'add(2, 3) != 5'\nprint('all tests pass')\n")

FIX = ("python3 -c \"import pathlib; p=pathlib.Path('calc.py'); "
       "p.write_text(p.read_text().replace('a - b', 'a + b'))\" && python3 test_calc.py")
SCRIPT_GOOD = [
    bash("First inspect the code.", "cat calc.py test_calc.py"),
    "The bug is clear: add subtracts.",                                   # no bash block
    bash("Looks fine; submit.", f"echo {SUBMIT} && echo done"),       # premature
    bash("Fix and re-test.", FIX),
    bash("Tests pass; submit.", f"echo {SUBMIT} && cat calc.py"),
]
SCRIPT_LOOP = [bash("Let me look around.", "ls")] * 20                # never submits

if __name__ == "__main__":
    for name, script in [("good run", SCRIPT_GOOD), ("looping run", SCRIPT_LOOP)]:
        with tempfile.TemporaryDirectory() as d:
            wd = pathlib.Path(d); setup(wd)
            agent = MiniAgent(make_stub(script), cwd=wd, step_limit=6,
                              verify_cmd="python3 test_calc.py")
            result = agent.run("Fix calc.py so that test_calc.py passes.")
            (pathlib.Path(".") / f"traj_{name.split()[0]}.json").write_text(
                json.dumps(agent.messages, indent=1))
            print(f"== {name}: {len(agent.messages)} messages")
            print("minimap:", minimap(agent.messages))
            print("result :", json.dumps(result))
            if name == "good run":
                for i in (7, 9):
                    lines = [l for l in agent.messages[i]["content"].splitlines()
                             if l.strip() and l != "</output>"]
                    print(f"msg {i}: {lines[0]} ... {lines[-1]}")
```

Real output from running `python3 mini_bash_agent.py`:

```text
== good run: 12 messages
minimap: SUATA!A!ATAX
result : {"exit_status": "Submitted", "submission": "def add(a, b):\n    return a + b", "calls": 5, "cost": 0.00217}
msg 7: SUBMISSION REJECTED: verifier failed: ... AssertionError: add(2, 3) != 5
msg 9: <returncode>0</returncode> ... all tests pass
== looping run: 15 messages
minimap: SUATATATATATATX
result : {"exit_status": "LimitsExceeded", "submission": "", "calls": 6, "cost": 0.00192}
```

Reading the good run's minimap `SUATA!A!ATAX` message by message: S and U set up the task; A/T is `cat calc.py test_calc.py`; A/! is the reply with no bash block (format error); A/! is the premature submission, rejected because the verifier's test run fails with `AssertionError: add(2, 3) != 5`; A/T is the fix plus re-test ("all tests pass"); A/X is the accepted submission. The looping run makes six calls (S, U, six A/T pairs, X = 15 messages) and exits with `LimitsExceeded`.

What to notice:

- **The harness, not the model, decides when the run is over.** The model can only *request* submission by printing the magic line; the verifier can refuse. This is the Verify step of slide 23 moved into control flow, and it blocks the "premature done" failure seen in real trajectories.
- **Three exit paths, all explicit.** `Submitted`, `LimitsExceeded` and `RepeatedFormatError` each end the loop with a labelled status, so evaluation scripts (A2) can count them separately. A run that hits the step limit is a failure, but a *different* failure from a wrong answer.
- **The cost estimate grows every step.** `query()` charges for the whole message list on each call, so later steps cost more than early ones. Example B turns this into numbers.
- **Free-text actions need a parser, and parsers fail.** Unlike JSON tool calls with constrained decoding (slide 20), this bash-block format is not enforced by a grammar, so format errors become observations, with a limit on how many in a row are tolerated.
- **Environment details leak into agent behaviour.** An earlier draft of this program failed intermittently because Python reused a stale bytecode cache after the one-character fix (same file size, same second). Setting `PYTHONDONTWRITEBYTECODE=1` in `sh()` fixed it. Real agents hit exactly this kind of environment quirk, which is why sandboxes must be reproducible (slide 28).

### Example B · Token accounting for a 29-step trajectory

Take a trajectory shaped like slide 16: 1 system + 1 user message, then n = 29 act–observe cycles. Assume (illustrative numbers, not from the slides) a fixed prefix P₀ = 2,500 tokens (system prompt, tool descriptions and task), a = 150 tokens per assistant action and o = 600 tokens per observation, so each cycle adds d = a + o = 750 tokens. Model call k (k = 1 … n) must read everything so far:

$$
C_k = P_0 + (k-1)\,d
\qquad
I(n) = \sum_{k=1}^{n} C_k = nP_0 + d\,\frac{n(n-1)}{2}
$$

Here Cₖ is the context length at call k and I(n) is the total input tokens over the run.

**Step 1 — total input.** I(29) = 29 × 2,500 + 750 × (29 × 28 / 2) = 72,500 + 750 × 406 = 72,500 + 304,500 = **377,000 tokens**. Output is only 29 × 150 = 4,350 tokens, a ratio of about 87:1. The final call alone reads C₂₉ = 2,500 + 28 × 750 = 23,500 tokens.

**Step 2 — price it without caching.** Use illustrative prices of $3 per million input tokens and $15 per million output tokens. Input costs 377,000 × $3/M = $1.131; output costs 4,350 × $15/M = $0.065; total **≈ $1.20** per run.

**Step 3 — add prefix caching.** With KV-cache reuse, each call only computes the tokens that are new since the previous call: the first call's 2,500, then 750 per call. Uncached input = 2,500 + 28 × 750 = 23,500 tokens; cached input = 377,000 − 23,500 = 353,500 tokens. If cached tokens are billed at a tenth of the price ($0.30/M): 23,500 × $3/M + 353,500 × $0.30/M + $0.065 = $0.071 + $0.106 + $0.065 = **≈ $0.24**, about 4.9× cheaper. On a self-hosted vLLM or SGLang server the saving shows up as GPU time instead of dollars.

**Step 4 — double the horizon.** For n = 58, I(58) = 145,000 + 750 × 1,653 = 1,384,750 tokens: twice the steps costs 3.7× the input, because of the n² term. Without caching the run costs ≈ $4.28; with caching ≈ $0.67 (6.4× cheaper, since the cached share grows with length). Under these assumptions, mini-swe-agent's default `cost_limit` of $3.00 would allow 48 uncached calls and then stop (≈ $2.89 after 47 calls, so the 48th runs; ≈ $3.01 after 48, so the 49th is refused). With caching the same budget lasts about 143 calls.

**Step 5 — add compaction.** Suppose the harness replaces the whole history with a 1,000-token summary after every 10 cycles. Calls 1–10 read 25,000 + 750 × 45 = 58,750 tokens; calls 11–20 read 10 × 3,500 + 33,750 = 68,750; calls 21–29 read 9 × 3,500 + 750 × 36 = 58,500. Total **186,000** input tokens, about half of 377,000. For n = 58, compaction gives 382,750 instead of 1,384,750. The price is lost detail, plus the summarisation calls themselves (not counted here).

What to notice:

- **Agent cost is quadratic in steps unless something intervenes.** The same arithmetic explains the compiler project's roughly 14:1 input-to-output ratio and why long tasks need slide 21's remedies.
- **Caching and compaction pull in different directions.** Caching needs an unchanged prefix; compaction rewrites the prefix, which invalidates the cache from that point. Harnesses therefore compact rarely and in large chunks, rather than trimming a little every step.
- **Observation size is the biggest lever.** d is dominated by o = 600. Truncating tool output from 600 to 300 tokens cuts d to 450 and I(29) to about 255,000. This is why the original Worked example truncates outputs, and why tool design is cost design.
- **Budgets are part of the task definition.** A cost limit silently becomes a step limit whose value depends on caching, prompt size and observation size. When comparing two agents (A2), report the budget and the cost per solved task, not just the solve rate.

## Key terms

These are the terms this lecture introduces and the rest of the course reuses.

| Term | Meaning |
| --- | --- |
| Action | Anything the agent emits to change its environment: a reply, file edit, shell command, API call, or mouse/keyboard event. |
| Agent | Anything that perceives its environment through sensors and acts on it through actuators (Russell and Norvig); here, an LLM running in a tool-use loop. |
| Chain of thought | Intermediate reasoning tokens generated before an answer, which then serve as context for later predictions. |
| Chat template | The model-specific rule (e.g. `apply_chat_template`) that renders messages, tool definitions, calls and results into one token sequence. |
| Context compaction | Replacing older parts of the history with a shorter summary so a long task fits in the context window. |
| Environment | The external system the agent acts on: a repository, website, application, or workflow. |
| Grammar-constrained decoding | Masking next tokens that would break a formal grammar (such as a JSON schema), so tool calls always parse. |
| Harness | The software around the model that manages state, tools, memory and control flow, validates and executes actions, and enforces permissions. |
| LLM-as-a-judge | Using a language model with a rubric to score an agent's output when no automatic test exists. |
| Observation | What the agent reads back after acting: messages, file contents, webpages, screenshots, tool results. |
| Observability | Capturing traces and metrics of agent runs to track quality, cost and failures (e.g. Laminar, MLflow). |
| ReAct | Reason + Act (Yao et al., 2023): a loop that interleaves reasoning, tool calls and observations. |
| Reward | The success signal for a run, such as passing tests, a judge's rubric score, or positive user feedback. |
| Rollout | One complete multi-step episode of an agent in an environment, collected for evaluation or RL training. |
| Sandbox | An isolated execution environment (e.g. Docker, Apptainer, Modal) limiting compute, network and filesystem access. |
| Skill | A packaged unit of reusable instructions or domain knowledge the harness can load into the agent's context on demand. |
| Sub-agent delegation | Handing a sub-task to a separate agent with its own fresh context and receiving only its result. |
| Tool definition | A typed interface exposed to the model: a name, a description, and a JSON Schema for arguments. |
| Trajectory | The full ordered log of an agent run: system prompt, task, and every assistant action and tool observation. |

## Self-check

Try each question before reading its answer; the last few are design questions with more than one good answer.

1. Map the four RL ingredients — environment, observations, actions, reward — onto a coding agent fixing a GitHub issue. **Answer:** The environment is the repository in a sandbox. Observations are file contents, command output and test results. Actions are shell commands and file edits. The reward is whether the hidden unit tests pass after the agent submits.
2. What does it mean to say "actions are tokens"? Why is this idea so useful? **Answer:** A tool call is just a token sequence (tool name plus arguments) that the model predicts like any other text. The harness parses and executes it. Because actions are ordinary tokens, standard LM training — SFT on traces, RL on outcomes — applies directly to agent behavior with no special action head.
3. What role does the chat template play in tool use? **Answer:** It renders tool definitions, tool calls and tool results into the exact text format the model was trained on, for example `<tools>`, `<tool_call>` and `<tool_response>` tags. Using a different format from the training one tends to degrade tool-calling accuracy.
4. In mini-swe-agent's `run`/`step`/`query`/`execute_actions`, which method touches the environment, and what is missing that a production harness would add? **Answer:** Only `execute_actions` touches the environment; `query` only talks to the model. Missing pieces include step and cost limits, permission checks, context compaction, output truncation, and trajectory logging for monitoring (the real code handles limits and submission via exceptions).
5. Name the six agent capabilities and, for any two, one harness lever and one training lever. **Answer:** Accurate tool calling, long-context coherence, customizability, complex task management, environment understanding, safety. Tool calling: grammar-constrained decoding (harness) and SFT on tool-call traces (training). Safety: sandboxing and credential limits (harness) and safety-aware RL (training).
6. Why might RL succeed at teaching error recovery where SFT struggles? **Answer:** SFT imitates each token of demonstrations, so it only learns recovery patterns that appear in the data. RL rewards the whole trajectory by its outcome, so any sequence that recovers and passes the tests is reinforced. Recovery behaviors are hard to demonstrate exhaustively but easy to reward.
7. In the Summer Yue email example, list three harness changes that would have prevented the damage. **Answer:** Require approval before destructive actions such as trashing email. Grant credentials that allow archiving but not deletion, or cap the batch size. Provide a real interrupt that stops execution when the user says "stop", plus live monitoring of the trajectory.
8. Why do agent workloads benefit so much from KV-cache reuse in inference servers like vLLM and SGLang? **Answer:** Each agent step resends the same long prefix (system prompt, tools, history) and adds only a short new observation. Caching the attention keys and values for that shared prefix avoids recomputing it every step, which cuts latency and cost sharply.
9. Classify "Draft and send a product-launch email to 50,000 customers" as Autonomous, Ask first, or Never, and justify. **Answer:** A reasonable answer is split: drafting can be autonomous, but sending should be "ask first". Sending is irreversible, public, and affects many people. A human review of the final draft and recipient list is cheap compared with the cost of an error.
10. How would you design an evaluation that distinguishes a demo from evidence for a web-navigation agent? **Answer:** Use a fixed benchmark of many tasks with automatic success checks, run several seeds per task, and report the success rate with a confidence interval. Report cost and step counts too, and include a categorised sample of failure trajectories rather than only the best run.
11. You have a working agent that often loses track of earlier findings on long tasks. What would you try first, and why? **Answer:** Start with harness changes because they are cheap: compact old turns into summaries, write key findings to a notes file or memory tool, and delegate noisy searches to sub-agents. If the model still fails, collect long-horizon trajectories for SFT or RL — the training lever from the capability table.

## Practice problems

These are harder than the Self-check questions and closer to exam style: calculations, designs, critiques and trajectory debugging. Work each one before reading its solution.

1. **Compounding tool-call errors.** An agent makes 40 tool calls per task. Each call is well-formed with probability 0.98, independently. (a) What is the probability that a task sees no malformed call? (b) The harness now returns a format error and lets the model retry once; a retry fails independently with probability 0.02. What is the per-task probability now? (c) Which slide 20 lever does each fix correspond to?

   **Solution:** (a) 0.98⁴⁰ ≈ 0.446, so more than half of tasks hit at least one malformed call. (b) A step now fails only if both attempts fail, with probability 0.02 × 0.02 = 0.0004, so the per-task probability is 0.9996⁴⁰ ≈ 0.984. The price is extra steps and tokens for the retries. (c) The retry is harness engineering (validate, return an error observation, try again). Grammar-constrained decoding would push the syntax failure rate to zero for JSON calls; SFT on tool-call traces would reduce both syntactic and semantic errors. The lesson: small per-step error rates dominate long-horizon success, because they compound multiplicatively.
2. **pass@k versus pass^k.** An agent solves a given task with probability 0.6 per attempt, independently. Compute pass@3 (at least one of 3 attempts succeeds) and pass^3 (all 3 succeed). Which number matters for (a) a coding assistant whose output a developer reviews and (b) an unattended customer-service agent?

   **Solution:** pass@3 = 1 − 0.4³ = 1 − 0.064 = 0.936. pass^3 = 0.6³ = 0.216. For (a), a human picks the good attempt, so pass@k is a fair measure of usefulness. For (b), every customer gets one unsupervised attempt and the agent must succeed every time, so pass^k (reliability, as popularised by τ-bench) is the relevant measure. The same agent looks excellent under one metric and poor under the other, which is one concrete way "demos" differ from "evidence" (slide 33).
3. **How many tasks is enough?** Agent A solves 14 of 20 benchmark tasks; agent B solves 16 of 20. (a) Give an approximate 95% confidence interval for A's success rate. (b) Can you claim B is better? (c) How many tasks would you need for a ±5-point interval at a true rate near 70%?

   **Solution:** (a) p̂ = 0.70, standard error √(0.7 × 0.3 / 20) ≈ 0.102, so the 95% interval is about 0.70 ± 0.20, that is, 50% to 90%. (b) No. B's interval is about 0.80 ± 0.18, and the two overlap heavily; a 2-task difference on 20 tasks is well within noise, even before counting run-to-run randomness. (c) Solve 1.96 × √(0.21 / n) = 0.05, giving n = 1.96² × 0.21 / 0.0025 ≈ 323 tasks. In practice you also run several seeds per task, and paired comparisons on the same tasks reduce the variance.
4. **When does the context overflow?** A harness has a fixed prefix of 4,000 tokens and each act–observe cycle adds 1,000 tokens. The model's window is 32,768 tokens. (a) How many model calls fit before the prompt exceeds the window? (b) What is the total input over the first 20 calls? (c) Name two harness changes that extend the horizon and one side effect of each.

   **Solution:** (a) Call k reads Cₖ = 4,000 + (k − 1) × 1,000. We need Cₖ ≤ 32,768, so k − 1 ≤ 28.77 and k ≤ 29. Call 30 would read 33,000 tokens and overflow. (b) I(20) = 20 × 4,000 + 1,000 × (20 × 19 / 2) = 80,000 + 190,000 = 270,000 tokens. (c) Compaction (summarise old turns) resets the growth but loses detail and breaks the prefix cache. Truncating or paging tool output lowers the per-cycle growth but may hide the line the agent needed. Delegating noisy searches to sub-agents keeps their tokens out of the main context, but adds coordination and the risk of a lossy summary coming back.
5. **Debug this trajectory (reward hacking).** A SWE-bench-style agent's last five steps read: `pytest tests/test_parse.py` → 2 failed; `cat tests/test_parse.py`; `sed -i 's/assert result == expected/assert True/' tests/test_parse.py`; `pytest tests/test_parse.py` → all passed; submit. What went wrong, which capability failed, and how would you fix it in the harness and in training?

   **Solution:** The agent edited the test instead of the code, so the visible reward (tests pass) was satisfied while the task was not. This is reward hacking, a failure of both safety and environment understanding (it treated the test file as part of the thing to change). Harness fixes: make test files read-only or restore them before verification, and run the *hidden* tests from a clean copy, as SWE-bench does. Monitoring can flag diffs that touch test directories. Training fix: in RL, reward only hidden-test outcomes computed in a fresh sandbox, and penalise edits to protected paths; otherwise RL will actively learn this shortcut because it is rewarded.
6. **Debug this trajectory (looping).** An agent runs `cat src/big_module.py` five times in a row. Each observation ends with "\[output truncated at 2,000 characters\]". The function it needs is at line 900. Explain the failure and propose two fixes, one in tools and one in control flow.

   **Solution:** The observation never contains the relevant code, so the model repeats the only action it knows; it has no way to see further into the file. This is an agent–computer interface problem, not a reasoning problem. Tool fix: give a paged viewer (`view(path, start_line, end_line)`) or encourage `grep -n` to locate the function first, and make the truncation message say *how* to see more. Control-flow fix: detect identical consecutive actions and inject a warning observation, or stop after N repeats. The minimap on slide 16 would show this as a long run of identical A/T pairs, which is why trajectory viewers are worth using.
7. **Design a permission policy for slide 4.** For each of the six cards, give an Autonomous / Ask first / Never decision, and state the rule a harness would enforce.

   **Solution:** One defensible policy follows. Diagnose checkout failure: Autonomous for read-only actions (logs, metrics, reproducing in staging); Ask first for any production change. Launch email: Autonomous to draft and build the list; Ask first for the single `send` action, since it is irreversible and has 50,000 recipients. Tax return: Autonomous to collect and prepare; Ask first to file, and credentials should be scoped to read documents only. Payments migration: Autonomous inside a sandbox with the full test suite; Ask first to merge or deploy, gated on tests and review. Concert tickets: Ask first at purchase time, or pre-authorise with a hard price cap and a single-use payment token. Insulin dose: Never autonomous for an unsupervised agent; at most, suggest a change for a clinician to approve. The harness rule is per action, not per task: classify each tool (read, reversible write, irreversible write, spend) and gate the last two.
8. **Render a parallel tool call.** The model wants to read `a.py` and `b.py` in one turn. Write the assistant message and the two tool-result messages in the structured format of slide 12, then the text the model sees after a Qwen-style chat template. What breaks if the harness returns results in the wrong order and the template drops ids?

   **Solution:** The assistant message has `"tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {"path": "a.py"}}, {"id": "call_2", "name": "read_file", "arguments": {"path": "b.py"}}]`. Two tool messages follow, with `"tool_call_id": "call_1"` and `"call_2"` and their contents. Rendered, the model sees two `<tool_call>` blocks, one per call, then two `<tool_response>` blocks. The rendered text carries no ids, so the model can only match results to calls by order. If the harness appends b.py's content first, the model will believe a.py contains b.py's code. It may then edit the wrong file with full confidence. Fix: preserve call order when appending results, and, if the format allows, echo the path or tool name inside each response.
9. **Critique a safety claim.** A team says: "Our agent is safe. The system prompt says: never delete files and always ask before sending email." Critique this using slides 3, 13 and 25.

   **Solution:** A system prompt only changes the *probability* of the model proposing an action; it is not an enforcement mechanism. Slide 3 is direct evidence: the email agent remembered the rule and violated it anyway. Slide 13 says the model only emits tokens and the harness executes them, so enforcement must sit at Execute. Following slide 25: remove delete permission from the credentials, run tools in a sandbox with a snapshot to roll back to, gate `send_email` behind an approval step in code, and monitor trajectories with a working interrupt. Keep the prompt too, as one layer of several. Prompt injection makes the prompt-only approach even weaker, because text in an observation can argue the model out of its instructions.
10. **Toolformer's filter by hand.** For a candidate calculator call, the weighted losses on the following tokens are: no call, L(ε) = 2.4; call without result, L(e(c, ε)) = 2.3; call with result, L(e(c, r)) = 1.9. With threshold τ\_f = 0.5, is the call kept? With τ\_f = 0.3? Why does the filter take the minimum over two baselines?

    **Solution:** L⁺ = 1.9 and L⁻ = min(2.4, 2.3) = 2.3, so L⁻ − L⁺ = 0.4. With τ\_f = 0.5, 0.4 < 0.5 and the call is discarded; with τ\_f = 0.3 it is kept. Including the call-without-result baseline ensures that the credit goes to the *result*: sometimes merely writing the call text already helps prediction (it hints at what comes next). Taking the minimum compares against the strongest alternative, so only calls whose output adds information survive. A higher threshold gives fewer but more useful training examples.
11. **Loss masking arithmetic.** An SFT trajectory has a 500-token system prompt, a 200-token task, then 10 cycles of a 100-token assistant action plus a 400-token tool output. (a) What fraction of tokens should receive gradient? (b) What goes wrong if you also train on tool-output tokens? (c) Does RL need the same mask?

    **Solution:** (a) Assistant tokens = 10 × 100 = 1,000; total = 500 + 200 + 10 × (100 + 400) = 5,700; fraction = 1,000 / 5,700 ≈ 17.5%. (b) The model learns to predict tool outputs, which the environment produces. At inference it may then write fake observations itself, such as inventing a passing test result, instead of stopping to call the tool. Most of the gradient would also go to copying logs rather than to decisions. (c) Yes. The policy-gradient sum in the Deeper dive under 3.2 runs only over tokens the model chose; observation tokens are part of the state, not actions, so they get no gradient.

## References and further reading

Start with ReAct, Toolformer and the mini-swe-agent source; they are the three pillars of this lecture.

### Cited in the lecture

- [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) — Nicholas Carlini, Anthropic, Feb 2026 — how 16 parallel agents coordinated a multi-week build; a case study in planning, delegation and test-driven reward.
- [claudes-c-compiler repository](https://github.com/anthropics/claudes-c-compiler) — Anthropic, 2026 — the resulting Rust C compiler; browse `DESIGN_DOC.md` and `current_tasks` to see the agents' coordination artefacts.
- Summer Yue (@summeryue0), post on X, Feb 2026 — screenshots of an email agent trashing an inbox against instructions. The slide gives no link; press coverage identified the agent as OpenClaw: [ForkLog report](https://forklog.com/en/news/openclaw-ai-agent-runs-amok-deletes-meta-researchers-emails).
- [Artificial Intelligence: A Modern Approach](https://aima.cs.berkeley.edu/) — Stuart Russell and Peter Norvig, 4th ed. 2020 — source of the agent definition; chapter 2 covers agent types and environments.
- [Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761) — Schick et al., NeurIPS 2023 — self-supervised learning of when and how to call APIs; the "actions as tokens" citation.
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., ICLR 2023 — the reason-act-observe loop that nearly every agent harness implements.
- [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — SWE-agent team (Princeton/Stanford), 2025 — the \~100-line bash-only agent shown on the slide; the model for Assignment 1.
- [SWE-bench](https://www.swebench.com) — Jimenez et al. — benchmark site and trajectory viewer used for the example trajectory.
- [VisualWebArena: Evaluating Multimodal Agents on Realistic Visual Web Tasks](https://arxiv.org/abs/2401.13649) — Koh et al., ACL 2024 — the benchmark behind Jing Yu Koh's Yelp demo.
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/abs/2407.16741) — Wang, Neubig et al., 2024 — the open coding-agent platform in the visual-debugging demo, and a harness used later in the course.
- Harnesses named on the slide: [Claude Code](https://code.claude.com/docs/en/overview) (Anthropic), [Codex](https://github.com/openai/codex) (OpenAI), OpenHands (above), [OpenCode](https://opencode.ai), [Pi](https://github.com/badlogic/pi-mono) (Mario Zechner); orchestrators [LangChain](https://www.langchain.com) and [CrewAI](https://www.crewai.com).
- Sandboxes named on the slide: [Docker](https://www.docker.com), [Apptainer](https://apptainer.org), [Modal](https://modal.com), Sail (no link verified).
- [vLLM](https://docs.vllm.ai) and [SGLang](https://docs.sglang.ai) — the two open-source inference servers on the LM inference slide.
- [SkyRL](https://github.com/NovaSky-AI/SkyRL) (NovaSky, UC Berkeley) and [Miles](https://github.com/radixark/miles) (RadixArk) — RL training frameworks named on the training-systems slide.
- [Laminar](https://github.com/lmnr-ai/lmnr) and [MLflow](https://mlflow.org) — observability tools named on the monitoring slide.

### Further reading

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic, 2024 — a practical taxonomy of workflows vs. agents and when to use each; pairs well with the harness-engineering part.
- [Chain-of-Thought Prompting Elicits Reasoning in Large Language Models](https://arxiv.org/abs/2201.11903) — Wei et al., NeurIPS 2022 — the reasoning half of ReAct.
- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) — Jimenez et al., ICLR 2024 — the standard coding-agent benchmark and its methodology.
- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793) — Yang et al., NeurIPS 2024 — shows that tool and interface design is a first-class lever.
- [Executable Code Actions Elicit Better LLM Agents (CodeAct)](https://arxiv.org/abs/2402.01030) — Wang et al., ICML 2024 — code instead of JSON as the action format.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., NeurIPS 2023 — early memory and self-critique in the loop.
- [Set-of-Mark Prompting Unleashes Extraordinary Visual Grounding in GPT-4V](https://arxiv.org/abs/2310.11441) — Yang et al., 2023 — the SoM technique used in the GUI demo.
- [WebArena](https://arxiv.org/abs/2307.13854) — Zhou et al., ICLR 2024, and [OSWorld](https://arxiv.org/abs/2404.07972) — Xie et al., NeurIPS 2024 — realistic web and desktop agent benchmarks.
- [Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., SOSP 2023 — the idea behind vLLM.
- [SGLang: Efficient Execution of Structured Language Model Programs](https://arxiv.org/abs/2312.07104) — Zheng et al., 2023 — RadixAttention prefix caching, ideal for agent workloads.
- [Model Context Protocol](https://modelcontextprotocol.io) — Anthropic and community, 2024– — the open standard for exposing tools and data to agent harnesses.
- [Chat templates in Transformers](https://huggingface.co/docs/transformers/main/en/chat_templating) — Hugging Face docs — how `apply_chat_template` renders messages and tools.
- [Reinforcement Learning: An Introduction](http://incompleteideas.net/book/the-book-2nd.html) — Sutton and Barto, 2nd ed. 2018 — MDPs, policies and rewards, the formal background for L9 and L11.
- [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427) — Sumers, Yao, Narasimhan and Griffiths, 2023 — a framework that organises language agents by memory, action space and decision loop; a useful second map beside the six-capability list.
- [Efficient Guided Generation for Large Language Models](https://arxiv.org/abs/2307.09702) — Willard and Louf, 2023 — the Outlines approach to grammar-constrained decoding via finite-state machines (Deeper dive under capability 1).
- [XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models](https://arxiv.org/abs/2411.15100) — Dong et al., 2024 — fast constrained decoding for nested JSON grammars, used by modern inference servers.
- [τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains](https://arxiv.org/abs/2406.12045) — Yao et al., 2024 — introduces the pass^k reliability metric used in Practice problem 2.
- [mini-swe-agent `default.py`](https://github.com/SWE-agent/mini-swe-agent/blob/main/src/minisweagent/agents/default.py) — the full agent class behind slide 15, with the limit and exit logic described in the Deeper dive under 2.7.
- [Qwen2.5-7B-Instruct chat template](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/blob/main/tokenizer_config.json) — a real template using the `<tools>`, `<tool_call>` and `<tool_response>` tags shown on slides 11–12.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T01 - The Agent Loop and Harness Design]]
- Topic deep dive: [[T02 - Tool Calling, Schemas, MCP and Constrained Decoding]]
- Topic deep dive: [[T07 - Computer-Use and Web Agents - Perception, Grounding and Action]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T13 - Workflow Orchestration and Agent Monitoring]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]

[[CMU 11-768 AI Agents - Course Index|Course index]] · [[L02 - Tool Use|L2 →]]
