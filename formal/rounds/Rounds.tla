------------------------------- MODULE Rounds -------------------------------
(* A pulse that repeats: sendDueHollers, goLive, nextRound, stopRepeating   *)
(* and changeRepeat.                                                        *)
(* One action is one D1 statement or batch in apps/web/src/server/services.   *)
(* Each action says its step in `said`, in the code's words.                  *)
(* .agents/skills/verify-delivery-model/SKILL.md says how to read and change  *)
(* it, and what it leaves out.                                                *)
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS
  Last,             \* rounds 1..Last exist at most; round 1 is the first, its repeat_of_id is null
  Runs,             \* sends that overlap: cron runs, or a cron run and the creator's Send now

  \* What protects the code. FALSE brings a mistake back.
  UnlessStillRepeating,  \* stillRepeating in nextRound, in the batch that inserts the next round
  GoLiveGuard,           \* goLive marks live only a draft or scheduled Holler
  OneBatch,              \* stopRepeating deletes and clears the rule in one batch
  RuleAtBatch,           \* seriesRule in nextRound: the next round takes the series' rule when its batch runs
  ChangeChecks,          \* unchanged in changeRepeat: the round it read is still the scheduled one
  ChangeKeepsStop,       \* changeRepeat changes only rows that still have the rule it read

  \* How the world misbehaves. Off in the checks of the current design.
  CrashIn,          \* the functions in which the Worker may die, once
  D1Fails           \* batches in goLive that throw and commit nothing

Round == 1..Last
Later == 2..Last

VARIABLES
  hollers,   \* each round's row: status ("none" is no row) and whether repeat_rule is set
  send,      \* each overlapping send
  stop,      \* stopRepeating
  change,    \* changeRepeat, from the rule it read to the other one
  after,     \* a later round went live after stopRepeating returned
  left,      \* what is left of the world's misbehaviour
  said

state == <<hollers, send, stop, change, after, left>>
Idle == [pc |-> "", n |-> 0, next |-> "none"]
Other(rule) == IF rule = "week" THEN "fortnight" ELSE "week"

Init ==
  \* rule is the row's repeat_rule; at is the rule its send_at was worked out by
  /\ hollers = [n \in Round |-> IF n = 1 THEN [status |-> "scheduled", rule |-> "week", at |-> "week"]
                                         ELSE [status |-> "none", rule |-> "none", at |-> "week"]]
  /\ send = [g \in Runs |-> Idle]
  /\ stop = "" /\ after = FALSE
  /\ change = [pc |-> "", from |-> "none", to |-> "none", seen |-> 0]
  /\ left = [d1 |-> D1Fails, crashes |-> IF CrashIn = {} THEN 0 ELSE 1]
  /\ said = <<"round 1 is scheduled and repeats">>

(* ---------------------------- sendDueHollers, goLive ------------------------ *)
ReadsDue(g, n) ==
  /\ send[g] = Idle /\ hollers[n].status = "scheduled" /\ n < Last
  /\ send' = [send EXCEPT ![g] = [Idle EXCEPT !.pc = "next", !.n = n]]
  /\ said' = <<"sendDueHollers in", g, "reads that round", n, "is due">>
  /\ UNCHANGED <<hollers, stop, change, after, left>>

ReadsRule(g) ==
  /\ send[g].pc = "next"
  /\ LET row == hollers[send[g].n]
         repeats == row.status # "none" /\ row.rule # "none"
     IN /\ send' = [send EXCEPT ![g].pc = "claim", ![g].next = IF repeats THEN row.rule ELSE "none"]
        /\ said' = <<"nextRound in", g, "reads round", send[g].n, IF repeats THEN "and its repeat_rule" ELSE "with no repeat_rule">>
  /\ UNCHANGED <<hollers, stop, change, after, left>>

GoLiveClaims(g) ==
  /\ send[g].pc = "claim"
  /\ LET n == send[g].n
         wins == IF GoLiveGuard THEN hollers[n].status = "scheduled" ELSE hollers[n].status # "none"
     IN /\ hollers' = IF wins THEN [hollers EXCEPT ![n].status = "live"] ELSE hollers
        /\ after' = (after \/ (wins /\ n > 1 /\ stop = "returned"))
        /\ send' = [send EXCEPT ![g] = IF wins THEN [@ EXCEPT !.pc = "recipients"] ELSE Idle]
        /\ said' = <<"goLive in", g, IF wins THEN "marks live round" ELSE "gets conflict for round", n>>
  /\ UNCHANGED <<stop, change, left>>

InsertsRecipients(g) ==
  /\ send[g].pc = "recipients"
  /\ send' = [send EXCEPT ![g].pc = "batch"]
  /\ said' = <<"goLive in", g, "inserts the recipients of round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, change, after, left>>

\* The insert keeps hollers_round, the unique index on repeat_of_id and send_at.
InsertsNext(g) ==
  /\ send[g].pc = "batch"
  /\ LET n == send[g].n
         next == send[g].next # "none"
         clash == next /\ hollers[n + 1].status # "none"
         repeating == hollers[1].rule # "none"
         stays == next /\ (UnlessStillRepeating => repeating)
         rule == IF RuleAtBatch THEN hollers[1].rule ELSE send[g].next
         at == IF rule = "fortnight" THEN "fortnight" ELSE "week"
     IN /\ hollers' = IF ~clash /\ stays THEN [hollers EXCEPT ![n + 1] = [status |-> "scheduled", rule |-> rule, at |-> at]] ELSE hollers
        /\ send' = [send EXCEPT ![g] = IF clash THEN [@ EXCEPT !.pc = "undo"] ELSE Idle]
        /\ said' = <<"goLive's batch in", g,
             IF clash THEN "throws on hollers_round for round" ELSE IF stays THEN "schedules round"
             ELSE IF next THEN "inserts and deletes again, because it no longer repeats, round" ELSE "schedules nothing after round",
             IF next THEN n + 1 ELSE n,
             IF ~clash /\ stays THEN IF rule = "none" THEN "with no repeat_rule" ELSE "every" ELSE "",
             IF ~clash /\ stays /\ rule # "none" THEN rule ELSE "">>
  /\ UNCHANGED <<stop, change, after, left>>

BatchThrows(g) ==
  /\ send[g].pc \in {"recipients", "batch"} /\ left.d1 > 0
  /\ left' = [left EXCEPT !.d1 = @ - 1]
  /\ send' = [send EXCEPT ![g].pc = "undo"]
  /\ said' = <<"a D1 batch throws in goLive in", g, "for round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, change, after>>

Undoes(g) ==
  /\ send[g].pc = "undo"
  /\ LET n == send[g].n IN
     /\ hollers' = IF hollers[n].status = "none" THEN hollers ELSE [hollers EXCEPT ![n].status = "scheduled"]
     /\ said' = <<"goLive in", g, "undoes its send, which sets back to scheduled round", n>>
  /\ send' = [send EXCEPT ![g] = Idle]
  /\ UNCHANGED <<stop, change, after, left>>

GoLiveDies(g) ==
  /\ "goLive" \in CrashIn /\ left.crashes > 0 /\ send[g].pc \in {"recipients", "batch", "undo"}
  /\ left' = [left EXCEPT !.crashes = @ - 1]
  /\ send' = [send EXCEPT ![g] = Idle]
  /\ said' = <<"the Worker dies in goLive in", g, "for round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, change, after>>

(* -------------------------------- stopRepeating ----------------------------- *)
Removed(n) == n > 1 /\ hollers[n].status = "scheduled"
Deletes == [n \in Round |-> IF Removed(n) THEN [status |-> "none", rule |-> "none", at |-> "week"] ELSE hollers[n]]
Clears(rows) == [n \in Round |-> [rows[n] EXCEPT !.rule = "none"]]

StopReads ==
  /\ stop = ""
  /\ stop' = "batch"
  /\ said' = <<"stopRepeating reads the series">>
  /\ UNCHANGED <<hollers, send, change, after, left>>
StopBatch ==
  /\ stop = "batch"
  /\ IF OneBatch THEN hollers' = Clears(Deletes) /\ stop' = "returned"
                 ELSE hollers' = Deletes /\ stop' = "clear"
  /\ said' = <<"stopRepeating deletes every scheduled round after the first",
               IF OneBatch THEN "and clears every repeat_rule, in one batch, and returns" ELSE "">>
  /\ UNCHANGED <<send, change, after, left>>
StopClears ==
  /\ stop = "clear"
  /\ hollers' = Clears(hollers) /\ stop' = "returned"
  /\ said' = <<"stopRepeating clears every repeat_rule, and returns">>
  /\ UNCHANGED <<send, change, after, left>>

(* -------------------------------- changeRepeat ------------------------------ *)
Upcoming == { n \in Round : hollers[n].status = "scheduled" }

\* It reads the series and finds the scheduled round, if there is one. A pulse that stopped throws.
ChangeReads ==
  /\ change.pc = "" /\ hollers[1].rule # "none"
  /\ change' = [pc |-> "batch", from |-> hollers[1].rule, to |-> Other(hollers[1].rule),
                seen |-> IF Upcoming = {} THEN 0 ELSE CHOOSE n \in Upcoming : TRUE]
  /\ said' = <<"changeRepeat reads the series, repeating every", hollers[1].rule,
               IF Upcoming = {} THEN "with no round scheduled" ELSE "with round scheduled",
               IF Upcoming = {} THEN "" ELSE change'.seen>>
  /\ UNCHANGED <<hollers, send, stop, after, left>>

