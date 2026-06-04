/**
 * Safe Bash Extension
 *
 * Overrides the built-in `bash` tool with a safer version that asks for
 * permission before running dangerous commands. Provides a `/safe-bash`
 * command to manage configuration.
 *
 * How it works:
 * - Delegates actual execution to the built-in bash implementation
 * - Scans each command against configurable dangerous patterns
 * - Prompts the user for confirmation when a dangerous command is detected
 * - Supports "allow once" and "always allow for this session"
 * - In non-interactive mode (print/JSON), dangerous commands are blocked by default
 *
 * Installation:
 *   Place in `.pi/extensions/safe-bash.ts` and run `/reload` in pi.
 *
 * Commands:
 *   /safe-bash         - Show current configuration and allowlist
 *   /safe-bash add     - Add a dangerous pattern interactively
 *   /safe-bash remove  - Remove a dangerous pattern interactively
 *   /safe-bash clear   - Clear the session allowlist
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── Dangerous command patterns ────────────────────────────────────────
// Each pattern is a RegExp matched against the full command string.
// The label is shown to the user in the confirmation prompt.

interface DangerPattern {
  pattern: RegExp;
  label: string;
}

const DEFAULT_DANGER_PATTERNS: DangerPattern[] = [
  // Destructive recursive deletes
  { pattern: /\brm\s+-rf\s+\/\s*$/i, label: "Recursive delete of root (rm -rf /)" },
  { pattern: /\brm\s+-rf\s+\/\*/i, label: "Recursive delete of all files under root" },
  { pattern: /\brm\s+-rf\s+~(?:\s|$)/i, label: "Recursive delete of home directory" },

  // Privilege escalation
  { pattern: /\bsudo\b/i, label: "Command runs with sudo" },

  // Direct disk writes and low-level operations
  { pattern: /\bdd\b/i, label: "Low-level disk write (dd)" },
  { pattern: /\bmkfs\b/i, label: "Filesystem creation (mkfs)" },
  { pattern: /\bfdisk\b/i, label: "Partition table manipulation (fdisk)" },
  { pattern: /\bparted\b/i, label: "Partition manipulation (parted)" },
  { pattern: /(?:^|[\|;&&])\s*[>]+\s*\/dev\/(?:sd|nvme|mmcblk|loop)/i, label: "Direct disk write to /dev/" },

  // Security-sensitive permission changes
  { pattern: /\bchmod\b.*\b777\b/i, label: "World-writable permissions (chmod 777)" },
  { pattern: /\bchown\b/i, label: "File ownership change (chown)" },

  // System control
  { pattern: /\bshutdown\b/i, label: "System shutdown" },
  { pattern: /\breboot\b/i, label: "System reboot" },
  { pattern: /\bpoweroff\b/i, label: "System power off" },
  { pattern: /\binit\s+[06]\b/i, label: "System halt or reboot (init)" },

  // Piped shell execution (common attack vector)
  { pattern: /(?:curl|wget)\s+.*?(?:\||\bpipe\b)\s*(?:sh|bash)\b/i, label: "Piped download to shell (curl|wget ... | sh)" },

  // Fork bomb
  { pattern: /:\(\s*\)\s*\{[^}]*\}[\s;]*:/i, label: "Fork bomb pattern" },
];

// ── Bash parameter schema (same as built-in) ──────────────────────────
// We re-define it here so the LLM knows the signature even though we
// delegate to the real bash tool.

const bashParameters = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
});

