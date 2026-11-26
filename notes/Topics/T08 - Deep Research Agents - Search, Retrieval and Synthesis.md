---
tags: [cmu-ai-agents, ai-llms, topic-deep-dive, agents, deep-research, rag, retrieval]
aliases: ["CMU T8", "Deep Research Agents: Search, Retrieval and Synthesis"]
source: "CMU 11-768 AI Agents, Fall 2026 — lecture slides and cited papers"
---

# Topic 8 · Deep Research Agents: Search, Retrieval and Synthesis

[[T07 - Computer-Use and Web Agents - Perception, Grounding and Action|← T7]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics|T9 →]]

> [!abstract] CMU 11-768 AI Agents (Fall 2026) · Topic deep dive
> **Draws on:** [[L10 - Deep Research Agents]]
> **Source:** course lecture slides plus the papers listed in References.

Deep dive · draws on lectures L10 · 11-768 AI Agents, Fall 2026

## Overview

A deep research agent is a language model that plans, runs many searches, reads what it finds and writes a well-attributed answer; it matters because most valuable questions cannot be settled by one lookup.

L10 (Asai) opens with the contrast that defines the topic. "What is Akari Asai's office number at CMU?" needs one search and one span (GHC 5507). "Can AI agents synthesize scientific literature as well as human experts?" needs a plan, several searches, a reflection that notices two studies measure different things, a second search, and a qualified answer with citations. Everything in this sheet is about making the second kind of question work: finding evidence, reasoning over it, writing it up faithfully, measuring whether that happened, and training models to do it better and cheaper.

**Why it matters for building real agents.** Search is the most common tool an agent calls; L2 lists it first among tool scenarios (current information, search, fresh evidence). Almost every practical agent, from a support bot to an engineering-document reviewer, has a retrieval step, and its answer quality is capped by what that step returns. Deep research is also where several hard agent problems meet: long trajectories that overflow context (L3), planning and replanning (L5), judge-based evaluation of open-ended output (L7), and RL with rewards that are not simply right or wrong (L9, L11). Build a good deep research agent and you have practised most of the course.

**Key questions this sheet answers**

- How does agentic search differ from classical retrieval-augmented generation (RAG), and why does iterating help?
- How do the retrieval tools work under the hood: BM25, dense dual encoders, rerankers, web search and browsing?
- How should an agent formulate, reformulate and stop issuing queries?
- What separates short-answer tasks (BrowseComp) from long-form reports (ScholarQABench, DeepResearch Bench), and how is each evaluated?
- What do citation accuracy, attribution and faithfulness mean, and how do you check them automatically?
- How are rubrics and LLM judges built, and how far can you trust them?
- How are deep research models trained: mid-training, SFT, RL with verifiable rewards, and DR Tulu's evolving rubrics (RLER)?
- Why does feeding the agent's reasoning to the retriever (AgentIR, DR-Synth) raise accuracy while cutting searches, and what drives cost and latency?

**Which lectures cover it**

- **L10 (Asai), the main lecture**: tasks, benchmarks and evaluation; agent modeling and training (Tongyi DeepResearch, DR Tulu); retrieval for deep research (dense retrieval, AgentIR).
- **L2 (tool use)**: search and browsing as tools; call a tool only when its benefit beats latency, cost, failure and risk.
- **L3 (long context)**: why long search histories need compaction, externalized evidence and retrieval back from history.
- **L4 (memory and skills)**: embedding-based retrieval of past experience, and the finding that over-retrieval can hurt.
- **L5 (planning)**: parallel searches, plan revision when a search comes back empty, sub-agent delegation.
- **L7 (computer use)**: live-web benchmarks, benchmark drift, and LLM/VLM judges with measured human agreement.
- **L8, L9, L11 (SFT and RL)**: trajectory filtering, GRPO, asynchronous rollouts and reward hacking, which L10 applies to search agents.

**Prerequisites.** The agent loop (observe, think, act) from L1; tool calling from L2; basic probability, vectors and dot products; for the training parts, the policy-gradient and GRPO material from L9.

**Suggested reading path.** Read Core concepts in order: the first four subsections build the retrieval and search picture, the next two cover evaluation, the next two cover training, and the last two cover reasoning-aware retrieval and cost. Then run the Hands-on program, which puts retrieval, iterative search and citation checking in about 130 lines. Use Mechanics when you need the exact equations, Design patterns when you build, and Practice questions to test yourself.

## Concept map

![[cmu-ai-agents-T08-concept-map.png]]
*Concept map: Deep research agent · search loop, retrieval tools, evaluation and training, on a cost budget*

Read the top row as one research run from question to cited answer; the lower row shows what the loop calls (retrieval), how its answers are scored (evaluation), and how those scores come back as rewards that train both the policy and the retriever.

## Core concepts

This section builds deep research from the ground up: first what the agent does, then the retrieval machinery under it, then how search becomes iterative, how the tasks and benchmarks are defined, how answers are checked and judged, how models are trained, and finally how retrieval is adapted to agents and what it all costs.

### 1. What a deep research agent is

A **deep research (DR) agent** is a language model (LM) in a loop that alternates reasoning with tool calls, mostly `search` and `browse`, until it can write an answer grounded in the evidence it collected. The DR Tulu paper, quoted in L10, defines the goal as producing "in-depth, well-attributed answers to complex research tasks by planning, searching, and synthesizing information from diverse sources." Three words carry the weight: *multi-step* (many searches, not one), *synthesis* (combining several documents into one argument) and *attributed* (each claim traceable to a source).

L10 walks through one inference step by step, using special tags that the model learns to emit. The context grows left to right, with model-generated text (reasoning, tool calls, answer) interleaved with user input and tool output:

1. **Generate reasoning**: `<think> Find expert comparisons </think>`.
2. **Generate a tool call**: `<tool> search("expert comparisons") </tool>`.
3. **Execute the call**: the harness, not the model, runs the search.
4. **Append the tool output**: e.g. "\[1\] OpenScholar \[2\] DR Tulu".
5. **Continue reasoning with the retrieved text**: `<think> Check the tested tasks </think>`, possibly followed by more tool calls.
6. **Generate an answer with citations**: `<answer> Promising on tested tasks [1,2] ... </answer>`.

This is the ReAct pattern from L1 and L2 specialised to information seeking. The loop ends when the model emits an answer or hits a budget (a maximum number of tool calls or tokens).

**Plan, search, reflect, search again.** The running example in L10 shows why iteration is needed. The agent plans ("separate strong benchmark results from direct comparisons with human experts"), searches, and gets two kinds of result: a benchmark that scores the system against other AI systems, and an expert evaluation that compares agent answers with human-written ones. It then *reflects*: "a higher benchmark score does not yet answer my question about human experts. Which tasks and domains were tested?" That reflection produces a new, narrower query. The final answer is deliberately qualified: "Promising on tested tasks; broader parity with experts remains unproven," citing that experts preferred OpenScholar answers over expert-written ones on the evaluated questions \[1\], while DR Tulu's benchmark wins over other agents do not establish parity with humans \[2\].

**Two task families.** L10 distinguishes the tasks by their output:

|  | Short-answer deep search | Long-form deep research |
| --- | --- | --- |
| Output | An entity, number or date | A multi-paragraph report with citations |
| Example | BrowseComp: "identify the fictional character who..." (Plastic Man) | ScholarQABench: "Can AI agents synthesize literature as well as experts?" |
| What is hard | Finding the answer (many clues, obscure pages) | Coverage, correct synthesis, qualifications, support |
| How it is scored | Exact or judged match to a reference | Rubrics, LLM judges, citation checks |
| Reward for RL | Verifiable (0 or 1) | Graded and partly subjective |

Many systems are good at one family and weak at the other. DR Tulu's central argument (Section 8 below) is that training only on the first family does not transfer to the second.

**Why it matters.** The workers most likely to use DR agents (scientists, analysts, engineers checking standards) need answers they can verify. OpenScholar, the literature-synthesis system from Asai et al. that opens L10, found that GPT-4 fabricated citations in 78-90% of cases when asked to cite up-to-date literature in fields such as computer science and biomedicine. A DR agent exists to replace remembered, possibly invented facts with retrieved, checkable ones.

*Common misconception:* "Deep research is just RAG with more documents." Classical RAG retrieves once from the user's question. A DR agent decides *when* to search, *what* to search for next based on what it has learned, and *when to stop*; the query sequence is itself the product of reasoning.

### 2. Retrieval basics: lexical, dense, late-interaction and rerankers

Every search tool maps a query to a ranked list of documents. L10 groups the tools a DR agent uses into **local search** over a corpus you control (lexical retrievers such as BM25, and embedding models) and **black-box APIs** (a web search API such as `web_search`, and a `browse` tool that fetches a page). Tongyi DeepResearch also gives its agent Python execution and scholarly search; DR Tulu uses web browsing, scholar search and Google search. Understanding how local retrievers score documents explains most retrieval failures you will see.

**Lexical retrieval (BM25).** A **lexical retriever** matches the literal words of the query against an **inverted index**, a table from each word to the documents that contain it. **BM25** (Robertson and colleagues, 1990s) scores a document by summing, over query terms, an *inverse document frequency* (IDF) weight times a saturating function of the term's frequency in the document, normalised by document length. Rare words ("Newell") count far more than common ones ("award"), and the tenth occurrence of a word adds much less than the first. The exact formula is in Mechanics. BM25 needs no training, is fast, and is excellent for exact names, codes and rare terms. It fails on **vocabulary mismatch**: a query about "laureates" will not match a page that says "prize winners".

**Dense retrieval (dual encoders).** L10 presents Dense Passage Retrieval (DPR, Karpukhin et al., EMNLP 2020). A **document encoder** E\_d maps every passage to a vector once, offline, and the vectors go into a **vector index**. At query time a **query encoder** E\_q maps the query to a vector, and each document is scored by the dot product s(q, d) = E\_q(q)ᵀE\_d(d); the top k are returned. In the slide's example, "Who shared the Turing Award with Simon?" lands nearest to "\[1\] Newell and Simon: 1975 Turing Award" and far from "\[3\] CMU campus buildings and directions". Because the encoders are trained, they learn that "laureate" and "prize winner" mean similar things.

