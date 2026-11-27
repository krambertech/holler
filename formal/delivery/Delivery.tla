------------------------------ MODULE Delivery ------------------------------
(* What sending, reminding, answering and closing do to D1, SLACK_SENDS and   *)
(* Slack. One action is one D1 statement or batch, one sendBatch call, or one *)
(* Slack call in apps/web/src/server. Each action says its step in `said`, in *)
(* the code's words, so a counterexample reads without TLA+.                  *)
(* .agents/skills/verify-delivery-model/SKILL.md says how to read and change  *)
(* it, and what it leaves out.                                                *)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Hollers, People,
  Runs,        \* cron runs, and the creator's Close, that overlap
  Consumers,   \* SLACK_SENDS consumers at work at once
  Tiers,       \* reminders in the rhythm; reminderTiers has 3
  Announced,   \* the Hollers have an announceChannelId
  Answering,   \* people answer
  Door,        \* "web" (answerOnWeb) or "slack" (queueOutcome)
  Sharing,     \* the creator shares each sent Holler's results with its people, and may remove them

  \* What protects the code. FALSE brings a mistake back.
  ClaimOneHoller,    \* queueCloseWork claims a Holler just before queueing it
  PostKeys,          \* the sends for which postOnce claims a key in slack_deliveries
  AnnouncementPass,  \* queueMissingAnnouncements
  AnswerRequeues,    \* answerOnWeb queues again after a conflict
  ReadsAgain,        \* postToRecipient stops at answeredAt
  GivesClaimsBack,   \* queueClaimed calls release
  SharesKeyByRow,    \* postKey names a share's addedAt, not its queuedAt

  \* How often the world misbehaves.
  Refusals,          \* sendBatch calls that throw
  Failures,          \* Slack calls that throw
  Duplicates,        \* messages delivered twice
  \* How it misbehaves. Off in the checks of the current design.
  CrashIn,           \* the functions in which the Worker may die, once
  Lands,             \* subset of {"answer mid-post", "close mid-post", "close before they send again"}
  QueueGivesUp,      \* a message runs out of max_retries
  SlackLosesReply,   \* chat.postMessage posts, and the call throws
  QueueLosesReply,   \* sendBatch queues, and the call throws
  PersonGivesUp      \* someone told to try again does not

R == Hollers \X People
Invite(r) == [kind |-> "invite", h |-> r[1], u |-> r[2], tier |-> 0, at |-> 0]
Reminder(r, tier, at) == [kind |-> "reminder", h |-> r[1], u |-> r[2], tier |-> tier, at |-> at]
Answered(r) == [kind |-> "answered", h |-> r[1], u |-> r[2], tier |-> 0, at |-> 0]
Closed(r) == [kind |-> "closed", h |-> r[1], u |-> r[2], tier |-> 0, at |-> 0]
Announce(h) == [kind |-> "announce", h |-> h, u |-> "", tier |-> 0, at |-> 0]
CloseNotice(h) == [kind |-> "close_notice", h |-> h, u |-> "", tier |-> 0, at |-> 0]
Share(r, at) == [kind |-> "shared", h |-> r[1], u |-> r[2], tier |-> 0, at |-> IF SharesKeyByRow THEN 0 ELSE at]

\* postKey: two claims of one reminder are two keys, one message delivered twice is one.
Key(m) == m
\* What a person would call the same post.
Identity(m) == [m EXCEPT !.at = 0]
Identities ==
  { Invite(r) : r \in R } \cup { Reminder(r, t, 0) : r \in R, t \in 1..Tiers }
  \cup { Announce(h) : h \in Hollers } \cup { CloseNotice(h) : h \in Hollers }
  \cup { Share(r, 0) : r \in R }

VARIABLES
  holler,     \* hollers: status, close_queued_at, announce_ts
  recipient,  \* recipients, and whether the responses row was written
  keys,       \* slack_deliveries
  queue,      \* SLACK_SENDS
  posts,      \* Slack: how often each post was made
  dm,         \* Slack: each person's latest DM
  counted,    \* Slack: the answered count on the announcement
  late,       \* a reminder posted to someone who had answered
  viewer,     \* viewers: the row, notified_at, how often it was claimed, and the creator's addViewers
  sender, run, hand, person,
  left,       \* what is left of the world's misbehaviour
  said

state == <<holler, recipient, keys, viewer, queue, posts, dm, counted, late, sender, run, hand, person, left>>
d1 == <<holler, recipient, keys>>
slack == <<posts, dm, counted, late>>
workers == <<sender, run, hand, person>>

NoRun == [pass |-> "none", pc |-> "", todo |-> {}, h |-> "", extra |-> {}]
NoHand == [pc |-> "", m |-> CloseNotice("")]

Init ==
  /\ holler = [h \in Hollers |-> [status |-> "draft", closeQueued |-> FALSE, announceTs |-> FALSE]]
  /\ recipient = [r \in R |-> [row |-> FALSE, invited |-> FALSE, dmTs |-> 0, answered |-> FALSE,
                               kept |-> FALSE, sent |-> 0, due |-> FALSE, claims |-> 0]]
  /\ keys = {} /\ queue = {}
  /\ posts = [i \in Identities |-> 0]
  /\ dm = [r \in R |-> [n |-> 0, shows |-> "nothing"]]
  /\ counted = [h \in Hollers |-> 0]
  /\ late = FALSE
  /\ viewer = [r \in R |-> [row |-> FALSE, notified |-> FALSE, claims |-> 0, gone |-> FALSE, pc |-> ""]]
  /\ sender = [h \in Hollers |-> [pc |-> "", unqueued |-> {}]]
  /\ run = [w \in Runs |-> NoRun]
  /\ hand = [c \in Consumers |-> NoHand]
  /\ person = [r \in R |-> ""]
  /\ left = [refusals |-> Refusals, failures |-> Failures, duplicates |-> Duplicates,
             crashes |-> IF CrashIn = {} THEN 0 ELSE 1]
  /\ said = <<"the Holler is a draft">>

(* ------------------------------ queueClaimed ------------------------------ *)
\* The sendBatch calls for `chunks`, a sequence of sets of sends: the queue takes the first k and
\* refuses the rest. Taken is what the caller knows it took; really is what reached the queue.
Outcomes(chunks) ==
  { [took |-> k, lost |-> l] : k \in 0..Len(chunks), l \in BOOLEAN }
Union(chunks, from, to) == UNION { chunks[i] : i \in from..to }
Possible(chunks, o) ==
  /\ o.took < Len(chunks) => left.refusals > 0
  /\ o.lost => o.took < Len(chunks) /\ QueueLosesReply
Unqueued(chunks, o) == Union(chunks, o.took + 1, Len(chunks))
Enqueue(chunks, o) ==
  /\ queue' = queue \cup Union(chunks, 1, IF o.lost THEN o.took + 1 ELSE o.took)
  /\ left' = [left EXCEPT !.refusals = IF o.took < Len(chunks) THEN @ - 1 ELSE @]
Refused(chunks, o) == o.took < Len(chunks)
HowItWent(chunks, o) ==
  IF ~Refused(chunks, o) THEN "SLACK_SENDS takes"
  ELSE IF o.lost THEN "SLACK_SENDS takes, but the call throws, for"
  ELSE IF o.took > 0 THEN "SLACK_SENDS takes the first batch and refuses the rest of"
  ELSE "SLACK_SENDS refuses"

(* ---------------------------------- goLive --------------------------------- *)
GoLiveClaims(h) ==
  /\ sender[h].pc = "" /\ holler[h].status = "draft"
  /\ holler' = [holler EXCEPT ![h].status = "live"]
  /\ sender' = [sender EXCEPT ![h].pc = "insert"]
  /\ said' = <<"goLive marks", h, "live">>
  /\ UNCHANGED <<viewer, recipient, keys, queue, slack, run, hand, person, left>>

GoLiveInserts(h) ==
  /\ sender[h].pc = "insert"
  /\ recipient' = [r \in R |-> IF r[1] = h THEN [recipient[r] EXCEPT !.row = TRUE, !.invited = TRUE]
                                         ELSE recipient[r]]
  /\ sender' = [sender EXCEPT ![h].pc = "queue"]
  /\ said' = <<"goLive inserts the recipients of", h, "with invitedAt set">>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, run, hand, person, left>>

