# 0005. Spelling and commit gates, and no grammar checker

Status: accepted, 2026-10-18.

## Context

The repository holds writing in two languages: Brazilian Portuguese copy, English copy, English documents, English commit messages. A typo in any of them is visible to the first reader, and a recruiter may read the history. Two gates were wanted: Conventional Commits before a push, and proofreading.

## Decision

- **Commits.** commitlint with the Conventional Commits preset and the scopes of this project, applied by [`tools/commit-gate.mjs`](../../tools/commit-gate.mjs) to the message of a commit, the commits of a push, the commits of a pull request and the title of a pull request, so the hooks and CI judge a message the same way.
- **Proofreading.** cspell with the English and the Brazilian Portuguese dictionaries over every text file, and over every commit message. Real vocabulary goes into one list that is reviewed with the change. Markdown is checked against English alone.
- **No grammar checker as a gate.** LanguageTool, the only free tool with Portuguese rules, was run on both dictionaries: 505 texts each, 461 alerts in Portuguese and 240 in English with the default rules. Almost all were jargon, names and sentence-case rules that do not fit UI labels. With only grammar and punctuation rules left on, 26 and 9 alerts remained, and every one was read: none was an error in the text (a unit "ms" counted as a plural, a placeholder counted as the number 1, a deliberate style). A gate that is wrong every time teaches people to ignore gates. Vale has no Portuguese rules.

## Consequences

- The first spelling run found five British spellings in an American English codebase, which were fixed.
- A grammar slip that a spell checker cannot see still needs a reader. The rules of the copy voice stay a convention, with a test for dashes.
- `.cspell/project-words.txt` can grow without bound if nobody looks at it. A misspelling gets fixed and stays out of the list.
