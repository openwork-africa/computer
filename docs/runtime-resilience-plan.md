# Runtime Resilience Implementation Plan

## Outcome

Make Openwork Computer fail fast, recover predictably, and remain responsive when Apple Container stalls. Repeated SDK calls must never create an unbounded collection of child processes, uploads must not depend on `container exec`, and normal browser actions should remain low-latency with bounded memory use.

## Implementation status

Implemented in this change:

- bounded subprocess execution with timeout, abort support, output limits, TERM/KILL escalation, and child reaping;
- a per-computer in-process command queue and exec circuit breaker;
- explicit `health` and `probe` SDK/CLI operations;
- zero-exec local uploads using host-side copy/atomic rename;
- the same timeout and zero-exec upload safeguards in `example/computer`;
- unit coverage for timeout cleanup, output caps, queue ordering, and circuit behaviour.

Still separate follow-up work:

- a cross-process circuit state for many independently launched CLI invocations;
- a browser-protocol `setInputFiles` bridge, which is required to attach a file to a webpage without any native picker;
- streaming screenshot and recording APIs plus full diagnostics metrics.

## Current failure

Every SDK action starts an independent `container` child process and waits indefinitely for its output and exit status. There is no timeout, cancellation, per-computer queue, output limit, or unhealthy-state tracking. When Apple Container's exec session layer stalls:

1. The first `container exec` remains alive forever.
2. Retried SDK actions create additional waiting processes.
3. Lifecycle operations such as `container stop` can queue behind the stalled work.
4. Screenshots and uploads retain buffers while their promises remain unresolved.
5. The caller receives neither an error nor a useful recovery path.

The upload implementation also stages a file in a host directory already mounted at `~/Uploads`, then copies it back into that same mounted location and verifies it with `container exec`. That extra copy and verification are unnecessary and expose uploads to the same jam.

## Design principles

- Bound every external operation by time, output size, queue depth, and memory.
- Allow at most one active exec operation per computer.
- Cancel only operations that are safe to supersede; never interrupt typing or clicks halfway through by default.
- Treat a timed-out `container exec` as a runtime-health failure, not as a normal command error.
- Keep lifecycle operations separate from browser-action queues so recovery cannot wait behind ordinary actions.
- Never use native file-picker screen automation for programmatic uploads.
- Preserve exact child PIDs and terminate only processes started by this SDK.
- Avoid logging typed text, clipboard contents, credentials, or file contents.

## Proposed architecture

### 1. Supervised process runner

Replace the unrestricted `ContainerRuntime.cli()` implementation with a process supervisor.

```ts
type CommandClass = "read" | "interaction" | "transfer" | "lifecycle" | "build";

type CommandOptions = {
  stdin?: string | Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  commandClass?: CommandClass;
};
```

The supervisor will:

- assign every invocation a command ID;
- start a monotonic deadline;
- retain the exact `Bun.Subprocess` instance;
- consume stdout and stderr with configured byte limits;
- on cancellation or timeout, send `SIGTERM`, wait up to 750 ms, then send `SIGKILL`;
- await and reap the child before resolving;
- throw typed errors such as `CommandTimeoutError`, `CommandCancelledError`, and `OutputLimitError`;
- remove the child from the active-process registry in `finally`;
- clean up owned children during SDK shutdown.

Default deadlines:

| Operation | Deadline |
| --- | ---: |
| click, key, cursor, title, tabs | 5 seconds |
| clipboard and small reads | 8 seconds |
| screenshot | 15 seconds |
| upload/copy | 60 seconds |
| save, stop, resume | 45 seconds |
| image build | 20 minutes |

Callers may shorten deadlines. Longer or disabled deadlines should only be allowed for explicit build operations.

### 2. Per-computer command scheduler

Add one `ComputerCommandScheduler` per computer ID.

- Run one interaction or exec command at a time.
- Preserve ordering for clicks, keys, typing, clipboard writes, and navigation.
- Give lifecycle recovery exclusive access without placing it behind the interaction queue.
- Set a finite queue limit, initially 100 commands.
- Reject overflow with `CommandQueueFullError`.
- Remove queued work immediately when its abort signal fires.

