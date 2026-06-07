/**
 * Safe Bash Extension
 *
 * Provides safety checks for bash commands by prompting for confirmation
 * before running dangerous commands. Uses the `tool_call` event to check
 * commands before execution.
 *
 * How it works:
 * - Listens to `tool_call` events for bash commands
 * - Scans each command against configurable dangerous patterns with
 *   three severity levels: "critical", "warn", and "info"
 * - Prompts the user for confirmation when a dangerous command is detected
 * - Supports "allow once" and "always allow for this session"
 * - In non-interactive mode (print/JSON), dangerous commands are blocked
 *   by default (configurable via severity threshold)
 * - State is persisted via pi.appendEntry and survives /reload and
 *   session restarts
 *
 * Commands:
 *   /safe-bash                    - Show current configuration and allowlist
 *   /safe-bash add                - Add a dangerous pattern interactively
 *   /safe-bash remove             - Remove a dangerous pattern interactively
 *   /safe-bash clear              - Clear the session allowlist
 *   /safe-bash severity <level>   - Set minimum severity threshold
 *   /safe-bash export             - Export configuration as JSON
 *   /safe-bash import <json>      - Import configuration from JSON string
 *
 * Installation:
 *   Place in `extensions/safe-bash/` directory and run `/reload` in pi.
 *
 * @module safe-bash
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  DangerPattern,
  Severity,
  DEFAULT_DANGER_PATTERNS,
  DEFAULT_MIN_SEVERITY,
  findMatchingPattern,
  isAtLeastSeverity,
  serializePattern,
  deserializePattern,
} from "./patterns.ts";
import { SafeBashStore } from "./persistence.ts";

// ── Extension ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── State ────────────────────────────────────────────────────────
  const store = new SafeBashStore();
  let minSeverity: Severity = DEFAULT_MIN_SEVERITY;

  // ── Helpers ──────────────────────────────────────────────────────

  /** Get all active patterns (defaults + custom), filtered by severity threshold. */
  function getActivePatterns(): DangerPattern[] {
    return store.getAllPatterns(DEFAULT_DANGER_PATTERNS)
      .filter((dp) => isAtLeastSeverity(dp.severity, minSeverity));
  }

  /** Decide permission: returns the decision string. */
  async function requestPermission(
    command: string,
    match: DangerPattern,
    ctx: { hasUI: boolean; ui: { select: (title: string, options: string[]) => Promise<string | undefined>; notify: (msg: string, level: "info" | "warning" | "error") => void } },
  ): Promise<"allow" | "always" | "block"> {
    if (!ctx.hasUI) {
      return "block";
    }

    const truncated = command.length > 200 ? command.slice(0, 200) + "…" : command;
    const severityIcon = match.severity === "critical" ? "🔴" : match.severity === "warn" ? "🟡" : "🔵";

    const choice = await ctx.ui.select(
      `${severityIcon}  ${match.label}\n\n  ${truncated}\n\nWhat would you like to do?`,
      ["Allow once", "Always allow for this session", "Block"],
    );

    if (choice === "Allow once") return "allow";
    if (choice === "Always allow for this session") return "always";
    return "block";
  }

  // ── Restore state on session start ───────────────────────────────

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    store.restore(ctx.sessionManager.getEntries());

    const allowlistCount = store.getAllowlist().length;
    const customPatternCount = store.getCustomPatterns().length;

    if (allowlistCount > 0 && ctx.ui?.notify) {
      ctx.ui.notify(`🔄 Restored ${allowlistCount} allowlisted command(s) from previous session`, "info");
    }
    if (customPatternCount > 0 && ctx.ui?.notify) {
      ctx.ui.notify(`🔄 Restored ${customPatternCount} custom pattern(s) from previous session`, "info");
    }
  });

  // ── Permission check before tool execution ───────────────────────

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string;
    const activePatterns = getActivePatterns();
    const match = !store.isAllowlisted(command)
      ? findMatchingPattern(command, activePatterns)
      : undefined;

    if (match) {
      const decision = await requestPermission(command, match, ctx);

      if (decision === "block") {
        return { block: true, reason: `Blocked by safe-bash: ${match.label}` };
      }

      if (decision === "always") {
        store.addToAllowlist(pi, command);
        ctx.ui.notify(`✅ "${match.label}" — allowed for this session`, "info");
      }

      if (decision === "allow") {
        ctx.ui.notify(`⚠️  "${match.label}" — allowed once`, "warning");
      }
    }

    return undefined;
  });

  // ── /safe-bash command ──────────────────────────────────────────

  pi.registerCommand("safe-bash", {
    description: "Show or manage safe-bash configuration",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const trimmed = (args ?? "").trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase() ?? "";

      if (subcommand === "add") {
        const rawPattern = await ctx.ui.input("Enter regex pattern:", "");
        if (!rawPattern) {
          ctx.ui.notify("Cancelled — no pattern entered", "info");
          return;
        }
        let regex: RegExp;
        try {
          regex = new RegExp(rawPattern, "i");
        } catch {
          ctx.ui.notify(`Invalid regex: ${rawPattern}`, "error");
          return;
        }
        const label = await ctx.ui.input("Enter label for this pattern:", "");
        if (!label) {
          ctx.ui.notify("Cancelled — no label entered", "info");
          return;
        }
        const severityChoice = await ctx.ui.select("Severity level:", ["critical", "warn", "info"]);
        const severity: Severity = (severityChoice as Severity) ?? "warn";

        store.addCustomPattern(pi, { pattern: regex, label, severity });
        ctx.ui.notify(`✅ Added pattern: ${label} (${severity})`, "info");
        return;
      }

      if (subcommand === "remove") {
        const allPatterns = store.getAllPatterns(DEFAULT_DANGER_PATTERNS);
        const names = allPatterns.map((dp, i) => {
          const sev = dp.severity === "critical" ? "🔴" : dp.severity === "warn" ? "🟡" : "🔵";
          return `${i}: ${sev} ${dp.label}`;
        });
        const choice = await ctx.ui.select("Select pattern to remove:", names);
        if (!choice) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
        const idx = parseInt(choice.split(":")[0], 10);
        const defaultsCount = DEFAULT_DANGER_PATTERNS.length;

        if (idx < defaultsCount) {
          const removed = DEFAULT_DANGER_PATTERNS[idx];
          ctx.ui.notify(
            `⚠️  "${removed.label}" is a built-in pattern and cannot be removed. ` +
            `Change the severity threshold with /safe-bash severity instead, ` +
            `or add an exclusion pattern.`,
            "warning",
          );
          return;
        }

        const customIdx = idx - defaultsCount;
        const removed = store.removeCustomPattern(pi, customIdx);
        if (removed) {
          ctx.ui.notify(`🗑️  Removed custom pattern: ${removed.label}`, "info");
        }
        return;
      }

      if (subcommand === "clear") {
        store.clearAllowlist(pi);
        ctx.ui.notify("🧹 Session allowlist cleared", "info");
        return;
      }

      if (subcommand === "severity") {
        const level = parts[1]?.toLowerCase();
        if (level && (level === "critical" || level === "warn" || level === "info")) {
          minSeverity = level;
          ctx.ui.notify(`✅ Minimum severity threshold set to: ${level}`, "info");
          return;
        }
        const choice = await ctx.ui.select(
          `Current minimum severity: ${minSeverity}. Select new threshold:`,
          ["critical", "warn", "info"],
        );
        if (choice) {
          minSeverity = choice as Severity;
          ctx.ui.notify(`✅ Minimum severity threshold set to: ${choice}`, "info");
        }
        return;
      }

      if (subcommand === "export") {
        const config = {
          version: 1,
          minSeverity,
          customPatterns: store.getCustomPatterns().map(serializePattern),
          allowlist: store.getAllowlist(),
        };
        const json = JSON.stringify(config, null, 2);
        ctx.ui.notify(`📋 Configuration:\n\n${json}`, "info");
        return;
      }

      if (subcommand === "import") {
        const json = parts.slice(1).join(" ") || await ctx.ui.input("Paste JSON configuration:", "");
        if (!json) {
          ctx.ui.notify("Cancelled — no config provided", "info");
          return;
        }
        try {
          const config = JSON.parse(json);
          if (config.version !== 1) {
            ctx.ui.notify("Unsupported config version", "error");
            return;
          }
          if (config.minSeverity) {
            minSeverity = config.minSeverity as Severity;
          }
          if (Array.isArray(config.customPatterns)) {
            for (const sp of config.customPatterns) {
              store.addCustomPattern(pi, deserializePattern(sp));
            }
          }
          ctx.ui.notify("✅ Configuration imported successfully", "info");
        } catch {
          ctx.ui.notify("Invalid JSON configuration", "error");
        }
        return;
      }

      // ── Default: show status ────────────────────────────────────────
      const allPatterns = store.getAllPatterns(DEFAULT_DANGER_PATTERNS);
      const activePatterns = getActivePatterns();
      const allowlistCount = store.getAllowlist().length;

      const criticalCount = allPatterns.filter((p) => p.severity === "critical").length;
      const warnCount = allPatterns.filter((p) => p.severity === "warn").length;
      const infoCount = allPatterns.filter((p) => p.severity === "info").length;

      const lines: string[] = [
        `╔═ safe-bash ═══════════════════════════╗`,
        `║  Total patterns:    ${String(allPatterns.length).padStart(3)} (🔴${criticalCount} 🟡${warnCount} 🔵${infoCount})`,
        `║  Active patterns:   ${String(activePatterns.length).padStart(3)} (threshold: ${minSeverity})`,
        `║  Session allowlist: ${String(allowlistCount).padStart(3)}`,
        `╚════════════════════════════════════════╝`,
        `  Commands:`,
        `    /safe-bash add          - Add a dangerous pattern`,
        `    /safe-bash remove       - Remove a custom pattern`,
        `    /safe-bash clear        - Clear the session allowlist`,
        `    /safe-bash severity     - Set minimum severity threshold`,
        `    /safe-bash export       - Export config as JSON`,
        `    /safe-bash import <json>- Import config from JSON`,
      ];

      if (store.getAllowlist().length > 0) {
        lines.push("", "Allowlisted commands:");
        for (const entry of store.getAllowlist()) {
          const truncated = entry.command.length > 100
            ? entry.command.slice(0, 100) + "…"
            : entry.command;
          const date = new Date(entry.timestamp).toLocaleTimeString();
          lines.push(`  • ${truncated} (${date})`);
        }
      }

      if (activePatterns.length > 0) {
        lines.push("", `Active patterns (${activePatterns.length}):`);
        const display = activePatterns.slice(0, 15);
        for (const dp of display) {
          const sev = dp.severity === "critical" ? "🔴" : dp.severity === "warn" ? "🟡" : "🔵";
          lines.push(`  ${sev} ${dp.label}`);
        }
        if (activePatterns.length > 15) {
          lines.push(`  … and ${activePatterns.length - 15} more`);
        }
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