**Training dense retrievers.** The encoders are trained with a **contrastive loss**: for a query q, raise the score of a relevant passage d+ and lower the scores of negative passages d−. L10 gives the loss L = −log \[exp s(q,d+) / (exp s(q,d+) + Σ exp s(q,d−))\], which is a softmax cross-entropy over one positive and many negatives. The choice of negatives matters enormously: **hard negatives** that look relevant but are not (a page about Simon's Nobel when the question is about the Turing Award) teach far more than random ones. L10 defers encoder design, negative sampling and indexing to IR courses; the point for agents is that a retriever only learns the notion of relevance present in its training pairs.

**Approximate nearest neighbour (ANN) search.** Beyond the lecture: scoring a query against 45 million passages (OpenScholar's datastore size) by brute force costs 45M dot products per query. Libraries such as FAISS build graph-based (HNSW) or quantised (IVF-PQ) indexes that return approximately the top k in milliseconds, trading a small recall loss for large speedups.

**Late interaction and rerankers.** Beyond the lecture, two more stages are standard in production stacks:

- **Late interaction** (ColBERT, Khattab and Zaharia 2020) keeps one vector per token and scores with a sum of per-query-token maximum similarities. It is more precise than one vector per passage and still indexable.
- A **cross-encoder reranker** (for example monoBERT, Nogueira and Cho 2019) reads the query and one candidate together through a full transformer and outputs a relevance score. It is the most accurate, but it costs one forward pass per candidate, so it is applied only to the top 50-100 candidates from a cheaper first stage.
- An **LLM listwise reranker** reads a list of candidates and outputs a reordering. DR-Synth (Section 9) uses exactly this to create training labels.

| Retriever | How it scores | Strengths | Weaknesses | Typical role |
| --- | --- | --- | --- | --- |
| BM25 | Term overlap, IDF-weighted, length-normalised | No training; exact names, IDs, rare terms; fast | Vocabulary mismatch; no semantics | First stage; hybrid partner |
| Dual encoder (DPR, Qwen3-Embed) | Dot product of two independent vectors | Semantic match; precomputable index | Misses exact strings; needs training data; one vector compresses a whole passage | First stage |
| Late interaction (ColBERT) | Sum of max token-level similarities | Finer matching than one vector | Larger index | First stage or rerank |
| Cross-encoder reranker | Full attention over query and document | Most accurate pairwise judgment | One forward pass per candidate | Rerank top 50-100 |
| Web search API | Opaque commercial ranking | Huge, fresh coverage | Uncontrolled, changes over time, SEO bias | Open-web agents |

**Hybrid retrieval.** Because BM25 and dense retrievers fail in different ways, many systems run both and merge the lists. A simple, robust merge is **reciprocal rank fusion (RRF)**: each document scores Σ 1/(k + rank) over the lists, with k = 60 by convention. The Hands-on program uses it.

*Common misconception:* "Dense retrieval has replaced BM25." On entity-heavy, clue-style questions BM25 is a strong baseline, and on the BrowseComp-Plus agent experiments in L10 it is simply the floor that better retrievers beat. In practice hybrid is the safe default.

### 3. From RAG to agentic search: iterative query formulation and browsing

**Classical RAG.** Retrieval-augmented generation (Lewis et al., 2020) retrieves the top k passages for the user's question once, puts them in the prompt, and generates. It works when one query can surface all the needed evidence. It breaks on **multi-hop** questions, where the query for step two depends on what step one found. For "Which CMU researcher coauthored a book with a future economics Nobel laureate?", you cannot search for the coauthor until you know the laureate is Herbert Simon.

**The path to agentic search.** Beyond the lecture, the history runs in four steps. (1) Retrieve-then-read RAG. (2) Interleaved retrieval, where each chain-of-thought sentence becomes the next query (IRCoT, Trivedi et al., 2023) or retrieval triggers when the model is unsure (FLARE, 2023). (3) Learned retrieval decisions: Self-RAG (Asai et al., ICLR 2024) trains special reflection tokens that decide whether to retrieve and whether a passage is relevant and supports the output. (4) Fully agentic search, where the model writes its own queries as tool calls and is trained end-to-end with RL, as in Search-R1 (COLM 2025, cited in L10), Tongyi DeepResearch and DR Tulu. Each step hands more control of the query sequence to the model.

**Iterative query formulation.** The agent's queries are its main lever. Useful moves, most visible in L10's worked example and the BrowseComp-style questions:

- **Decompose into clues.** A BrowseComp question such as "identify the fictional character who breaks the fourth wall, has a backstory involving help from selfless ascetics, is known for humor, had a TV show between the 1960s and 1980s with fewer than 50 episodes" is five constraints. Search each constraint, or the rarest one first, rather than the whole sentence.
- **Start with the most selective clue.** "Fewer than 50 episodes" is hard to search; "selfless ascetics" backstory is distinctive. A rare term gives BM25 a high-IDF hook.
- **Pivot on candidates.** Once a candidate appears, switch to entity-specific verification queries ("Plastic Man episode count"). This is the step our Hands-on program shows.
- **Reformulate after failure.** Broaden (drop a constraint), narrow (add a year or site), or change vocabulary (synonyms, the field's jargon). L2's example uses an operator: `search_web("site:cmu.edu announced today")`.
- **Reflect on what the evidence actually shows.** L10's agent notices that benchmark wins are not human comparisons and searches for "evaluation protocol". Good reflection changes the question, not just the wording.
- **Know when to stop.** Stop when every part of the question has cited support, when a budget is hit, or when new searches return only already-seen documents.

**Browsing versus searching.** A search call returns snippets (titles, URLs, short excerpts); a **browse** or **visit** call fetches a full page. Pages are long, so agents usually have the page summarised with respect to the current goal before it enters the context. Beyond the lecture, Tongyi's `visit` tool follows this pattern (fetch, then extract goal-relevant content). L10's AgentIR ablation includes a "Tongyi-DR (visit)" setting in which the agent can open pages as well as search, and it reaches the highest accuracy (68.1%), which suggests that reading full pages still adds information beyond snippets.

**Context growth.** Every search result and page summary is appended to the context, so long research runs hit the context limit. L10 shows Tongyi DeepResearch's BrowseComp accuracy rising with the context budget: roughly 0% at 8K tokens, 4% at 16K, 21% at 32K, 39% at 64K and 43% at 128K (read from the plot). More context allows longer interaction histories. Tongyi's training trajectories are long (more than 10 tool calls in over 20% of SFT samples), and evaluation allows up to 128 tool calls per task. L3's remedies apply directly: compact older turns, keep the recent tail, externalise evidence to a store, and "retrieve source evidence" rather than trusting a summary, because repeated summarisation drifts (L3's example: "Use CUDA 12.4" becomes "Use recent CUDA" and then disappears).

**Parallel and multi-agent search.** L5 shows a procurement task with four independent vendor searches that, run in one thread, forced a context compaction from 128k to 14k tokens; when none fit, a fifth search had to be added (the plan graph changes). Beyond the lecture, Anthropic's multi-agent research system (June 2025) runs a lead agent that spawns parallel sub-agents, each searching with its own context. It reported that a Claude Opus 4 lead with Sonnet 4 sub-agents outperformed single-agent Opus 4 by 90.2% on its internal research eval, at roughly 15 times the tokens of a chat interaction.

*Common misconception:* "More searches are always better." L10 shows accuracy rising with the *budget* for interaction, but AgentIR also shows that a better retriever reaches higher accuracy with *fewer* searches. Search count is a cost, not a goal.

### 4. Tasks and benchmarks: from QA to deep research

L10 argues that classical QA benchmarks are inadequate and organises newer benchmarks by which gap they close. Its example is a Natural Questions item: "who wrote the score for the force awakens" → "John Williams", answered from one Wikipedia page. L10 flags four problems: it is a **simple lookup** (one search suffices, or the model remembers it), **general domain** (no expert knowledge), **short-form** (answer matching cannot assess multi-document synthesis) and **evidence use unclear** (a correct answer does not show the evidence was used).

| Gap | What is wrong with classical QA | Benchmarks in L10 that close it |
| --- | --- | --- |
| 1. Search complexity | A familiar fact may be recalled or found in one search | BrowseComp, BrowseComp-Plus |
| 2. Domain expertise | Broad web questions do not test expert knowledge | MedBrowseComp, FinSearchComp, ScholarSearch, AutoResearchBench |
| 3. Answer quality | Answer matching does not assess synthesis | ScholarQABench, ResearchQA (rubrics) |
| 4. Evidence support | Correct answers do not establish evidence use | DeepResearch Bench (FACT citation checks) |

**BrowseComp (OpenAI, 2025).** 1,266 human-written questions built backwards: start from a known answer (a person, event or artifact), hide its name, and combine factual clues into a question. Difficulty is verified: models with search should fail, five Google searches should not suffice, and a human should still be stuck after ten minutes (checked on a subset). The design principle is **hard to find, easy to verify**: the answer is short, so grading is simple, but finding it requires persistent, creative search. L10's results:

| System | BrowseComp accuracy (%) |
| --- | --- |
| GPT-4o | 0.6 |
| GPT-4.5 | 0.9 |
| GPT-4o + browsing | 1.9 |
| OpenAI o1 (medium) | 9.9 |
| Human reference match | 25.3 |
| OpenAI Deep Research (trained for BrowseComp-style tasks) | 51.5 |

Humans attempted 1,255 of the 1,266 questions. Two lessons: browsing alone barely helps a model that cannot search persistently (0.6 to 1.9), and a model trained for this style of task beats unaided humans by a wide margin.

**BrowseComp-Plus (ACL 2026).** Live web search makes results depend on the search engine, the date and page changes, so two agents evaluated a month apart are not comparable. BrowseComp-Plus freezes the corpus: for each BrowseComp question and answer, o3 gathers evidence pages; humans mark supporting spans, check every clue and mark answer documents; **hard negatives** (related pages that miss a clue) are added. The result is 830 questions over 100,195 documents. Now you can swap the retriever while holding the agent fixed. Beyond the lecture, its abstract reports Search-R1 with BM25 at 3.86% accuracy versus GPT-5 at 55.9%, rising to 70.1% when GPT-5 uses the Qwen3-Embedding-8B retriever, with fewer search calls.

**Domain benchmarks.** FinSearchComp (ICLR 2026) has experts write questions from work scenarios or verified financial tables, retrieve reliable data, calculate and cross-check answers, then have other experts solve and reconcile them (example: how did Johnson & Johnson's international share of revenue change year over year during 2022-2024?). MedBrowseComp (NeurIPS 2025 workshop) links trials, drugs and regulatory facts. ScholarSearch targets academic search; AutoResearchBench (2026) asks for one specific paper or all matching papers.

**Long-form benchmarks.** ScholarQABench (from OpenScholar) has 2,967 expert-written queries and 208 long-form expert answers across computer science, physics, neuroscience and biomedicine, scored with expert rubrics. ResearchQA (TACL 2026) scales this to 21K questions in 75 fields with 160K rubric items mined from survey papers. DeepResearch Bench (ICLR 2026) and DeepResearch Bench II (2026) score report quality and citation support. DR Tulu reports on ScholarQA-CSv2, HealthBench, ResearchQA and DeepResearch Bench.

*Common misconception:* "A high BrowseComp score means a good research assistant." BrowseComp measures persistence in finding one fact; it says nothing about writing a balanced, well-cited report. L10's grid exists precisely because each benchmark covers one gap.

### 5. Citation, attribution and faithfulness

A report is only as trustworthy as the link between each claim and its source. Four terms are often blurred, so fix them first:

- **Attribution**: a claim is *attributable* to a source if a reasonable reader of that source would agree the source says it. This is a relation between a claim and a specific document.
- **Citation accuracy (citation precision)**: of the citations given, the fraction that actually support the claim they are attached to.
- **Citation recall (coverage)**: of the claims that need support, the fraction that carry at least one supporting citation. Beyond the lecture, the ALCE benchmark (Gao et al., EMNLP 2023) formalised both and found that even the best models lacked complete citation support 50% of the time on ELI5.
- **Faithfulness** versus **factuality**: a faithful answer says only what its retrieved evidence says; a factual answer is true in the world. An answer can be faithful to a wrong source, or factual but unsupported by anything it cites.

**Hallucinated citations.** The worst failure is a citation to a paper that does not exist or does not say what is claimed. OpenScholar measured GPT-4 fabricating citations in 78-90% of cases when asked to cite recent literature, while OpenScholar (retrieving from 45 million open-access papers) reached citation accuracy on par with human experts. Retrieval does not remove the problem; it moves it. A retrieval-backed agent can still attach a real document to a claim the document does not support.

**DeepResearch Bench's FACT check.** L10 shows how DeepResearch Bench (ICLR 2026) checks support automatically in three steps: (1) extract each claim with its cited URL; (2) read the cited page; (3) judge whether the page supports the claim. In the slide's example, two claims both cite the OpenScholar paper:

| Claim | Cited page says | Verdict |
| --- | --- | --- |
| "OpenScholar was compared with human answers. \[1\]" | Expert comparisons on a sample of research questions | Supported |
| "OpenScholar matches experts in every field. \[1\]" | No test of every field | Not supported |

This gives **citation accuracy** = 1/2 = 50% and **effective citations** = 1 (the count of supported claim-citation pairs). The two metrics pull in different directions: accuracy rewards citing carefully, effective citations reward citing a lot of well-supported material. Report both, or an agent can game one by citing very little or very much.

**Over-generalisation is the subtle failure.** The unsupported claim above cites a real, relevant paper. Its error is a quantifier: "every field" where the source tested a sample. L10 makes the same point in evaluation: a "similar, but incorrect" summary ("Parity across domains is *proven*") differs from a correct one by one word. Checkers that look only for topical overlap between claim and page will pass it.

**Claim decomposition.** Beyond the lecture, FActScore (Min et al., 2023) splits long text into **atomic facts** (one checkable proposition each) and checks each against a knowledge source, reporting the fraction supported. Atomic decomposition is what makes citation checking tractable: a sentence with three facts and one citation can be one-third supported.

**Designing for attribution.** Practical rules that follow: have the agent quote or point to the exact span it relies on; keep document IDs through every compaction step so citations survive summarisation (L3's "copy anchors exactly"); run a verification pass before the final answer that checks each claim against its cited span; and prefer hedged claims ("on the tested questions") when evidence is partial.

*Common misconception:* "If every sentence has a citation, the report is attributed." Citation *presence* is easy; citation *support* is what matters, and FACT-style checks routinely find supported-looking citations that fail.

### 6. Evaluating long-form answers: rubrics and LLM judges

Short answers can be matched to a reference. Long-form answers cannot, and L10 explains why with its running question. One valid reference summary says "Experts preferred OpenScholar in one study. Parity across domains is unproven." Another valid summary says the same in different words. A third, "similar, but incorrect," says parity "is proven". So there are **several valid answers**, and **similarity to gold is not enough**.

**Similarity metrics misrank answers.** L10 cites Xu et al. (ACL 2023): on 109 expert pairwise comparisons with reference answers, the preference accuracy of automatic similarity metrics was barely above the 50% chance level.

| Metric | Agreement with expert preference (%) |
| --- | --- |
| Chance | 50 |
| BERTScore | 57 |
| ROUGE | 58 |
| BLEURT | 62 |

**Rubrics.** A **rubric** is a list of criteria, each with a weight, that a good answer should satisfy. ScholarQABench checks each rubric item against the answer and combines them as a weighted average. L10's example has two items: "Reports a direct comparison with human experts" (weight 2) and "Qualifies the conclusion by task and domain" (weight 1). The candidate answer "OpenScholar wins 70% of expert comparisons \[1\]. This holds across all fields." meets the first item but fails the second, so the score is (2 × 1 + 1 × 0) / 3 = 0.67. Rubrics turn an open-ended judgment into a set of small, checkable ones, and they make the grader's intent explicit.

**LLM judges.** Someone must check each item. An **LLM judge** is a language model prompted with the rubric item, the answer (and sometimes the evidence) that outputs a verdict. On OpenScholar's rubric items, L10 reports expert-LM agreement of 79% against expert-expert agreement of 80% (12 questions, 2 systems, 2 expert raters per answer). In other words, the judge disagrees with an expert about as often as two experts disagree with each other. L7 reports similar judge validation for the live web: WebVoyager's judge agreed with humans 85.3% of the time and Online-Mind2Web's WebJudge 85.7%, with the warning that "judge quality becomes part of the score." L4 adds that, for memory induction, performance depends on judge accuracy but improves across a wide range of judge qualities.

**Scaling rubrics with LMs.** Expert rubrics are expensive. ResearchQA mines questions from survey papers and uses LMs to generate up to 8 rubric items per question, reaching 21K questions in 75 fields with 160K rubric items. Each item is scored on a coverage scale (for example 0/4 "not at all covered" to 4/4 "completely covered").

**Rubrics can encode the wrong target.** An expert audit of ResearchQA found that 15% of parametric rubric items (items the LM wrote from memory) were vacuous, erroneous or unclear. L10 lists three ways a rubric goes wrong: a criterion cites a nonexistent paper; a criterion merely restates the question; a vague criterion lets plausible errors pass. The remedy: **evaluate the rubric before using it to evaluate an answer**. Ground criteria in sources, then audit relevance and verifiability. DeepResearch Bench II builds rubrics from expert-written reports with manual revision and expert review.

**Judge biases.** Beyond the lecture, well-documented LLM-judge biases include preferring longer answers, preferring the first (or second) of two options regardless of content, preferring outputs from the same model family, and being swayed by confident tone or by many citations. Mitigations: judge one criterion at a time, randomise order in pairwise comparisons, cap or normalise length, give the judge the cited evidence, and periodically re-measure agreement with humans on a fresh sample.

| Method | What it checks | Cost | Main weakness |
| --- | --- | --- | --- |
| Exact match / F1 | Short answer equals reference | Negligible | Useless for reports |
| ROUGE, BERTScore, BLEURT | Similarity to a gold text | Low | Near-chance agreement with experts (57-62%) |
| Expert-written rubric + LLM judge | Coverage of expert criteria | Medium | Expensive to write; judge noise |
| LM-generated rubric + LLM judge | Coverage of mined criteria | Low per item | 15% bad items without audit |
| Citation support (FACT) | Each claim backed by its source | Medium | Page fetching; judge errors on subtle quantifiers |
| Human expert review | Everything | Very high | Slow, disagreement (\~80% agreement) |

*Common misconception:* "An LLM judge with 79% agreement is 21% wrong." Agreement must be read against the human ceiling. Experts agree with each other only 80% of the time on the same items, so the judge is near the ceiling; the remaining disagreement is partly genuine ambiguity in the task.

### 7. Training deep research agents: data, mid-training, SFT and RL

Prompting a general model with search tools gets you a working agent; training gets you a good and cheap one. L10 presents a three-stage recipe from the Tongyi DeepResearch technical report (Alibaba, 2025), summarised as "learn from teacher demonstrations, then from your own attempts":

| Stage | Goal | Training data | Objective |
| --- | --- | --- | --- |
| Agentic mid-training | Learn agent behaviour at scale | Inputs + answers, teacher trajectories, general pretraining data | Next-token prediction (continual pretraining) |
| Supervised fine-tuning (SFT) | Imitate successful demonstrations | Filtered teacher trajectories | Cross-entropy on the trajectory tokens |
| Reinforcement learning (RL) | Learn from feedback on its own attempts | The policy's own rollouts + a reward | Policy gradient (GRPO) |

Beyond the lecture, the released Tongyi DeepResearch model is a 30.5B-parameter mixture-of-experts with 3.3B parameters active per token and a 128K context. Its public release reported 32.9 on Humanity's Last Exam, 43.4 on BrowseComp, 46.7 on BrowseComp-ZH and 75.0 on xbench-DeepSearch.

**Where do tasks come from? Knowledge-graph synthesis.** RL and SFT need thousands of hard questions with known answers, far more than humans can write. L10 shows the WebSailor-V2 method (ICLR 2026). A **knowledge graph** stores facts as nodes (entities) and labeled edges (relations), for example Allen Newell → faculty member of → Carnegie Mellon. The recipe: start from sourced facts; sample a connected subgraph around a target; hide the target's name; turn its relations into clues. From the facts "Newell: CMU faculty", "Newell and Simon coauthored *Human Problem Solving* (1972)", "Newell and Simon shared the 1975 Turing Award" and "Simon won the 1978 economics Nobel", you get: "Which CMU researcher coauthored a book on human problem solving with a future economics Nobel laureate, and shared the Turing Award with that colleague three years before the Nobel Prize?" Known answer: Allen Newell. Because the answer is known by construction, the question is automatically verifiable; because answering requires chaining several relations, it is automatically multi-hop. This is BrowseComp's "start with the answer" trick, industrialised.

**SFT: collect, filter, imitate.** L10 cites WebDancer (NeurIPS 2025) and Tongyi. A strong teacher model runs on the synthetic questions and produces trajectories. Keep only those with a correct answer, a valid format (well-formed tool calls and tags) and a coherent trajectory; discard incorrect answers and invalid formats. Then train with SFT. This is **rejection sampling** (L8's "distillation from a stronger model" with a correctness filter). The filter matters because imitation copies everything, including bad habits.

**Agentic mid-training.** "Scaling Agents via Continual Pre-training" (ICLR 2026) adds a stage before SFT: continue next-token pretraining on a mix of general data and agent trajectories, producing an "agent-ready" base model called AgentFounder. L10's controlled comparison uses the same downstream SFT data on two bases:

| Benchmark (Pass@1 %) | Qwen3 base + SFT | AgentFounder base + SFT |
| --- | --- | --- |
| BrowseComp-en | 28.6 | 39.9 |
| BrowseComp-zh | 35.6 | 43.3 |
| GAIA | 71.8 | 72.8 |

The gains are largest where the task demands long, search-heavy behaviour (+11.3 points on BrowseComp-en) and smallest on GAIA, a general assistant benchmark.

**RL with verifiable rewards (RLVR).** SFT can only reach the teacher's level. RL lets the model improve from its own attempts. L10 illustrates with Search-R1 (COLM 2025): sample several search trajectories y1, y2, y3 for question x; verify each final answer against the known answer with exact match, r\_i = EM(a\_i, a\_gold); here the answers "Herbert Simon", "Allen Newell", "Allen Newell" get rewards 0, 1, 1; update the policy.

**GRPO.** The update is **Group Relative Policy Optimization** (DeepSeekMath, 2024; covered in L9). Compare each attempt with its group: attempts above the group's average reward get their probability raised, those below get it lowered. With rewards 0, 1, 1 the mean is 0.67, so the Simon attempt has a negative advantage and both Newell attempts positive ones. The objective adds a **clipped** probability ratio to limit the size of each update and a **KL penalty** to stay near a reference model. The full formula is in Mechanics. L11's warning applies: if every attempt in a group gets the same reward (all 0 or all 1), all advantages are zero and the group teaches nothing, so curate task difficulty.

**Asynchronous rollouts.** Agent rollouts vary wildly in length: one finishes after two tool calls, another after forty. Waiting for the slowest wastes GPUs. Tongyi and DR Tulu score each trajectory when it completes and assemble a batch from completed trajectories for the policy update. L10 lists further engineering: cached tool results, robust API handling, and background task curation. L11 explains the catch: a rollout may finish after the learner has moved on, making it **stale** (generated by an older policy), which needs importance-weight corrections.

**Evidence it works.** Tongyi's RL curves in L10 show the smoothed training reward rising from about 0.50 to about 0.60 over 500 steps while the entropy loss stays roughly flat (no collapse into a single deterministic behaviour). L10 notes honestly that the report does not isolate each stage's contribution.

*Common misconception:* "RL teaches the model to search." Mostly, SFT teaches the format and basic habits, and RL sharpens when and how to search. DR Tulu's warm-start ablation (next subsection) shows RL from a model without SFT stays far behind.

### 8. Rewarding long-form research: DR Tulu and evolving rubrics (RLER)

RLVR needs a checkable answer. For a literature synthesis there is no single correct string: L10 contrasts the verifiable short answer ("Allen Newell": answer correctness) with open-ended synthesis, where the reward should measure **coverage, relevance, factuality and supported claims (citations)**. Most open DR agents at the time were trained with RLVR on short-form QA, which the DR Tulu paper argues "does not extend to realistic long-form tasks."

**Rubric rewards.** DR Tulu (Shao, Asai et al., ICML 2026) scores each sampled report y\_i with a weighted rubric: r\_i = Σ\_k w\_k Judge(c\_k, y\_i) / Σ\_k w\_k, where c\_k are criteria, w\_k their weights, and Judge is an LLM that says how well y\_i meets c\_k. This is ScholarQABench's evaluation formula used as a training reward. The slide notes auxiliary rewards (such as format and citation terms) are omitted from the diagram.

**Why static rubrics are not enough.** A rubric written before training can only reward what its author anticipated. As the policy searches, it discovers facts the rubric never mentions, and it can learn to satisfy vague criteria with plausible-sounding text (a form of reward hacking, L11). The fix is **Reinforcement Learning with Evolving Rubrics (RLER)**: rubrics co-evolve with the policy.

**How rubrics evolve (L10's IBD example).** The query: "Describe how genetically engineering T cells could be used as an anti-inflammatory therapy for IBD by changing cytokine signaling between T cells and macrophages."

1. **Persistent rubrics** are generated once, *with search*, before training, e.g. "Cites 'IL-10-engineered T cells reduced colitis severity'" and "States 'engineering T cells to overexpress IL-10 suppresses macrophage TNF-α'".
2. The policy at step t produces rollouts using web browsing, scholar search and Google search. One says T cells suppress macrophage TNF-α via STAT3 activation; one says systemic IL-6 did not increase and no cytokine-release syndrome was observed; one wrongly claims an anti-inflammatory signal increases a pro-inflammatory one.
3. **Rubrics are generated by contrasting rollouts**: a positive rubric ("The response states that systemic IL-6 did not increase...") rewards newly found, correct information; a negative rubric ("The response contains wrong claims that an anti-inflammatory cytokine upregulates...") penalises an error the policy has started to make.
4. New rubrics go into a **rubric buffer** alongside the persistent ones; the buffer also informs later rubric generation.
5. **Rubric-based scoring** S(x, y) = Σ\_k w\_k Judge(r\_k, y) gives the reward, and GRPO updates π\_θt to π\_θt+1.

The rubrics thus become more discriminative exactly where the current policy's outputs differ, which is where a learning signal is most useful.

**Results reported in L10.** Averaged over HealthBench, ScholarQABench v2 and DeepResearch Bench, over 2,500 RL steps (values read from the slide's plot):

| Reward | Score at step 0 | Score at 2,500 steps |
| --- | --- | --- |
| No RL | about 50 | about 50 |
| Random rewards | about 50 | about 51 |
| Initial (persistent) rubrics only | about 50 | about 59.5 |
| Evolving rubrics (RLER) | about 50 | about 61 |

Random rewards give almost nothing, which rules out "any RL helps"; evolving rubrics beat static ones at every checkpoint after 500 steps.

**SFT as a warm start.** Starting RL from the full SFT mixture begins near 50% and climbs to about 62% by 4,000 steps; with no SFT, RL starts near 27% and reaches only about 38% by 600 steps. L10's takeaway: "Even 5% SFT helps. The full SFT mixture gives the strongest RL results."

**Cost and quality.** DR Tulu-8B sits on the cost-performance Pareto frontier. Per its abstract, it beats Tongyi DR by 15.6% on average across four long-form benchmarks, exceeds OpenAI Deep Research by 0.7% on average, and is about 1000× cheaper per query than OpenAI DR. On L10's plot DR Tulu costs roughly $0.002 per ScholarQA-CSv2 query, against roughly $1-2 for OpenAI DR and Ai2 ScholarQA (Claude Sonnet).

*Common misconception:* "Rubric rewards are just LLM-as-judge rewards." The judge is the same kind of component, but what it judges against changes: RLER's criteria are grounded in retrieved evidence and in the policy's own current mistakes, not fixed in advance.

### 9. Reasoning-aware retrieval: AgentIR and DR-Synth

Retrievers were built for humans typing short queries. L10's final part argues that agents are now a major consumer of retrieval, and that they are different users: before every search call, a DR agent writes out its reasoning, which states exactly what it needs and why. The AgentIR abstract puts it plainly: agents "generate explicit natural language reasoning before each search call, revealing rich intent and contextual information that existing retrievers entirely ignore."

**The problem: the retriever sees only the query.** L10's diagram shows the agent's context holding the original task, previous reasoning, previous queries, previous evidence and the current reasoning τ\_t. Only the latest query q\_t goes to the retriever. A query like "Turing Award 1975" loses the fact that the agent is trying to confirm that the co-recipient taught at CMU. An analogy: a librarian who hears "books on 1975" will do worse than one who also hears "I'm checking whether this person was at Carnegie Mellon."

**AgentIR's two ideas.**

1. **Reasoning-aware input**: embed the current reasoning together with the query, E\_q(τ\_t ⊕ q\_t), where ⊕ is concatenation.
2. **Training for this input**: learn which documents help *this reasoning step*, using data from DR-Synth.

**Why training data is the hard part.** Standard retriever training has known relevance labels for a global question (positive d+, negatives d−). In a DR trajectory, an intermediate search ("Newell CMU faculty") may be one of many steps toward the global answer, and nobody has labelled which documents help at that turn.

**DR-Synth: labels for intermediate searches.** From standard QA datasets with known answers and gold documents, DR-Synth creates turn-level labels:

1. Run an agent; at turn t take its query q\_t and the retriever's results O\_t (50 documents in the slide).
2. Add the **global gold** documents P for the question to the pool (the slide shows Global Gold 1-5 plus 45 retrieved docs).
3. **Listwise rerank** the pool with an LLM that sees the global query Q and the global answer A.
4. Label the top-ranked documents positive and the bottom-ranked ones negative.
5. Train the reasoning-aware embedding model contrastively on (τ\_t, q\_t, positives, negatives).

The reranker is a teacher with privileged information (it knows the final answer), so it can tell which documents would help at this turn even when the agent cannot.

**Results on BrowseComp-Plus (L10).** Changing only the retriever while keeping each agent fixed:

| Retriever | Accuracy (approx.) | Search calls per question (approx.) |
| --- | --- | --- |
| BM25 | 33-36% | 31-42 |
| Qwen3-Embed-8B | about 50% | 29-35 |
| AgentIR-4B | 65-67% | 24-30 |

The AgentIR abstract summarises: 68% with Tongyi-DeepResearch, versus 50% for conventional embedding models twice its size and 37% for BM25. A better retriever gives *higher accuracy with fewer searches*, because the agent finds what it needs sooner and stops.

**Ablation: input or training?** Accuracy (%) on BrowseComp-Plus:

| Agent | Query only | + Reasoning | + DR-Synth | Both (AgentIR) |
| --- | --- | --- | --- | --- |
| Tongyi-DR | 48.7 | 55.5 | 59.4 | 66.3 |
| gpt-oss-120B | 47.6 | 51.3 | 59.2 | 67.0 |
| GLM-4.7 | 50.5 | 50.9 | 57.5 | 64.7 |
| Tongyi-DR (visit) | 50.2 | 54.0 | 59.5 | 68.1 |

Both components help independently, DR-Synth training more than the input change alone. The combination is best: 7-9 points above DR-Synth alone and 11-16 points above reasoning-aware input alone.

**Which history helps?** With every retriever trained on DR-Synth, only the input varies:

| Agent | Query only | Prior queries | Queries + reasoning | Queries + reasoning + docs | Current reasoning (AgentIR) |
| --- | --- | --- | --- | --- | --- |
| Tongyi-DR | 59.4 | 63.1 | 63.1 | 60.0 | 66.3 |
| gpt-oss-120B | 59.2 | 61.9 | 64.3 | 58.7 | 67.0 |
| GLM-4.7 | 57.5 | 59.1 | 60.8 | 58.7 | 64.7 |
| Tongyi-DR (visit) | 59.5 | 63.0 | 66.3 | 61.5 | 68.1 |

Two surprises. Adding previously retrieved documents *hurts* (it dilutes the embedding with old content). And the current reasoning alone beats the full history: the agent's latest thought already summarises what matters now. This echoes L4's finding that over-retrieval of memories can degrade performance.

*Common misconception:* "Retrieval is a solved component; improve the LLM instead." Here a 4B retriever change moved a fixed agent from 48.7% to 66.3%, a larger jump than many model upgrades.

### 10. Cost, latency and the budget view

A DR agent spends three resources: **tokens** (money), **wall-clock time** (latency) and **tool calls** (API fees, rate limits). L2's rule applies at every step: call a tool only when its benefit outweighs latency, cost, failure and risk.

**Where the tokens go.** In a ReAct loop without caching, each model call re-sends the whole history, so input tokens grow quadratically with the number of turns (derived in Mechanics). A 30-turn run that adds 1,500 tokens per turn to a 2,000-token prompt reads about 712,500 input tokens in total, though the final context is only 47,000 tokens. Prompt caching, compaction (L3) and summarising pages before they enter the context attack this directly.

**Reported numbers.** Beyond the lecture, Anthropic reported that agents use about 4 times the tokens of chat and multi-agent systems about 15 times, and that on BrowseComp token usage alone explained 80% of performance variance, with tool-call count and model choice explaining most of the rest (95% together). Upgrading the model helped more than doubling the token budget. In L10, DR Tulu-8B's cost of roughly $0.002 per query versus roughly $1-2 for proprietary DR systems shows that a small trained model can move the cost frontier by three orders of magnitude.

**Latency.** Sequential tool calls dominate wall-clock time: each turn waits for generation and for the search API. Parallel calls (several queries per turn, or sub-agents, L5) cut latency but raise token cost and risk duplicate work. Asynchronous rollouts (Section 7) are the training-time version of the same idea.

**Better retrieval is a cost lever.** AgentIR shows the underrated point: raising retrieval quality cut search calls from about 31-42 (BM25) to 24-30 while raising accuracy. Each saved call also saves its tokens in every later turn.

| Lever | Effect on accuracy | Effect on cost / latency |
| --- | --- | --- |
| Larger context budget (Tongyi 8K to 128K) | Up (0% to 43% on BrowseComp) | Up |
| Better retriever (BM25 to AgentIR-4B) | Up (about 35% to 66%) | Down (fewer searches) |
| Smaller trained model (DR Tulu-8B) | Matches proprietary on long-form | Down about 1000x |
| Multi-agent fan-out | Up (reported +90%) | Tokens up about 15x vs chat; latency down |
| Page summarisation before context | Neutral to up | Down |

*Common misconception:* "Cost is an inference problem to solve later." Cost shapes design from the start: the retriever, the context policy and the stopping rule decide it far more than the per-token price.

## Across the lectures

Deep research is taught head-on only in L10, but nearly every other lecture supplies one of its parts: the loop, the tools, the context policy, the plan, the judge or the training algorithm.

**L1 (agents).** L1 defines the agent as a loop over an environment whose observations include "webpages and tool results", and it names retrieval as one of the memory mechanisms (history, summary, memory retrieval). It also sets the norm that the course expects of a DR agent's output: "You are responsible for every submitted claim, citation, result, and line of code." A DR agent is the automated version of that responsibility.

**L2 (tool use).** L2 treats search as the canonical tool for "current information" with the benefit "fresh evidence", distinguishes it from a browser that "changes the environment", and shows `search_web(query)` with a site operator. Its governing rule, call tools only when their benefit outweighs latency, cost, failure and risk, is the cost argument of Core concepts Section 10 in one sentence. L2 also covers MCP and tool schemas, which is how search and browse tools are exposed to a DR agent in practice.

**L3 (long context).** L3 supplies the context-management toolkit a long research run needs: compaction triggered at a token threshold, protecting the beginning and the recent tail, externalising evidence to a store (MemGPT-style), and keeping a searchable history. Its warning about repeated compaction drift (constraints blurring over successive summaries) is exactly how citations and qualifiers get lost in DR summaries. L10's context-scaling plot for Tongyi (0% at 8K to 43% at 128K on BrowseComp) is the quantitative reason L3's techniques matter here.

**L4 (memory and skills).** L4 retrieves past experiences with text embeddings, the same dual-encoder machinery as DPR. Its two cautions carry over: retrieving more experiences can make performance *worse* (ReasoningBank, and SkillsBench for human-curated skills), and judge accuracy matters but learning survives a range of judge quality. L10's AgentIR ablation, where adding previously retrieved documents to the retriever input hurts accuracy, is the same over-retrieval effect in another place.

**L5 (planning).** L5's procurement example is a small research task: four independent vendor searches, a compatibility check on a wiki, a plan that must grow a fifth search when none fits, and an irreversible final step. Running the searches in one thread forced a 128k-to-14k compaction. L5's remedies, plan modes, sub-agent delegation (`launch_subagent(goal)`) and parallel workers, are the architectural alternative to L10's single-model loop. L10 does not discuss multi-agent designs; L5 and industry systems (Anthropic's orchestrator with parallel sub-agents) fill that gap.

**L6 (coding agents).** Coding agents also search, with `rg`, `find` and repository localization ("retrieve the relevant neighborhood, then check it with execution"). L6 contributes the contrast that clarifies DR evaluation: code can be verified by running tests, while a research report cannot, which is why L10 needs rubrics and citation checks instead.

**L7 (computer use).** L7 covers browsing as GUI interaction and its benchmarks (WebArena, Mind2Web, WebVoyager, Online-Mind2Web). Two lessons transfer to DR. First, live-web benchmarks drift, which is why L10 values BrowseComp-Plus's frozen corpus. Second, judges must be validated: WebVoyager's judge agrees with humans 85.3% of the time and WebJudge 85.7%, comparable to L10's 79% expert-LM versus 80% expert-expert on rubric items. L7 also shows rubric-based and trajectory-aware judges for long-horizon web tasks, the same idea as ScholarQABench's rubric scoring.

**L8 (SFT).** L8 explains how trajectories become training data: chat templates, balancing by tokens rather than trajectory count, and distillation from a stronger model. L10's SFT stage (collect teacher trajectories, filter for correct answer, valid format and coherence, imitate) is a direct application, and DR Tulu's warm-start result (even 5% SFT helps RL) connects the two lectures.

**L9 (RL basics).** L9 derives policy gradients, baselines and group-relative advantages, ending at GRPO. L10 uses GRPO unchanged for both Search-R1-style exact-match rewards and DR Tulu's rubric rewards; the only thing that changes is how the reward r\_i is computed.

**L10 (deep research agents).** The main lecture has four parts: tasks (one search versus many), evaluation (four gaps in classical QA and a benchmark for each; rubrics, judges and citation checks, and auditing the rubrics themselves), modeling (Tongyi's mid-training, SFT and RL; knowledge-graph task synthesis; DR Tulu's RLER) and retrieval (dense retrieval basics; AgentIR and DR-Synth). Its closing summary: deep research combines many searches with evidence synthesis; assess answer quality and citation support and audit the rubrics too; learn from demonstrations then improve through task feedback; give retrievers the agent's information need and train for it.

**L11 (advanced RL).** L11 supplies the systems and reliability layer beneath L10's training slides: asynchronous rollouts and the staleness they cause, importance weighting, uninformative groups where every attempt gets the same reward, and false positives that enable reward hacking. For DR, the analogues are groups where every search attempt fails (no signal), and rubric or judge rewards that a policy can satisfy with plausible but unsupported text, which is the failure RLER's evolving, evidence-grounded rubrics are designed to resist.

**Where the lectures differ in emphasis.**

- *More search versus better search.* L10's Tongyi slide says more room to search improves accuracy, while its AgentIR slides show better retrieval reaching higher accuracy with fewer searches. Both hold: budget raises the ceiling, retrieval quality determines how efficiently you approach it.
- *One model versus many.* L10 trains a single policy end to end; L5 argues for decomposition and sub-agents when subtasks are separable. For wide, parallel research, delegation wins on latency; for tightly chained multi-hop questions, one context avoids hand-off losses.
- *Verifiable versus judged rewards.* L11 and L6 prefer verifiers (tests) and warn about false positives; L10 accepts judged rubric rewards because long-form research has no verifier, and mitigates their weaknesses by grounding and evolving the rubrics.
- *Realism versus reproducibility.* L7 favours live websites for realism; L10 values a frozen corpus for controlled comparison. Use both: frozen for ablations, live for final validation.

## Mechanics

This section gives the exact procedures and equations behind the concepts: the agent loop and its trajectory format, the three retrieval scores, the evaluation metrics, the GRPO objective with rubric rewards, RLER and DR-Synth as algorithms, and a cost model.

### The inference loop and trajectory format

The harness alternates model generation and tool execution until an answer tag or a budget stops it.

```python
def deep_research(question, policy, tools, max_calls=128, max_tokens=128_000):
    context = [{"role": "user", "content": question}]
    for call in range(max_calls):
        out = policy(context)                  # emits <think>..</think> then <tool>..</tool> or <answer>..</answer>
        context.append({"role": "assistant", "content": out})
        if "<answer>" in out:
            return extract_answer(out), context
        name, args = parse_tool_call(out)      # e.g. ("search", {"query": "..."})
        result = tools[name](**args)           # search -> snippets; browse -> goal-focused page summary
        context.append({"role": "tool", "content": result})
        if count_tokens(context) > 0.8 * max_tokens:
            context = compact(context)          # L3: keep task, anchors, recent tail, evidence IDs
    return force_answer(policy, context), context  # budget exhausted: answer with what you have
```

A stored trajectory, as used for SFT filtering and RL scoring, keeps each step typed so that filters can check format and judges can find citations:

```json
{
  "question": "Which CMU researcher coauthored Human Problem Solving and shared the 1975 Turing Award?",
  "gold_answer": "Allen Newell",
  "steps": [
    {"type": "think",  "text": "Find the book's coauthors first."},
    {"type": "tool",   "name": "search", "args": {"query": "Human Problem Solving 1972 coauthors"}},
    {"type": "obs",    "docs": [{"id": "d3", "url": "https://example.org/hps", "snippet": "...by Allen Newell and Herbert Simon"}]},
    {"type": "think",  "text": "Check which coauthor was CMU faculty and won the Turing Award."},
    {"type": "answer", "text": "Allen Newell [d3][d4]", "citations": {"c1": ["d3"], "c2": ["d4"]}}
  ],
  "n_tool_calls": 2,
  "reward": 1.0
}
```

The SFT filter of L10 is three predicates on this record: `answer == gold_answer`, every `tool` step parses against the tool schema, and the trajectory is coherent (for example, no answer that ignores all observations).

### BM25

$$
\mathrm{BM25}(q,d)=\sum_{t\in q}\mathrm{IDF}(t)\cdot\frac{f(t,d)\,(k_1+1)}{f(t,d)+k_1\left(1-b+b\,\frac{|d|}{\mathrm{avgdl}}\right)},\qquad \mathrm{IDF}(t)=\ln\!\left(1+\frac{N-n_t+0.5}{n_t+0.5}\right)
$$

Here q is the set of query terms, d a document, f(t,d) the count of term t in d, |d| the document length in tokens, avgdl the average length in the collection, N the number of documents, n\_t the number of documents containing t, k\_1 (usually 1.2-2.0) the saturation constant and b (usually 0.75) the length-normalisation strength.

*Why this shape.* The term-frequency factor equals 0 at f = 0, rises steeply at first, and approaches k\_1 + 1 as f grows: it **saturates**, so repeating a word cannot dominate the score. Setting b = 1 fully normalises by length (a long document needs proportionally more occurrences); b = 0 ignores length. IDF is large for rare terms and near zero for terms in almost every document.

*Worked example.* N = 1,000 documents, avgdl = 120, document length 100, k\_1 = 1.2, b = 0.75. The length factor is 1.2 × (0.25 + 0.75 × 100/120) = 1.05. For the query "Turing Award Newell":

| Term | n\_t | f(t,d) | IDF | TF factor f(k1+1)/(f+1.05) | Contribution |
| --- | --- | --- | --- | --- | --- |
| turing | 50 | 1 | 2.987 | 1.073 | 3.205 |
| award | 200 | 2 | 1.608 | 1.443 | 2.320 |
| newell | 5 | 1 | 5.204 | 1.073 | 5.585 |
| **Total** |  |  |  |  | **11.11** |

The rare name "newell" contributes half the score from a single occurrence, while "award" appears twice but is common. Scoring is cheap: an inverted index touches only documents containing at least one query term, so cost scales with the posting-list lengths, not with N.

### Dense retrieval and its contrastive loss

$$
s(q,d)=E_q(q)^{\top}E_d(d),\qquad \mathcal{L}(q)=-\log\frac{\exp s(q,d^{+})}{\exp s(q,d^{+})+\sum_{j=1}^{m}\exp s(q,d^{-}_{j})}
$$

E\_q and E\_d are the query and document encoders (vectors of dimension D, often normalised so s is a cosine similarity), d+ is a relevant passage, d-\_j are m negatives. The loss is cross-entropy for classifying the positive among m + 1 candidates.

*Derivation of the gradient.* Let p+ = exp s+ / Z be the softmax probability of the positive, with Z the denominator. Then ∂L/∂s+ = −(1 − p+) and ∂L/∂s-\_j = p-\_j. So the positive's score is pushed up in proportion to how much probability it is still missing, and each negative is pushed down in proportion to how much probability it steals. Easy negatives already have p-\_j near 0 and contribute almost no gradient, which is the formal reason **hard negatives** matter. With **in-batch negatives** (the other B − 1 positives in a batch of B queries), m = B − 1 comes free.

*Cost.* Encoding the corpus is a one-time O(N) forward passes. Exact search per query is O(N · D) multiply-adds (45M passages × 768 dimensions ≈ 3.5 × 10^10), which is why ANN indexes (HNSW, IVF-PQ) that visit only a small fraction of vectors are used.

**AgentIR** changes only the query side: the query vector is E\_q(τ\_t ⊕ q\_t), the encoding of the current reasoning τ\_t concatenated with the query q\_t, and the positives and negatives come from DR-Synth (below).

### Reciprocal rank fusion

$$
\mathrm{RRF}(d)=\sum_{r\in R}\frac{1}{k+\mathrm{rank}_r(d)}
$$

R is the set of ranked lists (for example BM25 and dense), rank\_r(d) the 1-based position of d in list r (documents absent from a list contribute nothing), and k a damping constant, conventionally 60. Worked example: BM25 ranks \[A, B, C\] and dense ranks \[C, A, D\]. Then A = 1/61 + 1/62 = 0.03252, C = 1/63 + 1/61 = 0.03227, B = 1/62 = 0.01613, D = 1/63 = 0.01587, giving the fused order A, C, B, D. Documents that appear high in *both* lists win; a document at rank 1 in one list only (score 0.0164) loses to one at ranks 2 and 3 in both (0.0320). RRF needs no score calibration, which is why it works across retrievers with incomparable score scales.

### Evaluation metrics

$$
S_c=\frac{\sum_i w_i\,b_i}{\sum_i w_i},\qquad \mathrm{CitAcc}=\frac{\left|\{(c,u)\in C:\ \mathrm{supp}(u,c)=1\}\right|}{|C|},\qquad \mathrm{EffCit}=\left|\{(c,u)\in C:\ \mathrm{supp}(u,c)=1\}\right|
$$

S\_c is the rubric score of a candidate answer; w\_i is the weight of rubric item i; b\_i ∈ {0, 1} (or a graded value in \[0, 1\], such as ResearchQA's 0/4 to 4/4 scale) is the judge's verdict that the answer meets item i. C is the set of (claim c, cited URL u) pairs extracted from a report, and supp(u, c) is 1 if the page at u supports c. CitAcc is DeepResearch Bench's citation accuracy and EffCit its effective-citation count. L10's examples: rubric (2 × 1 + 1 × 0)/3 = 0.67; citations 1 supported of 2, so CitAcc = 0.5 and EffCit = 1.

*Judge agreement.* To validate a judge, collect items that experts also labelled and compute raw agreement (the fraction of identical verdicts), then compare it with expert-expert agreement on the same items. Beyond the lecture, also report a chance-corrected statistic such as Cohen's kappa, κ = (p\_o − p\_e)/(1 − p\_e), where p\_o is observed agreement and p\_e the agreement expected by chance from each rater's label frequencies. Example: if both raters say "yes" to 80% of items, p\_e = 0.8² + 0.2² = 0.68, so 80% raw agreement gives only κ = (0.80 − 0.68)/0.32 ≈ 0.38. Raw agreement flatters raters on skewed label sets.

### GRPO with outcome or rubric rewards

$$
J(\theta)=\mathbb{E}\!\left[\frac{1}{G}\sum_{i=1}^{G}\frac{1}{|y_i|}\sum_{t\in\mathcal{M}(y_i)}\min\!\Big(\rho_{i,t}\hat A_i,\ \mathrm{clip}(\rho_{i,t},1-\epsilon,1+\epsilon)\hat A_i\Big)\right]-\beta\,D_{\mathrm{KL}}\!\left(\pi_\theta\,\|\,\pi_{\mathrm{ref}}\right),\quad \rho_{i,t}=\frac{\pi_\theta(y_{i,t}\mid x,y_{i,<t})}{\pi_{\mathrm{old}}(y_{i,t}\mid x,y_{i,<t})},\quad \hat A_i=\frac{r_i-\bar r}{\sigma_r}
$$

x is the question; y\_1..y\_G are G sampled trajectories; π\_θ is the policy being trained, π\_old the policy that sampled the trajectories and π\_ref a frozen reference model; ρ is the per-token probability ratio; ε (about 0.2) bounds how far one update can move the ratio; Â\_i is the group-relative advantage, with r̄ and σ\_r the mean and standard deviation of the G rewards; β weights the KL penalty. **M(y\_i)** is the set of *model-generated* tokens: tool outputs are part of the context but are **masked out** of the loss, because the policy did not choose them and should not be trained to predict web pages. L10's slide labels this "model tokens".

The reward r\_i is where the tasks differ: r\_i = EM(a\_i, a\_gold) for Search-R1-style short answers, and r\_i = Σ\_k w\_k Judge(c\_k, y\_i) / Σ\_k w\_k for DR Tulu's rubrics (plus auxiliary terms).

*Worked example with rubric rewards.* Four reports get rubric rewards 0.4, 0.7, 0.9, 0.4. Mean r̄ = 0.6; population standard deviation σ = √((0.04 + 0.01 + 0.09 + 0.04)/4) = √0.045 = 0.212. Advantages: −0.943, +0.471, +1.414, −0.943. Unlike 0/1 rewards, graded rewards rank all four attempts, so the best report gets a larger push than the merely good one. If all four had scored 0.6, every advantage would be 0 and the question would contribute no gradient (L11's uninformative group); evolving rubrics make this less likely by adding criteria that separate the current rollouts.

### RLER as an algorithm

```python
def rler_step(batch_questions, policy, buffer, judge, rubric_gen, G=8):
    trajectories, rewards = [], []
    for x in batch_questions:
        if x not in buffer:                                   # persistent rubrics, made once with search
            buffer[x] = {"persistent": rubric_gen(x, use_search=True), "evolving": []}
        ys = [policy.rollout(x) for _ in range(G)]           # asynchronous in practice
        new = rubric_gen(x, contrast=ys,                      # compare rollouts: positive rubrics for new correct
                         evidence=[y.retrieved for y in ys],  # findings, negative rubrics for shared errors
                         existing=buffer[x])
        buffer[x]["evolving"] = prune(buffer[x]["evolving"] + new)   # keep discriminative ones, cap size
        rubrics = buffer[x]["persistent"] + buffer[x]["evolving"]
        for y in ys:
            s = sum(r.w * judge(r.text, y.answer) for r in rubrics) / sum(r.w for r in rubrics)
            trajectories.append(y); rewards.append(s + aux_rewards(y))   # e.g. format, citation terms
    policy.grpo_update(trajectories, rewards, group_size=G)
```

*Cost.* Per question and step, RLER adds one rubric-generation call and G × K judge calls (K rubrics), on top of G full research rollouts. The `prune` step matters: without a cap, K grows every step and judge cost with it. The exact pruning criterion is a paper detail; a natural choice is to keep rubrics whose scores vary across rollouts (high variance means discriminative).

### DR-Synth as an algorithm

```python
def dr_synth(qa_dataset, agent, retriever, llm_rerank, n_pos=3, n_neg=10):
    examples = []
    for Q, A, gold_docs in qa_dataset:                 # standard QA with answers and gold passages
        for step in agent.run(Q).search_steps:        # each intermediate search turn t
            pool = retriever(step.query, k=50)         # O_t
            pool = dedupe(gold_docs + pool)            # add global golds P
            ranked = llm_rerank(pool, global_query=Q, global_answer=A, turn_query=step.query)
            examples.append({"input": step.reasoning + " " + step.query,   # tau_t (+) q_t
                             "positives": ranked[:n_pos], "negatives": ranked[-n_neg:]})
    return examples                                    # train E_q contrastively on these
```

The design choice to use the *bottom* of the reranked list as negatives gives hard negatives for free: they were retrieved for this query (so they look relevant) but ranked useless by a teacher that knows the answer.

### A cost model for a research run

Let P be the fixed prompt (system prompt, tools, question) in tokens, a the average tokens added per turn (reasoning, tool call and tool output) and T the number of turns. Without caching, turn t re-reads the prompt plus all previous turns:

$$
\text{Input tokens}=\sum_{t=1}^{T}\left(P+(t-1)\,a\right)=T\,P+\frac{a\,T(T-1)}{2}=O(T^2)
$$

Model call t reads the prompt plus the t − 1 completed turns (each turn's a tokens include the tool output that the next call reads). With P = 2,000, a = 1,500 and T = 30: 60,000 + 1,500 × 435 = 712,500 input tokens. The final context holds only P + T·a = 47,000 tokens, so over 90% of input spend is re-reading. **Prompt caching** bills repeated prefixes at a discount; **compaction** caps the (t − 1)a term at a constant, making cost linear in T; **page summarisation** reduces a. Latency is roughly T × (generation time + tool time) for sequential calls, and divides by the fan-out factor when independent queries run in parallel.

## Hands-on

Two worked examples: a runnable toy deep research agent that contrasts one-shot RAG with iterative search and checks its own citations, and a design walkthrough that budgets a real research agent.

### Example 1: one-shot RAG versus iterative deep research (runnable)

The program builds a tiny corpus about CMU AI pioneers and asks a BrowseComp-style question with three positive clues and one negative clue. It implements BM25, a dense-retriever stand-in, reciprocal rank fusion, a one-shot RAG baseline, an iterative agent (clue queries, then entity-specific verification queries), and a FACT-style citation check. `call_llm` is a **stub**: a deterministic rule that splits the question into clue queries stands in for the language model. The `embed` function is also a stand-in for a learned encoder: it maps synonyms to shared concepts so that "professor" matches "faculty". Standard library only; run with `python3 toy_deep_research.py`.

```python
"""Toy deep-research loop: hybrid retrieval (BM25 + dense stand-in + RRF),
iterative query formulation, cited answer, and a FACT-style citation check.
call_llm() is a STUB: a deterministic rule stands in for the language model."""
import math, re
from collections import Counter

CORPUS = {
    "d1": "Allen Newell was a faculty member at Carnegie Mellon University and an AI pioneer.",
    "d2": "Herbert Simon received the 1978 Nobel Memorial Prize in Economic Sciences.",
    "d3": "Human Problem Solving (1972) is a book coauthored by Allen Newell and Herbert Simon.",
    "d4": "The 1975 Turing Award was shared by Allen Newell and Herbert Simon.",
    "d5": "Raj Reddy, a Carnegie Mellon professor, shared the 1994 Turing Award.",
    "d6": "Herbert Simon was a Carnegie Mellon professor who studied bounded rationality.",
    "d7": "Carnegie Mellon campus buildings include the Gates Hillman Center.",
    "d8": "Problem solving courses at Carnegie Mellon teach students to write books.",
}
ENTITIES = ["Allen Newell", "Herbert Simon", "Raj Reddy"]
STOP = set("a an the of and at to was is by who which in for with but never won".split())
SYN = {"laureate": "prize", "nobel": "prize", "professor": "faculty", "cmu": "carnegie",
       "coauthored": "book", "wrote": "book", "shared": "award", "received": "award"}

def toks(text):
    return [w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOP]

def bm25_scores(query, k1=1.2, b=0.75):
    docs = {d: toks(t) for d, t in CORPUS.items()}
    N, avgdl = len(docs), sum(len(v) for v in docs.values()) / len(docs)
    df = Counter(w for v in docs.values() for w in set(v))
    out = {}
    for d, words in docs.items():
        tf, s = Counter(words), 0.0
        for q in set(toks(query)):
            if tf[q]:
                idf = math.log(1 + (N - df[q] + 0.5) / (df[q] + 0.5))
                s += idf * tf[q] * (k1 + 1) / (tf[q] + k1 * (1 - b + b * len(words) / avgdl))
        out[d] = s
    return out

def embed(text):  # stand-in for a learned encoder: synonym-normalised bag of concepts
    v = Counter(SYN.get(w, w) for w in toks(text))
    n = math.sqrt(sum(x * x for x in v.values())) or 1.0
    return {k: x / n for k, x in v.items()}

def dense_scores(query):
    q = embed(query)
    return {d: sum(q.get(k, 0) * x for k, x in embed(t).items()) for d, t in CORPUS.items()}

def rrf(*rankings, k=60):  # reciprocal rank fusion of several score dicts
    fused = Counter()
    for sc in rankings:
        for r, d in enumerate(sorted(sc, key=sc.get, reverse=True), 1):
            if sc[d] > 0:
                fused[d] += 1 / (k + r)
    return [d for d, _ in fused.most_common()]

LOG = {"searches": 0, "words_read": 0}
def search(query, top_k=2):
    LOG["searches"] += 1
    hits = rrf(bm25_scores(query), dense_scores(query))[:top_k]
    LOG["words_read"] += sum(len(CORPUS[d].split()) for d in hits)
    return hits

def call_llm(messages):  # STUB: splits the question into clue queries
    q = messages[-1]["content"]
    clauses = re.split(r",| and | but ", q.rstrip("?"))
    return [c.replace("Which person was", "").strip() for c in clauses if c.strip()]

def supports(doc_id, entity, clue):  # stand-in for an NLI / LLM support judge
    doc = embed(CORPUS[doc_id])
    need = [SYN.get(w, w) for w in toks(clue)]
    return entity in CORPUS[doc_id] and sum(w in doc for w in need) >= max(1, len(need) - 1)

def one_shot_rag(question):
    hits = search(question, top_k=3)
    counts = Counter(e for d in hits for e in ENTITIES if e in CORPUS[d])
    return counts.most_common(1)[0][0], hits

def deep_research(question):
    clues = call_llm([{"role": "user", "content": question}])
    negative = [c for c in clues if c.startswith("never")]
    positive = [c for c in clues if c not in negative]
    print("plan (clue queries):", positive, "| negative:", negative)
    evidence = {}                                     # (entity, clue) -> doc id
    for clue in positive:                             # round 1: one search per clue
        for d in search(clue):
            for e in ENTITIES:
                if supports(d, e, clue):
                    evidence.setdefault((e, clue), d)
    cands = sorted(ENTITIES, key=lambda e: -sum((e, c) in evidence for c in positive))
    print("  round-1 evidence per candidate:",
          {e: sum((e, c) in evidence for c in positive) for e in cands})
    answer = None
    for e in cands:                                   # round 2: entity-specific queries
        for clue in positive:
            if (e, clue) not in evidence:
                for d in search(f"{e} {clue}"):
                    if supports(d, e, clue):
                        evidence[(e, clue)] = d
        ok = all((e, c) in evidence for c in positive)
        bad = [c for c in negative for d in search(f"{e} {c[6:]}") if supports(d, e, c[6:])]
        print(f"  verify {e:14s} all clues cited={ok!s:5s} negative clue violated={bool(bad)}")
        if ok and not bad and answer is None:
            answer = e
    claims = [(f"{answer} {c}", evidence[(answer, c)]) for c in positive] if answer else []
    return answer, claims

def citation_accuracy(claims):
    ok = [supports(d, c.split(" ", 2)[0] + " " + c.split(" ", 2)[1], c.split(" ", 2)[2])
          for c, d in claims]
    return sum(ok), len(ok)

if __name__ == "__main__":
    Q = ("Which person was a Carnegie Mellon faculty member, coauthored a problem solving "
         "book, and shared the Turing Award, but never won a Nobel prize?")
    top = sorted(bm25_scores(Q).items(), key=lambda x: -x[1])[:3]
    print("BM25 top-3 for full question:", [(d, round(s, 2)) for d, s in top])
    ans, hits = one_shot_rag(Q)
    print(f"\n[one-shot RAG] answer={ans} cited={hits} searches={LOG['searches']}")
    naive = []  # writer cites, for each claim, the retrieved doc most similar to it
    for c in ["was a Carnegie Mellon faculty member", "coauthored a problem solving book",
              "shared the Turing Award"]:
        best = max(hits, key=lambda d: dense_scores(c)[d])
        naive.append((f"{ans} {c}", best))
    s, n = citation_accuracy(naive)
    print(f"  citation accuracy of its report: {s}/{n}  (claims cite {[d for _, d in naive]})")
    LOG.update(searches=0, words_read=0)
    print("\n[iterative deep research]")
    ans, claims = deep_research(Q)
    for c, d in claims:
        print(f"  claim: {c!r:55s} -> [{d}] {CORPUS[d][:48]}...")
    s, n = citation_accuracy(claims)
    print(f"answer={ans} citation accuracy={s}/{n} searches={LOG['searches']} "
          f"words read={LOG['words_read']}")
```

Real output:

```text
BM25 top-3 for full question: [('d3', 5.81), ('d5', 4.77), ('d1', 4.52)]

[one-shot RAG] answer=Herbert Simon cited=['d5', 'd3', 'd2'] searches=1
  citation accuracy of its report: 1/3  (claims cite ['d5', 'd3', 'd5'])

[iterative deep research]
plan (clue queries): ['a Carnegie Mellon faculty member', 'coauthored a problem solving book', 'shared the Turing Award'] | negative: ['never won a Nobel prize']
  round-1 evidence per candidate: {'Allen Newell': 3, 'Herbert Simon': 3, 'Raj Reddy': 1}
  verify Allen Newell   all clues cited=True  negative clue violated=False
  verify Herbert Simon  all clues cited=True  negative clue violated=True
  verify Raj Reddy      all clues cited=False negative clue violated=False
  claim: 'Allen Newell a Carnegie Mellon faculty member'         -> [d1] Allen Newell was a faculty member at Carnegie Me...
  claim: 'Allen Newell coauthored a problem solving book'        -> [d3] Human Problem Solving (1972) is a book coauthore...
  claim: 'Allen Newell shared the Turing Award'                  -> [d4] The 1975 Turing Award was shared by Allen Newell...
answer=Allen Newell citation accuracy=3/3 searches=8 words read=191
```

**What to notice**

- **One query, wrong answer.** Retrieval for the whole question returned the Reddy page, the book page and Simon's Nobel page. Simon is the most-mentioned entity, so one-shot RAG answers "Herbert Simon", exactly the candidate the negative clue rules out. The words "Nobel prize" in the question actively pulled in the disqualifying page as if it were supporting evidence.
- **Hallucinated citation without invention.** The one-shot report cites d5 (a real page about Raj Reddy) for "Simon was Carnegie Mellon faculty". Nothing was fabricated, yet the citation does not support the claim; citation accuracy is 1/3. This is the FACT failure from Core concepts Section 5.
- **Two rounds of query formulation.** Round 1 searches each clue; Newell and Simon both collect three pieces of evidence, so clue coverage alone cannot decide. Round 2 issues entity-specific queries, including "Herbert Simon won a Nobel prize", which finds d2 and eliminates Simon.
- **Verification costs searches.** The iterative agent used 8 searches and read 191 words against 1 search for RAG. It kept verifying Simon and Reddy even after Newell passed, which avoids confirmation bias but spends budget; a real agent would stop once one candidate passes and the others are ruled out, or verify in parallel.
- **The checker shares a blind spot with the agent.** The 3/3 score uses the same `supports` function the agent used to pick evidence, so it is partly guaranteed by construction. In practice, use an independent judge (a different model or an NLI model) for citation checks.
- **Try this:** delete d2 from the corpus and rerun. Both Newell and Simon now pass verification, yet the program still answers "Allen Newell" with 3/3 citations because it returns the first candidate that passes. The answer happens to be right, but the report hides a real ambiguity; extend `deep_research` to report every passing candidate and say the evidence cannot separate them.

### Example 2: designing and budgeting a research agent (design and numeric walkthrough)

**The task.** An engineer asks: "What do the current national bridge design specification and our state's supplement require for a given detail, and where do they differ? Cite clause numbers." This is a long-form, attributed task over a mostly fixed corpus (specification PDFs) plus occasional live-web checks for amendments.

**Step 1: choose the task type and output contract.** Long-form, not short-answer: the output is a comparison report. Contract: every requirement sentence carries a citation of the form \[document, clause, page\]; differences are stated explicitly; unanswered parts are flagged, not guessed.

**Step 2: choose the tools.**

| Tool | Why | Retrieval method |
| --- | --- | --- |
| `search_specs(query)` over chunked specification PDFs | Most evidence lives here; corpus is fixed and controllable | Hybrid: BM25 (clause numbers such as "5.4.2.6" are exact strings dense models blur) + dense embeddings (paraphrased requirements), fused with RRF, then a cross-encoder rerank of the top 50 |
| `open_clause(doc, clause)` | Read the full clause, not a snippet | Direct lookup by ID |
| `web_search(query)` | Only for amendments or errata newer than the corpus | Black-box API, restricted to official domains |

Following AgentIR, pass the agent's current reasoning together with the query to the dense retriever; this costs nothing extra in API calls and, in L10's results, raised accuracy by 4-7 points even without retriever retraining (for three of the four agent settings).

**Step 3: budget tokens.** Assume a prompt of P = 3,000 tokens, a = 2,000 tokens added per turn (reasoning, call, retrieved chunks), T = 20 sequential turns, 400 output tokens per turn plus a 3,000-token report. Use illustrative prices of $3 per million input tokens, $0.30 per million cached input tokens and $15 per million output tokens (placeholders, not any vendor's price list).

| Design | Input tokens | Output tokens | Cost per question |
| --- | --- | --- | --- |
| Sequential, no caching | 20 × 3,000 + 2,000 × 20 × 19 / 2 = 440,000 | 20 × 400 + 3,000 = 11,000 | $1.32 + $0.165 = **$1.49** |
| Sequential, history compacted at 20,000 tokens | 350,000 | 11,000 | **$1.22** |
| Sequential, prompt caching | 41,000 new + 399,000 cached | 11,000 | $0.123 + $0.120 + $0.165 = **$0.41** |
| Parallel: 3 queries per turn, 8 turns, a = 4,500 | 8 × 3,000 + 4,500 × 8 × 7 / 2 = 150,000 | 8 × 500 + 3,000 = 7,000 | $0.45 + $0.105 = **$0.56** (before caching) |

Caching removes most of the quadratic re-reading cost because 399,000 of the 440,000 input tokens are repeated prefixes. Parallel querying cuts cost too, because fewer turns means fewer re-reads of the growing history.

**Step 4: budget latency.** With 6 s of generation and 2 s of search per turn, 20 sequential turns take about 20 × 8 = 160 s. Eight turns of three parallel queries (search latency rises to about 2.5 s for the slowest of three) take about 8 × 8.5 = 68 s.

**Step 5: stopping rule.** Stop when every sub-question in the plan has at least one supporting clause, or after 20 turns, or when two consecutive searches return only already-seen chunks. On budget exhaustion, write the report with explicit gaps.

**Step 6: evaluation plan.** Start with about 20 real questions (Anthropic's advice for early evals). For each, write a 5-8 item rubric with weights, grounded in the actual clauses (L10: audit the rubric first). Score reports with an LLM judge per rubric item, run a FACT-style citation check on every \[clause\] citation, and have an engineer label 30 items to measure judge agreement against a second engineer.

**What to notice**

- The exact-string nature of clause IDs is a concrete reason to keep BM25 in the stack; "dense has replaced BM25" would fail here.
- Caching and fewer, wider turns matter more to cost than the per-token price; the model call count and history length drive the bill.
- The output contract (clause-level citations, explicit gaps) is what makes automatic citation checking possible later.
- Every number above is an assumption to replace with measurements from your own logs after the first 20 runs.

## Design patterns, pitfalls and checklist

Most deep research quality comes from a handful of recurring design decisions; this section names them, lists how they fail, and ends with a checklist.

### Named patterns

- **Plan-search-reflect loop (ReAct for research).** Think, search, read, reflect on whether the evidence answers *the* question, repeat. *Use when:* almost always; it is the default in L10. Add an explicit reflection prompt ("what does this evidence not yet establish?") to avoid drifting into easier questions.
- **Clue decomposition and candidate pivot.** Split a multi-constraint question into clue queries; once candidates appear, switch to entity-specific verification queries, including for negative constraints. *Use when:* BrowseComp-style short-answer tasks; see Hands-on Example 1.
- **Hybrid retrieve-then-rerank.** BM25 plus dense retrieval, fused with RRF, then a cross-encoder or LLM reranker over the top 50-100. *Use when:* you control the corpus; especially with IDs, codes, names or jargon.
- **Reasoning-aware query.** Send the agent's current reasoning with the query to the retriever (AgentIR). *Use when:* you own the dense retriever; best when also trained on turn-level labels (DR-Synth). Do not also append old retrieved documents: L10 shows that hurts.
- **Goal-conditioned browsing.** `visit(url, goal)` returns only goal-relevant extracts of a page, with the URL kept for citation. *Use when:* pages are long; controls the per-turn token growth a.
- **Evidence ledger.** Keep a structured store of (claim, source ID, quoted span) outside the context and cite from it; compaction may summarise reasoning but never the ledger. *Use when:* long runs that will be compacted (L3).
- **Orchestrator with parallel sub-agents.** A lead agent splits the question into independent sub-questions for sub-agents with their own contexts, then synthesises (L5; Anthropic's system). *Use when:* breadth-first questions with separable parts and a latency budget; avoid for tightly chained multi-hop questions.
- **Verify-before-answer pass.** A separate step (ideally a different model) checks each claim against its cited span and deletes or hedges unsupported ones. *Use when:* any report that someone will act on.
- **Rubric-first evaluation.** Write and audit rubrics (grounded in sources) before running evals; judge one criterion at a time; measure judge-human agreement. *Use when:* any long-form output (L10's ScholarQABench and ResearchQA lessons).
- **Hard-to-find, easy-to-verify data synthesis.** Build training or test questions backwards from known answers via knowledge-graph subgraphs (WebSailor-V2) so rewards are verifiable. *Use when:* you need many multi-hop questions for SFT, RLVR or regression tests.

### Failure modes, symptoms and fixes

| Failure mode | Symptom | Likely cause | Fix |
| --- | --- | --- | --- |
| Hallucinated citation | Cited page exists but does not say the claim (or does not exist) | Claim written from memory, citation attached afterwards; IDs lost in compaction | Cite from an evidence ledger with quoted spans; FACT-style check before answering |
| Over-generalisation | "Holds across all fields" from a single-sample study | Writer drops qualifiers; judge checks topic, not quantifiers | Rubric item for scope qualifiers; verification pass focused on quantifiers |
| Shallow search | Answer after 1-2 searches; misses constraints | Model under-trained for persistence; low budget; no reflection | Decompose clues; require each constraint to have evidence before answering; RL on multi-hop data |
| Endless search | Dozens of near-duplicate queries, no answer | No stopping rule; searching for a source that does not exist | Stop on budget or when searches return only seen documents; allow "not found" answers |
| Query drift | Later queries answer an easier, related question | Reflection absent; context overflow lost the original task | Keep the original task pinned in context; reflect against it each turn |
| Retrieval vocabulary mismatch | Relevant documents never retrieved | Pure BM25 on paraphrased needs, or pure dense on exact IDs | Hybrid retrieval; reasoning-aware queries |
| Context overflow and summary drift | Constraints disappear after compaction | Repeated lossy summaries (L3) | Copy anchors exactly; keep ledger outside context; retrieve source evidence |
| Low-quality sources | SEO pages or content farms cited over primary sources | Web ranking bias | Domain allow-lists; source-quality rubric item; prefer primary documents |
| Over-retrieval | Accuracy drops as more documents or memories are added | Irrelevant context dilutes attention (L4, AgentIR's "+docs" ablation) | Retrieve fewer, better documents; rerank; summarise to the goal |
| Judge or rubric hacking | Reward rises, human ratings do not | Vague or static rubrics; length bias in judge | Evolving, evidence-grounded rubrics (RLER); length control; periodic human audits |
| Benchmark drift | Scores change between runs with no code change | Live web changed | Frozen-corpus evaluation (BrowseComp-Plus) for ablations; date-stamp live runs |
| Duplicate sub-agent work | Several sub-agents return the same sources; tokens explode | Vague task descriptions from the orchestrator | Give each sub-agent a distinct objective, output format and boundaries |

### Builder's checklist

- [ ] The output contract is written: task type (short answer or report), citation format, and how gaps are reported.
- [ ] Retrieval is hybrid (BM25 + dense) with a reranker, or you have measured that one retriever alone is enough on your data.
- [ ] The retriever receives the agent's current reasoning, not only the latest short query.
- [ ] Pages are summarised with respect to the current goal before entering context, and source URLs or IDs are preserved.
- [ ] An evidence ledger (claim, source ID, quoted span) lives outside the context and survives compaction.
- [ ] The original question and constraints are pinned in every turn's context.
- [ ] There is an explicit stopping rule: coverage of all sub-questions, a tool-call budget, and a "no new documents" check.
- [ ] A verification pass checks every claim against its cited span, using a model independent of the writer.
- [ ] Negative and quantified constraints ("never", "all", "fewer than") get their own verification queries.
- [ ] Evaluation uses audited rubrics plus a citation-support metric (accuracy and effective citations), not ROUGE or BERTScore.
- [ ] Judge-human agreement is measured on a labelled sample and compared with human-human agreement.
- [ ] Ablations run on a frozen corpus; final checks run on the live web with dates recorded.
- [ ] Cost and latency are logged per question: model calls, tool calls, input and output tokens, wall-clock time.
- [ ] Prompt caching is on, and history compaction is triggered well before the context limit.
- [ ] If training: SFT warm start on filtered trajectories before RL, reward groups checked for all-equal rewards, and tool-output tokens masked from the loss.

## Landscape

The tables below collect the systems, benchmarks and retrieval components that the lectures cite, with their key reported numbers; rows are newest first within each table where dates are known.

### Agents, models and training methods

| Name | What it is | Key numbers / results | Source |
| --- | --- | --- | --- |
| AgentIR-4B + DR-Synth (COLM 2026) | Reasoning-aware embedding retriever trained on turn-level synthetic labels | BrowseComp-Plus with Tongyi-DR: 66.3% (68.1% with page visits) vs 48.7% query-only; abstract: 68% vs 50% (embedders 2× larger) and 37% (BM25); fewer search calls | L10; [arXiv 2603.04384](https://arxiv.org/abs/2603.04384) |
| DR Tulu-8B (ICML 2026) | First fully open model trained end-to-end for long-form deep research, with RLER | +15.6% over Tongyi DR and +0.7% over OpenAI DR on average over four long-form benchmarks; about 1000× cheaper per query than OpenAI DR; evolving rubrics about 61 vs static about 59.5 at 2,500 steps | L10; [arXiv 2511.19399](https://arxiv.org/abs/2511.19399) |
| OpenScholar (Nature 2026) | Retrieval-augmented LM for scientific literature synthesis over 45M open-access papers | OpenScholar-8B beats GPT-4o by 5% in correctness on ScholarQABench; experts preferred its answers over expert-written ones 51% (8B) and 70% (with GPT-4o); GPT-4 fabricated 78-90% of citations | L10; [arXiv 2411.14199](https://arxiv.org/abs/2411.14199) |
| AgentFounder / agentic continual pretraining (ICLR 2026) | Mid-training stage on agent trajectories before SFT | Same SFT data: BrowseComp-en 28.6 to 39.9, BrowseComp-zh 35.6 to 43.3, GAIA 71.8 to 72.8 (Pass@1) | L10; [arXiv 2509.13310](https://arxiv.org/abs/2509.13310) |
| WebSailor-V2 (ICLR 2026) | Knowledge-graph question synthesis plus scalable RL for web agents | Source of L10's subgraph-to-question recipe | L10; [arXiv 2509.13305](https://arxiv.org/abs/2509.13305) |
| Tongyi DeepResearch (2025) | Open 30.5B-total / 3.3B-active MoE agent; mid-training, SFT, RL; 128K context | BrowseComp accuracy rises from about 0% (8K context) to 43% (128K); release: HLE 32.9, BrowseComp 43.4, BrowseComp-ZH 46.7, xbench-DeepSearch 75.0 | L10; [arXiv 2510.24701](https://arxiv.org/abs/2510.24701) |
| Anthropic multi-agent research system (2025) | Lead agent with parallel sub-agents | +90.2% over single-agent Opus 4 on internal eval; about 15× chat tokens; token use explains 80% of BrowseComp variance | [Anthropic engineering blog](https://www.anthropic.com/engineering/multi-agent-research-system) |
| WebDancer (NeurIPS 2025) | Information-seeking agent; trajectory collection and filtering for SFT | Source of L10's collect-filter-imitate SFT recipe | L10; [arXiv 2505.22648](https://arxiv.org/abs/2505.22648) |
| Search-R1 (COLM 2025) | RL with exact-match rewards for interleaved reasoning and search | L10's RLVR example; 3.86% on BrowseComp-Plus with BM25 (BrowseComp-Plus paper) | L10; [arXiv 2503.09516](https://arxiv.org/abs/2503.09516) |
| OpenAI Deep Research (2025) | Proprietary deep research agent trained for browsing tasks | 51.5% on BrowseComp; DR Tulu matches it on long-form benchmarks at far lower cost | L10 |
| Self-RAG (ICLR 2024) | LM that learns when to retrieve and critiques passages with reflection tokens | Precursor to agentic retrieval decisions | [arXiv 2310.11511](https://arxiv.org/abs/2310.11511) |
| WebGPT (2021) | GPT-3 fine-tuned to browse and answer with references | Preferred over human demonstrators 56% of the time | [arXiv 2112.09332](https://arxiv.org/abs/2112.09332) |

### Benchmarks

| Benchmark | What it measures | Size / key results | Source |
| --- | --- | --- | --- |
| AutoResearchBench (2026) | Scientific literature discovery: one paper or all matches | Domain gap (L10 grid) | L10 |
| DeepResearch Bench II (2026) | Report quality with rubrics from expert reports, manually revised and expert-reviewed | Response to LM-rubric quality problems | L10; [arXiv 2601.08536](https://arxiv.org/abs/2601.08536) |
| ResearchQA (TACL 2026) | Long-form scholarly QA with survey-mined rubrics | 21K questions, 75 fields, 160K rubric items; 15% of parametric items vacuous, erroneous or unclear | L10; [arXiv 2509.00496](https://arxiv.org/abs/2509.00496) |
| DeepResearch Bench (ICLR 2026) | Report quality plus FACT citation support | Citation accuracy and effective citations | L10; [arXiv 2506.11763](https://arxiv.org/abs/2506.11763) |
| FinSearchComp (ICLR 2026) | Expert-written financial search and reasoning | Experts write, compute and cross-check; independent review | L10; [arXiv 2509.13160](https://arxiv.org/abs/2509.13160) |
| BrowseComp-Plus (ACL 2026) | BrowseComp over a fixed, human-verified corpus with hard negatives | 830 questions, 100,195 documents; GPT-5 55.9% (BM25) vs 70.1% (Qwen3-Embedding-8B) | L10; [arXiv 2508.06600](https://arxiv.org/abs/2508.06600) |
| MedBrowseComp (NeurIPS 2025 workshop) | Medical multi-hop search across trials, drugs, regulations | Domain gap | L10; [arXiv 2505.14963](https://arxiv.org/abs/2505.14963) |
| ScholarSearch (2025) | Academic search ability of LLMs | Domain gap | L10; [arXiv 2506.13784](https://arxiv.org/abs/2506.13784) |
| BrowseComp (2025) | Hard-to-find, easy-to-verify browsing questions | 1,266 questions; GPT-4o 0.6%, with browsing 1.9%, o1 9.9%, humans 25.3%, Deep Research 51.5% | L10; [arXiv 2504.12516](https://arxiv.org/abs/2504.12516) |
| ScholarQABench (2024) | Expert-rubric long-form literature QA | 2,967 expert queries, 208 long-form answers, 4 domains; expert-LM agreement 79% vs expert-expert 80% | L10 (OpenScholar paper) |
| HealthBench | Health-domain long-form evaluation used by DR Tulu | One of DR Tulu's four long-form benchmarks | L10 |
| GAIA (2023) | General AI assistant tasks with tools | AgentFounder 72.8 Pass@1 | L10; [arXiv 2311.12983](https://arxiv.org/abs/2311.12983) |
| ALCE (EMNLP 2023) | Automatic citation evaluation for cited generation | Best models lacked full citation support 50% of the time on ELI5 | [arXiv 2305.14627](https://arxiv.org/abs/2305.14627) |
| Natural Questions (2019) | Classical single-lookup QA | L10's example of what DR benchmarks move beyond | L10 |

### Retrieval components

| Component | Type | Notes / numbers | Source |
| --- | --- | --- | --- |
| AgentIR-4B | Reasoning-aware dense retriever | About 65-67% at 24-30 searches on BrowseComp-Plus | L10 |
| Qwen3-Embed-8B | General dense embedder | About 50% at 29-35 searches on BrowseComp-Plus | L10 |
| BM25 | Lexical | About 33-36% at 31-42 searches on BrowseComp-Plus | L10 |
| ColBERT (2020) | Late interaction | Token-level MaxSim scoring | [arXiv 2004.12832](https://arxiv.org/abs/2004.12832) |
| DPR (EMNLP 2020) | Dual-encoder dense retrieval, contrastive training | L10's embedding-retrieval explainer | L10; [arXiv 2004.04906](https://arxiv.org/abs/2004.04906) |
| monoBERT (2019) | Cross-encoder reranker | Standard second-stage reranker | [arXiv 1901.04085](https://arxiv.org/abs/1901.04085) |

## Open problems

Deep research works well enough to be useful and badly enough that every stage, from reward design to retrieval, still has unsolved questions.

**1. Trustworthy rewards for open-ended research.** RLER shows evolving rubrics beat static ones, but the reward is still an LLM judge applied to LLM-written criteria. *Why it's hard:* there is no ground truth for "a good literature synthesis"; judges share blind spots with the policy (both may accept a fluent over-generalisation); and every improvement in the policy creates new ways to satisfy criteria superficially. Open directions include grounding every criterion in retrieved spans, adversarial rubric generation, and measuring reward hacking with periodic expert audits during training rather than only at the end.

**2. Evaluating the evaluators.** L10's own advice is to audit rubrics before using them; ResearchQA found 15% of parametric rubric items defective. *Why it's hard:* auditing needs experts, which is exactly the cost rubrics were meant to remove. Expert-expert agreement of about 80% sets a ceiling that makes it hard to tell a better judge from a noisier one. Open questions: how to estimate judge error per domain cheaply, and how to report benchmark scores with judge-uncertainty intervals.

**3. Citation support at the level of reasoning, not sentences.** FACT-style checks verify that a page supports a claim. They do not verify that a *conclusion* follows from several claims taken together, or that the report did not omit contrary evidence. *Why it's hard:* synthesis errors live between sources (combining a result from one population with a conclusion about another), and omission is invisible to claim-by-claim checks. Measuring coverage of counter-evidence is largely unsolved.

**4. Retrieval designed for agents.** AgentIR shows that reasoning-aware retrieval trained on DR-Synth adds 14-19 points over a query-only baseline across four agent settings, and that including old documents hurts. *Why it's hard:* agents' information needs change every turn, labels exist only for final answers (DR-Synth's LLM-teacher labels are a workaround), and web search APIs are black boxes that cannot be retrained. Open directions: retrievers co-trained with the policy via RL, retrieval that returns "nothing relevant" confidently, and standard interfaces for passing intent to external search engines.

**5. Reproducible yet realistic evaluation.** Live-web benchmarks drift (L7), while frozen corpora such as BrowseComp-Plus trade realism for control, and all public benchmarks leak into training data over time. *Why it's hard:* the web is the environment, and it changes. Directions include rolling benchmarks with dated snapshots, private held-out sets, and reporting both frozen and live scores.

**6. Efficient long-horizon search.** Tongyi's accuracy keeps rising with context up to 128K, so budgets matter, but cost grows quadratically with turns and proprietary systems cost around a dollar or more per query. *Why it's hard:* knowing when enough evidence has been gathered is itself a reasoning problem, and compaction risks dropping exactly the detail a later step needs (L3). Open directions: learned stopping policies, cost-aware rewards in RL, and memory structures (ledgers, graphs) that make old evidence retrievable instead of re-read.

**7. Multi-agent versus single-agent research.** Industry reports large gains from orchestrators with parallel sub-agents, while L10's strongest open results come from single trained policies. *Why it's hard:* decomposition helps breadth but loses context at hand-offs; training multi-agent systems end to end multiplies the credit-assignment problem (L5's RAO trains delegation as an action, a first step). Which tasks favour which architecture is not yet well characterised.

**8. Expert-level domains and high stakes.** L10's closing example answer is deliberately cautious: promising on tested tasks, parity with experts unproven. *Why it's hard:* medical, legal, financial and engineering questions need domain judgement about source authority and applicability, paywalled or proprietary sources, and calibrated statements of uncertainty. Benchmarks such as MedBrowseComp and FinSearchComp exist, but evidence of reliable real-world use by professionals is still thin.

## Glossary

| Term | Meaning |
| --- | --- |
| Agentic mid-training | Continual next-token pretraining on agent trajectories plus general data before SFT, producing an agent-ready base (AgentFounder). |
| AgentIR | Reasoning-aware retriever that embeds the agent's current reasoning with its query; trained on DR-Synth data. |
| Approximate nearest neighbour (ANN) | Index structures (HNSW, IVF-PQ) that return approximately the top-k vectors without scoring the whole corpus. |
| Attribution | A claim is attributable to a source if a reader of that source would agree the source states it. |
| BM25 | Lexical ranking function summing IDF-weighted, saturating, length-normalised term frequencies. |
| BrowseComp | 1,266 hard-to-find, easy-to-verify browsing questions built backwards from known answers. |
| BrowseComp-Plus | BrowseComp over a frozen, human-verified corpus (830 questions, 100,195 documents) for controlled retriever and agent comparisons. |
| Citation accuracy | Fraction of (claim, citation) pairs where the cited source supports the claim. |
| Contrastive loss | Softmax cross-entropy that raises the score of a positive passage relative to negatives; used to train dense retrievers. |
| Cross-encoder reranker | Model that reads query and document together to score relevance; accurate but applied only to a short candidate list. |
| Deep research agent | LM agent that plans, searches repeatedly, reads and synthesises a well-attributed answer. |
| Dense retriever (dual encoder) | Separate query and document encoders whose dot product scores relevance; enables a precomputed vector index. |
| DR-Synth | Method that creates turn-level retriever labels by adding global gold documents to a turn's results and listwise-reranking them with the global question and answer. |
| Effective citations | Count of supported (claim, citation) pairs in a report (DeepResearch Bench). |
| Faithfulness | The property of saying only what the retrieved evidence says; distinct from factual truth. |
| GRPO | Group Relative Policy Optimization: policy gradient with advantages computed relative to other samples for the same prompt, plus clipping and a KL penalty. |
| Hard negative | A document that looks relevant but does not answer; the most informative negative for retriever training and benchmark difficulty. |
| Hybrid retrieval | Combining lexical and dense retrievers, often via reciprocal rank fusion. |
| Knowledge-graph synthesis | Creating multi-hop questions by sampling a subgraph of sourced facts and hiding the target entity (WebSailor-V2). |
| LLM judge | An LM prompted to score an output against a criterion; validated by agreement with human experts. |
| RAG | Retrieval-augmented generation: retrieve passages once for the input and condition generation on them. |
| Reciprocal rank fusion (RRF) | Merge of ranked lists scoring each document by the sum of 1/(k + rank), k usually 60. |
| RLER | Reinforcement Learning with Evolving Rubrics: rubric rewards whose criteria are regenerated from retrieved evidence and contrasting rollouts during training (DR Tulu). |
| RLVR | RL with verifiable rewards, e.g. exact match of a short answer (Search-R1). |
| Rubric | Weighted list of criteria a good answer must meet; scored item by item and combined as a weighted average. |

## Practice questions

The questions move from recall to calculation and design; try each before reading the answer.

1. What distinguishes a deep research agent from classical RAG, in one sentence each? **Answer:** Classical RAG retrieves once for the user's input and generates from those passages. A deep research agent decides when to search, writes each new query based on what it has learned so far, reads and reflects over many results, and decides when to stop and write an attributed answer.
2. Name L10's four shortcomings of classical QA benchmarks and one benchmark that addresses each. **Answer:** Simple lookup (search complexity: BrowseComp, BrowseComp-Plus); general domain (expertise: MedBrowseComp, FinSearchComp); short-form answers (answer quality: ScholarQABench, ResearchQA rubrics); evidence use unclear (evidence support: DeepResearch Bench's FACT citation check).
3. How is a BrowseComp question built and its difficulty verified? **Answer:** Start from a known answer (person, event or artifact), hide its name, and combine factual clues into a question. Verify that models with search fail, that five Google searches do not suffice, and (on a subset) that a human is still stuck after ten minutes. The answer is short, so grading is easy even though finding it is hard.
4. Why did BrowseComp-Plus freeze the corpus, and what does it cost? **Answer:** Live web search depends on the engine, date and page changes, so agent and retriever contributions cannot be isolated or reproduced. A frozen, human-verified corpus with hard negatives (830 questions, 100,195 documents) lets you swap retrievers with the agent fixed. The cost is realism: the corpus is small and pre-selected compared with the open web.
5. Compute the BM25 contribution of a term with n\_t = 10 in a 1,000-document collection, f = 3 in a document of length 60 with avgdl = 120, k\_1 = 1.2, b = 0.75. **Answer:** IDF = ln(1 + (1000 − 10 + 0.5)/(10 + 0.5)) = ln(1 + 94.33) = ln(95.33) ≈ 4.557. Length factor = 1.2 × (0.25 + 0.75 × 0.5) = 1.2 × 0.625 = 0.75. TF factor = 3 × 2.2 / (3 + 0.75) = 6.6/3.75 = 1.76. Contribution ≈ 4.557 × 1.76 ≈ 8.02. The short document gets a boost because the length factor is below k\_1.
6. BM25 ranks \[X, Y, Z\]; a dense retriever ranks \[Z, W, X\]. Compute RRF scores with k = 60 and give the fused order. **Answer:** X = 1/61 + 1/63 = 0.01639 + 0.01587 = 0.03227. Z = 1/63 + 1/61 = 0.03227 (tie with X). Y = 1/62 = 0.01613. W = 1/62 = 0.01613 (tie). Fused order: X and Z tied first, then Y and W tied. Ties show that RRF only uses ranks; a tie-breaker (for example, the first-stage score) is needed in practice.
7. In the contrastive loss for dense retrieval, why do hard negatives matter more than random ones? Use the gradient. **Answer:** The gradient on a negative's score is its softmax probability p-\_j. A random negative already scores far below the positive, so p-\_j is near 0 and it contributes almost no learning signal. A hard negative scores close to the positive, gets substantial probability, and so produces a large gradient that teaches the fine distinctions the retriever needs.
8. A report has four (claim, citation) pairs; the cited pages support pairs 1, 2 and 4. Give citation accuracy and effective citations. If the writer deletes claim 3, what changes? **Answer:** Citation accuracy = 3/4 = 75%; effective citations = 3. Deleting claim 3 gives accuracy 3/3 = 100% with effective citations still 3. This is why both metrics are reported: accuracy alone rewards citing less, while effective citations reward supported content.
9. A rubric has items with weights 3, 2, 1, 1. The judge says the answer meets items 1 and 3 only. What is the score, and what does L10 recommend before trusting such scores? **Answer:** (3 + 1)/(3 + 2 + 1 + 1) = 4/7 ≈ 0.57. L10 recommends evaluating the rubric itself first: ground criteria in sources, remove items that restate the question, cite nonexistent papers or are too vague; and check judge-expert agreement against expert-expert agreement (79% vs 80% in OpenScholar's study).
10. Why do ROUGE, BERTScore and BLEURT fail for long-form research answers? **Answer:** There are several valid answers with different wording, and an answer can be very similar to the reference yet wrong in one key word ("proven" vs "unproven"). On 109 expert comparisons their preference accuracy was only 58%, 57% and 62% against 50% chance.
11. Four rollouts for one question receive exact-match rewards 1, 1, 1, 1. What GRPO advantages result, and what should you do? **Answer:** The mean is 1 and the standard deviation 0, so every advantage is 0 (with the usual small epsilon in the denominator) and the question contributes no gradient. The question is too easy for the current policy; curate the task pool towards questions with mixed outcomes, as L11 recommends for uninformative groups.
12. Explain how RLER creates new rubrics during training and why this beats static rubrics. **Answer:** For each question, persistent rubrics are generated once with search. At each step the policy's rollouts are contrasted: correct new findings become positive rubrics and shared errors become negative rubrics, stored in a rubric buffer. Rewards are weighted rubric scores. Static rubrics cannot reward information the author did not anticipate and are easier to satisfy superficially; in L10, evolving rubrics reached about 61 versus about 59.5 for initial rubrics only after 2,500 steps, with random rewards near 51.
13. What information does a standard retriever miss in a deep research loop, and what do the AgentIR ablations say about which history to include? **Answer:** It receives only the latest short query, not the reasoning that explains the need. With DR-Synth training fixed, the current reasoning gave the best accuracy in all four settings (e.g. 66.3% for Tongyi-DR vs 59.4% query-only); prior queries helped a little; adding previously retrieved documents lowered accuracy (60.0% for Tongyi-DR). The latest reasoning already summarises what matters now.
14. An agent run has P = 1,000, a = 3,000, T = 40 turns, no caching. How many input tokens are processed, and how many would compaction that caps history at 30,000 tokens process? **Answer:** Uncapped: T·P + a·T(T − 1)/2 = 40,000 + 3,000 × 780 = 2,380,000. With the cap, history (t − 1)·a reaches 30,000 at t = 11; turns 1-11 read 1,000·11 + 3,000·(0 + ... + 10) = 11,000 + 165,000 = 176,000; turns 12-40 read 29 × 31,000 = 899,000. Total 1,075,000, about 45% of the uncapped cost, bought at the risk of losing details in the summaries.
15. Design question: you must build a research assistant that answers questions from a company's 200,000 internal PDFs and cites page numbers. Outline the retrieval stack, the evaluation plan and one training or tuning step you would add. **Answer:** Retrieval: chunk PDFs with page metadata; hybrid BM25 + dense embeddings with RRF; cross-encoder rerank of the top 50; pass the agent's reasoning with each query; goal-conditioned page reading. Evaluation: 20-50 real questions with audited, source-grounded rubrics, an LLM judge validated against two human raters, and a FACT-style check of every page citation; ablate on a frozen snapshot. Tuning: generate DR-Synth-style turn-level labels from logged agent runs with known answers and fine-tune the embedding model, or build knowledge-graph questions from the documents for SFT and RLVR.

## References and further reading

Start with the L10 papers (OpenScholar, DR Tulu, AgentIR, BrowseComp), then the retrieval classics, then the evaluation papers.

### Core papers

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — Lewis et al., 2020 — the original RAG formulation that agentic search generalises.
- [Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2004.04906) — Karpukhin et al., EMNLP 2020 — dual-encoder retrieval and the contrastive objective shown in L10.
- [ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832) — Khattab and Zaharia, 2020 — late interaction between single-vector and cross-encoder scoring.
- [Passage Re-ranking with BERT](https://arxiv.org/abs/1901.04085) — Nogueira and Cho, 2019 — the standard cross-encoder reranker.
- [Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511) — Asai et al., ICLR 2024 — learned retrieval decisions and self-critique, a step towards agentic search.
- [WebGPT: Browser-assisted question-answering with human feedback](https://arxiv.org/abs/2112.09332) — Nakano et al. (OpenAI), 2021 — first browsing agent that writes long-form answers with references.
- [Enabling Large Language Models to Generate Text with Citations (ALCE)](https://arxiv.org/abs/2305.14627) — Gao et al., EMNLP 2023 — citation precision and recall metrics.
- [FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation](https://arxiv.org/abs/2305.14251) — Min et al., EMNLP 2023 — atomic-fact decomposition for checking long text.

### From the lectures

- [OpenScholar: Synthesizing Scientific Literature with Retrieval-augmented LMs](https://arxiv.org/abs/2411.14199) — Asai et al., 2024 (Nature 2026) — literature-synthesis RAG, ScholarQABench, and the 78-90% fabricated-citation finding.
- [DR Tulu: Reinforcement Learning with Evolving Rubrics for Deep Research](https://arxiv.org/abs/2511.19399) — Shao, Asai et al., ICML 2026 — RLER and the open 8B long-form research model.
- [AgentIR: Reasoning-Aware Retrieval for Deep Research Agents](https://arxiv.org/abs/2603.04384) — COLM 2026 — reasoning-aware retrieval and DR-Synth.
- [Tongyi DeepResearch Technical Report](https://arxiv.org/abs/2510.24701) — Tongyi Lab (Alibaba), 2025 — mid-training, SFT and RL recipe; context and tool-call scaling.
- [BrowseComp: A Simple Yet Challenging Benchmark for Browsing Agents](https://arxiv.org/abs/2504.12516) — Wei et al. (OpenAI), 2025 — the canonical hard-to-find, easy-to-verify benchmark.
- [BrowseComp-Plus: A More Fair and Transparent Evaluation Benchmark of Deep-Research Agent](https://arxiv.org/abs/2508.06600) — Chen et al., 2025 (ACL 2026 on slides) — frozen corpus for controlled retriever comparisons.
- [DeepResearch Bench: A Comprehensive Benchmark for Deep Research Agents](https://arxiv.org/abs/2506.11763) — ICLR 2026 — report evaluation and the FACT citation check.
- [ResearchQA: Evaluating Scholarly Question Answering at Scale Across 75 Fields with Survey-Mined Questions and Rubrics](https://arxiv.org/abs/2509.00496) — Li, Malaviya and Yatskar, TACL 2026 — LM-generated rubrics at scale and their audit.
- [A Critical Evaluation of Evaluations for Long-form Question Answering](https://arxiv.org/abs/2305.18201) — Xu et al., ACL 2023 — why similarity metrics misrank long answers.
- [Search-R1: Training LLMs to Reason and Leverage Search Engines with Reinforcement Learning](https://arxiv.org/abs/2503.09516) — Jin et al., COLM 2025 — RLVR for search agents.
- [WebSailor-V2: Bridging the Chasm to Proprietary Agents via Synthetic Data and Scalable Reinforcement Learning](https://arxiv.org/abs/2509.13305) — Alibaba, ICLR 2026 — knowledge-graph question synthesis.
- [Scaling Agents via Continual Pre-training](https://arxiv.org/abs/2509.13310) — Alibaba, ICLR 2026 — agentic mid-training (AgentFounder).
- [DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models](https://arxiv.org/abs/2402.03300) — Shao et al., 2024 — introduces GRPO.

### Tutorials, docs and courses

- [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) — Anthropic, 2025 — practical lessons on orchestrators, evaluation with rubric judges, token costs and failure modes.
- [Tongyi DeepResearch repository](https://github.com/Alibaba-NLP/DeepResearch) — Alibaba-NLP — open model, inference code (ReAct and Heavy modes) and tools to study a real agent.
- The Probabilistic Relevance Framework: BM25 and Beyond — Robertson and Zaragoza, Foundations and Trends in IR, 2009 — the definitive treatment of BM25 and its parameters.

---

## Related

- Course index: [[CMU 11-768 AI Agents - Course Index]]
- Lecture: [[L10 - Deep Research Agents]]
- [[RAG - Evolution and Complexity]]
- [[RAG and Agentic RAG Tooling]]
- [[What is Agentic RAG Use Cases and Top Agentic RAG Tools (2025)]]

[[T07 - Computer-Use and Web Agents - Perception, Grounding and Action|← T7]] · [[CMU 11-768 AI Agents - Course Index|Course index]] · [[T09 - Evaluating Agents - Benchmarks, Verifiers and Metrics|T9 →]]