GoLiveQueues(h) ==
  /\ sender[h].pc = "queue"
  /\ LET invites == { Invite(<<h, u>>) : u \in People }
         chunks == IF Announced THEN <<invites, {Announce(h)}>> ELSE <<invites>>
     IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ sender' = [sender EXCEPT ![h] =
         IF Refused(chunks, o) /\ GivesClaimsBack
         THEN [pc |-> "release", unqueued |-> Unqueued(chunks, o)]
         ELSE [pc |-> "done", unqueued |-> {}]]
    /\ said' = <<HowItWent(chunks, o),
                 IF Announced THEN "goLive's invites and then its announcement for" ELSE "goLive's invites for", h>>
    /\ UNCHANGED <<viewer, d1, slack, run, hand, person>>

ReleaseInvites(unqueued) ==
  recipient' = [r \in R |-> IF Invite(r) \in unqueued /\ recipient[r].dmTs = 0
                            THEN [recipient[r] EXCEPT !.invited = FALSE] ELSE recipient[r]]

GoLiveReleases(h) ==
  /\ sender[h].pc = "release"
  /\ ReleaseInvites(sender[h].unqueued)
  /\ sender' = [sender EXCEPT ![h] = [pc |-> "done", unqueued |-> {}]]
  /\ said' = <<"goLive's releaseInvites gives back the claims of", h>>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, run, hand, person, left>>

