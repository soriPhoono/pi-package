/**
 * Tests for plan-mode utility functions.
 *
 * Run with:
 *   npx tsx extensions/plan-mode/utils.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	isSafeCommand,
	cleanStepText,
	extractTodoItems,
	markCompletedSteps,
	parseTodoListMessage,
	normalizeTodoItem,
	extractStatusMarker,
} from "./utils.ts";

// ── isSafeCommand ─────────────────────────────────────────────────────

describe("isSafeCommand", () => {
	it("allows read-only commands", () => {
		assert.ok(isSafeCommand("cat file.txt"));
		assert.ok(isSafeCommand("ls -la /tmp"));
		assert.ok(isSafeCommand("grep -r 'foo' src/"));
		assert.ok(isSafeCommand("pwd"));
		assert.ok(isSafeCommand("git status"));
		assert.ok(isSafeCommand("git log --oneline -5"));
		assert.ok(isSafeCommand("git diff HEAD"));
	});

	it("blocks destructive commands", () => {
		assert.ok(!isSafeCommand("rm -rf /tmp/foo"));
		assert.ok(!isSafeCommand("mv src/foo.ts src/bar.ts"));
		assert.ok(!isSafeCommand("cp test.ts backup.ts"));
		assert.ok(!isSafeCommand("mkdir new-dir"));
		assert.ok(!isSafeCommand("npm install lodash"));
		assert.ok(!isSafeCommand("sudo apt update"));
		assert.ok(!isSafeCommand("git add ."));
		assert.ok(!isSafeCommand("git commit -m 'fix'"));
	});

	it("blocks redirects and pipes to write", () => {
		assert.ok(!isSafeCommand("echo 'foo' > file.txt"));
		assert.ok(!isSafeCommand("echo 'bar' >> file.txt"));
	});

	it("allows safe git read commands", () => {
		assert.ok(isSafeCommand("git branch"));
		assert.ok(isSafeCommand("git remote -v"));
		assert.ok(isSafeCommand("git ls-files"));
	});

	it("allows safe npm read commands", () => {
		assert.ok(isSafeCommand("npm list --depth=0"));
		assert.ok(isSafeCommand("npm outdated"));
	});

	it("allows safe system info commands", () => {
		assert.ok(isSafeCommand("uname -a"));
		assert.ok(isSafeCommand("whoami"));
		assert.ok(isSafeCommand("date"));
		assert.ok(isSafeCommand("uptime"));
		assert.ok(isSafeCommand("free -h"));
	});

	it("allows read-only tools like rg, fd, bat, eza", () => {
		assert.ok(isSafeCommand("rg 'pattern' src/"));
		assert.ok(isSafeCommand("fd '\\.ts$'"));
		assert.ok(isSafeCommand("bat file.ts"));
		assert.ok(isSafeCommand("eza -la"));
	});

	it("blocks editors", () => {
		assert.ok(!isSafeCommand("vim file.ts"));
		assert.ok(!isSafeCommand("nano /etc/hosts"));
		assert.ok(!isSafeCommand("code ."));
	});
});

// ── cleanStepText ─────────────────────────────────────────────────────

describe("cleanStepText", () => {
	it("removes bold/italic markdown", () => {
		assert.strictEqual(cleanStepText("**Refactor** the module"), "Refactor the module");
		// *Update* → "Update tests" (after italic removal), then "Update" is stripped as leading verb → "Tests"
		assert.strictEqual(cleanStepText("*Update* tests"), "Tests");
	});

	it("removes inline code", () => {
		// Backticks removed → "Install lodash package", then "Install" is stripped as leading verb → "Lodash package"
		assert.strictEqual(cleanStepText("Install `lodash` package"), "Lodash package");
	});

	it("strips leading action verbs", () => {
		assert.strictEqual(cleanStepText("Create a new component"), "A new component");
		assert.strictEqual(cleanStepText("Run the tests"), "Tests");
		assert.strictEqual(cleanStepText("Install dependencies"), "Dependencies");
		assert.strictEqual(cleanStepText("Update the config"), "Config");
	});

	it("capitalizes first letter", () => {
		assert.strictEqual(cleanStepText("fix the bug"), "Fix the bug");
	});

	it("truncates long text to 50 chars", () => {
		const long = "This is a very long step description that should be truncated because it exceeds the maximum length allowed for display";
		const cleaned = cleanStepText(long);
		assert.ok(cleaned.length <= 50);
		assert.ok(cleaned.endsWith("..."));
	});

	it("collapses multiple spaces", () => {
		assert.strictEqual(cleanStepText("Step   with    extra   spaces"), "Step with extra spaces");
	});
});

// ── extractStatusMarker ───────────────────────────────────────────────

describe("extractStatusMarker", () => {
	it("detects completed marker [x]", () => {
		const result = extractStatusMarker("[x] Implement feature");
		assert.strictEqual(result.status, "completed");
		assert.strictEqual(result.cleanText, "Implement feature");
	});

	it("detects completed marker [☑]", () => {
		const result = extractStatusMarker("[☑] Done task");
		assert.strictEqual(result.status, "completed");
	});

	it("detects in-progress marker [~]", () => {
		const result = extractStatusMarker("[~] Working on it");
		assert.strictEqual(result.status, "in_progress");
		assert.strictEqual(result.cleanText, "Working on it");
	});

	it("detects in-progress marker [>]", () => {
		const result = extractStatusMarker("[>] In progress");
		assert.strictEqual(result.status, "in_progress");
	});

	it("detects pending marker [ ]", () => {
		const result = extractStatusMarker("[ ] Not started");
		assert.strictEqual(result.status, "pending");
	});

	it("detects pending marker [☐]", () => {
		const result = extractStatusMarker("[☐] Todo item");
		assert.strictEqual(result.status, "pending");
	});

	it("returns pending for text without marker", () => {
		const result = extractStatusMarker("Just some text");
		assert.strictEqual(result.status, "pending");
		assert.strictEqual(result.cleanText, "Just some text");
	});
});

// ── extractTodoItems ──────────────────────────────────────────────────

describe("extractTodoItems", () => {
	it("extracts numbered steps from Plan section", () => {
		const text = `Plan:
1. First step description
2. Second step description
3. Third step description`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 3);
		assert.strictEqual(items[0].step, 1);
		assert.strictEqual(items[0].text, "First step description");
		assert.strictEqual(items[0].status, "pending");
	});

	it("extracts steps with bold Plan header", () => {
		const text = `**Plan:**
1. Step one
2. Step two`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 2);
	});

	it("extracts steps with italic Plan header", () => {
		const text = `*Plan:*
1. Step one`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 1);
	});

	it("extracts bulleted steps when no numbered items exist", () => {
		const text = `Plan:
- First bullet step
- Second bullet step`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 2);
		assert.strictEqual(items[0].text, "First bullet step");
	});

	it("extracts bulleted steps with star", () => {
		const text = `Plan:
* Star bullet one
* Star bullet two`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 2);
	});

	it("handles status markers in plan items", () => {
		const text = `Plan:
1. [x] Completed step
2. [~] In progress step
3. [ ] Pending step`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 3);
		assert.strictEqual(items[0].status, "completed");
		assert.strictEqual(items[0].text, "Completed step");
		assert.strictEqual(items[1].status, "in_progress");
		assert.strictEqual(items[2].status, "pending");
	});

	it("returns empty array when no Plan section found", () => {
		const items = extractTodoItems("Just some text without a plan header");
		assert.strictEqual(items.length, 0);
	});

	it("filters out very short items", () => {
		const text = `Plan:
1. Hi
2. A real step description`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 1); // "Hi" is too short (≤5 chars)
	});

	it("filters out items starting with backtick or slash", () => {
		const text = `Plan:
1. \`code snippet\`
2. /command reference
3. Actual step`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 1);
		assert.strictEqual(items[0].text, "Actual step");
	});

	it("handles rich markdown in plan items", () => {
		const text = `Plan:
1. **Refactor** the \`auth\` module
2. Add unit tests for the service`;
		const items = extractTodoItems(text);
		assert.strictEqual(items.length, 2);
		assert.strictEqual(items[0].text, "Refactor the auth module");
	});
});

// ── markCompletedSteps ────────────────────────────────────────────────

describe("markCompletedSteps", () => {
	it("marks steps as completed via [DONE:n] tags", () => {
		const items = [
			{ step: 1, text: "Step one", status: "pending" as const },
			{ step: 2, text: "Step two", status: "pending" as const },
			{ step: 3, text: "Step three", status: "pending" as const },
		];
		const count = markCompletedSteps("Finished step 1 [DONE:1] and step 3 [DONE:3]", items);
		assert.strictEqual(count, 2);
		assert.strictEqual(items[0].status, "completed");
		assert.strictEqual(items[2].status, "completed");
	});

	it("marks steps as in_progress via [WORKING:n] tags", () => {
		const items = [
			{ step: 1, text: "Step one", status: "pending" as const },
			{ step: 2, text: "Step two", status: "pending" as const },
		];
		markCompletedSteps("Working on [WORKING:2]", items);
		assert.strictEqual(items[1].status, "in_progress");
	});

	it("doesn't count already-completed steps for DONE count", () => {
		const items = [
			{ step: 1, text: "Step one", status: "completed" as const },
			{ step: 2, text: "Step two", status: "pending" as const },
		];
		const count = markCompletedSteps("[DONE:1] [DONE:2]", items);
		assert.strictEqual(count, 1); // Only newly completes step 2
		assert.strictEqual(items[0].status, "completed"); // Still completed
		assert.strictEqual(items[1].status, "completed");
	});

	it("handles case-insensitive tags", () => {
		const items = [
			{ step: 1, text: "Step one", status: "pending" as const },
		];
		markCompletedSteps("[done:1]", items);
		assert.strictEqual(items[0].status, "completed");
	});

	it("ignores invalid step numbers", () => {
		const items = [
			{ step: 1, text: "Step one", status: "pending" as const },
		];
		markCompletedSteps("[DONE:99]", items);
		assert.strictEqual(items[0].status, "pending");
	});
});

// ── parseTodoListMessage ──────────────────────────────────────────────

describe("parseTodoListMessage", () => {
	it("parses numbered todo items with checkbox symbols", () => {
		const content = `**Plan Steps (3):**
1. ☐ First step
2. ☐ Second step
3. ☐ Third step`;
		const items = parseTodoListMessage(content);
		assert.strictEqual(items.length, 3);
		assert.strictEqual(items[0].text, "First step");
	});

	it("parses items with various checkbox styles", () => {
		const content = "1. ☐ Pending\n2. ○ Another pending\n3. ☑ Completed\n4. ✓ Done";
		const items = parseTodoListMessage(content);
		assert.strictEqual(items.length, 4);
	});

	it("returns empty array for unparseable content", () => {
		const items = parseTodoListMessage("No structured items here");
		assert.strictEqual(items.length, 0);
	});
});

// ── normalizeTodoItem ─────────────────────────────────────────────────

describe("normalizeTodoItem", () => {
	it("converts completed boolean to status", () => {
		const result = normalizeTodoItem({ step: 1, text: "Test", completed: true });
		assert.strictEqual(result.status, "completed");
	});

	it("preserves explicit status over completed boolean", () => {
		const result = normalizeTodoItem({ step: 1, text: "Test", completed: true, status: "in_progress" as const });
		assert.strictEqual(result.status, "in_progress");
	});

	it("defaults to pending when no status info", () => {
		const result = normalizeTodoItem({ step: 1, text: "Test" });
		assert.strictEqual(result.status, "pending");
	});

	it("preserves level", () => {
		const result = normalizeTodoItem({ step: 1, text: "Test", level: 2 });
		assert.strictEqual(result.level, 2);
	});
});
