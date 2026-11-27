# Counterexamples

Written by `pnpm check:models --record`. Each is the shortest path the checker finds, one step for each D1 statement or batch, `sendBatch` call or Slack call.

# What the code does today

Findings. Each breaks a promise under the misbehaviour it names, and stays here until the code is fixed.

## delivery/close-before-they-send-again

An answer is kept while the queue refuses its thank-you, and the Holler closes before the person sends again. recordResponse reads the status first, so answerOnWeb returns at closed and queues nothing. Their DM keeps asking for good: queueCloseWork skips it because they answered.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. closeDueHollers or closeHoller closes Holler 1
11. queueCloseWork in run 1 reads 1 closed and not queued
12. queueCloseWork in run 1 sets close_queued_at on Holler 1
13. recordResponse sets answered_at for UA on Holler 1
14. queueCloseWork in run 1 reads who is waiting on Holler 1
15. SLACK_SENDS takes the close work of Holler 1
16. recordResponse inserts the response and its answers for UA on Holler 1
17. SLACK_SENDS refuses answered and announce for UA on Holler 1
18. the person sends again; recordResponse reads Holler 1 for UA and finds it closed, so nothing is queued
19. consumer 1 takes close_notice for Holler 1 and deliver reads it as due
20. consumer 1 claims the post key of close_notice for Holler 1
21. consumer 1 posts close_notice for Holler 1

## delivery/second-tap-skips-the-count

An answer tapped in Slack is kept while the queue refuses its sends. The second tap is a conflict, and queueOutcome queues the thank-you without announce, so the announcement's count stays one short until the next answer.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites and then its announcement for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 2 takes announce for Holler 1 and deliver reads it as due
7. consumer 1 claims the post key of invite for UA
8. consumer 1 posts invite for UA
9. recordResponse reads Holler 1 for UA and finds it live and unanswered
10. consumer 1 stores dm_ts and next_reminder_at for UA
11. consumer 2 claims the post key of announce for Holler 1
12. consumer 2 posts announce for Holler 1
13. consumer 2 stores announce_ts for Holler 1
14. recordResponse sets answered_at for UA on Holler 1
15. recordResponse inserts the response and its answers for UA on Holler 1
16. SLACK_SENDS refuses answered and announce for UA on Holler 1
17. the person sends again; recordResponse reads Holler 1 for UA and finds it answered: conflict
18. SLACK_SENDS takes answered, and no announce, for UA on Holler 1
19. consumer 1 takes answered for UA and deliver reads it as due
20. consumer 1 edits answered into Slack for UA

## delivery/close-lands-before-dm-ts

A Holler closes while a consumer is posting an invite or a reminder. queueCloseWork reads who is waiting before dm_ts is stored, so that DM keeps its buttons after the close.

Breaks ClosedIsToldOnce: Once a Holler closes, everyone with an unanswered DM sees it closed and its creator gets one close notice.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. closeDueHollers or closeHoller closes Holler 1
7. queueCloseWork in run 1 reads 1 closed and not queued
8. queueCloseWork in run 1 sets close_queued_at on Holler 1
9. queueCloseWork in run 1 reads who is waiting on Holler 1
10. SLACK_SENDS takes the close work of Holler 1
11. consumer 2 takes close_notice for Holler 1 and deliver reads it as due
12. consumer 1 claims the post key of invite for UA
13. consumer 1 posts invite for UA
14. consumer 1 stores dm_ts and next_reminder_at for UA
15. consumer 2 claims the post key of close_notice for Holler 1
16. consumer 2 posts close_notice for Holler 1

## delivery/answer-lands-before-reminder-posts

A person answers between postToRecipient reading answered_at and posting. The reminder reaches someone who has answered.

Breaks NoReminderAfterAnswer: No reminder posts to someone who has answered.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
11. SLACK_SENDS takes the reminders of run 1
12. consumer 1 takes reminder for UA and deliver reads it as due
13. recordResponse sets answered_at for UA on Holler 1
14. consumer 1 claims the post key of reminder for UA
15. consumer 1 posts reminder for UA

## delivery/answer-lands-before-dm-ts

A person opens the web form from the DM Slack just showed them and answers before its dm_ts is stored. The thank-you finds no DM to edit, so the question keeps asking.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. recordResponse sets answered_at for UA on Holler 1
10. recordResponse inserts the response and its answers for UA on Holler 1
11. SLACK_SENDS takes answered and announce for UA on Holler 1
12. consumer 2 takes announce for Holler 1 and deliver does nothing
13. consumer 2 takes answered for UA and deliver reads it as due
14. consumer 1 stores dm_ts and next_reminder_at for UA
15. consumer 2 edits answered into Slack for UA

