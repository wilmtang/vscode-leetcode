import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as cp from "child_process";
import * as fse from "fs-extra";
import * as path from "path";
import { globalState, IBrowserRequestHeaders } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { getUrl } from "../shared";
import { sleep } from "../utils/toolUtils";

const MAX_VERIFY_ATTEMPTS: number = 60;
const CURL_STATUS_MARKER: string = "\n__LEETCODE_HTTP_STATUS__:";

export class DirectTestUnsupportedError extends Error {
    constructor(message: string, public readonly allowCliFallback: boolean = true) {
        super(message);
    }
}

interface ISolutionFileMeta {
    code: string;
    frontendId: string;
    lang: string;
    slug: string;
}

interface IQuestionDetail {
    enableRunCode: boolean;
    exampleTestcaseList?: string[];
    exampleTestcases?: string;
    metaData?: string;
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
    compare_result?: string;
    compile_error?: string;
    data_input?: string | string[];
    expected_code_answer?: string | string[];
    expected_output?: string;
    full_compile_error?: string;
    full_runtime_error?: string;
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
    std_output_list?: string | string[];
    submission_id: string;
    total_correct?: number;
    total_testcases?: number;
}

interface IRequestContext {
    label: string;
    logMode?: boolean;
}

interface IQuestionMetaData {
    params?: unknown[];
    systemdesign?: boolean;
}

interface ICaseResult {
    accepted: boolean;
    expected: string;
    input: string;
    output: string;
    status: string;
    stdout: string;
}

export async function testSolutionWithSyncedCookie(filePath: string, testString?: string): Promise<string> {
    const cookie: string | undefined = globalState.getCookie();
    if (!cookie) {
        throw new DirectTestUnsupportedError("No synced LeetCode cookie is available.");
    }

    const meta: ISolutionFileMeta = await parseSolutionFile(filePath);
    const referer: string = `${getUrl("base")}/problems/${meta.slug}/`;
    const question: IQuestionDetail = await getQuestionDetail(meta.slug, cookie, referer);
    const defaultTestcases: string[] = getDefaultTestcases(question);
    const testcase: string = normalizeTestcase(testString || defaultTestcases.join("\n"));
    const testcaseList: string[] = testString ? splitTestcases(testcase, question) : defaultTestcases;

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

    return formatTestResult(actual, expected, testcase, testcaseList);
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
                "    exampleTestcaseList",
                "    exampleTestcases",
                "    metaData",
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
    }, { label: "problem metadata" });
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
                question_id: question.questionId,
                typed_code: meta.code,
            },
        }, { label: "run-code enqueue", logMode: true });

        if (!task.error) {
            return task;
        }
        if (/session expired/i.test(task.error)) {
            leetCodeChannel.appendLine(`[test] Failure cause: LeetCode run-code response error: ${task.error}`);
            throw new DirectTestUnsupportedError("Direct LeetCode run-code request returned: session expired.", false);
        }
        if (task.error.indexOf("too soon") < 0) {
            leetCodeChannel.appendLine(`[test] Failure cause: LeetCode run-code response error: ${task.error}`);
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
        }, { label: "judge result poll" });
        if (result.state === "SUCCESS") {
            return result;
        }

        await sleep(1000);
    }

    throw new Error("Timed out waiting for LeetCode judge result.");
}

