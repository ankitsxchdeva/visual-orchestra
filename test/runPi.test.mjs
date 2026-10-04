// Regression tests for runPi's settlement logic in ../task.ts.
// Bug class: a detached grandchild inheriting stdout/stderr keeps the pipes
// open forever, so "close" never fires and the promise hangs; abort must
// still settle (SIGTERM → SIGKILL escalation, forced "cancelled" result).
// Run: node --test test/
import { test } from "node:test";
import assert from "node:assert";
import { runPi } from "../task.ts";

const assistantEnd = (text, model = "test-model") =>
	JSON.stringify({
		type: "message_end",
		message: {
			role: "assistant",
			model,
			usage: { input: 10, output: 5 },
			content: [{ type: "text", text }],
		},
	});

const bash = (script) => ["-c", script];
const runBash = (script, signal) => runPi(bash(script), signal, undefined, "bash");

test("normal run: parses events, resolves with last assistant text", { timeout: 5000 }, async () => {
	const { text, progress } = await runBash(`printf '%s\\n' '${assistantEnd("final answer")}'`);
	assert.equal(text, "final answer");
	assert.equal(progress.turns, 1);
	assert.equal(progress.tokens, 15);
	assert.equal(progress.model, "test-model");
});

test("post-exit chunk within the idle grace is flushed", { timeout: 5000 }, async () => {
	// Parent exits immediately; the background subshell writes one event ~40ms later.
	// Design: settle once the pipe is quiet for 100ms post-exit — chunks after that
	// grace are intentionally dropped (they come from stray grandchildren, not pi).
	const { text } = await runBash(`( sleep 0.04; printf '%s\\n' '${assistantEnd("grandchild tail")}' ) & exit 0`);
	assert.equal(text, "grandchild tail");
});

test("silent grandchild holding the pipe does not hang settle", { timeout: 5000 }, async () => {
	// Old code waited on close (~1.5s); new code settles via the idle timer shortly after exit.
	const t0 = performance.now();
	const { text } = await runBash(`( sleep 1.5 ) & exit 0`);
	const ms = performance.now() - t0;
	assert.equal(text, "(subagent produced no output)");
	assert.ok(ms < 1000, `settled in ${ms}ms, expected <1000ms`);
});

test("abort settles promptly even when a grandchild holds the pipe", { timeout: 5000 }, async () => {
	const ac = new AbortController();
	setTimeout(() => ac.abort(), 150);
	const t0 = performance.now();
	await assert.rejects(runBash(`sleep 3 & sleep 3`, ac.signal), /subagent cancelled/);
	const ms = performance.now() - t0;
	assert.ok(ms < 2000, `cancelled in ${ms}ms, expected <2000ms`);
});

test("abort escalates to SIGKILL when the child ignores SIGTERM", { timeout: 15000 }, async () => {
	const ac = new AbortController();
	setTimeout(() => ac.abort(), 150);
	const t0 = performance.now();
	await assert.rejects(runBash(`trap '' TERM; sleep 6 & sleep 6`, ac.signal), /subagent cancelled/);
	const ms = performance.now() - t0;
	// SIGKILL fires 5s after abort; settle must not wait for the 6s children.
	assert.ok(ms > 4500 && ms < 8000, `cancelled in ${ms}ms, expected between 4.5s and 8s`);
});

test("non-zero exit surfaces the stderr tail", { timeout: 5000 }, async () => {
	await assert.rejects(
		runBash(`echo boom >&2; exit 7`),
		(e) => /subagent exited 7/.test(e.message) && /boom/.test(e.message),
	);
});

test("already-aborted signal rejects without spawning", { timeout: 5000 }, async () => {
	const ac = new AbortController();
	ac.abort();
	await assert.rejects(runBash(`sleep 5`, ac.signal), /subagent cancelled/);
});
