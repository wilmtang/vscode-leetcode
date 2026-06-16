
// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { customCodeLensProvider } from "../codelens/CustomCodeLensProvider";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { addFavoriteQuestion, removeFavoriteQuestion } from "../request/leetcode-api";
import { hasStarShortcut } from "../utils/settingUtils";
import { DialogType, promptForOpenOutputChannel } from "../utils/uiUtils";

export async function addFavorite(node: LeetCodeNode): Promise<void> {
    try {
        await toggleFavorite(node, true);
    } catch (error) {
        await promptForOpenOutputChannel("Failed to add the problem to favorite. Please open the output channel for details.", DialogType.error);
    }
}

export async function removeFavorite(node: LeetCodeNode): Promise<void> {
    try {
        await toggleFavorite(node, false);
    } catch (error) {
        await promptForOpenOutputChannel("Failed to remove the problem from favorite. Please open the output channel for details.", DialogType.error);
    }
}

async function toggleFavorite(node: LeetCodeNode, addToFavorite: boolean): Promise<void> {
    const titleSlug: string | undefined = node.titleSlug;
    if (!titleSlug) {
        throw new Error(`Cannot resolve the problem slug for "${node.name}".`);
    }

    if (addToFavorite) {
        await addFavoriteQuestion(titleSlug);
    } else {
        await removeFavoriteQuestion(titleSlug);
    }

    await leetCodeTreeDataProvider.refresh();
    if (hasStarShortcut()) {
        customCodeLensProvider.refresh();
    }
}
