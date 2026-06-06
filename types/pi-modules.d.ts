/**
 * Type declarations for pi runtime modules.
 * These packages are resolved at runtime by pi's jiti compiler
 * and are not available as installable type declarations.
 */

declare module "@earendil-works/pi-agent-core" {
	export interface AgentMessage {
		role: string;
		content: unknown;
		customType?: string;
	}
}

declare module "@earendil-works/pi-ai" {
	export interface AssistantMessage {
		role: "assistant";
		content: Array<{ type: string; text?: string }>;
		usage: { input: number; output: number; cost: { total: number } };
	}

	export interface TextContent {
		type: "text";
		text: string;
	}

	export function StringEnum<T extends readonly string[]>(
		values: T,
		options?: { description?: string },
	): { type: "string"; enum: T; description?: string };
}

declare module "@earendil-works/pi-coding-agent" {
	import type { AgentMessage } from "@earendil-works/pi-agent-core";
	import type { AssistantMessage } from "@earendil-works/pi-ai";

	export interface ExtensionAPI {
		registerFlag(name: string, options: {
			description: string;
			type: "boolean" | "string";
			default?: boolean | string;
		}): void;

		getFlag(name: string): boolean | string | undefined;

		registerCommand(name: string, options: {
			description: string;
			handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
		}): void;

		registerShortcut(shortcut: string, options: {
			description: string;
			handler: (ctx: ExtensionCommandContext) => Promise<void>;
		}): void;

		registerTool(tool: ToolDefinition): void;

		setActiveTools(tools: readonly string[]): void;

		getActiveTools(): string[];
		getAllTools(): ToolInfo[];

		appendEntry(customType: string, data?: Record<string, unknown>): void;

		sendMessage(message: {
			customType: string;
			content: string;
			display: boolean;
			details?: Record<string, unknown>;
		}, options?: { triggerTurn?: boolean; deliverAs?: string }): void;

		sendUserMessage(
			content: string | Array<{ type: string; text?: string; source?: Record<string, unknown> }>,
			options?: { deliverAs?: string },
		): void;

		on(event: string, handler: (...args: any[]) => unknown): void;

		events: {
			on(event: string, handler: (...args: unknown[]) => void): void;
			emit(event: string, ...args: unknown[]): void;
		};

		setSessionName(name: string): void;
		getSessionName(): string | undefined;
		setLabel(entryId: string, label: string | undefined): void;
	}

	export function createBashTool(cwd: string, options?: {
		spawnHook?: (opts: { command: string; cwd: string; env: Record<string, string | undefined> }) => {
			command: string;
			cwd: string;
			env: Record<string, string | undefined>;
		};
	}): BashTool;