async function requestJson<T>(config: AxiosRequestConfig, context: IRequestContext): Promise<T> {
    if (context.logMode) {
        leetCodeChannel.appendLine(`[test] Request mode: node/axios (${context.label}).`);
    }

    let response: AxiosResponse<T>;
    try {
        response = await axios({
            ...config,
            validateStatus: () => true,
        });
    } catch (error) {
        const message: string = getErrorMessage(error);
        leetCodeChannel.appendLine(`[test] Failure cause: node/axios transport error (${context.label}): ${message}`);
        throw new Error(`node/axios request failed (${context.label}): ${message}`);
    }

    if (response.status === 401 || response.status === 403) {
        if (isCloudflareChallenge(response.data)) {
            leetCodeChannel.appendLine(`[test] Failure cause: Cloudflare challenge page from node/axios (${context.label}, HTTP ${response.status}).`);
            leetCodeChannel.appendLine(`[test] Request mode: curl (${context.label}).`);
            return requestJsonWithCurl<T>(config, context);
        }

        leetCodeChannel.appendLine(`[test] Failure cause: LeetCode rejected node/axios request (${context.label}, HTTP ${response.status}).`);
        throw new DirectTestUnsupportedError(`Direct LeetCode request was rejected by node/axios (${context.label}): HTTP ${response.status}${summarizeResponseData(response.data)}.`, false);
    }
    if (response.status !== 200) {
        leetCodeChannel.appendLine(`[test] Failure cause: unexpected node/axios HTTP status (${context.label}, HTTP ${response.status}).`);
        throw new Error(`node/axios http error (${context.label}) [code=${response.status}]`);
    }

    if (context.logMode) {
        leetCodeChannel.appendLine(`[test] node/axios request succeeded (${context.label}).`);
    }

    return response.data;
}

async function requestJsonWithCurl<T>(config: AxiosRequestConfig, context: IRequestContext): Promise<T> {
    let response: ICurlResponse;
    try {
        response = await executeCurl(config);
    } catch (error) {
        const message: string = getErrorMessage(error);
        leetCodeChannel.appendLine(`[test] Failure cause: curl transport error (${context.label}): ${message}`);
        throw new Error(`curl request failed (${context.label}): ${message}`);
    }

    if (response.status === 401 || response.status === 403) {
        if (isCloudflareChallenge(response.body)) {
            leetCodeChannel.appendLine(`[test] Failure cause: Cloudflare challenge page from curl (${context.label}, HTTP ${response.status}).`);
            throw new DirectTestUnsupportedError(`Direct LeetCode curl request hit Cloudflare challenge (${context.label}): HTTP ${response.status}${summarizeResponseData(response.body)}.`, false);
        }

        leetCodeChannel.appendLine(`[test] Failure cause: LeetCode rejected curl request (${context.label}, HTTP ${response.status}).`);
        throw new DirectTestUnsupportedError(`Direct LeetCode curl request was rejected (${context.label}): HTTP ${response.status}${summarizeResponseData(response.body)}.`, false);
    }
    if (response.status !== 200) {
        leetCodeChannel.appendLine(`[test] Failure cause: unexpected curl HTTP status (${context.label}, HTTP ${response.status}).`);
        throw new Error(`curl http error (${context.label}) [code=${response.status}]`);
    }

    try {
        const data: T = JSON.parse(response.body) as T;
        if (context.logMode) {
            leetCodeChannel.appendLine(`[test] curl request succeeded (${context.label}).`);
        }
        return data;
    } catch (error) {
        leetCodeChannel.appendLine(`[test] Failure cause: curl returned non-JSON response (${context.label}).`);
        throw new Error(`curl JSON parse failed (${context.label}). Response: ${response.body.slice(0, 200)}`);
    }
}

