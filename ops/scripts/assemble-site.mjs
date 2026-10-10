import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = resolve(root, "site");

rmSync(site, { recursive: true, force: true });
mkdirSync(resolve(site, "download/changelog"), { recursive: true });
cpSync(resolve(root, "admin-ui/dist"), resolve(site, "admin"), { recursive: true });
cpSync(resolve(root, "download/index.html"), resolve(site, "download/index.html"));
cpSync(resolve(root, "download/guide.html"), resolve(site, "download/guide.html"));
cpSync(resolve(root, "download/changelog/index.html"), resolve(site, "download/changelog/index.html"));
console.log("assembled ops site -> site/admin + site/download");
