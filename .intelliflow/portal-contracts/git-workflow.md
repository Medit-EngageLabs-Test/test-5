# Portal Contract — Git Workflow

Hard constraints on how changes reach `main` and become releases. They are **agent-agnostic**: they bind every agent (and every human) working in this repository, in both regimes described below.

## Hard constraints

1. **Every change reaches `main` through a pull request.** Never push commits directly to `main`. No server-side branch protection is guaranteed on the current GitHub tier: the constraint is contractual, and Claude Code sessions enforce it mechanically via the repo hooks (`.claude/hooks/pre-push-guard.sh`, `pre-commit-guard.sh`).
2. **Never merge a pull request while its CI is red or pending.** Required status check: **CI / build**. Fix the failure and wait for green first.
3. **A SemVer tag (`vX.Y.Z`) on `main` is a deploy.** Tags are created only on `main`, never on other branches, and only after the release checklist in `release.md` passes.
4. **Every pipeline run must be monitored to completion.** See "Pipeline monitoring" below.

## Two regimes

- **If this repository contains `docs/agents/workflow.md`** → the **autonomous regime** is available to agents that support it (Claude Code): the workflow document defines the phases and the human gates (epic draft, collaudo, final confirmation). Within those gates the agent commits, opens PRs and merges autonomously — always behind green CI, always via pull request.
- **Otherwise** → **base regime**: create a work branch from `main` (`git switch -c feature/<short-description>`), implement, push, open a PR targeting `main`, and **wait for the Creator to confirm before merging**. Do not merge on your own judgment alone.

Agents other than Claude Code always operate in the base regime, even when `docs/agents/workflow.md` is present: the autonomous mechanics (skills and hooks) are not guaranteed outside Claude Code.

## Releasing

1. Follow the checklist in `release.md`.
2. The SemVer tag (`vX.Y.Z`) must be created on `main` after the PR is merged — never on a feature branch. There is no version to bump in the sources: the deploy pipeline computes the version from the tag (GitVersion).
3. After pushing the tag, monitor the `deploy.yml` workflow run (`gh run watch`) until completion.
4. If the deploy workflow fails, fix the issue on a new branch, open a PR, merge, then create a new tag.

## Pipeline monitoring — mandatory obligation

Every `git push` — whether it targets a branch, opens a PR, or creates a SemVer tag — can trigger a workflow run. **You must monitor that run to completion before considering the work done.**

- A PR targeting `main` or an `index/**` branch triggers `ci.yml` (build, format, test, lint) against the branch.
- A SemVer tag push triggers `deploy.yml` (build, Docker image, deployment).

**The pipeline is the ground truth.** Do not assume that locally passing code is correct — the pipeline runs in a clean environment and catches issues that local development misses.

Obligations:
- After every push, obtain the run ID (`gh run list --limit 1`) and watch it (`gh run watch <id>`).
- If a run fails, read the failure log (`gh run view <id> --log-failed`), fix every reported error, and push again.
- Repeat the push → monitor → fix cycle until the pipeline is green.
- Do not open a PR, create a tag, or declare a task complete while any pipeline is running or red.