(* ---------------------------- the cron's passes ---------------------------- *)
Start(w, pass, pc, todo) == run' = [run EXCEPT ![w] = [NoRun EXCEPT !.pass = pass, !.pc = pc, !.todo = todo]]
Stop(w) == run' = [run EXCEPT ![w] = NoRun]
Idle(w) == run[w] = NoRun

DueInvites == { r \in R : recipient[r].row /\ ~recipient[r].invited /\ holler[r[1]].status = "live" }
InvitesClaim(w) ==
  /\ Idle(w) /\ DueInvites # {}
  /\ recipient' = [r \in R |-> IF r \in DueInvites THEN [recipient[r] EXCEPT !.invited = TRUE] ELSE recipient[r]]
  /\ Start(w, "invites", "queue", { Invite(r) : r \in DueInvites })
  /\ said' = <<"queueDueInvites in", w, "sets invitedAt">>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, sender, hand, person, left>>

DueReminders == { r \in R : recipient[r].due /\ ~recipient[r].answered /\ recipient[r].dmTs > 0
                            /\ holler[r[1]].status = "live" }
RemindersClaim(w) ==
  /\ Idle(w) /\ DueReminders # {}
  /\ recipient' = [r \in R |-> IF r \in DueReminders
       THEN [recipient[r] EXCEPT !.sent = @ + 1, !.due = FALSE, !.claims = @ + 1] ELSE recipient[r]]
  /\ Start(w, "reminders", "queue",
       { Reminder(r, recipient[r].sent + 1, recipient[r].claims + 1) : r \in DueReminders })
  /\ said' = <<"queueDueReminders in", w, "adds one to reminders_sent and clears next_reminder_at">>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, sender, hand, person, left>>

PassQueues(w) ==
  /\ run[w].pass \in {"invites", "reminders"} /\ run[w].pc = "queue"
  /\ LET chunks == <<run[w].todo>> IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ IF Refused(chunks, o) /\ GivesClaimsBack THEN run' = [run EXCEPT ![w].pc = "release"] ELSE Stop(w)
    /\ said' = <<HowItWent(chunks, o), IF run[w].pass = "invites" THEN "the invites of" ELSE "the reminders of", w>>
    /\ UNCHANGED <<viewer, d1, slack, sender, hand, person>>

PassReleases(w) ==
  /\ run[w].pass \in {"invites", "reminders"} /\ run[w].pc = "release"
  /\ IF run[w].pass = "invites" THEN ReleaseInvites(run[w].todo)
     ELSE recipient' = [r \in R |-> IF \E m \in run[w].todo : m.h = r[1] /\ m.u = r[2]
            THEN [recipient[r] EXCEPT !.sent = @ - 1, !.due = TRUE] ELSE recipient[r]]
  /\ Stop(w)
  /\ said' = <<IF run[w].pass = "invites" THEN "releaseInvites gives back the claims of"
               ELSE "queueDueReminders makes the reminders due again in", w>>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, sender, hand, person, left>>

\* A pass that can do nothing, because the announcement's key is taken, is not explored.
MissingAnnouncements ==
  { h \in Hollers : AnnouncementPass /\ Announced /\ holler[h].status \in {"live", "closed"}
                    /\ ~holler[h].announceTs /\ Key(Announce(h)) \notin keys
                    /\ sender[h].pc = "done" }
AnnouncementsQueue(w) ==
  /\ Idle(w) /\ MissingAnnouncements # {}
  /\ LET chunks == << { Announce(h) : h \in MissingAnnouncements } >> IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ said' = <<HowItWent(chunks, o), "queueMissingAnnouncements in", w>>
    /\ UNCHANGED <<viewer, d1, slack, workers>>

(* ---------------------------------- closing -------------------------------- *)
InHand(h) == \E c \in Consumers : hand[c] # NoHand /\ hand[c].m.h = h
MidAnswer(h) == \E u \in People : person[<<h, u>>] \notin {"", "done"}
Closes(h) ==
  /\ holler[h].status = "live"
  /\ "close mid-post" \in Lands \/ ~InHand(h)
  /\ "close before they send again" \in Lands \/ ~MidAnswer(h)
  /\ holler' = [holler EXCEPT ![h].status = "closed"]
  /\ said' = <<"closeDueHollers or closeHoller closes", h>>
  /\ UNCHANGED <<viewer, recipient, keys, queue, slack, workers, left>>

ToClose == { h \in Hollers : holler[h].status = "closed" /\ ~holler[h].closeQueued }
\* The cron passes every closed Holler; the creator's Close names one.
CloseReads(w) ==
  \E todo \in {ToClose} \cup { {h} : h \in ToClose } :
    /\ Idle(w) /\ todo # {}
    /\ Start(w, "close", IF ClaimOneHoller THEN "claim" ELSE "claim all", todo)
    /\ said' = <<"queueCloseWork in", w, "reads", Cardinality(todo), "closed and not queued">>
    /\ UNCHANGED <<viewer, d1, queue, slack, sender, hand, person, left>>

\* How it was in #10 before its review: every candidate claimed in one update.
CloseClaimsAll(w) ==
  /\ run[w].pass = "close" /\ run[w].pc = "claim all"
  /\ LET won == { h \in run[w].todo : ~holler[h].closeQueued } IN
     /\ holler' = [h \in Hollers |-> IF h \in won THEN [holler[h] EXCEPT !.closeQueued = TRUE] ELSE holler[h]]
     /\ run' = [run EXCEPT ![w] = IF won = {} THEN NoRun ELSE [@ EXCEPT !.pc = "next", !.todo = won]]
  /\ said' = <<"queueCloseWork in", w, "sets close_queued_at on every one of them">>
  /\ UNCHANGED <<viewer, recipient, keys, queue, slack, sender, hand, person, left>>
