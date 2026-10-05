// Demo harness: drives the extension with synthetic tool events and prints
// renders to stdout. No model calls, no subprocesses — for VHS recordings,
// screenshot pipelines and manual layout checks.
// Usage: node scripts/demo.mjs [--agents N] [--running K] [--keys j,j,up] [--width W] [--height H] [--live]
// Keys: j/k literals, or up/down/escape (mapped to terminal sequences).
// --live: stay resident; staggered events on a timeline, streaming updates,
// one agent finishes mid-run, stdin keys (j/k/arrows, q quits). Takes the
// pty size, ignoring --width/--height.
import ext from "../index.ts";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? dflt : args[i + 1];
};
const nAgents = Number(opt("agents", 8));
const nRunning = Number(opt("running", 3));
const keys = opt("keys", "").split(",").filter(Boolean);
const live = args.includes("--live");
const width = Number(opt("width", process.stdout.columns ?? 100));
const height = Number(opt("height", 0));
// Piped stdout has no size of its own; stub rows so render() sees --height.
if (height) process.stdout.rows = height;

const ANSI = { accent: 36, success: 32, error: 31, muted: 90, borderMuted: 90, dim: 2 };
const theme = {
	fg: (style, t) => (ANSI[style] ? `\x1b[${ANSI[style]}m${t}\x1b[0m` : t),
	bold: (t) => `\x1b[1m${t}\x1b[0m`,
};

const handlers = {};
ext({
	on: (ev, fn) => (handlers[ev] ??= []).push(fn),
	registerCommand: (name, cmd) => (handlers[`cmd:${name}`] = cmd.handler),
	registerShortcut: () => {},
});
const fire = (ev, payload) => (handlers[ev] ?? []).forEach((f) => f(payload));

fire("model_select", { model: { id: opt("model", "gpt-5.2") } });

const AGENTS = ["scout", "reviewer", "task", "sonic", "librarian", "designer", "security-reviewer", "init"];
const TASKS = [
	"Map the layout engine and report every place node heights are computed",
	"Review the scroll windowing patch for off-by-one errors and jitter",
	"Implement the compact row renderer with right-aligned stats",
	"Rename internal helpers to match repo conventions",
	"Read pi-tui sources and confirm matchesKey arrow names",
	"Redesign the overflow indicators so they read as continuation",
	"Audit the canvas for control-char injection from streamed partials",
	"Write the AGENTS.md for this repository",
];
const ACTIVITIES = [
	"bash: rg -n 'scrollWindow' src/",
	"read: src/layout.ts",
	"edit: src/windowing.ts",
	"bash: node --test test/",
];

/** Static mode: fire the whole scenario synchronously (screenshots, eyeballing). */
function fireAll() {
	for (let i = 0; i < nAgents; i++) {
		const id = `call_${i}`;
		const agent = AGENTS[i % AGENTS.length];
		fire("tool_execution_start", { toolName: "task", toolCallId: id, args: { agent, prompt: TASKS[i % TASKS.length] } });
		if (i >= nAgents - nRunning) {
			fire("tool_execution_update", {
				toolName: "task",
				toolCallId: id,
				partialResult: {
					details: { agent, activity: ACTIVITIES[i % ACTIVITIES.length], turns: 3 + i, tokens: 12000 * (i + 1), model: "gpt-5.2" },
				},
			});
		} else {
			fire("tool_execution_end", {
				toolName: "task",
				toolCallId: id,
				isError: i % 7 === 3,
				result: { details: { turns: 2 + i, tokens: 8000 * (i + 1), model: "gpt-5.2" } },
			});
		}
	}
}

if (live) {
	let view;
	const draw = () => process.stdout.write("\x1b[H" + view.render(process.stdout.columns ?? 100).join("\r\n"));
	await handlers["cmd:orchestra"]("", {
		mode: "tui",
		ui: {
			custom: async (factory) => {
				view = factory({ requestRender: () => view && draw() }, theme, {}, () => process.exit(0));
			},
			notify: () => {},
		},
	});
	process.stdout.write("\x1b[2J\x1b[H\x1b[?25l"); // clear, home, hide cursor
	draw();

	// Timeline: staggered starts, then streaming updates on a cadence; the
	// oldest running agent finishes mid-recording and collapses.
	const at = (ms, fn) => setTimeout(fn, ms);
	let t = 0;
	for (let i = 0; i < nAgents; i++) {
		const id = `call_${i}`;
		const agent = AGENTS[i % AGENTS.length];
		at(t, () => fire("tool_execution_start", { toolName: "task", toolCallId: id, args: { agent, prompt: TASKS[i % TASKS.length] } }));
		// Finished agents end staggered shortly after starting; the running
		// agents end below, mid-recording.
		if (i < nAgents - nRunning) {
			const endAt = t + 900 + (i % 3) * 400;
			at(endAt, () =>
				fire("tool_execution_end", {
					toolName: "task",
					toolCallId: id,
					isError: i % 7 === 3,
					result: { details: { turns: 2 + i, tokens: 8000 * (i + 1), model: "gpt-5.2" } },
				}),
			);
		}
		t += 280;
	}
	t += 400;
	const running = [];
	for (let i = nAgents - nRunning; i < nAgents; i++) running.push({ id: `call_${i}`, agent: AGENTS[i % AGENTS.length], i });
	let cycle = 0;
	const pump = () => {
		for (const r of running) {
			fire("tool_execution_update", {
				toolName: "task",
				toolCallId: r.id,
				partialResult: {
					details: { agent: r.agent, activity: ACTIVITIES[(r.i + cycle) % ACTIVITIES.length], turns: 2 + cycle, tokens: 9000 + cycle * 1400, model: "gpt-5.2" },
				},
			});
		}
	};
	at(t, pump);
	setInterval(() => {
		cycle++;
		pump();
	}, 1200);
	at(t + 6500, () => {
		const r = running.shift();
		if (r) fire("tool_execution_end", { toolName: "task", toolCallId: r.id, isError: false, result: { details: { turns: 9, tokens: 42000, model: "gpt-5.2" } } });
	});

	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on("data", (d) => view.handleInput(d.toString()));
	}
} else {
	fireAll();
	let view;
	await handlers["cmd:orchestra"]("", {
		mode: "tui",
		ui: {
			custom: async (factory) => {
				view = factory({ requestRender() {} }, theme, {}, () => {});
			},
			notify: () => {},
		},
	});

	const SEQ = { up: "\x1b[A", down: "\x1b[B", escape: "\x1b" };
	for (const k of keys) view.handleInput(SEQ[k] ?? k);

	// No trailing newline: the render exactly fills the pane, and one more line
	// would scroll the top rows (and the ↑ indicator) off the capture.
	process.stdout.write("\x1b[2J\x1b[H" + view.render(width).join("\r\n"));
	view.dispose();
}
