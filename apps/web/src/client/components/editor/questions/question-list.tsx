import { type Mode, questionLimits, templateFor } from "@holler/core";
import { EASE_OUT, INSTANT } from "@holler/design";
import { GripVertical, Plus } from "lucide-react";
import { cancelFrame, frame, motion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import {
  duplicateQuestion,
  type EditorQuestion,
  filled,
  inOrder,
  moveQuestion,
  problemsByKey,
  questionFromTemplate,
} from "./model";
import { ProblemLine } from "./parts";
import { QuestionCard } from "./question-card";
import { AddQuestion, kindLabel, QuestionTypeMenu, TypeIcon } from "./question-types";

interface Props {
  mode: Mode;
  /** Each a `QuestionInput` with a key that stays the same while it is edited and moved. */
  questions: EditorQuestion[];
  onChange: (next: EditorQuestion[]) => void;
  /** Send problems by field path, such as "questions.1.prompt" or "questions.0.options.2". */
  problems?: Record<string, string> | undefined;
  /** Opens the templates dialog. */
  onTemplates: () => void;
  /** Shown when a pulse is full: turns it into a survey, which takes more questions. */
  onMakeSurvey: () => void;
}

/** The list item of the question with this key. */
const rowIn = (list: HTMLElement | null, key: string) =>
  list?.querySelector<HTMLElement>(`[data-question="${CSS.escape(key)}"]`) ?? null;

type Lift = { key: string; by: "pointer" | "keyboard"; from: string[] };

/** How long the cards take to fold to one line, and to open again after the drop. */
const FOLD_MS = 240;
const FOLD = { duration: FOLD_MS / 1000, ease: EASE_OUT };

/** A folded question's height: the 48 px row. */
const ROW = 48;

/**
 * Where a row sits on screen by its layout alone, leaving out the transforms a drag or a reorder
 * puts on it, so holding it still never fights those animations.
 */
function layoutTop(el: HTMLElement) {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y - window.scrollY;
}

/** Asks for focus on the control under the last card: Add question, or Make it a survey. */
const END = "end";

const count = new Intl.NumberFormat();

/** Matches a problem path against what an edit fixed: "options*" fixes "options" and "options.2". */
const fixedBy = (paths: string[]) => (path: string) =>
  paths.some((p) => (p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : p === path));

/**
 * The Compose stage's questions: every card open, one under the other, with a way to add the next.
 * Cards move by dragging their grip, or from the keyboard: focus the grip, Space or Enter to pick
 * it up, the arrows to move it, Space or Enter to put it down, Escape to put it back.
 */
function QuestionList({ mode, questions, onChange, problems, onTemplates, onMakeSurvey }: Props) {
  const reduce = useReduceMotion();
  const instructions = useId();
  const limits = questionLimits[mode];
  const full = questions.length >= limits.max;

  const [order, setOrder] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (focus?.key === END) end.current?.querySelector<HTMLElement>("button")?.focus();
  }, [focus]);

  // While a question moves every other card folds to one line, so it travels a short way. The fold
  // is animated, and while it runs the page scrolls under the moving question's place so that place
  // stays where it was. After the drop the cards open the same way, with the dropped one held still.
  // How many cards are folding or opening right now: the place is held until that is none, in
  // motion's own frame, after it has drawn the new heights and before the browser paints.
  const moving = useRef(0);
  const held = useRef<{ key: string; top: number; frames: number; seen: boolean } | null>(null);
  const hold = (key: string) => {
    const row = rowIn(list.current, key);
    if (!row) return;
    const running = held.current !== null;
    held.current = { key, top: layoutTop(row), frames: 0, seen: false };
    if (running) return;
    const step = () => {
      const pin = held.current;
      if (!pin) return cancelFrame(step);
      const el = rowIn(list.current, pin.key);
      if (el) {
        const drift = layoutTop(el) - pin.top;
        if (Math.abs(drift) >= 0.5) window.scrollBy({ top: drift, behavior: "instant" });
      }
      pin.frames += 1;
      if (moving.current > 0) pin.seen = true;
      // Done once the cards have moved and stopped, or if they never started within a few frames.
      const done = moving.current === 0 && (pin.seen || pin.frames > 6);
      if (done || pin.frames > 240) {
        held.current = null;
        cancelFrame(step);
      }
    };
    frame.postRender(step, true);
  };
  // With reduced motion the cards fold in one frame, so the place is put back before that frame paints.
  const [holdNow, setHoldNow] = useState<{ key: string; top: number } | null>(null);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs after every render, and sets state only while a place is held
  useLayoutEffect(() => {
    if (!holdNow) return;
    const row = rowIn(list.current, holdNow.key);
    if (row) window.scrollBy({ top: layoutTop(row) - holdNow.top, behavior: "instant" });
    setHoldNow(null);
  });
  const keepStill = (key: string) => {
    const row = rowIn(list.current, key);
    if (!row) return;
    if (reduce) setHoldNow({ key, top: layoutTop(row) });
    else hold(key);
  };

  // A pointer drag carries a floating copy of the whole card, drawn by the list and moved straight
  // from the pointer each frame, so nothing the page does can pull it away from the hand. Its place
  // in the list is an empty slot that the other rows make room for.
  const shell = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const [carried, setCarried] = useState<{
    key: string;
    left: number;
    width: number;
    top: number;
  } | null>(null);
  const drag = useRef<{
    key: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    /** From the pointer to the card's top edge. */
    grabY: number;
    /** The gap between rows, read once when the drag starts. */
    gap: number;
    started: boolean;
    /** Let go while the cards were still folding. */
    released: boolean;
    stop: (commit?: boolean) => void;
  } | null>(null);
  useEffect(() => () => drag.current?.stop(), []);

  /** Puts the copy under the pointer, from the pointer event itself and again after any scroll. */
  const follow = () => {
    const d = drag.current;
    const box = shell.current;
    if (!d?.started || !box || !ghost.current) return;
    ghost.current.style.transform = `translateY(${d.y - d.grabY - box.getBoundingClientRect().top}px)`;
  };

  // Each frame of a drag: the copy follows the pointer, the page scrolls near the window's edges,
  // and the slot moves to where the copy's top row would land.
  const carry = () => {
    const d = drag.current;
    const box = shell.current;
    if (!d?.started || !box) return cancelFrame(carry);
    if (held.current === null) {
      const edge = 72;
      const push =
        d.y < edge
          ? -(edge - d.y) / 4
          : d.y > window.innerHeight - edge
            ? (d.y - window.innerHeight + edge) / 4
            : 0;
      if (push !== 0) window.scrollBy({ top: Math.round(push), behavior: "instant" });
    }
    follow();
    place();
    // Let go while the cards were still folding: it lands once they have.
    if (d.released && held.current === null) d.stop(true);
  };

  /**
   * Moves the slot to where the copy's top row would land, judged by the rows' layout, not their
   * slide. Not while the cards are still folding: the page is holding the slot still then.
   */
  const place = () => {
    const d = drag.current;
    const ol = list.current;
    if (!d?.started || !ol || held.current !== null) return;
    const current = orderRef.current;
    if (!current) return;
    // The slot is as tall as the card in hand. Try it in every gap between the other rows and keep
    // the gap where its top would sit nearest the card's top, so the slot lines up under the card.
    const want = d.y - d.grabY;
    const gap = d.gap;
    const others = current.filter((k) => k !== d.key);
    let top = layoutTop(ol);
    let at = 0;
    let nearest = Number.POSITIVE_INFINITY;
    others.forEach((k, i) => {
      if (Math.abs(top - want) < nearest) {
        nearest = Math.abs(top - want);
        at = i;
      }
      top += (rowIn(ol, k)?.offsetHeight ?? ROW) + gap;
    });
    if (Math.abs(top - want) < nearest) at = others.length;
    const index = current.indexOf(d.key);
    if (at !== index) reorder(moveQuestion(current, index, at));
  };

  const grabWithPointer = (event: PointerEvent, key: string) => {
    if (questions.length < 2 || lift || drag.current) return;
    const move = (e: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;
      // A press that does not move is a click on the grip, and folds nothing.
      if (!d.started && Math.hypot(d.x - d.startX, d.y - d.startY) > 4) begin();
      else follow();
    };
    const up = () => {
      const d = drag.current;
      if (!d?.started) return stop();
      d.released = true;
      if (held.current === null) stop(true);
    };
    const cancel = () => stop(false);
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    /** Ends the drag; with `commit` given it also drops, true where the slot is, false back home. */
    const stop = (commit?: boolean) => {
      const d = drag.current;
      if (commit === true) place();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onEscape);
      cancelFrame(carry);
      drag.current = null;
      if (commit !== undefined && d?.started) drop(d.key, commit);
    };
    drag.current = {
      key,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      grabY: 0,
      gap: 0,
      started: false,
      released: false,
      stop,
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onEscape);
  };

  const begin = () => {
    const d = drag.current;
    const row = d && rowIn(list.current, d.key);
    const box = shell.current;
    if (!d || !row || !box) return;
    const card = row.getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    d.started = true;
    d.grabY = d.startY - card.top;
    d.gap = Number.parseFloat(getComputedStyle(list.current ?? row).rowGap) || 0;
    setCarried({
      key: d.key,
      left: card.left - outer.left,
      width: card.width,
      top: card.top - outer.top,
    });
    pickUp(d.key, "pointer");
    frame.postRender(carry, true);
  };

  /** Lets go: the copy settles onto its slot, then the cards open around it. */
  const drop = (key: string, commit: boolean) => {
    const end = () => {
      setCarried(null);
      finish(commit);
    };
    if (reduce || !commit) return end();
    // A frame later the slot has taken its last place; measured by layout, not mid-slide.
    frame.postRender(() => {
      const copy = ghost.current;
      const row = rowIn(list.current, key);
      const box = shell.current;
      if (!copy || !row || !box) return end();
      const from = copy.style.transform;
      const to = `translateY(${layoutTop(row) - box.getBoundingClientRect().top}px)`;
      copy.style.transform = to;
      copy
        .animate([{ transform: from }, { transform: to }], {
          duration: 160,
          easing: `cubic-bezier(${EASE_OUT.join(", ")})`,
        })
        .finished.then(end, end);
    });
  };

  // A keyboard move keeps the question in view.
  useEffect(() => {
    if (lift?.by !== "keyboard" || !order) return;
    rowIn(list.current, lift.key)?.scrollIntoView({ block: "nearest" });
  }, [order, lift]);

  // The latest questions, for an Undo that runs after more edits.
  const latest = useRef({ questions, onChange });
  latest.current = { questions, onChange };

  // Problems are pinned to their questions' keys as they arrive, and clear as they are fixed.
  const source = JSON.stringify(problems ?? {});
  const [pinned, setPinned] = useState(() => ({ source, ...problemsByKey(problems, questions) }));
  if (pinned.source !== source) setPinned({ source, ...problemsByKey(problems, questions) });

  const keys = order ?? questions.map((q) => q.key);
  const byKey = new Map(questions.map((q) => [q.key, q]));

  const reorder = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  };

  // A pointer drop runs from the listeners set when the grip was pressed, so it reads the latest state.
  const liftRef = useRef(lift);
  liftRef.current = lift;

  const finish = (commit: boolean) => {
    const final = orderRef.current;
    const lifted = liftRef.current;
    const { questions, onChange } = latest.current;
    orderRef.current = null;
    setOrder(null);
    setLift(null);
    if (!lifted || !final) return;
    keepStill(lifted.key);
    const at = final.indexOf(lifted.key) + 1;
    const total = final.length;
    if (!commit) {
      const back = lifted.from.indexOf(lifted.key) + 1;
      setAnnouncement(`Put back. The question is in position ${back} of ${total}.`);
      return;
    }
    if (final.join() !== questions.map((q) => q.key).join()) onChange(inOrder(questions, final));
    setAnnouncement(`Dropped. The question is now in position ${at} of ${total}.`);
  };

  const pickUp = (key: string, by: Lift["by"]) => {
    if (lift) return;
    const from = questions.map((q) => q.key);
    keepStill(key);
    liftRef.current = { key, by, from };
    setLift({ key, by, from });
    reorder(from);
    if (by === "keyboard") {
      const at = from.indexOf(key) + 1;
      setAnnouncement(
        `Picked up question ${at} of ${from.length}. Use the up and down arrow keys to move it, Space or Enter to drop it, or Escape to cancel.`,
      );
    }
  };

  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!lift) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (questions.length > 1) pickUp(key, "keyboard");
      }
      return;
    }
    if (lift.key !== key || lift.by !== "keyboard") return;
    const current = orderRef.current ?? keys;
    const index = current.indexOf(key);
    const target =
      event.key === "ArrowUp"
        ? index - 1
        : event.key === "ArrowDown"
          ? index + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? current.length - 1
              : null;
    if (target !== null) {
      event.preventDefault();
      if (target < 0 || target >= current.length || target === index) return;
      reorder(moveQuestion(current, index, target));
      setAnnouncement(`Moved to position ${target + 1} of ${current.length}.`);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  };

  const add = (id: string) => {
    const question = questionFromTemplate(id);
    onChange([...questions, question]);
    setFocus({ key: question.key, n: Date.now() });
  };

  const duplicate = (index: number) => {
    const original = questions[index];
    if (!original || full) return;
    const copy = duplicateQuestion(original);
    onChange([...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)]);
    setFocus({ key: copy.key, n: Date.now() });
  };

  const remove = (index: number) => {
    const removed = questions[index];
    if (!removed) return;
    const next = questions.filter((_, i) => i !== index);
    onChange(next);
    // Focus goes to what took the card's place, so the page never jumps back up to the card above.
    setFocus({ key: next[index]?.key ?? END, n: Date.now() });
    toast.add({
      title: "Question deleted",
      description: removed.prompt?.trim() || undefined,
      actionProps: {
        children: "Undo",
        onClick: () => {
          const { questions: now, onChange: change } = latest.current;
          if (now.some((q) => q.key === removed.key)) return;
          change([...now.slice(0, index), removed, ...now.slice(index)]);
        },
      },
    });
  };

  // One set of handlers per question that never changes, so typing in one card re-renders only
  // that card: each handler calls the latest render's action when it runs.
  const actions = useRef({
    change: (_key: string, _next: EditorQuestion) => {},
    duplicate: (_key: string) => {},
    remove: (_key: string) => {},
    fixed: (_key: string, _paths: string[]) => {},
  });
  const handlers = useRef(new Map<string, CardHandlers>());
  const handlersFor = (key: string) => {
    let found = handlers.current.get(key);
    if (!found) {
      found = {
        onChange: (next) => actions.current.change(key, next),
        onDuplicate: () => actions.current.duplicate(key),
        onDelete: () => actions.current.remove(key),
        onFixed: (paths) => actions.current.fixed(key, paths),
      };
      handlers.current.set(key, found);
    }
    return found;
  };

  const fixed = (key: string, paths: string[]) => {
    const card = pinned.byKey.get(key);
    if (!card) return;
    const isFixed = fixedBy(paths);
    const left = Object.fromEntries(Object.entries(card).filter(([path]) => !isFixed(path)));
    if (Object.keys(left).length === Object.keys(card).length) return;
    const byKey = new Map(pinned.byKey);
    byKey.set(key, left);
    setPinned({ ...pinned, byKey });
  };

  actions.current = {
    change: (key, next) => onChange(questions.map((q) => (q.key === key ? next : q))),
    duplicate: (key) => duplicate(questions.findIndex((q) => q.key === key)),
    remove: (key) => remove(questions.findIndex((q) => q.key === key)),
    fixed,
  };

  if (mode === "chase") return null;

  if (questions.length === 0) {
    return (
      <FirstQuestion
        onPick={add}
        onTemplates={onTemplates}
        problem={pinned.list}
        focusOnMount={focus?.key === END}
      />
    );
  }

  return (
    <div ref={shell} data-slot="question-list" className="relative flex flex-col gap-2.5">
      <p id={instructions} className="sr-only">
        To move a question, press Space or Enter on its handle, use the up and down arrow keys, then
        press Space or Enter to drop it, or Escape to cancel.
      </p>
      <ol ref={list} aria-label="Questions" className="flex flex-col gap-2.5">
        {keys.map((key, index) => {
          const question = byKey.get(key);
          if (!question) return null;
          const lifted = lift?.key === key;
          const grip = (
            <ReorderGrip
              number={index + 1}
              describedBy={instructions}
              lifted={lifted}
              folded={lift !== null}
              disabled={questions.length < 2}
              onPointerDown={(event) => grabWithPointer(event, key)}
              onKeyDown={(event) => onGripKey(event, key)}
              onBlur={() => {
                if (lift?.key === key && lift.by === "keyboard") finish(false);
              }}
            />
          );
          return (
            <QuestionItem key={key} value={key} index={index} reduce={reduce}>
              {/* The card in hand carries its own grip; its slot shows none. */}
              {carried?.key === key ? null : grip}
              <FoldFrame
                folded={lift !== null && carried?.key !== key}
                vacant={carried?.key === key}
                reduce={reduce}
                onMove={(started) => {
                  moving.current = Math.max(0, moving.current + (started ? 1 : -1));
                }}
                folding={
                  <FoldedQuestion
                    question={question}
                    number={index + 1}
                    shape={lifted ? "lifted" : "rest"}
                  />
                }
              >
                <QuestionCard
                  question={question}
                  number={index + 1}
                  onChange={handlersFor(key).onChange}
                  onDuplicate={full ? undefined : handlersFor(key).onDuplicate}
                  onDelete={handlersFor(key).onDelete}
                  problems={pinned.byKey.get(key)}
                  onFixed={handlersFor(key).onFixed}
                  lifted={false}
                  focusPrompt={focus?.key === key ? focus.n : undefined}
                />
              </FoldFrame>
            </QuestionItem>
          );
        })}
      </ol>
      {carried &&
        (() => {
          const question = byKey.get(carried.key);
          if (!question) return null;
          return (
            <div
              ref={ghost}
              data-slot="carried-question"
              aria-hidden
              inert
              className="group/card pointer-events-none absolute top-0 z-(--z-dropdown) will-change-transform"
              style={{
                left: carried.left,
                width: carried.width,
                transform: `translateY(${carried.top}px)`,
              }}
            >
              <ReorderGrip
                number={keys.indexOf(carried.key) + 1}
                describedBy=""
                lifted
                folded={false}
                disabled={false}
                onPointerDown={() => {}}
                onKeyDown={() => {}}
                onBlur={() => {}}
              />
              <QuestionCard
                question={question}
                number={keys.indexOf(carried.key) + 1}
                onChange={() => {}}
                onDelete={() => {}}
                problems={pinned.byKey.get(carried.key)}
                lifted
                // An outline, not a ring, so the floating shadow stays under it.
                className="outline-2 outline-primary"
              />
            </div>
          );
        })()}
      <div ref={end} className="contents">
        {full ? (
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-plate border border-edge-3 border-dashed py-2 ps-4 pe-2 text-ink-2">
            {mode === "pulse" ? (
              <>
                <span>A pulse has one or two questions.</span>
                <Button size="sm" onClick={onMakeSurvey}>
                  Make it a survey
                </Button>
              </>
            ) : (
              <span>A survey has at most {count.format(limits.max)} questions.</span>
            )}
          </div>
        ) : (
          <AddQuestion onPick={add} />
        )}
      </div>
      {pinned.list && <ProblemLine>{pinned.list}</ProblemLine>}
      <div aria-live="assertive" aria-atomic className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

type CardHandlers = {
  onChange: (next: EditorQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFixed: (paths: string[]) => void;
};

interface ItemProps {
  value: string;
  /** Its place in the list: the item measures its layout only when this changes. */
  index: number;
  reduce: boolean;
  children: ReactNode;
}

/** One place in the list. It slides to its new place when the order changes. */
function QuestionItem({ value, index, reduce, children }: ItemProps) {
  return (
    <motion.li
      data-question={value}
      layout="position"
      // Measured on a move, not on every keystroke in any card.
      layoutDependency={index}
      transition={reduce ? INSTANT : { duration: 0.22, ease: EASE_OUT }}
      className="group/card relative list-none"
    >
      {children}
    </motion.li>
  );
}

interface FoldProps {
  folded: boolean;
  /** The card is in the hand: its place stays its full size, empty, to show where it will land. */
  vacant?: boolean | undefined;
  reduce: boolean;
  /** The one-line row shown while folded. */
  folding: ReactNode;
  /** Called as the fold or the opening starts (true) and ends (false). */
  onMove?: ((started: boolean) => void) | undefined;
  children: ReactNode;
}

/**
 * Folds a card to its one-line row and opens it again. The card stays mounted the whole time, so
 * nothing typed in it is lost: its height eases to 48 px while the card fades and the row fades in
 * over it. Folded and still, the hidden card is out of reach of the pointer, the keyboard and
 * screen readers.
 */
function FoldFrame({ folded, vacant = false, reduce, folding, onMove, children }: FoldProps) {
  const [moving, setMoving] = useState(false);
  // Reported once per stretch of movement, even when a fold is cut short by the opening.
  const reported = useRef(false);
  const report = (now: boolean) => {
    if (reported.current === now) return;
    reported.current = now;
    onMove?.(now);
  };
  const latest = useRef(report);
  latest.current = report;
  useEffect(() => () => latest.current(false), []);
  const slot = vacant && (
    <div
      aria-hidden
      className="absolute inset-0 rounded-plate border-2 border-primary border-dashed bg-tint"
    />
  );
  if (reduce) {
    return (
      <div className="relative" style={folded ? { height: ROW } : undefined}>
        <div
          inert={folded || vacant}
          aria-hidden={folded || vacant || undefined}
          hidden={folded}
          className={cn(vacant && "invisible")}
        >
          {children}
        </div>
        {folded && <div className="absolute inset-x-0 top-0">{folding}</div>}
        {slot}
      </div>
    );
  }
  return (
    <motion.div
      initial={false}
      animate={{ height: folded ? ROW : "auto" }}
      transition={FOLD}
      onAnimationStart={() => {
        setMoving(true);
        report(true);
      }}
      onAnimationComplete={() => {
        setMoving(false);
        report(false);
      }}
      className="relative"
      // Clipped only while it moves, so the lifted row's ring and shadow show once it settles.
      style={{ overflow: moving ? "hidden" : "visible" }}
    >
      <motion.div
        initial={false}
        animate={{ opacity: folded ? 0 : 1 }}
        transition={FOLD}
        inert={folded || vacant}
        aria-hidden={folded || vacant || undefined}
        // Folded and still, the hidden card is skipped for layout and paint, and keeps its state.
        style={{
          visibility: (folded && !moving) || vacant ? "hidden" : undefined,
          contentVisibility: folded && !moving ? "hidden" : undefined,
        }}
      >
        {children}
      </motion.div>
      {slot}
      <motion.div
        initial={false}
        animate={{ opacity: folded ? 1 : 0 }}
        transition={FOLD}
        className="pointer-events-none absolute inset-x-0 top-0"
      >
        {folding}
      </motion.div>
    </motion.div>
  );
}

/**
 * A question folded to one line while one is moving: the list gets short enough that a question
 * travels a little way. Moved from the keyboard, the moving question's row floats with the ring;
 * under a pointer drag the card itself is in the hand and its place is a card-sized empty slot.
 */
function FoldedQuestion({
  question,
  number,
  shape,
}: {
  question: EditorQuestion;
  number: number;
  shape: "rest" | "lifted";
}) {
  const q = filled(question);
  const template = templateFor(q);
  return (
    <div
      aria-hidden
      className={cn(
        "flex h-12 min-w-0 items-center gap-2.5 rounded-plate ps-4 pe-4 sm:ps-5",
        shape === "lifted"
          ? "floating bg-plate outline-2 outline-primary"
          : "border border-edge-3 border-dashed bg-plate/60",
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-well text-ink-2 text-sm tabular">
        {number}
      </span>
      <TypeIcon kind={template.id} className="text-muted" />
      <span className={cn("min-w-0 truncate", q.prompt.trim() ? "text-ink" : "text-muted")}>
        {q.prompt.trim() || "A question without words yet"}
      </span>
    </div>
  );
}

interface GripProps {
  number: number;
  describedBy: string;
  lifted: boolean;
  /** Every card is folded to one line while one moves. */
  folded: boolean;
  disabled: boolean;
  onPointerDown: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
}

/**
 * The handle beside the number, as in Tally: in the card's own left edge, level with the number.
 * It shows while the card is hovered or the grip has focus, and always under a finger; its hit
 * area is larger than the dots.
 */
function ReorderGrip({
  number,
  describedBy,
  lifted,
  folded,
  disabled,
  onPointerDown,
  onKeyDown,
  onBlur,
}: GripProps) {
  if (disabled) return null;
  return (
    <button
      type="button"
      aria-label={`Move question ${number}`}
      aria-describedby={describedBy || undefined}
      aria-pressed={lifted}
      data-lifted={lifted || undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // No text selection while dragging, and no focus ring left behind by a mouse.
        event.preventDefault();
        onPointerDown(event);
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className={cn(
        "absolute start-0 z-1 grid h-7 w-4 cursor-grab touch-none select-none place-items-center rounded-sm text-faint sm:w-5",
        // Level with the number: the head row is 32 px tall under the card's 16 or 18 px top.
        folded ? "top-2.5 opacity-100" : "top-[18px] sm:top-5",
        "opacity-0 transition-[color,opacity] duration-150 group-hover/card:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        "hoverable:hover:text-ink active:cursor-grabbing data-lifted:text-ink data-lifted:opacity-100",
        // A target wider than the dots, reaching the card's edge and the number, without moving them.
        "after:absolute after:-inset-y-2 after:-start-1 after:-end-2 after:content-[''] pointer-coarse:after:-inset-x-4",
      )}
    >
      <GripVertical aria-hidden className="size-4" strokeWidth={2} />
    </button>
  );
}

const firstTypes = ["single", "multi", "rating", "text"];

interface FirstProps {
  onPick: (id: string) => void;
  onTemplates: () => void;
  problem?: string | undefined;
  /** The last question was just deleted: focus lands here instead of being lost. */
  focusOnMount?: boolean | undefined;
}

/** No questions yet: pick the kind of answer for the first one. A template is a quiet second way in. */
function FirstQuestion({ onPick, onTemplates, problem, focusOnMount = false }: FirstProps) {
  const chip = "rounded-full ps-2.5 pe-3 [&_svg]:text-ink-2";
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) root.current?.querySelector<HTMLElement>("button")?.focus();
  }, [focusOnMount]);
  return (
    <div
      ref={root}
      data-slot="first-question"
      className="flex flex-col gap-4 rounded-plate border border-edge-3 border-dashed p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-sm bg-tint text-sm text-tint-ink tabular"
        >
          1
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-base">Your first question</h3>
          <p className="text-muted text-sm">Pick the kind of answer you want.</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:ps-10">
        <div className="flex flex-wrap gap-2">
          {firstTypes.map((id) => (
            <Button key={id} size="sm" className={chip} onClick={() => onPick(id)}>
              <TypeIcon kind={id} />
              {kindLabel(id)}
            </Button>
          ))}
          <QuestionTypeMenu
            onPick={onPick}
            render={
              <Button size="sm" className={chip}>
                <Plus aria-hidden />
                More types
              </Button>
            }
          />
        </div>
        <p className="text-muted text-sm">
          or{" "}
          <button
            type="button"
            onClick={onTemplates}
            className="relative rounded-xs text-ink-2 underline decoration-edge-3 underline-offset-4 transition-colors hoverable:hover:text-ink hoverable:hover:decoration-current pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-['']"
          >
            start from a template
          </button>
        </p>
        {problem && <ProblemLine>{problem}</ProblemLine>}
      </div>
    </div>
  );
}

export { FirstQuestion, QuestionList, ReorderGrip };
