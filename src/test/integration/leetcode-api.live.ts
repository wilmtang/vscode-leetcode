import * as assert from "assert";
import { fetchUserStatus, getQuestionDetail, listProblems, listSessions } from "../../request/leetcode-api";
import { applyAuthFixture, getAuthFixturePath, IAuthFixture, loadAuthFixture } from "./auth-fixture";

// Live tests that hit the real LeetCode API with a locally-stored session.
// They self-skip when no fixture is present, so `npm test` stays offline and
// green for everyone. Run them with `npm run test:integration`.
const fixture: IAuthFixture | null = loadAuthFixture();

describe("leetcode-api (live)", () => {
    if (!fixture) {
        it.skip(`needs an auth fixture at ${getAuthFixturePath()} — see src/test/integration/README.md`);
        return;
    }

    const authFixture: IAuthFixture = fixture;

    before(async () => {
        await applyAuthFixture(authFixture);
    });

    it("fetchUserStatus returns the signed-in user", async () => {
        const status = await fetchUserStatus();
        assert.strictEqual(status.isSignedIn, true);
        assert.ok(status.username && status.username.length > 0, "expected a username");
    });

    it("listProblems returns a well-formed catalog including two-sum", async () => {
        const problems = await listProblems({ needTranslation: false, showLocked: true });
        assert.ok(problems.length > 100, `expected a large catalog, got ${problems.length}`);
        const twoSum = problems.find((problem) => problem.titleSlug === "two-sum");
        assert.ok(twoSum, "expected two-sum in the catalog");
        assert.ok(twoSum && twoSum.questionFrontendId, "expected a frontend id on two-sum");
    });

    it("getQuestionDetail returns content and code snippets for two-sum", async () => {
        const detail = await getQuestionDetail("two-sum", false);
        assert.strictEqual(detail.titleSlug, "two-sum");
        assert.ok(detail.content.indexOf("<") >= 0, "expected HTML description content");
        assert.ok(detail.codeSnippets.length > 0, "expected code snippets");
    });

    it("listSessions returns an array", async () => {
        const sessions = await listSessions();
        assert.ok(Array.isArray(sessions));
    });
});
