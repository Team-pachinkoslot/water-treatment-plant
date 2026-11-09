// End-to-end learner journeys: intentionally includes relative paths and pipes.
export const commandFlows: Record<string, string[]> = {
  S01: ["nmap -sT -p 22,8080 aqua.lab.test", "curl http://aqua.lab.test:8080/training/discovery"],
  S02: ["curl http://aqua.lab.test:8080/", "curl http://aqua.lab.test:8080/training/inspection"],
  S03: ["curl http://aqua.lab.test:8080/public/maintenance-note.txt"],
  S04: ["ssh aquareader@aqua.lab.test", "pwd", "cd casefiles", "ls -l", "cat README.txt"],
  S05: ["cat /srv/aqua-lab/readonly/logs/aqua-access.log", "grep 401 /srv/aqua-lab/readonly/logs/aqua-access.log | head -n 3"],
};
