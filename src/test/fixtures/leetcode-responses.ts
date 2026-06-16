// Representative LeetCode GraphQL/REST payloads used as a regression net for the
// mappers in src/request/leetcode-api.ts. These mirror the field shapes selected
// by the queries in that module. They are hand-built rather than live-captured,
// so the tests need no cookie and stay deterministic; if a query's selection set
// changes, update the matching fixture here.

export const globalQuestionItem = {
    acRate: 49.1,
    difficulty: "Easy",
    frontendQuestionId: "1",
    isFavor: false,
    paidOnly: false,
    questionId: "1",
    status: "ac",
    title: "Two Sum",
    titleSlug: "two-sum",
    topicTags: [
        { name: "Array", slug: "array" },
        { name: "Hash Table", slug: "hash-table" },
    ],
};

export const globalQuestionItemLockedUnknown = {
    acRate: 35.2,
    difficulty: "HARD",
    frontendQuestionId: "4",
    isFavor: true,
    paidOnly: true,
    questionId: "4",
    status: null,
    title: "Median of Two Sorted Arrays",
    titleSlug: "median-of-two-sorted-arrays",
    topicTags: [],
};

// Shape of the bulk REST endpoint GET /api/problems/all/ (stat_status_pairs[i]).
export const restProblemItem = {
    stat: {
        question_id: 787,
        frontend_question_id: 773,
        question__title: "Sliding Puzzle",
        question__title_slug: "sliding-puzzle",
        total_acs: 100,
        total_submitted: 200,
    },
    difficulty: { level: 3 },
    paid_only: false,
    status: "ac",
    is_favor: true,
};

export const restProblemItemLockedUnknown = {
    stat: {
        frontend_question_id: 5,
        question__title: "Locked",
        question__title_slug: "locked",
        total_acs: 0,
        total_submitted: 0,
    },
    difficulty: { level: 9 },
    paid_only: true,
    status: null,
};

export const cnQuestionItem = {
    acRate: 0.5,
    difficulty: "Medium",
    frontendQuestionId: "2",
    isFavor: true,
    paidOnly: false,
    status: "notac",
    title: "Add Two Numbers",
    titleCn: "两数相加",
    titleSlug: "add-two-numbers",
    topicTags: [
        { name: "Linked List", nameTranslated: "链表", slug: "linked-list" },
    ],
};

export const cnQuestionItemPercentPassThrough = {
    acRate: 73,
    difficulty: "easy",
    frontendQuestionId: "9",
    isFavor: false,
    paidOnly: false,
    status: "ac",
    title: "Palindrome Number",
    titleCn: "回文数",
    titleSlug: "palindrome-number",
    topicTags: [],
};

// User-profile GraphQL payloads. Mirror the live response shapes captured from
// leetcode.com/u/<user>/ (userPublicProfile, userProblemsSolved,
// recentAcSubmissions, languageStats) so mapUserProfile() can be exercised
// without a cookie.
export const userPublicProfileResponse = {
    matchedUser: {
        username: "SleezyBunny",
        profile: {
            ranking: 16607,
            userAvatar: "https://assets.leetcode.com/users/seddas/avatar.png",
            realName: "Lingling40hr",
            countryName: "United States",
            company: "Best Sweat Shop",
            school: "University of Diploma Mill",
            reputation: 273,
        },
    },
};

export const userProblemsSolvedResponse = {
    allQuestionsCount: [
        { difficulty: "All", count: 3962 },
        { difficulty: "Easy", count: 950 },
        { difficulty: "Medium", count: 2069 },
        { difficulty: "Hard", count: 943 },
    ],
    matchedUser: {
        problemsSolvedBeatsStats: [
            { difficulty: "Easy", percentage: 99.84 },
            { difficulty: "Medium", percentage: 99.54 },
            { difficulty: "Hard", percentage: 97.99 },
        ],
        submitStatsGlobal: {
            acSubmissionNum: [
                { difficulty: "All", count: 1196 },
                { difficulty: "Easy", count: 464 },
                { difficulty: "Medium", count: 614 },
                { difficulty: "Hard", count: 118 },
            ],
        },
    },
};

// Shape returned when the All rollup is absent — exercises ensureAllAggregate.
export const userProblemsSolvedResponseWithoutAll = {
    allQuestionsCount: [
        { difficulty: "Easy", count: 950 },
        { difficulty: "Medium", count: 2069 },
        { difficulty: "Hard", count: 943 },
    ],
    matchedUser: {
        problemsSolvedBeatsStats: [
            { difficulty: "Easy", percentage: 50.0 },
        ],
        submitStatsGlobal: {
            acSubmissionNum: [
                { difficulty: "Easy", count: 10 },
                { difficulty: "Medium", count: 20 },
                { difficulty: "Hard", count: 5 },
            ],
        },
    },
};

export const recentAcSubmissionsResponse = {
    recentAcSubmissionList: [
        { id: "2034951904", title: "Contains Duplicate III", titleSlug: "contains-duplicate-iii", timestamp: "1781601573" },
        { id: "2032725641", title: "Car Pooling", titleSlug: "car-pooling", timestamp: "1781434347" },
        // Missing title is dropped by the mapper.
        { id: "0", title: "", titleSlug: "", timestamp: "0" },
    ],
};

export const languageStatsResponse = {
    matchedUser: {
        languageProblemCount: [
            { languageName: "C++", problemsSolved: 5 },
            { languageName: "Java", problemsSolved: 412 },
            { languageName: "Python3", problemsSolved: 919 },
            // Zero counts are filtered.
            { languageName: "COBOL", problemsSolved: 0 },
        ],
    },
};

export const questionDetailItem = {
    categoryTitle: "Algorithms",
    codeSnippets: [
        { code: "class Solution {};", lang: "C++", langSlug: "cpp" },
        { code: "class Solution: pass", lang: "Python3", langSlug: "python3" },
    ],
    content: "<p>English content</p>",
    difficulty: "Easy",
    dislikes: 456,
    exampleTestcaseList: ["[2,7,11,15]\n9"],
    hints: ["Use a hash map."],
    likes: 12345,
    questionFrontendId: "1",
    questionId: "1",
    sampleTestCase: "[2,7,11,15]\n9",
    stats: "{\"totalAccepted\": \"5M\", \"totalSubmission\": \"9M\", \"acRate\": \"49.1%\"}",
    title: "Two Sum",
    titleSlug: "two-sum",
    topicTags: [
        { name: "Array", nameTranslated: "数组", slug: "array" },
    ],
    translatedContent: "<p>中文题面</p>",
};
