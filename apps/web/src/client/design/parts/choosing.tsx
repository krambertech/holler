import { useState } from "react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Variants } from "../frame";
import type { Group } from "./types";

const box = "w-full max-w-sm";

const closeTimes = [
  { value: "1d", label: "1 day after sending" },
  { value: "3d", label: "3 days after sending" },
  { value: "1w", label: "1 week after sending" },
  { value: "custom", label: "On a date…" },
];

function CloseSelect() {
  const [value, setValue] = useState<string | null>("3d");
  return (
    <Field className={box}>
      <FieldLabel>Closes</FieldLabel>
      <Select value={value} onValueChange={setValue} items={closeTimes}>
        <SelectTrigger>
          <SelectValue placeholder="Choose when it closes" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    </Field>
  );
}

interface Person {
  value: string;
  label: string;
}

const team: Person[] = [
  "Amara Thompson",
  "Ben Carter",
  "Dana Alon",
  "Jun Watanabe",
  "Kofi Owusu",
  "Lena Hoffmann",
  "Marta Kowalska",
  "Priya Shah",
  "Sofia Nieminen",
  "Tomás Ruiz",
].map((name) => ({ value: name.toLowerCase().replaceAll(" ", "-"), label: name }));

function PersonCombobox() {
  const [value, setValue] = useState<Person | null>(null);
  return (
    <Field className={box}>
      <FieldLabel>Send to</FieldLabel>
      <Combobox<Person>
        items={team}
        value={value}
        onValueChange={setValue}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxTrigger>
          <ComboboxValue placeholder="Choose a person" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Search people" />
          <ComboboxEmpty>Nobody by that name in this workspace.</ComboboxEmpty>
          <ComboboxList>
            {(person: Person) => (
              <ComboboxItem key={person.value} value={person}>
                <span className="flex-1 truncate">{person.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export const choosing: Group = {
  slug: "choosing",
  title: "Choosing",
  lede: "A list behind a control, for choices too many to show as radios. On a desktop the list grows from the control; on a touch device it rises as a sheet. The call site never picks the shape.",
  entries: [
    {
      slug: "select",
      name: "Select",
      source: "components/ui/select.tsx",
      covers: ["TriggerChevron"],
      note: "One of a short, known list. The chosen option keeps its tick; arrows move, Enter chooses, Escape closes.",
      Demo: () => <Variants items={[{ label: "Close time", render: () => <CloseSelect /> }]} />,
    },
    {
      slug: "combobox",
      name: "Combobox",
      source: "components/ui/combobox.tsx",
      note: "A list long enough to search, such as the people in a workspace. Typing filters; the empty line says what was not found.",
      Demo: () => <Variants items={[{ label: "A person", render: () => <PersonCombobox /> }]} />,
    },
  ],
};