CloseNext(w, h) ==
  /\ run[w].pass = "close" /\ run[w].pc = "next" /\ h \in run[w].todo
  /\ run' = [run EXCEPT ![w].pc = "waiting", ![w].h = h]
  /\ said' = <<"queueCloseWork in", w, "takes", h>>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, hand, person, left>>

Rest(w, h) ==
  LET rest == run[w].todo \ {h} IN
  run' = [run EXCEPT ![w] = IF rest = {} THEN NoRun
    ELSE [NoRun EXCEPT !.pass = "close", !.pc = IF ClaimOneHoller THEN "claim" ELSE "next", !.todo = rest]]

CloseClaims(w, h) ==
  /\ run[w].pass = "close" /\ run[w].pc = "claim" /\ h \in run[w].todo
  /\ IF holler[h].closeQueued THEN Rest(w, h) /\ UNCHANGED holler
     ELSE /\ holler' = [holler EXCEPT ![h].closeQueued = TRUE]
          /\ run' = [run EXCEPT ![w].pc = "waiting", ![w].h = h]
  /\ said' = <<"queueCloseWork in", w, IF holler[h].closeQueued THEN "finds already claimed" ELSE "sets close_queued_at on", h>>
  /\ UNCHANGED <<viewer, recipient, keys, queue, slack, sender, hand, person, left>>

CloseWaiting(w) ==
  /\ run[w].pass = "close" /\ run[w].pc = "waiting"
  /\ run' = [run EXCEPT ![w].pc = "queue",
       ![w].extra = { Closed(r) : r \in { q \in R : q[1] = run[w].h /\ ~recipient[q].answered /\ recipient[q].dmTs > 0 } }]
  /\ said' = <<"queueCloseWork in", w, "reads who is waiting on", run[w].h>>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, hand, person, left>>

CloseQueues(w) ==
  /\ run[w].pass = "close" /\ run[w].pc = "queue"
  /\ LET h == run[w].h
         chunks == << run[w].extra, (IF holler[h].announceTs THEN {Announce(h)} ELSE {}) \cup {CloseNotice(h)} >>
     IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ IF ~Refused(chunks, o) THEN Rest(w, h)
       ELSE IF GivesClaimsBack THEN run' = [run EXCEPT ![w].pc = "release"] ELSE Stop(w)
    /\ said' = <<HowItWent(chunks, o), "the close work of", h>>
    /\ UNCHANGED <<viewer, d1, slack, sender, hand, person>>

CloseReleases(w) ==
  /\ run[w].pass = "close" /\ run[w].pc = "release"
  /\ holler' = [holler EXCEPT ![run[w].h].closeQueued = FALSE]
  /\ Stop(w)
  /\ said' = <<"queueCloseWork in", w, "clears close_queued_at on", run[w].h, "and throws, which ends the pass">>
  /\ UNCHANGED <<viewer, recipient, keys, queue, slack, sender, hand, person, left>>

(* --------------------------------- answering ------------------------------- *)
NoConsumerOn(r) == \A c \in Consumers : hand[c] = NoHand \/ hand[c].m.h # r[1]
AfterConflict == IF Door = "slack" THEN "queue again" ELSE IF AnswerRequeues THEN "queue" ELSE "done"

PersonReads(r) ==
  /\ Answering /\ dm[r].shows = "question"
  /\ \/ person[r] = "" /\ holler[r[1]].status = "live"
     \/ person[r] = "error"
  /\ person' = [person EXCEPT ![r] =
       IF holler[r[1]].status # "live" THEN "done"
       ELSE IF recipient[r].answered THEN AfterConflict ELSE "claim"]
  /\ said' = <<IF person[r] = "error" THEN "the person sends again;" ELSE "", "recordResponse reads", r[1], "for", r[2],
               IF holler[r[1]].status # "live" THEN "and finds it closed, so nothing is queued"
               ELSE IF recipient[r].answered THEN "and finds it answered: conflict" ELSE "and finds it live and unanswered">>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, run, hand, left>>

PersonClaims(r) ==
  /\ person[r] = "claim"
  /\ "answer mid-post" \in Lands \/ NoConsumerOn(r)
  /\ recipient' = [recipient EXCEPT ![r].answered = TRUE]
  /\ person' = [person EXCEPT ![r] = "keep"]
  /\ said' = <<"recordResponse sets answered_at for", r[2], "on", r[1]>>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, sender, run, hand, left>>

PersonKeeps(r) ==
  /\ person[r] = "keep"
  /\ recipient' = [recipient EXCEPT ![r].kept = TRUE]
  /\ person' = [person EXCEPT ![r] = "queue"]
  /\ said' = <<"recordResponse inserts the response and its answers for", r[2], "on", r[1]>>
  /\ UNCHANGED <<viewer, holler, keys, queue, slack, sender, run, hand, left>>

