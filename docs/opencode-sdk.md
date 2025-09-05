[Skip to content](https://opencode.ai/docs/sdk#_top)

SDK
===

Type-safe JS client for opencode server.

The opencode JS/TS SDK provides a type-safe client for interacting with the server. Use it to build integrations and control opencode programmatically.

[Learn more](https://opencode.ai/docs/server)
 about how the server works.

* * *

[Install](https://opencode.ai/docs/sdk#install)

------------------------------------------------

Install the SDK from npm:

    npm install @opencode-ai/sdk

* * *

[Create client](https://opencode.ai/docs/sdk#create-client)

------------------------------------------------------------

Create a client instance to connect to your server:

    import { createOpencodeClient } from "@opencode-ai/sdk"
    const client = createOpencodeClient({  baseUrl: "http://localhost:4096",  responseStyle: "data",})

#### [Options](https://opencode.ai/docs/sdk#options)

| Option | Type | Description | Default |
| --- | --- | --- | --- |
| `baseUrl` | `string` | URL of the server | `http://localhost:4096` |
| `fetch` | `function` | Custom fetch implementation | `globalThis.fetch` |
| `parseAs` | `string` | Response parsing method | `auto` |
| `responseStyle` | `string` | Return style: `data` or `fields` | `fields` |
| `throwOnError` | `boolean` | Throw errors instead of return | `false` |

* * *

[Start server](https://opencode.ai/docs/sdk#start-server)

----------------------------------------------------------

You can also programmatically start an opencode server:

    import { createOpencodeServer } from "@opencode-ai/sdk"
    const server = await createOpencodeServer({  hostname: "127.0.0.1",  port: 4096,})
    console.log(`Server running at ${server.url}`)
    server.close()

You can pass a configuration object to customize server behavior. The server still picks up your `opencode.json`, but you can override or add configuration inline:

    import { createOpencodeServer } from "@opencode-ai/sdk"
    const server = await createOpencodeServer({  hostname: "127.0.0.1",  port: 4096,  config: {    model: "anthropic/claude-3-5-sonnet-20241022",  },})
    console.log(`Server running at ${server.url}`)
    server.close()

#### [Options](https://opencode.ai/docs/sdk#options-1)

| Option | Type | Description | Default |
| --- | --- | --- | --- |
| `hostname` | `string` | Server hostname | `127.0.0.1` |
| `port` | `number` | Server port | `4096` |
| `signal` | `AbortSignal` | Abort signal for cancellation | `undefined` |
| `timeout` | `number` | Timeout in ms for server start | `5000` |
| `config` | `Config` | Configuration object | `{}` |

* * *

[Types](https://opencode.ai/docs/sdk#types)

--------------------------------------------

The SDK includes TypeScript definitions for all API types. Import them directly:

    import type { Session, Message, Part } from "@opencode-ai/sdk"

All types are generated from the server’s OpenAPI specification and available in the [types file](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)
.

* * *

[Errors](https://opencode.ai/docs/sdk#errors)

----------------------------------------------

The SDK can throw errors that you can catch and handle:

    try {  await client.session.get({ path: { id: "invalid-id" } })} catch (error) {  console.error("Failed to get session:", (error as Error).message)}

* * *

[APIs](https://opencode.ai/docs/sdk#apis)

------------------------------------------

The SDK exposes all server APIs through a type-safe client.

* * *

### [App](https://opencode.ai/docs/sdk#app)

| Method | Description | Response |
| --- | --- | --- |
| `app.log()` | Write a log entry | `boolean` |
| `app.agents()` | List all available agents | [`Agent[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples)

    // Write a log entryawait client.app.log({  body: {    service: "my-app",    level: "info",    message: "Operation completed",  },})
    // List available agentsconst agents = await client.app.agents()

* * *

### [Project](https://opencode.ai/docs/sdk#project)

| Method | Description | Response |
| --- | --- | --- |
| `project.list()` | List all projects | [`Project[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `project.current()` | Get current project | [`Project`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-1)

    // List all projectsconst projects = await client.project.list()
    // Get current projectconst currentProject = await client.project.current()

* * *

### [Path](https://opencode.ai/docs/sdk#path)

| Method | Description | Response |
| --- | --- | --- |
| `path.get()` | Get current path | [`Path`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-2)

    // Get current path informationconst pathInfo = await client.path.get()

* * *

### [Config](https://opencode.ai/docs/sdk#config)

| Method | Description | Response |
| --- | --- | --- |
| `config.get()` | Get config info | [`Config`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `config.providers()` | List providers and default models | `{ providers:` [`Provider[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`, default: { [key: string]: string } }` |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-3)

    const config = await client.config.get()
    const { providers, default: defaults } = await client.config.providers()

* * *

### [Sessions](https://opencode.ai/docs/sdk#sessions)

| Method | Description | Notes |
| --- | --- | --- |
| `session.list()` | List sessions | Returns [`Session[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.get({ path })` | Get session | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.children({ path })` | List child sessions | Returns [`Session[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.create({ body })` | Create session | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.delete({ path })` | Delete session | Returns `boolean` |
| `session.update({ path, body })` | Update session properties | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.init({ path, body })` | Analyze app and create `AGENTS.md` | Returns `boolean` |
| `session.abort({ path })` | Abort a running session | Returns `boolean` |
| `session.share({ path })` | Share session | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.unshare({ path })` | Unshare session | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.summarize({ path, body })` | Summarize session | Returns `boolean` |
| `session.messages({ path })` | List messages in a session | Returns `{ info:` [`Message`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`, parts:` [`Part[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`}[]` |
| `session.message({ path })` | Get message details | Returns `{ info:` [`Message`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`, parts:` [`Part[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`}` |
| `session.prompt({ path, body })` | Send prompt message | Returns `{ info:` [`AssistantMessage`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`, parts:` [`Part[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`}` |
| `session.command({ path, body })` | Send command to session | Returns `{ info:` [`AssistantMessage`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`, parts:` [`Part[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)<br>`}` |
| `session.shell({ path, body })` | Run a shell command | Returns [`AssistantMessage`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.revert({ path, body })` | Revert a message | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `session.unrevert({ path })` | Restore reverted messages | Returns [`Session`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `postSessionByIdPermissionsByPermissionId({ path, body })` | Respond to a permission request | Returns `boolean` |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-4)

    // Create and manage sessionsconst session = await client.session.create({  body: { title: "My session" },})
    const sessions = await client.session.list()
    // Send a prompt messageconst result = await client.session.prompt({  path: { id: session.id },  body: {    model: { providerID: "anthropic", modelID: "claude-3-5-sonnet-20241022" },    parts: [{ type: "text", text: "Hello!" }],  },})

* * *

### [Files](https://opencode.ai/docs/sdk#files)

| Method | Description | Response |
| --- | --- | --- |
| `find.text({ query })` | Search for text in files | Array of match objects with `path`, `lines`, `line_number`, `absolute_offset`, `submatches` |
| `find.files({ query })` | Find files by name | `string[]` (file paths) |
| `find.symbols({ query })` | Find workspace symbols | [`Symbol[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |
| `file.read({ query })` | Read a file | `{ type: "raw" \| "patch", content: string }` |
| `file.status({ query? })` | Get status for tracked files | [`File[]`](https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts) |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-5)

    // Search and read filesconst textResults = await client.find.text({  query: { pattern: "function.*opencode" },})
    const files = await client.find.files({  query: { query: "*.ts" },})
    const content = await client.file.read({  query: { path: "src/index.ts" },})

* * *

### [TUI](https://opencode.ai/docs/sdk#tui)

| Method | Description | Response |
| --- | --- | --- |
| `tui.appendPrompt({ body })` | Append text to the prompt | `boolean` |
| `tui.openHelp()` | Open the help dialog | `boolean` |
| `tui.openSessions()` | Open the session selector | `boolean` |
| `tui.openThemes()` | Open the theme selector | `boolean` |
| `tui.openModels()` | Open the model selector | `boolean` |
| `tui.submitPrompt()` | Submit the current prompt | `boolean` |
| `tui.clearPrompt()` | Clear the prompt | `boolean` |
| `tui.executeCommand({ body })` | Execute a command | `boolean` |
| `tui.showToast({ body })` | Show toast notification | `boolean` |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-6)

    // Control TUI interfaceawait client.tui.appendPrompt({  body: { text: "Add this to prompt" },})
    await client.tui.showToast({  body: { message: "Task completed", variant: "success" },})

* * *

### [Auth](https://opencode.ai/docs/sdk#auth)

| Method | Description | Response |
| --- | --- | --- |
| `auth.set({ ... })` | Set authentication credentials | `boolean` |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-7)

    await client.auth.set({  path: { id: "anthropic" },  body: { type: "api", key: "your-api-key" },})

* * *

### [Events](https://opencode.ai/docs/sdk#events)

| Method | Description | Response |
| --- | --- | --- |
| `event.subscribe()` | Server-sent events stream | Server-sent events stream |

* * *

#### [Examples](https://opencode.ai/docs/sdk#examples-8)

    // Listen to real-time eventsconst events = await client.event.subscribe()for await (const event of events.stream) {  console.log("Event:", event.type, event.properties)}