## delivery/queue-gives-up

Slack fails for longer than max_retries: 6 retries and about ten minutes in apps/web/wrangler.jsonc. The queue drops the message, there is no dead-letter queue, and the claim (invited_at, reminders_sent, close_queued_at) stays, so no pass sends it again.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. Slack fails invite for UA in consumer 1
8. consumer 1 gives back the post key of invite for UA but it was the last retry, so the queue drops it

## delivery/slack-loses-its-reply

Slack posts and the reply is lost or is a 5xx page. postOnce cannot tell this from a failed post, gives the key back and posts again.

Breaks NothingPostsTwice: Nothing posts twice: one invite and one reminder of each tone to a person, one announcement, one close notice and one shared-with-you DM to each viewer.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. Slack posts invite for UA but the call throws in consumer 1
8. consumer 1 gives back the post key of invite for UA and retries
9. consumer 1 takes invite for UA and deliver reads it as due
10. consumer 1 claims the post key of invite for UA
11. consumer 1 posts invite for UA

## delivery/queue-loses-its-reply

sendBatch queues the reminders and then throws. queueDueReminders gives the claims back and claims again with a new queuedAt, so the same reminder has two post keys and posts twice.

Breaks NothingPostsTwice: Nothing posts twice: one invite and one reminder of each tone to a person, one announcement, one close notice and one shared-with-you DM to each viewer.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. consumer 1 stores dm_ts and next_reminder_at for UA
9. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
10. SLACK_SENDS takes, but the call throws, for the reminders of run 1
11. queueDueReminders makes the reminders due again in run 1
12. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
13. SLACK_SENDS takes the reminders of run 1
14. consumer 1 takes reminder for UA and deliver reads it as due
15. consumer 2 takes reminder for UA and deliver reads it as due
16. consumer 1 claims the post key of reminder for UA
17. consumer 1 posts reminder for UA
18. consumer 2 claims the post key of reminder for UA
19. consumer 2 posts reminder for UA

## delivery/person-gives-up

An answer is kept while the queue refuses its thank-you, and the person does not send again. Nothing in the cron repairs it, so their DM keeps asking for an answer Holler has.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. recordResponse sets answered_at for UA on Holler 1
11. recordResponse inserts the response and its answers for UA on Holler 1
12. SLACK_SENDS refuses answered and announce for UA on Holler 1
13. UA saw an error and does not send again

## delivery/worker-dies-in-go-live

The Worker dies in goLive after marking the Holler live. It is live with no recipients, or with recipients claimed and never invited, and no pass looks for either.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. the Worker dies in goLive for Holler 1

## delivery/worker-dies-in-queue-due-invites

The Worker dies in queueDueInvites between setting invited_at and sendBatch. Those people are never invited.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS refuses goLive's invites for Holler 1
5. goLive's releaseInvites gives back the claims of Holler 1
6. queueDueInvites in run 1 sets invitedAt
7. the Worker dies in queueDueInvites in run 1

## delivery/worker-dies-in-queue-due-reminders

The Worker dies in queueDueReminders between clearing next_reminder_at and sendBatch. Those people never get that reminder or a later one.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. consumer 1 stores dm_ts and next_reminder_at for UA
9. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
10. the Worker dies in queueDueReminders in run 1

## delivery/worker-dies-in-queue-close-work

The Worker dies in queueCloseWork between setting close_queued_at and sendBatch. The unanswered DMs keep their buttons and the creator gets no close notice.

Breaks ClosedIsToldOnce: Once a Holler closes, everyone with an unanswered DM sees it closed and its creator gets one close notice.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. closeDueHollers or closeHoller closes Holler 1
6. queueCloseWork in run 1 reads 1 closed and not queued
7. queueCloseWork in run 1 sets close_queued_at on Holler 1
8. the Worker dies in queueCloseWork in run 1
9. consumer 1 takes invite for UA and deliver does nothing

## delivery/worker-dies-in-record-response

The Worker dies in recordResponse between setting answered_at and inserting the response. Sending again is a conflict, so Holler thanks the person for an answer it does not have.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. recordResponse sets answered_at for UA on Holler 1
11. the Worker dies in recordResponse for UA on Holler 1
12. the person sends again; recordResponse reads Holler 1 for UA and finds it answered: conflict
13. SLACK_SENDS takes answered and announce for UA on Holler 1
14. consumer 1 takes announce for Holler 1 and deliver does nothing
15. consumer 1 takes answered for UA and deliver reads it as due
16. consumer 1 edits answered into Slack for UA

