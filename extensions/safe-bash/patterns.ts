/**
 * Safe Bash — Dangerous Pattern Definitions
 *
 * Defines the pattern matching system used by the safe-bash extension.
 * Each pattern has a severity level that controls how it's handled:
 *
 * - "critical": Always requires confirmation, blocked in non-interactive mode.
 * - "warn":     Confirms in interactive mode; behavior in non-interactive mode
 *               depends on user severity threshold config.
 * - "info":     Notifies but doesn't block (opt-in to requiring confirmation).
 */

// ── Severity ──────────────────────────────────────────────────────────

export type Severity = "critical" | "warn" | "info";

export interface DangerPattern {
  /** The regex to test against the full command string. */
  pattern: RegExp;
  /** Human-readable label shown in confirmation prompts. */
  label: string;
  /** Severity level controlling how the match is handled. */
  severity: Severity;
}

/** Plain-object representation for serialization / persistence. */
export interface SerializedPattern {
  pattern: string;
  flags: string;
  label: string;
  severity: Severity;
}

// ── Default Patterns ──────────────────────────────────────────────────

export const DEFAULT_DANGER_PATTERNS: DangerPattern[] = [
  // ── Critical: Destructive recursive deletes ──────────────────
  // NOTE: We use (?=\s|$|--) instead of \b after /, ~, . because those are
  // non-word characters so \b won't match after them.
  { pattern: /\brm\s+-rf\s+\/(?=\s|$|--)/i, label: "Recursive delete of root (rm -rf /)", severity: "critical" },
  { pattern: /\brm\s+-rf\s+\/\*/i, label: "Recursive delete of all files under root", severity: "critical" },
  { pattern: /\brm\s+-rf\s+~(?=\s|$|--)/i, label: "Recursive delete of home directory (~)", severity: "critical" },
  { pattern: /\brm\s+-rf\s+\.(?=\s|$|--)/i, label: "Recursive delete of current directory", severity: "critical" },
  { pattern: /\brm\s+-rf\s+\.\.(?=\s|$|--)/i, label: "Recursive delete of parent directory", severity: "critical" },

  // ── Critical: Direct disk writes & low-level operations ──────
  { pattern: /\bdd\b/i, label: "Low-level disk write (dd)", severity: "critical" },
  { pattern: /\bmkfs\b/i, label: "Filesystem creation (mkfs)", severity: "critical" },
  { pattern: /\bmkswap\b/i, label: "Swap space creation (mkswap)", severity: "critical" },
  { pattern: /\bfdisk\b/i, label: "Partition table manipulation (fdisk)", severity: "critical" },
  { pattern: /\bparted\b/i, label: "Partition manipulation (parted)", severity: "critical" },
  { pattern: /[>]+\s*\/dev\/(?:sd|nvme|mmcblk|loop|xvd|vd)/i, label: "Direct disk write to /dev/", severity: "critical" },
  { pattern: /\bmount\b/i, label: "Filesystem mount operation", severity: "critical" },
  { pattern: /\bumount\b/i, label: "Filesystem unmount operation", severity: "critical" },
  { pattern: /\bswap(?:on|off)\b/i, label: "Swap enable/disable", severity: "critical" },

  // ── Critical: Fork bombs & DoS patterns ──────────────────────
  { pattern: /:\(\s*\)\s*\{[^}]*\}[\s;]*:/i, label: "Fork bomb", severity: "critical" },
  { pattern: /\bwhile\s+true\s*;?\s*do\s+\S+\s*\|\s*\S+\s*&\s*;?\s*done\b/i, label: "Potential fork bomb variant", severity: "critical" },
  { pattern: /:\(\)\s*\{[^:}]*:[^}]*\}[\s;]*:/i, label: "Fork bomb variant", severity: "critical" },

  // ── Critical: Privilege escalation ───────────────────────────
  { pattern: /\bsudo\b/i, label: "Command runs with sudo (privilege escalation)", severity: "critical" },
  { pattern: /\bsu\s+-/i, label: "Switch user with login shell (su -)", severity: "critical" },
  { pattern: /\bdoas\b/i, label: "Command runs with doas (privilege escalation)", severity: "critical" },
  { pattern: /\bpkexec\b/i, label: "Command runs with pkexec (privilege escalation)", severity: "critical" },

  // ── Critical: System state changes ───────────────────────────
  { pattern: /\bshutdown\b/i, label: "System shutdown", severity: "critical" },
  { pattern: /\breboot\b/i, label: "System reboot", severity: "critical" },
  { pattern: /\bpoweroff\b/i, label: "System power off", severity: "critical" },
  { pattern: /\bhalt\b/i, label: "System halt", severity: "critical" },
  { pattern: /\binit\s+[06]\b/i, label: "System runlevel change (init)", severity: "critical" },
  { pattern: /\bsystemctl\s+(?:poweroff|reboot|halt|suspend|hibernate)/i, label: "System state change via systemctl", severity: "critical" },

  // ── Critical: Piped remote execution ─────────────────────────
  { pattern: /(?:curl|wget)\s+.*?(?:\||\bpipe\b)\s*(?:sh|bash|zsh|ksh|dash)\b/i, label: "Piped download to shell", severity: "critical" },
  { pattern: /(?:curl|wget)\s+.*?(?:\||\bpipe\b)\s*(?:python|python3|perl|ruby|node)\b/i, label: "Piped download to interpreter", severity: "critical" },

  // ── Critical: Bootloader / firmware ─────────────────────────
  { pattern: /\bgrub-install\b/i, label: "GRUB bootloader installation", severity: "critical" },
  { pattern: /\befibootmgr\b/i, label: "EFI boot manager manipulation", severity: "critical" },
  { pattern: /\bflashrom\b/i, label: "Firmware flash tool", severity: "critical" },

  // ── Critical: User / group management ────────────────────────
  { pattern: /\buser(?:add|del|mod)\b/i, label: "User account management", severity: "critical" },

  // ── Warn: Package management ─────────────────────────────────
  { pattern: /\bnixos-rebuild\s+(?:switch|boot|test|dry-activate)\b/i, label: "NixOS configuration rebuild", severity: "warn" },
  { pattern: /\bnix-collect-garbage\b/i, label: "Nix garbage collection", severity: "warn" },
  { pattern: /\bnix\s+store\s+(?:delete|gc)\b/i, label: "Nix store deletion", severity: "warn" },
  { pattern: /\bapt\s+(?:install|remove|purge|autoremove)\b/i, label: "APT package installation/removal", severity: "warn" },
  { pattern: /\bdpkg\s+(?:-i|--install|-r|--remove|-P|--purge)\b/i, label: "DPKG package manipulation", severity: "warn" },
  { pattern: /\bdnf\s+(?:install|remove|erase)\b/i, label: "DNF package management", severity: "warn" },
  { pattern: /\bpacman\s+(?:-S|-R|-U)\b/i, label: "Pacman package management", severity: "warn" },
  { pattern: /\bpip\s+install\b/i, label: "Pip package installation", severity: "warn" },
  { pattern: /\bnpm\s+install\s+-g\b/i, label: "Global npm package installation", severity: "warn" },

  // ── Warn: Docker / Podman ────────────────────────────────────
  { pattern: /\bdocker\s+(?:run|exec|rm|kill|stop|start|restart|pause|unpause)\b/i, label: "Docker container manipulation", severity: "warn" },
  { pattern: /\bdocker\s+(?:system\s+prune|volume\s+rm|network\s+rm|image\s+rm)\b/i, label: "Docker resource cleanup", severity: "warn" },
  { pattern: /\bdocker\s+(?:build|push|login)\b/i, label: "Docker image operation", severity: "warn" },
  { pattern: /\bpodman\s+(?:run|exec|rm|kill|stop|start|restart)\b/i, label: "Podman container manipulation", severity: "warn" },

  // ── Warn: Destructive git operations ─────────────────────────
  { pattern: /\bgit\s+push\s+.*--force\b/i, label: "Force git push (--force)", severity: "warn" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, label: "Hard git reset (reset --hard)", severity: "warn" },
  { pattern: /\bgit\s+clean\s+-f*d*\b/i, label: "Destructive git clean", severity: "warn" },
  { pattern: /\bgit\s+checkout\s+--\s*\./i, label: "Discard local changes via git checkout", severity: "warn" },
  { pattern: /\bgit\s+rebase\s+--(?:onto|interactive)\b/i, label: "Git rebase operation", severity: "warn" },

  // ── Warn: Service management ─────────────────────────────────
  { pattern: /\bsystemctl\s+(?:start|stop|restart|enable|disable|mask|unmask|daemon-reload)\b/i, label: "Systemd service management", severity: "warn" },
  { pattern: /\bservice\s+\S+\s+(?:start|stop|restart|reload)\b/i, label: "SysV init service management", severity: "warn" },

  // ── Warn: Network manipulation ───────────────────────────────
  { pattern: /\biptables\b/i, label: "Firewall rule manipulation (iptables)", severity: "warn" },
  { pattern: /\bnft(?:able)?s?\b/i, label: "Firewall rule manipulation (nftables)", severity: "warn" },
  { pattern: /\bufw\s+(?:enable|disable|default|reset)\b/i, label: "UFW firewall management", severity: "warn" },
  { pattern: /\bip\s+(?:link\s+(?:set|down|up)|addr\s+(?:add|del)|route\s+(?:add|del|change|replace))/i, label: "Network interface/route manipulation", severity: "warn" },
  { pattern: /\broute\s+(?:add|del)\b/i, label: "Route table manipulation", severity: "warn" },

  // ── Warn: Permission changes ─────────────────────────────────
  { pattern: /\bchmod\b.*\b(?:777|000|444|555|666)\b/i, label: "Broad permission change (chmod)", severity: "warn" },
  { pattern: /\bchown\b/i, label: "File ownership change (chown)", severity: "warn" },

  // ── Warn: Process manipulation ───────────────────────────────
  { pattern: /\bkillall\b/i, label: "Kill all processes by name", severity: "warn" },
  { pattern: /\bpkill\b/i, label: "Kill process by pattern", severity: "warn" },
  { pattern: /\bkill\s+-9\b/i, label: "Force kill process (SIGKILL)", severity: "warn" },

  // ── Warn: Kernel operations ──────────────────────────────────
  { pattern: /\bmodprobe\b/i, label: "Kernel module load/unload", severity: "warn" },
  { pattern: /\brmmod\b/i, label: "Kernel module removal", severity: "warn" },
  { pattern: /\binsmod\b/i, label: "Kernel module insertion", severity: "warn" },

  // ── Warn: Authentication ─────────────────────────────────────
  { pattern: /\bpasswd\b/i, label: "Password change operation", severity: "warn" },
  { pattern: /\bgroup(?:add|del|mod)\b/i, label: "Group management", severity: "warn" },
  { pattern: /\bchage\b/i, label: "User password expiry management", severity: "warn" },

  // ── Warn: Bootloader config ──────────────────────────────────
  { pattern: /\bgrub-mkconfig\b/i, label: "GRUB configuration regeneration", severity: "warn" },
  { pattern: /\bupdate-grub\b/i, label: "GRUB update", severity: "warn" },

  // ── Warn: System broadcasts ──────────────────────────────────
  { pattern: /\bwall\b/i, label: "Write message to all users (wall)", severity: "info" },
  { pattern: /\bwrite\s+\S+/i, label: "Write message to another user (write)", severity: "info" },
];

