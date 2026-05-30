// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const browserExtensionPath = path.join(repoRoot, "browser-extension");
const distPath = path.join(repoRoot, "dist");
const vsixPath = path.join(distPath, "vscode-leetcode-auth-sync.vsix");

function commandExists(command) {
    const result = spawnSync(command, ["--version"], { stdio: "ignore" });
    return result.status === 0;
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
        ...options,
    });

    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function getCodeCommand() {
    if (process.env.VSCODE_BIN) {
        return process.env.VSCODE_BIN;
    }

    return "code";
}

function findChromeBinary() {
    if (process.env.CHROME_BIN) {
        return process.env.CHROME_BIN;
    }

    const candidates = process.platform === "darwin"
        ? [
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
          ]
        : process.platform === "win32"
        ? [
              path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
              path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
              path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
          ]
        : [
              "google-chrome",
              "google-chrome-stable",
              "chromium",
              "chromium-browser",
          ];

    return candidates.find((candidate) => {
        if (candidate.includes(path.sep)) {
            return fs.existsSync(candidate);
        }

        return commandExists(candidate);
    });
}

module.exports = {
    browserExtensionPath,
    commandExists,
    distPath,
    findChromeBinary,
    getCodeCommand,
    repoRoot,
    run,
    vsixPath,
};
