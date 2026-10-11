---
name: publish
description: Publish a draft article of this repository on Zenn, or schedule it, and confirm it is live. Use when the author says to publish an article ("公開して", "zenn に出して", "この記事を publish して", "明日の朝に公開予約して"). Not for pushing a draft or an update to an article that is already published; those are ordinary commits (AGENTS.md).
---

# Publishing an article on Zenn

An article is published when `published: true` reaches `origin/main`. Zenn cannot take that back quietly: readers, feeds and followers see it at once. So every step that changes what readers see waits for the author's word, given for this article in this conversation.

## 1. Find the article and its state

- Find `articles/<slug>.md` from the author's words (title, topic or slug). If more than one draft fits, ask which.
- `git fetch origin`, then check it is a draft on `origin/main` too (`git show origin/main:articles/<slug>.md`). If it is already `published: true` there, this is not a publish; say so and stop.
- Uncommitted or unlanded changes to the article are part of what goes out. List them for the author rather than publishing around them.

## 2. Check it

- `pnpm check articles/<slug>.md` passes.
- Render it: `pnpm preview` in the background, then `curl -s localhost:8010/api/articles/<slug>` and look in `bodyHtml` for `data-body-error`. Stop the preview afterwards.
- Leftovers a draft may still have, to show the author (not to fix unasked): image placeholders or `<!-- -->` notes, `TODO`, `assets.babarot.dev` images that do not answer 200 (`curl -sI`), links to `localhost`, the emoji 🗼 that older articles reused.
- Title, emoji and topics are what readers see first. Show them as they are.

## 3. Ask

Show the author the slug, title, emoji, topics, the findings from step 2, and the URL it will have: `https://zenn.dev/babarot/articles/<slug>`. Ask whether to publish now or at a time (`published_at`). Do not go on without a yes for this article.

## 4. Publish

- Set `published: true`. For a scheduled one, also `published_at: "YYYY-MM-DD hh:mm"` (JST) after `published`; it must be in the future.
- Commit only that change, the subject naming the article: "Publish the syno post".
- Land it in `main` (`/land`) and push. The yes in step 3 covers this push; it covers nothing else that is unpushed on `main`, so if `main` holds other unpushed commits, show them and ask first.

## 5. Confirm it is live

- Poll `curl -s -o /dev/null -w '%{http_code}' https://zenn.dev/babarot/articles/<slug>` for up to about five minutes: 200 means published; it answers 403 while it is still a draft.
- A scheduled article stays 403 until its time; report the time instead of polling.
- If it does not turn 200, the deploy may have failed: the author can see why at https://zenn.dev/dashboard/deploys. Do not push again to retry.

Report the URL and the commit.
