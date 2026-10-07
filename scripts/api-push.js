#!/usr/bin/env node
// Отправка локальных изменений на GitHub через REST API, когда обычный
// `git push` падает с Internal Server Error. Берёт файлы, отличающиеся от
// origin/<ветка>, и создаёт из них один коммит поверх удалённой ветки.
//
//   GITHUB_TOKEN=ghp_... node scripts/api-push.js            # ветка main
//   GITHUB_TOKEN=ghp_... node scripts/api-push.js "сообщение"
//
// После успеха: git fetch && git reset --hard origin/main
const { execSync } = require("child_process");
const fs = require("fs");

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("Нет токена: GITHUB_TOKEN=ghp_... node scripts/api-push.js");
  process.exit(1);
}
const branch = process.env.BRANCH || "main";
const message = process.argv[2] || execSync("git log -1 --format=%s").toString().trim() || "update";
const remote = execSync("git remote get-url origin").toString().trim();
const repo = remote.match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
if (!repo) {
  console.error("Не понял адрес репозитория:", remote);
  process.exit(1);
}

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.message ?? ""}`);
  return json;
}

(async () => {
  execSync(`git fetch origin ${branch}`, { stdio: "inherit" });
  const changes = execSync(`git diff --name-status origin/${branch}`).toString().trim().split("\n").filter(Boolean);
  if (!changes.length) {
    console.log("Отличий от GitHub нет — отправлять нечего.");
    return;
  }
  const head = await gh("GET", `/git/ref/heads/${branch}`);
  const parent = head.object.sha;
  const parentCommit = await gh("GET", `/git/commits/${parent}`);

  const tree = [];
  for (const line of changes) {
    const [status, ...rest] = line.split("\t");
    const file = rest[rest.length - 1];
    if (status.startsWith("D")) {
      tree.push({ path: file, mode: "100644", type: "blob", sha: null });
      console.log("  удалить ", file);
      continue;
    }
    if (status.startsWith("R")) tree.push({ path: rest[0], mode: "100644", type: "blob", sha: null });
    const blob = await gh("POST", "/git/blobs", { content: fs.readFileSync(file).toString("base64"), encoding: "base64" });
    const mode = fs.statSync(file).mode & 0o111 ? "100755" : "100644";
    tree.push({ path: file, mode, type: "blob", sha: blob.sha });
    console.log("  отправить", file);
  }

  const newTree = await gh("POST", "/git/trees", { base_tree: parentCommit.tree.sha, tree });
  const commit = await gh("POST", "/git/commits", { message, tree: newTree.sha, parents: [parent] });
  await gh("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha });
  console.log(`\nГотово: ${commit.sha.slice(0, 7)} в ${repo}@${branch}`);
  console.log("Дальше: git fetch && git reset --hard origin/" + branch);
})().catch((err) => {
  console.error("Ошибка:", err.message);
  process.exit(1);
});
