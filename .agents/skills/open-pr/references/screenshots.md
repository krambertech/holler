# Screenshots for a UI PR

Every rendered UI change attaches visual evidence. A screenshot that exists only in the agent conversation is not attached.

## Choose them

- One after image per affected surface. Add a before image when the surface already existed.
- The widths and themes the change affects: 1280 px and 375 px, day and night.
- Seeded persona data only. Keep tokens, API key secrets, real Slack names and production data out of images and filenames.

The verify skill's evidence folder already holds a screenshot for every step; pick from it before capturing new ones.

## Fill the template

Keep the `## Screenshots` heading and reference each file as `./<basename>`, so the upload replaces it in place:

```markdown
| Before | After |
| --- | --- |
| ![Home before](./home-phone-before.png) | ![Home after](./home-phone-after.png) |
```

For a new surface, one labelled image is enough.

## Upload

`gh` 2.99 and later uploads with `--attach`, rewriting a reference only when the attach path matches it exactly. Run it from the screenshot folder with bare filenames:

```bash
cd "$SCREENSHOT_DIR"
gh pr create -R krambertech/holler --head <branch> --base main \
  --title "feat(web): describe the outcome" --body-file "$PR_BODY_FILE" \
  --attach "home-phone-before.png#Home before" --attach "home-phone-after.png#Home after"
```

Use `gh pr edit <number> -R krambertech/holler --attach ...` for an existing PR.

## Confirm

Read the body back. No `](./` reference may remain; each image is a `https://github.com/user-attachments/assets/` URL. When upload fails, keep the files, report the exact failure, and leave the PR blocked.