PersonQueues(r) ==
  /\ person[r] \in {"queue", "queue again"}
  /\ LET chunks == IF person[r] = "queue again" THEN << {Answered(r)} >> ELSE << {Answered(r), Announce(r[1])} >>
     IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ person' = [person EXCEPT ![r] = IF Refused(chunks, o) THEN "error" ELSE "done"]
    /\ said' = <<HowItWent(chunks, o), IF person[r] = "queue again" THEN "answered, and no announce, for"
                 ELSE "answered and announce for", r[2], "on", r[1]>>
    /\ UNCHANGED <<viewer, d1, slack, sender, run, hand>>

PersonLeaves(r) ==
  /\ PersonGivesUp /\ person[r] = "error"
  /\ person' = [person EXCEPT ![r] = "done"]
  /\ said' = <<r[2], "saw an error and does not send again">>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, run, hand, left>>

(* --------------------------------- sharing --------------------------------- *)
\* addViewers: one batch inserts the viewer with notified_at set and records its Activity.
\* A second add of the same person finds the row, inserts nothing and queues nothing.
ShareAdds(r) ==
  /\ Sharing /\ holler[r[1]].status \in {"live", "closed"}
  /\ ~viewer[r].row /\ ~viewer[r].gone /\ viewer[r].pc = ""
  /\ viewer' = [viewer EXCEPT ![r] = [@ EXCEPT !.row = TRUE, !.notified = TRUE, !.claims = @ + 1, !.pc = "queue"]]
  /\ said' = <<"addViewers inserts", r[2], "as a viewer of", r[1], "with notified_at set">>
  /\ UNCHANGED <<holler, recipient, keys, queue, slack, workers, left>>

ShareQueues(r) ==
  /\ viewer[r].pc = "queue"
  /\ LET chunks == << {Share(r, viewer[r].claims)} >> IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ viewer' = [viewer EXCEPT ![r].pc = IF Refused(chunks, o) /\ GivesClaimsBack THEN "release" ELSE "done"]
    /\ said' = <<HowItWent(chunks, o), "the shared-with-you DM of", r[2], "on", r[1]>>
    /\ UNCHANGED <<d1, slack, workers>>

\* releaseShares clears notified_at where it is still this claim.
ReleaseShare(r) == [viewer EXCEPT ![r].notified = IF viewer[r].row THEN FALSE ELSE @]

ShareReleases(r) ==
  /\ viewer[r].pc = "release"
  /\ viewer' = [ReleaseShare(r) EXCEPT ![r].pc = "done"]
  /\ said' = <<"addViewers's releaseShares clears notified_at for", r[2], "on", r[1]>>
  /\ UNCHANGED <<holler, recipient, keys, queue, slack, workers, left>>

\* removeViewer deletes the row. Someone removed is not added again here.
ShareRemoves(r) ==
  /\ Sharing /\ viewer[r].row
  /\ viewer' = [viewer EXCEPT ![r].row = FALSE, ![r].notified = FALSE, ![r].gone = TRUE]
  /\ said' = <<"removeViewer deletes", r[2], "from the viewers of", r[1]>>
  /\ UNCHANGED <<holler, recipient, keys, queue, slack, workers, left>>

\* queueShareNotices reads the viewers with no notified_at, then claims and queues them one by one.
DueShares == { r \in R : viewer[r].row /\ ~viewer[r].notified }
SharesRead(w) ==
  /\ Idle(w) /\ DueShares # {}
  /\ Start(w, "shares", "claim", DueShares)
  /\ said' = <<"queueShareNotices in", w, "reads", Cardinality(DueShares), "viewers with no notified_at">>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, hand, person, left>>

NextShare(w, r) ==
  LET rest == run[w].todo \ {r} IN
  run' = [run EXCEPT ![w] = IF rest = {} THEN NoRun ELSE [NoRun EXCEPT !.pass = "shares", !.pc = "claim", !.todo = rest]]

SharesClaim(w, r) ==
  /\ run[w].pass = "shares" /\ run[w].pc = "claim" /\ r \in run[w].todo
  /\ IF viewer[r].row /\ ~viewer[r].notified
     THEN /\ viewer' = [viewer EXCEPT ![r].notified = TRUE, ![r].claims = @ + 1]
          /\ run' = [run EXCEPT ![w].pc = "queue", ![w].h = r[1], ![w].extra = {Share(r, viewer[r].claims + 1)}]
     ELSE NextShare(w, r) /\ UNCHANGED viewer
  /\ said' = <<"queueShareNotices in", w, IF viewer[r].row /\ ~viewer[r].notified THEN "sets notified_at for"
               ELSE "finds already claimed", r[2], "on", r[1]>>
  /\ UNCHANGED <<d1, queue, slack, sender, hand, person, left>>

SharesQueue(w) ==
  /\ run[w].pass = "shares" /\ run[w].pc = "queue"
  /\ LET chunks == << run[w].extra >>
         m == CHOOSE s \in run[w].extra : TRUE
     IN \E o \in Outcomes(chunks) :
    /\ Possible(chunks, o)
    /\ Enqueue(chunks, o)
    /\ IF ~Refused(chunks, o) THEN NextShare(w, <<m.h, m.u>>)
       ELSE IF GivesClaimsBack THEN run' = [run EXCEPT ![w].pc = "release"] ELSE Stop(w)
    /\ said' = <<HowItWent(chunks, o), "the shared-with-you DM of", m.u, "on", m.h, "in", w>>
    /\ UNCHANGED <<viewer, d1, slack, sender, hand, person>>

