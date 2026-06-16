// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { UserStatus } from "../shared";

export class LeetCodeStatusBarItem implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;

    constructor() {
        // The status bar item used to open session management (now retired). When
        // signed in, route the click to the user-profile panel (solved counts,
        // ranking, recent AC submissions). When signed out, route to the existing
        // sign-in prompt so the click is never a dead-end.
        this.statusBarItem = vscode.window.createStatusBarItem();
        this.statusBarItem.command = "leetcode.signin";
        this.statusBarItem.tooltip = "Sign in to LeetCode";
    }

    public updateStatusBar(status: UserStatus, user?: string): void {
        switch (status) {
            case UserStatus.SignedIn:
                this.statusBarItem.text = `LeetCode: ${user}`;
                this.statusBarItem.command = "leetcode.showUserProfile";
                this.statusBarItem.tooltip = "Show your LeetCode profile and solved-problem stats";
                break;
            case UserStatus.SignedOut:
            default:
                this.statusBarItem.text = "";
                this.statusBarItem.command = "leetcode.signin";
                this.statusBarItem.tooltip = "Sign in to LeetCode";
                break;
        }
    }

    public show(): void {
        this.statusBarItem.show();
    }

    public hide(): void {
        this.statusBarItem.hide();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
