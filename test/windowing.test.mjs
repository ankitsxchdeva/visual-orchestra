// Regression tests for the board's scroll window in ../windowing.ts.
// Bug class: cursor scrolled off-screen, gap rows miscounted so the window
// overflows the canvas, or compact (1-row) agents not packing tighter.
// Run: node --test test/
import { test } from "node:test";
import assert from "node:assert";
import { scrollWindow } from "../windowing.ts";

const used = (heights, gap, [s, e]) =>
	heights.slice(s, e).reduce((a, b) => a + b, 0) + gap * Math.max(0, e - s - 1);

test("empty list yields an empty window", () => {
	assert.deepEqual(scrollWindow([], 1, 10, 0), [0, 0]);
});

test("when everything fits, the window is the whole list", () => {
	assert.deepEqual(scrollWindow([4, 4, 4], 1, 100, 1), [0, 3]);
	assert.deepEqual(scrollWindow([1], 1, 1, 0), [0, 1]);
});

test("selected index is clamped into range", () => {
	assert.deepEqual(scrollWindow([4, 4], 1, 100, 99), [0, 2]);
	assert.deepEqual(scrollWindow([4, 4], 1, 100, -3), [0, 2]);
});

test("overflow with cursor at the end anchors the window to the end", () => {
	// 4+1+4 = 9 <= 10, three boxes = 14 > 10.
	assert.deepEqual(scrollWindow([4, 4, 4, 4, 4], 1, 10, 4), [3, 5]);
});

test("gap rows count toward the budget", () => {
	assert.deepEqual(scrollWindow([4, 4], 1, 8, 0), [0, 1]);
	assert.deepEqual(scrollWindow([4, 4], 1, 9, 0), [0, 2]);
});

test("an item taller than the budget is shown alone", () => {
	assert.deepEqual(scrollWindow([4, 10, 4], 1, 5, 1), [1, 2]);
});

test("compact rows pack more agents into the same budget", () => {
	// n one-row items with gap 1 cost 2n-1 rows: budget 10 fits 5.
	const w = scrollWindow([1, 1, 1, 1, 1, 1, 1, 1, 1], 1, 10, 4);
	assert.equal(w[1] - w[0], 5);
});

test("free space fills below the cursor first (lookahead)", () => {
	assert.deepEqual(scrollWindow([4, 4, 4, 4, 4], 1, 9, 2), [2, 4]);
});

test("property: every window contains the cursor and stays in budget", () => {
	for (let n = 1; n <= 12; n++) {
		// Mix of box-height and compact-height rows, like a real board.
		const heights = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 4 : i % 3 === 1 ? 5 : 1));
		for (let budget = 1; budget <= 20; budget++) {
			for (let sel = 0; sel < n; sel++) {
				const w = scrollWindow(heights, 1, budget, sel);
				assert.ok(w[0] <= sel && sel < w[1], `sel ${sel} outside [${w[0]}, ${w[1]}) n=${n} budget=${budget}`);
				const rows = used(heights, 1, w);
				assert.ok(
					rows <= budget || w[1] - w[0] === 1,
					`window uses ${rows} > budget ${budget} n=${n} sel=${sel}`,
				);
			}
		}
	}
});
