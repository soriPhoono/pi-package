/**
 * Safe Bash — Custom TUI Rendering
 *
 * Provides custom renderCall and renderResult for the overridden bash tool,
 * giving visual feedback when a command is blocked, allowed once, or
 * always allowed.
 */

import { Text } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

// ── Icons (Nerd Font) ─────────────────────────────────────────────────

const ICON = {
  terminal: "\uF489",   //   nf-oct-terminal
  check:    "\uF00C",   //   nf-fa-check
  cross:    "\uF00D",   //   nf-fa-times
  warning:  "\uF071",   //   nf-fa-warning
  shield:   "\uF132",   //   nf-fa-shield
  lock:     "\uF023",   //   nf-fa-lock
  flash:    "\uF0E7",   //   nf-fa-bolt
  clock:    "\uF252",   //   nf-fa-hourglass
} as const;

// ── Render helpers ────────────────────────────────────────────────────

export function renderBashCall(
  args: Record<string, unknown>,
  theme: Theme,
): Text {
  const command = (args.command as string) ?? "";
  const truncated = command.length > 80 ? command.slice(0, 80) + "…" : command;

  const display =
    theme.fg("toolTitle", theme.bold(`${ICON.terminal} bash `)) +
    theme.fg("text", `"${truncated}"`);

  return new Text(display, 0, 0);
}

export interface SafeBashResultDetails {
  blocked?: boolean;
  warning?: boolean;
  allowed?: boolean;
  reason?: string;
  command?: string;
  elapsed?: number;
}

export function renderBashResult(
  result: { content: Array<{ type: string; text: string }>; details?: Record<string, unknown>; isError?: boolean },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  const details = result.details as SafeBashResultDetails | undefined;

  // Streaming / in-progress
  if (options.isPartial) {
    return new Text(theme.fg("muted", `${ICON.clock} Running…`), 0, 0);
  }

  // Blocked by safe-bash
  if (details?.blocked) {
    let line =
      theme.fg("error", `${ICON.lock} Blocked`) +
      theme.fg("dim", ` — ${details.reason ?? "dangerous command"}`);

    if (options.expanded && details.command) {
      line += `\n${theme.fg("dim", "  Command: ")}${theme.fg("text", details.command)}`;
      line += `\n${theme.fg("dim", "  Tip: Use /safe-bash to manage safety rules")}`;
      line += `\n${theme.fg("dim", '  Tip: Rerun and choose "Allow once" to bypass')}`;
    }

    return new Text(line, 0, 0);
  }

  // Allowed once (warning state)
  if (details?.warning) {
    let line =
      theme.fg("warning", `${ICON.warning} Allowed once`) +
      theme.fg("dim", ` — ${details.reason ?? ""}`);

    if (options.expanded && details.command) {
      line += `\n${theme.fg("dim", "  Command: ")}${theme.fg("text", details.command)}`;
    }

    return new Text(line, 0, 0);
  }

  // Error (unspecified)
  if (result.isError && !details?.blocked) {
    return new Text(
      theme.fg("error", `${ICON.cross} Error`) +
        theme.fg("dim", ` — ${result.content[0]?.text ?? "unknown error"}`),
      0,
      0,
    );
  }

  // Success
  let line = theme.fg("success", `${ICON.check} Done`);

  if (details?.allowed) {
    line = theme.fg("warning", `${ICON.shield} Allowed`) + theme.fg("dim", ` — ${details.reason ?? ""}`);
  }

  if (details?.elapsed !== undefined && details.elapsed > 1000) {
    line += theme.fg("dim", ` (${(details.elapsed / 1000).toFixed(1)}s)`);
  }

  // In expanded view, show the output preview
  const firstLine = result.content[0]?.text ?? "";
  if (options.expanded && firstLine) {
    const previewLines = firstLine.split("\n").slice(0, 5);
    for (const l of previewLines) {
      line += `\n${theme.fg("dim", l)}`;
    }
    if (firstLine.split("\n").length > 5) {
      line += `\n${theme.fg("muted", "...")}`;
    }
  }

  return new Text(line, 0, 0);
}
