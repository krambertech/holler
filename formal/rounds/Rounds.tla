------------------------------- MODULE Rounds -------------------------------
(* A pulse that repeats: sendDueHollers, goLive, nextRound and stopRepeating. *)
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

  \* How the world misbehaves. Off in the checks of the current design.
  CrashIn,          \* the functions in which the Worker may die, once
  D1Fails           \* batches in goLive that throw and commit nothing

Round == 1..Last
Later == 2..Last

VARIABLES
  hollers,   \* each round's row: status ("none" is no row) and whether repeat_rule is set
  send,      \* each overlapping send
  stop,      \* stopRepeating
  after,     \* a later round went live after stopRepeating returned
  left,      \* what is left of the world's misbehaviour
  said

state == <<hollers, send, stop, after, left>>
Idle == [pc |-> "", n |-> 0, next |-> FALSE]

Init ==
  /\ hollers = [n \in Round |-> IF n = 1 THEN [status |-> "scheduled", rule |-> TRUE]
                                         ELSE [status |-> "none", rule |-> FALSE]]
  /\ send = [g \in Runs |-> Idle]
  /\ stop = "" /\ after = FALSE
  /\ left = [d1 |-> D1Fails, crashes |-> IF CrashIn = {} THEN 0 ELSE 1]
  /\ said = <<"round 1 is scheduled and repeats">>

(* ---------------------------- sendDueHollers, goLive ------------------------ *)
ReadsDue(g, n) ==
  /\ send[g] = Idle /\ hollers[n].status = "scheduled" /\ n < Last
  /\ send' = [send EXCEPT ![g] = [Idle EXCEPT !.pc = "next", !.n = n]]
  /\ said' = <<"sendDueHollers in", g, "reads that round", n, "is due">>
  /\ UNCHANGED <<hollers, stop, after, left>>

ReadsRule(g) ==
  /\ send[g].pc = "next"
  /\ LET row == hollers[send[g].n]
         repeats == row.status # "none" /\ row.rule
     IN /\ send' = [send EXCEPT ![g].pc = "claim", ![g].next = repeats]
        /\ said' = <<"nextRound in", g, "reads round", send[g].n, IF repeats THEN "and its repeat_rule" ELSE "with no repeat_rule">>
  /\ UNCHANGED <<hollers, stop, after, left>>

GoLiveClaims(g) ==
  /\ send[g].pc = "claim"
  /\ LET n == send[g].n
         wins == IF GoLiveGuard THEN hollers[n].status = "scheduled" ELSE hollers[n].status # "none"
     IN /\ hollers' = IF wins THEN [hollers EXCEPT ![n].status = "live"] ELSE hollers
        /\ after' = (after \/ (wins /\ n > 1 /\ stop = "returned"))
        /\ send' = [send EXCEPT ![g] = IF wins THEN [@ EXCEPT !.pc = "recipients"] ELSE Idle]
        /\ said' = <<"goLive in", g, IF wins THEN "marks live round" ELSE "gets conflict for round", n>>
  /\ UNCHANGED <<stop, left>>

InsertsRecipients(g) ==
  /\ send[g].pc = "recipients"
  /\ send' = [send EXCEPT ![g].pc = "batch"]
  /\ said' = <<"goLive in", g, "inserts the recipients of round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, after, left>>

\* The insert keeps hollers_round, the unique index on repeat_of_id and send_at.
InsertsNext(g) ==
  /\ send[g].pc = "batch"
  /\ LET n == send[g].n
         clash == send[g].next /\ hollers[n + 1].status # "none"
         repeating == hollers[1].rule
         stays == send[g].next /\ (UnlessStillRepeating => repeating)
     IN /\ hollers' = IF ~clash /\ stays THEN [hollers EXCEPT ![n + 1] = [status |-> "scheduled", rule |-> TRUE]] ELSE hollers
        /\ send' = [send EXCEPT ![g] = IF clash THEN [@ EXCEPT !.pc = "undo"] ELSE Idle]
        /\ said' = <<"goLive's batch in", g,
             IF clash THEN "throws on hollers_round for round" ELSE IF stays THEN "schedules round"
             ELSE IF send[g].next THEN "inserts and deletes again, because it no longer repeats, round" ELSE "schedules nothing after round",
             IF send[g].next THEN n + 1 ELSE n>>
  /\ UNCHANGED <<stop, after, left>>

