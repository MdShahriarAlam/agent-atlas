---
tags: [cmu-ai-agents, ai-llms, lecture-notes, agents, coding-agents, swe-bench]
aliases: ["CMU L6", "11-768 Lecture 6", "Agents for Coding and Software Development"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture-06-coding-agents.pdf"
---

# Lecture 6 · Agents for Coding and Software Development

[[L05 - Planning and Task Decomposition|← L5]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L07 - Computer Use Agents|L7 →]]

> [!info] CMU 11-768 AI Agents (Fall 2026) · Lecture 6 · Graham Neubig
> **Source:** lecture slides `lecture-06-coding-agents.pdf` (course folder *CMU AI Agents 2026 Lectures*), expanded with added context and references.
> **Deep dives:** [[T01 - The Agent Loop and Harness Design]], [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]], [[T06 - Coding Agents and Software-Engineering Benchmarks]], [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]], [[T12 - Rewards, Verifiers and Reward Hacking]]

Graham Neubig · 11-768 AI Agents, Fall 2026 · source slides: lecture-06-coding-agents.pdf (82 slides)

## Overview

A strong coding agent is the product of three things working together — a model trained on code and execution feedback, a harness of tools that lets it localize, edit and verify inside a real repository, and executable tasks that turn test results into both an evaluation signal and a training reward. The lecture traces this arc from single-shot code completion, through the localize–edit–verify loop of agents such as SWE-agent and OpenHands, to agents that handle the wider software lifecycle: frontend work, test writing, CI repair, library building and long-running maintenance.

**Learning objectives.** After this lecture you can:

- Explain how code LLMs are built in three stages (pre-training, mid-training, RL post-training) and why data cleaning, whitespace-aware tokenization, infilling and long context matter for code.
- Compare code-evaluation methods — exact match, BLEU/CodeBLEU, CodeBERTScore, execution-based pass@k — and say what each one can and cannot detect.
- Describe the localize–edit–verify loop, contrast it with a fixed workflow such as Agentless, and choose an edit format (whole file, search/replace, unified diff, patch) for a given model.
- Explain how SWE-bench-style tasks are evaluated (fail→pass and pass→pass tests) and how runnable training tasks are built (SWE-Gym, R2E-Gym, SWE-smith bug injection, multi-harness RL).
- Map the wider task landscape — frontend and visual repair, localization, app creation, library implementation, maintenance, test generation, CI repair — to its artifact, verifier and horizon.
- Reason about code world models: when predicting execution helps an agent and when you should simply run the code.

**Prerequisites.** Basic Python and git; familiarity with the LLM agent loop and tool calling (Lectures 1–2); a rough idea of what supervised fine-tuning and RL do.

**Where it fits in the course.** Coding is the first "domain" lecture and reuses nearly every earlier idea. The agent loop from L1 becomes localize–edit–verify; the tool-use design from L2 becomes the choice of shell versus structured edit tools and diff formats. L3 (long context) returns as repository-level context extension and file retrieval, L4 (memory and skills) as project instructions and reusable workflows, and L5 (planning) as fixed workflows versus open-ended agents and as world-model planning. Looking forward, L7 (computer-use/GUI agents) extends the browser verification introduced here, L8 (SFT) and L9/L11 (RL) formalize the trajectory training on SWE-Gym-style environments, and L10 (deep research agents) reuses the same search-and-verify pattern over documents instead of code.

## Concept map

![[cmu-ai-agents-L06-concept-map.png]]
*Concept map: Coding-agent concept map · model stages, harness loop, and the tests that evaluate, synthesize tasks and reward*

Read top to bottom: a code model trained in three stages runs the localize–edit–verify loop inside a harness; the patch is judged by executable tests, and the same tests power benchmarks, synthetic training tasks and the RL reward that flows back up to the model.

## Detailed notes

The lecture has six parts: models that write code, evaluating generated code, agentic coding and its toolsets, training and evaluating coding agents, frontend and broader software development, and models that predict code behavior.

### 1. Models that write code

**Three levels of coding agent.** The lecture opens with a ladder. Level 1 writes code in a single completion (autocomplete, "write a function"). Level 2 modifies repositories, touching several files to fix an issue. Level 3 performs development across the full software lifecycle: requirements, review, deployment and maintenance. Every level is built from the same **three ingredients**: a prompt (task plus context), tools (shell, editor, browser, test runner) and an LLM. The rest of the lecture improves each ingredient.

**What writing code demands.** Neubig names three abilities. *Language* means knowing syntax, library APIs and idioms. *Editing* means conditioning on code both before and after the point of change, because real edits happen mid-file. *Reasoning* means turning a specification into correct behavior, not just plausible-looking text.

**The training pipeline.** Modern code models pass through three stages:

| Stage | Data | Goal |
| --- | --- | --- |
| Pre-training | Large corpora including code | Broad language + code knowledge |
| Mid-training | Code-heavy mixtures, longer contexts | Deeper code skill, repository-scale context |
| RL post-training | Problems with executable checks | Reasoning, execution-verified correctness |

**Pre-training objective.** Pre-training is ordinary next-token prediction over a mixture of sources: web text, technical prose, mathematics, source code and documentation (the slide cites the OLMo report, Groeneveld et al., 2024, §2).

$$
\mathcal{L}_{LM} = -\mathbb{E}_{x \sim D_{mix}} \sum_{t} \log p_\theta(x_t \mid x_{<t})
$$

Here x is a training document drawn from the data mixture D\_mix, x\_t is its t-th token, x\_{\<t} are all earlier tokens, and p\_θ is the model with parameters θ. Two practical rules accompany it. Preserve structure: keep indentation, file boundaries, API signatures and the pairing of text with code, since these carry meaning. Evaluate during training: track held-out loss per domain and also run functional coding tasks, because loss alone does not show whether generated programs work.

**Choosing and cleaning data** (following the StarCoder data pipeline):

1. *Filter by language and source* — drop auto-generated dumps, broken encodings and low-value repetition.
2. *Deduplicate* — GitHub is full of forks, vendored libraries, near-identical files and copied solutions; duplicates waste compute and encourage memorization.
3. *Control provenance* — record licenses, source dates and opt-outs, and filter sensitive data such as keys or personal information.
4. *Prevent leakage* — split by repository or problem family and decontaminate evaluation tasks, otherwise benchmark scores measure memory rather than skill.

**Tokenizing code.** Code tokenizers use byte-level BPE trained on both code and prose, so a long identifier may span several tokens. Whitespace matters: in Python, spaces and newlines are syntax. The trick popularized by Codex (Chen et al., 2021) is to merge runs of whitespace into single tokens rather than spending one token per space. The slide shows the real StarCoder2 split of `if·ready:↵····return·value↵` as `if | ·ready | : | ↵··· | ·return | ·value | ↵`. The newline plus three spaces becomes one token, and the fourth indentation space attaches to `return`.

**Scale helps most languages.** StarCoderBase (Li et al., 2023) has 15.5B parameters and was trained on 1T tokens covering 80+ languages, including source files, GitHub issues, commits and notebooks. The figure plots pass@1 (vertical, roughly 0.02 to 0.32) against training tokens in billions (200 to 1,000), one curve per language. Most curves rise steadily; popular languages such as TypeScript, JavaScript, Python, C++ and Java end near 0.30, while low-resource languages such as shell, D, R and Racket stay near 0.10. A few curves (for example Swift) flatten or dip late.

**Mid-training: adding more code.** Mid-training continues language-model training on a code-heavier mix while retaining some text and math. The mixture is chosen empirically by comparing coding gains against general-capability retention. Code Llama (Rozière et al., 2023) took Llama 2 and trained on 500B additional tokens for 7B, 13B and 34B models, then extended context. Qwen2.5-Coder (Hui et al., 2024, Table 3) shows why pure code is a mistake:

| Code / text / math mix | Common code | MATH | MMLU |
| --- | --- | --- | --- |
| 100 / 0 / 0 | 49.8 | 10.3 | 23.8 |
| 70 / 20 / 10 | 48.3 | 33.2 | 62.9 |

Giving up 30% of the code budget costs only 1.5 points on code but more than triples math and nearly triples MMLU. **Why it matters:** a coding agent must read issues, docs and math-heavy specs, so general ability is not optional.

**Mid-training for long inputs.** Real bugs cross files. The slide's example: `types.py` declares that `Result.value` can be None, `worker.py` propagates a Result, and `caller.py` must complete the null check — the model can only do this if all three files are in context. Mid-training therefore builds coherent sequences of related files with paths and cross-file dependencies. Qwen2.5-Coder trains at 8K and then 32K tokens, and uses YaRN (a RoPE position-interpolation method) to reach 128K at inference. Validation must cover cross-file completion, infilling and short-context retention (see Lecture 3).

**Infilling (fill-in-the-middle).** Left-to-right models only see the prefix. InCoder (Fried et al., 2022 preprint, ICLR 2023) trains models to fill a gap using both sides. In the slide's example, `def is_positive(x: int) -> ____:` has a hole in the return type, and the body `return x > 0` to the right is the evidence that the answer is `bool`. The **causal masking** objective moves a span to the end of the document:

```text
Original:   prefix  span  suffix
Training:   prefix [M0] suffix [M0] span [END]
Inference:  prefix [M0] suffix [M0] -> generate span
```

The model still trains left to right, but it learns to generate the span after reading the suffix. Distinct sentinels (\[M0\], \[M1\], …) support several holes at once. This enables zero-shot editing tasks: completing code, inferring types, generating docstrings and renaming variables.

**Deeper dive — how FIM training is set up in practice.** Bavarian et al. (2022) turned InCoder's idea into a recipe most code models follow. A fraction of training documents (the *FIM rate*, typically 50%) is transformed; the rest stay ordinary left-to-right text, which is why completion quality is preserved. Each transformed document is cut at two random character positions into prefix, middle and suffix. Cutting at characters, not tokens or lines, teaches the model to finish half-typed identifiers, which matches what an IDE sends. Two orderings are used. *PSM*: `<PRE> prefix <SUF> suffix <MID> middle`. *SPM*: `<PRE> <SUF> suffix <MID> prefix middle`, which puts the prefix right before the middle so it can continue directly. At inference the editor sends the text up to the cursor as prefix and the text after it as suffix; the model generates the middle until an end token. Their headline finding was "FIM-for-free": at the scales tested, even high FIM rates did not measurably hurt left-to-right benchmarks, consistent with slide 17.

**Right context pays off.** On HumanEval-derived infilling tasks (InCoder §4.1), the percentage of completed functions passing tests was:

| Inference method | Suffix used for | Single-line | Multi-line |
| --- | --- | --- | --- |
| Left-to-right, 1 candidate | Not used | 48.2% | 24.9% |
| Left-to-right, 10 candidates | Reranking only | 54.9% | 28.2% |
| Causal-masked infilling | Generation | 69.0% | 38.6% |

Using the suffix during generation beats using it only to rerank. And infilling does not hurt ordinary completion: at a matched 52B-token budget, pass@1 was 6.0% (HumanEval) and 8.9% (MBPP) for left-to-right training versus 8.0% and 10.9% for causal masking (InCoder §5). Bavarian et al. (2022) later studied this "FIM for free" effect at scale.

**Beyond infilling: other signals in code data.** Code comes with rich side information that can become training data:

| Signal | Input → target | Example work |
| --- | --- | --- |
| Commit diffs | before + commit message → after / diff | OctoPack (Muennighoff et al., 2023) |
| Diagnostics | broken code + compiler error → repair | DrRepair (Yasunaga & Liang, 2020) |
| Tests | program + test outcomes → reward | CodeRL (Le et al., 2022) |
| Execution traces | program → executed lines + variable states | CodeExecutor (Liu et al., 2023) |

Each one teaches a skill an agent later needs: editing, repairing from error messages, optimizing for passing tests, and predicting what code does.

### 2. Evaluating generated code

**Reference-based metrics and their blind spot.** The earliest code-generation work borrowed from machine translation: *exact match* (does the output reproduce the reference?) and *BLEU-4* (token 4-gram overlap with a brevity penalty), as used in Yin & Neubig (ACL 2017, §5.1). The slide's running example shows why these fail. For "is integer x positive?" with reference `return x > 0`:

| Candidate | Textual similarity | Behavior |
| --- | --- | --- |
| `return x >= 0` | Very high (one character) | Wrong at x = 0 |
| `return not (x <= 0)` | Low | Equivalent for integers |

Text overlap rewards the wrong answer and punishes the right one. Code has many correct forms and tiny edits can break it.

