import { describe, expect, it } from "vitest";
import { initialTerminal, generateCommandHint } from "../src/lib/scenarios/terminal-lessons";
import { simulateCommand } from "../src/lib/scenarios/terminal.server";
import { SimulatorScenarioRuntime } from "../src/lib/scenarios/simulator.server";

const read = (id: string) => ({ stageId: id, files: [ { path: "fixture", content: id === "S05" ? "2026-11-02T00:03:00Z 198.51.100.23 GET /admin/login 401\n2026-11-02T00:03:10Z 198.51.100.23 GET /admin/login 401\n2026-11-02T00:04:15Z 192.0.2.10 GET /manual 200" : "許可された教材の本文" }, { path: "inspection", content: "点検記録の本文" } ] });
function command(input: string, state = initialTerminal()) { return simulateCommand({ state, command: input, stageId: "S05", read }); }

describe("closed-world terminal interpreter", () => {
  it.each(["curl https://example.com", "curl http://127.0.0.1:8080/", "curl http://aqua.lab.test:8080@other.test/", "nmap 192.0.2.50", "ssh root@aqua.lab.test", "sudo cat /etc/shadow", "rm -rf /", "cat /etc/passwd", "curl http://aqua.lab.test:8080/; whoami", "cat $(whoami)", "ls > result.txt", "pwd && cat README.txt", "pwd\nwhoami", "`id`"])("rejects unsupported targets or shell syntax: %s", input => {
    const before = initialTerminal(); const result = command(input, before);
    expect(result.exitCode).toBe(1);
    expect(result.terminal.host).toBe(before.host);
    expect(result.terminal.cwd).toBe(before.cwd);
    expect(result.terminal.observations).toEqual([]);
    expect(result.scene).toBe("blocked");
  });
  it("handles SSH context, relative paths and permission discovery without changing real files", () => {
    let state = initialTerminal();
    for (const input of ["ssh aquareader@aqua.lab.test", "cd casefiles", "ls -l"]) {
      const result = command(input, state); expect(result.exitCode).toBe(0); state = result.terminal;
    }
    expect(state.cwd).toBe("/home/aquareader/casefiles");
    expect(state.observations).toContain("S04:permissions");
    const result = command("cat README.txt", state);
    expect(result.output).toBe("許可された教材の本文");
    expect(result.terminal.observations).toContain("S04:readme");
    expect(command("cd ../../../../etc", state).exitCode).toBe(1);
  });
  it("filters logs with quoted strings and pipes and returns the first evidence line", () => {
    const connected = command("ssh aquareader@aqua.lab.test").terminal;
    const result = command('cat /srv/aqua-lab/readonly/logs/aqua-access.log | grep " 401" | head -n 1', connected);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("2026-11-02T00:03:00Z 198.51.100.23 GET /admin/login 401");
    expect(result.terminal.observations).toEqual(expect.arrayContaining(["S05:log-read", "S05:log-filter"]));
  });
  it("does not retain partial progress after an invalid pipeline", () => {
    const connected = command("ssh aquareader@aqua.lab.test").terminal;
    const result = command("cat /srv/aqua-lab/readonly/logs/aqua-access.log | sh", connected);
    expect(result.exitCode).toBe(1);
    expect(result.terminal.observations).not.toContain("S05:log-read");
  });
  it("generates the next command from observed progress and explains errors", () => {
    const state = initialTerminal();
    expect(generateCommandHint("S01", state, 0).command).toBeUndefined();
    expect(generateCommandHint("S01", state, 2).command).toContain("nmap");
    state.observations.push("S01:services");
    expect(generateCommandHint("S01", state, 2).command).toContain("/training/discovery");
    state.lastError = "TARGET_NOT_ALLOWED";
    expect(generateCommandHint("S01", state, 0).hint).toContain("aqua.lab.test");
  });
  it("requires command observations before accepting a known FLAG", async () => {
    const runtime = SimulatorScenarioRuntime.fromCloudSnapshot();
    try {
      const access = await runtime.start("water-01");
      const material = await runtime.getMaterials(access, "S01");
      const flag = JSON.parse(material.files[0].content).flag;
      await expect(runtime.submitFlag(access, "S01", flag, { ports: "22,8080" })).rejects.toMatchObject({ code: "COMMAND_REQUIRED" });
      await runtime.executeCommand(access, "S01", "nmap -p 22,8080 aqua.lab.test");
      await runtime.executeCommand(access, "S01", "curl http://aqua.lab.test:8080/training/discovery");
      expect((await runtime.submitFlag(access, "S01", flag, { ports: "22,8080" })).completedStages).toEqual(["S01"]);
      await expect(runtime.executeCommand(access, "S05", "cat /srv/aqua-lab/readonly/logs/aqua-access.log")).rejects.toMatchObject({ code: "STAGE_LOCKED" });
    } finally { runtime.dispose(); }
  });
});