## delivery/worker-dies-in-post-once

A consumer dies between claiming a post key and posting. The queue delivers the message again, the key is taken, and it is acked without a post.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. the Worker dies in consumer 1 before its ack, so the queue delivers invite again
8. consumer 1 takes invite for UA and deliver reads it as due
9. consumer 1 finds the post key of invite for UA taken, and acks

## delivery/worker-dies-before-dm-ts

A consumer dies between posting a DM and storing dm_ts. The person has the DM, but Holler never reminds them, thanks them in it or shows it closed.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. the Worker dies in consumer 1 before its ack, so the queue delivers invite again
9. consumer 1 takes invite for UA and deliver reads it as due
10. consumer 1 finds the post key of invite for UA taken, and acks

## delivery/worker-dies-before-announce-ts

A consumer dies between posting the announcement and storing announce_ts. The channel keeps a count that never moves and never closes.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites and then its announcement for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 2 takes announce for Holler 1 and deliver reads it as due
7. consumer 1 claims the post key of invite for UA
8. consumer 1 posts invite for UA
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. consumer 2 claims the post key of announce for Holler 1
11. consumer 2 posts announce for Holler 1
12. the Worker dies in consumer 2 before its ack, so the queue delivers announce again
13. consumer 1 takes announce for Holler 1 and deliver reads it as due
14. consumer 1 finds the post key of announce for Holler 1 taken, and acks

## delivery/worker-dies-in-add-viewers

The Worker dies in addViewers between inserting the viewer with notified_at and sendBatch. The cron reads only viewers with no notified_at, so that person never gets the shared-with-you DM.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. addViewers inserts UA as a viewer of Holler 1 with notified_at set
6. the Worker dies in addViewers for UA on Holler 1
7. consumer 1 takes invite for UA and deliver reads it as due
8. consumer 1 claims the post key of invite for UA
9. consumer 1 posts invite for UA
10. consumer 1 stores dm_ts and next_reminder_at for UA

## delivery/worker-dies-in-queue-share-notices

The Worker dies in queueShareNotices between setting notified_at and sendBatch. That person never gets the shared-with-you DM.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. addViewers inserts UA as a viewer of Holler 1 with notified_at set
6. SLACK_SENDS refuses the shared-with-you DM of UA on Holler 1
7. addViewers's releaseShares clears notified_at for UA on Holler 1
8. queueShareNotices in run 1 reads 1 viewers with no notified_at
9. queueShareNotices in run 1 sets notified_at for UA on Holler 1
10. the Worker dies in queueShareNotices in run 1
11. consumer 1 takes invite for UA and deliver reads it as due
12. consumer 1 claims the post key of invite for UA
13. consumer 1 posts invite for UA
14. consumer 1 stores dm_ts and next_reminder_at for UA

## rounds/worker-dies-in-go-live

The Worker dies after goLive marks the round live and before the batch that schedules the next one. The round is live with no recipients, or with recipients and no next round, so the pulse stops repeating and nobody is told.

Breaks OneNextRound: A series that repeats has exactly one next round.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. the Worker dies in goLive in run 1 for round 1

## rounds/undo-after-stop

A D1 batch throws while a later round goes out, and the creator stops repeating before goLive's undo. The undo sets the round back to scheduled without looking, so the next cron run sends it.

Breaks NothingGoesOutAfterStop: Once Stop repeating returns, no later round goes out.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. goLive's batch in run 1 schedules round 2 every week
7. sendDueHollers in run 1 reads that round 2 is due
8. nextRound in run 1 reads round 2 and its repeat_rule
9. goLive in run 1 marks live round 2
10. a D1 batch throws in goLive in run 1 for round 2
11. stopRepeating reads the series
12. stopRepeating deletes every scheduled round after the first and clears every repeat_rule, in one batch, and returns
13. goLive in run 1 undoes its send, which sets back to scheduled round 2
14. sendDueHollers in run 1 reads that round 2 is due
15. nextRound in run 1 reads round 2 with no repeat_rule
16. goLive in run 1 marks live round 2

# Past bugs the models replay

Each is the current design with one protection taken out.

## delivery/claims-every-closed-holler

#10 claimed every closed Holler in one update before queueing the first, so one refusal left the rest claimed for good.

