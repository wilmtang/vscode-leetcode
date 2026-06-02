import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as fse from "fs-extra";
import * as path from "path";
import { globalState } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { getUrl } from "../shared";
import { sleep } from "../utils/toolUtils";

const MAX_VERIFY_ATTEMPTS: number = 60;

export class DirectTestUnsupportedError extends Error { }

interface ISolutionFileMeta {
    code: string;
    frontendId: string;
    lang: string;
    slug: string;
}

interface IQuestionDetail {
    enableRunCode: boolean;
    questionFrontendId: string;
    questionId: string;
    sampleTestCase: string;
    titleSlug: string;
}

interface IQuestionDetailResponse {
    data?: {
        question?: IQuestionDetail;
    };
}

interface IRunCodeTask {
    error?: string;
    interpret_expected_id?: string;
    interpret_id?: string;
}

interface ICheckResult {
    code_answer?: string | string[];
    code_output?: string | string[];
    compile_error?: string;
    expected_code_answer?: string | string[];
    full_compile_error?: string;
    input?: string;
    lang?: string;
    last_testcase?: string;
    memory?: string;
    memory_percentile?: number;
    runtime_error?: string;
    runtime_percentile?: number;
    run_success?: boolean;
    state: string;
    status_memory?: string;
    status_msg: string;
    status_runtime?: string;
    std_output?: string;
    submission_id: string;
    total_correct?: number;
    total_testcases?: number;
}

export async function testSolutionWithSyncedCookie(filePath: string, testString?: string): Promise<string> {
    const cookie: string | undefined = globalState.getCookie();
    if (!cookie) {
        throw new DirectTestUnsupportedError("No synced LeetCode cookie is available.");
    }

    const meta: ISolutionFileMeta = await parseSolutionFile(filePath);
    const referer: string = `${getUrl("base")}/problems/${meta.slug}/description/`;
    const question: IQuestionDetail = await getQuestionDetail(meta.slug, cookie, referer);
    const testcase: string = normalizeTestcase(testString || question.sampleTestCase);

    if (!question.enableRunCode) {
        throw new Error("not testable? please submit directly!");
    }
    if (!testcase) {
        throw new Error("missing testcase?");
    }

    leetCodeChannel.appendLine("Sending code to judge");
    const task: IRunCodeTask = await runCode(meta, question, testcase, cookie, referer);
    if (!task.interpret_id) {
        throw new Error("LeetCode did not return an interpret id.");
    }

    leetCodeChannel.appendLine("Waiting for judge result");
    const actual: ICheckResult = await verifyResult(task.interpret_id, cookie, referer);
    const expected: ICheckResult | undefined = task.interpret_expected_id
        ? await verifyResult(task.interpret_expected_id, cookie, referer)
        : undefined;

    return formatTestResult(actual, expected, testcase);
}

async function parseSolutionFile(filePath: string): Promise<ISolutionFileMeta> {
    const content: string = await fse.readFile(filePath, "utf8");
    const metaMatch: RegExpMatchArray | null = content.match(/@lc\s+app=\S+\s+id=(\S+)\s+lang=(\S+)/);
    if (!metaMatch) {
        throw new DirectTestUnsupportedError("Cannot find LeetCode metadata in the solution file.");
    }

    const slug: string = parseSlug(content, filePath, metaMatch[1]);
    if (!slug) {
        throw new DirectTestUnsupportedError("Cannot infer the LeetCode problem slug from the solution file.");
    }

    return {
        code: parseCode(content),
        frontendId: metaMatch[1],
        lang: metaMatch[2],
        slug,
    };
}

function parseSlug(content: string, filePath: string, frontendId: string): string {
    const linkMatch: RegExpMatchArray | null = content.match(/https:\/\/leetcode\.(?:com|cn)\/problems\/([^/\s]+)/);
    if (linkMatch) {
        return linkMatch[1];
    }

    const basename: string = path.basename(filePath);
    const parts: string[] = basename.split(".");
    if (parts.length >= 3 && parts[0] === frontendId) {
        return parts.slice(1, -1).join(".");
    }

    return "";
}

function parseCode(content: string): string {
    const lines: string[] = content.split(/\r\n|\n|\r/);
    const start: number = lines.findIndex((line: string) => line.indexOf("@lc code=start") >= 0);
    const end: number = lines.findIndex((line: string) => line.indexOf("@lc code=end") >= 0);
    if (start >= 0 && end >= 0 && start + 1 <= end) {
        return lines.slice(start + 1, end).join("\n");
    }

    return content;
}

async function getQuestionDetail(slug: string, cookie: string, referer: string): Promise<IQuestionDetail> {
    const response: IQuestionDetailResponse = await requestJson<IQuestionDetailResponse>({
        method: "POST",
        url: getUrl("graphql"),
        headers: createHeaders(cookie, referer),
        data: {
            query: [
                "query getQuestionDetail($titleSlug: String!) {",
                "  question(titleSlug: $titleSlug) {",
                "    enableRunCode",
                "    questionFrontendId",
                "    questionId",
                "    sampleTestCase",
                "    titleSlug",
                "  }",
                "}",
            ].join("\n"),
            variables: { titleSlug: slug },
            operationName: "getQuestionDetail",
        },
    });
    const question: IQuestionDetail | undefined = response.data && response.data.question;
    if (!question) {
        throw new DirectTestUnsupportedError(`Cannot load LeetCode problem details for "${slug}".`);
    }

    return question;
}