SharesRelease(w) ==
  /\ run[w].pass = "shares" /\ run[w].pc = "release"
  /\ LET m == CHOOSE s \in run[w].extra : TRUE IN viewer' = ReleaseShare(<<m.h, m.u>>)
  /\ Stop(w)
  /\ said' = <<"queueShareNotices in", w, "clears notified_at and throws, which ends the pass">>
  /\ UNCHANGED <<d1, queue, slack, sender, hand, person, left>>

(* ------------------------------- the consumer ------------------------------ *)
Who(m) == IF m.u = "" THEN m.h ELSE m.u
Plan(m) ==
  LET h == holler[m.h]
      q == IF m.u = "" THEN recipient[CHOOSE r \in R : TRUE] ELSE recipient[<<m.h, m.u>>]
      waiting == q.row /\ q.invited /\ h.status = "live" /\ (ReadsAgain => ~q.answered)
  IN CASE m.kind = "invite" -> IF waiting /\ q.dmTs = 0 THEN "post" ELSE "skip"
       [] m.kind = "reminder" -> IF waiting THEN "post" ELSE "skip"
       [] m.kind = "answered" -> IF q.row /\ q.answered THEN "edit" ELSE "skip"
       [] m.kind = "closed" -> IF q.row /\ ~q.answered THEN "edit" ELSE "skip"
       [] m.kind = "announce" -> IF ~Announced THEN "skip" ELSE IF h.announceTs THEN "edit" ELSE "post"
       [] m.kind = "shared" -> IF viewer[<<m.h, m.u>>].row THEN "post" ELSE "skip"
       [] OTHER -> "post"
CountOf(h) == Cardinality({ u \in People : recipient[<<h, u>>].answered })

\* loadSlackHoller and recipientFor read what the rest of `deliver` goes by.
Delivers(c, m) ==
  \E again \in BOOLEAN :
    /\ hand[c] = NoHand /\ m \in queue
    /\ again => left.duplicates > 0
    /\ queue' = IF again THEN queue ELSE queue \ {m}
    /\ left' = [left EXCEPT !.duplicates = IF again THEN @ - 1 ELSE @]
    /\ hand' = [hand EXCEPT ![c] =
         IF Plan(m) = "skip" THEN NoHand
         ELSE [pc |-> IF Plan(m) = "edit" THEN "edit" ELSE IF m.kind \in PostKeys THEN "key" ELSE "post", m |-> m,
               q |-> IF m.u = "" THEN recipient[CHOOSE r \in R : TRUE] ELSE recipient[<<m.h, m.u>>],
               count |-> CountOf(m.h), post |-> 0]]
    /\ said' = <<c, "takes", m.kind, "for", Who(m), IF again THEN "(it will be delivered again)" ELSE "",
                 "and deliver", IF Plan(m) = "skip" THEN "does nothing" ELSE "reads it as due">>
    /\ UNCHANGED <<viewer, d1, slack, sender, run, person>>

PostKeyClaims(c) ==
  /\ hand[c].pc = "key"
  /\ LET m == hand[c].m IN
     IF Key(m) \in keys
     THEN /\ hand' = [hand EXCEPT ![c] = NoHand] /\ UNCHANGED keys
          /\ said' = <<c, "finds the post key of", m.kind, "for", Who(m), "taken, and acks">>
     ELSE /\ keys' = keys \cup {Key(m)} /\ hand' = [hand EXCEPT ![c].pc = "post"]
          /\ said' = <<c, "claims the post key of", m.kind, "for", Who(m)>>
  /\ UNCHANGED <<viewer, holler, recipient, queue, slack, sender, run, person, left>>

\* The queue's retry, or the end of max_retries.
Retry(m) == \/ queue' = queue \cup {m}
            \/ QueueGivesUp /\ queue' = queue

Posted(c, m) ==
  /\ posts' = [posts EXCEPT ![Identity(m)] = @ + 1]
  /\ dm' = IF m.u = "" \/ m.kind = "shared" THEN dm ELSE [dm EXCEPT ![<<m.h, m.u>>] = [n |-> @.n + 1, shows |-> "question"]]
  /\ counted' = IF m.kind = "announce" THEN [counted EXCEPT ![m.h] = hand[c].count] ELSE counted
  /\ late' = (late \/ (m.kind = "reminder" /\ recipient[<<m.h, m.u>>].answered))

Posts(c) ==
  /\ hand[c].pc = "post"
  /\ LET m == hand[c].m IN
     /\ Posted(c, m)
     /\ hand' = [hand EXCEPT ![c] = IF m.kind \in {"close_notice", "shared"} THEN NoHand
          ELSE [@ EXCEPT !.pc = "store", !.post = IF m.u = "" THEN 0 ELSE dm[<<m.h, m.u>>].n + 1]]
     /\ said' = <<c, "posts", m.kind, "for", Who(m)>>
  /\ UNCHANGED <<viewer, d1, queue, sender, run, person, left>>

