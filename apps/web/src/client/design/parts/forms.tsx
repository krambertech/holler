import { Search } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input, InputGroup } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Variants } from "../frame";
import type { Group } from "./types";

const box = "w-full max-w-sm";

const DAY = 24 * 3600_000;
/** Next Monday at nine, so the demo never shows a time already gone. */
const mondayNine = (() => {
  const at = new Date();
  at.setHours(9, 0, 0, 0);
  at.setTime(at.getTime() + ((8 - at.getDay()) % 7 || 7) * DAY);
  return at;
})();
const yesterdayFive = (() => {
  const at = new Date(Date.now() - DAY);
  at.setHours(17, 0, 0, 0);
  return at;
})();

function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <Field orientation="horizontal" className={box}>
      <FieldLabel>Anonymous</FieldLabel>
      <Switch checked={on} onCheckedChange={setOn} />
    </Field>
  );
}

export const forms: Group = {
  slug: "forms",
  title: "Forms",
  lede: "Every text control is the same box: 40 px tall, 16 px text on a phone so iOS does not zoom. A form reads as one row repeated. Errors arrive on submit, beside the field at fault, and never by taking the button away.",
  entries: [
    {
      slug: "field",
      name: "Field",
      source: "components/ui/field.tsx",
      note: "The parts of a form row. The label names the control; the description and error describe it, wired by context with no id written by hand.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Label and control",
              note: "The label sits above the box, always visible. A placeholder is an example, never the label.",
              render: () => (
                <Field className={box}>
                  <FieldLabel>Title</FieldLabel>
                  <Input placeholder="How was your week?" />
                </Field>
              ),
            },
            {
              label: "With a description",
              note: "One sentence that helps fill the box, under it. An error takes its place.",
              render: () => (
                <Field className={box}>
                  <FieldLabel>Form link</FieldLabel>
                  <Input placeholder="https://" />
                  <FieldDescription>
                    Holler sends this link and asks each person to say when they submitted it.
                  </FieldDescription>
                </Field>
              ),
            },
            {
              label: "Invalid",
              note: "A danger edge and the reason, with an icon. The message says what to do.",
              render: () => (
                <Field className={box} invalid>
                  <FieldLabel>Title</FieldLabel>
                  <Input aria-invalid defaultValue="" />
                  <FieldError>Give it a title.</FieldError>
                </Field>
              ),
            },
            {
              label: "Disabled",
              note: "Only when the reason is on screen. Prefer leaving it enabled and explaining on submit.",
              render: () => (
                <Field className={box}>
                  <FieldLabel>Send at</FieldLabel>
                  <Input disabled defaultValue="Monday 09:00" />
                </Field>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "input",
      name: "Input",
      source: "components/ui/input.tsx",
      note: "One line of text. Hover and focus firm the edge; the plate stays white so it never sinks into the canvas.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Default",
              render: () => <Input className={box} placeholder="Search by title" />,
            },
            {
              label: "With an icon",
              note: "A search box: an InputGroup with the icon at its start. The icon is decoration; the label or aria-label names the box.",
              render: () => (
                <InputGroup className={box} icon={<Search strokeWidth={2} />}>
                  <Input aria-label="Search hollers" placeholder="Search by title" />
                </InputGroup>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "date-time-input",
      name: "DateTimeInput",
      source: "components/ui/date-time-input.tsx",
      note: "A day and a time with the browser's own pickers, which every keyboard, screen reader and phone knows. Give it value and onValueChange, or a defaultValue to let it keep its own.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "A time",
              render: () => <DateTimeInput defaultValue={mondayNine} min={new Date()} />,
            },
            {
              label: "In a Field with an error",
              note: "Both boxes take the Field's error as their description and turn red.",
              render: () => (
                <Field className={box}>
                  <FieldLabel>Closes</FieldLabel>
                  <DateTimeInput defaultValue={yesterdayFive} min={new Date()} />
                  <FieldError>Pick a time after it sends.</FieldError>
                </Field>
              ),
            },
            {
              label: "Disabled",
              render: () => <DateTimeInput defaultValue={mondayNine} disabled />,
            },
          ]}
        />
      ),
    },
    {
      slug: "textarea",
      name: "Textarea",
      source: "components/ui/textarea.tsx",
      note: "Several lines: a description, a free-text answer. It grows with what is typed.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Default",
              render: () => (
                <Field className={box}>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea placeholder="What you are asking and why. Markdown works." />
                </Field>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "checkbox",
      name: "Checkbox",
      source: "components/ui/checkbox.tsx",
      note: "A choice that takes effect when the form is saved. The tick draws itself in after the box fills.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "States",
              render: () => (
                <div className="grid gap-3">
                  {[
                    { label: "Required", checked: true },
                    { label: "Allow comments", checked: false },
                  ].map((item) => (
                    <Field key={item.label} orientation="horizontal">
                      <Checkbox defaultChecked={item.checked} />
                      <FieldLabel>{item.label}</FieldLabel>
                    </Field>
                  ))}
                  <Field orientation="horizontal">
                    <Checkbox disabled />
                    <FieldLabel>Disabled</FieldLabel>
                  </Field>
                </div>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "switch",
      name: "Switch",
      source: "components/ui/switch.tsx",
      note: "A setting that takes effect the moment it flips: Anonymous, Reminders. Plum when on.",
      Demo: () => (
        <Variants
          items={[
            { label: "Interactive", render: () => <SwitchDemo /> },
            {
              label: "Disabled",
              note: "The label dims with it and stops looking pressable.",
              render: () => (
                <Field orientation="horizontal" className={box}>
                  <FieldLabel>Reminders</FieldLabel>
                  <Switch defaultChecked disabled />
                </Field>
              ),
            },
          ]}
        />
      ),
    },
    {
      slug: "radio-group",
      name: "RadioGroup",
      source: "components/ui/radio-group.tsx",
      note: "One of a few visible choices. Arrow keys move the choice.",
      Demo: () => (
        <Variants
          items={[
            {
              label: "Close after",
              render: () => (
                <RadioGroup defaultValue="3d" aria-label="Close after" className="grid gap-2.5">
                  {[
                    ["1d", "1 day"],
                    ["3d", "3 days"],
                    ["1w", "1 week"],
                  ].map(([value, label]) => (
                    <Field key={value} orientation="horizontal">
                      <RadioGroupItem value={value ?? ""} />
                      <FieldLabel>{label}</FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              ),
            },
          ]}
        />
      ),
    },
  ],
};
