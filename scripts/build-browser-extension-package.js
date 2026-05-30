const fs = require("fs");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");

const repoRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(repoRoot, "browser-extension");
const artifactsDir = path.join(repoRoot, "web-ext-artifacts");

const browser = getArgValue("--browser") || "chrome";

if (browser !== "chrome") {
    fail(`Unsupported browser package target: ${browser}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf8"));
const packageManifest = createChromeManifest(manifest);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leetcode-auth-sync-chrome-"));

copyDirectory(sourceDir, tempDir, (relativePath) => {
    return relativePath !== "amo-metadata.json";
});

fs.writeFileSync(
    path.join(tempDir, "manifest.json"),
    `${JSON.stringify(packageManifest, null, 4)}\n`
);

fs.mkdirSync(artifactsDir, { recursive: true });

const packageName = `${slugify(packageManifest.name)}-${packageManifest.version}-chrome.zip`;
const packagePath = path.join(artifactsDir, packageName);
const zip = new AdmZip();

for (const file of listFiles(tempDir)) {
    const relativePath = path.relative(tempDir, file).split(path.sep).join("/");
    zip.addLocalFile(file, path.dirname(relativePath) === "." ? "" : path.dirname(relativePath));
}

zip.writeZip(packagePath);

fs.rmSync(tempDir, { recursive: true, force: true });

console.log(packagePath);

function createChromeManifest(sourceManifest) {
    const chromeManifest = JSON.parse(JSON.stringify(sourceManifest));

    delete chromeManifest.browser_specific_settings;

    if (chromeManifest.background && chromeManifest.background.service_worker) {
        chromeManifest.background = {
            service_worker: chromeManifest.background.service_worker,
        };
    }

    return chromeManifest;
}

function copyDirectory(from, to, includeFile) {
    fs.mkdirSync(to, { recursive: true });

    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const sourcePath = path.join(from, entry.name);
        const targetPath = path.join(to, entry.name);
        const relativePath = path.relative(sourceDir, sourcePath).split(path.sep).join("/");

        if (entry.isDirectory()) {
            copyDirectory(sourcePath, targetPath, includeFile);
            continue;
        }

        if (!includeFile(relativePath)) {
            continue;
        }

        fs.copyFileSync(sourcePath, targetPath);
    }
}

function listFiles(directory) {
    const files = [];

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...listFiles(entryPath));
        } else {
            files.push(entryPath);
        }
    }

    return files;
}

function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getArgValue(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : "";
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
