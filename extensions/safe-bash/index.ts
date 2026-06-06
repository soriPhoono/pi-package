/**
 * Safe Bash Extension
 *
 * Overrides the built-in `bash` tool with a safer version that asks for
 * permission before running dangerous commands. Provides a `/safe-bash`
 * command to manage configuration.
 *
 * How it works:
 * - Delegates actual execution to the built-in bash implementation
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
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
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
import { renderBashCall, renderBashResult, SafeBashResultDetails } from "./renderer.ts";

// ── Bash parameter schema (same as built-in) ──────────────────────────

const bashParameters = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
});

// ── Extension ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── State ────────────────────────────────────────────────────────
  const store = new SafeBashStore();
  let minSeverity: Severity = DEFAULT_MIN_SEVERITY;

  // Underlying bash implementation (all the real work)
  const realBash = createBashTool(process.cwd());

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

  // ── Override the bash tool ──────────────────────────────────────

  pi.registerTool({
    ...realBash,

    name: "bash",
    label: "bash (safe)",

    description:
      "Execute a bash command. This tool has built-in safety checks that ask for " +
      "confirmation before running potentially dangerous commands (e.g., rm -rf /, " +
      "sudo, disk operations, system control). Use /safe-bash to configure.",

    promptSnippet: "Execute bash commands with safety confirmation for dangerous operations",
    promptGuidelines: [
      "Use bash to execute shell commands, run scripts, and interact with the system.",
      "The safe-bash extension will prompt for confirmation before executing potentially dangerous commands like rm -rf, sudo, dd, mkfs, shutdown, piped shell installs, and more.",
    ],

    parameters: bashParameters,

    renderCall(args: any, theme: any) {
      return renderBashCall(args, theme);
    },

    renderResult(result: any, options: { expanded: boolean; isPartial: boolean }, theme: any) {
      return renderBashResult(result, options, theme);
    },

    async execute(
      toolCallId: string,
      params: { command: string; timeout?: number },
      signal: AbortSignal | undefined,
      onUpdate: ((update: { content?: unknown[]; details?: Record<string, unknown> }) => void) | undefined,
      ctx: { hasUI: boolean; ui: { select: (title: string, options: string[]) => Promise<string | undefined>; notify: (msg: string, level: "info" | "warning" | "error") => void } },
    ) {
      const command = params.command;
      const startTime = Date.now();

      // 1. Check for dangerous patterns
      const activePatterns = getActivePatterns();
      const match = !store.isAllowlisted(command)
        ? findMatchingPattern(command, activePatterns)
        : undefined;

      if (match) {
        // 2. Ask the user for permission
        const decision = await requestPermission(command, match, ctx);

        if (decision === "block") {
          return {
            content: [
              {
                type: "text",
                text: [
                  `❌ Command blocked by safe-bash extension.`,
                  `   Pattern: ${match.label}`,
                  `   Command: ${command}`,
                  `   To allow this command, run again and choose "Allow once" or "Always allow for this session".`,
                  `   To manage safety rules, use /safe-bash.`,
                ].join("\n"),
              },
            ],
            details: { blocked: true, command, reason: match.label } satisfies SafeBashResultDetails,
            isError: true,
          };
        }

        if (decision === "always") {
          store.addToAllowlist(pi as unknown as ExtensionAPI, command);
          ctx.ui.notify(`✅ "${match.label}" — allowed for this session`, "info");
          return realBash.execute(toolCallId, params, signal, onUpdate).then((res: any) => ({
            ...res,
            details: { ...res.details, allowed: true, reason: match.label } satisfies SafeBashResultDetails,
          }));
        }

        if (decision === "allow") {
          ctx.ui.notify(`⚠️  "${match.label}" — allowed once`, "warning");
          return realBash.execute(toolCallId, params, signal, onUpdate).then((res: any) => ({
            ...res,
            details: {
              ...res.details,
              warning: true,
              reason: match.label,
              elapsed: Date.now() - startTime,
            } satisfies SafeBashResultDetails,
          }));
        }
      }

      // 3. No match — execute normally
      return realBash.execute(toolCallId, params, signal, onUpdate).then((res: any) => ({
        ...res,
        details: { ...res.details, elapsed: Date.now() - startTime } satisfies SafeBashResultDetails,
      }));
    },
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

        store.addCustomPattern(pi as unknown as ExtensionAPI, { pattern: regex, label, severity });
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
        const removed = store.removeCustomPattern(pi as unknown as ExtensionAPI, customIdx);
        if (removed) {
          ctx.ui.notify(`🗑️  Removed custom pattern: ${removed.label}`, "info");
        }
        return;
      }

      if (subcommand === "clear") {
        store.clearAllowlist(pi as unknown as ExtensionAPI);
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
              store.addCustomPattern(pi as unknown as ExtensionAPI, deserializePattern(sp));
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
