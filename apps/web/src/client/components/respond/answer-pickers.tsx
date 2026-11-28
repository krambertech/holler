import type { RespondPerson } from "@holler/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { type ControlProps, labelOf } from "./answer-control";
import { OtherText } from "./answer-options";

interface Item {
  value: string;
  label: string;
  avatarUrl?: string | null | undefined;
}

function OptionSearch(props: ControlProps) {
  const { question, value, onValueChange, legendId } = props;
  const items: Item[] = question.options.map((o, index) => ({
    value: o.id,
    label: labelOf(question, index),
  }));
  const chosen = items.filter((item) => value.optionIds.includes(item.value));
  const trigger = (
    <ComboboxTrigger aria-labelledby={legendId}>
      <ComboboxValue>{() => namesOf(chosen, "Choose")}</ComboboxValue>
    </ComboboxTrigger>
  );
  const content = (
    <ComboboxContent aria-label={question.prompt}>
      <ComboboxInput aria-label="Search the options" placeholder="Search" />
      <ComboboxEmpty>No option matches that.</ComboboxEmpty>
      <ComboboxList>
        {(item: Item) => (
          <ComboboxItem key={item.value} value={item}>
            <span className="flex-1 truncate">{item.label}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
  return (
    <div className="flex flex-col gap-1">
      {question.type === "single" ? (
        <Combobox<Item>
          items={items}
          value={chosen[0] ?? null}
          isItemEqualToValue={(a, b) => a.value === b.value}
          onValueChange={(next) => onValueChange({ ...value, optionIds: next ? [next.value] : [] })}
        >
          {trigger}
          {content}
        </Combobox>
      ) : (
        <Combobox<Item, true>
          multiple
          items={items}
          value={chosen}
          isItemEqualToValue={(a, b) => a.value === b.value}
          onValueChange={(next) => {
            const ids = next.map((item) => item.value);
            if (question.maxChoices !== null && ids.length > question.maxChoices) return;
            onValueChange({ ...value, optionIds: ids });
          }}
        >
          {trigger}
          {content}
        </Combobox>
      )}
      <OtherText {...props} />
    </div>
  );
}

const namesOf = (items: readonly Item[], placeholder: string): ReactNode =>
  items.length === 0 ? (
    <span data-placeholder="" className="text-muted">
      {placeholder}
    </span>
  ) : (
    new Intl.ListFormat(undefined).format(items.map((i) => i.label))
  );

function PeoplePicker({ question, value, onValueChange, legendId, searchPeople }: ControlProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const found = usePeopleSearch(searchPeople, query.trim(), open);
  const toItem = (p: RespondPerson): Item => ({
    value: p.slackUserId,
    label: p.name,
    avatarUrl: p.avatarUrl,
  });
  const chosen = value.people.map(toItem);
  const items = [
    ...chosen,
    ...(found.people ?? []).map(toItem).filter((i) => !chosen.some((c) => c.value === i.value)),
  ];
  const back = (picked: readonly Item[]) =>
    picked.map((item) => ({
      slackUserId: item.value,
      name: item.label,
      avatarUrl: item.avatarUrl ?? null,
    }));
  const one = question.maxChoices === 1;
  const trigger = (
    <ComboboxTrigger aria-labelledby={legendId}>
      <ComboboxValue>
        {() => namesOf(chosen, one ? "Choose someone" : "Choose people")}
      </ComboboxValue>
    </ComboboxTrigger>
  );
  const content = (
    <ComboboxContent aria-label={question.prompt}>
      <ComboboxInput aria-label="Search people" placeholder="Search people" />
      <ComboboxEmpty>
        {found.people === null ? "Looking…" : "Nobody by that name in this workspace."}
      </ComboboxEmpty>
      <ComboboxList>
        {(item: Item) => (
          <ComboboxItem key={item.value} value={item}>
            <Avatar name={item.label} src={item.avatarUrl ?? null} seed={item.value} size="sm" />
            <span className="flex-1 truncate">{item.label}</span>
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
  const shared = {
    items,
    onOpenChange: setOpen,
    filter: null,
    inputValue: query,
    onInputValueChange: (next: string) => setQuery(next),
    isItemEqualToValue: (a: Item, b: Item) => a.value === b.value,
  };
  return one ? (
    <Combobox<Item>
      {...shared}
      value={chosen[0] ?? null}
      onValueChange={(next) => onValueChange({ ...value, people: next ? back([next]) : [] })}
    >
      {trigger}
      {content}
    </Combobox>
  ) : (
    <Combobox<Item, true>
      {...shared}
      multiple
      value={chosen}
      onValueChange={(next) => {
        if (question.maxChoices !== null && next.length > question.maxChoices) return;
        onValueChange({ ...value, people: back(next) });
      }}
    >
      {trigger}
      {content}
    </Combobox>
  );
}

function usePeopleSearch(
  search: (query: string) => Promise<RespondPerson[]>,
  query: string,
  enabled: boolean,
) {
  const [people, setPeople] = useState<RespondPerson[] | null>(null);
  const latest = useRef(search);
  latest.current = search;
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const timer = setTimeout(() => {
      latest.current(query).then(
        (next) => {
          if (current) setPeople(next);
        },
        () => {
          if (current) setPeople([]);
        },
      );
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, enabled]);
  return { people };
}

export { OptionSearch, PeoplePicker };
