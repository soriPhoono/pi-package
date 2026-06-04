/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis.
 * When enabled, only read-only tools are available.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle plan mode
 * - Bash restricted to allowlisted read-only commands
 * - Extracts numbered/bulleted plan steps from "Plan:" sections
 * - [DONE:n] markers to complete steps during execution
 * - [WORKING:n] markers to mark steps as in-progress
 * - Progress tracking widget with status indicator
 * - Session persistence (survives session resume, compaction, and /reload)
 * - Interactive /todos command with keyboard navigation
 * - plan_tool for LLM-driven plan manipulation (add, remove, reorder, update, set status)
 * - Support for bullet lists, status markers, and nested steps
 * - Custom rendering for plan_tool calls and results
 *
 * Commands:
 *   /plan         - Toggle plan mode
 *   /todos        - Show interactive plan progress
 *   Ctrl+Alt+P    - Toggle plan mode (shortcut)
 *
 * Usage:
 *   1. Enable plan mode with `/plan` or `--plan` flag
 *   2. Ask the agent to analyze code and create a plan
 *   3. The agent outputs a numbered plan under a "Plan:" header
 *   4. Choose "Execute the plan" when prompted
 *   5. During execution, the agent marks steps with [DONE:n] or [WORKING:n]
 *   6. Progress widget shows completion status
 *
 * Resilience:
 *   - State persisted on every mode change AND every turn_end
 *   - Before compaction, state re-persisted to survive the cut
 *   - On session_start, falls back to reconstructing state from:
 *       1. plan-mode custom entry (appendEntry — survives /reload)
 *       2. plan-todo-list and plan-mode-execute message entries
 *       3. Assistant messages with "Plan:" sections (most resilient)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
	isAssistantMessage,
	getTextContent,
	isSafeCommand,
	extractTodoItems,
	markCompletedSteps,
	parseTodoListMessage,
	rebuildCompletionFromEntries,
	normalizeTodoItem,
	PLAN_MODE_TOOLS,
	NORMAL_MODE_TOOLS,
	type TodoItem,
	type PlanStepStatus,
} from "./utils.ts";

