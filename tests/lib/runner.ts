import { performance } from "node:perf_hooks";

export type StepStatus = "pass" | "fail" | "skip";

export interface StepResult {
  name: string;
  status: StepStatus;
  durationMs: number;
  detail?: string;
  error?: string;
}

export class Runner {
  private results: StepResult[] = [];

  async step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
    const start = performance.now();
    process.stdout.write(`  ▶ ${name} ... `);
    try {
      const value = await fn();
      const durationMs = Math.round(performance.now() - start);
      this.results.push({ name, status: "pass", durationMs });
      process.stdout.write(`\x1b[32m✓\x1b[0m (${durationMs}ms)\n`);
      return value;
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.results.push({
        name,
        status: "fail",
        durationMs,
        error: message,
        detail: stack?.split("\n").slice(0, 4).join("\n"),
      });
      process.stdout.write(`\x1b[31m✗\x1b[0m (${durationMs}ms)\n`);
      process.stdout.write(`    \x1b[31m${message}\x1b[0m\n`);
      return undefined;
    }
  }

  skip(name: string, reason: string) {
    this.results.push({ name, status: "skip", durationMs: 0, detail: reason });
    process.stdout.write(`  \x1b[33m⊘ ${name} (skipped: ${reason})\x1b[0m\n`);
  }

  summary(): {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
  } {
    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = this.results.filter((r) => r.status === "fail").length;
    const skipped = this.results.filter((r) => r.status === "skip").length;
    return { passed, failed, skipped, total: this.results.length };
  }

  printSummary() {
    const { passed, failed, skipped, total } = this.summary();
    const width = 60;
    const bar = "─".repeat(width);
    process.stdout.write(`\n${bar}\n`);
    process.stdout.write(
      `\x1b[1mResult:\x1b[0m ${passed}/${total} passed` +
        (failed ? `, \x1b[31m${failed} failed\x1b[0m` : "") +
        (skipped ? `, \x1b[33m${skipped} skipped\x1b[0m` : "") +
        "\n",
    );
    if (failed > 0) {
      process.stdout.write("\nFailed steps:\n");
      for (const r of this.results.filter((x) => x.status === "fail")) {
        process.stdout.write(
          `  \x1b[31m✗\x1b[0m ${r.name}\n      ${r.error}\n`,
        );
      }
    }
    process.stdout.write(`${bar}\n`);
  }

  get exitCode(): number {
    return this.results.some((r) => r.status === "fail") ? 1 : 0;
  }
}
