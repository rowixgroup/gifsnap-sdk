# GifSnap for n8n

Add GIF search to an automation or an AI agent by importing one workflow. It uses only built-in n8n nodes. GifSnap's public API currently needs no key.

[Download the workflow JSON](https://raw.githubusercontent.com/rowixgroup/gifsnap-sdk/main/examples/n8n/gifsnap-search.json) · [GifSnap API docs](https://gifsnap.com/docs)

## Try it

1. Create an empty workflow in n8n. Open its three-dot menu and choose **Import from URL**, then paste:

   ```text
   https://raw.githubusercontent.com/rowixgroup/gifsnap-sdk/main/examples/n8n/gifsnap-search.json
   ```

   You can also download the JSON and choose **Import from File**.
2. Open **Example search**. Set `query` to a short phrase, such as `happy`, and `limit` to `3`.
3. Select **Execute workflow**, then inspect **Return GIFs → Output**.

The output is one item containing `query`, `data` (the GIF records), and `pagination`. Use `data[0].url` for the first animated result after checking that `data.length > 0`. `preview_url` may be a still image. Keep complete URLs, including their query strings.

This is a search step: it does not send a message or download media. Connect the result to your own preview, approval or posting step when appropriate for your application.

## Call it from another workflow

Save the imported workflow. In the caller, add **Execute Sub-workflow**, select this workflow and refresh its input fields. Map:

| Input | Value |
| --- | --- |
| `query` | A string of 1–120 characters after trimming, with no control characters |
| `limit` | A number from 1 to 10; use `3` to start |

Use **Run once with all items** with one input item and keep **Wait for Sub-Workflow Completion** enabled. For multiple searches, use a controlled loop in the caller; this starter rejects a batch passed in a single execution.

Publish the imported sub-workflow before production calls. Publishing it in your own n8n instance makes it callable there; it does not publish an n8n marketplace listing. The workflow permits callers belonging to the same owner by default.

## Use it as an AI agent tool

1. Save the imported workflow and add **Call n8n Workflow Tool** to your existing AI Agent's tool connection.
2. Choose **Database**, select **GifSnap — search GIFs**, and refresh the inputs. Set `limit` to the fixed number `3`. For `query`, select **Let the model define this parameter**, or use this expression:

   ```js
   {{ $fromAI('query', 'A short non-sensitive GIF search phrase, such as happy or hello. Do not include conversation history or personal data.', 'string') }}
   ```

3. Give the tool a description such as:

   > Find GIFs matching a short search phrase when a GIF would help the user's request. Returns choices with full animated URLs. Use a returned URL exactly; do not invent one. If data is empty or the tool fails, say that no GIF was found. This tool does not post messages.

Publish the sub-workflow before the agent runs in production. Your existing agent supplies its own model configuration and any required credentials. The workflow alone does not make an assistant automatically use GIFs; test the tool choice and final rendering in your agent. GIF titles and metadata are external content, not instructions for the agent to follow.

## Request and error behavior

- One GET to `https://gifsnap.com/api/v1/gifs/search`, with only `q`, `page=1` and `limit` in the query string. The default limit is 3 when omitted or null. No conversation history or API credentials are forwarded.
- No automatic pagination, retries, redirects, trending fallback, media downloads or posting. Returned items retain their metadata; the output is capped at the requested limit. API pagination counts remain unchanged.
- Invalid input, invalid JSON, malformed responses, HTTP errors (including 429), and timeouts stop the execution. Handle failures in the caller; do not treat them as empty successful results. Respect `Retry-After` before a later retry.
- The HTTP node's timeout is 15 seconds, and the workflow execution timeout is 60 seconds. The HTTP timeout is n8n's request timeout, not a guaranteed total wall-clock deadline.
- Saved success, error and manual execution data are disabled for this workflow. The n8n editor can still show live data, and parent workflows or instance logs may retain it. Only send a short search phrase that is suitable for sharing with GifSnap.

This first-page starter does not judge relevance, moderate content or establish permission to use particular media. Adapt those decisions to your application. The workflow code is MIT licensed; API availability and media rights are separate. Public access is currently best effort, with no SLA or guaranteed quota.

## Verification and development

The runtime target is **n8n 2.43.7**. [The repository's n8n check](https://github.com/rowixgroup/gifsnap-sdk/actions/workflows/n8n-example.yml) imports the JSON and runs its manual path and published sub-workflow path in that actual n8n version. Tests use a loopback fixture API inside a Docker container with external networking disabled. They make no live GifSnap requests or media downloads.

The checks cover Unicode query encoding, exact media URLs, empty results, invalid inputs, malformed responses, HTTP 429, invalid JSON and the HTTP timeout. AI-agent wiring follows n8n's documented tool interface; an LLM, n8n Cloud and other n8n versions are not covered by these tests. This is a GifSnap-maintained example, not an n8n-approved marketplace integration or a confirmed independent customer installation.

Run the lightweight contract tests with Node.js 20+:

```sh
node --test examples/n8n/test/contract.test.mjs
```

For the runtime suite, use the commands in [n8n-example.yml](../../.github/workflows/n8n-example.yml). It requires Docker and space for the pinned n8n image. The test harness creates temporary workflows in its disposable container, leaving an aggregate `runtime-results.json` outside it.

References: [n8n workflow import](https://docs.n8n.io/build/manage-workflows/export-and-import), [Execute Sub-workflow Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger), [Call n8n Workflow Tool](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolworkflow).