function executeCurl(config: AxiosRequestConfig): Promise<ICurlResponse> {
    return new Promise<ICurlResponse>((resolve: (response: ICurlResponse) => void, reject: (error: Error) => void): void => {
        const url: string | undefined = config.url;
        if (!url) {
            reject(new Error("Cannot execute curl request without a URL."));
            return;
        }

        const method: string = (config.method || "GET").toString().toUpperCase();
        const args: string[] = ["-sS", "-L", "--compressed", "-w", `${CURL_STATUS_MARKER}%{http_code}`, "-X", method, url];
        const headers: { [key: string]: unknown } = (config.headers || {}) as { [key: string]: unknown };

        for (const key of Object.keys(headers)) {
            const value: unknown = headers[key];
            if (typeof value !== "string") {
                continue;
            }

            if (key.toLowerCase() === "cookie") {
                args.push("-b", value);
            } else if (value === "") {
                args.push("-H", `${key};`);
            } else {
                args.push("-H", `${key}: ${value}`);
            }
        }

        if (config.data !== undefined && method !== "GET") {
            const body: string = typeof config.data === "string" ? config.data : JSON.stringify(config.data);
            args.push("--data-raw", body);
        }

        cp.execFile("curl", args, { maxBuffer: 10 * 1024 * 1024 }, (error: cp.ExecException | null, stdout: string, stderr: string) => {
            if (error) {
                reject(new Error(`curl request failed: ${stderr || error.message}`));
                return;
            }

            const markerIndex: number = stdout.lastIndexOf(CURL_STATUS_MARKER);
            if (markerIndex < 0) {
                reject(new Error("curl response did not include an HTTP status code."));
                return;
            }

            const body: string = stdout.slice(0, markerIndex);
            const status: number = parseInt(stdout.slice(markerIndex + CURL_STATUS_MARKER.length).trim(), 10);
            resolve({ body, status });
        });
    });
}

function createHeaders(cookie: string, referer: string): { [key: string]: string } {
    const sessionCookie: string | undefined = getCookieValue(cookie, "LEETCODE_SESSION");
    const csrfToken: string | undefined = getCookieValue(cookie, "csrftoken");
    if (!sessionCookie || !csrfToken) {
        throw new DirectTestUnsupportedError("Synced cookie is missing LeetCode session data required by the judge endpoint.");
    }

    const headers: { [key: string]: string } = {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Authorization": "",
        "Content-Type": "application/json",
        "Cookie": cookie,
        "Origin": getUrl("base"),
        "Referer": referer,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "X-CSRFToken": csrfToken,
    };

    const browserUserAgent: string | undefined = globalState.getBrowserUserAgent();
    if (browserUserAgent) {
        headers["User-Agent"] = browserUserAgent;
    }

    const browserRequestHeaders: IBrowserRequestHeaders | undefined = globalState.getBrowserRequestHeaders();
    if (browserRequestHeaders) {
        mergeBrowserRequestHeaders(headers, browserRequestHeaders);
    }

    headers["Content-Type"] = "application/json";
    headers["Cookie"] = cookie;
    headers["Origin"] = getUrl("base");
    headers["Referer"] = referer;
    headers["X-CSRFToken"] = csrfToken;

    return headers;
}

function mergeBrowserRequestHeaders(headers: { [key: string]: string }, browserRequestHeaders: IBrowserRequestHeaders): void {
    for (const key of Object.keys(browserRequestHeaders)) {
        const canonicalKey: string | undefined = canonicalHeaderName(key);
        if (!canonicalKey) {
            continue;
        }

        headers[canonicalKey] = browserRequestHeaders[key];
    }
}

function canonicalHeaderName(name: string): string | undefined {
    const names: { [key: string]: string } = {
        "accept": "Accept",
        "accept-language": "Accept-Language",
        "authorization": "Authorization",
        "connection": "Connection",
        "dnt": "DNT",
        "priority": "Priority",
        "sec-ch-ua": "Sec-CH-UA",
        "sec-ch-ua-arch": "Sec-CH-UA-Arch",
        "sec-ch-ua-bitness": "Sec-CH-UA-Bitness",
        "sec-ch-ua-full-version": "Sec-CH-UA-Full-Version",
        "sec-ch-ua-full-version-list": "Sec-CH-UA-Full-Version-List",
        "sec-ch-ua-mobile": "Sec-CH-UA-Mobile",
        "sec-ch-ua-model": "Sec-CH-UA-Model",
        "sec-ch-ua-platform": "Sec-CH-UA-Platform",
        "sec-ch-ua-platform-version": "Sec-CH-UA-Platform-Version",
        "sec-fetch-dest": "Sec-Fetch-Dest",
        "sec-fetch-mode": "Sec-Fetch-Mode",
        "sec-fetch-site": "Sec-Fetch-Site",
        "sec-gpc": "Sec-GPC",
        "te": "TE",
        "user-agent": "User-Agent",
    };

    return names[name.toLowerCase()];
}