PostThrows(c) ==
  \E landed \in BOOLEAN :
    /\ hand[c].pc = "post" /\ left.failures > 0
    /\ landed => SlackLosesReply
    /\ LET m == hand[c].m IN
       /\ IF landed THEN Posted(c, m) ELSE UNCHANGED slack
       /\ IF m.kind \in PostKeys THEN hand' = [hand EXCEPT ![c].pc = "free"] /\ UNCHANGED queue
          ELSE hand' = [hand EXCEPT ![c] = NoHand] /\ Retry(m)
       /\ said' = <<"Slack", IF landed THEN "posts" ELSE "fails", m.kind, "for", Who(m),
                    IF landed THEN "but the call throws in" ELSE "in", c>>
    /\ left' = [left EXCEPT !.failures = @ - 1]
    /\ UNCHANGED <<viewer, d1, sender, run, person>>

PostKeyReleases(c) ==
  /\ hand[c].pc = "free"
  /\ LET m == hand[c].m IN
     /\ keys' = keys \ {Key(m)}
     /\ hand' = [hand EXCEPT ![c] = NoHand]
     /\ Retry(m)
     /\ said' = <<c, "gives back the post key of", m.kind, "for", Who(m),
                  IF m \in queue' THEN "and retries" ELSE "but it was the last retry, so the queue drops it">>
  /\ UNCHANGED <<viewer, holler, recipient, slack, sender, run, person, left>>

Stores(c) ==
  /\ hand[c].pc = "store"
  /\ LET m == hand[c].m IN
     /\ IF m.kind = "announce"
        THEN holler' = [holler EXCEPT ![m.h].announceTs = TRUE] /\ UNCHANGED recipient
        ELSE recipient' = [recipient EXCEPT ![<<m.h, m.u>>].dmTs = hand[c].post,
                                            ![<<m.h, m.u>>].due = hand[c].q.sent < Tiers] /\ UNCHANGED holler
     /\ said' = <<c, "stores", IF m.kind = "announce" THEN "announce_ts" ELSE "dm_ts and next_reminder_at", "for", Who(m)>>
  /\ hand' = [hand EXCEPT ![c] = NoHand]
  /\ UNCHANGED <<viewer, keys, queue, slack, sender, run, person, left>>

Edits(c) ==
  /\ hand[c].pc = "edit"
  /\ LET m == hand[c].m
         shows == IF m.kind = "answered" THEN "thanks" ELSE "closed"
     IN /\ IF m.kind = "announce" THEN counted' = [counted EXCEPT ![m.h] = hand[c].count] /\ UNCHANGED dm
           ELSE /\ UNCHANGED counted
                /\ dm' = IF \/ hand[c].q.dmTs > 0 /\ hand[c].q.dmTs = dm[<<m.h, m.u>>].n
                            \/ m.kind = "answered" /\ Door = "slack"  \* `also`, the DM they tapped
                         THEN [dm EXCEPT ![<<m.h, m.u>>].shows = shows] ELSE dm
        /\ said' = <<c, "edits", m.kind, "into Slack for", Who(m)>>
  /\ hand' = [hand EXCEPT ![c] = NoHand]
  /\ UNCHANGED <<viewer, d1, queue, posts, late, sender, run, person, left>>

EditThrows(c) ==
  /\ hand[c].pc = "edit" /\ left.failures > 0
  /\ Retry(hand[c].m)
  /\ said' = <<"Slack fails", hand[c].m.kind, "for", Who(hand[c].m), "in", c,
               IF hand[c].m \in queue' THEN "and the queue retries" ELSE "and it was the last retry, so the queue drops it">>
  /\ hand' = [hand EXCEPT ![c] = NoHand]
  /\ left' = [left EXCEPT !.failures = @ - 1]
  /\ UNCHANGED <<viewer, d1, slack, sender, run, person>>

(* ------------------------- the Worker dies between two steps ---------------- *)
MayDie(f) == f \in CrashIn /\ left.crashes > 0
Dies == left' = [left EXCEPT !.crashes = @ - 1]
ShareDies(r) ==
  /\ MayDie("addViewers") /\ viewer[r].pc \in {"queue", "release"} /\ Dies
  /\ viewer' = [viewer EXCEPT ![r].pc = "done"]
  /\ said' = <<"the Worker dies in addViewers for", r[2], "on", r[1]>>
  /\ UNCHANGED <<d1, queue, slack, workers>>
GoLiveDies(h) ==
  /\ MayDie("goLive") /\ sender[h].pc \in {"insert", "queue", "release"} /\ Dies
  /\ sender' = [sender EXCEPT ![h] = [pc |-> "done", unqueued |-> {}]]
  /\ said' = <<"the Worker dies in goLive for", h>>
  /\ UNCHANGED <<viewer, d1, queue, slack, run, hand, person>>
RunDies(w) ==
  /\ \/ MayDie("queueDueInvites") /\ run[w].pass = "invites"
     \/ MayDie("queueDueReminders") /\ run[w].pass = "reminders"
     \/ MayDie("queueCloseWork") /\ run[w].pass = "close"
     \/ MayDie("queueShareNotices") /\ run[w].pass = "shares"
  /\ Dies /\ Stop(w)
  /\ said' = <<"the Worker dies in", IF run[w].pass = "invites" THEN "queueDueInvites"
               ELSE IF run[w].pass = "reminders" THEN "queueDueReminders"
               ELSE IF run[w].pass = "shares" THEN "queueShareNotices" ELSE "queueCloseWork", "in", w>>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, hand, person>>
