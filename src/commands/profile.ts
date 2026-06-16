// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { fetchUserProfile, ILeetCodeUserProfile } from "../request/leetcode-api";
import { UserStatus } from "../shared";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { leetCodeProfileProvider } from "../webview/leetCodeProfileProvider";

// Status bar action: load the signed-in user's public profile (solved counts by
// difficulty, ranking, recent AC, language stats) and render it in a webview.
// When signed out, route to the existing sign-in prompt so the click is never a
// dead-end.
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

    try {
        const profile: ILeetCodeUserProfile = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Loading LeetCode profile for ${username}...` },
            () => fetchUserProfile(username),
        );
        leetCodeProfileProvider.show(profile);
    } catch (error) {
        leetCodeChannel.appendLine(`[profile] Failed to load profile for ${username}: ${String(error)}`);
        await promptForOpenOutputChannel("Failed to load your LeetCode profile. Please open the output channel for details.", DialogType.error);
    }
}
