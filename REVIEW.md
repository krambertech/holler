# Review

Review changes against this file from `main`. Each row covers at least two past findings and names a trigger in the diff. Delete a row when a guard covers it.

Review the current head. Tag each finding **Important** (a person would hit it), **Nit**, or **Pre-existing** (the change did not cause it, so it blocks nothing). Give a sequence that ends in the wrong result. If a guard could catch the finding, name its layer.

| When the diff | Ask | Seen in |
| --- | --- | --- |
| reads a row, then writes because of what it read | What if another request or the cron wrote in between? The write must carry the condition itself, and messages must come from the rows it changed. | #9, #27, #32, #33, #36 |
| does one write after another, or a write and then a queue call | If it stops between them, what finishes the work, and does a retry repeat any of it? | #10, #22, #27 |
| marks a screen or a message as in progress | Does every path, errors included, reach an end state the person can act on? | #22, #24 |
| shows what will be sent, sent to or scheduled | Does it use the sending code or a copy of its rule? Zones, follow-ups, Other and group sizes have drifted. | #14, #16, #18 |
| keeps fetched data or a prop in component state | What updates it when the data changes, and what unmounts it while someone types? | #11, #17, #18 |
| compares a time with now | Whose zone, what happens across a clock change, and what re-renders when the time passes? | #14, #18, #21, #32 |
| turns a count that can be missing into a number | Is unknown told apart from zero where it decides a confirmation? | #14, #17 |
| applies a limit, a page or a chunk | Can one item crowd out another, or be counted twice across chunks? | #15, #31, #35 |
| links to a person, Holler or page | Can this viewer open it, under the same rule the page itself applies? | #21, #22, #31 |
| adds a mode, a question type or a status | Is every place that lists them exhaustive, anonymous and empty cases included? | #16, #19 |
