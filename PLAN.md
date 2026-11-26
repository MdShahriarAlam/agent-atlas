# Agent Atlas: interactive lessons for CMU 11-768 AI Agents

Source notes: originally `G:\My Drive\Obsidian\CMU AI Agents`, **copied into `notes/`** (21 lectures incl. L22, 15 topics, course index, concept-map images in `notes/images/`). The site only reads from this folder, so it works on any static host (Vercel, Netlify, GitHub Pages) with no local paths.

To refresh after editing the notes in Obsidian, re-copy them, then regenerate `notes/manifest.js` (the list of note paths the reader uses for `[[wikilinks]]`):
```powershell
Copy-Item -Recurse -Force "G:\My Drive\Obsidian\CMU AI Agents\*" notes\; Copy-Item -Force "G:\My Drive\Obsidian\images\cmu-ai-agents-*" notes\images\
```

## What each lesson looks like
- **Stage:** a diagram of isometric 3D objects on platforms over a paper grid. The objects are a laptop, a person, a model cube, hexagonal service blocks, database cylinders, document stacks, server racks and dashed "sandbox" zones. Messages fly along curved arrows with labels, speech bubbles sit above objects, and overloaded or at-risk parts glow.
- **Top strip:** metrics that change with each step (tokens, cost, latency, success rate…).
- **Right column:** a step card (Problem / Technique / Step / Insight tag, explanation, *Key idea*, collapsible *Deep dive* with the maths and paper details), Back/Next buttons, and a *You'll learn* checklist that ticks off as you go.
- **Bottom:** a step tracker with the current step's label. Arrow keys, R (replay) and Space (pause) work. Each step has its own link (`#/l01/3`).
- **Menu:** a drawer with Lectures and Topics folders, progress counts and Ctrl+K search. There's a light and a dark theme.

## Code layout
- `index.html`: the page shell.
- `styles.css`: the paper theme and layout.
- `app.js`: routing, the isometric drawing code, animation and the panels. No build step, no dependencies.
- `reader.js`: the in-site notes reader (a small markdown renderer and the "Read the full notes" panel).
- `notes/`: the copied course notes, images and `manifest.js`.
- `lessons/*.js`: one file per lecture or topic. Each file adds one lesson object to `window.LESSONS`, and `index.html` loads each file.

### Lesson file format
```
{ id, track: 'Lectures' | 'Topics', code: 'L01', title, level, minutes, summary,
  notePath: 'Lectures/L01 - What Are Agents', noteSections: [heading per step], glossary: { term: definition },
  metrics: [[name, icon]], learn: [[text, stepIndex]],
  quiz: [{ q, options: [4 choices], answer: index, why }],   // from the note's Self-check / Practice problems
  nodes: { id: { x, y, kind, label, sub, color } },   // x, y = grid units
  zones: { id: { x0, y0, x1, y1, label } },
  links: [[a, b]],
  steps: [{ short, tag, title, text, key, deep, show, hide, state, flows: [[from, to, 'req'|'res'|'hs', label]], callouts: { node: text }, metrics }] }
```

## How each lesson is written
1. Read the note's Overview, Detailed notes / Core concepts and Mechanics.
2. Choose 9–12 steps that tell one story: problem → technique → numbers → failure → fix → insight.
3. Draw one scene for the whole lesson, and change it per step (show/hide, state, flows, callouts).
4. Pull real numbers from the notes into the metrics (costs, token counts, latencies, success rates).
5. Put formulas and paper specifics in the Deep dive, so the main text stays readable.
6. Check in the browser: no console errors, and every step on desktop and mobile.

## Roadmap
| Batch | Lectures | Topics |
|---|---|---|
| **1 (done)** | L01 What Are Agents | T01 Agent Loop & Harness Design |
| **2 (done)** | L02 Tool Use, L03 Long-Context | T02 Tools at Scale & Under Attack, T03 Context Engineering in Production |
| **3 (done)** | L04 Memory & Skills, L05 Planning | T04 Memory Systems: Write, Read, Defend · T05 Multi-Agent Systems and Search |
| **4 (done)** | L06 Coding Agents, L07 Computer Use Agents | T06 Coding Agents in the Real World · T07 Seeing, Clicking and Staying Safe |
| 5 | L08 SFT, L09 RL Foundations, L11 Advanced RL, L12 RL Systems | T10 SFT, T11 Policy-Gradient RL, T12 Rewards & Reward Hacking |
| 6 | L10 Deep Research, L20 Search over Trajectories, L21 Search & Planning | T08 Deep Research, T09 Evaluating Agents |
| 7 | L13 Safety, L14 OpenHands, L15 Orchestration | T13 Orchestration, T14 Safety & Security |
| 8 | L17 Human Work, L18 Multi-agent, L19 Human-AI Collaboration, L22 How to Trust Your AI Agents | T15 Human-Agent Interaction |

Each lesson ends with an 8-question quiz (`#/l01/quiz`) and remembers your best score. Later: deploy the site.
