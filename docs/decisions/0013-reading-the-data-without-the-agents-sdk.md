# 0013. The readings use the MCP SDK and the OAuth provider, without the Agents SDK

Status: accepted, 2026-11-09. It amends [0011](0011-two-libraries-to-measure.md), which named the Agents SDK among the Worker's dependencies.

## Context

[0009](0009-measurement-on-a-cloudflare-worker.md) has the Worker serve a read-only MCP server and the same data as JSON, behind OAuth with GitHub that admits only my account. Cloudflare's documentation builds that with the Agents SDK (`agents`), whose `createMcpHandler` wraps the official MCP SDK. The free plan gives a request 10 ms of CPU, and [0007](0007-supply-chain-policy.md) counts every package the Worker ships.

In November 2026 `agents` 0.33 depends on eleven packages, among them a Babel plugin and a Rolldown plugin, and lists over twenty peers. The official MCP SDK, `@modelcontextprotocol/server` 2.4, depends only on its core and `zod`, and it has its own `createMcpHandler`, stateless, without a Durable Object. It answers the 2026-07-28 revision of the protocol and 2025-11-25 clients from the same endpoint.

## Decision

- The Worker ships three packages, pinned to exact versions: `@cloudflare/workers-oauth-provider` 1.2 for OAuth 2.1, `@modelcontextprotocol/server` 2.4 for MCP, and `zod` 4, which the SDK uses for tool inputs. None has an install script.
- MCP runs stateless at `/mcp`: each request gets a new server from the same factory, and nothing is kept between requests. No Durable Object, no session.
- The OAuth provider issues tokens bound to the Worker's origin, so one token reads `/mcp` and `/api/v1`. The sign-in goes through GitHub with the provider's consent and upstream helpers, and only the logins in `ALLOWED_GITHUB_LOGINS` get a grant. Each request checks the login again.
- Every input is a closed list, a day or a version, checked by one schema for both MCP and the JSON API. No reading takes SQL or free text.
- The statistics are classes of the Worker: a Mann-Whitney U test with the corrections for ties and continuity, and change points by binary segmentation. The minimum sample lives in one class, `Sample`.
- An architecture test lists which module imports which package, so a new import is a reviewed change.

The alternatives:

- **The Agents SDK.** It brings the MCP SDK anyway, plus a framework for stateful agents that the readings do not use.
- **MCP written by hand.** The stateless JSON-RPC is small, but the 2026-07-28 revision changed the transport, and following it is the SDK's work.
- **OAuth written by hand.** A token server is security code, and Cloudflare's provider is maintained and reviewed.

## Consequences

- The Worker bundle grows to about 1.5 MB, 290 kB with gzip, within the free plan's 3 MB. Loading it takes about 100 ms, which counts as the isolate's startup, not as a request's 10 ms.
- A warm `tools/call` takes 1 to 4 ms of CPU, and comparing two releases of 2,000 loads each takes 4 to 9. The first requests of a new isolate take longer while V8 compiles the SDK: up to about 25 ms for `tools/list`, measured in Node with the bundle. On the free plan, such a request may end with error 1102 and have to be sent again; Workers Paid raises the limit to 30 s if that happens often.
- Dependabot and the release age of 0007 now guard three runtime packages of the Worker.
