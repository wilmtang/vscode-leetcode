// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

const cStyleCommentLanguages: Set<string> = new Set([
    "c",
    "cpp",
    "csharp",
    "golang",
    "java",
    "javascript",
    "kotlin",
    "php",
    "rust",
    "scala",
    "swift",
    "typescript",
]);

const singleLineCommentByLanguage: Map<string, string> = new Map([
    ["bash", "#"],
    ["mysql", "--"],
    ["python", "#"],
    ["python3", "#"],
    ["ruby", "#"],
]);

export interface ICommentStyle {
    start: string;
    line: string;
    end: string;
    singleLine: string;
}

// Mirrors vsc-leetcode-cli's helper.langToCommentStyle so the files this
// extension now generates itself keep the exact comment framing the CLI used
// (and that parseSolutionFile / getNodeIdFromFile still parse).
export function getCommentStyle(language: string): ICommentStyle {
    if (cStyleCommentLanguages.has(language)) {
        return { start: "/*", line: " *", end: " */", singleLine: "//" };
    }

    const marker: string = singleLineCommentByLanguage.get(language) || "#";
    return { start: marker, line: marker, end: marker, singleLine: marker };
}

export function normalizeTemplateComments(codeTemplate: string, language: string, showDescriptionInComment: boolean): string {
    if (!showDescriptionInComment) {
        return codeTemplate;
    }

    const commentLine: string | undefined = getCommentLine(language);
    if (!commentLine) {
        return codeTemplate;
    }

    return normalizeMultilineField(codeTemplate, commentLine, "Testcase Example:");
}

function getCommentLine(language: string): string | undefined {
    if (cStyleCommentLanguages.has(language)) {
        return " *";
    }

    return singleLineCommentByLanguage.get(language);
}

function normalizeMultilineField(codeTemplate: string, commentLine: string, fieldLabel: string): string {
    const lineBreak: string = getLineBreak(codeTemplate);
    const lines: string[] = codeTemplate.split(/\r\n|\n|\r/);

    for (let index: number = 0; index < lines.length; index++) {
        if (!isCommentedFieldLine(lines[index], commentLine, fieldLabel)) {
            continue;
        }

        const fieldEndIndex: number = findNextCommentSeparatorLine(lines, index + 1, commentLine);
        if (fieldEndIndex < 0) {
            continue;
        }

        for (let fieldLineIndex: number = index + 1; fieldLineIndex < fieldEndIndex; fieldLineIndex++) {
            if (!lines[fieldLineIndex].startsWith(commentLine)) {
                lines[fieldLineIndex] = commentLine + (lines[fieldLineIndex] ? ` ${lines[fieldLineIndex]}` : "");
            }
        }
    }

    return lines.join(lineBreak);
}

function getLineBreak(value: string): string {
    const lineBreakMatch: RegExpMatchArray | null = value.match(/\r\n|\n|\r/);
    return lineBreakMatch ? lineBreakMatch[0] : "\n";
}

function isCommentedFieldLine(line: string, commentLine: string, fieldLabel: string): boolean {
    return line.startsWith(commentLine) && line.indexOf(fieldLabel) >= commentLine.length;
}

function findNextCommentSeparatorLine(lines: string[], startIndex: number, commentLine: string): number {
    const trimmedCommentLine: string = commentLine.trim();
    for (let index: number = startIndex; index < lines.length; index++) {
        if (lines[index].trim() === trimmedCommentLine) {
            return index;
        }
    }

    return -1;
}
