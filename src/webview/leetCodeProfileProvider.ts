// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as crypto from "crypto";
import { commands, ViewColumn } from "vscode";
import {
    ILeetCodeBeats,
    ILeetCodeDifficultyCount,
    ILeetCodeLanguageCount,
    ILeetCodeRecentSubmission,
    ILeetCodeUserProfile,
} from "../request/leetcode-api";
import { getUrl } from "../shared";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";

// Panel that opens when the user clicks the LeetCode status bar item. Mirrors
// the public leetcode.com/u/<user>/ + /progress/ pages: total solved, per-
// difficulty progress bars + beats percentages, language breakdown, recent
// accepted submissions, and identity (ranking, country, company, school,
// reputation). Pure render — fetching is the caller's job.
class LeetCodeProfileProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.profile";
    private profile?: ILeetCodeUserProfile;

    public show(profile: ILeetCodeUserProfile): void {
        this.profile = profile;
        this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        const title: string = this.profile && this.profile.username ? `LeetCode: ${this.profile.username}` : "LeetCode Profile";
        return { title, viewColumn: ViewColumn.One };
    }

    protected getWebviewContent(): string {
        if (!this.profile) {
            return this.emptyContent();
        }

        const nonce: string = crypto.randomBytes(16).toString("base64");
        const profile: ILeetCodeUserProfile = this.profile;
        const base: string = getUrl("base");
        const profileUrl: string = `${base}/u/${encodeURIComponent(profile.username)}/`;
        const all: ILeetCodeDifficultyCount = pickDifficulty(profile.solvedByDifficulty, "All") || { difficulty: "All", count: 0 };
        const allTotal: ILeetCodeDifficultyCount = pickDifficulty(profile.totalsByDifficulty, "All") || { difficulty: "All", count: 0 };
        const easy: ILeetCodeDifficultyCount = pickDifficulty(profile.solvedByDifficulty, "Easy") || { difficulty: "Easy", count: 0 };
        const medium: ILeetCodeDifficultyCount = pickDifficulty(profile.solvedByDifficulty, "Medium") || { difficulty: "Medium", count: 0 };
        const hard: ILeetCodeDifficultyCount = pickDifficulty(profile.solvedByDifficulty, "Hard") || { difficulty: "Hard", count: 0 };
        const easyTotal: number = (pickDifficulty(profile.totalsByDifficulty, "Easy") || { count: 0 }).count;
        const mediumTotal: number = (pickDifficulty(profile.totalsByDifficulty, "Medium") || { count: 0 }).count;
        const hardTotal: number = (pickDifficulty(profile.totalsByDifficulty, "Hard") || { count: 0 }).count;

        const identityRows: string = buildIdentityRows(profile);
        const recentRows: string = buildRecentRows(profile.recentAcSubmissions, base);
        const languageRows: string = buildLanguageRows(profile.languageProblemCount);
        const beats: { [key: string]: number | undefined } = beatsMap(profile.beatsByDifficulty);
        const avatarBlock: string = profile.avatar
            ? `<img class="avatar" src="${escapeAttribute(profile.avatar)}" alt="avatar" />`
            : `<div class="avatar avatar-placeholder">${escapeHtml(initials(profile.username))}</div>`;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 1.5rem; }
                    h1, h2 { margin-bottom: 0.5rem; }
                    a { color: var(--vscode-textLink-foreground); text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem; }
                    .avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--vscode-editorWidget-background); }
                    .avatar-placeholder { display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 1.25rem; }
                    .meta { line-height: 1.4; }
                    .meta .name { font-size: 1.25rem; font-weight: 600; }
                    .meta .secondary { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1rem; }
                    .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 1rem; }
                    .card h2 { margin-top: 0; font-size: 1rem; }
                    .totals { text-align: center; padding: 1.25rem 1rem; }
                    .totals .big { font-size: 2.5rem; font-weight: 700; }
                    .totals .denom { color: var(--vscode-descriptionForeground); font-size: 1rem; }
                    .difficulty-row { display: grid; grid-template-columns: 70px 1fr 110px; align-items: center; gap: 0.75rem; margin: 0.5rem 0; }
                    .difficulty-row .label { font-weight: 600; }
                    .difficulty-row.easy .label { color: #00b8a3; }
                    .difficulty-row.medium .label { color: #ffb700; }
                    .difficulty-row.hard .label { color: #ff375f; }
                    .bar { background: var(--vscode-progressBar-background, rgba(127,127,127,0.2)); height: 8px; border-radius: 4px; overflow: hidden; }
                    .bar .fill { height: 100%; }
                    .easy .fill { background: #00b8a3; }
                    .medium .fill { background: #ffb700; }
                    .hard .fill { background: #ff375f; }
                    .difficulty-row .stats { text-align: right; font-variant-numeric: tabular-nums; color: var(--vscode-descriptionForeground); }
                    .difficulty-row .stats .solved { color: var(--vscode-foreground); }
                    .beats { display: flex; gap: 1rem; margin-top: 0.75rem; flex-wrap: wrap; }
                    .beats .pill { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 12px; padding: 0.15rem 0.65rem; font-size: 0.8rem; }
                    table { width: 100%; border-collapse: collapse; }
                    table th, table td { text-align: left; padding: 0.35rem 0.5rem; font-size: 0.9rem; }
                    table tr + tr td { border-top: 1px solid var(--vscode-editorWidget-border); }
                    table td.num { text-align: right; font-variant-numeric: tabular-nums; }
                    .identity { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 0.75rem; font-size: 0.9rem; }
                    .identity dt { color: var(--vscode-descriptionForeground); }
                    .identity dd { margin: 0; }
                    .actions { margin-top: 1rem; display: flex; gap: 0.75rem; }
                    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 0.35rem 0.85rem; cursor: pointer; border-radius: 2px; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
                </style>
            </head>
            <body>
                <div class="header">
                    ${avatarBlock}
                    <div class="meta">
                        <div class="name"><a href="${escapeAttribute(profileUrl)}">${escapeHtml(profile.username)}</a>${profile.realName ? ` <span class="secondary">(${escapeHtml(profile.realName)})</span>` : ""}</div>
                        <div class="secondary">${escapeHtml(formatRanking(profile.ranking))}</div>
                    </div>
                </div>

                <div class="grid">
                    <div class="card totals">
                        <div class="big">${all.count}</div>
                        <div class="denom">Solved / ${allTotal.count || "?"}</div>
                        <div class="difficulty-row easy">
                            <span class="label">Easy</span>
                            <div class="bar"><div class="fill" style="width:${percent(easy.count, easyTotal)}%"></div></div>
                            <span class="stats"><span class="solved">${easy.count}</span> / ${easyTotal || "?"}</span>
                        </div>
                        <div class="difficulty-row medium">
                            <span class="label">Medium</span>
                            <div class="bar"><div class="fill" style="width:${percent(medium.count, mediumTotal)}%"></div></div>
                            <span class="stats"><span class="solved">${medium.count}</span> / ${mediumTotal || "?"}</span>
                        </div>
                        <div class="difficulty-row hard">
                            <span class="label">Hard</span>
                            <div class="bar"><div class="fill" style="width:${percent(hard.count, hardTotal)}%"></div></div>
                            <span class="stats"><span class="solved">${hard.count}</span> / ${hardTotal || "?"}</span>
                        </div>
                        <div class="beats">
                            ${renderBeatsPill("Easy", beats["Easy"])}
                            ${renderBeatsPill("Medium", beats["Medium"])}
                            ${renderBeatsPill("Hard", beats["Hard"])}
                        </div>
                        <div class="actions">
                            <button id="refresh">Refresh</button>
                            <button id="open-leetcode">Open on LeetCode</button>
                        </div>
                    </div>

                    <div class="card">
                        <h2>About</h2>
                        ${identityRows || `<div class="empty">No public profile details.</div>`}
                    </div>

                    <div class="card">
                        <h2>Languages</h2>
                        ${languageRows || `<div class="empty">No language stats yet.</div>`}
                    </div>

                    <div class="card">
                        <h2>Recent Accepted</h2>
                        ${recentRows || `<div class="empty">No recent AC submissions.</div>`}
                    </div>
                </div>

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const refresh = document.getElementById("refresh");
                    if (refresh) refresh.onclick = () => vscode.postMessage({ command: "Refresh" });
                    const open = document.getElementById("open-leetcode");
                    if (open) open.onclick = () => vscode.postMessage({ command: "OpenProfile" });
                </script>
            </body>
            </html>
        `;
    }

    protected async onDidReceiveMessage(message: { command?: string }): Promise<void> {
        switch (message.command) {
            case "Refresh":
                await commands.executeCommand("leetcode.showUserProfile");
                break;
            case "OpenProfile":
                if (this.profile && this.profile.username) {
                    const url: string = `${getUrl("base")}/u/${encodeURIComponent(this.profile.username)}/`;
                    await commands.executeCommand("vscode.open", url);
                }
                break;
            default:
                break;
        }
    }

    private emptyContent(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none';" />
                <style>body { font-family: var(--vscode-font-family); padding: 1.5rem; }</style>
            </head>
            <body><p>Sign in to LeetCode to see your profile.</p></body>
            </html>
        `;
    }
}

function pickDifficulty(entries: ILeetCodeDifficultyCount[], difficulty: ILeetCodeDifficultyCount["difficulty"]): ILeetCodeDifficultyCount | undefined {
    for (const entry of entries) {
        if (entry.difficulty === difficulty) {
            return entry;
        }
    }
    return undefined;
}

function percent(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) {
        return 0;
    }
    const value: number = (numerator * 100) / denominator;
    return Math.max(0, Math.min(100, value));
}

function beatsMap(beats: ILeetCodeBeats[]): { [key: string]: number | undefined } {
    const out: { [key: string]: number | undefined } = {};
    for (const entry of beats) {
        out[entry.difficulty] = entry.percentage;
    }
    return out;
}

function renderBeatsPill(label: string, percentage: number | undefined): string {
    if (typeof percentage !== "number") {
        return "";
    }
    return `<span class="pill">Beats ${escapeHtml(label)}: ${percentage.toFixed(1)}%</span>`;
}

function formatRanking(ranking: number | undefined): string {
    if (!ranking) {
        return "Unranked";
    }
    return `Global ranking: #${ranking.toLocaleString()}`;
}

function buildIdentityRows(profile: ILeetCodeUserProfile): string {
    const rows: string[] = [];
    if (profile.countryName) {
        rows.push(`<dt>Country</dt><dd>${escapeHtml(profile.countryName)}</dd>`);
    }
    if (profile.company) {
        rows.push(`<dt>Company</dt><dd>${escapeHtml(profile.company)}</dd>`);
    }
    if (profile.school) {
        rows.push(`<dt>School</dt><dd>${escapeHtml(profile.school)}</dd>`);
    }
    if (typeof profile.ranking === "number" && profile.ranking > 0) {
        rows.push(`<dt>Ranking</dt><dd>#${profile.ranking.toLocaleString()}</dd>`);
    }
    if (profile.reputation) {
        rows.push(`<dt>Reputation</dt><dd>${profile.reputation.toLocaleString()}</dd>`);
    }
    return rows.length > 0 ? `<dl class="identity">${rows.join("")}</dl>` : "";
}

function buildRecentRows(submissions: ILeetCodeRecentSubmission[], base: string): string {
    if (submissions.length === 0) {
        return "";
    }

    const rows: string = submissions
        .slice(0, 10)
        .map((entry: ILeetCodeRecentSubmission) => {
            const url: string = `${base}/problems/${encodeURIComponent(entry.titleSlug)}/`;
            return `<tr><td><a href="${escapeAttribute(url)}">${escapeHtml(entry.title)}</a></td><td class="num">${escapeHtml(formatRelativeTimestamp(entry.timestamp))}</td></tr>`;
        })
        .join("");
    return `<table>${rows}</table>`;
}

function buildLanguageRows(languages: ILeetCodeLanguageCount[]): string {
    if (languages.length === 0) {
        return "";
    }

    const rows: string = languages
        .slice(0, 8)
        .map((entry: ILeetCodeLanguageCount) =>
            `<tr><td>${escapeHtml(entry.languageName)}</td><td class="num">${entry.problemsSolved}</td></tr>`,
        )
        .join("");
    return `<table>${rows}</table>`;
}

function formatRelativeTimestamp(timestampSeconds: number): string {
    if (!timestampSeconds) {
        return "";
    }
    // Avoid `Date.now()` so this stays renderable in pure unit tests, but the
    // webview only runs in vscode so a normal now() is fine.
    const nowSeconds: number = Math.floor(Date.now() / 1000);
    const diff: number = nowSeconds - timestampSeconds;
    if (diff < 0) {
        return new Date(timestampSeconds * 1000).toLocaleDateString();
    }
    if (diff < 60) {
        return `${diff}s ago`;
    }
    if (diff < 3600) {
        return `${Math.floor(diff / 60)}m ago`;
    }
    if (diff < 86400) {
        return `${Math.floor(diff / 3600)}h ago`;
    }
    if (diff < 30 * 86400) {
        return `${Math.floor(diff / 86400)}d ago`;
    }
    return new Date(timestampSeconds * 1000).toLocaleDateString();
}

function initials(username: string): string {
    const trimmed: string = (username || "").trim();
    if (!trimmed) {
        return "?";
    }
    return trimmed.slice(0, 2).toUpperCase();
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (ch: string) => {
        switch (ch) {
            case "&": return "&amp;";
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "\"": return "&quot;";
            case "'": return "&#39;";
            default: return ch;
        }
    });
}

function escapeAttribute(value: string): string {
    return escapeHtml(value);
}

export const leetCodeProfileProvider: LeetCodeProfileProvider = new LeetCodeProfileProvider();