**Structure-aware metrics.** CodeBLEU (Ren et al., 2020) adds code structure to BLEU. Its figure compares a machine translation and a human reference of a Java `Sign(double d)` method on three views: weighted n-gram match (keywords such as `return` weigh more), syntactic AST match (shared subtrees of the parse tree), and semantic data-flow match (which variables' values come from where, so renaming `d` to `c` does not matter).

$$
\text{CodeBLEU} = \alpha \cdot \text{BLEU} + \beta \cdot \text{BLEU}_{weight} + \gamma \cdot \text{Match}_{AST} + \delta \cdot \text{Match}_{df}
$$

α, β, γ, δ are mixing weights; BLEU\_weight is keyword-weighted n-gram match; Match\_AST is the fraction of reference subtrees found in the candidate; Match\_df is data-flow graph overlap.

**Learned-representation metrics.** CodeBERTScore (Zhou et al., EMNLP 2023) encodes the prompt plus each snippet with a code-trained encoder, compares contextual token vectors, takes the best match for each token, and turns these into precision, recall and F-score. It tolerates surface variation better than n-grams but is still a similarity judgment, not a correctness check.

**Execution-based evaluation.** The decisive shift, established by Codex/HumanEval (Chen et al., 2021), is to run the code. The candidate `return x >= 0` is run in an isolated runtime with time and memory limits against inputs −1, 0, 1 with expected outputs F, F, T. It returns F, T, T, so the test at 0 fails: "zero is not positive."

| Benefit | Limit |
| --- | --- |
| Accepts any correct implementation | Finite tests can miss incorrect behavior |
| Detects semantic errors by running | Needs trusted tests, dependencies and sandboxing |
| Measures observed behavior directly | Costs time and a stable environment |

EvalPlus (Liu et al., 2023) showed the first limit is real: adding many more tests to HumanEval lowered many models' scores, because weak tests had accepted wrong programs.

**Deeper dive — what "isolated runtime" means in practice.** Every execution-based metric and reward depends on a sandbox that behaves the same way every time. Typical ingredients: one container image per repository with dependencies pre-installed; network off, so code cannot download answers or call services; CPU, memory and wall-clock limits (DeepCoder used 6–12 s per test); a fresh copy of the file system per run, so one attempt cannot poison the next. Two failure modes matter most. *Flaky tests* pass or fail at random (timing, ordering, random seeds); benchmark builders run each test several times and drop unstable ones, or rewards become noise. *Environment drift*: a new library release changes behavior, so pinned versions and saved images are essential. For an RPA practitioner this is familiar: a bot validated on one machine image can fail on another, and a test environment must mirror production to mean anything.

**Function-level versus program-level benchmarks.** HumanEval has 164 hand-written Python functions: the model sees a signature and docstring, completes the body, and hidden unit tests judge it. CodeContests (from AlphaCode) uses competitive-programming problems, including Codeforces: the model reads a problem statement and writes a full program that must compile and pass tests.

**pass@k.** pass@k is the probability that at least one of k sampled programs passes all tests. Chen et al. give an unbiased estimator: sample n ≥ k programs per problem, count the c that pass, and compute

$$
\text{pass@}k = \mathbb{E}_{\text{problems}}\left[1 - \frac{\binom{n-c}{k}}{\binom{n}{k}}\right]
$$

The fraction is the chance that a random subset of k samples contains no passing program. The Codex figure plots pass rate against non-embedding parameters (10^5 to 10^10, log scale). GPT-3 stays at zero; Codex pass@1 climbs to about 0.2 at the largest size; Codex-S (fine-tuned on standalone functions) reaches about 0.3. Picking one of 100 samples by mean log-probability lifts this to about 0.45, and an oracle that picks any passing sample reaches about 0.8. **Why it matters:** the gap between reranking and oracle shows that *choosing* among samples is a large, open lever — which is exactly what test execution and verifiers later provide for agents.

**Non-functional requirements.** Tests check outputs, but developers also ask for faster, more readable or more secure code. NoFunEval (Singhal et al., 2024) has 397 code-editing tasks such as "make this code faster" where outputs must stay the same. Each quality needs its own checker: runtime efficiency is scored by running tests and timing (speedup); latency and resource-use edits by comparing with reference edits (DiffBLEU); maintainability and security by static analysis combined with edit match (CodeQL × DiffBLEU).

**Learning from test results (RL).** Execution checks also make a reward. DeepCoder (Luo et al., 2025) loops: sample responses (reasoning plus final code) for a problem, run the final code against tests, give pass/fail reward, update the model to make rewarded responses more likely, and sample again. This is RL with verifiable rewards, covered in depth in Lectures 9 and 11.

**Deeper dive — how a pass/fail reward becomes a gradient.** DeepCoder uses GRPO+, a variant of GRPO (Group Relative Policy Optimization, from the DeepSeekMath paper). For each problem it samples a group of G responses, scores each with the binary test reward r\_i, and gives each response an advantage relative to its group:

$$
A_i = \frac{r_i - \operatorname{mean}(r_1, \dots, r_G)}{\operatorname{std}(r_1, \dots, r_G)}
$$

Responses with positive A\_i are made more likely, negative ones less likely. Worked numbers: with G = 8 and 3 passing, the mean is 0.375 and the standard deviation is about 0.484. Passing responses get A ≈ +1.29; failing ones get A ≈ −0.77. If all 8 pass or all 8 fail, every A\_i is zero and the problem teaches nothing. That is why RL data is filtered to problems of medium difficulty for the current model. DeepCoder's reward is sparse: 1 only if the code passes all sampled tests (the 15 hardest per problem), 0 otherwise, with no partial credit. It also required at least 5 tests per problem, because with one or two tests a wrong program can pass by luck and the policy learns to exploit weak tests.

**Why reasoning helps.** The slide's example: compute 1 + … + n for 0 ≤ n ≤ 10^12. Three routes appear:

| Route | Code | Outcome |
| --- | --- | --- |
| Iterate | `sum(range(n + 1))` | Correct but too slow at large n |
| Pair endpoints, derive, check n = 0, 1 | `n * (n + 1) // 2` | Correct and efficient |
| Recall a formula, mistranscribe | `n * (n - 1) // 2` | Wrong already at n = 1 |

The winning route combines derivation with small-case checks. RL on execution rewards pushes models toward such reasoning because only it passes both correctness and time-limit tests.

**DeepCoder results.** The figure plots LiveCodeBench score (vertical, about 0.48 to 0.62) against RL training steps (0 to 1,000). The score rises noisily from about 0.48 to about 0.58. Vertical lines mark where the response-token limit was raised from 16K to 32K (around step 180) and 32K to 64K (around step 650). Evaluating the final 14B model with a 64K budget and no further RL (the star) lands at about 0.61, on the dashed o3-mini line. Two lessons: longer allowed reasoning during training helps, and extra inference tokens add a few more points for free.

### 3. Agentic coding and coding toolsets

**From single-step to agentic.** Single-step coding takes a self-contained prompt, produces reasoning plus code, and is evaluated once. Agentic coding starts from an issue and an *existing* repository, loops through search → edit → run tests as many times as needed, and ends with a patch plus evidence that it works. The key differences are that the context must be discovered, not given, and that the agent can observe the consequences of its own actions.

**The localize–edit–verify loop.** The lecture's teaching diagram (concepts from SWE-agent) uses one running bug across `cli.py`, `config.py` and `test_config.py`: a user sets `retries = 0`, but the program retries 3 times.

1. **Localize** — where does zero become the default? Search for `retries` and reproduce the bug. `rg 'retries' buggy_config.py` finds `return config.get("retries") or 3`. Running the targeted test gives `AssertionError: 3 != 0`. The cause: 0 is falsy in Python, so `or 3` replaces it. The slide adds a discipline note: "repair the condition, not the test."
2. **Edit** — change the defaulting rule so only a missing value gets the default:

```python
# Before: every falsy value (0, "", None) selects the default
return config.get("retries") or 3

# After: only None selects the default; an explicit 0 survives
value = config.get("retries")
return 3 if value is None else value
```

3. **Verify** — run the whole test file, not just the new case. All four pass: missing → 3, None → 3, zero → 0, positive → 2. If zero still became three, go back to localize; if a default case broke, revise the edit. Failure revises the hypothesis rather than ending the attempt.

**Common pitfall:** agents under reward pressure sometimes "fix" a failing test by editing the test or special-casing its input. Good harnesses and graders treat test files as read-only or check hidden tests.

**An alternative: a fixed workflow.** Agentless (Xia et al., 2024) shows you do not always need an open-ended agent. Its pipeline is fixed: (1–2) show the LLM the repository tree and ask for suspicious files, (3) also retrieve files by embedding similarity and combine the two lists into top-N files, (4) narrow to classes and functions, (5) narrow to exact edit locations, (6) sample several candidate patches, (7–8) generate reproduction tests and run them, together with existing tests, (9) filter and rank patches, and (10) submit one. The LLM never decides *what to do next*; the workflow does. This is cheaper and more predictable, and it was competitive with agents on SWE-bench Lite when published. The trade-off is flexibility: a fixed workflow cannot adapt when the bug needs an unusual step (see Lecture 5 on planning).

**Shell-only toolsets.** mini-SWE-agent gives the model a single tool: bash. The model chooses a command, and the harness returns output, exit status and a timeout signal. Reading and searching use `rg`, `cat`, `find`; editing uses `sed`, a Python script or `patch`; checks use `pytest` or build commands. The appeal is simplicity: modern models already know Unix tools well, and the harness is tiny. For example:

```text
sed 's/^RETRIES = 3$/RETRIES = 5/' settings.py > settings.new
mv settings.new settings.py
```

Match the line, write the result, replace the file. For changes across many files, the model can write a short Python script instead.

**Structured edit formats.** Most harnesses also offer dedicated edit tools. The lecture compares four formats:

| Format | What the model sends | Strength | Weakness | Used by |
| --- | --- | --- | --- | --- |
| Whole file | Entire new file content | Trivial to apply | Repeats unchanged code; costly, risks silent deletions | Pi write, OpenCode write, OpenHands create |
| Search / replace | Old text block and new text block | Compact | Old text must match exactly once | OpenHands, Pi, OpenCode edit; Aider |
| Unified diff | `---`/`+++` headers, `@@` hunks with -/+ lines and context | Standard, familiar from git | Line numbers are easy for models to get wrong; Aider omits them | Aider (simplified) |
| File-operation patch | `*** Begin Patch` / `*** Update File:` / hunks / `*** End Patch` | File operations plus context, no line counts | Custom syntax the model must learn | Codex; OpenCode / OpenHands depending on preset |

**Format can make a big difference.** On Aider's refactoring benchmark (89 Python tasks that move a method inside a large class to a top-level function, checked for syntax and code preservation), GPT-4 Turbo (gpt-4-1106-preview) succeeded 20% of the time with search/replace and 61% with a simplified unified diff. Aider attributed much of the gap to "lazy coding": with some formats the model elided code with comments like "... rest unchanged". **Why it matters:** the edit format is part of the model–harness interface, and the best format depends on the model and on how it was trained. This is one reason vendors train models on their own harness format.

**Deeper dive — the arithmetic of edit formats.** Take a 400-line file at about 10 tokens per line, so about 4,000 tokens. Changing one line with *whole file* costs about 4,000 output tokens. With *search/replace* it costs the old line, the new line and markers, perhaps 40–60 tokens: about 70x cheaper. Output tokens are the slow and expensive part of generation, so across a 30-step session the difference is large. Each format has a characteristic failure. Whole file: "lazy" elisions such as `# ... rest unchanged ...` that delete real code. Search/replace: zero or multiple matches when the model misremembers whitespace or the snippet repeats. Unified diff with line numbers: wrong hunk offsets because models count lines poorly. Patch formats without numbers: a context line that no longer exists after an earlier edit. Good harnesses make each failure loud and specific ("SEARCH block matched 0 times; closest match at line 212") so the agent can retry instead of silently corrupting the file.

**Finding relevant code.** Localization starts from the symptom: `rg 'retries' .` may match a CLI flag, a config loader and a retry loop. The agent must then *follow the value*: where is zero first read (configuration input), and where does zero become three (defaulting logic)? Plain text search gives candidates; reasoning about data flow picks the right one.

**Dependency graphs.** LocAgent (Chen et al., 2025) parses a repository into a graph of files, classes and functions linked by relations such as *contains*, *imports*, *calls* and *inherits*. In the slide's example, `cli.py:configure_client` calls `config.py:retry_count(config)`, whose result is used by the retry loop in `client.py`, and `test_config.py` covers the zero/None/missing cases. The agent retrieves the relevant neighborhood of the graph around the issue, then checks it with execution. Graph traversal finds multi-hop dependencies that keyword search misses.

**Deeper dive — building a tiny call graph yourself.** You do not need LocAgent to try the idea. Python's standard `ast` module parses source files into trees; walking each function for `Call` nodes gives caller → callee edges. Inverting them answers "who calls this?", the query that finds slide 45's neighborhood. The sketch below was run on a three-file toy version of the retries example.

```python
import ast

SRC = {
    "config.py": "def retry_count(config):\n    return config.get('retries') or 3\n",
    "cli.py": "from config import retry_count\ndef configure_client(cfg):\n    return retry_count(cfg)\n",
    "client.py": "from cli import configure_client\ndef run(cfg):\n    n = configure_client(cfg)\n    return n\n",
}

edges = []
for fname, code in SRC.items():
    for fn in ast.walk(ast.parse(code)):
        if isinstance(fn, ast.FunctionDef):
            for node in ast.walk(fn):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    edges.append((f"{fname}:{fn.name}", node.func.id))

callers = {}
for src, dst in edges:
    callers.setdefault(dst, []).append(src)

def neighborhood(target, depth=2):
    seen, frontier = [], [target]
    for _ in range(depth):
        frontier = [c for f in frontier for c in callers.get(f, [])]
        seen += frontier
        frontier = [c.split(":")[1] for c in frontier]
    return seen

print(edges)
print(neighborhood("retry_count"))
```

```text
[('cli.py:configure_client', 'retry_count'), ('client.py:run', 'configure_client')]
['cli.py:configure_client', 'client.py:run']
```

Two hops from `retry_count` reach both files that could observe the bug. Real tools add method calls (`obj.method()`), imports and inheritance, and resolve names across modules; this toy matches only bare names, so it would miss `self.retry_count()`. That gap is why LocAgent pairs graph retrieval with search and execution.

### 4. Evaluating and training coding agents

**SWE-bench: evaluating issue resolution.** SWE-bench (Jimenez et al., ICLR 2024) builds each task from a real GitHub issue and the pull request that fixed it. The figure walks through one astropy task ("vstack'ing structured array tables fails with casting error"):

1. **Input** — the model gets the codebase snapshot and the problem statement.
2. **Generate** — it outputs a patch (in the figure, SWE-Llama edits `astropy/utils/metadata.py` so `return arr.dtype.str` handles structured dtypes).
3. **Evaluate** — a harness applies the patch, then applies the held-back test files from the real PR, and runs them.
4. **Results** — the named tests (`test_join_struct_col`, `test_vstack_struct_col`, `test_dstack_struct_col`) are logged.

Two test sets decide success. **Fail → pass** tests failed before the real fix and must pass now: they check the requested repair. **Pass → pass** tests passed before and must still pass: they check that existing behavior is preserved. A task counts as resolved only if both sets pass. The model never sees these tests, so it must infer the fix from the issue text alone.

**Building runnable training tasks.** Evaluating agents needs runnable repositories; training them needs thousands. SWE-Gym (Pan et al., 2024) packages each task as:

| Component | Contents |
| --- | --- |
| Starting state | Files + installed dependencies + a test command |
| Issue | Requested behavior + reproduction |
| Checks | The bug fails before the fix; the repair restores behavior |

The slide's rule: *validate the environment before collecting training trajectories*. A task whose dependencies do not install, or whose tests fail for unrelated reasons, produces garbage reward.

**RL for multi-step repairs.** R2E-Gym (Jain et al., 2025) frames repair as RL over whole trajectories. The assistant's actions — search (find `config.py`), edit (preserve zero), test/finish (check regressions) — are the training targets. The environment's observations — files found, patch applied, test output — are context only and are masked out of the loss. The objective is

$$
\max_{\theta} \; \mathbb{E}_{\tau \sim \pi_\theta} \left[ R(\tau) \right]
$$

where τ is a full trajectory of actions and observations, π\_θ is the agent policy with parameters θ, and R(τ) is a terminal reward: 1 if the final patch passes the tests, else 0. **Credit assignment** is the core difficulty: "a late failure does not identify which earlier decision was wrong." Did the agent search the wrong file, or edit the right file badly?

**Deeper dive — practical answers to credit assignment.** Four families of fixes appear across the cited work. (1) *Filter, then imitate*: keep only successful trajectories and fine-tune on them (rejection-sampling fine-tuning). SWE-Gym's training-scale plot uses this; it sidesteps credit assignment by treating every step of a success as good. (2) *Denser sub-rewards*: score intermediate products that have their own ground truth. CodeScout's file/module/function F1 (slide 64) rewards localization even when the final patch fails. (3) *Learned step judges*: a verifier or process reward model scores partial trajectories, as SWE-Gym's verifier does for whole ones. (4) *Group comparison*: sample many rollouts of the same task; steps that appear more often in successful rollouts are implicitly credited. In all four, observations stay masked out of the loss, as slide 49 marks "context only": the model should learn to choose actions, not to predict tool output. That split is exactly what the world-model section (slides 74–79) revisits.

**Training data and inference compute both scale.** SWE-Gym's 32B-model results appear as two plots. *Training-time scaling* plots SWE-Bench Verified resolve rate against the number of successful training trajectories used for fine-tuning (log scale, about 100 to 500): about 10.8% at roughly 120 trajectories, 16.8% at roughly 250, and 20.6% at roughly 490 — close to log-linear. *Inference-time scaling* plots resolve rate against the number of agent rollouts per task (1 to 16), with a learned verifier choosing which rollout's patch to submit. One greedy rollout (temperature 0) scores about 20.6%; with temperature 0.5 and a verifier, the rate climbs steadily to about 32% at 16 rollouts. **Why it matters:** this is the agentic version of the pass@k reranking gap in Section 2.

**Creating repair tasks by injecting bugs.** Real issue–fix pairs with working environments are scarce. SWE-smith (Yang et al., 2025) inverts the process. Its pipeline: take real repositories whose unit tests pass; let SWE-agent try to install the repo and run tests, then have a developer write a Dockerfile from that work; generate tasks by four strategies — procedural modification of the code, LM-generated bugs, combining bugs, and PR mirroring (undoing a real PR's change); keep only candidates that make some existing tests fail. Each new task instance ships an environment image, a generated issue text, the bugged patch and the verified tests. The summary rule: *prepare* an executable baseline, *mutate* code not tests, *keep* only new test failures.

**Injecting and checking one bug.** Using the retries example, SWE-smith would mutate the working rule:

```python
# Working baseline: all four tests pass
value = config.get("retries")
return 3 if value is None else value

# Mutated condition: zero now becomes three; one test fails
value = config.get("retries")
return 3 if not value else value
```

Before: 4 pass. Mutated: 3 pass, 1 fail. Restored: 4 pass. The failing test becomes the fail→pass check and the other three become pass→pass checks. Because the environment is built once per repository, not once per task, this is cheap.

**Working across languages.** Agents must discover how each project builds. Python projects have `pyproject.toml` and use `pytest`; TypeScript projects have `package.json` and use `npm test`; Rust projects have `Cargo.toml` and use `cargo test`. The rule: read the project configuration before choosing build and test commands. Multi-SWE-bench and SWE-bench Multilingual extend SWE-bench-style evaluation beyond Python.

**Multi-harness training.** A *harness* is prompts + tools + agent loop + context management. A model trained in only one harness overfits to its tool names, edit format and prompt style. Multi-harness training runs the same weights inside several harnesses — for example OpenHands, OpenCode and Codex — collects trajectories and patch→test rewards from all of them, and updates one shared model. The slide cites NVIDIA's Nemotron 3 Ultra (at least two harnesses per task distribution) and Polar (native harnesses call a shared model API proxy, so each harness runs unmodified while the trainer sees every call).

**Deeper dive — what harness overfitting looks like.** Suppose RL happens only inside a harness whose edit tool is `str_replace_editor` with arguments `old_str` and `new_str`. The model learns strong habits: call that exact tool name, send search/replace blocks, expect its error messages. Deployed in Codex, the edit tool is `apply_patch` with the file-operation patch format of slide 42. The model may call a tool that does not exist, or send search/replace text inside a patch envelope. Each failure wastes a turn, and slide 43 showed format alone can swing success from 20% to 61%. Other hidden couplings: prompt phrasing, how long tool outputs are truncated, and when the harness compacts context. The proxy design in Polar avoids re-implementing each harness for training. The trainer exposes a model API; each harness calls it as it would call a hosted model; the proxy records every request, response and token so rewards can be attached afterward. The harness code stays exactly what users run.

### 5. Frontend and broader software development

**Frontend work needs a browser in the loop.** The localize–edit–verify loop still applies, but verification changes. Localize means finding components and event handlers; edit means changing logic and styles; verify means *exercising behavior* in a browser (type → click → check saved state) and *inspecting the rendered page* (screenshot → visual understanding). SWE-bench Multimodal (Yang et al., 2024) gave SWE-agent browser and screenshot tools for exactly this, because unit tests alone cannot see a misaligned button.

**Browser agents versus automation scripts.** There are two ways to verify in a browser:

| Approach | Who decides each step | Strength | Typical use |
| --- | --- | --- | --- |
| Browser agent | The model: observe → choose action → type/click | Adaptive exploration of unknown UIs | Investigating a bug; covered next lecture (VisualWebArena, Koh et al., 2024) |
| Playwright script | The model writes a program once | Repeatable, fast, becomes a regression test | Checking a known fix |

A Playwright check for a contact form might be: fill Name with spaces (`fill()`), click Save contact (`click()`), assert the saved state (`expect()`), and capture an image (`screenshot()`). Screenshots can then be inspected visually by the model or compared with an approved baseline image.

**Verifying a frontend repair.** The classroom example: a contact form saved a record whose name was only spaces. The fix changes `value.length` to `value.trim().length`. Verification has two sides. *Behavior*: a blank name now creates 0 records, and valid names still save. *Appearance*: the error message is visible and readable beside the Name field.

**Evaluating visual issue resolution.** In SWE-bench Multimodal, the issue includes an image (observed: blank name accepted; expected: rejected). The candidate patch changes validation. Grading uses execution checks (blank → error, no new record) and regression checks (valid name → save; existing tests pass). The slide's key point: *an image in the issue does not make image similarity the grading rule.* Tests still decide.

**From requirements to maintenance.** Real development is a lifecycle, not a single patch:

1. **Requirements** — user needs, compatibility constraints.
2. **Implementation loop** — edit ⇄ test.
3. **Review** — diff plus evidence feeds a release decision.
4. **Deploy / monitor** — production signals and a rollback path.
5. **Maintain** — new requests and observed failures feed back into requirements.

"A test pass is one step, not the release decision."

**Where developers spend their time.** Meyer et al. (2019, Table 2) analyzed 5,928 self-reported workdays at Microsoft. Coding — reading and writing code and tests — was only 15% of the day. The other 85%: meetings and email 25%, debugging and bug fixing 14%, helping, sync-ups and networking 11%, running tests 8%, learning, admin and various 8%, breaks 8%, requirements and documentation 6%, code review 5%. **Why it matters:** an agent that only writes code addresses a small slice of engineering work; the lecture's remaining tasks target the other slices.

**Comparing development tasks.** Each task differs in what the agent produces, what checks it, and how long it runs:

| Task | Artifact | Environment / verifier | Horizon |
| --- | --- | --- | --- |
| Repair | Patch | Repository / regression tests | One issue |
| Library creation | Implementation | Scaffold / package tests | Many functions |
| Test generation | New test | Buggy + fixed versions / discrimination | One behavior |
| CI repair | Code or configuration | Workflow / required checks | Build run |
| Evolution | Accumulated changes | Persistent app / milestone + regressions | Dependent tasks |

**Localization as its own task.** CodeScout (2026) trains a search policy that takes an issue plus repository, inspects and searches, and predicts locations at three levels: file (`django/…/datetime.py`), module or class (`TruncDate`) and function (`as_sql`). The reward is F1 at each of the three levels against the locations touched by the gold patch. The gold patch is used only for scoring, never shown to the policy.

**App creation and modification.** ViBench (evaluator definitions checked 2026-09-07) starts from a product or feature description and has three settings: *Zero-to-One* (build a new application, 15 apps), *Vibe-on-Ref* (extend a reference MVP, 45 apps) and *Vibe-on-Vibe* (extend the agent's own earlier MVP, 45 apps). Every result is checked with human-authored browser test plans. Vibe-on-Vibe is the realistic hard case: the agent must live with its own earlier design choices.

**Library implementation.** Two benchmarks take different angles. *Commit0* gives a library scaffold where function bodies such as `parse(…)` and `evaluate(…)` are missing, plus documentation and tests; the agent must implement them together so the integrated package tests pass. *ProgramBench* gives a reference executable; the agent probes it with inputs, observes outputs, and writes a new implementation that matches observable behavior. Different internal designs can pass.

**Software maintenance.** SWE-Milestone (2026) contrasts two evaluation styles. *Independent task evaluation* (SWE-bench) gives each issue a fresh repo snapshot and scores one patch. *Continuous task evaluation* feeds a task stream with a dependency graph: milestones M1 and M2 start unlocked, M3 unlocks only when M1 and M2 are done. The agent works on one evolving codebase, the harness tags a commit per milestone (Tag-M1, Tag-M2, Tag-M3), and each tag is tested. Mistakes now compound across tasks.

**Test generation.** SWT-Bench (Mündler et al., 2024) asks the agent to write tests that reproduce an issue. Example issue: `isValid` accepts trailing newlines but should accept only alphanumerics. A good test such as `isValid("name\n") == False` *fails before* the fix and *passes after* it. `isValid("name") == True` passes both times, so it does not detect the bug. `isValid("name") == False` fails both times, so it is simply wrong. Only fail-before/pass-after tests count.

**CI repair.** LCA CI Builds Repair (dataset revision ebf12dad) gives a failing build log and asks for the causally relevant change. Example: the runtime is Node 16, the package requires Node ≥ 18, and `npm ci` fails with `EBADENGINE`. The fix is in configuration, not code: set `node-version: '20'` in the setup-node step. The agent should inspect the supported runtime, then rerun install, build and tests.

**Learning skills for new tasks.** The goal is transfer: train a policy (SFT or RL) on skills such as finding relevant code (search, dependencies), implementing functions (spec → code) and writing bug tests (issue → executable check), then evaluate on held-out tasks in new repositories — repairing an issue, building a library, detecting a new bug — at an equal inference budget.

**Generating projects for practice.** SWE-Playground (Zhu, Gandhi & Neubig) synthesizes training projects from scratch in six stages: (1) an LLM proposes projects (e.g. a Python `filesystem-simulator` with ext4-like inodes); (2) it breaks each into tasks with edge cases and assertions; (3) it sets up a repository with `src/`, `tests/`, `README.md`, `tasks.md`, `pyproject.toml`, a Dockerfile and function stubs that raise `NotImplementedError`; (4) it generates unit tests, which initially fail; (5) an agent implements functionality by reading tests, coding, verifying and revising; (6) the pipeline adapts to specific capabilities — API-based problem solving, bug fixing, test design and issue reproduction, and library generation.

**Transfer results.** Hybrid-Gym (2026) reports selected 32B results, base versus trained model: SWE-bench Verified repair 7 → 32.4; SWT-Bench Verified test generation 9.01 → 16.86; Commit0 Lite library building 8.34 → 13.45 (success %, defined separately per task). Gains on tasks unlike repair suggest the training teaches general development skill, not just one benchmark.

### 6. Models that predict code behavior

**Policy versus world model.** An agent has a history h: the code it has inspected and the tool results so far. Its *policy* π(a | h) chooses the next action, e.g. "run the test." The real environment then executes the action and returns an observation, e.g. "assertion fails." A *world model* p(o | h, a) instead *predicts* that observation without executing. The same history conditions both. The prediction can be wrong, which is the central risk.

**Deeper dive — when is predicting cheaper than executing?** Treat it as an expected-cost decision. Let c\_exec be the cost of running the test (time, sandbox), c\_pred the cost of asking the world model, q the probability the prediction is wrong, and L the loss when a wrong prediction leads to a bad decision (for example, discarding the correct patch as on slide 76). Predicting is worth it when

$$
c_{\text{pred}} + q \cdot L < c_{\text{exec}}
$$

Example: a test suite takes 60 s, a prediction takes 3 s, and a wrong decision costs a rerun of a 600 s repair attempt. The break-even error rate is q < (60 − 3) / 600 = 9.5%. A world model with 95% accuracy is worth using; one with 85% is not. In practice the agent uses the model's confidence: predict when confidence is high, execute when it falls below a threshold. That is slide 79's "when to execute?" question. Measuring both failures and savings at several thresholds traces out the trade-off curve.

**Execution prediction is subtle.** The slide's example:

```python
items = [1]
alias = items          # alias refers to the SAME list object
alias.append(2)
result = len(items)
# True state: items == [1, 2], alias == [1, 2], result == 2
# Common wrong prediction: treat alias as a copy -> items == [1], result == 1
```

A model that reasons about code as text can miss aliasing, mutation and other reference semantics. Training on real execution traces targets exactly this gap.

**When predictions help — and when they hurt.** Suppose an agent has two candidate repairs: A is correct and B is wrong. A world model predicts that A fails and B passes (an illustrative mistake). If the agent trusts it, it chooses B and discards A — a wrong decision that execution would have avoided. The lecture's advice: run both candidates to check the model's judgment, and compare approaches on task success *and* total latency, tokens and tool calls. Prediction is only worthwhile if it saves real cost without costing correctness.

**Learning from program execution: CWM.** Meta's Code World Model (FAIR CodeGen Team et al., 2025) builds world modeling into training. Its pipeline, as shown on the slide:

| Stage | Tokens | Context | Checkpoint |
| --- | --- | --- | --- |
| General pre-training | 8T | 8K | — |
| Code world modeling mid-training | 5T | 131K | CWM pretrained |
| SFT: instruction and reasoning | 100B | 32K | CWM sft |
| Joint RL: agentic and reasoning | 172B | 131K | CWM |

The mid-training stage is where execution data enters: the model learns from traces of program state during execution and from agent interactions in containerized environments, so it can simulate what code will do.

**Building and using simulators: Code World Models.** Dainese et al. (2024) take a different route: instead of a neural world model, the LLM *writes code* that simulates an environment. Inputs are trajectories collected from the environment, a description of the environment and task, and an LLM. A search procedure, GIF-MCTS (Monte Carlo tree search over generate, improve and fix actions on programs), produces a candidate `class Environment` (e.g. a CartPole simulator with `cart_position`). The candidate is validated against the recorded trajectories. If it cannot predict correctly, feedback on the wrong predictions goes back into the search; if it can, the agent plans with the code world model, which is fast and exact where it is correct.

**Open questions.** The lecture closes the topic with four:

1. *Better decisions?* Measure prediction errors and task success on the same problems, not separately.
2. *Lower cost?* Count latency, tokens and real environment calls.
3. *New settings?* Hold out programs, dependencies and environments to test generalization.
4. *When to execute?* Vary the threshold at which the agent falls back to real execution, and measure failures as well as savings.

### 7. Conclusion: designing a coding agent

The lecture's summary doubles as a design checklist:

- **Code models:** pre-training, mid-training and RL from execution rewards.
- **Agentic coding:** localize, edit and verify with the right tools and edit formats.
- **Agent training:** runnable tasks, repair rewards and diverse harnesses.
- **Frontend development:** browser interaction and visual verification.
- **Broader development:** localization, apps, libraries, maintenance, tests and CI.
- **Code-behavior prediction:** learned models that support, but do not replace, execution and planning.

The common thread is **executable verification**. Tests evaluate models, reward RL, filter synthetic tasks, select among rollouts and guide the agent's own loop. Next class: GUI agents (Lecture 7).

## Slide-by-slide companion

Read this next to the PDF: each entry says what the slide shows, what it means, and how it connects to the rest of the course.

### Slides 1–10 · Framing and pre-training

**Slide 1 — Agents for Coding and Software Development.** Title slide: "From code completion to software engineering", Graham Neubig, CMU Language Technologies Institute. The subtitle is the lecture's arc: start with a model that finishes a line, end with an agent that participates in a whole engineering process.

**Slide 2 — Coding agents.** Three numbered boxes form a ladder of ambition. (1) *Writes code*: a single completion from a prompt. (2) *Modifies repositories*: edits spread over multiple files in an existing codebase. (3) *Performs development*: the full software lifecycle, from requirements to maintenance. Each rung needs more than the last. Rung 1 needs a good model. Rung 2 needs tools to search, edit and run code. Rung 3 needs judgment about requirements, review and release. The lecture follows this ladder: slides 4–30 cover rung 1, slides 31–59 cover rung 2, and slides 60–72 cover rung 3. Keep this ladder in mind when you read a benchmark result: a score on HumanEval (rung 1) says little about SWE-bench (rung 2).

**Slide 3 — Three ingredients.** Three panels: *Prompt*, *Tools*, *LLM*. The middle panel (Tools) is highlighted in red. This is the same decomposition as Lecture 1's agent definition and Lecture 2's tool-use lecture. A coding agent is not a special model; it is a general model plus a coding-specific prompt plus coding-specific tools (shell, editor, test runner). The red highlight hints at a theme of the lecture: much of the difference between coding agents comes from the tool interface (slides 38–45), not only from the model.

**Slide 4 — Models that write code.** Section divider. The next 26 slides explain how a model gains the raw skill of producing code and how that skill is measured.

**Slide 5 — Writing code from a prompt.** Three panels name what a code model must know. *Language*: syntax, APIs and idioms, meaning it must produce code that parses, calls real library functions, and looks like code people write. *Editing* (red): condition on both sides, meaning it must fill a gap using code before and after the cursor, since real editing rarely happens at the end of a file. *Reasoning*: specification → behavior, meaning it must turn a description of what should happen into code that does it. Each panel maps to a training stage later: language comes mostly from pre-training (slides 7–10), editing from infilling objectives (slides 14–17), and reasoning from RL with execution rewards (slides 28–30).

**Slide 6 — Training a coding model.** Three stages left to right. *Pre-training* on large corpora that include code. *Mid-training* (red) on code-heavy mixtures and longer contexts. *RL post-training* for reasoning, rewarded by execution. The term "mid-training" is newer than the other two. It means continued next-token training after general pre-training, on a mixture shifted toward the target domain. It is cheaper than pre-training from scratch and keeps general skill. Compare Lecture 3, where long-context extension is also done as a mid-training stage.

**Slide 7 — Pre-training: learning from code and text.** Three bullets and one equation, citing OLMo (Groeneveld et al., 2024, section 2). *Mix sources*: web text, technical prose, mathematics, source code and documentation. *Preserve structure*: indentation, file boundaries, APIs and text–code relationships (for example, a docstring next to its function). *Evaluate during training*: held-out loss per domain plus functional coding tasks, because loss alone can hide a regression on real coding. The equation is the standard language-modeling loss:

$$
\mathcal{L}_{\text{LM}} = -\mathbb{E}_{x \sim D_{\text{mix}}} \sum_t \log p_\theta(x_t \mid x_{<t})
$$

Here x is one training document drawn from the data mixture D\_mix, x\_t is its t-th token, x\_{\<t} is every token before it, and p\_θ is the model with parameters θ. Nothing in the loss is specific to code. What makes a code model is the choice of D\_mix, which is why the next slide is about data.

**Slide 8 — Pre-training: choosing and cleaning data.** Four bullets, citing StarCoder's data pipeline. *Filter by language and source*: drop generated dumps (for example minified JavaScript or auto-generated protobuf files), broken encodings and low-value repetition. *Deduplicate*: GitHub is full of forks, vendored copies of libraries, near-identical files and copied solutions; without deduplication the model memorizes these and wastes compute. *Control provenance*: record licenses, source dates and opt-outs, and filter sensitive data such as keys and personal information (StarCoder offered an opt-out process and ran PII redaction). *Prevent leakage*: split data by repository or problem family, not by file, and decontaminate evaluation tasks. If a HumanEval solution sits in the training set, the benchmark measures memory, not skill. This last bullet returns in slide 70's held-out evaluations and in the benchmark-contamination discussion in Going deeper.

**Slide 9 — Pre-training: splitting code into tokens.** Three bullets and a worked tokenization. *Learn code-aware subwords*: byte-level BPE trained on code plus prose, so identifiers like `snake_case_name` can split across several tokens. *Preserve whitespace*: spaces, tabs and newlines carry syntax in Python and literal content in strings. *Compress frequent runs*: merge runs of whitespace into single tokens rather than paying one token per space. The example is an actual StarCoder2 split. Source `if·ready:↵····return·value↵` becomes `if | ·ready | : | ↵··· | ·return | ·value | ↵`. Note two details. The newline and three of the four indent spaces merge into one token (`↵···`). The fourth space attaches to the next word (`·return`), the usual GPT-style convention of a leading space on words. Citations: StarCoder section 5.3, Chen et al. 2021 (Codex added whitespace-run tokens), and the StarCoder2 tokenizer. Why it matters: fewer tokens per file means more code fits in a context window and each training step sees more code.

**Slide 10 — Pre-training on a large code corpus.** A line chart from the StarCoder paper (Li et al., 2023). Horizontal axis: training tokens in billions, 200 to 1,000. Vertical axis: pass@1, about 0.02 to 0.33. Each colored curve is one programming language. At 1,000B tokens the top group is roughly 0.29–0.32 (TypeScript, JavaScript, C++, Python, Scala, Java). A middle group sits around 0.20–0.27 (PHP, Lua, Rust, Go, Julia, C#). A lower group sits around 0.10–0.18 (Ruby, Swift, Perl, shell, Racket, D, R). Most curves rise steadily. A few flatten or dip late (Swift and R peak near 800B). The side panel gives the model: StarCoderBase, 15.5B parameters, 1T tokens, 80+ languages, trained on source, issues, commits and notebooks. The red takeaway: most languages improve with more tokens. The gap between languages mostly tracks how much data each has; low-resource languages start and stay lower. That is one motivation for the multilingual evaluations on slide 53.

### Slides 11–18 · Mid-training and infilling

**Slide 11 — Mid-training: adding more code.** Four bullets, citing Code Llama (Rozière et al., 2023, section 2). *Continue language-model training*: raise code exposure while keeping text and math in the mix, so the model does not forget how to read an issue or reason about numbers. *Choose the mixture empirically*: run ablations and compare code gains against general-capability retention; there is no formula for the right ratio. *Code Llama*: start from Llama 2 and train on 500B additional tokens for the 7B, 13B and 34B models. *Then extend context*: train on related files and longer sequences with suitable position encodings. The order matters: first shift the domain, then lengthen the context. Code Llama's approach is the template: it is far cheaper to specialize a strong general model than to pre-train a code model from nothing, and the general model already knows English, which issues and docstrings need.

**Slide 12 — Mixing code, text, and math.** A two-row table from Qwen2.5-Coder (Hui et al., 2024, Table 3, selected columns). Columns: data mix (code / text / math percentages), Common code score, MATH, MMLU.

| Mix (code / text / math) | Common code | MATH | MMLU |
| --- | --- | --- | --- |
| 100 / 0 / 0 | **49.8** | 10.3 | 23.8 |
| 70 / 20 / 10 | 48.3 | **33.2** | **62.9** |

The red highlights mark the best value per column. Pure code wins on code by only 1.5 points. The mixed recipe more than triples MATH (10.3 → 33.2) and nearly triples MMLU (23.8 → 62.9). The lesson: a small code loss buys a large gain in general reasoning and knowledge. For an agent this trade is clearly worth it, because agents must read natural-language issues, understand domain concepts and plan. Qwen2.5-Coder adopted the 7:2:1 mix.

**Slide 13 — Mid-training: handling longer inputs.** A three-box diagram shows why cross-file context matters. `types.py` says `Result.value` can be None → `worker.py` propagates the `Result` → `caller.py` must complete the null check. Completing the code in `caller.py` correctly needs evidence two files away. Three bullets. *Coherent sequences*: build training sequences from related files with their paths and cross-file dependencies, not random concatenations. *Positions + length*: Qwen2.5-Coder trains at 8K, then 32K tokens; YaRN (a RoPE rescaling method) extends inference to 128K. *Validate*: check cross-file completion, infilling, and that short-context skill is retained. The citation points to Qwen2.5-Coder section 3.2.2 and back to Lecture 3 (long context), where RoPE scaling and context extension were covered in depth.

**Slide 14 — Infilling: using code before and after a gap.** Two code panels. Left: `def is_positive(x: int) -> ____:` with body `return x > 0`, captioned "the body is to the right of the hole". Right: the hole filled with `bool`, captioned "the suffix supplies evidence for bool". A left-to-right model sees only `def is_positive(x: int) ->` when it must choose the type. It can guess from the name, but the decisive evidence (a comparison returns a boolean) comes after the hole. This is the everyday editing case: IDE completions happen in the middle of files, with code on both sides. Source: InCoder (Fried et al.), sections 2 and 4; the example is illustrative.

**Slide 15 — Infilling: marking and predicting gaps.** Three rows show the causal-masking format. *Original*: `prefix span suffix`. *Training*: `prefix [M0] suffix [M0] span [END]`, meaning the span is cut out, replaced by a sentinel token \[M0\], and appended at the end after a second \[M0\]. *Inference*: `prefix [M0] suffix [M0]` → generate the span. The trick is that the model is still an ordinary left-to-right model; only the document order changes. By the time it writes the span it has already read the suffix. Two bullets. *One or more holes*: distinct sentinels (\[M0\], \[M1\], …) tie each span to its location. *Zero-shot edits*: the same model can complete code, infer types, write docstrings and rename variables without task-specific training. Citation: InCoder (2022 preprint; ICLR 2023). The related "fill-in-the-middle" (FIM) format of Bavarian et al. 2022 uses prefix/suffix/middle sentinels in the same spirit and is what most modern code models use.

**Slide 16 — Infilling: the value of right context.** A table of functions passing tests on HumanEval-derived infilling tasks (InCoder section 4.1).

| Inference method | Suffix used for | Single-line | Multi-line |
| --- | --- | --- | --- |
| Left-to-right, 1 candidate | Not used | 48.2% | 24.9% |
| Left-to-right, 10 candidates | Reranking only | 54.9% | 28.2% |
| Causal-masked infilling | Generation | **69.0%** | **38.6%** |

The middle row is a strong baseline: sample 10 left-to-right candidates and use the suffix to rerank them. It helps (+6.7 points single-line), but using the suffix during generation helps far more (+20.8 points over one left-to-right sample). The lesson generalizes: information is worth most when it shapes the generation, not when it only filters finished outputs.

**Slide 17 — Infilling: preserving code completion.** A second InCoder table (section 5, objective ablation), pass@1 at a matched 52B-token training budget.

| Training objective | HumanEval | MBPP |
| --- | --- | --- |
| Left-to-right LM | 6.0% | 8.9% |
| Causal masking | **8.0%** | **10.9%** |

The worry was that training on shuffled documents would hurt normal left-to-right completion. At this small scale it did not; causal masking was slightly better on both benchmarks. The absolute numbers are low because these are small ablation models. The related scaling study, Bavarian et al. 2022, found the same at larger scale and called it "FIM-for-free": infilling ability costs almost nothing in left-to-right quality.

**Slide 18 — Beyond infilling: more ways to learn from code.** Four boxes, each a different supervision signal that code offers for free. *Commit diffs*: before-code + commit message → after-code or diff (OctoPack, Muennighoff et al., 2023, which built the CommitPack dataset of Git commits). *Diagnostics*: broken code + compiler error → repair (DrRepair, Yasunaga & Liang, 2020). *Tests*: program + test outcomes → reward (CodeRL, Le et al., 2022, an early RL-from-unit-tests method). *Execution traces*: program → executed lines + variable states (CodeExecutor, Liu et al., 2023). The left column (blue) teaches editing from intent; the right column (red) teaches understanding of what code does. Each maps to a later lecture topic: diffs to agent edits (slides 40–43), tests to RL rewards (slides 28–30, 49), traces to world models (slides 74–79).

### Slides 19–30 · Evaluating generated code and learning from execution

**Slide 19 — Evaluating Generated Code.** Section divider. The question now is how to decide whether generated code is good, because the answer also defines what a training reward can be.

**Slide 20 — Comparing with a reference solution.** Two bullets define the oldest metrics. *Exact match*: does the output reproduce the reference string? *BLEU-4*: the geometric mean of 1- to 4-gram token overlap with the reference, times a brevity penalty that punishes outputs shorter than the reference. A three-row table for "integer x: is it positive?" shows why both fail. The reference is `return x > 0`. A small textual change, `return x >= 0`, is wrong at x = 0 but shares almost every n-gram, so BLEU scores it high. A different expression, `return not (x <= 0)`, is equivalent for integers but shares few n-grams, so BLEU scores it low. Surface similarity and correctness point in opposite directions. Citations: Yin & Neubig (ACL 2017, section 5.1), a syntactic code-generation paper that reported BLEU and exact match (Neubig is an author, so this is partly self-critique), and CodeBLEU (Ren et al., 2020).

**Slide 21 — Comparing code structure.** The original CodeBLEU overview figure, with three panels comparing a machine translation `public static int Sign(double d)` against a human reference `public static short Sign(double c)`. *Weighted n-gram match* (left): tokens are linked with dotted lines and labeled with weights 1.0, 1.0, 0.7, 0.5. Green links are matches such as `return` and `d == 0`; red links are mismatches such as `int` vs `short` and `d < 0` vs `c < 0`. Keywords count more than ordinary tokens. *Syntactic AST match* (middle): both programs are parsed into trees of `?:` (ternary), `==`, `<` and literal nodes. A shared subtree (`== d 0`) is shaded green; the subtrees that differ (the cast and the nested ternary) are shaded red. *Semantic data-flow match* (right): arrows show where each use of the variable "comes from", as tuples like ('d', 7, 'comesFrom', \[\], \[\]), ('d', 16, 'comesFrom', \['d'\], \[7\]). Renaming d to c leaves this graph unchanged, so data flow ignores harmless renames. The formula at the bottom is CodeBLEU = α·BLEU + β·weighted n-gram + γ·AST match + δ·data-flow match. It is a better proxy than BLEU, but it still compares against one reference, so it cannot fully reward a correct but different algorithm.

**Slide 22 — Comparing learned code representations.** A heatmap from CodeBERTScore (Zhou et al., EMNLP 2023). Rows are tokens of one snippet (`math . sq rt ( x )`, that is `math.sqrt(x)`); columns are tokens of another (`x _** _0 . 5`, that is `x ** 0.5`). Cells are cosine similarities from 0.0 (white) to 0.8 (dark blue). The dark cells pair `x` with `x`, `sqrt` pieces with `**` and `0`, and the parentheses with `.5`. So the model "knows" that the two expressions do the same thing even though they share almost no characters. The method: encode the prompt plus each snippet with a pretrained code encoder, match each token to its most similar token in the other snippet, then average these best matches into precision and recall and combine them into an F-score. This is BERTScore applied to code. It handles synonyms better than CodeBLEU but is still a similarity score, not a proof of correctness.

**Slide 23 — Checking behavior by running code.** A pipeline diagram. Inputs: a *candidate* `is_positive(x): return x >= 0` and *test cases* with inputs −1, 0, 1 and expected outputs F, F, T. Both go into a *Run code* box labeled "isolated runtime, time + memory limits". The output table compares actual and expected: −1 → F/F, 0 → T/F (highlighted in red), 1 → T/T. Verdict: "Fail: zero is not positive." This is functional evaluation, popularized by Chen et al. 2021 (the Codex paper). The sandbox matters: generated code is untrusted, may loop forever, may allocate unbounded memory, or may touch the file system. Every execution-based metric and every execution reward later in the lecture assumes this box exists.

**Slide 24 — Benefits and limits of execution checks.** A two-column table. Benefits: accepts different correct implementations; detects semantic errors by actually running code; matches observed behavior. Matching limits: finite tests can miss incorrect behavior; it needs trusted tests, installed dependencies and isolated execution; it needs time and a stable environment. The EvalPlus citation (Liu et al., 2023) quantifies the first limit: adding many generated tests to HumanEval (80x more on average in HumanEval+) reduced reported pass@k by up to 19.3–28.9%, meaning some "passing" solutions were wrong. The second and third limits explain why building runnable environments is a research contribution in itself (slides 48 and 51).

**Slide 25 — Evaluating functions and full programs.** Two cards. *HumanEval*: 164 hand-written Python functions; input is a signature plus docstring; output is a completion; graded by hidden unit tests. *CodeContests* (red border, from the AlphaCode work): competitive-programming problems, including Codeforces; input is a full problem statement; output is a whole program that reads input and prints output; graded by compile + test. CodeContests is harder in three ways: longer specifications, algorithmic difficulty, and efficiency limits. Both are single-step tasks (rung 1 on slide 2). Neither needs a repository.

**Slide 26 — Success across multiple attempts.** A scaling plot from the Codex paper, "Codex and Codex-S Performance". Horizontal axis: non-embedding parameters, 10^5 to 10^10 on a log scale. Vertical axis: pass rate, 0 to 0.8. Five curves, read approximately at the largest size (about 12B). GPT-3 pass@1 stays near 0 at every size, because it saw little code. Codex pass@1 rises to about 0.22. Codex-S pass@1 (fine-tuned on correctly implemented standalone functions) reaches about 0.32. Codex-S with mean-log-probability reranking of 100 samples reaches about 0.45. Codex-S with oracle reranking (pass if any of 100 samples passes, i.e. pass@100) reaches about 0.79. The caption defines pass@k: the probability that at least one of k sampled programs passes all tests. The huge gap between the purple oracle line and the red reranking line is the value of a good verifier. If you could recognize the right sample, you would nearly double accuracy. This gap motivates learned verifiers on slide 50.

**Slide 27 — Non-functional requirements.** A flow diagram from NoFunEval (Singhal et al., 2024, 397 code-editing tasks). An existing program plus an instruction such as "make this code faster" goes to a code LM, which should produce a revised program with the same outputs in less time. The question in the middle is "how is the requested improvement checked?" Three answers. *Runtime efficiency*: run tests and time execution; score is speedup. *Latency / resource use*: compare with reference edits; score is DiffBLEU (BLEU on the diff). *Maintainability / security*: static checks with CodeQL plus edit match; score is CodeQL × DiffBLEU. The point: tests only check function. Speed, memory, security and readability need other verifiers, and some of them fall back to reference similarity, with all the problems of slide 20.

**Slide 28 — Learning from test results.** A loop diagram from DeepCoder (Luo et al., 2025). *Sample responses*: problem → reasoning + final code. *Run tests*: execute the final code; pass/fail becomes the reward. *Update model*: make rewarded responses more likely. An arrow labeled "sample again with the updated model" closes the loop. This is RL with verifiable rewards (RLVR), the same recipe used for math reasoning. Tests replace a learned reward model, which makes the reward hard to game (unless the tests are weak, see slide 24). DeepCoder used a sparse outcome reward: 1 only if all sampled tests pass, 0 otherwise, and a GRPO-style algorithm. Lecture 9 covers these RL algorithms.

**Slide 29 — Reasoning toward a solution.** A tree for the task "compute 1 + … + n for 0 ≤ n ≤ 10^12". Three reasoning paths. *Iterate*: add every integer, `sum(range(n + 1))`; correct but too slow at large n, since 10^12 additions take hours. *Pair endpoints*: derive the formula by pairing 1 with n, 2 with n−1 and so on, check it on 0 and 1, and write `n * (n + 1) // 2`; correct and efficient. *Recall a formula*: mistranscribe it as `n * (n - 1) // 2`; wrong already at n = 1 (gives 0 instead of 1). The lesson: reasoning helps when it derives and checks, not when it recalls. The middle path includes a self-check on small cases, the same habit as the verify step of agents. Execution rewards teach exactly this: the slow path fails time limits, the wrong recall fails tests, and only the derived formula earns reward.

**Slide 30 — Coding accuracy after reinforcement learning.** A training curve from DeepCoder. Horizontal axis: RL training steps, 0 to 1,000. Vertical axis: LiveCodeBench score, 0.48 to 0.62. The blue curve starts at 0.48 and climbs noisily to about 0.58 by step 650. A red dashed line near step 180 marks the switch from a 16K to a 32K response-token limit; a green dashed line near step 650 marks 32K → 64K. An arrow labeled "64K inference" jumps to a gold star at about 0.61 at the right edge, which sits on the orange dashed line for o3-mini. The captions explain: K = 1,000 tokens; the star uses more tokens at evaluation with no further RL. Takeaways: RL steadily improves a 14B model; letting it think longer during training (iterative context lengthening) keeps gains coming; and a modest open model can match a frontier reasoning model on this benchmark.

### Slides 31–40 · Agentic coding and the shell

**Slide 31 — Agentic coding.** Section divider. From here on the model works inside a repository through tools, not in a single reply.

**Slide 32 — From single-step to agentic coding.** Two rows of three boxes. *Single-step coding* (blue): self-contained prompt → reasoning + code → evaluate the answer. *Agentic coding* (red): issue + existing files → search → edit → run tests, with a loop symbol → patch + evidence. Three differences matter. The input is not self-contained: the needed facts are somewhere in thousands of files. The middle step is a loop of actions and observations, not one generation. The output is a patch plus evidence (test output, a reproduction), so a reviewer can trust it. The word "evidence" is the key design choice: an agent should not just claim a fix, it should show a failing test that now passes.

**Slide 33 — The localize–edit–verify loop.** A diagram. On the left, a repository tree with `cli.py`, `config.py` (highlighted) and `test_config.py`. Arrows lead to *Localize* ("where does zero become the default?"), then *Edit* ("default only when the value is None"), then *Verify* ("zero + default cases + caller regressions"), shown in black. A return arrow labeled "failure → revise the hypothesis" goes from Verify back to Localize, not back to Edit. That detail matters: a failed test often means the agent's theory of the bug was wrong, so it should look again rather than tweak the same edit. The citation says the interaction-loop concepts come from SWE-agent, but the diagram is an original teaching figure. Slides 34–36 walk through each box with real commands.

**Slide 34 — Localize: find the cause.** Two terminal panels. *Localize the implementation*: `$ rg 'retries' buggy_config.py` prints `return config.get("retries") or 3`, with the note "zero is falsy: inspect the defaulting rule". In Python, `0 or 3` evaluates to 3, because `or` returns its right operand when the left is falsy. *Reproduce the behavior*: `$ RETRY_MODULE=buggy_config python3 -m unittest test_config.RetryTests.test_zero` prints `AssertionError: 3 != 0` and `FAILED (failures=1)`. The note: "Now repair the condition, not the test." Two habits are shown. First, reproduce before editing, so you have a failing signal to turn green. Second, never make a test pass by weakening it; that is the coding-agent version of reward hacking.

**Slide 35 — Edit: change the defaulting rule.** Before: `return config.get("retries") or 3`, note "all falsy values select the default" (0, empty string, False, empty list). After: `value = config.get("retries")` then `return 3 if value is None else value`, note "an explicit zero now survives". The fix is minimal: it changes only the condition, keeps the default of 3, and keeps behavior for missing keys (`.get` returns None). Minimal edits are easier to review and less likely to break callers.

**Slide 36 — Verify: check the fix and regressions.** Left: `$ python3 -m unittest -v test_config` prints four results: missing → 3 PASS, None → 3 PASS, zero → 0 PASS, positive → 2 PASS, then "Ran 4 tests: OK". Right: two decision boxes. "Zero still becomes three?" → localize where the value changes (maybe another layer also applies a default). "A default case breaks?" → edit the rule, then verify again. The four tests cover the new behavior (zero) and three regressions (missing, None, positive). Passing only the zero test would not be enough; the fix could have broken the default path.

**Slide 37 — An alternative: a fixed workflow.** The original Agentless overview figure (Xia et al.). Ten numbered steps in three colored regions, run on a sample issue "Lambdify misinterprets some matrix expressions". *Localization* (blue, steps 1–5): (1) turn the project codebase into a repo-structure tree; (2) an LLM picks the top-N suspicious files; (3) embedding retrieval adds more candidates, and the two lists are merged; (4) the LLM narrows to classes and functions (for example `class Handler`, `function: edit_matrix`); (5) it narrows to edit locations (for example lines 120–230). *Repair* (purple, step 6): sample several candidate patches in search/replace form. *Patch validation* (green, steps 7–10): (7) the LLM generates reproduction tests; (8) the tests run on each patch; (9) patches are filtered and ranked, also using existing regression tests (the red arrow from the codebase); (10) one patch is submitted. The key contrast with slide 33: the LLM never decides *what to do next*. The workflow is fixed; the LLM only fills each slot. Agentless was cheap and competitive on SWE-bench Lite in 2024, which forced agent designers to show that autonomy adds value.

**Slide 38 — Coding toolsets.** Section divider. The following slides ask which actions the agent should have and in what format, since slide 43 will show this choice can change success rates threefold.

**Slide 39 — Coding with a shell-only toolset.** A diagram from mini-SWE-agent. A black *Model* box ("choose a command") sends one `bash` command to *One shell interface*, which supports three kinds of work. Read / search: `rg`, `cat`, `find`. Edit files: `sed`, Python, `patch`. Execute checks: `pytest`, build commands. The return arrow brings back "output + exit status + timeout". mini-SWE-agent is roughly a hundred lines of Python with no custom tools, and each command runs in a fresh subprocess (no persistent shell state). Its point is that a strong model already knows Unix, so a single bash tool is a surprisingly strong baseline. The exit status and timeout are part of the observation; a hanging command must return control to the agent.

**Slide 40 — Editing with shell commands.** Left: a `sed` edit. `sed 's/^RETRIES = 3$/RETRIES = 5/' settings.py > settings.new` then `mv settings.new settings.py`, with the note "match the line, write the result, replace the file". The anchors ^ and $ make the pattern match the whole line only. Right: "one shell, many editing methods". *sed / awk* for text patterns and line-based changes. *Python scripts* to compute replacements across many files. The weakness is visible: sed needs careful escaping of special characters, fails silently when the pattern does not match (the file is rewritten unchanged), and multi-line edits are awkward. That motivates the dedicated edit formats on slides 41–42.

### Slides 41–48 · Edit formats, navigation, and issue-resolution benchmarks

**Slide 41 — Whole files and text replacements.** Two edit formats side by side, each using the running `settings.py` example. *Whole file* (left): the agent re-emits the entire file, here `RETRIES = 5` and `TIMEOUT = 30`. Note: "simple to apply; repeats unchanged code." Tools that offer it: Pi `write`, OpenCode `write`, OpenHands `create`. *Search / replace* (right): the agent names the file and sends an old block and a new block between `<<<<<<< SEARCH`, `=======` and `>>>>>>> REPLACE` markers. Note: "compact; needs an unambiguous match." Tools: OpenHands, Pi and OpenCode `edit`. The trade-off is cost against fragility. Whole-file output grows with file size, so a one-line change in a 2,000-line file costs 2,000 lines of output tokens and risks accidental changes elsewhere. Search/replace is short, but it fails if the SEARCH text does not appear exactly once. Good harnesses return a helpful error in that case ("found 3 matches; add more context").

**Slide 42 — Diffs and patch commands.** Two more formats. *Unified diff* (left): the standard `--- a/settings.py`, `+++ b/settings.py`, a hunk header `@@ -1,2 +1,2 @@`, then `-RETRIES = 3`, `+RETRIES = 5`, and the unchanged context line `  TIMEOUT = 30 `. The hunk header gives line positions: start line 1, 2 lines, in both old and new file. Notes: "standard: line positions + context"; "Aider: omit hunk line numbers." Models are bad at counting lines, so Aider's variant drops the numbers and locates hunks by their context instead. *File-operation patch, Codex syntax* (right): `*** Begin Patch`, `*** Update File: settings.py`, a bare `@@`, the same -/+ lines and context, then `*** End Patch`. Note: "file operations + context; no line counts." It is used by Codex, and by OpenCode and OpenHands depending on the preset (for example, OpenHands' GPT-5 preset). The lesson: harness designers pick the format a given model was trained on, because each model family is most reliable in its native format.

**Slide 43 — Diff format can make a big difference.** Top: a task pipeline for the Aider refactoring benchmark. Take a method inside a large class → move it to a top-level function → check syntax and code preservation. The benchmark has 89 Python tasks. Bottom: a bar chart of success rate for GPT-4 Turbo (gpt-4-1106-preview). SEARCH/REPLACE: 20%. Simplified unified diff: 61%. Same model, same tasks, three times the success, from the output format alone. Aider's write-up explains the cause: with search/replace on large edits, GPT-4 Turbo was "lazy" and wrote placeholder comments like "# ... original code here ..." instead of the full code. The unified-diff framing made it behave like it was writing a precise patch for a program to apply. This is the strongest evidence in the lecture that the agent-computer interface matters as much as the model.

**Slide 44 — Finding relevant code.** Left: "start with the symptom", `rg 'retries' .`, with the caution "a flag, a loader, and a retry loop may all match." A keyword search returns every mention; most are irrelevant. Right: "follow the value", two stages. *Configuration input*: where is zero first read? *Defaulting logic*: where does zero become three? The method is data-flow debugging: trace a concrete value from where it enters the program to where it goes wrong. It turns a big, noisy search result into a short chain of places to inspect. The same idea underlies slide 45's dependency graph.

**Slide 45 — Navigating code with dependency graphs.** A graph citing LocAgent (Chen et al., 2025). An *Issue* node ("zero becomes three") points to `config.py: retry_count(config)`. Around it: `cli.py: configure_client` *calls* it; `client.py: Retry loop` *uses its result*; `test_config.py: Zero / None / missing` *tests* it. Caption: "retrieve the relevant neighborhood, then check it with execution." LocAgent parses a repository into a heterogeneous graph of directories, files, classes and functions, linked by contains, imports, invokes and inherits edges. The agent gets tools to search entities and traverse this graph, so it can hop from a function to its callers in one call instead of many greps. The caption's second half matters: a graph gives candidates, and running tests confirms which one is the cause.

**Slide 46 — Coding agent evaluation and training.** Section divider. Having seen how agents act, the lecture now asks how to score them and how to train them with the same machinery.

**Slide 47 — Evaluating issue resolution.** The original SWE-bench pipeline figure (Jimenez et al.). Inputs (step 1): a *Codebase* (astropy/astropy) and a *Problem P* (title: "vstack'ing structured array tables fails with casting error"). A language model, here SWE-Llama, *generates* (step 2) a *Patch*, a diff to `astropy/utils/metadata.py` that changes `return arr.dtype.str` into `return arr.dtype.str if arr.dtype.names is None else …`. Evaluation (step 3): a *Harness* applies the patch to the repo, applies the held-out *Tests* (`table/tests/test_ops.py` with `test_join_struct_col`, `test_vstack_struct_col`, `test_dstack_struct_col`), runs the test scripts and logs results. Step 4 shows the results. Two labels below define success. *Fail → pass*: tests that failed before and must pass now (the requested repair). *Pass → pass*: tests that passed before and must still pass (preserved behavior). Note that the model never sees the tests; they come from the real pull request that fixed the issue.

**Slide 48 — Building runnable training tasks.** A card defining a runnable task, citing SWE-Gym. *Starting state*: files + dependencies + test command. *Issue*: requested behavior + reproduction. *Checks*: the bug fails before; the repair restores behavior. The red line: "validate the environment before collecting training trajectories." In practice many scraped tasks fail this check: dependencies do not install, tests are flaky, or the "failing" test also fails after the gold patch. Training on such tasks teaches the agent that nothing works, or rewards it randomly. SWE-Gym (Pan et al., 2024) released 2,438 real Python task instances with executable environments and tests, and building those environments was a large part of the effort.

### Slides 49–54 · Training coding agents

**Slide 49 — RL for multi-step code repairs.** A diagram citing R2E-Gym (Jain et al., 2025). Top row, labeled "assistant actions: training targets": *Search* (find config.py) → *Edit* (preserve zero) → *Test / finish* (check regressions). Under each action is its observation: files found, patch applied, test output. The first observation is marked "context only": observations are inputs the model conditions on, and no loss is computed on them. A red box, "terminal reward: repaired or not", sends arrows back to all three actions. The red warning: "a late failure does not identify which earlier decision was wrong." The objective is

$$
\max_\theta \; \mathbb{E}_{\tau \sim \pi_\theta}\left[ R(\tau) \right]
$$

where τ is a full trajectory of actions and observations, π\_θ is the agent's policy with parameters θ, and R(τ) is 1 if the final patch passes the tests and 0 otherwise. The same reward reaches every action, whether it was the good search or the bad edit. That is the credit-assignment problem. R2E-Gym responds partly with better data: it builds thousands of executable environments from commit histories and generates tests synthetically, so it does not depend on human-written issues.

**Slide 50 — Training data and inference compute.** Two plots from SWE-Gym (Pan et al., 2024, 32B model). *Training time scaling* (left): x-axis is the number of training trajectories on a log scale (100 to 500); y-axis is SWE-bench Verified resolved %. Three points rise along a dashed trend: about 11% at roughly 120 trajectories, about 17% at 250, about 20.6% at about 490. More successful trajectories for fine-tuning help roughly log-linearly, with no sign of saturation yet. *Inference time scaling* (right): x-axis is the number of agent rollouts, 1 to 16 on a log scale; y-axis is resolved %. A cross marks one greedy rollout (t = 0) at about 20.6%. Dots for sampled rollouts (t = 0.5) climb from about 22% at 2 rollouts to about 26% at 4, 29% at 8 and 32% at 16. A learned verifier, trained on the same trajectories, picks the best of N rollouts. Doubling rollouts adds about 3 points each time. Link to slide 26: this is the reranking idea applied to whole agent runs.

**Slide 51 — Creating repair tasks by injecting bugs.** The original SWE-smith pipeline figure (Yang et al., 2025), four panels left to right. *Real repositories*: source code (src/, tests/, README.rst, setup.py) with unit tests that all pass (test\_api.py, test\_auth.py, test\_client.py, test\_utils.py, each with a green check). *Environment creation*: SWE-agent attempts to install the repo and run the tests; a developer then writes a Dockerfile based on SWE-agent's work. *Task generation strategies*: procedural modification, LM-generated bugs, combining bugs, and PR mirroring (re-applying a real pull request in reverse). *New task instances*: an environment image plus synthetic tasks, each with a generated issue, a bugged patch (+20 −12 lines) and verified tests (2 failing, 9 passing). Three labels summarize: *prepare* an executable baseline, *mutate* code not tests, *keep* only mutations that cause new test failures. The payoff is scale: one environment per repository serves many tasks, instead of one fragile environment per real issue. SWE-smith reported about 50,000 task instances from 128 repositories.

**Slide 52 — Injecting and checking a bug.** The running example as a SWE-smith mutation. *Working baseline*: `value = config.get("retries")`; `return 3 if value is None else value`; "all four existing tests pass." *Mutate the condition*: `return 3 if not value else value`; "zero now becomes three; its test fails." Three boxes at the bottom record the validation: Before 4 pass → Mutated 3 pass, 1 fail → Restored 4 pass. This is exactly the fail → pass / pass → pass structure of slide 47, generated automatically. A mutation that breaks no test is discarded, because no reward could detect whether an agent fixed it. A mutation that breaks every test is usually discarded too, because it is trivially obvious or breaks imports. Notice the mutation is the original bug from slide 34 in a new form (`not value` vs `or 3`): mutations often recreate realistic bug patterns.

**Slide 53 — Working across programming languages.** Three project skeletons. Python: `pyproject.toml`, `src/`, `tests/`, run with `pytest`. TypeScript: `package.json`, `src/`, `tests/`, run with `npm test`. Rust: `Cargo.toml`, `src/`, `tests/`, run with `cargo test`. Caption: "read the project configuration before choosing build and test commands." Agents trained mostly on Python often run `pytest` everywhere. Real projects may also pin tool versions, use workspaces or monorepos, or define custom scripts in `package.json`. Citations: Multi-SWE-bench and SWE-bench Multilingual, which extend issue resolution beyond Python to languages such as Java, TypeScript, JavaScript, Go, Rust, C and C++. Scores on these are typically lower than on Python SWE-bench, which echoes slide 10's per-language gap.

**Slide 54 — Multi-harness training.** Definition at the top: *harness = prompts + tools + agent loop + context management*. A black *Shared model* box (same weights) fans out to three example harnesses: OpenHands, OpenCode and Codex. All three feed *Task checks* (patch → test reward). A red arrow returns "trajectories + rewards → update the model." Two notes: "Nemotron 3 Ultra: ≥2 harnesses per task distribution" and "Polar: native harnesses call a shared model API proxy", meaning the harnesses run unchanged and the training system intercepts their model calls. The reason: a model RL-trained inside one harness overfits to its prompt, tool names and edit format (recall slide 43's 3x format effect). Users run models in many harnesses, so training across several teaches skills that transfer rather than harness-specific habits.

### Slides 55–63 · Frontend development and the wider lifecycle

**Slide 55 — Frontend development.** Section divider. Frontend work adds a new verification problem: part of the requirement is what the page looks like.

**Slide 56 — Agent-powered frontend development.** A loop diagram citing SWE-bench Multimodal (Yang et al., 2024), which added browser and screenshot tools to SWE-agent. *Localize*: find components and event handlers. *Edit*: change logic and styles. *Verify in the browser*, with two parts. *Exercise behavior*: type → click → check saved state. *Inspect the rendered page* (black box): screenshot → visual understanding. A return arrow says "revise when a check fails". It is the same localize–edit–verify loop as slide 33, but verification now needs a running app, a browser, and a vision-capable model. A CSS bug (text hidden behind another element, wrong color) passes every unit test; only a screenshot reveals it.

**Slide 57 — Browser agents and automation scripts.** Two ways to use the browser for verification. *Browser agent* (left): the model chooses each next action in an observe → choose action → type/click loop; labeled "adaptive exploration · next class" (Lecture 7 on GUI and computer-use agents). *Playwright script* (right): the model writes a repeatable check. Four numbered steps: fill Name with spaces (`fill()`), click Save contact (`click()`), assert saved state (`expect()`), capture an image (`screenshot()`). Labeled "programmed sequence + assertions". Both feed "screenshots → visual inspection or approved-baseline comparison" (comparing a new screenshot pixel-by-pixel with an approved one). The trade-off: a browser agent adapts to surprises but is slow and nondeterministic; a script is fast, deterministic and can be committed as a regression test. A good coding agent explores with the first and leaves behind the second. Citations: VisualWebArena (Koh et al., 2024) and Playwright's documentation on actions, assertions and screenshot comparisons.

**Slide 58 — Verifying a frontend repair.** Two screenshots of a "Create a contact" form with the rule "a name must contain at least one non-space character." *Before* (labeled "original teaching fixture · original bug"): the Name field holds only spaces, Save contact was clicked, and "Saved records: 1" shows a blank record was saved. *After* ("repaired"): the same input shows a red message "Enter a non-blank name." and "Saved records: 0". The edit in the middle: `value.length` → `value.trim().length`. A string of spaces has length > 0 but trimmed length 0. Two checks below. *Behavior*: 0 records are saved, and valid names still save (a regression check). *Appearance*: the error is visible and readable beside Name. Both are needed. The behavior check alone would pass even if the error message rendered white on white.

**Slide 59 — Evaluating visual issue resolution.** A pipeline. *Issue + image*: observed a blank name saved, expected it rejected, plus the starting repository. → *Candidate patch*: change validation. → two groups of checks. *Execution checks*: blank → error; no new record. *Regression checks*: valid name → save; existing tests pass. The red lesson: "an image in the issue does not make image similarity the grading rule." SWE-bench Multimodal issues contain screenshots, but grading is still by tests. The image helps the agent understand the bug; it is not the target. Grading by screenshot similarity would reward cosmetic imitation and punish valid alternative fixes, the slide-20 problem again.

**Slide 60 — Broader software development.** Section divider. Rung 3 of slide 2: the agent's work beyond fixing one issue.

**Slide 61 — From requirements to maintenance.** A cycle diagram. *Requirements* (user needs, compatibility) → *Implementation loop* (edit ⇄ test) → *Review* (diff + evidence, release decision) → *Deploy / monitor* (production signals, rollback path) → *Maintain* (new requests, observed failures) → back to Requirements. The note under the loop: "a test pass is one step, not the release decision." Every earlier slide lives inside the small edit–test box. The rest of the cycle needs judgment that tests cannot encode: is this the right feature, is the change safe to ship, what happens if it breaks in production. For an RPA or automation background this is familiar: a bot that passes UAT still needs change control, monitoring and a rollback plan.

**Slide 62 — Where developers spend their time.** A donut and a bar chart from Meyer et al. 2019 (Table 2, 5,928 self-reported Microsoft workdays). The donut: *Coding* (reading and writing code and tests) is 15% of the workday. The bars show the other 85%: meetings + email 25%, debugging / bug fixing 14%, helping + sync-ups + networking 11%, running tests 8%, learning + admin + various 8%, breaks 8%, requirements + documentation 6%, code review 5%. The lesson for agent designers: an agent that only writes code accelerates at most 15% of the day. Debugging, testing, review and documentation together are about 33%, and each is a target for the tasks on slides 63–69. It also cautions against measuring agent value by lines of code produced.

**Slide 63 — Comparing software development tasks.** A table with four columns.

| Task | Artifact | Environment / verifier | Horizon |
| --- | --- | --- | --- |
| Repair | Patch | Repository / regression tests | One issue |
| Library creation | Implementation | Scaffold / package tests | Many functions |
| Test generation | New test | Buggy + fixed versions / discrimination | One behavior |
| CI repair | Code or configuration | Workflow / required checks | Build run |
| Evolution | Accumulated changes | Persistent app / milestone + regressions | Dependent tasks |

Read it as a design template. Any new agent task needs three things defined: what the agent produces, what checks it, and how long the task runs. Horizon is the hard axis: repair is one issue, while evolution chains dependent tasks where early mistakes compound. Slides 64–69 give one benchmark per row (plus localization).

### Slides 64–72 · Task families and transfer

**Slide 64 — Task: localization.** A diagram citing CodeScout (2026). A black *Search policy* box takes issue + repository and can inspect and search. It outputs nested predictions: *Predicted file* `django/…/datetime.py`, inside it *Module: TruncDate*, inside that *Function: as\_sql*. A *Reward* box computes F1 at each of the 3 levels (file, module, function). Caption: "compare with locations in the gold patch; the patch is not policy input." Localization is carved out as its own trainable task because it is the first step of repair and the most common failure point. F1 rewards partial credit: naming the right file but the wrong function still earns file-level reward. That gives a much denser signal than the all-or-nothing repair reward of slide 49. The gold patch is used only to score, never shown to the policy, so the reward cannot leak the answer.

**Slide 65 — Task: app creation and modification.** A branching diagram citing ViBench (definitions checked 2026-09-07). From *Requirements* (a product or feature description) come three settings. *Zero-to-One*: build a new application (15 apps). *Vibe-on-Ref*: extend a reference MVP (45 apps). *Vibe-on-Vibe*: extend the agent's own earlier MVP (45 apps). Every result is checked with human-authored browser test plans. The name plays on "vibe coding". Vibe-on-Vibe is the realistic hard case: the agent must live with its own earlier design decisions, as a real team lives with its codebase. Comparing Vibe-on-Ref against Vibe-on-Vibe isolates how much an agent's own messy code hurts later work.

**Slide 66 — Task: library implementation.** Two benchmarks side by side. *Commit0* (left): a library scaffold where functions such as `parse(…)` and `evaluate(…)` have missing bodies, plus documentation and tests. The agent must implement them together and pass the integrated package tests. *ProgramBench* (right): a black box labeled *Reference executable*: the agent can probe inputs and observe outputs. It must write a new implementation that matches the observable behavior, checked against the reference. Note: "different internal designs can work." Commit0 tests long-horizon implementation from a spec; ProgramBench tests behavioral cloning, where the spec is the running program itself. Both grade by behavior, not by similarity to the original source.

**Slide 67 — Task: software maintenance.** The SWE-Milestone (2026) figure, two panels. *(a) Independent task evaluation, e.g. SWE-bench*: an issue goes to an agent, which works on a repo snapshot and produces a patch; test evaluation gives fail/pass. Each task starts fresh. *(b) Continuous task evaluation (SWE-Milestone)*: a *task stream* holds task lists of requirement documents (SRS 1, SRS 2, later SRS 3) and a task dependency graph where some milestones are unlocked (green) and others locked (red). In state (i), M1 and M2 are unlocked while M3 is locked; in state (ii), M3 unlocks once M1 and M2 are done. The agent loop reports "Finished Task M1\&M2; check the new tasks", fetches the next task, and later "Finished Task M3; all tasks done". The *codebase* runs from a base snapshot through many commits, tagged Tag-M1, Tag-M2, Tag-M3. Each tag is tested separately, and the results aggregate into fail/pass. The key difference: the agent inherits its own earlier code, so shortcuts in M1 can break M3.

**Slide 68 — Task: test generation.** The SWT-Bench figure (Mündler et al., 2024). Task inputs: an issue, "`isValid` currently allows trailing newlines but only alphanumeric characters should be accepted", and the codebase before the fix (pre-PR). The agent generates tests, and each is run before and after the real fix.

| Generated test | Pre-PR | Post-PR | Useful? |
| --- | --- | --- | --- |
| `isValid("name\n") == False` | Fail | Pass | Yes (green) |
| `isValid("name") == True` | Pass | Pass | No (red) |
| `isValid("name") == False` | Fail | Fail | No (red) |

Only a fail-to-pass test reproduces the issue. The second test is correct but does not detect the bug. The third is simply wrong. This is the SWE-bench criterion turned around: instead of a patch that turns given tests green, the agent must write a test that the real patch turns green. It is also the "reproduce first" habit of slide 34 made into a benchmark.

**Slide 69 — Task: CI repair.** Left, "observed build failure": `Runtime: Node 16`, `Package requires: Node >=18`, `npm ci: EBADENGINE`, with the advice "inspect the package's supported runtime." Right, "causally relevant change": in the `setup-node` configuration of the CI workflow, `with: node-version: '20'`, then "rerun install, build, and tests." The source is the LCA (Long Code Arena) CI Builds Repair dataset at a pinned revision (ebf12dad). The lesson: CI failures are often not code bugs. The fix here is a configuration change in a workflow file, which a code-only agent might never look at. "Causally relevant" matters: an agent could also silence the error (for example with an engine-strict override), which makes the build green without fixing the cause.

**Slide 70 — Learning skills for new tasks.** A diagram. Three training skill sources on the left: *find relevant code* (search, dependencies), *implement functions* (specification → code), *write bug tests* (issue → executable check). They feed *Train policy* (SFT or RL). A red dashed line separates training from *held-out tasks*: new repositories where the agent must repair an issue, build a library, or detect a new bug, all at an equal inference budget. The research question: do component skills, trained separately, combine into success on whole tasks never seen in training? "Equal inference budget" is the fairness condition: a trained agent must not win just by spending more tokens or rollouts.

**Slide 71 — Generating projects for coding practice.** The SWE-Playground figure (Zhu, Gandhi & Neubig), six stages. (1) *Project proposal*: an LLM is asked for computer-system simulation projects implementable in Python and proposes, for example, a "filesystem-simulator" with ext4-like features (inodes, directory structures). (2) *Task proposal*: the project is split into tasks (1.1.1, 1.1.2, 1.2.1, …), each with test specs such as TestBlockDeviceCreation (edge case: zero or oversize block size must fail; assert writes to one block do not affect others). (3) *Repository setup*: `src/`, `tests/`, `README.md`, `tasks.md`, `pyproject.toml`, a Dockerfile, and function stubs such as `class BlockDevice` whose `__init__` raises `NotImplementedError`. (4) *Unit test generation*: a commit adds tests (2 files changed, 367 insertions); running them collects 21 items that fail with NotImplementedError, as they should. (5) *Functionality implementation*: read tests, implement, verify with the suites, revise. (6) *Capability-specific adaptation*: the same projects are turned into training data for API-calling problems, bug fixing and issue resolution, test design and reproduction, and library generation from scratch. The point: no real GitHub data is needed; the environment and its verifier are both synthesized.

**Slide 72 — Transferring training to new development tasks.** A grouped bar chart of selected 32B results from Hybrid-Gym (2026). Blue = base 32B model; red = after Hybrid-Gym training. Success (%) is defined separately per task.

| Benchmark (task) | Base 32B | Hybrid-Gym 32B | Gain |
| --- | --- | --- | --- |
| SWE-bench Verified (repair) | 7 | 32.4 | +25.4 |
| SWT-Bench Verified (test generation) | 9.01 | 16.86 | +7.85 |
| Commit0 Lite (library building) | 8.34 | 13.45 | +5.11 |

The repair score more than quadruples. Test generation nearly doubles, and library building rises by about 60% relative. These are the held-out tasks of slide 70, so the gains show that training on synthetic, mixed practice tasks transfers to real benchmarks. Do not compare bars across tasks: each benchmark has its own success definition.

### Slides 73–82 · Predicting code behavior, and conclusion

**Slide 73 — Models that predict code behavior.** Section divider. The last topic asks whether a model can predict what code will do without running it, and whether that helps an agent.

**Slide 74 — Choosing actions and predicting their effects.** A diagram with two branches. *History h* (inspected code, tool results) feeds a black *Policy π(a | h)*, which chooses an action, here "run test". The action goes either to the *Real environment* (execute the test; observed: assertion fails) or to a *World model p(o | h, a)* (predict the test result; "prediction can be wrong"). A dashed arrow notes "history also conditions the prediction." In words: the policy is the probability of each action a given the history; the world model is the probability of each observation o given the history and the action. This is the model-based RL split from Lecture 5 (planning), now applied to code. If the world model is accurate, the agent can "imagine" running a test and skip a slow real execution, or compare many candidate actions cheaply.

**Slide 75 — Predicting execution: shared references.** Left, "predict the next state": `items = [1]`, `alias = items`, `alias.append(2)`, `result = len(items)`, with the question "what are items and result?" Right, "true execution": `items = [1, 2]`, `alias = [1, 2]`, `result = 2`. Caption: "wrong prediction: treating alias as a copy." In Python, assignment binds a second name to the same list object; `append` mutates that object, so both names see \[1, 2\]. A model that reasons from surface patterns may predict `items = [1]` and `result = 1`. This is the kind of semantic knowledge that execution-trace training (slide 18, slide 77) aims to teach: the model must track object identity and mutation, not just text.

**Slide 76 — When predictions help an agent.** A cautionary flow. *Two repairs*: A is a correct patch, B is a wrong patch. *Predict test outcomes* (pink): the model says A fails and B passes, labeled "illustrative mistake". *Wrong decision* (black): choose B, discard A. A branch from the two repairs goes to "run both candidates to check the model's judgment." The note: "compare task success AND total latency / tokens / tool calls." The lesson: a world model is only useful if its errors do not cost more than the executions it saves. Evaluations must measure both task success and total cost, since a cheap wrong prediction can be very expensive downstream.

**Slide 77 — Learning from program execution.** The Code World Model (CWM) training pipeline figure (FAIR CodeGen Team et al., 2025). *Pre-training*: general pre-training on 8T tokens at 8k context, then *code world modeling mid-training* on 5T tokens at 131k context, producing "CWM pretrained". *Post-training*: supervised fine-tuning for instruction and reasoning on 100B tokens at 32k context ("CWM sft"), then joint reinforcement learning for agentic and reasoning skills on 172B tokens at 131k context (the final "CWM"). The world-modeling mid-training is the new ingredient. It uses Python execution traces (the program state after each executed line) and agentic interaction trajectories collected in Docker environments. The model learns what code does, not just what it looks like. Note the same three-stage shape as slide 6, with the mid-training data swapped for execution data.

**Slide 78 — Building and using simulators.** The Code World Models / GIF-MCTS figure (Dainese et al., 2024). Inputs: trajectories collected from an environment, an environment and task description, and an LLM. *Code generation with GIF-MCTS* (a tree search whose actions are Generate, Improve and Fix steps on code) produces a *candidate code world model*, a Python `class Environment` with fields like `self.cart_position`. The candidate is validated against the collected trajectories. "Can predict correctly?" If no, feedback on wrong predictions returns to the tree search. If yes, the code world model is used for planning, shown by a cart-pole picture. Here the LLM does not predict the world directly; it writes a program that simulates the world. Code simulators are fast, exact and inspectable, so a planner can call them thousands of times. It is the opposite direction to slide 77: learning code from execution there, writing executable models of the world here.

**Slide 79 — Open questions about predicting code behavior.** Four bullets. *Better decisions?* Measure prediction errors and task success on the same problems, since a model can predict well on average yet fail on the decisions that matter. *Lower cost?* Include latency, tokens and real environment calls. *New settings?* Hold out programs, dependencies and environments, because a world model may only memorize familiar libraries. *When to execute?* Vary the fallback threshold (the confidence below which the agent runs the real code) and measure failures as well as savings. These four questions are a checklist for any paper claiming a world model helps an agent.

**Slide 80 — Conclusion.** Section divider.

**Slide 81 — Designing a coding agent.** Six summary bullets, one per section. *Code models*: pre-training, mid-training, and RL from execution rewards. *Agentic coding*: localize, edit and verify with the right tools. *Agent training*: runnable tasks, repair rewards and diverse harnesses. *Frontend development*: browser interaction and visual verification. *Broader development*: localization, apps, libraries, maintenance, tests and CI. *Code-behavior prediction*: learned models that support execution and planning. The common thread is executable verification. Tests grade models, reward RL, validate synthetic tasks, check frontend repairs and ground world models.

**Slide 82 — Questions.** Closing slide. Next class: "Domains 2 — GUI Agents", which continues the browser-agent thread from slide 57.

## Going deeper

The ideas in this lecture have a long lineage in program synthesis and software testing, and several practical concerns the slides only touch on decide whether a coding agent is useful in real work.

### Lineage: from program synthesis to repository agents

Automatic programming is an old goal. Classical *deductive* synthesis (Manna and Waldinger, 1970s–80s) derived programs from formal specifications. *Programming by example* made the idea practical: Gulwani's FlashFill (2011) learned spreadsheet string transformations from a few input–output examples and shipped in Excel. Neural approaches then treated code as a language: Yin & Neubig (2017) generated code through its abstract syntax tree, and code-specific pre-trained encoders such as CodeBERT (2020) followed.

The large-model era began with Codex and HumanEval (Chen et al., 2021), which powered the first GitHub Copilot and established execution-based pass@k. AlphaCode (Li et al., 2022) showed that sampling very many programs and filtering them by running example tests can reach competitive-programming level. SWE-bench (2023) moved the target from functions to real repositories, and SWE-agent (2024) introduced the idea of an *agent–computer interface*: designing tools, file viewers and error messages specifically for LLMs, the way UIs are designed for people. OpenHands (formerly OpenDevin) became a widely used open platform in the same period. The lecture's arc — completion, then repositories, then lifecycle — follows this history.

### Why execution is the backbone

Software engineering already had tools for judging code by behavior, and coding agents inherit them. SWE-smith's bug injection is a descendant of *mutation testing* (DeMillo, Lipton and Sayward, 1978): deliberately change a program and check whether the tests notice. A test suite that misses a mutation is weak; a mutation that breaks tests is a valid repair task. SWT-Bench's fail-before/pass-after criterion is the same logic applied to generated tests.

The weakness is also inherited. Tests only sample behavior, so an agent optimizing against them can *overfit the verifier*. Known failure modes include editing or deleting tests, special-casing test inputs, catching and silencing exceptions, and reading hidden answers from the environment (for example from git history). Mitigations include hidden held-out tests, making test files read-only, stripping future commits from the environment, and reviewing diffs for suspicious patterns. This is *reward hacking*, a theme that returns in the RL lectures.

### Benchmark hygiene

SWE-bench's original test split has 2,294 tasks from 12 Python repositories. Because some tasks had underspecified issues or tests that rejected valid fixes, OpenAI and the SWE-bench authors released **SWE-bench Verified** (2024), a 500-task subset screened by human annotators. Later work flagged further problems: some issues contain the fix in their text, and because the repositories are public, models may have seen the real patches during pre-training. Responses include continuously refreshed benchmarks built from recent issues, decontamination by date, and multilingual variants. When you read a leaderboard number, ask which split, which harness, how many attempts, and whether a verifier or human picked the answer.

### Practical engineering advice

These habits follow directly from the lecture's loop and are widely used in production coding agents:

1. **Give the agent project instructions.** A checked-in file such as `AGENTS.md` or `CLAUDE.md` tells the agent how to build, test and lint the project, which directories matter and which conventions to follow. This is Lecture 4's "memory and skills" applied to a repository.
2. **Make verification cheap and fast.** A single command that runs relevant tests in seconds is worth more to an agent than a slow full suite. Include linters and type checkers; they catch errors before tests run.
3. **Reproduce before fixing.** Ask the agent to write a failing test first. It forces correct localization and becomes a regression test.
4. **Prefer small, reviewable diffs.** Ask for the minimal change plus evidence (test output). A human reviewing a 20-line diff catches far more than one reviewing 2,000 lines.
5. **Pick the edit tool to match the model.** As the Aider result shows, format matters. If a model keeps failing search/replace matches, give it more context lines or a different format.
6. **Give it a map.** For large repositories, a compact repository map (for example Aider's tree-sitter-based symbol map) or a dependency graph (LocAgent) saves many exploratory tool calls.
7. **Sandbox everything.** Run agents in containers with limited network and no production credentials. Repository content, issue text and web pages can carry prompt injections; treat them as untrusted input.

### Open problems

- **Long horizons and compounding error.** SWE-Milestone-style evaluation shows that decisions accumulate; an agent's early architecture choices constrain later tasks. Few benchmarks yet measure maintainability over months of changes.
- **Credit assignment in RL.** A terminal pass/fail reward over a 50-step trajectory is sparse. Process rewards, learned verifiers and step-level critics are active research directions (Lectures 9 and 11).
- **Non-functional quality.** Security, readability and performance are hard to verify automatically. NoFunEval-style metrics are proxies, and static analyzers cover only known patterns.
- **When to simulate versus execute.** World models such as CWM promise cheaper planning, but as the lecture stresses, a confident wrong prediction can discard a correct patch. Calibrated uncertainty and fallback rules are not solved.
- **Human–agent collaboration.** Developers spend most of their time outside coding (Meyer et al.). Agents that help with review, requirements and incident response need evaluation methods built around human judgment, not only tests.

## Worked example

The sketch below is a complete shell-only coding agent in about 70 lines: it fixes the lecture's `retries = 0` bug with the localize–edit–verify loop. `call_llm(messages) -> str` is a stub that replays a scripted trajectory, so the file runs as-is with Python 3.9+; swap in a real chat-completion call to make it a live agent.

```python
"""Minimal localize-edit-verify coding agent (shell-only toolset, mini-SWE-agent style).

call_llm is a STUB: replace it with your provider's chat API. Here it replays a
scripted trajectory so the loop runs end to end without a model.
"""
import pathlib, re, subprocess, tempfile, textwrap

# --- 1. A tiny repository with the lecture's bug: retries=0 becomes 3 ---------
REPO = pathlib.Path(tempfile.mkdtemp())
(REPO / "config.py").write_text('def retry_count(config):\n    return config.get("retries") or 3\n')
(REPO / "test_config.py").write_text(textwrap.dedent("""
    import unittest
    from config import retry_count
    class RetryTests(unittest.TestCase):
        def test_missing(self):  self.assertEqual(retry_count({}), 3)
        def test_none(self):     self.assertEqual(retry_count({"retries": None}), 3)
        def test_zero(self):     self.assertEqual(retry_count({"retries": 0}), 0)
        def test_positive(self): self.assertEqual(retry_count({"retries": 2}), 2)
"""))

# --- 2. The single tool: run a shell command, return output + exit status ----
def run_bash(cmd: str, timeout: int = 30) -> str:
    try:
        p = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True,
                           text=True, timeout=timeout)
        return f"exit={p.returncode}\n{(p.stdout + p.stderr)[-2000:]}"  # truncate long output
    except subprocess.TimeoutExpired:
        return "exit=124\nTIMEOUT"

# --- 3. Stubbed model: a real agent would send `messages` to an LLM ----------
FENCE = "`" * 3  # avoids literal triple backticks in this source
def act(thought: str, cmd: str) -> str:
    return f"THOUGHT: {thought}\n{FENCE}bash\n{cmd}\n{FENCE}"

FIX = ("python3 - <<'EOF'\nimport pathlib\np = pathlib.Path('config.py')\n"
       "p.write_text(p.read_text().replace('return config.get(\"retries\") or 3',\n"
       "  'value = config.get(\"retries\")\\n    return 3 if value is None else value'))\nEOF")
SCRIPT = [
    act("localize where retries is defaulted", "rg -n retries . || grep -rn retries ."),
    act("reproduce the bug", "python3 -m unittest test_config.RetryTests.test_zero"),
    act("0 is falsy, so `or 3` replaces it; default only on None", FIX),
    act("verify the fix AND regressions", "python3 -m unittest -v test_config"),
    act("all tests pass", "echo SUBMIT && cat config.py"),
]
def call_llm(messages: list[dict]) -> str:
    turn = sum(m["role"] == "assistant" for m in messages)
    return SCRIPT[min(turn, len(SCRIPT) - 1)]

# --- 4. The agent loop: action -> observation -> next action ------------------
def solve(issue: str, max_steps: int = 10) -> list[dict]:
    messages = [
        {"role": "system", "content": "You fix bugs. Reply with THOUGHT and ONE bash code block. "
                                      "Never edit tests. Echo SUBMIT when tests pass."},
        {"role": "user", "content": issue},
    ]
    for step in range(max_steps):
        reply = call_llm(messages)
        messages.append({"role": "assistant", "content": reply})
        match = re.search(FENCE + r"bash\n(.*?)" + FENCE, reply, re.S)
        if not match:  # format error: tell the model, do not crash
            messages.append({"role": "user", "content": "Format error: give one bash block."})
            continue
        obs = run_bash(match.group(1))
        print(f"--- step {step}: {reply.splitlines()[0]}\n{obs}")
        messages.append({"role": "user", "content": obs})
        if "SUBMIT" in obs:
            break
    return messages

if __name__ == "__main__":
    solve("Setting retries=0 in the config still retries 3 times. Zero should mean no retries.")
```

Running it prints five steps: the search finds `or 3` in `config.py`; the targeted test fails with `AssertionError: 3 != 0`; the edit applies; the full suite then shows 4 tests OK; the agent submits.

**What to notice.**

- The whole harness is one tool (`run_bash`) plus a loop. Output truncation, exit codes and a timeout are the parts that make it robust, as in mini-SWE-agent.
- Verification runs the *entire* test file, not only the failing test, so pass→pass regressions are caught.
- The system prompt forbids editing tests. A real harness should also enforce it, for example by checking the final diff for changes under `tests/`.
- Format errors become observations rather than crashes; real models produce malformed actions often enough that this matters.
- To turn this into a SWE-bench-style evaluator, hold back `test_zero` from the agent and run it only after submission as the fail→pass check.
- To collect RL data, save `messages` plus a final reward (1 if hidden tests pass). Mask the `user` observation turns out of the loss; only assistant turns are training targets.

## More worked examples

Two more examples: a runnable mini SWE-smith pipeline, and a numeric walkthrough of inference budgets.

### Example 2 · A mini SWE-smith: inject bugs, validate them, score repairs

This program reproduces slides 47, 51–52 and 26 end to end in 108 lines of standard-library Python. It starts from the fixed `retry_count` plus a small `backoff` helper and six tests. An `ast.NodeTransformer` applies one mutation at a time (the `is None` → `not` bug of slide 52, integer constant +1, `min` → `max`). Every mutant runs against the tests in a fresh subprocess with a timeout (the "isolated runtime" of slide 23). Mutants that break some but not all tests are kept, with their fail→pass and pass→pass lists (slide 47). Finally, a stubbed repair model samples 8 patches per task and the unbiased pass@k estimator scores them. `call_llm(messages) -> str` is a stub: it returns the correct code 40% of the time and a wrong or no-op edit otherwise.

```python
"""Mini SWE-smith: inject bugs with ast, validate them by running tests,
then let a (stubbed) repair model sample patches and score pass@k."""
import ast, random, subprocess, sys, tempfile, textwrap, os
from math import comb

BASELINE = textwrap.dedent('''
    def retry_count(config):
        value = config.get("retries")
        return 3 if value is None else value

    def backoff(attempt, base=2, cap=30):
        return min(cap, base ** attempt)
''')

TESTS = {  # test name -> assertion source
    "missing":  'assert m.retry_count({}) == 3',
    "none":     'assert m.retry_count({"retries": None}) == 3',
    "zero":     'assert m.retry_count({"retries": 0}) == 0',
    "positive": 'assert m.retry_count({"retries": 2}) == 2',
    "backoff":  'assert m.backoff(3) == 8',
    "cap":      'assert m.backoff(10) == 30',
}

def run_tests(src):
    """Run every test in a fresh subprocess (isolated runtime + timeout)."""
    results = {}
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "m.py"), "w") as f:
            f.write(src)
        for name, body in TESTS.items():
            code = f"import m\n{body}\n"
            try:
                p = subprocess.run([sys.executable, "-c", code], cwd=d,
                                   capture_output=True, timeout=5)
                results[name] = p.returncode == 0
            except subprocess.TimeoutExpired:
                results[name] = False
    return results

class Mutator(ast.NodeTransformer):
    """Apply exactly one mutation, at the target-th mutable site."""
    def __init__(self, target):
        self.target, self.seen, self.desc = target, -1, None
    def _hit(self):
        self.seen += 1
        return self.seen == self.target
    def visit_Compare(self, node):   # `x is None` -> `not x` (slide 52's bug)
        self.generic_visit(node)
        if isinstance(node.ops[0], ast.Is) and self._hit():
            self.desc = "is None -> not value"
            return ast.UnaryOp(op=ast.Not(), operand=node.left)
        return node
    def visit_Call(self, node):      # min -> max
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "min" and self._hit():
            self.desc = "min -> max"
            node.func.id = "max"
        return node
    def visit_Constant(self, node):  # integer literal k -> k + 1
        if type(node.value) is int and self._hit():
            self.desc = f"constant {node.value} -> {node.value + 1}"
            return ast.Constant(node.value + 1)
        return node

def make_tasks():
    base = run_tests(BASELINE)
    assert all(base.values()), "baseline must pass every test"
    tasks = []
    for site in range(10):
        m = Mutator(site)
        tree = m.visit(ast.parse(BASELINE))
        if m.desc is None:
            break
        buggy = ast.unparse(ast.fix_missing_locations(tree))
        res = run_tests(buggy)
        f2p = [t for t, ok in res.items() if not ok]   # must go fail -> pass
        p2p = [t for t, ok in res.items() if ok]       # must stay pass -> pass
        keep = 0 < len(f2p) < len(TESTS)               # breaks some, not all
        print(f"site {site}: {m.desc:<22} fails={f2p} keep={keep}")
        if keep:
            tasks.append({"desc": m.desc, "buggy": buggy, "f2p": f2p, "p2p": p2p})
    return tasks

def call_llm(messages):
    """STUB for a real model call. Returns the gold fix 40% of the time,
    otherwise a plausible but wrong patch (e.g. only edits one site)."""
    task = messages[-1]["task"]
    if random.random() < 0.4:
        return BASELINE
    return task["buggy"].replace("30", "31")  # wrong or no-op edit

def resolved(task, patched_src):
    res = run_tests(patched_src)
    return all(res[t] for t in task["f2p"]) and all(res[t] for t in task["p2p"])

def pass_at_k(n, c, k):
    return 1.0 if n - c < k else 1 - comb(n - c, k) / comb(n, k)

if __name__ == "__main__":
    random.seed(0)
    tasks = make_tasks()
    print(f"\nkept {len(tasks)} valid tasks\n")
    n = 8
    for t in tasks:
        c = sum(resolved(t, call_llm([{"role": "user", "task": t}]))
                for _ in range(n))
        print(f"{t['desc']:<22} n={n} c={c} "
              f"pass@1={pass_at_k(n, c, 1):.2f} pass@4={pass_at_k(n, c, 4):.2f}")
```

Real output (Python 3, run as written):

```text
site 0: is None -> not value   fails=['zero'] keep=True
site 1: constant 3 -> 4        fails=['missing', 'none'] keep=True
site 2: constant 2 -> 3        fails=['backoff'] keep=True
site 3: constant 30 -> 31      fails=['cap'] keep=True
site 4: min -> max             fails=['backoff', 'cap'] keep=True

kept 5 valid tasks

is None -> not value   n=8 c=2 pass@1=0.25 pass@4=0.79
constant 3 -> 4        n=8 c=2 pass@1=0.25 pass@4=0.79
constant 2 -> 3        n=8 c=1 pass@1=0.12 pass@4=0.50
constant 30 -> 31      n=8 c=1 pass@1=0.12 pass@4=0.50
min -> max             n=8 c=3 pass@1=0.38 pass@4=0.93
```

**What to notice.**

- Site 0 reproduces slide 52 exactly: `not value` turns zero into three, and only the `zero` test fails. The other five tests become the pass→pass regression list.
- Every mutant here was kept because each broke at least one but not all tests. Add a mutation site with no covering test (for example, a default argument nothing calls) and it would show `fails=[]` and be dropped: no reward could see it.
- The stub's true success rate is 40%, but with n = 8 the measured pass@1 ranges from 0.12 to 0.38. Small n gives noisy estimates; papers use n of 100 or more for stable pass@k.
- pass@4 is much higher than pass@1 (0.79 vs 0.25 at c = 2). That gap is only reachable if something can pick the right sample: the verifier story of slides 26 and 50.
- The wrong-patch stub sometimes makes a no-op edit (on the "30 → 31" task it replaces text that is no longer there). The harness grades it as unresolved without special handling, because grading is behavioral.

### Example 3 · Budgeting inference: pass@k, verifiers and cost per fix

Suppose an agent is sampled n = 20 times on a repair task and c = 3 runs produce a passing patch. The unbiased estimator gives:

$$
\text{pass@}k = 1 - \frac{\binom{n-c}{k}}{\binom{n}{k}}
$$

| k (rollouts) | pass@k (oracle pick) | With a verifier that picks right 70% of the time | Tokens spent (200K per rollout) | Tokens per resolved task |
| --- | --- | --- | --- | --- |
| 1 | 0.150 | 0.150 (no choice needed) | 200K | 1.33M |
| 5 | 1 − 6,188/15,504 = 0.601 | 0.601 × 0.7 = 0.421 | 1.0M | 2.38M |
| 10 | 1 − 19,448/184,756 = 0.895 | 0.895 × 0.7 = 0.626 | 2.0M | 3.19M |

Step by step. For k = 5, C(17, 5) = 6,188 ways to pick 5 failing runs out of 17, and C(20, 5) = 15,504 ways to pick any 5. So the chance all 5 fail is 0.399, and pass@5 = 0.601. pass@k assumes an oracle that recognizes the right patch; a real system needs a verifier. A simple model: when at least one correct patch exists, the verifier picks one with probability 0.7. So resolved rate = pass@k × 0.7. Cost grows linearly with k, while the resolved rate grows with diminishing returns. Tokens per resolved task rise from 1.33M to 3.19M.

**What to notice.**

- Best-of-10 more than quadruples the resolved rate (0.15 → 0.63) but more than doubles the cost per fix. Whether that is worth it depends on how much a fix is worth, not only on the score.
- The verifier's quality caps the gain. At 70% the system loses 27 points of the oracle's 0.895 at k = 10. Improving the verifier to 90% would add 18 points for free, with no extra rollouts.
- SWE-Gym's inference plot (slide 50) is this table measured for real: about 20.6% at 1 rollout rising to 32% at 16 with a learned verifier.
- The "70% verifier" is a simplification. Real verifiers are better on some tasks than others, and their errors correlate with the agent's errors, which usually makes real gains smaller than this model predicts.

## Key terms

These terms recur across the lecture and the rest of the course.

| Term | Meaning |
| --- | --- |
| Agentless | A fixed, non-agentic repair pipeline (localize → repair → validate) where the workflow, not the LLM, decides the next step. |
| Causal masking (infilling) | Training objective that moves a masked span to the end (prefix \[M0\] suffix \[M0\] span) so a left-to-right model learns to fill gaps using both sides. |
| CodeBLEU | Reference-based metric combining BLEU, keyword-weighted n-grams, AST subtree match and data-flow match. |
| Code world model | A model (neural, or an LLM-written program) that predicts the result of executing code or actions without running them. |
| Credit assignment | Working out which earlier action in a long trajectory caused a late success or failure. |
| Decontamination | Removing evaluation tasks (or near-copies) from training data so scores measure skill, not memory. |
| Edit format | How a model expresses a change: whole file, search/replace, unified diff or file-operation patch. |
| Execution-based evaluation | Judging code by running it against tests in a sandbox rather than comparing its text to a reference. |
| Fail → pass / pass → pass tests | SWE-bench's two test sets: tests that must start passing (the requested repair) and tests that must keep passing (no regressions). |
| Harness | Everything around the model: prompts, tools, agent loop and context management. |
| Localize–edit–verify loop | The core agentic coding cycle: find the cause, change the code, run checks, and revise on failure. |
| Mid-training | Continued pre-training on a shifted mixture (more code, longer contexts) between general pre-training and post-training. |
| Multi-harness training | Training one model's weights on trajectories from several harnesses so it does not overfit one tool set. |
| Mutation (bug injection) | Deliberately altering working code so existing tests fail, creating a synthetic repair task (SWE-smith). |
| pass@k | Probability that at least one of k sampled programs passes all tests. |
| Runnable task | A training or evaluation unit with a starting repository, installed dependencies, an issue and executable checks. |
| RL with execution rewards | Reinforcement learning where the reward is whether generated code passes tests. |
| SWE-bench | Benchmark of real GitHub issues from Python repositories, graded by hidden tests from the fixing pull request. |
| World model vs. policy | The policy π(a \| h) chooses actions; the world model p(o \| h, a) predicts their observations. |

## Self-check

Try each question before reading its answer.

1. Why do BLEU and exact match fail as measures of code correctness? Use the `is_positive` example. **Answer:** They measure text overlap, not behavior. `return x >= 0` is one character away from the reference `return x > 0` but wrong at x = 0, while `return not (x <= 0)` looks different yet is equivalent for integers. Text metrics reward the first and penalize the second.
2. What does the Qwen2.5-Coder mixture experiment show, and what would you conclude for your own continued-training run? **Answer:** Moving from 100/0/0 to 70/20/10 code/text/math cost only 1.5 points on code (49.8 → 48.3) but raised MATH from 10.3 to 33.2 and MMLU from 23.8 to 62.9. Keep a substantial share of text and math; choose the ratio empirically by tracking both code gains and general-capability retention.
3. Explain how causal-masking infilling is trained, and why it beats reranking with the suffix. **Answer:** The span is cut out and moved to the end: prefix \[M0\] suffix \[M0\] span \[END\], so a left-to-right model learns to generate the span after seeing the suffix. Using the suffix during generation lets it shape every token, whereas reranking can only choose among candidates generated blind. InCoder's single-line score rose from 54.9% (reranking 10 candidates) to 69.0% (infilling).
4. You sample n = 10 programs for a problem and c = 2 pass. What is pass@1, and why use the unbiased estimator rather than just sampling k programs? **Answer:** pass@1 = 1 − C(8,1)/C(10,1) = 1 − 8/10 = 0.2. Sampling n > k and applying the combinatorial formula gives a lower-variance estimate of pass@k from the same samples, and lets you report several k values at once.
5. Describe SWE-bench's success criterion. Why are pass → pass tests necessary? **Answer:** A patch is applied, the PR's hidden tests are added, and the task is resolved only if all fail → pass tests now pass and all pass → pass tests still pass. Without pass → pass tests, a patch could fix the issue by breaking other behavior — e.g. deleting the feature — and still score.
6. When would you choose an Agentless-style fixed workflow over an open-ended agent? **Answer:** When tasks are similar in shape (e.g. localized bug fixes), cost and predictability matter, and a weaker model struggles to plan. The fixed pipeline is cheaper and easier to debug. Choose an agent when tasks need unusual steps, such as installing dependencies or exploring an unfamiliar build system.
7. On Aider's refactoring benchmark, GPT-4 Turbo scored 20% with search/replace and 61% with a simplified unified diff. What general lesson should a harness designer take? **Answer:** The edit format is part of the model interface and can matter as much as the model. Measure formats per model on your own tasks, and prefer formats the model was trained on. Avoid formats that let the model elide code or require exact line numbers it cannot count.
8. How does SWE-smith create a repair task, and how does it check that the task is valid? **Answer:** It starts from a repository whose tests pass, mutates source code (not tests) by procedural changes, LM-written bugs, combined bugs or reverted PRs, and keeps only mutations that make some existing tests fail. The failing tests become fail → pass checks and the rest become pass → pass checks; restoring the original code must make all tests pass again.
9. Why is credit assignment hard in RL for multi-step code repair, and name one way to ease it. **Answer:** The reward is terminal (repaired or not), so a failure at step 40 does not reveal whether search, editing or testing went wrong. Remedies include intermediate rewards (e.g. localization F1 as in CodeScout), learned verifiers or critics that score partial trajectories, and training on shorter sub-skills.
10. How would you design an evaluation for a coding agent that edits a web form's validation? **Answer:** Build a runnable app, then add execution checks for the requested behavior (blank name → error, no record saved) and regression checks (valid name saves, existing tests pass), for example as Playwright scripts. Add a screenshot check that the error is visible, but do not grade by image similarity to the issue image.
11. A world model predicts that correct patch A fails and wrong patch B passes. What goes wrong, and how should a system guard against it? **Answer:** The agent would submit B and discard A, turning a solvable task into a failure. Guard by running real tests on finalists, measuring prediction error and task success together, and setting a confidence threshold below which the agent falls back to execution.
12. Meyer et al. found coding is about 15% of a developer's day. What does this imply for which agent tasks to build and benchmark next? **Answer:** Speeding up code writing alone has limited impact on overall productivity. High-value targets include debugging (14%), testing, code review, CI repair, documentation and maintenance, which is why benchmarks such as SWT-Bench, LCA CI Builds Repair and SWE-Milestone exist.

## Practice problems

Exam-style problems, harder than the self-check. Try each before reading its solution.

1. **pass@k by hand.** A model is sampled n = 10 times on one HumanEval problem and c = 2 samples pass. Compute pass@1 and pass@3 with the unbiased estimator. Then explain why simply reporting "the fraction of groups of 3 that contain a pass, from one run of 3 samples" would be a worse estimate.

   **Solution:** pass@k = 1 − C(n−c, k)/C(n, k). For k = 1: 1 − C(8,1)/C(10,1) = 1 − 8/10 = 0.20. For k = 3: C(8,3) = 56 and C(10,3) = 120, so pass@3 = 1 − 56/120 ≈ 0.533. The estimator uses all 10 samples to average over every possible group of 3, so its variance is much lower than a single draw of 3, which can only return 0 or 1. It is unbiased because each group of k is equally likely under sampling without replacement. Chen et al. recommend n well above k for exactly this reason.
2. **Whitespace tokens.** A 200-line Python file averages 8 spaces of indentation per line and 10 non-whitespace tokens per line. Compare the token count with one token per space against a tokenizer that merges each newline-plus-indent run into one token (as in the StarCoder2 split on slide 9). What fraction is saved, and why does it matter for agents?

   **Solution:** Content costs 200 × 10 = 2,000 tokens either way. Naive indentation adds 200 × 8 = 1,600 tokens; merged runs add about 200 × 1 = 200. Totals are 3,600 versus 2,200, a saving of 1,400 tokens or about 39%. An agent reads many files per task, so the same context window holds roughly 1.6 times more code. Training also sees more real code per step. The cost is a larger vocabulary with dedicated whitespace-run entries.
3. **Reading the mixture table.** Using slide 12, compute the absolute and relative change in each column when moving from 100/0/0 to 70/20/10. Which mix would you choose for a coding agent that must read GitHub issues, and why?

   **Solution:** Common code: 49.8 → 48.3, −1.5 points or about −3% relative. MATH: 10.3 → 33.2, +22.9 points or about 3.2x. MMLU: 23.8 → 62.9, +39.1 points or about 2.6x. The mixed recipe gives up very little code skill for large gains in reasoning and world knowledge. An agent must understand natural-language issues, domain concepts and multi-step plans, so 70/20/10 is the clear choice. The pure-code model would write fluent code for the wrong problem.
4. **Critique a metric.** The reference is `return sorted(xs)[0]` (smallest element). Candidate A is `return sorted(xs)[-1]`; candidate B is `return min(xs)`. Which scores higher on BLEU, which is correct, and what minimal test set would separate them? Is there an input where the reference itself misbehaves?

   **Solution:** A shares almost every token and n-gram with the reference (only `0` vs `-1` differs), so its BLEU is high; B shares few n-grams, so its BLEU is low. B is correct and A returns the largest element. One test such as `xs = [3, 1, 2]` expecting 1 separates them. Both the reference and B raise an error on an empty list (IndexError vs ValueError), so a test on `[]` must specify which exception or behavior is required. This is slide 20's lesson plus slide 24's: tests are only as good as the specification they encode.
5. **Debug a trajectory.** An agent receives the retries issue. Its steps: (1) runs `test_zero`, sees `AssertionError: 3 != 0`; (2) opens `test_config.py` and changes the expected value to 3; (3) runs all tests, 4 pass; (4) submits. Identify the error, explain how SWE-bench-style grading treats this patch, and propose two harness-level defenses.

   **Solution:** The agent "repaired the test, not the condition", which slide 34 warns against. It is a form of reward hacking: the local signal turned green but the behavior is unchanged. SWE-bench grading applies the held-out test files after the model's patch, overwriting the edited test. The real zero test then fails, so the task is unresolved. Defenses: make test files read-only or diff-check that the patch does not touch test paths; and run the hidden fail→pass tests rather than the agent's local copy. A prompt rule ("do not modify tests") helps but is not enforcement.
6. **Validate injected bugs.** From a repository with 40 passing tests, three mutants are produced. Mutant A fails 0 tests. Mutant B fails all 40 with `ImportError`. Mutant C fails 2 tests. Which do you keep as training tasks, and what are the fail→pass and pass→pass lists for the one you keep?

   **Solution:** Keep only C. A is undetectable: with no failing test, no reward can tell a fix from no fix, and it may even be semantically equivalent. B breaks the import, so the "bug" is trivial to find and teaches nothing about behavior; SWE-smith-style pipelines also drop mutants that break everything. For C, fail→pass = the 2 failing tests, and pass→pass = the other 38. A patch resolves C only if all 40 pass afterward.
7. **Classify generated tests.** For an SWT-Bench-style task, four generated tests give these (pre-PR, post-PR) results: T1 (fail, pass), T2 (pass, pass), T3 (fail, fail), T4 (error: function not found, pass). Which tests count as reproducing the issue? What is subtle about T4?

   **Solution:** T1 is the textbook fail-to-pass test and counts. T2 passes both times, so it does not detect the bug. T3 fails both times, so it is wrong or tests something else. T4 counts under a plain fail→pass rule, because an error is a failure. But if the fix added a new function, T4 fails pre-PR only because the name is missing, not because it checks the buggy behavior. A strict evaluator may also check coverage of the changed lines or require that the failure is an assertion, not a missing symbol.
8. **Credit under GRPO.** Six rollouts on one repair task get rewards \[1, 0, 0, 1, 0, 0\]. Compute the group-normalized advantage for passing and failing rollouts. One passing rollout contains a useless `ls -R /` that printed 5,000 lines. What does the update do to that action, and what would reduce this?

   **Solution:** Mean = 2/6 ≈ 0.333. Standard deviation = √(0.333 × 0.667) ≈ 0.471. Passing: (1 − 0.333)/0.471 ≈ +1.41; failing: (0 − 0.333)/0.471 ≈ −0.71. Every action in each passing rollout, including the wasteful `ls -R /`, is pushed up by the same +1.41. That is the credit-assignment problem of slide 49. Remedies: a small per-step or per-token cost, rewards for intermediate products such as localization F1, or more rollouts so wasteful steps appear equally in passes and fails and average out.
9. **Design a CI-repair agent.** Using slide 69, design an agent for failures like `npm ci: EBADENGINE`. List its tools, its verification step, and one guardrail that separates a causal fix from silencing the error.

   **Solution:** Tools: read CI logs; read and edit workflow files (`.github/workflows/*.yml`) and `package.json`; run the install, build and test commands locally in a matching container; and re-trigger CI. Localize by comparing the runtime in the log (Node 16) with the declared `engines` field (Node >= 18). Edit the `setup-node` version to a supported one (for example '20'). Verify by rerunning the full workflow, not just `npm ci`, and checking that all required checks pass. Guardrail: reject patches that add `--force`, `engine-strict=false` or remove failing steps; require that the changed line is causally linked to the logged error.
10. **Predict or execute?** A test suite takes 120 s to run. A world model predicts the outcome in 5 s. A wrong prediction costs a 900 s redo. On 70% of cases the model is confident and wrong 5% of the time; on 30% it is unsure and wrong 30% of the time. Compare three policies: always execute, always predict, and predict only when confident.

    **Solution:** Always execute: 120 s per decision. Always predict: overall error = 0.7 × 0.05 + 0.3 × 0.30 = 0.125, so 5 + 0.125 × 900 = 117.5 s, barely better and riskier. Confident-only: 0.7 × (5 + 0.05 × 900) + 0.3 × 120 = 0.7 × 50 + 36 = 71 s. The threshold policy wins by using prediction only where it is reliable. This is slide 79's "vary the fallback threshold" in numbers; the break-even error rate is (120 − 5)/900 ≈ 12.8%.
11. **Edit-format failure.** An agent sends a SEARCH block `     return value ` to a file where that line occurs 3 times. What should the harness do? Then compare the output cost of fixing one line with whole-file rewrite versus search/replace for a 600-line file at 12 tokens per line.

    **Solution:** The harness must refuse to guess and return a specific error: "matched 3 times at lines 40, 88, 131; include more surrounding lines." Applying the first match silently could edit the wrong function and pass unrelated tests. Whole file costs about 600 × 12 = 7,200 output tokens, while search/replace with a few context lines costs perhaps 60–100 tokens. That is roughly 70–120 times cheaper per edit, which is why compact formats dominate despite their matching failures.
12. **Grading a frontend fix.** For the blank-name bug of slide 58, a colleague proposes grading patches by the pixel similarity of the final screenshot to the reference fix's screenshot. Give two ways this grader goes wrong and write the checks you would use instead.

    **Solution:** A correct patch with a differently worded or differently placed error message would score low. A wrong patch that renders the red message but still saves the record would score high, since the "Saved records" count is a tiny part of the image. Slide 59's rule applies: images guide the agent, tests grade it. Use behavior checks (fill Name with spaces, click Save, expect 0 records and a visible error; fill a valid name, expect 1 record) and regression checks (existing tests pass). Add an appearance check only as an assertion that the error element is visible, not as pixel similarity.

## References and further reading

The links below were checked against arXiv or the project site; items are grouped in the order the lecture uses them.

### Cited in the lecture

**Code models and training data**

- [OLMo: Accelerating the Science of Language Models](https://arxiv.org/abs/2402.00838) — Groeneveld et al., 2024 — fully open LLM report; source of the pre-training objective and data-mixture framing.
- [StarCoder: may the source be with you!](https://arxiv.org/abs/2305.06161) — Li et al., 2023 — 15.5B code model; the reference for data filtering, dedup, decontamination and per-language scaling curves.
- [StarCoder 2 and The Stack v2](https://arxiv.org/abs/2402.19173) — Lozhkov et al., 2024 — the tokenizer used in the whitespace example.
- [Evaluating Large Language Models Trained on Code (Codex / HumanEval)](https://arxiv.org/abs/2107.03374) — Chen et al., 2021 — HumanEval, pass@k and its unbiased estimator, whitespace-run tokens.
- [Code Llama: Open Foundation Models for Code](https://arxiv.org/abs/2308.12950) — Rozière et al., 2023 — mid-training Llama 2 on 500B code tokens, then long-context extension.
- [Qwen2.5-Coder Technical Report](https://arxiv.org/abs/2409.12186) — Hui et al., 2024 — code/text/math mixture ablation; 8K → 32K training plus YaRN to 128K.
- [InCoder: A Generative Model for Code Infilling and Synthesis](https://arxiv.org/abs/2204.05999) — Fried et al., 2022 (ICLR 2023) — causal-masking infilling and its ablations.
- [Efficient Training of Language Models to Fill in the Middle](https://arxiv.org/abs/2207.14255) — Bavarian et al., 2022 — FIM at scale; shows infilling costs little left-to-right ability.
- [OctoPack: Instruction Tuning Code Large Language Models](https://arxiv.org/abs/2308.07124) — Muennighoff et al., 2023 — commits as instruction data.
- [Graph-based, Self-Supervised Program Repair from Diagnostic Feedback (DrRepair)](https://arxiv.org/abs/2005.10636) — Yasunaga & Liang, 2020 — learning repairs from compiler errors.
- [CodeRL](https://arxiv.org/abs/2207.01780) — Le et al., 2022 — early RL from unit-test outcomes.
- [Code Execution with Pre-trained Language Models (CodeExecutor)](https://arxiv.org/abs/2305.05383) — Liu et al., 2023 — training on execution traces.

**Evaluating generated code**

- [A Syntactic Neural Model for General-Purpose Code Generation](https://arxiv.org/abs/1704.01696) — Yin & Neubig, ACL 2017 — AST-based generation; exact-match and BLEU evaluation.
- [CodeBLEU](https://arxiv.org/abs/2009.10297) — Ren et al., 2020 — n-gram + AST + data-flow metric.
- [CodeBERTScore](https://arxiv.org/abs/2302.05527) — Zhou et al., EMNLP 2023 — embedding-based code similarity.
- [Is Your Code Generated by ChatGPT Really Correct? (EvalPlus)](https://arxiv.org/abs/2305.01210) — Liu et al., 2023 — shows weak tests inflate pass rates.
- [Competition-Level Code Generation with AlphaCode](https://arxiv.org/abs/2203.07814) — Li et al., 2022 — CodeContests and large-scale sample-and-filter.
- [NoFunEval](https://arxiv.org/abs/2401.15963) — Singhal et al., 2024 — 397 editing tasks for non-functional requirements.
- [DeepCoder: A Fully Open-Source 14B Coder at O3-mini Level](https://www.together.ai/blog/deepcoder) — Luo et al. (Agentica / Together AI), 2025 — execution-reward RL with growing context limits.

**Agentic coding and toolsets**

- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](https://arxiv.org/abs/2405.15793) — Yang et al., 2024 — the localize–edit–verify agent and the ACI idea.
- [Agentless: Demystifying LLM-based Software Engineering Agents](https://arxiv.org/abs/2407.01489) — Xia et al., 2024 — the fixed-workflow alternative.
- [mini-SWE-agent](https://mini-swe-agent.com) — SWE-agent team, 2025 — bash-only agent in about 100 lines.
- [Aider edit formats](https://aider.chat/docs/more/edit-formats.html) and [Aider unified diffs](https://aider.chat/docs/unified-diffs.html) — Paul Gauthier — the 20% vs 61% refactoring result and "lazy coding".
- [OpenHands: An Open Platform for AI Software Developers as Generalist Agents](https://arxiv.org/abs/2407.16741) — Wang et al., 2024 — open agent platform and harness.
- [Pi](https://pi.dev) — Mario Zechner — minimal terminal coding agent.
- [OpenCode](https://opencode.ai) — open-source terminal coding agent.
- [Codex](https://developers.openai.com/codex) — OpenAI — coding agent whose patch format is shown in the lecture.
- [LocAgent: Graph-Guided LLM Agents for Code Localization](https://arxiv.org/abs/2503.09089) — Chen et al., 2025 — dependency-graph navigation.

**Agent evaluation and training**

- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues?](https://arxiv.org/abs/2310.06770) — Jimenez et al., ICLR 2024 — the standard issue-resolution benchmark.
- [Training Software Engineering Agents and Verifiers with SWE-Gym](https://arxiv.org/abs/2412.21139) — Pan et al., 2024 — runnable training tasks; training and inference scaling.
- [R2E-Gym: Procedural Environments and Hybrid Verifiers](https://arxiv.org/abs/2504.07164) — Jain et al., 2025 — RL environments for SWE agents.
- [SWE-smith: Scaling Data for Software Engineering Agents](https://arxiv.org/abs/2504.21798) — Yang et al., 2025 — bug injection for task synthesis.
- [Multi-SWE-bench](https://arxiv.org/abs/2504.02605) — Zan et al., 2025 — multilingual issue resolving.
- [SWE-bench Multilingual](https://www.swebench.com/multilingual.html) — SWE-bench team — non-Python SWE-bench tasks.
- [NVIDIA Nemotron 3 Super](https://research.nvidia.com/labs/nemotron/Nemotron-3-Super/) and [Nemotron 3 Ultra](https://arxiv.org/abs/2606.15007) — NVIDIA, 2026 — multi-harness RL for coding.
- [Polar: Agentic RL on Any Harness at Scale](https://arxiv.org/abs/2605.24220) — Xu et al., 2026 — native harnesses behind a shared model API proxy.

**Frontend and broader development**

- [SWE-bench Multimodal](https://arxiv.org/abs/2410.03859) — Yang et al., 2024 — visual issues; browser and screenshot tools for SWE-agent.
- [VisualWebArena](https://arxiv.org/abs/2401.13649) — Koh et al., 2024 — multimodal web agents (next lecture).
- [Playwright assertions](https://playwright.dev/docs/test-assertions) and [visual comparisons](https://playwright.dev/docs/test-snapshots) — Microsoft — scripted browser checks.
- [Today was a Good Day: The Daily Life of Software Developers](https://www.microsoft.com/en-us/research/publication/today-was-a-good-day-the-daily-life-of-software-developers/) — Meyer et al., IEEE TSE 2019 — where developer time goes.
- [CodeScout: An Effective Recipe for RL of Code Search Agents](https://arxiv.org/abs/2603.17829) — Sutawika et al., 2026 — localization as an RL task.
- ViBench: A Benchmark on Vibe Coding — Georgian and Replit, ACM CAIS 2026 — app creation and extension with browser test plans (no verified paper link).
- [Commit0: Library Generation from Scratch](https://arxiv.org/abs/2412.01769) — Zhao et al., 2024 — implement a library against its tests.
- [ProgramBench: Can Language Models Rebuild Programs From Scratch?](https://arxiv.org/abs/2605.03546) — Yang et al., 2026 — reimplement a reference executable.
- [SWE-Milestone: Evaluating AI Agents on Continuous Software Evolution](https://arxiv.org/abs/2603.13428) — Deng et al., 2026 — dependent-task maintenance evaluation.
- [SWT-Bench](https://arxiv.org/abs/2406.12952) — Mündler et al., 2024 — fail-before/pass-after test generation.
- [Long Code Arena (incl. CI Builds Repair)](https://arxiv.org/abs/2406.11612) — Bogomolov et al., 2024 — JetBrains benchmarks including CI repair.
- [Training Versatile Coding Agents in Synthetic Environments (SWE-Playground)](https://arxiv.org/abs/2512.12216) — Zhu, Gandhi & Neubig, 2025 — synthetic projects for training.
- [Hybrid-Gym: Training Coding Agents to Generalize Across Tasks](https://arxiv.org/abs/2602.16819) — Xie et al., 2026 — transfer to repair, test and library tasks.

**Code-behavior prediction**

- [CWM: An Open-Weights LLM for Research on Code Generation with World Models](https://arxiv.org/abs/2510.02387) — FAIR CodeGen Team, 2025 — execution-trace mid-training.
- [Generating Code World Models with LLMs Guided by Monte Carlo Tree Search](https://arxiv.org/abs/2405.15383) — Dainese et al., 2024 — GIF-MCTS and code-based simulators.

### Further reading

- [The Stack: 3 TB of permissively licensed source code](https://arxiv.org/abs/2211.15533) — Kocetkov et al., 2022 — how a licensed, deduplicated code corpus is built.
- [LiveCodeBench](https://arxiv.org/abs/2403.07974) — Jain et al., 2024 — contamination-aware benchmark used in the DeepCoder plot.
- [SWE-rebench](https://arxiv.org/abs/2505.20411) — Badertdinov et al., 2025 — continuously refreshed, decontaminated SWE tasks.
- [SWE-Bench+: Enhanced Coding Benchmark for LLMs](https://arxiv.org/abs/2410.06992) — Aleithan et al., 2024 — audit of solution leakage and weak tests in SWE-bench.
- [SWE-bench leaderboards and Verified split](https://www.swebench.com/) — SWE-bench team — current results, harness details and splits.
- [Aider repository map](https://aider.chat/docs/repomap.html) — Aider — practical tree-sitter context for large repos.
- [AGENTS.md](https://agents.md/) — open format for per-repository agent instructions.
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic, 2024 — workflows versus agents; when to use each.
- [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) — Anthropic — practical habits for agentic coding in real repos.
- Program Synthesis — Gulwani, Polozov & Singh, Foundations and Trends in Programming Languages, 2017 — survey of the pre-LLM synthesis tradition.
- An Analysis and Survey of the Development of Mutation Testing — Jia & Harman, IEEE TSE, 2011 — background for SWE-smith-style bug injection.
- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) — Shao et al., 2024 — introduces GRPO, the group-relative advantage behind DeepCoder's GRPO+.
- [Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) — OpenAI, 2024 — how 93 developers screened 1,699 SWE-bench tasks down to 500 fair ones.
- [Python ast module documentation](https://docs.python.org/3/library/ast.html) — Python Software Foundation — `NodeTransformer` and `unparse`, used in the call-graph and bug-injection examples.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Topic deep dive: [[T01 - The Agent Loop and Harness Design]]
- Topic deep dive: [[T03 - Context Engineering - KV Cache, Prefix Caching and Compaction]]
- Topic deep dive: [[T06 - Coding Agents and Software-Engineering Benchmarks]]
- Topic deep dive: [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics]]
- Topic deep dive: [[T12 - Rewards, Verifiers and Reward Hacking]]
- [[Claude Code Complete Tutorial]]
- [[How People Use Claude Code]]
- [[Vibe Coding]]

[[L05 - Planning and Task Decomposition|← L5]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[L07 - Computer Use Agents|L7 →]]
