# zenn.dev

babarot's articles on Zenn, https://zenn.dev/babarot. Zenn's GitHub integration deploys `main` of this repository: every Markdown file in `articles/` is an article on Zenn. This file says what the author wants from that, so you can decide as the author would when nothing here or in the code tells you.

Japanese belongs only in articles. Code, comments, commits and docs are in English.

## Committing and deploying

There are no pull requests. Changes are committed to `main` (from a worktree: rebased onto `main` and fast-forwarded, which the `/land` skill does), and pushing `main` is the deploy: Zenn picks up the push within a minute or two and syncs the `.md` files that changed.

- Push only when asked. Publishing an article (`published: true` reaching `origin/main`) needs the author's word for that article; `.claude/skills/publish/` is the procedure.
- Before committing a change under `articles/` or `images/`: `pnpm check`.
- One change per commit, the subject an imperative sentence naming the article (see `git log`: "Retitle the syno post and add the claudecode topic"). The author often asks for several changes to be collected and committed together; leave them staged until asked.
- The repository is public. A draft (`published: false`) does not appear on Zenn, but anyone can read it on GitHub, so never put in a draft what must not be public: work details, internal names, credentials.
- Deploy history and errors are on the Zenn dashboard (https://zenn.dev/dashboard/deploys), which needs the author's login. From here, the only check is the article URL: `https://zenn.dev/babarot/articles/<slug>` answers 200 once published (a draft answers 403, an unknown slug 404).

## What the author cares about

- An article is what its author wrote. Do not touch its wording unless asked, and when asked, change only what was asked.
- Links out there keep working. A published article's file name is its URL: never rename or delete it. A new file name is a new article on Zenn, and an article whose file is gone stays on Zenn as it was, no longer updated from here. Removing an article for good is done by the author on the dashboard, together with deleting the file here.
- Old readers are respected. An article that has gone out of date is corrected so the old text can still be found: the old sentence struck through, then a dated `:::message` addendum. The `core:blog-writing` skill has the exact form; rewording that does not change what an article says (typos, style) is done in place.
- An image a published article uses is never deleted or replaced under the same name: deleting it from `images/` deletes it on Zenn.

## Writing articles

Writing, rewording and reviewing the Japanese text follow the `core:blog-writing` skill with the medium `zenn` (from babarot/agent-skills): voice, structure, titles, Zenn notation. This repository does not repeat those rules. That skill still names the Obsidian vault (`LIFE/8-writing/zenn.dev/`) as where articles are saved; that is out of date. Articles live only in this repository; the vault copies and the sync from babarot/base were retired in 2026-10, so never read a vault copy as the current text or write one back.

- One file per article: `articles/<slug>.md`. The slug is the file name and the URL: 12 to 50 characters of `a-z0-9-_`, in English kebab-case saying what the article is about (`conftest-markdown-schema-validation`), chosen before the first push and never changed after publishing.
- Front matter, in this order and form (the Obsidian keys `slug` and `medium` have no place here):

  ```yaml
  ---
  title: "Synology NASの状態をClaude Codeに把握してもらうためのCLIを作った"
  emoji: "🗄️"
  type: "tech"
  topics: ["synology", "nas", "claudecode", "mcp", "cli"]
  published: false
  ---
  ```

  Zenn's limits, enforced by `pnpm check`: title up to 70 characters, a single emoji, `type` `tech` or `idea`, 1 to 5 topics of up to 18 characters with no symbols or spaces. `published_at: "YYYY-MM-DD hh:mm"` with `published: true` schedules an article; use it only when the author asks for a date.
- A new article starts as `published: false`, and is pushed as a draft only when the author asks.
- Images are hosted at `https://assets.babarot.dev/files/YYYY/MM/<hash>.<ext>`. The author uploads them (pasting into Obsidian sends them to the image server); in a draft, mark where an image goes and what it shows, and leave the upload to the author. When an image has to live in this repository, it goes in `images/<slug>/` and is referenced as `/images/<slug>/<name>`: `.png` `.jpg` `.jpeg` `.gif` `.webp`, 3MB at most (Zenn fails the deploy otherwise).
- `assets/<slug>/` holds what made an article's media (a VHS tape and its script). Zenn ignores it.
- `books/` is empty; there are no books yet.

## Commands

```sh
pnpm install
pnpm check     # every article; or pnpm check articles/<slug>.md
pnpm preview   # http://localhost:8010/, drafts included
```

- `pnpm check` mirrors zenn-cli's front matter validators and adds what Zenn cannot undo: a published article on `origin/main` whose file is gone fails, and one turned back to `published: false` (which unpublishes it) is warned about. Fetch first so `origin/main` is current.
- The preview is the only place to see how an article renders before it is on Zenn (Zenn has no preview on the site). Use it after changing notation (`:::message`, `:::details`, footnotes, tables, embeds): run it in the background, then `curl -s localhost:8010/api/articles/<slug>` returns the article with its rendered `bodyHtml`; an element with `data-body-error` is a part Zenn could not render. Port 8000, zenn-cli's default, is taken by OrbStack on the author's Mac, hence 8010.
- zenn-cli is pinned in `package.json`. It prints a notice when a newer version exists; that alone is no reason to update it.