	export interface BashTool {
		name: string;
		label: string;
		description: string;
		parameters: unknown;
		execute(
			toolCallId: string,
			params: { command: string; timeout?: number },
			signal: AbortSignal | undefined,
			onUpdate: ((update: { content?: unknown[]; details?: Record<string, unknown> }) => void) | undefined,
		): Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown>; isError?: boolean }>;
	}

	export interface ToolDefinition {
		name: string;
		label?: string;
		description: string;
		promptSnippet?: string;
		promptGuidelines?: string[];
		parameters: unknown;
		prepareArguments?(args: Record<string, unknown>): Record<string, unknown>;
		execute(
			toolCallId: string,
			params: Record<string, unknown>,
			signal: AbortSignal | undefined,
			onUpdate: ((update: { content?: unknown[]; details?: Record<string, unknown> }) => void) | undefined,
			ctx: ExtensionContext,
		): Promise<{ content: Array<{ type: string; text: string }>; details: Record<string, unknown>; isError?: boolean }>;
		renderCall?(args: Record<string, unknown>, theme: Theme, context: unknown): unknown;
		renderResult?(
			result: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown> },
			options: { expanded: boolean; isPartial: boolean },
			theme: Theme,
			context: unknown,
		): unknown;
	}

	export interface ToolInfo {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
		promptGuidelines?: string[];
		sourceInfo: { path: string; source: string; scope: string; origin: string };
	}

	export interface ExtensionContext {
		hasUI: boolean;
		cwd: string;
		signal?: AbortSignal;
		ui: ExtensionUI;
		sessionManager: SessionManager;
		model?: { id: string };
		modelRegistry?: { find(provider: string, model: string): unknown };
		isIdle(): boolean;
		abort(): void;
		hasPendingMessages(): boolean;
		getContextUsage(): { tokens: number } | undefined;
		getSystemPrompt(): string;
	}

	export interface ExtensionCommandContext extends ExtensionContext {
		waitForIdle(): Promise<void>;
		newSession(options?: {
			parentSession?: string;
			setup?: (sm: SessionManager) => Promise<void>;
			withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
		}): Promise<{ cancelled: boolean }>;
		fork(entryId: string, options?: {
			position?: "before" | "at";
			withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
		}): Promise<{ cancelled: boolean }>;
		navigateTree(targetId: string, options?: {
			summarize?: boolean;
			customInstructions?: string;
			replaceInstructions?: boolean;
			label?: string;
		}): Promise<unknown>;
		switchSession(sessionPath: string, options?: {
			withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
		}): Promise<{ cancelled: boolean }>;
		reload(): Promise<void>;
	}

	/**
	 * Context passed to withSession callbacks after session replacement
	 * (fork, newSession, switchSession). Extends ExtensionCommandContext
	 * with sendMessage/sendUserMessage helpers bound to the replacement session.
	 */
	export interface ReplacedSessionContext extends ExtensionCommandContext {
		sendMessage(message: {
			customType: string;
			content: string;
			display: boolean;
			details?: Record<string, unknown>;
		}, options?: { triggerTurn?: boolean; deliverAs?: string }): void;

		sendUserMessage(
			content: string | Array<{ type: string; text?: string; source?: Record<string, unknown> }>,
			options?: { deliverAs?: string },
		): void;

		setSessionName(name: string): void;
	}

	export interface ExtensionUI {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		confirm(title: string, message: string): Promise<boolean>;
		select(title: string, options: string[]): Promise<string | undefined>;
		input(prompt: string, defaultValue?: string): Promise<string | undefined>;
		editor(title: string, initialValue?: string): Promise<string | undefined>;
		setStatus(id: string, status: string | undefined): void;
		setWidget(id: string, lines: string[] | undefined): void;
		setFooter(footer: unknown): void;
		setTitle(title: string): void;
		setEditorText(text: string): void;
		custom<T>(factory: (
			tui: unknown,
			theme: Theme,
			kb: unknown,
			done: (result: T) => void,
		) => { render(width: number): string[]; invalidate(): void; handleInput(data: string): void }): Promise<T>;
		theme: Theme;
	}

	export interface Theme {
		fg(color: string, text: string): string;
		bg(color: string, text: string): string;
		bold(text: string): string;
		dim(text: string): string;
		muted(text: string): string;
		strikethrough(text: string): string;
		[color: string]: ((text: string) => string) | string | undefined;
	}

	export interface SessionManager {
		getEntries(): Array<{ type: string; customType?: string; message?: AgentMessage }>;
		getBranch(): Array<{ type: string; message: AgentMessage }>;
		getLeafId(): string | undefined;
		getSessionFile(): string | undefined;
		getSessionName(): string | undefined;
		getHeader(): { version: number; id: string; timestamp: string; cwd: string; parentSession?: string } | undefined;
		getLabel(entryId: string): string | undefined;
	}
}

declare module "@earendil-works/pi-tui" {
	export const Key: {
		ctrlAlt(key: string): string;
		shift(key: string): string;
		enter: string;
		escape: string;
		tab: string;
		up: string;
		down: string;
		left: string;
		right: string;
	};

	export function matchesKey(data: string, key: string): boolean;
	export function truncateToWidth(text: string, width: number): string;
	export function visibleWidth(text: string): number;

	export class Text {
		constructor(text: string, x?: number, y?: number);
	}

	export class Editor {
		constructor(tui: unknown, theme?: Record<string, unknown>);
		onSubmit: ((value: string) => void) | undefined;
		setText(text: string): void;
		getText(): string;
		handleInput(data: string): void;
		render(width: number): string[];
	}

	export interface AutocompleteItem {
		value: string;
		label: string;
	}
}