Safe, high-frequency operations can use latest-wins coalescing:

- pending mouse moves replace older pending mouse moves;
- pending screenshots requested by the same consumer share one result;
- health checks collapse into one check;
- tab and title reads may reuse a very recent result for up to 100 ms.

Typing, key presses, clicks, uploads, saves, and posts must never be silently coalesced.

### 3. Runtime health and circuit breaker

Track each computer as `healthy`, `suspect`, `unhealthy`, or `recovering`.

- A command-level error from inside the VM does not open the circuit.
- A `container exec` timeout marks the computer `unhealthy` and opens the circuit.
- While open, reject new interaction commands immediately with an actionable error instead of spawning more processes.
- Permit only bounded health probes and lifecycle recovery while the circuit is open.
- Close the circuit after a successful no-op exec and visible-browser check.
- Use exponential backoff for automatic probes: 1, 2, 5, 10, then 30 seconds.
- Never run more than one probe at a time.

The error returned to callers should include the computer ID, failed command class, elapsed time, health state, and recommended recovery method. It must not include sensitive command arguments.

### 4. Bounded recovery state machine

Recovery should be explicit and time-limited:

1. Cancel and reap SDK-owned commands for that computer.
2. Probe `container exec <id> true` with a 3-second timeout.
3. If it fails, call `container stop` with a 20-second SDK deadline.
4. If stop fails, call `container kill` with a 10-second SDK deadline.
5. If the per-container runtime remains stuck, report that Apple Container's system service requires recovery. Do not loop or keep spawning commands.
6. Resume/recreate the VM from the existing Firefox profile only after the prior runtime is confirmed stopped.
7. Verify the screen and close the circuit.

System-wide Container recovery affects unrelated containers and must remain an explicit administrative action, not an automatic SDK fallback.

### 5. Fast, zero-exec uploads

For local computers, `config.paths.uploads` is already mounted at `config.uploadsInside`. Therefore upload should:

1. Validate and sanitize the destination basename.
2. Copy a path source with the filesystem's streaming `copyFile` operation.
3. Stream `Blob` or byte sources to a temporary file in the uploads directory, then atomically rename it.
4. Set a host-side readable mode when needed.
5. Return `/home/user/Uploads/<name>` without `container cp` or `container exec` verification.

This removes one full-file memory copy, one redundant container copy, and one exec call per upload.

For true browser attachment, add a trusted browser bridge using WebDriver BiDi or another browser-supported file-input API. The API should resemble:

```ts
await computer.setInputFiles({ selector: "input[type=file]", files: [localPath] });
```

It must set the file input through the browser automation protocol. It must not open GTK and type into the native file picker.

### 6. Memory-efficient I/O

- Keep `screenshot(): Promise<Uint8Array>` for compatibility, but add `screenshotTo(path)` for CLI and recording workflows.
- Stream screenshots directly to their destination instead of buffering PNG data twice.
- Cap ordinary stdout and stderr at 1 MiB and error stderr at 64 KiB unless an operation explicitly opts into streaming.
- Use streaming APIs for recordings, large uploads, and archive extraction.
- Do not retain completed command output in scheduler history; retain only bounded metadata.
- Keep at most 200 command metadata records per computer in a ring buffer.
- Avoid reading a file into a `Uint8Array` when the caller supplied a filesystem path.

### 7. Observability

Record structured, bounded metadata:

- command ID and class;
- computer ID;
- queue time and execution time;
- exit, timeout, cancellation, or output-limit outcome;
- health-state transitions;
- active and queued command counts;
- bytes read and written.

Never record command text for typing, clipboard values, VNC passwords, cookies, tokens, or uploaded content. Expose a concise `computer diagnostics <id>` command showing current health and active SDK-owned operations.

## Implementation sequence

### Phase 1: Process safety

