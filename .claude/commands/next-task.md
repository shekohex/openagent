---
allowed-tools: Bash(gh project:*), Bash(gh help:*)
description: Get the next task from GitHub project
---

## Context

- Current git status: !`git status`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
- Github CLI Project instructions: !`gh help project`

## Your task

Get the next task to work on from github project #3 and make sure to sort them by priority (priority/P0 ... priority/P3) and milestone.

1. Current tasks: !`gh project item-list 3 --owner "@me" --format json --limit 50`
2. Parse the JSON output to extract the relevant fields (title, priority, milestone, status ..etc)
3. Sort the tasks by priority and milestone
4. Select the highest priority task that is not yet started
5. Show the user the task details (title, priority, milestone, status) and ask if they want to work on it.
6. If the user agrees, update the task status to "in progress" and assign it to the user if not already assigned.
7. Ask the user if they want to start planning for the task.

$ARGUMENTS
