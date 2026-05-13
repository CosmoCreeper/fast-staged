const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

const symbols = {
  pass: process.platform === "win32" ? "√" : "✔",
  fail: process.platform === "win32" ? "×" : "✖",
  run: process.platform === "win32" ? ">" : "›",
};

export function log(msg) {
  process.stderr.write(msg + "\n");
}

export function logInfo(label, msg = "") {
  log(`${CYAN}${BOLD}fast-staged${RESET} ${label}${msg ? " " + msg : ""}`);
}

export function createRenderer(verbose) {
  const startTime = Date.now();
  const cmdStart = new Map(); // cmd -> start timestamp

  return {
    onUpdate({ type, tasks, task, result }) {
      if (type === "start") {
        const list = tasks ?? [task];
        for (const t of list) {
          for (const cmd of t.commands) {
            cmdStart.set(cmd, Date.now());
            log(
              `  ${CYAN}${symbols.run}${RESET} ${DIM}${cmd}${RESET}  ${DIM}(${t.matchedFiles.length} file${t.matchedFiles.length === 1 ? "" : "s"})${RESET}`,
            );
          }
        }
      } else if (type === "done") {
        const elapsed = cmdStart.has(result.cmd)
          ? `${((Date.now() - cmdStart.get(result.cmd)) / 1000).toFixed(2)}s`
          : "";

        if (result.ok) {
          // Overwrite the launching line with a completion line
          log(`  ${GREEN}${symbols.pass}${RESET} ${result.cmd}  ${DIM}${elapsed}${RESET}`);
        } else {
          log(`  ${RED}${BOLD}${symbols.fail} ${result.cmd}${RESET}  ${DIM}${elapsed}${RESET}`);
          if (result.output.trim()) {
            log(
              result.output
                .trimEnd()
                .split("\n")
                .map((l) => `    ${l}`)
                .join("\n"),
            );
          }
          log("");
        }
      }
    },

    summary(ok, results) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      if (ok) {
        log(
          `${GREEN}${BOLD}${symbols.pass} fast-staged passed${RESET}  ${DIM}${elapsed}s total${RESET}`,
        );
      } else {
        const failedCmds = results.filter((r) => !r.ok).map((r) => r.cmd);
        log(
          `${RED}${BOLD}${symbols.fail} fast-staged failed${RESET}  ${DIM}${elapsed}s total${RESET}`,
        );
        log(`${RED}Failed: ${failedCmds.join(", ")}${RESET}`);
      }
    },
  };
}
