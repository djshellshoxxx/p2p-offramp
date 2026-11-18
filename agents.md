
## Autonomous development and GitHub synchronization

- Continue implementing incomplete features from the specifications and TODO lists.
- Run relevant tests and validate each completed change.
- Commit completed, independently testable work frequently.
- Push to the current dedicated development branch after each successful commit.
- Target a GitHub synchronization checkpoint every 15 minutes while actively working.
- Do not wait until the entire milestone is finished before pushing.
- Use descriptive commit messages.
- Create or update a pull request for the development branch.
- Review existing branches and pull requests before duplicating work.
- Never force-push, discard unrelated changes, or overwrite another worker's work.
- Never push directly to main.
- Do not merge pull requests unless explicitly authorized.
- If a test fails, investigate and repair it before marking the feature complete.
- Update README, specifications, TODO lists, and developer documentation as work progresses.
- If a push fails, report the failure and retain local commits.
- Continue to the next independent task after a successful checkpoint.

## Branching

- Branch new work from current `main` only. Do not branch from another unmerged feature branch.
- One pull request per lane or item. Do not open a second branch for work an open pull request already covers.
- Do not stack pull requests more than 2 deep without owner approval. Retarget or merge the lower pull request first.
- A branch that is 0 commits ahead of `main`, or whose pull request the owner closed as superseded, is finished. Archive it as an `archive/<branch>` tag at its tip, verify the tag, then delete the branch.
- Never delete a branch that is the base of an open pull request (GitHub closes that pull request), or whose tip moved since it was checked.
- Record consolidation progress in `docs/consolidation/2026-11-18-branch-consolidation-gameplan.md` §3a. Do not start a new dated ledger file.
