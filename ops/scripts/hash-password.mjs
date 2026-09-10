#!/usr/bin/env node
import { pbkdf2, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ITERATIONS = 10_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

function hashPassword(password, iterations = ITERATIONS) {
  const salt = randomBytes(SALT_LEN);
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, KEY_LEN, "sha256", (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`pbkdf2-sha256$${iterations}$${salt.toString("hex")}$${derived.toString("hex")}`);
    });
  });
}

const supplied = process.argv.slice(2).join(" ");
let password = supplied;
if (!password) {
  const rl = createInterface({ input, output });
  password = await rl.question("Admin password: ");
  rl.close();
}

if (!password || password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

const hash = await hashPassword(password);
console.log(hash);
console.log("\nwrangler secret put ADMIN_PASSWORD_HASH");
console.log("paste the hash above (first line only)");