function isCloudflareChallenge(data: unknown): boolean {
    const text: string = typeof data === "string" ? data : JSON.stringify(data || "");
    return /<title>Just a moment\.\.\.<\/title>/i.test(text) || /cf-mitigated/i.test(text);
}

function summarizeResponseData(data: unknown): string {
    if (!data) {
        return "";
    }

    const text: string = typeof data === "string" ? data : JSON.stringify(data);
    const trimmed: string = text.replace(/\s+/g, " ").trim();
    return trimmed ? ` (${trimmed.slice(0, 200)})` : "";
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

interface ICurlResponse {
    body: string;
    status: number;
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

function getDefaultTestcases(question: IQuestionDetail): string[] {
    if (question.exampleTestcaseList && question.exampleTestcaseList.length > 0) {
        const testcases: string[] = question.exampleTestcaseList.map(normalizeTestcase).filter((value: string) => !!value);
        if (testcases.length > 0) {
            return testcases;
        }
    }

    const source: string = question.exampleTestcases || question.sampleTestCase;
    return splitTestcases(source, question);
}

function splitTestcases(testcase: string | string[] | undefined, question: IQuestionDetail): string[] {
    if (Array.isArray(testcase)) {
        return testcase.map(normalizeTestcase).filter((value: string) => !!value);
    }
    if (!testcase) {
        return [];
    }

    const normalized: string = normalizeTestcase(testcase);
    if (!normalized) {
        return [];
    }

    const inputCount: number = getTestcaseInputCount(question);
    const lines: string[] = normalized.split("\n");
    if (inputCount <= 0 || lines.length <= inputCount || lines.length % inputCount !== 0) {
        return [normalized];
    }

    const testcases: string[] = [];
    for (let index: number = 0; index < lines.length; index += inputCount) {
        testcases.push(lines.slice(index, index + inputCount).join("\n"));
    }

    return testcases.filter((value: string) => !!value.trim());
}

function getTestcaseInputCount(question: IQuestionDetail): number {
    const metaData: IQuestionMetaData = parseQuestionMetaData(question.metaData);
    if (metaData.systemdesign) {
        return 2;
    }
    if (metaData.params && metaData.params.length > 0) {
        return metaData.params.length;
    }

    return 1;
}

function parseQuestionMetaData(metaData: string | undefined): IQuestionMetaData {
    if (!metaData) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(metaData);
        if (parsed && typeof parsed === "object") {
            return parsed as IQuestionMetaData;
        }
    } catch (error) {
        // LeetCode still provides sampleTestCase as a fallback when metadata is malformed.
    }

    return {};
}

function formatTestResult(actual: ICheckResult, expected: ICheckResult | undefined, testcase: string, testcaseList: string[]): string {
    const errors: string[] = collectErrors(actual);
    const passed: number = actual.total_correct || 0;
    const total: number = actual.total_testcases || 0;
    const ok: boolean = !!actual.run_success && passed === total && actual.status_msg === "Accepted" && errors.length === 0;
    const state: string = actual.status_msg === "Accepted" ? "Finished" : actual.status_msg;
    const cases: ICaseResult[] = buildCaseResults(actual, expected, testcase, testcaseList, ok);
    const lines: string[] = [];

    appendLine(lines, ok, state);
    for (const error of errors) {
        appendKeyValue(lines, ok, "Error", error);
    }
    for (let index: number = 0; index < cases.length; index++) {
        const result: ICaseResult = cases[index];
        appendKeyValue(lines, result.accepted, `Case ${index + 1} (${result.status})`, formatCaseResult(result));
    }

    return lines.join("\n") + "\n";
}

function buildCaseResults(actual: ICheckResult, expected: ICheckResult | undefined, testcase: string, testcaseList: string[], allAccepted: boolean): ICaseResult[] {
    const inputs: string[] = testcaseList.length > 0 ? testcaseList : arrayFromValue(actual.data_input);
    const normalizedInputs: string[] = inputs.length > 0 ? inputs : [testcase];
    const outputs: string[] = arrayFromValue(actual.code_answer);
    const expectedAnswers: string[] = expected ? arrayFromValue(expected.code_answer) : arrayFromValue(actual.expected_code_answer || actual.expected_output);
    const stdout: string[] = arrayFromValue(actual.std_output_list || actual.code_output || actual.std_output);
    const compareResult: string = actual.compare_result || "";
    const resultCount: number = getDisplayCaseCount(actual, normalizedInputs, outputs, expectedAnswers, stdout, compareResult);
    const cases: ICaseResult[] = [];

    for (let index: number = 0; index < resultCount; index++) {
        const accepted: boolean = isCaseAccepted(index, allAccepted, actual, normalizedInputs, compareResult);
        cases.push({
            accepted,
            expected: normalizeResultValue(expectedAnswers[index] || ""),
            input: normalizeResultValue(normalizedInputs[index] || ""),
            output: normalizeResultValue(outputs[index] || ""),
            status: accepted ? "Accepted" : getFailedCaseStatus(actual),
            stdout: normalizeResultValue(stdout[index] || ""),
        });
    }

    return cases;
}

function getDisplayCaseCount(
    actual: ICheckResult,
    inputs: string[],
    outputs: string[],
    expectedAnswers: string[],
    stdout: string[],
    compareResult: string,
): number {
    if (actual.total_testcases && actual.total_testcases > 0) {
        return actual.total_testcases;
    }
    if (compareResult.length > 0) {
        return compareResult.length;
    }
    if (inputs.length > 0) {
        return inputs.length;
    }

    return Math.max(
        countNonEmptyPrefix(outputs),
        countNonEmptyPrefix(expectedAnswers),
        countNonEmptyPrefix(stdout),
    );
}

function countNonEmptyPrefix(values: string[]): number {
    for (let index: number = values.length - 1; index >= 0; index--) {
        if (values[index]) {
            return index + 1;
        }
    }

    return 0;
}

function isCaseAccepted(index: number, allAccepted: boolean, actual: ICheckResult, inputs: string[], compareResult: string): boolean {
    if (index < compareResult.length) {
        return compareResult.charAt(index) === "1";
    }
    if (allAccepted) {
        return true;
    }

    const total: number | undefined = actual.total_testcases;
    const passed: number | undefined = actual.total_correct;
    if (total !== undefined && passed !== undefined && total === inputs.length) {
        return index < passed;
    }

    const lastTestcase: string = normalizeTestcase(actual.last_testcase || "");
    if (lastTestcase && normalizeTestcase(inputs[index] || "") === lastTestcase) {
        return false;
    }

    return false;
}

function getFailedCaseStatus(actual: ICheckResult): string {
    if (actual.status_msg && actual.status_msg !== "Accepted") {
        return actual.status_msg;
    }

    return "Wrong Answer";
}

function formatCaseResult(result: ICaseResult): string {
    const lines: string[] = [`Status: ${result.status}`];
    appendCaseField(lines, "Input", result.input);
    appendCaseField(lines, "Output", result.output);
    appendCaseField(lines, "Expected Answer", result.expected);
    appendCaseField(lines, "Stdout", result.stdout);
    return lines.join("\n");
}

function appendCaseField(lines: string[], key: string, value: string): void {
    if (!value) {
        return;
    }

    lines.push(`${key}:`);
    lines.push(value);
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

function arrayFromValue(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) {
        return value.map(normalizeResultValue);
    }
    if (!value) {
        return [];
    }

    return [normalizeResultValue(value)];
}

function normalizeResultValue(value: string): string {
    return value.replace(/\\n/g, "\n");
}