- Introduce typed runtime errors and `CommandOptions`.
- Add deadlines, cancellation, bounded output, TERM/KILL escalation, and guaranteed child reaping.
- Add unit tests using a fake command that exits, errors, produces excessive output, or never exits.
- Ensure CLI interruption aborts the active SDK operation.

### Phase 2: Scheduling and health

- Add the per-computer serial scheduler.
- Add queue limits and safe coalescing.
- Add the health-state circuit breaker and bounded probes.
- Route all `Desktop` methods through the scheduler.
- Ensure lifecycle methods use the exclusive recovery path.

### Phase 3: Uploads and browser attachment

- Remove redundant `container cp` and exec verification from local uploads.
- Implement atomic, streaming host-side file placement.
- Add direct browser file-input support.
- Update documentation so callers do not use native picker automation.

### Phase 4: Streaming and diagnostics

- Add `screenshotTo()` and streaming transfer helpers.
- Add bounded metrics and the diagnostics command.
- Update the server's stream-readiness loop to use deadline-protected calls.
- Apply the same runtime implementation to the example SDK instead of maintaining a second unsupervised process runner.

### Phase 5: Runtime compatibility

- Test against the currently installed Apple Container release and the latest stable release.
- Document the minimum supported version.
- Keep all SDK safeguards even if an upstream release appears to fix the exec hang.

## Test plan

### Unit tests

- A command that never exits times out and its child is reaped.
- Abort signals remove queued work and stop active work.
- TERM escalation reaches KILL when a child ignores TERM.
- Only one exec is active per computer.
- Commands for different computers can run independently.
- Queue overflow fails immediately.
- Safe reads coalesce; interaction commands preserve order.
- A timeout opens the circuit and prevents further process creation.
- One successful recovery probe closes the circuit.
- Path uploads perform no container command.
- Large uploads and screenshots stay within configured memory bounds.

### Integration tests

- Run 1,000 sequential browser actions with zero leftover child processes.
- Start 100 concurrent screenshot requests and confirm bounded queue depth and shared results.
- Force an exec hang and confirm failure within the configured deadline.
- Confirm `save` recovery does not wait behind a hung interaction.
- Upload a 500 MiB file while keeping SDK RSS growth below 50 MiB.
- Attach a file to a test page without opening a native file picker.
- Restart a computer and confirm Firefox profile and sign-in persistence.

### Soak test

Run typical browser activity for eight hours while recording:

- host process count;
- SDK RSS and heap;
- queue depth;
- command latency percentiles;
- timeouts and health transitions.

There must be no upward trend in child-process count or retained memory after garbage collection.

## Acceptance criteria

- No SDK operation waits forever.
- A hung exec returns a typed error within its deadline plus one second.
- No new interaction process is spawned while a computer's circuit is open.
- No SDK-owned child remains after cancellation, timeout, or SDK shutdown.
- At most one exec operation is active per computer.
- A burst of replaceable reads has bounded queue and memory usage.
- Normal scheduler overhead is below 2 ms per operation on the host.
- Uploading from a path does not load the file into JavaScript memory.
- Local upload placement requires no `container exec` or `container cp`.
- Programmatic file attachment never drives the GTK picker.
- Recovery terminates with success or a clear administrative error; it never retries indefinitely.

## Initial files to change

- `src/runtime.ts`: supervised processes, deadlines, cancellation, output limits.
- `src/desktop.ts`: route browser actions through the scheduler.
- `src/sdk.ts`: zero-exec uploads and public cancellation options.
- `src/computers.ts`: bounded health checks and recovery state machine.
- `src/cli.ts`: diagnostics, cancellation on interruption, streaming screenshot command.
- `test/runtime.test.ts`: process timeout and cleanup coverage.
- `test/scheduler.test.ts`: ordering, limits, coalescing, and circuit-breaker coverage.
- `test/upload.test.ts`: atomic, streaming, zero-exec upload coverage.
- `example/computer/sdk.ts` and `example/computer/server.ts`: reuse the production runtime rather than duplicating an unbounded runner.