\* One batch: the rule on every row of the series, then the scheduled round's send_at.
ChangeBatch ==
  /\ change.pc = "batch"
  /\ LET c == change
         holds == IF c.seen = 0 THEN Upcoming = {} ELSE hollers[c.seen].status = "scheduled"
         matches(n) == /\ hollers[n].status # "none"
                       /\ ChangeKeepsStop => hollers[n].rule = c.from
                       /\ ChangeChecks => holds
         rows == [n \in Round |-> IF matches(n) THEN [hollers[n] EXCEPT !.rule = c.to] ELSE hollers[n]]
         moved == c.seen > 1 /\ rows[c.seen].status = "scheduled" /\ rows[c.seen].rule = c.to
         changed == \E n \in Round : matches(n)
     IN /\ hollers' = IF moved THEN [rows EXCEPT ![c.seen].at = c.to] ELSE rows
        /\ change' = [c EXCEPT !.pc = IF changed THEN "returned" ELSE "conflict"]
        /\ said' = <<"changeRepeat's batch",
             IF changed THEN "makes the series repeat every" ELSE "matches no row and throws conflict",
             IF changed THEN c.to ELSE "",
             IF moved THEN "and moves round" ELSE "", IF moved THEN c.seen ELSE "">>
  /\ UNCHANGED <<send, stop, after, left>>

Next ==
  \/ \E g \in Runs : ReadsRule(g) \/ GoLiveClaims(g) \/ InsertsRecipients(g) \/ InsertsNext(g) \/ BatchThrows(g)
                     \/ Undoes(g) \/ GoLiveDies(g)
  \/ \E g \in Runs, n \in Round : ReadsDue(g, n)
  \/ StopReads \/ StopBatch \/ StopClears
  \/ ChangeReads \/ ChangeBatch

Spec == Init /\ [][Next]_<<state, said>>

(* --------------------------------- promises -------------------------------- *)
Scheduled == { n \in Later : hollers[n].status = "scheduled" }
Live == { n \in Round : hollers[n].status = "live" }
Quiet == \A g \in Runs : send[g] = Idle
Repeats == hollers[1].rule # "none"

NothingGoesOutAfterStop == ~after

OneNextRound ==
  /\ Cardinality(Scheduled) <= 1
  /\ Quiet /\ stop = "" /\ Live # {} => Cardinality(Scheduled) = 1

NextRoundKeepsRule ==
  Quiet /\ change.pc # "batch" /\ Repeats =>
    \A n \in Scheduled : hollers[n].rule = hollers[1].rule /\ hollers[n].at = hollers[1].rule
=============================================================================
