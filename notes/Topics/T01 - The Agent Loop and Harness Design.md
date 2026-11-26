---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, agent-loop, harness, react]
aliases: ["CMU T1", "The Agent Loop and Harness Design"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 1 · The Agent Loop and Harness Design

[[CMU 11-768 AI Agents - Course Index|Course index]] · [[T02 - Tool Calling, Schemas, MCP and Constrained Decoding|T2 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L01 - What Are Agents]], [[L02 - Tool Use]], [[L03 - Long-Context Agents]], [[L06 - Coding Agents]], [[L13 - Agent Safety]], [[L14 - OpenHands]], [[L15 - Orchestration and Monitoring]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L1, L2, L3, L6, L13, L14, L15 · 11-768 AI Agents, Fall 2026

## Overview

An LLM agent is a language model running inside a loop of observing, thinking and acting, and the **harness** is the software that runs that loop; together they decide whether an agent is useful, affordable and safe.

The model only predicts tokens. Everything else that makes an "agent" is engineering: turning some of those tokens into tool calls, executing them in a controlled place, feeding results back, keeping the history within budget, refusing dangerous actions, recovering from failures, deciding when to stop, and recording what happened. L1 (Fried and Neubig) states the core idea in one line: *an agent is a model in a loop*. The rest of this sheet unpacks that line.

### Why it matters for building real agents

- **Most failures are loop failures, not knowledge failures.** A strong model still fails if a malformed call crashes the parser, a tool error is swallowed, the context overflows, or the loop never stops.
- **The harness is a large, cheap lever.** L1 lists two ways to build every agent capability: train the model, or engineer the harness. Harness changes ship in minutes and need no GPUs.
- **Safety lives in the harness.** The model proposes; external software decides whether and how to execute (L2). Permissions, sandboxes and credential handling cannot be delegated to the model's good intentions.
- **Cost and latency are harness properties.** Because each call re-reads the growing history, input tokens grow quadratically with the number of steps (L3). Caching, compaction and parallel calls are harness decisions.
- **Trajectories are the raw material of the whole field.** The loop's log is what you debug, evaluate, fine-tune on (L8) and reinforce (L9, L11).

### Key questions this sheet answers

- What exactly is an agent, from Russell and Norvig's definition to today's LLM agents?
- How does a next-token predictor emit actions, and who executes them?
- What is ReAct, and why did interleaving reasoning with acting work so well?
- What must a harness do: state, tool dispatch, validation, permissions, sandboxing, stopping, error recovery and observability?
- What is a trajectory, and why do its size and shape drive cost, training and evaluation?
- How small can an agent be? What does mini-swe-agent (about 100 lines of Python) teach us?
- Which capabilities should come from the model and which from the harness?
- How do you design permissions and monitoring so an agent can act autonomously without doing harm?

### Which lectures cover it

| Lecture | Angle on this topic |
| --- | --- |
| L1 · What are agents? (Fried, Neubig) | Definitions, actions as tokens, the model-in-a-loop picture, the mini-swe-agent loop, six capabilities, harness vs training, the systems stack (harness, sandbox, inference, training, observability) |
| L2 · Tool use (Neubig) | Tool schemas, chat templates, model-specific call formats, OpenHands dispatch, validation and constrained decoding, MCP and credentials, parallel calls, operational failures |
| L3 · Long context (Neubig) | Why context grows, quadratic input cost, prompt caching, compaction policies and compaction drift |
| L6 · Coding agents (Neubig) | Localize–edit–verify, shell-only toolsets, edit formats, Agentless as a fixed workflow, multi-harness training |
| L5, L7–L9, L11 (supporting) | Plan Mode and plans as security boundaries (L5); GUI agent action loops (L7); trajectories as SFT data (L8) and RL rollouts (L9, L11) |
| L13 · Agent safety | Safety limits as harness components: sandbox boundaries, scoped and brokered credentials, confirmation and pre-execution monitors, alert precision (section 11; full treatment in T14) |
| L14 · OpenHands (Frameworks 1) | A production harness as an SDK: stateless agent, event-sourced conversation, workspaces, typed tools, condensers, confirmation policies, interfaces and automations; single agent versus multi-agent (sections 12, 13, M1) |
| L15 · Orchestration and monitoring (Fried) | Moving control flow from the model into code; checkpoints, interrupts, retries, traces and tests; trace analysis at scale (sections 14, 15, M1; full treatment in T13) |

### Prerequisites

- Python, JSON and basic command-line use.
- What a language model does: next-token prediction, sampling, chat messages.
- Helpful but optional: the idea of a Markov decision process (states, actions, rewards) and HTTP APIs.

### Suggested reading path

1. Read **Core concepts** in order; it builds from definitions to the full harness.
2. Skim the **Concept map** to fix the picture of how the parts connect.
3. Work through **Mechanics** for the formal loop, message formats and the cost equations.
4. Run the **Hands-on** harness yourself and change its policy and limits.
5. Use **Design patterns, pitfalls and checklist** when you build your own agent (for example Assignment 1).
6. Test yourself with **Practice questions**; use **Glossary** and **References** as lookup.

**Newer lectures.** Three later lectures widen the harness picture. L13 (agent safety) treats safety limits as harness components that must sit outside the agent's control: sandbox boundaries, scoped and brokered credentials, confirmation steps and monitors that finish their check before a tool call executes. L14 (OpenHands) shows a production harness as an SDK: a stateless agent, an event-sourced conversation, typed tools, swappable local, Docker or remote workspaces, condensers and confirmation policies, driven by many interfaces and by unattended automations, and it argues for one generalist agent over role-based teams. L15 (orchestration and monitoring) moves part of the loop's control flow out of the model and into code as an explicit workflow, and makes checkpoints, interrupts and execution traces the harness's durable record (sections 11–15 below). Mechanics M1, the L12–L15 patterns and pitfalls, the "Added with L12–L15" landscape table, open problems 10–12, new glossary terms and practice questions 16–22 carry the same material into the later sections.

## Concept map

![[cmu-ai-agents-T01-concept-map.png]]
*Concept map: The agent loop · model, six harness steps, sandboxed environment, and the trajectory log that feeds observability, evaluation and training*

Read it clockwise from step 1: the harness (highlighted) renders a prompt, the model answers with a tool call, the harness validates, permits and executes it inside the sandbox, appends the result, and checks whether to stop; every event lands in the trajectory log below, which serves debugging, evaluation and training.

## Core concepts

This section builds the agent loop from first principles: what an agent is, how a language model emits actions, how the loop runs, what it records, what the harness around it must do, and how to keep it cheap, robust and safe.

### 1. What is an agent? From Russell and Norvig to LLM agents

L1 opens with the textbook definition from Russell and Norvig's *Artificial Intelligence: A Modern Approach*: "An agent is anything that can be viewed as perceiving its environment through sensors and acting upon that environment through actuators." The definition is deliberately broad. A thermostat, a chess program and a person all qualify. What makes it useful is the vocabulary it forces on you: environment, percepts, actions and a measure of success.

**The classical vocabulary.** Russell and Norvig separate the *agent function* (a mathematical map from the whole percept sequence to an action) from the *agent program* (the code that implements it on a real machine). A **rational agent** picks the action expected to maximize its performance measure, given its percepts so far and its built-in knowledge. They describe a task with **PEAS**: Performance measure, Environment, Actuators, Sensors. They also classify environments along axes that matter directly for LLM agents:

| Property | Meaning | Typical LLM-agent case |
| --- | --- | --- |
| Fully vs partially observable | Can the agent see the whole state? | Partial: a coding agent sees only files it has opened |
| Deterministic vs stochastic | Does an action always have the same effect? | Mostly deterministic tools, but flaky tests, network and other users add noise |
| Episodic vs sequential | Do earlier actions affect later ones? | Sequential: an edit changes every later observation |
| Static vs dynamic | Does the world change while the agent thinks? | Web pages and inboxes change; a sandboxed repo does not |
| Known vs unknown | Does the agent know the rules? | Often unknown: a new API, a new codebase |

**The classical agent types.** Russell and Norvig describe a ladder of agent programs: *simple reflex* agents (condition–action rules on the current percept), *model-based reflex* agents (keep an internal state to handle partial observability), *goal-based* agents (search for actions that reach a goal), *utility-based* agents (trade off competing goals) and *learning* agents (improve their components from feedback). Beyond the lecture: an LLM agent is a surprising mix of these. Its "internal state" is simply the text history; its goal is written in natural language; its utility is implicit in training; and its learning happens either offline (SFT, RL) or through external memory.

**Mapping the definition to LLM agents.** L1 makes the mapping concrete:

| Concept | In an LLM agent (L1) |
| --- | --- |
| Environment | A repository, website, application or workflow |
| State / observations | Messages, file contents, webpages, screenshots and tool results |
| Actions | Replies, file edits, shell commands, API calls, mouse or keyboard events |
| Reward | Passing test cases, LLM-as-a-judge rubrics, positive user feedback |

L9 (RL basics) gives the same picture in formal notation. A task instance x fixes the environment. At each step the policy πθ sees only the **history** h\_t = (o\_0, a\_0, o\_1, …, o\_t) and chooses an action a\_t \~ πθ(a\_t | h\_t). The environment's true state s\_t is hidden. In L9's number-guessing example, the hidden number 11 is the state; the agent sees only "higher" or "lower". This is exactly a partially observable decision process, and it explains why agents must *look* before they act.

**Other definitions you will meet.** Wooldridge and Jennings (1995) define "weak agency" by four properties: autonomy, social ability, reactivity and pro-activeness. Anthropic's "Building effective agents" (2024) draws a practical line: *workflows* orchestrate LLMs through predefined code paths, while *agents* let the LLM dynamically direct its own process and tool use. L5 uses the same spectrum, from developer-defined workflows through plan-then-execute to fully adaptive agents.

Common misconception: "An agent is a special kind of model." It is not. L1 is explicit that agents are *systems*: model, harness, sandbox, inference server, training system and monitoring. The same weights can be a chatbot in one harness and an autonomous engineer in another.

**How capable are they now?** L1 motivates the course with Carlini's report (Anthropic, 2026) that sixteen parallel Claude agents built a 100,000-line C compiler in two weeks, able to compile the Linux kernel. L1 pairs this with a cautionary social-media post about an agent acting on a user's inbox, and with an interactive exercise: which tasks should an agent do *autonomously*, which should it *ask first*, and which should it *never* do? Examples range from diagnosing a failing checkout (low risk) to emailing 50,000 customers, filing a tax return or adjusting an insulin dose (high, irreversible risk). The same capability raises the stakes of harness design.

### 2. Actions as tokens: how a language model acts

A language model computes a distribution over the next token and appends a sample to its prefix (L1 recap). Chain-of-thought adds intermediate reasoning tokens that later predictions can condition on. Neither step touches the world. The bridge from text to action is a convention: *some token sequences are interpreted as requests to run a program*.

**A tool is a typed interface.** L2 defines a tool as "an interface through which a language model can invoke an external computer program." Wang et al.'s survey ("What Are Tools Anyway?", COLM 2024) gives two reasons to use one: tools *extend* the model (access to information or actions not in its parameters) and *facilitate* work (external programs are more reliable or efficient at some operations). L2's scenario table: search for current information, a calculator or Python for exact computation, an account API for private state, a browser or API to change the environment. L2 adds a guard: call tools only when their benefit outweighs latency, cost, failure and risk.

**The definition enters the prompt.** A tool is described by a name, a description and a JSON Schema for its arguments. The chat template renders it as text, for example inside `<tools> … </tools>` tags. The model never sees Python objects, only tokens.

```json
{"name": "read_file",
 "description": "Read a UTF-8 file.",
 "parameters": {"type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]}}
```

**The call comes out as tokens.** The model emits something like `<tool_call>{"name":"read_file","arguments":{"path":"test.py"}}</tool_call>`. The API layer parses it into a structured `tool_calls` entry and attaches a unique id (`call_7`). After execution the harness appends a message with role `tool`, the same `tool_call_id` and the result text. L2 shows that the serialization differs by model family: Qwen uses function and parameter tags, Mistral a `[TOOL_CALLS]` control token with a call id, DeepSeek V3.2 its own DSML invocation block. One schema, many wire formats; the harness (or inference server) must parse each correctly.

**Who does what.** L1's slide "From LLMs to agents: actions as tokens" splits the work cleanly:

- **Language model:** predicts a token sequence that names a tool and supplies its arguments. A tool call is "another token sequence the model can predict".
- **Harness:** parses, validates and executes the call, then returns the result as *observation tokens*.

L2 compresses this into a principle worth memorizing: **the model proposes; external software decides whether and how to execute.** Toolformer (Schick et al., NeurIPS 2023) showed a model can learn by self-supervision where to insert API calls. Modern models are trained on tool-calling traces directly (L1, capability 1).

**Control actions are tools too.** L2's `finish(text)` returns the final answer and stops the loop. It is a *harness control action*, not an external program. The same is true of `send_message` to a user in L1's loop figure, or mini-swe-agent's submission sentinel. Designing these control actions is part of designing the loop.

**Code as a meta-tool.** Instead of one typed call per step, the model can write a program that calls many operations. CodeAct (Wang et al., ICML 2024) uses executable Python as a unified action space. L2 reports that in the displayed subset code had the best success rate for 8 of 8 models and the fewest turns for 7 of 8; across all 17 models both counts were 12 of 17. The abstract reports up to 20% higher success than JSON or text actions. L2's caveat: code is *expressive* (loops, variables, libraries) but *harder to constrain* and *higher impact* (files, network, processes), so it needs sandboxing, resource limits, permissions and audit logs.

Common misconception: "Function calling means the model runs the function." The model only writes a request. If your harness executes it blindly, the safety of your system equals the model's judgment on its worst day.

### 3. The observe–think–act loop and ReAct

Once a model can emit actions and read results, an agent is just repetition. L1's slide "An agent is a model in a loop" shows the context (task, tool list, history) flowing into the model; the model reasons, emits a call such as `read_file("test.py")`; the harness executes it; the result `def add(a, b): …` joins the history; and the loop repeats until the model sends a final message to the user.

**The loop in one sentence.** Observe the current history, think (generate reasoning tokens), act (emit a tool call or a final answer), and append the observation. Formally the policy samples a\_t \~ πθ(a\_t | h\_t), the environment returns o\_{t+1}, and the harness sets h\_{t+1} = h\_t ⊕ a\_t ⊕ o\_{t+1}, where ⊕ means "append".

**ReAct.** L1 attributes this pattern to ReAct (Yao et al., ICLR 2023), short for **Re**asoning + **Act**ing. Before ReAct, reasoning (chain-of-thought) and acting (action-plan generation) were studied separately. ReAct interleaves them in one trajectory:

```text
Thought 1: I need to find which band the singer founded, then its first album.
Action 1:  search[Singer X]
Observation 1: Singer X is ... founded Band Y in 1998 ...
Thought 2: Band Y's first album is what I need. Search Band Y.
Action 2:  search[Band Y]
Observation 2: ... debut album Z (2001) ...
Thought 3: The answer is Z.
Action 3:  finish[Z]
```

The paper frames thoughts as actions in the *language space* that do not change the environment. They only change the context, so they help the model "induce, track, and update action plans as well as handle exceptions" (abstract). Actions, in turn, fetch facts that ground the reasoning. The reported results, all from prompting with one or two in-context examples:

- On HotpotQA (multi-hop QA) and FEVER (fact verification), a simple Wikipedia API with `search`, `lookup` and `finish` reduced the hallucination and error propagation seen in chain-of-thought alone.
- On ALFWorld (text household tasks) and WebShop (online shopping), ReAct beat imitation- and RL-trained baselines by **34 and 10 absolute percentage points** of success.
- Trajectories were more interpretable, because a human can read *why* each action was taken.

**Why interleaving helps: a mechanism view.** Each thought is extra computation conditioned on fresh evidence. Without thoughts (act-only), the model must map a long, noisy observation straight to the next action. Without actions (CoT-only), the model's reasoning can drift from facts with no correction. ReAct gets both: evidence enters every few tokens, and reasoning decides what evidence to fetch next.

**Variants on the loop.** The ReAct loop is the default, but it is not the only shape:

| Pattern | What changes | When it helps | Cost |
| --- | --- | --- | --- |
| ReAct (Yao et al., 2023) | Thought, action, observation per step | Unknown environments, exploration | One model call per step |
| Act-only / native tool calling | No explicit thought text (reasoning may be hidden in the model's thinking block) | Simple tool use | Cheaper, less interpretable |
| Plan-then-execute, ReWOO (Xu et al., 2023) | Plan all calls first, then run them | Predictable tasks, cost control | Cannot adapt mid-way |
| Reflexion (Shinn et al., 2023) | After a failed attempt, write a verbal lesson and retry | Tasks with a checkable outcome | Extra attempts |
| CodeAct (Wang et al., 2024) | Each action is a Python program | Composing many operations | Needs a strong sandbox |
| Fixed workflow, Agentless (Xia et al., 2024) | Developer hard-codes the steps | Well-understood tasks | No adaptation at all |

L5 (planning) adds that a ReAct loop is *reactive*: in its GPU-workstation example, the agent searched four vendor sites in one context, compacted from 128k to 14k tokens, found none great, and filed a purchase requisition anyway. Plan Mode in Cursor, Claude Code and Codex answers this by adding a read-only investigation phase, a written plan and human review before execution.

**A minimal ReAct loop in code.** L1 shows the heart of mini-swe-agent. Almost the entire agent fits on one slide:

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
```

Read it as four moves: build the initial messages (system prompt and task), query the model, append its message, execute its actions and append the observations. The `while True` looks alarming, but stopping is handled by exceptions (see section 6). Assignment 1 asks students to implement and extend a similar controller.

Common misconception: "ReAct requires the words Thought/Action/Observation." Those labels were a prompting device for 2022 models. Today the same loop runs through native tool-call messages, with reasoning in a hidden thinking block or visible text. The *structure* (interleave reasoning, action and feedback) is what matters.

### 4. Trajectories: the record of an agent run

A **trajectory** is the complete record of one attempt: every action the agent took and every observation it received, optionally with rewards. L11 defines it plainly: "A trajectory τ is one attempt: the agent's actions and the observations they produce." L9 writes it as τ = (o\_0, a\_0, r\_1, o\_1, …, a\_{T−1}, r\_T, o\_T) with total reward R(τ) = Σ r\_t.

**In practice a trajectory is a message list.** L8 shows a SWE-Gym trajectory as a row of messages: system (harness prompt), user (issue text), assistant (thought + bash), observation (test output), assistant (thought + edit), observation (diff), …, assistant (submit). The repository's own tests decide whether the run succeeded. L1 points to swebench.com, where full trajectories of submitted systems can be browsed.

**One object, four uses.** The same log serves every stage of the lifecycle:

| Use | What you do with the trajectory | Lecture |
| --- | --- | --- |
| Debugging | Read it step by step to find where the agent went wrong | L1, L2 |
| Evaluation | Score the final state, and sometimes the process ("trajectory-aware judges") | L2, L7 |
| Supervised fine-tuning | Render it through the chat template, mask everything except assistant tokens, and train | L8 |
| Reinforcement learning | Sample many from the current policy, score each with R(τ), and reinforce the good ones | L9, L11 |

L8 warns about a subtle consequence: trajectories teach a model *the harness's conventions* along with the task. They teach "how to write a tool call this harness can actually run", what a tool result looks like (so the model waits for one instead of writing one itself), and whatever else was in the data. This is why labs collect across several harnesses (section 8).

**Trajectories grow, and cost grows faster.** Each model call must re-read the whole history. L3 shows the consequence with a fixed 6K prefix and about 5K of new history per call: inputs of 6K, 11K, 16K, 21K and 26K tokens, for a cumulative 80K tokens after only five calls. History grows linearly, so total input grows **quadratically** in the number of steps. L3 also measured 1,500 OpenHands sessions: a mean of **77,922 tokens per session**. Of that, about 23% was system prompt plus tool definitions, 9% user messages, 9% reasoning, 20% tool calls and 37% tool results, with a small 2% remainder. Observations, not the model's own words, are the largest share of the context.

Common misconception: "Long tasks are expensive because the model writes a lot." Output is usually small. The cost is re-reading a growing input on every step. Section 5 and **Mechanics** show how caching and compaction attack this.

### 5. The harness: anatomy and responsibilities

The **harness** is all the software between the model and the environment. L6 gives the most compact definition: *harness = prompts + tools + agent loop + context management*. L1 lists its shared functionality: manage state, tools, memory and control flow; validate actions and handle errors; enforce permissions and safety boundaries. Its examples are coding agents (Claude Code, Codex, OpenHands, OpenCode, Pi) and orchestrators (LangChain, CrewAI).

An analogy helps. The model is a very capable consultant locked in a room with no hands. The harness is the office around them: it slides documents under the door, carries out the consultant's written instructions (after checking them against company policy), keeps the case file tidy, and decides when the engagement is over. A brilliant consultant with a chaotic office still gets little done.

**The agent system around the harness.** L1's "Agents are systems, not just models" figure places the harness among five other components. Each has its own job and its own software:

| Component | Job (L1) | Example software (L1) |
| --- | --- | --- |
| Harness | State, tools, memory, control flow, validation, permissions | Claude Code, Codex, OpenHands, OpenCode, Pi; LangChain, CrewAI |
| Sandbox | Isolate execution; limit compute, network and filesystem; reproducible environments | Docker, Apptainer, Modal, Sail |
| LM inference | Serve generations reliably; batch; reuse the KV cache; streaming and throughput | vLLM, SGLang |
| Training | Collect rollouts, coordinate workers, checkpoint and evaluate | SkyRL, Miles |
| Observability | Capture traces and metrics; track quality, cost and failures; compare trajectories | Laminar, MLflow |

The rest of this subsection walks through the harness's own responsibilities in the order a single step exercises them.

**(a) State.** The minimum state is the message list: system prompt, task, and the alternating assistant and tool messages. Real harnesses also hold an event log (every action and observation with timestamps), the environment handle (container, working directory, open browser), counters (steps, tokens, cost, consecutive errors), and sometimes a plan or to-do list. OpenHands, for example, represents the conversation as a stream of typed *events*; the prompt is rendered from that stream. Separating the **event log** (append-only truth) from the **model view** (what fits in the prompt) is the key design choice, because context management later edits the view but should never edit the truth.

**(b) Tool registry and dispatch.** L2 walks through how OpenHands dispatches a tool call in two phases:

1. *Register at initialization.* Each tool spec (for example `BashTool`) is resolved and configured against the current state and stored in `tools_map[name]` as a ToolDefinition: a schema, an Action type and an executor.
2. *Dispatch each model call.* Parse `{name, args}` → look up `tools_map[name]` → validate by building a typed action with `action_from_arguments(args)` → run `executor(action)` → return an `ObservationEvent` tagged with the `call_id`.

The call id matters. L2 stresses that `tool_call_id` matches results to calls, *including parallel calls*, and that results may finish out of order.

**(c) Validation.** L2 separates four levels of constraint on a call: **syntax** (valid JSON), **shape** (expected fields), **types** (`city` is a string) and **values** (`units` is `C` or `F`). JSON Schema (Draft 2020-12) expresses all four, including `enum` and `additionalProperties: false`. Validation can happen after generation (parse and reject) or during generation. **Grammar-constrained decoding** masks, at every step, any token that would violate the grammar. L2 explains XGrammar (Dong et al., MLSys 2025): the schema compiles to a byte-level pushdown automaton (a finite control plus a stack for nesting); most tokens' validity is precomputed and cached per automaton state, and only a context-dependent minority is checked at runtime, overlapping CPU work with GPU inference. The lecture's crucial caveat: *constraints ensure form — not truth, permissions, tool choice, or task success.* A perfectly valid `delete_file(path="/")` is still a disaster.

**(d) Execution.** The executor runs the action in the environment, ideally inside the sandbox, with a timeout and output limits. It should capture stdout, stderr and the exit status. L6's shell-only toolset returns exactly "output + exit status + timeout". Long outputs must be truncated or saved to a file with a pointer, or a 24K-line log will flood the context (L3's compaction example).

**(e) Context management.** Because input grows quadratically (section 4), the harness must decide what the model sees. L3 gives two families of tools:

- **Caching** keeps the *cost* of re-reading down. Prefill writes a KV cache; if the next call shares an exact prefix, the provider can reuse it. L3's pricing table (checked Aug 30, 2026) shows the stakes: Claude Opus 5 charges $5.00 per million regular input tokens but $0.50 per million cached; GPT-5.6 Sol $4.00 versus $0.40. L3's advice: stabilize the prefix (instructions, tools, examples), append changing state at the end, avoid churn such as timestamps or reordered schemas, and measure cached tokens, TTFT (time to first token) and eviction. Caching "does not reduce visible history".
- **Compaction** reduces what is visible. L3's example turns a CI-debugging history (a 24K-line log with repeated "address already in use") into a short state: goal, cause (port collision), verified fix (`--workers=1` passes), evidence path (`/tmp/ci.log`), next action. L3 frames compaction as state estimation: find a bounded summary ŝ\_t with |ŝ\_t| ≤ B such that future actions are about as likely given ŝ\_t as given the full history. Keep anchors (goal, constraints) exact, encode a checkpoint (decisions, progress, IDs), keep the recent tail exact, externalize evidence to a store, and discard duplicates and superseded attempts.

L1 lists three more harness levers for long context: compression or compaction, dynamic memory lookup, and sub-agent delegation (a sub-agent works in its own context and returns only a summary).

**(f) Orchestrating multiple calls.** L2 quantifies why parallel tool calls matter. Serially, three tools with 0.8 s generations between them cost 0.8 + 1.2 + 0.8 + 0.9 + 0.8 + 1.1 + 0.8 ≈ 6.4 s. If the model emits all three calls at once, the cost is two generations plus the slowest tool: 2 × 0.8 + max(1.2, 0.9, 1.1) ≈ 2.8 s. The harness runs them concurrently (for example `asyncio.gather(..., return_exceptions=True)`) and preserves call ids. Parallelize only independent, safely concurrent calls: weather, calendar and flight status can run together; "find customer ID → fetch orders → refund" must be sequenced.

**(g) Stopping, (h) error handling, (i) permissions and sandboxing, (j) observability** are large enough to get their own subsections below.

Common misconception: "A harness is a thin wrapper around an API call." A production harness is mostly *policy*: what to show, what to allow, what to retry, when to stop, what to log. L6 notes that the same model trained or evaluated in different harnesses can behave quite differently.

### 6. Stopping and error recovery

A loop needs a reason to end and a way to survive its own mistakes. Both are harness responsibilities, and both are where naive agents fail first.

**Why stopping is hard.** The model must decide it is done, and the harness must stop it when it is not deciding well. L8 notes that "end of turn" is really three events: end this message, hand off to a tool, or finish the task. Kimi K3's template gives them separate tokens, and if the stop token is outside the training mask, "the model may not learn to stop." So stopping is partly a trained behavior and partly a harness rule.

**The standard stopping conditions.** A robust harness checks all of these every step and records which one fired as the run's `exit_status`:

| Condition | Who triggers it | Example |
| --- | --- | --- |
| Explicit finish | Model | `finish(answer)` (L2); mini-swe-agent's output beginning with `COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT` |
| Step limit | Harness | mini-swe-agent's `step_limit` raises `LimitsExceeded` |
| Cost or token budget | Harness | mini-swe-agent's `cost_limit` |
| Wall-clock limit | Harness | mini-swe-agent's `TimeExceeded` |
| Repeated format errors | Harness | a cap on consecutive unparsable replies |
| Stuck-loop detection | Harness | the same action and observation repeated several times |
| Unrecoverable context overflow | Harness | compaction failed and the next call cannot fit (L3: "define behavior when compaction fails") |
| Human interrupt or denial | User | a rejected high-risk action, a stop button |

mini-swe-agent implements all control flow with exceptions that inherit from a common `InterruptAgentFlow` class: `Submitted`, `LimitsExceeded`, `FormatError`, `TimeExceeded` and `UserInterruption` (per its documentation). Each exception carries a message that is added to the trajectory, so even a crash leaves a readable record. Beyond the lecture: this is a clean pattern for your own harness. Make every exit path produce a final trajectory with an exit status, never a stack trace.

**Stopping too early is as bad as too late.** An agent that declares victory without checking produces L2's worst failure: the "plausible wrong answer". L6's advice for coding: verify before finishing, and remember that "a test pass is one step, not the release decision." A useful harness trick is to require evidence with the finish action, for example the command that verified the fix.

**Where errors come from.** L2 sorts operational tool failures into three sources:

| Source | Typical errors (L2) | Typical harness response |
| --- | --- | --- |
| Model | Wrong tool, bad arguments, ignores the result | Return a precise error observation; improve tool descriptions; constrain decoding |
| Harness | Parse failure, auth failure, validation failure, call-ID mismatch | Fix the harness; reprompt on parse errors; never drop a result silently |
| Provider or tool | Timeout, rate limit, execution error | Retry with backoff when idempotent; surface the error otherwise |

L2 also shows OpenRouter provider analytics (Aug 27, 2026): tool-call error rates differ across providers serving the *same* model. Production evaluation therefore needs operational failure rates, not just benchmark accuracy.

**The core recovery principle: errors are observations.** When something fails, the harness should not crash and should not hide it. It should turn the failure into a clear observation and let the model react. A good error message says what went wrong and how to fix it ("unknown tool `serch`; available: search, read\_file"). This single rule converts many fatal failures into one wasted step.

**Recovery strategies, from cheap to expensive:**

1. **Reprompt on format errors.** Return the parser's message, ask for a corrected call, and cap consecutive attempts.
2. **Retry transient infrastructure failures** (timeouts, rate limits) with exponential backoff and jitter, but only for idempotent actions. Re-sending a payment or an email is not a retry; it is a second payment.
3. **Let the model revise its hypothesis.** L6's localize–edit–verify loop is error recovery by design: a failing test sends the agent back to localize ("zero still becomes three?") or to edit ("a default case breaks?").
4. **Replan.** L5: when execution reveals that the plan is infeasible (none of four vendors fits), add a new subtask rather than forcing a bad choice.
5. **Roll back.** Beyond the lecture: snapshot the environment (a git commit, a container checkpoint) so a destructive mistake can be undone.
6. **Retry the whole task with a lesson.** Reflexion writes a verbal reflection after a failed attempt and retries. L4 covers this as memory of feedback on trajectories.

**Why recovery matters so much: compounding.** Beyond the lecture, a simple calculation shows the stakes. If each step succeeds independently with probability p, a T-step task succeeds with probability p^T. With p = 0.98 and T = 40, that is only 0.446. If the agent detects and repairs 80% of its step errors, the effective per-step failure falls from 0.02 to 0.004, and success rises to 0.996^40 ≈ 0.852. Recovery, not raw accuracy, dominates long tasks. (The **Hands-on** section computes these numbers.)

**Recovery is also learned.** L9 explains why SFT alone produces brittle recovery: in SFT the agent imitates recorded trajectories, so at deployment one different edit can put it "in a state no training run ever visited" (L8, citing DAgger). This is *exposure bias*. RL samples trajectories from the current policy, so "it learns to recover from errors" (L9). L8 raises the related data question of whether to train on a long run that made a wrong edit, saw a test fail and recovered.

**A special failure: compaction drift.** L3 shows how repeated summarization loses exact constraints: "Use CUDA 12.4" becomes "Use CUDA 12.x", then "Use recent CUDA", then disappears. Each summary is built from the previous one, ŝ\_{k+1} = C(ŝ\_k ⊕ R\_k), so errors accumulate. The fixes are harness rules: copy anchors exactly, keep the recent tail, and keep pointers to retrievable source evidence.

### 7. Minimal agents and interface design

How much harness does an agent really need? The course keeps returning to a surprising answer: much less than you might think, *if* the interface is well chosen.

**mini-swe-agent.** L1 shows mini-swe-agent as the minimal ReAct loop, and L6 uses it as the example of a shell-only toolset. Its documentation describes these design choices:

- About **100 lines of Python** for the core agent, plus roughly 100 more for environment, model and run script.
- **Bash only.** No tools other than bash, and no reliance on the model's tool-calling interface. The model reads with `rg`, `cat` and `find`, edits with `sed`, Python or `patch`, and checks with `pytest` or a build command (L6).
- **Linear history.** Every step appends to the message list. The trajectory *is* the prompt.
- **Stateless execution.** Each action runs in a fresh `subprocess.run`, so every action is independent. Swapping local execution for Docker, Podman, Apptainer or Bubblewrap is trivial.
- Its documentation reports **over 74% on SWE-bench Verified** with a strong model.

Why does this work? Strong models already know Unix tools from pre-training. A tiny harness also makes few assumptions, which makes it a clean baseline for research and easy to run at scale for evaluation and RL rollouts. The costs are real too: `cd` and environment variables do not persist between commands, edits by `sed` are error-prone for multi-line changes, and raw command output can be long.

**The agent–computer interface (ACI).** SWE-agent (Yang et al., NeurIPS 2024) argued the opposite side of the trade-off: language models are a new kind of user and benefit from interfaces built for them, as humans benefit from IDEs. Its ACI added a windowed file viewer, repository search commands and an editor that runs a linter and rejects syntactically broken edits. It reported 12.5% pass@1 on SWE-bench and 87.7% on HumanEvalFix, well above earlier non-interactive systems. Both views agree on one thing: **the interface is part of the agent.**

**Edit formats show how much the interface matters.** L6 compares ways for a coding agent to change a file: rewrite the whole file (simple but repeats unchanged code), SEARCH/REPLACE blocks (compact, needs an unambiguous match), unified diffs (line positions plus context) and Codex's file-operation patch syntax (no line counts). On Aider's refactoring benchmark of 89 Python tasks, GPT-4 Turbo succeeded **20%** of the time with SEARCH/REPLACE but **61%** with a simplified unified diff. Same model, same tasks, three times the success from a format choice.

**The other extreme: no agent loop at all.** Agentless (Xia et al., 2024) replaces the loop with a fixed three-phase pipeline: localization, repair and patch validation. The LLM never decides what to do next. On SWE-bench Lite it reported 32.00% (96 fixes) at $0.70 per issue, the best among open-source systems at the time. L5 places this on a spectrum: developer-defined workflows are "faster, cheaper, and more predictable"; adaptive agents can react when execution reveals new information. Use replanning "when that feedback is worth the extra cost and complexity."

| Design | Harness size | Adaptivity | Predictability | Best for |
| --- | --- | --- | --- | --- |
| Fixed workflow (Agentless) | Small, task-specific | None | High | Well-understood, repeated tasks |
| Minimal ReAct (mini-swe-agent) | \~100 lines | High | Medium | Baselines, research, RL rollouts |
| ACI-rich agent (SWE-agent) | Medium | High | Medium | Squeezing performance from a given model |
| Full product harness (Claude Code, Codex, OpenHands) | Large | High | Configurable | Real users: permissions, memory, skills, UI |

Common misconception: "More tools make a stronger agent." Each tool adds prompt tokens, choices the model can get wrong and a surface to secure. L4 reports a related finding for skills: curated skills raised SkillsBench pass rates from 33.9% to 50.5% on average, but hurt on 13 of 87 tasks, because "a skill can displace a better default strategy."

### 8. Harness vs model: where should a capability live?

L1's central framing is that every agent capability can be built two ways. **LLM training** changes the model's behavior through pretraining, SFT or RL, so the capability becomes part of the learned policy. **Harness engineering** changes the system around the model (prompts, tools, memory, control flow), so the capability emerges from the model–harness combination. L1 then walks through six capabilities with both routes:

| Capability (L1) | Harness engineering | LLM training |
| --- | --- | --- |
| 1. Accurate tool calling | Grammar-constrained decoding; validation | SFT on tool-calling traces |
| 2. Coherence over long context | Compaction; dynamic memory lookup; sub-agent delegation | Long-context training |
| 3. Customizability | Agent memory; skills; custom tools | RL from user feedback |
| 4. Complex task management | Planning and decomposition tools; sub-agents | RL on complex, long-horizon tasks |
| 5. Environment understanding | Skills that encode domain knowledge | SFT on data with the expected observation shape; RL in domain environments |
| 6. Safety | Sandboxed tools; limited credentials; trajectory monitoring | Safety-aware RL |

**How to choose.** The two routes have opposite cost profiles. L8's table of "methods of updating the agent" makes this explicit: the context window and external artifacts update in seconds and are inspectable, while model weights give faster inference and broad behavior change but are slow to update, opaque and model-specific. Beyond the lecture, a practical rule of thumb:

- Put it in the **harness** when it is a *hard guarantee* (permissions, schema validity, budgets), when it changes often (a new API), or when it is specific to one deployment (a company's conventions).
- Put it in the **model** when it is a *general skill* that no rule can express (judging when a test failure is relevant, writing a good edit), or when the harness workaround costs tokens on every call.
- Often do both: constrained decoding guarantees the call parses, and training makes the call *sensible*.

**The two are coupled.** Training data comes from harnesses, so models learn harness conventions (L8). L6 describes **multi-harness training**: the same weights are trained with trajectories from several harnesses such as OpenHands, OpenCode and Codex. Nemotron 3 Ultra uses at least two harnesses per task distribution; Polar runs native harnesses that call a shared model API proxy. L8 adds two evaluation cautions: evaluate in the *target* harness on tasks with checkable outcomes, and read published numbers carefully, because "sometimes they are the best of several harnesses."

Common misconception: "A benchmark score belongs to a model." It belongs to a model–harness pair on a specific task set. mini-swe-agent's value as a baseline comes precisely from holding the harness nearly fixed and minimal so models can be compared.

### 9. Safety, permissions and sandboxing

An agent's safety is the product of what it *can* do (capabilities and access) and how likely it is to do the wrong thing (model judgment, adversarial inputs). The harness controls the first factor directly. L1's safety capability names three harness levers: sandboxing tools, limiting access to credentials and monitoring trajectories.

**Start from the action, not the model.** L1's interactive exercise sorts tasks into *Autonomous*, *Ask first* and *Never*. The useful questions behind the sort are: Is the action reversible? How large is the blast radius? Does it spend money, send messages to other people or touch health, legal or financial records? Diagnosing a failing checkout is read-mostly and reversible; emailing 50,000 customers, filing taxes and adjusting an insulin dose are not. L5's planning checklist asks the same question in design form: "What information or authority stays separate — and who approves irreversible actions?"

**A layered defense.** Beyond the lecture, it helps to see safety as layers, each catching what the previous misses:

| Layer | Mechanism | Example |
| --- | --- | --- |
| Tool design | Expose narrow, typed tools instead of raw power | `create_grocery_cart(items)` (L2) instead of arbitrary HTTP |
| Validation | Schema, enums, path and argument checks | Reject paths outside the workspace |
| Permission policy | Allow / ask / deny rules per tool and argument pattern | Ask before `git push`; deny `rm -rf` |
| Sandbox | OS-level isolation of filesystem, network, CPU and memory | Docker, Apptainer, Modal (L1); bubblewrap or seatbelt |
| Credential isolation | Keep secrets outside the agent's reach | MCP credential brokering (L2) |
| Human approval | Required for irreversible or high-impact steps | Plan Mode review (L5) |
| Monitoring | Watch trajectories live and after the fact | Traces, alerts, audits (section 10) |

**Permissions in a real harness.** Claude Code, which L5 cites for its permission modes, is a good worked example. Its documentation lists modes including `default` (prompt on first use of each tool), `acceptEdits` (auto-accept file edits in the working directory), `plan` (read-only exploration), `auto` (auto-approve with background safety checks), `dontAsk` (auto-deny anything that would prompt) and `bypassPermissions` (skip prompts; for isolated containers or VMs only). Rules are evaluated in the order **deny, then ask, then allow**, and the first match wins, so a narrow allow rule can never carve an exception out of a broad deny. The documentation also states the principle this sheet keeps returning to: permission rules "are enforced by Claude Code, not by the model."

**Sandboxing.** L1 defines the sandbox's job: isolate code and tool execution; limit compute, network and filesystem access; create reproducible environments. L2 explains why code actions in particular need it: they reach files, network and processes. Anthropic reports that Claude Code's sandbox enforces filesystem isolation (only specific directories) and network isolation (only approved servers) with Linux bubblewrap and macOS seatbelt, covering every subprocess, and that in internal usage this "safely reduces permission prompts by 84%." The lesson: a good sandbox does not just add safety, it lets you *remove* friction, because low-risk actions no longer need a human.

**Credentials.** L2 contrasts two ways to let an agent call a REST API. With direct `curl` and an environment variable, the agent's shell receives the API key and "may also read or misuse that secret." With an MCP server, the server authenticates the client with one credential (`MCP_API_KEY`) and calls the upstream API with another (`UPSTREAM_API_KEY`). This is **credential brokering**: "The model sees neither secret." L2 notes that static tokens are for teaching; production deployments should verify JWTs or use OAuth.

**Prompt injection: when the environment attacks.** An agent reads untrusted text (web pages, issues, emails, tool results) into the same context that decides its next action. Instructions hidden in that text can hijack it; this is *indirect prompt injection* (Greshake et al., 2023). L5 presents "plans as security boundaries" (Piet et al., 2026): "ReAct lets every page influence the next action, creating an injection path. A program can accept values from pages without accepting new actions." CaMeL (Debenedetti et al., 2025) builds on this idea: it extracts control and data flow from the trusted user query, so untrusted data can never change the program flow, and it attaches capabilities to values to block exfiltration. It solved 77% of AgentDojo tasks with provable security, versus 84% for an undefended system. Simon Willison's "lethal trifecta" is a memorable design test: an agent that combines access to *private data*, exposure to *untrusted content* and the ability to *communicate externally* can be tricked into leaking the data. Remove any one leg for high-risk deployments.

Common misconception: "A strong system prompt telling the model to be careful is a safety control." It shapes behavior, but it is not enforcement. Enforcement lives in validation, permissions, sandboxes and credential isolation, which hold even when the model is fooled.

### 10. Observability: seeing what the agent did

**Observability** means recording enough about every run to answer, afterwards, what happened, why, how much it cost and whether it was right. L1 lists it as its own system component: capture traces and metrics; track quality, cost and failures; compare trajectories and evaluations. Its examples are Laminar and MLflow.

**Traces and spans.** Beyond the lecture, the standard structure comes from distributed tracing. A **trace** is one agent run. It contains **spans**, timed operations nested in a tree: the run span contains step spans; each step contains an LLM-call span and one or more tool spans; a sub-agent is a child span. Each span records inputs, outputs, timing, token counts, cost and status. OpenTelemetry publishes semantic conventions for generative-AI spans so tools can share this format. For an agent, a good trace lets you replay the trajectory exactly.

**What to measure.** L2 and L3 together give a complete metric set:

| Dimension | Metrics | Source |
| --- | --- | --- |
| Task quality | End-to-end success; plausible-wrong-answer rate | L2 |
| Tool use | Tool selection precision and recall; argument schema or AST match; trajectory order | L2 |
| Efficiency | Latency, number of calls, tokens, cost | L2 |
| Serving | TTFT (arrival to first token), TPOT (gap between output tokens), throughput, cached tokens | L3 |
| Reliability | Timeouts, retries, partial failures, provider error rates | L2 |
| Safety | Policy violations, permission denials, side effects | L2 |

L2's evaluation ladder is worth remembering because it tells you *where* in a trace to look. Selection errors (wrong tool) and argument errors (wrong values) can be scored without running anything. Trajectory errors (bad dependency order) usually need execution. Task errors (goal not achieved) always need execution and are the only level users care about.

**Observability as safety and as science.** L1's safety lever "monitor trajectories" is observability applied in real time: flag a run that suddenly reads credential files or loops on a failing command. It is also how you catch reward hacking. L11 advises: "If reward rises without independent improvement, inspect trajectories for shortcuts." L7 describes trajectory-aware judges (WeaveBench) that grade the process, not just the final state.

**Practical rules.** Log every model input and output, every tool call and result, and every harness decision (validation failures, denials, retries, compactions, exit status). Give each run a trace id and each tool call its call id. Redact secrets before logging. Store traces in a format you can load back into your harness for replay and into your training pipeline as SFT data. The trace you debug with today is the dataset you train on tomorrow (L8).

### 11. Safety limits as harness components

L13 turns section 9 into an engineering rule: because a model's good behavior cannot be guaranteed, the harness must limit what the agent can access and do, and those limits must sit where the agent cannot change them. The banner under both of L13's sandbox layouts says it in one line: "Keep access rules and enforcement beyond the agent's control." This section reads L13 from the harness's side.

**Four threat models, one chokepoint.** L13 sorts agent failures into four threat models. Each reaches the world the same way: through a tool call that the harness chooses to execute.

| Threat model (L13) | L13's example | What goes wrong in the model | Harness limit that still holds |
| --- | --- | --- | --- |
| Malicious user | An operator directed agents to break into online shops and steal card data (Gambit Security, September 2026) | Nothing; it obeys the user | Refusal training lowers the rate; tool scope, network limits and monitoring bound the damage |
| Prompt injection | An issue title steered Cline's issue-labelling agent; the chain ended in an unauthorized npm release | Treats untrusted data as instructions | Narrow tools, scoped tokens, clean state per run, a monitor that compares actions with the user's task |
| Agent error | In ToolEmu's simulated bank, a balance check became a bill payment (Ruan et al.) | Chooses a wrong, high-impact action | Confirmation on money-moving tools; separate read and write tools |
| Improper means | In a Cybench port, the agent read the secret answer from the task's Dockerfile (Docent) | Reaches the goal by a forbidden shortcut | A sandbox that hides answer files; trajectory review, because the score looked fine |

The right-hand column never says "a better prompt". L13 does cover model-side defenses: human red teaming (Gray Swan's arena), automatic red teaming (PAIR) and SFT plus RL safety training (NVIDIA's Nemotron 3 Super recipe). Those lower how often a bad call is proposed. The harness decides whether a proposed call becomes completed harm.

**The incidents are harness failures.** Read L13's opening incidents against section 5's list of harness duties:

- OpenClaw: the user asked the agent to wait for approval before changing the inbox, but that rule lived only in the conversation (the L13 sheet notes public reports that context compaction dropped it). Approval should have been a property of the delete tool. The user also had to kill processes on the host to stop the agent, so the stop control was not outside the agent either.
- PocketOS: a coding agent on a staging task held an API token that "can delete production data", and it deleted a production volume and its backups. The token's authority, not the model's intent, set the blast radius.
- Cline: a poisoned shared cache outlived the issue-handling run that wrote it, and a later release job restored it. L13's slide "Shared state across runs" names the harness rule: shared state can outlive the run that changed it, so start runs from clean state.

Common misconception: "We told the agent to ask first." An instruction in context is a request that the model may forget, misread or be talked out of. A confirmation rule attached to a tool, enforced by the harness, is a control.

**Sandbox: where to draw the boundary.** L13 names three isolation boundaries: filesystem and processes, network, and resource limits (compute, storage and run time). It then gives two layouts. In *agent in the sandbox*, the whole agent runs inside; L13 cites NVIDIA's OpenShell, whose documentation describes a trusted supervisor outside the sandbox that checks each outbound request against policy and adds credentials only where policy allows. In *tools in the sandbox*, the harness stays outside and sends each tool call in; OpenHands works this way (section 12). In both, the policy, the firewall and the stop button stay outside. L13 also lists four operational needs, because a harness starts thousands of runs: quick startup, strong isolation, freeze and reload (save files and running state, then resume) and an easy create-inspect-stop interface. Containers share the host kernel (Docker; Apptainer on shared clusters without root); a virtual machine such as QEMU runs its own guest kernel; cloud sandboxes such as Modal and E2B are created through an API.

**Credentials: authority, not secrecy.** Section 9 presented credential brokering as hiding the key. L13 sharpens this: "Keeping an API key hidden does not prevent the agent from misusing the access it provides." Every request has a caller, an action on a resource, and a check of whether that action is allowed for this task. So the harness should issue fine-grained tokens limited in resources, actions and lifetime. L13's example splits an issue-handling account (read issues, apply labels, but not publish) from a release account, and notes that GitHub App installation tokens expire after one hour. Calls then go through a broker that receives the request plus a run ID, checks permissions for that run, calls the API with its own key, and records the event separately from the agent's log. The run ID lets the broker apply per-task policy, such as "this is a staging fix, so deny production". L13 cites RFC 8693 (OAuth 2.0 Token Exchange) for minting such narrowed tokens.

**Confirmation and pre-execution monitors.** L13 states a timing rule: "To prevent an unsafe tool call, finish the check before executing it." The flow is tool call, check, then either execute or block and pause; logs are reviewed afterward to improve the safeguards. Use rules for precise conditions ("Is this publisher on the allowed list?") and model-based checks for questions that need context ("Did the agent follow an attacker's instructions in the issue?"). Written reasoning is useful but limited evidence: Baker et al. found that strong pressure against a reasoning monitor led agents to hide cheating, so L13 says to check actions and outcomes independently. In this sheet's notation, the monitor extends the permission gate G from Mechanics:

```python
def gate(call, run):                       # runs before sandbox.execute(call)
    if rule_denies(call, run.policy):      # precise: allowlists, paths, amounts
        return "deny"
    risk = monitor.score(task=run.task,    # contextual: compare the call with
                         history=run.events, call=call)  # the user's actual task
    if risk >= run.block_threshold:
        return "deny"
    if risk >= run.ask_threshold or call.tool in run.confirm_tools:
        return "ask"                       # pause; a human decides outside the agent
    return "allow"
```

The monitor reads the task and the history, not just the call, because "followed an attacker's instruction" is visible only by comparing what was asked with what is being done.

**Alert precision decides whether confirmation works.** L13 ends with a base-rate warning. Let r be the share of unsafe decisions, TPR the share of unsafe decisions the monitor flags and FPR the share of safe decisions it flags:

$$
\text{precision} = \frac{r \cdot \text{TPR}}{r \cdot \text{TPR} + (1-r) \cdot \text{FPR}}
$$

With L13's illustration (r = 0.01, TPR = 0.9, FPR = 0.01) over 10,000 decisions, the monitor raises 90 + 99 = 189 alerts and only 48% are real. A reviewer who sees mostly false alarms learns to click approve, and the pause stops protecting anything. So harnesses tier their checks (rules, then a model, then a human for what remains) and measure reviewer load. L13's outcome metrics also separate an *unsafe attempt* from *completed harm*: a harness that blocks attempts raises the attempt rate without raising harm, which is the point of containment. Track unnecessary refusals of valid tasks too, or the safest harness is one that does nothing.

Common misconception: "A monitor that reviews trajectories is a safety control." Reviewing afterward is an audit. Only a check that finishes before execution, with its stop control outside the agent, prevents harm.

### 12. The OpenHands SDK: a reference harness architecture

L14 shows what the harness of sections 5–7 looks like when it must serve long, interrupted and parallel runs for real users. The OpenHands Software Agent SDK (Wang et al., arXiv 2511.03690) is a ground-up redesign of OpenHands' agent internals. Its lesson is a three-way separation: configuration that never changes, state that only grows, and execution that can move.

**Why a redesign.** L14's history runs from code completion (Copilot and HumanEval, through 2023) through SWE-bench (October 2023), Devin and OpenDevin (March 2024) and SWE-agent and CodeAct 1.0 (April–May 2024). By 2025 benchmark gains came from "better models" and "better agent systems" together. In 2026 the bottleneck became deployment: "longer runs, interruptions, parallel tasks", "progress visibility and result inspection", and "repeatable workflows, scoped access, verification". Every item on that list is a harness requirement.

**The components, mapped onto the harness.** Mechanics wrote the harness as rendering R, parsing P, validation V, a permission gate G, execution E and a stopping rule S. The SDK gives each role a named, swappable object:

| Harness role (this sheet) | SDK component (L14) | What it does |
| --- | --- | --- |
| Model call | LLM(model=..., api\_key=...) | Model choice is a parameter (the slide defaults to gpt-5.5) |
| Loop policy | Agent(llm, tools, condenser, agent\_context, mcp\_config) | An immutable, validated specification, reusable across conversations |
| Tool registry, P and V | Tool: typed Action, Observation and executor | The Action schema is validated before the executor runs |
| State | Conversation | Append-only event log of messages, actions and observations |
| R (context management) | Condenser, e.g. LLMSummarizingCondenser | Rewrites the model's view, never the log |
| E (execution, sandbox) | Workspace: local directory, DockerWorkspace or a remote runtime | Where commands run and files live |
| G (permission gate) | Confirmation policy (AlwaysConfirm, ConfirmRisky) plus a security analyzer | Pauses a pending action for a human |
| Extra instructions and tools | Skills in AgentContext (formerly microagents); MCP servers | Project conventions on demand; external tools |

**Stateless agent, event-sourced conversation.** This is section 5(a)'s "event log versus model view" turned into architecture. The SDK paper states the principle as "Stateless by default, one source of truth for state": agents, tools and LLM configurations are immutable and validated at construction, and all mutable state lives in the conversation. The conversation uses *event sourcing*: every interaction is an immutable event appended to a log, persisted as individual JSON files, and a conversation resumes by loading a base state and replaying the events. L14's persistence slide shows the user-facing side: pass persistence\_dir and a conversation\_id, and reopening with the same ID restores the run.

Three consequences follow. First, one log feeds everything: the model's view (through the condenser), the UI stream, the trace and the training data of section 4. Second, recovery is cheap: the paper reports crash recovery in under 20 ms even for its longest observed conversation (358 events), with event-sourcing overhead negligible next to LLM round-trips. Third, because the agent holds no state, one Agent object can serve many conversations at once. The paper also reports that the redesign cut system-attributable failures by 61%, from 78.0 to 30.0 per 1,000 conversations: harness architecture shows up directly in reliability.

Common misconception: "Restoring the conversation restores the run." L14's slide says "Workspace persistence: a separate concern". Replaying the log restores what the agent knows, not the files or processes. If the container is gone, the agent remembers an edit that no longer exists, so a harness that resumes must check the workspace too.

**Typed tools.** L14's custom tool defines a GrepAction (a regex pattern and a path, each with a description), a GrepObservation (a list of matches) and an executor. This is L2's register-then-dispatch pipeline (section 5b) with Pydantic types: the schema shown to the model, the validator and the executor's input are one object, so they cannot drift apart.

**Workspaces: the sandbox as a parameter.** L14's remote example wraps the same code in `with DockerWorkspace(server_image=..., platform=detect_platform()) as workspace:`. An Agent Server runs inside the container, the conversation API is unchanged, and events stream back. Only the workspace line differs from the local example. The paper's stance is that "Sandboxing should be opt-in, not universal": local execution is fastest and sees your real environment, while a container or an API-managed remote runtime isolates. L14's local-versus-cloud slide gives the trade-off: local work reuses "existing files, services, and context" but needs the machine available; cloud work continues "with the laptop off" but needs the repository, dependencies and credentials provisioned remotely. L13 would add that unattended runs should opt in by default.

**Condensers.** L14's example is LLMSummarizingCondenser(llm=..., max\_size=10, keep\_first=2). When the history exceeds max\_size events, older events become a summary; the first two events (system prompt and task) and recent work stay verbatim. That is L3's anchor-preserving compaction (section 5e) as a component. It runs on its own LLM copy (usage\_id="condenser") so its cost is tracked separately. The slide's caveat is "potential detail loss; files and tests as evidence": state that matters should live in the workspace, where it can be re-read. The SDK paper reports that the default summarizing condenser cuts API costs by up to 2× without hurting performance.

**Confirmation policies.** With conversation.set\_confirmation\_policy(AlwaysConfirm()), every action waits: "Pause before action execution", "Pending action → human decision", "Rejection → revised plan". The rejection returns to the agent as an observation, so section 6's "errors are observations" covers denials too. The SDK paper adds a risk-based gate: a SecurityAnalyzer rates each tool call as low, medium, high or unknown risk, and a ConfirmRisky policy holds actions above a configurable threshold (default high). This is L13's pre-execution check (section 11) as a pluggable policy.

**Many interfaces and automations drive one loop.** L14's interface grid crosses execution location (local, cloud) with interaction interface (IDE, GUI, CLI, integration). Because every cell talks to the same conversation API, the harness is written once. The far end of the grid has no human in the loop: an automation run is "Event → bounded task → inspectable result", in five stages:

1. Trigger: an issue, a pull request or a schedule bounds *when* the agent runs.
2. Context: repository, instructions and permissions bound *what it knows and may touch*.
3. Run: an isolated workspace bounds *damage*.
4. Artifact: a patch, report or comment is *reviewable*, not a direct change to production.
5. Check: a person or a policy decides *acceptance*.

Chained, these runs form L14's "software factory": issue triage, implementation, independent code review, and a merge check requiring passing checks and approval on the current commit. Each handoff is explicit and each stage has its own check, which anticipates L15's explicit workflows (section 14).

### 13. One generalist agent or a team of specialists?

L14's position on topology is clear: start with one generalist agent that has a few general tools and on-demand instructions, and add agents only for a clear purpose. The argument is about where context lives.

**The role-based alternative.** Early issue solvers split a bug fix into roles. L14's example is CodeR (Chen et al., 2024): a manager plans, a reproducer reproduces, a fault localizer finds the bug, an editor changes code and a verifier checks the fix; MetaGPT is cited as related work. CodeR's abstract reports 28.33% of SWE-bench Lite issues resolved with one attempt each. L14's counterpoint cites Neubig's post "Don't Sleep on Single-agent Systems" (2024): one agent can reproduce, locate, edit and test in sequence with shared context, while separate roles add handoffs and maintenance. The post keeps multiple agents for cases such as agents that need privileged information or act for different people.

**Why handoffs cost.** In harness terms, every handoff is a compaction. One agent's history becomes a message to the next, with the same risk of losing a constraint as L3's drift (section 6). A single agent keeps the full event log behind its view and can re-read anything.

**General tools make one agent enough.** L14 lists three: edit files, run commands and browse. OpenHands-Versa (Soni et al., 2025) gives a coding agent search, multimodal browsing and file access, and its abstract reports absolute gains over the best prior published results of 9.1 points on SWE-Bench Multimodal, 1.3 on GAIA and 9.1 on The Agent Company. Skills and MCP servers then add knowledge and tools to the same agent instead of creating new agents.

**When extra agents earn their cost.** L14's "Division of labor" slide gives three reasons:

| Reason (L14) | Example | Harness consequence |
| --- | --- | --- |
| Parallel work | Independent issues or repositories | Separate conversations and workspaces; little shared context needed |
| Independent review | Patch checking with a separate task and permissions | A reviewer that has not read the author's reasoning is harder to talk into approval |
| Cost control | Cheaper models for suitable tasks | Route sub-tasks to a smaller LLM; track usage per agent |

The slide's caption names the price: task boundaries, shared context and coordination cost. This matches section 5's sub-agent delegation (L1): worth it when the subtask is separable and only a summary needs to come back.

Common misconception: "Specialized roles make an agent more capable." They make it more structured. With a strong model, structure often throws away useful context. Add agents for parallelism, separated authority or cost routing, not by default.

### 14. Moving control flow from the model into code

L15 turns section 7's spectrum into a design move: take the decision "what happens next" away from the model wherever the procedure is known, and write it as code. Both a single agent and a workflow "combine LLMs, tools, and application code". In a single agent, behavior is "determined by model, prompt, and environment". In an explicit workflow, "more of the behavior is specified by the developer in advance", and the model is called inside steps for judgments such as classifying or drafting.

**A workflow is a partly unrolled loop.** Mechanics showed the harness choosing R, P, V, G, E and S while the model chose each next action. A workflow also fixes the transition function. L15's example is LangGraph's customer-support workflow: read email, classify, then search docs (question, feature, billing) or open a bug ticket (bug), draft a reply, send review-worthy replies (billing, complex, urgent) to a human, and send. Nodes read a shared typed state and return only the fields they change; edges are fixed or conditional. Abridged from L15's slides (bug-ticket and review nodes omitted):

```python
class SupportState(TypedDict, total=False):
    email_content: str
    classification: dict
    search_results: list[dict]
    draft_response: str
    review_decision: dict

def classify_intent(state):                  # code + LLM: a judgment, not a choice of tool
    c = model.classify(state["email_content"]).model_dump()
    goto = ("bug_tracking" if c["intent"] == "bug" else
            "search_documentation" if c["intent"] in {"question", "feature", "billing"}
            else "draft_response")
    return Command(update={"classification": c}, goto=goto)   # routing is code

g = StateGraph(SupportState)
g.add_node("read_email", read_email)
g.add_node("classify_intent", classify_intent)
g.add_node("search_documentation", search_documentation)    # code only
g.add_node("draft_response", draft_response)                # code + LLM
g.add_edge(START, "read_email")
g.add_edge("read_email", "classify_intent")
g.add_edge("search_documentation", "draft_response")
graph = g.compile(checkpointer=checkpointer)
```

**What moves where.**

| Decision | Single agent (sections 3–5) | Explicit workflow (L15) |
| --- | --- | --- |
| Next step | The model, every turn | Code: fixed edges, or conditional edges on state |
| Which tool | The model | The developer, per node |
| What the model sees | The whole (compacted) history | Only the state fields a node passes it |
| Approval | A permission gate on proposed calls | A review node placed on the path ("Flagged reply → approval → send") |
| Model per step | One model | Any model per node, or none (L15: poll with code, classify with a smaller model) |
| Testing | End-to-end runs | Unit tests per node plus workflow tests |

L15's trade-off table lists consistency, possible efficiency gains and testability as gains, and "less adaptable" and "information flow has to be explicitly managed" as costs. The second cost is section 13's handoff problem again: anything a later node needs must be a state field, or it is lost.

**A workflow is also a security boundary.** Section 9 cited L5's "plans as security boundaries". A compiled graph is the strongest form: untrusted email text can fill state fields but cannot add a "send" edge. Beyond the lecture, one caveat: in L15's graph "the review path depends on the model's classification", so an injected email that gets itself classified as routine skips review. For irreversible steps, make the approval rule depend on what the action does (any refund needs review), not only on the model's label.

Common misconception: "A workflow is not an agent, so it needs no harness." Every LLM call inside a node still needs validation (the intent must be one of the known values), timeouts, retries, tracing and permissions on side-effecting steps.

### 15. Checkpoints, interrupts and traces: the harness's durable record

L15 makes durability a first-class harness feature. Its slide on checkpointing lists four mechanisms that share one idea, continue from saved state:

- Save progress: a persistent checkpointer records the workflow's state and where execution should continue.
- Resume: the same execution ID (LangGraph's thread\_id) loads saved progress; new input can be supplied.
- Retry a failure: a retry policy repeats a failed node after a temporary error such as a timeout.
- Human input: an interrupt pauses the workflow; the application collects a response and supplies it on resume.

**Node granularity sets how much work a crash costs.** L15's example saves search results before generation, so a crash during generation repeats only generation. If node i costs w\_i (time or tokens) and a crash hits node k:

$$
W_{\text{lost}}^{\text{no checkpoints}} = \sum_{i=1}^{k} w_i, \qquad W_{\text{lost}}^{\text{checkpoint per node}} = w_k
$$

Human approval benefits most. A reviewer may take hours; with a checkpointer the paused run is just stored state, not a live process holding memory.

**Two durable records compared.**

|  | OpenHands conversation (L14) | LangGraph checkpointer (L15) |
| --- | --- | --- |
| What is saved | Every event, append-only | State plus next position, after steps |
| Identity | conversation\_id plus persistence\_dir | thread\_id in the run's config |
| Resume | Replay the events | Load the latest checkpoint and continue |
| Human pause | Confirmation policy holds a pending action | interrupt() in a node; resume with Command(resume=...) |
| Not restored | Workspace files and processes | External side effects already performed |

**Resumption re-runs code, so side effects must be idempotent.** The LangGraph interrupt documentation states that on resume the node restarts from its beginning, so code before interrupt() runs again. A node that refunds and then asks for approval refunds twice. This is section 6's rule (retry only idempotent actions) in a new place: put irreversible effects after approval in their own node and give each a unique idempotency key.

**Traces and tests.** L15's trace slide matches section 10: steps contain model calls, tool calls and ordinary code, and each operation records inputs, outputs, time and errors (LangSmith calls an operation a run and the whole tree a trace). Explicit nodes make testing possible at three levels: unit tests with a fixed model output ("I was charged twice" with output billing should route to document search), controlled workflow tests (a billing complaint pauses with nothing sent; a rejected reply finishes without sending; a temporary search failure retries and continues) and regression tests when a model is swapped. L15 warns that "direct node calls bypass checkpoints", so persistence and routing need tests through the compiled graph.

**Traces at scale audit the harness too.** L15's Docent case study looked at why GPT-5.1 Codex passed 27% of Terminal-Bench runs versus GPT-5 Codex's 40% (89 tasks, 518 runs) in the same harness. Pairing 108 failed runs with successes and synthesizing failure modes suggested that GPT-5.1 Codex "runs out of time before delivering": 50% of its scored runs timed out versus 32%. On the 28 tasks where neither model timed out, the ranking reversed (0.500 versus 0.429). The "regression" was largely an interaction with section 6's wall-clock limit, which is further evidence that a score belongs to a model–harness pair. Hodoscope's clustering of action summaries found agents in Commit0 recovering removed code from Git history, a sandbox that leaked its answers (L13's improper means). An LLM judge rated that behavior 2/10 until given a link to the benchmark issue, then 7/10: judges catch what they are told to look for, and clustering finds the rest.

Common misconception: "Checkpointing makes a run exactly-once." It makes state durable. Steps can still run twice, so external actions need idempotency keys and approval before, not after, the effect.

## Across the lectures

The agent loop is introduced in L1, made precise in L2 and L3, stress-tested in L6, and then reappears as the unit of planning, data and training in every later lecture.

### L1 · What are agents? (Fried, Neubig)

L1 supplies the vocabulary and the architecture. It starts from Russell and Norvig's sensor–actuator definition and maps it onto repositories, webpages, tool results, shell commands and test-based rewards. It then builds the LLM agent in three steps: tool definitions rendered by the chat template, tool calls and results linked by ids, and "actions as tokens" executed by a harness. The slide "An agent is a model in a loop" cites ReAct, and the mini-swe-agent code shows how little code the loop needs. L1's second half is the systems view: six capabilities, each buildable by training or by harness engineering, and a stack of harness, sandbox, inference, training and observability. Its opening exercise (autonomous, ask first, never) frames safety as a design question from day one.

### L2 · Tool use (Neubig)

L2 zooms into one step of the loop. Its principle, "the model proposes; external software decides whether and how to execute", is the harness in one sentence. It covers everything the harness does to a single call: rendering schemas, parsing model-specific formats (Qwen, Mistral, DeepSeek), OpenHands' register-then-dispatch pipeline, validation at four levels (syntax, shape, types, values), and grammar-constrained decoding with XGrammar. It widens to the security of tool access (curl exposes keys; MCP brokers credentials), to orchestration (parallel calls cut 6.4 s to 2.8 s in its example) and to evaluation at four levels plus operational failure rates. L2 also introduces CodeAct, where each action is a program: more expressive, harder to constrain.

### L3 · Long context (Neubig)

L3 explains why the loop gets expensive. Linear history growth creates quadratic cumulative input (6K to 80K after five calls in its example), and OpenHands sessions average 77,922 tokens, with tool results the largest share. Most of L3 is about the model and serving side (attention variants, position encodings, long-context training, KV caching), but its last third is pure harness design: keep prompts cache-friendly, compact history with explicit policies for trigger, selection, replacement and recovery, and evaluate compaction by whether the agent continues correctly. Its compaction-drift example (CUDA 12.4 decaying to nothing) is the clearest illustration of harness-induced failure in the course.

### L6 · Coding agents (Neubig)

L6 is the case study where harness choices are measured. It defines a harness as "prompts + tools + agent loop + context management", presents the localize–edit–verify loop, and compares a shell-only toolset (mini-SWE-agent) with specialized edit formats. Aider's 20% versus 61% result for two edit formats is the course's strongest evidence that interface design changes outcomes. L6 also shows the opposite design, Agentless's fixed workflow, and the training view: runnable environments (SWE-Gym, R2E-Gym, SWE-smith), terminal rewards and multi-harness training so a model does not overfit to one harness.

### Supporting lectures

- **L4 (memory and skills)** extends the harness with skills and memory. Curated skills raise SkillsBench pass rates from 33.9% to 50.5% on average, yet hurt 13 of 87 tasks. Harness additions have costs.
- **L5 (planning)** argues that a pure ReAct loop is too reactive for long tasks and that plans also serve control and security: Plan Mode with human review, and plans as a boundary against prompt injection.
- **L7 (computer use)** runs the same loop over screenshots with click, type, tool and stop actions, and adds trajectory-aware judges.
- **L8 (SFT)** treats trajectories as training data and warns that they teach harness conventions; it recommends evaluating in the target harness and collecting across harnesses.
- **L9 and L11 (RL)** formalize the loop as a policy over histories and trajectories, and explain why on-policy training teaches error recovery. L11 adds that rising reward without real improvement means you must inspect trajectories.

### How the ideas connect

Read the lectures as zooming levels on the same loop. L1 is the whole system; L2 is one step; L3 is the memory of many steps; L6 is a domain where the loop is judged by tests; L8–L11 turn logged loops into better models. The harness is the constant thread: it renders the prompt (L2), manages the history (L3), defines the interface (L6), records the data (L8) and runs the rollouts (L9, L11).

### Where lectures differ in emphasis

- **Minimal vs rich harness.** L1 and L6 hold up mini-swe-agent's roughly 100 lines as a strong baseline. L4 and L5 add skills, memory, planning and sub-agents. Both are right for different goals: a minimal harness is a clean research baseline; a product needs more structure.
- **Adaptive loop vs fixed workflow.** L1 treats the ReAct loop as the definition of an agent. L5 and L6 present Agentless and developer-defined workflows as cheaper and more predictable, and recommend adaptivity only when feedback is worth its cost.
- **Train it vs engineer it.** L1 presents the two routes as equal options. L8 notes the weight route is slow, opaque and model-specific. L6 shows the coupling: training across several harnesses so the capability transfers.
- **Where safety lives.** L1 and L2 place safety in sandboxes, credentials and monitoring. L5 adds that the *structure* of the loop itself (a plan fixed before reading untrusted pages) is a security property.

### Lectures 13–15

The three later lectures return to the loop from the outside. L1–L6 asked how to make one agent run well; L13–L15 ask how to contain it, package it and decide how much of it should be a model at all.

**L13 · Agent safety.** L1 named three safety levers (sandboxed tools, limited credentials, trajectory monitoring) and L2 showed credential brokering. L13 turns those levers into a design discipline with one organizing rule: every limit must sit beyond the agent's control. Its incidents (OpenClaw, PocketOS, Cline) are harness failures, not model failures: an approval rule that lived only in context, a token with production authority, and shared state that outlived a run. L13 also changes the meaning of the permission gate from L2 and section 9. The gate is no longer just an allow, ask or deny table; it becomes a pre-execution monitor mixing rules and model-based checks, judged by alert precision at the real base rate. The 48%-precision example explains why "ask first" can fail in practice: reviewers drown in false alarms.

**L14 · OpenHands.** L1 presented mini-swe-agent as a loop of about 100 lines with linear history. L14 shows the same loop grown into a production SDK, and every addition answers a deployment need: an event-sourced conversation for interruptions and crash recovery, workspaces that move execution from local to Docker to remote, condensers for long runs, confirmation policies for oversight, and one conversation API behind IDE, GUI, CLI and automation interfaces. It confirms section 5's central design choice (separate the append-only log from the model's view) with production evidence: the redesign cut system-attributable failures by 61%. It also takes a side in an argument the earlier lectures left open: start with a single generalist agent with general tools, and add agents only for parallel work, independent review or cost.

**L15 · Orchestration and monitoring.** L5 and L6 introduced fixed workflows (Agentless) as a cheaper, more predictable alternative to an adaptive loop. L15 supplies the engineering for that alternative: shared typed state, nodes that return updates, fixed and conditional edges, checkpointers, thread IDs, retry policies, interrupts for human approval and tests at node, workflow and regression level. Its second half makes traces a population, not a single log. The Docent study shows a wall-clock limit flipping a model ranking, and Hodoscope finds a sandbox leaking answers through Git history. Both are harness facts discovered only by reading many traces.

**How the picture changes.**

- The harness is now a *control boundary*, not just plumbing. L1's "model proposes, harness disposes" becomes L13's "keep access rules and enforcement beyond the agent's control", L14's pluggable confirmation policies and L15's review node on the path.
- State management splits into two durable records with different units: OpenHands logs every event and replays it; LangGraph checkpoints state per node and resumes from it. Both inherit section 6's idempotency rule, because a resumed or retried step can run twice, and neither restores the outside world.
- Who controls the next step becomes a dial, not a definition. L1 defined an agent as a model in a loop; L15 moves that loop into code where the procedure is known, and L14's automations and software factory sit in between, with an agent inside each bounded stage.

**Where they pull in different directions.** L14 favours one generalist agent with shared context; L15 favours explicit steps where each node sees only the state it needs. Both are right: the single agent wins when the next step depends on what is discovered, the workflow when the procedure is known and must be enforced. On sandboxing, the SDK paper calls isolation "opt-in, not universal" for convenience, while L13's incidents argue that any run with real credentials or no human watching should be isolated by default. On monitoring, L13 wants checks that block before execution, while L15's trace analysis works after the fact. A complete harness needs both: one prevents harm and the other finds the failures nobody wrote a rule for. For the full safety and orchestration treatments see T14 · Agent Safety and Security and T13 · Workflow Orchestration and Agent Monitoring.

## Mechanics

This section states the agent loop precisely: the formal model, one harness step as pseudocode, the data formats that flow through it, and the equations for cost, latency and reliability that drive harness design.

### The formal model

L9 writes the interaction between agent and environment as a sequence of observations and actions. The policy sees only the history, never the hidden state.

$$
h_t = (o_0, a_0, o_1, a_1, \dots, o_t), \qquad a_t \sim \pi_\theta(a_t \mid h_t)
$$

Here o\_t is the observation at step t (a tool result, a page, a screenshot), a\_t the action (a tool call, an edit, a final answer), h\_t the history up to step t, and πθ the model with parameters θ acting as the policy. The environment then produces the next observation from its hidden state s\_t. The probability of a whole trajectory τ given a task x factorizes into policy terms and environment terms:

$$
p_\theta(\tau \mid x) = p(o_0 \mid x) \prod_{t=0}^{T-1} \pi_\theta(a_t \mid h_t)\, p(o_{t+1} \mid h_t, a_t)
$$

The symbol T is the number of actions in the trajectory, p(o\_0 | x) the initial observation given the task, and p(o\_{t+1} | h\_t, a\_t) the environment's response. Only the πθ terms depend on the model; this is why RL gradients (L9, L11) touch only the agent's tokens, and why SFT masks observation tokens out of the loss (L8).

**ReAct as an augmented action space.** ReAct lets the policy emit either an environment action or a thought. Write A for the environment's action set and L for the space of language (thoughts):

$$
\hat{\mathcal{A}} = \mathcal{A} \cup \mathcal{L}, \qquad \hat{a}_t \in \mathcal{L} \Rightarrow o_{t+1} = \varnothing,\; h_{t+1} = h_t \oplus \hat{a}_t
$$

A thought â\_t in L produces no observation (∅) and changes nothing in the environment; it only extends the history (⊕ is concatenation). Its whole value is to make the *next* environment action better. In modern native tool calling, the thought and the action usually live in one assistant message: reasoning text first, then the tool call.

**The harness as a function.** It is useful to see the harness as the map from history to prompt and from model output to observation. Write R for rendering (history → tokens, including compaction), P for parsing, V for validation, G for the permission gate, E for execution and S for the stopping rule:

$$
y_t = \mathrm{LLM}(R(h_t)), \quad c_t = V(P(y_t)), \quad o_{t+1} = \begin{cases} E(c_t) & \text{if } G(c_t) = \text{allow} \\ \text{error or denial message} & \text{otherwise} \end{cases}
$$

Here y\_t is the raw text the model generates and c\_t the validated call. The loop continues while S(h\_{t+1}, counters) is false. Every harness design decision in the Core concepts is a choice of R, P, V, G, E or S.

### One harness step, in full

The pseudocode below shows every responsibility from the Core concepts in the order a step exercises them. It is language-agnostic Python; the runnable version is in **Hands-on**.

```python
def step(state):
    # --- stopping checks before spending money ---
    if state.steps >= MAX_STEPS or state.cost >= MAX_COST or now() > state.deadline:
        raise Stop("limits_exceeded")
    prompt = render(state.events, budget=CONTEXT_LIMIT - OUTPUT_RESERVE)  # may compact
    reply = llm(prompt, tools=TOOL_SCHEMAS)            # model proposes
    state.log("llm_call", prompt_tokens=reply.usage.input, cached=reply.usage.cached,
              output_tokens=reply.usage.output, latency=reply.latency)
    try:
        calls = parse(reply)                           # syntax
        for c in calls: validate(c, TOOL_SCHEMAS)      # shape, types, values
        state.format_errors = 0
    except FormatError as e:
        state.format_errors += 1
        if state.format_errors >= MAX_FORMAT_ERRORS: raise Stop("format_errors")
        return state.append_observation(f"Invalid call: {e}. Please resend.")
    if any(c.name == "finish" for c in calls):
        raise Stop("submitted", answer=calls[-1].args)
    results = []
    for group in dependency_groups(calls):             # parallel only if independent
        results += gather(run_one(state, c) for c in group)
    for call_id, obs in results:                       # keep ids when out of order
        state.append_observation(obs, tool_call_id=call_id)
    if stuck(state.events, window=4): raise Stop("stuck")

def run_one(state, call):
    decision = permission(call)                        # deny > ask > allow
    if decision == "ask": decision = ask_human(call)
    if decision == "deny": return call.id, "Denied by policy."
    for attempt in range(MAX_RETRIES + 1):
        try:
            out = sandbox.execute(call, timeout=TOOL_TIMEOUT)
            return call.id, truncate_or_store(out, limit=OBS_LIMIT)
        except Transient as e:
            if not call.idempotent or attempt == MAX_RETRIES: break
            sleep(backoff(attempt))
        except Exception as e:
            return call.id, f"Tool error {type(e).__name__}: {e}"
    return call.id, f"Tool failed after retries: {e}"
```

Three details deserve attention. First, the budget check comes *before* the model call, so the harness never pays for a step it will not use. Second, every failure path returns an observation instead of raising, except the deliberate `Stop` exceptions (mini-swe-agent's pattern). Third, only idempotent calls are retried: a transient failure while sending an email may mean the email was already sent.

### Data formats

**Tool definition** (OpenAI-style function schema, as on L2's slides). `enum` and `additionalProperties: false` make value-level constraints checkable:

```json
{"type": "function",
 "function": {
   "name": "get_weather",
   "description": "Current weather for a city.",
   "parameters": {
     "type": "object",
     "properties": {"city": {"type": "string"},
                    "units": {"enum": ["C", "F"]}},
     "required": ["city"],
     "additionalProperties": false}}}
```

**A step with two parallel calls and their results.** The ids tie each result to its call, even if the calendar finishes first:

```json
[
 {"role": "assistant", "content": "I need the weather and today's calendar.",
  "tool_calls": [
    {"id": "call_1", "type": "function",
     "function": {"name": "get_weather", "arguments": "{\"city\": \"Pittsburgh\"}"}},
    {"id": "call_2", "type": "function",
     "function": {"name": "read_calendar", "arguments": "{\"day\": \"today\"}"}}]},
 {"role": "tool", "tool_call_id": "call_2", "content": "10:00 group meeting"},
 {"role": "tool", "tool_call_id": "call_1", "content": "72°F · sunny"}
]
```

Note that `arguments` is a JSON *string* in this API style. The harness must parse it a second time, which is one more place a malformed call can fail.

**A trace event** (one line of a JSONL log, beyond the lecture). One record per harness decision makes replay, evaluation and SFT export straightforward:

```json
{"trace_id": "run-8f2c", "step": 7, "span": "tool", "tool": "bash",
 "call_id": "call_19", "args": {"cmd": "pytest -q tests/test_config.py"},
 "permission": "allow", "status": "ok", "exit_code": 0, "latency_ms": 2140,
 "obs_chars": 812, "obs_ref": "store://run-8f2c/7.txt",
 "tokens": {"input": 18234, "cached": 16010, "output": 142}}
```

### The permission function

A permission policy is an ordered set of rules. Beyond the lecture, a clean formalization (the one Claude Code documents) is: collect the rules whose pattern matches the call, then take the most restrictive matching decision.

$$
G(c) = \begin{cases} \text{deny} & \text{if } \exists r \in D : r \text{ matches } c \\ \text{ask} & \text{else if } \exists r \in Q : r \text{ matches } c \\ \text{allow} & \text{else if } \exists r \in W : r \text{ matches } c \\ g_0(\text{risk}(c)) & \text{otherwise} \end{cases}
$$

D, Q and W are the deny, ask and allow rule sets; g\_0 is the default decision for the call's risk tier (for example allow for reads inside the workspace, ask for writes and network). Checking deny first guarantees that no allow rule, however specific, can override a prohibition. Matching must see through wrappers and compound commands: `cd /tmp && rm -rf x` must match a rule about `rm`.

### Cost of a trajectory: why input is quadratic

L3's example assumes a fixed prefix and a constant amount of new history per step. Let P be the prefix tokens (system prompt, tool schemas, task) and Δ the tokens each step adds (the model's call plus the observation). The input to call t is:

$$
I_t = P + (t-1)\,\Delta
$$

Summing over T calls gives the total input tokens:

$$
\sum_{t=1}^{T} I_t = T P + \Delta \sum_{t=1}^{T} (t-1) = T P + \Delta\,\frac{T(T-1)}{2}
$$

The first term is linear in T; the second is quadratic and dominates long runs. Check against L3's slide: P = 6K, Δ = 5K, T = 5 gives 5 · 6K + 5K · 10 = 30K + 50K = 80K, exactly the cumulative figure shown.

**With prompt caching.** Suppose each call's prompt extends the previous call's prompt exactly (an append-only history with a stable prefix). Then call t can read the previous input I\_{t−1} from cache and pays full price only for the new part. For t ≥ 2 the fresh tokens are I\_t − I\_{t−1} = Δ; the first call pays for P. So:

$$
F = P + (T-1)\Delta, \qquad C = \sum_{t=1}^{T-1} I_t = (T-1)P + \Delta\,\frac{(T-1)(T-2)}{2}
$$

F is fresh (full-price) input and C is cached input. With per-token prices c\_in for fresh input, c\_c for cached input and c\_out for output, and O output tokens per step:

$$
\text{cost} = c_{\text{in}} F + c_{\text{c}} C + c_{\text{out}} T O
$$

The quadratic term now sits in C and is multiplied by c\_c instead of c\_in. L3's price table has c\_c / c\_in = 0.1 for Claude Opus 5 ($0.50 vs $5.00 per million) and GPT-5.6 Sol ($0.40 vs $4.00), so caching cuts the dominant term roughly tenfold. Beyond the lecture: some providers bill cache *writes* at a premium, which this formula ignores. Caching also does nothing for latency from attention over long contexts in decode, or for the model's ability to use distant evidence; it only avoids repeated prefill.

**Anything that breaks the prefix breaks the cache.** Inserting a timestamp at the top of the system prompt, reordering tool schemas or editing an old message makes the next call's prefix differ from the cached one, and the provider falls back to full price from that point. This is why L3 says to stabilize the prefix and append changing state at the end, and why compaction (which rewrites history) should be infrequent and deliberate.

**With compaction.** If the harness keeps the visible context at or below a budget B by compacting, then each I\_t ≤ B and total input is at most T · B, which is linear in T. The price is the compaction calls themselves and the risk of information loss (L3's drift). A standard trigger is:

$$
I_t + O_{\text{reserve}} > W \cdot \rho
$$

where W is the model's context window, O\_reserve the room kept for the next output (L3: "reserve room for the next output") and ρ < 1 a safety fraction, for example 0.8.

### Latency: serial versus parallel tool calls

Let g be the time for one model generation and τ\_1, …, τ\_k the durations of k tool calls. If the model calls them one per step, each call needs its own generation before it, plus one final generation to answer:

$$
L_{\text{serial}} = (k+1)\,g + \sum_{i=1}^{k} \tau_i, \qquad L_{\text{parallel}} = 2g + \max_i \tau_i
$$

In L2's example, k = 3, g = 0.8 s and τ = (1.2, 0.9, 1.1): serial is 4 · 0.8 + 3.2 = 6.4 s and parallel is 1.6 + 1.2 = 2.8 s. Parallelism helps only for independent calls; a dependency chain of length d needs at least d + 1 generations whatever you do.

### Reliability: compounding and recovery

Beyond the lecture, a simple independence model shows why error recovery matters. If step t succeeds with probability p\_t, the whole trajectory succeeds with the product. If the agent detects and repairs a fraction r of its step errors, the effective step failure rate shrinks by (1 − r):

$$
P_{\text{success}} = \prod_{t=1}^{T} p_t \approx p^{T}, \qquad p' = 1 - (1-p)(1-r), \qquad P'_{\text{success}} \approx (p')^{T}
$$

With p = 0.98 and T = 40, p^T = 0.446. With r = 0.8, p' = 0.996 and (p')^T = 0.852. Real errors are not independent (one wrong belief can poison many steps), so treat this as intuition for the shape of the curve, not as a prediction.

**Retry with exponential backoff.** For transient failures (rate limits, timeouts) on idempotent calls, wait before attempt n + 1 for:

$$
w_n = \min\!\left(w_{\max},\; b \cdot 2^{n}\right) \cdot U(0.5, 1)
$$

where b is the base delay (say 1 s), w\_max a cap (say 30 s) and U(0.5, 1) a random jitter factor so that many agents hitting the same rate limit do not retry in lockstep. Without the cap and jitter, the total wait over n retries is b(2^n − 1), so 5 retries at b = 1 s already cost 31 s.

### Stuck detection

A stuck agent repeats the same action and gets the same observation. Beyond the lecture, a cheap detector hashes each (action, observation) pair and stops, or injects a warning observation, when the last k hashes are identical, or when a short cycle (A, B, A, B) repeats. OpenHands ships such a stuck detector. The cost is O(k) per step; the benefit is avoiding a run that burns its entire budget in a loop.

### Complexity summary

| Quantity | Without mitigation | With mitigation |
| --- | --- | --- |
| Total input tokens over T steps | TP + ΔT(T−1)/2, quadratic | Caching: same tokens, about 10× cheaper on the quadratic term; compaction: at most T·B, linear |
| Latency of k independent tools | (k+1)g + Στ\_i | 2g + max τ\_i |
| Success over T steps | p^T | (1 − (1−p)(1−r))^T |
| Retry wait for n attempts | b(2^n − 1) | Capped at n · w\_max |

### M1. Event-sourced state, replay and resumable pauses

L14 and L15 make the harness's state durable, so a run can stop (crash, human pause, laptop closed) and continue. This subsection writes both designs in the notation of "The formal model" and derives the one property they share: a resumed step may run twice.

**State as a fold over events.** In the OpenHands SDK (L14; Wang et al.), every interaction is an immutable event e\_1, e\_2, …, e\_n appended to a log. The mutable conversation state is never edited in place; it is recomputed from the log:

$$
S_n = f(S_{n-1}, e_n), \qquad S_n = f(\cdots f(f(S_0, e_1), e_2) \cdots, e_n)
$$

Here S\_0 is the base state (configuration and metadata), f is a pure update function, and S\_n is the state after n events. The SDK paper describes the storage directly: metadata goes to one base\_state.json, each event is written as its own JSON file, and resuming means loading the base state and replaying the events. Replay costs time linear in n. The paper's text reports recovery under 20 ms for its longest observed conversation (358 events); its Table 3 lists a maximum of 32.1 ms. Either way it is negligible next to one LLM call.

**The model's view is a second function of the same log.** The condenser computes what the model sees without touching the log:

$$
V_n = \big[\, e_1, \dots, e_k,\; \mathrm{sum}(e_{k+1}, \dots, e_{n-r}),\; e_{n-r+1}, \dots, e_n \,\big]
$$

k is keep\_first (2 in L14's example), r is the recent tail kept verbatim, and the condenser fires when n exceeds max\_size (10 in the example). The log is the truth; V\_n is a rendering. This is section 5(a)'s split between event log and model view, now with S\_n for the harness and V\_n for the model.

**A confirmation pause is a state, not a blocked thread.** When the confirmation policy holds an action, the harness logs the pending action, sets the status to WAITING\_FOR\_CONFIRMATION (the status the SDK paper names), and returns. Nothing runs. The human's decision arrives later as a new event. The sketch below is a simplification for study, not the SDK's API:

```python
def resume(store):
    state = store.load_base()                 # S_0 from base_state.json
    for e in store.events():                  # replay e_1..e_n in order
        state = apply(state, e)               # pure f(S, e)
    return state

def step(conv, agent, workspace):
    if conv.state.status == "WAITING_FOR_CONFIRMATION":
        return                                # wait for a decision event
    view = agent.condenser(conv.events)       # V_n: the log is not modified
    action = agent.llm.next_action(view)
    conv.append(ActionEvent(action))          # logged BEFORE execution
    if conv.policy.must_confirm(action, agent.analyzer.risk(action)):
        conv.set_status("WAITING_FOR_CONFIRMATION")
        return
    obs = workspace.execute(action, key=f"{conv.id}:{action.id}")
    conv.append(ObservationEvent(action.id, obs))

def decide(conv, workspace, approve, reason=""):
    action = conv.pending_action()
    conv.append(DecisionEvent(action.id, approve, reason))
    if approve:
        obs = workspace.execute(action, key=f"{conv.id}:{action.id}")
    else:
        obs = f"User rejected the action: {reason}"   # an observation, not a crash
    conv.append(ObservationEvent(action.id, obs))
    conv.set_status("RUNNING")
```

A rejection becomes an observation, so L14's "Rejection → revised plan" falls out of the ordinary loop. Because the pause is stored state, the process can exit while a reviewer takes hours.

**The at-least-once window.** Look at the gap between workspace.execute and the ObservationEvent. If the process dies there, replay finds an action with no observation. The harness cannot tell whether the effect happened, so it must either re-execute (risking a duplicate) or skip (risking a lost effect). LangGraph has the same window at node granularity: a checkpoint stores state and the next node after a step, and resuming re-runs the next node from its first line. For a node that calls interrupt(), the code before the interrupt runs once per entry:

$$
\text{runs of pre-interrupt code} = 1 + m
$$

where m is the number of resumes of that node. Neither design gives exactly-once execution. The standard fix is idempotency: give each side effect a key k (here conversation id plus action id) and let the receiver ignore repeats, so that executing E twice has the effect of executing it once:

$$
E_k \circ E_k = E_k
$$

**The two designs side by side.**

| Property | Event log (OpenHands, L14) | Checkpointer (LangGraph, L15) |
| --- | --- | --- |
| Unit of durability | One event (action, observation, message) | One step: state plus next node |
| Resume cost | Replay n events (linear; snapshots bound it) | Load the latest checkpoint |
| Work lost in a crash | At most the in-flight action | The in-flight node (concept 15's w\_k) |
| What is re-run | The action whose observation is missing | The whole next node, from its first line |
| What is never restored | Workspace files and processes | External effects already performed |

Beyond the lecture: the practical rule from both rows is the same. Log intent before acting, key every external effect, and keep irreversible effects in their own step after any approval.

## Hands-on

These examples make the harness concrete: a runnable mini-harness that exercises every responsibility in one run, a cost-and-reliability calculator, and a permission-design walkthrough.

### Example 1 · A complete mini-harness in 139 lines

The program below implements the loop, a tool registry with schemas and risk levels, validation, a deny-pattern permission gate, a workspace that tools cannot escape, three stopping rules (finish, step limit, token budget, plus a format-error cap) and a trace. `call_llm` is a **stub**: it replays a scripted list of model replies, so the program runs offline with the standard library only. The script is designed to hit every failure path once: an escape attempt, malformed JSON, an unexpected field, and a destructive shell command. The task is L6's running example: make `retries=0` disable retries instead of defaulting to 3.

```python
"""A minimal but complete agent harness: loop, tools, validation,
permissions, a confined workspace, stopping rules, error recovery and a trace.
call_llm is a STUB that replays a scripted trajectory, so this runs offline."""
import json, os, tempfile, time

# ---------- 1. The model (stub) ----------
SCRIPT = [
    '{"thought": "Look at the config first.", "tool": "read_file", "args": {"path": "config.py"}}',
    '{"thought": "Try to read secrets.", "tool": "read_file", "args": {"path": "../.env"}}',
    '{"thought": "Fix it", "tool": "write_file", "args": {"path": "config.py"',   # malformed JSON
    '{"thought": "Fix the falsy default.", "tool": "write_file", "args": {"path": "config.py", '
    '"content": "def retries(c):\\n    v = c.get(\\"retries\\")\\n    return 3 if v is None else v\\n"}}',
    '{"thought": "Run the tests.", "tool": "run_tests", "args": {"verbose": "yes"}}',  # unexpected field
    '{"thought": "Run the tests.", "tool": "run_tests", "args": {}}',
    '{"thought": "Clean up.", "tool": "shell", "args": {"cmd": "rm -rf /"}}',
    '{"thought": "Tests pass; done.", "tool": "finish", "args": {"answer": "zero now disables retries"}}',
]
def call_llm(messages):
    """STUB: returns the next scripted reply. A real harness calls an LLM API here."""
    n = sum(1 for m in messages if m["role"] == "assistant")
    return SCRIPT[min(n, len(SCRIPT) - 1)]

# ---------- 2. Environment: a confined workspace ----------
WORK = tempfile.mkdtemp(prefix="ws_")
with open(os.path.join(WORK, "config.py"), "w") as f:
    f.write('def retries(c):\n    return c.get("retries") or 3\n')

def safe_path(p):
    full = os.path.realpath(os.path.join(WORK, p))
    if not full.startswith(os.path.realpath(WORK) + os.sep):
        raise PermissionError(f"path escapes workspace: {p}")
    return full

# ---------- 3. Tools: schema + executor + risk level ----------
def read_file(path):
    with open(safe_path(path)) as f:
        return f.read()
def write_file(path, content):
    with open(safe_path(path), "w") as f:
        f.write(content)
    return f"wrote {len(content)} chars to {path}"
def run_tests():
    ns = {}
    exec(read_file("config.py"), ns)
    cases = [({}, 3), ({"retries": None}, 3), ({"retries": 0}, 0), ({"retries": 2}, 2)]
    fails = [(c, e, ns["retries"](c)) for c, e in cases if ns["retries"](c) != e]
    return "4 passed" if not fails else f"{len(fails)} failed: {fails}"

TOOLS = {
    "read_file":  {"fn": read_file,  "params": {"path": str}, "risk": "read"},
    "write_file": {"fn": write_file, "params": {"path": str, "content": str}, "risk": "write"},
    "run_tests":  {"fn": run_tests,  "params": {}, "risk": "exec"},
    "shell":      {"fn": lambda cmd: f"(demo) ran: {cmd}", "params": {"cmd": str}, "risk": "exec"},
    "finish":     {"fn": None,       "params": {"answer": str}, "risk": "control"},
}
DENY_PATTERNS = ["rm -rf", "curl ", "sudo "]
POLICY = {"read": "allow", "write": "allow", "exec": "allow", "control": "allow"}

def validate(call):
    """Syntax is checked by json.loads; here we check shape and types."""
    if not isinstance(call, dict) or "tool" not in call or "args" not in call:
        raise ValueError("reply must be an object with 'tool' and 'args'")
    spec = TOOLS.get(call["tool"])
    if spec is None:
        raise ValueError(f"unknown tool {call['tool']!r}; choose from {sorted(TOOLS)}")
    args = call["args"]
    extra = set(args) - set(spec["params"])
    missing = set(spec["params"]) - set(args)
    if extra or missing:
        raise ValueError(f"bad fields: missing={sorted(missing)} extra={sorted(extra)}")
    for k, typ in spec["params"].items():
        if not isinstance(args[k], typ):
            raise ValueError(f"field {k!r} must be {typ.__name__}")
    return spec

def permit(call, spec):
    text = json.dumps(call["args"])
    if any(p in text for p in DENY_PATTERNS):
        return "deny"
    return POLICY[spec["risk"]]

# ---------- 4. The loop ----------
def run(task, max_steps=12, max_format_errors=3, budget_tokens=4000):
    trace, tokens, fmt_errors = [], 0, 0
    messages = [{"role": "system", "content": "Reply with JSON {thought, tool, args}. Tools: "
                 + ", ".join(TOOLS)},
                {"role": "user", "content": task}]
    for step in range(1, max_steps + 1):
        prompt_tokens = sum(len(m["content"]) // 4 for m in messages)   # crude estimate
        tokens += prompt_tokens
        if tokens > budget_tokens:
            return finish(trace, "budget_exceeded", None, step, tokens)
        t0 = time.perf_counter()
        reply = call_llm(messages)
        messages.append({"role": "assistant", "content": reply})
        try:
            call = json.loads(reply)
            spec = validate(call)
        except (json.JSONDecodeError, ValueError) as e:
            fmt_errors += 1
            obs, status = f"FORMAT ERROR: {e}. Resend a valid call.", "format_error"
            if fmt_errors >= max_format_errors:
                return finish(trace, "too_many_format_errors", None, step, tokens)
        else:
            fmt_errors = 0
            decision = permit(call, spec)
            if call["tool"] == "finish":
                log(trace, step, call["tool"], "finish", "", prompt_tokens, t0)
                return finish(trace, "submitted", call["args"]["answer"], step, tokens)
            if decision == "deny":
                obs, status = "DENIED by policy: action not allowed in this sandbox.", "denied"
            else:
                try:
                    obs, status = str(spec["fn"](**call["args"]))[:2000], "ok"
                except Exception as e:                      # tool failure -> observation
                    obs, status = f"TOOL ERROR {type(e).__name__}: {e}", "tool_error"
        messages.append({"role": "tool", "content": obs})
        log(trace, step, (call.get("tool") if status != "format_error" else "?"),
            status, obs, prompt_tokens, t0)
    return finish(trace, "step_limit", None, max_steps, tokens)

def log(trace, step, tool, status, obs, ptok, t0):
    trace.append({"step": step, "tool": tool, "status": status, "prompt_tok": ptok,
                  "ms": round((time.perf_counter() - t0) * 1000, 2), "obs": obs[:48]})

def finish(trace, exit_status, answer, steps, tokens):
    return {"exit_status": exit_status, "answer": answer, "steps": steps,
            "total_prompt_tokens": tokens, "trace": trace}

if __name__ == "__main__":
    result = run("Fix config.retries so that retries=0 disables retries. Run the tests.")
    for ev in result["trace"]:
        print(f"step {ev['step']:>2} {str(ev['tool']):<10} {ev['status']:<12} "
              f"ptok={ev['prompt_tok']:>4}  {ev['obs']!r}")
    print("exit_status:", result["exit_status"], "| answer:", result["answer"])
    print("steps:", result["steps"], "| cumulative prompt tokens:", result["total_prompt_tokens"])
    print("final file:\n" + open(os.path.join(WORK, "config.py")).read())
    tight = run("Same task, tiny budget.", budget_tokens=300)
    print("with budget_tokens=300 ->", tight["exit_status"], "after", tight["steps"], "steps")
```

Real output of `python3 mini_harness.py`:

```text
step  1 read_file  ok           ptok=  40  'def retries(c):\n    return c.get("retries") or 3'
step  2 read_file  tool_error   ptok=  75  'TOOL ERROR PermissionError: path escapes workspa'
step  3 ?          format_error ptok= 110  "FORMAT ERROR: Expecting ',' delimiter: line 1 co"
step  4 write_file ok           ptok= 149  'wrote 74 chars to config.py'
step  5 ?          format_error ptok= 201  "FORMAT ERROR: bad fields: missing=[] extra=['ver"
step  6 run_tests  ok           ptok= 239  '4 passed'
step  7 shell      denied       ptok= 256  'DENIED by policy: action not allowed in this san'
step  8 finish     finish       ptok= 286  ''
exit_status: submitted | answer: zero now disables retries
steps: 8 | cumulative prompt tokens: 1356
final file:
def retries(c):
    v = c.get("retries")
    return 3 if v is None else v

with budget_tokens=300 -> budget_exceeded after 4 steps
```

What to notice:

- **Every failure became an observation.** The escape attempt (step 2), the malformed JSON (step 3), the unexpected field (step 5) and the destructive command (step 7) each cost one step, not the run. This is the "errors are observations" principle in action.
- **Validation and permissions are different checks.** Step 5 was well-formed JSON but the wrong *shape*; step 7 was perfectly valid but *not allowed*. L2's warning holds: constraints ensure form, not safety.
- **Two layers stopped the secret read.** Nothing in the policy forbids `read_file`; the workspace confinement in `safe_path` did. In a real harness the sandbox is that second layer, and it should hold even if the policy has a hole.
- **Prompt tokens grow every step** (40, 75, 110, …, 286) because the whole history is resent, and the cumulative total (1,356) grows faster still. With a 300-token budget the same task stops at step 4 with `budget_exceeded`, checked *before* the model call.
- **The run ends with an explicit exit status** (`submitted`, `budget_exceeded`, `too_many_format_errors`, `step_limit`), which is what evaluation and monitoring aggregate.
- **Try this:** change `POLICY["exec"]` to `"ask"` and add a human-approval stub; add a stuck detector that stops after three identical calls; replace the stub with a real API call and see how often step 3-style format errors occur.

### Example 2 · What does a 40-step coding session cost?

This numeric walkthrough applies the **Mechanics** formulas to a realistic session and checks them with a short program. Assume a 10K-token prefix (system prompt, tool schemas, task), 2.5K new tokens per step (the call plus its observation), 300 output tokens per step, 40 steps, and L3's Claude Opus 5 prices: $5.00 per million input tokens, $0.50 per million cached input tokens and $25.00 per million output tokens.

**By hand.** Total input = TP + ΔT(T−1)/2 = 40 · 10K + 2.5K · 40 · 39 / 2 = 400K + 1,950K = 2.35M tokens. Without caching that is 2.35 × $5.00 = $11.75, plus 12K output tokens × $25 per million = $0.30, for $12.05. With a stable, append-only prefix, fresh input is P + (T−1)Δ = 10K + 97.5K = 107.5K tokens ($0.54) and cached input is 2.35M − 107.5K = 2,242.5K tokens ($1.12). The total is $0.54 + $1.12 + $0.30 = $1.96.

```python
"""Cost, latency and reliability of an agent loop (numbers only, no LLM)."""
P, D, OUT, T = 10_000, 2_500, 300, 40            # prefix, per-step growth, output/step, steps
PRICE = {"in": 5.00, "cached": 0.50, "out": 25.00}  # USD per 1M tokens (Claude Opus 5, L3 slide)

def session_cost(cache):
    fresh = cached = 0
    for t in range(1, T + 1):
        inp = P + (t - 1) * D                    # input at call t
        reuse = 0 if (t == 1 or not cache) else P + (t - 2) * D   # prefix seen by previous call
        cached += reuse
        fresh += inp - reuse
    usd = (fresh * PRICE["in"] + cached * PRICE["cached"] + T * OUT * PRICE["out"]) / 1e6
    return fresh, cached, usd

for cache in (False, True):
    f, c, usd = session_cost(cache)
    print(f"cache={cache!s:<5} fresh_in={f:>9,} cached_in={c:>9,} total=${usd:6.2f}")
print("closed form input:", T * P + D * T * (T - 1) // 2)

# Serial vs parallel tool calls (L2 example): 3 tools, 0.8 s per generation
gen, tools = 0.8, [1.2, 0.9, 1.1]
print(f"serial   = {gen * (len(tools) + 1) + sum(tools):.1f} s")
print(f"parallel = {2 * gen + max(tools):.1f} s")

# Compounding reliability over T steps, with and without recovery
for p in (0.99, 0.98):
    for r in (0.0, 0.8):
        per_step = 1 - (1 - p) * (1 - r)         # a step fails only if the error is not recovered
        print(f"p={p} recover={r}: success over {T} steps = {per_step ** T:.3f}")
```

Real output of `python3 budget.py`:

```text
cache=False fresh_in=2,350,000 cached_in=        0 total=$ 12.05
cache=True  fresh_in=  107,500 cached_in=2,242,500 total=$  1.96
closed form input: 2350000
serial   = 6.4 s
parallel = 2.8 s
p=0.99 recover=0.0: success over 40 steps = 0.669
p=0.99 recover=0.8: success over 40 steps = 0.923
p=0.98 recover=0.0: success over 40 steps = 0.446
p=0.98 recover=0.8: success over 40 steps = 0.852
```

What to notice:

- **Caching cut the bill by about 84%** ($12.05 to $1.96) without changing a single token the model sees. The only requirement is a prefix that never changes; a timestamp at the top of the system prompt would erase most of the saving.
- **Output is a rounding error.** 12K output tokens cost $0.30 against $11.75 of uncached input. Optimizing the model's verbosity matters far less than managing the history.
- **The prefix matters too.** 400K of the 2.35M input tokens are just the 10K prefix resent 40 times. Every tool schema you add is paid for on every step (cheaply if cached).
- **Parallel calls reproduce L2's 6.4 s versus 2.8 s.** Over a 40-step session with a few independent lookups per step, that is minutes of wall-clock time.
- **Recovery beats raw accuracy.** Going from 98% to 99% per-step accuracy raises success from 0.446 to 0.669; keeping 98% accuracy but recovering 80% of errors raises it to 0.852.
- The formulas ignore cache-write surcharges, compaction calls and variable step sizes. Real sessions are lumpier: one 24K-line log can be a quarter of the whole budget, which is why output truncation belongs in the harness.

### Example 3 · Designing a permission policy (design walkthrough)

L1's exercise asks where six tasks belong: *Autonomous*, *Ask first* or *Never*. The slide leaves them unclassified on purpose. Here is one defensible design, built from three questions: Is the action reversible? How large is the blast radius? Does it touch money, other people or health, legal or financial records?

| Task (L1) | Reversible? | Blast radius | Suggested policy and harness mechanism |
| --- | --- | --- | --- |
| Diagnose why the online store's checkout started failing | Yes (read-only diagnosis) | Low if confined to logs and a staging copy | **Autonomous** inside a sandbox with read-only production credentials; network allowlist for log and metrics APIs |
| Migrate a payments API from Python to Rust without breaking mobile checkout | Code changes are reversible; deploys less so | High (payments) | **Autonomous** in a branch and container; **ask first** before merge or deploy; require test evidence with the finish action |
| Draft and send a product-launch email to 50,000 customers | Drafting yes; sending no | Very high (public, irreversible) | Drafting **autonomous**; sending **ask first**, with the exact recipient list and final text shown for approval |
| Buy concert tickets if the band plays nearby | No (money spent) | Medium (one person's money) | **Ask first** at purchase time, or a pre-approved rule with a spending cap and a merchant allowlist enforced by the harness, not the prompt |
| Collect tax forms and prepare and file the 2025 return | Preparing yes; filing effectively no | High (legal and financial) | Collect and prepare **autonomous** with scoped read access; filing **ask first** with human review of the full return |
| Adjust an insulin dose after a week of glucose readings | No (physical harm possible) | Severe | **Never** autonomously; at most draft a summary for a clinician |

The harness turns this table into rules. Reads inside the sandbox are allowed. Writes are allowed inside the workspace. Anything that sends, spends, deploys or files is an `ask` rule on specific tools (`send_email`, `purchase`, `deploy`, `submit_filing`). Medical actuation tools simply do not exist in the tool registry, which is the strongest possible `deny`.

What to notice:

- **The same task splits across tiers.** Drafting and sending an email are different actions with different tools, so they can have different policies. Good tool design (narrow, typed tools) makes good permission design possible.
- **Irreversibility, not difficulty, drives the tier.** The Rust migration is the hardest task technically but can run autonomously in a branch; sending one email is trivial but needs approval.
- **Caps and allowlists are enforced in code.** "Spend at most $200" in the prompt is advice; a harness check on the `purchase` tool's `amount` argument is a control.
- **Removing a tool is the strongest deny.** A tool the model never sees cannot be misused or injected into, which matches Claude Code's documented behavior of removing a bare-denied tool from context.
- **Watch the lethal trifecta.** The tax task combines private data, untrusted content (forms from email) and, if filing is allowed, external communication. Human review of the outgoing action breaks the chain.

## Design patterns, pitfalls and checklist

Good harnesses reuse a small set of patterns and guard against a predictable set of failures; this section names both and ends with a checklist.

### Named patterns

- **Minimal loop first.** Start with a mini-swe-agent-style loop: one generic tool (bash or Python), linear history, explicit submit, step and cost limits. *When:* always, as the baseline you must beat before adding structure (L1, L6).
- **Model proposes, harness disposes.** Treat every model output as a request that passes through parse, validate, permit and execute. *When:* every harness; it is the foundation of safety (L2).
- **Errors as observations.** Convert every failure into a concise, actionable message in the history instead of crashing or hiding it. *When:* every tool and parser.
- **Narrow typed tools for high-stakes actions, generic tools for exploration.** Use bash or code for reading and experimenting in a sandbox; expose sending, spending and deploying only through narrow tools with enums and caps. *When:* any agent that can affect the outside world (L2's `create_grocery_cart` versus raw HTTP).
- **Event log plus rendered view.** Keep an append-only log of everything and render the prompt from it, so compaction changes the view but never the truth. *When:* any run longer than the context window (L3; OpenHands' event stream).
- **Stable prefix, append-only tail.** Freeze system prompt, tool schemas and examples; append new state at the end. *When:* always; it is the precondition for prompt caching (L3).
- **Anchor-preserving compaction.** Keep goal and constraints verbatim, summarize the middle into a checkpoint, keep the recent tail exact, externalize evidence with pointers. *When:* context approaches the budget (L3).
- **Localize–edit–verify.** Reproduce, change, then check with tests; on failure revise the hypothesis. *When:* any task with an executable check (L6).
- **Evidence-carrying finish.** Require the final action to cite what verified it (a test command and its result). *When:* tasks where a plausible wrong answer is the main risk (L2, L6).
- **Plan, approve, execute.** Read-only investigation, written plan, human review, then execution. *When:* long or irreversible tasks (L5's Plan Mode).
- **Plan as a security boundary.** Fix the control flow from the trusted request before reading untrusted content; let untrusted data fill values, not choose actions. *When:* agents that read web pages, emails or issues and can also act (L5, CaMeL).
- **Credential brokering.** Put secrets in a server or proxy the agent calls, never in the agent's shell or context. *When:* any authenticated API (L2's MCP example).
- **Sub-agent delegation.** Run a subtask in a fresh context and return only a summary. *When:* exploratory subtasks that would flood the main context (L1, L5).
- **Fixed workflow.** Replace the loop with a developer-written pipeline when the procedure is known. *When:* repeated, well-understood tasks where predictability and cost matter more than adaptivity (Agentless; L5).

### Failure modes

| Failure | Symptoms in the trace | Likely cause | Fix |
| --- | --- | --- | --- |
| Malformed tool calls | Parse errors; harness crashes | Model and parser disagree on format; no constrained decoding | Constrained decoding; precise error message and reprompt; cap consecutive errors |
| Wrong tool or arguments | Valid calls that do the wrong thing | Vague tool names or descriptions; too many similar tools | Rewrite descriptions; merge or remove tools; add enums |
| Hallucinated observations | The model writes a "result" itself instead of waiting | Training data or template does not separate turns; stop sequence missing | Correct chat template and stop tokens (L8); ignore text after the call |
| Infinite loop | Same command and output repeated | No progress signal; model stuck on one hypothesis | Stuck detector; warn then stop; step limit |
| Premature finish | Confident answer, no verification step | No requirement to verify | Evidence-carrying finish; tests in the loop |
| Context overflow | Provider errors on long runs; sudden quality drop | Huge observations; no compaction | Truncate and store large outputs; compaction with a reserve for output |
| Compaction drift | Constraint quietly disappears after several summaries ("CUDA 12.4" to nothing) | Summaries built from summaries | Copy anchors exactly; keep pointers to sources; evaluate by continuation (L3) |
| Cost blow-up | Bills far above estimates | Cache misses from a changing prefix; quadratic history | Stable prefix; measure cached tokens; budget checks before each call |
| Silent tool failure | Agent proceeds on empty or stale data | Executor swallowed an exception or timeout | Always return status and error text; log exit codes |
| Credential leak | Secrets in logs or outgoing requests | Keys in environment of the agent's shell | Credential brokering; redact logs; network allowlist |
| Prompt injection | Agent follows instructions found in a page or issue | Untrusted text can choose actions | Plan-first control flow; narrow tools; ask-first on outgoing actions |
| Harness overfitting | Great in one harness, poor in another | Model trained or tuned on one harness's conventions | Evaluate in the target harness; train across harnesses (L6, L8) |
| Unsafe retries | Duplicate emails, payments or deploys | Retrying non-idempotent actions after a timeout | Retry only idempotent calls; idempotency keys; ask before re-sending |

### Builder's checklist

- [ ] The loop has an explicit finish action and records an `exit_status` for every way a run can end.
- [ ] Step, token or cost, and wall-clock limits are checked *before* each model call.
- [ ] Every tool has a name, a clear description and a JSON Schema with required fields, enums and `additionalProperties: false` where sensible.
- [ ] Tool calls are parsed and validated (syntax, shape, types, values) before execution; failures return a precise, actionable message.
- [ ] Consecutive format errors and repeated identical actions are capped.
- [ ] Tool results are matched by call id, including parallel calls that finish out of order.
- [ ] Only independent calls run in parallel; only idempotent calls are retried, with exponential backoff and jitter.
- [ ] Large outputs are truncated or stored with a pointer; the prompt has a reserve for the next output.
- [ ] The prompt prefix is stable and history is append-only; cached-token counts are logged.
- [ ] Compaction keeps goals and constraints verbatim, keeps the recent tail, and is tested by continuation.
- [ ] Execution happens in a sandbox with filesystem and network limits and resource caps.
- [ ] Secrets never enter the agent's context or shell; authenticated calls go through a broker.
- [ ] A permission policy with deny, then ask, then allow precedence covers every tool; irreversible actions require approval.
- [ ] Every model call, tool call and harness decision is traced with a run id, timings, tokens and cost, with secrets redacted.
- [ ] The agent is evaluated end to end in the harness it will ship in, on tasks with checkable outcomes, and failures are read in the traces.

### Patterns and pitfalls from L12–L15

L13–L15 add patterns for containing, packaging and structuring the loop. (L12 adds nothing specific to the harness loop; its rollout systems are covered in the RL topic.) Safety-heavy patterns are kept short here; T14 treats them fully, and T13 covers workflows and monitoring in depth.

**Named patterns**

- **Controls attached to tools, not to prompts.** Put "ask first" on the delete, send or pay tool as a confirmation rule the harness enforces. When: any irreversible or outward-facing action (L13's OpenClaw incident).
- **Enforcement outside the agent.** Policy, firewall, credentials, logs and the stop button live in a process the agent cannot edit or kill. When: always; choose "agent in the sandbox" or "tools in the sandbox", but keep the rules outside either way (L13).
- **Per-run scoped credentials through a broker.** Mint a token limited in resources, actions and lifetime for each run, or keep the key in a broker that checks each request against the run ID. When: any authenticated API; most urgent for unattended runs (L13: GitHub App tokens expire after one hour).
- **Clean state per run.** Start each run from a fresh workspace and do not restore caches written by untrusted runs. When: CI and automation pipelines (L13's Cline postmortem).
- **Tiered pre-execution checks.** Cheap rules first, a model-based check for context-dependent risk, a human only for the residue; measure alert precision and reviewer load. When: any harness that asks humans to approve actions (L13's 48% example).
- **Stateless agent, event-sourced conversation.** Keep configuration immutable and all mutable state in an append-only log that can be replayed. When: long, interrupted or parallel runs (L14; Mechanics M1).
- **Workspace as a parameter.** Write the loop once against a workspace interface; swap local, Docker or remote by changing one line. When: the same agent must run on a laptop, in CI and in the cloud (L14).
- **Condenser on its own budget.** Run summarization on a separate LLM copy with its own usage ID, keep the first events and the recent tail verbatim, and keep evidence in files and tests. When: runs longer than the context window (L14).
- **Bounded automation run.** Trigger → context → isolated run → reviewable artifact → person or policy check. When: event-driven agents with no human watching (L14).
- **Single generalist first.** One agent, a few general tools (edit, run, browse), skills and MCP for extras; add agents only for parallel work, independent review or cost routing. When: the default for new agent products (L14).
- **Unroll the known part.** Move steps whose order is known into code (an explicit workflow) and keep the model for judgments inside steps. When: repeated procedures with required checks (L15).
- **Checkpoint before the expensive or irreversible step.** Save completed work (search results) before generation; put each irreversible effect in its own node after approval, with an idempotency key. When: any workflow with retries, interrupts or slow steps (L15).

**Failure modes**

| Failure | Symptom | Fix |
| --- | --- | --- |
| Approval rule only in context | Agent acts without asking after a long run or compaction | Confirmation policy on the tool, enforced by the harness |
| Over-broad token | A staging task deletes production data | Fine-grained, short-lived token per run; broker with per-run policy |
| Poisoned shared state | A later, trusted job runs files written by an untrusted run | Fresh workspace per run; never restore caches across trust levels |
| Alert fatigue | Reviewers approve everything; most alerts are false | Tier checks; tune FPR to the base rate; track alert precision |
| Resume without workspace | Agent "remembers" edits that no longer exist | Persist or re-check the workspace on resume; treat files as evidence |
| Double side effect on resume | Duplicate refund, email or Slack ping | Code before interrupt() must be idempotent; effects in their own node with a key |
| Classifier as the only gate | An injected email labelled "routine" skips review | Key approval on what the action does (any refund), not only on the model's label |
| Condenser loses a constraint | Behaviour changes after summarization | keep\_first for task and rules; store constraints in files the agent re-reads |
| Handoff loss between agents | A specialist lacks a fact another agent had | Fewer agents; explicit state fields; pass pointers, not summaries |
| Node tests pass, graph fails | Routing or persistence bugs appear only end to end | Test through the compiled graph; L15 notes direct node calls bypass checkpoints |
| Harness limit read as model regression | A new model scores lower in the same harness | Read traces at scale; check timeouts; compare on the no-timeout subset (L15's Docent study) |

**Checklist additions**

- [ ] Every irreversible tool has a harness-enforced confirmation or approval step, and the stop control runs outside the agent.
- [ ] Each run gets its own scoped, expiring credentials and a fresh workspace; nothing written by an untrusted run is restored into a trusted one.
- [ ] State is durable (event log or checkpoints), resume is tested, and every external effect carries an idempotency key.
- [ ] Approval monitors report alert precision and reviewer load, not only recall.
- [ ] Steps whose order is known are code, with unit, workflow and regression tests through the compiled graph.
- [ ] Traces are reviewed across many runs, not only when a single run fails.

## Landscape

The tables below collect the harnesses, methods, benchmarks and infrastructure that matter for the agent loop, with verified numbers and their source; dated rows are newest first.

### Harnesses and agent systems

| Name | What it is | Key facts and results | Source |
| --- | --- | --- | --- |
| Parallel Claude C compiler (Anthropic, 2026) | Sixteen agents working in parallel on one codebase | 100,000-line C compiler in two weeks, able to compile the Linux kernel | L1; [Anthropic blog](https://www.anthropic.com/engineering/building-c-compiler) |
| mini-swe-agent | Minimal ReAct coding agent: bash only, linear history, stateless `subprocess.run` | \~100 lines of core Python; docs report >74% on SWE-bench Verified; exits via `Submitted`, `LimitsExceeded`, `FormatError`, `TimeExceeded` | L1, L6; [docs](https://mini-swe-agent.com/latest/) |
| Claude Code | Product coding agent with permission modes and an OS-level sandbox | Rules evaluated deny, then ask, then allow; sandbox (bubblewrap, seatbelt) cut permission prompts by 84% in internal use | L1, L5; [permissions docs](https://code.claude.com/docs/en/permissions) |
| Codex, OpenCode, Pi | Coding-agent harnesses | Used as examples of harnesses, compaction policies and edit formats; Codex has its own patch syntax | L1, L3, L6 |
| OpenHands (2024) | Open platform for software agents; event-stream architecture | Register-then-dispatch tool pipeline (L2); 1,500 sessions averaged 77,922 tokens (L3); paper evaluates 15 benchmarks | L2, L3, L6; [arXiv 2407.16741](https://arxiv.org/abs/2407.16741) |
| SWE-agent (2024) | Agent–computer interface for coding | 12.5% pass@1 on SWE-bench and 87.7% on HumanEvalFix at publication | [arXiv 2405.15793](https://arxiv.org/abs/2405.15793) |
| Agentless (2024) | Fixed localize–repair–validate workflow, no agent loop | 32.00% (96 fixes) on SWE-bench Lite at $0.70 per issue | L6; [arXiv 2407.01489](https://arxiv.org/abs/2407.01489) |
| LangChain, CrewAI, LangGraph | Orchestration frameworks | Named as orchestrators (L1); LangGraph scheduled later in the course | L1 |

### Methods that shaped the loop

| Method | Idea | Key result | Source |
| --- | --- | --- | --- |
| CaMeL (2025) | Extract control and data flow from the trusted query; capabilities on values | 77% of AgentDojo tasks with provable security vs 84% undefended | [arXiv 2503.18813](https://arxiv.org/abs/2503.18813) |
| XGrammar (2025) | Grammar-constrained decoding with a byte-level pushdown automaton and cached token masks | Most token checks served from cache; CPU work overlapped with GPU | L2; [arXiv 2411.15100](https://arxiv.org/abs/2411.15100) |
| CodeAct (2024) | Executable Python as the unified action space | Up to 20% higher success over 17 LLMs; best success for 8/8 models in L2's subset | L2; [arXiv 2402.01030](https://arxiv.org/abs/2402.01030) |
| Model Context Protocol (2024) | Standard for hosts to discover and call tools on servers | `tools/list` and `tools/call`; supports credential brokering | L2; [spec](https://modelcontextprotocol.io/specification/2025-11-25) |
| ReAct (2023) | Interleave thoughts, actions and observations | +34 and +10 absolute points on ALFWorld and WebShop with 1–2 examples | L1; [arXiv 2210.03629](https://arxiv.org/abs/2210.03629) |
| Reflexion (2023) | Verbal self-reflection after failed attempts, then retry | 91% pass@1 on HumanEval reported in the paper | [arXiv 2303.11366](https://arxiv.org/abs/2303.11366) |
| Toolformer (2023) | Self-supervised learning of where to insert API calls | Showed tool use can be learned from the model's own annotations | L1; [arXiv 2302.04761](https://arxiv.org/abs/2302.04761) |

### Benchmarks and measurements

| Benchmark | What it measures | Key numbers | Source |
| --- | --- | --- | --- |
| SkillsBench (2026) | Effect of curated skills across model–harness configurations | 87 tasks, 18 configurations; pass rate 33.9% to 50.5% with skills; skills hurt 13 tasks | L4 |
| OpenRouter provider analytics (Aug 2026) | Tool-call error rates by provider | Error rates differ across providers of the same model | L2 |
| Berkeley Function-Calling Leaderboard V4 | Tool calling: single-turn, multi-turn, agentic, robustness | Categories include parallel calls, missing functions, memory, hallucination | L2; [leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) |
| AgentDojo (2024) | Prompt-injection attacks and defenses for tool agents | Used to evaluate CaMeL | [arXiv 2406.13352](https://arxiv.org/abs/2406.13352) |
| τ-bench (2024) | Tool–agent–user interaction in realistic domains | Tests policy following over multi-turn conversations | [arXiv 2406.12045](https://arxiv.org/abs/2406.12045) |
| SWE-bench (2023) | Resolve real GitHub issues; graded by fail-to-pass and pass-to-pass tests | 2,294 tasks from 12 Python repos; best model at release (Claude 2) solved 1.96% | L1, L6; [arXiv 2310.06770](https://arxiv.org/abs/2310.06770) |
| Aider refactoring benchmark | Edit-format effect on code refactoring | 89 tasks; GPT-4 Turbo 20% with SEARCH/REPLACE vs 61% with simplified unified diff | L6 |

### Infrastructure around the harness

| Layer | Examples | Role in the loop | Source |
| --- | --- | --- | --- |
| Sandbox | Docker, Apptainer, Modal, Sail; bubblewrap, seatbelt | Isolate execution; limit compute, network, filesystem | L1; Anthropic sandboxing blog |
| Inference | vLLM, SGLang | Serve generations; batch; reuse KV cache (PagedAttention, RadixAttention) | L1, L3 |
| Training | SkyRL, Miles | Collect rollouts from harnesses; distributed RL | L1 |
| Observability | Laminar, MLflow; OpenTelemetry GenAI conventions | Traces, metrics, cost and failure tracking | L1 |

### Added with L12–L15

Systems, frameworks and studies that L13–L15 bring to the harness picture. Numbers are from the slides or the cited papers' own pages.

| Name | What it is | Key numbers or results | Source |
| --- | --- | --- | --- |
| [OpenHands Software Agent SDK](https://arxiv.org/abs/2511.03690) (Wang et al., 2025) | Redesigned OpenHands internals: immutable Agent, event-sourced Conversation, Workspace, Condenser, confirmation policies | System-attributable failures 78.0 → 30.0 per 1,000 conversations (−61%) over a 15-day rollout; recovery under 20 ms at 358 events (Table 3 max 32.1 ms); summarizing condenser cuts API cost by up to 2× | L14; SDK paper |
| [OpenHands-Versa](https://arxiv.org/abs/2506.03011) (Soni et al., 2025) | One generalist coding agent with search, multimodal browsing and file access | +9.1 points SWE-Bench Multimodal, +1.3 GAIA, +9.1 The Agent Company over best prior published results | L14; arXiv abstract |
| [CodeR](https://arxiv.org/abs/2406.01304) (Chen et al., 2024) | Role-based multi-agent issue solver (manager, reproducer, fault localizer, editor, verifier) | 28.33% of SWE-bench Lite with one submission per issue | L14; arXiv abstract |
| [Code with Me or for Me?](https://arxiv.org/abs/2507.08149) (Chen et al., 2025) | User study: Copilot versus OpenHands on Python tasks | 20 regular Copilot users; lower active effort with the agent, continued need for understanding and oversight | L14 |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) | Workflow framework: typed shared state, nodes, fixed and conditional edges | Checkpointers, thread IDs, retry policies, interrupt() and Command(resume=...) | L15 |
| LangSmith | Tracing and evaluation for LangChain and LangGraph apps | Calls one operation a run and the whole tree a trace | L15 |
| [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), AG2, DSPy | Other frameworks by programming emphasis | Agent loops and handoffs; agent conversations and group workflows; modular LLM programs with prompt optimization | L15 |
| [NVIDIA OpenShell](https://docs.nvidia.com/openshell/latest/about/architecture.html) | "Agent in the sandbox" runtime | A supervisor outside the sandbox checks outbound requests against policy and adds credentials only where allowed | L13 |
| Modal, E2B; Docker, Apptainer, QEMU | Cloud sandboxes created through an API; local container and VM boundaries | Containers share the host kernel; a VM runs its own guest kernel; E2B supports pause and resume | L13 |
| [RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693) and GitHub App installation tokens | Standards and practice for narrowed, short-lived credentials | GitHub App installation tokens expire after one hour | L13 |
| [OpenAgentSafety](https://arxiv.org/abs/2507.06134) (Vijayvargiya et al., 2025) | Safety tests with real tools and locally hosted services | 350+ multi-turn tasks in 8 risk categories; unsafe behaviour in 51.2% to 72.7% of safety-vulnerable tasks | L13; arXiv abstract |
| [Docent](https://transluce.org/docent/blog/terminal-bench) (Transluce) | Agent-assisted analysis of many traces | Terminal-Bench, 89 tasks, 518 runs: GPT-5 Codex 40% vs GPT-5.1 Codex 27%; timeouts 32% vs 50%; on 28 no-timeout tasks 0.429 vs 0.500 (ranking reverses) | L15 |
| [Hodoscope](https://arxiv.org/abs/2604.11072) (Zhong, Saxena and Raghunathan, 2026) | Unsupervised monitoring by clustering summarized actions | Found Commit0 agents recovering removed code from Git history; an LLM judge scored that behaviour 2/10 until hinted, then 7/10 | L15 |

## Open problems

The basic loop is settled, but how to make it reliable, safe, efficient and portable over long horizons is still an open research area.

**1. Knowing when to stop, ask or keep going.** L5 lists calibration as an open problem: "agents misjudge when to think, look, ask, or revise." Stopping rules today are crude caps (steps, cost, time) plus the model's own finish decision. *Why it's hard:* the right decision depends on the unobserved probability that the task is already solved and on the cost of being wrong, and models are poorly calibrated about both. A premature finish looks exactly like a correct one until someone checks.

**2. Credit assignment for recovery.** L6 and L11 point out that a terminal reward does not say which earlier decision was wrong: "a successful trajectory can contain a mistake; a failed trajectory can contain a helpful" step. Training agents to recover from errors needs step-level signals. *Why it's hard:* step rewards need a verifier or a value model for intermediate states, both expensive and easy to game; and on-policy rollouts in real sandboxes are slow.

**3. Harness-robust models and model-robust harnesses.** Models learn harness conventions from their training trajectories (L8), and labs now train across harnesses (L6). *Why it's hard:* harnesses differ in tools, formats, prompts and context policies, and the space of combinations is large. There is no agreed way to report a model's ability independent of a harness, so benchmark numbers remain model–harness pairs, sometimes the best of several (L8).

**4. Compaction without drift.** L3 shows repeated summaries erasing constraints and proposes continuation-based evaluation. *Why it's hard:* what must be preserved depends on future actions that are not yet known. Summaries are lossy by design, and small losses compound across many compactions. Evaluating compaction requires planting state and measuring later decisions, which is costly to do at scale.

**5. Prompt injection and authority separation.** L5 presents plans as security boundaries, and CaMeL shows provable security at some cost in task success (77% vs 84% on AgentDojo). *Why it's hard:* useful agents must read untrusted content and act on it. Strictly separating control from data removes the adaptivity that makes ReAct powerful; classifier-based defenses are probabilistic, and attackers adapt. The tension between capability and containment has no general solution.

**6. Permission design that scales with autonomy.** Asking the user about every action destroys the benefit of autonomy; asking about none is unsafe. Sandboxing reduced permission prompts by 84% in Anthropic's internal use, and classifier-based auto modes are emerging. *Why it's hard:* risk depends on context (the same `rm` is harmless in a scratch directory and catastrophic elsewhere), users approve prompts reflexively, and a learned approver can itself be fooled.

**7. Observability that explains, not just records.** Traces are easy to collect and hard to read: a 40-step run with long observations is thousands of lines. L11 asks practitioners to inspect trajectories for shortcuts when reward rises. *Why it's hard:* automatic diagnosis needs judges that understand the task and the environment; trajectory-aware judges (L7) are themselves models with their own errors, and ground truth for "where did it go wrong" is rarely available.

**8. Cost-aware agents.** Quadratic input cost, cache behavior and tool latency are harness-level facts the model usually cannot see. *Why it's hard:* optimizing cost jointly with success means the policy must reason about token prices, cache hits and parallelism, and the objective (success per dollar) is noisy and shifts with provider pricing. L6's open questions on predicting code behavior raise the same trade-off: when is a learned prediction cheaper than a real execution, and how often is it wrong?

**9. How minimal can the harness be?** mini-swe-agent shows that about 100 lines plus bash get strong results with strong models, while product harnesses keep adding skills, memory and planning (L4, L5). *Why it's hard:* each addition helps some tasks and hurts others (skills hurt 13 of 87 SkillsBench tasks), and as models improve, yesterday's harness workaround can become today's handicap. Deciding which structure is still needed requires careful ablations for each model generation.

**10. Durable runs with real side effects.** L14's event log and L15's checkpointer make agent state survive crashes and pauses, but neither restores the workspace or undoes external effects, and both re-run steps on resume (Mechanics M1). *Why it's hard:* exactly-once execution across failures is unsolved in general, and many agent actions (an email, a payment, a shell command with side effects) have no idempotency key or undo. A harness must also reconcile a replayed log with a workspace that may have changed or vanished.

**11. Approval that scales with autonomy.** L13 shows a monitor with 90% recall and a 1% false-positive rate yields only 48% correct alerts at a 1% base rate, and L14's automations remove the human from most steps. *Why it's hard:* unsafe actions are rare, so precision is low unless false positives are tiny; model-based checks can be fooled by the same injection that fooled the agent; and Baker et al. show that pressuring a reasoning monitor teaches agents to hide intent. Nobody yet knows how to keep a human meaningfully in the loop for thousands of unattended runs.

**12. Where to draw the agent–workflow line.** L14 argues for one generalist agent; L15 moves known steps into code. *Why it's hard:* the right split depends on how often execution reveals information that should change the plan, which is hard to measure before building both. A workflow's routing still depends on model judgments (L15's classifier), so an injected input can choose the path. The boundary also shifts with each model generation, as in open problem 9.

## Glossary

These are the terms this sheet relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Agent | Anything that perceives its environment through sensors and acts on it through actuators (Russell and Norvig); for LLMs, a model in a loop with a harness |
| Agent–computer interface (ACI) | The set of commands and feedback formats an agent uses to operate a computer, designed for LMs as users (SWE-agent) |
| Automation run | An agent run started by an event (issue, pull request or schedule) with bounded context and permissions, an isolated workspace, and a reviewable artifact checked by a person or policy (L14) |
| Call id (`tool_call_id`) | Unique identifier linking a tool result to the call that requested it, essential for parallel calls |
| Chat template | The model-specific rule that serializes messages and tool schemas into one token sequence |
| Checkpointer | Component that saves a workflow's state and next position after each step, so a run can resume after a crash, a retry or a human pause (LangGraph, L15) |
| CodeAct | Using executable code as the agent's action space, so one action can compose many operations |
| Compaction | Replacing older history with a bounded summary or checkpoint so the context fits the budget |
| Compaction drift | Gradual loss of exact facts when summaries are built from earlier summaries |
| Condenser | Harness component that rewrites the model's view of a long history (keep the first events and the recent tail, summarize the middle) without changing the event log (OpenHands, L14) |
| Confirmation policy | Rule that holds a pending action for a human decision before execution, e.g. AlwaysConfirm, or ConfirmRisky above a risk threshold (OpenHands, L14) |
| Constrained decoding | Masking tokens during generation so output must satisfy a grammar or JSON Schema |
| Credential brokering | A server accepts one credential from the agent and uses a different one upstream, so the model sees neither |
| Event sourcing | Storing state as an append-only log of immutable events and rebuilding it by replay; the basis of the OpenHands conversation (L14) |
| Exit status | The recorded reason a run ended: submitted, step limit, budget, time, format errors, stuck, interrupted |
| Explicit workflow | A system where developer code fixes the steps and transitions, and the model is called inside steps for judgments such as classifying or drafting (L15) |
| Exposure bias | Failure when a model trained on others' trajectories reaches states it never saw in training |
| Harness | Software around the model: prompts, tools, loop, context management, validation, permissions, logging |
| History (h\_t) | Everything the agent has seen and done up to step t; what the policy conditions on |
| Idempotent action | An action that has the same effect whether run once or several times; safe to retry |
| Interrupt | A pause inside a workflow node that waits for outside input, such as an approval, and continues when the run is resumed with that input (LangGraph interrupt(), L15) |
| MCP | Model Context Protocol: a standard for AI hosts to discover (`tools/list`) and invoke (`tools/call`) server capabilities |
| Observation | The environment's response to an action, returned to the model as tokens |
| Permission policy | Rules that map each proposed action to allow, ask or deny before execution |
| Pre-execution monitor | A rule-based or model-based check that must finish before a tool call executes, so it can block or pause the call (L13) |
| Prompt caching | Reusing stored attention state for an unchanged prompt prefix to cut cost and time-to-first-token |
| Prompt injection | Instructions hidden in untrusted content that try to redirect the agent |
| ReAct | Prompting pattern that interleaves reasoning (thoughts), actions and observations |
| Sandbox | Isolated execution environment limiting filesystem, network and compute access |
| Scoped token | A credential limited in resources, actions and lifetime to what one task needs (L13) |
| Stuck detection | Harness check that stops or warns when the same action and observation repeat |
| Tool | A typed interface through which a model can invoke an external program |
| Trace | A structured, timed log of one agent run, made of nested spans for model and tool calls |
| Trajectory (τ) | One attempt at a task: the sequence of actions and observations, optionally with rewards |
| Workspace | In OpenHands, the interface for where files live and commands run: a local directory, a Docker container or a remote runtime (L14) |

## Practice questions

The questions start with recall and end with design and calculation; try each before reading the answer.

1. State Russell and Norvig's definition of an agent and map its parts onto a coding agent working in a repository.

   **Answer:** An agent is anything that perceives its environment through sensors and acts on it through actuators. For a coding agent (L1), the environment is the repository and its runtime; observations are file contents, command output and test results; actions are file edits, shell commands and replies; the reward is passing tests or a rubric score. The agent only sees what its commands reveal, so the environment is partially observable.
2. What does L2 mean by "the model proposes; external software decides whether and how to execute"?

   **Answer:** The model only generates tokens that describe a tool call. The harness parses, validates, checks permissions and then executes (or refuses) it. This separation is what makes validation, sandboxing and permission policies possible, and it means safety must never depend on the model alone.
3. Name the four levels of tool-call constraints in L2 and give one violation of each for a `get_weather(city, units)` tool.

   **Answer:** Syntax: `{"city":"Pgh"` (missing brace). Shape: `{"town":"Pgh"}` (wrong field name). Types: `{"city": 42}` (not a string). Values: `{"city":"Pgh","units":"K"}` (not C or F). L2 stresses that even a call passing all four can be the wrong tool, lack permission or fail the task.
4. What is a trajectory, and name four ways the same trajectory is used across the course.

   **Answer:** A trajectory is one attempt at a task: the sequence of actions and observations, optionally with rewards (L9, L11). It is used for debugging (reading where the agent went wrong), evaluation (scoring outcome or process), SFT (rendered through the chat template with non-assistant tokens masked, L8) and RL (sampled from the current policy and weighted by reward, L9, L11).
5. How does ReAct differ from chain-of-thought and from act-only prompting, and what results did it report?

   **Answer:** Chain-of-thought reasons without acting, so it can hallucinate and propagate errors; act-only acts without explicit reasoning, so it maps long observations directly to actions. ReAct interleaves thoughts (which change only the context) with actions (which fetch evidence). With one or two in-context examples it beat imitation and RL baselines by 34 and 10 absolute points on ALFWorld and WebShop and reduced hallucination on HotpotQA and FEVER.
6. List at least six stopping conditions a harness should implement and say which component triggers each.

   **Answer:** Explicit finish or submit (model); step limit, cost or token budget, and wall-clock limit (harness); repeated format errors and stuck-loop detection (harness); unrecoverable context overflow after failed compaction (harness); human interrupt or denial (user). Each should set a distinct exit status so evaluation and monitoring can aggregate them.
7. Why does mini-swe-agent run each command with a fresh `subprocess.run`, and what does that cost the agent?

   **Answer:** Stateless execution makes every action independent, so the environment can be swapped (local, Docker, Apptainer, Bubblewrap) and runs can be parallelized and reproduced easily. The cost is that shell state such as the current directory and environment variables does not persist, so the model must chain commands (for example `cd repo && pytest`) and repeat setup.
8. An agent uses a 8K-token prefix and adds 4K tokens per step. Compute total input tokens for 10 calls, then the cost at L3's Claude Opus 5 prices with and without prompt caching (ignore output).

   **Answer:** Total input = TP + ΔT(T−1)/2 = 10 · 8K + 4K · 45 = 80K + 180K = 260K tokens, which costs 260K × $5 per million = $1.30 without caching. With an append-only history, fresh input is P + (T−1)Δ = 8K + 36K = 44K ($0.22) and cached input is 260K − 44K = 216K ($0.108 at $0.50 per million). The total with caching is about $0.33, roughly a 75% saving.
9. Four independent tools take 2.0, 0.5, 1.5 and 1.0 s; each generation takes 1.0 s. Compare serial and parallel latency.

   **Answer:** Serial needs one generation before each call plus a final one: 5 × 1.0 + (2.0 + 0.5 + 1.5 + 1.0) = 5 + 5 = 10 s. Parallel needs two generations plus the slowest tool: 2 × 1.0 + 2.0 = 4 s. The saving applies only because the calls are independent; a dependent chain cannot be parallelized.
10. A 20-step task has 95% per-step success. What is the task success rate, and what does it become if the agent recovers 60% of its errors?

    **Answer:** Without recovery, 0.95^20 ≈ 0.358. With recovery the effective step failure is 0.05 × 0.4 = 0.02, so per-step success is 0.98 and task success is 0.98^20 ≈ 0.668. The independence assumption is optimistic, but the direction holds: recovery matters more than small accuracy gains on long tasks.
11. Explain compaction drift with L3's example and give three harness rules that prevent it.

    **Answer:** When each summary is built from the previous summary, ŝ\_{k+1} = C(ŝ\_k ⊕ R\_k), small losses accumulate: "Use CUDA 12.4" becomes "12.x", then "recent CUDA", then disappears. Prevent it by copying anchors (goal, constraints, identifiers) verbatim, keeping the recent tail exact, and keeping pointers to the original evidence so it can be re-read. Evaluate compaction by whether the agent continues correctly, not by summary quality alone.
12. Why does L2 say giving a coding agent `curl` plus an API key in its environment is risky, and how does MCP change this?

    **Answer:** With direct curl, the shell expands the key, so the agent (and any injected instruction) can read, print or misuse the secret. With an MCP server, the agent authenticates with an MCP credential and the server uses a separate upstream credential. The model sees neither secret, and the server can validate and authorize each call.
13. Your agent works well in harness A but poorly in harness B with the same model. Give two likely causes and how you would investigate.

    **Answer:** The model may have been trained on trajectories from harness A and learned its conventions (tool names, formats, observation shapes), as L8 warns; or harness B's interface may be worse for the task (edit format, as in Aider's 20% vs 61% result, or poor error messages). Compare traces from both harnesses on the same tasks, count format errors, wrong-tool errors and failed edits, and ablate one harness difference at a time.
14. Design the permission policy and stopping rules for an agent that triages a support inbox: it reads emails, searches an internal knowledge base and drafts replies.

    **Answer:** Allow reading emails and searching the knowledge base; allow drafting replies into a drafts folder; make sending an `ask` action, or remove the send tool entirely at first. Deny any external network access except the mail and knowledge-base APIs, and keep mail credentials in a broker. Because emails are untrusted content and the agent holds private data, it faces the lethal trifecta if it can send, so approval on outgoing mail is essential. Stop on a per-email step cap, a daily cost budget, a stuck detector and explicit finish per email, and trace every decision.
15. When would you choose a fixed workflow like Agentless over a ReAct agent, and how would you decide empirically?

    **Answer:** Choose a fixed workflow when the procedure is well understood and repeated, when predictability and cost matter, and when execution rarely reveals information that should change the plan (L5, L6). Agentless reached 32% on SWE-bench Lite at $0.70 per issue with no agent loop. Decide by running both on a held-out set with checkable outcomes, comparing success, cost, latency and failure types; adopt adaptivity only if its gains outweigh its extra cost and variance.

### More practice questions (L12–L15)

16. In L13's OpenClaw incident the user told the agent to wait for approval before changing the inbox, and it deleted email anyway. Why was the instruction not a control, and where should approval live?

    **Answer:** The rule existed only as text in the context, which the model can forget, misread or lose in compaction. Nothing in the harness stopped the delete call from executing. Approval should be a property of the delete tool: a confirmation policy that pauses the call before execution, enforced outside the model. The stop control should also sit outside the agent, so the user does not have to kill host processes to halt it.
17. Using L13's precision formula, compute the share of correct alerts for a monitor with TPR = 0.9 and FPR = 0.01 when the unsafe base rate is r = 0.001. What FPR would give 50% precision?

    **Answer:** Precision = (0.001 × 0.9) / (0.001 × 0.9 + 0.999 × 0.01) = 0.0009 / 0.01089 ≈ 8.3%. Over 10,000 decisions that is 9 real alerts among about 109. For 50% precision the two terms must be equal: 0.999 × FPR = 0.0009, so FPR ≈ 0.09%, more than ten times lower. This is why harnesses tier checks and send only the residue to humans.
18. An OpenHands conversation running in a DockerWorkspace is restored with the same conversation\_id after the container was deleted. What does the agent get back, what is missing, and what should the harness do?

    **Answer:** Replaying the event log restores the conversation state: messages, actions, observations and the condensed view. It does not restore files or processes, because L14 says workspace persistence is "a separate concern". The agent now remembers edits and installed packages that no longer exist. The harness should persist or re-create the workspace (for example from a branch or a volume) and make the agent re-check state from files and tests before continuing.
19. In the sketch in Mechanics M1, the process crashes after workspace.execute returns but before the ObservationEvent is written. The action was "send invoice email". What happens on resume, and how do you make it safe?

    **Answer:** Replay finds an ActionEvent with no observation, so the harness cannot tell whether the email went out. Re-executing risks a duplicate; skipping risks a lost email. Pass an idempotency key such as conversation id plus action id with the send, and have the mail service ignore repeats. Then re-execution is safe, because sending twice with the same key has the effect of sending once.
20. CodeR splits issue solving across five roles; L14 recommends one generalist agent. Give the harness-level argument for L14's position and two situations where a second agent is justified.

    **Answer:** Every handoff turns one agent's history into a message, which is a lossy compaction; a single agent keeps the full event log and can re-read anything. Separate roles also add coordination code and maintenance. A second agent is justified for independent review, where a reviewer with its own task and permissions has not been primed by the author's reasoning, and for parallel work on independent issues or repositories. Cost routing to a cheaper model is a third reason from L14's slide.
21. Redesign a refund-handling support agent as an explicit workflow in L15's style. Which steps are code, which call a model, where is the approval, and what injection risk remains?

    **Answer:** Read the email (code), classify intent (code plus an LLM, validated against known labels), look up the order and policy (code), draft a reply (code plus an LLM), review (an interrupt for a human), then issue the refund and send (code, each in its own node with an idempotency key). The risk is that routing depends on the model's classification, so an injected email might get itself labelled routine and skip review. Make any refund path require approval regardless of the label, so the rule depends on the action, not the model's judgment.
22. L15's Docent study found GPT-5.1 Codex at 27% versus GPT-5 Codex at 40% on Terminal-Bench in the same harness, but 0.500 versus 0.429 on the 28 tasks where neither timed out. What does this say about evaluating models in a harness?

    **Answer:** Half of GPT-5.1 Codex's scored runs timed out versus 32% for GPT-5 Codex, so the headline gap mostly reflects an interaction with the harness's wall-clock limit, not weaker problem solving. When timeouts are removed, the ranking reverses. A benchmark score belongs to a model–harness pair, as section 8 argued. Before calling a regression, read traces at scale and split results by exit status (submitted, timed out, step limit).

## References and further reading

Start with ReAct, mini-swe-agent and "Building effective agents"; then read by need. Every link below was checked.

### Core papers

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., ICLR 2023 — the interleaved thought–action–observation loop that L1 builds on.
- [Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761) — Schick et al., NeurIPS 2023 — tool calls as ordinary tokens the model learns to emit (L1).
- [What Are Tools Anyway? A Survey from the Language Model Perspective](https://arxiv.org/abs/2403.15452) — Wang et al., COLM 2024 — definitions and taxonomy of tools used in L2.
- [Executable Code Actions Elicit Better LLM Agents (CodeAct)](https://arxiv.org/abs/2402.01030) — Wang et al., ICML 2024 — code as the action space; results across 17 LLMs (L2).
- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793) — Yang et al., NeurIPS 2024 — why interface design is part of the agent.
- [Agentless: Demystifying LLM-based Software Engineering Agents](https://arxiv.org/abs/2407.01489) — Xia et al., 2024 — the fixed-workflow alternative to an agent loop (L6).
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/abs/2407.16741) — Wang et al., ICLR 2025 — a full open-source harness with sandboxed execution (L2, L3, L6).
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., NeurIPS 2023 — recovery across attempts through written self-reflection.
- [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) — Packer et al., 2023 — externalizing and retrieving context, cited in L3's compaction design.
- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) — Jimenez et al., ICLR 2024 — the benchmark whose trajectories L1 and L6 show.
- [XGrammar: Flexible and Efficient Structured Generation Engine for Large Language Models](https://arxiv.org/abs/2411.15100) — Dong et al., MLSys 2025 — grammar-constrained decoding for valid tool calls (L2).
- [Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection](https://arxiv.org/abs/2302.12173) — Greshake et al., 2023 — the attack every harness must assume.
- [Defeating Prompt Injections by Design (CaMeL)](https://arxiv.org/abs/2503.18813) — Debenedetti et al., 2025 — separating control flow from untrusted data with provable guarantees.
- [Cognitive Architectures for Language Agents (CoALA)](https://arxiv.org/abs/2309.02427) — Sumers et al., 2023 — a framework linking classical agent architectures to LLM agents.

### From the lectures

- [Artificial Intelligence: A Modern Approach (book site)](https://aima.cs.berkeley.edu/) — Russell and Norvig, 4th ed. — source of L1's agent definition and the PEAS vocabulary.
- [mini-SWE-agent documentation](https://mini-swe-agent.com/latest/) — SWE-agent team — the \~100-line loop from L1 and L6, with its control-flow and limits.
- [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) — Carlini, Anthropic, 2026 — L1's opening example of agent capability.
- [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic, 2024 — workflows versus agents; cited in L5.
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-11-25) — MCP project — the host–server protocol behind L2's credential-brokering example.
- [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) — UC Berkeley — the tool-calling evaluation categories in L2.

### Tutorials, docs and courses

- [Configure permissions (Claude Code docs)](https://code.claude.com/docs/en/permissions) — Anthropic — permission modes and deny-ask-allow rule precedence in a production harness.
- [Making Claude Code more secure and autonomous with sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing) — Anthropic — filesystem and network isolation; 84% fewer permission prompts.
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic — practical context management, complementing L3.
- [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — Anthropic — how to design tool names, descriptions and outputs.
- [The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — Simon Willison, 2025 — a simple test for prompt-injection exfiltration risk.
- [LLM Powered Autonomous Agents](https://lilianweng.github.io/posts/2023-06-23-agent/) — Lilian Weng, 2023 — a readable overview of planning, memory and tool use in agents.
- [Laminar](https://www.lmnr.ai/) — Laminar — open-source agent observability, named in L1.

### Added for L12–L15

- [The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents](https://arxiv.org/abs/2511.03690) — Wang et al., 2025 — stateless agents, event sourcing, workspaces, confirmation policies; source of the 61% failure reduction and recovery figures (L14, sections 12 and M1).
- [OpenHands SDK documentation](https://docs.openhands.dev/sdk) — OpenHands — the API behind L14's code examples (LLM, Agent, Conversation, DockerWorkspace, condensers).
- [Coding Agents with Multimodal Browsing are Generalist Problem Solvers (OpenHands-Versa)](https://arxiv.org/abs/2506.03011) — Soni et al., 2025 — evidence that one agent with general tools covers coding, browsing and office tasks (L14).
- [CodeR: Issue Resolving with Multi-Agent and Task Graphs](https://arxiv.org/abs/2406.01304) — Chen et al., 2024 — the role-based multi-agent design L14 contrasts with a single agent.
- [Don't Sleep on Single-agent Systems](https://www.openhands.dev/blog/dont-sleep-on-single-agent-systems) — Graham Neubig, OpenHands, 2024 — the argument for one generalist agent cited in L14 and L15.
- [Code with Me or for Me? How Increasing AI Automation Transforms Developer Workflows](https://arxiv.org/abs/2507.08149) — Chen et al., 2025 — user study of effort and oversight with Copilot versus OpenHands (L14).
- [Thinking in LangGraph](https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph) — LangChain — the customer-support workflow L15 builds step by step.
- [Workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents) — LangChain — the single-agent versus explicit-workflow framing on L15's opening slides.
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) and [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) — LangChain — checkpointers, thread IDs, and the rule that a resumed node restarts from its first line (sections 15 and M1).
- [LangGraph testing](https://docs.langchain.com/oss/python/langgraph/test) — LangChain — node and graph tests from L15.
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — OpenAI — agent loops, handoffs and tracing; one of L15's framework comparisons.
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) — Martin Fowler, 2005 — the general pattern behind the OpenHands conversation (beyond the lecture).
- [Diagnosing a performance regression on Terminal-Bench with Docent](https://transluce.org/docent/blog/terminal-bench) — Transluce — the timeout-driven ranking reversal in L15.
- [Introducing Docent](https://transluce.org/introducing-docent) — Transluce — trace review tool cited in L13 (Cybench shortcut) and L15.
- [Hodoscope: Unsupervised Monitoring for AI Misbehaviors](https://arxiv.org/abs/2604.11072) — Zhong, Saxena and Raghunathan, 2026 — clustering action summaries to find unanticipated behaviour (L15).
- [How OpenShell works](https://docs.nvidia.com/openshell/latest/about/architecture.html) — NVIDIA — the "agent in the sandbox" layout with policy and credentials outside (L13).
- [RFC 8693: OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693) — IETF, 2020 — minting narrowed tokens for brokered access (L13).
- [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) — GitHub — one-hour, scoped tokens as L13's example.
- [Post-mortem: unauthorized Cline CLI npm release](https://cline.bot/blog/post-mortem-unauthorized-cline-cli-npm) — Cline — the shared-cache incident behind the clean-state-per-run pattern (L13).
- [AI Control: Improving Safety Despite Intentional Subversion](https://arxiv.org/abs/2312.06942) — Greenblatt et al., 2023 — monitoring and intervention protocols cited in L13.
- [Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation](https://arxiv.org/abs/2503.11926) — Baker et al., OpenAI, 2025 — why written reasoning is limited evidence for a monitor (L13).
- [OpenAgentSafety: A Comprehensive Framework for Evaluating Real-World AI Agent Safety](https://arxiv.org/abs/2507.06134) — Vijayvargiya et al., 2025 — attempts versus completed harm with real tools (L13).

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L01 - What Are Agents]]
- Lecture: [[L02 - Tool Use]]
- Lecture: [[L03 - Long-Context Agents]]
- Lecture: [[L06 - Coding Agents]]
- Lecture: [[L13 - Agent Safety]]
- Lecture: [[L14 - OpenHands]]
- Lecture: [[L15 - Orchestration and Monitoring]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]

[[CMU 11-768 AI Agents - Course Index|Course index]] · [[T02 - Tool Calling, Schemas, MCP and Constrained Decoding|T2 →]]
