import * as assert from "assert";
import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";
import {
    addFavoriteQuestion,
    fetchUserStatus,
    getDefaultFavoriteSlug,
    getFavoriteProblemSlugs,
    getQuestionDetail,
    ILeetCodeProblem,
    ILeetCodeQuestionDetail,
    listProblems,
    removeFavoriteQuestion,
} from "../../request/leetcode-api";
import { getQuestionDetail as getJudgeMetadata, IQuestionDetail } from "../../request/leetcode-http";
import { submitSolutionWithSyncedCookie } from "../../request/submit-solution";
import { applyAuthFixture, getAuthFixturePath, IAuthFixture, loadAuthFixture } from "./auth-fixture";

// End-to-end sanity tests that hit the real LeetCode API with a locally-stored
// session. They exercise the full stack the offline unit tests can't: auth/CSRF
// headers, Cloudflare fallback, and live GraphQL/REST schemas. They self-skip
// when no fixture is present, so `npm test` stays offline and green for
// everyone. Run them with `npm run test:integration`.
const fixture: IAuthFixture | null = loadAuthFixture();
const DIFFICULTIES: ReadonlyArray<string> = ["Easy", "Medium", "Hard"];

describe("leetcode-api (live)", () => {
    if (!fixture) {
        it.skip(`needs an auth fixture at ${getAuthFixturePath()} — see src/test/integration/README.md`);
        return;
    }

    const authFixture: IAuthFixture = fixture;
    const base: string = authFixture.endpoint === "leetcode-cn" ? "https://leetcode.cn" : "https://leetcode.com";

    before(async () => {
        await applyAuthFixture(authFixture);
    });

    describe("auth / user status", () => {
        it("fetchUserStatus returns the signed-in user", async () => {
            const status = await fetchUserStatus();
            assert.strictEqual(status.isSignedIn, true, "fixture session is not signed in — recapture it from the browser extension");
            assert.ok(status.username && status.username.length > 0, "expected a username");
            assert.strictEqual(typeof status.isPremium, "boolean", "expected isPremium to be a boolean");
        });
    });

    describe("problem catalog", () => {
        let problems: ILeetCodeProblem[];

        before(async function (): Promise<void> {
            this.timeout(60 * 1000);
            problems = await listProblems({ needTranslation: false, showLocked: true });
        });

        it("returns a large, well-formed catalog", () => {
            assert.ok(problems.length > 100, `expected a large catalog, got ${problems.length}`);
            for (const problem of problems.slice(0, 50)) {
                assert.ok(problem.titleSlug, "every problem needs a titleSlug");
                assert.ok(problem.questionFrontendId, `expected a frontend id on ${problem.titleSlug}`);
                assert.ok(DIFFICULTIES.indexOf(problem.difficulty) >= 0, `unexpected difficulty "${problem.difficulty}" on ${problem.titleSlug}`);
            }
        });

        it("includes two-sum as problem #1", () => {
            const twoSum = problems.find((problem) => problem.titleSlug === "two-sum");
            assert.ok(twoSum, "expected two-sum in the catalog");
            assert.strictEqual(twoSum!.questionFrontendId, "1", "two-sum should be frontend id 1");
            assert.strictEqual(twoSum!.difficulty, "Easy");
        });

        it("has unique slugs sorted by ascending frontend id", () => {
            const slugs = new Set<string>();
            let previousId = 0;
            for (const problem of problems) {
                assert.ok(!slugs.has(problem.titleSlug), `duplicate slug in catalog: ${problem.titleSlug}`);
                slugs.add(problem.titleSlug);
                const id = parseInt(problem.questionFrontendId, 10);
                if (Number.isFinite(id)) {
                    assert.ok(id >= previousId, `catalog not sorted ascending near ${problem.titleSlug} (${id} < ${previousId})`);
                    previousId = id;
                }
            }
        });
    });

    describe("question detail", () => {
        let detail: ILeetCodeQuestionDetail;
        let judgeMeta: IQuestionDetail;

        before(async () => {
            detail = await getQuestionDetail("two-sum", false);
            judgeMeta = await getJudgeMetadata("two-sum", authFixture.cookie, `${base}/problems/two-sum/`);
        });

        it("full detail returns description, snippets and tags for two-sum", () => {
            assert.strictEqual(detail.titleSlug, "two-sum");
            assert.strictEqual(detail.difficulty, "Easy");
            assert.ok(/^\d+$/.test(detail.questionId), `expected a numeric questionId, got "${detail.questionId}"`);
            assert.ok(detail.content.indexOf("<") >= 0, "expected HTML description content");
            assert.ok(detail.codeSnippets.length > 0, "expected code snippets");
            assert.ok(
                detail.codeSnippets.some((snippet) => snippet.langSlug === "python3" || snippet.langSlug === "cpp"),
                "expected a python3 or cpp code snippet",
            );
            assert.ok(detail.topicTags.length > 0, "expected topic tags");
            assert.ok(detail.topicTags.indexOf("array") >= 0, `expected an "array" tag, got ${JSON.stringify(detail.topicTags)}`);
        });

        it("light judge metadata returns runnable testcase data", () => {
            assert.strictEqual(judgeMeta.titleSlug, "two-sum");
            assert.ok(/^\d+$/.test(judgeMeta.questionId), `expected a numeric questionId, got "${judgeMeta.questionId}"`);
            assert.ok(judgeMeta.sampleTestCase && judgeMeta.sampleTestCase.length > 0, "expected a sample test case");
            assert.strictEqual(judgeMeta.enableRunCode, true, "expected run code to be enabled for two-sum");
        });

        it("both detail paths agree on the internal questionId", () => {
            assert.strictEqual(detail.questionId, judgeMeta.questionId, "full and judge-metadata questionId disagree");
        });
    });

    describe("favorites (opt-in: sets LEETCODE_LIVE_FAVORITE=1)", () => {
        // Reversible, but it still mutates the account's default Favorite list, so
        // it is off by default. The legacy addQuestionToFavorite mutation is now a
        // no-op shim and the problemset `isFavor` flag no longer tracks this list;
        // this exercises the working V2 path the extension depends on.
        if (process.env.LEETCODE_LIVE_FAVORITE !== "1") {
            it.skip("set LEETCODE_LIVE_FAVORITE=1 to add/remove two-sum from the default Favorite list");
            return;
        }

        it("resolves the default Favorite list slug", async () => {
            const slug = await getDefaultFavoriteSlug();
            assert.ok(slug && slug.length > 0, "expected a default Favorite list — is it named 'Favorite'?");
        });

        it("adds then removes two-sum, round-tripping to the original state", async function (): Promise<void> {
            this.timeout(30 * 1000);
            const slug = "two-sum";
            const wasFavorite = (await getFavoriteProblemSlugs()).has(slug);

            if (wasFavorite) {
                await removeFavoriteQuestion(slug);
                assert.ok(!(await getFavoriteProblemSlugs()).has(slug), "remove should drop two-sum");
                await addFavoriteQuestion(slug);
                assert.ok((await getFavoriteProblemSlugs()).has(slug), "add should restore two-sum");
            } else {
                await addFavoriteQuestion(slug);
                assert.ok((await getFavoriteProblemSlugs()).has(slug), "add should include two-sum");
                await removeFavoriteQuestion(slug);
                assert.ok(!(await getFavoriteProblemSlugs()).has(slug), "remove should drop two-sum");
            }
        });
    });

    describe("judge submit (opt-in: sets LEETCODE_LIVE_SUBMIT=1)", () => {
        // A real submit records an entry on the user's LeetCode account, so it is
        // off by default. Enable it explicitly to exercise the full CSRF-protected
        // POST + judge-polling path end to end.
        if (process.env.LEETCODE_LIVE_SUBMIT !== "1") {
            it.skip("set LEETCODE_LIVE_SUBMIT=1 to submit a real two-sum solution");
            return;
        }

        let solutionPath: string;

        before(async () => {
            solutionPath = path.join(os.tmpdir(), `leetcode-live-two-sum-${process.pid}.py`);
            await fse.writeFile(solutionPath, TWO_SUM_SOLUTION, "utf8");
        });

        after(async () => {
            await fse.remove(solutionPath).catch(() => undefined);
        });

        it("submits a correct two-sum solution and is Accepted", async function (): Promise<void> {
            this.timeout(120 * 1000);
            const result = await submitSolutionWithSyncedCookie(solutionPath);
            assert.ok(result.indexOf("Accepted") >= 0, `expected an Accepted verdict, got:\n${result}`);
        });
    });
});

const TWO_SUM_SOLUTION: string = [
    "# @lc app=leetcode id=1 lang=python3",
    "#",
    "# https://leetcode.com/problems/two-sum/",
    "#",
    "# @lc code=start",
    "class Solution:",
    "    def twoSum(self, nums, target):",
    "        seen = {}",
    "        for i, n in enumerate(nums):",
    "            if target - n in seen:",
    "                return [seen[target - n], i]",
    "            seen[n] = i",
    "        return []",
    "# @lc code=end",
    "",
].join("\n");
