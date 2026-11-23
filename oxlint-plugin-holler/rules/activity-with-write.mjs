import { defineRule } from "@oxlint/plugins";

const message =
  "This change is one Activity records, so the two land in one batch or not at all. Hand the change to " +
  "recordChange(ctx, activityOf(ctx, { … }), change) from services/audit.ts, which records nothing when no row " +
  "changed, or undo both with takeBack. Only services/audit.ts writes the activity table.";

const every = () => true;
const anyOf = (columns) => (column) => columns.includes(column);

const recorded = {
  hollers: {
    insert: every,
    delete: every,
    update: anyOf(["status", "creatorId", "remindedAt", "reportToken"]),
  },
  members: { insert: every, delete: every, update: anyOf(["role"]) },
  viewers: { insert: every, delete: every, update: every },
  answerNotes: { insert: every, delete: every, update: every },
  apikey: { insert: every, delete: every, update: every },
  oauthConsent: { delete: every },
  slackInstallations: { insert: every, delete: every, update: every },
  workspaces: { update: anyOf(["plan", "planEndsAt", "uninstalledAt"]) },
};

const doors = new Set(["recordChange", "takeBack"]);
const writesActivity = /\b(insert\s+into|update|delete\s+from)\s+["`]?activity\b/i;

function nameOf(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "MemberExpression" && !node.computed) return nameOf(node.property);
  return null;
}

function methodOf(node) {
  if (node?.type !== "CallExpression" || node.callee.type !== "MemberExpression") return null;
  return nameOf(node.callee);
}

function setColumns(write) {
  const link = write.parent;
  const call = link?.type === "MemberExpression" ? link.parent : null;
  const values = call && nameOf(link) === "set" ? call.arguments[0] : null;
  if (values?.type !== "ObjectExpression") return null;
  if (values.properties.some((property) => property.type !== "Property" || property.computed)) {
    return null;
  }
  return values.properties.map((property) => nameOf(property.key) ?? property.key.value);
}

function isRecorded(write) {
  const method = methodOf(write);
  const changes = recorded[nameOf(write.arguments[0])]?.[method];
  if (!changes) return false;
  if (method !== "update") return true;
  const columns = setColumns(write);
  return columns === null || columns.some(changes);
}

function isInsideDoor(node) {
  for (let at = node.parent; at; at = at.parent) {
    if (at.type === "CallExpression" && doors.has(nameOf(at.callee))) return true;
  }
  return false;
}

export default defineRule({
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      CallExpression(node) {
        if (!["insert", "update", "delete"].includes(methodOf(node))) return;
        const isActivity = nameOf(node.arguments[0]) === "activity";
        if (isActivity || (isRecorded(node) && !isInsideDoor(node))) {
          context.report({ node, message });
        }
      },
      Literal(node) {
        if (typeof node.value === "string" && writesActivity.test(node.value)) {
          context.report({ node, message });
        }
      },
      TemplateElement(node) {
        if (writesActivity.test(node.value.raw)) context.report({ node, message });
      },
    };
  },
});
