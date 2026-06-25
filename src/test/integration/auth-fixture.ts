import type * as vscode from "vscode";
import * as fse from "fs-extra";
import * as path from "path";
import { globalState, IBrowserRequestHeaders } from "../../globalState";

// Loads a real, locally-stored LeetCode auth payload (cookie + browser headers)
// so the live integration tests can hit LeetCode with a genuine session. The
// payload is produced by the browser extension's Developer mode ("Copy test
// fixture") and pasted into a gitignored file. See docs/maintainer-guide.md.

export interface IAuthFixture {
    endpoint: "leetcode" | "leetcode-cn";
    cookie: string;
    userAgent?: string;
    requestHeaders?: IBrowserRequestHeaders;
}

const DEFAULT_FIXTURE_PATH: string = path.resolve(process.cwd(), "src", "test", ".secrets", "leetcode-auth.local.json");

export function getAuthFixturePath(): string {
    return process.env.LEETCODE_AUTH_FIXTURE || DEFAULT_FIXTURE_PATH;
}

export function loadAuthFixture(): IAuthFixture | null {
    const fixturePath: string = getAuthFixturePath();
    if (!fse.existsSync(fixturePath)) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fse.readFileSync(fixturePath, "utf8"));
    } catch (error) {
        throw new Error(`Auth fixture at ${fixturePath} is not valid JSON: ${(error as Error).message}`);
    }

    return normalizeFixture(parsed, fixturePath);
}

export async function applyAuthFixture(fixture: IAuthFixture): Promise<void> {
    // Point getUrl() at the fixture's endpoint through the vscode test-config hook.
    (global as unknown as { __LC_TEST_CONFIG__?: { [key: string]: unknown } }).__LC_TEST_CONFIG__ = {
        endpoint: fixture.endpoint,
        useEndpointTranslation: fixture.endpoint === "leetcode-cn",
    };

    // Back globalState with in-memory Memento/SecretStorage, then seed it with the
    // fixture so getCookie()/getBrowserUserAgent()/getBrowserRequestHeaders() resolve.
    await globalState.initialize({
        globalState: new MapMemento(),
        secrets: new MapSecretStorage(),
        subscriptions: [],
    } as unknown as vscode.ExtensionContext);
    await globalState.setCookie(fixture.cookie);
    if (fixture.userAgent) {
        await globalState.setBrowserUserAgent(fixture.userAgent);
    }
    if (fixture.requestHeaders) {
        await globalState.setBrowserRequestHeaders(fixture.requestHeaders);
    }
}

function normalizeFixture(parsed: unknown, fixturePath: string): IAuthFixture {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Auth fixture at ${fixturePath} must be a JSON object.`);
    }

    const data: { [key: string]: unknown } = parsed as { [key: string]: unknown };
    const cookie: string = typeof data.cookie === "string" ? data.cookie.trim() : "";
    if (!cookie) {
        throw new Error(`Auth fixture at ${fixturePath} is missing a "cookie" string.`);
    }
    if (cookie.indexOf("LEETCODE_SESSION=") < 0 || cookie.indexOf("csrftoken=") < 0) {
        throw new Error(`Auth fixture cookie must contain both LEETCODE_SESSION and csrftoken. Recapture it from the browser extension's Developer mode.`);
    }

    return {
        endpoint: data.endpoint === "leetcode-cn" ? "leetcode-cn" : "leetcode",
        cookie,
        userAgent: typeof data.userAgent === "string" && data.userAgent.trim() ? data.userAgent.trim() : undefined,
        requestHeaders: normalizeHeaders(data.requestHeaders),
    };
}

function normalizeHeaders(raw: unknown): IBrowserRequestHeaders | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }

    const source: { [key: string]: unknown } = raw as { [key: string]: unknown };
    const headers: IBrowserRequestHeaders = {};
    for (const key of Object.keys(source)) {
        const value: unknown = source[key];
        if (typeof value === "string") {
            headers[key.toLowerCase()] = value;
        }
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
}

class MapMemento {
    private readonly store: Map<string, unknown> = new Map<string, unknown>();

    public get<T>(key: string): T | undefined {
        return this.store.get(key) as T | undefined;
    }

    public update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.store.delete(key);
        } else {
            this.store.set(key, value);
        }
        return Promise.resolve();
    }

    public keys(): readonly string[] {
        return Array.from(this.store.keys());
    }
}

class MapSecretStorage {
    private readonly values: Map<string, string> = new Map<string, string>();

    public get(key: string): Promise<string | undefined> {
        return Promise.resolve(this.values.get(key));
    }

    public store(key: string, value: string): Promise<void> {
        this.values.set(key, value);
        return Promise.resolve();
    }

    public delete(key: string): Promise<void> {
        this.values.delete(key);
        return Promise.resolve();
    }

    public onDidChange(): vscode.Disposable {
        return { dispose(): void { /* no-op */ } };
    }
}
