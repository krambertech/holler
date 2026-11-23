# The Holler API and MCP server

Holler has two doors for software: a REST API for scripts, and an MCP server for assistants such as Claude and ChatGPT. Both call the same services as the web app and Slack, so the same rules hold in every door. The public site renders this page at `holler.team/docs/api`; the full reference is generated at [`/api/openapi.json`](https://app.holler.team/api/openapi.json).

## Make a key, then call the API

1. In Holler, open **Settings** and find **API keys**.
2. Name the key and pick its access: **Read only** or **Read and write**.
3. Copy the key. Holler shows it once and keeps only a hash.
4. Send it as a bearer token:

```bash
curl https://app.holler.team/api/v1/me -H "Authorization: Bearer hlr_…"
```

A key acts as the member who made it, in the workspace it was made in. Revoke it in the same place; the next request with it gets `401`.

## What a key can do

| Access         | Can                                                                     |
| -------------- | ----------------------------------------------------------------------- |
| Read only      | List hollers, read one, see who answered, read results, export, search people |
| Read and write | Everything above, and create, update, send, close and send reminders    |

`GET` needs any key. Every other method needs a read-and-write key, or it gets `403`. Managing keys and connected apps works only from the web app: no key can list, make or revoke a key.

A key acts as the member who made it, in the workspace it was made in (`principalForApiKey` in `server/principal.ts`), so a person in two workspaces has keys that never cross over.

## Endpoints

All paths are under `https://app.holler.team/api/v1`.

| Method | Path                     | Does                                                         |
| ------ | ------------------------ | ------------------------------------------------------------ |
| GET    | `/hollers`               | Lists hollers. `scope=mine` (default) or `shared`; filter by `status`, `mode`, `tag`, `q` |
| POST   | `/hollers`               | Creates a draft. Takes `Idempotency-Key`                     |
| GET    | `/hollers/{id}`          | One Holler with its questions                                |
| PUT    | `/hollers/{id}`          | Replaces a draft or scheduled Holler's fields and questions  |
| DELETE | `/hollers/{id}`          | Deletes a draft you made                                     |
| POST   | `/hollers/{id}/copy`     | Makes a new draft with the same questions, audience and settings |
| GET    | `/hollers/{id}/preview`  | Who a send would reach, when it closes, and what stops it. Sends nothing |
| POST   | `/hollers/{id}/send`     | Sends it now, or schedules it when it has `sendAt`           |
| POST   | `/hollers/{id}/close`    | Stops taking answers now                                     |
| POST   | `/hollers/{id}/remind`   | Reminds everyone who has not answered                        |
| POST   | `/hollers/{id}/stop-repeating` | Stops a repeating pulse: deletes the next round, keeps every answer |
| GET    | `/hollers/{id}/people`   | Who it went to and who answered                              |
| GET    | `/hollers/{id}/results`  | Counts, scale averages and text answers                      |
| GET    | `/hollers/{id}/export`   | `format=csv`: every response, one row each. `format=md`: the results summary, naming no one |
| GET    | `/directory`             | People, user groups and channels, matched on `q`             |
| GET    | `/me`                    | The member, the workspace, the key's access, this month's sends |

**Sending reaches real people in Slack and cannot be undone.** A send on Free counts toward the monthly limit, and a send past it gets `402`.

## Create a Holler

A Holler is a draft until you send it. The body is the same one the web app saves.

```bash
curl https://app.holler.team/api/v1/hollers \
  -H "Authorization: Bearer hlr_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: weekly-pulse-2026-11-23" \
  -d '{
    "mode": "pulse",
    "title": "How was your week?",
    "anonymous": true,
    "audience": { "people": [], "groups": ["S0DESIGN"], "everyone": false },
    "questions": [
      { "type": "single", "style": "scale", "prompt": "How was it?",
        "options": [{ "label": "Rough", "score": 1 }, { "label": "Okay", "score": 2 }, { "label": "Great", "score": 3 }] }
    ]
  }'
```

- `mode` is `pulse` (one or two questions), `survey` (up to 30) or `chase` (a link in `externalUrl`, no questions). It may change until the Holler is sent; saving it as a chase removes its questions.
- Each question has a `type` (`single`, `multi`, `text`, `number`, `person`) and a `style` (`plain`, `scale`, `binary`). A choice question has 2 to 100 options; scale options carry a `score`, and a scale may have words at each end in `lowLabel` and `highLabel`. A number question takes a whole number between `numberMin` and `numberMax`; a person question takes people from the workspace.
- Extras: `description` (one line under the question), `allowOther` on a plain choice question (Holler adds the Other option last; do not send it as an option), `maxChoices` on multiple choice and person, and `followUp` (`{ "prompt": "Anything to add?", "onlyAfter": null }`) on a choice question. `onlyAfter` lists the option positions that show it, with Other at the last position; a Holler with one is answered on the web form.
- Every Holler comes back with `displayTitle` (a pulse with no title shows its first question), `answeredIn` (`dm`, `slack`, `web` or `chase`) and `problems`: each reason it cannot be sent yet, with a `field` such as `questions.0.options.2`.
- `audience` takes Slack user ids in `people` and user group or channel ids in `groups`. Find them with `GET /directory?q=`.
- To keep a question or option when you update, send its `id` back. Leave one out to remove it.
- A pulse with a `sendAt` can repeat: `"repeat": "week"` or `"fortnight"`. When a round goes out, the next round is scheduled for the same day and time as the first, in the creator's time zone, as its own Holler with `repeatOfId` naming the first round. Each round must close within the interval (`closeAfterHours` up to 168 or 336, and no fixed `closesAt`). `POST /hollers/{id}/stop-repeating` (or MCP `stop_repeating`) on any round deletes the round that has not gone out yet and keeps every answer.

## Retry safely with Idempotency-Key

Send an `Idempotency-Key` header on create, a label you choose that is unique per Holler. A retry with the same key and the same body returns the first Holler with `200` and `Idempotent-Replayed: true`. The same key with a different body gets `409`, because that is almost always a bug in the script.

## Errors

Every error has one shape. The message is written for a person and says what to do next; `field` names the input at fault when there is one.

```json
{
  "error": {
    "code": "conflict",
    "message": "This Idempotency-Key was already used to create a different Holler. Use a new key for a new Holler.",
    "field": "Idempotency-Key"
  }
}
```

| Status | `code`          | Means                                                          |
| ------ | --------------- | -------------------------------------------------------------- |
| 400    | `invalid`       | The request did not validate                                   |
| 401    | `unauthorized`  | No key, or a key that is not valid or was revoked              |
| 402    | `limit_reached` | The workspace used this month's sends on Free                  |
| 403    | `forbidden`     | A read-only key tried to write, or a key called a web-only route |
| 404    | `not_found`     | It does not exist, or it is not shared with the key's member   |
| 409    | `conflict`      | The Holler's state does not allow it, or a reused `Idempotency-Key` |
| 410    | `closed`        | The Holler is closed                                           |
| 429    | `rate_limited`  | Over 600 requests a minute. `Retry-After` says how long to wait |
| 503    | `slack_unavailable` | Holler cannot reach Slack right now                        |

## Anonymous results

An anonymous Holler's results stay `gated` until five people answer, in the API, MCP, exports, Slack and the web app alike. Under five, exports are refused with `403`, and results return only the count and how many more are needed:

```json
{ "state": "gated", "responseCount": 3, "needed": 2 }
```

Holler knows who answered an anonymous Holler, so it stops reminding them, but you see only how many: `/people` gives the counts, every recipient's `answered` is `null`, and the list is in name order. `/hollers` lists no avatars for an anonymous Holler.

## Connect an assistant over MCP

Holler's MCP server is at `https://app.holler.team/mcp`. Add it to Claude, ChatGPT or another MCP client as a remote server. The client opens Holler, you sign in with Slack, and Holler asks whether to allow it.

- **Read** is always part of the grant: list and read hollers, who answered, and results.
- **Write** is ticked by default, and you can untick it. It lets the assistant make, edit and send hollers, and send reminders.
- A connection works in the workspace you were in when you allowed it, and only there.
- Disconnect it in **Settings**, under **Connected apps**. It stops working at once.

The MCP server uses OAuth 2.1. Clients identify themselves with a Client ID Metadata Document, or with dynamic registration for clients that do not support one. Discovery is at `/.well-known/oauth-protected-resource/mcp`.

An access token outlives a disconnect by up to an hour, so `principalForMcp` decides access and scope from the live consent row and never from the token. `server/mcp/cimd-fetch.ts` fetches a client's metadata document: Workers cannot pin a DNS answer but refuse connections to private ranges, so the code adds HTTPS only, `GET` or `HEAD` only, no literal special-use hosts, and redirects handed back unfollowed.

| Tool             | Does                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `list_hollers`   | Lists hollers, with the same filters as the API                      |
| `get_holler`     | One Holler, who answered, who is waiting, and its results            |
| `get_results`    | A Holler's results                                                   |
| `find_people`    | Searches people, user groups and channels for an audience            |
| `create_holler`  | Saves a new draft                                                    |
| `update_holler`  | Changes a draft or scheduled Holler                                  |
| `copy_holler`    | Starts a new draft from a Holler                                     |
| `delete_draft`   | Deletes a draft that was never sent                                  |
| `send_holler`    | Sends, in two steps                                                  |
| `close_holler`   | Stops taking answers now                                             |
| `send_reminder`  | Reminds everyone who has not answered                                |
| `export_results` | Every response as CSV, or the results summary as Markdown            |

**An assistant cannot send in one step.** The first `send_holler` call sends nothing: it returns who the Holler reaches, up to ten names, when it closes, and a confirm token. The assistant shows you that, and sends only with a second call that carries the token. The token lasts ten minutes, and any edit to the Holler makes it stale.
