/**
 * BTW (By The Way) Extension
 *
 * Spin off a **truly concurrent** chat thread at the current context window
 * point, inspired by Claude Code's /btw command.
 *
 * ## How it works
 *
 *   /btw <message>
 *     Sends a user message telling the LLM to call the built-in `subagent`
 *     tool with `agent="delegate"`, `context="fork"`, and `async=true`.
 *     The subagent forks the current conversation context and processes
 *     your question in the **background** — the main conversation continues
 *     uninterrupted. When the background task finishes, a notification
 *     appears inline with the result preview.
 *
 *   /btw-back
 *     Navigate back to the parent session (the session you forked from).
 *     Works with any session that has a `parentSession` header — /btw,
 *     /fork, /clone, and pi.newSession() all set this field.
 *
 * ## UX notes
 *
 * - After /btw you stay in the main conversation — truly concurrent.
 * - The subagent result appears as a notification when complete.
 * - Use /resume, /tree, or the session path from the notification to
 *   browse the full subagent conversation.
 *
 * @module btw
 */

import type { ExtensionAPI, ReplacedSessionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// ── /btw ──────────────────────────────────────────────────────────

	pi.registerCommand("btw", {
		description:
			"Spin off a concurrent chat thread — forks context and processes in background",
		handler: async (args, ctx) => {
			const message = args.trim();

			if (!message) {
				ctx.ui.notify("Usage: /btw <message>", "warning");
				return;
			}

			ctx.ui.notify("⟳ Spawning concurrent background task…", "info");

			// Tell the LLM to use the subagent tool with forked context.
			// The subagent runs in the background (async=true) while the
			// main conversation continues uninterrupted.
			const prompt =
				`[BTW] Use the \`subagent\` tool to fork this conversation context ` +
				`and process the following in the background:\n` +
				`- agent: delegate\n` +
				`- context: fork\n` +
				`- async: true\n` +
				`\n${message}`;

			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
			} else {
				// Agent is mid-response — interrupt and steer
				pi.sendUserMessage(prompt, { deliverAs: "steer" });
			}
		},
	});

	// ── /btw-back ─────────────────────────────────────────────────────
	// Used when the user has navigated into a forked session (via /tree,
	// /resume, or by switching to a subagent session) and wants to go back
	// to the parent session.

	pi.registerCommand("btw-back", {
		description: "Navigate back to the parent session you forked from",
		handler: async (_args, ctx) => {
			const header: { parentSession?: string } | undefined =
				(ctx.sessionManager as any).getHeader?.();

			const parentSession: string | undefined = header?.parentSession;

			if (!parentSession) {
				ctx.ui.notify(
					"This session has no parent " +
					"(it wasn't created via /btw, /fork, or /clone)",
					"info",
				);
				return;
			}

			ctx.ui.notify("⟳ Switching back to parent session…", "info");

			const result = await ctx.switchSession(parentSession, {
				withSession: async (switchedCtx: ReplacedSessionContext) => {
					switchedCtx.ui.notify(
						"Back to parent session (use /tree or /resume to navigate sessions)",
						"info",
					);
				},
			});

			if (result.cancelled) {
				ctx.ui.notify("Switch to parent session was cancelled", "warning");
			}
		},
	});
}
