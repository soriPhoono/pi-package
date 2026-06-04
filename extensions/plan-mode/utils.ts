/**
 * Pure utility functions for the Plan Mode extension.
 * Extracted for testability and maintainability.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";

// ── Types ─────────────────────────────────────────────────────────────

export type PlanStepStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
	step: number;
	text: string;
	status: PlanStepStatus;
	level?: number;
}

// ── Type guards ──────────────────────────────────────────────────────

export function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

export function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

// ── Bash allowlist / blocklist ────────────────────────────────────────

/** Destructive commands blocked in plan mode */
export const DESTRUCTIVE_PATTERNS: RegExp[] = [
	/\brm\b/i, /\brmdir\b/i, /\bmv\b/i, /\bcp\b/i, /\bmkdir\b/i, /\btouch\b/i,
	/\bchmod\b/i, /\bchown\b/i, /\bchgrp\b/i, /\bln\b/i, /\btee\b/i,
	/\btruncate\b/i, /\bdd\b/i, /\bshred\b/i,
	/(^|[^<])>(?!>)/, />>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i, /\bsu\b/i, /\bkill\b/i, /\bpkill\b/i, /\bkillall\b/i,
	/\breboot\b/i, /\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];

/** Safe read-only commands allowed in plan mode */
export const SAFE_PATTERNS: RegExp[] = [
	/^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/, /^\s*less\b/, /^\s*more\b/,
	/^\s*grep\b/, /^\s*find\b/, /^\s*ls\b/, /^\s*pwd\b/, /^\s*echo\b/,
	/^\s*printf\b/, /^\s*wc\b/, /^\s*sort\b/, /^\s*uniq\b/, /^\s*diff\b/,
	/^\s*file\b/, /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/, /^\s*tree\b/,
	/^\s*which\b/, /^\s*whereis\b/, /^\s*type\b/, /^\s*env\b/, /^\s*printenv\b/,
	/^\s*uname\b/, /^\s*whoami\b/, /^\s*id\b/, /^\s*date\b/, /^\s*cal\b/,
	/^\s*uptime\b/, /^\s*ps\b/, /^\s*top\b/, /^\s*htop\b/, /^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i, /^\s*python\s+--version/i,
	/^\s*curl\s/i, /^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/, /^\s*sed\s+-n/i, /^\s*awk\b/,
	/^\s*rg\b/, /^\s*fd\b/, /^\s*bat\b/, /^\s*eza\b/,
];

export function isSafeCommand(command: string): boolean {
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p: RegExp) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p: RegExp) => p.test(command));
	return !isDestructive && isSafe;
}

// ── Todo item helpers ────────────────────────────────────────────────

/**
 * Clean step text by removing markdown formatting, leading verbs,
 * and truncating to a display-friendly length.
 */
export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(
			/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
			"",
		)
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

/**
 * Extract step status markers like [x], [~], [>] from the beginning of text.
 */
export function extractStatusMarker(text: string): { status: PlanStepStatus; cleanText: string } {
	const markerMatch = text.match(/^\s*\[([ x~>☐☑])]\s*/);
	if (markerMatch) {
		const marker = markerMatch[1];
		const cleanText = text.slice(markerMatch[0].length).trim();
		switch (marker) {
			case "x":
			case "☑":
				return { status: "completed", cleanText };
			case "~":
			case ">":
				return { status: "in_progress", cleanText };
			default:
				return { status: "pending", cleanText };
		}
	}
	return { status: "pending", cleanText: text };
}

/**
 * Extract todo items from a message containing a "Plan:" section.
 *
 * Supports multiple formats:
 * - Numbered: `1. step`, `1) step`
 * - Bullet: `- step`, `* step`
 * - Status markers: `[ ]`, `[x]`, `[~]`, `[>]`, `[☐]`, `[☑]`
 */
export function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];

	// Try to find a "Plan:" section header
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);

	// Pattern for numbered items: "1. text", "1) text"
	const numberedPattern = /^\s*(\d+)[.)]\s+(\*{0,2}(?:\[[ x~>☐☑ ]?\])?\s*\*{0,2}[^\n]+)/gm;

	let hasNumbered = false;
	for (const match of planSection.matchAll(numberedPattern)) {
		hasNumbered = true;
		const rawText = match[2].trim().replace(/\*{1,2}$/, "").trim();
		if (rawText.length > 5 && !rawText.startsWith("`") && !rawText.startsWith("/")) {
			const { status, cleanText } = extractStatusMarker(rawText);
			const cleaned = cleanStepText(cleanText);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, status });
			}
		}
	}

	// Fall back to bullets if no numbered items found
	if (!hasNumbered) {
		const bulletPattern = /^\s*[-*]\s+(\*{0,2}(?:\[[ x~>☐☑ ]?\])?\s*\*{0,2}[^\n]+)/gm;
		for (const match of planSection.matchAll(bulletPattern)) {
			const rawText = match[1].trim().replace(/\*{1,2}$/, "").trim();
			if (rawText.length > 5 && !rawText.startsWith("`") && !rawText.startsWith("/")) {
				const { status, cleanText } = extractStatusMarker(rawText);
				const cleaned = cleanStepText(cleanText);
				if (cleaned.length > 3) {
					items.push({ step: items.length + 1, text: cleaned, status });
				}
			}
		}
	}

	return items;
}

/**
 * Mark completed steps via [DONE:n] tags and in-progress steps via [WORKING:n] tags.
 * Returns the number of newly completed steps.
 */
export function markCompletedSteps(text: string, items: TodoItem[]): number {
	let count = 0;
	for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) {
			const item = items.find((t) => t.step === step);
			if (item && item.status !== "completed") {
				item.status = "completed";
				count++;
			}
		}
	}
	for (const match of text.matchAll(/\[WORKING:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) {
			const item = items.find((t) => t.step === step);
			if (item) {
				item.status = "in_progress";
			}
		}
	}
	return count;
}

/**
 * Parse numbered todo items (e.g. "1. ☐ First step\n2. ☐ Second step")
 * from the plan-todo-list message content.
 */
export function parseTodoListMessage(content: string): TodoItem[] {
	const items: TodoItem[] = [];
	const linePattern = /^\s*(\d+)\.\s+[☐○☑✓]\s+(.+)$/gm;
	for (const match of content.matchAll(linePattern)) {
		const text = match[2].trim().replace(/\*{1,2}/g, "").trim();
		if (text.length > 3) {
			items.push({ step: items.length + 1, text, status: "pending" });
		}
	}
	return items;
}

/**
 * Convert legacy `completed` boolean to `PlanStepStatus`.
 * Handles persisted state that was saved with the old `completed: boolean` format.
 */
export function normalizeTodoItem(
	item: { step: number; text: string; completed?: boolean; status?: PlanStepStatus; level?: number },
): TodoItem {
	return {
		step: item.step,
		text: item.text,
		status: item.status ?? (item.completed ? "completed" : "pending"),
		level: item.level,
	};
}

/**
 * Scan all assistant messages in entries for [DONE:n] markers
 * to rebuild completion state (used when execute marker was compacted).
 */
export function rebuildCompletionFromEntries(
	entries: Array<{ type: string; message?: AgentMessage }>,
	items: TodoItem[],
): void {
	for (const entry of entries) {
		if (entry.type === "message" && entry.message && isAssistantMessage(entry.message)) {
			const text = getTextContent(entry.message);
			markCompletedSteps(text, items);
		}
	}
}

// ── Tool sets ─────────────────────────────────────────────────────────

export const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"] as const;
export const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"] as const;