Breaks ClosedIsToldOnce: Once a Holler closes, everyone with an unanswered DM sees it closed and its creator gets one close notice.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. closeDueHollers or closeHoller closes Holler 1
6. goLive marks Holler 2 live
7. goLive inserts the recipients of Holler 2 with invitedAt set
8. SLACK_SENDS takes goLive's invites for Holler 2
9. closeDueHollers or closeHoller closes Holler 2
10. queueCloseWork in run 1 reads 1 closed and not queued
11. queueCloseWork in run 2 reads 2 closed and not queued
12. queueCloseWork in run 2 sets close_queued_at on every one of them
13. queueCloseWork in run 2 takes Holler 1
14. queueCloseWork in run 2 reads who is waiting on Holler 1
15. SLACK_SENDS refuses the close work of Holler 1
16. queueCloseWork in run 2 clears close_queued_at on Holler 1 and throws, which ends the pass
17. queueCloseWork in run 1 sets close_queued_at on every one of them
18. queueCloseWork in run 1 takes Holler 1
19. queueCloseWork in run 1 reads who is waiting on Holler 1
20. SLACK_SENDS takes the close work of Holler 1
21. consumer 1 takes invite for UA and deliver does nothing
22. consumer 1 takes invite for UA and deliver does nothing
23. consumer 1 takes close_notice for Holler 1 and deliver reads it as due
24. consumer 1 claims the post key of close_notice for Holler 1
25. consumer 1 posts close_notice for Holler 1

## delivery/reminder-without-a-key

#10 posted a queued reminder without claiming a post key, so a reminder delivered twice posted twice.

Breaks NothingPostsTwice: Nothing posts twice: one invite and one reminder of each tone to a person, one announcement, one close notice and one shared-with-you DM to each viewer.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. consumer 1 stores dm_ts and next_reminder_at for UA
9. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
10. SLACK_SENDS takes the reminders of run 1
11. consumer 1 takes reminder for UA (it will be delivered again) and deliver reads it as due
12. consumer 2 takes reminder for UA and deliver reads it as due
13. consumer 1 posts reminder for UA
14. consumer 2 posts reminder for UA

## delivery/announcement-never-retried

#10 had no pass for an announcement the queue refused, so the channel never got it.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes the first batch and refuses the rest of goLive's invites and then its announcement for Holler 1
5. goLive's releaseInvites gives back the claims of Holler 1
6. consumer 1 takes invite for UA and deliver reads it as due
7. consumer 1 claims the post key of invite for UA
8. consumer 1 posts invite for UA
9. consumer 1 stores dm_ts and next_reminder_at for UA

## delivery/conflict-queues-nothing

#22 kept an answer while the queue refused its thank-you, and sending again returned without queueing it.

Breaks KeptAnswersReachSlack: A person marked answered has a response, their latest DM thanks them, and the announcement counts it.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. recordResponse sets answered_at for UA on Holler 1
11. recordResponse inserts the response and its answers for UA on Holler 1
12. SLACK_SENDS refuses answered and announce for UA on Holler 1
13. the person sends again; recordResponse reads Holler 1 for UA and finds it answered: conflict

## rounds/inserts-without-checking

#32 inserted the next round whatever its series said by then, so a pulse went on after Stop repeating returned.

Breaks NothingGoesOutAfterStop: Once Stop repeating returns, no later round goes out.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. stopRepeating reads the series
7. stopRepeating deletes every scheduled round after the first and clears every repeat_rule, in one batch, and returns
8. goLive's batch in run 1 schedules round 2 with no repeat_rule
9. sendDueHollers in run 1 reads that round 2 is due
10. nextRound in run 1 reads round 2 with no repeat_rule
11. goLive in run 1 marks live round 2

# Protections the models also check

No past bug, but the promise fails without them.

## delivery/keeps-refused-claims

queueClaimed does not give claims back when the queue refuses them.

Breaks ClaimedWorkIsNeverLost: Whatever was claimed is queued and posted, or given back for the cron to claim again, a viewer's shared-with-you DM included.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS refuses goLive's invites for Holler 1

## delivery/reminds-without-reading

postToRecipient does not look at answered_at before it posts.

Breaks NoReminderAfterAnswer: No reminder posts to someone who has answered.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. goLive inserts the recipients of Holler 1 with invitedAt set
4. SLACK_SENDS takes goLive's invites for Holler 1
5. consumer 1 takes invite for UA and deliver reads it as due
6. consumer 1 claims the post key of invite for UA
7. consumer 1 posts invite for UA
8. recordResponse reads Holler 1 for UA and finds it live and unanswered
9. consumer 1 stores dm_ts and next_reminder_at for UA
10. queueDueReminders in run 1 adds one to reminders_sent and clears next_reminder_at
11. SLACK_SENDS takes the reminders of run 1
12. recordResponse sets answered_at for UA on Holler 1
13. consumer 1 takes reminder for UA and deliver reads it as due
14. consumer 1 claims the post key of reminder for UA
15. consumer 1 posts reminder for UA