BatchThrows(g) ==
  /\ send[g].pc \in {"recipients", "batch"} /\ left.d1 > 0
  /\ left' = [left EXCEPT !.d1 = @ - 1]
  /\ send' = [send EXCEPT ![g].pc = "undo"]
  /\ said' = <<"a D1 batch throws in goLive in", g, "for round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, after>>

Undoes(g) ==
  /\ send[g].pc = "undo"
  /\ LET n == send[g].n IN
     /\ hollers' = IF hollers[n].status = "none" THEN hollers ELSE [hollers EXCEPT ![n].status = "scheduled"]
     /\ said' = <<"goLive in", g, "undoes its send, which sets back to scheduled round", n>>
  /\ send' = [send EXCEPT ![g] = Idle]
  /\ UNCHANGED <<stop, after, left>>

GoLiveDies(g) ==
  /\ "goLive" \in CrashIn /\ left.crashes > 0 /\ send[g].pc \in {"recipients", "batch", "undo"}
  /\ left' = [left EXCEPT !.crashes = @ - 1]
  /\ send' = [send EXCEPT ![g] = Idle]
  /\ said' = <<"the Worker dies in goLive in", g, "for round", send[g].n>>
  /\ UNCHANGED <<hollers, stop, after>>

(* -------------------------------- stopRepeating ----------------------------- *)
Removed(n) == n > 1 /\ hollers[n].status = "scheduled"
Deletes == [n \in Round |-> IF Removed(n) THEN [status |-> "none", rule |-> FALSE] ELSE hollers[n]]
Clears(rows) == [n \in Round |-> [rows[n] EXCEPT !.rule = FALSE]]

StopReads ==
  /\ stop = ""
  /\ stop' = "batch"
  /\ said' = <<"stopRepeating reads the series">>
  /\ UNCHANGED <<hollers, send, after, left>>
StopBatch ==
  /\ stop = "batch"
  /\ IF OneBatch THEN hollers' = Clears(Deletes) /\ stop' = "returned"
                 ELSE hollers' = Deletes /\ stop' = "clear"
  /\ said' = <<"stopRepeating deletes every scheduled round after the first",
               IF OneBatch THEN "and clears every repeat_rule, in one batch, and returns" ELSE "">>
  /\ UNCHANGED <<send, after, left>>
StopClears ==
  /\ stop = "clear"
  /\ hollers' = Clears(hollers) /\ stop' = "returned"
  /\ said' = <<"stopRepeating clears every repeat_rule, and returns">>
  /\ UNCHANGED <<send, after, left>>

Next ==
  \/ \E g \in Runs : ReadsRule(g) \/ GoLiveClaims(g) \/ InsertsRecipients(g) \/ InsertsNext(g) \/ BatchThrows(g)
                     \/ Undoes(g) \/ GoLiveDies(g)
  \/ \E g \in Runs, n \in Round : ReadsDue(g, n)
  \/ StopReads \/ StopBatch \/ StopClears

Spec == Init /\ [][Next]_<<state, said>>

(* --------------------------------- promises -------------------------------- *)
Scheduled == { n \in Later : hollers[n].status = "scheduled" }
Live == { n \in Round : hollers[n].status = "live" }
Quiet == \A g \in Runs : send[g] = Idle

NothingGoesOutAfterStop == ~after

OneNextRound ==
  /\ Cardinality(Scheduled) <= 1
  /\ Quiet /\ stop = "" /\ Live # {} => Cardinality(Scheduled) = 1
=============================================================================
