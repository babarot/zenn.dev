---
title: "Terraformを使わずにGitHubをコードで管理する"
emoji: "🏗️"
type: "tech"
topics: ["github", "go", "cli", "iac", "terraform"]
published: true
---
## GitHubのリポジトリをどう管理するか

GitHubのリポジトリが増えてくると、設定の管理が地味に厄介になります。OSSを複数持っていると、merge strategyやRuleset、Actionsの許可設定など、毎回似たような設定をしていくことになります。また、新しい設定を入れていくときも古いリポジトリでは漏れがちで、久しぶりに開いたら古い設定だった、みたいなこともよくあります。

例えば、Goで新しいCLIツールを書いて公開するとします。visibilityをpublicにして、squash mergeだけ有効にして、auto delete head branchesをオンにする。topicsに`go`と`cli`を足して、wikiとprojectsを無効にする。MakefileやLICENSEをコピーして、[tagpr](https://github.com/Songmu/tagpr)のワークフローを追加して、labelsを整理して、rulesetsでmainブランチにrequired reviewsを設定する。次のリポジトリでも同じことをするでしょう。おそらくその次も...

初期設定だけでも手間ですが、本当の問題はその先にあります。ある日、

- 全リポジトリでsquash mergeのcommit titleをPR_TITLEに統一したい
- tagprなどのPull Requestを作るGitHub Actionsを導入するためにAllow GitHub Actions to create and approve pull requestsにチェックを入れたい

などと思ったとき、GUIで1つずつ開いて回るしかありません。更に、どのリポジトリがどういう状態なのか見通す手段がなく、対応したリポジトリとそうでないリポジトリと設定がまちまちになることもよくあります。

こうなると設定をコード化することを考えます。GitHubのIaCなら[Terraform](https://registry.terraform.io/providers/integrations/github/latest/docs)が真っ先に思い浮かびます。自分も会社ではRepositoryやTeam、Orgの管理にTerraformを使っています。ただ、個人のリポジトリ管理にTerraformを持ち出すのはどうしても重く、GitHub providerに渡すtokenの管理、state fileの管理、plan/applyを通すための環境構築、ローカルで実行したくないならCI/CD設定など、始めるための準備にかなりのコストがかかります。別のIaCとして[Probot Settings](https://github.com/probot/settings)のようなツールもありますが、plan機能がなく変更前にdiffを確認できないことや、GitHub Appが必要なことなど自分の要件には合いませんでした。

さらに、Terraformを使っても解決できない問題があります。共通ファイルの配布です。CODEOWNERS、LICENSE、言語特有に設定した（似たような）Claude Code Rules、Go用のMakefileやlintの設定、フロントエンド用のESLint/Prettier設定など、リポジトリをまたいで同じファイルを置きたい場面は多いですが、Terraformでやろうとすると複雑になります。labelsを見直して`kind/breaking-change`を全リポジトリに追加したくなっても、GUIで1つずつ開いて回ることになります。ラベル同期用のGitHub Actionsで自動化しようとしても、結局そのCI設定を複数リポジトリに配る部分は手動のままなのです。

初期ブートストラップを簡単にする方法として、Repository Template機能もありますが、これは「作成時の初期化」を解決するもので、「作成後の継続管理」には対応していません。labels.yamlに後から1行足す、CIワークフローを全リポジトリで更新する、といったことには使えません。

欲しかったのは、Terraformのplan/applyワークフローは残しつつ、state fileもprovider設定もCI構築も不要で、リポジトリの設定とファイルの両方をコードで管理できるツールでした。

https://github.com/babarot/gh-infra

## gh-infraとは

gh-infraとはGitHubリポジトリの設定をYAMLで宣言的に管理するCLIツールです。Terraformライクな`plan`/`apply`ワークフローを提供します。

```bash
gh infra plan    # 現状とYAMLの差分を表示
gh infra apply   # 差分を適用
```

[`gh` CLI](https://cli.github.com/manual/)の拡張として動作し、`gh extension install babarot/gh-infra`でインストールできます。認証は`gh auth`に委譲するため、追加のトークン設定は不要です。

自分が欲しかった機能を詰め込んでいるので万人に適うツールになっているかはわかりませんが、機能はこんな感じです:

- YAMLに「あるべき姿」を宣言するだけ。リポジトリ設定もファイルもコードで管理できる
- Terraformライクな体験。`plan`で差分を確認してから`apply`で適用する
- state fileが不要。GitHub APIから毎回現状を取得するので、GitHub自体がstateになる
- Additiveな動作。YAMLに書いたフィールドだけを管理し、書かなかった設定はGitHub上の設定が尊重される。GUIで手動設定した値が勝手に消えることはない
- `gh`コマンドだけで動く。追加のインフラもGitHub Appもトークン設定も不要
- 1リポジトリの管理も、数十リポジトリへの一括適用も同じワークフローで行える

とにかくシンプルで簡単に使い始められることを意識しています。「あるべき姿を宣言するだけ」とは謳っているもののYAMLを書くのすら正直面倒だったので、importで既存の全部の設定を引っ張ってきて人間はその値をいじるだけ、という設計です。

## 基本的な使い方

![docs/tapes/demo.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo.gif)

### 1. 既存リポジトリをYAMLにエクスポート

```bash
gh infra import babarot/my-project > repos/my-project.yaml
```

現在のGitHub上の設定がYAMLとして出力されます。複数リポジトリを一度に指定することもできます。

```bash
gh infra import babarot/my-cli babarot/my-shell-plugin
```

### 2. YAMLを編集

エクスポートされたYAMLを見て、あるべき姿に編集します。YAMLの書き方は後述しますが、description、visibility、topics、merge strategy、branch protection、rulesets、GitHub Actionsなど、基本的な設定はgh-infraでコード化できます。

### 3. plan → apply

```bash
$ gh infra plan ./repos/

  ~ babarot/my-project
      ~ description   "old desc" → "My awesome project"
      + topics        [go, cli]
      ~ squash_merge  false → true
      - wiki          true

Plan: 0 to create, 1 to update, 0 to destroy
```

差分を確認してからapplyします。

```bash
$ gh infra apply ./repos/

  ✓ babarot/my-project  description updated
  ✓ babarot/my-project  topics updated
  ✓ babarot/my-project  squash_merge enabled

Apply complete! 3 changes applied.
```

## Repository: リポジトリ設定の管理

gh-infraの基本単位は`Repository`です。1つのYAMLファイルで1つのリポジトリの「あるべき姿」を宣言します。

```yaml
apiVersion: gh-infra/v1
kind: Repository
metadata:
  name: my-project
  owner: babarot

spec:
  description: "My awesome project"
  visibility: public
  topics: [go, cli]
  features:
    issues: true
    wiki: false
    discussions: true
  merge_strategy:
    allow_squash_merge: true
    allow_rebase_merge: false
    auto_delete_head_branches: true
    squash_merge_commit_title: PR_TITLE          # or COMMIT_OR_PR_TITLE
    squash_merge_commit_message: COMMIT_MESSAGES  # or PR_BODY, BLANK
```

全フィールドはオプショナルで、宣言したフィールドだけが管理対象になります。YAMLに書いていないフィールドはGitHub上の設定がそのまま維持されます。

### Labels

リポジトリのラベルも宣言的に管理できます。冒頭で触れた「`kind/breaking-change`を全リポジトリに追加したい」のような作業は、ラベル同期用のGitHub Actions（[EndBug/label-sync](https://github.com/EndBug/label-sync)など）を各リポジトリに導入して回る方法もありますが、gh-infraならリポジトリ設定と同じマニフェストにまとめて管理できます。

```yaml
spec:
  labels:
    - name: kind/bug
      color: d73a4a
      description: "A bug; unintended behavior"
    - name: kind/feature
      color: "425df5"
      description: "A feature request"
    - name: kind/breaking-change
      color: e11d48
      description: "A breaking change"
  label_sync: additive
```

`label_sync`フィールドで同期モードを制御します。

| label_sync        | 動作                                   |
| ----------------- | ------------------------------------ |
| `additive`（デフォルト） | ラベルの作成・更新のみ。マニフェストに書かれていないラベルはそのまま残る |
| `mirror`          | 作成・更新に加え、マニフェストに書かれていないラベルを削除する      |

`mirror`モードでラベルを削除する際、`plan`ではそのラベルが使われているissue/PRの件数と最終使用日も表示されるため、削除の影響を事前に確認できます。`mirror` は完全同期できるのがメリットではあるもののラベルが消えるとIssueやPRからもラベルが剥がれるので注意して使うとよいです。

![](https://assets.babarot.dev/files/2026/04/3d16cc83c71102f9.png)

### Branch Protection

Branch Protectionではrequired reviewsだけでなく、stale reviewの自動dismiss、code owner reviewの要求、status checkの強制なども制御できます。

ただし、GitHubはbranch protectionの上位互換として[Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)を提供しており、新機能の開発はRulesets側に集中しています。branch protectionが正式にdeprecatedとアナウンスされたわけではありませんが、新規に設定するならRulesetsを使うのがおすすめです。gh-infraはbranch protectionとRulesetsの両方をサポートしているので、既存のbranch protectionを管理しつつ、段階的にRulesetsに移行するといった使い方もできます。

```yaml
spec:
  branch_protection:
    - pattern: main
      required_reviews: 1
      dismiss_stale_reviews: true
      require_code_owner_reviews: true
      require_status_checks:
        strict: true
        contexts: [ci]
      enforce_admins: true
      allow_force_pushes: false
      allow_deletions: false
```

### Rulesets

GitHub Rulesetsも管理できます。GitHub APIではbypass actorやstatus checkのアプリを数値IDで管理しますが、YAMLに`actor_id: 12345`と書いても何のことか分かりません。Terraform GitHub providerでも同様にIDを直接指定する必要があります。gh-infraではチーム名やアプリslugといった人間が読める名前で書けるようにしています。apply時にGitHub APIを使って名前→IDの解決を行い、逆に`import`時にはIDから名前への逆引きを行います。ただし、チームが削除されたりアプリが非公開になっていて逆引きできない場合は `id:12345` のようなプレフィックス付きでフォールバックする実装です。

pull requestルールでは承認数、stale review dismiss、最終pushの承認要求、レビュースレッドの解決要求などを制御できます。

```yaml
spec:
  rulesets:
    - name: main-protection
      target: branch
      enforcement: active
      bypass_actors:
        - team: maintainers
          bypass_mode: always
        - app: renovate
          bypass_mode: pull_request
        - role: admin
          bypass_mode: always
      conditions:
        ref_name:
          include: ["~DEFAULT_BRANCH"]
      rules:
        pull_request:
          required_approving_review_count: 1
          dismiss_stale_reviews_on_push: true
          require_code_owner_review: true
          require_last_push_approval: true
          required_review_thread_resolution: true
        required_status_checks:
          strict_required_status_checks_policy: true
          contexts:
            - context: ci
        non_fast_forward: true
```

bypass actorにはteam、app以外にrole（admin, write, maintain）、org-admin、custom-role（Enterprise Cloud）も指定できます。

### Actions

GitHub Actionsのリポジトリレベルの設定も`actions`ブロックで管理できます。利用可能なアクションの制限、ワークフローのパーミッション、Fork PRの承認ポリシーなどを宣言的に制御できます。

```yaml
spec:
  actions:
    enabled: true
    allowed_actions: selected
    sha_pinning_required: true
    workflow_permissions: read
    can_approve_pull_requests: false
    fork_pr_approval: first_time_contributors
    selected_actions:
      github_owned_allowed: true
      verified_allowed: true
      patterns_allowed:
        - "actions/*"
  release_immutability: true
```

`allowed_actions`は`all`（すべて許可）、`local_only`（同一Org内のみ）、`selected`（明示的に許可したもののみ）の3段階です。`selected`を選んだ場合は`selected_actions`で許可するアクションのパターンを指定します。`workflow_permissions`はワークフローに付与されるデフォルトのトークン権限で、`read`か`write`を選べます。`can_approve_pull_requests`でActionsからのPR承認を制御し、`fork_pr_approval`でフォークからのPR実行ポリシーを設定できます。

`sha_pinning_required`と`release_immutability`はサプライチェーン攻撃対策として最近注目されている設定です。これらをRepositorySetの`defaults`に書いておけば全リポジトリに一括適用でき、設定漏れがあれば`plan`で差分として検出されます。こういった設定もコード管理していると管理漏れがなくIaCのメリットを感じる設定の1つです。

## File: リポジトリ内ファイルの管理

`Repository`がリポジトリの設定を管理するのに対し、`File`はリポジトリ内のファイルを管理します。CODEOWNERS、LICENSE、CIワークフローなど、コードと一緒にリポジトリに置くファイルを宣言的に管理できます。

`Repository`と`File`は同じリポジトリに対して`---`区切りで1つのYAMLファイルにまとめることもできます。リポジトリの設定とファイルの管理を1ファイルで完結させたい場合に便利です。

```yaml
apiVersion: gh-infra/v1
kind: File
metadata:
  name: my-project
  owner: babarot

spec:
  files:
    - path: .github/CODEOWNERS
      content: |
        * @babarot
    - path: LICENSE
      source: ./templates/LICENSE
    - path: go.mod
      content: |
        module github.com/<% .Repo.FullName %>
        go 1.24.0

  via: push
```

以下、いくつか特徴的な機能を紹介します。

### ファイルソース

ファイルの内容をどこから取得するかを4種類から選べます。

```yaml
files:
  # 1. inline content — YAMLに直接書く
  - path: .github/CODEOWNERS
    content: |
      * @babarot

  # 2. ローカルファイル — 手元のファイルを参照
  - path: LICENSE
    source: ./templates/LICENSE

  # 3. ローカルディレクトリ — ディレクトリ内の全ファイルを再帰的に展開
  #    ./templates/.github/ 以下のファイルが .github/ 以下にマッピングされる
  - path: .github
    source: ./templates/.github/

  # 4. GitHub上のファイル — 他リポジトリから直接取得
  #    @ref でブランチやタグも指定できる
  - path: LICENSE
    source: github://my-org/templates/LICENSE@main
```

ローカルディレクトリを指定した場合、中のファイルが再帰的に走査されて個別のFileEntryに展開されます。例えば`source: ./templates/.github/`と書くと、`templates/.github/workflows/ci.yaml`が`.github/workflows/ci.yaml`として配布されます。`github://`もディレクトリ指定（末尾に`/`）で同様に展開できます。

### 配布方法

`via`フィールドで、ファイルをどのようにリポジトリに反映するかを選択できます。

| via | 動作 |
|-----|------|
| `push`（デフォルト） | デフォルトブランチに直接コミット |
| `pull_request` | 新しいブランチを作成し、PRを開く |

`pull_request`を選ぶとレビューやCIを挟んでからマージできます。`commit_message`、`branch`、`pr_title`、`pr_body`でそれぞれカスタマイズ可能です。

```yaml
spec:
  via: pull_request
  commit_message: "chore: sync managed files"
  branch: update-codeowners
  pr_title: "chore: update CODEOWNERS"
  pr_body: "Automated update by gh-infra"
```

![docs/tapes/demo-file-pr.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-file-pr.gif)

### リコンサイル戦略

ファイルごとに`reconcile`フィールドで同期方法を制御できます。

| reconcile | 動作 | 用途 |
|---|---|---|
| `patch`（デフォルト） | 追加・更新のみ | 通常のファイル配布 |
| `mirror` | 追加・更新に加え、管理外ファイルを削除 | ディレクトリの完全同期（`.github/workflows/`など） |
| `create_only` | ファイルが存在しない場合のみ作成 | 初回だけ配布しその後はリポジトリ側で自由に編集させたいファイル |


```yaml
files:
  # patch（デフォルト）: CIワークフローを配布・更新する。
  # リポジトリに他のワークフローがあっても触らない。
  - path: .github/workflows/ci.yml
    source: ./templates/ci.yml
    reconcile: patch

  # mirror: .github/workflows/ をテンプレートと完全同期する。
  # テンプレートにないワークフローはリポジトリから削除される。
  - path: .github/workflows
    source: ./templates/.github/workflows/
    reconcile: mirror

  # create_only: READMEは初回だけ配布し、以降はリポジトリ側で自由に編集できる。
  # 既にREADMEが存在する場合は何もしない。
  - path: README.md
    source: ./templates/README.md
    reconcile: create_only
```

`mirror`はソースディレクトリを指定した場合に特に有用で、YAMLに宣言されていないファイルがリポジトリ側にあれば削除されます。`create_only`はREADMEのテンプレートなど、初期配布後はリポジトリごとに内容が変わることが想定されるファイルに向いています。

### テンプレート構文

`<% %>`デリミタでGo templateを使えます。GitHub Actionsの`${{ }}`やHelm/GoReleaserの`{{ }}`と衝突しないデリミタを採用しています。

使えるビルトイン変数は以下の通りです。

| 変数 | 展開例（`babarot/my-project`の場合） |
|------|------|
| `<% .Repo.Name %>` | `my-project` |
| `<% .Repo.Owner %>` | `babarot` |
| `<% .Repo.FullName %>` | `babarot/my-project` |
| `<% .Vars.KEY %>` | `vars`フィールドで定義した値 |

例えば以下のテンプレートは、

```
module github.com/<% .Repo.FullName %>
go <% .Vars.GO_VERSION %>
```

`babarot/my-project`に対して適用されると、次のように展開されます。

```
module github.com/babarot/my-project
go 1.24.0
```

Go templateの構文がそのまま使えるため、`<% if %>`や`<% range %>`なども利用可能です。

### テンプレート変数

`vars`フィールドでファイルごとにカスタム変数を定義し、テンプレート内で`<% .Vars.KEY %>`として参照できます。vars自体の値にも`<% .Repo.* %>`を使えるため、リポジトリ名を含む動的な値を定義することも可能です。

```yaml
files:
  - path: go.mod
    source: ./templates/go.mod
    vars:
      GO_VERSION: "1.24.0"
      MODULE_PATH: "github.com/<% .Repo.FullName %>"
```

テンプレート側では以下のように参照します。

```
module <% .Vars.MODULE_PATH %>
go <% .Vars.GO_VERSION %>
```

### パッチ適用

テンプレートファイルで一定程度共通化できたとしても、「このリポジトリのこのファイルだけテンプレートとちょっと違う」というケースは出てきます。そのリポジトリのためだけに別のファイルを作ったり、`overrides`でインラインに全文を書いたりすることはできますが、どちらもテンプレートとは別のファイルになるので、テンプレート側を更新してもその変更が反映されません。テンプレートのアップデートの恩恵をあずかれなくなります。

`patches`はこの問題を解決します。ベースはあくまでテンプレートを使いつつ、差分だけをunified diffで宣言します。テンプレートが更新されればパッチが適用される前のベースが変わるので、テンプレートの変更もパッチによる変更も両方反映されます。考え方としてはkustomizeのoverlayに近く、baseとoverlayを分離することで共通部分の変更と個別の差分を独立して管理できます。

パッチはファイルパスでもインラインでも指定でき、複数のパッチを順番に適用することもできます。

```yaml
files:
  # パッチファイルを指定
  - path: .github/workflows/ci.yaml
    source: ./templates/ci-base.yaml
    patches:
      - ./patches/add-deploy-step.diff

  # インラインでパッチを書く
  - path: go.mod
    source: ./templates/go.mod
    patches:
      - |
        --- a/go.mod
        +++ b/go.mod
        @@ -2 +2 @@
        -go 1.24.0
        +go 1.24.2
```

`patches`はunified diff形式なので手動で書くこともできますが、正直なところ手書きはつらいです。`import --into`を使えばGitHub上の実際のファイルとローカルテンプレートの差分を自動でパッチとして取り込めます。diffビューアで`Tab`キーを押すとwrite/patch/skipを切り替えられ、`patch`を選ぶと差分がマニフェストの`patches:`フィールドにunified diff形式で自動追記されます。共有テンプレート本体を書き換えずに、特定リポジトリの差分だけをパッチとして保存できるので便利です。

## RepositorySet / FileSet: 複数リポジトリへのスケール

ここまでの`Repository`と`File`は1リポジトリを管理する単位でした。リポジトリが増えてくると、同じ設定を複数のYAMLファイルに繰り返し書くことになります。RepositorySetとFileSetを使えば、共通設定を1箇所にまとめて複数リポジトリに適用できます。

| | 1リポジトリ | 複数リポジトリ |
|---|---|---|
| リポジトリ設定 | Repository | RepositorySet |
| ファイル管理 | File | FileSet |

Repository/Fileと同様に、`---`区切りで1つのYAMLファイルにまとめることもできます。RepositorySetとFileSetを1ファイルにまとめれば、複数リポジトリの設定とファイル管理を1箇所で完結できます。

### RepositorySet

`defaults`ブロックに共通設定を書き、各リポジトリでは固有の設定だけを宣言します。

```yaml
apiVersion: gh-infra/v1
kind: RepositorySet
metadata:
  owner: babarot

defaults:
  spec:
    visibility: public
    merge_strategy:
      allow_squash_merge: true
      auto_delete_head_branches: true
    branch_protection:
      - pattern: main
        required_reviews: 1

repositories:
  - name: my-cli
    spec:
      description: "A CLI tool"
      topics: [go, cli]
  - name: my-shell-plugin
    spec:
      description: "A shell plugin"
      topics: [zsh, shell]
```

20リポジトリで`required_reviews`を1→2に変えたいとき、RepositorySetなら`defaults`の1行を変えるだけで全リポジトリに反映されます。個別の`Repository`ファイルでやると20ファイルを編集する必要があります。前述の`actions`や`release_immutability`も`defaults`に書けば全リポジトリに適用できます。

![docs/tapes/demo-repositoryset-plan.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-repositoryset-plan.gif)

個別のリポジトリで`defaults`と異なる設定が必要な場合は、そのリポジトリの`spec`に書けば上書きできます。スカラー値（文字列、真偽値、数値）はそのまま置き換わり、マップ（features、merge_strategy）はキー単位でマージされます。リスト（topics、branch_protection）はマージではなく全体が置き換わる点には注意が必要です。

### FileSet

`File`の複数リポジトリ版です。同じファイルセットを複数のリポジトリに配布できます。テンプレートリポジトリと違い、既存リポジトリに後から適用できます。

```yaml
apiVersion: gh-infra/v1
kind: FileSet
metadata:
  owner: babarot

spec:
  repositories:
    - my-cli
    - my-shell-plugin
    - name: gh-infra
      overrides:
        - path: .github/CODEOWNERS
          content: |
            * @babarot @co-maintainer

  files:
    - path: .github/CODEOWNERS
      content: |
        * @babarot
    - path: LICENSE
      source: ./templates/LICENSE

  via: push
```

`File`で使えるテンプレート、パッチ、リコンサイル戦略などすべての機能がそのまま使えます。加えて、per-repoオーバーライドで特定のリポジトリだけファイルの内容を変えることもできます。`repositories`でリポジトリを文字列ではなく構造体で指定し、`overrides`にファイルパスと内容を書くと、そのリポジトリだけ共通のファイル定義を上書きできます。

```yaml
spec:
  repositories:
    - my-app              # 共通のファイル定義をそのまま使う
    - name: my-lib        # このリポジトリだけCODEOWNERSを上書き
      overrides:
        - path: .github/CODEOWNERS
          content: |
            * @babarot @co-maintainer
```

上の例では`my-app`には共通の`files:`で定義したCODEOWNERSがそのまま配布されますが、`my-lib`だけは`overrides`で指定した内容に置き換わります。`overrides`には`content`だけでなく`source`も指定できるので、ローカルファイルや`github://`ソースも使えます。

### どちらを使うか

正直好みの問題です。RepositorySet/FileSetはRepository/Fileのスーパーセットなので、機能的にはどちらでも同じことができます。共通処理をfor文でまとめるか、数が少ないならベタ書きの方が読みやすいか、くらいの感覚です。使い分けの目安としては以下の通りです。

|           | RepositorySet / FileSet | 個別のRepository / Fileファイル |
| --------- | ----------------------- | ------------------------ |
| 共通設定      | `defaults`に1回書くだけ       | 各ファイルに繰り返し書く             |
| リポジトリ追加   | 3〜5行追加                  | 新規ファイル作成（全specを記述）       |
| 共通設定の変更   | 1箇所の編集                  | 全ファイルを編集                 |
| git blame | 変更が1ファイルに集中             | リポジトリごとに独立               |
| チーム所有権    | 1ファイルを共有                | チームごとにファイルを分離可能          |

共通設定が多い場合（merge strategy、branch protection、actionsなどを全リポジトリで揃えたい場合）はRepositorySet/FileSetが向いています。各リポジトリの設定がほぼ固有で`defaults`がほぼ空になるなら、個別のRepository/Fileファイルの方がシンプルです。

gh-infraは数百リポジトリを抱えるような大規模Orgでの利用は想定していませんが、個人Orgやサイドプロジェクトの小規模なOrgであれば十分に使えます。メンバーごとにリポジトリのオーナーシップが分かれている場合は、ファイルを分けておくと互いの管理範囲が明確になります。

## importコマンド

`import`は既存リポジトリの設定をYAMLにエクスポートするコマンドです。新しくgh-infraで管理を始めるときに使います。複数リポジトリを一度に指定でき、並列にfetchして出力します。

```bash
gh infra import babarot/my-project > repos/my-project.yaml

# 複数リポジトリを一度に
gh infra import babarot/my-cli babarot/my-shell-plugin
```

### `--into`: GitHub上の状態をローカルマニフェストに書き戻す

`--into`オプションを使うと、GitHub上の現在の状態を既存のローカルマニフェストに同期できます。`plan`/`apply`とは逆方向の操作で、手動でGUIから変更してしまった設定をYAMLに取り込むときに使います。

```bash
gh infra import babarot/my-project --into=repos/my-project.yaml

# 複数リポジトリを一度に書き戻し
gh infra import babarot/my-cli babarot/my-shell-plugin --into=repos/
```

パスにはYAMLファイルまたはマニフェストを含むディレクトリを指定できます。複数の`owner/repo`を指定した場合、それぞれが`--into`パス内のマニフェストにマッチングされます。

![docs/tapes/demo-import-into.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-import-into.gif)

実行すると、GitHub APIから現在の状態を取得してローカルのYAMLとフィールド単位で比較し、差分をplanとして表示します。diffビューアで変更内容を確認・選択してから、承認した変更だけがローカルファイルに書き込まれます。

`--into`はYAMLのAST編集を行い、既存のコメントやフォーマットを保持したままフィールドの値だけを更新します。変更があったフィールドだけをピンポイントで書き換えるため、未変更のフィールドやコメントは一切影響を受けません。

#### write / patch / skip

![docs/tapes/demo-import-into-files.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-import-into-files.gif)

importのdiffビューアでは、ファイルごとに書き戻し方法を選択できます。

- **write**
	- ファイルの通常の書き込み先を更新する。inline contentならマニフェストの`content: |`ブロック、source指定ならローカルソースファイルを上書き
- **patch**
	- 差分をマニフェストの`patches:`としてunified diff形式で保存
- **skip**
	- この変更を今回のimportでは適用しない

デフォルトのアクションはファイルの形状によって決まります。

| ファイルの形状 | デフォルト |
|--------------|----------|
| inline content | `write` |
| ローカルソース（単独使用） | `write` |
| ローカルソース（複数リポジトリで共有） | `patch` |
| 既存の`patches:`エントリ | `patch` |
| `github://`ソース | スキップ（変更不可） |
| `reconcile: create_only` | `skip`（初回作成のみのファイルのため） |

共有テンプレートファイルで`patch`がデフォルトになるのは、1つのリポジトリのdriftで共有元を書き換えてしまうと他のリポジトリに意図しない影響が出るためです。`reconcile: create_only`のファイルはそもそも初回作成後は更新しない方針なのでデフォルトでskipになりますが、diffビューアで`Tab`を押せばwriteやpatchに切り替えることもできます。意図的に共有テンプレート自体を更新したい場合も、同様に`Tab`で`write`に切り替えられます。

なお、`github://`ソースやテンプレートの逆マッピングが不可能なケースは「hard skip」としてdiffビューアには表示されず、変更できません（planのサマリにのみ表示されます）。`reconcile: create_only`のデフォルトskipは「soft skip」であり、diffビューアで変更可能です。

#### テンプレートの逆マッピング

`<% .Repo.Name %>`や`<% .Repo.FullName %>`などのプレースホルダーを含むファイルの場合、importはGitHub上のファイル（レンダリング済み）を単純にコピーバックするわけにはいきません。そうするとプレースホルダーが破壊されてしまいます。

gh-infraは以下の手順で安全にテンプレートを保存します。

1. ローカルテンプレートを対象リポジトリ向けにレンダリング
2. レンダリング結果のどのセグメントがリテラルでどこがプレースホルダー由来かをトレース
3. レンダリング結果とGitHub上のファイルを比較
4. プレースホルダー部分はそのまま保持し、リテラル部分のdriftだけを反映してテンプレートソースを再構成

例えば`module github.com/<% .Repo.FullName %>`はテンプレートのまま維持しつつ、周辺の`go 1.24.0`→`go 1.26.1`のようなリテラル変更だけを安全に取り込めます。リモートファイルがプレースホルダー部分を書き換えていたり、元のテンプレート構造と合わなくなっている場合はhard skipされます。

## validateコマンド

YAMLの構文やスキーマの妥当性をチェックします。CIに組み込んでマニフェストの品質を保つのに使えます。

```bash
gh infra validate ./repos/
```

`--fail-on-unknown`フラグを付けると、未知のフィールドがある場合にエラーにできます。タイポの検出に有用です。検証成功時はリソースの種類と数を表示します。また、deprecated fieldが使われている場合は移行先を示す警告を表示します（例: `commit_strategy`は`via`に移行）。

## インタラクティブdiffビューア

![docs/tapes/demo-diffviewer.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-diffviewer.gif)

`apply`と`import --into`のどちらでもインタラクティブなdiffビューアが利用できます。確認プロンプトで`d`を押すとフルスクリーンのdiffビューアが起動します。

```
> Do you want to apply these changes? (yes / no / diff)
```

| キー | 操作 |
|------|------|
| `↑`/`↓` or `j`/`k` | ファイル選択 |
| `Tab` | アクション切り替え |
| `d`/`u` | diffペインのスクロール |
| `q`/`Esc` | 確認プロンプトに戻る |

`Tab`キーの挙動はコマンドによって異なります。

- `apply`では、変更ごとにapply/skipの2つを切り替えます。特定の変更だけ適用して残りは見送る、といった使い方ができます
- `import --into`では、ファイルごとにwrite/patch/skipの3つを循環します。writeはローカルファイルを直接更新し、patchは差分をマニフェストの`patches:`に追記し、skipはその変更を今回は取り込みません

どちらの場合も、スキップしたファイルはdimmed表示になり、確認プロンプトに戻るとスキップされた項目のサマリが表示されます。

## 内部設計

### ghコマンドをバックエンドにした理由

gh-infraはGo製ですが、`go-github`などのSDKは使わず、すべて`gh` CLIのサブプロセス呼び出しで実装しています。

```go
type Runner interface {
    Run(ctx context.Context, args ...string) ([]byte, error)
    RunWithStdin(ctx context.Context, body []byte, args ...string) ([]byte, error)
}
```

この`Runner`インターフェースを通じて`gh repo view --json`、`gh repo edit`、`gh api`などを呼び出します。認証は`gh auth`に完全委譲されるので、トークンを自前で持つ必要がありません。

テスト時は`MockRunner`に差し替えて、固定のJSONレスポンスを返すことで外部APIを叩かずにテストできます。

### 並列実行

リポジトリ間の操作は独立しているため、並列に実行できます。semaphoreで最大10並列に制限し、GitHub APIのrate limitに配慮しています。各リポジトリ内の操作は順序依存があるため逐次実行します（リポジトリ作成 → 設定適用 → branch protection → rulesets）。

plan/applyの実行中はbubbleteaベースのスピナーが各リポジトリの進捗をステップレベルで表示します。apply時はリポジトリ設定の適用→branch protection→rulesets→secretsのように、どのステップを実行中かがリアルタイムに表示されます。

![docs/tapes/demo-apply.tape](https://raw.githubusercontent.com/babarot/gh-infra/refs/heads/main/docs/public/demo-apply.gif)

### Atomic commit

GitHub APIでリポジトリにファイルをコミットする方法は2つあります。

| API | 特徴 |
|-----|------|
| Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`) | 1ファイル1コミット。シンプルだが、10ファイル配布すると10コミットになる |
| Git Data API (`POST /repos/{owner}/{repo}/git/blobs`, `trees`, `commits`, `refs`) | 低レベルなGitオブジェクトを直接操作。複数ファイルを1コミットにまとめられる |

gh-infraではGit Data APIを採用しています。何ファイルあっても1つのコミットにまとめて反映されるため、CIが中途半端な状態でトリガーされることがありません。内部的にはblob作成→tree作成→commit作成→ref更新という手順を踏みます。

ただし、Git Data APIは仕様上少なくとも1つのコミットが存在することを前提としています。そこで、gh-infraではゼロからリポジトリを作成して初期ファイルを配布する場合、内部で自動的にContents APIにフォールバックするようにしています。そのため、この場合は1ファイルずつコミットが積まれます。

### goccy/go-yamlとAST編集

gh-infraのYAML処理には標準的な`gopkg.in/yaml.v3`ではなく[goccy/go-yaml](https://github.com/goccy/go-yaml)を使っています。

GoのYAMLライブラリは長らく`gopkg.in/yaml.v3`がデファクトでしたが、2025年にアーカイブされました。[Songmuさんの記事](https://songmu.jp/riji/entry/2025-06-26-go-yaml.html)にも詳しい比較がありますが、Goらしいインターフェース設計と仕様準拠率の高さが特徴です。なお、YAML本家のOrganizationが`gopkg.in/yaml`のメンテナンスを引き継いだ`go.yaml.in/yaml`も登場しており（Kubernetesはこちらに移行済み）、GoのYAMLライブラリ選定は少し難しい時期にあるようです。

一方で、gh-infraでgoccy/go-yamlを選んだ最大の理由は、仕様準拠に加えてAST（抽象構文木）操作の高水準APIが充実していることです。

後継の`go.yaml.in/yaml/v4`にも`yaml.Node`型によるAST操作はありますが、単一の構造体に`Kind`フラグがあるだけで、`Content`スライスを手動で走査・操作する必要があります。パスベースの検索やノードの置換・マージといったAPIは提供されていません。goccy/go-yamlは豊富な型付きノード（`MappingNode`、`LiteralNode`等の個別の型）、`yaml.Path`によるYAMLPathクエリ（`$.spec.features.wiki`のようなパス指定）、`Path.ReplaceWithNode`/`MergeFromNode`による宣言的なノード操作、`ast.Walk`によるツリー走査を備えています。

gh-infraの`import --into`は既存のマニフェストを「変更があったフィールドだけ書き換える」機能なので、ユーザーが書いたコメントやインデントスタイルを壊すわけにはいきません。goccy/go-yamlならドキュメント全体を再シリアライズせずに、パスで指定したノードだけを部分的に編集できます。

```go
// yaml.Pathで特定のフィールドにアクセスして値を置換
path, _ := yaml.PathString("$.spec.features.wiki")
path.ReplaceWithNode(file, newValueNode)
```

ただし、goccy/go-yamlにもノードの削除APIは用意されていません。`ReplaceWithNode`と`MergeFromNode`はありますが`DeleteNode`に相当するものがありません。`import --into`ではGitHub上で削除されたフィールドをローカルマニフェストからも消す必要があるため、AST上の`MappingNode.Values`スライスを直接操作する`Delete`関数を自前で実装しています。

```go
// MappingNodeのValuesスライスからキーを直接削除
func deleteMappingKey(node *ast.MappingNode, key string) bool {
    for i, value := range node.Values {
        if mappingKeyName(value) != key {
            continue
        }
        node.Values = append(node.Values[:i], node.Values[i+1:]...)
        return true
    }
    return false
}
```

削除後に親のMappingNodeが空になった場合は、親も再帰的に削除します（空の`spec:`ブロックが残らないようにするため）。パスの存在チェック（`Exists`）も高水準APIにはないため、ASTを手動でたどる実装を入れています。

| 操作         | goccy/go-yaml提供        | 自前実装              |
| ---------- | ---------------------- | ----------------- |
| コメント付きパース  | `parser.ParseComments` | -                 |
| パスによるノード検索 | `yaml.PathString`      | -                 |
| ノード置換      | `Path.ReplaceWithNode` | -                 |
| ノードマージ     | `Path.MergeFromNode`   | -                 |
| ノード削除      | なし                     | `yamledit.Delete` |
| パス存在チェック   | なし                     | `yamledit.Exists` |

go-yamlの高水準APIでカバーできる部分と、AST直接操作で補う部分を組み合わせることで、コメントとフォーマットを保持したまま外部の状態変更をローカルファイルに書き戻すという繊細な処理を実現しています。

## 運用パターン

### 中央管理

専用の設定リポジトリから複数リポジトリを管理するパターンです。変更履歴が1箇所に集約されます。

```
github-config/
├── repos/
│   ├── my-cli.yaml
│   ├── my-shell-plugin.yaml
│   └── gh-infra.yaml
└── files/
    └── common.yaml
```

GitHub Actionsと組み合わせると、PRマージをトリガーに自動applyできます。

```yaml
on:
  push:
    branches: [main]
jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@SHA
      - run: gh infra apply ./repos/ --auto-approve
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### セルフマネージド

各リポジトリが自身の設定を管理するパターンです。Probot Settingsに近い運用ですが、plan機能があり、GitHub Appが不要です。

```yaml
# .github/workflows/infra.yaml
on:
  push:
    paths: [.github/infra.yaml]
jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@SHA
      - run: gh infra apply .github/infra.yaml --auto-approve
```

### CIでのdrift検知

`--ci`フラグを使うと、差分がある場合にexit code 1で終了します。スケジュール実行と組み合わせることで、設定のdriftを早期に検知できます。

```yaml
on:
  schedule:
    - cron: '0 9 * * 1'  # 毎週月曜9時
jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@SHA
      - run: gh infra plan ./repos/ --ci
```

driftが見つかったら`import --into`で現状をYAMLに取り込むか、`apply`でYAMLの状態に戻すかを選べます。`--repo`フラグで特定のリポジトリだけを対象にすることもできます。

```bash
gh infra plan ./repos/ --repo babarot/my-cli
```


## Agent Skills

コーディングエージェント（Claude Code、Codex、Cursorなど）にgh-infraの知識を持たせるためのAgent Skillsを提供しています。

```bash
npx skills add babarot/gh-infra
```

インストールすると、エージェントがgh-infraのコマンド体系、YAMLスキーマ、CI/CDパターンを理解した上でマニフェストの作成・管理を行えるようになります。

## まとめ

gh-infraを使うと、冒頭で書いた「全リポジトリでsquash mergeのcommit titleをPR_TITLEに統一したい」は、RepositorySetの`defaults`を1行変えて`plan`→`apply`するだけで終わります。CODEOWNERSを全リポジトリに配りたければFileSetに書くだけ。全リポジトリのGUIからポチポチする作業も、そのためのGitHub Actionsを整備する作業も要りません。

gh-infraが解決するのは「GitHubリポジトリの設定とファイルを、コードで継続的に管理する」という、地味だけど確実に面倒な設定作業です。Terraformほどの準備は要らず、`gh`コマンドさえあれば始められます。

設定を一元管理してコードで管理できるようにしたい方には便利なツールになっていると思うのでぜひ試してみてください！

```bash
gh extension install babarot/gh-infra
gh infra import <owner/repo> > repo.yaml
gh infra plan repo.yaml
```

https://github.com/babarot/gh-infra

ドキュメントは[こちら](https://babarot.github.io/gh-infra/)。