## delivery/share-keyed-by-queue-time

postKey names a share's queuedAt, so a share the queue took while its reply was lost, and the cron claimed again, has two post keys and posts twice.

Breaks NothingPostsTwice: Nothing posts twice: one invite and one reminder of each tone to a person, one announcement, one close notice and one shared-with-you DM to each viewer.

1. the Holler is a draft
2. goLive marks Holler 1 live
3. addViewers inserts UA as a viewer of Holler 1 with notified_at set
4. SLACK_SENDS takes, but the call throws, for the shared-with-you DM of UA on Holler 1
5. addViewers's releaseShares clears notified_at for UA on Holler 1
6. queueShareNotices in run 1 reads 1 viewers with no notified_at
7. queueShareNotices in run 1 sets notified_at for UA on Holler 1
8. SLACK_SENDS takes the shared-with-you DM of UA on Holler 1 in run 1
9. consumer 1 takes shared for UA and deliver reads it as due
10. consumer 1 claims the post key of shared for UA
11. consumer 1 posts shared for UA
12. consumer 1 takes shared for UA and deliver reads it as due
13. consumer 1 claims the post key of shared for UA
14. consumer 1 posts shared for UA

## rounds/stops-in-two-statements

stopRepeating deletes the scheduled rounds and clears repeat_rule in two statements instead of one batch.

Breaks NothingGoesOutAfterStop: Once Stop repeating returns, no later round goes out.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. stopRepeating reads the series
7. stopRepeating deletes every scheduled round after the first
8. goLive's batch in run 1 schedules round 2 every week
9. sendDueHollers in run 1 reads that round 2 is due
10. nextRound in run 1 reads round 2 and its repeat_rule
11. stopRepeating clears every repeat_rule, and returns
12. goLive in run 1 marks live round 2

## rounds/goes-live-unguarded

goLive marks the Holler live whatever its status, instead of only from draft or scheduled.

Breaks OneNextRound: A series that repeats has exactly one next round.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. goLive's batch in run 1 schedules round 2 every week
7. sendDueHollers in run 1 reads that round 2 is due
8. nextRound in run 1 reads round 2 and its repeat_rule
9. sendDueHollers in run 2 reads that round 2 is due
10. goLive in run 1 marks live round 2
11. goLive in run 1 inserts the recipients of round 2
12. goLive's batch in run 1 schedules round 3 every week
13. nextRound in run 2 reads round 2 and its repeat_rule
14. goLive in run 2 marks live round 2
15. goLive in run 2 inserts the recipients of round 2
16. goLive's batch in run 2 throws on hollers_round for round 3
17. goLive in run 2 undoes its send, which sets back to scheduled round 2

## rounds/schedules-on-the-rule-it-read

nextRound schedules the next round on the rule it read before goLive, instead of the series' rule when its batch runs.

Breaks NextRoundKeepsRule: Once how often a pulse repeats changes, its next round goes out on the new rule.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. changeRepeat reads the series, repeating every week with no round scheduled
7. changeRepeat's batch makes the series repeat every fortnight
8. goLive's batch in run 1 schedules round 2 every week

## rounds/changes-without-checking

changeRepeat writes the new rule whatever round is scheduled by then, instead of only while the round it read is still the scheduled one.

Breaks NextRoundKeepsRule: Once how often a pulse repeats changes, its next round goes out on the new rule.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. changeRepeat reads the series, repeating every week with no round scheduled
7. goLive's batch in run 1 schedules round 2 every week
8. changeRepeat's batch makes the series repeat every fortnight

## rounds/changes-after-stop

changeRepeat writes the new rule on every row of the series, instead of only on rows that still have the rule it read.

Breaks NothingGoesOutAfterStop: Once Stop repeating returns, no later round goes out.

1. round 1 is scheduled and repeats
2. sendDueHollers in run 1 reads that round 1 is due
3. nextRound in run 1 reads round 1 and its repeat_rule
4. goLive in run 1 marks live round 1
5. goLive in run 1 inserts the recipients of round 1
6. stopRepeating reads the series
7. changeRepeat reads the series, repeating every week with no round scheduled
8. stopRepeating deletes every scheduled round after the first and clears every repeat_rule, in one batch, and returns
9. changeRepeat's batch makes the series repeat every fortnight
10. goLive's batch in run 1 schedules round 2 every fortnight
11. sendDueHollers in run 1 reads that round 2 is due
12. nextRound in run 1 reads round 2 and its repeat_rule
13. goLive in run 1 marks live round 2