PersonDies(r) ==
  /\ MayDie("recordResponse") /\ person[r] \in {"keep", "queue"} /\ Dies
  /\ person' = [person EXCEPT ![r] = "error"]
  /\ said' = <<"the Worker dies in recordResponse for", r[2], "on", r[1]>>
  /\ UNCHANGED <<viewer, d1, queue, slack, sender, run, hand>>
ConsumerDies(c) ==
  /\ \/ MayDie("postOnce") /\ hand[c].pc \in {"post", "free"}
     \/ MayDie("postToRecipient") /\ hand[c].pc = "store" /\ hand[c].m.kind # "announce"
     \/ MayDie("deliver") /\ hand[c].pc = "store" /\ hand[c].m.kind = "announce"
  /\ Dies
  /\ queue' = queue \cup {hand[c].m}
  /\ hand' = [hand EXCEPT ![c] = NoHand]
  /\ said' = <<"the Worker dies in", c, "before its ack, so the queue delivers", hand[c].m.kind, "again">>
  /\ UNCHANGED <<viewer, d1, slack, sender, run, person>>

Next ==
  \/ \E h \in Hollers : GoLiveClaims(h) \/ GoLiveInserts(h) \/ GoLiveQueues(h) \/ GoLiveReleases(h) \/ Closes(h) \/ GoLiveDies(h)
  \/ \E w \in Runs : InvitesClaim(w) \/ RemindersClaim(w) \/ PassQueues(w) \/ PassReleases(w) \/ AnnouncementsQueue(w)
                     \/ CloseReads(w) \/ CloseClaimsAll(w) \/ CloseWaiting(w) \/ CloseQueues(w) \/ CloseReleases(w) \/ RunDies(w)
  \/ \E w \in Runs, h \in Hollers : CloseClaims(w, h) \/ CloseNext(w, h)
  \/ \E w \in Runs : SharesRead(w) \/ SharesQueue(w) \/ SharesRelease(w)
  \/ \E w \in Runs, r \in R : SharesClaim(w, r)
  \/ \E r \in R : ShareAdds(r) \/ ShareQueues(r) \/ ShareReleases(r) \/ ShareRemoves(r) \/ ShareDies(r)
  \/ \E r \in R : PersonReads(r) \/ PersonClaims(r) \/ PersonKeeps(r) \/ PersonQueues(r) \/ PersonLeaves(r) \/ PersonDies(r)
  \/ \E c \in Consumers, m \in queue : Delivers(c, m)
  \/ \E c \in Consumers : PostKeyClaims(c) \/ Posts(c) \/ PostThrows(c) \/ PostKeyReleases(c) \/ Stores(c)
                          \/ Edits(c) \/ EditThrows(c) \/ ConsumerDies(c)

Spec == Init /\ [][Next]_<<state, said>>

(* --------------------------------- promises -------------------------------- *)
\* Nothing is queued or in progress, and no pass of the cron would find work.
Quiet ==
  /\ queue = {}
  /\ \A c \in Consumers : hand[c] = NoHand
  /\ \A w \in Runs : Idle(w)
  /\ \A h \in Hollers : sender[h].pc \in {"", "done"}
  /\ \A r \in R : person[r] \in {"", "done"} /\ viewer[r].pc \in {"", "done"}
  /\ DueInvites = {} /\ DueReminders = {} /\ ToClose = {} /\ MissingAnnouncements = {} /\ DueShares = {}
Sent(h) == holler[h].status \in {"live", "closed"}

NothingPostsTwice == \A i \in Identities : posts[i] <= 1

NoReminderAfterAnswer == ~late

ClosedIsToldOnce ==
  Quiet => \A h \in Hollers : holler[h].status = "closed" =>
    /\ posts[CloseNotice(h)] = 1
    /\ \A u \in People : dm[<<h, u>>].n > 0 /\ ~recipient[<<h, u>>].answered => dm[<<h, u>>].shows = "closed"

ClaimedWorkIsNeverLost ==
  Quiet => \A h \in Hollers : Sent(h) =>
    /\ Announced => posts[Announce(h)] = 1 /\ holler[h].announceTs
    /\ holler[h].status = "live" => \A u \in People :
         LET r == <<h, u>> IN
         /\ posts[Invite(r)] >= 1
         /\ ~recipient[r].answered => /\ recipient[r].dmTs = dm[r].n
                                      /\ \A t \in 1..Tiers : posts[Reminder(r, t, 0)] >= 1
    /\ \A u \in People : viewer[<<h, u>>].row => posts[Share(<<h, u>>, 0)] >= 1

KeptAnswersReachSlack ==
  Quiet => \A r \in R : recipient[r].answered =>
    /\ recipient[r].kept
    /\ dm[r].shows = "thanks"
    /\ Announced => counted[r[1]] = CountOf(r[1])
=============================================================================
