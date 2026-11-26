# Agent Atlas

Interactive, step-by-step visual lessons for **CMU 11-768 AI Agents**, built from my course notes.

Each lesson is an animated isometric diagram with a step-by-step explanation: messages play one at a time with captions (and optional voice), metrics update as you go, and every step links to the matching section of the full notes. Lessons end with an 8-question quiz.

## Run it

It's a static site with no build step and no dependencies. Serve the folder with any static server:

```
npx http-server -p 5173 -c-1
```

Then open http://localhost:5173. (Opening `index.html` directly won't load the notes reader, because browsers block `fetch` from `file://`.)

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css` | Page shell and the paper theme |
| `app.js` | Routing, isometric renderer, animation timeline, quiz, glossary, autoplay and voice |
| `reader.js` | In-site notes reader (a small markdown renderer) |
| `lessons/*.js` | One file per lecture or topic: scene, steps, captions, quiz |
| `notes/` | Copy of the course notes and concept-map images, plus `manifest.js` |
| `PLAN.md` | Lesson format, how lessons are written, and the roadmap |

## Status

Done: L01 What Are Agents?, T01 The Agent Loop & Harness Design. The rest of the course is planned in `PLAN.md`.
