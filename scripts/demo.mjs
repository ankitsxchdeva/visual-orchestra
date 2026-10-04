// Demo harness: drives the extension with synthetic tool events and prints
// one render to stdout. No model calls, no subprocesses — for tmux screenshot
// pipelines and manual layout checks.
// Usage: node scripts/demo.mjs [--agents N] [--running K] [--keys j,j,up] [--width W]
// Keys: j/k literals, or up/down/escape (mapped to terminal sequences).
import ext from "../index.ts";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? dflt : args[i + 1];
};
const nAgents = Number(opt("agents", 8));
const nRunning = Number(opt("running", 3));
const keys = opt("keys", "").split(",").filter(Boolean);
const width = Number(opt("width", process.stdout.columns ?? 100));

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
