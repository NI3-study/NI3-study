# Aggregation-to-state revision brief

Work autonomously in this repository and implement this critique. Use Claude Code Opus at high effort; do not merely propose changes.

## User critique (authoritative)

- A table is not a visualization.
- The current reader can follow that each node receives weighted neighbor values plus its own value, but cannot tell what this "reading" is for, why it matters, whether it is a STEP/stage, or what its precise definition is.
- If this operation defines a node's value, distinguish the input/current node state from the newly computed state.
- Make it explicit how the result is used in the next step/layer and how the same mechanism expands in depth, width/feature channels, graph size, complexity, multiplicity, and parallel execution.
- Do not show the identical arithmetic for all four nodes. That treats the reader as incapable. Show at most two deliberately contrasting examples: one internal/high-degree node and one boundary/leaf node.
- Repetition is excessive unless each repetition adds conceptual difficulty.

## Required conceptual correction

Replace vague "read/read a node" language with a precise state-transition vocabulary:

1. `h_i^(l)` is the current/input state of node i at layer l. It is not erased while messages are being formed.
2. Neighbor/self messages are weighted and aggregated into `m_i^(l)` (or an equivalent clearly named intermediate).
3. A shared learned transform/update and nonlinearity produce the next state `h_i^(l+1)`.
4. The complete matrix `H^(l+1)` becomes the input to the next layer. This is where receptive range grows and representations become task-useful.
5. All target nodes can compute this same local rule independently/in parallel; graph-size scaling means more rows/edges, not a longer conceptual recipe. Sparse cost should be described as roughly edge-linear for aggregation plus node-linear feature transforms, using appropriate dimensions rather than overclaiming.
6. Feature width is a separate axis controlled by W; depth repeats the whole layer block; graph size adds rows and edge messages; heads/relations, if mentioned, are multiple message channels combined before the next state. Do not overload one picture with every advanced variant.

## Visual changes

### A. Replace `sync-update`

Build one coherent left-to-right causal visual using the existing visual language and G4 coordinates:

`current states H^l` -> `two local examples only` -> `assembled output H^(l+1)` -> `feeds next layer`

- Use exactly two local examples: preferably internal node v1 and leaf/boundary node v4 (or another well-justified internal/leaf pair).
- In each example, visually distinguish self/current state, incoming neighbor messages/weights, aggregated intermediate, and new state.
- Preserve the statement that all node rows are computed in parallel, but do not render four repetitive node-by-node panels. A single unobtrusive "same rule for all rows / parallel" cue on the assembled matrix is enough.
- Show the output matrix reconnecting to the same graph/matrix form as the next layer's input. The reader must see a loop/reuse, not merely read it in prose.
- If simple sum `(A+I)x` is retained, label it explicitly as a non-learned toy aggregation, not yet a full GNN layer. Prefer using the general symbols first and the toy numbers as annotations.
- The figure title/caption/fallback/alt description must answer: what is computed, what it becomes, and why it matters.

### B. Turn aggregation choice into an actual visualization

The current Markdown comparison table may remain as reference text only if helpful, but it cannot carry the visual burden. Add a small static visual in section 6 that shows the *same two input multisets* flowing through sum/mean/max and visibly colliding or separating. This is not to be laid out as a table/grid of prose. Use converging tokens/arrows/operators/results so the information loss is perceptual.

- Use minimal repeated cases. Each case must add a distinct insight.
- Make the reason important: once two neighborhoods collide under an aggregator, the downstream update receives the same intermediate and cannot distinguish them without other information.
- Register and mount the new figure, add accessible fallback, and extend verification.

### C. Strengthen the lineage rather than duplicate it

- Ensure `lineage-strip` / `lineage-bridge` explicitly starts from `H^l` and ends at `H^(l+1)`, and shows that the last output is reused as the next layer input.
- Do not add a second long strip that repeats the same six frames.
- Clarify that aggregation is one substage inside a layer, not itself a layer/STEP unless the document intentionally names substages.
- Add one compact scaling explanation near the visual: depth repeats blocks, width changes feature columns, graph size changes node rows/edge messages, parallelism applies the same shared local rule across target rows. Use prose plus the visual; do not substitute another table.

## Scope and quality constraints

- Keep existing anchors stable (`#viz-message-passing`, `#viz-lineage`, etc.).
- Maintain the project's canonical graph, dual graph/tensor visual language, light/dark themes, mobile legibility, and accessibility.
- Avoid sliders, autoplay, gratuitous interaction, dashboards, cards, and excessive UI. Static small multiples are fine only when each advances difficulty.
- Reuse existing primitives where possible. Do not hard-code derived graph arithmetic if registry helpers can compute it.
- Update the integrated design spec so it no longer prescribes four per-node small multiples.
- Update `tools/verify-figures.mjs` to check the new semantic invariants, including exactly two worked local examples and a visible/reported next-layer handoff.
- Run `node --check` on JS modules, `node tools/verify-figures.mjs`, `python -m mkdocs build --strict` using the repo venv if present, and `git diff --check`.
- Review the rendered DOM or, if browser automation is unavailable, inspect generated site output and state the limitation. Do not commit or push.

When finished, report changed files, the exact conceptual fixes, validation results, and any remaining concern.
