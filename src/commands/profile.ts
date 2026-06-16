// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { authSyncServer, IAuthSyncStatusSnapshot } from "../auth/authSyncServer";
import { globalState, UserDataType } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import {
    fetchProfileIdentity,
    fetchProfileLanguages,
    fetchProfileRecent,
    fetchProfileStats,
} from "../request/leetcode-api";
import { UserStatus } from "../shared";
import { promptForSignIn } from "../utils/uiUtils";
import { IProfileSyncStatus, leetCodeProfileProvider, ProfileSectionId } from "../webview/leetCodeProfileProvider";

// Status bar action: render the signed-in user's public profile (solved counts
// by difficulty, ranking, recent AC, language stats) plus the local cookie-sync
// status. The panel opens immediately with a shell; the four profile queries are
// fired independently and each section fills the moment its query lands, so a
// slow or failed query never holds up the rest. When signed out, route to the
// sign-in prompt so the click is never a dead-end.
export async function showUserProfile(): Promise<void> {
    if (leetCodeManager.getStatus() !== UserStatus.SignedIn) {
        promptForSignIn();
        return;
    }

    const username: string | undefined = leetCodeManager.getUser();
    if (!username) {
        promptForSignIn();
        return;
    }

    const cached: UserDataType | undefined = globalState.getUserStatus();
    leetCodeProfileProvider.open({
        username,
        avatar: (cached && cached.avatar) || "",
        syncStatus: gatherSyncStatus(username, cached),
    });

    // No Promise.all: each query renders its section independently as it lands.
    void fetchSection("header", () => fetchProfileIdentity(username), (data) => leetCodeProfileProvider.updateIdentity(data));
    void fetchSection("totals", () => fetchProfileStats(username), (data) => leetCodeProfileProvider.updateStats(data));
    void fetchSection("recent", () => fetchProfileRecent(username), (data) => leetCodeProfileProvider.updateRecent(data));
    void fetchSection("languages", () => fetchProfileLanguages(username), (data) => leetCodeProfileProvider.updateLanguages(data));
}

async function fetchSection<T>(id: ProfileSectionId, fetch: () => Promise<T>, apply: (data: T) => void): Promise<void> {
    try {
        apply(await fetch());
    } catch (error) {
        leetCodeChannel.appendLine(`[profile] section "${id}" failed: ${String(error)}`);
        leetCodeProfileProvider.failSection(id, "Couldn't load this section — see the LeetCode output channel.");
    }
}

// Snapshots the local cookie/auth-sync state for the panel's "Sync" card. All of
// this is synchronous local state (no network), so the card paints immediately.
function gatherSyncStatus(username: string, cached: UserDataType | undefined): IProfileSyncStatus {
    const snapshot: IAuthSyncStatusSnapshot = authSyncServer.getStatusSnapshot();
    return {
        username: (cached && cached.username) || username,
        isPremium: !!(cached && cached.isPremium),
        isVerified: !!(cached && cached.isVerified),
        lastSyncedAt: globalState.getAuthSyncLastSyncedAt(),
        mode: snapshot.mode,
        port: snapshot.port,
        ownedByThisWindow: snapshot.mode === "local",
        ownerWindowLabel: snapshot.owner && snapshot.owner.windowLabel,
        ownerHeartbeatAt: snapshot.owner && snapshot.owner.heartbeatAt,
        currentWindowLabel: snapshot.currentWindow.windowLabel,
        hasConflict: snapshot.mode === "conflict" || !!snapshot.conflict,
        conflictSummary: snapshot.conflict && snapshot.conflict.summary,
    };
}
