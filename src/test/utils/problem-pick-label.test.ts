import * as assert from "assert";
import { defaultProblem, IProblem, ProblemState } from "../../shared";
import { parseProblemDecorator, parseProblemsToPicks } from "../../utils/problemPickUtils";

// Models the requirement VS Code's quick-pick fuzzy filter imposes on the
// problem search: every character of the typed query must appear in the item
// label in order (a subsequence), case-insensitively. This is the property that
// makes a typed space "load-bearing" — it has to line up with a space in the
// label, or the whole query fails to match.
function isSubsequence(query: string, text: string): boolean {
    const haystack: string = text.toLowerCase();
    const needle: string = query.toLowerCase();
    let i: number = 0;
    for (let j: number = 0; i < needle.length && j < haystack.length; j++) {
        if (needle[i] === haystack[j]) {
            i++;
        }
    }
    return i === needle.length;
}

function makeProblem(overrides: Partial<IProblem>): IProblem {
    return { ...defaultProblem, ...overrides };
}

const accountsMerge: IProblem = makeProblem({
    id: "721",
    name: "Accounts Merge",
    difficulty: "Medium",
    passRate: "61.48 %",
    state: ProblemState.AC,
});

describe("problem pick label", () => {
    describe("parseProblemsToPicks", () => {
        it("renders 'id. name' with a space after the dot", () => {
            const [pick] = parseProblemsToPicks([accountsMerge]);
            assert.strictEqual(pick.label, "$(check) 721. Accounts Merge");
        });

        it("formats the detail as AC rate + difficulty", () => {
            const [pick] = parseProblemsToPicks([accountsMerge]);
            assert.strictEqual(pick.detail, "AC rate: 61.48 %, Difficulty: Medium");
            assert.strictEqual(pick.description, "");
        });

        it("carries the originating problem as the pick value", () => {
            const [pick] = parseProblemsToPicks([accountsMerge]);
            assert.strictEqual(pick.value, accountsMerge);
        });

        it("maps every problem in order", () => {
            const twoSum: IProblem = makeProblem({ id: "1", name: "Two Sum", difficulty: "Easy", passRate: "55.0 %", state: ProblemState.NotAC });
            const picks = parseProblemsToPicks([accountsMerge, twoSum]);
            assert.strictEqual(picks.length, 2);
            assert.strictEqual(picks[0].label, "$(check) 721. Accounts Merge");
            assert.strictEqual(picks[1].label, "$(x) 1. Two Sum");
        });
    });

    describe("parseProblemDecorator", () => {
        it("prefixes a check for accepted problems", () => {
            assert.strictEqual(parseProblemDecorator(ProblemState.AC, false), "$(check) ");
        });
        it("prefixes an x for attempted-but-not-accepted problems", () => {
            assert.strictEqual(parseProblemDecorator(ProblemState.NotAC, false), "$(x) ");
        });
        it("prefixes a lock for locked, unsolved problems", () => {
            assert.strictEqual(parseProblemDecorator(ProblemState.Unknown, true), "$(lock) ");
        });
        it("adds no prefix for unsolved, unlocked problems", () => {
            assert.strictEqual(parseProblemDecorator(ProblemState.Unknown, false), "");
        });
    });

    // Regression guard for the search bug: typing the number-prefixed title the
    // way it reads — "721. Accounts Merge", with a space after the dot — used to
    // return nothing, because the label was "721.Accounts Merge" (no space).
    describe("fuzzy-match reachability of the search query", () => {
        const label: string = parseProblemsToPicks([accountsMerge])[0].label;

        it("matches the title typed with the space after the dot", () => {
            assert.ok(isSubsequence("721. Accounts Merge", label), `"721. Accounts Merge" should match ${label}`);
        });

        it("still matches the bare title (the path that always worked)", () => {
            assert.ok(isSubsequence("Accounts Merge", label), `"Accounts Merge" should match ${label}`);
        });

        it("still matches the dot-with-no-space form", () => {
            assert.ok(isSubsequence("721.Accounts Merge", label), `"721.Accounts Merge" should match ${label}`);
        });

        it("shows why the old spaceless 'id.name' label dropped the spaced query", () => {
            // In the previous, spaceless label the typed space could only align
            // with the space before "Merge", stranding "Accounts Merge" with
            // nothing left to match against — so the item disappeared.
            assert.strictEqual(isSubsequence("721. Accounts Merge", "721.Accounts Merge"), false);
        });
    });
});
