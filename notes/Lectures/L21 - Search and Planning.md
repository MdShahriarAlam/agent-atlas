---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, search, planning, world-models]
aliases: ["CMU L21", "11-768 Lecture 21", "Search and Planning"]
source: "CMU 11-768 AI Agents, Fall 2026 — 2026-11-17-jy-koh.pdf"
---

# Lecture 21 · Search and Planning

[[L20 - Search over Trajectories|← L20]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L22 - How to Trust Your AI Agents|L22 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 21 · Jing Yu Koh (guest)
> **Source:** lecture slides `2026-11-17-jy-koh.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]], [[T05 - Planning, Task Decomposition and Multi-Agent Systems]], [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T07 - Computer-Use and Web Agents - Perception, Grounding and Action]], [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]], [[T12 - Rewards, Verifiers and Reward Hacking]]

Jing Yu Koh (guest) · 11-768 AI Agents, Fall 2026 · 17 November 2026 · source slides: 2026-11-17-jy-koh.pdf (100 slides)

## Overview

Search pays off for agents when it works over **partial solutions** with a good way to score, simulate or split them, and only when the gain in decision quality is worth the extra calls, waits and side effects. Lecture 20 sampled and reranked *whole* attempts; this guest lecture by Jing Yu (JY) Koh (CMU) keeps a *frontier* of partial solutions, chooses what to expand, and then asks three harder questions: can search be learned, can action effects be predicted before acting, and can a big task be split into subtasks that run together? The talk has five parts: (1) search and learning (MCTS, Expert Iteration, AlphaGo Zero), (2) search over language (Tree of Thoughts, Graph of Thoughts, Stream of Search), (3) search grounded in real environments (DeepSeek-Prover, LATS, web tree search), (4) world models (RAP, WebDreamer, CWM, code-as-simulator) and (5) task decomposition (RLM, RAO, LLMCompiler, MACU, CAID). A summary and an appendix with extra results, prompt-parsing details and the AlphaZero losses close it.

**Learning objectives.** After this lecture you can:

- Explain DFS, BFS, best-first search and Monte Carlo tree search as choices about the frontier, and compute a PUCT selection score by hand.
- Describe the Expert Iteration / AlphaGo Zero loop, in which search produces better decisions that become training targets, and say why it transfers poorly from Go to language.
- Compare Tree of Thoughts, Graph of Thoughts and Stream of Search by what a node is, how it is scored and whether search is explicit or learned.
- Reason about grounded search on real environments: what backtracking costs, why state-changing actions break it, and how a world model (RAP, WebDreamer, CWM, WorldCoder) can replace execution with prediction.
- Design a decomposition (recursive delegation or a dependency DAG) and bound its speed-up by the critical path plus coordination time.

**Prerequisites.** The agent loop (L1), planning and decomposition (L5), and L20's sampling, verifiers and pass@k; basic RL vocabulary (policy, value, reward) from L9.

**How it connects to earlier lectures.**

- **L20 (search over trajectories):** the direct predecessor. L20 searched over complete attempts (best-of-N, self-consistency, refinement, PDR, RSA); L21 searches over partial states, and slide 2 frames the step as "full attempts → partial solutions → structured search".
- **L5 (planning):** L5 previewed ToT, RAP and LATS and deferred search; this lecture is that deferred material, plus the DAG planners.
- **L7 (computer use):** same speaker; L7 cited Koh et al.'s web tree search and the irreversibility problem, which part 3 develops.
- **L9 and L11 (RL):** Expert Iteration, AlphaZero's policy and value losses, STaR and APA are policy-improvement methods; search acts as the improvement operator.
- **L18 (multi-agent systems):** RAO, MACU and CAID appeared there as delegation architectures; here they reappear as decomposition and scheduling of search over subtasks (not repeated in detail).
- **L3 (long context):** RLM treats an over-long prompt as data in a REPL instead of compacting it.
- **L6 and L14 (coding agents):** CAID uses git worktrees and tests for integration; CWM is a coding model trained to predict execution.
- **L10 (deep research):** DeepDive and BrowseComp-Plus are deep-research style tasks where delegation helps or hurts.
- **T12 (rewards and verifiers):** value networks, LLM evaluators and Lean are the scoring side of every search here.

## Concept map

![[cmu-ai-agents-L21-concept-map.png]]
*Concept map: The search loop over partial solutions and which slot each part of the lecture changes*

Read from the top: L20's full attempts become a loop over a frontier of partial solutions (node, expand, score, select); the four side boxes show which slot each part of the lecture changes, and decomposition at the bottom runs many such loops at once, bounded by the critical path.

## Detailed notes

The lecture's thread is that search is a loop of four choices: what a node is, how to expand it, how to score it, and which node to expand next. Each part changes one of these: games give exact simulators, language gives open-ended nodes, real environments make expansion costly, world models make expansion imagined, and decomposition turns one search into coordinated subtasks. Slide numbers below follow PDF page order (1–100); the printed numbers on the slides differ in places.

### 1. From sampling to structured search (slides 1–3)

Slide 2 places today's lecture on a line from L20. **Full attempts** (last lecture) means sampling complete answers and reranking them. **Partial solutions** means keeping a *frontier*, the set of unfinished states waiting to be expanded, and choosing which one to grow. **Structured search** (today) adds three abilities: learn search policies, predict action effects, and coordinate subtasks. Slide 3 lists the five parts with one-line theses: "a stronger planner becomes training data", "trees, graphs, and serialized exploration", "actions change an executable environment", "predict consequences before acting" and "delegate work and coordinate dependencies".

*Why it matters:* partial-solution search can prune a bad branch after one step instead of paying for a whole failed attempt. The price is that you now need a scorer for *unfinished* work, which is harder than checking a final answer.

### 2. Search and learning (slides 4–15, appendix 96–99)

**A short history (slide 5).** Four eras: 1950s–60s heuristics guide lookahead (Shannon's chess program design, Dijkstra's shortest paths, A\*); 1970s–90s game-tree pruning, where alpha–beta search let IBM's Deep Blue beat Kasparov at chess in 1997; 2010s "sample, learn, and search", where AlphaGo used neural networks to guide search; and 2020s search over language and actions, where LMs propose thoughts and tool actions for search to explore (Tree of Thoughts, WebDreamer). The footer also names UCT and AlphaZero.

**DFS and BFS as frontier policies (slides 6–7).** Both slides show the same tree (A at the root, B and C below, D–G as leaves) with a visit-order row and a frontier row. The only difference is the frontier's data structure:

| Algorithm | Frontier | Rule | Behaviour |
| --- | --- | --- | --- |
| Depth-first search | Stack, last in first out (LIFO) | Push children on top, take from the top | Follows one branch as far as possible, then backtracks |
| Breadth-first search | Queue, first in first out (FIFO) | Add to the back, take from the front | Finishes a level before moving to the next |
| Best-first search (used later) | Priority queue | Take the highest-scoring node | Goes wherever the value estimate is best |

The frontier "holds nodes waiting to be visited". Every method later in the lecture is a different rule for ordering this frontier.

**Monte Carlo tree search (slides 8–12).** MCTS keeps a tree of candidate moves in which nodes are states and edges are actions. Each *pass* (simulation) runs four steps, which the build slides highlight one at a time:

1. **Choose a branch (selection).** From the root, pick a child "based on current policy action distribution and previous visit counts" (slide 9). Here the search picks A.
2. **Expand the leaf.** Add children of the chosen leaf (A1, …) and, in classic MCTS, roll out from A to the end of the game (slide 10).
3. **Estimate its value.** In AlphaGo-style MCTS, a value network estimates the outcome at A instead of (or in addition to) a random rollout (slide 11).
4. **Start another pass (backup).** Send the value back up the path, updating the statistics of every node on it; the next pass may go deeper under A or try B (slide 12).

**PUCT selection (slide 98, appendix).** AlphaZero picks the child that maximizes a mix of how good the action has looked so far and how much the policy likes it, discounted by how often it was tried:

$$
a^{*} = \arg\max_{a} \left[ Q(s,a) + c \, P(s,a) \, \frac{\sqrt{N(s)}}{1 + N(s,a)} \right]
$$

Here s is the current state, a a legal action, Q(s,a) the mean backed-up value of taking a in s, P(s,a) the policy network's prior probability for a, N(s) the visit count of s, N(s,a) the visit count of edge (s,a), and c a constant that trades exploitation for exploration. The slide's synthetic example uses c = 1 and N(s) = 9, so the square root is 3:

| Child | P | N | Q | Exploration term c·P·3/(1+N) | PUCT score |
| --- | --- | --- | --- | --- | --- |
| A | 0.60 | 4 | 0.60 | 0.60·3/5 = 0.36 | **0.96** |
| B | 0.25 | 3 | 0.40 | 0.25·3/4 = 0.19 | 0.59 |
| C | 0.15 | 2 | 0.55 | 0.15·3/3 = 0.15 | 0.70 |

A wins because it has both the best Q and the largest prior. C beats B despite a smaller prior because its Q is higher and it has fewer visits. *Common pitfall:* PUCT is not UCB1; the prior P scales the bonus, so a policy that assigns near-zero prior to the right move can starve it of visits.

**Expert Iteration (slide 13).** Anthony, Tian & Barber (NeurIPS 2017) name the loop that powers AlphaGo Zero: a **neural policy** *guides* **tree search**, the search *collects* **improved decisions**, and the policy is **trained on the search decisions**. "Search discovers (improved) decisions that we can train on." The policy is the fast "apprentice"; search is the slow "expert"; each round the apprentice imitates the expert and the expert gets stronger because it is guided by a better apprentice.

**AlphaGo Zero (slide 14, appendix 97).** Silver et al. (Nature 2017), Figure 1a: at each self-play position s\_1, s\_2, …, s\_T the system runs MCTS, plays a move a\_t sampled from the search's visit-count distribution π\_t, and at the end records the game result z. The appendix figure (1b) shows training: the network f\_θ takes each s\_t and outputs a move distribution p\_t, trained toward π\_t, and a value v\_t, trained toward z. "Search at each move. Record the visit counts and the final game result."

**AlphaZero losses (slide 99, appendix).** Silver et al. (Science 2018) train one network on both targets:

$$
\mathcal{L}(\theta) = \big(z - v_\theta(s)\big)^2 \; - \; \sum_{a} \pi_{\text{search}}(a \mid s) \, \log p_\theta(a \mid s)
$$

Here z is the final game outcome, v\_θ(s) the network's outcome prediction for self-play state s, π\_search(a | s) the MCTS move distribution (normalized visit counts), p\_θ(a | s) the network's move probabilities, a a legal move and θ the network parameters. The first term is a squared-error value loss; the second is a cross-entropy policy loss that makes the network imitate search. The slide notes that the L2 regularization term is omitted.

**ReST-MCTS\* (slide 96, appendix).** Zhang et al. (NeurIPS 2024) carry the loop to LLM reasoning. MCTS\* collects reasoning traces for training questions with known answers; each step gets a value (0, 0.25, 0.5, 0.75, 1 in the figure) inferred from whether the trace reaches the correct final answer. Those per-step values train a process reward model (PRM), the correct traces train the policy model, and the two alternate. "Alternate search with policy and reward-model training."

**Why the loop works in games (slide 15).** The slide is a three-column table that explains why AlphaZero does not transfer for free:

| Component | Board games | Challenge for language models |
| --- | --- | --- |
| State | Compact board configuration | History and hidden information |
| Transitions | Exact, cheap simulator | Tools, side effects, or prediction |
| Actions | Legal moves are enumerable | Generated text and tool arguments |
| Outcome | Game result is unambiguous | Task success can be ambiguous |

Each row predicts a later part of the lecture. Open-ended actions motivate ToT/GoT (part 3), costly transitions motivate grounded search (part 4), missing simulators motivate world models (part 5), and long histories motivate decomposition (part 6).

### 3. Search over language (slides 16–32, appendix 83–88, 100)

When there is no board, a node becomes a piece of text, a "thought", and the LLM itself must generate children and judge them. Three designs differ in how much structure is imposed: a tree with an explicit controller (ToT), a graph whose nodes can merge (GoT), or no external search at all because the model has learned to write the search out (Stream of Search).

**Tree of Thoughts (slides 17–22).** Yao et al. (NeurIPS 2023) use the Game of 24: combine four numbers with +, −, ×, ÷, each exactly once, to make 24. The build uses {1, 3, 4, 6}:

1. From the root {1, 3, 4, 6} two candidate thoughts appear: 1 + 3 = 4, leaving {4, 4, 6}, and 3 / 4 = 0.75, leaving {1, 0.75, 6}.
2. The evaluator judges {4, 4, 6} a dead end ("dead end with these remaining numbers") and the search returns to the other candidate ("evaluate branches and return to another candidate").
3. Under {1, 0.75, 6}: 1 − 0.75 = 0.25, then 6 / 0.25 = 24.
4. The final answer is 6 / (1 − 3/4) = 24, which uses each input exactly once.

Slide 21 places ToT beside the paper's comparison figure: (a) input–output prompting goes straight to the answer; (c) chain of thought adds a single chain of intermediate thoughts; CoT-SC samples several chains and takes a majority vote; (d) ToT grows a tree in which some thoughts are expanded (green) and others pruned (red). Three roles are separated: a **frontier** stores partial solutions, a **controller** (the search algorithm, LLM-driven in the slide's framing) picks the next branch, and a **heuristic** (an LLM prompt) rates partial progress. "Thought generation, evaluation, and traversal are separate choices."

**ToT results (slide 22).** GPT-4 on 100 hard Game of 24 problems (original Table 2):

| Method | Success rate |
| --- | --- |
| IO prompting | 7.3% |
| Chain of thought | 4.0% |
| CoT-SC, 100 samples | 9.0% |
| ToT, breadth 1 | 45% |
| ToT, breadth 5 | **74%** |

The slide warns that the methods "use different inference budgets", so this is not a compute-matched comparison. Even so, the 9.0% → 74% jump shows that pruning early is far better than sampling more full chains for this task.

**How ToT scores a state (appendix slides 83–84).** The official code asks a value prompt such as "Can these numbers reach 24?" for a remaining set like {1, 0.75, 6}. The LM reasons and ends with a label on its last line; a parser maps the label to a hand-chosen weight: impossible = 0.001, likely = 1, sure = 20. "Hand-chosen search weights, not probabilities." Three evaluations are sampled per state and summed (for example sure + likely + sure = 20 + 1 + 20 = 41), and the five highest-scoring states are kept (breadth b = 5). So ToT's Game-of-24 setting is a beam-style BFS with an LLM vote as its heuristic.

*Common pitfall:* the weights are an ordering device, not calibrated probabilities. Averaging them across different prompts or tasks is meaningless.

**Graph of Thoughts (slides 23–26).** Besta et al. (AAAI 2024) let thoughts form a directed graph, so a node can have several parents. The illustrative sorting build splits \[7, 2, 9, 1, 6, 3\] into \[7, 2, 9\] and \[1, 6, 3\], sorts each into \[2, 7, 9\] and \[1, 3, 6\], then **aggregates** them with "merge both sorted lists" into \[1, 2, 3, 6, 7, 9\]. This is merge sort carried out by an LLM, with the graph controlling which partial results flow into which call. The appendix paper figure (slide 87) compares IO, CoT, CoT-SC, ToT and GoT; GoT's key novelty is "arbitrary graph-based thought transformations (aggregating thoughts into a new one, looping over a thought to refine it)". "Aggregation permits information to flow across reasoning branches."

**How GoT scores a merge (appendix slides 85–86).** The LLM merge prompt says "combine both sorted lists; compare the heads; append the smaller; repeat; return only the merged list". The official 32-number graph samples ten merges. Each candidate is "scored afresh by code", not by adding the parents' scores:

$$
E(y; x) = \sum_{d=0}^{9} \left| c_y(d) - c_x(d) \right| + \sum_{j=1}^{|y|-1} \mathbf{1}[\, y_j > y_{j+1} \,]
$$

Here x is the input list, y the output list, c\_y(d) and c\_x(d) the number of times digit d occurs in y and in x, y\_j the j-th element of y, and 1\[·\] an indicator. The first sum counts extra or missing elements; the second counts adjacent descents (not all inversions). Lower is better. For the slide's three merges: A = \[1, 2, 3, 7, 6, 9\] has 0 count errors and 1 descent, so E = 1; B = \[1, 2, 3, 6, 6, 9\] has an extra 6 and a missing 7, so E = 2; C = \[1, 2, 3, 6, 7, 9\] has E = 0 and is kept. The graph then samples repairs of the kept list and rescores them.

**GoT results (slides 26 and 100).** ChatGPT-3.5, 100 inputs per configuration, task-specific graphs:

| Task | Metric | IO | CoT | ToT | ToT2 | GoT |
| --- | --- | --- | --- | --- | --- | --- |
| 128-number sorting | Median error index (ToT = 100), lower is better | — | — | 100 | — | ≈38 |
| 32-element set intersection | Exact success rate, higher is better | 7% | 6% | 31% | 29% | **43%** |

On sorting, GoT cut median error by about 62% and cost by more than 31% versus ToT; the ≈38 bar is derived from that reported reduction. ToT2 is a deeper, narrower tree. The slide's conclusion is careful: "GoT improves the quality–cost tradeoff in these task-specific configurations." The graphs are hand-designed per task, so GoT is a framework for expressing decompositions, not an automatic planner.

**Stream of Search (slides 27–32).** Gandhi et al. (COLM 2024) ask whether a model can learn to *do* search in its own token stream. The worked Countdown trace (target 24, numbers \[4, 6, 7, 8\]) is produced by the official DFS serializer:

- **Explore (slide 27):** 4×6 = 24 gives node #0,0 with \[7, 8, 24\]; 7+8 = 15 gives #0,0,0 with \[24, 15\]; 24+15 = 39 → "39,24 unequal: No Solution".
- **Backtrack (slide 28):** still at #0,0,0, try 24−15 = 9 → "No Solution"; move back to #0,0 and try 8−7 = 1, generating #0,0,1 with \[24, 1\]. "Backtracking appends text; earlier attempts stay in context."
- **Solve (slide 29):** at #0,0,1, 24×1 = 24 → "24,24 equal: Goal Reached". The stream contains exploration, recovery and a valid solution.

**Training on the whole stream (slide 30).** The data are 500,000 synthetic traces from 12 heuristic DFS/BFS strategies, of which about 57% succeed. The target is the full trace ("explore, fail, return"), so failed attempts and moves back are in the loss. The model is a 250M-parameter GPT-Neo trained from scratch with a 4,096-token context. The objective is ordinary next-token prediction over the trace:

$$
\mathcal{L}_{\mathrm{SoS}}(\theta) = -\,\mathbb{E}_{z \sim \mathcal{D}_{\mathrm{SoS}}} \left[ \sum_{t=1}^{|z|} \log p_\theta(z_t \mid z_{<t}) \right]
$$

Here z is one tokenized search trace (problem plus control text), D\_SoS the dataset of traces, z\_t its t-th token, z\_\<t the tokens before it, and p\_θ the model. The return move after "No Solution" is also a supervised continuation, which is how the model learns to recover.

**Policy improvement after trace training (slide 31).** Two methods start from the pretrained SoS policy. **STaR / Expert Iteration** samples traces, keeps those verified correct, and fits the same next-token loss (sample → filter → fit). **APA** (Advantage-Induced Policy Alignment, an RL method) rewards valid solutions and penalizes extra search expansions, so it targets correct *and* efficient search.

**Results (slide 32).** Chart labelled "Game of 24 · seen targets, new inputs · 10,000 test problems":

| Model | Accuracy |
| --- | --- |
| Optimal-path training (OP) | 25.73% |
| Stream of Search | 51.27% |
| SoS + STaR | 55.59% |
| SoS + APA | **56.52%** |

OP and SoS use the same 250M model, 500k examples and gradient steps; STaR and APA add training. Full search traces improve accuracy by 25.54 percentage points over training only on the optimal path. *Why it matters:* showing a model only clean solutions hides how to recover from mistakes; showing it the messy search teaches backtracking as a skill.

**Searchformer (appendix slide 88).** Lehnert et al. (COLM 2024), "Beyond A\*", train transformers on serialized A\* search dynamics for mazes and Sokoban, then fine-tune on shorter successful traces. The slide groups it with SoS: search traces "include exploration and mistakes"; learning means "predict the serialized process"; evidence comes from Countdown and structured planning. "Training can expose exploration, including failed branches." This is the same idea that later reasoning models apply at scale: long chains of thought that contain backtracking.

### 4. Search within environments (slides 33–42)

In grounded search an expansion is a *real* action in an executable environment, so each child state comes with a real observation instead of an LLM's guess. That is the big advantage. The cost is that the environment, not the search code, owns the state, so going back to an earlier node becomes an environment operation that may be slow or impossible.

**DeepSeek-Prover over Lean proof states (slide 34).** Xin et al. (DeepSeek-Prover-V1.5; ICLR 2025, Figure 2) use the Lean 4 proof assistant as the environment. The figure shows a theorem (sum of the roots of a polynomial), a Monte-Carlo tree search box, and a "whole-proof completion" from the model. When Lean finds an error ("failed to synthesize LinearOrder ℂ" in the figure), the failing tail is **discarded**: the system keeps the steps Lean accepts, extracts the tactic state at the truncation point, and resumes generation from that checked state. The three boxes on the slide are the procedure: generate a proof continuation; keep the steps Lean accepts; resume from a checked state. Each resumed prefix is a node in the tree. *Beyond the slides:* the paper calls its search RMaxTS, an MCTS variant with an intrinsic reward for discovering new tactic states, and reports 63.5% on miniF2F-test and 25.3% on ProofNet.

*Why it matters:* Lean is the ideal grounded environment. Its checker is exact, it is free to reset (a proof prefix is just text), and nothing outside the search changes. Most agent environments lack all three properties.

**LATS (slide 35).** Language Agent Tree Search (Zhou et al., ICML 2024) runs MCTS with an LLM agent as the policy. The paper figure shows six operations: (1) **selection** of a node by UCT; (2) **expansion**, sampling several actions and executing them; (3) **evaluation**, where an LM assigns a value to the new state; (4) **simulation**, rolling out to a terminal output; (5) **backpropagation** of the result up the path; and (6) **reflection**, where after a failed trajectory the LM writes a verbal reflection that is stored and conditions later attempts. "Each expansion can acquire and condition on environment outcomes." LATS unifies ReAct-style acting, Reflexion-style self-critique (L20) and MCTS. *Beyond the slides:* LATS reports 92.7% pass@1 on HumanEval with GPT-4; its environments (HotpotQA, WebShop, programming) can be reset cheaply.

**Tree search on realistic web tasks (slide 36).** Koh, McAleer, Fried & Salakhutdinov (2024; TMLR 2025), the speaker's own work, run **best-first search** over actual browser states in VisualWebArena and WebArena. A multimodal value function (an LLM judging the screenshot and trajectory) scores each state between 0 and 1, and the frontier is ordered by that value. The figure's task is "Can you add this and the other canned fruit (of the same brand) that looks like this, but red instead of brown to the comparison page?" with a product image. The plain GPT-4o agent takes four steps and fails. The agent with search starts at v = 0.5, expands several children (values 0.45, 0.4, 0.45, 0.5, 0.55, 0.3, 0.55, 0.68, 0.2), **backtracks** along dashed arrows when branches look poor, and reaches success at step 10 with v = 1.0. "Best-first search explores actual environment states."

**A search branch executes real actions (slides 37–39).** The illustrative task is "find a refundable room for the conference dates". From the hotel results page, the agent opens hotel A and observes a non-refundable rate. To try hotel B (free cancellation), it must first get back to the results page: "a second branch requires a way back to the earlier state". The implemented answer is **reset and replay the action prefix**: reload the start state and re-execute the actions that led to the node. "Backtracking requires an environment operation."

**Results and costs (slide 40).** Koh et al. (TMLR 2025, Table 2, §4.2), 5-step agents:

| Benchmark | Agent | No search | With search | Relative gain |
| --- | --- | --- | --- | --- |
| VisualWebArena | GPT-4o + Set-of-Marks | 18.9% | **26.4%** | +39.7% |
| WebArena | GPT-4o | 15.0% | **19.2%** | +28.0% |

The relative-gain column is computed from the slide's numbers. Beside the chart, three costs: reset and replay add latency; hidden server state can matter; and some actions cannot be undone. "Observed transitions help. Resets remain expensive."

**Search by acting changes the environment (slide 41).** Three cards generalize the costs. **State changes:** actions can change the state of the world. **Latency:** branches add tool calls, waits and LLM calls. **Backtracking:** backtracking may not fully recover the original state (Koh et al. §5.4, App. A.4.1; Gu et al., WebDreamer §1).

**Backtracking after a state-changing action (slide 42).** Three browser frames make the point concrete. Before: the checkout form, and the server has no order. Submit order: "order confirmed", and the server now has an order. Browser back: the page shows the checkout form again, but the server still has the order. The page looks like the earlier node; the world state is not. This motivates the next part: "Could we estimate outcomes instead of executing actions?"

*Common pitfall:* treating "the page looks the same" as "the state is the same". Before you branch, list which actions have side effects outside the page (orders, emails, file writes, payments) and either forbid them inside search or route them through a simulator or a human check.

### 5. World models (slides 43–54, appendix 89)

A world model replaces "execute the action and look" with "predict what would happen", so the search can branch without touching the real environment. The risk moves from side effects to prediction error.

**Verifiers versus world models (slide 44).** Two pipelines side by side. A **verifier** takes an *observed execution* and outputs correctness or success; it judges what already happened (L20, T12). A **world model** takes a *state plus a proposed action* and outputs a predicted next state and reward; it judges what *would* happen. The inset is WebDreamer's Figure 1c, "model-based planning": from the current page, imagined child pages (drawn as clouds) are expanded and scored, and only the chosen path is executed. MuZero (Schrittwieser et al., Nature 2020) is cited as the game-playing precedent: it learned its own dynamics model instead of using the rules.

**World Models: learning inside a dream (slide 45).** The definition: a world model "predicts how the environment changes in response to an action" (current state + action → model → predicted next state). Ha & Schmidhuber (NeurIPS 2018) trained a controller inside a learned VizDoom simulator and tested it in the original game. The right panel is a blurry frame from the authors' interactive demo: "a rollout inside the model's dream". *Beyond the slides:* their model had three parts: a VAE that compresses each frame (V), a recurrent mixture-density network that predicts the next latent (M), and a tiny linear controller (C) trained with an evolution strategy.

**RAP: the LM predicts state changes (slide 46).** Reasoning via Planning (Hao et al., EMNLP 2023) contrasts chain of thought (a single chain s\_0, a\_0, a\_1, a\_2 … s\_T) with RAP, where the same LLM plays two roles: as the **agent** it proposes action a\_t; as the **world model** it predicts the next state s\_t+1 and a reward r\_t. MCTS then searches over these imagined states, backing rewards up the tree. "Separate proposing an action from predicting its consequence." *Beyond the slides:* RAP was evaluated on Blocksworld planning, GSM8K math and logical reasoning.

**WebDreamer: imagine before acting (slides 47–49, appendix 89).** Gu et al. (2024/2025) use an LLM to simulate web pages. Task: "find the cheapest 512 GB disk in Data Storage". From the observed storefront there are three candidate actions, each with a predicted page change:

| Candidate action | Predicted page change | Score |
| --- | --- | --- |
| Click Office Products | Office subcategories, including Office Electronics | 0.4 |
| Click Electronics | Computers & Accessories, then Data Storage | **0.8** |
| Type "Disk" | A page of search results | 0.1 |

The agent executes only the best action, "click Electronics in browser", observes the real Electronics page, and replans from that new observation. The appendix figure labels the stages: **propose** candidate actions, **simulate** likely state changes, **execute** one action and replan. "After one real action, planning starts from the new observation." This is model predictive control: imagine several steps, commit to one.

**Longer imagined horizons can reduce success (slide 50).** WebDreamer Figure 5, GPT-4o on Online-Mind2Web. A reactive agent (no simulation) scores 26%. With a planning horizon of 1 the success rate is 37%; with horizons 2 and 3 it falls to 32%. Two reasons are given: "an imagined next click may be unavailable" (the model invents a link the real page lacks), and "errors accumulate across predicted steps". The main experiments therefore use one-step lookahead.

*Why it matters:* deeper lookahead is not free accuracy. Each imagined step multiplies the chance that the plan rests on a false premise, so the best horizon depends on how accurate the model is.

**Code World Model (slides 51–52).** The Meta FAIR CodeGen Team's CWM (2025) is "a 32B open-weights language model trained to predict how code and actions change computational state". The training pipeline (Fig. 1):

| Stage | Data | Context | Checkpoint |
| --- | --- | --- | --- |
| General pre-training | 8T tokens | 8k | — |
| Code world modeling mid-training | 5T tokens | 131k | CWM pretrained |
| Supervised fine-tuning (instruction and reasoning) | 100B tokens | 32k | CWM sft |
| Joint RL (agentic and reasoning) | 172B tokens | 131k | CWM |

The world-modeling data come in two kinds: **Python** traces (statement → variable state) and **Docker** trajectories (command or edit → output). Slide 52 shows the trace format (Fig. 3): a `<|line_sep|>` token, a JSON frame of local variables such as {"s": "..", "t": ".."}, an `<|action_sep|>` token and the next statement (n = 0), separated by `<|frame_sep|>`. After the statement n = 0, the predicted next frame includes {"n": "0"}. "CWM learns to predict how each Python statement changes local variables."

**Executable code as the simulator (slide 53).** Instead of predicting states in prose, the LLM can *write* a transition function and let the planner run it:

```python
def transition(state, action):
    next_state = apply(state, action)
    reward = goal(next_state)
    return next_state, reward
```

The LLM writes and revises the code; the planner runs the simulator thousands of times at no LLM cost. Tang, Key & Ellis (WorldCoder, NeurIPS 2024) build such programs from interaction, and Dainese et al. (NeurIPS 2024) generate them with GIF-MCTS. The caveat: "model correctness must extend beyond the observed examples". A program that fits the transitions seen so far can still be wrong on new states.

**World model choices (slide 54).**

| Representation | Examples | Main risk |
| --- | --- | --- |
| Natural-language consequences | RAP, WebDreamer | Plausible but incorrect futures |
| Learned execution dynamics | CWM | Prediction errors and distribution shift |
| Executable transition program | WorldCoder, GIF-MCTS | A wrong rule becomes a fast simulator |

The rule beneath the table: "evaluate whether predictions improve decisions." A world model is judged by the actions it helps choose, not by how realistic its predictions look.

### 6. Decomposition and parallelism (slides 55–74, appendix 90, 94–95)

The last part turns search sideways. Instead of several attempts at the *same* task, the agent splits a task into *complementary* subtasks, runs them (often in parallel), and combines their outputs. The new problems are deciding what to delegate, passing the right context, scheduling around dependencies, and integrating results.

**Candidate attempts versus complementary subtasks (slide 56).** Left ("prior"): one complete task, attempts A and B, then select or synthesize answers, which is L20's best-of-N. Right ("today"): complementary work, such as "collect sources" and "run experiments", then combine the required outputs. With attempts, any one success is enough; with subtasks, *every* required piece must succeed.

**Recursive Language Models (slides 57–60, appendix 90).** Zhang, Kraska & Khattab (2025/2026) treat the prompt as external data. A root LM does not read the long input; instead the input is loaded as a variable (`prompt = long_document`) in a persistent REPL, and the root writes code to inspect, filter, split and compute over it. The code can call an LM on selected snippets (LM(snippet A), LM(snippet B)), and those subcalls can themselves be RLMs. In the evaluated implementation the subcalls run **sequentially**. The appendix figure shows a root at depth 0 printing the first 100 characters of a long book, splitting it by "Chapter", sending chapter parts to depth-1 RLMs with focused questions, and assembling the final answer from their structured returns. "Recursive calls isolate context and return structured intermediate results."

**RLM results (slide 59, Table 1).** GPT-5 is the root model; RLM subcalls use GPT-5-mini.

| Benchmark (input size, metric) | Method | Score |
| --- | --- | --- |
| BrowseComp-Plus (6–11M tokens, accuracy %) | Compaction | 70.5 |
|  | REPL only | 88.0 |
|  | RLM depth 1 | 91.3 |
|  | OpenCode + offload | 94.0 |
| OOLONG-Pairs (32K tokens, answer-set F1 %) | Direct GPT-5 | 0.1 |
|  | REPL only | 43.9 |
|  | RLM depth 1 | 58.0 |
|  | RLM depth 3 | **76.0** |

Direct GPT-5 could not run on BrowseComp-Plus because the input exceeded its context window. Note that a coding-agent harness with context offloading (OpenCode + offload, 94.0) beat RLM on that benchmark; RLM's large win is on OOLONG-Pairs, which needs pairwise reasoning over every record.

**When RLMs help (slide 60).** Three uses. **Read selectively:** code scans a corpus and brings only relevant passages into context. **Delegate judgments:** subcalls label batches of records and code combines the labels across the full dataset. **Choose depth by task:** on CodeQA, Qwen3-Coder scored 66% with the REPL alone but 44% at recursion depth 3, so deeper recursion can hurt.

**RAO: learning when and how to delegate (slides 61–64).** Recursive Agent Optimization (Gandhi et al., 2026; covered in L18) trains one **shared policy θ**; every agent instance and child is a copy of it. An instance can delegate a subtask, choosing the context to pass and the output it wants back, then aggregate the returned results. The paper figure shows a root agent planning a 3-day Kyoto trip that launches sub-agents (cherry-blossom timing; a quiet temple plus a kid-friendly activity), one of which launches its own sub-sub-agents; subcalls are asynchronous (`asyncio.gather`). "Useful delegation depends on the task and the training signal."

| Benchmark | Metric | Trained single agent | RAO with delegation |
| --- | --- | --- | --- |
| TextCraft-Synth (synthetic crafting trees) | Success rate | 73% | **96%** |
| Oolong-Real (long transcript aggregation) | Average reward | 0.203 | **0.320** |
| DeepDive (multi-hop web research) | Success rate | 24% | **40%** |

Same backbone within each benchmark, 256K evaluation context.

**When does learned delegation help? (slide 64).** Wall-clock seconds on tasks both methods solved:

| Benchmark | Single agent | RAO | Why |
| --- | --- | --- | --- |
| Hard TextCraft-Synth | 180.0 s | **73.3 s** | Independent recipe branches can run together |
| DeepDive | **13.3 s** | 233.0 s | Later searches depend on earlier findings |

What RAO learned: it delegated deeper on harder recipes and usually used one layer of workers to read separate chunks on Oolong-Real. *Why it matters:* delegation raised accuracy on all three benchmarks but made DeepDive about 17× slower, because a sequential task gains nothing from parallel workers and still pays their overhead.

**LLMCompiler: schedule a dependency graph (slide 65).** Kim et al. (ICML 2024), building on HuggingGPT (Shen et al., NeurIPS 2023). For "How much does Microsoft's market cap need to increase to exceed Apple's market cap?", a **function-calling planner** emits a DAG of tasks:

```text
$1 = search(Microsoft Market Cap)
$2 = search(Apple Market Cap)
$3 = math($1 / $2)
$4 = llm($3)
```

A **task fetching unit** dispatches each task as soon as its inputs are available and resolves dependencies by substituting results for $1, $2 and so on; an **executor** runs tools (search, math, llm) in parallel, each with its own memory. $1 and $2 run together; $3 waits for both; $4 waits for $3. "Dispatch a task when its required inputs are available."

**A planner exposes which work can run together (slides 66–68).** A travel example from MACU (Koh, Salakhutdinov & Fried, 2026): read request → {compare flights, compare hotels, check weather} → build itinerary. First, "dependencies describe required inputs"; then "three ready subtasks run independently"; finally "combine results, then revise the plan".

**MACU: a manager maintains a mutable task DAG (slides 69–70, appendix 94).** Multi-Agent Computer Use (also in L18) is a scheduler loop. A manager initializes the DAG; ready subtasks go to parallel computer-use subagents (CUA 1 … CUA N), each on its own VM from a pool; when a subagent finishes, a follow-up loop lets the manager answer "continue" with updated instructions or "done"; the manager can replan the graph; at the end it outputs a summary and deliverables. "Planning, execution, and replanning continue as evidence arrives." Qwen3.6-27B workers throughout; median elapsed time in minutes:

| Benchmark | Single agent success / time | MACU, Qwen manager | MACU, Opus 4.6 manager |
| --- | --- | --- | --- |
| OSWorld | 43.8% / 26.6 min | 44.9% / 14.2 min | 48.5% / 21.4 min |
| Online-Mind2Web | 52.2% / 18.5 min | 52.4% / 23.6 min | 55.6% / 33.6 min |
| WebTailBench-v2 | 20.8% / 39.0 min | 23.8% / 61.0 min | 29.5% / 55.2 min |
| Odysseys | 8.5% / 162.4 min | 32.0% / 116.3 min | **34.0% / 110.3 min** |

The main-deck slide shows only Odysseys and Online-Mind2Web. On the long Odysseys tasks MACU quadruples success *and* is faster; on Online-Mind2Web it gains 3.4 points but takes nearly twice as long. "More useful work can improve accuracy while increasing elapsed time."

**CAID: isolated workspaces support integration (slides 71–72, appendix 95).** Geng & Neubig (2026; covered in L18) run software-engineering agents asynchronously. A central manager does dependency-aware task delegation; engineers A and B each work in their own git worktree, implement, self-verify by running code, and commit; the manager merges commits and runs integration tests, then does final review. "Worktrees isolate edits. Integration must preserve behavior." The appendix chart varies the number of engineers (2, 4, 8) on Commit0-Lite and PaperBench. Runtime rises with team size (roughly 1,200 → 1,750 s on Commit0-Lite and 2,100 → 3,550 s on PaperBench), and cost rises steeply (roughly $5 → $14 and $6 → $16), all above the single-agent dashed lines. Score does not keep rising: Commit0-Lite peaks at 4 engineers (about 59%) and drops at 8 (about 50%); PaperBench is flat at about 63–64%. "Additional workers require effective assignments and integration." (Values are read off the bar chart.)

**MACU and CAID compared (slide 73).**

|  | MACU | CAID |
| --- | --- | --- |
| Worker state | A partially observed computer | A repository in a git worktree |
| Dependencies | Mutable task DAG | Dependency-aware assignments |
| Handoff | Findings, files, retained observations | Commits, merge, executable tests |
| Failure mode | Missing context or incompatible state | Conflicts and broken integration |

"The handoff must preserve the state required by later subtasks."

**Parallelism is bounded by the critical path (slide 74).** Synthetic durations A = 4 min, B = 3 min, C = 2 min. Serially they take 9 min. In parallel they take 4 min (the longest task) **plus coordination**. "Dependencies and coordination add to the longest execution path." In general:

$$
T_{\text{parallel}} \geq \max_{p \in \text{paths}} \sum_{i \in p} t_i \; + \; T_{\text{coord}}, \qquad \text{speed-up} = \frac{T_{\text{serial}}}{T_{\text{parallel}}}
$$

Here t\_i is the duration of task i, the maximum runs over dependency paths in the DAG (the longest one is the critical path), T\_coord is planning, dispatch, merge and integration time, and T\_serial is the sum of all t\_i. With the slide's numbers the best possible speed-up is 9/4 = 2.25×, and any coordination lowers it. This is Amdahl's law in DAG form.

### 7. Summary (slides 75–80)

The summary slides restate each part as two lessons:

| Part | Lesson 1 | Lesson 2 | Bottom line |
| --- | --- | --- | --- |
| Search and learning | Choose where to explore: follow a branch to an unexpanded node, go deeper or try another branch | Learn from search and self-play: root visit distribution → policy head, game outcome → value head | The updated network guides the next search |
| Why AlphaZero transfer is hard | Go moves are easy to revisit: a legal move keeps its identity, while a new thought may create a new branch | Plausible does not mean useful: locally correct thoughts may not advance the solution | Search must improve the decision enough to justify its cost (Eric Jang, Dwarkesh Podcast, 1:45:47) |
| Search within environments | Real actions give real feedback (web actions, proof tactics) | Count the cost of recovery: branches add calls and waits; reset and replay may leave side effects | Before branching, check whether you can get back to the same world state |
| World models | Pick a transition model: RAP and WebDreamer predict consequences; CWM predicts execution traces | Check the planning horizon: errors compound, and longer horizons lowered WebDreamer's success | Evaluate a world model by whether its predictions improve action choices |
| Decomposition | Delegate and schedule: RLM and RAO delegate recursively; LLMCompiler and MACU run tasks when inputs are ready | Make integration a task: CAID isolates changes in worktrees, then merges and tests | The critical path limits speed-up, including coordination and integration time |

The AlphaZero-transfer point deserves emphasis. In Go, MCTS revisits the same move many times, so visit counts accumulate into a reliable statistic. In language, sampling "the same" step again usually yields a *different* string, so the tree keeps widening and no node gets enough visits. This is one reason DeepSeek-R1's paper (§4.2, listed in the references as an "unsuccessful MCTS attempt") reported that MCTS did not help their reasoning training.

## Slide-by-slide companion

Every slide is covered below, numbered 1–100 in PDF page order. The printed numbers on the slides differ (for example, PDF slide 2 is printed "3" and the DeepSeek-Prover slide is printed "41"); use the numbers here. Progressive builds are grouped.

### Slides 1–15: framing, classic search and AlphaGo Zero

**Slide 1 — Search and Planning.** Title slide: JY Koh, 11-768 AI Agents, Fall 2026, CMU logo.

**Slide 2 — Sampling and refining → Structured Search.** Three rounded cards under "Building on the prior lecture". "Last lecture: full attempts — sample and rerank." The middle card, highlighted in blue, reads "Search: partial solutions — maintain a frontier, choose what to expand." The right card: "Today: structured search — learn search policies, predict action effects, coordinate subtasks." The slide is the bridge from L20. Best-of-N needs only a final-answer scorer; partial search needs a way to judge unfinished work, and today's three additions say how to make that work at scale: learn the search, simulate the environment, and split the task. Keep this progression in mind; every later slide adds to one of the three right-hand bullets.

**Slide 3 — Search, simulation, and delegation.** The agenda as five numbered rows with one-line theses: 1 search and learning ("a stronger planner becomes training data"); 2 search for LLMs ("trees, graphs, and serialized exploration"); 3 grounded search ("actions change an executable environment"); 4 world models ("predict consequences before acting"); 5 task decomposition ("delegate work and coordinate dependencies"). The title's three nouns map to the parts: search (1–3), simulation (4), delegation (5).

**Slide 4 — Section divider: Search and Learning.**

**Slide 5 — A brief history of search in AI.** Four colour-graded bars. 1950s–60s: heuristics guide lookahead (chess search, shortest paths with Dijkstra and A\*). 1970s–90s: game-tree pruning; alpha–beta enabled Deep Blue to beat Kasparov in 1997. 2010s: sample, learn and search; AlphaGo used neural networks to guide search. 2020s: search over language and actions; LMs propose thoughts and tool actions for search to explore. The footer links Shannon, Dijkstra, A\*, alpha–beta, Deep Blue, UCT, AlphaGo, AlphaZero, Tree of Thoughts and WebDreamer. The trend is that the hand-written parts of search (move generators, evaluation functions) are gradually replaced by learned ones, and by the 2020s even the actions are generated text.

**Slides 6–7 — Depth-first search (DFS) and Breadth-first search (BFS).** The same seven-node binary tree (A; B, C; D, E, F, G) on both slides, with "visit order: A" and "frontier: B (next), C" rows. DFS's side card says "Stack — push children on top, take from the top", frontier priority LIFO; its subtitle is "follow a branch as far as you can, then backtrack." BFS's card says "Queue — add to the back, take from the front", priority FIFO; subtitle "visit one level before moving to the next." Both note that "the frontier holds nodes waiting to be visited." The point is that a search algorithm is mostly a choice of frontier order. Replace the stack or queue with a priority queue keyed on a value estimate and you get best-first search, which is what Koh et al. use on the web (slide 36).

**Slides 8–12 — Monte Carlo tree search (five-step build).** A root with children A, B, C and four step boxes on the right: choose a branch, expand the leaf, estimate its value, start another pass. Slide 8 states that nodes are states and edges are actions ("keep a tree of candidate moves"). Slide 9 highlights A in red: "sample a branch based on current policy action distribution and previous visit counts." Slide 10 adds children A1, … under A: "expand and rollout from A." Slide 11 adds a "value at A" label: "the value network estimates the outcome at A." Slide 12 shows an arrow from A back to the root and B highlighted: "go deeper or try another branch." Citation: Silver et al., Science 2018. The four steps are selection, expansion, evaluation and backup. Each pass costs one network evaluation, and the statistics it leaves behind (visit counts, mean values) make the next selection smarter. Appendix slide 98 gives the exact selection formula.

**Slide 13 — Expert Iteration.** A loop diagram: neural policy → (guide) → tree search → (collect) → improved decisions, with a red arrow back labelled "train the policy on search decisions". Caption: "Search discovers (improved) decisions that we can train on." Anthony et al., NeurIPS 2017. This is the conceptual core of part 1. Search is a policy-improvement operator: given any policy, search with it produces better decisions; imitating those decisions yields a better policy; repeat. It is the same shape as STaR and rejection-sampling fine-tuning, where "search" is sampling plus a verifier.

**Slide 14 — AlphaGo Zero: policy, search, self-play.** Silver et al., Nature 2017, Figure 1a ("Self-Play"). Board positions s\_1, s\_2, s\_3, … s\_T in a row, linked by moves a\_1 \~ π\_1, a\_2 \~ π\_2, and so on. Under each position a search tree funnels down to a small green bar chart π\_t (the visit-count distribution). The final position s\_T leads to the outcome z. Caption: "Search at each move. Record the visit counts and the final game result." Each self-play game therefore yields T training examples (s\_t, π\_t, z), with no human games involved.

**Slide 15 — Why this loop works well in games.** A table with columns component, board games, and challenge for language models. State: compact board vs history and hidden information. Transitions: exact, cheap simulator vs tools, side effects, or prediction. Actions: legal moves are enumerable vs generated text and tool arguments. Outcome: game result is unambiguous vs task success can be ambiguous. Citation: Silver et al., Science 2018. This slide is the lecture's roadmap in disguise: each language-side cell is a problem that a later part tries to solve.

### Slides 16–32: search over language

**Slide 16 — Section divider: Search over Language.**

**Slides 17–20 — Tree of Thoughts on a Game of 24 instance (four-step build).** Task: "use 1, 3, 4, 6 exactly once to make 24." Slide 17: the root {1, 3, 4, 6} with two children, "1 + 3 = 4" (remaining {4, 4, 6}) and "3/4 = 0.75" (remaining {1, 0.75, 6}). Slide 18: the left child is struck through in red, "dead end with these remaining numbers", and the right edge turns red: "evaluate branches and return to another candidate." Slide 19 extends the right branch downward: "1 − 0.75 = 0.25", then "6 / 0.25 = 24". Slide 20 ("return the final answer") shows the boxed expression 6 / (1 − 3/4) = 24 with the note "the expression uses each input exactly once." Yao et al., NeurIPS 2023. The example is chosen because the obvious first move (adding small numbers) fails and the winning path uses a fraction, which a single left-to-right chain of thought rarely finds. ToT finds it because an evaluator prunes the dead end after one step and the search moves on.

**Slide 21 — Tree of Thoughts: explicit search control.** The ToT paper's Figure 1: four panels, (a) IO prompting (input → output), (c) chain of thought (input → a chain of thought boxes → output), CoT-SC (three parallel chains with a majority vote, one chain red), and (d) ToT, a tree whose nodes are coloured green (kept) or pink (pruned), with a green path to the output. Three labelled roles on the right: frontier ("store partial solutions"), controller (LLM, "pick the next branch"), heuristic (LLM, "rate partial progress"). Caption: "Thought generation, evaluation, and traversal are separate choices." Treat these as three plug-in slots: you can swap BFS for DFS, an LLM vote for a code checker, or one-shot generation for proposal prompts, independently.

**Slide 22 — ToT: search raises Game of 24 success.** A bar chart, GPT-4 on 100 hard problems (original Table 2), y-axis success rate 0–80%. IO 7.3%, CoT 4.0%, CoT-SC with 100 samples 9.0%, ToT breadth 1 45%, ToT breadth 5 74% (bold red). Notes: "Same GPT-4; methods use different inference budgets" and "ToT reaches 74% success on this benchmark." Notice that CoT is *worse* than IO here, and that even 100 sampled chains barely help. Sampling more complete attempts does not fix an early wrong step; pruning partial states does.

**Slides 23–25 — Graph of Thoughts: dependent computations, aggregation (three-step build).** Illustrative sorting example. Slide 23: the input \[7, 2, 9, 1, 6, 3\] splits into "Sort \[7, 2, 9\]" → \[2, 7, 9\] and "Sort \[1, 6, 3\]" → \[1, 3, 6\]. Slide 24 adds red edges from both results into a box "merge both sorted lists". Slide 25 shows the merged output \[1, 2, 3, 6, 7, 9\] in red. Besta et al., AAAI 2024. The new operation relative to ToT is aggregation: a node with two parents. That lets independent sub-solutions be computed separately (short, easy LLM calls) and then combined, which is divide-and-conquer.

**Slide 26 — GoT on 128-number sorting.** A two-bar chart, ChatGPT-3.5, 100 inputs per method, "median sorting error (ToT = 100)": ToT 100, GoT ≈38. Caption: "GoT reduced median sorting error by about 62%." Source: Figure 5, §7.2. The y-axis is an index, not raw errors, because the slide normalizes ToT to 100; the appendix slide 100 explains that ≈38 is derived from the reported reduction.

**Slides 27–29 — Stream of Search worked Countdown trace (parts 1–3).** Monospaced traces from the official DFS serializer (a worked reproduction), with control lines in red. Part 1 ("explore a branch"): from 24:\[4, 6, 7, 8\], explore 4\*6 = 24, move to node #0,0, explore 7+8 = 15, move to #0,0,0, explore 24+15 = 39 → "39,24 unequal: No Solution". Part 2 ("generate a backtrack"): move back to #0,0,0, try 24−15 = 9 (no solution), move back to #0,0, try 8−7 = 1, generating #0,0,1: 24:\[24, 1\]. Caption: "Backtracking appends text; earlier attempts stay in context." Part 3 ("find a solution"): move to #0,0,1, explore 24\*1 = 24 → "24,24 equal: Goal Reached". Caption: "The stream contains exploration, recovery, and a valid solution." Gandhi et al., COLM 2024. The trace format is the key design: search state, operations and node ids are all plain text, so a decoder-only LM can learn the whole search procedure by next-token prediction.

**Slide 30 — SoS: train on every next token.** Three cards. Synthetic data: 500,000 traces from 12 heuristic DFS/BFS strategies, about 57% succeed. Full target sequence: explore, fail, return; failed attempts and moves back stay in the loss. Causal language model: 250M GPT-Neo trained from scratch with a 4,096-token context. Below, the loss L\_SoS(θ) = −E over z in D\_SoS of the sum over t of log p\_θ(z\_t | z\_\<t). Notes: z is the full tokenized trace including problem and control text; the return move after "No Solution" is also a supervised continuation. Caption: "The training target includes both failed explorations and recovery." Because only 57% of traces succeed, the model is trained on many failures, which teaches it what giving up on a branch looks like.

**Slide 31 — SoS: policy improvement after trace training.** From a "pretrained SoS policy" box, two arrows. Left (STaR / Expert Iteration): "sample → filter → fit; keep verified model traces; fit the same next-token loss." Right (APA / reward optimization): "correct and efficient search; reward valid solutions; penalize extra search expansions." Gandhi et al., §6, Algorithms 1–2, plus the APA reward implementation. These are the two standard ways to improve a policy after SFT: filtered self-imitation and RL with a shaped reward (L9, L11).

**Slide 32 — SoS: search-trace training improves accuracy.** Bar chart, "Game of 24 · seen targets, new inputs · 10,000 test problems": optimal-path training 25.73%, Stream of Search 51.27%, SoS + STaR 55.59%, SoS + APA 56.52%. Notes: OP and SoS use a 250M model, 500k examples and the same gradient steps; STaR and APA add training. Caption: "Full search traces improve accuracy by 25.54 percentage points over OP." Most of the gain comes from the change in training data, not from the RL stage; the RL stages add 4–5 points on top.

### Slides 33–42: search within environments

**Slide 33 — Section divider: Search Within Environments.**

**Slide 34 — DeepSeek-Prover searches over Lean proof states.** Left: "Truncate and resume", Figure 2 of Xin et al. (ICLR 2025, p. 5). (a) A Lean 4 file with Mathlib imports and a theorem about the sum of the roots of a polynomial, next to a red "Monte-Carlo Tree Search" box. (b) The tactic state extracted at a node and a "whole-proof completion" in blue. (c) A completion containing an error ("Error from Lean 4: failed to synthesize LinearOrder ℂ") stamped DISCARDED. (d)–(e) Tree nodes drawn as pink dots along the proof, with an "Expansion" arrow. Right: the same error, enlarged, under "When Lean finds an error", and three steps: generate a proof continuation; keep the steps Lean accepts; resume from a checked state. The tree's nodes are verified proof prefixes, so every node in the search is known to be correct so far. This is search with a perfect partial-solution checker, which is exactly what most language tasks lack.

**Slide 35 — LATS: reasoning, acting, and planning.** The LATS paper figure in six panels: 1) selection (a red edge from Input to S1); 2) expansion (S1 gets children S2); 3) evaluation (S → LM → Value); 4) simulation (a path S1 → S2 → S3 → … → Output); 5) backpropagation (red arrows flowing back up the path); 6) reflection (Output → LM → Reflection, added to the state S). Caption: "Each expansion can acquire and condition on environment outcomes." Zhou et al., ICML 2024. LATS is MCTS where the simulator is the real environment and the value comes from an LM, plus Reflexion-style memory of failures.

**Slide 36 — Tree search on realistic web tasks.** Koh et al., 2024 / TMLR 2025. Left: a photo of two cans of AROY-D canned fruit and the task "Can you add this and the other canned fruit (of the same brand) that looks like this, but red instead of brown to the comparison page?" Top right (pink): the GPT-4o agent takes steps 1–4 and ends at "Failure". Bottom right (yellow): the GPT-4o agent plus search starts at v = 0.5, expands nodes 2–10 with value badges (0.45, 0.4, 0.45, 0.5, 0.55, 0.3, 0.55, 0.68, 0.2), backtracks along blue dashed arrows, and reaches node 10 with v = 1.0 and "Success". The legend marks step sequence, backtracking and state values. Caption: "Best-first search explores actual environment states." The figure shows the two ingredients that matter: a value function good enough to rank pages, and the ability to return to earlier pages.

**Slides 37–39 — A search branch executes real actions (three-step build).** Illustrative task: "find a refundable room for the conference dates." Slide 37: from "hotel results page", the branch "open hotel A" observes "non-refundable rate"; caption "expansion acts on the website, and returns a new observation." Slide 38 adds "open hotel B" observing "free cancellation"; caption "a second branch requires a way back to the earlier state." Slide 39 adds a red arrow from hotel A back to the results page labelled "reset and replay the action prefix"; caption "backtracking requires an environment operation." In a pure language search, going back is free (you just pick another node from memory). On a website, the browser is *at* hotel A, so getting to hotel B costs a reset and a replay of every action on the path, each with its own latency and failure risk.

**Slide 40 — Observed transitions help. Resets remain expensive.** Horizontal bars, "success rate (%) · 5-step agents": VisualWebArena (GPT-4o + SoM) 18.9% without search, 26.4% with; WebArena (GPT-4o) 15.0% without, 19.2% with. Right column: "reset and replay add latency", "hidden server state can matter", "some actions cannot be undone". Koh et al., TMLR 2025, Table 2, §4.2. The gains (+7.5 and +4.2 points) are real but came from benchmarks where resetting is possible; the right-hand list explains why the same method is risky on the live web.

**Slide 41 — Search by acting changes the environment.** Three cards. State changes, "act on the world": actions can change the state of the world. Latency, "wait": branches add tool calls, waits and LLM calls. Backtracking, "recover state": backtracking may not fully recover the original state. Citations: Koh et al. §5.4 / App. A.4.1; Gu et al., WebDreamer §1. These three costs are the price list against which every grounded-search gain must be weighed.

**Slide 42 — Backtracking after a state-changing action.** Three browser windows with server-state badges. Before: "checkout form", server: no order. Submit order: "order confirmed", server: order exists (red). Browser back: "checkout form" again, but server: order exists (red outline). Caption: "Could we estimate outcomes instead of executing actions?" The browser's back button restores the *page*, not the *world*. The question at the bottom is the hand-off to world models.

### Slides 43–54: world models

**Slide 43 — Section divider: World Models.**

**Slide 44 — Verifiers and world models.** Two vertical pipelines. Verifier: "observed execution" → "correctness / success". World model: "state + proposed action" → "predicted state / reward". Caption: "A world model predicts the effects of an action." Right: WebDreamer Fig. 1c ("model-based planning"), a tree of web-page thumbnails where imagined pages are drawn inside clouds, purple dotted arrows mark simulated branches, green arrows mark the chosen path, and a green check marks the goal. Citations: Schrittwieser et al., Nature 2020 (MuZero); Gu et al., WebDreamer. The distinction matters because the two are often confused: a verifier needs the action to have happened; a world model is consulted before it happens.

**Slide 45 — World Models: learning inside a dream.** Left: "What is a world model? Predicts how the environment changes in response to an action", with a small flow: current state + action → Model → predicted next state. Text: Ha & Schmidhuber (NeurIPS 2018) trained a controller in a learned VizDoom simulator and tested it in the original game. Right: a blurry, low-resolution corridor frame from the authors' interactive demo, captioned "a rollout inside the model's 'dream'". The blur is the point: the dream does not need to be photorealistic, only accurate enough in the features the controller uses (here, incoming fireballs).

**Slide 46 — RAP: the language model predicts state changes.** Hao et al., EMNLP 2023, paper figure. Top: chain of thought, a language-model robot producing s\_0 → a\_0, a\_1, a\_2 … → s\_T in one pass. Bottom: RAP, where the robot (language model) proposes action a\_t to a "world model" (a globe in a thought bubble) that returns state s\_t+1 and reward r\_t; on the right, an MCTS tree over states s\_0, s\_1, s\_2, s\_T with red reward arrows r\_0, r\_1, r\_T backed up. Caption: "Separate proposing an action from predicting its consequence." Using one LLM in two prompts is cheap, but the world-model role is only as good as the LLM's knowledge of the domain.

**Slides 47–49 — WebDreamer: imagine before acting (three-step build).** Task: "find the cheapest 512 GB disk in Data Storage." Slide 47: from the "observed storefront", three candidate actions (click Office Products, click Electronics, type "Disk") and a red box of "predicted page changes": Office subcategories including Office Electronics; Computers & Accessories, then Data Storage; a page of search results. Question: "which predicted path leads to Data Storage?" Slide 48 adds scores 0.4, 0.8 (red) and 0.1. Slide 49 highlights "click Electronics", shows a red button "click Electronics in browser" with "replan from the new observation", and a screenshot of the real "observed Electronics page". Adapted from Gu et al., Fig. 2. Simulation is used only to rank the *next* action; the agent never trusts a long imagined path.

**Slide 50 — Longer imagined horizons can reduce success.** WebDreamer Fig. 5: a bar chart of success rate against planning horizon (GPT-4o on Online-Mind2Web). Horizon 1: 37%; horizon 2: 32%; horizon 3: 32%. A dotted line at 26% marks the reactive agent. Right: "an imagined next click may be unavailable"; "errors accumulate across predicted steps". Footer: "main experiments use one-step lookahead." Every horizon still beats the reactive agent, but the best is the shortest.

**Slide 51 — Code World Model (CWM).** "A 32B open-weights language model trained to predict how code and actions change computational state." The training-pipeline figure (Fig. 1, p. 2): pre-training (general pre-training, 8T tokens, 8k context → code world modeling mid-training, 5T tokens, 131k context → "CWM pretrained"), then post-training (SFT for instruction and reasoning, 100B tokens, 32k context → "CWM sft"; joint RL, agentic and reasoning, 172B tokens, 131k context → "CWM"). Two boxes below: "Python: statement → variable state" and "Docker: command / edit → output". Meta FAIR CodeGen Team, 2025. The world-model skill is put in at mid-training, before any agent RL, so the RL stage starts from a model that already "knows" what code does.

**Slide 52 — CWM: predicting Python execution traces.** Figure 3: two rows of tokens. Row 1: `<|line_sep|>`, a frame {"s": "..", "t": ".."}, `<|action_sep|>`, the statement `n = 0`. A `<|frame_sep|>` bar. Row 2: `<|line_sep|>`, the frame {"s": "..", "t": "..", "n": "0"}, `<|action_sep|>`, the next statement `for c in s:`. Below, enlarged: Python statement `n = 0` → predicted next frame includes {"n": "0"}. Caption: "CWM learns to predict how each Python statement changes local variables." The format is a learnable debugger: given the locals and the next line, predict the new locals.

**Slide 53 — Executable code can become the simulator.** Left: a code box with `def transition(state, action)` that applies the action, computes `reward = goal(next_state)` and returns both. Right: "LLM writes / revises code" → "planner runs the simulator". Caption: "Model correctness must extend beyond the observed examples." Citations: Tang, Key & Ellis, NeurIPS 2024 (WorldCoder); Dainese et al., NeurIPS 2024 (GIF-MCTS). A code world model is cheap to run millions of times and inspectable, but if it encodes a wrong rule, the planner will exploit that rule confidently.

**Slide 54 — World model choices.** A three-column table: representation, examples, main risk. Natural-language consequences (RAP, WebDreamer): plausible but incorrect futures. Learned execution dynamics (CWM): prediction errors and distribution shift. Executable transition program (WorldCoder, GIF-MCTS): a wrong rule becomes a fast simulator. Caption: "Evaluate whether predictions improve decisions." Each representation trades flexibility for checkability; prose is the most flexible and least checkable, code the reverse.

### Slides 55–64: decomposition and recursive delegation

**Slide 55 — Section divider: Decomposition and Parallelism.**

**Slide 56 — Candidate attempts and complementary subtasks.** Two small trees. Left, "prior: candidate attempts": "same complete task" → attempt A, attempt B → "select or synthesize answers". Right, "today: task dependencies": "complementary work" → collect sources, run experiments → "combine the required outputs". The difference is logical: attempts are an OR (one good one suffices), subtasks are an AND (all are needed). That changes the failure maths: with independent success probabilities, parallel attempts raise the chance of success, while parallel subtasks multiply their failure risks unless each is checked.

**Slides 57–58 — RLM: treat the prompt as external data (two-step build).** Slide 57: a black "root language model" box sends "code" to a blue "persistent REPL" box containing `prompt = long_document` and "inspect, filter, split, compute". Caption: "The root accesses a long input through code." Slide 58 adds two pink boxes below the REPL, LM(snippet A) and LM(snippet B), with the red caption "subcalls solve selected pieces of context (sequential in the evaluated implementation)". Zhang, Kraska & Khattab, 2025/2026. The root's context holds only code and small outputs, never the full document, so input length is limited by the REPL's memory, not the model's context window.

**Slide 59 — RLM benchmark results.** Two horizontal bar panels; GPT-5 root model, RLM subcalls on GPT-5-mini. BrowseComp-Plus (6–11M tokens, accuracy %): compaction 70.5, REPL only 88.0, RLM depth 1 91.3 (red), OpenCode + offload 94.0. OOLONG-Pairs (32K tokens, answer-set F1 %): direct GPT-5 0.1, REPL only 43.9, RLM depth 1 58.0, RLM depth 3 76.0 (both red). Footer: "Direct GPT-5 exceeded its context window on BrowseComp-Plus." Table 1 of the 2026 paper. Two lessons: most of the gain comes from moving the input into a REPL at all (REPL only), and recursion depth helps most on quadratic tasks like OOLONG-Pairs where every pair of records must be compared.

**Slide 60 — When are RLMs useful?** Three rows. Read selectively: "code can scan a corpus and bring only the relevant passages into the model's context." Delegate judgments (highlighted): "subcalls can label batches of records; code can then combine those labels across the full dataset." Choose depth by task: "on CodeQA, Qwen3-Coder scored 66% with the REPL alone and 44% at recursion depth 3." §4, Table 1. Recursion is a tool, not a default. Each level adds calls and a chance to lose information in a summary.

**Slide 61 — RAO learns when and how to delegate.** A tree: "shared policy θ" at the top; two "agent instance θ" boxes; under the left one, two "child θ" boxes. Text: delegate a subtask; choose context and requested output; aggregate returned results. Gandhi et al., RAO, 2026. Every node is the same model, so training improves both the delegator and the worker at once (the RL credit flows through the whole recursion tree).

**Slide 62 — RAO: learned recursive execution.** The paper figure: a root agent (depth 0) with the task of planning a 3-day Kyoto trip for a family in early April (cherry blossoms, one quiet temple, one kid-friendly activity, dinner near Gion, avoid crowds). Its action launches two sub-agents with `asyncio.gather` and later synthesizes their returns. Sub-agent A (depth 1) finds cherry-blossom timing and less-crowded spots (Philosopher's Path in the morning, Kyoto Botanical Gardens). Sub-agent B (depth 1) splits again into sub-sub-agents B.1 (a quiet temple: Shoren-in) and B.2 (a kid-friendly activity: Kyoto Railway Museum) and also searches for dinner. Right column: shared policy (copies of the same agent), delegation (learn subtask and context choices), execution (support asynchronous subcalls). Caption: "Useful delegation depends on the task and the training signal." L18 covers RAO's training in more detail.

**Slide 63 — RAO: benchmark results.** Three small grouped-bar panels, grey = trained single agent, red = RAO with delegation. TextCraft-Synth (synthetic crafting trees, success %): 73 → 96. Oolong-Real (long transcript aggregation, average reward): 0.203 → 0.320. DeepDive (multi-hop web research, success %): 24 → 40. Footer: same backbone within each benchmark, 256K evaluation context. Tables 1–3. All three tasks have structure a single context struggles with: deep recipe trees, transcripts too long to read at once, and many-hop searches.

**Slide 64 — When does learned delegation help?** Two bar panels of wall-clock seconds on tasks both methods solved. Hard TextCraft-Synth: single agent 180.0, RAO 73.3 ("independent recipe branches can run together"). DeepDive: single agent 13.3, RAO 233.0 ("later searches depend on earlier findings"). A blue box, "What RAO learned": it delegated deeper on harder recipes and usually used one layer of workers to read separate chunks on Oolong-Real. §§4–5 and Tables 1, 3. Delegation is a latency win only where the task graph is wide; on a chain-shaped task it buys accuracy at a large time cost.

### Slides 65–74: planners, dependency graphs and integration

**Slide 65 — LLMCompiler: schedule a dependency graph.** Kim et al. (ICML 2024) paper figure, left to right. A user asks "How much does Microsoft's market cap need to increase to exceed Apple's market cap?" A function-calling planner writes a "DAG of tasks": $1 = search(Microsoft Market Cap), $2 = search(Apple Market Cap), $3 = math($1 / $2), $4 = llm($3), with colour-coded dependency dots. A task fetching unit (a loop of coloured dots) "fetches task" and "resolves dependency" with an executor that holds four tool+memory slots, connected to tools (search, math, …, llm). Caption: "Dispatch a task when its required inputs are available." Also cites HuggingGPT (Shen et al., NeurIPS 2023). This is a compiler's view of tool use: plan once, then run independent calls in parallel instead of ReAct's one-call-per-thought loop.

**Slides 66–68 — A planner exposes which work can run together (three-step build).** A DAG: "read request" → compare flights, compare hotels, check weather → "build itinerary". Slide 66 caption: "dependencies describe required inputs." Slide 67 outlines the three middle tasks in teal: "three ready subtasks run independently." Slide 68 highlights "build itinerary" in red: "combine results, then revise the plan." Koh, Salakhutdinov & Fried, MACU, 2026. The last caption hints at what MACU adds over LLMCompiler: the plan is revised after results arrive, instead of being fixed at the start.

**Slide 69 — MACU: a manager maintains a mutable task DAG.** Paper figure of a "scheduler loop". Input user task → Manager (red) → a DAG panel (completed subtasks with green ticks, ready subtasks dark, pending ones dotted: nodes C, E, F, G) → "parallel CUA subagents" (CUA 1 … CUA N) above a "virtual machines pool" (VM 1 … VM N) → a "follow up loop" where "subagent done" goes to the Manager, which answers "continue" (with "updated instructions" sent back) or "done". A dashed arrow "initialize / replan graph" and a bottom loop "continue working" close the cycle. The output is a summary and deliverables. Caption: "Planning, execution, and replanning continue as evidence arrives." Each worker has a whole computer, so subtasks that need a browser or desktop app do not fight over one screen.

**Slide 70 — MACU: quality and latency depend on the workload.** Paired horizontal bars, grey single agent vs red MACU. Success rate: Odysseys 8.5% → 34.0%; Online-Mind2Web 52.2% → 55.6%. Median elapsed time (minutes): Odysseys 162.4 → 110.3; Online-Mind2Web 18.5 → 33.6. Qwen3.6-27B workers; MACU uses an Opus 4.6 manager. Caption: "More useful work can improve accuracy while increasing elapsed time." Long, multi-site tasks (Odysseys) benefit on both axes; short tasks pay coordination overhead for a small gain.

**Slide 71 — CAID: isolated workspaces support integration.** A simple tree: central manager → engineer A (git worktree A) and engineer B (git worktree B) → a pink box "merge commits, run integration tests". Geng & Neubig, 2026. Worktrees give each engineer its own checkout of the same repository on its own branch, so edits cannot collide until the explicit merge.

**Slide 72 — CAID: delegation includes branch-and-merge.** The paper figure (also on L18 slide 16): a Manager robot doing "dependency-aware task delegation"; "assign next tasks" into a dashed region "asynchronous execution in isolated workspace" with Engineers 1–3, each looping "task implementation" ↔ "executable self-verification" and then `git commit`; a `git merge` by the manager feeds back; on the right, the Manager does "final review & integration". Caption: "Worktrees isolate edits. Integration must preserve behavior."

**Slide 73 — MACU and CAID integrate different kinds of state.** A comparison table. Worker state: a partially observed computer (MACU) vs a repository in a git worktree (CAID). Dependencies: mutable task DAG vs dependency-aware assignments. Handoff: findings, files, retained observations vs commits, merge, executable tests. Failure mode: missing context or incompatible state vs conflicts and broken integration. Caption: "The handoff must preserve the state required by later subtasks." Code has a natural integration test (does it build and pass); computer-use findings do not, which is why MACU's handoff is the riskier one.

**Slide 74 — Parallelism is bounded by critical path (Amdahl's Law).** Synthetic task durations. Serial row: A 4 min, B 3 min, C 2 min, total 9 min. Parallel row: A, B and C stacked as overlapping bars, labelled "4 min + coordination" in red. Caption: "Dependencies and coordination add to the longest execution path." The best speed-up here is 9/4 = 2.25× even with unlimited workers; coordination time comes straight off it.

### Slides 75–82: summary

**Slide 75 — Section divider: Summary.**

**Slide 76 — Summary 01: Search and learning.** Left panel, "search / explore the tree": board state → move A (red), move B, move C; "return to the root for each new pass." Right panel, "learning / feed search back": root visit distribution → policy head; game outcome → value head; "updated network guides the next search." Two takeaways: (1) choose where to explore: follow a branch to an unexpanded node, or go deeper or try another branch; (2) learn from search and self-play: train the policy and value heads to improve predictions. This compresses slides 8–14 and 99 into one picture of the AlphaZero loop.

**Slide 77 — Summary 02: Why the AlphaZero transfer is difficult.** Left, "Go: revisit stable moves": a small Go board with move A (marked "revisited"), B and C. Right, "Language: generate new thoughts": a prompt with thought 1, 2, 3, … and "different continuations". Takeaways: (1) Go moves are easy to revisit: a legal move keeps the same identity, while a new thought may create a new branch; (2) plausible does not mean useful: locally correct thoughts may not advance the eventual solution. Bold line: "Search must improve the decision enough to justify its cost." Source: Eric Jang on the Dwarkesh Podcast (1:45:47). MCTS's statistics rely on revisiting the same edge many times. When every sample is a new string, visit counts never build up and the tree degenerates into wide, shallow sampling, which is just L20's best-of-N at higher cost.

**Slide 78 — Summary 03: Search within environments.** Left, "act / observe what changes": page before action → open details (page changes) or submit order (server state changes, red). Right, "backtrack / check what persists": checkout (no order) → submit → confirmation (order exists) → back → checkout (order exists); "the same page can hide a different world state." Takeaways: (1) real actions give real feedback (web actions and proof tactics reveal observations the agent can use to choose its next branch); (2) count the cost of recovery (every branch adds tool calls and waits; reset and replay may leave side effects in place). Bold line: "Before branching, check whether you can get back to the same world state."

**Slide 79 — Summary 04: World models for search.** Left, "simulate / compare possible outcomes": current state → imagine action A (likely blocked) or imagine action B (likely succeeds, red). Right, "act / check against the real world": choose action B → execute B → observe result → replan. Takeaways: (1) pick a transition model: RAP and WebDreamer predict consequences, CWM predicts execution traces; (2) check the planning horizon: prediction errors can compound, and in WebDreamer longer imagined horizons lowered success. Bold line: "Evaluate a world model by whether its predictions improve action choices."

**Slide 80 — Summary 05: Decomposition and parallelism.** Left, "delegate / pass only the needed context": root agent → inspect code (relevant files) and read test logs (relevant logs). Right, "schedule / join dependent results": plan → worker A, worker B → merge + test (red). Takeaways: (1) delegate and schedule: RLM and RAO delegate recursively; LLMCompiler and MACU run tasks when their inputs are ready; (2) make integration a task: CAID isolates changes in git worktrees, then merges them and runs integration tests. Bold line: "The critical path limits speedup, including time spent coordinating and integrating."

**Slide 81 — Thanks!** Closing slide.

**Slide 82 — Section divider: Appendix.**

### Slides 83–90: appendix on language search, WebDreamer and RLM

**Slide 83 — ToT: parse an evaluator response.** Three panels. Value prompt: {1, 0.75, 6}, "can these numbers reach 24?" Illustrative LM response: 6 / (1 − 0.75) = 24, then "sure" in red, noted as the "last line read by the parser". Parser lookup table: impossible → 0.001, likely → 1, sure → 20 (highlighted). Caption: "Hand-chosen search weights, not probabilities." Links: ToT official code, evaluator prompt and label parser. The evaluator is a *lookahead* prompt: the LM tries to finish the puzzle mentally, and its confidence label becomes the node's value. Only the last line is parsed, so the reasoning before it is free-form.

**Slide 84 — ToT: combine three evaluations.** Three cards for the same candidate state: evaluation 1 sure (20), evaluation 2 likely (1), evaluation 3 sure (20). Sum: 20 + 1 + 20 = 41. Caption: "Keep the five highest-scoring candidate states." Source: ToT official code (weight aggregation; three evaluations, breadth five). Because "sure" is weighted 20× "likely", one confident vote dominates; a state with three "likely" votes (3) loses to a state with one "sure" and two "impossible" (20.002).

**Slide 85 — GoT: merge the content of two thoughts.** Note: "illustrative sorting example; official 32-number graph uses ten merge samples." Selected sublists \[2, 7, 9\] and \[1, 3, 6\], "both have zero local errors" → LLM merge prompt (abridged): "Combine both sorted lists. Compare the heads; append the smaller; repeat. Return only the merged list." → one new candidate \[1, 2, 3, 7, 6, 9\] with E = 1, "scored afresh by code". Caption: "Aggregation combines content; parent scores are not added." The LLM made a swap mistake even though both inputs were perfect, which is why each merge is sampled ten times and rescored.

**Slide 86 — GoT: score each merged list afresh.** The scorer E(y; x) = sum over digits d = 0–9 of |c\_y(d) − c\_x(d)| plus the number of adjacent descents in y. A table of three candidates: A \[1, 2, 3, 7, 6, 9\]: count errors 0, descents 1, error 1. B \[1, 2, 3, 6, 6, 9\]: count errors 2, descents 0, error 2. C \[1, 2, 3, 6, 7, 9\]: 0, 0, error 0 → keep. Notes: "A: one adjacent descent. B: extra 6 and missing 7. C: correct." Caption: "Keep the lowest-error merge; then sample repairs and rescore." Sources: official sorting scorer; merge / keep / repair graph; outputs are illustrative. A programmatic scorer like this is what makes GoT reliable on sorting; on open-ended tasks it would be replaced by an LLM judge, with all of L20's verifier caveats.

**Slide 87 — Graph of Thoughts: aggregation and refinement.** The GoT paper's comparison figure in five panels: basic IO; chain of thought (key novelty: intermediate LLM thoughts within a chain); multiple CoTs / CoT-SC (harnessing multiple independent chains, selecting the chain with the best score, abandoning others); Tree of Thoughts (branching out from a chain, backtracking, intermediate thoughts also scored); and Graph of Thoughts, "this work" (refining loops on a thought, backtracking, aggregating thoughts and aggregating chains). Legend: unscored, positive-score (green) and negative-score (red) thoughts; dependencies; abandon thought (bin); backtrack. Caption: "Aggregation permits information to flow across reasoning branches." Each panel strictly generalizes the one before it.

**Slide 88 — Learning search dynamics: SoS and Searchformer.** Figure from Stream of Search: (a) a search problem (target 50, numbers 39, 66, 33, 13; solution 39 + 13 = 52, 66 / 33 = 2, 52 − 2 = 50) explored by diverse search strategies (coloured trees); (b) streams of search, text traces with labelled spans for start state, backtracking, search strategy and goal state; (c) pre-training plus policy improvement: the language model trained on traces, then APA and STaR yield improved search strategies. Right column: search traces include exploration and mistakes; learning means predicting the serialized process; evidence from Countdown and structured planning. Citations: Gandhi et al., COLM 2024; Lehnert et al., COLM 2024 (Searchformer). Caption: "Training can expose exploration, including failed branches."

**Slide 89 — WebDreamer: simulation and action selection.** The paper's Figure 2. Left: a "One Stop Market" storefront screenshot with the task "navigate to the Data Storage category and purchase the least expensive disk with 512GB of storage" and three numbered candidate actions (type "Disk", click Office Products, click Electronics). Middle, "Stage I: Simulation": for each candidate, an LLM-written description of the next page and of a second imagined step, each ending in a value (v = 0.4, 0.8, 0.1). Bottom, "Stage II: Execution": the real Electronics page after clicking. Right column: propose candidate actions; simulate likely state changes; execute one action and replan. Caption: "After one real action, planning starts from the new observation."

**Slide 90 — RLM: context decomposition changes the computation.** The RLM paper figure. An outer box "RLM (root / depth = 0)" with a language model above an "Environment E" (a REPL). The prompt ("You are reading an extremely long book. Can you list out all items that were made before the Great Catastrophe?") is loaded as a variable, not given to the LM directly (a red ✗ on the direct path). REPL cells show `print(prompt[:100])`, splitting by "Chapter" into parts, calling `llm_query` on parts, and `print(FINAL_ANSWER)`. Arrows go to two "RLM (depth = 1)" boxes with narrower prompts ("In Chapter 1, find all items that are listed to belong to people with …"; "Look for the items in these sections that explicitly say they were found…"), whose sub-responses return to the root. A final response box lists the items. Right column: external context (inspect prompt data in a REPL); recursion (call an LM on selected snippets); implementation (evaluated calls are sequential). Caption: "Recursive calls isolate context and return structured intermediate results."

### Slides 91–100: references and appendix evidence

**Slide 91 — References: search and policy learning.** Two columns of linked titles. Left: Expert Iteration (Anthony, Tian & Barber, NeurIPS 2017); AlphaGo Zero (Silver et al., Nature 2017); AlphaZero (Silver et al., Science 2018); ReST-MCTS\* (Zhang et al., NeurIPS 2024). Right: Tree of Thoughts (Yao et al., NeurIPS 2023); Graph of Thoughts (Besta et al., AAAI 2024); Stream of Search (Gandhi et al., COLM 2024); Searchformer / Beyond A\* (Lehnert et al., COLM 2024); DeepSeek-R1 original §4.2, "unsuccessful MCTS attempts" (v1, 2025). The last item is a deliberate counterpoint: DeepSeek's report that MCTS did not scale for their LLM training. All are linked in References below.

**Slide 92 — References: grounded search and world models.** Left: Language Agent Tree Search (Zhou et al., ICML 2024); Tree Search for Language Model Agents (Koh et al., 2024 / TMLR 2025); DeepSeek-Prover-V1.5 (Xin et al., 2024); MuZero (Schrittwieser et al., Nature 2020). Right: Reasoning via Planning (Hao et al., EMNLP 2023); WebDreamer (Gu et al., 2024/2025); Code World Model (FAIR CodeGen Team, 2025); WorldCoder (Tang, Key & Ellis, NeurIPS 2024); Generating Code World Models (Dainese et al., NeurIPS 2024).

**Slide 93 — References: decomposition and coordination.** Left: Recursive Language Models (Zhang, Kraska & Khattab, v3, 2026); Recursive Agent Optimization (Gandhi et al., v2, 2026); ADaPT (Prasad et al., Findings of NAACL 2024); HuggingGPT (Shen et al., NeurIPS 2023). Right: LLMCompiler (Kim et al., ICML 2024); Multi-Agent Computer Use (Koh, Salakhutdinov & Fried, 2026); CAID / Asynchronous SWE Agents (Geng & Neubig, v2, 2026); Discriminative World Models (Li et al., 2026, marked "further reading"). ADaPT is not discussed on any slide; it decomposes a task only when the executor fails ("as-needed" decomposition), a useful contrast to planning a full DAG up front.

**Slide 94 — Appendix: MACU results across four benchmarks.** Grouped horizontal bars for three configurations, all with Qwen3.6-27B workers: single agent (dark grey), MACU with a Qwen manager (light blue), MACU with an Opus manager (red). Success rate: OSWorld 43.8 / 44.9 / 48.5; Online-Mind2Web 52.2 / 52.4 / 55.6; WebTailBench-v2 20.8 / 23.8 / 29.5; Odysseys 8.5 / 32.0 / 34.0. Median time (minutes): OSWorld 26.6 / 14.2 / 21.4; Online-Mind2Web 18.5 / 23.6 / 33.6; WebTailBench-v2 39.0 / 61.0 / 55.2; Odysseys 162.4 / 116.3 / 110.3. Caption: "Compare success and time under the same manager configuration." Two observations: most of the Odysseys gain survives with the weaker Qwen manager (32.0%), so the DAG structure, not just a stronger manager model, does the work; and on OSWorld the Qwen-managed MACU is both slightly better and about twice as fast.

**Slide 95 — Appendix: more CAID engineers increase cost.** Three bar charts versus number of engineers (2, 4, 8), orange = Commit0-Lite, green = PaperBench, dashed lines = single-agent baselines. Runtime (s): Commit0-Lite about 1,200 / 1,600 / 1,750, PaperBench about 2,100 / 3,450 / 3,550; single-agent lines near 700 and 1,800. Score (%): Commit0-Lite about 34 / 59 / 50, PaperBench about 63 / 64 / 64; single-agent lines in the mid-50s. Cost ($): Commit0-Lite about 5 / 8 / 14, PaperBench about 6.5 / 11 / 16; single-agent lines near 2 and 3.5. Caption: "Additional workers require effective assignments and integration." (Values read off the chart.) Score saturates by 4 engineers while cost keeps climbing, so the right team size is small.

**Slide 96 — ReST-MCTS\*: search becomes training data.** Paper figure: training questions {(Q\_i, y\_i)} feed an MCTS\* tree whose path s\_1 → s\_2 → s\_3,1 → s\_4,1 → A\_1 carries values v = 0, 0.25, 0.5, 0.75, 1 and weights w = 0.25 per step; A\_1 = y\_1 is correct (green tick) while a sibling A\_2 ≠ y\_1 is wrong (red cross). The traces produce PRM training data (partial solutions with values v⁺ and v⁻) and policy data (correct traces τ⁺), and "LLM self-training" updates the PRM V\_θ and the policy π\_φ, which guide the next round. Right column: search (collect reasoning traces), supervision (use known training answers), self-training (update policy and reward models). Caption: "Alternate search with policy and reward-model training." This is Expert Iteration for LLM reasoning, with a learned process reward model standing in for AlphaZero's value head.

**Slide 97 — AlphaGo Zero self-play and training.** The full Figure 1 of Silver et al. (Nature 2017): (a) self-play, as on slide 14; (b) neural-network training, where each position s\_t goes through f\_θ to give move probabilities p\_t (trained toward π\_t) and value v\_t (trained toward z). Right column: search (use MCTS at each move), self-play (play to a game outcome z), learning (fit policy and value targets).

**Slide 98 — MCTS selection with PUCT.** A root s with children A (P = 0.60, N = 4, Q = 0.60), B (P = 0.25, N = 3, Q = 0.40) and C (P = 0.15, N = 2, Q = 0.55); the formula Q(s,a) + c·P(s,a)·√N(s) / (1 + N(s,a)); PUCT scores A = 0.96, B = 0.59, C = 0.70; selection, expansion, evaluation and backup boxes with selection highlighted. Footnote: synthetic single-agent example, c = 1, root N = 9 before this simulation. Silver et al., Science 2018. The detailed notes work through the arithmetic.

**Slide 99 — AlphaZero policy and value losses.** A three-box flow: current network (policy p\_θ and value v\_θ) → self-play with MCTS (states, visit targets, outcomes) → train the network (policy loss and value loss). The loss L(θ) = (z − v\_θ(s))² − Σ\_a π\_search(a | s) log p\_θ(a | s), with the first term braced "value loss" and the second "policy loss". Glossary: z final game outcome, v\_θ network outcome prediction, π\_search MCTS move distribution, p\_θ network move probabilities, s self-play state, a legal move, θ network parameters. "Regularization omitted." Silver et al., Science 2018.

**Slide 100 — GoT sorting and set-intersection results.** ChatGPT-3.5, 100 inputs per configuration, task-specific graphs. Left, 128-number sorting, median error index (ToT = 100, lower better): ToT 100, GoT ≈38 ("derived from the reported reduction"). Right, 32-element set intersection, exact success rate: IO 7%, CoT 6%, ToT 31%, ToT2 29% ("a deeper, narrower tree"), GoT 43%. Footer: "Sorting: ≈62% lower median error and >31% lower cost versus ToT." Caption: "GoT improves the quality–cost tradeoff in these task-specific configurations." Besta et al., Figures 5–6, §7.2.

## Going deeper

The ideas in this lecture come from three older traditions (game-tree search, model-based reinforcement learning and parallel scheduling), and knowing where each comes from makes it easier to see when it will work for an agent.

### Lineage of MCTS and PUCT

Monte Carlo tree search became practical with **UCT** (Kocsis & Szepesvári, 2006), which treats each node's child choice as a multi-armed bandit and applies the UCB1 bound: mean value plus c·√(ln N(s) / N(s,a)). UCT made computer Go competitive at amateur level using random rollouts. AlphaGo (Silver et al., Nature 2016) replaced random rollouts with a policy network for priors and a value network for leaf evaluation, initially trained from human games. AlphaGo Zero (2017) removed the human data, and AlphaZero (2018) applied the same algorithm to chess and shogi. **MuZero** (2020) removed the rules too: it learns a latent dynamics model and plans inside it, which is the bridge from part 1 to part 5 of this lecture. The PUCT variant used by these systems differs from UCB1 in two ways: the exploration bonus is scaled by a learned prior P(s,a), and it decays as 1/(1+N(s,a)) rather than with a logarithm. That makes the search lean heavily on the policy, which is good when the prior is strong and bad when it is miscalibrated.

### Why search plus learning keeps winning

Sutton's essay "The Bitter Lesson" (2019) argues that the two methods that scale with compute are **search** and **learning**. Expert Iteration is the cleanest way to combine them: search turns compute into better decisions, and learning amortizes those decisions into a fast policy so the next round of search starts higher. The same template appears outside games under other names: STaR and rejection-sampling fine-tuning (sample, filter by a verifier, train), ReST-MCTS\* (search with a PRM, train policy and PRM), and SoS + STaR (search traces as data). In each case the quality of the improvement operator is bounded by the quality of the scorer. For games the scorer is the game result; for LLM reasoning it is usually a final-answer checker or a process reward model (Lightman et al., "Let's Verify Step by Step", 2023), and for agents it is an environment reward or an LLM judge (T12).

### Why MCTS has been hard for LLMs

The DeepSeek-R1 paper (§4.2, cited on slide 91) lists MCTS among its unsuccessful attempts. Its reasons line up with slides 15 and 77. Token-level or step-level generation has an enormous branching factor, so they had to cap the number of children per node, which can trap search in local optima. Training a fine-grained value model that scores partial reasoning was itself hard, and a weak value model gives weak search. The success of long chain-of-thought RL instead suggests a reading consistent with Stream of Search: rather than wrap an external tree around the model, let the model learn to explore, backtrack and verify inside one sequence. External search remains valuable where there is a cheap exact checker (Lean, unit tests, game rules) or a fixed, small action set (structured web actions). See L20 and Snell et al. (2024) for when sequential refinement beats parallel or tree search at equal compute.

### World models: the model-based RL view

In RL terms, everything in part 5 is **model-based planning**: learn or write a transition function T(s, a) → s′ and reward R, then plan against it. Ha & Schmidhuber's World Models (2018) and the Dreamer line (Hafner et al.; DreamerV3 reached diamonds in Minecraft from scratch) learn latent dynamics from pixels. LLM world models (RAP, WebDreamer) reuse pretrained knowledge, so they need no environment-specific training but carry no guarantee of accuracy. Two classic lessons transfer directly:

- **Compounding error.** A one-step error rate ε gives roughly (1 − ε)^H chance that an H-step imagined rollout is fully right. That is why WebDreamer's best horizon was 1 and why model-based RL often uses short rollouts from real states (the idea behind MBPO, Janner et al., 2019).
- **Model exploitation.** A planner optimizes against the model, so it actively seeks states where the model is wrong in its favour. This is slide 54's "a wrong rule becomes a fast simulator", and it is the same failure as reward hacking a learned verifier.

The practical pattern that survives both is **model predictive control (MPC)**: imagine a few steps, execute one real step, observe, and replan. WebDreamer and MACU's replanning loop are both MPC.

### Decomposition: work, span and the critical path

Parallel computing describes a task graph by its **work** W (total time of all tasks) and its **span** S (length of the critical path). With P workers, any schedule takes at least max(W/P, S), and a greedy list scheduler finishes within W/P + S (Brent's bound). Amdahl's law is the special case where a fraction of the work is strictly serial. For agents, add a coordination term for planning, handoff, merging and integration tests. Two consequences explain the lecture's numbers. RAO was 2.5× faster on wide TextCraft trees but 17× slower on chain-like DeepDive, where S is close to W and delegation only adds overhead. CAID's score saturated at 4 engineers, while cost kept rising, because extra workers do not shorten the span and add merge conflicts. The project-management version of the same analysis is the critical path method (CPM), which predates computers.

### Practical advice for building search into an agent

1. **Check four preconditions before adding search.** (a) A scorer for partial states that is better than chance. (b) Cheap, faithful backtracking. (c) A manageable branching factor, with actions you can enumerate or sample a few of. (d) A budget in which a few-fold increase in calls is acceptable.
2. **Make actions reversible before searching over them.** VM or container snapshots, git worktrees, database transactions and staging accounts turn "submit order" into an undoable action. When that is impossible, classify actions as read-only or state-changing and allow branching only over read-only ones.
3. **Prefer one-step lookahead with replanning** over long imagined plans, unless you can measure the world model's accuracy.
4. **Separate the three slots** (generator, scorer, traversal) in code so each can be swapped and ablated, as ToT does.
5. **Draw the task DAG before parallelizing.** Compute W and S; if S/W is above about 0.5, parallel workers will mostly add cost.
6. **Make integration an explicit, tested step** (CAID), and pass subagents only the context they need (RLM, RAO).

### Open problems

- **Value functions for open-ended agent states.** Web and desktop states have no game result; current value functions are LLM judges with known biases (L20, T12).
- **Learning to search versus searching at test time.** SoS and reasoning models internalize search; Koh et al. and LATS keep it external. When each wins, at equal compute, is not settled.
- **Calibrated world models.** A world model that says *how sure* it is would let the planner choose the horizon per step instead of fixing it at 1.
- **Safe exploration in the real world.** Search multiplies the number of actions an agent takes, so it multiplies exposure to irreversible side effects (L13).
- **Learned decomposition at scale.** RAO shows delegation can be trained, but credit assignment through deep recursion trees and asynchronous subcalls is still young.

## Worked example

This program runs AlphaZero-style MCTS with PUCT on Game of 24 and shows that the policy prior and the value function decide how fast search finds an answer. No LLM is called. Both "networks" are stubs built on an exact solver: the value stub returns 0.9 for a still-solvable state and 0.1 otherwise, then flips that verdict with probability `noise` (an imperfect evaluator like ToT's sure/impossible labels). The policy stub is either uniform or "informed", giving 5× weight to children that are still solvable. It first re-checks the PUCT numbers from slide 98, then compares MCTS with plain DFS on four puzzles, including slide 17's {1, 3, 4, 6} and slide 27's {4, 6, 7, 8}. Standard library only; it runs in about 4 seconds.

```python
"""MCTS with PUCT on Game-of-24, with a stubbed policy and value network.

No LLM is called; both networks are stubs built on an exact solver.
- value_net knows whether the remaining numbers can still reach 24 and
  flips that answer with probability `noise` (an imperfect LLM evaluator,
  like ToT's "sure/impossible" labels).
- policy_prior is either uniform (no opinion) or "informed": it gives
  5x weight to children that are still solvable (a decent policy net).
"""
import math, random
from functools import lru_cache
from itertools import combinations

TARGET, EPS = 24.0, 1e-6

def children(nums):
    """All states reachable by combining two numbers with + - * /."""
    out = []
    for i, j in combinations(range(len(nums)), 2):
        a, b = nums[i], nums[j]
        rest = [nums[k] for k in range(len(nums)) if k not in (i, j)]
        cands = {a + b, a * b, a - b, b - a}
        if abs(b) > EPS: cands.add(a / b)
        if abs(a) > EPS: cands.add(b / a)
        for c in cands:
            out.append(tuple(sorted(rest + [c])))
    return sorted(set(out))

@lru_cache(maxsize=None)
def solvable(nums):
    if len(nums) == 1:
        return abs(nums[0] - TARGET) < EPS
    return any(solvable(c) for c in children(nums))

def value_net(nums, noise, rng):
    truth = solvable(nums)
    if rng.random() < noise:
        truth = not truth
    return 0.9 if truth else 0.1

class Node:
    def __init__(self, state, prior):
        self.state, self.P = state, prior
        self.N, self.W, self.kids = 0, 0.0, None
    def Q(self):
        return self.W / self.N if self.N else 0.5   # neutral value for unvisited

def puct(parent, child, c=1.5):
    return child.Q() + c * child.P * math.sqrt(parent.N) / (1 + child.N)

def policy_prior(kids, informed):
    w = [5.0 if (informed and solvable(k)) else 1.0 for k in kids]
    return [x / sum(w) for x in w]

def mcts_solve(start, noise, rng, informed, budget=3000):
    root = Node(tuple(sorted(start)), 1.0)
    for sim in range(1, budget + 1):
        node, path = root, [root]
        while node.kids:                                   # 1. selection
            node = max(node.kids, key=lambda k: puct(path[-1], k))
            path.append(node)
        if len(node.state) == 1:                           # terminal
            value = 1.0 if abs(node.state[0] - TARGET) < EPS else 0.0
            if value == 1.0:
                return sim
        else:
            kids = children(node.state)                    # 2. expansion
            node.kids = [Node(s, p) for s, p in zip(kids, policy_prior(kids, informed))]
            value = value_net(node.state, noise, rng)      # 3. evaluation
        for n in path:                                     # 4. backup
            n.N += 1
            n.W += value
    return None

def dfs_solve(start):
    """Uninformed DFS: count states expanded until a solution is found."""
    stack, expanded = [tuple(sorted(start))], 0
    while stack:
        s = stack.pop()
        expanded += 1
        if len(s) == 1 and abs(s[0] - TARGET) < EPS:
            return expanded
        if len(s) > 1:
            stack.extend(children(s))
    return None

# Slide 98 check: c = 1, N(s) = 9
print("Slide 98 PUCT check (c=1, N(s)=9):")
for name, P, N, Q in [("A", .60, 4, .60), ("B", .25, 3, .40), ("C", .15, 2, .55)]:
    print(f"  {name}: {Q:.2f} + {P:.2f}*3/{1+N} = {Q + P*3/(1+N):.2f}")

puzzles = [(1, 3, 4, 6), (4, 6, 7, 8), (1, 5, 5, 5), (3, 3, 8, 8)]
print("\nchildren of the root:", {p: len(children(tuple(sorted(p)))) for p in puzzles})
configs = [(0.0, False), (0.0, True), (0.2, True), (0.4, True)]   # (noise, informed)
print(f"\n{'puzzle':<14}{'DFS':>6}" +
      "".join(f"{('P=good' if i else 'P=unif') + f' n={z}':>15}" for z, i in configs))
for p in puzzles:
    row = f"{str(p):<14}{dfs_solve(p):>6}"
    for noise, informed in configs:
        sims = [mcts_solve(p, noise, random.Random(seed), informed) for seed in range(30)]
        ok = [s for s in sims if s is not None]
        cell = f"{sum(ok)/len(ok):.0f} ({len(ok)}/30)" if ok else "fail"
        row += f"{cell:>15}"
    print(row)
print("\nDFS: states expanded. MCTS: mean simulations to first solution"
      " (solved runs / 30, budget 3000).")
```

Output (real run):

```text
Slide 98 PUCT check (c=1, N(s)=9):
  A: 0.60 + 0.60*3/5 = 0.96
  B: 0.40 + 0.25*3/4 = 0.59
  C: 0.55 + 0.15*3/3 = 0.70

children of the root: {(1, 3, 4, 6): 31, (4, 6, 7, 8): 36, (1, 5, 5, 5): 9, (3, 3, 8, 8): 14}

puzzle           DFS   P=unif n=0.0   P=good n=0.0   P=good n=0.2   P=good n=0.4
(1, 3, 4, 6)    1881   1048 (30/30)      4 (30/30)     25 (30/30)     49 (30/30)
(4, 6, 7, 8)      82    400 (30/30)      4 (30/30)      5 (30/30)      6 (30/30)
(1, 5, 5, 5)     412    227 (30/30)      4 (30/30)      8 (30/30)      9 (30/30)
(3, 3, 8, 8)     712    547 (30/30)      4 (30/30)     16 (30/30)     23 (30/30)

DFS: states expanded. MCTS: mean simulations to first solution (solved runs / 30, budget 3000).
```

**What to notice**

- **A perfect value function is not enough with a uniform prior.** With exact values but uniform priors, MCTS needed 1,048 simulations on {1, 3, 4, 6}. Only one of the 31 root children, {0.75, 1, 6}, is solvable. When search goes under it, the bad grandchildren's values (0.1) are *averaged* into its Q, so it soon looks no better than its 30 bad siblings and exploration spreads out. Mean backup dilutes a sparse good branch.
- **The prior does most of the work.** With the informed prior every puzzle is solved in 4 simulations (root, two intermediate states, the winning terminal). This is why AlphaZero's PUCT multiplies the exploration bonus by P(s,a), and why slide 77 worries about language: a policy that cannot point at the right thought leaves search to brute force.
- **Value noise degrades search gracefully, not catastrophically.** Flipping 20% or 40% of value verdicts raised the cost on {1, 3, 4, 6} from 4 to 25 and 49 simulations, still far below DFS's 1,881 expansions. A good prior protects search against a noisy evaluator, like ToT's LLM votes.
- **Search cost depends on the instance.** DFS needs only 82 expansions on {4, 6, 7, 8}, which has many solutions, but 1,881 on {1, 3, 4, 6}, which needs a fraction. MCTS without a prior is *worse* than DFS on the easy puzzle (400 vs 82): its exploration bonus spends simulations confirming that bad branches are bad.
- **Counting units differ.** One MCTS simulation costs one expansion plus one value call, so it is roughly comparable to one DFS expansion, but with an LLM as the value function each simulation is an API call. That is why the slide 77 rule "search must improve the decision enough to justify its cost" applies.

## More worked examples

Two more examples cover parts 4–6: a runnable DAG scheduler that measures what parallel decomposition can and cannot buy, and a numeric walkthrough of the two costs that limit grounded search and world models.

### Example A (runnable): LLMCompiler-style scheduling and the critical path

The scheduler dispatches a task as soon as its inputs are done and a worker is free, like LLMCompiler's task fetching unit (slide 65). Tasks are simulated with fixed durations; no tools or LLMs are called. Four DAGs are compared: the LLMCompiler market-cap example, the MACU travel DAG with slide 74's 4/3/2 durations, a DeepDive-like chain, and a TextCraft-like wide tree. A per-dispatch coordination overhead models the manager.

```python
"""LLMCompiler-style DAG scheduling: makespan vs sequential, critical path, workers.

Tasks are simulated with fixed durations (seconds); no tools or LLMs are called.
A task is dispatched as soon as all its inputs are done and a worker is free
(LLMCompiler's "task fetching unit"). Each dispatch costs `overhead` seconds
of coordination on the manager, which is serial (one manager).
"""
import heapq

def critical_path(dag):
    memo = {}
    def finish(t):
        if t not in memo:
            dur, deps = dag[t]
            memo[t] = dur + max((finish(d) for d in deps), default=0.0)
        return memo[t]
    return max(finish(t) for t in dag)

def schedule(dag, workers, overhead=0.0):
    done_at, running, free = {}, [], workers
    pending = set(dag)
    clock = manager_free = 0.0
    while pending or running:
        ready = sorted(t for t in pending
                       if all(d in done_at and done_at[d] <= clock for d in dag[t][1]))
        # longest task first among ready ones (a common list-scheduling rule)
        ready.sort(key=lambda t: -dag[t][0])
        while ready and free:
            t = ready.pop(0)
            start = max(clock, manager_free) + overhead   # manager dispatches serially
            manager_free = start
            heapq.heappush(running, (start + dag[t][0], t))
            pending.discard(t)
            free -= 1
        end, t = heapq.heappop(running)                   # advance to next completion
        clock, done_at[t], free = end, end, free + 1
    return clock

DAGS = {
    # LLMCompiler slide: $1, $2 searches in parallel, then math, then llm
    "llmcompiler": {"s1": (2.0, []), "s2": (2.0, []),
                    "math": (0.1, ["s1", "s2"]), "llm": (1.5, ["math"])},
    # MACU travel slide; A/B/C durations from the Amdahl slide (4, 3, 2 min)
    "travel": {"read": (1.0, []), "flights": (4.0, ["read"]),
               "hotels": (3.0, ["read"]), "weather": (2.0, ["read"]),
               "itinerary": (2.0, ["flights", "hotels", "weather"])},
    # DeepDive-like chain: each search depends on the previous finding
    "chain": {f"q{i}": (2.0, [f"q{i-1}"] if i else []) for i in range(5)},
    # TextCraft-like wide tree: 8 independent sub-recipes, then assemble
    "wide": {**{f"r{i}": (3.0, []) for i in range(8)},
             "assemble": (1.0, [f"r{i}" for i in range(8)])},
}

print(f"{'DAG':<12}{'work W':>8}{'span S':>8}{'S/W':>6}  "
      f"{'P=1':>6}{'P=2':>6}{'P=4':>6}{'P=8':>6}   P=8,ovh=0.5  best speed-up")
for name, dag in DAGS.items():
    W = sum(d for d, _ in dag.values())
    S = critical_path(dag)
    row = f"{name:<12}{W:>8.1f}{S:>8.1f}{S/W:>6.2f}  "
    for P in (1, 2, 4, 8):
        row += f"{schedule(dag, P):>6.1f}"
    with_ovh = schedule(dag, 8, overhead=0.5)
    row += f"{with_ovh:>13.1f}{W / with_ovh:>13.2f}x"
    print(row)
print("\nAll times in the DAG's own units; speed-up = W / makespan(P=8, overhead 0.5).")
```

Output (real run):

```text
DAG           work W  span S   S/W     P=1   P=2   P=4   P=8   P=8,ovh=0.5  best speed-up
llmcompiler      5.6     3.6  0.64     5.6   3.6   3.6   3.6          5.6         1.00x
travel          12.0     7.0  0.58    12.0   8.0   7.0   7.0          8.5         1.41x
chain           10.0    10.0  1.00    10.0  10.0  10.0  10.0         12.5         0.80x
wide            25.0     4.0  0.16    25.0  13.0   7.0   4.0          8.5         2.94x
```

**What to notice**

- **The makespan never drops below the span S.** Travel stops improving at 7.0 (read 1 + flights 4 + itinerary 2) once there are 3 workers; more workers change nothing. This is slide 74's "4 min + coordination" with the read and itinerary steps added.
- **Coordination can erase the gain.** The LLMCompiler DAG saves 2 seconds by running the two searches together, but with 0.5 s per serial dispatch the four dispatches cost exactly that, so the speed-up is 1.00×. Short tool calls need cheap dispatch.
- **A chain only gets slower.** The DeepDive-like chain has S/W = 1.00, so parallel workers cannot help and the overhead makes it 0.80×, a 25% slowdown. This is the shape of RAO's DeepDive result (13.3 s single vs 233.0 s RAO), though RAO's real overhead was much larger.
- **Wide DAGs are where delegation pays.** The wide tree (S/W = 0.16) runs 2.94× faster even with overhead, like RAO's hard TextCraft-Synth (180.0 s → 73.3 s). Before parallelizing, compute S/W: it caps the speed-up at W/S.

### Example B (numeric walkthrough): imagined horizons and the cost of real backtracking

This walkthrough puts rough numbers on two limits from parts 4 and 5. The numbers are illustrative assumptions, chosen to resemble the slides, not results from the papers.

**Part 1: when does a longer imagined horizon hurt?** Model a WebDreamer-style agent. The reactive agent succeeds 26% of the time (slide 50). A plan of horizon H is useful only if every imagined step is right; with per-step prediction accuracy a, that happens with probability a^H. Assume a correct H-step plan adds b(H) points (b(1) = 14, b(2) = 20, b(3) = 24, since deeper lookahead sees more) and a wrong plan costs 5 points versus reactive. Then success = 26 + a^H · b(H) − (1 − a^H) · 5.

| Per-step accuracy a | H | a^H | Success (%) |
| --- | --- | --- | --- |
| 0.75 | 1 | 0.750 | **35.25** |
| 0.75 | 2 | 0.563 | 35.06 |
| 0.75 | 3 | 0.422 | 33.23 |
| 0.90 | 1 | 0.900 | 38.10 |
| 0.90 | 2 | 0.810 | 41.25 |
| 0.90 | 3 | 0.729 | **42.14** |

Working for a = 0.75, H = 2: a² = 0.5625; 0.5625 × 20 = 11.25; (1 − 0.5625) × 5 = 2.19; 26 + 11.25 − 2.19 = 35.06.

**What to notice**

- With a mediocre world model (a = 0.75) the best horizon is 1, and longer horizons drift down, the same shape as slide 50 (37 → 32 → 32).
- With an accurate model (a = 0.90) the optimum moves to H = 3. The right horizon is a property of the model's accuracy, so measure accuracy before choosing it.
- Every row still beats the reactive 26%, as in WebDreamer: one step of imagination is cheap insurance.

**Part 2: what does real backtracking cost?** Now model best-first search on a live site (slides 37–42). Assume a reset takes 10 s, each browser action 3 s, and each value-function LLM call 4 s. Expanding a node at depth 3 means reset, replay 3 actions, take the new action and score it: 10 + 3 × 3 + 3 + 4 = 26 s. A budget of 20 expansions costs about 20 × 26 = 520 s per task. A 5-step agent without search costs roughly 5 × (3 + 4) = 35 s.

- **Latency:** about 15× slower per task (520 / 35). If search lifts success from 15.0% to 19.2% (WebArena, slide 40), the extra 485 s per task buys 4.2 extra successes per 100 tasks, about 11,500 s (3.2 hours) of agent time per extra success.
- **Side effects:** if 10% of expansions include a state-changing action (submit, send, pay), the chance that 20 expansions trigger at least one is 1 − 0.9^20 = 1 − 0.122 = 0.878, about 88%. Back-button recovery does not undo it (slide 42).

**What to notice**

- Grounded search is affordable only when resets are cheap (snapshots, sandboxes, benchmarks) and when state-changing actions are fenced off.
- A world model removes both costs at once: imagined expansions take one LLM call each and touch nothing. That is exactly the trade slide 42 proposes, paid for with the prediction error from Part 1.

## Key terms

These are the terms the lecture relies on, in alphabetical order.

| Term | Meaning |
| --- | --- |
| Aggregation (GoT) | A thought transformation that merges two or more parent thoughts into one new thought, such as merging two sorted sublists; the result is scored afresh, not by adding parent scores. |
| Amdahl's law / critical path | The speed-up from parallel workers is capped by the longest chain of dependent tasks (the span) plus coordination time; with tasks of 4, 3 and 2 minutes the floor is 4 minutes, not 3. |
| Best-first search | Search that always expands the frontier node with the highest value estimate; Koh et al. use it over real web states. |
| Breadth-first / depth-first search | Search with a FIFO queue (finish each level first) or a LIFO stack (follow one branch, then backtrack) as the frontier. |
| Code world model | A model that predicts how code or commands change program state (CWM), or an executable transition function written by an LLM (WorldCoder, GIF-MCTS). |
| Critical path (span) | The longest-duration path through a task DAG; no number of workers can finish faster. |
| Expert Iteration | A loop in which a neural policy guides tree search, the search produces improved decisions, and the policy is trained to imitate them (Anthony et al., 2017). |
| Frontier | The set of generated but not yet expanded nodes; the search algorithm is largely a rule for ordering it. |
| Grounded search | Search in which each expansion executes a real action in an environment (browser, Lean, OS) and observes the true next state. |
| Monte Carlo tree search (MCTS) | Tree search that repeats selection, expansion, evaluation (rollout or value network) and backup, keeping visit counts and mean values per edge. |
| Mutable task DAG | MACU's dependency graph of subtasks that a manager creates, dispatches and revises as worker results arrive. |
| Policy prior P(s,a) | The policy network's probability for action a in state s; in PUCT it scales the exploration bonus. |
| PUCT | AlphaZero's selection rule: Q(s,a) + c·P(s,a)·√N(s)/(1+N(s,a)). |
| Recursive Language Model (RLM) | An inference pattern in which the root LM sees a long prompt only as a variable in a REPL and calls LMs on selected snippets. |
| Reset and replay | Backtracking in a real environment by restoring the start state and re-executing the action prefix that leads to a node. |
| State-changing action | An action whose effects persist outside the visible page (an order, an email, a payment), so browser "back" does not undo it. |
| Stream of Search (SoS) | Training an LM on serialized search traces, including failed branches and backtracks, so that it learns to search within its own output. |
| Thought (ToT) | A coherent intermediate step of a solution (for Game of 24, one arithmetic operation) treated as a node in a search tree. |
| Value function / evaluator | A model or prompt that scores a partial state's chance of leading to success (AlphaZero's value head, ToT's sure/likely/impossible labels, Koh et al.'s VLM value). |
| World model | A model that predicts the next state (and possibly reward) from the current state and a proposed action, so a planner can evaluate actions without executing them. |

## Self-check

Twelve questions to test recall and understanding; try each before reading the answer.

1. What is the only difference between DFS and BFS in the slides, and how does best-first search fit the same picture? **Answer:** The frontier's data structure: DFS uses a LIFO stack (push children on top, take from the top), BFS a FIFO queue (add to the back, take from the front). Best-first search uses a priority queue ordered by a value estimate. All three hold "nodes waiting to be visited"; only the order of removal changes.
2. Name the four steps of one MCTS pass and say what AlphaGo-style MCTS uses in the evaluation step. **Answer:** Selection (choose a branch using the policy prior and visit counts), expansion (add children to the leaf), evaluation (estimate the leaf's value) and backup (update statistics along the path). AlphaGo-style MCTS uses a value network to estimate the outcome at the leaf instead of, or alongside, a random rollout.
3. In the PUCT example on slide 98, why does C (P = 0.15) score higher than B (P = 0.25)? **Answer:** C has a higher mean value (Q = 0.55 vs 0.40) and fewer visits (N = 2 vs 3). Its exploration term is 0.15 × 3/3 = 0.15 against B's 0.25 × 3/4 ≈ 0.19, so C totals 0.70 and B 0.59. Q and the visit discount outweigh B's larger prior.
4. What are the two terms of the AlphaZero loss and what does each train the network to do? **Answer:** The value loss (z − v\_θ(s))² trains the value head to predict the final self-play outcome z. The policy loss −Σ\_a π\_search(a | s) log p\_θ(a | s) trains the policy head to match MCTS's visit distribution. Together they make the network imitate search, which is Expert Iteration.
5. Give the four rows of slide 15 that explain why the game loop is easier than the language case. **Answer:** State (compact board vs history and hidden information), transitions (exact cheap simulator vs tools, side effects or prediction), actions (enumerable legal moves vs generated text and tool arguments) and outcome (unambiguous result vs ambiguous task success).
6. How does ToT's official code turn an LLM's evaluation into a search score? **Answer:** A value prompt asks whether the remaining numbers can reach 24; the parser reads the last line's label and maps impossible = 0.001, likely = 1, sure = 20. Three evaluations per state are summed (for example 20 + 1 + 20 = 41), and the five best states are kept. The weights are hand-chosen ranking devices, not probabilities.
7. What does Graph of Thoughts add to Tree of Thoughts, and how is a merged thought scored? **Answer:** Aggregation: a thought can have several parents, so independent partial results (such as two sorted sublists) can be merged. The merged list is scored afresh by code, E = digit-count errors + adjacent descents, and the parents' scores are not added. GoT cut median sorting error by about 62% vs ToT.
8. Why does Stream of Search train on failed branches, and what was the gain? **Answer:** Keeping failures and "move back" steps in the target teaches the model to explore and recover, not just to emit clean answers. With the same 250M model, data size and gradient steps, SoS reached 51.27% versus 25.73% for optimal-path training, a 25.54-point gain; STaR and APA raised it to 55.59% and 56.52%.
9. Why is "browser back" not a valid backtrack after submitting an order, and what are the three costs of search by acting? **Answer:** Back restores the page, but the server still records the order, so the world state differs from the node's. The three costs are state changes (actions alter the world), latency (branches add tool calls, waits and LLM calls) and imperfect backtracking (reset may not recover the original state).
10. In WebDreamer, why did horizons 2 and 3 do worse than horizon 1? **Answer:** Success was 37% at horizon 1 but 32% at 2 and 3 (reactive 26%). An imagined next click may not exist on the real page, and prediction errors accumulate across imagined steps. The main experiments therefore use one-step lookahead with replanning after every real action.
11. Why did RAO make hard TextCraft-Synth faster but DeepDive much slower? **Answer:** TextCraft recipes have independent branches that sub-agents can solve at the same time (180.0 s → 73.3 s). DeepDive's searches depend on earlier findings, so the work is a chain; delegation adds overhead without parallelism (13.3 s → 233.0 s), even though accuracy rose from 24% to 40%.
12. What limits the speed-up of parallel decomposition, according to slide 74? **Answer:** The critical path plus coordination. Tasks of 4, 3 and 2 minutes take 9 minutes serially but at least 4 minutes plus coordination in parallel, so the best speed-up is 2.25×. Dependencies lengthen the longest path, and planning, merging and integration add to it.

## Practice problems

Eleven exam-style problems: calculations, design, critique and one trajectory to debug. Full working follows each.

1. **PUCT and the exploration constant.** A root has N(s) = 16. Children: A (P = 0.5, N = 10, Q = 0.55), B (P = 0.3, N = 4, Q = 0.60), C (P = 0.2, N = 1, Q = 0.30). Which child does PUCT select with c = 1 and with c = 2? If C is selected and its leaf evaluation returns 0.9, what are C's new N and Q? **Solution:** √N(s) = 4. With c = 1: A = 0.55 + 0.5 × 4/11 = 0.55 + 0.182 = 0.732; B = 0.60 + 0.3 × 4/5 = 0.60 + 0.24 = 0.84; C = 0.30 + 0.2 × 4/2 = 0.30 + 0.40 = 0.70. B is selected. With c = 2 the bonuses double: A = 0.55 + 0.364 = 0.914; B = 0.60 + 0.48 = 1.08; C = 0.30 + 0.80 = 1.10. C is selected, because the larger c favours the barely visited child. After backup C has N = 2 and W = 0.30 + 0.9 = 1.2, so Q = 0.60. Lesson: c sets how fast search abandons an early low estimate.
2. **AlphaZero loss by hand.** For one state, the game outcome is z = +1 and the network predicts v = 0.6. MCTS visit distribution π = (0.6, 0.3, 0.1); network policy p = (0.5, 0.3, 0.2). Compute the value loss, the policy loss, and how much of the policy loss is reducible. **Solution:** Value loss = (1 − 0.6)² = 0.16. Policy loss = −(0.6 ln 0.5 + 0.3 ln 0.3 + 0.1 ln 0.2) = −(0.6 × −0.693 + 0.3 × −1.204 + 0.1 × −1.609) = 0.416 + 0.361 + 0.161 = 0.938. Total 1.098 (no regularization). The cross-entropy equals H(π) + KL(π ‖ p). H(π) = −(0.6 ln 0.6 + 0.3 ln 0.3 + 0.1 ln 0.1) = 0.898, which is fixed by the search. So only KL = 0.938 − 0.898 = 0.040 can be removed by training. The policy is already close to search; the value head has more to learn.
3. **Critique ToT's evaluator weights.** Three Game-of-24 states each receive three evaluations: S1 = (likely, likely, likely), S2 = (sure, impossible, impossible), S3 = (sure, likely, impossible). Compute ToT's scores, rank them, and argue whether the ranking is sensible. Propose a fix. **Solution:** Weights impossible = 0.001, likely = 1, sure = 20. S1 = 3; S2 = 20 + 0.001 + 0.001 = 20.002; S3 = 20 + 1 + 0.001 = 21.001. Ranking: S3 > S2 > S1. S2 is ranked far above S1 even though two of three evaluators called it impossible and all three called S1 likely. One overconfident "sure" dominates because it is worth 20 "likely" votes. With breadth 5 this matters only at the cut-off, but it lets a single hallucinated "sure" keep a dead state alive. Fixes: use the median or majority label; treat any "impossible" from a verified computation as a veto; or calibrate weights on held-out states so they approximate probabilities of solvability.
4. **GoT's sorting scorer and its blind spots.** Input x = \[5, 1, 4, 1, 3\]. Score y1 = \[1, 1, 3, 5, 4\], y2 = \[1, 3, 4, 5\] and y3 = \[2, 3, 4, 5, 1\] (assume y3 came from a different input with the same digits as itself). Then explain what E measures poorly. **Solution:** E = Σ\_d |c\_y(d) − c\_x(d)| + number of adjacent descents. y1: counts match (two 1s, one each of 3, 4, 5), descents: 5 > 4 → 1, so E = 1. y2: one 1 is missing → count error 1, no descents, E = 1. y1 and y2 tie although y1 has all the data and only needs one swap, while y2 lost an element. y3 against its own digits has count error 0 and a single descent (5 > 1), so E = 1, yet the 1 is in the wrong place relative to all four other elements (4 inversions). Adjacent descents undercount displacement of one element far from its slot. The scorer is cheap and good enough to rank merges, but for repairs an inversion count or a longest-sorted-subsequence measure would separate these cases.
5. **When does horizon 2 beat horizon 1?** Use Example B's model: success(H) = 26 + a^H · b(H) − (1 − a^H) · 5, with b(1) = 14 and b(2) = 20. Find the per-step accuracy a above which a two-step lookahead is better. **Solution:** success(1) = 26 + 14a − 5 + 5a = 21 + 19a. success(2) = 26 + 20a² − 5 + 5a² = 21 + 25a². Horizon 2 wins when 25a² > 19a, that is a > 19/25 = 0.76. So a world model must be right on more than about three in four imagined steps before a second imagined step pays off under these assumptions. WebDreamer's result (horizon 1 best) suggests its LLM simulator was below that threshold on Online-Mind2Web.
6. **Reset-and-replay versus snapshots.** A best-first web search expands 15 nodes per task at an average depth of 2.4. A reset takes 12 s, each browser action 2 s and each value call 5 s. (a) Compute search time per task with reset-and-replay. (b) A VM snapshot restore takes 3 s and needs no replay. Compute the new time and the saving. **Solution:** (a) Per expansion: reset 12 + replay 2.4 × 2 = 4.8 + new action 2 + value 5 = 23.8 s. Per task: 15 × 23.8 = 357 s. (b) Per expansion: restore 3 + action 2 + value 5 = 10 s; per task 150 s. Saving: 207 s, or 58%. Snapshots also remove a correctness risk: replaying a prefix on a live site may not reproduce the same pages (new prices, sold-out items), while a snapshot restores the exact state, including server-side state if the server runs inside the VM.
7. **Debug a search trajectory.** A tree-search shopping agent is told "add the cheapest red kettle to the cart". Its log:
   1. Search "red kettle" → results page (v = 0.5).
   2. Open kettle K1, $39 → click "Add to cart" (v = 0.6).
   3. Backtrack: browser back to results; open K2, $29 → "Add to cart" (v = 0.8).
   4. Backtrack: browser back; open K3, $35 → v = 0.4, abandoned.
   5. Choose best node (K2, v = 0.8) and stop. The final cart holds K1 and K2. Identify the bugs and fix the design. **Solution:** "Add to cart" is a state-changing action: it writes to the server-side cart. Browser back in steps 3–4 restored the page but not the cart (slide 42), so the K1 branch's side effect leaked into the final state. Second bug: the value function scored the K2 node as if the cart contained only K2, so it judged a state the world was not in. Fixes: (a) make search branch only over read-only actions (search, open, filter) and execute the single state-changing action once, after search picks the cheapest item; (b) if mutation inside search is unavoidable, back each branch with a reset that clears the cart (fresh session or snapshot) and replay the prefix; (c) before stopping, verify the actual final state (read the cart) rather than trusting the node's value.
8. **Schedule a research DAG.** Tasks (minutes): A plan 2; B search papers 6 (needs A); C search code 4 (needs A); D run baseline 8 (needs C); E read papers 5 (needs B); F write report 3 (needs D and E). Compute work W, span S, the makespan with 2 workers, and the makespan with 2 workers when a single manager spends 1 minute dispatching each task. **Solution:** W = 2 + 6 + 4 + 8 + 5 + 3 = 28. Paths: A–B–E–F = 16, A–C–D–F = 17, so S = 17. Two workers, no overhead: A ends at 2; B and C start; C ends 6 and D runs 6–14; B ends 8 and E runs 8–13; F runs 14–17. Makespan 17 = S, speed-up 28/17 = 1.65×. With 1-minute serial dispatch: A dispatched at 1, ends 3; B dispatched at 4 (ends 10), C at 5 (ends 9); D dispatched at 10 (ends 18); E dispatched at 11 (ends 16); F dispatched at 19, ends 22. Makespan 22, speed-up 28/22 = 1.27×. A third worker does not help (still 22), because the span and the manager are the bottleneck. The Example A scheduler reproduces these numbers.
9. **Critique a multi-agent claim.** A team reports: "Our manager–worker system raised Online-Mind2Web success from 52.2% to 55.6%, so multi-agent is better." Using MACU's numbers, critique this and say what else to report. **Solution:** The median time rose from 18.5 to 33.6 minutes (+82%) for +3.4 points. Success per median minute fell from 52.2/18.5 = 2.8 to 55.6/33.6 = 1.7. With a Qwen manager the gain shrinks to 0.2 points (52.4%) for 23.6 minutes, so most of the gain on this benchmark may come from the stronger Opus manager, not from parallelism. Contrast Odysseys, where success rose from 8.5% to 34.0% while time fell from 162.4 to 110.3 minutes; that workload has wide, independent subtasks. Report: time and cost alongside success, a same-manager ablation, a single agent given the same total budget, per-task DAG width, and variance across seeds.
10. **Design an RLM pipeline.** You must find all pairs of customers in a 50,000-record support log who reported the same defect, where "same defect" needs semantic judgment. Records average 200 tokens. Design an RLM-style solution, estimate calls and time, and say where depth helps or hurts. **Solution:** The log is 50,000 × 200 = 10M tokens, far beyond a single context. Load it as a REPL variable. Step 1 (code): split into 100 batches of 500 records (\~100K tokens each). Step 2 (depth-1 subcalls): ask an LM to label each record's defect with a short canonical tag; 100 calls. Step 3 (code): group records by tag and emit pairs within each group, which is exact and O(n) per group instead of an LLM comparing 1.25 billion pairs. Step 4 (optional depth-2 subcalls): for tags whose groups look heterogeneous, re-check a sample. Time: at 20 s per call, 100 sequential calls take about 33 minutes; with 10 parallel workers about 3.5 minutes plus dispatch (the RLM paper's implementation was sequential). Depth helps when labels need a second, focused look; it hurts when each extra level summarizes away detail, as with CodeQA (66% REPL-only vs 44% at depth 3). Validate tags on a hand-labelled sample before trusting the pair counts.
11. **Choose a search architecture.** A computer-use agent books business trips: it compares flights and hotels on live sites and then pays. For each phase, say whether to use no search, grounded search, world-model search or decomposition, and why. **Solution:** Comparing flights, hotels and weather is read-only and independent, so decompose: run them in parallel as a DAG (MACU-style) with the itinerary as the join. Inside each comparison, use grounded best-first search over read-only actions (open listing, filter, sort), since page visits are safe and observations beat imagination; cap the budget because of latency. For choosing among multi-step booking flows, use one-step world-model lookahead (WebDreamer-style) to rank candidate clicks without executing them. Payment and booking are irreversible: no search at all; execute once after a final verification step and, ideally, human confirmation. Integration is its own task: check that dates, names and prices agree across the flight and hotel results before paying.

## References and further reading

Everything cited on the slides is listed first, grouped as on slides 91–93; a further-reading list follows. Links are arXiv abstract pages or publisher pages.

### Cited in the lecture

**Search and policy learning**

- [Thinking Fast and Slow with Deep Learning and Tree Search (Expert Iteration)](https://arxiv.org/abs/1705.08439) — Anthony, Tian & Barber, NeurIPS 2017 — the search-as-teacher loop on slide 13.
- [Mastering the game of Go without human knowledge (AlphaGo Zero)](https://www.nature.com/articles/nature24270) — Silver et al., Nature 2017 — Figure 1 on slides 14 and 97.
- [Mastering Chess and Shogi by Self-Play with a General Reinforcement Learning Algorithm (AlphaZero)](https://arxiv.org/abs/1712.01815) — Silver et al., 2017 preprint of the Science 2018 paper — MCTS, PUCT and the loss on slides 8–12, 98–99.
- [ReST-MCTS\*: LLM Self-Training via Process Reward Guided Tree Search](https://arxiv.org/abs/2406.03816) — Zhang et al., NeurIPS 2024 — Expert Iteration with a process reward model (slide 96).
- [Tree of Thoughts: Deliberate Problem Solving with Large Language Models](https://arxiv.org/abs/2305.10601) — Yao et al., NeurIPS 2023 — Game of 24 example, results and evaluator code (slides 17–22, 83–84).
- [Graph of Thoughts: Solving Elaborate Problems with Large Language Models](https://arxiv.org/abs/2308.09687) — Besta et al., AAAI 2024 — aggregation, sorting scorer and results (slides 23–26, 85–87, 100).
- [Stream of Search (SoS): Learning to Search in Language](https://arxiv.org/abs/2404.03683) — Gandhi et al., COLM 2024 — serialized search traces, STaR and APA (slides 27–32, 88).
- [Beyond A\*: Better Planning with Transformers via Search Dynamics Bootstrapping (Searchformer)](https://arxiv.org/abs/2402.14083) — Lehnert et al., COLM 2024 — learning from A\* traces (slide 88).
- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-AI, 2025 — §4.2 reports MCTS as an unsuccessful attempt (slide 91).

**Grounded search and world models**

- [Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models (LATS)](https://arxiv.org/abs/2310.04406) — Zhou et al., ICML 2024 — MCTS with environment feedback and reflection (slide 35).
- [Tree Search for Language Model Agents](https://arxiv.org/abs/2407.01476) — Koh, McAleer, Fried & Salakhutdinov, 2024 / TMLR 2025 — best-first search on (Visual)WebArena (slides 36–42).
- [DeepSeek-Prover-V1.5: Harnessing Proof Assistant Feedback for Reinforcement Learning and Monte-Carlo Tree Search](https://arxiv.org/abs/2408.08152) — Xin et al., 2024 / ICLR 2025 — truncate-and-resume search over Lean states (slide 34).
- [Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model (MuZero)](https://arxiv.org/abs/1911.08265) — Schrittwieser et al., Nature 2020 — planning inside a learned model (slide 44).
- [World Models](https://arxiv.org/abs/1803.10122) — Ha & Schmidhuber, NeurIPS 2018 — training a controller in a learned VizDoom "dream" (slide 45); the [interactive demo](https://worldmodels.github.io/) is the slide's image source.
- [Reasoning with Language Model is Planning with World Model (RAP)](https://arxiv.org/abs/2305.14992) — Hao et al., EMNLP 2023 — the LLM as both agent and world model inside MCTS (slide 46).
- [Is Your LLM Secretly a World Model of the Internet? Model-Based Planning for Web Agents (WebDreamer)](https://arxiv.org/abs/2411.06559) — Gu et al., 2024 / TMLR 2025 — simulate-then-act web planning and the horizon result (slides 47–50, 89).
- [CWM: An Open-Weights LLM for Research on Code Generation with World Models](https://arxiv.org/abs/2510.02387) — Meta FAIR CodeGen Team, 2025 — the 32B code world model and its training pipeline (slides 51–52).
- [WorldCoder, a Model-Based LLM Agent: Building World Models by Writing Code and Interacting with the Environment](https://arxiv.org/abs/2402.12275) — Tang, Key & Ellis, NeurIPS 2024 — executable transition programs (slides 53–54).
- [Generating Code World Models with Large Language Models Guided by Monte Carlo Tree Search (GIF-MCTS)](https://arxiv.org/abs/2405.15383) — Dainese et al., NeurIPS 2024 — searching over world-model code (slides 53–54).

**Decomposition and coordination**

- [Recursive Language Models](https://arxiv.org/abs/2512.24601) — Zhang, Kraska & Khattab, 2025/2026 — prompt-as-REPL-variable and recursive subcalls (slides 57–60, 90).
- [Recursive Agent Optimization (RAO)](https://arxiv.org/abs/2605.06639) — Gandhi et al., 2026 — trained recursive delegation (slides 61–64; also L18).
- [ADaPT: As-Needed Decomposition and Planning with Language Models](https://arxiv.org/abs/2311.05772) — Prasad et al., Findings of NAACL 2024 — decompose only when the executor fails (reference slide 93).
- [HuggingGPT: Solving AI Tasks with ChatGPT and its Friends in Hugging Face](https://arxiv.org/abs/2303.17580) — Shen et al., NeurIPS 2023 — an LLM planner dispatching tasks to models (slide 65).
- [An LLM Compiler for Parallel Function Calling (LLMCompiler)](https://arxiv.org/abs/2312.04511) — Kim et al., ICML 2024 — planner, task fetching unit and parallel executor (slide 65).
- [Multi-Agent Computer Use (MACU)](https://arxiv.org/abs/2606.01533) — Koh, Salakhutdinov & Fried, 2026 — manager-maintained mutable DAG with parallel CUA workers (slides 66–70, 94; also L18).
- [Effective Strategies for Asynchronous Software Engineering Agents (CAID)](https://arxiv.org/abs/2603.21489) — Geng & Neubig, 2026 — git-worktree isolation and manager merges (slides 71–73, 95; also L18).
- [Discriminative World Models for Web Agents](https://arxiv.org/abs/2609.02885) — Li et al., 2026 — listed on slide 93 as further reading: world models that score actions rather than generate future pages.
- "Eric Jang – Building AlphaGo from scratch" — Dwarkesh Podcast, 2026 (cited at 1:45:47 on slide 77) — why AlphaZero-style search transfers poorly to language.
- Historical names on slide 5 (Shannon's chess program, Dijkstra's shortest paths, A\*, alpha–beta, Deep Blue, UCT, AlphaGo) are background; see Further reading for UCT and AlphaGo.

### Further reading

- [Mastering the game of Go with deep neural networks and tree search (AlphaGo)](https://www.nature.com/articles/nature16961) — Silver et al., Nature 2016 — the first system to combine policy and value networks with MCTS.
- [The Bitter Lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html) — Richard Sutton, 2019 — the short essay arguing that search and learning are the methods that scale.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — Lightman et al., 2023 — process reward models, the main candidate value function for partial reasoning.
- [Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters](https://arxiv.org/abs/2408.03314) — Snell et al., 2024 — when tree search with a PRM beats best-of-N and revision (links L20 and L21).
- [STaR: Bootstrapping Reasoning With Reasoning](https://arxiv.org/abs/2203.14465) — Zelikman et al., NeurIPS 2022 — the sample-filter-fit loop that SoS uses for policy improvement.
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., NeurIPS 2023 — the verbal reflection that LATS adds to MCTS.
- [Mastering Diverse Domains through World Models (DreamerV3)](https://arxiv.org/abs/2301.04104) — Hafner et al., 2023 — the state of the art in learned latent world models for RL.
- [When to Trust Your Model: Model-Based Policy Optimization (MBPO)](https://arxiv.org/abs/1906.08253) — Janner et al., NeurIPS 2019 — why short model rollouts from real states limit compounding error.
- [VisualWebArena: Evaluating Multimodal Agents on Realistic Visual Web Tasks](https://arxiv.org/abs/2401.13649) — Koh et al., ACL 2024 — the benchmark behind slide 40's search results.
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., ICLR 2023 — the one-call-per-step loop that LLMCompiler and tree search improve on.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Previous lecture: [[L20 - Search over Trajectories]]
- Topic deep dive: [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]]
- Topic deep dive: [[T05 - Planning, Task Decomposition and Multi-Agent Systems]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T07 - Computer-Use and Web Agents - Perception, Grounding and Action]]
- Topic deep dive: [[T11 - Policy-Gradient RL for Agents - REINFORCE, PPO and GRPO]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- [[Agentic AI - Design Patterns and Architecture]]
- [[Building AI Agents - Tutorials and Toolkits]]
- [[AI Agent Frameworks]]

[[L20 - Search over Trajectories|← L20]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L22 - How to Trust Your AI Agents|L22 →]]