// ── Extension ─────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let nextStepId = 1;

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ── UI Helpers ──────────────────────────────────────────────────

	function updateStatus(ctx: ExtensionContext): void {
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.status === "completed").length;
			const inProgress = todoItems.filter((t) => t.status === "in_progress").length;
			const label = inProgress > 0
				? `📋 ${completed}/${todoItems.length} ⏳${inProgress}`
				: `📋 ${completed}/${todoItems.length}`;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", label));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item: TodoItem) => {
				const indent = item.level ? "  ".repeat(item.level) : "";
				if (item.status === "completed") {
					return (
						ctx.ui.theme.fg("success", `${indent}☑ `) +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				if (item.status === "in_progress") {
					return ctx.ui.theme.fg("warning", `${indent}◐ `) + ctx.ui.theme.fg("accent", item.text);
				}
				return `${indent}${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];
		nextStepId = 1;

		if (planModeEnabled) {
			pi.setActiveTools([...PLAN_MODE_TOOLS]);
			// Register the plan_tool in plan mode so the LLM can create plans
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools([...NORMAL_MODE_TOOLS]);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}

		persistState();
		updateStatus(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems.map((t: TodoItem) => ({
				step: t.step,
				text: t.text,
				status: t.status,
				level: t.level,
			})),
			executing: executionMode,
			nextStepId,
		});
	}

	// ── Commands ────────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args: string, ctx: ExtensionContext) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show interactive plan progress",
		handler: async (_args: string, ctx: ExtensionContext) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}

			if (!ctx.hasUI) {
				const list = todoItems
					.map((item: TodoItem) => {
						const mark = item.status === "completed" ? "✓" : item.status === "in_progress" ? "◐" : "○";
						return `${item.step}. ${mark} ${item.text}`;
					})
					.join("\n");
				ctx.ui.notify(`Plan Progress:\n${list}`, "info");
				return;
			}

			// Interactive component with keyboard navigation
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				let cursorIndex = 0;
				let cachedWidth: number | undefined;
				let cachedLines: string[] | undefined;

				function handleInput(data: string): void {
					if (data === "\r" || data === "\n" || (data.length === 1 && data.charCodeAt(0) === 13)) {
						if (todoItems[cursorIndex]) {
							const item = todoItems[cursorIndex];
							item.status = item.status === "completed" ? "pending" : "completed";
							updateStatus(ctx);
							persistState();
							cachedLines = undefined;
							(_tui as { requestRender?: () => void }).requestRender?.();
						}
						return;
					}
					if (data === "\x1b[A" || data === "\x1bOA") {
						cursorIndex = Math.max(0, cursorIndex - 1);
						cachedLines = undefined;
						(_tui as { requestRender?: () => void }).requestRender?.();
						return;
					}
					if (data === "\x1b[B" || data === "\x1bOB") {
						cursorIndex = Math.min(todoItems.length - 1, cursorIndex + 1);
						cachedLines = undefined;
						(_tui as { requestRender?: () => void }).requestRender?.();
						return;
					}
					if (data === "\x1b" || data === "\x03") {
						done();
					}
				}

				function render(width: number): string[] {
					if (cachedLines && cachedWidth === width) return cachedLines;
					cachedWidth = width;

					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					const completed = todoItems.filter((t: TodoItem) => t.status === "completed").length;
					const inProg = todoItems.filter((t: TodoItem) => t.status === "in_progress").length;

					add(theme.fg("accent", "─".repeat(width)));
					add(
						` ${theme.fg("accent", "Plan Progress")}  ${theme.fg("muted", `${completed}/${todoItems.length} done`)}` +
						(inProg > 0 ? theme.fg("warning", ` · ${inProg} in progress`) : ""),
					);
					lines.push("");

					for (let i = 0; i < todoItems.length; i++) {
						const item = todoItems[i];
						const selected = i === cursorIndex;
						const prefix = selected ? theme.fg("accent", "▸ ") : "  ";
						const indent = item.level ? "  ".repeat(item.level) : "";

						let check: string;
						if (item.status === "completed") {
							check = theme.fg("success", "☑");
						} else if (item.status === "in_progress") {
							check = theme.fg("warning", "◐");
						} else {
							check = theme.fg("muted", "☐");
						}

						const stepNum = theme.fg("accent", `#${item.step}`);
						const text = item.status === "completed"
							? theme.fg("dim", theme.strikethrough(item.text))
							: theme.fg("text", item.text);

						add(`${prefix}${indent}${check} ${stepNum} ${text}`);
					}

					lines.push("");
					add(theme.fg("dim", " ↑↓ navigate · Enter toggle · Esc close"));
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => { cachedLines = undefined; },
					handleInput,
				};
			});
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx: ExtensionContext) => togglePlanMode(ctx),
	});

	// ── Plan Tool (LLM-callable) ────────────────────────────────────

	pi.registerTool({
		name: "plan_tool",
		label: "Plan Tool",
		description:
			"Manage the current plan. Actions: list, add_step, remove_step, reorder_steps, " +
			"update_step, set_step_status, create_from_text. " +
			"Use this to programmatically manage plan items without relying on message parsing.",
		promptSnippet: "Manage plan items (list, add, remove, reorder, update, set status, create from text)",
		promptGuidelines: [
			"Use plan_tool to programmatically manage plan items instead of relying on message-parsing heuristics.",
			"When creating a plan from text, use the create_from_text action to parse structured plan content.",
		],
		parameters: Type.Object({
			action: StringEnum(
				["list", "add_step", "remove_step", "reorder_steps", "update_step", "set_step_status", "create_from_text"] as const,
				{ description: "The plan management action to perform" },
			),
			step: Type.Optional(Type.Number({ description: "Step number for targeted actions" })),
			text: Type.Optional(Type.String({ description: "Step text (required for add_step, update_step, create_from_text)" })),
			status: Type.Optional(
				StringEnum(["pending", "in_progress", "completed"] as const, { description: "Target status for set_step_status" }),
			),
			stepOrder: Type.Optional(
				Type.Array(Type.Number(), { description: "New order of step numbers for reorder_steps" }),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { action: string; step?: number; text?: string; status?: PlanStepStatus; stepOrder?: number[] },
		) {
			switch (params.action) {
				case "list": {
					if (todoItems.length === 0) {
						return {
							content: [{ type: "text" as const, text: "No plan items. Create a plan first." }],
							details: { action: "list", todos: [], inExecution: executionMode },
						};
					}
					const list = todoItems
						.map(
							(t: TodoItem) =>
								`[${t.status === "completed" ? "x" : t.status === "in_progress" ? "~" : " "}] #${t.step}: ${t.text}`,
						)
						.join("\n");
					return {
						content: [{ type: "text" as const, text: `Plan (${todoItems.length} items):\n${list}` }],
						details: { action: "list", todos: [...todoItems], inExecution: executionMode },
					};
				}

				case "add_step": {
					if (!params.text) {
						return {
							content: [{ type: "text" as const, text: "Error: text required for add_step" }],
							details: { action: "add_step", error: "text required" },
						};
					}
					const newStep: TodoItem = { step: nextStepId++, text: params.text, status: "pending" };
					todoItems.push(newStep);
					persistState();
					return {
						content: [{ type: "text" as const, text: `Added step #${newStep.step}: ${newStep.text}` }],
						details: { action: "add_step", todo: newStep, todos: [...todoItems] },
					};
				}

				case "remove_step": {
					if (params.step === undefined) {
						return {
							content: [{ type: "text" as const, text: "Error: step number required for remove_step" }],
							details: { action: "remove_step", error: "step required" },
						};
					}
					const idx = todoItems.findIndex((t: TodoItem) => t.step === params.step);
					if (idx === -1) {
						return {
							content: [{ type: "text" as const, text: `Step #${params.step} not found` }],
							details: { action: "remove_step", error: `step #${params.step} not found` },
						};
					}
					const [removed] = todoItems.splice(idx, 1);
					persistState();
					return {
						content: [{ type: "text" as const, text: `Removed step #${removed.step}: ${removed.text}` }],
						details: { action: "remove_step", removed, todos: [...todoItems] },
					};
				}

				case "reorder_steps": {
					if (!params.stepOrder || params.stepOrder.length !== todoItems.length) {
						return {
							content: [{ type: "text" as const, text: `Error: stepOrder must have exactly ${todoItems.length} items` }],
							details: { action: "reorder_steps", error: "invalid stepOrder length" },
						};
					}
					const reordered: TodoItem[] = [];
					for (const s of params.stepOrder) {
						const found = todoItems.find((t: TodoItem) => t.step === s);
						if (!found) {
							return {
								content: [{ type: "text" as const, text: `Error: step #${s} not found in stepOrder` }],
								details: { action: "reorder_steps", error: `step #${s} not found` },
							};
						}
						reordered.push(found);
					}
					todoItems.length = 0;
					todoItems.push(...reordered);
					persistState();
					return {
						content: [{ type: "text" as const, text: `Reordered ${todoItems.length} steps` }],
						details: { action: "reorder_steps", todos: [...todoItems] },
					};
				}

				case "update_step": {
					if (params.step === undefined || !params.text) {
						return {
							content: [{ type: "text" as const, text: "Error: step and text required for update_step" }],
							details: { action: "update_step", error: "step and text required" },
						};
					}
					const target = todoItems.find((t: TodoItem) => t.step === params.step);
					if (!target) {
						return {
							content: [{ type: "text" as const, text: `Step #${params.step} not found` }],
							details: { action: "update_step", error: `step #${params.step} not found` },
						};
					}
					const oldText = target.text;
					target.text = params.text;
					persistState();
					return {
						content: [{ type: "text" as const, text: `Updated step #${target.step}: "${oldText}" → "${target.text}"` }],
						details: { action: "update_step", step: params.step, oldText, newText: params.text, todos: [...todoItems] },
					};
				}

				case "set_step_status": {
					if (params.step === undefined || !params.status) {
						return {
							content: [{ type: "text" as const, text: "Error: step and status required for set_step_status" }],
							details: { action: "set_step_status", error: "step and status required" },
						};
					}
					const statusTarget = todoItems.find((t: TodoItem) => t.step === params.step);
					if (!statusTarget) {
						return {
							content: [{ type: "text" as const, text: `Step #${params.step} not found` }],
							details: { action: "set_step_status", error: `step #${params.step} not found` },
						};
					}
					statusTarget.status = params.status;
					persistState();
					return {
						content: [{ type: "text" as const, text: `Step #${statusTarget.step} status → ${params.status}` }],
						details: { action: "set_step_status", step: params.step, status: params.status, todos: [...todoItems] },
					};
				}

				case "create_from_text": {
					if (!params.text) {
						return {
							content: [{ type: "text" as const, text: "Error: text required for create_from_text" }],
							details: { action: "create_from_text", error: "text required" },
						};
					}
					const parsed = extractTodoItems(params.text);
					if (parsed.length === 0) {
						return {
							content: [
								{
									type: "text" as const,
									text: "No plan items could be parsed. Ensure the text contains a 'Plan:' header with numbered or bulleted steps.",
								},
							],
							details: { action: "create_from_text", error: "no items parsed" },
						};
					}
					todoItems = parsed;
					nextStepId = parsed.length + 1;
					persistState();
					return {
						content: [{ type: "text" as const, text: `Created plan with ${parsed.length} steps from text.` }],
						details: { action: "create_from_text", todos: [...todoItems], count: parsed.length },
					};
				}

				default:
					return {
						content: [{ type: "text" as const, text: `Unknown action: ${params.action}` }],
						details: { action: "unknown" as const, error: `unknown action: ${params.action}` },
					};
			}
		},

		renderCall(args, theme, _context) {
			const action = args.action as string;
			const step = args.step as number | undefined;
			const text = args.text as string | undefined;

			let display = theme.fg("toolTitle", theme.bold("plan_tool ")) + theme.fg("muted", action);
			if (step !== undefined) display += ` ${theme.fg("accent", `#${step}`)}`;
			if (text) display += ` ${theme.fg("dim", `"${text.slice(0, 40)}"`)}`;

			return { type: "text", text: display };
		},

		renderResult(result, options, theme, _context) {
			const details = result.details;
			if (!details) {
				return { type: "text", text: result.content[0]?.text ?? "" };
			}

			if (details.error) {
				return { type: "text", text: theme.fg("error", `Error: ${details.error}`) };
			}

			const action = details.action as string;

			switch (action) {
				case "list": {
					const todos = details.todos as TodoItem[] | undefined;
					if (!todos || todos.length === 0) {
						return { type: "text", text: theme.fg("dim", "No plan items") };
					}
					const completed = todos.filter((t: TodoItem) => t.status === "completed").length;
					const inProg = todos.filter((t: TodoItem) => t.status === "in_progress").length;
					const status = `${completed}/${todos.length} done${inProg > 0 ? `, ${inProg} in progress` : ""}`;
					const displayTodos = options.expanded ? todos : todos.slice(0, 10);
					const lines = displayTodos
						.map((t: TodoItem) => {
							const check = t.status === "completed"
								? theme.fg("success", "✓")
								: t.status === "in_progress"
									? theme.fg("warning", "~")
									: theme.fg("dim", "○");
							const text = t.status === "completed" ? theme.fg("dim", t.text) : theme.fg("text", t.text);
							return `${check} ${theme.fg("accent", `#${t.step}`)} ${text}`;
						})
						.join("\n");
					const more = !options.expanded && todos.length > 10
						? `\n${theme.fg("dim", `... ${todos.length - 10} more`)}`
						: "";
					return { type: "text", text: `${theme.fg("muted", status)}\n${lines}${more}` };
				}
				case "add_step": {
					const todoDetails = details.todo as TodoItem | undefined;
					const stepNum = todoDetails?.step ?? "?";
					return { type: "text", text: theme.fg("success", "✓ Added step ") + theme.fg("accent", `#${stepNum}`) };
				}
				case "remove_step": {
					const removedDetails = details.removed as TodoItem | undefined;
					const stepNum = removedDetails?.step ?? "?";
					return { type: "text", text: theme.fg("warning", "✗ Removed step ") + theme.fg("accent", `#${stepNum}`) };
				}
				case "reorder_steps": {
					const todos = details.todos as TodoItem[] | undefined;
					return { type: "text", text: theme.fg("success", "✓ Reordered ") + theme.fg("accent", `${todos?.length ?? 0} steps`) };
				}
				case "update_step":
					return { type: "text", text: theme.fg("success", "✓ Updated step ") + theme.fg("accent", `#${details.step}`) };
				case "set_step_status":
					return {
						type: "text",
						text: theme.fg("success", `✓ Step #${details.step} → `) + theme.fg("accent", String(details.status)),
					};
				case "create_from_text":
					return { type: "text", text: theme.fg("success", `✓ Created plan with ${details.count} steps`) };
				default:
					return { type: "text", text: theme.fg("dim", String(action)) };
			}
		},
	});

	// ── Block destructive bash commands in plan mode ────────────────

	pi.on("tool_call", async (event: { toolName: string; input: { command?: string } }) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	}) as unknown as (...args: any[]) => unknown;

	// ── Filter out stale plan context when not in plan mode ─────────

	pi.on("context", async (event: { messages: AgentMessage[] }) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m: AgentMessage) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c: { type: string; text?: string }) => c.type === "text" && c.text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	}) as unknown as (...args: any[]) => unknown;

	// ── Inject plan/execution context before agent starts ──────────

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands
- The plan_tool is available to create and manage plans programmatically

