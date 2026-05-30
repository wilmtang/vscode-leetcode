// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

const os = require("os");
const path = require("path");
const { browserExtensionPath, findChromeBinary, run } = require("./auth-sync-utils");

const chromeBinary = findChromeBinary();

if (!chromeBinary) {
    console.error("Could not find Google Chrome or Chromium.");
    console.error("Set CHROME_BIN=/absolute/path/to/chrome and run this script again.");
    console.error(`You can also manually load this unpacked extension: ${browserExtensionPath}`);
    process.exit(1);
}

const userDataDir = path.join(os.tmpdir(), "leetcode-auth-sync-chrome-profile");

console.log("Opening Chrome with a disposable profile and the unpacked auth-sync extension loaded.");
console.log(`Extension path: ${browserExtensionPath}`);
console.log(`Profile path: ${userDataDir}`);
console.log("Log in to https://leetcode.com in this profile, then click the extension's Sync Now button.");

run(chromeBinary, [
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${browserExtensionPath}`,
    "https://leetcode.com",
]);