// ── Helpers ───────────────────────────────────────────────────────────

/** The minimum severity level that should be enforced in non-interactive mode. */
export const DEFAULT_MIN_SEVERITY: Severity = "warn";

/** Check if a command matches any dangerous pattern, returning the first match. */
export function findMatchingPattern(
  command: string,
  patterns: DangerPattern[],
): DangerPattern | undefined {
  return patterns.find((dp) => dp.pattern.test(command));
}

/** Serialize a DangerPattern so it can be stored in session state or JSON. */
export function serializePattern(dp: DangerPattern): SerializedPattern {
  return {
    pattern: dp.pattern.source,
    flags: dp.pattern.flags,
    label: dp.label,
    severity: dp.severity,
  };
}

/** Deserialize a plain object back into a DangerPattern. */
export function deserializePattern(sp: SerializedPattern): DangerPattern {
  return {
    pattern: new RegExp(sp.pattern, sp.flags),
    label: sp.label,
    severity: sp.severity,
  };
}

/** Get numeric weight for a severity level (higher = more dangerous). */
export function severityWeight(severity: Severity): number {
  switch (severity) {
    case "critical": return 3;
    case "warn":     return 2;
    case "info":     return 1;
  }
}

/** Check if a severity level meets or exceeds the threshold. */
export function isAtLeastSeverity(
  actual: Severity,
  threshold: Severity,
): boolean {
  return severityWeight(actual) >= severityWeight(threshold);
}
