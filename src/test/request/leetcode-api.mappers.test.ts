import * as assert from "assert";
import {
    formatAcceptanceRate,
    mapCnProblem,
    mapGlobalProblem,
    mapQuestionDetail,
    mapRestProblem,
    mapUserProfile,
} from "../../request/leetcode-api";
import { ProblemState } from "../../shared";
import {
    cnQuestionItem,
    cnQuestionItemPercentPassThrough,
    globalQuestionItem,
    globalQuestionItemLockedUnknown,
    languageStatsResponse,
    questionDetailItem,
    recentAcSubmissionsResponse,
    restProblemItem,
    restProblemItemLockedUnknown,
    userProblemsSolvedResponse,
    userProblemsSolvedResponseWithoutAll,
    userPublicProfileResponse,
} from "../fixtures/leetcode-responses";

describe("leetcode-api mappers", () => {
    describe("mapGlobalProblem", () => {
        it("maps a solved, free problem with slug-based tags", () => {
            const problem = mapGlobalProblem(globalQuestionItem);
            assert.strictEqual(problem.questionFrontendId, "1");
            assert.strictEqual(problem.questionId, "1");
            assert.strictEqual(problem.titleSlug, "two-sum");
            assert.strictEqual(problem.title, "Two Sum");
            assert.strictEqual(problem.difficulty, "Easy");
            assert.strictEqual(problem.acRate, 49.1);
            assert.strictEqual(problem.locked, false);
            assert.strictEqual(problem.isFavorite, false);
            assert.strictEqual(problem.state, ProblemState.AC);
            assert.deepStrictEqual(problem.tags, ["array", "hash-table"]);
            assert.deepStrictEqual(problem.companies, []);
        });

        it("normalizes unknown status / uppercase difficulty and marks paidOnly as locked", () => {
            const problem = mapGlobalProblem(globalQuestionItemLockedUnknown);
            assert.strictEqual(problem.difficulty, "Hard");
            assert.strictEqual(problem.locked, true);
            assert.strictEqual(problem.isFavorite, true);
            assert.strictEqual(problem.state, ProblemState.Unknown);
            assert.deepStrictEqual(problem.tags, []);
        });
    });

    describe("mapRestProblem", () => {
        it("maps the bulk REST shape, keeping the distinct internal id and computing acRate", () => {
            const problem = mapRestProblem(restProblemItem);
            assert.strictEqual(problem.questionFrontendId, "773");
            assert.strictEqual(problem.questionId, "787");
            assert.strictEqual(problem.titleSlug, "sliding-puzzle");
            assert.strictEqual(problem.title, "Sliding Puzzle");
            assert.strictEqual(problem.difficulty, "Hard");
            assert.strictEqual(problem.acRate, 50);
            assert.strictEqual(problem.locked, false);
            assert.strictEqual(problem.isFavorite, true);
            assert.strictEqual(problem.state, ProblemState.AC);
            assert.deepStrictEqual(problem.tags, []);
            assert.deepStrictEqual(problem.companies, []);
        });

        it("marks paid-only as locked, normalizes unknown difficulty, avoids divide-by-zero", () => {
            const problem = mapRestProblem(restProblemItemLockedUnknown);
            assert.strictEqual(problem.locked, true);
            assert.strictEqual(problem.difficulty, "Unknown");
            assert.strictEqual(problem.acRate, 0);
            assert.strictEqual(problem.state, ProblemState.Unknown);
            assert.strictEqual(problem.questionFrontendId, "5");
            assert.strictEqual(problem.questionId, undefined);
        });
    });

    describe("mapCnProblem", () => {
        it("uses translated title/tags and scales a fractional acRate when translating", () => {
            const problem = mapCnProblem(cnQuestionItem, true);
            assert.strictEqual(problem.title, "两数相加");
            assert.deepStrictEqual(problem.tags, ["链表"]);
            assert.strictEqual(problem.acRate, 50);
            assert.strictEqual(problem.state, ProblemState.NotAC);
            assert.strictEqual(problem.isFavorite, true);
            assert.strictEqual(problem.titleSlug, "add-two-numbers");
        });

        it("uses the English title and slug tags when not translating", () => {
            const problem = mapCnProblem(cnQuestionItem, false);
            assert.strictEqual(problem.title, "Add Two Numbers");
            assert.deepStrictEqual(problem.tags, ["linked-list"]);
        });

        it("passes through an already-percentage acRate (> 1)", () => {
            const problem = mapCnProblem(cnQuestionItemPercentPassThrough, true);
            assert.strictEqual(problem.acRate, 73);
        });
    });

    describe("mapQuestionDetail", () => {
        it("prefers translated content and tags when translating", () => {
            const detail = mapQuestionDetail(questionDetailItem, true);
            assert.strictEqual(detail.content, "<p>中文题面</p>");
            assert.deepStrictEqual(detail.topicTags, ["数组"]);
            assert.strictEqual(detail.questionId, "1");
            assert.strictEqual(detail.titleSlug, "two-sum");
            assert.strictEqual(detail.codeSnippets.length, 2);
            assert.deepStrictEqual(detail.exampleTestcaseList, ["[2,7,11,15]\n9"]);
            assert.strictEqual(detail.categoryTitle, "Algorithms");
            assert.strictEqual(detail.likes, 12345);
            assert.strictEqual(detail.dislikes, 456);
        });

        it("falls back to English content and slug tags when not translating", () => {
            const detail = mapQuestionDetail(questionDetailItem, false);
            assert.strictEqual(detail.content, "<p>English content</p>");
            assert.deepStrictEqual(detail.topicTags, ["array"]);
        });
    });

    describe("formatAcceptanceRate", () => {
        it("formats with two decimals and a percent suffix", () => {
            assert.strictEqual(formatAcceptanceRate(49.1), "49.10 %");
        });
    });

    describe("mapUserProfile", () => {
        it("aggregates the four profile payloads into a single shape", () => {
            const profile = mapUserProfile({
                username: "SleezyBunny",
                publicProfile: userPublicProfileResponse,
                solved: userProblemsSolvedResponse,
                recent: recentAcSubmissionsResponse,
                languages: languageStatsResponse,
            });

            assert.strictEqual(profile.username, "SleezyBunny");
            assert.strictEqual(profile.realName, "Lingling40hr");
            assert.strictEqual(profile.ranking, 16607);
            assert.strictEqual(profile.countryName, "United States");
            assert.strictEqual(profile.company, "Best Sweat Shop");
            assert.strictEqual(profile.school, "University of Diploma Mill");
            assert.strictEqual(profile.reputation, 273);

            const totalAll = profile.totalsByDifficulty.find((entry) => entry.difficulty === "All");
            assert.ok(totalAll);
            assert.strictEqual(totalAll!.count, 3962);

            const solvedAll = profile.solvedByDifficulty.find((entry) => entry.difficulty === "All");
            assert.ok(solvedAll);
            assert.strictEqual(solvedAll!.count, 1196);

            assert.strictEqual(profile.beatsByDifficulty.length, 3);
            assert.strictEqual(profile.beatsByDifficulty[0].difficulty, "Easy");
            assert.strictEqual(profile.beatsByDifficulty[0].percentage, 99.84);

            assert.strictEqual(profile.languageProblemCount.length, 3, "zero-counts dropped");
            // Highest-count language sorted first.
            assert.strictEqual(profile.languageProblemCount[0].languageName, "Python3");
            assert.strictEqual(profile.languageProblemCount[0].problemsSolved, 919);

            assert.strictEqual(profile.recentAcSubmissions.length, 2, "blank-title entry dropped");
            assert.strictEqual(profile.recentAcSubmissions[0].title, "Contains Duplicate III");
            assert.strictEqual(profile.recentAcSubmissions[0].titleSlug, "contains-duplicate-iii");
            // Timestamp strings normalized to numbers.
            assert.strictEqual(profile.recentAcSubmissions[0].timestamp, 1781601573);
        });

        it("falls back to the requested username when matchedUser is missing", () => {
            const profile = mapUserProfile({ username: "ghost" });
            assert.strictEqual(profile.username, "ghost");
            assert.strictEqual(profile.realName, "");
            assert.strictEqual(profile.ranking, undefined);
            assert.deepStrictEqual(profile.totalsByDifficulty, []);
            // ensureAllAggregate always guarantees an All entry so the webview
            // can read solvedByDifficulty[0].count unconditionally.
            assert.deepStrictEqual(profile.solvedByDifficulty, [{ difficulty: "All", count: 0 }]);
            assert.deepStrictEqual(profile.beatsByDifficulty, []);
            assert.deepStrictEqual(profile.recentAcSubmissions, []);
            assert.deepStrictEqual(profile.languageProblemCount, []);
        });

        it("synthesizes the All rollup when LeetCode omits it", () => {
            const profile = mapUserProfile({
                username: "SleezyBunny",
                solved: userProblemsSolvedResponseWithoutAll,
            });
            const all = profile.solvedByDifficulty.find((entry) => entry.difficulty === "All");
            assert.ok(all, "expected an All entry to be synthesized");
            assert.strictEqual(all!.count, 10 + 20 + 5);
            // The original three entries are still present after the All entry.
            assert.strictEqual(profile.solvedByDifficulty.length, 4);
        });

        it("drops beats entries with unknown difficulties", () => {
            const profile = mapUserProfile({
                username: "SleezyBunny",
                solved: {
                    matchedUser: {
                        problemsSolvedBeatsStats: [
                            { difficulty: "Easy", percentage: 50 },
                            { difficulty: "Insane", percentage: 1 },
                        ],
                    },
                },
            });
            assert.strictEqual(profile.beatsByDifficulty.length, 1);
            assert.strictEqual(profile.beatsByDifficulty[0].difficulty, "Easy");
        });
    });
});