// ── Extension ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Mutable copy so the user can add/remove patterns at runtime
  const dangerPatterns: DangerPattern[] = [...DEFAULT_DANGER_PATTERNS];

  // Session-level allowlist of command strings that were "always allow"ed
  const allowlist: string[] = [];

  // Underlying bash implementation (all the real work)
  const realBash = createBashTool(process.cwd());

  // ── Helpers ────────────────────────────────────────────────────────

  /** Check if a command matches any dangerous pattern. */
  function findMatchingPattern(command: string): DangerPattern | undefined {
    return dangerPatterns.find((dp) => dp.pattern.test(command));
  }

  /** Check if a command has been permanently allowed this session. */
  function isAllowlisted(command: string): boolean {
    return allowlist.some((allowed) => command.startsWith(allowed));
  }

  /** Decide permission: returns true if the tool should proceed, false if blocked. */
  async function requestPermission(command: string, ctx: {
    hasUI: boolean;
    ui: {
      select: (title: string, options: string[]) => Promise<string | undefined>;
      notify: (msg: string, level: "info" | "warning" | "error") => void;
    };
  }): Promise<"allow" | "always" | "block"> {
    if (!ctx.hasUI) {
      // Non-interactive mode: always block dangerous commands
      return "block";
    }

    const truncated =
      command.length > 200 ? command.slice(0, 200) + "…" : command;

    const choice = await ctx.ui.select(
      `⚠️  Dangerous command detected:\n\n  ${truncated}\n\nWhat would you like to do?`,
      ["Allow once", "Always allow for this session", "Block"],
    );

    if (choice === "Allow once") return "allow";
    if (choice === "Always allow for this session") return "always";
    return "block";
  }

  // ── Override the bash tool ────────────────────────────────────────

  pi.registerTool({
    // Spread everything from the real bash tool (parameters, renderers, etc.)
    ...realBash,

    // Name must match "bash" to override the built-in
    name: "bash",
    label: "bash (safe)",

    description:
      "Execute a bash command. This tool has built-in safety checks that ask for " +
      "confirmation before running potentially dangerous commands (e.g., rm -rf /, " +
      "sudo, disk operations, system control). Use /safe-bash to configure.",

    // Prompt metadata — MUST be set explicitly; built-in prompt metadata is
    // NOT inherited when overriding.
    promptSnippet: "Execute bash commands with safety confirmation for dangerous operations",
    promptGuidelines: [
      "Use bash to execute shell commands, run scripts, and interact with the system.",
      "The safe-bash extension will prompt for confirmation before executing potentially dangerous commands like rm -rf, sudo, dd, mkfs, shutdown, piped shell installs, and more.",
    ],

    parameters: bashParameters,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const command = params.command;

      // 1. Check for dangerous patterns
      const match = !isAllowlisted(command) ? findMatchingPattern(command) : undefined;

      if (match) {
        // 2. Ask the user for permission
        const decision = await requestPermission(command, ctx);

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
            details: { blocked: true, command, reason: match.label },
            isError: true,
          };
        }

        if (decision === "always") {
          // Add to allowlist so subsequent runs skip the prompt
          allowlist.push(command);
          ctx.ui.notify(`✅ "${match.label}" — allowed for this session`, "info");
        }

        if (decision === "allow") {
          ctx.ui.notify(`⚠️  "${match.label}" — allowed once`, "warning");
        }
      }

      // 3. Execute via the real bash tool (handles truncation, timeouts, etc.)
      return realBash.execute(toolCallId, params, signal, onUpdate);
    },
  });

  // ── /safe-bash command ────────────────────────────────────────────

  pi.registerCommand("safe-bash", {
    description: "Show or manage safe-bash configuration",
    handler: async (args, ctx) => {
      const trimmed = (args ?? "").trim();

      if (trimmed === "add") {
        // Interactive: add a new dangerous pattern
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
        dangerPatterns.push({ pattern: regex, label });
        ctx.ui.notify(`✅ Added pattern: ${label}`, "info");
        return;
      }

      if (trimmed === "remove") {
        // Interactive: select a pattern to remove
        const names = dangerPatterns.map((dp, i) => `${i}: ${dp.label}`);
        const choice = await ctx.ui.select("Select pattern to remove:", names);
        if (!choice) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
        const idx = parseInt(choice.split(":")[0], 10);
        const removed = dangerPatterns.splice(idx, 1);
        ctx.ui.notify(`🗑️  Removed pattern: ${removed[0]?.label}`, "info");
        return;
      }

      if (trimmed === "clear") {
        allowlist.length = 0;
        ctx.ui.notify("🧹 Session allowlist cleared", "info");
        return;
      }

      // Default: show status
      const patternCount = dangerPatterns.length;
      const allowlistCount = allowlist.length;
      const lines: string[] = [
        `╔═ safe-bash ═══════════════════════`,
        `║  Dangerous patterns: ${patternCount}`,
        `║  Session allowlist:  ${allowlistCount}`,
        `╚═══════════════════════════════════`,
      ];

      if (allowlistCount > 0) {
        lines.push("", "Allowlisted commands:");
        for (const cmd of allowlist) {
          const truncated = cmd.length > 100 ? cmd.slice(0, 100) + "…" : cmd;
          lines.push(`  • ${truncated}`);
        }
      }

      if (patternCount > 0) {
        lines.push("", "Dangerous patterns (first 10):");
        for (const dp of dangerPatterns.slice(0, 10)) {
          lines.push(`  • ${dp.label}`);
        }
        if (patternCount > 10) {
          lines.push(`  … and ${patternCount - 10} more`);
        }
      }

      lines.push("", "Commands:", '  /safe-bash add     - add a new dangerous pattern', '  /safe-bash remove  - remove a dangerous pattern', '  /safe-bash clear   - clear the session allowlist');

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
