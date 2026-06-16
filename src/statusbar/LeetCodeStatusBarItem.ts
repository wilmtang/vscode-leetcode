// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { UserStatus } from "../shared";

export class LeetCodeStatusBarItem implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;

    constructor() {
        // The status bar item used to open session management; LeetCode removed
        // the session feature, so the item is now display-only (signed-in user).
        this.statusBarItem = vscode.window.createStatusBarItem();
    }

    public updateStatusBar(status: UserStatus, user?: string): void {
        switch (status) {
            case UserStatus.SignedIn:
                this.statusBarItem.text = `LeetCode: ${user}`;
                break;
            case UserStatus.SignedOut:
            default:
                this.statusBarItem.text = "";
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
