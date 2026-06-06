/**
 * Safe Bash — State Persistence
 *
 * Manages persistence of the session allowlist and custom patterns
 * using pi's appendEntry API. Survives /reload and session restarts
 * (but not session deletion).
 */

import type { ExtensionAPI, ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { DangerPattern, serializePattern, deserializePattern, SerializedPattern } from "./patterns.ts";

// ── State types ───────────────────────────────────────────────────────

export interface AllowlistEntry {
  /** The exact command string that was allowlisted. */
  command: string;
  /** When the entry was created (epoch ms). */
  timestamp: number;
}

export interface SafeBashState {
  /** Session allowlist entries. */
  allowlist: AllowlistEntry[];
  /** User-added custom patterns (not in the defaults). */
  customPatterns: DangerPattern[];
}

// ── Constants ─────────────────────────────────────────────────────────

const ALLOWLIST_ENTRY_TYPE = "safe-bash-allowlist";
const PATTERNS_ENTRY_TYPE = "safe-bash-patterns";

// ── State manager ─────────────────────────────────────────────────────

export class SafeBashStore {
  private allowlist: AllowlistEntry[] = [];
  private customPatterns: DangerPattern[] = [];

  /** Restore state from session entries. */
  restore(entries: ReturnType<SessionManager["getEntries"]>): void {
    // Collect the latest allowlist entry
    const allowlistEntry = entries
      .filter((e) => e.type === "custom" && e.customType === ALLOWLIST_ENTRY_TYPE)
      .pop() as { data?: { commands?: AllowlistEntry[] } } | undefined;

    if (allowlistEntry?.data?.commands) {
      this.allowlist = allowlistEntry.data.commands;
    }

    // Collect the latest custom patterns entry
    const patternEntry = entries
      .filter((e) => e.type === "custom" && e.customType === PATTERNS_ENTRY_TYPE)
      .pop() as { data?: { patterns?: SerializedPattern[] } } | undefined;

    if (patternEntry?.data?.patterns) {
      this.customPatterns = patternEntry.data.patterns.map(deserializePattern);
    }
  }

  /** Persist allowlist to session state (through pi.appendEntry). */
  saveAllowlist(pi: ExtensionAPI): void {
    pi.appendEntry(ALLOWLIST_ENTRY_TYPE, {
      commands: this.allowlist,
    });
  }

  /** Persist custom patterns to session state. */
  saveCustomPatterns(pi: ExtensionAPI): void {
    pi.appendEntry(PATTERNS_ENTRY_TYPE, {
      patterns: this.customPatterns.map(serializePattern),
    });
  }

  // ── Allowlist ────────────────────────────────────────────────────

  getAllowlist(): AllowlistEntry[] {
    return this.allowlist;
  }

  /** Check if a command is allowlisted (by prefix match). */
  isAllowlisted(command: string): boolean {
    return this.allowlist.some((entry) => command.startsWith(entry.command));
  }

  /** Add a command to the allowlist. */
  addToAllowlist(pi: ExtensionAPI, command: string): void {
    this.allowlist.push({ command, timestamp: Date.now() });
    this.saveAllowlist(pi);
  }

  /** Clear all allowlist entries. */
  clearAllowlist(pi: ExtensionAPI): void {
    this.allowlist = [];
    this.saveAllowlist(pi);
  }

  /** Remove a specific allowlist entry by index. */
  removeAllowlistEntry(pi: ExtensionAPI, index: number): AllowlistEntry | undefined {
    const removed = this.allowlist.splice(index, 1)[0];
    if (removed) this.saveAllowlist(pi);
    return removed;
  }

  // ── Custom patterns ──────────────────────────────────────────────

  getCustomPatterns(): DangerPattern[] {
    return this.customPatterns;
  }

  /** Add a custom dangerous pattern. */
  addCustomPattern(pi: ExtensionAPI, pattern: DangerPattern): void {
    this.customPatterns.push(pattern);
    this.saveCustomPatterns(pi);
  }

  /** Remove a custom pattern by array index. */
  removeCustomPattern(pi: ExtensionAPI, index: number): DangerPattern | undefined {
    const removed = this.customPatterns.splice(index, 1)[0];
    if (removed) this.saveCustomPatterns(pi);
    return removed;
  }

  /** Get all patterns (defaults + custom). */
  getAllPatterns(defaults: DangerPattern[]): DangerPattern[] {
    return [...defaults, ...this.customPatterns];
  }
}
