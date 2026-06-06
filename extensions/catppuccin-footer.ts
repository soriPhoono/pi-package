/**
 * Catppuccin Footer Extension
 *
 * A richly styled custom footer with Nerd Font icons showing model info,
 * git branch, token usage, cost, and extension statuses.
 *
 * Icons used (Nerd Font):
 *     nf-oct-terminal       — model name
 *     nf-oct-git_branch     — git branch
 *   󰘦  nf-cod-arrow_up       — input tokens ↑
 *   󰘥  nf-cod-arrow_down     — output tokens ↓
 *     nf-fa-file_o          — session file
 *     nf-fa-gears           — tools/status
 *     nf-fa-checklist       — turn count
 *     nf-fa-cog             — settings
 *     nf-fa-check           — checkmark
 *     nf-fa-question_circle — help hint
 *     nf-fa-dollar          — cost/money
 *     nf-fa-bolt            — active/power
 *     nf-fa-circle          — status dot
 *
 * Usage: add to package.json extensions array or load with --extension
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ── Nerd Font Icons ──────────────────────────────────────────────────────────
const ICON = {
	terminal:  "\uF489", // 
	gitBranch: "\uF418", // 
	arrowUp:   "\uE626", // 󰘦
	arrowDown: "\uE625", // 󰘥
	file:      "\uF15B", // 
	gears:     "\uF085", // 
	checklist: "\uF0CA", // 
	cog:       "\uF013", // 
	check:     "\uF00C", // 
	help:      "\uF059", // 
	clock:     "\uF1EA", // 
	dollar:    "\uF155", // 
	bolt:      "\uF0E7", // 
	star:      "\uF005", // 
	circle:    "\uF111", // 
} as const;

export default function (pi: ExtensionAPI) {
	let cmdRegistered = false;
	let footerInstalled = false;

	pi.on("session_start", async (_event, ctx) => {
		// ── Toggle command (registered once globally) ────────────────
		if (!cmdRegistered) {
			cmdRegistered = true;

			// Track whether the custom footer is currently installed.
			// ctx2.ui.setFooter.length always returns 1 (the function's arity),
			// so we cannot use that to check state. Track it explicitly instead.
			pi.registerCommand("catppuccin-footer", {
				description: "Toggle the Catppuccin custom footer on/off",
				handler: async (_args, ctx2) => {
					if (footerInstalled) {
						ctx2.ui.setFooter(undefined);
						footerInstalled = false;
						ctx2.ui.notify(`${ICON.check} Default footer restored`, "info");
					} else {
						installFooter(ctx2);
						footerInstalled = true;
						ctx2.ui.notify(`${ICON.bolt} Catppuccin footer enabled`, "info");
					}
				},
			});
		}

		installFooter(ctx);
		footerInstalled = true;
	});
}

function installFooter(ctx: ExtensionContext): void {
	ctx.ui.setFooter((tui, theme, footerData) => {
		const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

		return {
			dispose: () => {
				unsubBranch();
			},
			invalidate() {},
			render(width: number): string[] {
				// ── Compute token usage & turn count from session ──────
				let input = 0;
				let output = 0;
				let cost = 0;
				let turnCount = 0;
				for (const entry of ctx.sessionManager.getBranch()) {
					if (entry.type === "message" && entry.message.role === "assistant") {
						const m = entry.message as AssistantMessage;
						input  += m.usage.input;
						output += m.usage.output;
						cost   += m.usage.cost.total;
						turnCount++;
					}
				}

				// ── Gather data ────────────────────────────────────────
				const branch   = footerData.getGitBranch();
				const modelId  = ctx.model?.id ?? "no-model";
				const statuses = footerData.getExtensionStatuses();

				// ── Format numbers ─────────────────────────────────────
				const fmt = (n: number): string =>
					n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;

				// ── Build left section: model + git branch ─────────────
				const modelStr = `${ICON.terminal} ${modelId}`;
				const branchStr = branch
					? `  ${ICON.gitBranch} ${branch}`
					: "";
				const left = theme.fg("accent", modelStr) + theme.fg("dim", branchStr);

				// ── Build centre section: tokens & cost ────────────────
				const tokenStr =
					theme.fg("success", `${ICON.arrowUp}${fmt(input)}`) +
					theme.fg("dim", " ") +
					theme.fg("warning", `${ICON.arrowDown}${fmt(output)}`) +
					theme.fg("dim", "  ") +
					theme.fg("muted", `${ICON.dollar}${cost.toFixed(4)}`);

				// ── Build right section: turn count + statuses ─────────
				const turnStr = `${ICON.checklist} ${turnCount}`;
				const activeStatuses = Array.from(statuses.entries())
					.filter(([_, v]) => v && v.length > 0)
					.slice(0, 3);
				const statusStr =
					activeStatuses.length > 0
						? theme.fg("dim", " │ ") +
						  activeStatuses.map(([_, v]) => v).join(theme.fg("dim", " │ "))
						: "";

				const right = theme.fg("muted", turnStr) + statusStr;

				// ── Assemble the footer line with balanced spacing ─────
				const leftW  = visibleWidth(left);
				const midW   = visibleWidth(tokenStr);
				const rightW = visibleWidth(right);

				const padding = width - leftW - midW - rightW;
				const gapL = Math.max(1, Math.floor(padding / 2));
				const gapR = Math.max(0, padding - gapL);

				const line =
					left +
					theme.fg("dim", " ".repeat(gapL)) +
					tokenStr +
					theme.fg("dim", " ".repeat(gapR)) +
					right;

				return [truncateToWidth(line, width)];
			},
		};
	});
}
