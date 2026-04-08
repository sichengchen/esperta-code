# Context Lifecycle

This document describes how the simplified context model evolves over time.

## Overview

Feliz has three durable context carriers:

1. `Thread` for current mutable execution state
2. `Job` for append-only work history
3. Repo memory/specs for durable project knowledge

History remains a separate audit log.

## Thread Lifecycle

A thread is created the first time a Linear issue is delegated or mentioned.

It then accumulates:

- workspace linkage (`worktree_path`, `branch_name`)
- latest Linear session linkage (`linear_session_id`)
- current execution status (`status`)

The thread persists across follow-up comments and repeated agent passes.

## Job Lifecycle

Jobs are append-only.

Typical sources:

- human issue comments and clarifications
- agent-written review findings
- agent-written failure summaries
- agent-written next-step notes

Jobs are never promoted into a different conceptual type. They remain jobs.

## History Lifecycle

History records runtime events such as:

- thread start
- thread completion
- thread re-queue
- thread failure
- thread stop

History is append-only and not used as the primary guidance stream for the agent.

## Memory and Specs Lifecycle

Memory and specs live in the repo and therefore follow normal git lifecycle rules:

- edited in the worktree
- reviewed in commits and PRs
- available to later thread executions through `feliz thread read`

There is no scratchpad lifecycle in the simplified model.

## Dirty Thread Requeue

When a new human job arrives during active execution:

1. the thread becomes `running_dirty`
2. the active pipeline continues
3. completion or failure returns the thread to `pending`
4. the next dispatch sees the newly appended jobs

This replaces separate retry or follow-up queues with one consistent thread model.