Ask clarifying questions using the questionnaire tool.
Use brave-search skill via bash for web research.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

You can also use the plan_tool with create_from_text action to parse structured plan content.
Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t: TodoItem) => t.status !== "completed");
			const todoList = remaining.map((t: TodoItem) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.
Use [WORKING:n] to mark a step as currently in progress.
Use the plan_tool to dynamically update the plan as needed.`,
					display: false,
				},
			};
		}
	});

	// ── Re-persist state before compaction ──────────────────────────

	pi.on("session_before_compact", async () => {
		if (planModeEnabled || executionMode || todoItems.length > 0) {
			persistState();
		}
	});

	// ── Track progress after each turn ─────────────────────────────

	pi.on("turn_end", async (event: { message: AgentMessage }, ctx: ExtensionContext) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// ── Handle plan completion and plan mode UI ────────────────────

	pi.on("agent_end", async (event: { messages: AgentMessage[] }, ctx: ExtensionContext) => {
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t: TodoItem) => t.status === "completed")) {
				const completedList = todoItems.map((t: TodoItem) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				pi.setActiveTools([...NORMAL_MODE_TOOLS]);
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;
		const messages = event.messages;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(
			(m: AgentMessage) => isAssistantMessage(m),
		);
		if (lastAssistant) {
			const parsed = extractTodoItems(getTextContent(lastAssistant));
			if (parsed.length > 0) {
				todoItems = parsed;
				nextStepId = parsed.length + 1;
			}
		}

		if (todoItems.length > 0) {
			const todoListText = todoItems.map((t: TodoItem, i: number) => `${i + 1}. ☐ ${t.text}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}

		const choice = await ctx.ui.select("Plan mode - what next?", [
			todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			planModeEnabled = false;
			executionMode = todoItems.length > 0;
			pi.setActiveTools([...NORMAL_MODE_TOOLS]);
			updateStatus(ctx);

			const execMessage = todoItems.length > 0
				? `Execute the plan. Start with: ${todoItems[0].text}`
				: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
			persistState();
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	// ── Restore state on session start/resume/reload/compact ────────

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		// Source 2: Custom entry (primary persistence)
		const planModeEntry = entries
			.filter(
				(e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode",
			)
			.pop() as
			| {
					data?: {
						enabled: boolean;
						todos?: Array<{
							step: number;
							text: string;
							status?: PlanStepStatus;
							completed?: boolean;
							level?: number;
						}>;
						executing?: boolean;
						nextStepId?: number;
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			nextStepId = planModeEntry.data.nextStepId ?? 1;
			if (planModeEntry.data.todos) {
				todoItems = planModeEntry.data.todos.map(normalizeTodoItem);
			}
			executionMode = planModeEntry.data.executing ?? executionMode;
		}

		// Source 3: Reconstruct from message entries
		if (!planModeEntry?.data) {
			let foundState = false;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as {
					type: string;
					customType?: string;
					message?: { content?: string | Array<{ text?: string }> };
				};

				if (entry.customType === "plan-mode-execute") {
					executionMode = true;
					planModeEnabled = false;
					foundState = true;
				}

				if (entry.customType === "plan-todo-list" && entry.message) {
					const content =
						typeof entry.message.content === "string"
							? entry.message.content
							: Array.isArray(entry.message.content)
								? entry.message.content.map((b) => (typeof b === "string" ? b : b.text ?? "")).join("\n")
								: "";

					if (content) {
						const parsed = parseTodoListMessage(content);
						if (parsed.length > 0) {
							todoItems = parsed;
							nextStepId = parsed.length + 1;
							foundState = true;
							if (executionMode) break;
						}
					}
				}

				if (foundState && executionMode && todoItems.length > 0) break;
			}

			if (todoItems.length === 0 && !executionMode && !planModeEnabled) {
				for (let i = entries.length - 1; i >= 0; i--) {
					const entry = entries[i] as { type: string; message?: AgentMessage };
					if (entry.type === "message" && entry.message && isAssistantMessage(entry.message)) {
						const text = getTextContent(entry.message);
						const extracted = extractTodoItems(text);
						if (extracted.length > 0) {
							todoItems = extracted;
							nextStepId = extracted.length + 1;
							break;
						}
					}
				}
			}
		}

		// Rebuild completion state from messages
		if (executionMode && todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			if (executeIndex >= 0) {
				for (let i = executeIndex + 1; i < entries.length; i++) {
					const entry = entries[i] as { type: string; message?: AgentMessage };
					if (entry.type === "message" && entry.message && isAssistantMessage(entry.message)) {
						const text = getTextContent(entry.message);
						markCompletedSteps(text, todoItems);
					}
				}
			} else {
				rebuildCompletionFromEntries(entries, todoItems);
			}
		}

		if (planModeEnabled) {
			pi.setActiveTools([...PLAN_MODE_TOOLS]);
		}
		updateStatus(ctx);
	});
}