async function runCode(meta: ISolutionFileMeta, question: IQuestionDetail, testcase: string, cookie: string, referer: string): Promise<IRunCodeTask> {
    const url: string = `${getUrl("base")}/problems/${meta.slug}/interpret_solution/`;
    let delaySeconds: number = 1;

    for (let attempt: number = 0; attempt < 5; attempt++) {
        const task: IRunCodeTask = await requestJson<IRunCodeTask>({
            method: "POST",
            url,
            headers: createHeaders(cookie, referer),
            data: {
                data_input: testcase,
                lang: meta.lang,
                question_id: parseInt(question.questionId, 10),
                test_mode: false,
                typed_code: meta.code,
            },
        });

        if (!task.error) {
            return task;
        }
        if (/session expired/i.test(task.error)) {
            throw new DirectTestUnsupportedError("Direct LeetCode test request was rejected by the judge endpoint.");
        }
        if (task.error.indexOf("too soon") < 0) {
            throw new Error(task.error);
        }

        await sleep(delaySeconds * 1000);
        delaySeconds++;
    }

    throw new Error("LeetCode rejected the run because requests were sent too quickly.");
}

async function verifyResult(id: string, cookie: string, referer: string): Promise<ICheckResult> {
    const url: string = `${getUrl("base")}/submissions/detail/${id}/check/`;
    for (let attempt: number = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
        const result: ICheckResult = await requestJson<ICheckResult>({
            method: "GET",
            url,
            headers: createHeaders(cookie, referer),
        });
        if (result.state === "SUCCESS") {
            return result;
        }

        await sleep(1000);
    }

    throw new Error("Timed out waiting for LeetCode judge result.");
}

async function requestJson<T>(config: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await axios({
        ...config,
        validateStatus: () => true,
    });

    if (response.status === 401 || response.status === 403) {
        throw new DirectTestUnsupportedError("Direct LeetCode test request was rejected by the judge endpoint.");
    }
    if (response.status !== 200) {
        throw new Error(`http error [code=${response.status}]`);
    }

    return response.data;
}

function createHeaders(cookie: string, referer: string): { [key: string]: string } {
    const sessionCookie: string | undefined = getCookieValue(cookie, "LEETCODE_SESSION");
    const csrfToken: string | undefined = getCookieValue(cookie, "csrftoken");
    if (!sessionCookie || !csrfToken) {
        throw new DirectTestUnsupportedError("Synced cookie is missing LeetCode session data required by the judge endpoint.");
    }

    const headers: { [key: string]: string } = {
        "Content-Type": "application/json",
        "Cookie": `LEETCODE_SESSION=${sessionCookie};csrftoken=${csrfToken};`,
        "Origin": getUrl("base"),
        "Referer": referer,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrfToken,
    };

    return headers;
}

function getCookieValue(cookie: string, name: string): string | undefined {
    for (const part of cookie.split(";")) {
        const trimmed: string = part.trim();
        const separatorIndex: number = trimmed.indexOf("=");
        if (separatorIndex <= 0) {
            continue;
        }
        if (trimmed.slice(0, separatorIndex) === name) {
            return trimmed.slice(separatorIndex + 1);
        }
    }

    return undefined;
}

function normalizeTestcase(testcase: string): string {
    return testcase.replace(/\r\n|\r/g, "\n").replace(/\\n/g, "\n").trim();
}

function formatTestResult(actual: ICheckResult, expected: ICheckResult | undefined, testcase: string): string {
    const errors: string[] = collectErrors(actual);
    const passed: number = actual.total_correct || 0;
    const total: number = actual.total_testcases || 0;
    const ok: boolean = !!actual.run_success && passed === total && actual.status_msg === "Accepted" && errors.length === 0;
    const state: string = actual.status_msg === "Accepted" ? "Finished" : actual.status_msg;
    const output: string = formatValue(actual.code_answer);
    const expectedAnswer: string = expected ? formatValue(expected.code_answer) : formatValue(actual.expected_code_answer);
    const stdout: string = formatValue(actual.code_output || actual.std_output).replace(/\\n/g, "\n");
    const runtime: string = actual.status_runtime || "";
    const lines: string[] = [];

    appendLine(lines, ok, state);
    for (const error of errors) {
        appendKeyValue(lines, ok, "Error", error);
    }
    appendKeyValue(lines, ok, "Your Input", testcase);
    appendKeyValue(lines, ok, runtime ? `Output (${runtime})` : "Output", output);
    appendKeyValue(lines, ok, "Expected Answer", expectedAnswer);
    appendKeyValue(lines, ok, "Stdout", stdout);

    return lines.join("\n") + "\n";
}

function collectErrors(result: ICheckResult): string[] {
    const errors: string[] = [];
    for (const key of Object.keys(result)) {
        if (/_error$/.test(key)) {
            const value: unknown = (result as unknown as { [key: string]: unknown })[key];
            if (typeof value === "string" && value.length > 0) {
                errors.push(value);
            }
        }
    }

    return errors;
}

function appendKeyValue(lines: string[], ok: boolean, key: string, value: string): void {
    appendLine(lines, ok, `${key}: ${value}`);
}

function appendLine(lines: string[], ok: boolean, value: string): void {
    lines.push(`  ${ok ? "✔" : "✘"} ${value}`);
}

function formatValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
        return value.join("\n");
    }
    if (!value) {
        return "";
    }

    return value;
}
